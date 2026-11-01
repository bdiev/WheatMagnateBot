'use strict';

const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');
const { EventEmitter } = require('node:events');
const { Vec3 } = require('vec3');
const { createStoneMiner } = require('../features/stoneMiner');

const stateFile = path.join(os.tmpdir(), `stone-miner-test-${process.pid}.json`);

function wait(ms = 20) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function until(check, label, timeoutMs = 2000) {
  const startedAt = Date.now();
  while (!check()) {
    if (Date.now() - startedAt > timeoutMs) throw new Error(`Timed out: ${label}`);
    await wait(10);
  }
}

function item(name, slot, extra = {}) {
  return { name, slot, type: name.length, count: 1, ...extra };
}

// A bot at 0,64,0 with a generator block east of its head and a chest behind it
function fakeBot({ inventory = [], chest = [] } = {}) {
  const bot = new EventEmitter();
  const world = new Map();
  const blockAt = pos => {
    const name = world.get(`${pos.x},${pos.y},${pos.z}`) || 'air';
    return { name, position: new Vec3(pos.x, pos.y, pos.z) };
  };
  bot.setBlock = (x, y, z, name) => {
    const old = blockAt({ x, y, z });
    world.set(`${x},${y},${z}`, name);
    bot.emit('blockUpdate', old, blockAt({ x, y, z }));
  };
  world.set('0,64,-2', 'chest');
  bot.entity = { position: new Vec3(0.5, 64, 0.5), height: 1.62, yaw: 0 };
  bot.food = 20;
  bot.registry = {
    itemsByName: { diamond_pickaxe: { maxDurability: 1561 }, iron_pickaxe: { maxDurability: 250 } },
    foodsByName: { bread: {} },
    blocksByName: { chest: { id: 54 }, barrel: { id: 1 }, trapped_chest: { id: 2 } }
  };
  bot.slots = new Array(46).fill(null);
  for (const entry of inventory) bot.slots[entry.slot] = entry;
  bot.inventory = {
    items: () => bot.slots.filter((entry, slot) => entry && slot >= 9),
    emptySlotCount: () => bot.slots.slice(9, 45).filter(entry => !entry).length
  };
  bot.heldItem = null;
  bot.dug = [];
  bot.blockAt = blockAt;
  bot.canDigBlock = () => true;
  bot.equip = async entry => { bot.heldItem = entry; };
  bot.dig = async block => {
    bot.dug.push(`${block.position.x},${block.position.y},${block.position.z}`);
    bot.setBlock(block.position.x, block.position.y, block.position.z, 'air');
  };
  bot.lookAt = async () => {};
  bot.look = async () => {};
  bot.tossed = [];
  bot.tossStack = async entry => {
    bot.tossed.push(entry.name);
    bot.slots[entry.slot] = null;
  };
  bot.consume = async () => { bot.food = 20; };
  bot.findBlocks = () => [new Vec3(0, 64, -2)];
  // A 27-slot chest: window slots 0-26, then the bot inventory 27-62
  bot.openContainer = async () => {
    const window = { inventoryStart: 27, inventoryEnd: 63, slots: new Array(63).fill(null) };
    chest.forEach((entry, index) => { window.slots[index] = { ...entry, slot: index }; });
    for (let slot = 9; slot < 45; slot += 1) {
      if (bot.slots[slot]) window.slots[slot - 9 + 27] = { ...bot.slots[slot], slot: slot - 9 + 27 };
    }
    window.firstEmptySlotRange = (start, end) => {
      for (let slot = start; slot < end; slot += 1) if (!window.slots[slot]) return slot;
      return null;
    };
    bot.window = window;
    return window;
  };
  bot.moveSlotItem = async (from, to) => {
    const { window } = bot;
    const moving = window.slots[from];
    const target = window.slots[to];
    window.slots[to] = moving && { ...moving, slot: to };
    window.slots[from] = target && { ...target, slot: from };
  };
  // Closing writes the window's inventory part back to the bot
  bot.closeWindow = window => {
    chest.length = 0;
    window.slots.slice(0, 27).forEach(entry => entry && chest.push(entry));
    for (let slot = 27; slot < 63; slot += 1) {
      const entry = window.slots[slot];
      bot.slots[slot - 27 + 9] = entry ? { ...entry, slot: slot - 27 + 9 } : null;
    }
  };
  return { bot, world };
}

async function testLearnsOnlyStoneBrokenNearTheBot() {
  fs.rmSync(stateFile, { force: true });
  const { bot } = fakeBot();
  const miner = createStoneMiner({ stateFile });
  miner.attachBot(bot);
  bot.setBlock(1, 65, 0, 'cobblestone');
  bot.setBlock(1, 65, 0, 'air');
  assert.equal(miner.getStatus().blockCount, 0, 'nothing is learned outside learning mode');

  miner.setLearning(true);
  bot.setBlock(1, 65, 0, 'cobblestone');
  bot.setBlock(1, 65, 0, 'air');
  bot.setBlock(2, 64, 1, 'stone');
  bot.setBlock(2, 64, 1, 'air');
  bot.setBlock(5, 64, 0, 'cobblestone');
  bot.setBlock(5, 64, 0, 'air');
  bot.setBlock(1, 64, 0, 'dirt');
  bot.setBlock(1, 64, 0, 'air');
  bot.setBlock(1, 65, 0, 'cobblestone');
  bot.setBlock(1, 65, 0, 'air');
  const status = miner.getStatus();
  assert.deepEqual(status.blocks, [{ x: 1, y: 65, z: 0 }, { x: 2, y: 64, z: 1 }],
    'stone broken within two blocks is learned once; far blocks and dirt are not');
  assert.deepEqual(status.anchor, { x: 0, y: 64, z: 0 });

  const restored = createStoneMiner({ stateFile });
  assert.equal(restored.getStatus().blockCount, 2, 'learned blocks survive a restart');
  miner.dispose();
}

async function testMinesGrownBlocksAndSwapsWornPickaxe() {
  fs.rmSync(stateFile, { force: true });
  const worn = item('diamond_pickaxe', 36, { maxDurability: 1561, durabilityUsed: 1500 });
  const fresh = item('diamond_pickaxe', 0, { maxDurability: 1561, durabilityUsed: 10 });
  const chest = [fresh, item('bread', 1, { count: 16 })];
  const { bot } = fakeBot({ inventory: [worn], chest });
  const mined = [];
  const retired = [];
  const miner = createStoneMiner({
    stateFile,
    onMined: block => mined.push(block.name),
    onPickaxeRetired: pickaxe => retired.push(pickaxe)
  });
  miner.attachBot(bot);
  miner.setLearning(true);
  bot.setBlock(1, 65, 0, 'cobblestone');
  bot.setBlock(1, 65, 0, 'air');
  miner.start();
  assert.equal(miner.getStatus().learning, false, 'starting ends learning');

  bot.setBlock(1, 65, 0, 'cobblestone');
  await until(() => bot.dug.length === 1, 'the grown block is mined');
  assert.equal(bot.heldItem.durabilityUsed, 10, 'mining uses the fresh pickaxe');
  assert.ok(chest.some(entry => entry.name === 'diamond_pickaxe' && entry.durabilityUsed === 1500),
    'the worn pickaxe went into the chest');
  assert.ok(bot.inventory.items().some(entry => entry.name === 'bread'), 'food was taken from the chest');

  bot.setBlock(1, 65, 0, 'cobblestone');
  await until(() => bot.dug.length === 2, 'it keeps mining as the block grows back');
  assert.equal(miner.getStatus().sessionMined, 2);
  assert.deepEqual(mined, ['cobblestone', 'cobblestone'], 'every mined block is reported for the statistics');
  assert.deepEqual(retired, [{ name: 'diamond_pickaxe', blocksMined: 0, countInAverage: false }],
    'a pickaxe the bot came with is reported but kept out of the average');
  assert.ok(miner.getStatus().sessionStartedAt);

  miner.stop();
  bot.setBlock(1, 65, 0, 'cobblestone');
  await wait(100);
  assert.equal(bot.dug.length, 2, 'a stopped miner does not mine');
  miner.dispose();
}

async function testDropsMinedBlocksWhenFull() {
  fs.rmSync(stateFile, { force: true });
  const pickaxe = item('iron_pickaxe', 36, { maxDurability: 250, durabilityUsed: 0 });
  const inventory = [pickaxe, item('bread', 37)];
  // Two free slots left: 35 and 44
  for (const slot of [...Array(25).keys()].map(i => i + 9).concat([38, 39, 40, 41, 42, 43])) {
    inventory.push(item('cobblestone', slot, { count: 64 }));
  }
  inventory.push(item('torch', 34));
  const { bot } = fakeBot({ inventory });
  const miner = createStoneMiner({ stateFile });
  miner.attachBot(bot);
  miner.setLearning(true);
  bot.setBlock(1, 65, 0, 'cobblestone');
  bot.setBlock(1, 65, 0, 'air');
  miner.start();
  bot.setBlock(1, 65, 0, 'cobblestone');
  await until(() => bot.dug.length === 1, 'it mines after dropping');
  assert.equal(bot.tossed.length, 31, 'every cobblestone stack is dropped');
  assert.ok(bot.inventory.items().some(entry => entry.name === 'torch'), 'other items are kept');
  miner.dispose();
}

async function testKeepsRetryingWithoutPickaxe() {
  fs.rmSync(stateFile, { force: true });
  const { bot } = fakeBot({ inventory: [item('bread', 37)] });
  const miner = createStoneMiner({ stateFile });
  miner.attachBot(bot);
  miner.setLearning(true);
  bot.setBlock(1, 65, 0, 'cobblestone');
  bot.setBlock(1, 65, 0, 'air');
  miner.start();
  await until(() => miner.getStatus().lastErrorMessage, 'the missing pickaxe is reported');
  assert.match(miner.getStatus().lastErrorMessage, /pickaxe/);
  assert.equal(miner.getStatus().enabled, true, 'the miner does not stop on its own');
  miner.detachBot();
  assert.equal(miner.getStatus().running, false, 'leaving the game stops the loop');
  assert.equal(miner.getStatus().enabled, true, 'but it starts again after the next spawn');
  miner.dispose();
  assert.throws(() => createStoneMiner({ stateFile: null }).start(), /no blocks/);
}

(async () => {
  await testLearnsOnlyStoneBrokenNearTheBot();
  await testMinesGrownBlocksAndSwapsWornPickaxe();
  await testDropsMinedBlocksWhenFull();
  await testKeepsRetryingWithoutPickaxe();
  fs.rmSync(stateFile, { force: true });
  console.log('Stone miner tests passed.');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
