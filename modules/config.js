require('dotenv').config();

const config = {
  // Discord configuration
  DISCORD_BOT_TOKEN: process.env.DISCORD_BOT_TOKEN,
  DISCORD_CHANNEL_ID: process.env.DISCORD_CHANNEL_ID,
  DISCORD_CHAT_CHANNEL_ID: process.env.DISCORD_CHAT_CHANNEL_ID,

  // Minecraft configuration
  MINECRAFT_HOST: 'oldfag.org',
  MINECRAFT_USERNAME: process.env.MINECRAFT_USERNAME || 'WheatMagnate',
  MINECRAFT_AUTH: 'microsoft',
  MINECRAFT_VERSION: false, // Auto-detect version

  // Other configuration
  IGNORED_CHAT_USERNAMES: process.env.IGNORED_CHAT_USERNAMES ? process.env.IGNORED_CHAT_USERNAMES.split(',').map(u => u.trim().toLowerCase()) : [],
  DISABLE_BOT: Boolean(process.env.DISABLE_BOT),

  // Database configuration
  DATABASE_URL: process.env.DATABASE_URL
};

module.exports = config;