'use strict';

const fs = require('node:fs');
const path = require('node:path');

// A migration whose first line is this marker runs outside a transaction, one
// statement at a time, so it can use CREATE INDEX CONCURRENTLY and leave
// writes to big tables unblocked while the index builds.
const NO_TRANSACTION_MARKER = /^\s*--\s*wheatmagnate:no-transaction\b/;
const CONCURRENT_INDEX = /^\s*CREATE\s+(?:UNIQUE\s+)?INDEX\s+CONCURRENTLY\s+IF\s+NOT\s+EXISTS\s+("?[\w.]+"?)/i;
const LOCK_RETRY_MS = 1_000;

function splitStatements(sql) {
  return sql
    .split(/;\s*(?:\r?\n|$)/)
    .map(statement => statement.replace(/^\s*--.*$/gm, '').trim())
    .filter(Boolean);
}

async function runInTransaction(client, name, sql) {
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`wheatmagnate:${name}`]);
    const applied = await client.query('SELECT 1 FROM schema_migrations WHERE name = $1', [name]);
    if (applied.rowCount) {
      await client.query('COMMIT');
      return;
    }
    await client.query(sql);
    await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [name]);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  }
}

async function runWithoutTransaction(client, name, sql, { lockRetryMs = LOCK_RETRY_MS } = {}) {
  const lockKey = `wheatmagnate:${name}`;
  // Polled rather than waited on: a session blocked in pg_advisory_lock holds a
  // snapshot, and CREATE INDEX CONCURRENTLY would wait for it in turn.
  while (!(await client.query('SELECT pg_try_advisory_lock(hashtext($1)) AS locked', [lockKey])).rows[0]?.locked) {
    await new Promise(resolve => setTimeout(resolve, lockRetryMs));
  }
  try {
    const applied = await client.query('SELECT 1 FROM schema_migrations WHERE name = $1', [name]);
    if (applied.rowCount) return;
    for (const statement of splitStatements(sql)) {
      const index = statement.match(CONCURRENT_INDEX)?.[1];
      if (index) {
        // An interrupted concurrent build leaves an INVALID index behind that
        // IF NOT EXISTS would silently accept; drop it so it is built again.
        const invalid = await client.query(
          'SELECT 1 FROM pg_index WHERE indexrelid = to_regclass($1) AND NOT indisvalid',
          [index]
        );
        if (invalid.rowCount) await client.query(`DROP INDEX CONCURRENTLY IF EXISTS ${index}`);
      }
      await client.query(statement);
    }
    await client.query('INSERT INTO schema_migrations (name) VALUES ($1) ON CONFLICT (name) DO NOTHING', [name]);
  } finally {
    await client.query('SELECT pg_advisory_unlock(hashtext($1))', [lockKey]).catch(() => {});
  }
}

async function runMigrations(pool, directory = path.join(__dirname, 'migrations'), options = {}) {
  if (!pool) return false;
  await pool.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    name TEXT PRIMARY KEY,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  const files = fs.readdirSync(directory).filter(name => name.endsWith('.sql')).sort();
  for (const name of files) {
    const sql = fs.readFileSync(path.join(directory, name), 'utf8');
    const client = await pool.connect();
    try {
      if (NO_TRANSACTION_MARKER.test(sql)) await runWithoutTransaction(client, name, sql, options);
      else await runInTransaction(client, name, sql);
    } finally {
      client.release();
    }
  }
  return true;
}

module.exports = { runMigrations, splitStatements };
