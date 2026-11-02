'use strict';

/**
 * Stone Miner: the bot stands at a cobblestone generator and keeps mining the
 * blocks it regrows.
 *
 *   1. Learn: the first stone-like block a player breaks within two blocks of
 *      the bot gives the direction and height: every block on that line in
 *      front of the bot that it can reach (about five) is remembered, with
 *      the spot the bot stands on, and mining starts at once
 *   2. Mine: each of those blocks holding stone is mined, nearest first
 *   3. Worn pickaxes go into the barrel the bot stands on (or the nearest
 *      chest or barrel) and a fresh one is taken from it; food is taken from
 *      it too when the bot has none
 *   4. Once the bot carries a stack of mined stone, it is put into the hopper
 *      in front of it; when the hopper stays full without draining, the
 *      miner turns itself off
 *
 * Apart from a full hopper it never stops on its own: every error is retried.
 */

const fs = require('node:fs');
const path = require('node:path');
const { Vec3 } = require('vec3');

const STONE_BLOCKS = new Set([
  'stone', 'cobblestone', 'mossy_cobblestone', 'granite', 'diorite', 'andesite',
  'deepslate', 'cobbled_deepslate', 'tuff', 'basalt', 'smooth_basalt', 'blackstone'
]);
// What the blocks above drop; these go into the hopper
const MINED_ITEMS = new Set([...STONE_BLOCKS]);
const PICKAXE_PRIORITY = [
  'netherite_pickaxe', 'diamond_pickaxe', 'iron_pickaxe',
  'stone_pickaxe', 'golden_pickaxe', 'wooden_pickaxe'
];
const UNSAFE_FOOD = new Set([
  'rotten_flesh', 'spider_eye', 'poisonous_potato', 'pufferfish', 'chorus_fruit',
  'suspicious_stew', 'golden_apple', 'enchanted_golden_apple'
]);
const STORAGE_BLOCKS = new Set(['chest', 'trapped_chest', 'barrel']);

const LEARN_RADIUS = 2;
const MIN_PICKAXE_REMAINING_PERCENT = 5;
const STORAGE_REACH = 4.5;
// From the eye to a block's centre; about five blocks in a straight line
const DIG_REACH = 5.1;
const MAX_LINE_LENGTH = 8;
const EAT_BELOW_FOOD = 18;
const DEPOSIT_FROM_COUNT = 64;
// Opening the hopper stops mining, so it is opened once every five minutes.
// It passes on only 2.5 items a second, slower than the bot mines, so stone
// piles up in the inventory; with three free slots or fewer the bot opens it
// sooner, once a stack could have drained
const HOPPER_INTERVAL_MS = 5 * 60_000;
const HOPPER_URGENT_INTERVAL_MS = 26_000;
const HOPPER_URGENT_FREE_SLOTS = 3;
// Full for this long without draining: everything after the hopper is full
const HOPPER_STALL_MS = 30_000;
const REGROW_WAIT_MS = 500;
const DIG_TIMEOUT_MS = 10_000;
const CONTAINER_TIMEOUT_MS = 5_000;
const RETRY_DELAY_MS = 2_000;
const SUPPLY_RETRY_DELAY_MS = 10_000;
const SAVE_EVERY_MS = 30_000;

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
  return Object.assign(new Error(message), { code: 'STONE_MINER_SUPPLY' });
}

function positionKey(pos) {
  return `${pos.x},${pos.y},${pos.z}`;
}

function isAir(block) {
  return !block || block.name === 'air' || block.name === 'cave_air' || block.name === 'void_air';
}

function isStoneBlock(block) {
  return Boolean(block?.name) && STONE_BLOCKS.has(block.name);
}

function getRemainingDurabilityPercent(bot, item) {
  const max = typeof item?.maxDurability === 'number'
    ? item.maxDurability
    : bot.registry?.itemsByName?.[item?.name]?.maxDurability;
  if (!max || max <= 0) return 100;
  const used = typeof item.durabilityUsed === 'number'
    ? item.durabilityUsed
    : Number(item.nbt?.value?.Damage?.value) || 0;
  return (Math.max(0, max - Math.max(0, used)) / max) * 100;
}

// Retired at 5% like the Obsidian Farm, so an enchanted pickaxe is never broken
function isPickaxeUsable(bot, item) {
  return Number(getRemainingDurabilityPercent(bot, item).toFixed(1)) > MIN_PICKAXE_REMAINING_PERCENT;
}

function isPickaxe(item) {
  return Boolean(item?.name) && PICKAXE_PRIORITY.includes(item.name);
}

// Mining speed as Minecraft counts it: the material's speed plus
// Efficiency's level squared plus one
const PICKAXE_SPEED = {
  wooden_pickaxe: 2, stone_pickaxe: 4, iron_pickaxe: 6,
  diamond_pickaxe: 8, netherite_pickaxe: 9, golden_pickaxe: 12
};

function enchantLevel(item, name) {
  let enchants = [];
  try { enchants = item?.enchants || []; } catch {}
  const entry = enchants.find(enchant => String(enchant?.name || '').replace(/^minecraft:/, '') === name);
  return Number(entry?.lvl) || 0;
}

function pickaxeSpeed(item) {
  const efficiency = enchantLevel(item, 'efficiency');
  return (PICKAXE_SPEED[item.name] || 1) + (efficiency > 0 ? efficiency * efficiency + 1 : 0);
}

// The fastest usable pickaxe; of equally fast ones the least worn
function findBestUsablePickaxe(bot, items) {
  let best = null;
  for (const item of items) {
    if (!isPickaxe(item) || !isPickaxeUsable(bot, item)) continue;
    const speed = pickaxeSpeed(item);
    const percent = getRemainingDurabilityPercent(bot, item);
    if (!best || speed > best.speed || (speed === best.speed && percent > best.percent)) {
      best = { item, speed, percent };
    }
  }
  return best?.item || null;
}

function isSafeFood(bot, item) {
  if (!item?.name || UNSAFE_FOOD.has(item.name)) return false;
  return Boolean(bot.registry?.foodsByName?.[item.name]);
}

function createStoneMiner({
  stateFile = null, log = () => {}, onChange = () => {}, onMined = () => {}, onPickaxeRetired = () => {},
  hopperIntervalMs = HOPPER_INTERVAL_MS, hopperUrgentIntervalMs = HOPPER_URGENT_INTERVAL_MS,
  hopperStallMs = HOPPER_STALL_MS
} = {}) {
  const saved = loadState();
  const desired = {
    enabled: Boolean(saved.enabled),
    blocks: Array.isArray(saved.blocks) ? saved.blocks.filter(validPosition).slice(0, MAX_LINE_LENGTH) : [],
    anchor: validPosition(saved.anchor) ? saved.anchor : null
  };
  let totalMined = Math.max(0, Number(saved.totalMined) || 0);
  let sessionMined = 0;
  let sessionStartedAt = null;
  // Blocks mined by the pickaxe in each inventory slot; fromFresh when it was
  // taken from the chest here, so its whole life is counted
  const pickaxeBlocks = new Map();
  let bot = null;
  let learning = false;
  let running = false;
  let phase = 'idle';
  let lastErrorMessage = null;
  let loopGeneration = 0;
  let lastSavedAt = 0;
  let regrowWaiters = [];
  let lastHopperVisitAt = 0;
  let hopperFullSince = null;
  let nextFoodCheckAt = 0;
  let stopReason = saved.stopReason || null;
  // What the barrel and the hopper held when the bot last opened them
  let barrelSeen = null;
  let hopperSeen = null;
  let barrelCheckDue = true;
  let lineCheckDue = true;
  let lastLineView = null;

  function validPosition(pos) {
    return pos && [pos.x, pos.y, pos.z].every(Number.isInteger);
  }

  function loadState() {
    if (!stateFile) return {};
    try {
      return JSON.parse(fs.readFileSync(stateFile, 'utf8')) || {};
    } catch {
      return {};
    }
  }

  function saveState() {
    lastSavedAt = Date.now();
    if (!stateFile) return;
    try {
      fs.mkdirSync(path.dirname(stateFile), { recursive: true });
      fs.writeFileSync(stateFile, JSON.stringify({ ...desired, totalMined, stopReason }, null, 2), 'utf8');
    } catch (error) {
      log(`[Stone Miner] Could not save state: ${error.message}`);
    }
  }

  function getStatus() {
    return {
      enabled: desired.enabled,
      desiredEnabled: desired.enabled,
      running,
      learning,
      phase,
      blocks: desired.blocks.map(pos => ({ ...pos })),
      blockCount: desired.blocks.length,
      anchor: desired.anchor ? { ...desired.anchor } : null,
      sessionMined,
      sessionStartedAt,
      totalMined,
      lastErrorMessage,
      stopReason,
      barrel: barrelSeen && { ...barrelSeen },
      hopper: hopperSeen && { ...hopperSeen }
    };
  }

  function feetPosition(current = bot) {
    const pos = current?.entity?.position;
    return pos ? { x: Math.floor(pos.x), y: Math.floor(pos.y), z: Math.floor(pos.z) } : null;
  }

  // A block within two blocks of the bot's feet or head
  function isNearBot(pos) {
    const feet = feetPosition();
    if (!feet) return false;
    const dx = Math.abs(pos.x - feet.x);
    const dz = Math.abs(pos.z - feet.z);
    const dy = pos.y - feet.y;
    return dx <= LEARN_RADIUS && dz <= LEARN_RADIUS && dy >= -LEARN_RADIUS && dy <= 1 + LEARN_RADIUS;
  }

  // The broken block gives the direction: the line runs from the bot through
  // it at its height, along the axis it lies on most, as far as the bot reaches
  function lineThrough(pos) {
    const feet = feetPosition();
    const dx = pos.x - feet.x;
    const dz = pos.z - feet.z;
    let step;
    let first;
    if (dx || dz) {
      step = Math.abs(dx) >= Math.abs(dz) ? { x: Math.sign(dx), y: 0, z: 0 } : { x: 0, y: 0, z: Math.sign(dz) };
      first = step.x ? { x: feet.x + step.x, y: pos.y, z: pos.z } : { x: pos.x, y: pos.y, z: feet.z + step.z };
    } else {
      step = { x: 0, y: pos.y > feet.y ? 1 : -1, z: 0 };
      first = { x: pos.x, y: step.y > 0 ? feet.y + 2 : feet.y - 1, z: pos.z };
    }
    const eye = bot.entity.position.offset(0, bot.entity.height || 1.62, 0);
    const line = [];
    for (let k = 0; k < MAX_LINE_LENGTH; k += 1) {
      const block = { x: first.x + step.x * k, y: first.y + step.y * k, z: first.z + step.z * k };
      if (eye.distanceTo(new Vec3(block.x + 0.5, block.y + 0.5, block.z + 0.5)) > DIG_REACH) break;
      line.push(block);
    }
    return line;
  }

  function learnLine(pos) {
    const line = lineThrough(pos);
    if (!line.length) return;
    learning = false;
    desired.blocks = line;
    desired.anchor = feetPosition();
    log(`[Stone Miner] Learned ${line.length} blocks from ${positionKey(line[0])} to ${positionKey(line[line.length - 1])}.`);
    start();
    notifyChange();
  }

  // A line learned by an older version holds only the one or two blocks a
  // player broke; once the bot is on its spot it is rebuilt through the first
  // of them to everything in reach
  function extendLine(current) {
    lineCheckDue = false;
    const feet = feetPosition(current);
    const anchor = desired.anchor;
    if (!desired.blocks.length || !anchor || !feet) return;
    if (feet.x !== anchor.x || feet.y !== anchor.y || feet.z !== anchor.z) return;
    const line = lineThrough(desired.blocks[0]);
    if (line.length <= desired.blocks.length) return;
    log(`[Stone Miner] Extended the learned line from ${desired.blocks.length} to ${line.length} blocks.`);
    desired.blocks = line;
    saveState();
    notifyChange();
  }

  function isLearned(pos) {
    const key = positionKey(pos);
    return desired.blocks.some(block => positionKey(block) === key);
  }

  function onBlockUpdate(oldBlock, newBlock) {
    const pos = newBlock?.position || oldBlock?.position;
    if (!pos) return;
    if (learning && isStoneBlock(oldBlock) && isAir(newBlock) && isNearBot(pos)) {
      learnLine(pos);
      return;
    }
    if (running && isStoneBlock(newBlock) && isLearned(pos)) wakeRegrowWaiters();
  }

  // Statistics callbacks must never stop the miner
  function report(callback, payload) {
    try { Promise.resolve(callback(payload)).catch(() => {}); } catch {}
  }

  function retirePickaxe(item, inventorySlot) {
    const tracked = pickaxeBlocks.get(inventorySlot) || { blocks: 0, fromFresh: false };
    pickaxeBlocks.delete(inventorySlot);
    // One the bot came with already worn says nothing about pickaxe life
    if (!tracked.blocks) return;
    report(onPickaxeRetired, { name: item.name, blocksMined: tracked.blocks, countInAverage: tracked.fromFresh });
  }

  // Tells the site about a new block or a new error, never fails the miner
  function notifyChange() {
    try { Promise.resolve(onChange(getStatus())).catch(() => {}); } catch {}
  }

  function wakeRegrowWaiters() {
    const waiters = regrowWaiters;
    regrowWaiters = [];
    for (const resolve of waiters) resolve();
  }

  function waitForRegrow(ms) {
    return new Promise(resolve => {
      const timer = setTimeout(done, ms);
      function done() {
        clearTimeout(timer);
        regrowWaiters = regrowWaiters.filter(entry => entry !== done);
        resolve();
      }
      regrowWaiters.push(done);
    });
  }

  function attachBot(nextBot) {
    if (bot === nextBot) return;
    detachBot();
    bot = nextBot || null;
    bot?.on?.('blockUpdate', onBlockUpdate);
    // The miner starts on the bot's own spawn too: the account's spawn hooks
    // run one after another, and one failing before it left it switched off
    bot?.on?.('spawn', onBotSpawn);
  }

  function onBotSpawn() {
    if (desired.enabled && !running && bot?.entity) startLoop();
  }

  // The bot left: the loop stops, but an enabled miner comes back on spawn
  function detachBot() {
    haltLoop();
    learning = false;
    bot?.removeListener?.('blockUpdate', onBlockUpdate);
    bot?.removeListener?.('spawn', onBotSpawn);
    bot = null;
  }

  function onSpawn(spawnedBot = bot) {
    if (spawnedBot && spawnedBot !== bot) attachBot(spawnedBot);
    if (desired.enabled && !running) startLoop();
    return getStatus();
  }

  function setLearning(enabled) {
    if (enabled) {
      if (!bot?.entity) throw new Error('Minecraft bot is offline.');
      if (desired.enabled) {
        desired.enabled = false;
        haltLoop();
        saveState();
      }
      learning = true;
      phase = 'learning';
    } else {
      learning = false;
      if (phase === 'learning') phase = 'idle';
    }
    return getStatus();
  }

  function clearBlocks() {
    desired.blocks = [];
    desired.anchor = null;
    saveState();
    return getStatus();
  }

  function start() {
    if (!desired.blocks.length) {
      throw new Error('Stone Miner has no blocks yet: press Learn and break a block in front of the bot.');
    }
    learning = false;
    desired.enabled = true;
    lastErrorMessage = null;
    stopReason = null;
    hopperFullSince = null;
    saveState();
    if (bot?.entity && !running) startLoop();
    return getStatus();
  }

  function stop() {
    desired.enabled = false;
    stopReason = null;
    learning = false;
    haltLoop();
    saveState();
    return getStatus();
  }

  function dispose() {
    if (totalMined) saveState();
    detachBot();
  }

  function haltLoop() {
    loopGeneration += 1;
    if (running) {
      try { bot?.stopDigging?.(); } catch {}
      try { bot?.closeWindow?.(bot.currentWindow); } catch {}
    }
    running = false;
    wakeRegrowWaiters();
    if (phase !== 'learning') phase = 'idle';
  }

  function startLoop() {
    const generation = ++loopGeneration;
    running = true;
    sessionMined = 0;
    sessionStartedAt = new Date().toISOString();
    // A first look into the barrel, so the site knows its pickaxes
    barrelCheckDue = true;
    lineCheckDue = true;
    log('[Stone Miner] Started.');
    loop(generation).catch(error => log(`[Stone Miner] Loop crashed: ${error.message}`));
  }

  function isCurrent(generation, current) {
    return generation === loopGeneration && running && bot === current && Boolean(current?.entity);
  }

  async function loop(generation) {
    const current = bot;
    while (isCurrent(generation, current)) {
      try {
        const mined = await runStep(current, generation);
        if (lastErrorMessage) {
          lastErrorMessage = null;
          notifyChange();
        }
        if (!mined) await waitForRegrow(REGROW_WAIT_MS);
      } catch (error) {
        if (!isCurrent(generation, current)) break;
        const changed = lastErrorMessage !== error.message;
        lastErrorMessage = error.message;
        if (changed) notifyChange();
        phase = 'retrying';
        log(`[Stone Miner] ${error.message} Retrying.`);
        await sleep(error.code === 'STONE_MINER_SUPPLY' ? SUPPLY_RETRY_DELAY_MS : RETRY_DELAY_MS);
      }
    }
    if (generation === loopGeneration) running = false;
    if (totalMined) saveState();
  }

  // One pass: keep the bot in place and supplied, then mine one grown block
  async function runStep(current, generation) {
    await returnToAnchor(current);
    if (lineCheckDue) extendLine(current);
    await depositMinedStone(current);
    await ensureSupplies(current);
    await eatIfHungry(current);
    if (!isCurrent(generation, current)) return false;

    const target = findGrownBlock(current);
    if (!target) {
      phase = 'waiting';
      logLineView(current);
      return false;
    }
    lastLineView = null;
    phase = 'mining';
    // The pickaxe in hand is kept until it wears out: picking the least worn
    // one each block swapped identical pickaxes back and forth
    const held = current.heldItem;
    const pickaxe = isPickaxe(held) && isPickaxeUsable(current, held)
      ? held
      : findBestUsablePickaxe(current, current.inventory.items());
    if (!pickaxe) throw supplyError('No usable pickaxe.');
    if (current.heldItem?.slot !== pickaxe.slot) await current.equip(pickaxe, 'hand');
    await withTimeout(current.dig(target, true), DIG_TIMEOUT_MS, 'Mining took too long.');
    sessionMined += 1;
    totalMined += 1;
    const tracked = pickaxeBlocks.get(pickaxe.slot) || { blocks: 0, fromFresh: false };
    tracked.blocks += 1;
    pickaxeBlocks.set(pickaxe.slot, tracked);
    report(onMined, { name: target.name });
    if (Date.now() - lastSavedAt > SAVE_EVERY_MS) saveState();
    return true;
  }

  function findGrownBlock(current) {
    const eye = current.entity.position.offset(0, current.entity.height || 1.62, 0);
    let outOfReach = 0;
    for (const pos of desired.blocks) {
      const block = current.blockAt(new Vec3(pos.x, pos.y, pos.z));
      if (!isStoneBlock(block)) continue;
      if (eye.distanceTo(block.position.offset(0.5, 0.5, 0.5)) > DIG_REACH) {
        outOfReach += 1;
        continue;
      }
      if (current.canDigBlock?.(block) === false) continue;
      return block;
    }
    if (outOfReach && outOfReach === desired.blocks.length) {
      throw new Error('The generator blocks are out of reach.');
    }
    return null;
  }

  // What the bot sees on each learned block while it waits, logged when it
  // changes, so a line it does not mine to the end can be explained
  function logLineView(current) {
    const eye = current.entity.position.offset(0, current.entity.height || 1.62, 0);
    const view = desired.blocks.map((pos, index) => {
      const block = current.blockAt(new Vec3(pos.x, pos.y, pos.z));
      const distance = eye.distanceTo(new Vec3(pos.x + 0.5, pos.y + 0.5, pos.z + 0.5));
      const notes = [];
      if (distance > DIG_REACH) notes.push('out of reach');
      if (isStoneBlock(block) && current.canDigBlock?.(block) === false) notes.push('cannot dig');
      return `${index + 1}) ${positionKey(pos)} ${block?.name || 'unloaded'} ${distance.toFixed(1)}m${notes.length ? ` (${notes.join(', ')})` : ''}`;
    }).join('; ');
    if (view === lastLineView) return;
    lastLineView = view;
    log(`[Stone Miner] Waiting, line of ${desired.blocks.length}: ${view}.`);
  }

  // The bot may be pushed off its spot; it walks back if it can
  async function returnToAnchor(current) {
    const anchor = desired.anchor;
    const pos = current.entity.position;
    if (!anchor || (Math.floor(pos.x) === anchor.x && Math.floor(pos.z) === anchor.z && Math.abs(Math.floor(pos.y) - anchor.y) <= 1)) return;
    if (!current.pathfinder) return;
    phase = 'returning';
    const { Movements, goals } = require('mineflayer-pathfinder');
    const movements = new Movements(current);
    movements.canDig = false;
    movements.allow1by1towers = false;
    movements.scafoldingBlocks = [];
    current.pathfinder.setMovements(movements);
    await withTimeout(
      current.pathfinder.goto(new goals.GoalBlock(anchor.x, anchor.y, anchor.z)),
      20_000,
      'Could not walk back to the generator.'
    ).finally(() => {
      try { current.pathfinder.setGoal(null); } catch {}
    });
  }

  function findHopper(current) {
    const id = current.registry?.blocksByName?.hopper?.id;
    if (id == null) return null;
    const eye = current.entity.position.offset(0, current.entity.height || 1.62, 0);
    const positions = current.findBlocks({ matching: id, maxDistance: Math.ceil(STORAGE_REACH) + 1, count: 8 }) || [];
    return positions
      .map(pos => ({ pos, distance: eye.distanceTo(pos.offset(0.5, 0.5, 0.5)) }))
      .filter(entry => entry.distance <= STORAGE_REACH)
      .sort((a, b) => a.distance - b.distance)
      .map(entry => current.blockAt(entry.pos))
      .find(Boolean) || null;
  }

  // From a full stack on, the mined stone goes into the hopper in front of the
  // bot. A hopper that stays full without draining means everything after it
  // is full too, and the miner turns itself off
  async function depositMinedStone(current) {
    const carried = current.inventory.items()
      .filter(item => MINED_ITEMS.has(item.name))
      .reduce((sum, item) => sum + item.count, 0);
    if (carried < DEPOSIT_FROM_COUNT) return;
    const urgent = current.inventory.emptySlotCount() <= HOPPER_URGENT_FREE_SLOTS;
    const sinceVisit = Date.now() - lastHopperVisitAt;
    if (sinceVisit < (urgent ? hopperUrgentIntervalMs : hopperIntervalMs)) return;
    lastHopperVisitAt = Date.now();
    const hopper = findHopper(current);
    if (!hopper) {
      log('[Stone Miner] No hopper within reach for the mined stone.');
      return;
    }
    phase = 'depositing';
    const window = await openWindow(current, hopper, 'The hopper did not open.');
    let moved = false;
    let contents;
    try {
      const start = window.inventoryStart;
      for (const stack of window.slots.slice(start, window.inventoryEnd).filter(item => item && MINED_ITEMS.has(item.name))) {
        if (!hopperRoom(window)) break;
        if (await shiftClick(current, window, stack.slot)) moved = true;
      }
      contents = hopperContents(window);
      hopperSeen = { items: contents.total, capacity: window.inventoryStart * 64, at: new Date().toISOString() };
    } finally {
      try { current.closeWindow(window); } catch {}
    }

    if (moved || contents.room > 0) {
      hopperFullSince = null;
      return;
    }
    if (!hopperFullSince || contents.total < hopperFullSince.total) {
      hopperFullSince = { at: Date.now(), total: contents.total };
      log('[Stone Miner] The hopper is full; checking whether it drains.');
      return;
    }
    if (Date.now() - hopperFullSince.at >= hopperStallMs) {
      stopBecause(`The hopper stayed full for ${Math.round(hopperStallMs / 1000)} s: mining stopped.`);
    }
  }

  function hopperRoom(window) {
    return hopperContents(window).room > 0;
  }

  // Room for more stone and the items already in the hopper
  function hopperContents(window) {
    let room = 0;
    let total = 0;
    for (const item of window.slots.slice(0, window.inventoryStart)) {
      if (!item) {
        room += 64;
        continue;
      }
      total += item.count;
      if (MINED_ITEMS.has(item.name)) room += Math.max(0, (item.stackSize || 64) - item.count);
    }
    return { room, total };
  }

  function stopBecause(reason) {
    log(`[Stone Miner] ${reason}`);
    desired.enabled = false;
    stopReason = reason;
    hopperFullSince = null;
    haltLoop();
    saveState();
    notifyChange();
  }

  async function openWindow(current, block, timeoutMessage) {
    try { current.stopDigging?.(); } catch {}
    await current.lookAt(block.position.offset(0.5, 0.5, 0.5), true);
    const window = await withTimeout(current.openContainer(block), CONTAINER_TIMEOUT_MS, timeoutMessage);
    // The slots may come a moment after the window itself
    await waitFor(() => window.slots.slice(window.inventoryStart, window.inventoryEnd).some(Boolean), 1_000);
    return window;
  }

  // Shift-click moves a stack between the container and the inventory in one
  // server action, as the Obsidian Farm does: dragging it with the cursor is
  // refused by the server while a container is open
  async function shiftClick(current, window, slot) {
    const before = window.slots[slot];
    if (!before) return false;
    await current.clickWindow(slot, 0, 1);
    return waitFor(() => {
      const after = window.slots[slot];
      return !after || after.type !== before.type || after.count < before.count;
    }, 2_000);
  }

  async function waitFor(check, timeoutMs) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (check()) return true;
      await sleep(100);
    }
    return check();
  }

  async function eatIfHungry(current) {
    if (!Number.isFinite(current.food) || current.food >= EAT_BELOW_FOOD || current._isEating) return;
    const food = current.inventory.items().find(item => isSafeFood(current, item));
    if (!food) return;
    phase = 'eating';
    await current.equip(food, 'hand');
    await current.consume();
  }

  // The barrel the bot stands on first, then the nearest one in reach
  function findStorage(current) {
    const below = current.blockAt(current.entity.position.offset(0, -0.5, 0).floored());
    if (below?.name && STORAGE_BLOCKS.has(below.name)) return below;
    const ids = [...STORAGE_BLOCKS]
      .map(name => current.registry?.blocksByName?.[name]?.id)
      .filter(id => id != null);
    if (!ids.length) return null;
    const eye = current.entity.position.offset(0, current.entity.height || 1.62, 0);
    const positions = current.findBlocks({ matching: ids, maxDistance: Math.ceil(STORAGE_REACH) + 1, count: 16 }) || [];
    return positions
      .map(pos => ({ pos, distance: eye.distanceTo(pos.offset(0.5, 0.5, 0.5)) }))
      .filter(entry => entry.distance <= STORAGE_REACH)
      .sort((a, b) => a.distance - b.distance)
      .map(entry => current.blockAt(entry.pos))
      .find(Boolean) || null;
  }

  async function ensureSupplies(current) {
    const items = current.inventory.items();
    const needsPickaxe = !findBestUsablePickaxe(current, items);
    const wornPickaxes = items.filter(item => isPickaxe(item) && !isPickaxeUsable(current, item));
    // Without food in the barrel it is looked for again only once a minute
    const needsFood = !items.some(item => isSafeFood(current, item)) && Date.now() >= nextFoodCheckAt;
    if (!needsPickaxe && !needsFood && !wornPickaxes.length && !barrelCheckDue) return;

    const storage = findStorage(current);
    if (!storage) {
      if (needsPickaxe) throw supplyError('No usable pickaxe, and no chest or barrel within reach.');
      return;
    }
    phase = 'restocking';
    const usableBefore = new Set(items.filter(item => isPickaxe(item) && isPickaxeUsable(current, item)).map(item => item.slot));
    const window = await openWindow(current, storage, 'The barrel did not open.');
    let foodFound = !needsFood;
    try {
      const start = window.inventoryStart;
      const containerItems = () => window.slots.slice(0, start).filter(Boolean);
      const inventoryItems = () => window.slots.slice(start, window.inventoryEnd).filter(Boolean);
      const inventorySlotOf = windowSlot => windowSlot - start + 9;

      // Worn ones first, so the barrel slot and the inventory slot are free
      for (const worn of inventoryItems().filter(item => isPickaxe(item) && !isPickaxeUsable(current, item))) {
        const slot = inventorySlotOf(worn.slot);
        if (await shiftClick(current, window, worn.slot)) retirePickaxe(worn, slot);
      }
      if (needsPickaxe) {
        const fresh = findBestUsablePickaxe(current, containerItems());
        if (fresh && await shiftClick(current, window, fresh.slot)) {
          const efficiency = enchantLevel(fresh, 'efficiency');
          log(`[Stone Miner] Took a ${fresh.name}${efficiency ? ` with Efficiency ${efficiency}` : ''} from the barrel.`);
        }
      }
      if (needsFood) {
        const food = containerItems().find(item => isSafeFood(current, item));
        foodFound = Boolean(food);
        if (food) await shiftClick(current, window, food.slot);
      }
      barrelSeen = {
        pickaxes: containerItems().filter(item => isPickaxe(item) && isPickaxeUsable(current, item)).length,
        wornPickaxes: containerItems().filter(item => isPickaxe(item) && !isPickaxeUsable(current, item)).length,
        food: containerItems().filter(item => isSafeFood(current, item)).reduce((sum, item) => sum + item.count, 0),
        at: new Date().toISOString()
      };
      barrelCheckDue = false;
    } finally {
      try { current.closeWindow(window); } catch {}
    }
    if (!foodFound) nextFoodCheckAt = Date.now() + 60_000;

    const fresh = current.inventory.items().find(item =>
      isPickaxe(item) && isPickaxeUsable(current, item) && !usableBefore.has(item.slot));
    if (fresh) pickaxeBlocks.set(fresh.slot, { blocks: 0, fromFresh: true });
    if (!findBestUsablePickaxe(current, current.inventory.items())) {
      throw supplyError('No usable pickaxe in the bot inventory or the barrel.');
    }
  }

  return {
    attachBot,
    detachBot,
    onSpawn,
    setLearning,
    clearBlocks,
    start,
    stop,
    dispose,
    getStatus
  };
}

module.exports = {
  createStoneMiner,
  isPickaxeUsable,
  findBestUsablePickaxe,
  STONE_BLOCKS
};
