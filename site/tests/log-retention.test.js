'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require('@electric-sql/pglite');
const { createSystemLogRepository } = require('../../database');
const { getLogRetentionConfig, pruneExpiredLogs } = require('../log-retention');

async function run() {
  const db = new PGlite();
  try {
    const migration = fs.readFileSync(path.join(__dirname, '../migrations/086_system_logs_autovacuum.sql'), 'utf8');
    // The migration runs before optional tables on a fresh installation.
    await db.exec(migration);
    const database = { query: (sql, values) => db.query(sql, values) };
    const logs = createSystemLogRepository(database);
    await logs.ensureSystemLogTable();
    await logs.recordSystemLog({ category: 'security', message: 'Keep this audit history.' });
    // Verify the upgrade independently of fresh-table initialization.
    await db.exec(`ALTER TABLE site_system_logs RESET (
      autovacuum_vacuum_scale_factor, autovacuum_vacuum_threshold,
      autovacuum_analyze_scale_factor, autovacuum_analyze_threshold,
      toast.autovacuum_vacuum_scale_factor, toast.autovacuum_vacuum_threshold
    )`);
    await db.exec(migration);
    assert.equal((await db.query('SELECT message FROM site_system_logs')).rows[0].message, 'Keep this audit history.');
    const options = await db.query(`SELECT relname,reloptions FROM pg_class
      WHERE oid='site_system_logs'::regclass
         OR oid=(SELECT reltoastrelid FROM pg_class WHERE oid='site_system_logs'::regclass)`);
    const tableOptions = options.rows.find(row => row.relname === 'site_system_logs').reloptions;
    assert.ok(tableOptions.includes('autovacuum_vacuum_scale_factor=0.02'));
    assert.ok(tableOptions.includes('autovacuum_vacuum_threshold=500'));
    assert.ok(tableOptions.includes('autovacuum_analyze_scale_factor=0.05'));
    assert.ok(options.rows.find(row => row.relname !== 'site_system_logs').reloptions.includes('autovacuum_vacuum_scale_factor=0.02'));
  } finally {
    await db.close();
  }

  assert.deepEqual(getLogRetentionConfig({}), {
    verboseDays:7,
    systemDays:90,
    batchSize:10_000,
    maxBatches:20,
    summaryHours:24,
    intervalMinutes:60
  });
  assert.deepEqual(getLogRetentionConfig({
    VERBOSE_LOG_RETENTION_DAYS:'0',
    SYSTEM_LOG_RETENTION_DAYS:'99999',
    LOG_RETENTION_BATCH_SIZE:'999999',
    LOG_RETENTION_INTERVAL_MINUTES:'1',
    LOG_RETENTION_MAX_BATCHES:'0',
    LOG_RETENTION_SUMMARY_HOURS:'9999'
  }), {
    verboseDays:1,
    systemDays:3650,
    batchSize:50_000,
    maxBatches:1,
    summaryHours:168,
    intervalMinutes:5
  });

  const calls = [];
  const pool = {
    query: async (sql, values) => {
      calls.push({ sql, values });
      return { rowCount:8 };
    }
  };
  const result = await pruneExpiredLogs(pool, {
    verboseDays:4,
    systemDays:45,
    batchSize:2500,
    intervalMinutes:30
  });
  assert.deepEqual(result, { systemLogs:8, batches:1, total:8 });
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].values, [['bot_console', 'obsidian_click'], 4, 45, 2500]);

  // A full batch means a backlog: keep draining until a short batch or the cap.
  const backlog = [100, 100, 40];
  const drained = await pruneExpiredLogs({ query: async () => ({ rowCount:backlog.shift() }) }, {
    verboseDays:7, systemDays:90, batchSize:100, maxBatches:5
  });
  assert.deepEqual(drained, { systemLogs:240, batches:3, total:240 });
  let cappedCalls = 0;
  const capped = await pruneExpiredLogs({ query: async () => { cappedCalls += 1; return { rowCount:100 }; } }, {
    verboseDays:7, systemDays:90, batchSize:100, maxBatches:2
  });
  assert.deepEqual(capped, { systemLogs:200, batches:2, total:200 });
  assert.equal(cappedCalls, 2, 'a single run must stay bounded by maxBatches');

  console.log('Log retention tests passed.');
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
