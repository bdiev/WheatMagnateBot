'use strict';

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function createProtectionLeverController({ log = () => {}, debug = () => {} } = {}) {
  let operationQueue = Promise.resolve();
  let cachedPosition = null;

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
    if (!bot?.entity) return false;
    const lever = find(bot);
    if (!lever) {
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
        log(`Could not select a safe item before lever use: ${error.message}`);
        debug('protection_lever_safe_item_failed', { error:error.message });
        return false;
      }
    }

    for (let attempt = 1; attempt <= 3; attempt++) {
      const current = bot.blockAt(position);
      if (current?.name !== 'lever') return false;
      if (isPowered(current) === powered) return true;
      try {
        debug('protection_lever_action_start', {
          position:position.toString(), attempt, requiredState:powered ? 'on' : 'off'
        });
        // This forced turn is shared by primary and secondary accounts. Do not
        // reject wall-mounted levers via blockAtCursor(center): their center ray
        // can legitimately intersect the supporting block behind the lever.
        await bot.lookAt(current.position.offset(0.5, 0.5, 0.5), true);
        await sleep(100);
        await bot.activateBlock(current);
        log(`Activated protection lever (attempt ${attempt}/3).`);
      } catch (error) {
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
      log(`Lever click ${attempt}/3 was not confirmed by the server.`);
    }
    return false;
  }

  function setState(bot, powered) {
    const operation = () => perform(bot, Boolean(powered));
    operationQueue = operationQueue.then(operation, operation);
    return operationQueue;
  }

  return { find, isPowered, setState };
}

module.exports = { createProtectionLeverController };
