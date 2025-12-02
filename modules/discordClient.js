
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
    this.whisperConversations = new Map(); // username -> messageId
    this.excludedMessageIds = [];
    this.channelCleanerInterval = null;
    this.minecraftBot = null;
    this.lastCommandUser = null;
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
    }, config.CHANNEL_CLEANER_INTERVAL);
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

  async sendWhisperToDiscord(username, message) {
    if (!config.DISCORD_CHANNEL_ID || !this.client.isReady()) {
      console.log('[Discord] Bot not ready for whisper.');
      return;
    }

    try {
      const channel = await this.client.channels.fetch(config.DISCORD_CHANNEL_ID);
      if (channel && channel.isTextBased()) {
        const now = new Date();
        const timeStr = utils.formatTimeForConversation();
        const newEntry = `[${timeStr}] ⬅️ ${username}: ${message}`;

        try {
          if (this.whisperConversations.has(username)) {
            // Update existing conversation
            const messageId = this.whisperConversations.get(username);
            const existingMessage = await channel.messages.fetch(messageId);
            const currentDesc = existingMessage.embeds[0]?.description || '';
            const updatedDesc = currentDesc + '\n\n' + newEntry;

            await existingMessage.edit({
              embeds: [{
                title: `Conversation with ${username}`,
                description: updatedDesc,
                color: 3447003,
                timestamp: now
              }],
              components: [
                new ActionRowBuilder()
                  .addComponents(
                    new ButtonBuilder()
                      .setCustomId(`reply_${Buffer.from(username).toString('base64')}_${messageId}`)
                      .setLabel('Reply')
                      .setStyle(ButtonStyle.Primary),
                    new ButtonBuilder()
                      .setCustomId(`remove_${messageId}`)
                      .setLabel('Remove')
                      .setStyle(ButtonStyle.Danger)
                  )
              ]
            });
          }
        } catch (e) {
          console.error('[Discord] Failed to update conversation:', e.message);
          this.whisperConversations.delete(username);
        }

        if (!this.whisperConversations.has(username)) {
          // Create new conversation
          const sentMessage = await channel.send({
            embeds: [{
              title: `Conversation with ${username}`,
              description: newEntry,
              color: 3447003,
              timestamp: now
            }]
          });

          this.whisperConversations.set(username, sentMessage.id);

          await sentMessage.edit({
            embeds: [{
              title: `Conversation with ${username}`,
              description: newEntry,
              color: 3447003,
              timestamp: now
            }],
            components: [
              new ActionRowBuilder()
                .addComponents(
                  new ButtonBuilder()
                    .setCustomId(`reply_${Buffer.from(username).toString('base64')}_${sentMessage.id}`)
                    .setLabel('Reply')
                    .setStyle(ButtonStyle.Primary),
                  new ButtonBuilder()
                    .setCustomId(`remove_${sentMessage.id}`)
                    .setLabel('Remove')
                    .setStyle(ButtonStyle.Danger)
                )
            ]
          });
        }
      }
    } catch (e) {
      console.error('[Discord] Failed to send whisper:', e.message);
    }
  }

  async updateStatusMessage() {
    if (!this.statusMessage || !this.minecraftBot || !this.minecraftBot.getBot() || !this.minecraftBot.getBot().entity) return;

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

  getStatusDescription() {
    if (!this.minecraftBot || !this.minecraftBot.getBot()) return 'Bot not connected';

    const bot = this.minecraftBot.getBot();
    const playerCount = Object.keys(bot.players || {}).length;
    const onlinePlayers = Object.values(bot.players || {}).map(p => p.username);
    const whitelistOnline = onlinePlayers.filter(username =>
      this.minecraftBot.ignoredUsernames.some(name => name.toLowerCase() === username.toLowerCase())
    );
    const nearbyPlayers = utils.getNearbyPlayers(bot);
    const avgTps = this.minecraftBot.realTps !== null ?
      this.minecraftBot.realTps.toFixed(1) :
      (this.minecraftBot.tpsHistory.length > 0 ?
        (this.minecraftBot.tpsHistory.reduce((a, b) => a + b, 0) / this.minecraftBot.tpsHistory.length).toFixed(1) :
        'Calculating...');

    const nearbyNames = nearbyPlayers.map(p => p.username).join(', ') || 'None';
    return `✅ Bot **${bot.username}** connected to \`${config.MINECRAFT_HOST}\`\n` +
      `👥 Players online: ${playerCount}\n` +
      `👀 Players nearby: ${nearbyNames}\n` +
      `⚡ TPS: ${avgTps}\n` +
      `:hamburger: Food: ${Math.round(bot.food * 2) / 2}/20\n` +
      `❤️ Health: ${Math.round(bot.health * 2) / 2}/20\n` +
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
            .setStyle(ButtonStyle.Secondary)
        )
    ];
  }

  // Button interaction handlers
  async handleButtonInteraction(interaction) {
    try {
      if (interaction.customId === 'pause_button') {
        await interaction.deferUpdate();
        console.log(`[Button] pause by ${interaction.user.tag}`);
        this.lastCommandUser = interaction.user.tag;
        this.minecraftBot.shouldReconnect = false;
        this.minecraftBot.getBot().quit('Pause until resume');
      } else if (interaction.customId === 'resume_button') {
        await interaction.deferUpdate();
        if (this.minecraftBot.shouldReconnect) return;
        console.log(`[Button] resume by ${interaction.user.tag}`);
        this.lastCommandUser = interaction.user.tag;
        this.minecraftBot.shouldReconnect = true;
        this.minecraftBot.createBot();
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
        await this.handlePlayerListButton(interaction);
      } else if (interaction.customId === 'drop_button') {
        await this.handleDropButton(interaction);
      } else if (interaction.customId === 'wn_button') {
        await this.handleNearbyButton(interaction);
      } else if (interaction.customId === 'chat_setting_button') {
        await this.handleChatSettingsButton(interaction);
      } else if (interaction.customId.startsWith('reply_')) {
        await this.handleReplyButton(interaction);
      } else if (interaction.customId.startsWith('remove_')) {
        await this.handleRemoveButton(interaction);
      }
    } catch (error) {
      console.error('[Discord] Error in button interaction:', error.message);
      await interaction.reply({
        content: 'An error occurred while processing your request.',
        ephemeral: true
      });
    }
  }

  async handlePlayerListButton(interaction) {
    await interaction.deferReply();
    if (!this.minecraftBot || !this.minecraftBot.getBot()) {
      await interaction.editReply({
        embeds: [{
          description: 'Bot is offline.',
          color: 16711680,
          timestamp: new Date()
        }]
      });
      return;
    }

    const bot = this.minecraftBot.getBot();
    const allOnlinePlayers = Object.values(bot.players || {}).map(p => p.username);
    const whitelistOnline = allOnlinePlayers.filter(username =>
      this.minecraftBot.ignoredUsernames.some(name =>
        name.toLowerCase() === username.toLowerCase()
      )
    );
    const otherPlayers = allOnlinePlayers.filter(username =>
      !this.minecraftBot.ignoredUsernames.some(name =>
        name.toLowerCase() === username.toLowerCase()
      )
    );

    const playerList = [];
    if (whitelistOnline.length > 0) {
      playerList.push(`🛡️ **Whitelist:** ${whitelistOnline.join(', ')}`);
    }
    if (otherPlayers.length > 0) {
      playerList.push(`👥 **Others:** ${otherPlayers.join(', ')}`);
    }
    const description = playerList.length > 0 ? playerList.join('\n\n') : 'No players online.';

    const options = whitelistOnline.map(username => {
      return new StringSelectMenuOptionBuilder()
        .setLabel(username)
        .setValue(Buffer.from(username).toString('base64'));
    });

    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId('message_select')
      .setPlaceholder('Select player to message')
      .addOptions(options.slice(0, 25));

    const row = new ActionRowBuilder().addComponents(selectMenu);

    await interaction.editReply({
      embeds: [{
        title: `Online Players (${allOnlinePlayers.length})`,
        description,
        color: 3447003,
        timestamp: new Date()
      }],
      components: [row]
    });
  }

  async handleDropButton(interaction) {
    await interaction.deferReply();
    if (!this.minecraftBot || !this.minecraftBot.getBot()) {
      await interaction.editReply({
        embeds: [{
          description: 'Bot is offline.',
          color: 16711680,
          timestamp: new Date()
        }]
      });
      return;
    }

    const bot = this.minecraftBot.getBot();
    const inventory = bot.inventory.items();
    if (inventory.length === 0) {
      await interaction.editReply({
        embeds: [{
          description: 'Inventory is empty.',
          color: 3447003,
          timestamp: new Date()
        }]
      });
      return;
    }

    const options = inventory.map(item => {
      const name = item.displayName || item.name;
      const count = item.count;
      const value = `${item.slot}_${item.type}_${item.metadata || 0}`;
      return new StringSelectMenuOptionBuilder()
        .setLabel(`${name} x${count}`)
        .setValue(Buffer.from(value).toString('base64'));
    });

    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId('drop_select')
      .setPlaceholder('Select item to drop')
      .addOptions(options.slice(0, 25));

    const row = new ActionRowBuilder().addComponents(selectMenu);

    await interaction.editReply({
      embeds: [{
        title: 'Drop Item',
        description: 'Select an item from inventory to drop.',
        color: 3447003,
        timestamp: new Date()
      }],
      components: [row]
    });
  }

  async handleNearbyButton(interaction) {
    await interaction.deferReply();
    if (!this.minecraftBot || !this.minecraftBot.getBot() || !this.minecraftBot.getBot().entity) {
      await interaction.editReply({
        embeds: [{
          description: 'Bot is offline.',
          color: 16711680,
          timestamp: new Date()
        }]
      });
      return;
    }

    const bot = this.minecraftBot.getBot();
    const nearby = utils.getNearbyPlayers(bot);

    if (nearby.length === 0) {
      await interaction.editReply({
        embeds: [{
          description: 'No one nearby.',
          color: 3447003,
          timestamp: new Date()
        }]
      });
    } else {
      await interaction.editReply({
        embeds: [{
          title: `Nearby players (${nearby.length})`,
          description: nearby.map(p => `👤 **${p.username}** - ${p.distance} blocks`).join('\n'),
          color: 3447003,
          timestamp: new Date()
        }]
      });
    }
  }

  async handleChatSettingsButton(interaction) {
    await interaction.deferReply();
    if (!this.minecraftBot || !this.minecraftBot.getBot()) {
      await interaction.editReply({
        embeds: [{
          description: 'Bot is offline.',
          color: 16711680,
          timestamp: new Date()
        }]
      });
      return;
    }

    const bot = this.minecraftBot.getBot();
    const allOnlinePlayers = Object.values(bot.players || {}).map(p => p.username);
    const playersToIgnore = allOnlinePlayers.filter(username =>
      !this.minecraftBot.ignoredChatUsernames.includes(username.toLowerCase())
    );
    const playersToUnignore = this.minecraftBot.ignoredChatUsernames.filter(username =>
      allOnlinePlayers.some(p => p.toLowerCase() === username)
    );

    const ignoreOptions = playersToIgnore.map(username => {
      return new StringSelectMenuOptionBuilder()
        .setLabel(username)
        .setValue(Buffer.from(username).toString('base64'));
    });

    const unignoreOptions = playersToUnignore.map(username => {
      return new StringSelectMenuOptionBuilder()
        .setLabel(username)
        .setValue(Buffer.from(username).toString('base64'));
    });

    const ignoreMenu = new StringSelectMenuBuilder()
      .setCustomId('ignore_select')
      .setPlaceholder('Select player to ignore')
      .addOptions(ignoreOptions.slice(0, 25));

    const unignoreMenu = new StringSelectMenuBuilder()
      .setCustomId('unignore_select')
      .setPlaceholder('Select player to unignore')
      .addOptions(unignoreOptions.slice(0, 25));

    const components = [];
    if (ignoreOptions.length > 0) {
      components.push(new ActionRowBuilder().addComponents(ignoreMenu));
    }
    if (unignoreOptions.length > 0) {
      components.push(new ActionRowBuilder().addComponents(unignoreMenu));
    }

    await interaction.editReply({
      embeds: [{
        title: 'Chat Settings',
        description: 'Manage ignored players for chat messages.',
        color: 3447003,
        timestamp: new Date()
      }],
      components
    });
  }

  async handleReplyButton(interaction) {
    const parts = interaction.customId.split('_');
    const encodedUsername = parts[1];
    const username = Buffer.from(encodedUsername, 'base64').toString('utf8');

    const modal = new ModalBuilder()
      .setCustomId(`reply_modal_${encodedUsername}`)
      .setTitle(`Reply to ${username}`);

    const messageInput = new TextInputBuilder()
      .setCustomId('reply_message')
      .setLabel('Message')
      .setStyle(TextInputStyle.Paragraph)
      .setValue('/r ')
      .setRequired(true);

    const actionRow = new ActionRowBuilder().addComponents(messageInput);
    modal.addComponents(actionRow);

    await interaction.showModal(modal);
  }

  async handleRemoveButton(interaction) {
    const messageId = interaction.customId.split('_')[1];
    try {
      const message = await interaction.channel.messages.fetch(messageId);
      await message.delete();

      // Remove from conversations map
      for (const [username, msgId] of this.whisperConversations) {
        if (msgId === messageId) {
          this.whisperConversations.delete(username);
          break;
        }
      }
      await interaction.deferUpdate();
    } catch (e) {
      console.error('[Discord] Failed to delete message:', e.message);
      await interaction.reply({ content: 'Failed to delete message.', ephemeral: true });
    }
  }

  // Modal interaction handlers
  async handleModalInteraction(interaction) {
    try {
      if (interaction.customId === 'say_modal') {
        await interaction.deferReply({ ephemeral: true });
        const message = interaction.fields.getTextInputValue('message_input');
        if (message && this.minecraftBot && this.minecraftBot.getBot()) {
          this.minecraftBot.getBot().chat(message);
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
      } else if (interaction.customId.startsWith('message_modal_')) {
        const encodedUsername = interaction.customId.split('_')[2];
        const selectedUsername = Buffer.from(encodedUsername, 'base64').toString('utf8');
        const messageText = interaction.fields.getTextInputValue('message_text');

        if (messageText && this.minecraftBot && this.minecraftBot.getBot()) {
          let command;
          let displayMessage = messageText;

          if (messageText.startsWith('/msg ')) {
            displayMessage = messageText.replace(`/msg ${selectedUsername} `, '');
          }

          if (messageText.startsWith('/')) {
            command = messageText;
            console.log(`[Message] Sent command "${command}" by ${interaction.user.tag}`);
          } else {
            command = `/msg ${selectedUsername} ${messageText}`;
            console.log(`[Message] Sent /msg ${selectedUsername} ${messageText} by ${interaction.user.tag}`);
          }

          this.minecraftBot.getBot().chat(command);

          await interaction.reply({
            content: `Message sent to ${selectedUsername}: "${displayMessage}"`,
            ephemeral: true
          });

          setTimeout(() => interaction.deleteReply().catch(() => {}), 3000);
        } else {
          await interaction.reply({
            content: 'Bot is not connected to Minecraft.',
            ephemeral: true
          });
        }
      }
    } catch (error) {
      console.error('[Discord] Error in modal interaction:', error.message);
      await interaction.reply({
        content: 'An error occurred while processing your request.',
        ephemeral: true
      });
    }
  }

  // Select menu interaction handlers
  async handleSelectMenuInteraction(interaction) {
    try {
      if (interaction.customId === 'message_select') {
        const encodedUsername = interaction.values[0];
        const selectedUsername = Buffer.from(encodedUsername, 'base64').toString('utf8');

        const modal = new ModalBuilder()
          .setCustomId(`message_modal_${encodedUsername}`)
          .setTitle(`Message to ${selectedUsername}`);

        const messageInput = new TextInputBuilder()
          .setCustomId('message_text')
          .setLabel('Message')
          .setStyle(TextInputStyle.Paragraph)
          .setValue(`/msg ${selectedUsername} `)
          .setRequired(true);

        const actionRow = new ActionRowBuilder().addComponents(messageInput);
        modal.addComponents(actionRow);

        await interaction.showModal(modal);
      } else if (interaction.customId === 'drop_select') {
        await interaction.deferUpdate();
        const encodedValue = interaction.values[0];
        const selectedValue = Buffer.from(encodedValue, 'base64').toString('utf8');
        const [slot, type, metadata] = selectedValue.split('_').map((v, i) => i === 2 ? parseInt(v) : v);

        const bot = this.minecraftBot.getBot();
        const inventory = bot.inventory.items();
        const item = inventory.find(i => i.slot == slot && i.type == type && (i.metadata || 0) == metadata);

        if (!item) {
          await interaction.editReply({
            embeds: [{
              description: 'Item not found.',
              color: 16711680,
              timestamp: new Date()
            }],
            components: []
          });
          return;
        }

        try {
          // Find nearest player and look at them before dropping
          const nearby = utils.getNearbyPlayers(bot);
          if (nearby.length > 0) {
            const nearest = nearby.sort((a, b) => a.distance - b.distance)[0];
            for (const entity of Object.values(bot.entities)) {
              if (entity.username === nearest.username) {
                await bot.lookAt(entity.position);
                break;
              }
            }
          }

          await bot.toss(item.type, item.metadata || null, item.count);
          console.log(`[Drop] Dropped ${item.count} x ${item.displayName || item.name} by ${interaction.user.tag}`);

          await interaction.editReply({
            embeds: [{
              title: 'Item Dropped',
              description: `Dropped ${item.count} x ${item.displayName || item.name}`,
              color: 65280,
              timestamp: new Date()
            }],
            components: []
          });
        } catch (err) {
          console.error('[Drop] Error:', err.message);
          await interaction.editReply({
            embeds: [{
              description: `Failed to drop item: ${err.message}`,
              color: 16711680,
              timestamp: new Date()
            }],
            components: []
          });
        }
      } else if (interaction.customId === 'ignore_select') {
        await this.handleIgnoreSelect(interaction);
      } else if (interaction.customId === 'unignore_select') {
        await this.handleUnignoreSelect(interaction);
      }
    } catch (error) {
      console.error('[Discord] Error in select menu interaction:', error.message);
      await interaction.reply({
        content: 'An error occurred while processing your request.',
        ephemeral: true
      });
    }
  }

  async handleIgnoreSelect(interaction) {
    await interaction.deferUpdate();
    const encodedUsername = interaction.values[0];
    const selectedUsername = Buffer.from(encodedUsername, 'base64').toString('utf8');

    if (!config.DATABASE_URL) {
      await interaction.editReply({
        embeds: [{
          description: 'Database not configured.',
          color: 16711680,
          timestamp: new Date()
        }],
        components: []
      });
      return;
    }

    try {
      await database.addIgnoredUser(selectedUsername.toLowerCase(), interaction.user.tag);
      this.minecraftBot.ignoredChatUsernames = await database.loadIgnoredChatUsernames();

      // Update the message with new lists
      const bot = this.minecraftBot.getBot();
      const allOnlinePlayers = Object.values(bot.players || {}).map(p => p.username);
      const playersToIgnore = allOnlinePlayers.filter(username =>
        !this.minecraftBot.ignoredChatUsernames.includes(username.toLowerCase())
      );
      const playersToUnignore = this.minecraftBot.ignoredChatUsernames.filter(username =>
        allOnlinePlayers.some(p => p.toLowerCase() === username)
      );

      const ignoreOptions = playersToIgnore.map(username => {
        return new StringSelectMenuOptionBuilder()
          .setLabel(username)
          .setValue(Buffer.from(username).toString('base64'));
      });

      const unignoreOptions = playersToUnignore.map(username => {
        return new StringSelectMenuOptionBuilder()
          .setLabel(username)
          .setValue(Buffer.from(username).toString('base64'));
      });

      const ignoreMenu = new StringSelectMenuBuilder()
        .setCustomId('ignore_select')
        .setPlaceholder('Select player to ignore')
        .addOptions(ignoreOptions.slice(0, 25));

      const unignoreMenu = new StringSelectMenuBuilder()
        .setCustomId('unignore_select')
        .setPlaceholder('Select player to unignore')
        .addOptions(unignoreOptions.slice(0, 25));

      const components = [];
      if (ignoreOptions.length > 0) {
        components.push(new ActionRowBuilder().addComponents(ignoreMenu));
      }
      if (unignoreOptions.length > 0) {
        components.push(new ActionRowBuilder().addComponents(unignoreMenu));
      }

      await interaction.editReply({
        embeds: [{
          title: 'Chat Settings',
          description: `✅ Added ${selectedUsername} to ignore list.\n\nManage ignored players for chat messages.`,
          color: 65280,
          timestamp: new Date()
        }],
        components
      });
    } catch (err) {
      console.error('[Ignore] Error:', err.message);
      await interaction.editReply({
        embeds: [{
          description: `Failed to add ${selectedUsername} to ignore list: ${err.message}`,
          color: 16711680,
          timestamp: new Date()
        }],
        components: []
      });
    }
  }

  async handleUnignoreSelect(interaction) {
    await interaction.deferUpdate();
    const encodedUsername = interaction.values[0];
    const selectedUsername = Buffer.from(encodedUsername, 'base64').toString('utf8');

    if (!config.DATABASE_URL) {
      await interaction.editReply({
        embeds: [{
          description: 'Database not configured.',
          color: 16711680,
          timestamp: new Date()
        }],
        components: []
      });
      return;
    }

    try {
      const result = await database.removeIgnoredUser(selectedUsername.toLowerCase());
      if (result) {
        this.minecraftBot.ignoredChatUsernames = await database.loadIgnoredChatUsernames();

        // Update the message with new lists
        const bot = this.minecraftBot.getBot();
        const allOnlinePlayers = Object.values(bot.players || {}).map(p => p.username);
        const playersToIgnore = allOnlinePlayers.filter(username =>
          !this.minecraftBot.ignoredChatUsernames.includes(username.toLowerCase())
        );
        const playersToUnignore = this.minecraftBot.ignoredChatUsernames.filter(username =>
          allOnlinePlayers.some(p => p.toLowerCase() === username)
        );

        const ignoreOptions = playersToIgnore.map(username => {
          return new StringSelectMenuOptionBuilder()
            .setLabel(username)
            .setValue(Buffer.from(username).toString('base64'));
        });

        const unignoreOptions = playersToUnignore.map(username => {
          return new StringSelectMenuOptionBuilder()
            .setLabel(username)
            .setValue(Buffer.from(username).toString('base64'));
        });

        const ignoreMenu = new StringSelectMenuBuilder()
          .setCustomId('ignore_select')
          .setPlaceholder('Select player to ignore')
          .addOptions(ignoreOptions.slice(0, 25));

        const unignoreMenu = new StringSelectMenuBuilder()
          .setCustomId('unignore_select')
          .setPlaceholder('Select player to unignore')
          .addOptions(unignoreOptions.slice(0, 25));

        const components = [];
        if (ignoreOptions.length > 0) {
          components.push(new ActionRowBuilder().addComponents(ignoreMenu));
        }
        if (unignoreOptions.length > 0) {
          components.push(new ActionRowBuilder().addComponents(unignoreMenu));
        }

        await interaction.editReply({
          embeds: [{
            title: 'Chat Settings',
            description: `✅ Removed ${selectedUsername} from ignore list.\n\nManage ignored players for chat messages.`,
            color: 65280,
            timestamp: new Date()
          }],
          components
        });
      } else {
        await interaction.editReply({
          embeds: [{
            description: `${selectedUsername} is not in ignore list.`,
            color: 16776960,
            timestamp: new Date()
          }],
          components: []
        });
      }
    } catch (err) {
      console.error('[Unignore] Error:', err.message);
      await interaction.editReply({
        embeds: [{
          description: `Failed to remove ${selectedUsername} from ignore list: ${err.message}`,
          color: 16711680,
          timestamp: new Date()
        }],
        components: []
      });
    }
  }

  // Message handlers
  async handleMessage(message) {
    if (message.author.bot) return;

    // Handle chat channel messages
    if (message.channel.id === config.DISCORD_CHAT_CHANNEL_ID) {
      if (!this.minecraftBot || !this.minecraftBot.getBot()) return;
      const text = message.content.trim();
      if (text) {
        this.minecraftBot.getBot().chat(text);
        console.log(`[Chat] Sent "${text}" by ${message.author.tag}`);
      }
      return;
    }

    if (message.channel.id !== config.DISCORD_CHANNEL_ID) return;

    if (message.content === '!wn') {
      await this.handleNearbyCommand(message);
    } else if (message.content === '!restart') {
      await this.handleRestartCommand(message);
    } else if (message.content === '!pause') {
      await this.handlePauseCommand(message);
    } else if (message.content.startsWith('!pause ')) {
      await this.handleCustomPauseCommand(message);
    } else if (message.content === '!resume') {
      await this.handleResumeCommand(message);
    } else if (message.content.startsWith('!allow ')) {
      await this.handleAllowCommand(message);
    } else if (message.content.startsWith('!ignore ')) {
      await this.handleIgnoreCommand(message);
    } else if (message.content.startsWith('!unignore ')) {
      await this.handleUnignoreCommand(message);
    } else if (message.content.startsWith('!say ')) {
      await this.handleSayCommand(message);
    }
  }

  async handleNearbyCommand(message) {
    if (!this.minecraftBot || !this.minecraftBot.getBot() || !this.minecraftBot.getBot().entity) {
      await message.reply({
        embeds: [{
          description: 'Bot is offline.',
          color: 16711680,
          timestamp: new Date()
        }]
      });
      return;
    }

    const bot = this.minecraftBot.getBot();
    const nearby = utils.getNearbyPlayers(bot);

    if (nearby.length === 0) {
      await message.reply({
        embeds: [{
          description: 'No one nearby.',
          color: 3447003,
          timestamp: new Date()
        }]
      });
    } else {
      await message.reply({
        embeds: [{
          title: `Nearby players (${nearby.length})`,
          description: nearby.map(p => `👤 **${p.username}** - ${p.distance} blocks`).join('\n'),
          color: 3447003,
          timestamp: new Date()
        }]
      });
    }
  }

  async handleRestartCommand(message) {
    console.log(`[Command] restart by ${message.author.tag} via Discord`);
    this.lastCommandUser = message.author.tag;

    const channel = await this.client.channels.fetch(config.DISCORD_CHANNEL_ID);
    if (this.statusMessage) {
      this.statusMessage.edit({
        embeds: [{
          title: 'Server Status',
