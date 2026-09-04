'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createObsidianFarm } = require('../features/obsidianFarm');

async function waitFor(predicate, timeoutMs = 2_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return true;
    await new Promise(resolve => setTimeout(resolve, 25));
  }
  return predicate();
}

async function main() {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'obsidian-debug-rotation-'));
  try {
    const baseLog = path.join(tempRoot, 'obsidian-farm-debug.log');
    const disabledFarm = createObsidianFarm({
      accountId:'debug-disabled-test',
      username:'QuietBot',
      configFile:path.join(tempRoot, 'disabled-config.json'),
      debugLogFile:path.join(tempRoot, 'disabled.log')
    });
    assert.equal(disabledFarm.getDebugLoggingEnabled(), false, 'packet-level tracing is opt-in');
    assert.equal(disabledFarm.__test.writeFarmDebug('cycle_retry'), null);

    const expiredDailyLog = path.join(tempRoot, 'obsidian-farm-debug-2026-08-09.log');
    const retainedDailyLog = path.join(tempRoot, 'obsidian-farm-debug-2026-08-10.log');
    fs.writeFileSync(expiredDailyLog, 'expired\n');
    fs.writeFileSync(retainedDailyLog, 'retained\n');
    fs.writeFileSync(baseLog, 'legacy\n');
    const oldTime = new Date('2026-08-01T00:00:00.000Z');
    fs.utimesSync(baseLog, oldTime, oldTime);

    const now = new Date('2026-08-16T12:00:00.000Z');
    const systemLogs = [];
    const farm = createObsidianFarm({
      accountId:'debug-rotation-test',
      username:'DebugBot',
      configFile:path.join(tempRoot, 'config.json'),
      debugLogFile:baseLog,
      debugLoggingEnabled:true,
      systemLogger:entry => { systemLogs.push(entry); },
      now:() => now
    });
    const correlationId = '38b58368-3204-42bc-8136-a11e07a71433';
    const firstRecord = farm.__test.writeFarmDebug('cycle_retry', { correlationId });
    const secondRecord = farm.__test.writeFarmDebug('cycle_retry', { correlationId });

    assert.match(firstRecord.logId, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    assert.notEqual(firstRecord.logId, secondRecord.logId, 'every debug line must receive its own unique log ID');

    const currentLog = farm.getDebugLogFile();
    assert.equal(currentLog, path.join(tempRoot, 'obsidian-farm-debug-2026-08-16.log'));
    assert.equal(await waitFor(() => fs.existsSync(currentLog)), true, 'current daily log is created');
    assert.equal(
      await waitFor(() => !fs.existsSync(expiredDailyLog) && !fs.existsSync(baseLog)),
      true,
      'expired daily and legacy logs are removed'
    );
    assert.equal(fs.existsSync(retainedDailyLog), true, 'the seven-day retention boundary is preserved');

    assert.equal(
      await waitFor(() => fs.readFileSync(currentLog, 'utf8').trim().split(/\r?\n/).length >= 2),
      true,
      'both debug records are appended'
    );
    const records = fs.readFileSync(currentLog, 'utf8').trim().split(/\r?\n/).map(JSON.parse);
    assert.ok(records.every(record => record.time === now.toISOString()));
    assert.ok(records.every(record => record.correlationId === correlationId), 'correlation ID is searchable in JSONL');
    assert.deepEqual(
      new Set(records.map(record => record.logId)),
      new Set([firstRecord.logId, secondRecord.logId]),
      'returned log IDs must match the persisted JSONL records'
    );
    assert.equal(farm.__test.constants.FARM_DEBUG_RETENTION_DAYS, 7);

    farm.__test.writeFarmDebug('farm_click_trace', { action:'lava_placement', stage:'sent' });
    farm.__test.writeFarmDebug('farm_click_trace', { action:'lava_placement', stage:'unconfirmed' });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(systemLogs.length, 1, 'only failed packet traces are persisted to the system log');
    assert.equal(systemLogs[0].level, 'warn');
    assert.equal(systemLogs[0].details.stage, 'unconfirmed');

    console.log('Obsidian debug log rotation tests passed.');
  } finally {
    fs.rmSync(tempRoot, { recursive:true, force:true, maxRetries:5, retryDelay:50 });
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
