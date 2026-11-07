'use strict';

/**
 * Trader: the bot stands on one spot and sells resources to the villagers
 * around it. It never walks: chests, the crafting table and the villagers all
 * have to be within reach of that spot.
 *
 *   1. Scan: from the spot, finds the chests, the crafting table and the
 *      villagers in reach and reads what each villager offers. The site then
 *      marks the chests as sources or the output, and picks the trades
 *   2. Each round reads the source chests and the villagers, then makes one trip:
 *      up to 18 stacks of what all enabled trades need are taken at once, nine
 *      slots stay free for the results, the villagers are served one after
 *      another, and what is left goes back to the sources in one go. Trades
 *      spending emeralds get a trip of their own, so they use the emeralds from
 *      the sources and not the ones just earned
 *   3. Every nine emeralds become an emerald block at the crafting table. The
 *      blocks and the results of other trades go into the output chest. Fewer
 *      than nine emeralds wait in the inventory for the next round, and go into
 *      the output chest when the trader is turned off
 *   4. With nothing to trade it looks again every five minutes, since villagers
 *      restock on their own
 *
 * Chests and villagers are only ever used with shift-clicks. The server refused
 * cursor drags in chests, and mineflayer's bot.trade carries the result on the
 * cursor and throws it on the ground when the inventory is full; a shift-click on
 * the result slot repeats the trade on the server and stops by itself when there
 * is no room. The crafting table takes one drag, see craftByDrag.
 *
 * It never stops on its own: every error is shown and retried. It never writes
 * to the game chat: everything it has to say goes to the log.
 */

const fs = require('node:fs');
const path = require('node:path');
const { Vec3 } = require('vec3');
const { STORAGE_REACH, containerInteraction, sendContainerClick } = require('../../minecraft/container-interaction');

const STORAGE_BLOCKS = new Set(['chest', 'trapped_chest', 'barrel']);
const TABLE_BLOCK = 'crafting_table';
const VILLAGER = 'villager';
const EMERALD = 'emerald';
const EMERALD_BLOCK = 'emerald_block';
const EMERALDS_PER_BLOCK = 9;
const CRAFT_RESULT_SLOT = 0;
const CRAFT_GRID_SLOTS = [1, 2, 3, 4, 5, 6, 7, 8, 9];
const DOUBLE_CHEST_SLOTS = 54;
// From the eye to the nearest point of the villager. The server takes up to six
// blocks (the reach of 3 plus its margin of 3); a little less, as villagers move
const VILLAGER_REACH = 5.5;
const MAX_SOURCES = 16;
// One trip to the sources takes at most this many stacks, and leaves this many
// slots free for the results: nine stacks of emeralds make 64 blocks
const MAX_STACKS_PER_TRIP = 18;
const RESERVED_FREE_SLOTS = 9;
// The server sends the whole result of a shift-click in one tick
const TRADE_SETTLE_MS = 50;
// mineflayer's craft is one click per emerald, each waiting for the server, so it
// is only the fallback for a server refusing the fast way; it goes in batches
const MAX_CRAFTS_PER_BATCH = 16;
const CRAFT_TIMEOUT_BASE_MS = 30_000;
const CRAFT_TIMEOUT_PER_CRAFT_MS = 10_000;
const CLICK_TIMEOUT_MS = 5_000;
const SLOT_READY_TIMEOUT_MS = 2_000;
const IDLE_INTERVAL_MS = 5 * 60_000;
const RETRY_DELAY_MS = 2_000;
const SUPPLY_RETRY_DELAY_MS = 30_000;
const VILLAGER_COOLDOWN_MS = 60_000;
const CONTAINER_TIMEOUT_MS = 5_000;
// A sleeping or busy villager just doesn't answer
const MERCHANT_TIMEOUT_MS = 5_000;
// Results reach the inventory a tick or two after a click or a closed window
const SETTLE_MS = 300;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function withTimeout(promise, ms, message) {
  let timer = null;
  return Promise.race([
    promise,
    new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(message)), ms); })
  ]).finally(() => clearTimeout(timer));
}

function supplyError(message) {
  return Object.assign(new Error(message), { code: 'TRADER_SUPPLY' });
}

function positionKey(pos) {
  return `${pos.x},${pos.y},${pos.z}`;
}

function validPosition(pos) {
  return Boolean(pos) && [pos.x, pos.y, pos.z].every(Number.isInteger);
}

function plainPosition(pos) {
  return { x: pos.x, y: pos.y, z: pos.z };
}

function samePosition(a, b) {
  return Boolean(a && b) && a.x === b.x && a.y === b.y && a.z === b.z;
}

// A trade is known by its items: its place in the list shifts when the villager
// levels up
function tradeKey(input1, input2, output) {
  return `${input1}+${input2 || ''}>${output}`;
}

// Only ordinary stacks are traded: no enchanted, named or damaged items
function isPlainItem(item) {
  if (!item || item.nbt || item.components?.length) return false;
  return !(Number(item.durabilityUsed) > 0);
}

function hasAddedComponents(raw) {
  return Number(raw?.addedComponentCount) > 0 || (Array.isArray(raw?.components) && raw.components.length > 0);
}

// The price a villager really asks, as the client works it out from demand and
// reputation; the same sum as in mineflayer's villager plugin
function realPrice(trade, input1) {
  if (trade.demand === undefined || trade.specialPrice === undefined) return input1.count;
  const demandExtra = Math.max(0, Math.floor(input1.count * trade.demand * trade.priceMultiplier));
  return Math.min(Math.max(input1.count + trade.specialPrice + demandExtra, 1), input1.stackSize || 64);
}

// The trade_list packet as offers. The fields named as in mineflayer's villager
// plugin are the ones its window handling reads from window.selectedTrade
function parseOffers(Item, packet) {
  return (packet?.trades || []).map((trade, index) => {
    const inputItem1 = Item.fromNotch(trade.inputItem1);
    const hasItem2 = Boolean(trade.inputItem2 && Number(trade.inputItem2.itemCount) > 0);
    const inputItem2 = hasItem2 ? Item.fromNotch(trade.inputItem2) : null;
    const outputItem = Item.fromNotch(trade.outputItem);
    if (!inputItem1 || !outputItem) return null;
    const price = realPrice(trade, inputItem1);
    return {
      index,
      key: tradeKey(inputItem1.name, inputItem2?.name, outputItem.name),
      inputItem1,
      inputItem2,
      hasItem2,
      outputItem,
      realPrice: price,
      price2: inputItem2?.count || 0,
      outputCount: outputItem.count,
      uses: Number(trade.nbTradeUses) || 0,
      maxUses: Number(trade.maximumNbTradeUses) || 0,
      tradeDisabled: Boolean(trade.tradeDisabled),
      // Enchanted books and the like are left out, on either side of the trade:
      // only ordinary stacks are counted and moved
      plain: ![trade.inputItem1, trade.inputItem2, trade.outputItem].some(hasAddedComponents)
    };
  }).filter(Boolean);
}

// How many times the trade can run from the stock in the sources
function usesFromStock(offer, stock) {
  if (offer.tradeDisabled || !offer.plain) return 0;
  const left = offer.maxUses - offer.uses;
  if (left <= 0 || offer.realPrice <= 0) return 0;
  let uses = Math.min(left, Math.floor((stock.get(offer.inputItem1.name) || 0) / offer.realPrice));
  if (offer.hasItem2) uses = Math.min(uses, Math.floor((stock.get(offer.inputItem2.name) || 0) / offer.price2));
  return Math.max(0, uses);
}

function createTrader({
  stateFile = null, log = () => {}, onChange = () => {},
  containerTimeoutMs = CONTAINER_TIMEOUT_MS, merchantTimeoutMs = MERCHANT_TIMEOUT_MS,
  idleIntervalMs = IDLE_INTERVAL_MS, retryDelayMs = RETRY_DELAY_MS, supplyRetryDelayMs = SUPPLY_RETRY_DELAY_MS,
  villagerCooldownMs = VILLAGER_COOLDOWN_MS, settleMs = SETTLE_MS
} = {}) {
  const saved = loadState();
  const desired = {
    enabled: Boolean(saved.enabled),
    anchor: validPosition(saved.anchor) ? plainPosition(saved.anchor) : null,
    sources: Array.isArray(saved.sources) ? saved.sources.filter(validPosition).map(plainPosition).slice(0, MAX_SOURCES) : [],
    output: validPosition(saved.output) ? plainPosition(saved.output) : null,
    craftingTable: validPosition(saved.craftingTable) ? plainPosition(saved.craftingTable) : null,
    // What the site chose per trade; a trade without a choice follows defaultEnabled
    tradeChoices: saved.tradeChoices && typeof saved.tradeChoices === 'object' ? { ...saved.tradeChoices } : {}
  };
  let totalTrades = Math.max(0, Number(saved.totalTrades) || 0);
  let totalBlocks = Math.max(0, Number(saved.totalBlocks) || 0);
  let sessionTrades = 0;
  let sessionBlocks = 0;
  let sessionStartedAt = null;
  // What each villager offered when last opened, by UUID; saved, so the bot knows
  // after a restart which items in its inventory belong to the trades
  const merchants = new Map((Array.isArray(saved.merchants) ? saved.merchants : [])
    .filter(entry => entry?.id && Array.isArray(entry.offers))
    .map(entry => [entry.id, entry]));
  let containers = Array.isArray(saved.containers) ? saved.containers.filter(validPosition) : [];
  let bot = null;
  let running = false;
  let scanning = false;
  let phase = 'idle';
  let lastErrorMessage = null;
  let outputFull = false;
  let nextCheckAt = null;
  let loopGeneration = 0;
  let loopFinished = Promise.resolve();
  let flushing = Promise.resolve();
  let idleWaiters = [];
  const openingCancels = new Set();
  const villagerRetryAt = new Map();
  const quietVillagers = new Set();
  // Off for the connection once a server refused the fast craft
  let dragCraftWorks = true;
  // What the source chests held when last opened, by position
  const sourceStock = new Map();

  function loadState() {
    if (!stateFile) return {};
    try {
      return JSON.parse(fs.readFileSync(stateFile, 'utf8')) || {};
    } catch {
      return {};
    }
  }

  function saveState() {
    if (!stateFile) return;
    try {
      fs.mkdirSync(path.dirname(stateFile), { recursive: true });
      fs.writeFileSync(stateFile, JSON.stringify({
        ...desired, totalTrades, totalBlocks, containers, merchants: [...merchants.values()]
      }, null, 2), 'utf8');
    } catch (error) {
      log(`[Trader] Could not save state: ${error.message}`, 'warn');
    }
  }

  function defaultEnabled(output) {
    return output === EMERALD;
  }

  function isEnabled(key, output) {
    const choice = desired.tradeChoices[key];
    return typeof choice === 'boolean' ? choice : defaultEnabled(output);
  }

  function totalStock() {
    const totals = new Map();
    for (const stock of sourceStock.values()) {
      for (const [name, count] of stock) totals.set(name, (totals.get(name) || 0) + count);
    }
    return totals;
  }

  function getStatus() {
    return {
      enabled: desired.enabled,
      desiredEnabled: desired.enabled,
      running,
      scanning,
      phase,
      anchor: desired.anchor && { ...desired.anchor },
      sources: desired.sources.map(pos => ({ ...pos })),
      output: desired.output && { ...desired.output },
      craftingTable: desired.craftingTable && { ...desired.craftingTable },
      containers: containers.map(entry => ({ ...entry })),
      villagers: [...merchants.values()].map(merchant => ({
        ...merchant,
        offers: merchant.offers.map(offer => ({ ...offer, enabled: isEnabled(offer.key, offer.output) }))
      })),
      stock: Object.fromEntries(totalStock()),
      outputFull,
      nextCheckAt,
      sessionTrades,
      sessionBlocks,
      sessionStartedAt,
      totalTrades,
      totalBlocks,
      lastErrorMessage
    };
  }

  function notifyChange() {
    try { Promise.resolve(onChange(getStatus())).catch(() => {}); } catch {}
  }

  function feetPosition(current = bot) {
    const pos = current?.entity?.position;
    return pos ? { x: Math.floor(pos.x), y: Math.floor(pos.y), z: Math.floor(pos.z) } : null;
  }

  function eyePosition(current) {
    return current.entity.position.offset(0, current.entity.eyeHeight || 1.62, 0);
  }

  // Connection lifecycle: the loop stops with the bot, and an enabled trader
  // comes back on spawn
  function attachBot(nextBot) {
    if (bot === nextBot) return;
    detachBot();
    bot = nextBot || null;
    bot?.on?.('spawn', onBotSpawn);
  }

  function onBotSpawn() {
    if (desired.enabled && !running && bot?.entity) startLoop();
  }

  function detachBot() {
    haltLoop();
    bot?.removeListener?.('spawn', onBotSpawn);
    bot = null;
  }

  function onSpawn(spawnedBot = bot) {
    if (spawnedBot && spawnedBot !== bot) attachBot(spawnedBot);
    if (desired.enabled && !running && bot?.entity) startLoop();
    return getStatus();
  }

  function dispose() {
    saveState();
    detachBot();
  }

  function haltLoop() {
    loopGeneration += 1;
    for (const cancel of openingCancels) cancel();
    if (running) {
      try { if (bot?.currentWindow) bot.closeWindow(bot.currentWindow); } catch {}
    }
    running = false;
    nextCheckAt = null;
    wakeIdleWaiters();
    if (!scanning) phase = 'idle';
  }

  function wakeIdleWaiters() {
    const waiters = idleWaiters;
    idleWaiters = [];
    for (const resolve of waiters) resolve();
  }

  function waitIdle(ms) {
    return new Promise(resolve => {
      const timer = setTimeout(done, ms);
      function done() {
        clearTimeout(timer);
        idleWaiters = idleWaiters.filter(entry => entry !== done);
        resolve();
      }
      idleWaiters.push(done);
    });
  }

  // Everything the setup still lacks, in the words the site shows
  function missingSetup() {
    if (!desired.anchor) return 'Trader has no spot yet: press Scan with the bot in place.';
    if (!desired.sources.length) return 'Trader needs at least one source chest.';
    if (!desired.output) return 'Trader needs an output chest.';
    if (!desired.craftingTable) return 'Trader needs a crafting table.';
    return null;
  }

  function start() {
    const missing = missingSetup();
    if (missing) throw new Error(missing);
    if (scanning) throw new Error('Trader is still scanning.');
    desired.enabled = true;
    lastErrorMessage = null;
    outputFull = false;
    saveState();
    if (bot?.entity && !running) startLoop();
    return getStatus();
  }

  // Turned off by hand: the emeralds waiting for a full block and everything
  // else belonging to the trades leave the inventory too. A bot that only went
  // offline keeps them for the next start, and so does one taken over by another
  // module (flush: false), which must not share the open window with it
  function stop({ flush = true } = {}) {
    const current = bot;
    const wasRunning = running;
    desired.enabled = false;
    outputFull = false;
    haltLoop();
    saveState();
    if (wasRunning) log('[Trader] Stopped.');
    if (flush && wasRunning && current?.entity) {
      const generation = loopGeneration;
      const finished = loopFinished;
      flushing = (async () => {
        await finished;
        const context = { current, active: () => generation === loopGeneration && bot === current && Boolean(current.entity) };
        if (!context.active()) return;
        phase = 'flushing';
        notifyChange();
        await flushInventory(context);
      })().catch(error => log(`[Trader] Could not empty the inventory when stopping: ${error.message}`, 'warn'))
        .finally(() => {
          if (generation === loopGeneration) phase = 'idle';
          notifyChange();
        });
    }
    return getStatus();
  }

  function configure({ sources, output, craftingTable, tradeChoices } = {}) {
    const nextSources = sources === undefined ? desired.sources : sources;
    const nextOutput = output === undefined ? desired.output : output;
    const nextTable = craftingTable === undefined ? desired.craftingTable : craftingTable;
    if (!Array.isArray(nextSources) || !nextSources.every(validPosition)) throw new Error('Source chests must be block positions.');
    if (nextSources.length > MAX_SOURCES) throw new Error(`Trader takes at most ${MAX_SOURCES} source chests.`);
    if (nextOutput !== null && !validPosition(nextOutput)) throw new Error('The output chest must be a block position.');
    if (nextTable !== null && !validPosition(nextTable)) throw new Error('The crafting table must be a block position.');
    if (nextOutput && nextSources.some(pos => samePosition(pos, nextOutput))) {
      throw new Error('The output chest cannot be a source chest too.');
    }
    desired.sources = nextSources.map(plainPosition);
    desired.output = nextOutput && plainPosition(nextOutput);
    desired.craftingTable = nextTable && plainPosition(nextTable);
    if (tradeChoices && typeof tradeChoices === 'object') {
      for (const [key, value] of Object.entries(tradeChoices)) {
        if (typeof value !== 'boolean') throw new Error('A trade choice must be on or off.');
        desired.tradeChoices[key] = value;
      }
    }
    for (const key of [...sourceStock.keys()]) {
      if (!desired.sources.some(pos => positionKey(pos) === key)) sourceStock.delete(key);
    }
    saveState();
    wakeIdleWaiters();
    return getStatus();
  }

  // The bot's spot, the containers and table in reach, and what the villagers offer
  async function scan() {
    const current = bot;
    if (!current?.entity) throw new Error('Minecraft bot is offline.');
    if (running || desired.enabled) throw new Error('Stop the Trader before scanning.');
    if (scanning) throw new Error('Trader is already scanning.');
    scanning = true;
    phase = 'scanning';
    lastErrorMessage = null;
    notifyChange();
    const generation = loopGeneration;
    const context = { current, active: () => generation === loopGeneration && bot === current && Boolean(current.entity) };
    try {
      await flushing;
      desired.anchor = feetPosition(current);
      containers = await findContainers(context);
      const known = new Set(containers.map(positionKey));
      desired.sources = desired.sources.filter(pos => known.has(positionKey(pos)));
      if (desired.output && !known.has(positionKey(desired.output))) desired.output = null;
      desired.craftingTable = findCraftingTable(current);
      merchants.clear();
      villagerRetryAt.clear();
      for (const entity of Object.values(current.entities || {})) {
        if (entity?.name !== VILLAGER || !entity.position) continue;
        const distance = distanceToEntity(current, entity);
        if (distance > VILLAGER_REACH + 10) continue;
        log(`[Trader] Scan: villager ${villagerId(entity)} at ${distance.toFixed(1)} blocks${distance > VILLAGER_REACH ? ', out of reach' : ''}.`);
      }
      for (const entity of reachableVillagers(current)) {
        if (!context.active()) break;
        try {
          const { window } = await openMerchant(context, entity);
          closeWindow(current, window);
        } catch (error) {
          log(`[Trader] Villager ${villagerId(entity)} did not trade during the scan: ${error.message}`);
          merchants.set(villagerId(entity), { id: villagerId(entity), level: null, offers: [], answered: false });
        }
        await sleep(settleMs);
      }
      log(`[Trader] Scan: ${containers.length} containers, ${merchants.size} villagers, ${desired.craftingTable ? 'a' : 'no'} crafting table.`);
      saveState();
      return getStatus();
    } finally {
      scanning = false;
      if (phase === 'scanning') phase = 'idle';
      notifyChange();
    }
  }

  function findBlocksInReach(current, names) {
    const ids = names.map(name => current.registry?.blocksByName?.[name]?.id).filter(id => id != null);
    if (!ids.length) return [];
    const eye = eyePosition(current);
    return (current.findBlocks({ matching: ids, maxDistance: Math.ceil(STORAGE_REACH) + 1, count: 64 }) || [])
      .map(pos => ({ pos, distance: eye.distanceTo(pos.offset(0.5, 0.5, 0.5)) }))
      .filter(entry => entry.distance <= STORAGE_REACH)
      .sort((a, b) => a.distance - b.distance)
      .map(entry => current.blockAt(entry.pos))
      .filter(Boolean);
  }

  // The other half of a double chest
  function chestPartner(block) {
    const properties = block.getProperties?.();
    const type = properties?.type;
    if (type !== 'left' && type !== 'right') return null;
    const clockwise = { north: 'east', east: 'south', south: 'west', west: 'north' };
    const counter = { north: 'west', west: 'south', south: 'east', east: 'north' };
    const direction = (type === 'left' ? clockwise : counter)[properties.facing];
    const step = { north: [0, -1], south: [0, 1], west: [-1, 0], east: [1, 0] }[direction];
    return step ? { x: block.position.x + step[0], y: block.position.y, z: block.position.z + step[1] } : null;
  }

  // Each chest once, however many blocks it takes. The block states say which
  // blocks belong together; what the server opens is the proof where they don't:
  // both halves of a double chest open the same 54 slots
  async function findContainers(context) {
    const { current } = context;
    const seen = new Set();
    const found = [];
    for (const block of findBlocksInReach(current, [...STORAGE_BLOCKS])) {
      const key = positionKey(block.position);
      if (seen.has(key)) continue;
      seen.add(key);
      const partner = chestPartner(block);
      if (partner) seen.add(positionKey(partner));
      const properties = block.getProperties?.() || {};
      found.push({
        ...plainPosition(block.position), name: block.name, double: Boolean(partner),
        linked: Boolean(partner), state: `${properties.type || '-'}/${properties.facing || '-'}`
      });
    }
    for (const entry of found) {
      if (entry.name === 'barrel' || !context.active()) continue;
      try {
        const window = await openContainer(context, entry, 'A chest');
        entry.slots = window.inventoryStart;
        entry.contents = JSON.stringify(window.slots.slice(0, window.inventoryStart).map(item => item && [item.name, item.count]));
        closeWindow(current, window);
      } catch (error) {
        log(`[Trader] Scan: could not open ${entry.name} at ${positionKey(entry)}: ${error.message}`, 'warn');
      }
      log(`[Trader] Scan: ${entry.name} at ${positionKey(entry)}, state ${entry.state}, ${entry.slots ?? '?'} slots.`);
    }
    // In coordinate order, so a row of double chests pairs up from one end
    const unlinked = found.filter(entry => !entry.linked && entry.slots === DOUBLE_CHEST_SLOTS)
      .sort((a, b) => a.x - b.x || a.z - b.z);
    const merged = new Set();
    for (const entry of unlinked) {
      if (merged.has(entry)) continue;
      const half = unlinked.find(other => other !== entry && !merged.has(other)
        && other.name === entry.name && other.y === entry.y
        && Math.abs(other.x - entry.x) + Math.abs(other.z - entry.z) === 1
        && other.contents === entry.contents);
      if (!half) continue;
      merged.add(half);
      merged.add(entry);
      entry.double = true;
      found.splice(found.indexOf(half), 1);
      log(`[Trader] Scan: ${positionKey(entry)} and ${positionKey(half)} are one double chest.`);
    }
    return found.map(({ x, y, z, name, double, slots }) => ({ x, y, z, name, double: double || slots === DOUBLE_CHEST_SLOTS }));
  }

  function findCraftingTable(current) {
    const block = findBlocksInReach(current, [TABLE_BLOCK])[0];
    return block ? plainPosition(block.position) : null;
  }

  function villagerId(entity) {
    return String(entity.uuid || entity.id);
  }

  function distanceToEntity(current, entity) {
    const eye = eyePosition(current);
    const halfWidth = (entity.width || 0.6) / 2;
    const { x, y, z } = entity.position;
    const height = entity.height || 1.95;
    const clamp = (value, low, high) => Math.min(Math.max(value, low), high);
    return eye.distanceTo(new Vec3(
      clamp(eye.x, x - halfWidth, x + halfWidth),
      clamp(eye.y, y, y + height),
      clamp(eye.z, z - halfWidth, z + halfWidth)
    ));
  }

  function reachableVillagers(current) {
    return Object.values(current.entities || {})
      .filter(entity => entity?.name === VILLAGER && entity.position && distanceToEntity(current, entity) <= VILLAGER_REACH)
      .sort((a, b) => distanceToEntity(current, a) - distanceToEntity(current, b));
  }

  function startLoop() {
    const generation = ++loopGeneration;
    const current = bot;
    running = true;
    sessionTrades = 0;
    sessionBlocks = 0;
    sessionStartedAt = new Date().toISOString();
    dragCraftWorks = true;
    log('[Trader] Started.');
    loopFinished = loop(generation, current).catch(error => log(`[Trader] Loop crashed: ${error.message}`, 'error'));
  }

  function isCurrent(generation, current) {
    return generation === loopGeneration && running && bot === current && Boolean(current?.entity);
  }

  async function loop(generation, current) {
    const context = { current, active: () => isCurrent(generation, current) };
    await flushing;
    while (context.active()) {
      try {
        const worked = await runRound(context);
        clearError();
        if (worked || !context.active()) continue;
        phase = 'waiting';
        nextCheckAt = new Date(Date.now() + idleIntervalMs).toISOString();
        notifyChange();
        await waitIdle(idleIntervalMs);
        nextCheckAt = null;
      } catch (error) {
        if (!context.active()) break;
        closeOpenWindow(current);
        const changed = lastErrorMessage !== error.message;
        lastErrorMessage = error.message;
        phase = 'retrying';
        // Once per problem: it may be retried for hours
        if (changed) {
          notifyChange();
          log(`[Trader] ${error.message} Retrying.`, 'warn');
        }
        await waitIdle(error.code === 'TRADER_SUPPLY' ? supplyRetryDelayMs : retryDelayMs);
      }
    }
    if (generation === loopGeneration) running = false;
    saveState();
  }

  function clearError() {
    if (!lastErrorMessage) return;
    log('[Trader] Working again.');
    lastErrorMessage = null;
    notifyChange();
  }

  function assertOnSpot(current) {
    const anchor = desired.anchor;
    const feet = feetPosition(current);
    if (!anchor || !feet) return;
    if (feet.x === anchor.x && feet.z === anchor.z && Math.abs(feet.y - anchor.y) <= 1) return;
    throw supplyError(`The bot left its spot ${positionKey(anchor)} and is at ${positionKey(feet)}; it waits there instead of walking.`);
  }

  // One round: tidy up, see what there is, and make every trade that can run
  async function runRound(context) {
    const { current } = context;
    assertOnSpot(current);
    await tidyInventory(context);
    if (!context.active()) return false;
    await readSources(context);
    const villagers = reachableVillagers(current);
    if (!villagers.length) throw supplyError('No villager within reach of the bot.');
    // Past the checks: the site should not show an old problem for a whole round
    clearError();
    const stock = totalStock();
    const plan = [];
    for (const entity of villagers) {
      if (!context.active()) return false;
      const id = villagerId(entity);
      if (Date.now() < (villagerRetryAt.get(id) || 0)) continue;
      let offers;
      try {
        const opened = await openMerchant(context, entity);
        offers = opened.offers;
        closeWindow(current, opened.window);
      } catch (error) {
        if (!context.active()) return false;
        villagerRetryAt.set(id, Date.now() + villagerCooldownMs);
        // A villager sleeps all night: once, not every minute
        if (!quietVillagers.has(id)) {
          quietVillagers.add(id);
          log(`[Trader] Villager ${id} did not open: ${error.message}`);
        }
        continue;
      }
      villagerRetryAt.delete(id);
      quietVillagers.delete(id);
      for (const offer of offers) {
        if (!isEnabled(offer.key, offer.outputItem.name)) continue;
        const uses = usesFromStock(offer, stock);
        if (!uses) continue;
        for (const [name, count] of offerCosts(offer, uses)) stock.set(name, stock.get(name) - count);
        plan.push({ entity, offer, uses });
      }
    }
    const spendsEmeralds = entry => offerCosts(entry.offer, 1).has(EMERALD);
    const selling = plan.filter(entry => !spendsEmeralds(entry));
    const trips = plan.filter(spendsEmeralds).map(entry => [entry]);
    if (selling.length) trips.push(selling);
    let worked = false;
    for (const trip of trips) {
      if (!context.active()) return worked;
      if (await makeTrip(context, trip)) worked = true;
      await tidyInventory(context);
    }
    return worked;
  }

  function offerCosts(offer, uses) {
    const costs = new Map([[offer.inputItem1.name, offer.realPrice * uses]]);
    if (offer.hasItem2) {
      const name = offer.inputItem2.name;
      costs.set(name, (costs.get(name) || 0) + offer.price2 * uses);
    }
    return costs;
  }

  // Items in the inventory that a trade can use
  function carried(current, name) {
    return current.inventory.items()
      .filter(item => item.name === name && isPlainItem(item))
      .reduce((sum, item) => sum + item.count, 0);
  }

  function enabledOffers() {
    return [...merchants.values()]
      .flatMap(merchant => merchant.offers)
      .filter(offer => isEnabled(offer.key, offer.output));
  }

  // What the bot leaves in the output chest. Its own gear is never moved: only
  // names coming out of a trade, or going into one, count as the trader's
  function productNames() {
    return new Set([EMERALD_BLOCK, ...enabledOffers().map(offer => offer.output).filter(name => name !== EMERALD)]);
  }

  function inputNames() {
    return new Set(enabledOffers().flatMap(offer => [offer.input1, offer.input2])
      .filter(name => name && name !== EMERALD && !productNames().has(name)));
  }

  // Leftovers back to the sources, emeralds into blocks, products to the output.
  // Trading waits for all of it, so a full output chest stops the trades and
  // nothing piles up in the inventory
  async function tidyInventory(context) {
    const { current } = context;
    const inputs = [...inputNames()].filter(name => carried(current, name) > 0);
    if (inputs.length) await returnToSources(context, new Map(inputs.map(name => [name, carried(current, name)])));
    await craftEmeralds(context);
    await depositProducts(context);
  }

  async function depositProducts(context) {
    const { current } = context;
    const products = productNames();
    const hasProducts = () => current.inventory.items().some(item => products.has(item.name) && isPlainItem(item));
    if (!hasProducts()) {
      setOutputFull(false);
      return;
    }
    phase = 'depositing';
    const window = await openContainer(context, desired.output, 'The output chest');
    try {
      await moveToContainer(context, window, item => products.has(item.name));
    } finally {
      closeWindow(current, window);
    }
    await sleep(settleMs);
    if (hasProducts()) {
      setOutputFull(true);
      throw supplyError('The output chest is full; the trades wait for room.');
    }
    setOutputFull(false);
  }

  function setOutputFull(full) {
    if (outputFull === full) return;
    outputFull = full;
    notifyChange();
  }

  // The last step of stop(): nothing that belongs to the trades stays on the bot
  async function flushInventory(context) {
    const { current } = context;
    const inputs = [...inputNames()].filter(name => carried(current, name) > 0);
    if (inputs.length && desired.sources.length) {
      await returnToSources(context, new Map(inputs.map(name => [name, carried(current, name)])));
    }
    if (!desired.output) return;
    const products = productNames();
    products.add(EMERALD);
    if (!current.inventory.items().some(item => products.has(item.name) && isPlainItem(item))) return;
    const window = await openContainer(context, desired.output, 'The output chest');
    try {
      await moveToContainer(context, window, item => products.has(item.name));
    } finally {
      closeWindow(current, window);
    }
    await sleep(settleMs);
  }

  // A stack spread over the grid with one drag, the rest put back, and one
  // shift-click on the result: the way a player does it. The server repeats the
  // craft by itself and stops when there is no room, so nothing lands on the
  // ground. prismarine-windows has no model of a drag, so these clicks are written
  // directly; like mineflayer's own syncWindow they carry an impossible stateId,
  // which makes the server answer with the whole window and the cursor.
  async function craftByDrag(context, table) {
    const { current } = context;
    if (!current.registry.supportFeature?.('stateIdUsed')) return false;
    const { direction, cursor } = containerInteraction(current, table);
    await current.lookAt(table.position.plus(cursor), true);
    if (current.waitForTicks) await current.waitForTicks(2);
    const window = await waitForContainerWindow(current, table, direction, cursor,
      'The crafting table did not open.', opened => String(opened.type || '').startsWith('minecraft:crafting'));
    const Item = require('prismarine-item')(current.registry);
    const sendDragClick = (slot, mouseButton) => current._client.write('window_click', {
      windowId: window.id,
      stateId: -1,
      slot,
      mouseButton,
      mode: 5,
      changedSlots: [],
      cursorItem: Item.toNotch(window.selectedItem)
    });
    const inventoryCount = name => window.slots.slice(window.inventoryStart, window.inventoryEnd)
      .filter(item => item?.name === name && isPlainItem(item))
      .reduce((sum, item) => sum + item.count, 0);
    const gridEmpty = () => CRAFT_GRID_SLOTS.every(slot => !window.slots[slot]);
    let crafted = false;
    try {
      await sleep(settleMs);
      while (context.active() && current.currentWindow === window) {
        const stack = window.slots.slice(window.inventoryStart, window.inventoryEnd)
          .filter(item => item?.name === EMERALD && isPlainItem(item) && item.count >= EMERALDS_PER_BLOCK)
          .sort((a, b) => b.count - a.count)[0];
        if (!stack) break;
        const { slot: stackSlot, count } = stack;
        const blocksBefore = inventoryCount(EMERALD_BLOCK);
        await current.clickWindow(stackSlot, 0, 0);
        sendDragClick(-999, 0);
        for (const slot of CRAFT_GRID_SLOTS) sendDragClick(slot, 1);
        sendDragClick(-999, 2);
        const expected = Math.floor(count / EMERALDS_PER_BLOCK);
        const spread = await waitFor(() => window.slots[CRAFT_RESULT_SLOT]?.name === EMERALD_BLOCK
          && CRAFT_GRID_SLOTS.every(slot => window.slots[slot]?.name === EMERALD), SLOT_READY_TIMEOUT_MS);
        if (!spread) return crafted;
        if (window.selectedItem) await current.clickWindow(stackSlot, 0, 0);
        await withTimeout(current.clickWindow(CRAFT_RESULT_SLOT, 0, 1), CLICK_TIMEOUT_MS, 'The craft click got no answer.')
          .catch(error => log(`[Trader] ${error.message}`, 'warn'));
        if (current._syncWindow) {
          await withTimeout(current._syncWindow(window), CLICK_TIMEOUT_MS, 'The crafting table gave no answer.')
            .catch(error => log(`[Trader] ${error.message}`, 'warn'));
        }
        await waitFor(() => inventoryCount(EMERALD_BLOCK) >= blocksBefore + expected && gridEmpty(), SLOT_READY_TIMEOUT_MS);
        if (inventoryCount(EMERALD_BLOCK) <= blocksBefore) return crafted;
        crafted = true;
        // No room for the rest of the result: it goes back on close, and the
        // products leave the inventory before the next try
        if (!gridEmpty()) break;
      }
      return crafted;
    } finally {
      closeWindow(current, window);
    }
  }

  // Every nine emeralds at the crafting table, as blocks. mineflayer's craft
  // throws a result on the ground when it has no room, so room comes first
  async function craftEmeralds(context) {
    const { current } = context;
    while (context.active() && carried(current, EMERALD) >= EMERALDS_PER_BLOCK) {
      if (!hasRoomForBlock(current)) await depositProducts(context);
      if (!hasRoomForBlock(current)) throw supplyError('No free inventory slot for the emerald blocks.');
      const table = desired.craftingTable && current.blockAt(new Vec3(desired.craftingTable.x, desired.craftingTable.y, desired.craftingTable.z));
      if (table?.name !== TABLE_BLOCK) throw supplyError('The crafting table is not there.');
      const blockId = current.registry.itemsByName[EMERALD_BLOCK].id;
      const recipe = current.recipesFor(blockId, null, 1, table)?.[0];
      if (!recipe) throw new Error('No recipe for emerald blocks.');
      const crafts = Math.min(Math.floor(carried(current, EMERALD) / EMERALDS_PER_BLOCK), MAX_CRAFTS_PER_BATCH);
      phase = 'crafting';
      closeOpenWindow(current);
      const blocksBefore = carried(current, EMERALD_BLOCK);
      const startedAt = Date.now();
      // Emeralds scattered in small stacks have nothing to spread: only then, or
      // on a server refusing the drag, the slow way is used
      const hasStack = current.inventory.items()
        .some(item => item.name === EMERALD && isPlainItem(item) && item.count >= EMERALDS_PER_BLOCK);
      const fast = dragCraftWorks && hasStack && await craftByDrag(context, table);
      if (!context.active()) return;
      await sleep(settleMs);
      if (!fast) {
        if (dragCraftWorks && hasStack) {
          dragCraftWorks = false;
          log('[Trader] The server did not take the fast craft; crafting one block at a time.', 'warn');
        }
        closeOpenWindow(current);
        try {
          await withTimeout(
            current.craft(recipe, crafts, table),
            CRAFT_TIMEOUT_BASE_MS + crafts * CRAFT_TIMEOUT_PER_CRAFT_MS,
            'Crafting emerald blocks took too long.'
          );
        } finally {
          closeOpenWindow(current);
        }
        await sleep(settleMs);
      }
      const made = carried(current, EMERALD_BLOCK) - blocksBefore;
      if (made <= 0) throw new Error('The crafting table gave no emerald blocks.');
      sessionBlocks += made;
      totalBlocks += made;
      saveState();
      log(`[Trader] Crafted ${made} emerald ${made === 1 ? 'block' : 'blocks'} in ${((Date.now() - startedAt) / 1000).toFixed(1)} s.`);
      notifyChange();
    }
  }

  function hasRoomForBlock(current) {
    if (current.inventory.emptySlotCount() > 0) return true;
    return current.inventory.items().some(item => item.name === EMERALD_BLOCK && item.count < (item.stackSize || 64));
  }

  // One visit to the sources for everything in the plan, then the villagers one
  // after another. What did not fit in this trip is for the next round
  async function makeTrip(context, plan) {
    const { current } = context;
    const startedAt = Date.now();
    const needed = new Map();
    for (const { offer, uses } of plan) {
      for (const [name, count] of offerCosts(offer, uses)) needed.set(name, (needed.get(name) || 0) + count);
    }
    const before = new Map([...needed.keys()].map(name => [name, carried(current, name)]));
    await takeFromSources(context, needed);
    if (!context.active()) return false;
    const takenAll = [...before].reduce((sum, [name, count]) => sum + Math.max(0, carried(current, name) - count), 0);
    if (!takenAll) {
      throw supplyError(`No room to take resources: ${current.inventory.emptySlotCount()} free slots, and ${RESERVED_FREE_SLOTS} stay free for the results.`);
    }
    let made = 0;
    for (const { entity, offer, uses } of plan) {
      if (!context.active()) break;
      if (Date.now() < (villagerRetryAt.get(villagerId(entity)) || 0)) continue;
      let affordable = uses;
      for (const [name, cost] of offerCosts(offer, 1)) {
        affordable = Math.min(affordable, Math.floor((carried(current, name) - before.get(name)) / cost));
      }
      if (affordable > 0) made += await makeTrade(context, entity, offer, affordable);
    }
    await returnTaken(context, before);
    if (made) log(`[Trader] Trip: took ${takenAll} items, made ${made} trades in ${((Date.now() - startedAt) / 1000).toFixed(1)} s.`);
    return made > 0;
  }

  // One trade with what the bot already carries; how many times it ran
  async function makeTrade(context, entity, offer, uses) {
    const { current } = context;
    const outputName = offer.outputItem.name;
    const outputBefore = carried(current, outputName);
    phase = 'trading';
    try {
      await runTrade(context, entity, offer, uses);
    } catch (error) {
      if (!context.active()) throw error;
      // A villager gone or asleep by now is no reason to stop the other trades
      villagerRetryAt.set(villagerId(entity), Date.now() + villagerCooldownMs);
      log(`[Trader] ${offer.key} did not run: ${error.message}`, 'warn');
    }
    await sleep(settleMs);
    const gained = Math.max(0, carried(current, outputName) - outputBefore);
    const made = Math.floor(gained / Math.max(1, offer.outputCount));
    if (made > 0) {
      sessionTrades += made;
      totalTrades += made;
      saveState();
      log(`[Trader] ${made} x ${offer.key}.`);
      notifyChange();
    }
    return made;
  }

  // Only what was taken goes back: before, the bot may already have held emeralds
  // it earned. These, unlike other inputs, are not returned by tidyInventory
  async function returnTaken(context, before) {
    const { current } = context;
    const extra = new Map();
    for (const [name, count] of before) {
      const left = carried(current, name) - count;
      if (left > 0) extra.set(name, left);
    }
    if (extra.size) await returnToSources(context, extra);
  }

  async function runTrade(context, entity, wanted, uses) {
    const { current } = context;
    const { window, offers } = await openMerchant(context, entity);
    try {
      const offer = offers.find(entry => entry.key === wanted.key && entry.realPrice === wanted.realPrice);
      if (!offer) throw new Error('the villager no longer offers this at that price.');
      window.selectedTrade = offer;
      const outputCount = () => window.slots.slice(window.inventoryStart, window.inventoryEnd)
        .filter(item => item?.name === offer.outputItem.name)
        .reduce((sum, item) => sum + item.count, 0);
      const startCount = outputCount();
      const target = Math.min(uses, offer.maxUses - offer.uses) * offer.outputCount;
      while (context.active() && current.currentWindow === window && outputCount() - startCount < target) {
        const beforeClick = outputCount();
        // The server puts what the trade costs into the input slots, a stack at
        // a time, and shows the result in slot 2
        current._client.write('select_trade', { slot: offer.index });
        if (!await waitFor(() => tradeIsReady(window, offer), SLOT_READY_TIMEOUT_MS)) break;
        // Not awaited: mineflayer may wait for a slot update that never comes.
        // The inputs going down is the server's own answer
        const paidBefore = window.slots[0].count;
        clickOutput(current, window);
        const answered = await waitFor(() => !window.slots[0] || window.slots[0].count !== paidBefore, SLOT_READY_TIMEOUT_MS);
        await sleep(Math.min(settleMs, TRADE_SETTLE_MS));
        if (!answered || outputCount() <= beforeClick) break;
      }
    } finally {
      closeWindow(current, window);
    }
  }

  function tradeIsReady(window, offer) {
    const first = window.slots[0];
    if (first?.name !== offer.inputItem1.name || first.count < offer.realPrice) return false;
    if (offer.hasItem2) {
      const second = window.slots[1];
      if (second?.name !== offer.inputItem2.name || second.count < offer.price2) return false;
    }
    return window.slots[2]?.name === offer.outputItem.name;
  }

  // mineflayer waits for slot updates that may not all come; what counts is what
  // arrives in the inventory
  async function clickOutput(current, window) {
    try {
      await withTimeout(current.clickWindow(2, 0, 1), CLICK_TIMEOUT_MS, 'The trade click got no answer.');
    } catch (error) {
      if (current.currentWindow === window) log(`[Trader] ${error.message}`, 'warn');
    }
  }

  // Opens a villager and notes its offers. A villager can refuse (asleep, busy, a
  // child, no job): mineflayer's openVillager then leaves its packet listener
  // behind, and that listener fails on the next villager's trade list. Both
  // listeners here are removed in every case
  async function openMerchant(context, entity) {
    const { current } = context;
    closeOpenWindow(current);
    let onOpen;
    let onTrades;
    let cancel;
    let window = null;
    let packet = null;
    const opening = new Promise((resolve, reject) => {
      const check = () => {
        if (window && packet && packet.windowId === window.id) resolve();
      };
      onOpen = opened => {
        window = opened;
        check();
      };
      onTrades = trades => {
        packet = trades;
        check();
      };
      cancel = () => reject(new Error('Opening the villager was cancelled.'));
      openingCancels.add(cancel);
      current.on('windowOpen', onOpen);
      current._client.on('trade_list', onTrades);
      Promise.resolve(current.activateEntity(entity)).catch(reject);
    });
    try {
      await withTimeout(opening, merchantTimeoutMs, 'The villager did not answer.');
    } catch (error) {
      if (window && current.currentWindow === window) closeWindow(current, window);
      throw error;
    } finally {
      current.removeListener('windowOpen', onOpen);
      current._client.removeListener('trade_list', onTrades);
      openingCancels.delete(cancel);
    }
    const Item = require('prismarine-item')(current.registry);
    const offers = parseOffers(Item, packet);
    merchants.set(villagerId(entity), {
      id: villagerId(entity),
      level: Number(packet.villagerLevel) || null,
      answered: true,
      offers: offers.map(offer => ({
        key: offer.key,
        input1: offer.inputItem1.name,
        price1: offer.realPrice,
        input2: offer.inputItem2?.name || null,
        price2: offer.price2,
        output: offer.outputItem.name,
        outputCount: offer.outputCount,
        uses: offer.uses,
        maxUses: offer.maxUses,
        disabled: offer.tradeDisabled,
        plain: offer.plain
      }))
    });
    return { window, offers };
  }

  async function readSources(context) {
    const { current } = context;
    phase = 'reading';
    for (const pos of desired.sources) {
      if (!context.active()) return;
      const window = await openContainer(context, pos, 'A source chest');
      try {
        noteStock(pos, window);
      } finally {
        closeWindow(current, window);
      }
    }
    notifyChange();
  }

  function noteStock(pos, window) {
    const stock = new Map();
    for (const item of window.slots.slice(0, window.inventoryStart)) {
      if (item && isPlainItem(item)) stock.set(item.name, (stock.get(item.name) || 0) + item.count);
    }
    sourceStock.set(positionKey(pos), stock);
  }

  // Whole stacks, until enough is taken, the trip is full, or only the reserved
  // slots are free
  async function takeFromSources(context, needed) {
    const { current } = context;
    const left = new Map(needed);
    let stacks = 0;
    phase = 'restocking';
    for (const pos of desired.sources) {
      if (stacks >= MAX_STACKS_PER_TRIP || ![...left.values()].some(count => count > 0)) break;
      const stock = sourceStock.get(positionKey(pos));
      if (!stock || ![...left.keys()].some(name => left.get(name) > 0 && stock.get(name) > 0)) continue;
      const window = await openContainer(context, pos, 'A source chest');
      try {
        for (const stack of window.slots.slice(0, window.inventoryStart)) {
          if (!stack || !isPlainItem(stack) || !(left.get(stack.name) > 0)) continue;
          if (stacks >= MAX_STACKS_PER_TRIP || freeSlots(window) <= RESERVED_FREE_SLOTS) break;
          const count = stack.count;
          if (await shiftClick(context, window, stack.slot)) {
            left.set(stack.name, left.get(stack.name) - count);
            stacks += 1;
          }
        }
        await sleep(settleMs);
        noteStock(pos, window);
      } finally {
        closeWindow(current, window);
      }
    }
    await sleep(settleMs);
  }

  function freeSlots(window) {
    return window.slots.slice(window.inventoryStart, window.inventoryEnd).filter(item => !item).length;
  }

  async function returnToSources(context, amounts) {
    const { current } = context;
    const left = new Map(amounts);
    phase = 'returning';
    for (const pos of desired.sources) {
      if (![...left.values()].some(count => count > 0)) break;
      const window = await openContainer(context, pos, 'A source chest');
      try {
        await moveToContainer(context, window, item => left.get(item.name) > 0, moved => {
          left.set(moved.name, left.get(moved.name) - moved.count);
        });
        await sleep(settleMs);
        noteStock(pos, window);
      } finally {
        closeWindow(current, window);
      }
    }
    await sleep(settleMs);
  }

  async function moveToContainer(context, window, wanted, onMoved = () => {}) {
    const stacks = window.slots.slice(window.inventoryStart, window.inventoryEnd)
      .filter(item => item && isPlainItem(item));
    for (const stack of stacks) {
      if (!wanted(stack)) continue;
      const { name, count } = stack;
      if (await shiftClick(context, window, stack.slot)) onMoved({ name, count });
    }
  }

  async function shiftClick(context, window, slot) {
    const { current } = context;
    // After the window closed, the same slot number means something else
    if (!context.active() || current.currentWindow !== window) throw new Error('The container closed while moving items.');
    const before = window.slots[slot];
    if (!before) return false;
    await current.clickWindow(slot, 0, 1);
    return waitFor(() => {
      const after = window.slots[slot];
      return !after || after.type !== before.type || after.count < before.count;
    }, SLOT_READY_TIMEOUT_MS);
  }

  async function waitFor(check, timeoutMs) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (check()) return true;
      await sleep(25);
    }
    return check();
  }

  function closeWindow(current, window) {
    try { if (window && current.currentWindow === window) current.closeWindow(window); } catch {}
  }

  function closeOpenWindow(current) {
    try { if (current.currentWindow) current.closeWindow(current.currentWindow); } catch {}
  }

  async function openContainer(context, pos, label) {
    const { current } = context;
    if (!context.active()) throw new Error('Trader stopped.');
    if (!pos) throw supplyError(`${label} is not set.`);
    const block = current.blockAt(new Vec3(pos.x, pos.y, pos.z));
    if (!block || !STORAGE_BLOCKS.has(block.name)) {
      throw supplyError(`${label} at ${positionKey(pos)} is not there.`);
    }
    closeOpenWindow(current);
    current.setControlState?.('sneak', false);
    const { direction, cursor } = containerInteraction(current, block);
    await current.lookAt(block.position.plus(cursor), true);
    if (current.waitForTicks) await current.waitForTicks(2);
    const window = await waitForContainerWindow(current, block, direction, cursor, `${label} at ${positionKey(pos)} did not open.`);
    await sleep(settleMs);
    return window;
  }

  async function waitForContainerWindow(current, block, direction, cursor, message,
    isExpected = opened => String(opened.type || '').startsWith('minecraft:generic')) {
    let onOpen;
    let cancel;
    let cancelled = false;
    const opening = new Promise((resolve, reject) => {
      onOpen = window => {
        // A villager that answers late must not pass for the chest
        if (isExpected(window)) {
          resolve(window);
        } else {
          closeWindow(current, window);
        }
      };
      cancel = () => {
        cancelled = true;
        reject(new Error('Opening the container was cancelled.'));
      };
      openingCancels.add(cancel);
      current.on('windowOpen', onOpen);
      Promise.resolve().then(() => {
        if (cancelled) return;
        if (sendContainerClick(current, block, direction, cursor)) return;
        return current.activateBlock(block, direction, cursor);
      }).catch(reject);
    });
    try {
      return await withTimeout(opening, containerTimeoutMs, message);
    } finally {
      current.removeListener('windowOpen', onOpen);
      openingCancels.delete(cancel);
    }
  }

  return {
    attachBot,
    detachBot,
    onSpawn,
    scan,
    configure,
    start,
    stop,
    dispose,
    getStatus
  };
}

module.exports = {
  createTrader,
  parseOffers,
  usesFromStock,
  tradeKey
};
