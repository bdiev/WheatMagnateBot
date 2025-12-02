const mineflayer = require('mineflayer');
const config = require('./config');
const utils = require('./utils');
const database = require('./database');

class MinecraftBot {
  constructor(discordClient) {
    this.bot = null;
    this.discordClient = discordClient;
    this.lastCommandUser = null;
    this.pendingStatusMessage = null;
    this.statusMessage = null;
    this.statusUpdateInterval = null;
    this.tpsHistory = [];
    this.realTps = null;
    this.lastTickTime = 0;
    this.foodMonitorInterval = null;
    this.playerScannerInterval = null;
    this.tpsTabInterval = null;
    this.shouldReconnect = true;
    this.reconnectTimeout = 15000;
    this.startTime = Date.now();
    this.ignoredUsernames = utils.loadWhitelist();
    this.ignoredChatUsernames = config.IGNORED_CHAT_USERNAMES;
    this.killAuraInterval = null;
    this.killAuraMobType = null;
  }

  async initialize() {
    if (config.DISABLE_BOT) {
      console.log(`Bot disabled by env. DISABLE_BOT=${config.DISABLE_BOT}`);
      return false;
    }

    // Load ignored users from database
    this.ignoredChatUsernames = await database.loadIgnoredChatUsernames();

    this.createBot();
    return true;
  }

  createBot() {
    // Clean up previous bot if exists
    if (this.bot) {
      try {
        this.bot.removeAllListeners();
        this.clearIntervals();
      } catch (e) {
        console.error('[Bot] Error cleaning up previous bot:', e.message);
      }
    }

    this.lastTickTime = 0;
    const mineflayerConfig = {
      host: config.MINECRAFT_HOST,
      username: config.MINECRAFT_USERNAME,
      auth: config.MINECRAFT_AUTH,
      version: config.MINECRAFT_VERSION
    };

    // Add session if available
    if (process.env.MINECRAFT_SESSION) {
      try {
        mineflayerConfig.session = JSON.parse(process.env.MINECRAFT_SESSION);
        console.log('[Bot] Loaded session from env.');
      } catch (err) {
        console.error('[Bot] Failed to parse session from env:', err.message);
      }
    }

    this.bot = mineflayer.createBot(mineflayerConfig);
    this.setupBotEventHandlers();
  }

  setupBotEventHandlers() {
    this.bot.on('login', async () => {
      console.log(`[+] Logged in as ${this.bot.username}`);
      this.startTime = Date.now();

      if (this.pendingStatusMessage) {
        await this.pendingStatusMessage.edit({
          embeds: [{
            title: 'Bot Status',
            description: `✅ Connected to \`${config.MINECRAFT_HOST}\` as **${this.bot.username}**. Requested by ${this.lastCommandUser}`,
            color: 65280
          }]
        }).catch(console.error);
        this.pendingStatusMessage = null;
      }
      this.lastCommandUser = null;
    });

    this.bot.on('spawn', () => {
      console.log('[Bot] Spawned.');
      this.clearIntervals();
      this.startFoodMonitor();
      this.startNearbyPlayerScanner();
      this.startTpsMonitor();

      // Send status message after spawn
      if (config.DISCORD_CHANNEL_ID && this.discordClient && this.discordClient.isReady()) {
        setTimeout(async () => {
          await this.updateStatusMessage();
          this.startStatusUpdateInterval();
        }, 2000);
      }
    });

    this.bot.on('physicsTick', () => {
      this.updateTpsHistory();
    });

    this.bot.on('end', async (reason) => {
      await this.handleBotEnd(reason);
    });

    this.bot.on('error', (err) => {
      console.log(`[x] Error: ${err.message}`);
      this.discordClient?.sendNotification(`Error: \`${err.message}\``, 16711680);
    });

    this.bot.on('kicked', (reason) => {
      this.handleKicked(reason);
    });

    this.bot.on('death', () => {
      console.log('[Bot] Died.');
      this.discordClient?.sendNotification('Bot died. :skull:', 16711680);
    });

    this.bot.on('chat', (username, message) => {
      this.handleChat(username, message);
    });

    this.bot.on('whisper', (username, message) => {
      console.log(`[Whisper] ${username}: ${message}`);
      this.handleWhisper(username, message);
    });

    this.bot.on('message', (message) => {
      this.handleGameMessage(message);
    });
  }

  // Additional methods for bot functionality
  clearIntervals() {
    // Clear all intervals
    if (this.foodMonitorInterval) {
      clearInterval(this.foodMonitorInterval);
      this.foodMonitorInterval = null;
    }
    if (this.playerScannerInterval) {
      clearInterval(this.playerScannerInterval);
      this.playerScannerInterval = null;
    }
    if (this.tpsTabInterval) {
      clearInterval(this.tpsTabInterval);
      this.tpsTabInterval = null;
    }
    if (this.statusUpdateInterval) {
      clearInterval(this.statusUpdateInterval);
      this.statusUpdateInterval = null;
    }
    if (this.killAuraInterval) {
      clearInterval(this.killAuraInterval);
      this.killAuraInterval = null;
    }
  }

  startFoodMonitor() {
    // Implementation for food monitoring
  }

  startNearbyPlayerScanner() {
    // Implementation for nearby player scanning
  }

  startTpsMonitor() {
    // Implementation for TPS monitoring
  }

  updateTpsHistory() {
    // Implementation for updating TPS history
  }

  async handleBotEnd(reason) {
    // Implementation for handling bot end
  }

  handleKicked(reason) {
    // Implementation for handling kicked
  }

  handleChat(username, message) {
    // Implementation for handling chat messages
  }

  handleWhisper(username, message) {
    // Implementation for handling whispers
  }

  handleGameMessage(message) {
    // Implementation for handling game messages
  }

  async updateStatusMessage() {
    // Implementation for updating status message
  }

  startStatusUpdateInterval() {
    // Implementation for status update interval
  }

  getBot() {
    return this.bot;
  }

  isConnected() {
    return this.bot !== null;
  }
}

module.exports = MinecraftBot;