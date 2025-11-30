const mineflayer = require('mineflayer');
const axios = require('axios');
const fs = require('fs');
const { Client, GatewayIntentBits } = require('discord.js');
const express = require('express');

// Discord webhook
const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;

// Discord bot
const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
const DISCORD_CHANNEL_ID = process.env.DISCORD_CHANNEL_ID;

let loadedSession = null;
if (process.env.MINECRAFT_SESSION) {
  try {
    loadedSession = JSON.parse(process.env.MINECRAFT_SESSION);
    console.log('[Bot] Loaded session from env.');
  } catch (err) {
    console.error('[Bot] Failed to parse session from env:', err.message);
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

// Discord bot client
const discordClient = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent]
});

if (DISCORD_BOT_TOKEN) {
  discordClient.login(DISCORD_BOT_TOKEN).catch(err => console.error('[Discord] Login failed:', err.message));

  discordClient.on('clientReady', () => {
    console.log(`[Discord] Bot logged in as ${discordClient.user.tag}`);
  });
}

// Web server
const app = express();

app.get('/history', (req, res) => {
  const sorted = Array.from(playerHistory.entries()).sort((a, b) => b[1].lastSeen - a[1].lastSeen);
  let html = `
  <html>
  <head>
    <title>Player History</title>
    <style>
      body { font-family: Arial, sans-serif; margin: 20px; }
      table { border-collapse: collapse; width: 100%; }
      th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
      th { background-color: #f2f2f2; }
    </style>
  </head>
  <body>
  <h1>История игроков</h1>
  <table>
  <tr><th>Игрок</th><th>Первый раз</th><th>Последний раз</th><th>Количество</th></tr>
  `;
  for (const [username, record] of sorted) {
    const first = record.firstSeen.toLocaleString('ru-RU', { timeZone: 'Europe/Kiev' });
    const last = record.lastSeen.toLocaleString('ru-RU', { timeZone: 'Europe/Kiev' });
    html += `<tr><td>${username}</td><td>${first}</td><td>${last}</td><td>${record.count}</td></tr>`;
  }
  html += '</table></body></html>';
  res.send(html);
});

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

// Player proximity history: username -> { firstSeen, lastSeen, count }
let playerHistory = new Map();

function loadHistory() {
  try {
    const data = fs.readFileSync('history.json', 'utf8');
    const obj = JSON.parse(data);
    for (const [username, record] of Object.entries(obj)) {
      playerHistory.set(username, {
        firstSeen: new Date(record.firstSeen),
        lastSeen: new Date(record.lastSeen),
        count: record.count
      });
    }
    console.log('[Bot] Loaded player history.');
  } catch (err) {
    console.log('[Bot] No history file found, starting fresh.');
  }
}

function saveHistory() {
  try {
    const obj = {};
    for (const [username, record] of playerHistory) {
      obj[username] = {
        firstSeen: record.firstSeen.toISOString(),
        lastSeen: record.lastSeen.toISOString(),
        count: record.count
      };
    }
    fs.writeFileSync('history.json', JSON.stringify(obj, null, 2));
  } catch (err) {
    console.error('[Bot] Failed to save history:', err.message);
  }
}

// Load history on startup
loadHistory();

// Helper function to send messages to Discord
async function sendDiscordNotification(message, color = 3447003) {
  // Try to send via Discord bot to channel
  if (DISCORD_CHANNEL_ID && discordClient && discordClient.isReady()) {
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
        return;
      }
    } catch (e) {
      console.error('[Discord Bot] Failed to send:', e.message);
    }
  }

  // Fallback to webhook
  if (DISCORD_WEBHOOK_URL) {
    try {
      await axios.post(DISCORD_WEBHOOK_URL, {
        embeds: [{
          title: 'WheatMagnate Bot Notification',
          description: message,
          color,
          timestamp: new Date()
        }]
      });
    } catch (e) {
      console.error('[Discord Webhook] Failed:', e.message);
    }
  } else {
    console.log('[Discord] No webhook or bot configured. Skipped.');
  }
}

function createBot() {
  // Before creating a new bot, remove the old bot's listeners (if any remain)
  if (bot) {
    try { bot.removeAllListeners(); } catch {}
  }

  bot = mineflayer.createBot(config);

  bot.on('login', () => {
    console.log(`[+] Logged in as ${bot.username}`);
    sendDiscordNotification(`Bot **${bot.username}** logged into \`${config.host}\`.`, 65280);
  });

  bot.on('spawn', () => {
    console.log('[Bot] Spawned.');
    clearIntervals();
    startFoodMonitor();
    startNearbyPlayerScanner();
  });

  bot.on('end', (reason) => {
    const reasonStr = chatComponentToString(reason);
    clearIntervals();

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
      sendDiscordNotification(`Bot paused manually: \`${reasonStr}\`.`, 16711680);
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
      sendDiscordNotification(`Command: !restart by \`${username}\``, 16776960);
      bot.quit('Restart command');
    }

    if (message === '!pause') {
      console.log('[Command] pause 10m');
      sendDiscordNotification(`Command: !pause (10m) by \`${username}\``, 16776960);
      shouldReconnect = false;
      bot.quit('Pause 10m');
      setTimeout(() => {
        console.log('[Bot] Pause ended.');
        shouldReconnect = true;
        createBot();
        
        // Start web server
        app.listen(3000, () => {
          console.log('[Web] Server running on port 3000');
        });
      }, 10 * 60 * 1000);
    }

    const pauseMatch = message.match(/^!pause\s+(\d+)$/);
    if (pauseMatch) {
      const minutes = parseInt(pauseMatch[1]);
      if (minutes > 0) {
        console.log(`[Command] pause ${minutes}m`);
        sendDiscordNotification(`Command: !pause ${minutes} by \`${username}\``, 16776960);
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
          sendDiscordNotification(`Command: !allow ${targetUsername} by \`${username}\``, 65280);
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
        // Log player proximity
        const now = new Date();
        if (!playerHistory.has(entity.username)) {
          playerHistory.set(entity.username, { firstSeen: now, lastSeen: now, count: 0 });
        }
        const record = playerHistory.get(entity.username);
        record.lastSeen = now;
        record.count++;
        saveHistory();

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
        await message.reply('Бот офлайн.');
        return;
      }
      const nearby = getNearbyPlayers();
      if (nearby.length === 0) {
        await message.reply('Никого рядом нет.');
      } else {
        const list = nearby.map(p => `${p.username} (${p.distance} блоков)`).join('\n');
        await message.reply(`Игроки рядом:\n${list}`);
      }
    }

    if (message.content === '!history') {
      if (playerHistory.size === 0) {
        await message.reply('История пуста.');
        return;
      }
      const sorted = Array.from(playerHistory.entries()).sort((a, b) => b[1].lastSeen - a[1].lastSeen);
      const lines = sorted.map(([username, record]) => {
        const first = record.firstSeen.toLocaleString('ru-RU', { timeZone: 'Europe/Kiev' });
        const last = record.lastSeen.toLocaleString('ru-RU', { timeZone: 'Europe/Kiev' });
        return `${username} - первый раз: ${first}, последний: ${last}, раз: ${record.count}`;
      });
      const response = '```\n' + lines.join('\n') + '\n```';
      await message.reply(response);
    }
  });
}

createBot();