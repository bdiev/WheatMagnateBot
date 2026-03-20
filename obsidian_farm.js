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
}

/** Load pathfinder plugin into a freshly created bot. Call once from createBot(). */
function loadPlugin(bot) {
  try {
    if (!bot.pathfinder) bot.loadPlugin(pathfinder);
  } catch (e) {
    console.error('[Farm] Failed to load pathfinder plugin:', e.message);
  }
}

// ── Internal helpers ───────────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
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
  await goNear(bot, cauldron.position.x, cauldron.position.y, cauldron.position.z, 2);

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
async function pourLava(bot) {
  const { x, y, z } = farm.config;

  farm.phase = 'navigating';
  await goNear(bot, x, y, z, 4);

  farm.phase = 'pouring';
  const lavaBucket = bot.inventory.items().find(i => i.name === 'lava_bucket');
  if (!lavaBucket) throw new Error('Lava bucket disappeared before pouring');

  await bot.equip(lavaBucket, 'hand');
  await sleep(INTERACT_SETTLE_MS);

  // We need a solid reference block adjacent to the target position.
  // Try all 6 faces; for each adjacent solid block, click its face toward target.
  const faces = [
    [0, -1,  0],  // below (most common — pour lava onto a surface)
    [1,  0,  0], [-1,  0,  0],
    [0,  0,  1], [0,   0, -1],
    [0,  1,  0],  // above (rare)
  ];

  let placed = false;
  for (const [dx, dy, dz] of faces) {
    const ref = bot.blockAt(new Vec3(x + dx, y + dy, z + dz));
    if (!ref || ref.boundingBox !== 'block') continue; // only solid blocks
    try {
      // The faceVector points from ref toward the target position
      await bot.placeBlock(ref, new Vec3(-dx, -dy, -dz));
      placed = true;
      break;
    } catch (_) {
      // try next adjacent block
    }
  }

  if (!placed) {
    throw new Error(
      `Could not place lava at (${x}, ${y}, ${z}). ` +
      'There must be at least one solid block adjacent to the target.'
    );
  }

  await sleep(INTERACT_SETTLE_MS);
}

/** Phase 5: wait until the target block becomes obsidian. */
async function waitForObsidian(bot) {
  const { x, y, z } = farm.config;
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
async function mineObsidian(bot) {
  const { x, y, z } = farm.config;
  farm.phase = 'mining';

  await goNear(bot, x, y, z, 4);

  const pick = bot.inventory.items().find(i => PICKAXE_PRIORITY.includes(i.name));
  if (!pick) throw new Error('No pickaxe in inventory');

  await bot.equip(pick, 'hand');
  await sleep(200);

  const block = bot.blockAt(new Vec3(x, y, z));
  if (!block || block.name !== 'obsidian') {
    throw new Error('Expected obsidian at target coordinates but found something else');
  }

  // bot.dig() awaits until the block is broken
  await bot.dig(block);
  await sleep(300);
}

// ── Main loop ──────────────────────────────────────────────────────────────────

async function runCycle(bot, notify) {
  if (!farm.config) throw new Error('Farm not configured — no target coordinates');

  await fillBucket(bot);
  await pourLava(bot);

  const formed = await waitForObsidian(bot);
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

  await mineObsidian(bot);
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

module.exports = { start, stop, configure, getStatus, loadPlugin };
