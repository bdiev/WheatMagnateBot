const mineflayer = require('mineflayer');
const fs = require('fs');
const { Client, GatewayIntentBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');

// Discord bot
const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
const DISCORD_CHANNEL_ID = process.env.DISCORD_CHANNEL_ID;


// Discord bot
let loadedSession = null;
if (process.env.MINECRAFT_SESSION) {
  try {
    loadedSession = JSON.parse(process.env.MINECRAFT_SESSION);
    console.log('[Bot] Loaded session from env.');
  } catch (err) {
    console.error('[Bot] Failed to parse session from env:', err.message);
  }
}

let lastCommandUser = null;
let pendingStatusMessage = null;
let statusMessage = null;
let statusUpdateInterval = null;
let channelCleanerInterval = null;
let tpsHistory = [];
let lastTickTime = 0;
let mineflayerStarted = false;
let startTime = Date.now();
let whisperConversations = new Map(); // username -> messageId

function loadConversations() {
  try {
    const data = fs.readFileSync('conversations.json', 'utf8');
    const obj = JSON.parse(data);
    whisperConversations = new Map(Object.entries(obj));
    console.log('[Bot] Loaded conversations:', whisperConversations.size);
  } catch (e) {
    whisperConversations = new Map();
    console.log('[Bot] No conversations file found, starting fresh.');
  }
}

function saveConversations() {
  try {
    const obj = Object.fromEntries(whisperConversations);
    fs.writeFileSync('conversations.json', JSON.stringify(obj, null, 2));
  } catch (e) {
    console.error('[Bot] Failed to save conversations:', e.message);
  }
}

const config = {
  host: 'oldfag.org',
  username: process.env.MINECRAFT_USERNAME || 'WheatMagnate',
  auth: 'microsoft',
  version: false, // Auto-detect version
  session: loadedSession
};


function loadWhitelist() {
  try {
    const data = fs.readFileSync('whitelist.txt', 'utf8');
    return data
      .split('\n')
      .map(l => l.trim())
      .filter(l => l && !l.startsWith('#'));
  } catch (err) {
    sendDiscordNotification('Error loading whitelist: ' + err.message, 16711680);
    console.log('Error loading whitelist:', err.message);
    return [];
  }
}

const ignoredUsernames = loadWhitelist();
loadConversations();

// Discord bot client
const discordClient = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent]
});

if (DISCORD_BOT_TOKEN) {
  discordClient.login(DISCORD_BOT_TOKEN).catch(err => console.error('[Discord] Login failed:', err.message));

  discordClient.on('clientReady', () => {
    console.log(`[Discord] Bot logged in as ${discordClient.user.tag}`);
    discordClient.user.setPresence({ status: 'online' });
    if (!mineflayerStarted) {
      mineflayerStarted = true;
      createBot();
    }

    // Start channel cleaner
    if (!channelCleanerInterval) {
      channelCleanerInterval = setInterval(async () => {
        try {
          const channel = await discordClient.channels.fetch(DISCORD_CHANNEL_ID);
          if (channel && channel.isTextBased()) {
            const messages = await channel.messages.fetch({ limit: 100 });
            const messagesToDelete = messages.filter(msg => {
              if (msg.id === statusMessage?.id) return false;
              const desc = msg.embeds[0]?.description || '';
              const lowerDesc = desc.toLowerCase();
              // Don't delete death-related messages
              if (lowerDesc.includes('died') || lowerDesc.includes('death') || lowerDesc.includes('perished') || lowerDesc.includes('💀') || desc.includes(':skull:')) return false;
              // Don't delete whisper messages
              if (desc.includes('💬') || lowerDesc.includes('whispered')) return false;
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
  });
} else {
  // No Discord, start Mineflayer directly
  mineflayerStarted = true;
  createBot();
}


// Function to get nearby players
function getNearbyPlayers() {
  if (!bot || !bot.entity) return [];
  const nearby = [];
  for (const entity of Object.values(bot.entities)) {
    if (!entity || entity.type !== 'player') continue;
    if (!entity.username || entity.username === bot.username) continue;
    if (!entity.position || !bot.entity.position) continue;
    const distance = bot.entity.position.distanceTo(entity.position);
    if (distance <= 300) {
      nearby.push({ username: entity.username, distance: Math.round(distance) });
    }
  }
  return nearby;
}



// Function to convert Minecraft chat component to plain text
function chatComponentToString(component) {
  if (typeof component === 'string') return component;
  if (!component || typeof component !== 'object') return String(component);

  if (component.type === 'string') return component.value || '';

  if (component.type === 'compound') {
    let text = '';
    if (component.value?.text) text += chatComponentToString(component.value.text);
    if (component.value?.extra) {
      for (const extra of component.value.extra) text += chatComponentToString(extra);
    }
    return text;
  }

  // For other types, try to extract text if possible
  if (component.value && typeof component.value === 'string') return component.value;
  return JSON.stringify(component);
}

let bot;
let reconnectTimeout = 15000;
let shouldReconnect = true;

let foodMonitorInterval = null;
let playerScannerInterval = null;


// Helper function to send messages to Discord
async function sendDiscordNotification(message, color = 3447003) {
  if (!DISCORD_CHANNEL_ID || !discordClient || !discordClient.isReady()) {
    console.log('[Discord] Bot not ready or no channel configured. Skipped.');
    return;
  }
  try {
    const channel = await discordClient.channels.fetch(DISCORD_CHANNEL_ID);
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

// Function to send whispers to Discord with buttons
async function sendWhisperToDiscord(username, message) {
  if (!DISCORD_CHANNEL_ID || !discordClient || !discordClient.isReady()) {
    console.log('[Discord] Bot not ready for whisper.');
    return;
  }
  try {
    const channel = await discordClient.channels.fetch(DISCORD_CHANNEL_ID);
    if (channel && channel.isTextBased()) {
      const now = new Date();
      const timeStr = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
      const newEntry = `[${timeStr}] 💬 ${username}: ${message}`;

      if (whisperConversations.has(username)) {
        // Update existing conversation
        const messageId = whisperConversations.get(username);
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
                  .setCustomId(`reply_${username}_${messageId}`)
                  .setLabel('Reply')
                  .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                  .setCustomId(`remove_${messageId}`)
                  .setLabel('Remove')
                  .setStyle(ButtonStyle.Danger)
              )
          ]
        });
        saveConversations();
      } else {
        // Create new conversation
        const sentMessage = await channel.send({
          embeds: [{
            title: `Conversation with ${username}`,
            description: newEntry,
            color: 3447003,
            timestamp: now
          }]
        });
        whisperConversations.set(username, sentMessage.id);
        saveConversations();
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
                  .setCustomId(`reply_${username}_${sentMessage.id}`)
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

// Function to get server status description
function getStatusDescription() {
  if (!bot) return 'Bot not connected';

  const playerCount = Object.keys(bot.players || {}).length;
  const onlinePlayers = Object.values(bot.players || {}).map(p => p.username);
  const whitelistOnline = onlinePlayers.filter(username => ignoredUsernames.includes(username));
  const nearbyPlayers = getNearbyPlayers();
  const avgTps = tpsHistory.length > 0 ? (tpsHistory.reduce((a, b) => a + b, 0) / tpsHistory.length).toFixed(1) : 'Calculating...';

  const nearbyNames = nearbyPlayers.map(p => p.username).join(', ') || 'None';
  return `✅ Bot **${bot.username}** connected to \`${config.host}\`\n` +
    `👥 Players online: ${playerCount}\n` +
    `👀 Players nearby: ${nearbyNames}\n` +
    `⚡ TPS: ${avgTps}\n` +
    `📋 Whitelist online: ${whitelistOnline.length > 0 ? whitelistOnline.join(', ') : 'None'}`;
}

// Function to create status buttons
function createStatusButtons() {
  return new ActionRowBuilder()
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
        .setStyle(ButtonStyle.Secondary)
    );
}

// Function to update server status message
async function updateStatusMessage() {
  if (!statusMessage || !bot || !bot.entity) return;

  const description = getStatusDescription();

  try {
    await statusMessage.edit({
      embeds: [{
        title: 'Server Status',
        description,
        color: 65280,
        timestamp: new Date()
      }],
      components: [createStatusButtons()]
    });
  } catch (e) {
    console.error('[Discord] Failed to update status:', e.message);
  }
}

function createBot() {
  // Before creating a new bot, remove the old bot's listeners (if any remain)
  if (bot) {
    try { bot.removeAllListeners(); } catch {}
  }

  lastTickTime = 0; // Reset TPS tracking for new bot
  bot = mineflayer.createBot(config);

  bot.on('login', async () => {
    console.log(`[+] Logged in as ${bot.username}`);
    startTime = Date.now();
    if (pendingStatusMessage) {
      await pendingStatusMessage.edit({
        embeds: [{
          title: 'Bot Status',
          description: `✅ Connected to \`${config.host}\` as **${bot.username}**. Requested by ${lastCommandUser}`,
          color: 65280
        }]
      }).catch(console.error);
      pendingStatusMessage = null;
    }
    lastCommandUser = null; // Reset after use
  });

  bot.on('spawn', () => {
    console.log('[Bot] Spawned.');
    clearIntervals();
    startFoodMonitor();
    startNearbyPlayerScanner();

    // Send or update status message after spawn
    if (DISCORD_CHANNEL_ID && discordClient && discordClient.isReady()) {
      setTimeout(async () => {
        if (statusMessage) {
          // Update existing status message
          updateStatusMessage();
        } else {
          // Send new status message
          try {
            const channel = await discordClient.channels.fetch(DISCORD_CHANNEL_ID);
            if (channel && channel.isTextBased()) {
              statusMessage = await channel.send({
                embeds: [{
                  title: 'Server Status',
                  description: getStatusDescription(),
                  color: 65280,
                  timestamp: new Date()
                }],
                components: [createStatusButtons()]
              });
            }
          } catch (e) {
            console.error('[Discord] Failed to send status:', e.message);
          }
        }
        // Ensure status update interval is running
        if (statusMessage && !statusUpdateInterval) {
          statusUpdateInterval = setInterval(updateStatusMessage, 15000);
        }
      }, 2000); // Additional 2 seconds after spawn
    }
  });

  bot.on('physicsTick', () => {
    const now = Date.now();
    if (lastTickTime > 0) {
      const delta = now - lastTickTime;
      if (delta > 0) {
        const tps = 1000 / delta;
        tpsHistory.push(tps);
        if (tpsHistory.length > 20) tpsHistory.shift();
      }
    }
    lastTickTime = now;
  });


  bot.on('end', (reason) => {
    const reasonStr = chatComponentToString(reason);
    clearIntervals();

    // Clear status update interval
    if (statusUpdateInterval) {
      clearInterval(statusUpdateInterval);
      statusUpdateInterval = null;
    }

    if (shouldReconnect || reasonStr === 'socketClosed') {
      const now = new Date();
      const kyivTime = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Kiev' }));
      const hour = kyivTime.getHours();
      const minute = kyivTime.getMinutes();
      const isRestartTime = hour === 9 && minute >= 0 && minute <= 30;
      const timeout = isRestartTime ? 5 * 60 * 1000 : reconnectTimeout;

      if (isRestartTime) {
        console.log('[!] Restart window. Reconnecting in 5 minutes...');
        sendDiscordNotification('Server restart window detected. Reconnecting in 5 minutes.', 16776960);
      } else {
        console.log('[!] Disconnected. Reconnecting in 15 seconds...');
        sendDiscordNotification(`Disconnected: \`${reasonStr}\`. Reconnecting in 15 seconds.`, 16776960);
      }
      setTimeout(createBot, timeout);
    } else {
      console.log('[!] Manual pause. No reconnect.');
      if (pendingStatusMessage) {
        pendingStatusMessage.edit({
          embeds: [{
            title: 'Bot Status',
            description: `⏸️ Paused: \`${reasonStr}\`. Requested by ${lastCommandUser}`,
            color: 16711680
          }]
        }).catch(console.error);
        pendingStatusMessage = null;
      } else {
        const userInfo = lastCommandUser ? ` Requested by ${lastCommandUser}` : '';
        sendDiscordNotification(`⏸️ Bot paused: \`${reasonStr}\`.${userInfo}`, 16711680);
      }
      // Update status message to offline
      if (statusMessage) {
        statusMessage.edit({
          embeds: [{
            title: 'Server Status',
            description: `❌ Bot disconnected: \`${reasonStr}\``,
            color: 16711680,
            timestamp: new Date()
          }]
        }).catch(console.error);
      }
    }
  });

  bot.on('error', (err) => {
    console.log(`[x] Error: ${err.message}`);
    sendDiscordNotification(`Error: \`${err.message}\``, 16711680);
  });

  bot.on('kicked', (reason) => {
    const reasonText = chatComponentToString(reason);
    console.log(`[!] Kicked: ${reasonText}`);
    sendDiscordNotification(`Kicked. Reason: \`${reasonText}\``, 16711680);

    // If kicked due to throttling, increase reconnect timeout
    if (reasonText.includes('throttled') || reasonText.includes('too fast') || reasonText.includes('delay')) {
      reconnectTimeout = Math.min(reconnectTimeout * 2, 5 * 60 * 1000); // Max 5 minutes
      console.log(`[!] Throttling detected. Increasing reconnect timeout to ${reconnectTimeout / 1000} seconds.`);
    }

    // If kicked with generic reason, stop reconnecting to avoid infinite loop
    if (reasonText === 'You have been disconnected from the server.') {
      console.log('[!] Generic kick detected. Stopping reconnection.');
      shouldReconnect = false;
    }
  });

  bot.on('death', () => {
    console.log('[Bot] Died.');
    sendDiscordNotification('Bot died. :skull:', 16711680);
  });

  // ------- CHAT COMMANDS -------
  bot.on('chat', (username, message) => {
    if (username !== 'bdiev_') return;

    if (message === '!restart') {
      console.log(`[Command] restart by ${username}`);
      lastCommandUser = `${username} (in-game)`;
      bot.quit('Restart command');
    }

    if (message === '!pause') {
      console.log('[Command] pause 10m');
      lastCommandUser = `${username} (in-game)`;
      shouldReconnect = false;
      bot.quit('Pause 10m');
      setTimeout(() => {
        console.log('[Bot] Pause ended.');
        shouldReconnect = true;
        createBot();
      }, 10 * 60 * 1000);
    }

    const pauseMatch = message.match(/^!pause\s+(\d+)$/);
    if (pauseMatch) {
      const minutes = parseInt(pauseMatch[1]);
      if (minutes > 0) {
        console.log(`[Command] pause ${minutes}m`);
        lastCommandUser = `${username} (in-game)`;
        shouldReconnect = false;
        bot.quit(`Paused ${minutes}m`);
        setTimeout(() => {
          console.log('[Bot] Custom pause ended.');
          shouldReconnect = true;
          createBot();
        }, minutes * 60 * 1000);
      }
    }

    const allowMatch = message.match(/^!allow\s+(\w+)$/);
    if (allowMatch) {
      const targetUsername = allowMatch[1];
      try {
        const data = fs.readFileSync('whitelist.txt', 'utf8');
        const lines = data.split('\n');
        if (!lines.some(line => line.trim() === targetUsername)) {
          lines.push(targetUsername);
          fs.writeFileSync('whitelist.txt', lines.join('\n'));
          // Reload whitelist
          const newWhitelist = loadWhitelist();
          ignoredUsernames.length = 0;
          ignoredUsernames.push(...newWhitelist);
          console.log(`[Command] Added ${targetUsername} to whitelist by ${username}`);
          sendDiscordNotification(`✅ Added ${targetUsername} to whitelist. Requested by ${username} (in-game)`, 65280);
        } else {
          sendDiscordNotification(`${targetUsername} is already in whitelist.`, 16776960);
        }
      } catch (err) {
        console.error('[Command] Allow error:', err.message);
        sendDiscordNotification(`Failed to add ${targetUsername} to whitelist: \`${err.message}\``, 16711680);
      }
    }

    // Check for death messages in chat
    const lowerMessage = message.toLowerCase();
    if (lowerMessage.includes('died') || lowerMessage.includes('was slain') || lowerMessage.includes('perished')) {
      console.log(`[Death] Detected death message: ${message}`);
      sendDiscordNotification(`💀 Death: ${message}`, 16711680);
    }
  });

  bot.on('whisper', (username, message, translate, jsonMsg, matches) => {
    console.log(`[Whisper] ${username}: ${message}`);
    sendWhisperToDiscord(username, message);
  });
}

// -------------- INTERVALS MANAGEMENT --------------
function clearIntervals() {
  if (foodMonitorInterval) {
    clearInterval(foodMonitorInterval);
    foodMonitorInterval = null;
  }
  if (playerScannerInterval) {
    clearInterval(playerScannerInterval);
    playerScannerInterval = null;
  }
}

// -------------- FOOD MONITOR --------------
function startFoodMonitor() {
  let warningSent = false;
  foodMonitorInterval = setInterval(async () => {
    if (!bot || bot.food === undefined) return;

    const hasFood = bot.inventory.items().some(item =>
      ['bread', 'apple', 'beef', 'golden_carrot'].some(n => item.name.includes(n))
    );

    if (!hasFood) {
      if (!warningSent) {
        console.log('[Bot] No food.');
        sendDiscordNotification('No food in inventory!', 16711680);
        warningSent = true;
      }
      return;
    } else {
      warningSent = false;
    }

    if (bot.food < 18 && !bot._isEating) {
      bot._isEating = true;
      await eatFood();
      bot._isEating = false;
    }
  }, 1000);
}

async function eatFood() {
  const foodItem = bot.inventory.items().find(item =>
    ['bread', 'apple', 'beef', 'golden_carrot'].some(n => item.name.includes(n))
  );
  if (!foodItem) return;
  try {
    console.log(`[Bot] Eating ${foodItem.name} (food: ${bot.food})`);
    await bot.equip(foodItem, 'hand');
    await bot.consume();
    console.log('[Bot] Ate.');
  } catch (err) {
    console.error('[Bot] Eat error:', err.message);
    sendDiscordNotification(`Eating ${foodItem.name} failed: \`${err.message}\``, 16711680);
  }
}

// -------------- PLAYER SCANNER  --------------
function startNearbyPlayerScanner() {
  playerScannerInterval = setInterval(() => {
    if (!bot || !bot.entity) return;

    for (const entity of Object.values(bot.entities)) {
      if (!entity || entity.type !== 'player') continue;
      if (!entity.username || entity.username === bot.username) continue;
      if (ignoredUsernames.includes(entity.username)) continue; // Ignore whitelisted players
      // Non-whitelisted player
      if (!entity.position || !bot.entity.position) continue;
      const distance = bot.entity.position.distanceTo(entity.position);
      if (distance <= 300) {
        // Enemy detected!
        console.log(`[Bot] Enemy detected: ${entity.username}`);
        sendDiscordNotification(`🚨 **ENEMY DETECTED**: **${entity.username}** entered range! Bot paused until resume command.`, 16711680);
        shouldReconnect = false;
        bot.quit(`Enemy detected: ${entity.username}`);
        return; // Stop scanning after disconnect
      }
    }
  }, 1000);
}


if (Boolean(process.env.DISABLE_BOT)) {
  console.log(`Bot disabled by env. DISABLE_BOT=${process.env.DISABLE_BOT}`);
  process.exit(0);
}

// Handle uncaught exceptions to prevent crashes
process.on('uncaughtException', (err) => {
  console.log('Uncaught Exception:', err);
  sendDiscordNotification(`Uncaught exception: \`${err.message}\``, 16711680);
  if (bot) {
    try { bot.quit(); } catch {}
  }
  setTimeout(createBot, 5000);
});

process.on('unhandledRejection', (reason) => {
  console.log('Unhandled Rejection:', reason);
  sendDiscordNotification(`Unhandled rejection: \`${reason}\``, 16711680);
});

// Discord bot commands
if (DISCORD_BOT_TOKEN && DISCORD_CHANNEL_ID) {
  discordClient.on('interactionCreate', async (interaction) => {
    if (interaction.channel.id !== DISCORD_CHANNEL_ID) return;

    if (interaction.isButton()) {
      if (interaction.customId === 'pause_button') {
        await interaction.deferUpdate(); // Defer update to avoid timeout
        console.log(`[Button] pause by ${interaction.user.tag}`);
        lastCommandUser = interaction.user.tag;
        shouldReconnect = false;
        bot.quit('Pause until resume');
      } else if (interaction.customId === 'resume_button') {
        await interaction.deferUpdate(); // Defer update to avoid timeout
        if (shouldReconnect) return; // Уже активен
        console.log(`[Button] resume by ${interaction.user.tag}`);
        lastCommandUser = interaction.user.tag;
        shouldReconnect = true;
        createBot();
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
        if (!bot) {
          await interaction.editReply({
            embeds: [{
              description: 'Bot is offline.',
              color: 16711680,
              timestamp: new Date()
            }]
          });
          return;
        }
        const onlinePlayers = Object.values(bot.players || {}).map(p => p.username);
        const whitelistOnline = onlinePlayers.filter(username => ignoredUsernames.includes(username));
        const otherPlayers = onlinePlayers.filter(username => !ignoredUsernames.includes(username));

        const playerList = [];
        if (whitelistOnline.length > 0) {
          playerList.push(`🛡️ **Whitelist:** ${whitelistOnline.join(', ')}`);
        }
        if (otherPlayers.length > 0) {
          playerList.push(`👥 **Others:** ${otherPlayers.join(', ')}`);
        }
        const description = playerList.length > 0 ? playerList.join('\n\n') : 'No players online.';

        await interaction.editReply({
          embeds: [{
            title: `Online Players (${onlinePlayers.length})`,
            description,
            color: 3447003,
            timestamp: new Date()
          }]
        });
      } else if (interaction.customId.startsWith('reply_')) {
        const parts = interaction.customId.split('_');
        const username = parts[1];
        const modal = new ModalBuilder()
          .setCustomId(`reply_modal_${username}`)
          .setTitle(`Reply to ${username}`);

        const messageInput = new TextInputBuilder()
          .setCustomId('reply_message')
          .setLabel('Message')
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true);

        const actionRow = new ActionRowBuilder().addComponents(messageInput);
        modal.addComponents(actionRow);

        await interaction.showModal(modal);
      } else if (interaction.customId.startsWith('remove_')) {
        const messageId = interaction.customId.split('_')[1];
        try {
          const message = await interaction.channel.messages.fetch(messageId);
          await message.delete();
          // Remove from conversations map
          for (const [username, msgId] of whisperConversations) {
            if (msgId === messageId) {
              whisperConversations.delete(username);
              saveConversations();
              break;
            }
          }
          await interaction.deferUpdate();
        } catch (e) {
          console.error('[Discord] Failed to delete message:', e.message);
          await interaction.reply({ content: 'Failed to delete message.', ephemeral: true });
        }
      }
    } else if (interaction.isModalSubmit() && interaction.customId === 'say_modal') {
      await interaction.deferReply();
      const message = interaction.fields.getTextInputValue('message_input');
      if (message && bot) {
        bot.chat(message);
        console.log(`[Modal] Say "${message}" by ${interaction.user.tag}`);
        await interaction.editReply({
          embeds: [{
            title: 'Message Sent to Minecraft',
            description: `Sent to Minecraft chat: "${message}"`,
            color: 65280,
            timestamp: new Date()
          }]
        });
      } else {
        await interaction.editReply({
          embeds: [{
            description: 'Bot is offline or message is empty.',
            color: 16711680,
            timestamp: new Date()
          }]
        });
      }
    } else if (interaction.isModalSubmit() && interaction.customId.startsWith('reply_modal_')) {
      const username = interaction.customId.split('_')[2];
      const replyMessage = interaction.fields.getTextInputValue('reply_message');
      if (replyMessage && bot) {
        let command;
        if (replyMessage.startsWith('/')) {
          command = replyMessage;
          console.log(`[Reply] Sent command "${command}" by ${interaction.user.tag}`);
        } else {
          command = `/msg ${username} ${replyMessage}`;
          console.log(`[Reply] Sent /msg ${username} ${replyMessage} by ${interaction.user.tag}`);
        }
        bot.chat(command);

        // Update the conversation message
        if (whisperConversations.has(username)) {
          const messageId = whisperConversations.get(username);
          try {
            const channel = await discordClient.channels.fetch(DISCORD_CHANNEL_ID);
            const existingMessage = await channel.messages.fetch(messageId);
            const currentDesc = existingMessage.embeds[0]?.description || '';
            const now = new Date();
            const timeStr = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
            const replyEntry = `[${timeStr}] ${bot.username}: ${replyMessage}`;
            let updatedDesc = currentDesc + '\n\n' + replyEntry;
            if (updatedDesc.length > 4096) {
              // Truncate to fit within Discord embed limit
              updatedDesc = updatedDesc.substring(updatedDesc.length - 4096 + 100);
              updatedDesc = '...(truncated)\n\n' + updatedDesc.split('\n\n').slice(1).join('\n\n');
            }
            console.log(`[Discord] Updating conversation for ${username}, desc length: ${updatedDesc.length}`);
            await existingMessage.edit({
              embeds: [{
                title: `Conversation with ${username}`,
                description: updatedDesc,
                color: 3447003,
                timestamp: existingMessage.embeds[0]?.timestamp || now
              }],
              components: existingMessage.components
            });
            console.log('[Discord] Conversation updated successfully');
          } catch (e) {
            console.error('[Discord] Failed to update conversation:', e.message);
          }
        }

        await interaction.deferUpdate();
      } else {
        await interaction.deferUpdate();
      }
    }
  });

  discordClient.on('messageCreate', async message => {
    if (message.author.bot) return;
    if (message.channel.id !== DISCORD_CHANNEL_ID) return;

    if (message.content === '!wn') {
      if (!bot || !bot.entity) {
        await message.reply({
          embeds: [{
            description: 'Bot is offline.',
            color: 16711680,
            timestamp: new Date()
          }]
        });
        return;
      }
      const nearby = getNearbyPlayers();
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

    if (message.content === '!restart') {
      console.log(`[Command] restart by ${message.author.tag} via Discord`);
      lastCommandUser = message.author.tag;
      const channel = await discordClient.channels.fetch(DISCORD_CHANNEL_ID);
      if (statusMessage) {
        statusMessage.edit({
          embeds: [{
            title: 'Server Status',
            description: `🔄 Restarting... Requested by ${lastCommandUser}`,
            color: 16776960,
            timestamp: new Date()
          }],
          components: [createStatusButtons()]
        }).catch(console.error);
      } else {
        pendingStatusMessage = await channel.send({
          embeds: [{
            title: 'Bot Status',
            description: `🔄 Restarting... Requested by ${lastCommandUser}`,
            color: 16776960
          }]
        });
      }
      bot.quit('Restart command');
    }

    if (message.content === '!pause') {
      console.log(`[Command] pause until resume by ${message.author.tag} via Discord`);
      lastCommandUser = message.author.tag;
      const channel = await discordClient.channels.fetch(DISCORD_CHANNEL_ID);
      if (statusMessage) {
        statusMessage.edit({
          embeds: [{
            title: 'Server Status',
            description: `⏸️ Pausing until resume... Requested by ${lastCommandUser}`,
            color: 16776960,
            timestamp: new Date()
          }],
          components: [createStatusButtons()]
        }).catch(console.error);
      } else {
        pendingStatusMessage = await channel.send({
          embeds: [{
            title: 'Bot Status',
            description: `⏸️ Pausing until resume... Requested by ${lastCommandUser}`,
            color: 16776960
          }]
        });
      }
      shouldReconnect = false;
      bot.quit('Pause until resume');
    }

    const pauseMatch = message.content.match(/^!pause\s+(\d+)$/);
    if (pauseMatch) {
      const minutes = parseInt(pauseMatch[1]);
      if (minutes > 0) {
        console.log(`[Command] pause ${minutes}m by ${message.author.tag} via Discord`);
        sendDiscordNotification(`Command: !pause ${minutes} by \`${message.author.tag}\` via Discord`, 16776960);
        shouldReconnect = false;
        bot.quit(`Paused ${minutes}m`);
        setTimeout(() => {
          console.log('[Bot] Custom pause ended.');
          shouldReconnect = true;
          createBot();
        }, minutes * 60 * 1000);
        await message.reply(`Bot paused for ${minutes} minutes.`);
      }
    }

    if (message.content === '!resume') {
      if (shouldReconnect) {
        await message.reply({
          embeds: [{
            description: 'Bot is already active or resuming.',
            color: 3447003,
            timestamp: new Date()
          }]
        });
        return;
      }
      console.log(`[Command] resume by ${message.author.tag} via Discord`);
      lastCommandUser = message.author.tag;
      const channel = await discordClient.channels.fetch(DISCORD_CHANNEL_ID);
      if (statusMessage) {
        statusMessage.edit({
          embeds: [{
            title: 'Server Status',
            description: `▶️ Resuming... Requested by ${lastCommandUser}`,
            color: 65280,
            timestamp: new Date()
          }],
          components: [createStatusButtons()]
        }).catch(console.error);
      } else {
        pendingStatusMessage = await channel.send({
          embeds: [{
            title: 'Bot Status',
            description: `▶️ Resuming... Requested by ${lastCommandUser}`,
            color: 65280
          }]
        });
      }
      shouldReconnect = true;
      createBot();
    }

    const allowMatch = message.content.match(/^!allow\s+(\w+)$/);
    if (allowMatch) {
      const targetUsername = allowMatch[1];
      try {
        const data = fs.readFileSync('whitelist.txt', 'utf8');
        const lines = data.split('\n');
        if (!lines.some(line => line.trim() === targetUsername)) {
          lines.push(targetUsername);
          fs.writeFileSync('whitelist.txt', lines.join('\n'));
          // Reload whitelist
          const newWhitelist = loadWhitelist();
          ignoredUsernames.length = 0;
          ignoredUsernames.push(...newWhitelist);
          console.log(`[Command] Added ${targetUsername} to whitelist by ${message.author.tag} via Discord`);
          sendDiscordNotification(`Command: !allow ${targetUsername} by \`${message.author.tag}\` via Discord`, 65280);
          await message.reply(`${targetUsername} added to whitelist.`);
        } else {
          await message.reply(`${targetUsername} is already in whitelist.`);
        }
      } catch (err) {
        console.error('[Command] Allow error:', err.message);
        sendDiscordNotification(`Failed to add ${targetUsername} to whitelist: \`${err.message}\``, 16711680);
        await message.reply(`Error adding ${targetUsername} to whitelist: ${err.message}`);
      }
    }

    if (message.content.startsWith('!say ')) {
      if (!bot) {
        await message.reply('Bot is offline.');
        return;
      }
      const text = message.content.slice(5).trim();
      if (text) {
        bot.chat(text);
        console.log(`[Command] Say "${text}" by ${message.author.tag} via Discord`);
        await message.reply({
          embeds: [{
            title: 'Message Sent to Minecraft',
            description: `Sent to Minecraft chat: "${text}"`,
            color: 65280,
            timestamp: new Date()
          }]
        });
      } else {
        await message.reply('Usage: !say <message>');
      }
    }
  });
}