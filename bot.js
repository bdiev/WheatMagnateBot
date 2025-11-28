const mineflayer = require('mineflayer');
const axios = require('axios');
const fs = require('fs');
const { Client, GatewayIntentBits } = require('discord.js');

// Discord webhook
const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;

// Discord bot
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const DISCORD_CHANNEL_ID = process.env.DISCORD_CHANNEL_ID;
const discordClient = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });

const config = {
  host: 'oldfag.org',
  username: 'WheatMagnate',
  auth: 'microsoft',
  version: '1.21.4'
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
let temporaryAllowed = new Set();

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
const reconnectTimeout = 15000;
let shouldReconnect = true;

// Added: storing interval IDs so they can be cleared
let foodMonitorInterval = null;
let playerScannerInterval = null;

// Helper function to send messages to Discord
async function sendDiscordNotification(message, color = 3447003) {
  if (!DISCORD_WEBHOOK_URL) {
    console.log('[Discord] Webhook URL not set. Skipped.');
    return;
  }
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
    console.error('[Discord] Failed:', e.message);
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
  const inRange = new Set();
  playerScannerInterval = setInterval(() => {
    if (!bot || !bot.entity) return;
    const currentPlayers = new Set();

    for (const entity of Object.values(bot.entities)) {
      if (!entity || entity.type !== 'player') continue;
      if (!entity.username || entity.username === bot.username) continue;
      if (ignoredUsernames.includes(entity.username) || temporaryAllowed.has(entity.username)) continue;
      if (!entity.position || !bot.entity.position) continue;
      const distance = bot.entity.position.distanceTo(entity.position);
      if (distance <= 300) currentPlayers.add(entity.username);
    }

    currentPlayers.forEach(username => {
      if (!inRange.has(username)) {
        console.log(`[Bot] Enemy detected: ${username}`);
        sendDiscordNotification(`Danger! Enemy **${username}** entered range. Use \`!allow ${username}\` in Discord to allow. Disconnecting and not reconnecting.`, 16711680);
        shouldReconnect = false;
        bot.quit(`Enemy detected: ${username}`);
        inRange.add(username);
      }
    });

    [...inRange].forEach(username => {
      if (!currentPlayers.has(username)) {
        console.log(`[Bot] Player left: ${username}`);
        sendDiscordNotification(`Player **${username}** left range.`, 3447003);
        inRange.delete(username);
      }
    });
  }, 1000);
}

if (DISCORD_TOKEN) {
  discordClient.on('ready', () => {
    console.log('[Discord] Bot ready.');
  });

  discordClient.on('messageCreate', (message) => {
    if (message.channel.id !== DISCORD_CHANNEL_ID || message.author.bot) return;
    const content = message.content.trim();
    if (content.startsWith('!allow ')) {
      const username = content.slice(7).trim();
      if (username) {
        temporaryAllowed.add(username);
        message.reply(`Temporarily allowed **${username}**.`);
        console.log(`[Discord] Allowed ${username}`);
      }
    }
  });

  discordClient.login(DISCORD_TOKEN);
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

createBot();