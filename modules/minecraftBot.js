const mineflayer = require('mineflayer');
const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
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
          try {
            const channel = await this.discordClient.getClient().channels.fetch(config.DISCORD_CHANNEL_ID);
            if (channel && channel.isTextBased()) {
              const savedId = utils.loadStatusMessageId();
              if (savedId && !this.statusMessage) {
                try {
                  this.statusMessage = await channel.messages.fetch(savedId);
                  await this.updateStatusMessage();
                } catch (e) {
                  console.error('[Discord] Failed to fetch saved status message:', e.message);
                  this.statusMessage = await channel.send({
                    embeds: [{
                      title: 'Server Status',
                      description: this.getStatusDescription(),
                      color: 65280,
                      timestamp: new Date()
                    }],
                    components: this.createStatusButtons()
                  });
                  utils.saveStatusMessageId(this.statusMessage.id);
                }
              } else if (!this.statusMessage) {
                this.statusMessage = await channel.send({
                  embeds: [{
                    title: 'Server Status',
                    description: this.getStatusDescription(),
                    color: 65280,
                    timestamp: new Date()
                  }],
                  components: this.createStatusButtons()
                });
                utils.saveStatusMessageId(this.statusMessage.id);
              } else {
                await this.updateStatusMessage();
              }
            }
          } catch (e) {
            console.error('[Discord] Failed to send status:', e.message);
          }
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

    // Add command handling
    this.bot.on('chat', (username, message) => {
      if (username !== 'bdiev_') return;

      if (message === '!restart') {
        console.log(`[Command] restart by ${username}`);
        this.lastCommandUser = `${username} (in-game)`;
        this.bot.quit('Restart command');
      }

      if (message === '!pause') {
        console.log('[Command] pause 10m');
        this.lastCommandUser = `${username} (in-game)`;
        this.shouldReconnect = false;
        this.bot.quit('Pause 10m');
        setTimeout(() => {
          console.log('[Bot] Pause ended.');
          this.shouldReconnect = true;
          this.createBot();
        }, 10 * 60 * 1000);
      }

      const pauseMatch = message.match(/^!pause\s+(\d+)$/);
      if (pauseMatch) {
        const minutes = parseInt(pauseMatch[1]);
        if (minutes > 0) {
          console.log(`[Command] pause ${minutes}m`);
          this.lastCommandUser = `${username} (in-game)`;
          this.shouldReconnect = false;
          this.bot.quit(`Paused ${minutes}m`);
          setTimeout(() => {
            console.log('[Bot] Custom pause ended.');
            this.shouldReconnect = true;
            this.createBot();
          }, minutes * 60 * 1000);
        }
      }
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
    if (!this.statusMessage || !this.bot || !this.bot.entity) return;

    const description = this.getStatusDescription();

    try {
      await this.statusMessage.edit({
        embeds: [{
          title: 'Server Status',
          description,
          color: 65280,
          timestamp: new Date()
        }],
        components: this.createStatusButtons()
      });
    } catch (e) {
      console.error('[Discord] Failed to update status:', e.message);
    }
  }

  startStatusUpdateInterval() {
    if (this.statusMessage && !this.statusUpdateInterval) {
      this.statusUpdateInterval = setInterval(() => {
        this.updateStatusMessage();
      }, 3000);
    }
  }

  getStatusDescription() {
    if (!this.bot) return 'Bot not connected';

    const playerCount = Object.keys(this.bot.players || {}).length;
    const onlinePlayers = Object.values(this.bot.players || {}).map(p => p.username);
    const whitelistOnline = onlinePlayers.filter(username => this.ignoredUsernames.some(name => name.toLowerCase() === username.toLowerCase()));
    const nearbyPlayers = utils.getNearbyPlayers(this.bot);
    const avgTps = this.realTps !== null ? this.realTps.toFixed(1) : (this.tpsHistory.length > 0 ? (this.tpsHistory.reduce((a, b) => a + b, 0) / this.tpsHistory.length).toFixed(1) : 'Calculating...');

    const nearbyNames = nearbyPlayers.map(p => p.username).join(', ') || 'None';
    return `✅ Bot **${this.bot.username}** connected to \`${config.MINECRAFT_HOST}\`\n` +
      `👥 Players online: ${playerCount}\n` +
      `👀 Players nearby: ${nearbyNames}\n` +
      `⚡ TPS: ${avgTps}\n` +
      `:hamburger: Food: ${Math.round(this.bot.food * 2) / 2}/20\n` +
      `❤️ Health: ${Math.round(this.bot.health * 2) / 2}/20\n` +
      `📋 Whitelist online: ${whitelistOnline.length > 0 ? whitelistOnline.join(', ') : 'None'}`;
  }

  createStatusButtons() {
    return [
      new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId('pause_button')
            .setLabel('⏸️ Pause')
            .setStyle(ButtonStyle.Danger),
          new ButtonBuilder()
            .setCustomId('resume_button')
            .setLabel('▶️ Resume')
            .setStyle(ButtonStyle.Success),
          new ButtonBuilder()
            .setCustomId('say_button')
            .setLabel('💬 Say')
            .setStyle(ButtonStyle.Primary),
          new ButtonBuilder()
            .setCustomId('playerlist_button')
            .setLabel('👥 Players')
            .setStyle(ButtonStyle.Secondary),
          new ButtonBuilder()
            .setCustomId('drop_button')
            .setLabel('🗑️ Drop')
            .setStyle(ButtonStyle.Secondary)
        ),
      new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId('wn_button')
            .setLabel('👀 Nearby')
            .setStyle(ButtonStyle.Secondary),
          new ButtonBuilder()
            .setCustomId('chat_setting_button')
            .setLabel('⚙️ Chat Settings')
            .setStyle(ButtonStyle.Secondary),
          new ButtonBuilder()
            .setCustomId('killaura_button')
            .setLabel('☠️ Kill Aura')
            .setStyle(ButtonStyle.Secondary)
        )
    ];
  }

  getBot() {
    return this.bot;
  }

  isConnected() {
    return this.bot !== null;
  }
}

module.exports = MinecraftBot;