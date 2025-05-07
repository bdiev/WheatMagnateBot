const mineflayer = require('mineflayer');

const config = {
  host: 'oldfag.org',
  username: 'WheatMagnate',
  auth: 'microsoft',
};

let bot;
const reconnectTimeout = 15000;
let shouldReconnect = true;

function createBot() {
  bot = mineflayer.createBot(config);

  bot.on('login', () => {
    console.log(`[+] Bot logged in as ${bot.username}`);
  });

  bot.on('spawn', () => {
    console.log('[Bot] Spawned and ready to work.');
    startFoodMonitor();
  });

  bot.on('end', () => {
    if (shouldReconnect) {
      console.log('[!] Disconnected. Reconnecting in 15 seconds...');
      setTimeout(createBot, reconnectTimeout);
    } else {
      console.log('[!] Disconnected manually. Reconnect paused for 10 minutes.');
    }
  });

  bot.on('error', (err) => {
    console.log(`[x] Error: ${err.message}`);
  });

  bot.on('kicked', (reason) => {
    console.log(`[!] Kicked: ${reason}`);
  });

  bot.on('death', () => {
    console.log('[Bot] Died heroically.');
  });

  // Реакция на команды в чате (только от bdiev_)
  bot.on('chat', (username, message) => {
    if (username !== 'bdiev_') return;

    if (message === '!restart') {
      console.log(`[Команда] Получена команда от ${username}: ${message}`);
      console.log('Бот завершает работу по команде владельца...');
      bot.quit('Перезапуск по команде от bdiev_');
    }

    if (message === '!pause') {
      console.log(`[Команда] Получена команда от ${username}: ${message}`);
      console.log('[Bot] Ухожу на 10-минутный кофе-брейк... ☕');

      shouldReconnect = false;
      bot.quit('Пауза по команде bdiev_');

      setTimeout(() => {
        console.log('[Bot] Пауза закончилась. Возвращаюсь к работе!');
        shouldReconnect = true;
        createBot();
      }, 10 * 60 * 1000); // 10 минут
    }
  });
}

function startFoodMonitor() {
  setInterval(async () => {
    if (!bot || bot.food === undefined || bot.food >= 18 || bot._isEating) return;

    bot._isEating = true;
    await eatFood();
    bot._isEating = false;
  }, 1000);
}

async function eatFood() {
  const foodItem = bot.inventory.items().find(item =>
    ['bread', 'apple', 'beef', 'golden_carrot'].some(name => item.name.includes(name))
  );

  if (!foodItem) {
    console.log('[Bot] No food in inventory.');
    return;
  }

  try {
    console.log(`[Bot] I'm hungry (food level: ${bot.food}). Trying to eat ${foodItem.name}...`);
    await bot.equip(foodItem, 'hand');
    await bot.consume();
    console.log('[Bot] Yum! Food eaten.');
  } catch (err) {
    console.error('[Bot] Error during eating:', err);
  }
}

setInterval(() => {
  if (bot && bot.chat) {
    console.log('[Bot] Авто-команда: !addfaq Farm Wheat!');
    bot.chat('!addfaq Farm Wheat!');
  }
}, 3 * 60 * 60 * 1000); // каждые 3 часа

if (process.env.DISABLE_BOT === 'true') {
  console.log('Бот выключен через переменные окружения.');
  process.exit(0);
}

createBot();