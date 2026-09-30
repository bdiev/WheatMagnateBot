'use strict';

const assert = require('node:assert/strict');
const { getLogRetentionConfig, pruneExpiredLogs } = require('../log-retention');

async function run() {
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
