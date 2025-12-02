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

      try {
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
      } catch (error) {
        console.error('[Discord] Error handling interaction:', error.message);
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
    try {
      if (interaction.customId === 'pause_button') {
        await interaction.deferUpdate();
        console.log(`[Button] pause by ${interaction.user.tag}`);
        // Here you would add logic to pause the bot
        // For example: global.minecraftBot.shouldReconnect = false;
        // global.minecraftBot.getBot().quit('Pause until resume');
      } else if (interaction.customId === 'resume_button') {
        await interaction.deferUpdate();
        console.log(`[Button] resume by ${interaction.user.tag}`);
        // Here you would add logic to resume the bot
        // For example: global.minecraftBot.shouldReconnect = true;
        // global.minecraftBot.createBot();
      } else if (interaction.customId === 'say_button') {
        const modal = new ModalBuilder()
          .setCustomId('say_modal')
          .setTitle('Send Message to Minecraft');

        const messageInput = new TextInputBuilder()
          .setCustomId('message_input')
          .setLabel('Message')
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true);

        const actionRow = new ActionRowBuilder().addComponents(messageInput);
        modal.addComponents(actionRow);

        await interaction.showModal(modal);
      } else if (interaction.customId === 'playerlist_button') {
        await interaction.deferReply();
        // Here you would add logic to show player list
        await interaction.editReply({
          content: 'Player list functionality would be implemented here'
        });
      } else if (interaction.customId === 'drop_button') {
        await interaction.deferReply();
        // Here you would add logic to drop items
        await interaction.editReply({
          content: 'Drop functionality would be implemented here'
        });
      } else if (interaction.customId === 'wn_button') {
        await interaction.deferReply();
        // Here you would add logic to show nearby players
        await interaction.editReply({
          content: 'Nearby players functionality would be implemented here'
        });
      } else if (interaction.customId === 'chat_setting_button') {
        await interaction.deferReply();
        // Here you would add logic for chat settings
        await interaction.editReply({
          content: 'Chat settings functionality would be implemented here'
        });
      } else if (interaction.customId === 'killaura_button') {
        await interaction.deferReply();
        // Here you would add logic for kill aura
        await interaction.editReply({
          content: 'Kill aura functionality would be implemented here'
        });
      }
    } catch (error) {
      console.error('[Discord] Error in button interaction:', error.message);
      await interaction.reply({
        content: 'An error occurred while processing your request.',
        ephemeral: true
      });
    }
  }

  async handleModalInteraction(interaction) {
    try {
      if (interaction.customId === 'say_modal') {
        await interaction.deferReply({ ephemeral: true });
        const message = interaction.fields.getTextInputValue('message_input');
        if (message && global.minecraftBot && global.minecraftBot.getBot()) {
          global.minecraftBot.getBot().chat(message);
          console.log(`[Modal] Say "${message}" by ${interaction.user.tag}`);
          await interaction.editReply({
            content: `Message sent to Minecraft: "${message}"`
          });
        } else {
          await interaction.editReply({
            content: 'Bot is not connected to Minecraft.'
          });
        }
        setTimeout(() => interaction.deleteReply().catch(() => {}), 3000);
      }
    } catch (error) {
      console.error('[Discord] Error in modal interaction:', error.message);
      await interaction.reply({
        content: 'An error occurred while processing your request.',
        ephemeral: true
      });
    }
  }

  async handleSelectMenuInteraction(interaction) {
    // Implementation for select menu interactions
    await interaction.deferUpdate();
    await interaction.editReply({
      content: 'Select menu functionality would be implemented here'
    });
  }

  async handleMessage(message) {
    // Implementation for message handling
    if (message.content === '!wn' && global.minecraftBot && global.minecraftBot.getBot()) {
      const nearby = utils.getNearbyPlayers(global.minecraftBot.getBot());
      if (nearby.length === 0) {
        await message.reply('No one nearby.');
      } else {
        await message.reply({
          embeds: [{
            title: `Nearby players (${nearby.length})`,
            description: nearby.map(p => `👤 **${p.username}** - ${p.distance} blocks`).join('\n'),
            color: 3447003
          }]
        });
      }
    }
  }

  getClient() {
    return this.client;
  }

  isReady() {
    return this.client.isReady();
  }
}

module.exports = DiscordClient;