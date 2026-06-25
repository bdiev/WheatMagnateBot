'use strict';

const { START_TOKEN, END_TOKEN } = require('./database');
const { isSafePublicWord } = require('./safety');

function weightedPick(rows, valueKey) {
  if (rows.length === 0) return null;
  const total = rows.reduce((sum, row) => sum + Math.max(1, Number(row.times_seen) || 1), 0);
  let cursor = Math.random() * total;
  for (const row of rows) {
    cursor -= Math.max(1, Number(row.times_seen) || 1);
    if (cursor <= 0) return row[valueKey];
  }
  return rows[rows.length - 1][valueKey];
}

function finish(words, punctuation) {
  if (words.length === 0) return '...';
  const sentence = words
    .join(' ')
    .replace(/^./u, char => char.toLocaleUpperCase());
  return `${sentence}${punctuation}`;
}

function fallbackPhrase(topic, reply = false) {
  if (!topic) return 'I am still learning.';
  if (reply) {
    const templates = [
      `Are you talking about ${topic}?`,
      `What happened with ${topic}?`,
      `I heard you mention ${topic}.`
    ];
    return templates[Math.floor(Math.random() * templates.length)];
  }
  const templates = [
    `I keep hearing about ${topic}.`,
    `${topic.replace(/^./u, char => char.toLocaleUpperCase())} seems important today.`,
    `Does anyone know more about ${topic}?`
  ];
  return templates[Math.floor(Math.random() * templates.length)];
}

class MessageGenerator {
  constructor(database, emotionSystem) {
    this.database = database;
    this.emotionSystem = emotionSystem;
  }

  getPunctuation(reply = false) {
    const emotion = this.emotionSystem.get();
    if (emotion === 'sleepy') return '...';
    const questionChance = emotion === 'curious' ? 0.55 : reply ? 0.3 : 0.12;
    return Math.random() < questionChance ? '?' : '.';
  }

  walk(previousWord, currentWord, initialWords, maxLength) {
    const result = [...initialWords];
    let previous = previousWord;
    let current = currentWord;

    while (result.length < maxLength) {
      const options = this.database.getNextWords(previous, current)
        .filter(row => row.next_word === END_TOKEN || isSafePublicWord(row.next_word));
      if (options.length === 0) break;

      const next = weightedPick(options, 'next_word');
      if (!next || next === END_TOKEN) break;

      // Avoid loops such as "help help help" when chat contains spam.
      const lastThree = result.slice(-3);
      if (lastThree.filter(word => word === next).length >= 2) break;

      result.push(next);
      previous = current;
      current = next;
    }

    return result;
  }

  generate() {
    const starts = this.database.getNextWords(START_TOKEN, START_TOKEN)
      .filter(row => isSafePublicWord(row.next_word));
    if (starts.length === 0) {
      const topics = this.database.getTopics(40).filter(row => isSafePublicWord(row.topic));
      const words = this.database.getWords({ limit: 100 }).filter(row => isSafePublicWord(row.word));
      return fallbackPhrase(
        weightedPick(topics, 'topic') || weightedPick(words, 'word'),
        false
      );
    }

    const first = weightedPick(starts, 'next_word');
    const maxLength = 4 + Math.floor(Math.random() * 7);
    const words = this.walk(START_TOKEN, first, [first], maxLength);
    if (words.length < 3) return fallbackPhrase(first, false);
    return finish(words, this.getPunctuation(false));
  }

  generateReply(contextWords = []) {
    const safeContext = [...new Set(contextWords.filter(isSafePublicWord))];
    const candidates = [];

    for (const word of safeContext) {
      for (const row of this.database.getContextsForWord(word, 20)) {
        candidates.push({ ...row, context_word: word });
      }
    }

    if (candidates.length === 0) {
      return fallbackPhrase(safeContext[0], safeContext.length > 0);
    }

    const selectedWord = weightedPick(candidates, 'context_word');
    const matching = candidates.filter(row => row.context_word === selectedWord);
    const selectedPrevious = weightedPick(matching, 'previous_word');
    const maxLength = 4 + Math.floor(Math.random() * 6);
    const words = this.walk(selectedPrevious, selectedWord, [selectedWord], maxLength);
    if (words.length < 3) return fallbackPhrase(selectedWord, true);
    return finish(words, this.getPunctuation(true));
  }
}

module.exports = { MessageGenerator };
