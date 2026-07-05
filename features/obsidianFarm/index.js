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
const CAULDRON_RADIUS_OPTIONS = [4, 5, 6];
const DEFAULT_CAULDRON_DIST = 5;
const MIN_PICKAXE_REMAINING_PERCENT = 5;
const FARM_CONFIG_FILE = 'obsidian_farm_config.json';
const FARM_DEBUG_LOG_FILE = 'obsidian_farm_debug.log';
const MAX_INTERACT_DISTANCE = 4.25;
const OBSIDIAN_DIG_BASE_HOLD_MS = 1_650;
const OBSIDIAN_DIG_RETRY_HOLD_BONUS_MS = 250;
const OBSIDIAN_DIG_CONFIRM_TIMEOUT_MS = 700;
const OBSIDIAN_DIG_STABILITY_MS = 50;
const OBSIDIAN_DIG_MAX_ATTEMPTS = 3;
const CAULDRON_FILL_ATTEMPTS_PER_BLOCK = 1;
const CAULDRON_FILL_CONFIRM_TIMEOUT_MS = 200;
const CAULDRON_FAILURE_COOLDOWN_MS = 15_000;
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
let farmCycleSequence = 0;
let farmDebugLoggingEnabled = true;
const cauldronReachStats = {
  successMaxDistance: null,
  failureMinDistance: null,
  samples: 0
};
const cauldronFailures = new Map();
const cauldronSuccesses = new Map();

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

function normalizeCauldronRadius(value) {
  const radius = Number(value);
  return CAULDRON_RADIUS_OPTIONS.includes(radius) ? radius : DEFAULT_CAULDRON_DIST;
}

/** Set and persist target coordinates. */
function configure(x, y, z, options = {}) {
  farm.config = {
    x:               Math.round(Number(x)),
    y:               Math.round(Number(y)),
    z:               Math.round(Number(z)),
    maxCauldronDist: normalizeCauldronRadius(
      options.maxCauldronDist ?? farm.config?.maxCauldronDist
    ),
  };
  saveFarmConfig();
  writeFarmDebug('farm_configured', { config: { ...farm.config } });
}

function setCauldronRadius(radius) {
  if (!farm.config) return null;
  farm.config.maxCauldronDist = normalizeCauldronRadius(radius);
  saveFarmConfig();
  writeFarmDebug('cauldron_radius_changed', {
    maxCauldronDist: farm.config.maxCauldronDist
  });
  return farm.config.maxCauldronDist;
}

function cycleCauldronRadius() {
  if (!farm.config) return null;
  const current = normalizeCauldronRadius(farm.config.maxCauldronDist);
  const currentIndex = CAULDRON_RADIUS_OPTIONS.indexOf(current);
  const next = CAULDRON_RADIUS_OPTIONS[
    (currentIndex + 1) % CAULDRON_RADIUS_OPTIONS.length
  ];
  return setCauldronRadius(next);
}

function resetConfig() {
  stop(null);
  farm.config = null;
  try {
    if (fs.existsSync(FARM_CONFIG_FILE)) fs.unlinkSync(FARM_CONFIG_FILE);
  } catch (_) {}
  writeFarmDebug('farm_config_reset');
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
          maxCauldronDist: normalizeCauldronRadius(farm.config.maxCauldronDist),
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
      maxCauldronDist: normalizeCauldronRadius(parsed.maxCauldronDist),
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

  const normalizeEnchantments = item => {
    const found = new Map();
    const readScalar = value => {
      let current = value;
      for (let depth = 0; depth < 8; depth += 1) {
        if (current == null) return current;
        if (typeof current !== 'object') return current;
        if ('value' in current && Object.keys(current).length <= 2) {
          current = current.value;
          continue;
        }
        return current;
      }
      return current;
    };
    const resolveEnchantmentName = name => {
      const raw = readScalar(name);
      if (raw == null) return '';
      const numericId = Number(raw);
      if (Number.isInteger(numericId)) {
        const enchantment = bot.registry?.enchantments?.[numericId] ||
          bot.registry?.enchantmentsArray?.find(entry => entry.id === numericId);
        if (enchantment?.name) return enchantment.name;
      }
      return String(raw);
    };
    const addEnchant = (name, level = 1) => {
      const cleanName = resolveEnchantmentName(name)
        .replace(/^minecraft:/, '')
        .trim();
      if (!cleanName) return;
      const cleanLevel = Number(readScalar(level)) || 1;
      found.set(cleanName, Math.max(found.get(cleanName) || 0, cleanLevel));
    };
    const visit = (value, keyHint = '', depth = 0) => {
      if (value == null || depth > 10) return;
      if (value instanceof Map) {
        for (const [key, child] of value.entries()) visit(child, String(key), depth + 1);
        return;
      }
      if (Array.isArray(value)) {
        for (const child of value) visit(child, keyHint, depth + 1);
        return;
      }
      if (typeof value !== 'object') return;

      const unwrapped = readScalar(value);
      if (unwrapped !== value) {
        visit(unwrapped, keyHint, depth + 1);
        return;
      }

      const rawId = value.id ?? value.name ?? value.type;
      const rawLevel = value.lvl ?? value.level ?? value.amplifier;
      if (rawId != null && rawLevel != null) addEnchant(rawId, rawLevel);

      const marker = String(readScalar(rawId) || keyHint || '').toLowerCase();
      const isEnchantContainer = marker.includes('enchant');
      const levels = value.levels ?? value.Levels;
      if (levels && typeof levels === 'object') {
        const levelSource = readScalar(levels) || {};
        const levelEntries = levelSource instanceof Map
          ? Array.from(levelSource.entries())
          : Object.entries(levelSource);
        for (const [name, level] of levelEntries) {
          addEnchant(name, level);
        }
      }

      for (const [key, child] of Object.entries(value)) {
        const lowerKey = key.toLowerCase();
        if (
          isEnchantContainer ||
          lowerKey.includes('enchant') ||
          lowerKey === 'data' ||
          lowerKey === 'levels' ||
          keyHint.toLowerCase().includes('enchant')
        ) {
          visit(child, isEnchantContainer ? 'enchantments' : key, depth + 1);
        }
      }
    };

    visit(item.enchants, 'enchants');
    visit(item.enchantments, 'enchantments');
    visit(item.component, 'component');
    visit(item.components, 'components');
    visit(item.nbt, 'nbt');
    return Array.from(found, ([name, level]) => ({ name, level }));
  };

  for (const item of items) {
    const maxDurability = getItemMaxDurability(bot, item);
    const remainingPercent = maxDurability
      ? getRemainingDurabilityPercent(bot, item)
      : null;
    allItems.push({
      name: item.name,
      displayName: item.displayName || item.name,
      count: item.count,
      slot: item.slot,
      enchantments: normalizeEnchantments(item),
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

function getInventorySupplyItems(bot) {
  const items = [...(bot.inventory?.items() || [])];
  const offhand = bot.inventory?.slots?.[45] || null;
  if (offhand && !items.some(item => item.slot === 45)) {
    items.push(offhand);
  }
  return items;
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
  const inventory = summarizeSupplyItems(bot, getInventorySupplyItems(bot));
  const barrel = findReachableSupplyBarrel(bot);
  if (!barrel) {
    return { inventory, barrel: null, barrelError: 'Not found within 5 blocks' };
  }

  let container = null;
  try {
    await prepareSafeBarrelHand(bot);
    stopAllMovement(bot);
    container = await bot.openContainer(barrel);
    const supplies = {
      inventory,
      barrel: {
        position: barrel.position.toString(),
        distance: bot.entity.position.distanceTo(barrel.position.offset(0.5, 0.5, 0.5)),
        ...summarizeSupplyItems(bot, container.containerItems())
      },
      observedAt: new Date().toISOString(),
      barrelError: null
    };
    runtime.onSuppliesChanged(supplies).catch(err => {
      writeFarmDebug('supply_stats_refresh_failed', {
        trigger: 'inspect_supply_status',
        error: err.message
      });
    });
    return supplies;
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
          inventory: summarizeSupplyItems(bot, getInventorySupplyItems(bot)),
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

function getBotInventorySlotFromContainerSlot(bot, container, containerSlot) {
  const slotOffset = container.inventoryStart - bot.inventory.inventoryStart;
  return containerSlot - slotOffset;
}

function findContainerMainInventoryRelocationSlot(bot, container) {
  let occupiedSlot = null;
  for (let slot = container.inventoryStart; slot < container.hotbarStart; slot++) {
    const inventorySlot = getBotInventorySlotFromContainerSlot(bot, container, slot);
    if (!container.slots[slot] && !bot.inventory.slots[inventorySlot]) return slot;
    if (
      occupiedSlot == null &&
      container.slots[slot] &&
      !PICKAXE_PRIORITY.includes(container.slots[slot].name)
    ) {
      occupiedSlot = slot;
    }
  }
  if (occupiedSlot != null) return occupiedSlot;

  for (let slot = container.inventoryStart; slot < container.hotbarStart; slot++) {
    if (container.slots[slot]) return slot;
  }
  return null;
}

function getOpenInventoryItems(bot, container, containerSlot, inventorySlot) {
  return [container.slots[containerSlot], bot.inventory.slots[inventorySlot]]
    .filter(Boolean);
}

function isSlotPickaxe(bot, item, expectedType, usable) {
  if (!item || item.type !== expectedType) return false;
  return usable ? isPickaxeUsable(bot, item) : !isPickaxeUsable(bot, item);
}

function hasOpenInventoryPickaxe(bot, container, containerSlot, inventorySlot, expectedType, usable) {
  return getOpenInventoryItems(bot, container, containerSlot, inventorySlot)
    .some(item => isSlotPickaxe(bot, item, expectedType, usable));
}

async function swapPickaxesInExactSlots(bot, container, replacement, wornPickaxe) {
  const barrelSlot = replacement.item.slot;
  const originalWornSlot = wornPickaxe.slot;
  let wornInventorySlot = originalWornSlot;
  let inventorySlot = getContainerInventorySlot(bot, container, wornPickaxe);
  const barrelItem = container.slots[barrelSlot];

  if (!barrelItem || barrelItem.type !== replacement.item.type) {
    throw new Error(`Replacement pickaxe slot ${barrelSlot} changed before swap.`);
  }
  if (!hasOpenInventoryPickaxe(bot, container, inventorySlot, originalWornSlot, wornPickaxe.type, false)) {
    throw new Error(`Worn pickaxe slot ${originalWornSlot} changed before swap.`);
  }

  const originalHotbarIndex = originalWornSlot - bot.inventory.hotbarStart;
  if (originalHotbarIndex >= 0 && originalHotbarIndex < 9) {
    const mainInventorySlot = findContainerMainInventoryRelocationSlot(bot, container);
    if (mainInventorySlot != null) {
      const targetWasOccupied = Boolean(container.slots[mainInventorySlot]);
      await bot.clickWindow(inventorySlot, 0, 0);
      await bot.clickWindow(mainInventorySlot, 0, 0);
      if (targetWasOccupied) {
        await bot.clickWindow(inventorySlot, 0, 0);
      }
      await new Promise(resolve => setTimeout(resolve, 250));

      const relocatedInventorySlot = getBotInventorySlotFromContainerSlot(bot, container, mainInventorySlot);
      const relocated = await waitForInventorySupply(
        bot,
        () => hasOpenInventoryPickaxe(
          bot,
          container,
          mainInventorySlot,
          relocatedInventorySlot,
          wornPickaxe.type,
          false
        ) && !container.selectedItem,
        2_000
      );
      if (relocated) {
        writeFarmDebug('pickaxe_hotbar_relocated_for_swap', {
          barrelSlot,
          fromInventorySlot: originalWornSlot,
          toInventorySlot: relocatedInventorySlot,
          displacedInventoryItem: targetWasOccupied ? container.slots[inventorySlot]?.name || null : null,
          openWindowInventorySlot: mainInventorySlot
        });
        inventorySlot = mainInventorySlot;
        wornInventorySlot = relocatedInventorySlot;
      } else if (container.selectedItem) {
        await bot.clickWindow(inventorySlot, 0, 0);
      }
    }
  }

  const isSwapped = () => {
    const newBarrelItem = container.slots[barrelSlot];
    return Boolean(
      isSlotPickaxe(bot, newBarrelItem, wornPickaxe.type, false) &&
      hasOpenInventoryPickaxe(
        bot,
        container,
        inventorySlot,
        wornInventorySlot,
        replacement.item.type,
        true
      ) &&
      !container.selectedItem
    );
  };

  const isStillOriginal = () => {
    const currentBarrelItem = container.slots[barrelSlot];
    return Boolean(
      currentBarrelItem &&
      currentBarrelItem.type === replacement.item.type &&
      hasOpenInventoryPickaxe(
        bot,
        container,
        inventorySlot,
        wornInventorySlot,
        wornPickaxe.type,
        false
      ) &&
      !container.selectedItem
    );
  };

  const waitForSwap = () => waitForInventorySupply(bot, isSwapped, 2_000);

  const hotbarIndex = wornInventorySlot - bot.inventory.hotbarStart;
  if (hotbarIndex >= 0 && hotbarIndex < 9) {
    // A mode-2 hotbar swap is one atomic server action. Some servers/protocols
    // report the changed hotbar slot only through bot.inventory, so isSwapped()
    // checks both views before deciding the swap failed.
    await bot.clickWindow(barrelSlot, hotbarIndex, 2);
    await new Promise(resolve => setTimeout(resolve, 250));
    if (await waitForSwap()) return;

    if (!isStillOriginal()) {
      throw new Error(
        `Server left pickaxe swap partially synced for barrel slot ${barrelSlot} and inventory slot ${originalWornSlot}.`
      );
    }

    writeFarmDebug('pickaxe_hotbar_swap_fallback', {
      barrelSlot,
      inventorySlot: wornInventorySlot,
      openWindowInventorySlot: inventorySlot
    });
  }

  // Pick up the good pickaxe, exchange it with the worn inventory pickaxe,
  // then put the worn pickaxe into the exact barrel slot that was freed.
  await bot.clickWindow(barrelSlot, 0, 0);
  await bot.clickWindow(inventorySlot, 0, 0);
  await bot.clickWindow(barrelSlot, 0, 0);

  // Give a server correction packet a chance to arrive before accepting
  // Mineflayer's optimistic local window update as the final state.
  await new Promise(resolve => setTimeout(resolve, 250));

  const swapped = await waitForSwap();
  if (!swapped) {
    throw new Error(
      `Server did not swap barrel slot ${barrelSlot} with inventory slot ${originalWornSlot}.`
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

async function ensureFarmSupplies(bot, context = {}) {
  const startedAt = Date.now();
  const hasUsablePickaxe = Boolean(findUsablePickaxe(bot, MIN_PICKAXE_REMAINING_PERCENT));
  const hasFood = bot.inventory.items().some(isFoodItem);
  const lowPickaxes = bot.inventory.items().filter(item =>
    PICKAXE_PRIORITY.includes(item.name) &&
    !isPickaxeUsable(bot, item)
  );
  writeFarmDebug('supply_check_start', {
    ...context,
    inventory: getInventoryDebugSummary(bot),
    hasUsablePickaxe,
    hasFood,
    lowPickaxes: lowPickaxes.map(item => ({
      name: item.name,
      slot: item.slot,
      remainingPercent: Number(getRemainingDurabilityPercent(bot, item).toFixed(1))
    }))
  });
  // Window swaps mutate Item.slot in place. Preserve each inventory tracking
  // key before a worn pickaxe is moved into the barrel.
  const lowPickaxeTrackingKeys = new Map(
    lowPickaxes.map(item => [item, getPickaxeTrackingKey(item)])
  );
  if (hasUsablePickaxe && hasFood && lowPickaxes.length === 0) {
    writeFarmDebug('supply_check_ok', {
      ...context,
      durationMs: Date.now() - startedAt,
      inventory: getInventoryDebugSummary(bot)
    });
    return;
  }

  const barrel = findReachableSupplyBarrel(bot);
  if (!barrel) {
    const missing = [];
    if (!hasUsablePickaxe) missing.push('pickaxe');
    if (!hasFood) missing.push('food');
    if (lowPickaxes.length > 0) missing.push('barrel access for worn pickaxe deposit');
    writeFarmDebug('supply_barrel_missing', {
      ...context,
      durationMs: Date.now() - startedAt,
      missing
    });
    throw createResourceExhaustedError(missing);
  }

  ensureInteractionRange(bot, barrel.position.offset(0.5, 0.5, 0.5), 'Supply barrel');
  stopAllMovement(bot);
  writeFarmDebug('supply_barrel_open_start', {
    ...context,
    barrel: barrel.position.toString(),
    distance: Number(
      bot.entity.position.distanceTo(barrel.position.offset(0.5, 0.5, 0.5)).toFixed(3)
    )
  });

  let container = null;
  let pickaxeWasAvailable = false;
  let foodWasAvailable = false;
  let pickaxeChanged = false;
  let latestSuppliesSnapshot = null;
  try {
    await prepareSafeBarrelHand(bot);
    container = await bot.openContainer(barrel);
    writeFarmDebug('supply_barrel_opened', {
      ...context,
      durationMs: Date.now() - startedAt,
      barrel: barrel.position.toString(),
      barrelSupplies: summarizeSupplyItems(bot, container.containerItems())
    });
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
            ...context,
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
            ...context,
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
        ...context,
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
          ...context,
          item: food.name,
          count: food.count,
          barrel: barrel.position.toString()
        });
      }
    }

    if (pickaxeChanged) {
      latestSuppliesSnapshot = {
        reason: 'pickaxe_changed',
        inventory: summarizeSupplyItems(bot, getInventorySupplyItems(bot)),
        barrel: {
          position: barrel.position.toString(),
          distance: bot.entity.position.distanceTo(barrel.position.offset(0.5, 0.5, 0.5)),
          ...summarizeSupplyItems(bot, container.containerItems())
        },
        barrelError: null
      };
    }

    latestSuppliesSnapshot = latestSuppliesSnapshot || {
      reason: 'barrel_opened',
      inventory: summarizeSupplyItems(bot, getInventorySupplyItems(bot)),
      barrel: {
        position: barrel.position.toString(),
        distance: bot.entity.position.distanceTo(barrel.position.offset(0.5, 0.5, 0.5)),
        ...summarizeSupplyItems(bot, container.containerItems())
      },
      barrelError: null
    };
  } catch (err) {
    writeFarmDebug('supply_check_failed', {
      ...context,
      durationMs: Date.now() - startedAt,
      error: err.message,
      barrel: barrel.position.toString(),
      inventory: getInventoryDebugSummary(bot)
    });
    throw err;
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

  if (latestSuppliesSnapshot) {
    latestSuppliesSnapshot = {
      ...latestSuppliesSnapshot,
      inventory: summarizeSupplyItems(bot, getInventorySupplyItems(bot)),
      observedAt: new Date().toISOString()
    };
    runtime.onSuppliesChanged(latestSuppliesSnapshot).catch(err => {
      writeFarmDebug('supply_stats_refresh_failed', { ...context, error: err.message });
    });
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

  writeFarmDebug('supply_check_completed', {
    ...context,
    durationMs: Date.now() - startedAt,
    inventory: getInventoryDebugSummary(bot)
  });
}

async function prepareStart(bot) {
  if (!bot?.entity) throw new Error('Bot is offline.');
  await ensureFarmSupplies(bot, { trigger: 'prepare_start' });
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
  if (!farmDebugLoggingEnabled) return;
  const line = JSON.stringify({
    time: new Date().toISOString(),
    event,
    ...details
  });
  // Debug logging must not block the time-sensitive farming loop, especially
  // when the project directory is synced by OneDrive.
  fs.appendFile(FARM_DEBUG_LOG_FILE, `${line}\n`, 'utf8', () => {});
}

function getDebugLoggingEnabled() {
  return farmDebugLoggingEnabled;
}

function setDebugLoggingEnabled(enabled) {
  const nextEnabled = Boolean(enabled);
  if (farmDebugLoggingEnabled === nextEnabled) return farmDebugLoggingEnabled;
  if (!nextEnabled) {
    writeFarmDebug('debug_logging_disabled');
    farmDebugLoggingEnabled = false;
    return farmDebugLoggingEnabled;
  }
  farmDebugLoggingEnabled = true;
  writeFarmDebug('debug_logging_enabled');
  return farmDebugLoggingEnabled;
}

function setFarmPhase(phase, details = {}) {
  const previousPhase = farm.phase;
  farm.phase = phase;
  writeFarmDebug('phase_changed', {
    from: previousPhase,
    to: phase,
    ...details
  });
}

function getBotDebugPosition(bot) {
  const position = bot.entity?.position;
  return position
    ? {
        x: Number(position.x.toFixed(3)),
        y: Number(position.y.toFixed(3)),
        z: Number(position.z.toFixed(3))
      }
    : null;
}

function getInventoryDebugSummary(bot) {
  const items = typeof bot.inventory?.items === 'function' ? bot.inventory.items() : [];
  const summary = {
    buckets: 0,
    lavaBuckets: 0,
    food: 0,
    usablePickaxes: 0,
    wornPickaxes: 0,
    bestPickaxe: null,
    heldItem: bot.heldItem?.name || null
  };

  for (const item of items) {
    if (item.name === 'bucket') summary.buckets += item.count;
    if (item.name === 'lava_bucket') summary.lavaBuckets += item.count;
    if (isFoodItem(item)) summary.food += item.count;
    if (PICKAXE_PRIORITY.includes(item.name)) {
      const remainingPercent = getRemainingDurabilityPercent(bot, item);
      if (isPickaxeUsable(bot, item)) summary.usablePickaxes++;
      else summary.wornPickaxes++;
      if (!summary.bestPickaxe || remainingPercent > summary.bestPickaxe.remainingPercent) {
        summary.bestPickaxe = {
          name: item.name,
          slot: item.slot,
          remainingPercent: Number(remainingPercent.toFixed(1))
        };
      }
    }
  }

  return summary;
}

function recordCauldronReachSample(context, sample) {
  const distance = Number(sample.distance);
  if (!Number.isFinite(distance)) return;

  cauldronReachStats.samples++;
  if (sample.success) {
    cauldronReachStats.successMaxDistance = cauldronReachStats.successMaxDistance == null
      ? distance
      : Math.max(cauldronReachStats.successMaxDistance, distance);
  } else {
    cauldronReachStats.failureMinDistance = cauldronReachStats.failureMinDistance == null
      ? distance
      : Math.min(cauldronReachStats.failureMinDistance, distance);
  }

  writeFarmDebug('cauldron_reach_sample', {
    ...context,
    ...sample,
    distance: Number(distance.toFixed(3)),
    successMaxDistance: cauldronReachStats.successMaxDistance == null
      ? null
      : Number(cauldronReachStats.successMaxDistance.toFixed(3)),
    failureMinDistance: cauldronReachStats.failureMinDistance == null
      ? null
      : Number(cauldronReachStats.failureMinDistance.toFixed(3)),
    samples: cauldronReachStats.samples
  });
}

function getCauldronKey(position) {
  return position?.toString?.() || String(position);
}

function getCauldronFailure(position) {
  const key = getCauldronKey(position);
  const failure = cauldronFailures.get(key);
  if (!failure) return null;
  if (failure.until <= Date.now()) {
    cauldronFailures.delete(key);
    return null;
  }
  return failure;
}

function rememberCauldronFailure(position, reason, details = {}) {
  cauldronFailures.set(getCauldronKey(position), {
    reason,
    until: Date.now() + CAULDRON_FAILURE_COOLDOWN_MS,
    ...details
  });
}

function rememberCauldronSuccess(position) {
  const key = getCauldronKey(position);
  cauldronFailures.delete(key);
  cauldronSuccesses.set(key, (cauldronSuccesses.get(key) || 0) + 1);
}

function getMiningDebugState(bot, block, attempt, expectedDigTime, holdMs, face, context = {}) {
  const held = bot.heldItem;
  const effects = Object.values(bot.entity?.effects || {}).map(effect => ({
    id: effect.id,
    amplifier: effect.amplifier,
    duration: effect.duration
  }));

  return {
    ...context,
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

async function digBlockWithTimeout(bot, block, attempt, context = {}) {
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
    ...getMiningDebugState(bot, block, attempt, expectedDigTime, holdMs, face, context),
    measuredManualDigTimeMs: 2_500,
    timingSource: attempt === 1 ? 'manual_server_measurement' : 'manual_server_measurement_with_retry_bonus'
  });

  const eventName = `blockUpdate:${block.position}`;
  let completed = false;
  let onBlockUpdate = null;

  const serverConfirmation = new Promise(resolve => {
    onBlockUpdate = (_oldBlock, newBlock) => {
      writeFarmDebug('server_block_update', {
        ...context,
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
      ...context,
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
        ...context,
        attempt,
        elapsedMs: Date.now() - startedAt,
        resultingBlock
      });
      throw new Error('server_did_not_confirm_break');
    }

    writeFarmDebug('dig_confirmed', {
      ...context,
      attempt,
      elapsedMs: Date.now() - startedAt,
      resultingBlock
    });
  } catch (err) {
    cleanup();
    writeFarmDebug('dig_failed', {
      ...context,
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
    .filter(pos => !getCauldronFailure(pos))
    .sort((a, b) => {
      const aSuccesses = cauldronSuccesses.get(getCauldronKey(a)) || 0;
      const bSuccesses = cauldronSuccesses.get(getCauldronKey(b)) || 0;
      if (aSuccesses !== bSuccesses) return bSuccesses - aSuccesses;
      return bot.entity.position.distanceSquared(a) - bot.entity.position.distanceSquared(b);
    });
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
async function fillBucket(bot, context = {}) {
  const startedAt = Date.now();
  const { maxCauldronDist } = farm.config;

  setFarmPhase('seeking', context);
  writeFarmDebug('cauldron_search_start', {
    ...context,
    maxCauldronDist,
    botPosition: getBotDebugPosition(bot),
    inventory: getInventoryDebugSummary(bot)
  });
  const cauldronPositions = findLavaCauldrons(bot, maxCauldronDist);
  writeFarmDebug('cauldron_search_completed', {
    ...context,
    durationMs: Date.now() - startedAt,
    candidates: cauldronPositions.map(position => position.toString())
  });
  if (cauldronPositions.length === 0) {
    throw new Error(
      `No lava cauldron found within ${maxCauldronDist} blocks. ` +
      'Place a lava cauldron nearby and retry.'
    );
  }

  setFarmPhase('filling', context);
  stopAllMovement(bot);
  const failures = [];

  for (const position of cauldronPositions) {
    for (let attempt = 1; attempt <= CAULDRON_FILL_ATTEMPTS_PER_BLOCK; attempt++) {
      const cauldron = bot.blockAt(position);
      const isModernLavaCauldron = cauldron?.name === 'lava_cauldron';
      const isLegacyLavaCauldron = cauldron?.name === 'cauldron' && cauldron.metadata === 3;
      if (!isModernLavaCauldron && !isLegacyLavaCauldron) {
        failures.push(`${position}:became_${cauldron?.name || 'unknown'}`);
        rememberCauldronFailure(position, `became_${cauldron?.name || 'unknown'}`);
        writeFarmDebug('cauldron_skipped', {
          ...context,
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
          ...context,
          position: position.toString(),
          reason: 'outside_configured_radius',
          configuredRadius: maxCauldronDist,
          distance: Number.isFinite(distance) ? Number(distance.toFixed(2)) : null
        });
        break;
      }
      const emptyBucket = bot.inventory.items().find(i => i.name === 'bucket');
      if (!emptyBucket) {
        if (bot.inventory.items().some(i => i.name === 'lava_bucket')) {
          writeFarmDebug('bucket_fill_skipped', {
            ...context,
            reason: 'already_has_lava_bucket',
            durationMs: Date.now() - startedAt,
            inventory: getInventoryDebugSummary(bot)
          });
          return;
        }
        throw new Error('No empty bucket in inventory');
      }

      const attemptStartedAt = Date.now();
      writeFarmDebug('cauldron_fill_attempt_start', {
        ...context,
        position: position.toString(),
        attempt,
        distance: Number(distance.toFixed(3)),
        heldItem: bot.heldItem?.name || null
      });
      await bot.equip(emptyBucket, 'hand');
      await waitForHeldItem(bot, 'bucket');
      await bot.lookAt(clickPoint, true);
      await sleep(25);

      try {
        await bot.activateBlock(cauldron);
      } catch (err) {
        failures.push(`${position}:click#${attempt}_${err.message}`);
        rememberCauldronFailure(position, 'click_failed', { error: err.message });
        recordCauldronReachSample(context, {
          success: false,
          position: position.toString(),
          attempt,
          distance,
          durationMs: Date.now() - attemptStartedAt,
          error: err.message,
          currentBlock: bot.blockAt(position)?.name || null,
          heldItem: bot.heldItem?.name || null
        });
        continue;
      }

      if (await waitForLavaBucket(bot)) {
        rememberCauldronSuccess(position);
        recordCauldronReachSample(context, {
          success: true,
          position: position.toString(),
          attempt,
          distance,
          durationMs: Date.now() - attemptStartedAt,
          currentBlock: bot.blockAt(position)?.name || null
        });
        writeFarmDebug('cauldron_filled', {
          ...context,
          position: position.toString(),
          attempt,
          candidates: cauldronPositions.length,
          attemptDurationMs: Date.now() - attemptStartedAt,
          durationMs: Date.now() - startedAt,
          inventory: getInventoryDebugSummary(bot)
        });
        return;
      }

      failures.push(`${position}:no_lava_bucket#${attempt}`);
      rememberCauldronFailure(position, 'no_lava_bucket', {
        currentBlock: bot.blockAt(position)?.name || null
      });
      recordCauldronReachSample(context, {
        success: false,
        position: position.toString(),
        attempt,
        distance,
        durationMs: Date.now() - attemptStartedAt,
        currentBlock: bot.blockAt(position)?.name || null,
        heldItem: bot.heldItem?.name || null
      });
      writeFarmDebug('cauldron_fill_failed', {
        ...context,
        position: position.toString(),
        attempt,
        attemptDurationMs: Date.now() - attemptStartedAt,
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
async function pourLava(bot, targetPos, context = {}) {
  const startedAt = Date.now();
  const { x, y, z } = targetPos;

  setFarmPhase('navigating', context);
  stopAllMovement(bot);
  ensureInteractionRange(bot, new Vec3(x + 0.5, y + 0.5, z + 0.5), 'Lava placement');

  setFarmPhase('pouring', context);
  writeFarmDebug('lava_place_start', {
    ...context,
    target: targetPos.toString(),
    botPosition: getBotDebugPosition(bot),
    inventory: getInventoryDebugSummary(bot)
  });
  const lavaBucket = bot.inventory.items().find(i => i.name === 'lava_bucket');
  if (!lavaBucket) throw new Error('Lava bucket disappeared before pouring');

  const targetBlock = getKnownBlockAt(bot, targetPos, 'lava placement target');
  writeFarmDebug('lava_place_target_checked', {
    ...context,
    target: targetPos.toString(),
    targetBlock: targetBlock?.name || null
  });
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
    writeFarmDebug('lava_place_anchor_failed', {
      ...context,
      target: targetPos.toString(),
      anchor: new Vec3(x + 1, y, z).toString(),
      anchorBlock: ref.block?.name || null,
      boundingBox: ref.block?.boundingBox || null
    });
    throw createPlacementSafetyError(
      `Required smooth_stone anchor is missing at (${x + 1}, ${y}, ${z}); refusing bucket use.`
    );
  }

  const cursor = getFaceCursor(ref.face);
  const hitPoint = ref.block.position.offset(cursor.x, cursor.y, cursor.z);
  const clickDistance = bot.entity?.position?.distanceTo(hitPoint);
  writeFarmDebug('lava_place_anchor_checked', {
    ...context,
    target: targetPos.toString(),
    anchor: ref.block.position.toString(),
    face: ref.face.toString(),
    clickDistance: Number.isFinite(clickDistance) ? Number(clickDistance.toFixed(3)) : null
  });
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
    writeFarmDebug('lava_place_packet_start', {
      ...context,
      target: targetPos.toString(),
      anchor: ref.block.position.toString()
    });
    bot.setControlState('sneak', true);
    await sleep(50);
    await useBucketOnFace(bot, ref.block, ref.face, targetPos);
  } catch (err) {
    placementError = err;
  } finally {
    bot.setControlState('sneak', false);
  }

  if (placementError) {
    writeFarmDebug('lava_place_packet_failed', {
      ...context,
      target: targetPos.toString(),
      durationMs: Date.now() - startedAt,
      error: placementError.message
    });
    throw createPlacementSafetyError(
      `Verified placement packet failed for (${x}, ${y}, ${z}): ${placementError.message}`
    );
  }

  if (!await waitForLavaPlacement(bot, x, y, z)) {
    writeFarmDebug('safe_placement_unconfirmed', {
      ...context,
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
  writeFarmDebug('lava_place_confirmed', {
    ...context,
    target: targetPos.toString(),
    targetBlock: bot.blockAt(targetPos)?.name || null,
    durationMs: Date.now() - startedAt,
    inventory: getInventoryDebugSummary(bot)
  });
}

/** Phase 5: wait until the exact target block becomes obsidian. */
async function waitForObsidian(bot, targetPos, context = {}) {
  const startedAt = Date.now();
  const { x, y, z } = targetPos;
  setFarmPhase('waiting', context);
  writeFarmDebug('obsidian_wait_start', {
    ...context,
    target: targetPos.toString(),
    initialBlock: bot.blockAt(new Vec3(x, y, z))?.name || null,
    timeoutMs: OBSIDIAN_TIMEOUT_MS
  });

  const deadline = Date.now() + OBSIDIAN_TIMEOUT_MS;
  let nextProgressAt = Date.now() + 5_000;
  while (Date.now() < deadline) {
    if (!farm.enabled) {
      writeFarmDebug('obsidian_wait_stopped', {
        ...context,
        target: targetPos.toString(),
        durationMs: Date.now() - startedAt
      });
      return null;
    }
    const block = bot.blockAt(new Vec3(x, y, z));
    if (block?.name === 'obsidian') {
      writeFarmDebug('obsidian_wait_completed', {
        ...context,
        target: targetPos.toString(),
        durationMs: Date.now() - startedAt
      });
      return new Vec3(x, y, z);
    }
    if (Date.now() >= nextProgressAt) {
      writeFarmDebug('obsidian_wait_progress', {
        ...context,
        target: targetPos.toString(),
        elapsedMs: Date.now() - startedAt,
        currentBlock: block?.name || null
      });
      nextProgressAt += 5_000;
    }
    await sleep(25);
  }
  writeFarmDebug('obsidian_wait_timeout', {
    ...context,
    target: targetPos.toString(),
    durationMs: Date.now() - startedAt,
    currentBlock: bot.blockAt(new Vec3(x, y, z))?.name || null
  });
  return null;
}

/** Phase 6: equip pickaxe and mine the obsidian. */
async function mineObsidian(bot, targetPos, context = {}) {
  const startedAt = Date.now();
  const { x, y, z } = targetPos;
  setFarmPhase('mining', context);
  stopAllMovement(bot);
  ensureInteractionRange(bot, new Vec3(x + 0.5, y + 0.5, z + 0.5), 'Obsidian mining');
  writeFarmDebug('mine_start', {
    ...context,
    target: targetPos.toString(),
    botPosition: getBotDebugPosition(bot),
    inventory: getInventoryDebugSummary(bot)
  });

  const selected = findUsablePickaxe(bot, MIN_PICKAXE_REMAINING_PERCENT);
  if (!selected) {
    const bestPickaxe = findBestPickaxe(bot);
    if (bestPickaxe && !isPickaxeUsable(bot, bestPickaxe.item)) {
      writeFarmDebug('mine_no_usable_pickaxe', {
        ...context,
        target: targetPos.toString(),
        bestRemainingPercent: Number(bestPickaxe.remainingPercent.toFixed(1)),
        durationMs: Date.now() - startedAt
      });
      throw createLowDurabilityError(bestPickaxe.remainingPercent);
    }
    writeFarmDebug('mine_no_pickaxe', {
      ...context,
      target: targetPos.toString(),
      durationMs: Date.now() - startedAt
    });
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
  writeFarmDebug('pickaxe_equipped_for_mining', {
    ...context,
    item: pick.name,
    slot: pick.slot,
    remainingPercent: Number(remainingAfterEquip.toFixed(1)),
    equipDurationMs: Date.now() - startedAt
  });
  if (!isPickaxeUsable(bot, pick)) {
    throw createLowDurabilityError(remainingAfterEquip);
  }

  let mined = false;
  for (let attempt = 1; attempt <= OBSIDIAN_DIG_MAX_ATTEMPTS; attempt++) {
    const block = bot.blockAt(new Vec3(x, y, z));
    if (!block || block.name !== 'obsidian') {
      writeFarmDebug('mine_skipped_target_changed', {
        ...context,
        target: targetPos.toString(),
        currentBlock: block?.name || null,
        durationMs: Date.now() - startedAt
      });
      return;
    }

    if (typeof bot.canDigBlock === 'function' && !bot.canDigBlock(block)) {
      writeFarmDebug('mine_cannot_dig', {
        ...context,
        target: targetPos.toString(),
        currentBlock: block.name,
        durationMs: Date.now() - startedAt
      });
      throw new Error(`Cannot dig obsidian at (${x}, ${y}, ${z}). Move closer or clear line of sight.`);
    }

    try {
      await digBlockWithTimeout(bot, block, attempt, context);
      mined = true;
      break;
    } catch (err) {
      if (err.message === 'farm_stopped') return;
      if (err.message !== 'server_did_not_confirm_break') throw err;
      writeFarmDebug('mine_retry_needed', {
        ...context,
        target: targetPos.toString(),
        attempt,
        durationMs: Date.now() - startedAt,
        currentBlock: bot.blockAt(new Vec3(x, y, z))?.name || null
      });
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
      ...context,
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
      writeFarmDebug('stats_update_failed', { ...context, error: err.message });
    }
    writeFarmDebug('mine_completed', {
      ...context,
      target: targetPos.toString(),
      durationMs: Date.now() - startedAt,
      cyclesCompleted: farm.cyclesCompleted,
      pickaxe: pick.name,
      remainingPercent: Number(remainingAfterDig.toFixed(1))
    });
  }
}

// ── Main loop ──────────────────────────────────────────────────────────────────

async function runCycle(bot, notify, context = {}) {
  writeFarmDebug('cycle_action_start', {
    ...context,
    action: 'ensure_supplies'
  });
  await ensureFarmSupplies(bot, context);

  if (!farm.config) throw new Error('Farm not configured — no target coordinates');

  const targetPos = getConfiguredTargetPos();
  const { x, y, z } = targetPos;
  let targetBlock = getKnownBlockAt(bot, targetPos, 'obsidian farm target');
  const hasLavaBucket = bot.inventory.items().some(i => i.name === 'lava_bucket');
  writeFarmDebug('cycle_target_checked', {
    ...context,
    target: targetPos.toString(),
    targetBlock: targetBlock?.name || null,
    hasLavaBucket,
    inventory: getInventoryDebugSummary(bot)
  });

  // Always clear pre-existing obsidian at the exact configured coordinates before touching buckets.
  if (targetBlock?.name === 'obsidian') {
    writeFarmDebug('cycle_action_start', {
      ...context,
      action: 'clear_existing_obsidian',
      target: targetPos.toString()
    });
    await mineObsidian(bot, targetPos, { ...context, reason: 'clear_existing_obsidian' });
    targetBlock = getKnownBlockAt(bot, targetPos, 'obsidian farm target after mining');
    writeFarmDebug('cycle_target_rechecked', {
      ...context,
      target: targetPos.toString(),
      targetBlock: targetBlock?.name || null
    });
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
      writeFarmDebug('cycle_action_start', {
        ...context,
        action: 'fill_bucket'
      });
      await fillBucket(bot, context);
    } else {
      writeFarmDebug('bucket_fill_skipped', {
        ...context,
        reason: 'already_has_lava_bucket',
        inventory: getInventoryDebugSummary(bot)
      });
    }
    writeFarmDebug('cycle_action_start', {
      ...context,
      action: 'pour_lava',
      target: targetPos.toString()
    });
    await pourLava(bot, targetPos, context);
  } else {
    writeFarmDebug('lava_place_skipped', {
      ...context,
      reason: 'target_already_lava',
      target: targetPos.toString()
    });
  }

  writeFarmDebug('cycle_action_start', {
    ...context,
    action: 'wait_for_obsidian',
    target: targetPos.toString()
  });
  const obsidianPos = await waitForObsidian(bot, targetPos, context);
  if (!obsidianPos) {
    if (!farm.enabled) return;
    throw new Error('Lava did not convert to obsidian within 90s. Continuing to search and retry.');
  }

  writeFarmDebug('cycle_action_start', {
    ...context,
    action: 'mine_obsidian',
    target: obsidianPos.toString()
  });
  await mineObsidian(bot, obsidianPos, context);
}

async function persistentLoop(bot, notify) {
  if (!farm.enabled) return;
  let retryDelay = CYCLE_PAUSE_MS;
  const cycleStartedAt = Date.now();
  const cycleId = ++farmCycleSequence;
  const context = {
    cycleId,
    startedCyclesCompleted: farm.cyclesCompleted
  };
  writeFarmDebug('cycle_started', {
    ...context,
    config: farm.config ? { ...farm.config } : null,
    botPosition: getBotDebugPosition(bot),
    inventory: getInventoryDebugSummary(bot)
  });

  try {
    // Refresh/barrel inspection cannot interleave with any part of a farm cycle.
    await withWorldInteractionLock(() => runCycle(bot, () => {}, context));
    farm.lastErrorMessage = null;
    writeFarmDebug('cycle_completed', {
      ...context,
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
        ...context,
        error: err.message,
        errorCode: err.code || null,
        phase: farm.phase,
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
    writeFarmDebug('farm_start_skipped', { reason: 'already_enabled' });
    return;
  }
  if (!bot) {
    writeFarmDebug('farm_start_skipped', { reason: 'missing_bot' });
    return;
  }
  if (!bot.pathfinder) {
    writeFarmDebug('farm_start_skipped', { reason: 'missing_pathfinder' });
    return;
  }
  if (!farm.config) {
    writeFarmDebug('farm_start_skipped', { reason: 'missing_config' });
    return;
  }

  farm.enabled         = true;
  farm.cyclesCompleted = 0;
  farm.lastErrorMessage = null;
  writeFarmDebug('farm_started', {
    config: { ...farm.config },
    botPosition: getBotDebugPosition(bot),
    inventory: getInventoryDebugSummary(bot)
  });
  persistentLoop(bot, notify);
}

function resume(bot, notify) {
  if (farm.enabled || !bot || !farm.config) {
    writeFarmDebug('farm_resume_skipped', {
      reason: farm.enabled ? 'already_enabled' : (!bot ? 'missing_bot' : 'missing_config')
    });
    return false;
  }
  farm.enabled = true;
  farm.lastErrorMessage = null;
  writeFarmDebug('farm_resumed', {
    config: { ...farm.config },
    botPosition: getBotDebugPosition(bot),
    inventory: getInventoryDebugSummary(bot)
  });
  persistentLoop(bot, notify);
  return true;
}

function suspend() {
  writeFarmDebug('farm_suspended', {
    phase: farm.phase,
    cyclesCompleted: farm.cyclesCompleted
  });
  farm.enabled = false;
  setFarmPhase('idle');
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
  writeFarmDebug('farm_stopped', {
    phase: farm.phase,
    cyclesCompleted: farm.cyclesCompleted
  });
  farm.enabled = false;
  setFarmPhase('idle');
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
  setCauldronRadius,
  cycleCauldronRadius,
  resetConfig,
  configureRuntime,
  prepareStart,
  inspectSupplies,
  getStatus,
  getDetailedStatus,
  getDebugLoggingEnabled,
  setDebugLoggingEnabled,
  loadPlugin
};
