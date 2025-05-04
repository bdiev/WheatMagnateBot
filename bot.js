const mineflayer = require('mineflayer');
const { pathfinder, Movements } = require('mineflayer-pathfinder');
const { GoalNear } = require('mineflayer-pathfinder').goals;
const mcDataLoader = require('minecraft-data');

const config = {
  host: 'oldfag.org',
  username: 'WheatMagnate',
  auth: 'microsoft'
};

let bot;
const reconnectTimeout = 5000;

function createBot() {
  bot = mineflayer.createBot(config);
  bot.loadPlugin(pathfinder);

  bot.on('login', () => console.log(`[+] Logged in as ${bot.username}`));
  bot.on('spawn', onSpawn);
  bot.on('end', () => {
    console.log('[!] Disconnected. Reconnecting...');
    setTimeout(createBot, reconnectTimeout);
  });
  bot.on('error', err => console.log(`[x] Error: ${err.message}`));
  bot.on('kicked', reason => console.log(`Kicked: ${reason}`));
  bot.on('death', () => console.log('[Bot] Died heroically.'));
}

function onSpawn() {
  console.log('[Bot] Spawned and ready.');

  const mcData = mcDataLoader(bot.version);
  const defaultMove = new Movements(bot, mcData);
  bot.pathfinder.setMovements(defaultMove);

  startFoodMonitor();
  startPiglinKiller();
}

function startFoodMonitor() {
  setInterval(async () => {
    if (!bot.food || bot.food >= 18 || bot._isEating) return;
    bot._isEating = true;
    await eatFood();
    bot._isEating = false;
  }, 1000);
}

async function eatFood() {
  const food = bot.inventory.items().find(item =>
    ['bread', 'apple', 'beef', 'golden_carrot'].some(f => item.name.includes(f))
  );

  if (!food) return console.log('[Bot] No food to eat.');

  try {
    console.log(`[Bot] Eating ${food.name} (food level: ${bot.food})...`);
    await bot.equip(food, 'hand');
    await bot.consume();
    console.log('[Bot] Ate successfully!');
  } catch (err) {
    console.error('[Bot] Failed to eat:', err);
  }
}

function startPiglinKiller() {
  setInterval(() => {
    const piglin = bot.nearestEntity(entity =>
      entity.name === 'zombified_piglin' &&
      bot.entity.position.distanceTo(entity.position) <= 3
    );

    if (piglin) {
      const sword = bot.inventory.items().find(i => i.name.includes('sword'));
      if (sword) bot.equip(sword, 'hand').catch(() => {});

      bot.lookAt(piglin.position.offset(0, piglin.height / 2, 0), true, () => {
        bot.attack(piglin);
      });
    }
  }, 1000);
}

createBot();
