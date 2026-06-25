'use strict';

/**
 * Obsidian Farm Module
 *
 * Cycle:
 *   1. Find nearest lava cauldron (within maxCauldronDist blocks)
 *   2. Navigate to it, fill an empty bucket with lava
 *   3. Navigate to target (x, y, z), pour lava there
 *   4. Wait for the lava to become obsidian (water must already be present)
 *   5. Equip best available pickaxe, mine the obsidian
 *   6. Repeat
 *
 * Requires mineflayer-pathfinder to be loaded as a bot plugin before start().
 */

const { Movements, pathfinder } = require('mineflayer-pathfinder');
const { GoalNear }              = require('mineflayer-pathfinder').goals;
const Vec3                      = require('vec3');
const fs                        = require('fs');

// ── Constants ──────────────────────────────────────────────────────────────────
const PICKAXE_PRIORITY = [
  'netherite_pickaxe',
  'diamond_pickaxe',
];

const OBSIDIAN_TIMEOUT_MS   = 90_000; // max wait for lava→obsidian
const CYCLE_PAUSE_MS        = 10;     // yield briefly between cycles
const INTERACT_SETTLE_MS    = 25;     // settle delay after block interaction
const DEFAULT_CAULDRON_DIST = 5;
const MIN_PICKAXE_REMAINING_PERCENT = 5;
const FARM_CONFIG_FILE = 'obsidian_farm_config.json';
const FARM_DEBUG_LOG_FILE = 'obsidian_farm_debug.log';
const MAX_INTERACT_DISTANCE = 4.25;
const OBSIDIAN_DIG_BASE_HOLD_MS = 1_750;
const OBSIDIAN_DIG_RETRY_HOLD_BONUS_MS = 250;
const OBSIDIAN_DIG_CONFIRM_TIMEOUT_MS = 700;
const OBSIDIAN_DIG_STABILITY_MS = 50;
const OBSIDIAN_DIG_MAX_ATTEMPTS = 3;
const CAULDRON_FILL_ATTEMPTS_PER_BLOCK = 2;
const CAULDRON_FILL_CONFIRM_TIMEOUT_MS = 200;
// Wait generously for the server/chunk update. This does not resend the bucket
// action, so a slow response cannot cause placement at a second location.
const LAVA_PLACEMENT_CONFIRM_TIMEOUT_MS = 5_000;
const FARM_RETRY_DELAY_MS = 2_000;
const SUPPLY_RETRY_DELAY_MS = 10_000;
const PLACEMENT_RECHECK_DELAY_MS = 750;
const LOW_PICKAXE_DURABILITY_CODE = 'LOW_PICKAXE_DURABILITY';
const RESOURCE_EXHAUSTED_CODE = 'RESOURCE_EXHAUSTED';
const PLACEMENT_RECHECK_CODE = 'PLACEMENT_STATE_RECHECK';
const SUPPLY_BARREL_RADIUS = 5;
const FOOD_ITEM_PARTS = [
  'bread',
  'apple',
  'beef',
  'steak',
  'porkchop',
  'carrot',
  'baked_potato'
];
// ── Internal state ─────────────────────────────────────────────────────────────
const farm = {
  enabled:         false,
  config:          null,
  phase:           'idle', // idle | seeking | filling | navigating | pouring | waiting | mining
  loopHandle:      null,
  cyclesCompleted: 0,
  lastErrorMessage: null,
};
const runtime = {
  onMined: async () => {},
  onPickaxeRetired: async () => {},
  onSuppliesChanged: async () => {},
  onFatalStop: async () => {}
};
let worldInteractionQueue = Promise.resolve();
const pickaxeBlocksMined = new Map();

// ── Exported helpers ───────────────────────────────────────────────────────────

/** Return a plain-object snapshot of current farm state (safe to JSON.stringify). */
function getStatus() {
  return {
    enabled:         farm.enabled,
    phase:           farm.phase,
    cyclesCompleted: farm.cyclesCompleted,
    lastErrorMessage: farm.lastErrorMessage,
    config:          farm.config ? { ...farm.config } : null,
  };
}

/** Set and persist target coordinates. The cauldron radius is always 5 blocks. */
function configure(x, y, z) {
  farm.config = {
    x:               Math.round(Number(x)),
    y:               Math.round(Number(y)),
    z:               Math.round(Number(z)),
    maxCauldronDist: DEFAULT_CAULDRON_DIST,
  };
  saveFarmConfig();
}

function resetConfig() {
  stop(null);
  farm.config = null;
  try {
    if (fs.existsSync(FARM_CONFIG_FILE)) fs.unlinkSync(FARM_CONFIG_FILE);
  } catch (_) {}
}

/** Load pathfinder plugin into a freshly created bot. Call once from createBot(). */
function loadPlugin(bot) {
  try {
    if (!bot.pathfinder) bot.loadPlugin(pathfinder);
  } catch (_) {}
}

function saveFarmConfig() {
  try {
    const payload = farm.config
      ? {
          x: farm.config.x,
          y: farm.config.y,
          z: farm.config.z,
          maxCauldronDist: DEFAULT_CAULDRON_DIST,
        }
      : null;
    fs.writeFileSync(FARM_CONFIG_FILE, JSON.stringify(payload, null, 2), 'utf8');
  } catch (_) {}
}

function loadFarmConfig() {
  try {
    if (!fs.existsSync(FARM_CONFIG_FILE)) return;
    const raw = fs.readFileSync(FARM_CONFIG_FILE, 'utf8');
    if (!raw || !raw.trim()) return;

    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return;

    const x = Number(parsed.x);
    const y = Number(parsed.y);
    const z = Number(parsed.z);
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return;

    farm.config = {
      x: Math.round(x),
      y: Math.round(y),
      z: Math.round(z),
      maxCauldronDist: DEFAULT_CAULDRON_DIST,
    };
  } catch (_) {}
}

// ── Internal helpers ───────────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function withWorldInteractionLock(action) {
  const result = worldInteractionQueue.then(action, action);
  worldInteractionQueue = result.catch(() => {});
  return result;
}

function isReplaceableForLava(block) {
  if (!block) return true;
  const replaceable = new Set([
    'air', 'cave_air', 'void_air',
    'water', 'lava',
    'short_grass', 'tall_grass', 'fern', 'large_fern',
    'seagrass', 'tall_seagrass', 'snow'
  ]);
  return replaceable.has(block.name);
}

function getConfiguredTargetPos() {
  const { x, y, z } = farm.config;
  return new Vec3(x, y, z);
}

function configureRuntime(hooks = {}) {
  if (typeof hooks.onMined === 'function') runtime.onMined = hooks.onMined;
  if (typeof hooks.onPickaxeRetired === 'function') runtime.onPickaxeRetired = hooks.onPickaxeRetired;
  if (typeof hooks.onSuppliesChanged === 'function') runtime.onSuppliesChanged = hooks.onSuppliesChanged;
  if (typeof hooks.onFatalStop === 'function') runtime.onFatalStop = hooks.onFatalStop;
}

function summarizeSupplyItems(bot, items) {
  const food = {};
  const pickaxes = [];
  const allItems = [];

  for (const item of items) {
    const maxDurability = getItemMaxDurability(bot, item);
    const remainingPercent = maxDurability
      ? getRemainingDurabilityPercent(bot, item)
      : null;
    allItems.push({
      name: item.name,
      count: item.count,
      remainingPercent,
      usable: PICKAXE_PRIORITY.includes(item.name)
        ? isPickaxeUsable(bot, item)
        : null
    });
    if (isFoodItem(item)) {
      food[item.name] = (food[item.name] || 0) + item.count;
    }
    if (PICKAXE_PRIORITY.includes(item.name)) {
      pickaxes.push({
        name: item.name,
        remainingPercent: getRemainingDurabilityPercent(bot, item),
        usable: isPickaxeUsable(bot, item)
      });
    }
  }

  return {
    food,
    foodCount: Object.values(food).reduce((sum, count) => sum + count, 0),
    pickaxes,
    usablePickaxeCount: pickaxes.filter(pickaxe => pickaxe.usable).length,
    allItems
  };
}

function findReachableSupplyBarrel(bot) {
  if (!bot?.entity) return null;
  const barrelId = bot.registry.blocksByName.barrel?.id;
  if (barrelId == null) return null;

  const positions = bot.findBlocks({
    matching: barrelId,
    maxDistance: SUPPLY_BARREL_RADIUS,
    count: 16
  });
  const position = positions.find(candidate => {
    const clickPoint = candidate.offset(0.5, 0.5, 0.5);
    return bot.entity.position.distanceTo(clickPoint) <= MAX_INTERACT_DISTANCE;
  });
  return position ? bot.blockAt(position) : null;
}

async function prepareSafeBarrelHand(bot) {
  if (bot.heldItem?.name === 'lava_bucket') {
    throw createPlacementSafetyError(
      'Barrel access blocked: lava must be placed at the configured target first.'
    );
  }

  const safeItem = findUsablePickaxe(bot, MIN_PICKAXE_REMAINING_PERCENT)?.item ||
    bot.inventory.items().find(item => item.name !== 'lava_bucket' && item.name !== 'bucket');
  if (safeItem && bot.heldItem?.name !== safeItem.name) {
    await bot.equip(safeItem, 'hand');
    await waitForHeldItem(bot, safeItem.name);
  }

  if (bot.heldItem?.name === 'lava_bucket') {
    throw createPlacementSafetyError(
      'Barrel access blocked: lava bucket was re-equipped before interaction.'
    );
  }
}

async function inspectSupplyStatusUnlocked(bot) {
  const inventory = summarizeSupplyItems(bot, bot.inventory.items());
  const barrel = findReachableSupplyBarrel(bot);
  if (!barrel) {
    return { inventory, barrel: null, barrelError: 'Not found within 5 blocks' };
  }

  let container = null;
  try {
    await prepareSafeBarrelHand(bot);
    stopAllMovement(bot);
    container = await bot.openContainer(barrel);
    return {
      inventory,
      barrel: {
        position: barrel.position.toString(),
        distance: bot.entity.position.distanceTo(barrel.position.offset(0.5, 0.5, 0.5)),
        ...summarizeSupplyItems(bot, container.containerItems())
      },
      barrelError: null
    };
  } catch (err) {
    return {
      inventory,
      barrel: {
        position: barrel.position.toString(),
        distance: bot.entity.position.distanceTo(barrel.position.offset(0.5, 0.5, 0.5))
      },
      barrelError: err.message
    };
  } finally {
    if (container) {
      try { container.close(); } catch (_) {}
    }
  }
}

function inspectSupplyStatus(bot) {
  return withWorldInteractionLock(() => inspectSupplyStatusUnlocked(bot));
}

async function getDetailedStatus(bot, options = {}) {
  const status = getStatus();
  if (!bot?.entity || typeof bot.inventory?.items !== 'function') {
    return {
      ...status,
      connected: false,
      supplies: {
        inventory: null,
        barrel: null,
        barrelError: 'Bot is offline or still connecting'
      }
    };
  }

  return {
    ...status,
    connected: true,
    supplies: options.inspectBarrel === false
      ? {
          inventory: summarizeSupplyItems(bot, bot.inventory.items()),
          barrel: options.barrel || null,
          barrelError: options.barrelError || null
        }
      : await inspectSupplyStatus(bot)
  };
}

async function inspectSupplies(bot) {
  if (!bot?.entity) {
    return {
      inventory: null,
      barrel: null,
      barrelError: 'Bot is offline'
    };
  }
  return inspectSupplyStatus(bot);
}

function getKnownBlockAt(bot, pos, label) {
  const block = bot.blockAt(pos);
  if (!block) {
    throw new Error(
      `Cannot inspect ${label} at (${pos.x}, ${pos.y}, ${pos.z}); block is not loaded. ` +
      'Move the bot closer to the farm target.'
    );
  }
  return block;
}

function didLavaPlacementLikelySucceed(bot, x, y, z) {
  const targetBlock = bot.blockAt(new Vec3(x, y, z));
  return targetBlock?.name === 'lava' || targetBlock?.name === 'obsidian';
}

function getFaceCursor(face) {
  return new Vec3(
    0.5 + face.x * 0.5,
    0.5 + face.y * 0.5,
    0.5 + face.z * 0.5
  );
}

function faceVectorToDirection(face) {
  if (face.y < 0) return 0;
  if (face.y > 0) return 1;
  if (face.z < 0) return 2;
  if (face.z > 0) return 3;
  if (face.x < 0) return 4;
  if (face.x > 0) return 5;
  return null;
}

function createPlacementSafetyError(message) {
  const err = new Error(message);
  err.code = PLACEMENT_RECHECK_CODE;
  return err;
}

async function waitForHeldItem(bot, itemName, timeoutMs = 2_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (bot.heldItem?.name === itemName) return;
    await sleep(20);
  }
  throw new Error(`Expected to hold ${itemName}, but holding ${bot.heldItem?.name || 'nothing'}`);
}

async function useBucketOnFace(bot, referenceBlock, face, expectedTarget) {
  const configuredTarget = getConfiguredTargetPos();
  const packetDestination = referenceBlock.position.plus(face);
  const currentReference = bot.blockAt(referenceBlock.position);
  if (
    !expectedTarget?.equals(configuredTarget) ||
    !packetDestination.equals(expectedTarget) ||
    bot.heldItem?.name !== 'lava_bucket' ||
    !currentReference ||
    currentReference.boundingBox !== 'block' ||
    currentReference.type !== referenceBlock.type
  ) {
    throw createPlacementSafetyError(
      'Placement state changed before packet send; refusing to use the lava bucket.'
    );
  }

  const cursor = getFaceCursor(face);
  const hitPoint = referenceBlock.position.offset(cursor.x, cursor.y, cursor.z);
  await bot.lookAt(hitPoint, true);

  const aimedBlock = typeof bot.blockAtCursor === 'function'
    ? bot.blockAtCursor(MAX_INTERACT_DISTANCE + 0.25)
    : null;
  if (
    !aimedBlock?.position?.equals(referenceBlock.position) ||
    aimedBlock.face !== faceVectorToDirection(face)
  ) {
    throw createPlacementSafetyError(
      'Aim changed before bucket use; refusing to use the lava bucket.'
    );
  }

  // This server handles buckets through the ordinary use-item action and
  // ray-traces the face from the included rotation. The ray has just been
  // verified to hit the anchor face whose adjacent block is exactly target.
  bot.activateItem();
}

function getAdjacentBlockDebug(bot, x, y, z) {
  const checks = [
    ['down', 0, -1, 0],
    ['up', 0, 1, 0],
    ['east', 1, 0, 0],
    ['west', -1, 0, 0],
    ['south', 0, 0, 1],
    ['north', 0, 0, -1],
  ];
  return checks
    .map(([name, dx, dy, dz]) => {
      const b = bot.blockAt(new Vec3(x + dx, y + dy, z + dz));
      return `${name}:${b?.name || 'null'}`;
    })
    .join(', ');
}

function getItemMaxDurability(bot, item) {
  if (!item) return null;
  if (typeof item.maxDurability === 'number') return item.maxDurability;
  const reg = bot.registry?.itemsByName?.[item.name];
  return typeof reg?.maxDurability === 'number' ? reg.maxDurability : null;
}

function getItemDurabilityUsed(item) {
  if (!item) return 0;
  if (typeof item.durabilityUsed === 'number') return item.durabilityUsed;
  // Fallback for versions where durability is stored in NBT Damage tag.
  const nbtDamage = item.nbt?.value?.Damage?.value;
  return typeof nbtDamage === 'number' ? nbtDamage : 0;
}

function getRemainingDurabilityPercent(bot, item) {
  const maxDurability = getItemMaxDurability(bot, item);
  if (!maxDurability || maxDurability <= 0) {
    return 100; // Non-damageable or unknown; do not block usage.
  }
  const used = Math.max(0, getItemDurabilityUsed(item));
  const remaining = Math.max(0, maxDurability - used);
  return (remaining / maxDurability) * 100;
}

// Statistics display durability to one decimal place. Use the same precision
// for eligibility so a pickaxe shown as 5.0% is not simultaneously marked low.
function isPickaxeUsable(bot, item) {
  const remainingPercent = getRemainingDurabilityPercent(bot, item);
  return Number(remainingPercent.toFixed(1)) >= MIN_PICKAXE_REMAINING_PERCENT;
}

function findUsablePickaxe(bot, minRemainingPercent) {
  const items = bot.inventory.items();
  for (const name of PICKAXE_PRIORITY) {
    const candidates = items.filter(i => i.name === name);
    if (candidates.length === 0) continue;

    let bestCandidate = null;
    let bestPercent = -1;
    for (const item of candidates) {
      const percent = getRemainingDurabilityPercent(bot, item);
      if (percent > bestPercent) {
        bestPercent = percent;
        bestCandidate = item;
      }
    }

    if (
      bestCandidate &&
      Number(bestPercent.toFixed(1)) >= minRemainingPercent
    ) {
      return { item: bestCandidate, remainingPercent: bestPercent };
    }
  }

  return null;
}

function getPickaxeTrackingKey(item) {
  return item ? `${item.name}:${item.slot}` : null;
}

function findBestPickaxe(bot) {
  let best = null;
  for (const item of bot.inventory.items()) {
    if (!PICKAXE_PRIORITY.includes(item.name)) continue;
    const remainingPercent = getRemainingDurabilityPercent(bot, item);
    if (!best || remainingPercent > best.remainingPercent) {
      best = { item, remainingPercent };
    }
  }
  return best;
}

function createLowDurabilityError(percent) {
  const err = new Error(
    `Best diamond/netherite pickaxe has ${percent.toFixed(1)}% durability ` +
    `(minimum required: at least ${MIN_PICKAXE_REMAINING_PERCENT}%).`
  );
  err.code = LOW_PICKAXE_DURABILITY_CODE;
  return err;
}

function isFoodItem(item) {
  return Boolean(item?.name) && FOOD_ITEM_PARTS.some(part => item.name.includes(part));
}

function createResourceExhaustedError(missing) {
  const err = new Error(
    `No usable ${missing.join(' or ')} left in the bot inventory or nearby barrel.`
  );
  err.code = RESOURCE_EXHAUSTED_CODE;
  return err;
}

function findBestUsablePickaxeInItems(bot, items) {
  let best = null;
  for (const item of items) {
    if (!PICKAXE_PRIORITY.includes(item.name)) continue;
    const remainingPercent = getRemainingDurabilityPercent(bot, item);
    if (!isPickaxeUsable(bot, item)) continue;
    if (!best || remainingPercent > best.remainingPercent) {
      best = { item, remainingPercent };
    }
  }
  return best;
}

function windowHasUsablePickaxe(bot, container) {
  for (let slot = container.inventoryStart; slot < container.inventoryEnd; slot++) {
    const item = container.slots[slot];
    if (
      item &&
      PICKAXE_PRIORITY.includes(item.name) &&
      isPickaxeUsable(bot, item)
    ) {
      return true;
    }
  }
  return false;
}

function getContainerInventorySlot(bot, container, inventoryItem) {
  const slotOffset = container.inventoryStart - bot.inventory.inventoryStart;
  const slot = inventoryItem.slot + slotOffset;
  if (slot < container.inventoryStart || slot >= container.inventoryEnd) {
    throw new Error(`Inventory slot ${inventoryItem.slot} cannot be mapped into the open barrel.`);
  }
  return slot;
}

async function swapPickaxesInExactSlots(bot, container, replacement, wornPickaxe) {
  const barrelSlot = replacement.item.slot;
  const inventorySlot = getContainerInventorySlot(bot, container, wornPickaxe);
  const barrelItem = container.slots[barrelSlot];
  const inventoryItem = container.slots[inventorySlot];

  if (!barrelItem || barrelItem.type !== replacement.item.type) {
    throw new Error(`Replacement pickaxe slot ${barrelSlot} changed before swap.`);
  }
  if (!inventoryItem || inventoryItem.type !== wornPickaxe.type) {
    throw new Error(`Worn pickaxe slot ${wornPickaxe.slot} changed before swap.`);
  }

  const hotbarIndex = wornPickaxe.slot - bot.inventory.hotbarStart;
  if (hotbarIndex >= 0 && hotbarIndex < 9) {
    // A mode-2 hotbar swap is one atomic server action. This is substantially
    // safer than three cursor clicks on servers that resynchronise container
    // state between clicks.
    await bot.clickWindow(barrelSlot, hotbarIndex, 2);
  } else {
    // Pick up the good pickaxe, exchange it with the worn inventory pickaxe,
    // then put the worn pickaxe into the exact barrel slot that was freed.
    await bot.clickWindow(barrelSlot, 0, 0);
    await bot.clickWindow(inventorySlot, 0, 0);
    await bot.clickWindow(barrelSlot, 0, 0);
  }

  // Give a server correction packet a chance to arrive before accepting
  // Mineflayer's optimistic local window update as the final state.
  await new Promise(resolve => setTimeout(resolve, 250));

  const swapped = await waitForInventorySupply(
    bot,
    () => {
      const newBarrelItem = container.slots[barrelSlot];
      const newInventoryItem = container.slots[inventorySlot];
      return Boolean(
        newBarrelItem &&
        newBarrelItem.type === wornPickaxe.type &&
        !isPickaxeUsable(bot, newBarrelItem) &&
        newInventoryItem &&
        newInventoryItem.type === replacement.item.type &&
        isPickaxeUsable(bot, newInventoryItem) &&
        !container.selectedItem
      );
    },
    2_000
  );
  if (!swapped) {
    throw new Error(
      `Server did not swap barrel slot ${barrelSlot} with inventory slot ${wornPickaxe.slot}.`
    );
  }
}

async function withdrawPickaxeFromExactSlot(bot, container, pickaxe) {
  const sourceSlot = pickaxe.item.slot;
  const sourceBefore = container.slots[sourceSlot];
  if (!sourceBefore || sourceBefore.type !== pickaxe.item.type) {
    throw new Error(`Pickaxe source slot ${sourceSlot} changed before withdrawal.`);
  }

  // Shift-click the exact container slot. Generic container.withdraw() searches
  // again by type/NBT and can select the wrong unstackable item in custom
  // server containers containing many otherwise identical pickaxes.
  await bot.clickWindow(sourceSlot, 0, 1);

  const moved = await waitForInventorySupply(
    bot,
    () => {
      const sourceAfter = container.slots[sourceSlot];
      const sourceChanged =
        !sourceAfter ||
        sourceAfter.type !== sourceBefore.type ||
        sourceAfter.count < sourceBefore.count;
      return sourceChanged && windowHasUsablePickaxe(bot, container);
    },
    2_000
  );
  if (!moved) {
    throw new Error(`Server did not move the pickaxe from barrel slot ${sourceSlot}.`);
  }
}

async function waitForInventorySupply(bot, predicate, timeoutMs = 2_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return true;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  return predicate();
}

async function ensureFarmSupplies(bot) {
  const hasUsablePickaxe = Boolean(findUsablePickaxe(bot, MIN_PICKAXE_REMAINING_PERCENT));
  const hasFood = bot.inventory.items().some(isFoodItem);
  const lowPickaxes = bot.inventory.items().filter(item =>
    PICKAXE_PRIORITY.includes(item.name) &&
    !isPickaxeUsable(bot, item)
  );
  // Window swaps mutate Item.slot in place. Preserve each inventory tracking
  // key before a worn pickaxe is moved into the barrel.
  const lowPickaxeTrackingKeys = new Map(
    lowPickaxes.map(item => [item, getPickaxeTrackingKey(item)])
  );
  if (hasUsablePickaxe && hasFood && lowPickaxes.length === 0) return;

  const barrel = findReachableSupplyBarrel(bot);
  if (!barrel) {
    const missing = [];
    if (!hasUsablePickaxe) missing.push('pickaxe');
    if (!hasFood) missing.push('food');
    if (lowPickaxes.length > 0) missing.push('barrel access for worn pickaxe deposit');
    throw createResourceExhaustedError(missing);
  }

  ensureInteractionRange(bot, barrel.position.offset(0.5, 0.5, 0.5), 'Supply barrel');
  stopAllMovement(bot);

  let container = null;
  let pickaxeWasAvailable = false;
  let foodWasAvailable = false;
  let pickaxeChanged = false;
  try {
    await prepareSafeBarrelHand(bot);
    container = await bot.openContainer(barrel);
    let containerItems = container.containerItems();
    let swappedLowPickaxe = null;

    if (!hasUsablePickaxe) {
      const pickaxe = findBestUsablePickaxeInItems(bot, containerItems);
      if (pickaxe) {
        pickaxeWasAvailable = true;
        if (lowPickaxes.length > 0) {
          swappedLowPickaxe = lowPickaxes[0];
          await swapPickaxesInExactSlots(bot, container, pickaxe, swappedLowPickaxe);
          pickaxeChanged = true;
          writeFarmDebug('pickaxe_swapped', {
            receivedItem: pickaxe.item.name,
            retiredItem: swappedLowPickaxe.name,
            barrelSlot: pickaxe.item.slot,
            inventorySlot: swappedLowPickaxe.slot,
            receivedRemainingPercent: Number(pickaxe.remainingPercent.toFixed(1)),
            retiredRemainingPercent: Number(
              getRemainingDurabilityPercent(bot, swappedLowPickaxe).toFixed(1)
            ),
            barrel: barrel.position.toString()
          });
        } else {
          await withdrawPickaxeFromExactSlot(bot, container, pickaxe);
          pickaxeChanged = true;
          writeFarmDebug('supply_withdrawn', {
            item: pickaxe.item.name,
            count: 1,
            sourceSlot: pickaxe.item.slot,
            remainingPercent: Number(pickaxe.remainingPercent.toFixed(1)),
            barrel: barrel.position.toString()
          });
        }
      }
    }

    for (const lowPickaxe of lowPickaxes) {
      const trackingKey =
        lowPickaxeTrackingKeys.get(lowPickaxe) ||
        getPickaxeTrackingKey(lowPickaxe);
      const tracking = pickaxeBlocksMined.get(trackingKey);
      const blocksMined = tracking?.blocks || 0;
      if (lowPickaxe !== swappedLowPickaxe) {
        await container.deposit(
          lowPickaxe.type,
          lowPickaxe.metadata,
          lowPickaxe.count,
          lowPickaxe.nbt
        );
      }
      pickaxeBlocksMined.delete(trackingKey);
      await runtime.onPickaxeRetired({
        name: lowPickaxe.name,
        blocksMined,
        countInAverage: Boolean(tracking?.trackedFromFull),
        remainingPercent: getRemainingDurabilityPercent(bot, lowPickaxe)
      });
      writeFarmDebug('pickaxe_retired', {
        item: lowPickaxe.name,
        blocksMined,
        remainingPercent: Number(getRemainingDurabilityPercent(bot, lowPickaxe).toFixed(1)),
        barrel: barrel.position.toString()
      });
    }

    containerItems = container.containerItems();
    if (!hasFood) {
      const food = containerItems.find(isFoodItem);
      if (food) {
        foodWasAvailable = true;
        await container.withdraw(food.type, food.metadata, food.count, food.nbt);
        writeFarmDebug('supply_withdrawn', {
          item: food.name,
          count: food.count,
          barrel: barrel.position.toString()
        });
      }
    }

    if (pickaxeChanged) {
      const suppliesSnapshot = {
        reason: 'pickaxe_changed',
        inventory: summarizeSupplyItems(bot, bot.inventory.items()),
        barrel: {
          position: barrel.position.toString(),
          distance: bot.entity.position.distanceTo(barrel.position.offset(0.5, 0.5, 0.5)),
          ...summarizeSupplyItems(bot, container.containerItems())
        },
        barrelError: null
      };
      runtime.onSuppliesChanged(suppliesSnapshot).catch(err => {
        writeFarmDebug('supply_stats_refresh_failed', { error: err.message });
      });
    }
  } finally {
    if (container) {
      try { container.close(); } catch (_) {}
    }
  }

  if (!hasUsablePickaxe && pickaxeWasAvailable) {
    await waitForInventorySupply(
      bot,
      () => Boolean(findUsablePickaxe(bot, MIN_PICKAXE_REMAINING_PERCENT))
    );
  }
  if (!hasFood && foodWasAvailable) {
    await waitForInventorySupply(bot, () => bot.inventory.items().some(isFoodItem));
  }

  const missing = [];
  if (!findUsablePickaxe(bot, MIN_PICKAXE_REMAINING_PERCENT)) missing.push('pickaxe');
  if (!bot.inventory.items().some(isFoodItem)) missing.push('food');
  if (missing.length > 0) {
    const unavailable = missing.filter(name =>
      (name === 'pickaxe' && !pickaxeWasAvailable) ||
      (name === 'food' && !foodWasAvailable)
    );
    if (unavailable.length === 0) {
      const err = new Error(
        `Supply withdrawal is still syncing for ${missing.join(' and ')}. Retrying without stopping the farm.`
      );
      err.code = 'SUPPLY_SYNC_RETRY';
      throw err;
    }
    throw createResourceExhaustedError(unavailable);
  }
}

async function prepareStart(bot) {
  if (!bot?.entity) throw new Error('Bot is offline.');
  await ensureFarmSupplies(bot);
  return inspectSupplyStatus(bot);
}

/**
 * Navigate to within `range` blocks of (x, y, z).
 * Throws if pathfinder is unavailable or navigation fails.
 */
async function goNear(bot, x, y, z, range = 2) {
  if (!bot.pathfinder) throw new Error('Pathfinder plugin not loaded');
  const movements = new Movements(bot);
  movements.canDig = false; // never dig during navigation
  bot.pathfinder.setMovements(movements);
  await bot.pathfinder.goto(new GoalNear(x, y, z, range));
}

function stopAllMovement(bot) {
  try {
    if (bot.pathfinder) {
      bot.pathfinder.setGoal(null);
      bot.pathfinder.stop();
    }
  } catch (_) {}

  if (typeof bot.clearControlStates === 'function') {
    bot.clearControlStates();
  }
}

function ensureInteractionRange(bot, pos, actionName) {
  const dist = bot.entity?.position?.distanceTo(pos);
  if (!Number.isFinite(dist) || dist > MAX_INTERACT_DISTANCE) {
    throw new Error(
      `${actionName} is too far (${Number.isFinite(dist) ? dist.toFixed(2) : 'unknown'} blocks). ` +
      'Stationary mode is enabled: move bot manually closer.'
    );
  }
}

function writeFarmDebug(event, details = {}) {
  const line = JSON.stringify({
    time: new Date().toISOString(),
    event,
    ...details
  });
  // Debug logging must not block the time-sensitive farming loop, especially
  // when the project directory is synced by OneDrive.
  fs.appendFile(FARM_DEBUG_LOG_FILE, `${line}\n`, 'utf8', () => {});
}

function getMiningDebugState(bot, block, attempt, expectedDigTime, holdMs, face) {
  const held = bot.heldItem;
  const effects = Object.values(bot.entity?.effects || {}).map(effect => ({
    id: effect.id,
    amplifier: effect.amplifier,
    duration: effect.duration
  }));

  return {
    attempt,
    target: block.position.toString(),
    block: block.name,
    expectedDigTimeMs: expectedDigTime,
    holdMs,
    face,
    heldItem: held?.name || null,
    heldItemCount: held?.count ?? null,
    enchantments: held?.enchants || held?.enchantments || [],
    durabilityUsed: held?.durabilityUsed ?? null,
    effects,
    botPosition: bot.entity?.position?.toString() || null,
    distance: bot.entity?.position
      ? Number(bot.entity.position.distanceTo(block.position.offset(0.5, 0.5, 0.5)).toFixed(3))
      : null,
    gameMode: bot.game?.gameMode || null,
    protocolVersion: bot.version || null
  };
}

async function digBlockWithTimeout(bot, block, attempt) {
  const expectedDigTime = typeof bot.digTime === 'function' ? bot.digTime(block) : null;
  if (!Number.isFinite(expectedDigTime)) {
    throw new Error(`Cannot calculate dig time for ${block.name}`);
  }

  const holdMs = OBSIDIAN_DIG_BASE_HOLD_MS + ((attempt - 1) * OBSIDIAN_DIG_RETRY_HOLD_BONUS_MS);
  const center = block.position.offset(0.5, 0.5, 0.5);
  await bot.lookAt(center, true);

  const aimedBlock = typeof bot.blockAtCursor === 'function' ? bot.blockAtCursor(MAX_INTERACT_DISTANCE + 0.75) : null;
  if (!aimedBlock?.position?.equals(block.position)) {
    throw new Error(
      `Cannot keep obsidian at (${block.position.x}, ${block.position.y}, ${block.position.z}) in sight while mining.`
    );
  }

  const face = Number.isInteger(aimedBlock.face) ? aimedBlock.face : 1;
  const startedAt = Date.now();
  writeFarmDebug('dig_start', {
    ...getMiningDebugState(bot, block, attempt, expectedDigTime, holdMs, face),
    measuredManualDigTimeMs: 2_500,
    timingSource: attempt === 1 ? 'manual_server_measurement' : 'manual_server_measurement_with_retry_bonus'
  });

  const eventName = `blockUpdate:${block.position}`;
  let completed = false;
  let onBlockUpdate = null;

  const serverConfirmation = new Promise(resolve => {
    onBlockUpdate = (_oldBlock, newBlock) => {
      writeFarmDebug('server_block_update', {
        attempt,
        elapsedMs: Date.now() - startedAt,
        oldBlock: _oldBlock?.name || null,
        newBlock: newBlock?.name || null
      });
      if (!newBlock || newBlock.name === 'obsidian') return;
      completed = true;
      resolve(newBlock.name);
    };

    bot.on(eventName, onBlockUpdate);
  });

  function cleanup() {
    if (onBlockUpdate) bot.removeListener(eventName, onBlockUpdate);
  }

  try {
    bot._client.write('block_dig', {
      status: 0,
      location: block.position,
      face
    });
    bot.swingArm();

    const firstResult = await Promise.race([
      serverConfirmation.then(blockName => ({ type: 'server', blockName })),
      sleep(holdMs).then(() => ({ type: 'timer' }))
    ]);
    if (!farm.enabled) throw new Error('farm_stopped');

    writeFarmDebug('dig_finish_sent', {
      attempt,
      elapsedMs: Date.now() - startedAt,
      reason: firstResult.type === 'server' ? `server_${firstResult.blockName}` : 'hold_timer',
      blockBeforeFinish: bot.blockAt(block.position)?.name || null
    });
    bot._client.write('block_dig', {
      status: 2,
      location: block.position,
      face
    });

    if (firstResult.type === 'timer') {
      await Promise.race([
        serverConfirmation,
        sleep(OBSIDIAN_DIG_CONFIRM_TIMEOUT_MS).then(() => {
          throw new Error('server_did_not_confirm_break');
        })
      ]);
    }

    cleanup();
    await sleep(OBSIDIAN_DIG_STABILITY_MS);

    const resultingBlock = bot.blockAt(block.position)?.name || null;
    if (resultingBlock === 'obsidian') {
      writeFarmDebug('dig_reverted', {
        attempt,
        elapsedMs: Date.now() - startedAt,
        resultingBlock
      });
      throw new Error('server_did_not_confirm_break');
    }

    writeFarmDebug('dig_confirmed', {
      attempt,
      elapsedMs: Date.now() - startedAt,
      resultingBlock
    });
  } catch (err) {
    cleanup();
    writeFarmDebug('dig_failed', {
      attempt,
      elapsedMs: Date.now() - startedAt,
      error: err.message,
      currentBlock: bot.blockAt(block.position)?.name || null,
      heldItem: bot.heldItem?.name || null
    });
    if (!completed) {
      bot._client.write('block_dig', {
        status: 1,
        location: block.position,
        face
      });
    }
    throw err;
  } finally {
    cleanup();
  }
}

/**
 * Find the nearest lava cauldron block.
 * Handles both 1.17+ (lava_cauldron block) and old cauldron with metadata ≥ 3.
 */
function findLavaCauldrons(bot, maxDistance) {
  const positions = [];

  // Modern: dedicated lava_cauldron block
  const modernId = bot.registry.blocksByName['lava_cauldron']?.id;
  if (modernId != null) {
    positions.push(...bot.findBlocks({
      matching: modernId,
      maxDistance,
      count: 64
    }));
  }

  // Legacy: cauldron block with data value 3 (full of liquid — assumed lava in context)
  const legacyId = bot.registry.blocksByName['cauldron']?.id;
  if (legacyId != null) {
    positions.push(...bot.findBlocks({
      matching: b => b.type === legacyId && b.metadata === 3,
      maxDistance,
      count: 64,
      useExtraInfo: true
    }));
  }

  const unique = new Map();
  for (const pos of positions) unique.set(pos.toString(), pos);

  return [...unique.values()]
    .sort((a, b) => bot.entity.position.distanceSquared(a) - bot.entity.position.distanceSquared(b));
}

async function waitForLavaBucket(bot, timeoutMs = CAULDRON_FILL_CONFIRM_TIMEOUT_MS) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const lavaBucket = bot.inventory.items().find(i => i.name === 'lava_bucket');
    if (lavaBucket) return lavaBucket;
    await sleep(25);
  }
  return null;
}

async function waitForLavaPlacement(bot, x, y, z, timeoutMs = LAVA_PLACEMENT_CONFIRM_TIMEOUT_MS) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (didLavaPlacementLikelySucceed(bot, x, y, z)) return true;
    await sleep(25);
  }
  return didLavaPlacementLikelySucceed(bot, x, y, z);
}

// ── Phase implementations ──────────────────────────────────────────────────────

/** Phase 1+2: find cauldron and fill empty bucket with lava. */
async function fillBucket(bot) {
  const { maxCauldronDist } = farm.config;

  farm.phase = 'seeking';
  const cauldronPositions = findLavaCauldrons(bot, maxCauldronDist);
  if (cauldronPositions.length === 0) {
    throw new Error(
      `No lava cauldron found within ${maxCauldronDist} blocks. ` +
      'Place a lava cauldron nearby and retry.'
    );
  }

  farm.phase = 'filling';
  stopAllMovement(bot);
  const failures = [];

  for (const position of cauldronPositions) {
    for (let attempt = 1; attempt <= CAULDRON_FILL_ATTEMPTS_PER_BLOCK; attempt++) {
      const cauldron = bot.blockAt(position);
      const isModernLavaCauldron = cauldron?.name === 'lava_cauldron';
      const isLegacyLavaCauldron = cauldron?.name === 'cauldron' && cauldron.metadata === 3;
      if (!isModernLavaCauldron && !isLegacyLavaCauldron) {
        failures.push(`${position}:became_${cauldron?.name || 'unknown'}`);
        writeFarmDebug('cauldron_skipped', {
          position: position.toString(),
          reason: `became_${cauldron?.name || 'unknown'}`
        });
        break;
      }

      const clickPoint = position.offset(0.5, 0.8, 0.5);
      const distance = bot.entity?.position?.distanceTo(clickPoint);
      if (!Number.isFinite(distance) || distance > maxCauldronDist) {
        failures.push(`${position}:outside_configured_radius_${Number.isFinite(distance) ? distance.toFixed(2) : 'unknown'}`);
        writeFarmDebug('cauldron_skipped', {
          position: position.toString(),
          reason: 'outside_configured_radius',
          configuredRadius: maxCauldronDist,
          distance: Number.isFinite(distance) ? Number(distance.toFixed(2)) : null
        });
        break;
      }

      const emptyBucket = bot.inventory.items().find(i => i.name === 'bucket');
      if (!emptyBucket) {
        if (bot.inventory.items().some(i => i.name === 'lava_bucket')) return;
        throw new Error('No empty bucket in inventory');
      }

      await bot.equip(emptyBucket, 'hand');
      await waitForHeldItem(bot, 'bucket');
      await bot.lookAt(clickPoint, true);
      await sleep(25);

      try {
        await bot.activateBlock(cauldron);
      } catch (err) {
        failures.push(`${position}:click#${attempt}_${err.message}`);
        continue;
      }

      if (await waitForLavaBucket(bot)) {
        writeFarmDebug('cauldron_filled', {
          position: position.toString(),
          attempt,
          candidates: cauldronPositions.length
        });
        return;
      }

      failures.push(`${position}:no_lava_bucket#${attempt}`);
      writeFarmDebug('cauldron_fill_failed', {
        position: position.toString(),
        attempt,
        currentBlock: bot.blockAt(position)?.name || null,
        heldItem: bot.heldItem?.name || null
      });
    }
  }

  throw new Error(
    `Could not fill bucket from ${cauldronPositions.length} lava cauldron(s) within ${maxCauldronDist} blocks. ` +
    `Attempts: ${failures.slice(0, 8).join(' | ')}`
  );
}

/** Phase 3+4: navigate to target, place lava. */
async function pourLava(bot, targetPos) {
  const { x, y, z } = targetPos;

  farm.phase = 'navigating';
  stopAllMovement(bot);
  ensureInteractionRange(bot, new Vec3(x + 0.5, y + 0.5, z + 0.5), 'Lava placement');

  farm.phase = 'pouring';
  const lavaBucket = bot.inventory.items().find(i => i.name === 'lava_bucket');
  if (!lavaBucket) throw new Error('Lava bucket disappeared before pouring');

  const targetBlock = getKnownBlockAt(bot, targetPos, 'lava placement target');
  if (!isReplaceableForLava(targetBlock) && targetBlock.name !== 'lava') {
    throw new Error(`Cannot place lava at (${x}, ${y}, ${z}); target contains ${targetBlock.name}`);
  }

  await bot.equip(lavaBucket, 'hand');
  await waitForHeldItem(bot, 'lava_bucket');
  await sleep(INTERACT_SETTLE_MS);

  // The farm has one allow-listed placement surface: the west face of the
  // smooth-stone block at X + 1. That face points exactly into target.
  const ref = {
    label: 'east',
    face: new Vec3(-1, 0, 0),
    block: bot.blockAt(new Vec3(x + 1, y, z))
  };
  if (
    ref.block?.name !== 'smooth_stone' ||
    ref.block.boundingBox !== 'block' ||
    !ref.block.position.plus(ref.face).equals(targetPos)
  ) {
    throw createPlacementSafetyError(
      `Required smooth_stone anchor is missing at (${x + 1}, ${y}, ${z}); refusing bucket use.`
    );
  }

  const cursor = getFaceCursor(ref.face);
  const hitPoint = ref.block.position.offset(cursor.x, cursor.y, cursor.z);
  const clickDistance = bot.entity?.position?.distanceTo(hitPoint);
  if (!Number.isFinite(clickDistance) || clickDistance > MAX_INTERACT_DISTANCE) {
    throw createPlacementSafetyError(
      `Required smooth_stone west face is out of reach for target (${x}, ${y}, ${z}).`
    );
  }

  await bot.lookAt(hitPoint, true);
  await sleep(25);

  const aimedBlock = typeof bot.blockAtCursor === 'function'
    ? bot.blockAtCursor(MAX_INTERACT_DISTANCE + 0.25)
    : null;
  if (
    !aimedBlock?.position?.equals(ref.block.position) ||
    aimedBlock.face !== faceVectorToDirection(ref.face)
  ) {
    throw createPlacementSafetyError(
      `Cannot see the required smooth_stone west face for (${x}, ${y}, ${z}); refusing bucket use.`
    );
  }

  // Sneak prevents activation of the anchor. There is one verified use-item
  // action and deliberately no retry or second anchor after packet send.
  let placementError = null;
  try {
    bot.setControlState('sneak', true);
    await sleep(50);
    await useBucketOnFace(bot, ref.block, ref.face, targetPos);
  } catch (err) {
    placementError = err;
  } finally {
    bot.setControlState('sneak', false);
  }

  if (placementError) {
    throw createPlacementSafetyError(
      `Verified placement packet failed for (${x}, ${y}, ${z}): ${placementError.message}`
    );
  }

  if (!await waitForLavaPlacement(bot, x, y, z)) {
    writeFarmDebug('safe_placement_unconfirmed', {
      target: targetPos.toString(),
      anchor: ref.block.position.toString(),
      face: ref.face.toString(),
      targetBlock: bot.blockAt(targetPos)?.name || null,
      heldItem: bot.heldItem?.name || null,
      waitedMs: LAVA_PLACEMENT_CONFIRM_TIMEOUT_MS
    });
    throw createPlacementSafetyError(
      `Server did not confirm lava at exact target (${x}, ${y}, ${z}); farm stopped without retry.`
    );
  }

  await sleep(INTERACT_SETTLE_MS);
}

/** Phase 5: wait until the exact target block becomes obsidian. */
async function waitForObsidian(bot, targetPos) {
  const { x, y, z } = targetPos;
  farm.phase = 'waiting';

  const deadline = Date.now() + OBSIDIAN_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (!farm.enabled) return null;
    const block = bot.blockAt(new Vec3(x, y, z));
    if (block?.name === 'obsidian') return new Vec3(x, y, z);
    await sleep(25);
  }
  return null;
}

/** Phase 6: equip pickaxe and mine the obsidian. */
async function mineObsidian(bot, targetPos) {
  const { x, y, z } = targetPos;
  farm.phase = 'mining';
  stopAllMovement(bot);
  ensureInteractionRange(bot, new Vec3(x + 0.5, y + 0.5, z + 0.5), 'Obsidian mining');

  const selected = findUsablePickaxe(bot, MIN_PICKAXE_REMAINING_PERCENT);
  if (!selected) {
    const bestPickaxe = findBestPickaxe(bot);
    if (bestPickaxe && !isPickaxeUsable(bot, bestPickaxe.item)) {
      throw createLowDurabilityError(bestPickaxe.remainingPercent);
    }
    throw new Error(
      `No usable diamond/netherite pickaxe found with durability >= ${MIN_PICKAXE_REMAINING_PERCENT}%. ` +
      'Waiting for a suitable pickaxe.'
    );
  }
  const { item: pick } = selected;

  await bot.equip(pick, 'hand');
  await waitForHeldItem(bot, pick.name);
  await sleep(INTERACT_SETTLE_MS);

  // Re-check just before mining in case durability info changed after equip.
  const remainingAfterEquip = getRemainingDurabilityPercent(bot, pick);
  if (!isPickaxeUsable(bot, pick)) {
    throw createLowDurabilityError(remainingAfterEquip);
  }

  let mined = false;
  for (let attempt = 1; attempt <= OBSIDIAN_DIG_MAX_ATTEMPTS; attempt++) {
    const block = bot.blockAt(new Vec3(x, y, z));
    if (!block || block.name !== 'obsidian') return;

    if (typeof bot.canDigBlock === 'function' && !bot.canDigBlock(block)) {
      throw new Error(`Cannot dig obsidian at (${x}, ${y}, ${z}). Move closer or clear line of sight.`);
    }

    try {
      await digBlockWithTimeout(bot, block, attempt);
      mined = true;
      break;
    } catch (err) {
      if (err.message === 'farm_stopped') return;
      if (err.message !== 'server_did_not_confirm_break') throw err;
    }

    if (attempt === OBSIDIAN_DIG_MAX_ATTEMPTS) {
      throw new Error(
        `Server kept obsidian at (${x}, ${y}, ${z}) after ${OBSIDIAN_DIG_MAX_ATTEMPTS} mining attempts. ` +
        `Diagnostics were written to ${FARM_DEBUG_LOG_FILE}.`
      );
    }

    await waitForHeldItem(bot, pick.name);
    await sleep(100);
  }

  const remainingAfterDig = getRemainingDurabilityPercent(bot, pick);
  if (!isPickaxeUsable(bot, pick)) {
    writeFarmDebug('pickaxe_below_threshold', {
      item: pick.name,
      remainingPercent: Number(remainingAfterDig.toFixed(1))
    });
  }

  if (mined) {
    const trackingKey = getPickaxeTrackingKey(pick);
    const tracking = pickaxeBlocksMined.get(trackingKey) || {
      blocks: 0,
      trackedFromFull: remainingAfterEquip >= 99
    };
    tracking.blocks++;
    pickaxeBlocksMined.set(trackingKey, tracking);
    farm.cyclesCompleted++;
    try {
      await runtime.onMined();
    } catch (err) {
      writeFarmDebug('stats_update_failed', { error: err.message });
    }
  }
}

// ── Main loop ──────────────────────────────────────────────────────────────────

async function runCycle(bot, notify) {
  await ensureFarmSupplies(bot);

  if (!farm.config) throw new Error('Farm not configured — no target coordinates');

  const targetPos = getConfiguredTargetPos();
  const { x, y, z } = targetPos;
  let targetBlock = getKnownBlockAt(bot, targetPos, 'obsidian farm target');
  const hasLavaBucket = bot.inventory.items().some(i => i.name === 'lava_bucket');

  // Always clear pre-existing obsidian at the exact configured coordinates before touching buckets.
  if (targetBlock?.name === 'obsidian') {
    await mineObsidian(bot, targetPos);
    targetBlock = getKnownBlockAt(bot, targetPos, 'obsidian farm target after mining');
  }

  if (!isReplaceableForLava(targetBlock) && targetBlock.name !== 'lava') {
    throw new Error(
      `Target (${x}, ${y}, ${z}) is occupied by ${targetBlock.name}. ` +
      'Clear it or set the exact lava/obsidian coordinate.'
    );
  }

  // If lava is already at target, skip fill/pour and only wait for conversion.
  if (targetBlock?.name !== 'lava') {
    if (!hasLavaBucket) {
      await fillBucket(bot);
    }
    await pourLava(bot, targetPos);
  }

  const obsidianPos = await waitForObsidian(bot, targetPos);
  if (!obsidianPos) {
    if (!farm.enabled) return;
    throw new Error('Lava did not convert to obsidian within 90s. Continuing to search and retry.');
  }

  await mineObsidian(bot, obsidianPos);
}

async function persistentLoop(bot, notify) {
  if (!farm.enabled) return;
  let retryDelay = CYCLE_PAUSE_MS;
  const cycleStartedAt = Date.now();

  try {
    // Refresh/barrel inspection cannot interleave with any part of a farm cycle.
    await withWorldInteractionLock(() => runCycle(bot, () => {}));
    farm.lastErrorMessage = null;
    writeFarmDebug('cycle_completed', {
      durationMs: Date.now() - cycleStartedAt,
      cyclesCompleted: farm.cyclesCompleted
    });
  } catch (err) {
    if (!farm.enabled) return;

    farm.lastErrorMessage = err.message;
    retryDelay = err.code === PLACEMENT_RECHECK_CODE
      ? PLACEMENT_RECHECK_DELAY_MS
      : (
          err.code === RESOURCE_EXHAUSTED_CODE ||
          err.code === LOW_PICKAXE_DURABILITY_CODE
        )
        ? SUPPLY_RETRY_DELAY_MS
        : FARM_RETRY_DELAY_MS;
    writeFarmDebug(
      err.code === PLACEMENT_RECHECK_CODE ? 'placement_state_recheck' : 'cycle_retry',
      {
        error: err.message,
        retryInMs: retryDelay
      }
    );
  }

  if (farm.enabled) {
    farm.loopHandle = setTimeout(() => persistentLoop(bot, notify), retryDelay);
  }
}

/**
 * Start the farm.
 * @param {object} bot      - mineflayer bot instance
 * @param {Function} notify - fn(message, color) to send Discord notifications
 */
function start(bot, notify) {
  if (farm.enabled) {
    return;
  }
  if (!bot) {
    return;
  }
  if (!bot.pathfinder) {
    return;
  }
  if (!farm.config) {
    return;
  }

  farm.enabled         = true;
  farm.cyclesCompleted = 0;
  farm.lastErrorMessage = null;
  persistentLoop(bot, notify);
}

function resume(bot, notify) {
  if (farm.enabled || !bot || !farm.config) return false;
  farm.enabled = true;
  farm.lastErrorMessage = null;
  persistentLoop(bot, notify);
  return true;
}

function suspend() {
  farm.enabled = false;
  farm.phase = 'idle';
  if (farm.loopHandle) {
    clearTimeout(farm.loopHandle);
    farm.loopHandle = null;
  }
}

/**
 * Stop the farm.
 * @param {Function|null} notify - pass null to stop silently
 */
function stop(notify) {
  farm.enabled = false;
  farm.phase   = 'idle';
  if (farm.loopHandle) {
    clearTimeout(farm.loopHandle);
    farm.loopHandle = null;
  }
}

loadFarmConfig();

module.exports = {
  start,
  resume,
  suspend,
  stop,
  configure,
  resetConfig,
  configureRuntime,
  prepareStart,
  inspectSupplies,
  getStatus,
  getDetailedStatus,
  loadPlugin
};
