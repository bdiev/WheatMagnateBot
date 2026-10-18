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

    // A lava cauldron the server won't accept clicks on (beyond reach from the
    // eyes) is never clicked; when it is the only lava left, the farm waits.
    farm.configure(0, 64, 0, { maxCauldronDist: 6 });
    clearCauldronMemory();
    inventoryItems = [emptyBucket];
    bot.heldItem = null;
    const unreachablePosition = new Vec3(4, 64, 3);
    bot.findBlocks = () => [unreachablePosition];
    await assert.rejects(
      fillBucket(bot),
      err => err.code === constants.CAULDRON_DRY_CODE && /out of reach/.test(err.message)
    );
    assert.strictEqual(clicks, 3, 'a cauldron beyond interaction reach must not be clicked');
    assert.strictEqual(constants.CAULDRON_INTERACTION_REACH, 4.5);

    // Mineflayer searches from the bot's floored position to block coordinates.
    // These candidates pass that search but their aim points are outside radius 4.
    farm.configure(0, 64, 0, { maxCauldronDist: 4 });
    const boundaryCases = [
      { feet: new Vec3(0, 64, 0), target: new Vec3(4, 64, 0) },
      { feet: new Vec3(0, 64, 0), target: new Vec3(0, 67, 2) },
      { feet: new Vec3(-0.9, 64.1, -0.9), target: new Vec3(3, 64, -1) }
    ];
    for (const { feet, target } of boundaryCases) {
      clearCauldronMemory();
      bot.entity.position = feet;
      bot.findBlocks = ({ maxDistance }) =>
        feet.floored().distanceTo(target) <= maxDistance ? [target] : [];
      bot.blockAt = candidate => ({ name: 'lava_cauldron', position: candidate });
      inventoryItems = [emptyBucket];
      bot.heldItem = null;
      const previousClicks = clicks;
      assert.ok(feet.distanceTo(target.offset(0.5, 0.8, 0.5)) > 4);
      await fillBucket(bot);
      assert.strictEqual(clicks, previousClicks + 1, 'search boundary cauldron must be clicked');
      assert.strictEqual(inventoryItems[0].name, 'lava_bucket');
    }

    // A generous search radius must still respect the independent server reach.
    farm.configure(0, 64, 0, { maxCauldronDist: 6 });
    clearCauldronMemory();
    bot.entity.position = new Vec3(0.2, 64, 0.2);
    bot.findBlocks = () => [new Vec3(5, 64, 0)];
    inventoryItems = [emptyBucket];
    bot.heldItem = null;
    const previousClicks = clicks;
    await assert.rejects(
      fillBucket(bot),
      err => err.code === constants.CAULDRON_DRY_CODE && /out of reach/.test(err.message)
    );
    assert.strictEqual(clicks, previousClicks, 'server reach must still prevent distant clicks');

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
