const mineflayer = require('mineflayer');

const config = {
  host: 'oldfag.org',
  username: 'WheatMagnate',
  auth: 'microsoft'
};

let bot;
let reconnectTimeout = 5000;

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
    console.log('[!] Disconnected. Reconnecting in 5 seconds...');
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

function huntPiglins() {
  setInterval(() => {
    const piglin = bot.nearestEntity(entity =>
      entity.name === 'zombified_piglin'
    );

    if (piglin) {
      console.log('[Бот] Цель найдена: zombified_piglin. Атакую!');
      bot.lookAt(piglin.position.offset(0, piglin.height, 0), true, () => {
        bot.attack(piglin);
      });
    } else {
      console.log('[Бот] Свинозомби не видно поблизости.');
    }
  }, 3000);
}

bot.on('death', () => {
  console.log('[Бот] Я погиб героически...');
});

bot.on('error', err => {
  console.error('[Ошибка]', err);
});

createBot();