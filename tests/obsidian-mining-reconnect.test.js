'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Vec3 = require('vec3');
const { createObsidianFarm } = require('../features/obsidianFarm');

async function main() {
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
