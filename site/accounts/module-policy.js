'use strict';

const PER_BOT_MODULES = new Set(['obsidianFarm', 'killAura', 'follow']);
const PRIMARY_ONLY_MODULES = new Set([
  'growingChild', 'whisper', 'playerObservation', 'chatCollection', 'greenChat',
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
