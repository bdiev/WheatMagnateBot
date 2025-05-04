const mineflayer = require('mineflayer');

// Connect settings
const bot = mineflayer.createBot({
  //host: 'localhost',
  //host: '45.93.200.46',
  //port: '60101',
  host: 'oldfag.org',
  username: 'WheatMagnate',
  auth: 'microsoft',
});

let bot;
let reconnectTimeout = 5000; // Delay before reconnection.

function createBot() {
  bot = mineflayer.createBot(config);

  bot.on('login', () => {
    console.log(`[+] The bot has joined the server as ${bot.username}`);
  });

  bot.on('end', () => {
    console.log('[!] The bot has been disconnected. Reconnecting in 5 seconds...');
    setTimeout(createBot, reconnectTimeout);
  });

  bot.on('error', (err) => {
    console.log(`[x] Error: ${err.message}`);
  });

  // Additionally, you can monitor events:
   bot.on('kicked', (reason) => console.log(`Kicked: ${reason}`));
   bot.on('death', () => console.log('The bot died heroically.'));
}

createBot();

bot.on('spawn', () => {
  console.log('[Bot] start working.');

  setInterval(() => {
    const food = bot.food;
    if (food < 18 && !bot.foodTimeout) {
      eatFood();
    }
  }, 1000);
});

async function eatFood() {
  const foodItem = bot.inventory.items().find(item => item.name.includes('bread') || item.name.includes('apple') || item.name.includes('beef') || item.name.includes('golden_carrot'));

  if (!foodItem) {
    console.log('[Bot] Food is gone.');
    return;
  }

  try {
    console.log(`[Bot] Im hungry (level ${bot.food}). Trying ate: ${foodItem.name}`);
    await bot.equip(foodItem, 'hand');
    await bot.consume();
    console.log('[Bot] Yum-yum-yum! Ate.');
  } catch (err) {
    console.error('[Bot] Error while trying to eat:', err);
  }
}

