'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { runMigrations: runSiteMigrations, splitStatements } = require('../site/migrations');
const { runMigrations: runBotMigrations } = require('../database/migrations');

const root = path.resolve(__dirname, '..');

function fakePool({ applied = [], invalidIndexes = [], lockFailures = 0 } = {}) {
  const queries = [];
  const done = new Set(applied);
  let failures = lockFailures;
  const query = async (sql, params = []) => {
    const text = String(sql).trim();
    queries.push(text);
    if (/pg_try_advisory_lock/.test(text)) {
      if (failures > 0) { failures -= 1; return { rows: [{ locked: false }], rowCount: 1 }; }
      return { rows: [{ locked: true }], rowCount: 1 };
    }
    if (/^SELECT 1 FROM schema_migrations/.test(text)) {
      return { rows: [], rowCount: done.has(params[0]) ? 1 : 0 };
    }
    if (/^INSERT INTO schema_migrations/.test(text)) done.add(params[0]);
    if (/^SELECT 1 FROM pg_index/.test(text)) {
      return { rows: [], rowCount: invalidIndexes.includes(params[0]) ? 1 : 0 };
    }
    return { rows: [], rowCount: 0 };
  };
  return {
    queries,
    done,
    query,
    connect: async () => ({ query, release() {} })
  };
}

function migrationDir(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wm-migrations-'));
  for (const [name, sql] of Object.entries(files)) fs.writeFileSync(path.join(dir, name), sql);
  return dir;
}

/** The real SQL on a real Postgres (PGlite): 096 applied by the runner, outside a transaction. */
async function testOnPostgres() {
  const { PGlite } = require('@electric-sql/pglite');
  const db = new PGlite();
  try {
    const siteMigrations = path.join(root, 'site', 'migrations');
    for (const file of ['067_area_explorer.sql', '070_area_explorer_markers.sql', '071_area_explorer_status_y.sql',
      '072_area_explorer_picked_up.sql', '073_area_explorer_events.sql']) {
      await db.exec(fs.readFileSync(path.join(siteMigrations, file), 'utf8'));
    }
    // An interrupted concurrent build of one of the indexes: present but INVALID.
    await db.exec('CREATE INDEX area_explorer_finds_token_time_idx ON area_explorer_finds (token_id)');
    await db.exec(`UPDATE pg_index SET indisvalid = FALSE
      WHERE indexrelid = 'area_explorer_finds_token_time_idx'::regclass`);

    const dir = migrationDir({
      '096_area_explorer_run_timeline.sql': fs.readFileSync(path.join(siteMigrations, '096_area_explorer_run_timeline.sql'), 'utf8')
    });
    const query = async (sql, params) => db.query(sql, params);
    await runSiteMigrations({ query, connect: async () => ({ query, release() {} }) }, dir, { lockRetryMs: 1 });
    fs.rmSync(dir, { recursive: true, force: true });

    const indexes = await db.query(`SELECT c.relname, i.indisvalid, pg_get_indexdef(i.indexrelid) AS def
      FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid
      WHERE c.relname IN ('area_explorer_events_token_time_idx', 'area_explorer_finds_token_time_idx')
      ORDER BY c.relname`);
    assert.equal(indexes.rows.length, 2);
    for (const row of indexes.rows) assert.equal(row.indisvalid, true, `${row.relname} is valid`);
    assert.match(indexes.rows[1].def, /\(token_id, found_at DESC, id DESC\) WHERE \(removed_at IS NULL\)/,
      'the invalid leftover was replaced by the real index');
    const applied = await db.query("SELECT 1 FROM schema_migrations WHERE name = '096_area_explorer_run_timeline.sql'");
    assert.equal(applied.rows.length, 1);
    const locks = await db.query("SELECT COUNT(*)::int AS n FROM pg_locks WHERE locktype = 'advisory'");
    assert.equal(locks.rows[0].n, 0, 'the migration lock is released');
  } finally {
    await db.close();
  }
}

(async () => {
  // Migration 096 builds its indexes concurrently, outside a transaction.
  const timelineSql = fs.readFileSync(path.join(root, 'site', 'migrations', '096_area_explorer_run_timeline.sql'), 'utf8');
  assert.match(timelineSql, /^-- wheatmagnate:no-transaction/, '096 must opt out of the migration transaction');
  const timelineStatements = splitStatements(timelineSql);
  assert.equal(timelineStatements.length, 2);
  for (const statement of timelineStatements) {
    assert.match(statement, /^CREATE INDEX CONCURRENTLY IF NOT EXISTS area_explorer_\w+_token_time_idx ON area_explorer_/,
      'the Live Run indexes must not block event and find writes while they build');
  }

  for (const runMigrations of [runSiteMigrations, runBotMigrations]) {
    const dir = migrationDir({
      '001_plain.sql': 'CREATE TABLE a (id INT);\nCREATE TABLE b (id INT);\n',
      '002_concurrent.sql': '-- wheatmagnate:no-transaction\r\n-- Comment line.\r\n'
        + 'CREATE INDEX CONCURRENTLY IF NOT EXISTS a_idx ON a (id);\r\n'
        + 'CREATE INDEX CONCURRENTLY IF NOT EXISTS b_idx ON b (id);\r\n'
    });
    const pool = fakePool({ invalidIndexes: ['b_idx'], lockFailures: 2 });
    await runMigrations(pool, dir, { lockRetryMs: 1 });

    const concurrentStart = pool.queries.findIndex(q => /pg_try_advisory_lock/.test(q));
    const plain = pool.queries.slice(0, concurrentStart);
    const concurrent = pool.queries.slice(concurrentStart);

    assert.ok(plain.includes('BEGIN') && plain.includes('COMMIT'), 'ordinary migrations still run in a transaction');
    assert.ok(plain.some(q => q.startsWith('CREATE TABLE a')), 'an ordinary migration runs as one script');

    assert.ok(!concurrent.includes('BEGIN'), 'a no-transaction migration must not open a transaction');
    assert.equal(concurrent.filter(q => /pg_try_advisory_lock/.test(q)).length, 3,
      'the migration lock is polled until it is free instead of blocking with a snapshot held');
    const created = concurrent.filter(q => q.startsWith('CREATE INDEX CONCURRENTLY'));
    assert.deepEqual(created, [
      'CREATE INDEX CONCURRENTLY IF NOT EXISTS a_idx ON a (id)',
      'CREATE INDEX CONCURRENTLY IF NOT EXISTS b_idx ON b (id)'
    ], 'each statement runs on its own, without the comments');
    const dropAt = concurrent.indexOf('DROP INDEX CONCURRENTLY IF EXISTS b_idx');
    assert.ok(dropAt >= 0 && dropAt < concurrent.indexOf(created[1]),
      'an INVALID index left by an interrupted build is dropped before it is rebuilt');
    assert.ok(!concurrent.includes('DROP INDEX CONCURRENTLY IF EXISTS a_idx'), 'a valid index is left alone');
    assert.ok(pool.done.has('002_concurrent.sql'), 'the migration is recorded once its statements succeed');
    assert.ok(/pg_advisory_unlock/.test(concurrent.at(-1)), 'the session lock is released afterwards');

    // Already applied: nothing runs again.
    const again = fakePool({ applied: ['001_plain.sql', '002_concurrent.sql'] });
    await runMigrations(again, dir, { lockRetryMs: 1 });
    assert.ok(!again.queries.some(q => /^CREATE (TABLE [ab]|INDEX)/.test(q)), 'applied migrations are skipped');

    // A failing statement leaves the migration unrecorded and still unlocks.
    const failing = fakePool();
    const query = failing.query;
    failing.connect = async () => ({
      query: async (sql, params) => {
        if (String(sql).startsWith('CREATE INDEX CONCURRENTLY IF NOT EXISTS b_idx')) throw new Error('boom');
        return query(sql, params);
      },
      release() {}
    });
    await assert.rejects(runMigrations(failing, dir, { lockRetryMs: 1 }), /boom/);
    assert.ok(!failing.done.has('002_concurrent.sql'), 'a failed no-transaction migration is retried on the next start');
    assert.ok(/pg_advisory_unlock/.test(failing.queries.at(-1)), 'the lock is released after a failure');

    fs.rmSync(dir, { recursive: true, force: true });
  }

  await testOnPostgres();
  console.log('migration runner tests passed');
})().catch(error => {
  console.error(error);
  process.exit(1);
});
