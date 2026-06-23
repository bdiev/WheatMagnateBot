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
const CYCLE_PAUSE_MS        = 300;    // pause between cycles
const INTERACT_SETTLE_MS    = 350;    // settle delay after block interaction
const DEFAULT_TARGET_X = 3402889;
const DEFAULT_TARGET_Y = 68;
const DEFAULT_TARGET_Z = 672222;
const DEFAULT_CAULDRON_DIST = 4.5;    // default max search radius for cauldrons
const MIN_PICKAXE_REMAINING_PERCENT = 5;
const FARM_CONFIG_FILE = 'obsidian_farm_config.json';
const FARM_DEBUG_LOG_FILE = 'obsidian_farm_debug.log';
const MAX_INTERACT_DISTANCE = 4.25;
const TOP_FACE_AIM_Y_OFFSET = 0.98;
const OBSIDIAN_DIG_BASE_HOLD_MS = 9_550;
const OBSIDIAN_DIG_RETRY_HOLD_BONUS_MS = 1_000;
const OBSIDIAN_DIG_CONFIRM_TIMEOUT_MS = 5_000;
const OBSIDIAN_DIG_STABILITY_MS = 250;
const OBSIDIAN_DIG_MAX_ATTEMPTS = 3;
const WEAK_PLACEMENT_ANCHORS = new Set([
  'hopper',
  'bamboo_trapdoor',
  'oak_trapdoor',
  'spruce_trapdoor',
  'birch_trapdoor',
  'jungle_trapdoor',
  'acacia_trapdoor',
  'dark_oak_trapdoor',
  'mangrove_trapdoor',
  'cherry_trapdoor',
  'crimson_trapdoor',
  'warped_trapdoor'
]);
// ── Internal state ─────────────────────────────────────────────────────────────
const farm = {
  enabled:         false,
  config: {
    x: DEFAULT_TARGET_X,
    y: DEFAULT_TARGET_Y,
    z: DEFAULT_TARGET_Z,
    maxCauldronDist: DEFAULT_CAULDRON_DIST,
  },
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
  const parsedDistance = Number(maxCauldronDist);
  farm.config = {
    x:               Math.round(Number(x)),
    y:               Math.round(Number(y)),
    z:               Math.round(Number(z)),
    maxCauldronDist: Number.isFinite(parsedDistance) && parsedDistance > 0
      ? Math.max(0.5, Math.min(128, parsedDistance))
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
        ? Math.max(0.5, Math.min(128, maxCauldronDist))
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

function getConfiguredTargetPos() {
  const { x, y, z } = farm.config;
  return new Vec3(x, y, z);
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

function isWeakPlacementAnchor(block) {
  return !block ||
    WEAK_PLACEMENT_ANCHORS.has(block.name) ||
    block.name.endsWith('_leaves') ||
    block.name.endsWith('_trapdoor');
}

function getPlacementAnchorScore(ref) {
  let score = 0;
  if (ref.block?.boundingBox === 'block') score += 20;
  if (!isWeakPlacementAnchor(ref.block)) score += 100;
  if (ref.label === 'east') score += 6;
  if (ref.label === 'west' || ref.label === 'south' || ref.label === 'north') score += 4;
  if (ref.label === 'down') score += 1;
  return score;
}

async function waitForHeldItem(bot, itemName, timeoutMs = 2_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (bot.heldItem?.name === itemName) return;
    await sleep(50);
  }
  throw new Error(`Expected to hold ${itemName}, but holding ${bot.heldItem?.name || 'nothing'}`);
}

async function useBucketOnFace(bot, referenceBlock, face) {
  const cursor = getFaceCursor(face);
  if (typeof bot._genericPlace === 'function') {
    await bot._genericPlace(referenceBlock, face, {
      delta: cursor,
      forceLook: true,
      swingArm: 'right',
      showHand: true
    });
    return;
  }

  const hitPoint = referenceBlock.position.offset(cursor.x, cursor.y, cursor.z);
  await bot.lookAt(hitPoint, true);
  await bot.activateBlock(referenceBlock, face, cursor);
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

function writeFarmDebug(event, details = {}) {
  const line = JSON.stringify({
    time: new Date().toISOString(),
    event,
    ...details
  });
  console.log(`[Farm debug] ${line}`);
  try {
    fs.appendFileSync(FARM_DEBUG_LOG_FILE, `${line}\n`, 'utf8');
  } catch (err) {
    console.error(`[Farm debug] Could not write ${FARM_DEBUG_LOG_FILE}: ${err.message}`);
  }
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
    measuredServerDigTimeMs: 9_328,
    timingSource: attempt === 1 ? 'measured_server_result' : 'measured_server_result_with_retry_bonus'
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

  const targetBlock = getKnownBlockAt(bot, targetPos, 'lava placement target');
  if (!isReplaceableForLava(targetBlock) && targetBlock.name !== 'lava') {
    throw new Error(`Cannot place lava at (${x}, ${y}, ${z}); target contains ${targetBlock.name}`);
  }

  await bot.equip(lavaBucket, 'hand');
  await waitForHeldItem(bot, 'lava_bucket');
  await sleep(INTERACT_SETTLE_MS);

  // Try all adjacent directions and use any non-replaceable block as a click surface.
  const sideOffsets = [
    { dx: 0, dy: -1, dz: 0, label: 'down' },
    { dx: 1, dy: 0, dz: 0, label: 'east' },
    { dx: -1, dy: 0, dz: 0, label: 'west' },
    { dx: 0, dy: 0, dz: 1, label: 'south' },
    { dx: 0, dy: 0, dz: -1, label: 'north' },
    { dx: 0, dy: 1, dz: 0, label: 'up' },
  ];

  const references = sideOffsets
    .map(off => ({
      label: off.label,
      face: new Vec3(-off.dx, -off.dy, -off.dz),
      block: bot.blockAt(new Vec3(x + off.dx, y + off.dy, z + off.dz)),
    }))
    .filter(ref => ref.block && !isReplaceableForLava(ref.block));

  const strongReferences = references.filter(ref => !isWeakPlacementAnchor(ref.block));
  const placementReferences = strongReferences.length > 0 ? strongReferences : references;

  // Prefer ordinary solid side blocks. Hoppers/trapdoors/leaves are weak fallback anchors.
  placementReferences.sort((a, b) => {
    return getPlacementAnchorScore(b) - getPlacementAnchorScore(a);
  });

  if (placementReferences.length === 0) {
    const adj = getAdjacentBlockDebug(bot, x, y, z);
    throw new Error(`No solid adjacent block near target (${x}, ${y}, ${z}). Adjacent: ${adj}`);
  }

  let clicked = false;
  let clickErrors = [];
  const maxAttempts = 3;
  try {
    for (let attempt = 1; attempt <= maxAttempts && !clicked; attempt++) {
      for (const ref of placementReferences) {
        const cursor = getFaceCursor(ref.face);
        const hitPoint = ref.block.position.offset(cursor.x, cursor.y, cursor.z);
        const clickDistance = bot.entity?.position?.distanceTo(hitPoint);
        if (!Number.isFinite(clickDistance) || clickDistance > MAX_INTERACT_DISTANCE) {
          clickErrors.push(`out_of_reach#${attempt}/${ref.label}:${Number.isFinite(clickDistance) ? clickDistance.toFixed(2) : 'unknown'}`);
          continue;
        }

        await bot.lookAt(hitPoint, true);
        await sleep(100);

        const shouldSneak = isWeakPlacementAnchor(ref.block);
        bot.setControlState('sneak', shouldSneak);
        try {
          await useBucketOnFace(bot, ref.block, ref.face);
        } catch (e) {
          clickErrors.push(`useBucket#${attempt}/${ref.label}: ${e?.message || 'failed'}`);
        }

        await sleep(INTERACT_SETTLE_MS + 260);
        if (didLavaPlacementLikelySucceed(bot, x, y, z)) {
          clicked = true;
          break;
        }

        try {
          await bot.activateItem();
          await sleep(INTERACT_SETTLE_MS + 260);
        } catch (e) {
          clickErrors.push(`activateItem#${attempt}/${ref.label}: ${e?.message || 'failed'}`);
        }

        if (didLavaPlacementLikelySucceed(bot, x, y, z)) {
          clicked = true;
          break;
        }

        const stillHasLavaBucket = bot.inventory.items().some(i => i.name === 'lava_bucket');
        if (!stillHasLavaBucket) {
          const actual = bot.blockAt(new Vec3(x, y, z));
          throw new Error(
            `Lava bucket was used, but exact target (${x}, ${y}, ${z}) became ${actual?.name || 'nothing'}, not lava/obsidian. ` +
            `Adjacent: ${getAdjacentBlockDebug(bot, x, y, z)}`
          );
        }

        clickErrors.push(`no_change#${attempt}/${ref.label}`);
      }
    }
  } finally {
    bot.setControlState('sneak', false);
  }

  if (!clicked && !didLavaPlacementLikelySucceed(bot, x, y, z)) {
    const adj = getAdjacentBlockDebug(bot, x, y, z);
    const attempted = placementReferences.map(ref => `${ref.label}:${ref.block?.name || 'null'}`).join(', ');
    throw new Error(
      `Could not place lava at (${x}, ${y}, ${z}) using adjacent blocks (${attempted}). ` +
      `Adjacent: ${adj}. ` +
      `Click diagnostics: ${clickErrors.slice(0, 6).join(' | ') || 'none'}.`
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
    await sleep(500);
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
    throw new Error(
      `No usable diamond/netherite pickaxe found with durability > ${MIN_PICKAXE_REMAINING_PERCENT}%. ` +
      'Obsidian farming requires a diamond or netherite pickaxe.'
    );
  }
  const { item: pick } = selected;

  await bot.equip(pick, 'hand');
  await waitForHeldItem(bot, pick.name);
  await sleep(200);

  // Re-check just before mining in case durability info changed after equip.
  const remainingAfterEquip = getRemainingDurabilityPercent(bot, pick);
  if (remainingAfterEquip <= MIN_PICKAXE_REMAINING_PERCENT) {
    throw new Error(
      `Equipped pickaxe is at ${remainingAfterEquip.toFixed(1)}% durability (<= ${MIN_PICKAXE_REMAINING_PERCENT}%).`
    );
  }

  for (let attempt = 1; attempt <= OBSIDIAN_DIG_MAX_ATTEMPTS; attempt++) {
    const block = bot.blockAt(new Vec3(x, y, z));
    if (!block || block.name !== 'obsidian') return;

    if (typeof bot.canDigBlock === 'function' && !bot.canDigBlock(block)) {
      throw new Error(`Cannot dig obsidian at (${x}, ${y}, ${z}). Move closer or clear line of sight.`);
    }

    try {
      await digBlockWithTimeout(bot, block, attempt);
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
    await sleep(250);
  }

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
    notify(
      '⚠️ Lava did not convert to obsidian within 90s.\n' +
      'Make sure flowing water meets the lava at the exact target position.\n' +
      'Farm paused — use the button to restart.',
      16776960
    );
    stop(null);
    return;
  }

  await mineObsidian(bot, obsidianPos);
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
