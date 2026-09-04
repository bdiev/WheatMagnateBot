'use strict';

const assert = require('node:assert/strict');
const { getLogRetentionConfig, pruneExpiredLogs } = require('../log-retention');

async function run() {
  assert.deepEqual(getLogRetentionConfig({}), {
    verboseDays:7,
    systemDays:90,
    archiveDays:365,
    batchSize:10_000,
    intervalMinutes:60
  });
  assert.deepEqual(getLogRetentionConfig({
    VERBOSE_LOG_RETENTION_DAYS:'0',
    SYSTEM_LOG_RETENTION_DAYS:'99999',
    OPERATIONAL_EVENT_ARCHIVE_RETENTION_DAYS:'14',
    LOG_RETENTION_BATCH_SIZE:'999999',
    LOG_RETENTION_INTERVAL_MINUTES:'1'
  }), {
    verboseDays:1,
    systemDays:3650,
    archiveDays:30,
    batchSize:50_000,
    intervalMinutes:5
  });

  const calls = [];
  const pool = {
    query: async (sql, values) => {
      calls.push({ sql, values });
      return { rowCount:[12, 8, 3][calls.length - 1] };
    }
  };
  const result = await pruneExpiredLogs(pool, {
    verboseDays:4,
    systemDays:45,
    archiveDays:180,
    batchSize:2500,
    intervalMinutes:30
  });
  assert.deepEqual(result, { operationalEvents:12, systemLogs:8, archivedEvents:3, total:23 });
  assert.equal(calls.length, 3);
  assert.match(calls[0].sql, /NOT EXISTS[\s\S]*incident_events/);
  assert.deepEqual(calls[0].values, [['bot_console', 'obsidian_click'], 4, 2500]);
  assert.deepEqual(calls[1].values, [['bot_console', 'obsidian_click'], 4, 45, 2500]);
  assert.deepEqual(calls[2].values, [['bot_console', 'obsidian_click'], 4, 180, 2500]);

  console.log('Log retention tests passed.');
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
