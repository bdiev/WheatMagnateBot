require('dotenv').config();

const config = {
  // Discord configuration
  DISCORD_BOT_TOKEN: process.env.DISCORD_BOT_TOKEN,
  DISCORD_CHANNEL_ID: process.env.DISCORD_CHANNEL_ID,
  DISCORD_CHAT_CHANNEL_ID: process.env.DISCORD_CHAT_CHANNEL_ID,

  // Minecraft configuration
  MINECRAFT_HOST: process.env.MINECRAFT_HOST || 'oldfag.org',
  MINECRAFT_USERNAME: process.env.MINECRAFT_USERNAME || 'WheatMagnate',
  MINECRAFT_AUTH: process.env.MINECRAFT_AUTH || 'microsoft',
  MINECRAFT_VERSION: process.env.MINECRAFT_VERSION || false, // Auto-detect version

  // Other configuration
  IGNORED_CHAT_USERNAMES: process.env.IGNORED_CHAT_USERNAMES ? process.env.IGNORED_CHAT_USERNAMES.split(',').map(u => u.trim().toLowerCase()) : [],
  DISABLE_BOT: Boolean(process.env.DISABLE_BOT),
  RECONNECT_TIMEOUT: parseInt(process.env.RECONNECT_TIMEOUT) || 15000,
  AUTH_CACHE_DIR: process.env.AUTH_CACHE_DIR || '~/.minecraft',

  // Database configuration
  DATABASE_URL: process.env.DATABASE_URL,

  // Bot behavior settings
  FOOD_THRESHOLD: parseInt(process.env.FOOD_THRESHOLD) || 18,
  PLAYER_SCAN_RANGE: parseInt(process.env.PLAYER_SCAN_RANGE) || 300,
  TPS_MONITOR_INTERVAL: parseInt(process.env.TPS_MONITOR_INTERVAL) || 10000,
  STATUS_UPDATE_INTERVAL: parseInt(process.env.STATUS_UPDATE_INTERVAL) || 3000,
  CHANNEL_CLEANER_INTERVAL: parseInt(process.env.CHANNEL_CLEANER_INTERVAL) || 120000,

  // Food items configuration
  FOOD_ITEMS: ['bread', 'apple', 'beef', 'golden_carrot']
};

module.exports = config;