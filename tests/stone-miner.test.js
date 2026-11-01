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

// A bot standing on a barrel at 0,63,0, with a generator block east of its
// head, a chest behind it and a hopper in front
function fakeBot({ inventory = [], chest = [], hopper = [] } = {}) {
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
  world.set('0,63,0', 'barrel');
  world.set('-1,64,0', 'hopper');
  bot.entity = { position: new Vec3(0.5, 64, 0.5), height: 1.62, yaw: 0 };
  bot.food = 20;
  bot.registry = {
    itemsByName: { diamond_pickaxe: { maxDurability: 1561 }, iron_pickaxe: { maxDurability: 250 } },
    foodsByName: { bread: {} },
    blocksByName: { chest: { id: 54 }, barrel: { id: 1 }, trapped_chest: { id: 2 }, hopper: { id: 154 } }
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
  bot.findBlocks = ({ matching }) => [...world.entries()]
    .filter(([, name]) => [].concat(matching).includes(bot.registry.blocksByName[name]?.id))
    .map(([key]) => new Vec3(...key.split(',').map(Number)));
  bot.opened = [];
  // A 27-slot barrel (or a 5-slot hopper), then the bot inventory
  bot.openContainer = async block => {
    bot.opened.push(block.name);
    const contents = block.name === 'hopper' ? hopper : chest;
    const size = block.name === 'hopper' ? 5 : 27;
    const window = { inventoryStart: size, inventoryEnd: size + 36, slots: new Array(size + 36).fill(null), contents };
    contents.forEach((entry, index) => { window.slots[index] = { ...entry, slot: index }; });
    for (let slot = 9; slot < 45; slot += 1) {
      if (bot.slots[slot]) window.slots[slot - 9 + size] = { ...bot.slots[slot], slot: slot - 9 + size };
    }
    window.firstEmptySlotRange = (start, end) => {
      for (let slot = start; slot < end; slot += 1) if (!window.slots[slot]) return slot;
      return null;
    };
    bot.window = window;
    return window;
  };
  // Dragging with the cursor is refused by the server while a container is
  // open; only a shift-click moves a stack
  bot.moveSlotItem = async () => { throw new Error('moveSlotItem is refused by the server'); };
  bot.clickWindow = async (slot, button, mode) => {
    assert.equal(mode, 1, 'stacks are moved with a shift-click');
    const { window } = bot;
    const moving = window.slots[slot];
    if (!moving) return;
    const toContainer = slot >= window.inventoryStart;
    const [from, to] = toContainer ? [0, window.inventoryStart] : [window.inventoryStart, window.inventoryEnd];
    let left = moving.count;
    for (let target = from; target < to && left > 0; target += 1) {
      const entry = window.slots[target];
      if (entry && entry.name === moving.name && entry.count < 64 && moving.count > 1) {
        const add = Math.min(64 - entry.count, left);
        entry.count += add;
        left -= add;
      }
    }
    for (let target = from; target < to && left > 0; target += 1) {
      if (!window.slots[target]) {
        window.slots[target] = { ...moving, count: left, slot: target };
        left = 0;
      }
    }
    window.slots[slot] = left ? { ...moving, count: left } : null;
  };
  // Closing writes the window's inventory part back to the bot
  bot.closeWindow = window => {
    const size = window.inventoryStart;
    window.contents.length = 0;
    window.slots.slice(0, size).forEach(entry => entry && window.contents.push(entry));
    for (let slot = size; slot < size + 36; slot += 1) {
      const entry = window.slots[slot];
      bot.slots[slot - size + 9] = entry ? { ...entry, slot: slot - size + 9 } : null;
    }
  };
  return { bot, world };
}

async function testLearnsTheLineInFrontFromOneBrokenBlock() {
  fs.rmSync(stateFile, { force: true });
  const { bot } = fakeBot();
  const miner = createStoneMiner({ stateFile });
  miner.attachBot(bot);
  bot.setBlock(1, 65, 0, 'cobblestone');
  bot.setBlock(1, 65, 0, 'air');
  assert.equal(miner.getStatus().blockCount, 0, 'nothing is learned outside learning mode');

  miner.setLearning(true);
  bot.setBlock(5, 64, 0, 'cobblestone');
  bot.setBlock(5, 64, 0, 'air');
  bot.setBlock(1, 64, 0, 'dirt');
  bot.setBlock(1, 64, 0, 'air');
  assert.equal(miner.getStatus().learning, true, 'a far block or a non-stone block does not count');

  bot.setBlock(2, 65, 0, 'cobblestone');
  bot.setBlock(2, 65, 0, 'air');
  const status = miner.getStatus();
  assert.deepEqual(status.blocks, [1, 2, 3, 4, 5].map(x => ({ x, y: 65, z: 0 })),
    'every block at head height in that direction the bot reaches is learned, nearest first');
  assert.deepEqual(status.anchor, { x: 0, y: 64, z: 0 });
  assert.equal(status.learning, false);
  assert.equal(status.enabled, true, 'learning starts the miner');

  const restored = createStoneMiner({ stateFile });
  assert.equal(restored.getStatus().blockCount, 5, 'the learned line survives a restart');
  miner.dispose();

  const side = createStoneMiner({ stateFile: null });
  side.attachBot(bot);
  side.setLearning(true);
  bot.setBlock(1, 64, -2, 'stone');
  bot.setBlock(1, 64, -2, 'air');
  assert.deepEqual(side.getStatus().blocks, [-1, -2, -3, -4].map(z => ({ x: 1, y: 64, z })),
    'the line follows the axis the block lies on most, keeping its row and height');
  side.dispose();
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
  assert.deepEqual(retired, [], 'a pickaxe the bot came with already worn is not counted');
  assert.ok(miner.getStatus().sessionStartedAt);
  const barrel = miner.getStatus().barrel;
  assert.equal(barrel.pickaxes, 0, 'the site sees what is left in the barrel');
  assert.equal(barrel.wornPickaxes, 1);

  // The fresh pickaxe wears out after two blocks and is swapped for the next one
  bot.slots[bot.heldItem.slot].durabilityUsed = 1555;
  chest.push(item('diamond_pickaxe', 5, { maxDurability: 1561, durabilityUsed: 0 }));
  bot.setBlock(1, 65, 0, 'cobblestone');
  await until(() => bot.dug.length === 3, 'it mines on with the next pickaxe');
  assert.deepEqual(retired, [{ name: 'diamond_pickaxe', blocksMined: 2, countInAverage: true }],
    'a pickaxe taken fresh and worn out here counts in the average');

  miner.stop();
  bot.setBlock(1, 65, 0, 'cobblestone');
  await wait(100);
  assert.equal(bot.dug.length, 3, 'a stopped miner does not mine');
  miner.dispose();
}

async function testFillsTheHopperFromAStack() {
  fs.rmSync(stateFile, { force: true });
  const pickaxe = item('iron_pickaxe', 36, { maxDurability: 250, durabilityUsed: 0 });
  const inventory = [pickaxe, item('bread', 37), item('torch', 34), item('cobblestone', 9, { count: 40 })];
  const hopper = [item('cobblestone', 0, { count: 64 }), item('cobblestone', 1, { count: 64 })];
  const { bot } = fakeBot({ inventory, hopper });
  const miner = createStoneMiner({ stateFile });
  miner.attachBot(bot);
  miner.setLearning(true);
  bot.setBlock(1, 65, 0, 'cobblestone');
  bot.setBlock(1, 65, 0, 'air');
  miner.start();
  bot.setBlock(1, 65, 0, 'cobblestone');
  await until(() => bot.dug.length === 1, 'it mines');
  assert.equal(bot.opened.includes('hopper'), false, 'less than a stack stays with the bot');
  miner.stop();

  for (const slot of [10, 11, 12, 13]) bot.slots[slot] = item('cobblestone', slot, { count: 64 });
  miner.start();
  bot.setBlock(1, 65, 0, 'cobblestone');
  await until(() => bot.dug.length === 2, 'it mines after filling the hopper');
  assert.equal(hopper.length, 5, 'the hopper gets as many stacks as it has room for');
  assert.equal(bot.inventory.items().filter(entry => entry.name === 'cobblestone').length, 2,
    'what did not fit waits for the next try');
  assert.ok(bot.inventory.items().some(entry => entry.name === 'torch'), 'other items are kept');
  assert.equal(bot.tossed.length, 0, 'nothing is thrown on the ground');
  miner.dispose();
}

async function testStopsWhenTheHopperStaysFull() {
  fs.rmSync(stateFile, { force: true });
  const inventory = [
    item('iron_pickaxe', 36, { maxDurability: 250, durabilityUsed: 0 }), item('bread', 37),
    item('cobblestone', 9, { count: 64 })
  ];
  const hopper = [0, 1, 2, 3, 4].map(slot => item('cobblestone', slot, { count: 64 }));
  const { bot } = fakeBot({ inventory, hopper });
  const miner = createStoneMiner({ stateFile, hopperRetryMs: 20, hopperStallMs: 80 });
  miner.attachBot(bot);
  miner.setLearning(true);
  bot.setBlock(1, 65, 0, 'cobblestone');
  bot.setBlock(1, 65, 0, 'air');
  await until(() => !miner.getStatus().enabled, 'a hopper that does not drain stops the miner');
  const status = miner.getStatus();
  assert.match(status.stopReason, /hopper/i);
  assert.equal(status.running, false);
  assert.equal(createStoneMiner({ stateFile }).getStatus().stopReason, status.stopReason, 'the reason survives a restart');

  hopper.length = 0;
  miner.start();
  assert.equal(miner.getStatus().stopReason, null, 'starting again clears the reason');
  await until(() => hopper.length === 1, 'an emptied hopper takes the stone again');
  assert.equal(miner.getStatus().enabled, true);
  miner.dispose();
}

async function testTakesPickaxesFromTheBarrelBelow() {
  fs.rmSync(stateFile, { force: true });
  const barrel = [item('diamond_pickaxe', 0, { maxDurability: 1561, durabilityUsed: 0 })];
  const { bot } = fakeBot({ inventory: [item('bread', 37)], chest: barrel });
  const miner = createStoneMiner({ stateFile });
  miner.attachBot(bot);
  miner.setLearning(true);
  bot.setBlock(1, 65, 0, 'cobblestone');
  bot.setBlock(1, 65, 0, 'air');
  miner.start();
  bot.setBlock(1, 65, 0, 'cobblestone');
  await until(() => bot.dug.length === 1, 'it mines with the pickaxe from the barrel');
  assert.equal(bot.opened[0], 'barrel', 'the barrel the bot stands on is used before the chest nearby');
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
  await testLearnsTheLineInFrontFromOneBrokenBlock();
  await testMinesGrownBlocksAndSwapsWornPickaxe();
  await testFillsTheHopperFromAStack();
  await testStopsWhenTheHopperStaysFull();
  await testTakesPickaxesFromTheBarrelBelow();
  await testKeepsRetryingWithoutPickaxe();
  fs.rmSync(stateFile, { force: true });
  console.log('Stone miner tests passed.');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
