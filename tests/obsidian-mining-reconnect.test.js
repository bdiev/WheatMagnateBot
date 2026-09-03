'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Vec3 = require('vec3');
const { createObsidianFarm } = require('../features/obsidianFarm');
const {
  MAX_FARM_PING_MS,
  isFarmPingTooHigh,
  createFarmPingMonitor
} = require('../features/obsidianFarm/ping-protection');

async function main() {
  assert.equal(isFarmPingTooHigh(MAX_FARM_PING_MS), false, 'the farm may run at exactly 150 ms');
  assert.equal(isFarmPingTooHigh(MAX_FARM_PING_MS + 1), true, 'the farm must pause above 150 ms');
  const pingMonitor = createFarmPingMonitor({ maximumPing:150,highPingGraceMs:10_000,recoveryMs:5_000 });
  assert.equal(pingMonitor.observe(325, 1_000).pauseConfirmed, false, 'one high-ping sample starts the grace period');
  assert.equal(pingMonitor.observe(80, 3_000).pauseConfirmed, false, 'a transient spike must not pause the farm');
  assert.equal(pingMonitor.observe(325, 10_000).pauseConfirmed, false, 'a new spike starts a new grace period');
  assert.equal(pingMonitor.observe(325, 19_999).pauseConfirmed, false, 'high ping below the grace duration is tolerated');
  assert.equal(pingMonitor.observe(325, 20_000).pauseConfirmed, true, 'sustained high ping pauses the farm');
  assert.equal(pingMonitor.observe(100, 21_000).recoveryConfirmed, false, 'one normal sample must not immediately resume the farm');
  assert.equal(pingMonitor.observe(100, 26_000).recoveryConfirmed, true, 'stable normal ping resumes the farm');
  const primarySource = fs.readFileSync(path.resolve(__dirname, '..', 'bot.js'), 'utf8');
  const managedSource = fs.readFileSync(path.resolve(__dirname, '..', 'site', 'accounts', 'minecraft-bot-runtime.js'), 'utf8');
  assert.match(primarySource, /startObsidianFarmWatchdog[\s\S]*pingMonitor\.observe\(ping\)[\s\S]*pauseConfirmed[\s\S]*farm\.suspend\(\)[\s\S]*recoveryConfirmed[\s\S]*ensureObsidianFarmRunning/,
    'the primary farm must debounce high ping and recover through its watchdog');
  assert.match(managedSource, /farmPingMonitor\.observe\(ping\)[\s\S]*pauseConfirmed[\s\S]*pauseForHighPing[\s\S]*recoveryConfirmed[\s\S]*retryDesiredObsidian/,
    'managed farms must debounce high ping and retry after stable recovery');
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'obsidian-mining-reconnect-'));
  try {
    const farm = createObsidianFarm({
      accountId:'mining-reconnect-test',
      configFile:path.join(tempRoot, 'config.json'),
      debugLogFile:path.join(tempRoot, 'debug.log')
    });
    const {
      aimAtObsidianForMining,
      getObsidianDigHoldMs,
      constants
    } = farm.__test;

    assert.equal(
      getObsidianDigHoldMs(1),
      constants.OBSIDIAN_DIG_BASE_HOLD_MS,
      'mining after reconnect keeps the server-calibrated duration'
    );
    assert.equal(
      getObsidianDigHoldMs(3),
      constants.OBSIDIAN_DIG_BASE_HOLD_MS + (2 * constants.OBSIDIAN_DIG_RETRY_HOLD_BONUS_MS),
      'retry timing still receives its calibrated bonus'
    );

    const target = { name:'obsidian',position:new Vec3(10, 64, 20) };
    let lookForce = null;
    let lookedAt = null;
    const bot = {
      async lookAt(position, force) {
        lookedAt = position;
        lookForce = force;
      },
      blockAtCursor() {
        return { ...target,face:3 };
      }
    };
    const aimed = await aimAtObsidianForMining(bot, target);
    assert.equal(lookForce, true, 'mining explicitly turns to the target before its synchronization delay');
    assert.ok(lookedAt.equals(target.position.offset(0.5, 0.5, 0.5)));
    assert.equal(aimed.face, 3);

    console.log('Obsidian reconnect mining tests passed.');
  } finally {
    fs.rmSync(tempRoot, { recursive:true,force:true,maxRetries:5,retryDelay:50 });
  }
}

main().catch(error => { console.error(error);process.exitCode = 1; });
