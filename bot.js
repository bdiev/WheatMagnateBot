const mineflayer = require('mineflayer');

// Connect settings
const bot = mineflayer.createBot({
  host: 'localhost',
  //host: '45.93.200.46',
  host: 'oldfag.org',
  //port: '60101',
  username: 'WheatMagnate',
  auth: 'microsoft',
});

bot.on('spawn', () => {
  console.log('[Бот] Запущен и готов к поеданию мира.');

  setInterval(() => {
    const food = bot.food; // уровень насыщения от 0 до 20
    if (food < 18 && !bot.foodTimeout) {
      eatFood();
    }
  }, 1000);
});

async function eatFood() {
  const foodItem = bot.inventory.items().find(item => item.name.includes('bread') || item.name.includes('apple') || item.name.includes('beef') || item.name.includes('golden_carrot'));

  if (!foodItem) {
    console.log('[Бот] Еда закончилась. Пора голодать красиво.');
    return;
  }

  try {
    console.log(`[Бот] Голодаю (уровень ${bot.food}). Пытаюсь съесть: ${foodItem.name}`);
    await bot.equip(foodItem, 'hand');
    await bot.consume();
    console.log('[Бот] Ом-ном-ном! Поел.');
  } catch (err) {
    console.error('[Бот] Ошибка при попытке поесть:', err);
  }
}

