'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const Vec3 = require('vec3');
const { createObsidianFarm } = require('../features/obsidianFarm');

// Mineflayer hopper window: slots 0-4 are the hopper, 5-40 the bot inventory.
const HOPPER_SLOTS = 5;
const INVENTORY_OFFSET = HOPPER_SLOTS - 9;

function createHopperBot({ obsidianStacks, hopperFull = false }) {
  const bot = new EventEmitter();
  const hopperPosition = new Vec3(1, 64, 0);
  const inventorySlots = Array(46).fill(null);
  const pickaxe = { name:'diamond_pickaxe', type:100, count:1, slot:9, maxDurability:100, durabilityUsed:0 };
  const lavaBucket = { name:'lava_bucket', type:103, count:1, slot:36 };
  inventorySlots[9] = pickaxe;
  inventorySlots[36] = lavaBucket;
  obsidianStacks.forEach((count, index) => {
    inventorySlots[10 + index] = { name:'obsidian', type:49, count, slot:10 + index };
  });
  const windowSlots = Array(41).fill(null);
  if (hopperFull) {
    for (let slot = 0; slot < HOPPER_SLOTS; slot++) windowSlots[slot] = { name:'obsidian', type:49, count:64, slot };
  }
  const syncWindowFromInventory = () => {
    for (let slot = 9; slot <= 44; slot++) windowSlots[slot + INVENTORY_OFFSET] = inventorySlots[slot];
  };
  const stats = { opens:0, shiftClicks:0, heldOnOpen:[] };

  const container = {
    slots:windowSlots,
    inventoryStart:HOPPER_SLOTS,
    inventoryEnd:41,
    hotbarStart:32,
    close() { bot.currentWindow = null; }
  };

  bot.username = 'HopperBot';
  bot.entity = { position:new Vec3(0, 64, 0), effects:{} };
  bot.heldItem = lavaBucket;
  bot.inventory = { items:() => inventorySlots.filter(Boolean), slots:inventorySlots, inventoryStart:9, hotbarStart:36 };
  bot.registry = { blocksByName:{ hopper:{ id:7 } }, itemsByName:{} };
  bot.pathfinder = { stop() {}, setGoal() {} };
  bot.clearControlStates = () => {};
  bot.equip = async item => { bot.heldItem = item; };
  bot.unequip = async () => { bot.heldItem = null; };
  bot.lookAt = async () => {};
  bot.findBlocks = options => options?.matching === 7 ? [hopperPosition] : [];
  bot.blockAt = position => position?.equals?.(hopperPosition) ? { name:'hopper', type:7, position:hopperPosition } : null;
  bot.blockAtCursor = () => ({ name:'hopper', type:7, position:hopperPosition, face:1 });
  bot.activateBlock = async () => {
    stats.opens += 1;
    stats.heldOnOpen.push(bot.heldItem?.name || null);
    syncWindowFromInventory();
    bot.currentWindow = container;
    bot.emit('windowOpen', container);
  };
  bot.clickWindow = async (slot, mouseButton, mode) => {
    assert.equal(mode, 1, 'obsidian is moved with a shift-click');
    stats.shiftClicks += 1;
    const item = windowSlots[slot];
    const target = windowSlots.slice(0, HOPPER_SLOTS).findIndex(entry => !entry);
    if (!item || target < 0) return;
    windowSlots[target] = { ...item, slot:target };
    windowSlots[slot] = null;
    inventorySlots[slot - INVENTORY_OFFSET] = null;
  };

  const obsidianCount = () => inventorySlots.filter(item => item?.name === 'obsidian').reduce((sum, item) => sum + item.count, 0);
  const hopperCount = () => windowSlots.slice(0, HOPPER_SLOTS).filter(Boolean).reduce((sum, item) => sum + item.count, 0);
  return { bot, stats, obsidianCount, hopperCount };
}

function createFarm(dataRoot, name, nowMs) {
  return createObsidianFarm({
    accountId:'00000000-0000-4000-8000-000000000005',
    username:'HopperBot',
    configFile:path.join(dataRoot, `${name}.json`),
    debugLogFile:path.join(dataRoot, `${name}.log`),
    nowMs
  });
}

async function main() {
  const dataRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'wheat-obsidian-hopper-'));
  let now = Date.now();
  const nowMs = () => now;
  try {
    const farm = createFarm(dataRoot, 'backlog', nowMs);
    const backlog = createHopperBot({ obsidianStacks:[64, 64, 64, 12] });
    await farm.__test.depositObsidianToHopper(backlog.bot);
    assert.equal(backlog.obsidianCount(), 140, 'a backlog is unloaded one stack per visit');
    assert.equal(backlog.hopperCount(), 64);
    assert.deepEqual(backlog.stats.heldOnOpen, ['diamond_pickaxe'], 'the hopper is never clicked with a lava bucket in hand');

    now += 5_000;
    await farm.__test.depositObsidianToHopper(backlog.bot);
    assert.equal(backlog.stats.opens, 1, 'the next stack waits for the deposit interval');

    now += 30_000;
    await farm.__test.depositObsidianToHopper(backlog.bot);
    assert.equal(backlog.obsidianCount(), 76, 'the next stack is unloaded after the interval');

    now += 30_000;
    await farm.__test.depositObsidianToHopper(backlog.bot);
    now += 30_000;
    await farm.__test.depositObsidianToHopper(backlog.bot);
    assert.equal(backlog.obsidianCount(), 12, 'less than a full stack stays in the inventory');
    assert.equal(backlog.stats.opens, 3, 'the hopper is not opened for a partial stack');

    const small = createHopperBot({ obsidianStacks:[63] });
    await createFarm(dataRoot, 'small', nowMs).__test.depositObsidianToHopper(small.bot);
    assert.equal(small.stats.opens, 0, 'nothing is deposited before a full stack accumulates');

    const full = createHopperBot({ obsidianStacks:[64, 64], hopperFull:true });
    await assert.doesNotReject(createFarm(dataRoot, 'full', nowMs).__test.depositObsidianToHopper(full.bot),
      'a full hopper never fails the farm cycle');
    assert.equal(full.obsidianCount(), 128, 'a full hopper leaves the obsidian in the inventory');
    assert.equal(full.bot.currentWindow, null, 'the hopper window is closed afterwards');

    console.log('Obsidian hopper deposit tests passed.');
  } finally {
    fs.rmSync(dataRoot, { recursive:true, force:true, maxRetries:5, retryDelay:50 });
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
