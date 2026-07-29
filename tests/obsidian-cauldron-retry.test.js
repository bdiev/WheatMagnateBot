'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Vec3 = require('vec3');

async function run() {
  const originalCwd = process.cwd();
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wheatmagnate-cauldron-'));

  try {
    process.chdir(tempDir);
    const farm = require('../features/obsidianFarm');
    const {
      fillBucket,
      findLavaCauldrons,
      getCauldronFailure,
      clearCauldronMemory,
      constants
    } = farm.__test;

    farm.setDebugLoggingEnabled(false);
    farm.configure(0, 64, 0, { maxCauldronDist: 5 });
    clearCauldronMemory();

    const position = new Vec3(1, 64, 0);
    const fartherPosition = new Vec3(4, 64, 0);
    const cauldron = { name: 'lava_cauldron', position };
    const emptyBucket = { name: 'bucket', slot: 36, count: 1 };
    const lavaBucket = { name: 'lava_bucket', slot: 36, count: 1 };
    let inventoryItems = [emptyBucket];
    let clicks = 0;
    let nextClickSucceeds = false;

    const bot = {
      entity: { position: new Vec3(0, 64, 0) },
      registry: {
        blocksByName: {
          lava_cauldron: { id: 1 }
        }
      },
      inventory: {
        items: () => inventoryItems
      },
      heldItem: null,
      findBlocks: () => [position],
      blockAt: () => cauldron,
      clearControlStates: () => {},
      equip: async item => {
        bot.heldItem = item;
      },
      lookAt: async () => {},
      activateBlock: async () => {
        clicks++;
        if (nextClickSucceeds) {
          inventoryItems = [lavaBucket];
          bot.heldItem = lavaBucket;
        }
      }
    };

    bot.findBlocks = () => [position, fartherPosition];
    assert.deepStrictEqual(
      findLavaCauldrons(bot, 5).map(candidate => candidate.toString()),
      [position.toString(), fartherPosition.toString()],
      'nearest cauldron should be attempted before farther cauldrons'
    );
    bot.findBlocks = () => [position];

    await assert.rejects(
      fillBucket(bot),
      err => err.code === constants.CAULDRON_RETRY_CODE
    );
    assert.strictEqual(clicks, 1, 'a failed cauldron should be clicked once per pass');
    assert.ok(getCauldronFailure(position), 'failed cauldron should enter a short cooldown');

    await assert.rejects(
      fillBucket(bot),
      err => err.code === constants.CAULDRON_RETRY_CODE
    );
    assert.strictEqual(clicks, 1, 'cooldown should prevent immediate click spam');
    assert.strictEqual(constants.CAULDRON_RETRY_DELAY_MS, 100);
    assert.ok(
      constants.CAULDRON_FAILURE_COOLDOWN_MS <= 500,
      'failed cauldrons must become eligible again quickly'
    );

    await new Promise(resolve =>
      setTimeout(resolve, constants.CAULDRON_FAILURE_COOLDOWN_MS + 25)
    );
    nextClickSucceeds = true;
    await fillBucket(bot);
    assert.strictEqual(clicks, 2, 'cauldron should be retried after the short cooldown');
    assert.strictEqual(inventoryItems[0].name, 'lava_bucket');

    inventoryItems = [emptyBucket];
    bot.heldItem = null;
    bot.findBlocks = () => [fartherPosition];
    clearCauldronMemory();
    await fillBucket(bot);
    assert.strictEqual(
      clicks,
      3,
      'a cauldron inside the configured 5-block radius must remain eligible'
    );

    clearCauldronMemory();
    farm.resetConfig();
  } finally {
    process.chdir(originalCwd);
    fs.rmSync(tempDir, { recursive: true, force: true });
  }

  console.log('obsidian cauldron retry tests passed');
}

run().catch(err => {
  console.error(err);
  process.exitCode = 1;
});
