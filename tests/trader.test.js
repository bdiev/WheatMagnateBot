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

const fast = { settleMs: 0, idleIntervalMs: 40, retryDelayMs: 10, supplyRetryDelayMs: 10, merchantTimeoutMs: 60, containerTimeoutMs: 60 };
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
  return { name, count, type: registry.itemsByName[name].id, stackSize: registry.itemsByName[name].stackSize, ...extra };
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

  bot.activateBlock = async block => {
    const key = `${block.position.x},${block.position.y},${block.position.z}`;
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

  client.write = (name, data) => {
    bot.written.push(name);
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
    assert.equal(mode, 1, 'stacks are moved with a shift-click');
    const window = bot.currentWindow;
    if (window.type === 'minecraft:merchant') {
      assert.equal(slot, 2, 'only the result slot is clicked in a merchant window');
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
}

main().then(() => {
  assert.deepEqual(chatMessages, [], 'nothing reached the game chat in any test');
  console.log('trader tests passed');
  process.exit(0);
}).catch(error => {
  console.error(error);
  process.exit(1);
});
