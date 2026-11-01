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
 *      in front of it
 *
 * Like the Obsidian Farm it never stops on its own: every error is retried.
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
// A hopper holds five stacks and drains slowly: when it was full, the bot
// mines on and tries again a little later
const HOPPER_RETRY_MS = 10_000;
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

function findBestUsablePickaxe(bot, items) {
  let best = null;
  for (const item of items) {
    if (!isPickaxe(item) || !isPickaxeUsable(bot, item)) continue;
    const rank = PICKAXE_PRIORITY.indexOf(item.name);
    const percent = getRemainingDurabilityPercent(bot, item);
    if (!best || rank < best.rank || (rank === best.rank && percent > best.percent)) {
      best = { item, rank, percent };
    }
  }
  return best?.item || null;
}

function isSafeFood(bot, item) {
  if (!item?.name || UNSAFE_FOOD.has(item.name)) return false;
  return Boolean(bot.registry?.foodsByName?.[item.name]);
}

function createStoneMiner({
  stateFile = null, log = () => {}, onChange = () => {}, onMined = () => {}, onPickaxeRetired = () => {}
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
  let nextHopperAttemptAt = 0;

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
      fs.writeFileSync(stateFile, JSON.stringify({ ...desired, totalMined }, null, 2), 'utf8');
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
      lastErrorMessage
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
  }

  // The bot left: the loop stops, but an enabled miner comes back on spawn
  function detachBot() {
    haltLoop();
    learning = false;
    bot?.removeListener?.('blockUpdate', onBlockUpdate);
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
    saveState();
    if (bot?.entity && !running) startLoop();
    return getStatus();
  }

  function stop() {
    desired.enabled = false;
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
    await depositMinedStone(current);
    await ensureSupplies(current);
    await eatIfHungry(current);
    if (!isCurrent(generation, current)) return false;

    const target = findGrownBlock(current);
    if (!target) {
      phase = 'waiting';
      return false;
    }
    phase = 'mining';
    const pickaxe = findBestUsablePickaxe(current, current.inventory.items());
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
  // bot, as many stacks as it has free slots
  async function depositMinedStone(current) {
    const stacks = () => current.inventory.items().filter(item => MINED_ITEMS.has(item.name));
    const carried = stacks().reduce((sum, item) => sum + item.count, 0);
    if (carried < DEPOSIT_FROM_COUNT || Date.now() < nextHopperAttemptAt) return;
    const hopper = findHopper(current);
    if (!hopper) {
      nextHopperAttemptAt = Date.now() + HOPPER_RETRY_MS;
      log('[Stone Miner] No hopper within reach for the mined stone.');
      return;
    }
    phase = 'depositing';
    try { current.stopDigging?.(); } catch {}
    await current.lookAt(hopper.position.offset(0.5, 0.5, 0.5), true);
    const window = await withTimeout(current.openContainer(hopper), CONTAINER_TIMEOUT_MS, 'The hopper did not open.');
    let full = false;
    try {
      const start = window.inventoryStart;
      for (const stack of window.slots.slice(start, window.inventoryEnd).filter(item => item && MINED_ITEMS.has(item.name))) {
        const destination = window.firstEmptySlotRange(0, start);
        if (destination == null) {
          full = true;
          break;
        }
        await current.moveSlotItem(stack.slot, destination);
      }
    } finally {
      try { current.closeWindow(window); } catch {}
    }
    if (full) nextHopperAttemptAt = Date.now() + HOPPER_RETRY_MS;
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
    const needsFood = !items.some(item => isSafeFood(current, item));
    if (!needsPickaxe && !needsFood && !wornPickaxes.length) return;

    const storage = findStorage(current);
    if (!storage) {
      if (needsPickaxe) throw supplyError('No usable pickaxe, and no chest or barrel within reach.');
      return;
    }
    phase = 'restocking';
    try { current.stopDigging?.(); } catch {}
    await current.lookAt(storage.position.offset(0.5, 0.5, 0.5), true);
    const window = await withTimeout(current.openContainer(storage), CONTAINER_TIMEOUT_MS, 'The chest did not open.');
    try {
      const start = window.inventoryStart;
      const end = window.inventoryEnd;
      const containerItems = () => window.slots.slice(0, start).filter(Boolean);
      const inventoryItems = () => window.slots.slice(start, end).filter(Boolean);
      const emptyContainerSlot = () => window.firstEmptySlotRange(0, start);
      const emptyInventorySlot = () => window.firstEmptySlotRange(start, end);
      const inventorySlotOf = windowSlot => windowSlot - start + 9;

      if (needsPickaxe) {
        const fresh = findBestUsablePickaxe(current, containerItems());
        if (fresh) {
          const worn = inventoryItems().find(item => isPickaxe(item) && !isPickaxeUsable(current, item));
          const destination = worn ? worn.slot : emptyInventorySlot();
          if (destination == null) throw supplyError('The inventory is full, no room for a pickaxe.');
          // Onto a worn pickaxe the two swap places
          await current.moveSlotItem(fresh.slot, destination);
          if (worn) retirePickaxe(worn, inventorySlotOf(destination));
          pickaxeBlocks.set(inventorySlotOf(destination), { blocks: 0, fromFresh: true });
        }
      }
      for (const worn of inventoryItems().filter(item => isPickaxe(item) && !isPickaxeUsable(current, item))) {
        const destination = emptyContainerSlot();
        if (destination == null) break;
        await current.moveSlotItem(worn.slot, destination);
        retirePickaxe(worn, inventorySlotOf(worn.slot));
      }
      if (needsFood) {
        const food = containerItems().find(item => isSafeFood(current, item));
        const destination = emptyInventorySlot();
        if (food && destination != null) await current.moveSlotItem(food.slot, destination);
      }
    } finally {
      try { current.closeWindow(window); } catch {}
    }
    if (!findBestUsablePickaxe(current, current.inventory.items())) {
      throw supplyError('No usable pickaxe in the bot inventory or the nearby chest.');
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
