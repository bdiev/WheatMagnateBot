'use strict';

const mineflayer = require('mineflayer');

function createMinecraftBot(config) {
  return mineflayer.createBot(config);
}

module.exports = { createMinecraftBot };
