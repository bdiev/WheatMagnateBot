'use strict';

const { isSafePublicWord } = require('./safety');

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
    const words = this.database.getWords({ limit: 200 }).filter(row => isSafePublicWord(row.word));
    if (words.length === 0) return '...';

    const recent = this.database.getWords({ limit: 40, recent: true })
      .filter(row => isSafePublicWord(row.word));
    const topics = this.database.getTopics(40)
      .filter(row => isSafePublicWord(row.topic));
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

  generateReply(contextWords = []) {
    const stats = this.database.getStats();
    const knownRows = this.database.getWords({ limit: 250 })
      .filter(row => isSafePublicWord(row.word));
    if (knownRows.length === 0) return '...';

    const known = new Set(knownRows.map(row => row.word));
    const context = [...new Set(contextWords.filter(word => known.has(word)))];
    const pool = weightedPool(knownRows);
    const result = [];

    if (context.length > 0) result.push(pick(context));

    let length = 1;
    if (stats.level === 2) length = 2 + Math.floor(Math.random() * 2);
    if (stats.level === 3) length = 3 + Math.floor(Math.random() * 2);
    if (stats.level >= 4) length = 4 + Math.floor(Math.random() * 4);

    while (result.length < length) result.push(pick(pool));

    const emotion = this.emotionSystem.get();
    const asksQuestion =
      stats.level >= 2 &&
      (emotion === 'curious' || Math.random() < 0.55);
    const punctuation = asksQuestion ? '?' : emotion === 'sleepy' ? '...' : '.';
    const sentence = result
      .filter(Boolean)
      .slice(0, length)
      .join(' ')
      .replace(/^./u, char => char.toLocaleUpperCase());
    return `${sentence}${punctuation}`;
  }
}

module.exports = { MessageGenerator };
