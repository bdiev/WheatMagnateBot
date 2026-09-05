'use strict';

const assert = require('node:assert/strict');
const { getLogRetentionConfig, pruneExpiredLogs } = require('../log-retention');

async function run() {
  assert.deepEqual(getLogRetentionConfig({}), {
    verboseDays:7,
    systemDays:90,
    batchSize:10_000,
    intervalMinutes:60
  });
  assert.deepEqual(getLogRetentionConfig({
    VERBOSE_LOG_RETENTION_DAYS:'0',
    SYSTEM_LOG_RETENTION_DAYS:'99999',
    LOG_RETENTION_BATCH_SIZE:'999999',
    LOG_RETENTION_INTERVAL_MINUTES:'1'
  }), {
    verboseDays:1,
    systemDays:3650,
    batchSize:50_000,
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
  assert.deepEqual(result, { systemLogs:8, total:8 });
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].values, [['bot_console', 'obsidian_click'], 4, 45, 2500]);

  console.log('Log retention tests passed.');
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
