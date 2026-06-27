'use strict';

const { isSafePublicWord } = require('./safety');

const FUNCTION_WORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'but', 'can', 'do', 'does', 'for',
  'from', 'have', 'he', 'her', 'here', 'him', 'his', 'i', 'if', 'in', 'is', 'it',
  'me', 'my', 'no', 'not', 'of', 'on', 'or', 'our', 'she', 'some', 'that', 'the',
  'their', 'them', 'there', 'they', 'this', 'to', 'was', 'we', 'what', 'when',
  'where', 'who', 'why', 'with', 'you', 'your'
]);

function shuffle(items) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function randomSample(items, count) {
  return shuffle(items).slice(0, count);
}

function finish(words, punctuation) {
  if (words.length === 0) return '...';
  const sentence = words
    .join(' ')
    .replace(/^./u, char => char.toLocaleUpperCase());
  return `${sentence}${punctuation}`;
}

function similarity(firstWords, secondWords) {
  if (firstWords.length === 0 || secondWords.length === 0) return 0;
  const first = new Set(firstWords);
  const second = new Set(secondWords);
  let shared = 0;
  for (const word of first) {
    if (second.has(word)) shared++;
  }
  // Recall against the shorter phrase catches shortened copies such as
  // "you have some emeralds bookselfs" from a slightly longer chat message.
  return shared / Math.min(first.size, second.size);
}

function scoreWords(words, reply = false) {
  if (words.length < 3) return -100;
  const unique = new Set(words);
  let score = 0;
  const idealLength = reply ? 6 : 7;
  score += 12 - Math.abs(words.length - idealLength);
  score += unique.size * 1.5;
  score += words.filter(word => !FUNCTION_WORDS.has(word)).length * 2;
  if (words.some((word, index) => index > 0 && word === words[index - 1])) score -= 25;
  if (words.length > 1 && words[0] === words[words.length - 1]) score -= 10;
  return score + Math.random() * 3;
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

  isTooSimilarToChat(words) {
    if (words.length < 3) return true;
    return this.database.getLearnedSequences(1000).some(row => {
      const learned = row.sequence.split(' ').filter(Boolean);
      if (learned.join(' ') === words.join(' ')) return true;
      for (let i = 0; i <= learned.length - 3; i++) {
        const trigram = learned.slice(i, i + 3).join(' ');
        if (words.join(' ').includes(trigram)) return true;
      }
      const lengthRatio = Math.min(words.length, learned.length) / Math.max(words.length, learned.length);
      return lengthRatio >= 0.45 && similarity(words, learned) >= 0.65;
    });
  }

  getRandomWordPool(contextWords = []) {
    const learnedWords = this.database
      .getAllWords()
      .map(row => String(row.word || '').toLocaleLowerCase())
      .filter(word => word && isSafePublicWord(word));
    const context = contextWords
      .map(word => String(word || '').toLocaleLowerCase())
      .filter(word => word && isSafePublicWord(word) && learnedWords.includes(word));
    return [...new Set([...context, ...learnedWords])];
  }

  makeCandidate(reply = false, contextWords = []) {
    const pool = this.getRandomWordPool(contextWords);
    const contentWords = pool.filter(word => !FUNCTION_WORDS.has(word));
    if (contentWords.length < 5) return null;

    const targetLength = Math.min(
      pool.length,
      4 + Math.floor(Math.random() * (reply ? 6 : 8))
    );
    const context = randomSample(
      [...new Set(contextWords.filter(word => pool.includes(word) && !FUNCTION_WORDS.has(word)))],
      reply ? 2 : 1
    );
    const remaining = pool.filter(word => !context.includes(word));
    const words = shuffle([
      ...context,
      ...randomSample(remaining, Math.max(0, targetLength - context.length))
    ]);

    if (words.length < 3) return null;
    return { words, phrase: finish(words, this.getPunctuation(reply)), score: scoreWords(words, reply) };
  }

  generateCandidates({ reply = false, contextWords = [], attempts = 80, limit = 8 } = {}) {
    const candidates = [];
    const seen = new Set();
    for (let attempt = 0; attempt < attempts; attempt++) {
      const candidate = this.makeCandidate(reply, contextWords);
      if (!candidate || this.isTooSimilarToChat(candidate.words)) continue;
      const normalized = candidate.words.join(' ');
      if (seen.has(normalized)) continue;
      seen.add(normalized);
      candidates.push(candidate);
    }
    return candidates
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(candidate => candidate.phrase);
  }

  generate() {
    return this.generateCandidates({ reply: false, attempts: 80, limit: 1 })[0] || null;
  }

  generateReply(contextWords = []) {
    return this.generateCandidates({ reply: true, contextWords, attempts: 80, limit: 1 })[0] || null;
  }
}

module.exports = { MessageGenerator };
