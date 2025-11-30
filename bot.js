const mineflayer = require('mineflayer');
const fs = require('fs');
const { Client, GatewayIntentBits } = require('discord.js');
const tpsPlugin = require('mineflayer-tps');

// Override console methods to catch Microsoft login links
let pendingLoginLink = null;
const originalLog = console.log;
const originalError = console.error;
const originalWarn = console.warn;

console.log = function(...args) {
  let message = '';
  if (args.length === 1 && typeof args[0] === 'object' && args[0] !== null && args[0].message) {
    // Handle structured logs (e.g., Railway JSON format)
    message = args[0].message;
  } else {
    message = args.join(' ');
  }
  checkForMicrosoftLink(message);
  originalLog.apply(console, args);
};

console.error = function(...args) {
  const message = args.join(' ');
  checkForMicrosoftLink(message);
  originalError.apply(console, args);
};

console.warn = function(...args) {
  const message = args.join(' ');
  checkForMicrosoftLink(message);
  originalWarn.apply(console, args);
};

function checkForMicrosoftLink(message) {
  if (message.includes('microsoft.com') && message.includes('/link')) {
    const link = message.match(/https?:\/\/microsoft\.com\/link\?otc=\w+/);
    if (link) {
      pendingLoginLink = link[0];
      originalLog('[LINK DETECTED]', link[0]);
      // Send to Discord if ready, else wait for clientReady
      sendPendingLink();
    }
  }
}

function sendPendingLink() {
  console.log('[DISCORD] Attempting to send pending link:', pendingLoginLink);
  if (pendingLoginLink && DISCORD_CHANNEL_ID && discordClient && discordClient.isReady()) {
    console.log('[DISCORD] Discord ready, fetching channel:', DISCORD_CHANNEL_ID);
    discordClient.channels.fetch(DISCORD_CHANNEL_ID).then(channel => {
      console.log('[DISCORD] Channel fetched:', channel?.id);
      if (channel && channel.isTextBased()) {
        console.log('[DISCORD] Sending link to channel');
        channel.send(`🔗 Microsoft Login Link: ${pendingLoginLink}`)
          .then(() => {
            console.log('[DISCORD] Link sent successfully');
            pendingLoginLink = null;
          })
          .catch(err => {
            console.error('[DISCORD] Failed to send link:', err.message);
          });
      } else {
        console.log('[DISCORD] Channel not text-based or not found');
      }
    }).catch(err => {
      console.error('[DISCORD] Failed to fetch channel:', err.message);
    });
  } else {
    console.log('[DISCORD] Not ready to send link. Link:', !!pendingLoginLink, 'Channel:', !!DISCORD_CHANNEL_ID, 'Client:', !!discordClient, 'Ready:', discordClient?.isReady?.());
  }
}

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
let tpsHistory = [];
let lastTime = 0;
let mineflayerStarted = false;

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

// Discord bot client
const discordClient = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent]
});

if (DISCORD_BOT_TOKEN) {
  discordClient.login(DISCORD_BOT_TOKEN).catch(err => console.error('[Discord] Login failed:', err.message));

  discordClient.on('clientReady', () => {
    console.log(`[Discord] Bot logged in as ${discordClient.user.tag}`);
    sendPendingLink();
    if (!mineflayerStarted) {
      mineflayerStarted = true;
      createBot();
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

// Added: storing interval IDs so they can be cleared
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
          title: 'WheatMagnate Bot Notification',
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
      }]
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

  bot = mineflayer.createBot(config);
  bot.loadPlugin(tpsPlugin);

  bot.on('login', async () => {
    console.log(`[+] Logged in as ${bot.username}`);
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
    lastTime = Date.now();
    tpsHistory = [];

    // Send initial status message after spawn
    if (!statusMessage && DISCORD_CHANNEL_ID && discordClient && discordClient.isReady()) {
      setTimeout(async () => {
        try {
          const channel = await discordClient.channels.fetch(DISCORD_CHANNEL_ID);
          if (channel && channel.isTextBased()) {
            statusMessage = await channel.send({
              embeds: [{
                title: 'Server Status',
                description: getStatusDescription(),
                color: 65280,
                timestamp: new Date()
              }]
            });
            // Start updating every minute
            statusUpdateInterval = setInterval(updateStatusMessage, 60000);
          }
        } catch (e) {
          console.error('[Discord] Failed to send status:', e.message);
        }
      }, 2000); // Additional 2 seconds after spawn
    }
  });

  bot.on('time', () => {
    const now = Date.now();
    if (lastTime > 0) {
      const delta = now - lastTime;
      if (delta > 0 && delta < 1000) { // Reasonable tick time
        const tps = 1000 / delta;
        tpsHistory.push(tps);
        if (tpsHistory.length > 20) tpsHistory.shift(); // Keep last 20
      }
    }
    lastTime = now;
  });

  bot.on('end', (reason) => {
    const reasonStr = chatComponentToString(reason);
    clearIntervals();

    // Clear status update interval
    if (statusUpdateInterval) {
      clearInterval(statusUpdateInterval);
      statusUpdateInterval = null;
    }

    if (shouldReconnect) {
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
        if (ignoredUsernames.includes(entity.username)) continue; // Ignore whitelisted players

        // Enemy detected!
        console.log(`[Bot] Enemy detected: ${entity.username}`);
        sendDiscordNotification(`🚨 **ENEMY DETECTED**: **${entity.username}** entered range! Disconnecting for 10 minutes.`, 16711680);
        shouldReconnect = false;
        bot.quit(`Enemy detected: ${entity.username}`);
        setTimeout(() => {
          console.log('[Bot] Enemy threat timeout ended. Resuming.');
          sendDiscordNotification('Enemy threat timeout ended. Resuming bot.', 65280);
          shouldReconnect = true;
          createBot();
        }, 10 * 60 * 1000); // 10 minutes
        return; // Stop scanning after disconnect
      }
    }
  }, 1000);
}

if (process.env.DISABLE_BOT === 'true') {
  console.log('Bot disabled by env.');
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
  discordClient.on('messageCreate', async message => {
    if (message.author.bot) return;
    if (message.channel.id !== DISCORD_CHANNEL_ID) return;

    if (message.content === '!wn') {
      if (!bot || !bot.entity) {
        await message.reply('Bot is offline.');
        return;
      }
      const nearby = getNearbyPlayers();
      if (nearby.length === 0) {
        await message.reply('No one nearby.');
      } else {
        const list = nearby.map(p => `${p.username} (${p.distance} blocks)`).join('\n');
        await message.reply(`Nearby players:\n${list}`);
      }
    }

    if (message.content === '!restart') {
      console.log(`[Command] restart by ${message.author.tag} via Discord`);
      lastCommandUser = message.author.tag;
      const channel = await discordClient.channels.fetch(DISCORD_CHANNEL_ID);
      pendingStatusMessage = await channel.send({
        embeds: [{
          title: 'Bot Status',
          description: `🔄 Restarting... Requested by ${lastCommandUser}`,
          color: 16776960
        }]
      });
      bot.quit('Restart command');
    }

    if (message.content === '!pause') {
      console.log(`[Command] pause until resume by ${message.author.tag} via Discord`);
      lastCommandUser = message.author.tag;
      const channel = await discordClient.channels.fetch(DISCORD_CHANNEL_ID);
      pendingStatusMessage = await channel.send({
        embeds: [{
          title: 'Bot Status',
          description: `⏸️ Pausing until resume... Requested by ${lastCommandUser}`,
          color: 16776960
        }]
      });
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
        await message.reply('Bot is already active or resuming.');
        return;
      }
      console.log(`[Command] resume by ${message.author.tag} via Discord`);
      lastCommandUser = message.author.tag;
      const channel = await discordClient.channels.fetch(DISCORD_CHANNEL_ID);
      pendingStatusMessage = await channel.send({
        embeds: [{
          title: 'Bot Status',
          description: `▶️ Resuming... Requested by ${lastCommandUser}`,
          color: 65280
        }]
      });
      shouldReconnect = true;
      createBot();
    }

    if (message.content.startsWith('!link ')) {
      const link = message.content.substring(6).trim();
      if (link.match(/https?:\/\/microsoft\.com\/link\?otc=\w+/)) {
        console.log(`[Command] Link provided by ${message.author.tag}: ${link}`);
        sendDiscordNotification(`🔗 Microsoft Login Link: ${link}`, 3447003);
        await message.reply('Link sent to channel.');
      } else {
        await message.reply('Invalid Microsoft link format.');
      }
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
  });
}