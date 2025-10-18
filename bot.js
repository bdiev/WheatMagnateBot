const mineflayer = require('mineflayer');

const config = {
  host: 'oldfag.org',
  username: 'WheatMagnate',
  auth: 'microsoft',
};

const ignoredUsernames = [
  'Podrockian', 'drcola36', 'FunkyGamer26', 'QuickKitty_',
  'Vendell', 'SliverSlide', 'piff_chiefington', 'chief_piffinton',
  'bulbax', 'Deireide', 'liketinos2341', 'bdiev_', 'NinjaOverSurge'
];

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
    startNearbyPlayerScanner();
  });

  bot.on('end', () => {
    if (shouldReconnect) {
      console.log('[!] Disconnected. Reconnecting in 15 seconds...');
      setTimeout(createBot, reconnectTimeout);
    } else {
      console.log('[!] Disconnected manually. Reconnect paused.');
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
      console.log(`[Command] Command received from ${username}: ${message}`);
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
      }, 10 * 60 * 1000); // 10 minutes
    }

    const pauseMatch = message.match(/^!pause\s+(\d+)$/);
    if (pauseMatch) {
      const minutes = parseInt(pauseMatch[1]);
      if (isNaN(minutes) || minutes <= 0) {
        console.log('[Bot] Invalid pause time specified.');
        return;
      }

      console.log(`[Command] Command received from ${username}: ${message}`);
      console.log(`[Bot] Pausing for ${minutes} minute(s)...`);

      shouldReconnect = false;
      bot.quit(`Paused for ${minutes} minute(s) on command from bdiev_`);

      setTimeout(() => {
        console.log('[Bot] Pause complete. Reconnecting now...');
        shouldReconnect = true;
        createBot();
      }, minutes * 60 * 1000);
    }
  });
}

function startFoodMonitor() {
  let lastNoFoodWarning = 0;

  setInterval(async () => {
    if (!bot || bot.food === undefined || bot.food >= 18 || bot._isEating) return;

    // если с момента последнего предупреждения прошло меньше 30 секунд — не спамим
    if (Date.now() - lastNoFoodWarning < 30 * 1000) return;

    const hasFood = bot.inventory.items().some(item =>
      ['bread', 'apple', 'beef', 'golden_carrot'].some(name => item.name.includes(name))
    );

    if (!hasFood) {
      console.log('[Bot] No food in inventory.');
      lastNoFoodWarning = Date.now();
      return;
    }

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

function startNearbyPlayerScanner() {
  setInterval(() => {
    if (!bot || !bot.entity) return;

    const nearbyPlayers = Object.values(bot.entities)
      .filter(entity =>
        entity.type === 'player' &&
        entity.username &&
        entity.username !== bot.username &&
        !ignoredUsernames.includes(entity.username) &&
        bot.entity.position.distanceTo(entity.position) < 10
      );

    if (nearbyPlayers.length > 0) {
      console.log('[Bot] Nearby players (not ignored):');
      nearbyPlayers.forEach(player => {
        console.log(`- ${player.username}`);
      });
    }
  }, 5000);
}

//setInterval(() => {
//  if (bot && bot.chat) {
 //   console.log('[Bot] Auto-command: !addfaq Farm Wheat!');
 //   bot.chat('!addfaq Farm Wheat!');
//  }
//}, 2 * 60 * 60 * 1000); // every 2 hours 

if (process.env.DISABLE_BOT === 'true') {
  console.log('The bot is turned off through environment variables.');
  process.exit(0);
}

createBot();


