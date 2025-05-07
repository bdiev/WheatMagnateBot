const mineflayer = require('mineflayer');

const config = {
  host: 'oldfag.org',
  username: 'WheatMagnate',
  auth: 'microsoft'
};

let bot;
let reconnectTimeout = 15000;

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
    console.log('[!] Disconnected. Reconnecting in 115 seconds...');
    setTimeout(createBot, reconnectTimeout);
  });

  bot.on('error', (err) => {
    console.log(`[x] Error: ${err.message}`);
  });

  bot.on('kicked', (reason) => console.log(`Kicked: ${reason}`));
  bot.on('death', () => console.log('[Bot] Died heroically.'));
}

function startFoodMonitor() {
  setInterval(async () => {
    if (!bot || !bot.health || bot.food === undefined) return;

    if (bot.food < 18 && !bot._isEating) {
      bot._isEating = true;
      await eatFood();
      bot._isEating = false;
    }
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

if (process.env.DISABLE_BOT === 'true') {
  console.log('Бот выключен через переменные окружения.');
  process.exit(0);
}

bot.on('chat', (username, message) => {
  if (username !== 'bdiev_') return; // Игнорируем всех, кроме владельца

  if (message === '!restart') {
    console.log(`[Команда] Получена команда от ${username}: ${message}`);
    console.log('Бот завершает работу по команде владельца...');
    bot.quit('Перезапуск по команде от bdiev_');
  }
});

createBot();

