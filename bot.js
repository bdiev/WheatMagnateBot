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

// Новые переменные для отслеживания ситуации, когда вы вошли в аккаунт
let pausedDueToPlayerLogin = false;
let accountMonitorInterval = null;

// Добавлено: хранение ID интервалов, чтобы можно было их очищать
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

// Помощник: проверка текста reason на смысл "аккаунт уже в сети"
function reasonIndicatesPlayerLogin(reason) {
  if (!reason) return false;
  const r = String(reason).toLowerCase();
  return /already|another|in use|logged in|duplicate|another location|other location/.test(r);
}

// Попытка "легкой" проверки — создаём временный бот и смотрим, удастся ли залогиниться
function isAccountFree(timeout = 10000) {
  return new Promise((resolve) => {
    let finished = false;
    const tmp = mineflayer.createBot(config);

    const timer = setTimeout(() => {
      if (finished) return;
      finished = true;
      try { tmp.removeAllListeners(); tmp.end(); } catch (e) {}
      resolve(false);
    }, timeout);

    tmp.once('login', () => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      try { tmp.end('check done'); } catch (e) {}
      resolve(true);
    });

    tmp.once('kicked', (reason) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      try { tmp.end(); } catch (e) {}
      resolve(false);
    });

    tmp.once('error', () => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      try { tmp.end(); } catch (e) {}
      resolve(false);
    });
  });
}

// Запустить монитор аккаунта — периодически проверять, свободен ли аккаунт
function startAccountMonitor() {
  if (accountMonitorInterval) return; // уже запущен
  console.log('[Bot] Starting account monitor: will try to reconnect when account is free.');
  accountMonitorInterval = setInterval(async () => {
    try {
      const free = await isAccountFree();
      if (free) {
        clearInterval(accountMonitorInterval);
        accountMonitorInterval = null;
        pausedDueToPlayerLogin = false;
        shouldReconnect = true;
        sendDiscordNotification(`Account **${config.username}** appears free — reconnecting now.`, 65280);
        console.log('[Bot] Account free — reconnecting.');
        createBot();
      } else {
        console.log('[Bot] Account still occupied. Waiting...');
      }
    } catch (e) {
      console.error('[Bot] Account monitor error:', e.message);
    }
  }, 15000); // каждые 15 сек пробуем
}

function stopAccountMonitor() {
  if (accountMonitorInterval) {
    clearInterval(accountMonitorInterval);
    accountMonitorInterval = null;
  }
}

function createBot() {
  // Перед созданием нового бота удаляем обработчики старого (если остался)
  if (bot) {
    try {
      bot.removeAllListeners();
    } catch (e) {}
  }

  bot = mineflayer.createBot(config);

  bot.on('login', () => {
    console.log(`[+] Bot logged in as ${bot.username}`);
    sendDiscordNotification(`Bot **${bot.username}** successfully logged into the server \`${config.host}\`.`, 65280); // Green color
    // Если до этого был монитор — остановим его (мы подключились)
    pausedDueToPlayerLogin = false;
    stopAccountMonitor();
  });

  bot.on('spawn', () => {
    console.log('[Bot] Spawned and ready to work.');

    // Очистка предыдущих интервалов (если они остались от прошлых подключений)
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
    // Очистка интервалов при дисконнекте
    if (foodMonitorInterval) {
      clearInterval(foodMonitorInterval);
      foodMonitorInterval = null;
    }
    if (playerScannerInterval) {
      clearInterval(playerScannerInterval);
      playerScannerInterval = null;
    }

    // Если отключение связано с тем, что кто-то (вы) зашёл в аккаунт — переходим в режим ожидания
    if (reasonIndicatesPlayerLogin(reason)) {
      pausedDueToPlayerLogin = true;
      shouldReconnect = false;
      console.log('[!] Detected that account is used by player. Pausing reconnection and starting monitor.');
      sendDiscordNotification(`Account **${config.username}** appears to be used by a player: \`${reason}\`. Bot will wait until you logout.`, 16711680);
      startAccountMonitor();
      return;
    }

    if (shouldReconnect) {
      console.log('[!] Disconnected. Reconnecting in 15 seconds...');
      sendDiscordNotification(`The bot has been disabled due to the following reason: \`${reason}\`. 
Trying to reconnect in 15 seconds.`, 16776960); // Orange color
      setTimeout(createBot, reconnectTimeout);
    } else {
      console.log('[!] Disconnected manually. Reconnect paused.');
      sendDiscordNotification(`The bot was disabled manually/by command due to the following reason: \`${reason}\`. Reconnection paused.`, 16711680); // Red color
    }
  });

  bot.on('error', (err) => {
    console.log(`[x] Error: ${err.message}`);
    // Если ошибка указывает, что аккаунт в использовании — пауза и монитор
    if (reasonIndicatesPlayerLogin(err.message)) {
      pausedDueToPlayerLogin = true;
      shouldReconnect = false;
      sendDiscordNotification(`Account **${config.username}** appears to be used by a player: \`${err.message}\`. Bot will wait until you logout.`, 16711680);
      startAccountMonitor();
      return;
    }

    sendDiscordNotification(`Critical error: \`${err.message}\``, 16711680); // Red color
  });

  bot.on('kicked', (reason) => {
    console.log(`[!] Kicked: ${reason}`);

    // Если кик из-за того, что вы вошли в аккаунт, ставим паузу и запускаем монитор
    if (reasonIndicatesPlayerLogin(reason)) {
      pausedDueToPlayerLogin = true;
      shouldReconnect = false;
      console.log('[!] Kicked because account used by player. Starting monitor.');
      sendDiscordNotification(`The account **${config.username}** seems to be used by a player: \`${reason}\`. Bot will wait until you logout.`, 16711680);
      startAccountMonitor();
      return;
    }

    sendDiscordNotification(`The bot was kicked from the server. Reason: \`${reason}\``, 16711680); // Red color
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

  // Сохраняем ID интервала в переменной, чтобы можно было его очистить
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

    // collect players within 45 blocks
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

createBot();