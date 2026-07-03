'use strict';

const { Movements } = require('mineflayer-pathfinder');
const { GoalFollow } = require('mineflayer-pathfinder').goals;

const DEFAULT_FOLLOW_DISTANCE = 2;

function createSafeFollowMovements(bot) {
  const movements = new Movements(bot);
  movements.canDig = false;
  movements.allow1by1towers = false;
  movements.scafoldingBlocks = [];
  movements.blocksToAvoid = new Set(movements.blocksToAvoid || []);
  return movements;
}

function createFollowFeature() {
  let targetUsername = null;
  let targetEntityId = null;
  let activeBot = null;

  function getStatus() {
    return {
      enabled: Boolean(activeBot && targetUsername),
      targetUsername
    };
  }

  function findPlayerEntity(bot, username) {
    if (!bot?.entities || !username) return null;
    const targetLower = username.toLowerCase();
    return Object.values(bot.entities).find(entity =>
      entity?.type === 'player' &&
      entity.username &&
      entity.username.toLowerCase() === targetLower
    ) || null;
  }

  function stop() {
    const bot = activeBot;
    targetUsername = null;
    targetEntityId = null;
    activeBot = null;

    try {
      bot?.pathfinder?.setGoal(null);
      bot?.pathfinder?.stop();
    } catch (_) {}

    try {
      if (typeof bot?.clearControlStates === 'function') bot.clearControlStates();
    } catch (_) {}
  }

  function start(bot, username, { distance = DEFAULT_FOLLOW_DISTANCE } = {}) {
    if (!bot?.entity) {
      throw new Error('Minecraft bot is offline.');
    }
    if (!bot.pathfinder) {
      throw new Error('Pathfinder plugin is not loaded.');
    }

    const entity = findPlayerEntity(bot, username);
    if (!entity) {
      throw new Error(`${username} is not visible nearby.`);
    }

    stop();
    activeBot = bot;
    targetUsername = entity.username;
    targetEntityId = entity.id;

    bot.pathfinder.setMovements(createSafeFollowMovements(bot));
    bot.pathfinder.setGoal(new GoalFollow(entity, distance), true);

    return {
      targetUsername,
      targetEntityId
    };
  }

  return {
    start,
    stop,
    getStatus,
    findPlayerEntity
  };
}

module.exports = {
  createFollowFeature
};
