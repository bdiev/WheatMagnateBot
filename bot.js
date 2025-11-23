const mineflayer = require('mineflayer');
const axios = require('axios'); // Подключаем axios

// --- Discord Configuration ---
// Use environment variable if provided; otherwise leave empty to disable notifications.
const DISCORD_WEBHOOK_URL = 'https://discord.com/api/webhooks/1441970745306517596/kXr40bb0hUDC6GO56HbFZvi2mz2ZUeWv2zghnp2KTyvWalxlWKSbfvtd0CrRFhmELuBu';
// -----------------------------

const config = {
  host: 'oldfag.org',
  username: 'WheatMagnate',
  auth: 'microsoft',
};

const ignoredUsernames = [
  
];

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
    sendDiscordNotification(`Бот **${bot.username}** успешно вошел на сервер \`${config.host}\`.`, 65280); // Green color
  });

  bot.on('spawn', () => {
    console.log('[Bot] Spawned and ready to work.');
    startFoodMonitor();
    startNearbyPlayerScanner();
  });

  bot.on('end', (reason) => {
    if (shouldReconnect) {
      console.log('[!] Disconnected. Reconnecting in 15 seconds...');
      sendDiscordNotification(`Бот отключен по причине: \`${reason}\`. Попытка переподключения через 15 секунд.`, 16776960); // Orange color
      setTimeout(createBot, reconnectTimeout);
    } else {
      console.log('[!] Disconnected manually. Reconnect paused.');
      sendDiscordNotification(`Бот отключен вручную/по команде по причине: \`${reason}\`. Переподключение приостановлено.`, 16711680); // Red color
    }
  });

  bot.on('error', (err) => {
    console.log(`[x] Error: ${err.message}`);
    sendDiscordNotification(`Критическая ошибка: \`${err.message}\``, 16711680); // Red color
  });

  bot.on('kicked', (reason) => {
    console.log(`[!] Kicked: ${reason}`);
    sendDiscordNotification(`Бот был кикнут с сервера. Причина: \`${reason}\``, 16711680); // Red color
  });

  bot.on('death', () => {
    console.log('[Bot] Died heroically.');
    sendDiscordNotification('Бот героически погиб. :skull:', 16711680); // Red color
  });

  // ------- CHAT COMMANDS -------
  bot.on('chat', (username, message) => {
    if (username !== 'bdiev_') return;

    if (message === '!restart') {
      console.log(`[Command] ${username} → ${message}`);
      sendDiscordNotification(`Получена команда от \`${username}\`: \`!restart\`.`, 16776960);
      bot.quit('Restarting on command');
    }
    
    // ... остальной код команд !pause остается без изменений ...
    if (message === '!pause') {
      console.log(`[Command] ${username} → ${message}`);
      sendDiscordNotification(`Получена команда от \`${username}\`: \`!pause\` (на 10 минут).`, 16776960);
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
         sendDiscordNotification(`Получена команда от \`${username}\`: \`!pause ${minutes}\` (на ${minutes} минут).`, 16776960);
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

// -------------- FOOD MONITOR (без спама) --------------
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
        sendDiscordNotification('No food in inventory!', 16711680); // Отправка уведомления
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
    sendDiscordNotification(`Ошибка при попытке съесть ${foodItem.name}: \`${err.message}\``, 16711680);
  }
}

// -------------- PLAYER SCANNER (вход/выход без спама) --------------
function startNearbyPlayerScanner() {
  const inRange = new Set();

  setInterval(() => {
    if (!bot || !bot.entity) return;

    const currentPlayers = new Set();

    // collect players within 45 blocks
    for (const entity of Object.values(bot.entities)) {
      if (!entity) continue;
      if (entity.type !== 'player') continue;
      if (!entity.username) continue;
      if (entity.username === bot.username) continue;
      if (ignoredUsernames.includes(entity.username)) continue;
      if (!entity.position || !bot.entity.position) continue;

      const distance = bot.entity.position.distanceTo(entity.position);
      if (distance <= 45) {
        currentPlayers.add(entity.username);
      }
    }

    // Вошли
    currentPlayers.forEach(username => {
      if (!inRange.has(username)) {
        console.log(`[Bot] Player entered range: ${username}`);
        sendDiscordNotification(`Player **${username}** enter visible zone!`, 16776960); // Yellow/Orange color
        inRange.add(username);
      }
    });

    // Вышли
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

createBot();