const mineflayer = require('mineflayer');
const axios = require('axios'); // Importing axios
const fs = require('fs');
const { Authflow } = require('prismarine-auth');
const path = require('path');
const os = require('os');

// --- Discord Configuration ---
// Use environment variable for webhook URL. Set DISCORD_WEBHOOK_URL in your environment.
const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;
// -----------------------------

const config = {
  host: 'oldfag.org',
  username: 'WheatMagnate',
  version: '1.21.4',
};

const cacheDir = process.env.AUTH_CACHE_DIR || path.join(os.homedir(), '.minecraft');
const authflow = new Authflow(config.username, cacheDir);
config.auth = authflow;

function loadWhitelist() {
  try {
    const data = fs.readFileSync('whitelist.txt', 'utf8');
    const lines = data.split('\n').map(line => line.trim()).filter(line => line && !line.startsWith('#'));
    return lines;
  } catch (err) {
    sendDiscordNotification('Error loading whitelist: ' + err.message, 16711680);
    console.log('Error loading whitelist:', err.message);
    return [];
  }
}

const ignoredUsernames = loadWhitelist();

// Function to convert Minecraft chat component to plain text
function chatComponentToString(component) {
  if (typeof component === 'string') return component;
  if (!component || typeof component !== 'object') return String(component);

  if (component.type === 'string') return component.value || '';

  if (component.type === 'compound') {
    let text = '';
    if (component.value && component.value.text) {
      text += chatComponentToString(component.value.text);
    }
    // Handle siblings if present (for complex messages)
    if (component.value && component.value.extra) {
      for (const extra of component.value.extra) {
        text += chatComponentToString(extra);
      }
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
    console.log('[Discord] Webhook URL not set. Notification skipped.');
    return;
  }
  
  try {
    await axios.post(DISCORD_WEBHOOK_URL, {
      embeds: [{
        title: "WheatMagnate Bot Notification",
        description: message,
        color: color,
        timestamp: new Date(),
      }]
    });
  } catch (error) {
    console.error('[Discord] Failed to send webhook:', error.message);
  }
}

function createBot() {
  // Before creating a new bot, remove the old bot's listeners (if any remain)
  if (bot) {
    try {
      bot.removeAllListeners();
    } catch (e) {}
  }

  bot = mineflayer.createBot(config);

  bot.on('login', () => {
    console.log(`[+] Bot logged in as ${bot.username}`);
    sendDiscordNotification(`Bot **${bot.username}** successfully logged into the server \`${config.host}\`.`, 65280); // Green color
  });

  bot.on('spawn', () => {
    console.log('[Bot] Spawned and ready to work.');

    // Clearing previous intervals (if any remained from previous connections)
        if (foodMonitorInterval) {
      clearInterval(foodMonitorInterval);
      foodMonitorInterval = null;
    }
    if (playerScannerInterval) {
      clearInterval(playerScannerInterval);
      playerScannerInterval = null;
    }

    startFoodMonitor();
    startNearbyPlayerScanner();
  });

  bot.on('end', (reason) => {
    const reasonStr = chatComponentToString(reason);
    // Clearing intervals on disconnect
        if (foodMonitorInterval) {
      clearInterval(foodMonitorInterval);
      foodMonitorInterval = null;
    }
    if (playerScannerInterval) {
      clearInterval(playerScannerInterval);
      playerScannerInterval = null;
    }

    if (shouldReconnect) {
      const now = new Date();
      const kyivTime = new Date(now.toLocaleString("en-US", {timeZone: "Europe/Kiev"}));
      const hour = kyivTime.getHours();
      const minute = kyivTime.getMinutes();
      const isRestartTime = hour === 9 && minute >= 0 && minute <= 30; // Assuming restart takes up to 30 minutes
      const timeout = isRestartTime ? 5 * 60 * 1000 : reconnectTimeout; // 5 minutes during restart

      if (isRestartTime) {
        console.log('[!] Disconnected during server restart. Reconnecting in 5 minutes...');
        sendDiscordNotification(`The bot has been disabled due to server restart. Waiting 5 minutes before attempting reconnection.`, 16776960); // Orange color
      } else {
        console.log('[!] Disconnected. Reconnecting in 15 seconds...');
        sendDiscordNotification(`The bot has been disabled due to the following reason: \`${reasonStr}\`.
Trying to reconnect in 15 seconds.`, 16776960); // Orange color
      }
      setTimeout(createBot, timeout);
    } else {
      console.log('[!] Disconnected manually. Reconnect paused.');
      sendDiscordNotification(`The bot was disabled manually/by command due to the following reason: \`${reasonStr}\`. Reconnection paused.`, 16711680); // Red color
    }
  });

  bot.on('error', (err) => {
    console.log(`[x] Error: ${err.message}`);
    sendDiscordNotification(`Critical error: \`${err.message}\``, 16711680); // Red color
  });

  bot.on('kicked', (reason) => {
    const reasonText = chatComponentToString(reason);
    console.log(`[!] Kicked: ${reasonText}`);
    sendDiscordNotification(`The bot was kicked from the server. Reason: \`${reasonText}\``, 16711680); // Red color
  });

  bot.on('death', () => {
    console.log('[Bot] Died heroically.');
    sendDiscordNotification('The bot died heroically. :skull:', 16711680); // Red color
  });

  // ------- CHAT COMMANDS -------
  bot.on('chat', (username, message) => {
    if (username !== 'bdiev_') return;

    if (message === '!restart') {
      console.log(`[Command] ${username} → ${message}`);
      sendDiscordNotification(`Received command from \`${username}\`: \`!restart\`.`, 16776960);
      bot.quit('Restarting on command');
    }
    
    if (message === '!pause') {
      console.log(`[Command] ${username} → ${message}`);
      sendDiscordNotification(`Received command from \`${username}\`: \`!pause\` (on 10 minutes).`, 16776960);
      console.log('[Bot] Pausing for 10 minutes...');
      shouldReconnect = false;
      bot.quit('Pause for 10 minutes');
      setTimeout(() => {
        console.log('[Bot] Pause ended. Reconnecting.');
        shouldReconnect = true;
        createBot();
      }, 10 * 60 * 1000);
    }

    const pauseMatch = message.match(/^!pause\s+(\d+)$/);
    if (pauseMatch) {
      const minutes = parseInt(pauseMatch[1]);
      if (minutes > 0) {
        console.log(`[Command] ${username} → pause ${minutes}m`);
         sendDiscordNotification(`Received command from \`${username}\`: \`!pause ${minutes}\` (on ${minutes} minutes).`, 16776960);
        shouldReconnect = false;
        bot.quit(`Paused for ${minutes} minutes`);

        setTimeout(() => {
          console.log('[Bot] Pause complete. Reconnecting now...');
          shouldReconnect = true;
          createBot();
        }, minutes * 60 * 1000);
      }
    }
  });
}

// -------------- FOOD MONITOR --------------
function startFoodMonitor() {
  let warningSent = false;

  // Storing the interval ID in a variable so it can be cleared
    foodMonitorInterval = setInterval(async () => {
    if (!bot || bot.food === undefined) return;

    const hasFood = bot.inventory.items().some(item =>
      ['bread', 'apple', 'beef', 'golden_carrot'].some(n => item.name.includes(n))
    );

    if (!hasFood) {
      if (!warningSent) {
        console.log('[Bot] No food in inventory.');
        sendDiscordNotification('No food in inventory!', 16711680); // Sending a notification
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
    console.log(`[Bot] Eating ${foodItem.name} (food lvl: ${bot.food})...`);
    await bot.equip(foodItem, 'hand');
    await bot.consume();
    console.log('[Bot] Food eaten.');
  } catch (err) {
    console.error('[Bot] Error during eating:', err);
    sendDiscordNotification(`Error when trying to eat ${foodItem.name}: \`${err.message}\``, 16711680);
  }
}

// -------------- PLAYER SCANNER  --------------
function startNearbyPlayerScanner() {
  const inRange = new Set();

  // Сохраняем ID интервала в переменной, чтобы можно было его очистить
  playerScannerInterval = setInterval(() => {
    if (!bot || !bot.entity) return;

    const currentPlayers = new Set();

    // collect players within 300 blocks
    for (const entity of Object.values(bot.entities)) {
      if (!entity) continue;
      if (entity.type !== 'player') continue;
      if (!entity.username) continue;
      if (entity.username === bot.username) continue;
      if (ignoredUsernames.includes(entity.username)) continue;
      if (!entity.position || !bot.entity.position) continue;

      const distance = bot.entity.position.distanceTo(entity.position);
      if (distance <= 300) {
        currentPlayers.add(entity.username);
      }
    }

    // Entered
    currentPlayers.forEach(username => {
      if (!inRange.has(username)) {
        console.log(`[Bot] Player entered range: ${username}`);
        sendDiscordNotification(`Player **${username}** enter visible zone!`, 16776960); // Yellow/Orange color
        inRange.add(username);
      }
    });

    // Left
    [...inRange].forEach(username => {
      if (!currentPlayers.has(username)) {
        console.log(`[Bot] Player left range: ${username}`);
        sendDiscordNotification(`Player **${username}** left visible zone.`, 3447003); // Blue color
        inRange.delete(username);
      }
    });

  }, 1000);
}

if (process.env.DISABLE_BOT === 'true') {
  console.log('The bot is turned off through environment variables.');
  process.exit(0);
}

// Handle uncaught exceptions to prevent crashes
process.on('uncaughtException', (err) => {
  console.log('Uncaught Exception:', err);
  sendDiscordNotification(`Uncaught exception: \`${err.message}\``, 16711680);
  if (bot) {
    try {
      bot.quit();
    } catch (e) {}
  }
  setTimeout(createBot, 5000);
});

process.on('unhandledRejection', (reason, promise) => {
  console.log('Unhandled Rejection at:', promise, 'reason:', reason);
  sendDiscordNotification(`Unhandled rejection: \`${reason}\``, 16711680);
});

createBot();