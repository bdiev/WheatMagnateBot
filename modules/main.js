const DiscordClient = require('./discordClient');
const MinecraftBot = require('./minecraftBot');
const config = require('./config');
const database = require('./database');

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  console.log('Uncaught Exception:', err);
  if (global.discordClient) {
    global.discordClient.sendNotification(`Uncaught exception: \`${err.message}\``, 16711680);
  }
  if (global.minecraftBot && global.minecraftBot.getBot()) {
    try {
      global.minecraftBot.getBot().quit();
    } catch (e) {
      console.error('Error quitting Minecraft bot:', e.message);
    }
  }
});

process.on('unhandledRejection', (reason) => {
  console.log('Unhandled Rejection:', reason);
  if (global.discordClient) {
    global.discordClient.sendNotification(`Unhandled rejection: \`${reason}\``, 16711680);
  }
});

async function main() {
  console.log('Starting WheatMagnateBot...');

  // Initialize database first
  database.initDatabase();
  await database.createTables();

  // Initialize Discord client
  const discordClient = new DiscordClient();
  const discordInitialized = await discordClient.initialize();

  // Initialize Minecraft bot
  const minecraftBot = new MinecraftBot(discordInitialized ? discordClient : null);
  const minecraftInitialized = await minecraftBot.initialize();

  if (!discordInitialized && !minecraftInitialized) {
    console.log('Both Discord and Minecraft clients failed to initialize. Exiting...');
    process.exit(1);
  }

  // Store globally for error handling
  global.discordClient = discordClient;
  global.minecraftBot = minecraftBot;

  console.log('Bot initialized successfully!');
}

if (require.main === module) {
  main().catch(err => {
    console.error('Fatal error during initialization:', err);
    process.exit(1);
  });
}

module.exports = { main };