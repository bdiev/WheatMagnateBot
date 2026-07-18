'use strict';

const fs = require('node:fs');
require('dotenv').config({ quiet: true });
const { loadBotConfig } = require('../config');
const { closeServer, installGracefulShutdown, startHealthServer } = require('../runtime/lifecycle');

let config;
try {
  config = loadBotConfig(process.env);
} catch (err) {
  console.error(`[Config] ${err.message}`);
  process.exit(1);
}

fs.mkdirSync(config.minecraft.profilesFolder, { recursive: true });
fs.closeSync(fs.openSync('whitelist.txt', 'a'));

if (!config.runtime.testMode) {
  require('../bot');
} else {
  const healthServer = startHealthServer({
    port: config.runtime.healthPort,
    getStatus: () => ({ mode: 'safe-test', externalConnections: false })
  });
  console.log(`[Bot] Safe test mode active; no Discord, Minecraft, or PostgreSQL connection will be opened. Health port: ${config.runtime.healthPort}.`);
  installGracefulShutdown(async signal => {
    console.log(`[Bot] ${signal} received; stopping safe test mode.`);
    await closeServer(healthServer);
  });
}
