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
  'iron_pickaxe',
  'stone_pickaxe',
  'wooden_pickaxe',
  'golden_pickaxe',
];

const OBSIDIAN_TIMEOUT_MS   = 90_000; // max wait for lava→obsidian
const CYCLE_PAUSE_MS        = 800;    // pause between cycles
const INTERACT_SETTLE_MS    = 350;    // settle delay after block interaction
const DEFAULT_CAULDRON_DIST = 64;     // default max search radius for cauldrons
const MIN_PICKAXE_REMAINING_PERCENT = 5;
const FARM_CONFIG_FILE = 'obsidian_farm_config.json';
const MAX_INTERACT_DISTANCE = 4.25;
const TOP_FACE_AIM_Y_OFFSET = 0.98;

// ── Internal state ─────────────────────────────────────────────────────────────
const farm = {
  enabled:         false,
  config:          null,   // { x, y, z, maxCauldronDist }
  phase:           'idle', // idle | seeking | filling | navigating | pouring | waiting | mining
  loopHandle:      null,
  cyclesCompleted: 0,
};

// ── Exported helpers ───────────────────────────────────────────────────────────

/** Return a plain-object snapshot of current farm state (safe to JSON.stringify). */
function getStatus() {
  return {
    enabled:         farm.enabled,
    phase:           farm.phase,
    cyclesCompleted: farm.cyclesCompleted,
    config:          farm.config ? { ...farm.config } : null,
  };
}

/** Set target coordinates and optional cauldron search radius. */
function configure(x, y, z, maxCauldronDist) {
  farm.config = {
    x:               Math.round(Number(x)),
    y:               Math.round(Number(y)),
    z:               Math.round(Number(z)),
    maxCauldronDist: maxCauldronDist
      ? Math.max(8, Math.min(128, Math.round(Number(maxCauldronDist))))
      : DEFAULT_CAULDRON_DIST,
  };
  saveFarmConfig();
}

/** Load pathfinder plugin into a freshly created bot. Call once from createBot(). */
function loadPlugin(bot) {
  try {
    if (!bot.pathfinder) bot.loadPlugin(pathfinder);
  } catch (e) {
    console.error('[Farm] Failed to load pathfinder plugin:', e.message);
  }
}

function saveFarmConfig() {
  try {
    const payload = farm.config
      ? {
          x: farm.config.x,
          y: farm.config.y,
          z: farm.config.z,
          maxCauldronDist: farm.config.maxCauldronDist,
        }
      : null;
    fs.writeFileSync(FARM_CONFIG_FILE, JSON.stringify(payload, null, 2), 'utf8');
  } catch (e) {
    console.error('[Farm] Failed to save config:', e.message);
  }
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
    const maxCauldronDist = Number(parsed.maxCauldronDist);
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return;

    farm.config = {
      x: Math.round(x),
      y: Math.round(y),
      z: Math.round(z),
      maxCauldronDist: Number.isFinite(maxCauldronDist)
        ? Math.max(8, Math.min(128, Math.round(maxCauldronDist)))
        : DEFAULT_CAULDRON_DIST,
    };
  } catch (e) {
    console.error('[Farm] Failed to load config:', e.message);
  }
}

// ── Internal helpers ───────────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
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

function getEffectiveTargetPos(bot) {
  const { x, y, z } = farm.config;
  const configured = new Vec3(x, y, z);
  const configuredBlock = bot.blockAt(configured);

  if (isReplaceableForLava(configuredBlock)) return configured;

  // If configured block is occupied (e.g. hopper), use the block above as lava target.
  const above = configured.offset(0, 1, 0);
  const aboveBlock = bot.blockAt(above);
  if (isReplaceableForLava(aboveBlock)) return above;

  return configured;
}

function hasLavaNearTarget(bot, x, y, z) {
  const checks = [
    [0, 0, 0],
    [0, 1, 0], [0, -1, 0],
    [1, 0, 0], [-1, 0, 0],
    [0, 0, 1], [0, 0, -1],
  ];
  return checks.some(([dx, dy, dz]) => {
    const b = bot.blockAt(new Vec3(x + dx, y + dy, z + dz));
    return b?.name === 'lava';
  });
}

function didLavaPlacementLikelySucceed(bot, x, y, z) {
  const targetBlock = bot.blockAt(new Vec3(x, y, z));
  if (targetBlock?.name === 'lava') return true;

  // Fallback: if bucket was spent and lava appeared adjacent, placement probably succeeded with flow.
  const stillHasLavaBucket = bot.inventory.items().some(i => i.name === 'lava_bucket');
  return !stillHasLavaBucket && hasLavaNearTarget(bot, x, y, z);
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

    if (bestCandidate && bestPercent > minRemainingPercent) {
      return { item: bestCandidate, remainingPercent: bestPercent };
    }
  }

  return null;
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

function isSameBlockPos(a, b) {
  if (!a || !b) return false;
  return a.x === b.x && a.y === b.y && a.z === b.z;
}

/**
 * Find the nearest lava cauldron block.
 * Handles both 1.17+ (lava_cauldron block) and old cauldron with metadata ≥ 3.
 */
function findLavaCauldron(bot, maxDistance) {
  // Modern: dedicated lava_cauldron block
  const modernId = bot.registry.blocksByName['lava_cauldron']?.id;
  if (modernId != null) {
    const found = bot.findBlock({ matching: modernId, maxDistance });
    if (found) return found;
  }

  // Legacy: cauldron block with data value 3 (full of liquid — assumed lava in context)
  const legacyId = bot.registry.blocksByName['cauldron']?.id;
  if (legacyId != null) {
    return bot.findBlock({
      matching: b => b.type === legacyId && b.metadata === 3,
      maxDistance,
    }) || null;
  }

  return null;
}

// ── Phase implementations ──────────────────────────────────────────────────────

/** Phase 1+2: find cauldron and fill empty bucket with lava. */
async function fillBucket(bot) {
  const { maxCauldronDist } = farm.config;

  farm.phase = 'seeking';
  const cauldron = findLavaCauldron(bot, maxCauldronDist);
  if (!cauldron) {
    throw new Error(
      `No lava cauldron found within ${maxCauldronDist} blocks. ` +
      'Place a lava cauldron nearby and retry.'
    );
  }

  farm.phase = 'filling';
  stopAllMovement(bot);
  ensureInteractionRange(bot, cauldron.position.offset(0.5, 0.5, 0.5), 'Cauldron interaction');

  const emptyBucket = bot.inventory.items().find(i => i.name === 'bucket');
  if (!emptyBucket) throw new Error('No empty bucket in inventory');

  await bot.equip(emptyBucket, 'hand');
  await sleep(INTERACT_SETTLE_MS);
  await bot.activateBlock(cauldron);
  await sleep(INTERACT_SETTLE_MS + 100);

  // Confirm bucket is now a lava bucket
  const lavaBucket = bot.inventory.items().find(i => i.name === 'lava_bucket');
  if (!lavaBucket) {
    throw new Error('Filled bucket not found after activating cauldron. Is it a lava cauldron?');
  }
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

  await bot.equip(lavaBucket, 'hand');
  await sleep(INTERACT_SETTLE_MS);

  // User-requested strict behavior: aim at adjacent stone_bricks and do a single right-click.
  const sideOffsets = [
    { dx: 1, dy: 0, dz: 0, label: 'east' },
    { dx: -1, dy: 0, dz: 0, label: 'west' },
    { dx: 0, dy: 0, dz: 1, label: 'south' },
    { dx: 0, dy: 0, dz: -1, label: 'north' },
  ];

  let refBlock = null;
  let refFace = null;
  let refLabel = null;
  for (const off of sideOffsets) {
    const candidate = bot.blockAt(new Vec3(x + off.dx, y + off.dy, z + off.dz));
    if (candidate?.name === 'stone_bricks') {
      refBlock = candidate;
      refFace = new Vec3(-off.dx, -off.dy, -off.dz);
      refLabel = off.label;
      break;
    }
  }

  if (!refBlock) {
    const adj = getAdjacentBlockDebug(bot, x, y, z);
    throw new Error(`No stone_bricks adjacent to target (${x}, ${y}, ${z}). Adjacent: ${adj}`);
  }

  const hitPoint = new Vec3(
    refBlock.position.x + 0.5,
    refBlock.position.y + 0.5,
    refBlock.position.z + 0.5
  );

  await bot.lookAt(hitPoint, true);
  await sleep(120);

  const cursorBlock = bot.blockAtCursor(MAX_INTERACT_DISTANCE + 0.5);
  if (!cursorBlock || !isSameBlockPos(cursorBlock.position, refBlock.position)) {
    throw new Error(
      `Aim miss before right-click via stone_bricks/${refLabel}: cursor=${cursorBlock?.name || 'null'}`
    );
  }

  // Plain player-like right click with bucket while looking at stone_bricks.
  await bot.activateItem();
  await sleep(INTERACT_SETTLE_MS + 300);

  if (!didLavaPlacementLikelySucceed(bot, x, y, z)) {
    const adj = getAdjacentBlockDebug(bot, x, y, z);
    throw new Error(
      `Could not place lava at (${x}, ${y}, ${z}) via stone_bricks/${refLabel}. ` +
      `Adjacent: ${adj}.`
    );
  }

  await sleep(INTERACT_SETTLE_MS);
}

/** Phase 5: wait until the target block becomes obsidian. */
async function waitForObsidian(bot, targetPos) {
  const { x, y, z } = targetPos;
  farm.phase = 'waiting';

  const deadline = Date.now() + OBSIDIAN_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (!farm.enabled) return false;
    const block = bot.blockAt(new Vec3(x, y, z));
    if (block?.name === 'obsidian') return true;
    await sleep(500);
  }
  return false;
}

/** Phase 6: equip pickaxe and mine the obsidian. */
async function mineObsidian(bot, targetPos) {
  const { x, y, z } = targetPos;
  farm.phase = 'mining';
  stopAllMovement(bot);
  ensureInteractionRange(bot, new Vec3(x + 0.5, y + 0.5, z + 0.5), 'Obsidian mining');

  const selected = findUsablePickaxe(bot, MIN_PICKAXE_REMAINING_PERCENT);
  if (!selected) {
    throw new Error(
      `No usable pickaxe found with durability > ${MIN_PICKAXE_REMAINING_PERCENT}%. ` +
      'Add another pickaxe to inventory.'
    );
  }
  const { item: pick, remainingPercent } = selected;

  await bot.equip(pick, 'hand');
  await sleep(200);

  // Re-check just before mining in case durability info changed after equip.
  const remainingAfterEquip = getRemainingDurabilityPercent(bot, pick);
  if (remainingAfterEquip <= MIN_PICKAXE_REMAINING_PERCENT) {
    throw new Error(
      `Equipped pickaxe is at ${remainingAfterEquip.toFixed(1)}% durability (<= ${MIN_PICKAXE_REMAINING_PERCENT}%).`
    );
  }

  const block = bot.blockAt(new Vec3(x, y, z));
  if (!block || block.name !== 'obsidian') {
    throw new Error('Expected obsidian at target coordinates but found something else');
  }

  // bot.dig() awaits until the block is broken
  await bot.dig(block);
  await sleep(300);

  const remainingAfterDig = getRemainingDurabilityPercent(bot, pick);
  if (remainingAfterDig <= MIN_PICKAXE_REMAINING_PERCENT) {
    throw new Error(
      `Pickaxe durability dropped to ${remainingAfterDig.toFixed(1)}% (<= ${MIN_PICKAXE_REMAINING_PERCENT}%).`
    );
  }
}

// ── Main loop ──────────────────────────────────────────────────────────────────

async function runCycle(bot, notify) {
  if (!farm.config) throw new Error('Farm not configured — no target coordinates');

  const targetPos = getEffectiveTargetPos(bot);
  const { x, y, z } = targetPos;
  const targetBlock = bot.blockAt(targetPos);
  const hasLavaBucket = bot.inventory.items().some(i => i.name === 'lava_bucket');

  // If obsidian is already present, mine it immediately.
  if (targetBlock?.name === 'obsidian') {
    await mineObsidian(bot, targetPos);
    farm.cyclesCompleted++;
    return;
  }

  // If lava is already at target, skip fill/pour and only wait for conversion.
  if (targetBlock?.name !== 'lava') {
    if (!hasLavaBucket) {
      await fillBucket(bot);
    }
    await pourLava(bot, targetPos);
  }

  const formed = await waitForObsidian(bot, targetPos);
  if (!formed) {
    notify(
      '⚠️ Lava did not convert to obsidian within 90s.\n' +
      'Make sure flowing water meets the lava at the target position.\n' +
      'Farm paused — use the button to restart.',
      16776960
    );
    stop(null);
    return;
  }

  await mineObsidian(bot, targetPos);
  farm.cyclesCompleted++;
}

async function loop(bot, notify) {
  if (!farm.enabled) return;
  try {
    await runCycle(bot, notify);
  } catch (err) {
    console.error('[Farm] Cycle error:', err.message);
    notify(`❌ Obsidian farm stopped: \`${err.message}\``, 16711680);
    stop(null);
    return;
  }

  if (farm.enabled) {
    farm.loopHandle = setTimeout(() => loop(bot, notify), CYCLE_PAUSE_MS);
  }
}

/**
 * Start the farm.
 * @param {object} bot      - mineflayer bot instance
 * @param {Function} notify - fn(message, color) to send Discord notifications
 */
function start(bot, notify) {
  if (farm.enabled) {
    notify('⚠️ Obsidian farm is already running.', 16776960);
    return;
  }
  if (!bot) {
    notify('❌ Bot is offline.', 16711680);
    return;
  }
  if (!bot.pathfinder) {
    notify('❌ Cannot start farm: pathfinder plugin is not loaded. Restart the bot first.', 16711680);
    return;
  }
  if (!farm.config) {
    notify('❌ Set target coordinates first.', 16711680);
    return;
  }

  const { x, y, z, maxCauldronDist } = farm.config;
  farm.enabled         = true;
  farm.cyclesCompleted = 0;
  notify(
    `🏭 **Obsidian farm started.**\n` +
    `Target: \`(${x}, ${y}, ${z})\`  •  Cauldron search radius: ${maxCauldronDist} blocks`,
    65280
  );
  loop(bot, notify);
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
  if (notify) notify(`🛑 Obsidian farm stopped. Cycles completed: **${farm.cyclesCompleted}**`, 16711680);
}

loadFarmConfig();

module.exports = { start, stop, configure, getStatus, loadPlugin };
