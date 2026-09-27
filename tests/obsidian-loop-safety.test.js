'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Vec3 = require('vec3');
const { createObsidianFarm } = require('../features/obsidianFarm');

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const TARGET = new Vec3(0, 64, 0);
const ANCHOR = new Vec3(1, 64, 0);

function createFarm(tempDir) {
  const farm = createObsidianFarm({
    accountId: 'loop-safety',
    configFile: path.join(tempDir, 'farm.json'),
    debugLogFile: path.join(tempDir, 'farm-debug.log')
  });
  farm.configure(TARGET.x, TARGET.y, TARGET.z, { maxCauldronDist: 5 });
  return farm;
}

function createBot({ inventoryItems, blockAt }) {
  const bot = {
    entity: { position: new Vec3(2, 64, 0.5), effects: {} },
    pathfinder: { setGoal() {}, stop() {} },
    registry: { blocksByName: {}, itemsByName: {} },
    inventory: { items: () => inventoryItems, slots: [] },
    heldItem: null,
    blockAtCalls: [],
    blockAt(position) {
      bot.blockAtCalls.push(position.toString());
      return blockAt(position);
    },
    findBlocks: () => [],
    clearControlStates() {},
    setControlState() {},
    equip: async item => { bot.heldItem = item; },
    lookAt: async () => {},
    blockAtCursor: () => ({ position: ANCHOR, face: 4 }),
    activateItem() { bot.activateItemCalls++; },
    activateItemCalls: 0
  };
  return bot;
}

const pickaxe = { name: 'diamond_pickaxe', slot: 36, count: 1, maxDurability: 1561, durabilityUsed: 0 };
const bread = { name: 'bread', slot: 37, count: 16 };

async function testSuspendResumeDoesNotDuplicateLoop(tempDir) {
  const farm = createFarm(tempDir);
  // Target chunk "not loaded": every cycle fails right after the supply check,
  // which makes each cycle observable as one blockAt(target) call.
  const bot = createBot({
    inventoryItems: [pickaxe, bread, { name: 'bucket', slot: 38, count: 1 }],
    blockAt: () => null
  });

  let releaseLock;
  const held = farm.__test.withWorldInteractionLock(() => new Promise(resolve => { releaseLock = resolve; }));
  await sleep(0);

  farm.start(bot, () => {});           // cycle #1 queues behind the held lock
  const idle = farm.suspend();          // paused while cycle #1 is still in flight
  farm.resume(bot, () => {});           // cycle #2 queues behind cycle #1
  releaseLock();
  await held;
  await sleep(300);

  const targetChecks = bot.blockAtCalls.filter(key => key === TARGET.toString()).length;
  assert.strictEqual(targetChecks, 1, 'the stale cycle must abort before touching the world');
  assert.strictEqual(await idle, true, 'suspend() resolves once the in-flight cycle has drained');
  assert.strictEqual(farm.getStatus().enabled, true);

  await farm.stop();
  const handle = farm.__test.getIsolationState().loopHandle;
  assert.strictEqual(handle, null, 'stop clears the only loop timer');
}

async function testUnconfirmedPlacementKeepsFarming(tempDir) {
  const farm = createFarm(tempDir);
  const fatalErrors = [];
  farm.configureRuntime({ onFatalStop: async err => { fatalErrors.push(err); } });
  const notifications = [];
  let targetBlock = { name: 'air', position: TARGET, boundingBox: 'empty' };

  const bot = createBot({
    inventoryItems: [pickaxe, bread, { name: 'lava_bucket', slot: 38, count: 1 }],
    blockAt: position => {
      if (position.equals(TARGET)) return targetBlock;
      if (position.equals(ANCHOR)) {
        return { name: 'smooth_stone', position: ANCHOR, boundingBox: 'block', type: 1 };
      }
      return { name: 'stone', position, boundingBox: 'block', type: 2 };
    }
  });

  farm.start(bot, event => notifications.push(event));
  // The server does not show lava in time: placement confirmation waits 5 s.
  const deadline = Date.now() + 8_000;
  while (Date.now() < deadline && notifications.length === 0) await sleep(100);

  assert.strictEqual(bot.activateItemCalls, 1, 'the bucket is used once per verified attempt');
  assert.strictEqual(fatalErrors.length, 0, 'an unconfirmed placement never stops the farm');
  assert.strictEqual(farm.getStatus().enabled, true, 'the farm keeps running and retries');
  assert.match(notifications[0].message, /did not confirm lava[\s\S]*retrying/);

  // The lava shows up late: the retry must wait for obsidian, not pour again.
  targetBlock = { name: 'lava', position: TARGET, boundingBox: 'empty', metadata: 0 };
  await sleep(1_500);
  assert.strictEqual(bot.activateItemCalls, 1, 'late lava is waited on instead of pouring a second bucket');
  assert.strictEqual(farm.getStatus().phase, 'waiting');
  assert.strictEqual(fatalErrors.length, 0);

  await farm.stop();
}

async function testWornPickaxeDepositUsesExactSlot(tempDir) {
  const farm = createFarm(tempDir);
  const worn = { name: 'diamond_pickaxe', type: 7, slot: 36, maxDurability: 1561, durabilityUsed: 1550 };
  const healthy = { name: 'diamond_pickaxe', type: 7, slot: 37, maxDurability: 1561, durabilityUsed: 0 };
  const container = {
    inventoryStart: 27,
    inventoryEnd: 63,
    slots: [],
    deposit: async () => { throw new Error('generic deposit must not be used'); }
  };
  // Barrel window: inventory slot 36 (hotbar 0) maps to window slot 54.
  container.slots[54] = worn;
  container.slots[55] = healthy;
  const clicks = [];
  const bot = {
    registry: { itemsByName: {} },
    inventory: { inventoryStart: 9 },
    clickWindow: async (slot, button, mode) => {
      clicks.push({ slot, button, mode });
      container.slots[0] = container.slots[slot];
      container.slots[slot] = null;
    }
  };

  await farm.__test.depositPickaxeFromExactSlot(bot, container, worn);
  assert.deepStrictEqual(clicks, [{ slot: 54, button: 0, mode: 1 }]);
  assert.strictEqual(container.slots[0], worn, 'the worn pickaxe moved into the barrel');
  assert.strictEqual(container.slots[55], healthy, 'the healthy pickaxe stays in the inventory');
}

async function run() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wheatmagnate-loop-safety-'));
  try {
    await testSuspendResumeDoesNotDuplicateLoop(tempDir);
    await testUnconfirmedPlacementKeepsFarming(tempDir);
    await testWornPickaxeDepositUsesExactSlot(tempDir);
    console.log('Obsidian loop safety tests passed.');
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

run().catch(error => {
  console.error(error);
  process.exit(1);
});
