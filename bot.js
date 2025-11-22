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

  // ------- CHAT COMMANDS -------
  bot.on('chat', (username, message) => {
    if (username !== 'bdiev_') return;

    if (message === '!restart') {
      console.log(`[Command] ${username} → ${message}`);
      bot.quit('Restarting on command');
    }

    if (message === '!pause') {
      console.log(`[Command] ${username} → ${message}`);
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
  }
}

// -------------- PLAYER SCANNER (вход/выход без спама) --------------
function startNearbyPlayerScanner() {
  const inRange = new Set();

  setInterval(() => {
    if (!bot || !bot.entity) return;

    const currentPlayers = new Set();

    Object.values(bot.entities)
      .filter(entity =>
        entity.type === 'player' &&
        entity.username &&
        entity.username !== bot.username &&
        !ignoredUsernames.includes(entity.username) &&
        bot.entity.position.distanceTo(entity.position) < 10
      )
      .forEach(entity => currentPlayers.add(entity.username));

    // Вошли
    currentPlayers.forEach(username => {
      if (!inRange.has(username)) {
        console.log(`[Bot] Player entered range: ${username}`);
        inRange.add(username);
      }
    });

    // Вышли
    [...inRange].forEach(username => {
      if (!currentPlayers.has(username)) {
        console.log(`[Bot] Player left range: ${username}`);
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
