'use strict';

// Every bot keeps its own private messages ("whisper"). Watching the server
// (player observation, chat collection, playtime) is done by one bot at a
// time for all, WheatMagnate first (features/serverObserver)
const PER_BOT_MODULES = new Set(['obsidianFarm', 'killAura', 'follow', 'whisper']);
const PRIMARY_ONLY_MODULES = new Set([
  'growingChild', 'playerObservation', 'chatCollection', 'greenChat',
  'discordBridge', 'globalPlaytime', 'serverObservation', 'globalTelemetry'
]);

function assertModuleAvailable(account, moduleName) {
  if (!account?.id) throw Object.assign(new Error('Minecraft account not found.'), { statusCode:404 });
  if (PRIMARY_ONLY_MODULES.has(moduleName) && !account.isDefault) {
    throw Object.assign(new Error('Module is available only for the primary bot.'), { statusCode:403 });
  }
  return true;
}

module.exports = { PER_BOT_MODULES, PRIMARY_ONLY_MODULES, assertModuleAvailable };
