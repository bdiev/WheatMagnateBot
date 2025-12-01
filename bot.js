require('dotenv').config();
const mineflayer = require('mineflayer');
const fs = require('fs');
const { Client, GatewayIntentBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, StringSelectMenuBuilder, StringSelectMenuOptionBuilder } = require('discord.js');
const { Pool } = require('pg');

const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
const DISCORD_CHANNEL_ID = process.env.DISCORD_CHANNEL_ID;
const DISCORD_CHAT_CHANNEL_ID = process.env.DISCORD_CHAT_CHANNEL_ID;
const IGNORED_CHAT_USERNAMES = process.env.IGNORED_CHAT_USERNAMES ? process.env.IGNORED_CHAT_USERNAMES.split(',').map(u => u.trim().toLowerCase()) : [];

// Database connection
let pool = null;
if (process.env.DATABASE_URL) {
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });
  pool.on('error', (err) => {
    console.error('[DB] Unexpected error on idle client', err);
  });
}

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
let realTps = null;
let lastTickTime = 0;
let mineflayerStarted = false;
let startTime = Date.now();
let whisperConversations = new Map(); // username -> messageId
let tpsTabInterval = null;
const excludedMessageIds = [];

function saveStatusMessageId(id) {
  try {
    fs.writeFileSync('status_message_id.txt', id);
  } catch (e) {
    console.error('[Bot] Failed to save status message ID:', e.message);
  }
}

function loadStatusMessageId() {
  try {
    return fs.readFileSync('status_message_id.txt', 'utf8').trim();
  } catch (e) {
    return null;
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

// Load ignored chat usernames from DB
async function loadIgnoredChatUsernames() {
  if (!pool) return IGNORED_CHAT_USERNAMES;
  try {
    const res = await pool.query('SELECT username FROM ignored_users');
    return res.rows.map(row => row.username.toLowerCase());
  } catch (err) {
    console.error('[DB] Failed to load ignored users:', err.message);
    return IGNORED_CHAT_USERNAMES;
  }
}

let ignoredChatUsernames = IGNORED_CHAT_USERNAMES; // Fallback

// Initialize DB table and load ignored users
async function initDatabase() {
  if (!pool) return;
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS ignored_users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(255) UNIQUE NOT NULL,
        added_by VARCHAR(255),
        added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('[DB] Table initialized.');
    ignoredChatUsernames = await loadIgnoredChatUsernames();
  } catch (err) {
    console.error('[DB] Failed to initialize:', err.message);
  }
}

// Discord bot client
const discordClient = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent]
});

if (DISCORD_BOT_TOKEN) {
  discordClient.login(DISCORD_BOT_TOKEN).catch(err => console.error('[Discord] Login failed:', err.message));

  discordClient.on('clientReady', async () => {
    console.log(`[Discord] Bot logged in as ${discordClient.user.tag}`);
    discordClient.user.setPresence({ status: 'online' });
    await initDatabase();
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
              if (excludedMessageIds.includes(msg.id)) return false;
              const desc = msg.embeds[0]?.description || '';
              const lowerDesc = desc.toLowerCase();
              // Don't delete death-related messages
              if (lowerDesc.includes('died') || lowerDesc.includes('death') || lowerDesc.includes('perished') || lowerDesc.includes('💀') || desc.includes(':skull:')) return false;
              // Don't delete whisper messages and conversations
              if (desc.includes('💬') || lowerDesc.includes('whispered') || desc.includes('⬅️') || desc.includes('➡️') || (msg.embeds[0]?.title && msg.embeds[0].title.startsWith('Conversation with'))) return false;
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
  return nearby.sort((a, b) => a.distance - b.distance);
}



// Function to convert Minecraft chat component to plain text
function chatComponentToString(component) {
  if (typeof component === 'string') return component;
  if (!component || typeof component !== 'object') return '';

  let text = component.text || '';

  if (component.extra) {
    for (const extra of component.extra) {
      text += chatComponentToString(extra);
    }
  }

  return text;
}

var bot;
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
      const newEntry = `[${timeStr}] ⬅️ ${username}: ${message}`;

      try {
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
                    .setCustomId(`reply_${btoa(username)}_${messageId}`)
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
        whisperConversations.delete(username);
      }
      if (!whisperConversations.has(username)) {
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
                  .setCustomId(`reply_${btoa(username)}_${sentMessage.id}`)
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
  const whitelistOnline = onlinePlayers.filter(username => ignoredUsernames.some(name => name.toLowerCase() === username.toLowerCase()));
  const nearbyPlayers = getNearbyPlayers();
  const avgTps = realTps !== null ? realTps.toFixed(1) : (tpsHistory.length > 0 ? (tpsHistory.reduce((a, b) => a + b, 0) / tpsHistory.length).toFixed(1) : 'Calculating...');

  const nearbyNames = nearbyPlayers.map(p => p.username).join(', ') || 'None';
  return `✅ Bot **${bot.username}** connected to \`${config.host}\`\n` +
    `👥 Players online: ${playerCount}\n` +
    `👀 Players nearby: ${nearbyNames}\n` +
    `⚡ TPS: ${avgTps}\n` +
    `:hamburger: Food: ${Math.round(bot.food * 2) / 2}/20\n` +
    `❤️ Health: ${Math.round(bot.health * 2) / 2}/20\n` +
    `📋 Whitelist online: ${whitelistOnline.length > 0 ? whitelistOnline.join(', ') : 'None'}`;
}

// Function to create status buttons
function createStatusButtons() {
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
          .setStyle(ButtonStyle.Secondary)
      )
  ];
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
      components: createStatusButtons()
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

    // Start TPS from TAB monitor
    tpsTabInterval = setInterval(() => {
      let found = false;
      if (bot && bot.tablist) {
        let text = '';
        if (bot.tablist.header) {
          text += chatComponentToString(bot.tablist.header) + ' ';
        }
        if (bot.tablist.footer) {
          text += chatComponentToString(bot.tablist.footer);
        }
        const tpsMatch = text.match(/(\d+\.?\d*)\s*tps/i);
        if (tpsMatch) {
          realTps = parseFloat(tpsMatch[1]);
          found = true;
          // Update status immediately when TPS changes
          if (statusMessage) updateStatusMessage();
        }
      }
      if (!found) {
        bot.chat('/tps');
      }
    }, 10000); // Check every 10 seconds

    // Send status message after spawn
    if (DISCORD_CHANNEL_ID && discordClient && discordClient.isReady()) {
      setTimeout(async () => {
        try {
          const channel = await discordClient.channels.fetch(DISCORD_CHANNEL_ID);
          if (channel && channel.isTextBased()) {
            const savedId = loadStatusMessageId();
            if (savedId && !statusMessage) {
              try {
                statusMessage = await channel.messages.fetch(savedId);
                await statusMessage.edit({
                  embeds: [{
                    title: 'Server Status',
                    description: getStatusDescription(),
                    color: 65280,
                    timestamp: new Date()
                  }],
                  components: createStatusButtons()
                });
              } catch (e) {
                console.error('[Discord] Failed to fetch saved status message:', e.message);
                statusMessage = await channel.send({
                  embeds: [{
                    title: 'Server Status',
                    description: getStatusDescription(),
                    color: 65280,
                    timestamp: new Date()
                  }],
                  components: createStatusButtons()
                });
                saveStatusMessageId(statusMessage.id);
              }
            } else if (!statusMessage) {
              statusMessage = await channel.send({
                embeds: [{
                  title: 'Server Status',
                  description: getStatusDescription(),
                  color: 65280,
                  timestamp: new Date()
                }],
                components: createStatusButtons()
              });
              saveStatusMessageId(statusMessage.id);
            } else {
              await statusMessage.edit({
                embeds: [{
                  title: 'Server Status',
                  description: getStatusDescription(),
                  color: 65280,
                  timestamp: new Date()
                }],
                components: createStatusButtons()
              });
            }
          }
        } catch (e) {
          console.error('[Discord] Failed to send status:', e.message);
        }
        // Ensure status update interval is running
        if (statusMessage && !statusUpdateInterval) {
          statusUpdateInterval = setInterval(updateStatusMessage, 3000);
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
        // Update status message to restarting
        if (statusMessage) {
          statusMessage.edit({
            embeds: [{
              title: 'Server Status',
              description: `🔄 Server restart window detected. Reconnecting in 5 minutes.`,
              color: 16776960,
              timestamp: new Date()
            }]
          }).catch(console.error);
        }
      } else if (reasonStr !== 'Restart command') {
        console.log('[!] Disconnected. Reconnecting in 15 seconds...');
        sendDiscordNotification(`Disconnected: \`${reasonStr}\`. Reconnecting in 15 seconds.`, 16776960);
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

    const ignoreMatch = message.match(/^!ignore\s+(\w+)$/);
    if (ignoreMatch) {
      const targetUsername = ignoreMatch[1];
      if (!pool) {
        sendDiscordNotification('Database not configured.', 16711680);
        return;
      }
      (async () => {
        try {
          await pool.query('INSERT INTO ignored_users (username, added_by) VALUES ($1, $2) ON CONFLICT (username) DO NOTHING', [targetUsername.toLowerCase(), username]);
          // Reload ignored
          ignoredChatUsernames = await loadIgnoredChatUsernames();
          console.log(`[Command] Added ${targetUsername} to ignore list by ${username}`);
          sendDiscordNotification(`✅ Added ${targetUsername} to ignore list. Requested by ${username} (in-game)`, 65280);
        } catch (err) {
          console.error('[Command] Ignore error:', err.message);
          sendDiscordNotification(`Failed to add ${targetUsername} to ignore list: \`${err.message}\``, 16711680);
        }
      })();
    }

    const unignoreMatch = message.match(/^!unignore\s+(\w+)$/);
    if (unignoreMatch) {
      const targetUsername = unignoreMatch[1];
      if (!pool) {
        sendDiscordNotification('Database not configured.', 16711680);
        return;
      }
      (async () => {
        try {
          const result = await pool.query('DELETE FROM ignored_users WHERE username = $1', [targetUsername.toLowerCase()]);
          if (result.rowCount > 0) {
            // Reload ignored
            ignoredChatUsernames = await loadIgnoredChatUsernames();
            console.log(`[Command] Removed ${targetUsername} from ignore list by ${username}`);
            sendDiscordNotification(`✅ Removed ${targetUsername} from ignore list. Requested by ${username} (in-game)`, 65280);
          } else {
            sendDiscordNotification(`${targetUsername} is not in ignore list.`, 16776960);
          }
        } catch (err) {
          console.error('[Command] Unignore error:', err.message);
          sendDiscordNotification(`Failed to remove ${targetUsername} from ignore list: \`${err.message}\``, 16711680);
        }
      })();
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

  // Send all chat messages to Discord chat channel
  bot.on('chat', async (username, message) => {
    if (username.toLowerCase() === 'lolritterbot') {
      console.log(`[Debug LolRiTTeRBot] Received: username=${username}, message=${JSON.stringify(message)}`);
    }
    if (!DISCORD_CHAT_CHANNEL_ID || !discordClient || !discordClient.isReady()) {
      if (username.toLowerCase() === 'lolritterbot') console.log('[Debug LolRiTTeRBot] Skipped: no channel or client not ready');
      return;
    }
    if (username === bot.username) {
      if (username.toLowerCase() === 'lolritterbot') console.log('[Debug LolRiTTeRBot] Skipped: own message');
      return; // Don't send own messages
    }

    try {
      const channel = await discordClient.channels.fetch(DISCORD_CHAT_CHANNEL_ID);
      if (channel && channel.isTextBased()) {
        let displayUsername = username.toLowerCase();
        let displayMessage = message.startsWith('> ') ? message.slice(2) : message;
        let avatarUrl = `https://minotar.net/avatar/${displayUsername}/28`;

        if (ignoredChatUsernames.includes(displayUsername)) {
          if (username.toLowerCase() === 'lolritterbot') console.log('[Debug LolRiTTeRBot] Skipped: username in ignore list');
          return; // Ignore specified users
        }

        if (username.toLowerCase() === 'lolritterbot') {
          console.log(`[Debug LolRiTTeRBot] Sending: displayUsername=${displayUsername}, displayMessage=${JSON.stringify(displayMessage)}`);
        }

        await channel.send({
          embeds: [{
            author: {
              name: displayUsername
            },
            description: displayMessage,
            color: 3447003,
            thumbnail: {
              url: avatarUrl
            },
            timestamp: new Date()
          }]
        });
        if (username.toLowerCase() === 'lolritterbot') {
          console.log('[Debug LolRiTTeRBot] Sent successfully');
        }
      } else {
        if (username.toLowerCase() === 'lolritterbot') console.log('[Debug LolRiTTeRBot] Skipped: channel not found or not text-based');
      }
    } catch (e) {
      console.error('[Discord] Failed to send chat message:', e.message);
      if (username.toLowerCase() === 'lolritterbot') console.log(`[Debug LolRiTTeRBot] Error: ${e.message}`);
    }
  });

  bot.on('message', (message) => {
    const text = chatComponentToString(message);
    const tpsMatch = text.match(/(\d+\.?\d*)\s*tps/i);
    if (tpsMatch) {
      realTps = parseFloat(tpsMatch[1]);
      console.log('[Bot] TPS from message:', realTps);
    }
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
  if (tpsTabInterval) {
    clearInterval(tpsTabInterval);
    tpsTabInterval = null;
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
        if (shouldReconnect) return; // Already active
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
        const allOnlinePlayers = Object.values(bot.players || {}).map(p => p.username);
        const whitelistOnline = allOnlinePlayers.filter(username => ignoredUsernames.some(name => name.toLowerCase() === username.toLowerCase()));
        const otherPlayers = allOnlinePlayers.filter(username => !ignoredUsernames.some(name => name.toLowerCase() === username.toLowerCase()));

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
            .setValue(username);
        });
        const selectMenu = new StringSelectMenuBuilder()
          .setCustomId('message_select')
          .setPlaceholder('Select player to message')
          .addOptions(options.slice(0, 25).map(option => option.setValue(btoa(option.data.value)))); // Encode username
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
      } else if (interaction.customId === 'drop_button') {
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
            .setValue(btoa(value));
        });
        const selectMenu = new StringSelectMenuBuilder()
          .setCustomId('drop_select')
          .setPlaceholder('Select item to drop')
          .addOptions(options.slice(0, 25)); // Discord limit 25 options
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
      } else if (interaction.customId === 'wn_button') {
        await interaction.deferReply();
        if (!bot || !bot.entity) {
          await interaction.editReply({
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
      } else if (interaction.customId.startsWith('reply_')) {
        const parts = interaction.customId.split('_');
        const encodedUsername = parts[1];
        const username = atob(encodedUsername);
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
      } else if (interaction.customId.startsWith('remove_')) {
        const messageId = interaction.customId.split('_')[1];
        try {
          const message = await interaction.channel.messages.fetch(messageId);
          await message.delete();
          // Remove from conversations map
          for (const [username, msgId] of whisperConversations) {
            if (msgId === messageId) {
              whisperConversations.delete(username);
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
      await interaction.deferReply({ flags: 64 });
      const message = interaction.fields.getTextInputValue('message_input');
      if (message && bot) {
        bot.chat(message);
        console.log(`[Modal] Say "${message}" by ${interaction.user.tag}`);
      } else {
        // No message
      }
      setTimeout(() => interaction.deleteReply().catch(() => {}), 1000);
    } else if (interaction.isModalSubmit() && interaction.customId.startsWith('reply_modal_')) {
      await interaction.deferReply({ flags: 64 });
      const encodedUsername = interaction.customId.split('_')[2];
      const username = atob(encodedUsername);
      const replyMessage = interaction.fields.getTextInputValue('reply_message');
      console.log(`[Reply] Processing reply for ${username}, message: ${replyMessage}, has conversation: ${whisperConversations.has(username)}`);
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
        const now = new Date();
        const timeStr = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
        let displayMessage = replyMessage;
        if (replyMessage.startsWith('/r ')) {
          displayMessage = replyMessage.slice(3).trim();
        }
        const replyEntry = `[${timeStr}] ➡️ ${bot.username}: ${displayMessage}`;

        if (whisperConversations.has(username)) {
          // Update existing conversation
          const messageId = whisperConversations.get(username);
          try {
            const channel = await discordClient.channels.fetch(DISCORD_CHANNEL_ID);
            const existingMessage = await channel.messages.fetch(messageId);
            const currentDesc = existingMessage.embeds[0]?.description || '';
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
        } else {
          // Create new conversation
          try {
            const channel = await discordClient.channels.fetch(DISCORD_CHANNEL_ID);
            let displayMessage = replyMessage;
            if (replyMessage.startsWith('/r ')) {
              displayMessage = replyMessage.slice(3).trim();
            }
            const replyEntry = `[${timeStr}] ➡️ ${bot.username}: ${displayMessage}`;
            const sentMessage = await channel.send({
              embeds: [{
                title: `Conversation with ${username}`,
                description: replyEntry,
                color: 3447003,
                timestamp: now
              }]
            });
            whisperConversations.set(username, sentMessage.id);
            await sentMessage.edit({
              embeds: [{
                title: `Conversation with ${username}`,
                description: replyEntry,
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
            console.log(`[Discord] Created new conversation for ${username}`);
          } catch (e) {
            console.error('[Discord] Failed to create conversation:', e.message);
          }
        }
      }
      setTimeout(() => interaction.deleteReply().catch(() => {}), 1000);
    } else if (interaction.isModalSubmit() && interaction.customId.startsWith('message_modal_')) {
      const encodedUsername = interaction.customId.split('_')[2];
      const selectedUsername = atob(encodedUsername);
      const messageText = interaction.fields.getTextInputValue('message_text');
      if (messageText && bot) {
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
        bot.chat(command);

        await interaction.reply({ content: 'Message sent.', flags: 64 });
        setTimeout(() => interaction.deleteReply().catch(() => {}), 1000);

        // Create conversation embed
        const now = new Date();
        const timeStr = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
        const newEntry = `[${timeStr}] ➡️ ${bot.username}: ${displayMessage}`;

        if (whisperConversations.has(selectedUsername)) {
          // Update existing conversation
          const messageId = whisperConversations.get(selectedUsername);
          try {
            const channel = await discordClient.channels.fetch(DISCORD_CHANNEL_ID);
            const existingMessage = await channel.messages.fetch(messageId);
            const currentDesc = existingMessage.embeds[0]?.description || '';
            const updatedDesc = currentDesc + '\n\n' + newEntry;
            await existingMessage.edit({
              embeds: [{
                title: `Conversation with ${selectedUsername}`,
                description: updatedDesc,
                color: 3447003,
                timestamp: now
              }],
              components: existingMessage.components
            });
          } catch (e) {
            console.error('[Discord] Failed to update conversation:', e.message);
            // Remove from map and create new
            whisperConversations.delete(selectedUsername);
          }
        }
        if (!whisperConversations.has(selectedUsername)) {
          // Create new conversation
          try {
            const channel = await discordClient.channels.fetch(DISCORD_CHANNEL_ID);
            const sentMessage = await channel.send({
              embeds: [{
                title: `Conversation with ${selectedUsername}`,
                description: newEntry,
                color: 3447003,
                timestamp: now
              }]
            });
            whisperConversations.set(selectedUsername, sentMessage.id);
            await sentMessage.edit({
              embeds: [{
                title: `Conversation with ${selectedUsername}`,
                description: newEntry,
                color: 3447003,
                timestamp: now
              }],
              components: [
                new ActionRowBuilder()
                  .addComponents(
                    new ButtonBuilder()
                      .setCustomId(`reply_${btoa(selectedUsername)}_${sentMessage.id}`)
                      .setLabel('Reply')
                      .setStyle(ButtonStyle.Primary),
                    new ButtonBuilder()
                      .setCustomId(`remove_${sentMessage.id}`)
                      .setLabel('Remove')
                      .setStyle(ButtonStyle.Danger)
                  )
              ]
            });
          } catch (e) {
            console.error('[Discord] Failed to create conversation:', e.message);
          }
        }
      }
    } else if (interaction.isStringSelectMenu() && interaction.customId === 'message_select') {
      const encodedUsername = interaction.values[0];
      const selectedUsername = atob(encodedUsername);
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
    } else if (interaction.isStringSelectMenu() && interaction.customId === 'drop_select') {
      await interaction.deferUpdate();
      const encodedValue = interaction.values[0];
      const selectedValue = atob(encodedValue);
      const [slot, type, metadata] = selectedValue.split('_').map((v, i) => i === 2 ? parseInt(v) : v);
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
        const nearby = getNearbyPlayers();
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
    }
  });

  discordClient.on('messageCreate', async message => {
    if (message.author.bot) return;

    // Handle chat channel messages
    if (message.channel.id === DISCORD_CHAT_CHANNEL_ID) {
      if (!bot) return;
      const text = message.content.trim();
      if (text) {
        bot.chat(text);
        console.log(`[Chat] Sent "${text}" by ${message.author.tag}`);
      }
      return;
    }

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
          components: createStatusButtons()
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
          components: createStatusButtons()
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
          components: createStatusButtons()
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

    const ignoreMatch = message.content.match(/^!ignore\s+(\w+)$/);
    if (ignoreMatch) {
      const targetUsername = ignoreMatch[1];
      if (!pool) {
        await message.reply('Database not configured.');
        return;
      }
      try {
        await pool.query('INSERT INTO ignored_users (username, added_by) VALUES ($1, $2) ON CONFLICT (username) DO NOTHING', [targetUsername.toLowerCase(), message.author.tag]);
        // Reload ignored
        ignoredChatUsernames = await loadIgnoredChatUsernames();
        console.log(`[Command] Added ${targetUsername} to ignore list by ${message.author.tag}`);
        await message.reply(`✅ Added ${targetUsername} to ignore list.`);
      } catch (err) {
        console.error('[Command] Ignore error:', err.message);
        await message.reply(`Failed to add ${targetUsername} to ignore list: ${err.message}`);
      }
    }

    const unignoreMatch = message.content.match(/^!unignore\s+(\w+)$/);
    if (unignoreMatch) {
      const targetUsername = unignoreMatch[1];
      if (!pool) {
        await message.reply('Database not configured.');
        return;
      }
      try {
        const result = await pool.query('DELETE FROM ignored_users WHERE username = $1', [targetUsername.toLowerCase()]);
        if (result.rowCount > 0) {
          // Reload ignored
          ignoredChatUsernames = await loadIgnoredChatUsernames();
          console.log(`[Command] Removed ${targetUsername} from ignore list by ${message.author.tag}`);
          await message.reply(`✅ Removed ${targetUsername} from ignore list.`);
        } else {
          await message.reply(`${targetUsername} is not in ignore list.`);
        }
      } catch (err) {
        console.error('[Command] Unignore error:', err.message);
        await message.reply(`Failed to remove ${targetUsername} from ignore list: ${err.message}`);
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