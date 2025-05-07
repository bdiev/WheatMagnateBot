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
    startNearbyPlayerScanner(); // ← Запуск сканера игроков
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

  bot.on('chat', (username, message) => {
    if (username !== 'bdiev_') return;

    if (message === '!restart') {
      console.log(`[Команда] Command received from ${username}: ${message}`);
      console.log('The bot stops working at the owners command...');
      bot.quit('Restarting on command from bdiev_');
    }

    if (message === '!pause') {
      console.log(`[Command] Command received from ${username}: ${message}`);
      console.log('[Bot] I’m going for a 10-minute coffee break... ☕');

      shouldReconnect = false;
      bot.quit('Pause on command from bdiev_');

      setTimeout(() => {
        console.log('[Bot] The pause is over. I am returning to work!');
        shouldReconnect = true;
        createBot();
      }, 5 * 60 * 1000); // 5 minutes
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

// === Новый функционал: Сканирование игроков рядом ===
function startNearbyPlayerScanner() {
  setInterval(() => {
    if (!bot || !bot.entity) return;

    const nearbyPlayers = Object.values(bot.entities)
      .filter(entity =>
        entity.type === 'player' &&
        entity.username &&
        entity.username !== bot.username &&
        bot.entity.position.distanceTo(entity.position) < 45
      );

    if (nearbyPlayers.length > 0) {
      console.log('[Bot] Nearby players:');
      nearbyPlayers.forEach(player => {
        console.log(`- ${player.username}`);
      });
    }
  }, 2000);
}
// === Конец добавки ===

setInterval(() => {
  if (bot && bot.chat) {
    console.log('[Bot] Auto-command: !addfaq Farm Wheat!');
    bot.chat('!addfaq Farm Wheat!');
  }
}, 2 * 60 * 60 * 1000); // every 2 hrs

if (process.env.DISABLE_BOT === 'true') {
  console.log('The bot is turned off through environment variables.');
  process.exit(0);
}

createBot();
