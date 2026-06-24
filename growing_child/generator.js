'use strict';

function pick(items) {
  return items[Math.floor(Math.random() * items.length)];
}

function weightedPool(rows) {
  const pool = [];
  for (const row of rows) {
    const weight = Math.max(1, Math.min(8, Number(row.times_seen) || 1));
    for (let i = 0; i < weight; i++) pool.push(row.word || row.topic || row.name);
  }
  return pool;
}

class MessageGenerator {
  constructor(database, emotionSystem) {
    this.database = database;
    this.emotionSystem = emotionSystem;
  }

  generate() {
    const stats = this.database.getStats();
    const words = this.database.getWords({ limit: 120 });
    if (words.length === 0) return '...';

    const recent = this.database.getWords({ limit: 20, recent: true });
    const topics = this.database.getTopics(20);
    const emotion = this.emotionSystem.get();
    const pool = weightedPool(words);
    const recentPool = weightedPool(recent);
    const topicPool = weightedPool(topics);

    const take = source => pick(source.length > 0 ? source : pool);
    let length = 1;
    if (stats.level === 2) length = 2 + Math.floor(Math.random() * 2);
    if (stats.level === 3) length = 3 + Math.floor(Math.random() * 3);
    if (stats.level >= 4) length = 5 + Math.floor(Math.random() * 5);

    const result = [];
    if (recentPool.length && Math.random() < 0.35) result.push(take(recentPool));
    if (topicPool.length && Math.random() < 0.45) result.push(take(topicPool));
    while (result.length < length) result.push(take(pool));

    const questionChance = emotion === 'curious' ? 0.65 : 0.25;
    const punctuation = Math.random() < questionChance ? '?' : emotion === 'sleepy' ? '...' : '.';
    const sentence = result
      .filter(Boolean)
      .slice(0, length)
      .join(' ')
      .replace(/^./u, char => char.toLocaleUpperCase());
    return `${sentence}${punctuation}`;
  }
}

module.exports = { MessageGenerator };
