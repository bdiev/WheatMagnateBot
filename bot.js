const mineflayer = require('mineflayer');
const axios = require('axios'); // Using axios

// --- Discord Configuration ---
const DISCORD_WEBHOOK_URL = 'https://discord.com/api/webhooks/...';

// -----------------------------
const config = {
  host: 'oldfag.org',
  username: 'WheatMagnate',
  auth: 'microsoft',
};

const ignoredUsernames = [];
let bot;
const reconnectTimeout = 15000;
let shouldReconnect = true;

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
  bot = mineflayer.createBot(config);

  bot.on('login', () => {
    console.log(`[+] Bot logged in as ${bot.username}`);
    sendDiscordNotification(
      `Bot **${bot.username}** successfully logged in to \`${config.host}\`.`,
      65280
    );
  });

  bot.on('spawn', () => {
    console.log('[Bot] Spawned and ready to work.');
    startFoodMonitor();
    startNearbyPlayerScanner();
  });

  bot.on('end', (reason) => {
    if (shouldReconnect) {
      console.log('[!] Disconnected. Reconnecting in 15 seconds...');
      sendDiscordNotification(
        `Bot disconnected. Reason: \`${reason}\`. Reconnecting in 15 seconds.`,
        16776960
      );
      setTimeout(createBot, reconnectTimeout);
    } else {
      console.log('[!] Disconnected manually. Reconnect paused.');
      sendDiscordNotification(
        `Bot disconnected manually. Reason: \`${reason}\`. Reconnect paused.`,
        16711680
      );
    }
  });

  bot.on('error', (err) => {
    console.log(`[x] Error: ${err.message}`);
    sendDiscordNotification(
      `Critical error: \`${err.message}\``,
      16711680
    );
  });

  bot.on('kicked', (reason) => {
    console.log(`[!] Kicked: ${reason}`);
    sendDiscordNotification(
      `Bot was kicked from the server. Reason: \`${reason}\``,
      16711680
    );
  });

  bot.on('death', () => {
    console.log('[Bot] Died heroically.');
    sendDiscordNotification(
      'The bot has died heroically. :skull:',
      16711680
    );
  });

  // ------- CHAT COMMANDS -------
  bot.on('chat', (username, message) => {
    if (username !== 'bdiev_') return;

    if (message === '!restart') {
      console.log(`[Command] ${username} → ${message}`);
      sendDiscordNotification(
        `Command received from \`${username}\`: \`!restart\`.`,
        16776960
      );
      bot.quit('Restarting on command');
    }

    if (message === '!pause') {
      console.log(`[Command] ${username} → ${message}`);
      sendDiscordNotification(
        `Command received from \`${username}\`: \`!pause\` (10 min).`,
        16776960
      );
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
        sendDiscordNotification(
          `Command received from \`${username}\`: \`!pause ${minutes}\` (for ${minutes} minutes).`,
          16776960
        );
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

  setInterval(async () => {
    if (!bot || bot.food === undefined) return;

    const hasFood = bot.inventory.items().some(item =>
      ['bread', 'apple', 'beef', 'golden_carrot'].some(n => item.name.includes(n))
    );

    if (!hasFood) {
      if (!warningSent) {
        console.log('[Bot] No food in inventory.');
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
    console.log(`[Bot] Eating ${foodItem.name} (food lvl: ${bot.food})...`);
    await bot.equip(foodItem, 'hand');
    await bot.consume();
    console.log('[Bot] Food eaten.');
  } catch (err) {
    console.error('[Bot] Error during eating:', err);
    sendDiscordNotification(
      `Error while eating ${foodItem.name}: \`${err.message}\``,
      16711680
    );
  }
}

// -------------- PLAYER SCANNER --------------
function startNearbyPlayerScanner() {
  const inRange = new Set();

  setInterval(() => {
    if (!bot || !bot.entity) return;

    const currentPlayers = new Set();

    for (const entity of Object.values(bot.entities)) {
      if (!entity) continue;
      if (entity.type !== 'player') continue;
      if (!entity.username) continue;
      if (entity.username === bot.username) continue;
      if (ignoredUsernames.includes(entity.username)) continue;
      if (!entity.position || !bot.entity.position) continue;

      const distance = bot.entity.position.distanceTo(entity.position);
      if (distance <= 45) currentPlayers.add(entity.username);
    }

    currentPlayers.forEach(username => {
      if (!inRange.has(username)) {
        console.log(`[Bot] Player entered range: ${username}`);
        sendDiscordNotification(
          `Player **${username}** entered visible zone!`,
          16776960
        );
        inRange.add(username);
      }
    });

    [...inRange].forEach(username => {
      if (!currentPlayers.has(username)) {
        console.log(`[Bot] Player left range: ${username}`);
        sendDiscordNotification(
          `Player **${username}** left visible zone.`,
          3447003
        );
        inRange.delete(username);
      }
    });

  }, 1000);
}

if (process.env.DISABLE_BOT === 'true') {
  console.log('The bot is turned off through environment variables.');
  process.exit(0);
}

createBot();
