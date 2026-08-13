'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const Vec3 = require('vec3');
const { createObsidianFarm } = require('../features/obsidianFarm');

function createSupplyBot() {
  const bot = new EventEmitter();
  const barrelPosition = new Vec3(1, 64, 0);
  const wornPickaxe = {
    name:'diamond_pickaxe', type:100, count:1, slot:9,
    maxDurability:100, durabilityUsed:95
  };
  const replacementPickaxe = {
    name:'diamond_pickaxe', type:100, count:1, slot:0,
    maxDurability:100, durabilityUsed:0
  };
  const bread = { name:'bread', type:101, metadata:0, count:8, slot:1 };
  const bucket = { name:'bucket', type:102, metadata:0, count:4, slot:2 };
  const inventorySlots = Array(46).fill(null);
  inventorySlots[9] = wornPickaxe;
  const windowSlots = Array(63).fill(null);
  windowSlots[0] = replacementPickaxe;
  windowSlots[1] = bread;
  windowSlots[2] = bucket;
  windowSlots[27] = wornPickaxe;

  const inventoryItems = () => inventorySlots.filter(Boolean);
  const synchronizeInventorySlot = windowSlot => {
    if (windowSlot < 27 || windowSlot >= 63) return;
    const botSlot = windowSlot - 18;
    inventorySlots[botSlot] = windowSlots[windowSlot] || null;
    if (inventorySlots[botSlot]) inventorySlots[botSlot].slot = botSlot;
  };
  const firstEmptyInventorySlot = () => {
    for (let slot = 9; slot <= 44; slot++) if (!inventorySlots[slot]) return slot;
    return null;
  };

  const container = {
    slots:windowSlots,
    inventoryStart:27,
    inventoryEnd:54,
    hotbarStart:54,
    selectedItem:null,
    containerItems:() => windowSlots.slice(0, 27).filter(Boolean),
    async withdraw(type, metadata, count) {
      const sourceSlot = windowSlots.findIndex((item, slot) =>
        slot < 27 && item?.type === type && item?.metadata === metadata
      );
      if (sourceSlot < 0) throw new Error(`Missing barrel item type ${type}.`);
      const source = windowSlots[sourceSlot];
      const movedCount = Math.min(count, source.count);
      const targetSlot = firstEmptyInventorySlot();
      if (targetSlot == null) throw new Error('Inventory is full.');
      const moved = { ...source, count:movedCount, slot:targetSlot };
      inventorySlots[targetSlot] = moved;
      windowSlots[targetSlot + 18] = moved;
      source.count -= movedCount;
      if (source.count <= 0) windowSlots[sourceSlot] = null;
    },
    close() { bot.currentWindow = null; }
  };

  bot.username = 'SupplyBot';
  bot.entity = { position:new Vec3(0, 64, 0), effects:{} };
  bot.inventory = { items:inventoryItems, slots:inventorySlots, inventoryStart:9, hotbarStart:36 };
  bot.registry = { blocksByName:{ barrel:{ id:1 } }, itemsByName:{} };
  bot.pathfinder = { stop() {}, setGoal() {} };
  bot.clearControlStates = () => {};
  bot.equip = async item => { bot.heldItem = item; };
  bot.unequip = async () => { bot.heldItem = null; };
  bot.lookAt = async () => {};
  bot.findBlocks = options => options?.matching === 1 ? [barrelPosition] : [];
  bot.blockAt = position => position?.equals?.(barrelPosition)
    ? { name:'barrel', type:1, position:barrelPosition }
    : null;
  bot.blockAtCursor = () => ({ name:'barrel', type:1, position:barrelPosition, face:4 });
  bot.activateBlock = async () => {
    bot.currentWindow = container;
    bot.emit('windowOpen', container);
  };
  bot.clickWindow = async (slot, mouseButton, mode) => {
    assert.equal(mode, 0, 'main-inventory pickaxe exchange uses normal clicks');
    const clicked = windowSlots[slot] || null;
    windowSlots[slot] = container.selectedItem;
    container.selectedItem = clicked;
    if (windowSlots[slot]) windowSlots[slot].slot = slot < 27 ? slot : slot - 18;
    synchronizeInventorySlot(slot);
  };

  return { bot, container, wornPickaxe, replacementPickaxe };
}

async function main() {
  const dataRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'wheat-obsidian-supplies-'));
  try {
    const farm = createObsidianFarm({
      accountId:'00000000-0000-4000-8000-000000000004',
      username:'SupplyBot',
      configFile:path.join(dataRoot, 'farm.json'),
      debugLogFile:path.join(dataRoot, 'farm.log')
    });
    const { bot, container, wornPickaxe, replacementPickaxe } = createSupplyBot();

    assert.equal(farm.__test.isPickaxeUsable(bot, wornPickaxe), false, 'a pickaxe at exactly 5% must be replaced');
    const supplies = await farm.prepareStart(bot);

    assert.ok(supplies?.barrel, 'startup preflight opens and validates the supply barrel');
    assert.equal(bot.inventory.items().some(item => item.name === 'bread'), true, 'missing food is withdrawn before startup');
    assert.equal(bot.inventory.items().some(item => item.name === 'bucket'), true, 'missing bucket is withdrawn before startup');
    assert.equal(bot.inventory.items().includes(replacementPickaxe), true, 'the fresh pickaxe is moved into bot inventory');
    assert.equal(container.slots[0], wornPickaxe, 'the 5% pickaxe is returned to the exact barrel slot the fresh pickaxe occupied');
    assert.equal(container.slots[0].slot, 0, 'the returned pickaxe retains the exact barrel slot index');

    console.log('Obsidian supply preflight tests passed.');
  } finally {
    fs.rmSync(dataRoot, { recursive:true, force:true, maxRetries:5, retryDelay:50 });
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
