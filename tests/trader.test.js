'use strict';

const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');
const { EventEmitter } = require('node:events');
const { Vec3 } = require('vec3');
const registry = require('prismarine-registry')('1.21.4');
const Item = require('prismarine-item')(registry);
const { createTrader: create, parseOffers, usesFromStock, tradeKey } = require('../features/trader');

const fast = { settleMs: 0, idleIntervalMs: 40, retryDelayMs: 10, supplyRetryDelayMs: 10, merchantTimeoutMs: 60, containerTimeoutMs: 60, villagerWatchGapMs: 2, watchBackoffMs: 5, stockPollMs: 5, workPollMs: 2 };
const createTrader = options => create({ ...fast, ...options });

const SOURCE = { x: 2, y: 64, z: 0 };
const OUTPUT = { x: -2, y: 64, z: 0 };
const TABLE = { x: 0, y: 64, z: 2 };

const chatMessages = [];

function wait(ms = 10) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function until(check, label, timeoutMs = 3000) {
  const startedAt = Date.now();
  while (!check()) {
    if (Date.now() - startedAt > timeoutMs) throw new Error(`Timed out: ${label}`);
    await wait(5);
  }
}

function stack(name, count, extra = {}) {
  return { name, count, type: registry.itemsByName[name].id, stackSize: registry.itemsByName[name].stackSize, components: [], removedComponents: [], ...extra };
}

function rawItem(name, count) {
  return { itemId: registry.itemsByName[name].id, itemCount: count, addedComponentCount: 0, components: [] };
}

function rawTrade(input, price, output, outputCount, extra = {}) {
  return {
    inputItem1: rawItem(input, price),
    outputItem: { ...rawItem(output, outputCount), removedComponentCount: 0, removeComponents: [] },
    tradeDisabled: false,
    nbTradeUses: 0,
    maximumNbTradeUses: 16,
    xp: 2,
    specialPrice: 0,
    priceMultiplier: 0.05,
    demand: 0,
    ...extra
  };
}

// A small server: chests, a crafting table and villagers around a bot at 0,64,0.
// Like the real one it moves stacks only by shift-click, and a shift-click on the
// result slot repeats the trade while the inputs, the uses and the room last
function fakeBot({ inventory = [], source = [], output = [], villagers = [], outputSize = 27 } = {}) {
  const bot = new EventEmitter();
  const client = new EventEmitter();
  const blocks = new Map([
    [`${SOURCE.x},${SOURCE.y},${SOURCE.z}`, 'chest'],
    [`${OUTPUT.x},${OUTPUT.y},${OUTPUT.z}`, 'chest'],
    [`${TABLE.x},${TABLE.y},${TABLE.z}`, 'crafting_table']
  ]);
  const properties = new Map();
  const contents = new Map([
    [`${SOURCE.x},${SOURCE.y},${SOURCE.z}`, source.map(entry => ({ ...entry }))],
    [`${OUTPUT.x},${OUTPUT.y},${OUTPUT.z}`, output.map(entry => ({ ...entry }))]
  ]);
  const sizes = new Map([[`${OUTPUT.x},${OUTPUT.y},${OUTPUT.z}`, outputSize]]);
  let nextWindowId = 1;

  bot.contents = contents;
  bot.sourceItems = () => contents.get(`${SOURCE.x},${SOURCE.y},${SOURCE.z}`).filter(Boolean);
  bot.outputItems = () => contents.get(`${OUTPUT.x},${OUTPUT.y},${OUTPUT.z}`).filter(Boolean);
  // A player takes something out; an open window shows it too, as on a server
  bot.freeOutputSlot = () => {
    const stored = contents.get(`${OUTPUT.x},${OUTPUT.y},${OUTPUT.z}`);
    stored[0] = null;
    if (bot.currentWindow?.stored === stored) bot.currentWindow.slots[0] = null;
  };
  bot.setBlockProperties = (pos, value) => properties.set(`${pos.x},${pos.y},${pos.z}`, value);
  bot.setBlock = (pos, name) => blocks.set(`${pos.x},${pos.y},${pos.z}`, name);
  bot.registry = registry;
  bot.entity = { position: new Vec3(0.5, 64, 0.5), eyeHeight: 1.62 };
  bot.entities = {};
  bot.slots = new Array(46).fill(null);
  inventory.forEach((entry, index) => { bot.slots[9 + index] = { ...entry, slot: 9 + index }; });
  bot.inventory = {
    items: () => bot.slots.filter((entry, slot) => entry && slot >= 9 && slot < 45),
    emptySlotCount: () => bot.slots.slice(9, 45).filter(entry => !entry).length
  };
  bot.count = name => bot.inventory.items().filter(entry => entry.name === name).reduce((sum, entry) => sum + entry.count, 0);
  bot.currentWindow = null;
  bot.written = [];
  bot.syncs = 0;
  bot._syncWindow = async () => { bot.syncs += 1; };
  bot.clicks = 0;
  bot.dragPackets = 0;
  bot.refuseDrag = false;
  bot.oldCrafts = 0;
  bot.dropped = [];
  bot.crafts = 0;
  bot._client = client;

  villagers.forEach((villager, index) => {
    const entity = { id: 100 + index, uuid: villager.uuid || `villager-${index}`, name: villager.name || 'villager', position: new Vec3(...(villager.at || [1.5, 64, 1.5])), villager };
    villager.entity = entity;
    bot.entities[entity.id] = entity;
  });

  bot.blockAt = pos => {
    const key = `${pos.x},${pos.y},${pos.z}`;
    const name = blocks.get(key) || 'air';
    return { name, position: new Vec3(pos.x, pos.y, pos.z), getProperties: () => properties.get(key) || {} };
  };
  bot.findBlocks = ({ matching }) => [...blocks.entries()]
    .filter(([, name]) => [].concat(matching).includes(registry.blocksByName[name]?.id))
    .map(([key]) => new Vec3(...key.split(',').map(Number)));
  bot.lookAt = async () => {};

  function makeWindow(type, size, stored) {
    const window = { id: nextWindowId++, type, inventoryStart: size, inventoryEnd: size + 36, slots: new Array(size + 36).fill(null), stored };
    stored?.forEach((entry, index) => { if (entry) window.slots[index] = { ...entry, slot: index }; });
    for (let slot = 9; slot < 45; slot += 1) {
      if (bot.slots[slot]) window.slots[slot - 9 + size] = { ...bot.slots[slot], slot: slot - 9 + size };
    }
    return window;
  }

  // What a window holds goes back to the bot and the chest on close; a villager's
  // input slots return to the inventory, as on the server
  bot.closeWindow = window => {
    if (bot.currentWindow !== window) return;
    bot.currentWindow = null;
    for (let slot = window.inventoryStart; slot < window.inventoryEnd; slot += 1) {
      const entry = window.slots[slot];
      const own = slot - window.inventoryStart + 9;
      bot.slots[own] = entry ? { ...entry, slot: own } : null;
    }
    if (window.stored) {
      window.stored.length = 0;
      for (const entry of window.slots.slice(0, window.inventoryStart)) window.stored.push(entry ? { ...entry } : null);
    }
    if (window.type === 'minecraft:merchant') {
      for (const slot of [0, 1]) {
        if (window.slots[slot]) giveToBot(window.slots[slot]);
      }
    }
    if (window.type === 'minecraft:crafting') {
      for (let slot = 1; slot <= 9; slot += 1) {
        if (window.slots[slot]) giveToBot(window.slots[slot]);
      }
      if (window.selectedItem) giveToBot(window.selectedItem);
    }
  };

  function giveToBot(entry) {
    const room = bot.slots.findIndex((value, slot) => slot >= 9 && slot < 45 && value?.name === entry.name && value.count + entry.count <= value.stackSize);
    if (room >= 0) {
      bot.slots[room].count += entry.count;
      return;
    }
    const empty = bot.slots.findIndex((value, slot) => slot >= 9 && slot < 45 && !value);
    if (empty < 0) {
      bot.dropped.push(entry.name);
      return;
    }
    bot.slots[empty] = { ...entry, slot: empty };
  }

  function insert(window, entry, from, to) {
    let left = entry.count;
    for (let slot = from; slot < to && left > 0; slot += 1) {
      const held = window.slots[slot];
      if (held && held.name === entry.name && held.count < held.stackSize) {
        const add = Math.min(held.stackSize - held.count, left);
        held.count += add;
        left -= add;
      }
    }
    for (let slot = from; slot < to && left > 0; slot += 1) {
      if (!window.slots[slot]) {
        window.slots[slot] = { ...entry, count: left, slot };
        left = 0;
      }
    }
    return left;
  }

  bot.setChestSize = (pos, size, stored) => {
    const key = `${pos.x},${pos.y},${pos.z}`;
    sizes.set(key, size);
    contents.set(key, stored);
  };

  bot.activateBlock = async block => {
    const key = `${block.position.x},${block.position.y},${block.position.z}`;
    if (block.name === 'crafting_table') {
      const table = makeWindow('minecraft:crafting', 10, null);
      table.selectedItem = null;
      table.drag = null;
      bot.currentWindow = table;
      setImmediate(() => bot.emit('windowOpen', table));
      return;
    }
    const window = makeWindow('minecraft:generic_9x3', sizes.get(key) || 27, contents.get(key));
    if (block.name !== 'chest') return;
    bot.currentWindow = window;
    setImmediate(() => bot.emit('windowOpen', window));
  };

  bot.activateEntity = async entity => {
    const { villager } = entity;
    if (villager.refuses) return;
    const window = makeWindow('minecraft:merchant', 3, null);
    window.villager = villager;
    bot.currentWindow = window;
    setImmediate(() => {
      bot.emit('windowOpen', window);
      client.emit('trade_list', {
        windowId: window.id,
        trades: villager.trades,
        villagerLevel: 1,
        experience: 0,
        isRegularVillager: true,
        canRestock: true
      });
    });
  };

  function takeFromInventory(window, name, amount) {
    let moved = 0;
    for (let slot = window.inventoryStart; slot < window.inventoryEnd && moved < amount; slot += 1) {
      const entry = window.slots[slot];
      if (entry?.name !== name) continue;
      const take = Math.min(entry.count, amount - moved);
      entry.count -= take;
      moved += take;
      if (!entry.count) window.slots[slot] = null;
    }
    return moved;
  }

  function refreshCraftResult(window) {
    const grid = window.slots.slice(1, 10);
    window.slots[0] = grid.every(entry => entry?.name === 'emerald') ? { ...stack('emerald_block', 1), slot: 0 } : null;
  }

  // A drag: start, one click per slot, end. The end splits the cursor evenly
  function dragClick(window, { slot, mouseButton, mode, stateId }) {
    assert.equal(mode, 5);
    assert.equal(stateId, -1, 'the server answers such a click with the whole window');
    bot.dragPackets += 1;
    if (bot.refuseDrag) return;
    if (mouseButton === 0) window.drag = [];
    else if (mouseButton === 1) window.drag.push(slot);
    else if (mouseButton === 2) {
      const each = Math.floor(window.selectedItem.count / window.drag.length);
      for (const target of window.drag) window.slots[target] = { ...window.selectedItem, count: each, slot: target };
      window.selectedItem.count -= each * window.drag.length;
      if (!window.selectedItem.count) window.selectedItem = null;
      refreshCraftResult(window);
    }
  }

  client.write = (name, data) => {
    bot.written.push(name);
    if (name === 'window_click') {
      dragClick(bot.currentWindow, data);
      return;
    }
    if (name !== 'select_trade') return;
    const window = bot.currentWindow;
    const trade = window.villager.trades[data.slot];
    window.selected = trade;
    for (const [slot, raw] of [[0, trade.inputItem1], [1, trade.inputItem2]]) {
      if (window.slots[slot]) {
        insert(window, window.slots[slot], window.inventoryStart, window.inventoryEnd);
        window.slots[slot] = null;
      }
      if (!raw) continue;
      const itemName = registry.items[raw.itemId].name;
      const moved = takeFromInventory(window, itemName, stack(itemName, 1).stackSize);
      if (moved) window.slots[slot] = { ...stack(itemName, moved), slot };
    }
    refreshResult(window);
  };

  function tradeCost(trade) {
    return trade.inputItem1.itemCount + Math.max(0, Math.floor(trade.inputItem1.itemCount * trade.demand * trade.priceMultiplier)) + trade.specialPrice;
  }

  function refreshResult(window) {
    const trade = window.selected;
    const paid = window.slots[0]?.count >= tradeCost(trade)
      && (!trade.inputItem2 || window.slots[1]?.count >= trade.inputItem2.itemCount);
    const open = !trade.tradeDisabled && trade.nbTradeUses < trade.maximumNbTradeUses;
    window.slots[2] = paid && open
      ? { ...stack(registry.items[trade.outputItem.itemId].name, trade.outputItem.itemCount), slot: 2 }
      : null;
  }

  bot.clickWindow = async (slot, button, mode) => {
    const window = bot.currentWindow;
    bot.clicks += 1;
    if (window.type === 'minecraft:crafting') {
      if (mode === 0) {
        const held = window.selectedItem;
        window.selectedItem = window.slots[slot] ? { ...window.slots[slot] } : null;
        window.slots[slot] = held ? { ...held, slot } : null;
        return;
      }
      assert.equal(mode, 1);
      assert.equal(slot, 0, 'only the result is shift-clicked at the table');
      while (window.slots[0]) {
        const room = window.slots.slice(10, 46).some(entry => !entry || (entry.name === 'emerald_block' && entry.count < 64));
        if (!room) break;
        insert(window, { ...stack('emerald_block', 1) }, 10, 46);
        for (let target = 1; target <= 9; target += 1) {
          window.slots[target].count -= 1;
          if (!window.slots[target].count) window.slots[target] = null;
        }
        bot.crafts += 1;
        refreshCraftResult(window);
      }
      return;
    }
    assert.equal(mode, 1, 'stacks are moved with a shift-click');
    if (window.type === 'minecraft:merchant') {
      if (slot < 2) {
        if (window.slots[slot]) insert(window, window.slots[slot], window.inventoryStart, window.inventoryEnd);
        window.slots[slot] = null;
        refreshResult(window);
        return;
      }
      assert.equal(slot, 2, 'only the input and result slots are clicked in a merchant window');
      while (window.slots[2]) {
        const result = window.slots[2];
        const room = window.slots.slice(window.inventoryStart, window.inventoryEnd)
          .some(entry => !entry || (entry.name === result.name && entry.count + result.count <= entry.stackSize));
        if (!room) break;
        insert(window, result, window.inventoryStart, window.inventoryEnd);
        const trade = window.selected;
        window.slots[0].count -= tradeCost(trade);
        if (!window.slots[0].count) window.slots[0] = null;
        if (trade.inputItem2) {
          window.slots[1].count -= trade.inputItem2.itemCount;
          if (!window.slots[1].count) window.slots[1] = null;
        }
        trade.nbTradeUses += 1;
        refreshResult(window);
      }
      return;
    }
    const moving = window.slots[slot];
    if (!moving) return;
    const [from, to] = slot >= window.inventoryStart ? [0, window.inventoryStart] : [window.inventoryStart, window.inventoryEnd];
    const left = insert(window, moving, from, to);
    if (left) moving.count = left;
    else window.slots[slot] = null;
  };

  // The game chat is off limits: every test run fails if anything reaches it
  bot.chat = message => { chatMessages.push(message); };
  bot.whisper = (username, message) => { chatMessages.push(message); };
  client.on('chat_message', packet => { chatMessages.push(packet?.message); });
  client.on('chat_command', packet => { chatMessages.push(packet?.command); });

  bot.recipesFor = () => [{ emeraldBlock: true }];
  // Like mineflayer, a result without room is thrown on the ground
  bot.craft = async (recipe, count, table) => {
    assert.equal(table.name, 'crafting_table');
    assert.equal(bot.currentWindow, null, 'crafting starts with no window open');
    bot.oldCrafts += count;
    for (let done = 0; done < count; done += 1) {
      let need = 9;
      for (const entry of bot.inventory.items().filter(value => value.name === 'emerald')) {
        const take = Math.min(entry.count, need);
        entry.count -= take;
        need -= take;
        if (!entry.count) bot.slots[entry.slot] = null;
        if (!need) break;
      }
      assert.equal(need, 0, 'enough emeralds for the craft');
      bot.crafts += 1;
      giveToBot(stack('emerald_block', 1));
    }
  };
  return bot;
}

async function ready(options = {}, traderOptions = {}) {
  const bot = fakeBot(options);
  const trader = createTrader(traderOptions);
  trader.attachBot(bot);
  await trader.scan();
  trader.configure({ sources: [SOURCE], output: OUTPUT });
  return { bot, trader };
}

async function test(name, run) {
  await run();
  console.log(`  ok ${name}`);
}

async function main() {
  await test('offers come from the real packet format, with the price the villager asks', () => {
    const offers = parseOffers(Item, {
      trades: [
        rawTrade('paper', 24, 'emerald', 1, { demand: 10, specialPrice: -3 }),
        rawTrade('emerald', 3, 'bread', 6, { inputItem2: rawItem('wheat', 2) }),
        rawTrade('emerald', 5, 'enchanted_book', 1, { inputItem2: { ...rawItem('book', 1), addedComponentCount: 1, components: [{}] } }),
        rawTrade('emerald', 5, 'iron_sword', 1, { outputItem: { ...rawItem('iron_sword', 1), addedComponentCount: 1, components: [{}] } })
      ]
    });
    assert.equal(offers[3].plain, false, 'a special result is left out too');
    assert.equal(usesFromStock(offers[3], new Map([['emerald', 64]])), 0);
    assert.equal(offers[0].key, tradeKey('paper', null, 'emerald'));
    assert.equal(offers[0].realPrice, 24 + 12 - 3);
    assert.equal(offers[0].index, 0);
    assert.equal(offers[1].key, 'emerald+wheat>bread');
    assert.equal(offers[1].price2, 2);
    assert.equal(offers[2].plain, false);
  });

  await test('uses are limited by the stock, the villager, a locked trade and the second input', () => {
    const [offer] = parseOffers(Item, { trades: [rawTrade('paper', 24, 'emerald', 1, { maximumNbTradeUses: 16, nbTradeUses: 14 })] });
    assert.equal(usesFromStock(offer, new Map([['paper', 1000]])), 2);
    assert.equal(usesFromStock(offer, new Map([['paper', 30]])), 1);
    assert.equal(usesFromStock(offer, new Map()), 0);
    assert.equal(usesFromStock({ ...offer, tradeDisabled: true }, new Map([['paper', 1000]])), 0);
    const [double] = parseOffers(Item, { trades: [rawTrade('emerald', 3, 'bread', 6, { inputItem2: rawItem('wheat', 2) })] });
    assert.equal(usesFromStock(double, new Map([['emerald', 30], ['wheat', 4]])), 2);
  });

  await test('the scan finds the spot, each chest once, the table and the trades', async () => {
    const villager = { trades: [rawTrade('paper', 24, 'emerald', 1), rawTrade('emerald', 1, 'bread', 6)] };
    const far = { at: [20.5, 64, 0.5], trades: [rawTrade('paper', 24, 'emerald', 1)] };
    const bot = fakeBot({ villagers: [villager, far] });
    const partner = { x: 2, y: 64, z: 1 };
    bot.setBlock(partner, 'chest');
    bot.setBlockProperties(SOURCE, { type: 'left', facing: 'east' });
    bot.setBlockProperties(partner, { type: 'right', facing: 'east' });
    const trader = createTrader();
    trader.attachBot(bot);
    const status = await trader.scan();
    assert.deepEqual(status.anchor, { x: 0, y: 64, z: 0 });
    assert.equal(status.containers.length, 2, 'a double chest counts once');
    assert.equal(status.containers.filter(entry => entry.double).length, 1);
    assert.deepEqual(status.craftingTable, TABLE);
    assert.equal(status.villagers.length, 1, 'the far villager is out of reach');
    const [sell, buy] = status.villagers[0].offers;
    assert.equal(sell.enabled, true, 'selling for emeralds is on by default');
    assert.equal(buy.enabled, false, 'spending emeralds has to be chosen');
    trader.dispose();
  });

  await test('a double chest whose block states say single counts once, by the slots the server opens', async () => {
    const lines = [];
    const bot = fakeBot();
    const partner = { x: 2, y: 64, z: 1 };
    const shared = [stack('paper', 12)];
    bot.setBlock(partner, 'chest');
    bot.setChestSize(SOURCE, 54, shared);
    bot.setChestSize(partner, 54, shared);
    const trader = createTrader({ log: message => lines.push(message) });
    trader.attachBot(bot);
    const status = await trader.scan();
    const doubles = status.containers.filter(entry => entry.double);
    assert.equal(doubles.length, 1);
    assert.equal(status.containers.length, 2, 'the double chest and the other one');
    assert.ok(lines.some(line => /state -\/-, 54 slots/.test(line)), 'the log says what the bot saw');
    assert.ok(lines.some(line => /are one double chest/.test(line)));
    trader.dispose();
  });

  await test('two single chests side by side stay two, and so do two double chests with different contents', async () => {
    const bot = fakeBot();
    const neighbour = { x: 2, y: 64, z: 1 };
    bot.setBlock(neighbour, 'chest');
    const trader = createTrader();
    trader.attachBot(bot);
    let status = await trader.scan();
    assert.equal(status.containers.filter(entry => entry.x === 2).length, 2, 'single chests');

    bot.setChestSize(SOURCE, 54, [stack('paper', 1)]);
    bot.setChestSize(neighbour, 54, [stack('dirt', 1)]);
    status = await trader.scan();
    assert.equal(status.containers.filter(entry => entry.x === 2).length, 2, 'different contents');
    trader.dispose();
  });

  await test('a stack is crafted with one drag and one shift-click, not click by click', async () => {
    const lines = [];
    const { bot, trader } = await ready({
      inventory: [stack('emerald', 64), stack('emerald', 20)],
      villagers: [{ trades: [rawTrade('paper', 1, 'emerald', 1)] }]
    }, { log: message => lines.push(message) });
    trader.start();
    await until(() => bot.outputItems().find(entry => entry.name === 'emerald_block')?.count === 9, 'nine blocks');
    assert.equal(bot.crafts, 9);
    assert.equal(bot.oldCrafts, 0, 'mineflayer\'s slow craft stays unused');
    assert.equal(bot.dragPackets, 22, 'eleven packets per stack, not per block');
    assert.ok(bot.clicks <= 8, `three clicks per stack, got ${bot.clicks}`);
    assert.equal(bot.count('emerald'), 3, 'the remainder is back in the inventory');
    assert.deepEqual(bot.dropped, []);
    assert.ok(lines.some(line => /Crafted \d+ emerald blocks? in [\d.]+ s\./.test(line)));
    trader.dispose();
  });

  await test('a server refusing the drag gets the slow craft, and nothing is lost', async () => {
    const lines = [];
    const { bot, trader } = await ready({
      inventory: [stack('emerald', 20)],
      villagers: [{ trades: [rawTrade('paper', 1, 'emerald', 1)] }]
    }, { log: message => lines.push(message) });
    bot.refuseDrag = true;
    trader.start();
    await until(() => bot.outputItems().find(entry => entry.name === 'emerald_block')?.count === 2, 'two blocks', 8000);
    assert.equal(bot.oldCrafts, 2);
    assert.equal(bot.count('emerald'), 2);
    assert.ok(lines.some(line => /did not take the fast craft/.test(line)));
    trader.dispose();
  });

  await test('emeralds in small stacks go the slow way without giving up on the fast one', async () => {
    const lines = [];
    const small = Array.from({ length: 3 }, () => stack('emerald', 5));
    const { bot, trader } = await ready({
      inventory: small,
      villagers: [{ trades: [rawTrade('paper', 1, 'emerald', 1)] }]
    }, { log: message => lines.push(message) });
    trader.start();
    await until(() => bot.oldCrafts === 1, 'the slow craft');
    assert.equal(lines.some(line => /did not take the fast craft/.test(line)), false);
    trader.dispose();
  });

  await test('a ring of villagers within the server reach is found, and the log tells the distance of the rest', async () => {
    const lines = [];
    const trades = () => [rawTrade('paper', 1, 'emerald', 1)];
    const ring = [[4.5, 64, 0.5], [-3.5, 64, 0.5], [0.5, 64, 4.5], [0.5, 64, -3.5], [3.5, 64, 3.5], [-2.5, 64, -2.5]];
    const villagers = ring.map(at => ({ at, trades: trades() }));
    villagers.push({ at: [8.5, 64, 0.5], uuid: 'too-far', trades: trades() });
    const bot = fakeBot({ villagers });
    const trader = createTrader({ log: message => lines.push(message) });
    trader.attachBot(bot);
    const status = await trader.scan();
    assert.equal(status.villagers.length, 6, 'all within 5.5 blocks');
    assert.equal(status.villagers.every(entry => entry.offers.length === 1), true);
    assert.ok(lines.some(line => /villager too-far at 7\.\d blocks, out of reach/.test(line)));
    trader.dispose();
  });

  await test('while waiting it asks the villagers in turn and trades as soon as one has restocked', async () => {
    const slow = { uuid: 'slow', at: [1.5, 64, 0.5], trades: [rawTrade('paper', 1, 'emerald', 1, { maximumNbTradeUses: 2 })] };
    const quick = { uuid: 'quick', at: [0.5, 64, 2.1], trades: [rawTrade('paper', 1, 'emerald', 1, { maximumNbTradeUses: 2 })] };
    const { bot, trader } = await ready({ source: [stack('paper', 20)], villagers: [slow, quick] }, { idleIntervalMs: 60_000 });
    const opens = { slow: 0, quick: 0 };
    const activateEntity = bot.activateEntity;
    bot.activateEntity = async entity => {
      opens[entity.uuid] += 1;
      return activateEntity(entity);
    };
    trader.start();
    await until(() => slow.trades[0].nbTradeUses === 2 && quick.trades[0].nbTradeUses === 2 && trader.getStatus().phase === 'waiting', 'sold out');
    opens.slow = 0;
    opens.quick = 0;
    await until(() => opens.slow >= 5 && opens.quick >= 5, 'both asked in turn');
    assert.ok(Math.abs(opens.slow - opens.quick) <= 1, `in turn: ${opens.slow} and ${opens.quick}`);
    assert.equal(bot.currentWindow?.type === 'minecraft:merchant' ? 1 : 0, bot.currentWindow ? 1 : 0, 'only villagers are opened');
    quick.trades[0].nbTradeUses = 0;
    await until(() => quick.trades[0].nbTradeUses === 2, 'the restocked villager trades long before the five minutes');
    assert.equal(slow.trades[0].nbTradeUses, 2);
    trader.dispose();
  });

  await test('with nothing in the sources it does not bother the villagers', async () => {
    const villager = { trades: [rawTrade('paper', 1, 'emerald', 1)] };
    const { bot, trader } = await ready({ villagers: [villager] }, { idleIntervalMs: 60_000 });
    let opens = 0;
    const activateEntity = bot.activateEntity;
    bot.activateEntity = async entity => {
      opens += 1;
      return activateEntity(entity);
    };
    trader.start();
    await until(() => trader.getStatus().phase === 'waiting_stock', 'waiting for resources, not for restocks');
    const afterRound = opens;
    await wait(60);
    assert.equal(opens, afterRound);
    trader.configure({ tradeChoices: {} });
    await until(() => opens > afterRound, 'a new setup starts a new round');
    trader.dispose();
  });

  await test('sources run dry during work: filled again, it goes on within seconds, not minutes', async () => {
    const villager = { trades: [rawTrade('stone', 64, 'emerald', 1)] };
    const lines = [];
    const { bot, trader } = await ready({ source: [stack('stone', 64), stack('stone', 64)], villagers: [villager] }, { idleIntervalMs: 60_000, log: message => lines.push(message) });
    trader.start();
    await until(() => villager.trades[0].nbTradeUses === 2 && trader.getStatus().phase === 'waiting_stock', 'sold out of stone');
    assert.ok(lines.some(line => /hold too little for any trade/.test(line)), 'the log says why it waits');
    bot.contents.get(`${SOURCE.x},${SOURCE.y},${SOURCE.z}`)[0] = stack('stone', 64);
    await until(() => villager.trades[0].nbTradeUses === 3, 'trading right after the refill');
    trader.dispose();
  });

  await test('villagers are left alone off work: one last look, then none until morning', async () => {
    const villager = { trades: [rawTrade('stone', 20, 'emerald', 1, { maximumNbTradeUses: 1 })] };
    const { bot, trader } = await ready({ source: [stack('stone', 64)], villagers: [villager] }, { idleIntervalMs: 60_000 });
    let opens = 0;
    const activateEntity = bot.activateEntity;
    bot.activateEntity = async entity => {
      opens += 1;
      return activateEntity(entity);
    };
    bot.time = { timeOfDay: 5_000 };
    trader.start();
    await until(() => villager.trades[0].nbTradeUses === 1 && trader.getStatus().phase === 'waiting', 'sold out at work');
    const atWork = opens;
    await until(() => opens >= atWork + 3, 'asked during working hours');

    bot.time.timeOfDay = 13_000;
    await until(() => trader.getStatus().phase === 'waiting_work', 'evening');
    const evening = opens;
    await wait(40);
    assert.equal(opens, evening, 'nobody is opened off work');

    villager.trades[0].nbTradeUses = 0;
    bot.time.timeOfDay = 24_000 + 3_000;
    await until(() => villager.trades[0].nbTradeUses === 1, 'trades after the morning restock');
    trader.dispose();
  });

  await test('a restock in the last minutes of work is caught by one look after it', async () => {
    const villager = { trades: [rawTrade('stone', 20, 'emerald', 1, { maximumNbTradeUses: 1 })] };
    const { bot, trader } = await ready({ source: [stack('stone', 64)], villagers: [villager] }, { idleIntervalMs: 60_000, villagerWatchGapMs: 30 });
    bot.time = { timeOfDay: 8_000 };
    trader.start();
    await until(() => villager.trades[0].nbTradeUses === 1 && trader.getStatus().phase === 'waiting', 'sold out');
    villager.trades[0].nbTradeUses = 0;
    bot.time.timeOfDay = 9_500;
    await until(() => villager.trades[0].nbTradeUses === 1, 'sold again after work');
    trader.dispose();
  });

  await test('a chest fed bit by bit: no asking every villager after each refill, and no flood in the log', async () => {
    const at = [[1.5, 64, 0.5], [0.5, 64, 2.1], [-1.5, 64, 0.5]];
    const villagers = at.map(position => ({ at: position, trades: [rawTrade('stone', 64, 'emerald', 1)] }));
    const lines = [];
    const { bot, trader } = await ready({ source: [stack('stone', 64)], villagers }, { idleIntervalMs: 60_000, log: message => lines.push(message) });
    let opens = 0;
    const activateEntity = bot.activateEntity;
    bot.activateEntity = async entity => {
      opens += 1;
      return activateEntity(entity);
    };
    const sold = () => villagers.reduce((sum, villager) => sum + villager.trades[0].nbTradeUses, 0);
    trader.start();
    await until(() => sold() === 1 && trader.getStatus().phase === 'waiting_stock', 'first stack sold');
    for (let refill = 1; refill <= 3; refill += 1) {
      const opensBefore = opens;
      bot.contents.get(`${SOURCE.x},${SOURCE.y},${SOURCE.z}`)[0] = stack('stone', 64);
      await until(() => sold() === 1 + refill && trader.getStatus().phase === 'waiting_stock', `refill ${refill}`);
      assert.equal(opens - opensBefore, 1, 'only the villager it trades with is opened');
    }
    assert.equal(lines.filter(line => /hold too little/.test(line)).length, 1, 'said once, not at every refill');
    trader.dispose();
  });

  await test('villagers asleep at the start are asked again, and it is not blamed on the chests', async () => {
    const lines = [];
    const villager = { refuses: true, trades: [rawTrade('paper', 1, 'emerald', 1, { maximumNbTradeUses: 2 })] };
    const { trader } = await ready({ source: [stack('paper', 10)], villagers: [villager] }, { idleIntervalMs: 60_000, villagerCooldownMs: 5, log: message => lines.push(message) });
    trader.start();
    await until(() => trader.getStatus().phase === 'waiting', 'waiting');
    assert.equal(lines.some(line => /hold too little/.test(line)), false);
    villager.refuses = false;
    await until(() => villager.trades[0].nbTradeUses === 2, 'traded once it woke up');
    trader.dispose();
  });

  await test('a trade above its price limit is left alone until the price falls', async () => {
    const lines = [];
    const dear = { uuid: 'dear', at: [1.5, 64, 0.5], trades: [rawTrade('stone', 20, 'emerald', 1, { demand: 40, maximumNbTradeUses: 3 })] };
    const cheap = { uuid: 'cheap', at: [0.5, 64, 2.1], trades: [rawTrade('stone', 20, 'emerald', 1, { maximumNbTradeUses: 2 })] };
    const { bot, trader } = await ready({
      source: Array.from({ length: 5 }, () => stack('stone', 64)),
      villagers: [dear, cheap]
    }, { idleIntervalMs: 60_000, log: message => lines.push(message) });
    trader.configure({ priceLimits: { 'stone+>emerald': 30 } });
    const offers = trader.getStatus().villagers.flatMap(villager => villager.offers);
    assert.deepEqual(offers.map(offer => [offer.price1, offer.priceLimit, offer.overLimit]).sort(), [[20, 30, false], [60, 30, true]]);

    trader.start();
    await until(() => cheap.trades[0].nbTradeUses === 2 && trader.getStatus().phase === 'waiting', 'only the cheap one, then waiting for it to restock');
    assert.equal(dear.trades[0].nbTradeUses, 0);
    const line = /Villager dear asks 60 for stone\+>emerald, above the limit of 30/;
    await wait(40);
    assert.equal(lines.filter(entry => line.test(entry)).length, 1, 'once per price, though it is asked again and again');
    assert.equal(bot.count('stone'), 0, 'nothing is held back for it');

    dear.trades[0].demand = 0;
    await until(() => dear.trades[0].nbTradeUses === 3, 'trades when the price has fallen');
    assert.equal(trader.getStatus().enabled, true);
    trader.dispose();
  });

  await test('a price risen since the villager was last seen stops at the window', async () => {
    const villager = { trades: [rawTrade('stone', 20, 'emerald', 1, { maximumNbTradeUses: 2 })] };
    const { bot, trader } = await ready({ source: [stack('stone', 64)], villagers: [villager] }, { idleIntervalMs: 60_000 });
    trader.configure({ priceLimits: { 'stone+>emerald': 30 } });
    let opens = 0;
    const activateEntity = bot.activateEntity;
    bot.activateEntity = async entity => {
      opens += 1;
      // After the look at the start, on the way to trade
      if (opens === 2) villager.trades[0].demand = 40;
      return activateEntity(entity);
    };
    trader.start();
    await until(() => opens >= 2 && bot.count('stone') === 0 && bot.sourceItems().length === 1, 'the stone is back');
    await until(() => trader.getStatus().phase === 'waiting_price', 'waiting for the price');
    assert.equal(villager.trades[0].nbTradeUses, 0);
    assert.equal(bot.written.includes('select_trade'), false);
    trader.dispose();
  });

  await test('every price ever seen is remembered, lowest first, past scans and restarts', async () => {
    const stateFile = path.join(os.tmpdir(), `trader-prices-test-${process.pid}.json`);
    fs.rmSync(stateFile, { force: true });
    try {
      const villager = { trades: [rawTrade('stone', 20, 'emerald', 1, { demand: 40 }), rawTrade('paper', 9, 'emerald', 1)] };
      const other = { at: [0.5, 64, 2.1], trades: [rawTrade('stone', 20, 'emerald', 1)] };
      const bot = fakeBot({ villagers: [villager, other] });
      const trader = createTrader({ stateFile });
      trader.attachBot(bot);
      await trader.scan();
      assert.deepEqual(trader.getStatus().priceHistory, { 'stone+>emerald': [20, 60], 'paper+>emerald': [9] });

      villager.trades[0].demand = 10;
      other.trades[0].demand = 0;
      await trader.scan();
      assert.deepEqual(trader.getStatus().priceHistory['stone+>emerald'], [20, 30, 60], 'a scan adds, and forgets nothing');
      trader.dispose();

      const reloaded = createTrader({ stateFile });
      assert.deepEqual(reloaded.getStatus().priceHistory['stone+>emerald'], [20, 30, 60]);
      assert.deepEqual(reloaded.getStatus().priceHistory['paper+>emerald'], [9]);
      reloaded.dispose();

      // A state from before the record starts from the villagers it remembers
      const old = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
      delete old.priceHistory;
      fs.writeFileSync(stateFile, JSON.stringify(old));
      const upgraded = createTrader({ stateFile });
      assert.deepEqual(upgraded.getStatus().priceHistory['paper+>emerald'], [9]);
      upgraded.dispose();
    } finally {
      fs.rmSync(stateFile, { force: true });
    }
  });

  await test('prices of villagers it does not trade with stay current, even with empty chests', async () => {
    const villager = { trades: [rawTrade('stone', 20, 'emerald', 1, { demand: 16 })] };
    const { trader } = await ready({ villagers: [villager] }, { idleIntervalMs: 60_000, villagerRefreshMs: 20 });
    trader.configure({ priceLimits: { 'stone+>emerald': 40 } });
    trader.start();
    await until(() => trader.getStatus().phase === 'waiting_stock', 'nothing to sell');
    const price = () => trader.getStatus().villagers[0].offers[0].price1;
    assert.equal(price(), 36);
    villager.trades[0].demand = 3;
    await until(() => price() === 23, 'the new price, with no stone to sell');
    assert.deepEqual(trader.getStatus().priceHistory['stone+>emerald'], [20, 23, 36].filter(value => value !== 20));
    assert.equal(villager.trades[0].nbTradeUses, 0);
    trader.dispose();
  });

  await test('a villager too dear to trade with is read again, and trades when it gets cheap', async () => {
    const dear = { uuid: 'dear', at: [1.5, 64, 0.5], trades: [rawTrade('stone', 20, 'emerald', 1, { demand: 40, maximumNbTradeUses: 1 })] };
    const cheap = { uuid: 'cheap', at: [0.5, 64, 2.1], trades: [rawTrade('stone', 20, 'emerald', 1)] };
    const { trader } = await ready({
      source: Array.from({ length: 27 }, () => stack('stone', 64)),
      villagers: [dear, cheap]
    }, { villagerRefreshMs: 20 });
    trader.configure({ priceLimits: { 'stone+>emerald': 30 } });
    trader.start();
    await until(() => cheap.trades[0].nbTradeUses > 0, 'trading with the cheap one');
    dear.trades[0].demand = 0;
    await until(() => dear.trades[0].nbTradeUses === 1, 'the dear one is noticed while the other is served');
    trader.dispose();
  });

  await test('price limits are checked, can be removed, and survive a restart', async () => {
    const stateFile = path.join(os.tmpdir(), `trader-limit-test-${process.pid}.json`);
    fs.rmSync(stateFile, { force: true });
    try {
      const trader = createTrader({ stateFile });
      assert.throws(() => trader.configure({ priceLimits: { a: 0 } }), /whole number/);
      assert.throws(() => trader.configure({ priceLimits: { a: 2.5 } }), /whole number/);
      trader.configure({ priceLimits: { a: 30, b: 40 } });
      trader.configure({ priceLimits: { b: null } });
      trader.dispose();
      const saved = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
      assert.deepEqual(saved.priceLimits, { a: 30 });
    } finally {
      fs.rmSync(stateFile, { force: true });
    }
  });

  await test('a restock the round cannot use is not retried in a tight loop', async () => {
    const villager = { trades: [rawTrade('paper', 1, 'emerald', 1)] };
    const { bot, trader } = await ready({ source: [stack('paper', 20)], villagers: [villager] }, { idleIntervalMs: 60_000, watchBackoffMs: 60_000 });
    const write = bot._client.write;
    bot._client.write = (name, data) => {
      if (name !== 'select_trade') write(name, data);
    };
    let opens = 0;
    const activateEntity = bot.activateEntity;
    bot.activateEntity = async entity => {
      opens += 1;
      return activateEntity(entity);
    };
    const realSetTimeout = global.setTimeout;
    global.setTimeout = (fn, ms, ...rest) => realSetTimeout(fn, ms === 2000 ? 1 : ms, ...rest);
    try {
      trader.start();
      await wait(300);
    } finally {
      global.setTimeout = realSetTimeout;
    }
    assert.ok(opens <= 8, `opened ${opens} times`);
    assert.equal(trader.getStatus().enabled, true);
    trader.dispose();
  });

  await test('the fullest source chest is used first, then the next fullest', async () => {
    const second = { x: 0, y: 64, z: -2 };
    const third = { x: 0, y: 66, z: -2 };
    const villager = { trades: [rawTrade('stone', 1, 'emerald', 1, { maximumNbTradeUses: 450 })] };
    const bot = fakeBot({ source: [stack('stone', 5)], villagers: [villager] });
    const secondItems = [stack('stone', 64), stack('stone', 64), stack('stone', 64)];
    const thirdItems = [stack('stone', 64)];
    for (const [pos, items] of [[second, secondItems], [third, thirdItems]]) {
      bot.setBlock(pos, 'chest');
      bot.setChestSize(pos, 27, items);
    }
    const taken = [];
    const click = bot.clickWindow;
    bot.clickWindow = async (slot, button, mode) => {
      const window = bot.currentWindow;
      if (window.stored && slot < window.inventoryStart) {
        taken.push(window.stored === secondItems ? 'second' : window.stored === thirdItems ? 'third' : 'first');
      }
      return click(slot, button, mode);
    };
    const trader = createTrader({ idleIntervalMs: 60_000 });
    trader.attachBot(bot);
    await trader.scan();
    trader.configure({ sources: [SOURCE, third, second], output: OUTPUT });
    // A hopper fills the third one after the bot last looked: it is looked into again
    for (let added = 0; added < 5; added += 1) thirdItems[thirdItems.findIndex(entry => !entry)] = stack('stone', 64);
    trader.start();
    await until(() => villager.trades[0].nbTradeUses === 450 && trader.getStatus().phase !== 'restocking', 'all sold', 4000);
    const firstVisit = [...new Set(taken)];
    assert.deepEqual(firstVisit.slice(0, 2), ['third', 'second'], `fullest first: ${taken}`);
    assert.equal(taken.filter(entry => entry === 'first').length, 0, 'the nearly empty one was not needed');
    trader.dispose();
  });

  await test('one trip takes 18 stacks, keeps 9 slots free, and serves every villager in one go', async () => {
    const at = [[2.5, 64, 0.5], [-1.5, 64, 0.5], [0.5, 64, 2.5], [0.5, 64, -1.5], [1.5, 64, 1.5]];
    const villagers = at.map(position => ({ at: position, trades: [rawTrade('stone', 20, 'emerald', 1)] }));
    const lines = [];
    const { bot, trader } = await ready({
      source: Array.from({ length: 27 }, () => stack('stone', 64)),
      villagers
    }, { log: message => lines.push(message) });
    let mostStacks = 0;
    let fewestFree = 36;
    let sourceOpens = 0;
    let villagerOpens = 0;
    let returnClicks = 0;
    const click = bot.clickWindow;
    bot.clickWindow = async (slot, button, mode) => {
      const window = bot.currentWindow;
      if (window.stored && window.stored === bot.contents.get(`${SOURCE.x},${SOURCE.y},${SOURCE.z}`) && slot >= window.inventoryStart) returnClicks += 1;
      return click(slot, button, mode);
    };
    const working = () => trader.getStatus().phase !== 'waiting';
    const activateEntity = bot.activateEntity;
    bot.activateEntity = async entity => {
      if (working()) villagerOpens += 1;
      mostStacks = Math.max(mostStacks, bot.inventory.items().filter(entry => entry.name === 'stone').length);
      fewestFree = Math.min(fewestFree, bot.inventory.emptySlotCount());
      return activateEntity(entity);
    };
    const activateBlock = bot.activateBlock;
    bot.activateBlock = async block => {
      if (block.position.x === SOURCE.x && working()) sourceOpens += 1;
      return activateBlock(block);
    };
    trader.start();
    await until(() => villagers.every(villager => villager.trades[0].nbTradeUses === 16) && trader.getStatus().phase === 'waiting', 'all sold', 8000);
    assert.equal(mostStacks, 18, 'a trip carries 18 stacks');
    assert.ok(fewestFree >= 9, `9 slots stay free, saw ${fewestFree}`);
    // One look at the start, a visit to take per trip, and the rest back at the end
    assert.ok(sourceOpens <= 5, `the chests are not read between trips: ${sourceOpens}`);
    assert.ok(returnClicks <= 1, `the last stack goes back once, after the last trip: ${returnClicks}`);
    // Five to read the offers once, then only the six visits that trade
    assert.ok(villagerOpens <= 11, `the villagers are not asked again between trips: ${villagerOpens}`);
    assert.equal(bot.outputItems().find(entry => entry.name === 'emerald_block').count, 8, '80 trades make 8 blocks');
    assert.equal(bot.count('emerald'), 8);
    assert.equal(bot.count('stone'), 0, 'what is left goes back');
    assert.equal(bot.sourceItems().reduce((sum, entry) => sum + entry.count, 0), 27 * 64 - 1600);
    assert.ok(lines.some(line => /Trip: took 1152 items, made \d+ trades in/.test(line)), 'the log tells how a trip went');
    assert.deepEqual(bot.dropped, []);
    trader.dispose();
  });

  await test('what a trip leaves pays for the next one instead of going back to the chest', async () => {
    const villagers = [[2.5, 64, 0.5], [-1.5, 64, 0.5]].map(at => ({ at, trades: [rawTrade('stone', 7, 'emerald', 1, { maximumNbTradeUses: 10 })] }));
    const lines = [];
    // Each villager takes 70 stone: 64 + 64 leaves 58 after the first, which with
    // the stack still in the chest is enough for the second
    const { bot, trader } = await ready({ source: [stack('stone', 64), stack('stone', 64), stack('stone', 64)], villagers }, { log: message => lines.push(message) });
    const back = [];
    const click = bot.clickWindow;
    bot.clickWindow = async (slot, button, mode) => {
      const window = bot.currentWindow;
      if (window.stored && slot >= window.inventoryStart) back.push(window.slots[slot]?.name);
      return click(slot, button, mode);
    };
    trader.start();
    await until(() => villagers.every(villager => villager.trades[0].nbTradeUses === 10) && trader.getStatus().phase === 'waiting', 'all sold');
    assert.equal(bot.count('stone'), 0);
    assert.equal(bot.sourceItems().reduce((sum, entry) => sum + entry.count, 0), 3 * 64 - 140);
    assert.equal(back.filter(name => name === 'stone').length, 1, 'once, when nothing is left to sell');
    trader.dispose();
  });

  await test('emeralds the bot earned stay out of a purchase, though leftovers of other inputs are used', async () => {
    const villager = { trades: [rawTrade('emerald', 2, 'bread', 1, { maximumNbTradeUses: 2 })] };
    const { bot, trader } = await ready({
      inventory: [stack('emerald', 8)],
      source: [stack('emerald', 10)],
      villagers: [villager]
    });
    trader.configure({ tradeChoices: { 'emerald+>bread': true } });
    trader.start();
    await until(() => villager.trades[0].nbTradeUses === 2 && trader.getStatus().phase === 'waiting', 'bought');
    assert.equal(bot.outputItems().find(entry => entry.name === 'bread').count, 2);
    assert.equal(bot.crafts, 0, 'nothing bought with is crafted');
    trader.dispose();
  });

  await test('no blind pauses: a whole round takes a fraction of what the old waits would', async () => {
    const villager = { trades: [rawTrade('paper', 1, 'emerald', 1, { maximumNbTradeUses: 20 })] };
    const bot = fakeBot({ source: [stack('paper', 64)], villagers: [villager] });
    const trader = createTrader({ settleMs: 1500, idleIntervalMs: 60_000 });
    trader.attachBot(bot);
    await trader.scan();
    trader.configure({ sources: [SOURCE], output: OUTPUT });
    const startedAt = Date.now();
    trader.start();
    await until(() => bot.outputItems().find(entry => entry.name === 'emerald_block')?.count === 2, 'two blocks', 2500);
    assert.ok(Date.now() - startedAt < 1200, `took ${Date.now() - startedAt} ms with a 1500 ms fallback pause`);
    assert.ok(bot.syncs > 0, 'it asks the server instead');
    trader.dispose();
  });

  await test('a chest emptied behind the bot\'s back is no error, and it notices', async () => {
    const villager = { trades: [rawTrade('paper', 1, 'emerald', 1)] };
    const { bot, trader } = await ready({ source: [stack('paper', 64)], villagers: [villager] }, { idleIntervalMs: 30 });
    const activateEntity = bot.activateEntity;
    bot.activateEntity = async entity => {
      // Between reading the chest and going back for the paper
      bot.contents.get(`${SOURCE.x},${SOURCE.y},${SOURCE.z}`).length = 0;
      return activateEntity(entity);
    };
    trader.start();
    await until(() => trader.getStatus().phase === 'waiting_stock', 'waiting');
    assert.equal(villager.trades[0].nbTradeUses, 0);
    assert.equal(trader.getStatus().lastErrorMessage, null);
    await until(() => (trader.getStatus().stock.paper || 0) === 0, 'it knows the chest is empty');
    trader.dispose();
  });

  await test('chests filled later are picked up, and a new price is seen when the villager is opened', async () => {
    const villager = { trades: [rawTrade('paper', 2, 'emerald', 1, { maximumNbTradeUses: 3 })] };
    const { bot, trader } = await ready({ villagers: [villager] }, { idleIntervalMs: 20 });
    trader.start();
    await until(() => trader.getStatus().phase === 'waiting_stock', 'nothing to sell yet');
    bot.contents.get(`${SOURCE.x},${SOURCE.y},${SOURCE.z}`)[0] = stack('paper', 64);
    villager.trades[0].inputItem1.itemCount = 4;
    await until(() => villager.trades[0].nbTradeUses === 3, 'sold after the chest was read again');
    await until(() => bot.sourceItems()[0]?.count === 64 - 12, 'at the new price');
    trader.dispose();
  });

  await test('with too few free slots it says so and trades nothing until there is room', async () => {
    const villager = { trades: [rawTrade('stone', 20, 'emerald', 1, { maximumNbTradeUses: 1 })] };
    const { bot, trader } = await ready({
      inventory: Array.from({ length: 30 }, () => stack('dirt', 64)),
      source: [stack('stone', 64)],
      villagers: [villager]
    });
    trader.start();
    await until(() => /No room to take resources: 6 free slots, and 9 stay free/.test(trader.getStatus().lastErrorMessage || ''), 'the message');
    assert.equal(villager.trades[0].nbTradeUses, 0);
    assert.equal(trader.getStatus().enabled, true);
    for (let slot = 9; slot < 13; slot += 1) bot.slots[slot] = null;
    await until(() => villager.trades[0].nbTradeUses === 1, 'trading with room');
    trader.dispose();
  });

  await test('sells from the source, crafts blocks, and keeps the leftover emeralds and its own gear', async () => {
    const villager = { trades: [rawTrade('paper', 1, 'emerald', 1, { maximumNbTradeUses: 20 })] };
    const { bot, trader } = await ready({
      inventory: [stack('diamond_sword', 1), stack('bread', 5)],
      source: [stack('paper', 64)],
      villagers: [villager]
    });
    trader.start();
    await until(() => trader.getStatus().sessionBlocks === 2 && bot.outputItems().length === 1, 'blocks in the output');
    await until(() => trader.getStatus().phase === 'waiting', 'waiting for a restock');
    assert.deepEqual(bot.outputItems().map(entry => [entry.name, entry.count]), [['emerald_block', 2]]);
    assert.equal(villager.trades[0].nbTradeUses, 20);
    assert.equal(bot.count('emerald'), 2, 'fewer than nine emeralds wait');
    assert.equal(bot.count('diamond_sword'), 1);
    assert.equal(bot.count('bread'), 5);
    assert.equal(bot.count('paper'), 0, 'unused paper went back');
    assert.deepEqual(bot.sourceItems().map(entry => [entry.name, entry.count]), [['paper', 44]]);
    assert.equal(trader.getStatus().sessionTrades, 20);
    assert.equal(trader.getStatus().stock.paper, 44);
    assert.deepEqual(bot.dropped, []);
    trader.dispose();
  });

  await test('trades chosen off are skipped and buying needs a choice; results go to the output', async () => {
    const villager = { trades: [rawTrade('paper', 1, 'emerald', 1), rawTrade('emerald', 1, 'bread', 2, { maximumNbTradeUses: 4 })] };
    const { bot, trader } = await ready({
      source: [stack('paper', 32), stack('emerald', 32)],
      villagers: [villager]
    });
    trader.configure({ tradeChoices: { 'paper+>emerald': false } });
    trader.start();
    await until(() => trader.getStatus().phase === 'waiting', 'first round');
    assert.equal(villager.trades[0].nbTradeUses, 0, 'switched off');
    assert.equal(villager.trades[1].nbTradeUses, 0, 'not chosen');
    assert.equal(bot.written.includes('select_trade'), false);

    trader.configure({ tradeChoices: { 'emerald+>bread': true } });
    await until(() => villager.trades[1].nbTradeUses === 4 && trader.getStatus().phase === 'waiting', 'the chosen trade');
    assert.deepEqual(bot.outputItems().map(entry => [entry.name, entry.count]), [['bread', 8]]);
    assert.equal(bot.crafts, 0, 'emeralds taken for a purchase are never crafted');
    assert.equal(bot.count('emerald'), 0, 'the rest went back to the source');
    assert.equal(bot.sourceItems().find(entry => entry.name === 'emerald').count, 28);
    trader.dispose();
  });

  await test('a villager that refuses is skipped without leaving listeners, and the others trade', async () => {
    const asleep = { refuses: true, at: [1.5, 64, 0.5], trades: [rawTrade('paper', 1, 'emerald', 1)] };
    const awake = { at: [0.5, 64, 2.1], trades: [rawTrade('paper', 1, 'emerald', 1, { maximumNbTradeUses: 3 })] };
    const { bot, trader } = await ready({ source: [stack('paper', 10)], villagers: [asleep, awake] });
    trader.start();
    await until(() => awake.trades[0].nbTradeUses === 3, 'the awake villager');
    await until(() => trader.getStatus().phase === 'waiting', 'waiting');
    assert.equal(asleep.trades[0].nbTradeUses, 0);
    trader.stop({ flush: false });
    await wait(80);
    assert.equal(bot._client.listenerCount('trade_list'), 0);
    assert.equal(bot.listenerCount('windowOpen'), 0);
    assert.equal(trader.getStatus().lastErrorMessage, null);
    trader.dispose();
  });

  await test('a bot moved off its spot does not walk or trade, and goes on when it is back', async () => {
    const villager = { trades: [rawTrade('paper', 1, 'emerald', 1, { maximumNbTradeUses: 2 })] };
    const { bot, trader } = await ready({ source: [stack('paper', 10)], villagers: [villager] });
    bot.entity.position = new Vec3(5.5, 64, 5.5);
    let goals = 0;
    bot.pathfinder = { goto: async () => { goals += 1; }, setGoal: () => { goals += 1; } };
    trader.start();
    await until(() => /left its spot/.test(trader.getStatus().lastErrorMessage || ''), 'the error');
    assert.equal(villager.trades[0].nbTradeUses, 0);
    assert.equal(goals, 0, 'the pathfinder is never used');
    assert.equal(trader.getStatus().enabled, true, 'it does not turn itself off');
    bot.entity.position = new Vec3(0.5, 64, 0.5);
    await until(() => villager.trades[0].nbTradeUses === 2, 'trading after coming back');
    await until(() => trader.getStatus().lastErrorMessage === null, 'the error clears');
    trader.dispose();
  });

  await test('a full output chest holds the trades until it has room', async () => {
    const villager = { trades: [rawTrade('paper', 1, 'emerald', 1, { maximumNbTradeUses: 9 })] };
    const filler = Array.from({ length: 27 }, () => stack('dirt', 64));
    const { bot, trader } = await ready({
      inventory: [stack('emerald_block', 3)],
      source: [stack('paper', 20)],
      output: filler,
      villagers: [villager]
    });
    trader.start();
    await until(() => trader.getStatus().outputFull, 'seen full');
    assert.equal(villager.trades[0].nbTradeUses, 0);
    assert.equal(trader.getStatus().enabled, true);
    assert.equal(bot.count('emerald_block'), 3);
    bot.freeOutputSlot();
    await until(() => villager.trades[0].nbTradeUses === 9, 'trading resumes');
    await until(() => bot.outputItems().find(entry => entry.name === 'emerald_block')?.count === 4, 'all four blocks delivered');
    assert.equal(trader.getStatus().outputFull, false);
    assert.equal(bot.count('emerald_block'), 0);
    assert.deepEqual(bot.dropped, []);
    trader.dispose();
  });

  await test('a full inventory never drops a crafted block: the products go to the output first', async () => {
    const full = [stack('emerald', 9), ...Array.from({ length: 34 }, () => stack('dirt', 64)), stack('emerald_block', 64)];
    const { bot, trader } = await ready({ inventory: full });
    bot.entities = { 1: { id: 1, uuid: 'v', name: 'villager', position: new Vec3(1.5, 64, 1.5), villager: { trades: [] } } };
    trader.start();
    await until(() => bot.crafts === 1, 'the craft');
    await until(() => bot.outputItems().reduce((sum, entry) => sum + entry.count, 0) === 65, 'all blocks delivered');
    assert.deepEqual(bot.dropped, []);
    trader.dispose();
  });

  await test('turning it off puts the waiting emeralds into the output; going offline keeps them', async () => {
    const villager = { trades: [rawTrade('paper', 1, 'emerald', 1, { maximumNbTradeUses: 4 })] };
    const { bot, trader } = await ready({ source: [stack('paper', 10)], villagers: [villager] });
    trader.start();
    await until(() => villager.trades[0].nbTradeUses === 4 && trader.getStatus().phase === 'waiting', 'the trades');
    assert.equal(bot.count('emerald'), 4);
    trader.detachBot();
    assert.equal(bot.count('emerald'), 4, 'going offline keeps them');
    assert.equal(trader.getStatus().enabled, true);

    trader.attachBot(bot);
    trader.onSpawn(bot);
    await until(() => trader.getStatus().running && trader.getStatus().phase === 'waiting', 'back after a reconnect');
    trader.stop();
    assert.equal(trader.getStatus().enabled, false);
    await until(() => bot.count('emerald') === 0, 'the emeralds leave');
    assert.deepEqual(bot.outputItems().map(entry => [entry.name, entry.count]), [['emerald', 4]]);
    trader.dispose();
  });

  await test('stopping in the middle of a trip crafts what it can: only the rest goes in as emeralds', async () => {
    const { bot, trader } = await ready({
      inventory: [stack('emerald', 20)],
      villagers: [{ trades: [rawTrade('paper', 1, 'emerald', 1)] }]
    });
    trader.start();
    trader.stop();
    await until(() => bot.count('emerald') === 0 && bot.count('emerald_block') === 0 && bot.outputItems().length === 2, 'all delivered');
    const inChest = Object.fromEntries(bot.outputItems().map(entry => [entry.name, entry.count]));
    assert.deepEqual(inChest, { emerald: 2, emerald_block: 2 });
    trader.dispose();
  });

  await test('stopping without a crafting table still empties the inventory, and logs why', async () => {
    const lines = [];
    const { bot, trader } = await ready({
      inventory: [stack('emerald', 18)],
      villagers: [{ trades: [rawTrade('paper', 1, 'emerald', 1)] }]
    }, { log: (message, level) => lines.push([level, message]) });
    bot.setBlock(TABLE, 'air');
    trader.start();
    trader.stop();
    await until(() => bot.count('emerald') === 0, 'emptied');
    assert.deepEqual(bot.outputItems().map(entry => [entry.name, entry.count]), [['emerald', 18]]);
    assert.ok(lines.some(([level, message]) => level === 'warn' && /Could not craft the last emeralds/.test(message)));
    trader.dispose();
  });

  await test('start and configure explain what is wrong; the scan needs it stopped', async () => {
    const bot = fakeBot();
    const trader = createTrader();
    assert.throws(() => trader.start(), /no spot/);
    await assert.rejects(trader.scan(), /offline/);
    trader.attachBot(bot);
    await trader.scan();
    assert.throws(() => trader.start(), /source chest/);
    assert.throws(() => trader.configure({ sources: [SOURCE], output: SOURCE }), /cannot be a source/);
    assert.throws(() => trader.configure({ sources: [{ x: 1.5, y: 2, z: 3 }] }), /block positions/);
    trader.configure({ sources: [SOURCE] });
    assert.throws(() => trader.start(), /output chest/);
    trader.configure({ output: OUTPUT });
    trader.start();
    await assert.rejects(trader.scan(), /Stop the Trader/);
    trader.dispose();
  });

  await test('another module taking over stops it at once and leaves the inventory alone', async () => {
    const villager = { trades: [rawTrade('paper', 1, 'emerald', 1, { maximumNbTradeUses: 4 })] };
    const { bot, trader } = await ready({ source: [stack('paper', 10)], villagers: [villager] });
    trader.start();
    await until(() => villager.trades[0].nbTradeUses === 4 && trader.getStatus().phase === 'waiting', 'the trades');
    const opened = [];
    const activate = bot.activateBlock;
    bot.activateBlock = async block => {
      opened.push(block.name);
      return activate(block);
    };
    trader.stop({ flush: false });
    await wait(30);
    assert.deepEqual(opened, [], 'no window opens after the takeover');
    assert.equal(bot.count('emerald'), 4);
    assert.equal(trader.getStatus().enabled, false);
    trader.dispose();
  });

  await test('everything is said through the log, one line per problem, and never in the chat', async () => {
    const lines = [];
    const log = (message, level = 'info') => lines.push({ message, level });
    const villager = { trades: [rawTrade('paper', 1, 'emerald', 1, { maximumNbTradeUses: 9 })] };
    const filler = Array.from({ length: 27 }, () => stack('dirt', 64));
    const { bot, trader } = await ready({
      inventory: [stack('emerald_block', 1)],
      source: [stack('paper', 20)],
      output: filler,
      villagers: [villager]
    }, { log });
    trader.start();
    await until(() => trader.getStatus().outputFull, 'seen full');
    await wait(60);
    const full = lines.filter(line => /output chest is full/.test(line.message));
    assert.equal(full.length, 1, 'a problem retried many times is logged once');
    assert.equal(full[0].level, 'warn');

    bot.freeOutputSlot();
    await until(() => villager.trades[0].nbTradeUses === 9, 'trading resumes');
    await until(() => lines.some(line => /Crafted 1 emerald block/.test(line.message)), 'the craft is logged');
    assert.ok(lines.some(line => /Working again/.test(line.message)));
    assert.ok(lines.some(line => /9 x paper\+>emerald/.test(line.message)));
    trader.stop();
    assert.ok(lines.some(line => /Stopped/.test(line.message)));
    await until(() => trader.getStatus().phase === 'idle', 'stopped');
    trader.dispose();
    assert.deepEqual(chatMessages, [], 'nothing reached the game chat');
  });

  await test('the setup, the choices and the totals survive a restart', async () => {
    const stateFile = path.join(os.tmpdir(), `trader-test-${process.pid}.json`);
    fs.rmSync(stateFile, { force: true });
    try {
      const villager = { trades: [rawTrade('paper', 1, 'emerald', 1, { maximumNbTradeUses: 9 })] };
      const { trader } = await ready({ source: [stack('paper', 20)], villagers: [villager] }, { stateFile });
      trader.configure({ tradeChoices: { 'a+>b': true } });
      trader.start();
      await until(() => trader.getStatus().totalBlocks === 1, 'a block');
      trader.dispose();

      const reloaded = createTrader({ stateFile });
      const status = reloaded.getStatus();
      assert.equal(status.enabled, true);
      assert.deepEqual(status.sources, [SOURCE]);
      assert.deepEqual(status.output, OUTPUT);
      assert.deepEqual(status.craftingTable, TABLE);
      assert.equal(status.totalBlocks, 1);
      assert.equal(status.totalTrades, 9);
      assert.equal(status.villagers[0].offers[0].key, 'paper+>emerald');
      assert.equal(status.running, false, 'it waits for a spawn');
      reloaded.dispose();
    } finally {
      fs.rmSync(stateFile, { force: true });
    }
  });

  await test('a broken state file is kept aside, and a save never leaves half a file', async () => {
    const stateFile = path.join(os.tmpdir(), `trader-broken-${process.pid}.json`);
    const cleanup = () => ['', '.broken', '.tmp'].forEach(suffix => fs.rmSync(stateFile + suffix, { force: true }));
    cleanup();
    try {
      const broken = '{"enabled": true, "sources": [';
      fs.writeFileSync(stateFile, broken, 'utf8');
      const lines = [];
      const trader = createTrader({ stateFile, log: message => lines.push(message) });
      assert.equal(trader.getStatus().enabled, false, 'it starts empty');
      assert.equal(fs.readFileSync(`${stateFile}.broken`, 'utf8'), broken, 'the unreadable file is kept');
      assert.ok(lines.some(line => /could not be read/.test(line)), 'and the log says so');
      trader.configure({ sources: [SOURCE] });
      assert.deepEqual(JSON.parse(fs.readFileSync(stateFile, 'utf8')).sources, [SOURCE]);
      assert.equal(fs.existsSync(`${stateFile}.tmp`), false, 'the temporary file is renamed over the state');
      trader.dispose();
    } finally {
      cleanup();
    }
  });

  await test('a villager gone since the scan is marked and no longer decides what the bot waits for', async () => {
    const stays = { trades: [rawTrade('wheat', 1, 'emerald', 1)] };
    const leaves = { uuid: 'leaves', at: [0.5, 64, 2.1], trades: [rawTrade('paper', 1, 'emerald', 1)] };
    const { bot, trader } = await ready({ source: [stack('paper', 10)], villagers: [stays, leaves] });
    delete bot.entities[leaves.entity.id];
    const villagers = trader.getStatus().villagers;
    assert.equal(villagers.find(entry => entry.id === 'leaves').inReach, false);
    assert.equal(villagers.find(entry => entry.id === 'villager-0').inReach, true);
    trader.start();
    // The paper only the missing villager took cannot pay for anything: the
    // chests are watched, not the villagers
    await until(() => trader.getStatus().phase === 'waiting_stock', 'waiting for the sources');
    assert.equal(leaves.trades[0].nbTradeUses, 0);
    trader.stop({ flush: false });
    trader.dispose();
  });

  await test('the cheapest villager gets the stock first, and the uses shown follow the trades', async () => {
    const dear = { uuid: 'dear', at: [1.5, 64, 0.5], trades: [rawTrade('paper', 5, 'emerald', 1)] };
    const cheap = { uuid: 'cheap', at: [0.5, 64, 2.1], trades: [rawTrade('paper', 2, 'emerald', 1, { maximumNbTradeUses: 3 })] };
    const { trader } = await ready({ source: [stack('paper', 6)], villagers: [dear, cheap] });
    trader.start();
    await until(() => cheap.trades[0].nbTradeUses === 3, 'the cheap villager');
    await until(() => trader.getStatus().phase.startsWith('waiting'), 'done');
    assert.equal(dear.trades[0].nbTradeUses, 0, 'nothing was left for the dear one');
    const shown = trader.getStatus().villagers.find(entry => entry.id === 'cheap').offers[0];
    assert.equal(shown.uses, 3, 'the site sees the uses after the trades, not before');
    trader.stop({ flush: false });
    trader.dispose();
  });

  await test('trades spending emeralds share one trip to the sources', async () => {
    const lines = [];
    const first = { uuid: 'first', trades: [rawTrade('emerald', 1, 'bread', 1, { maximumNbTradeUses: 2 })] };
    const second = { uuid: 'second', at: [0.5, 64, 2.1], trades: [rawTrade('emerald', 1, 'bread', 1, { maximumNbTradeUses: 2 })] };
    const { bot, trader } = await ready({ source: [stack('emerald', 20)], villagers: [first, second] }, { log: message => lines.push(message) });
    trader.configure({ tradeChoices: { 'emerald+>bread': true } });
    trader.start();
    await until(() => first.trades[0].nbTradeUses === 2 && second.trades[0].nbTradeUses === 2, 'both villagers');
    await until(() => trader.getStatus().phase.startsWith('waiting'), 'done');
    assert.equal(lines.filter(line => /Trip: took/.test(line)).length, 1, 'one trip for both');
    assert.equal(bot.sourceItems().find(entry => entry.name === 'emerald').count, 16);
    trader.stop({ flush: false });
    trader.dispose();
  });

  await test('without a crafting table it starts, and the emeralds go to the output as they are', async () => {
    const villager = { trades: [rawTrade('paper', 1, 'emerald', 1, { maximumNbTradeUses: 10 })] };
    const bot = fakeBot({ source: [stack('paper', 20)], villagers: [villager] });
    bot.setBlock(TABLE, 'air');
    const trader = createTrader();
    trader.attachBot(bot);
    await trader.scan();
    trader.configure({ sources: [SOURCE], output: OUTPUT });
    assert.equal(trader.getStatus().craftingTable, null);
    trader.start();
    await until(() => villager.trades[0].nbTradeUses === 10, 'the trades');
    await until(() => bot.outputItems().some(entry => entry.name === 'emerald' && entry.count === 10), 'stored');
    assert.equal(bot.crafts, 0);
    assert.equal(bot.count('emerald'), 0);
    trader.stop({ flush: false });
    trader.dispose();
  });

  await test('stopping in the middle of a purchase returns the emeralds taken to pay', async () => {
    const villager = { trades: [rawTrade('emerald', 1, 'bread', 1)] };
    const { bot, trader } = await ready({ source: [stack('emerald', 20)], villagers: [villager] });
    trader.configure({ tradeChoices: { 'emerald+>bread': true } });
    let opens = 0;
    const activate = bot.activateEntity;
    // The first open reads the offers; the second is the trade, which the stop cuts short
    bot.activateEntity = async entity => {
      opens += 1;
      if (opens === 2) {
        setImmediate(() => trader.stop());
        return;
      }
      return activate(entity);
    };
    trader.start();
    await until(() => opens >= 2 && trader.getStatus().phase === 'idle' && !trader.getStatus().running, 'stopped');
    await until(() => bot.sourceItems().some(entry => entry.name === 'emerald' && entry.count === 20), 'back in the source');
    assert.equal(bot.count('emerald'), 0);
    assert.deepEqual(bot.outputItems().filter(entry => /emerald/.test(entry.name)), [], 'nothing taken passes for earned');
    assert.equal(bot.crafts, 0);
    trader.dispose();
  });
}

main().then(() => {
  assert.deepEqual(chatMessages, [], 'nothing reached the game chat in any test');
  console.log('trader tests passed');
  process.exit(0);
}).catch(error => {
  console.error(error);
  process.exit(1);
});
