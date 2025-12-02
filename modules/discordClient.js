const { Client, GatewayIntentBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, StringSelectMenuBuilder, StringSelectMenuOptionBuilder } = require('discord.js');
const config = require('./config');
const utils = require('./utils');
const database = require('./database');

class DiscordClient {
  constructor() {
    this.client = new Client({
      intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent]
    });

    this.statusMessage = null;
    this.whisperConversations = new Map();
    this.excludedMessageIds = [];
    this.channelCleanerInterval = null;
  }

  async initialize() {
    if (!config.DISCORD_BOT_TOKEN) {
      console.log('[Discord] No token provided, skipping Discord client initialization');
      return false;
    }

    try {
      await this.client.login(config.DISCORD_BOT_TOKEN);
      console.log(`[Discord] Bot logged in as ${this.client.user.tag}`);
      this.client.user.setPresence({ status: 'online' });

      // Initialize database
      database.initDatabase();
      await database.createTables();

      this.setupEventHandlers();
      this.startChannelCleaner();

      return true;
    } catch (err) {
      console.error('[Discord] Login failed:', err.message);
      return false;
    }
  }

  setupEventHandlers() {
    this.client.on('ready', () => {
      console.log(`[Discord] Bot ready as ${this.client.user.tag}`);
    });

    this.client.on('interactionCreate', async (interaction) => {
      if (interaction.channel.id !== config.DISCORD_CHANNEL_ID) return;

      // Handle button interactions
      if (interaction.isButton()) {
        await this.handleButtonInteraction(interaction);
      }
      // Handle modal submissions
      else if (interaction.isModalSubmit()) {
        await this.handleModalInteraction(interaction);
      }
      // Handle string select menu interactions
      else if (interaction.isStringSelectMenu()) {
        await this.handleSelectMenuInteraction(interaction);
      }
    });

    this.client.on('messageCreate', async (message) => {
      await this.handleMessage(message);
    });
  }

  startChannelCleaner() {
    if (this.channelCleanerInterval) return;

    this.channelCleanerInterval = setInterval(async () => {
      try {
        const channel = await this.client.channels.fetch(config.DISCORD_CHANNEL_ID);
        if (channel && channel.isTextBased()) {
          const messages = await channel.messages.fetch({ limit: 100 });
          const messagesToDelete = messages.filter(msg => {
            if (msg.id === this.statusMessage?.id) return false;
            if (this.excludedMessageIds.includes(msg.id)) return false;

            const desc = msg.embeds[0]?.description || '';
            const lowerDesc = desc.toLowerCase();

            // Don't delete important messages
            if (lowerDesc.includes('died') || lowerDesc.includes('death') || lowerDesc.includes('perished') ||
                lowerDesc.includes('💀') || desc.includes(':skull:') ||
                desc.includes('💬') || lowerDesc.includes('whispered') || desc.includes('⬅️') || desc.includes('➡️') ||
                (msg.embeds[0]?.title && msg.embeds[0].title.startsWith('Conversation with'))) {
              return false;
            }
            return true;
          });

          if (messagesToDelete.size > 0) {
            await channel.bulkDelete(messagesToDelete);
            console.log(`[Discord] Cleaned ${messagesToDelete.size} messages from channel.`);
          }
        }
      } catch (e) {
        console.error('[Discord] Failed to clean channel:', e.message);
      }
    }, 2 * 60 * 1000); // Every 2 minutes
  }

  async sendNotification(message, color = 3447003) {
    if (!config.DISCORD_CHANNEL_ID || !this.client.isReady()) {
      console.log('[Discord] Bot not ready or no channel configured. Skipped.');
      return;
    }

    try {
      const channel = await this.client.channels.fetch(config.DISCORD_CHANNEL_ID);
      if (channel && channel.isTextBased()) {
        await channel.send({
          embeds: [{
            description: message,
            color,
            timestamp: new Date()
          }]
        });
      }
    } catch (e) {
      console.error('[Discord Bot] Failed to send:', e.message);
    }
  }

  // Additional methods for handling interactions would go here
  async handleButtonInteraction(interaction) {
    // Implementation for button interactions
  }

  async handleModalInteraction(interaction) {
    // Implementation for modal interactions
  }

  async handleSelectMenuInteraction(interaction) {
    // Implementation for select menu interactions
  }

  async handleMessage(message) {
    // Implementation for message handling
  }

  getClient() {
    return this.client;
  }

  isReady() {
    return this.client.isReady();
  }
}

module.exports = DiscordClient;