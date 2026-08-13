'use strict';

const Vec3 = require('vec3');

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

const FACE_DIRECTIONS = [
  new Vec3(0, -1, 0), new Vec3(0, 1, 0),
  new Vec3(0, 0, -1), new Vec3(0, 0, 1),
  new Vec3(-1, 0, 0), new Vec3(1, 0, 0)
];

function clampCursor(value) {
  const numeric = Number(value);
  return Math.max(0.001, Math.min(0.999, Number.isFinite(numeric) ? numeric : 0.5));
}

function directionNumber(direction) {
  if (direction.y < 0) return 0;
  if (direction.y > 0) return 1;
  if (direction.z < 0) return 2;
  if (direction.z > 0) return 3;
  if (direction.x < 0) return 4;
  if (direction.x > 0) return 5;
  return null;
}

function getLeverOutlineShape(block) {
  const properties = block?.getProperties?.() || {};
  const face = properties.face;
  const facing = properties.facing;
  if (face === 'wall') {
    if (facing === 'north') return [5 / 16, 4 / 16, 10 / 16, 11 / 16, 12 / 16, 1];
    if (facing === 'south') return [5 / 16, 4 / 16, 0, 11 / 16, 12 / 16, 6 / 16];
    if (facing === 'west') return [10 / 16, 4 / 16, 5 / 16, 1, 12 / 16, 11 / 16];
    if (facing === 'east') return [0, 4 / 16, 5 / 16, 6 / 16, 12 / 16, 11 / 16];
  }
  const xAxis = facing === 'east' || facing === 'west';
  if (face === 'ceiling') {
    return xAxis
      ? [4 / 16, 10 / 16, 5 / 16, 12 / 16, 1, 11 / 16]
      : [5 / 16, 10 / 16, 4 / 16, 11 / 16, 1, 12 / 16];
  }
  return xAxis
    ? [4 / 16, 0, 5 / 16, 12 / 16, 6 / 16, 11 / 16]
    : [5 / 16, 0, 4 / 16, 11 / 16, 6 / 16, 12 / 16];
}

function getInteractionShapes(block) {
  const collisionShapes = (block?.shapes || []).filter(shape => Array.isArray(shape) && shape.length >= 6);
  // Prismarine intentionally exposes collision shapes here. Levers have no
  // collision shape, but Minecraft ray-traces their non-empty outline shape
  // for interaction. Supply that vanilla outline locally so blockAtCursor can
  // distinguish the lever from its supporting wall.
  return collisionShapes.length ? collisionShapes : [getLeverOutlineShape(block)];
}

function getAimCandidates(block, shapes) {
  return shapes.map(shape => block.position.offset(
    (Number(shape[0]) + Number(shape[3])) / 2,
    (Number(shape[1]) + Number(shape[4])) / 2,
    (Number(shape[2]) + Number(shape[5])) / 2
  ));
}

async function resolvePreciseInteraction(bot, block) {
  if (typeof bot.blockAtCursor !== 'function') {
    return {
      direction: FACE_DIRECTIONS[1],
      cursorPos: new Vec3(0.5, 0.5, 0.5),
      lookAt: block.position.offset(0.5, 0.5, 0.5),
      face: 1
    };
  }

  const interactionShapes = getInteractionShapes(block);
  let lastAimedName = 'air';
  for (const lookAt of getAimCandidates(block, interactionShapes)) {
    await bot.lookAt(lookAt, true);
    await sleep(100);
    const aimed = bot.blockAtCursor(4.75, (candidate, iterator) => {
      const shapes = candidate?.position?.equals(block.position)
        ? interactionShapes
        : candidate?.shapes || [];
      const intersect = iterator.intersect(shapes, candidate.position);
      if (!intersect) return false;
      candidate.face = intersect.face;
      candidate.intersect = intersect.pos;
      return true;
    });
    lastAimedName = aimed?.name || 'air';
    if (!aimed?.position?.equals(block.position)) continue;
    const face = Number.isInteger(aimed.face) && aimed.face >= 0 && aimed.face < FACE_DIRECTIONS.length
      ? aimed.face
      : 1;
    const hit = aimed?.intersect?.minus?.(block.position) || new Vec3(0.5, 0.5, 0.5);
    return {
      direction: FACE_DIRECTIONS[face],
      cursorPos: new Vec3(clampCursor(hit.x), clampCursor(hit.y), clampCursor(hit.z)),
      lookAt,
      face
    };
  }
  throw new Error(`protection lever is not in line of sight (aimed at ${lastAimedName})`);
}

async function activatePrecisely(bot, block, interaction) {
  const { direction, cursorPos, lookAt } = interaction;
  await bot.lookAt(lookAt, true);
  await sleep(100);
  if (!bot?._client?.write || typeof bot.supportFeature !== 'function') {
    return bot.activateBlock(block, direction, cursorPos);
  }

  const directionNum = directionNumber(direction);
  if (directionNum == null) throw new Error('cannot map protection lever interaction face');
  const packet = {
    location: block.position,
    direction: directionNum,
    hand: 0,
    cursorX: cursorPos.x,
    cursorY: cursorPos.y,
    cursorZ: cursorPos.z
  };
  if (bot.supportFeature('blockPlaceHasHeldItem')) {
    const Item = require('prismarine-item')(bot.registry);
    delete packet.hand;
    packet.heldItem = Item.toNotch(bot.heldItem);
    packet.cursorX *= 16;
    packet.cursorY *= 16;
    packet.cursorZ *= 16;
  } else if (bot.supportFeature('blockPlaceHasHandAndIntCursor')) {
    packet.cursorX *= 16;
    packet.cursorY *= 16;
    packet.cursorZ *= 16;
  } else if (bot.supportFeature('blockPlaceHasInsideBlock')) {
    packet.insideBlock = false;
    packet.sequence = 0;
    packet.worldBorderHit = false;
  }
  bot._client.write('block_place', packet);
  bot.swingArm?.();
}

function createProtectionLeverController({
  log = () => {},
  debug = () => {},
  preciseInteraction = false
} = {}) {
  let operationQueue = Promise.resolve();
  let cachedPosition = null;
  let lastFailure = null;

  function isPowered(block) {
    const powered = block?.getProperties?.().powered;
    return powered === true || powered === 'true';
  }

  function find(bot) {
    if (!bot?.entity?.position) return null;
    if (cachedPosition) {
      const cached = bot.blockAt(cachedPosition);
      const distance = bot.entity.position.distanceTo(cachedPosition.offset(0.5, 0.5, 0.5));
      if (cached?.name === 'lever' && distance <= 4.5) return cached;
      cachedPosition = null;
    }

    const base = bot.entity.position.floored();
    const origin = bot.entity.position.offset(0, 0.5, 0);
    const candidates = [];
    for (let dx = -4; dx <= 4; dx++) {
      for (let dy = -3; dy <= 3; dy++) {
        for (let dz = -4; dz <= 4; dz++) {
          const position = base.offset(dx, dy, dz);
          const block = bot.blockAt(position);
          if (block?.name !== 'lever') continue;
          const distance = origin.distanceTo(position.offset(0.5, 0.5, 0.5));
          if (distance <= 4.5) candidates.push({ block, distance });
        }
      }
    }
    const nearest = candidates.sort((a, b) => a.distance - b.distance)[0];
    if (!nearest) return null;
    cachedPosition = nearest.block.position.clone();
    return nearest.block;
  }

  async function perform(bot, powered) {
    lastFailure = null;
    if (!bot?.entity) {
      lastFailure = 'Minecraft bot is offline';
      return false;
    }
    const lever = find(bot);
    if (!lever) {
      lastFailure = 'protection lever was not found within 4.5 blocks';
      log('Protection lever is not loaded or is out of interaction range.');
      debug('protection_lever_missing', { requiredState:powered ? 'on' : 'off' });
      return false;
    }

    bot.clearControlStates?.();
    bot.pathfinder?.stop?.();
    const position = lever.position.clone();
    const initialState = isPowered(lever);
    log(`Protection lever at ${position} is ${initialState ? 'ON' : 'OFF'}; required state is ${powered ? 'ON' : 'OFF'}.`);
    debug('protection_lever_check', {
      position:position.toString(), currentState:initialState ? 'on' : 'off', requiredState:powered ? 'on' : 'off'
    });
    if (initialState === powered) return true;

    if (bot.heldItem?.name?.includes('bucket')) {
      try {
        const safeItem = bot.inventory?.items?.().find(item => !item.name.includes('bucket'));
        if (safeItem) await bot.equip(safeItem, 'hand');
        else await bot.unequip?.('hand');
      } catch (error) {
        lastFailure = `could not select a safe hand item: ${error.message}`;
        log(`Could not select a safe item before lever use: ${error.message}`);
        debug('protection_lever_safe_item_failed', { error:error.message });
        return false;
      }
    }

    for (let attempt = 1; attempt <= 3; attempt++) {
      const current = bot.blockAt(position);
      if (current?.name !== 'lever') {
        lastFailure = 'protection lever disappeared before interaction';
        return false;
      }
      if (isPowered(current) === powered) return true;
      try {
        debug('protection_lever_action_start', {
          position:position.toString(), attempt, requiredState:powered ? 'on' : 'off'
        });
        if (preciseInteraction) {
          const interaction = await resolvePreciseInteraction(bot, current);
          debug('protection_lever_aim_confirmed', {
            position:position.toString(),
            attempt,
            face:interaction.face,
            direction:interaction.direction.toString(),
            cursor:interaction.cursorPos.toString(),
            lookAt:interaction.lookAt.toString()
          });
          await activatePrecisely(bot, current, interaction);
        } else {
          await bot.lookAt(current.position.offset(0.5, 0.5, 0.5), true);
          await sleep(100);
          await bot.activateBlock(current);
        }
        log(`Activated protection lever (attempt ${attempt}/3).`);
      } catch (error) {
        lastFailure = error.message;
        log(`Lever click ${attempt}/3 failed: ${error.message}`);
        debug('protection_lever_action_failed', { position:position.toString(), attempt, error:error.message });
        await sleep(100);
        continue;
      }

      const deadline = Date.now() + 2_000;
      while (Date.now() < deadline) {
        const updated = bot.blockAt(position);
        if (updated?.name === 'lever' && isPowered(updated) === powered) {
          log(`Protection lever switched ${powered ? 'ON' : 'OFF'}.`);
          debug('protection_lever_confirmed', {
            position:position.toString(), attempt, state:powered ? 'on' : 'off'
          });
          return true;
        }
        await sleep(40);
      }
      lastFailure = 'server did not confirm the new lever state';
      log(`Lever click ${attempt}/3 was not confirmed by the server.`);
    }
    return false;
  }

  function setState(bot, powered) {
    const operation = () => perform(bot, Boolean(powered));
    operationQueue = operationQueue.then(operation, operation);
    return operationQueue;
  }

  return {
    find,
    isPowered,
    setState,
    getLastFailure: () => lastFailure
  };
}

module.exports = { createProtectionLeverController };
