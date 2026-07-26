'use strict';

const { hasMixedLatinCyrillicWords, isSafePublicWord } = require('./safety');

const FUNCTION_WORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'but', 'can', 'do', 'does', 'for',
  'from', 'have', 'he', 'her', 'here', 'him', 'his', 'i', 'if', 'in', 'is', 'it',
  'me', 'my', 'no', 'not', 'of', 'on', 'or', 'our', 'she', 'some', 'that', 'the',
  'their', 'them', 'there', 'they', 'this', 'to', 'was', 'we', 'what', 'when',
  'where', 'who', 'why', 'with', 'you', 'your'
]);

// Local generation is deliberately conservative. A bag of learned words is not
// a language model: shuffling that bag produced fluent-looking word salad. Only
// use words whose Minecraft meaning is reasonably stable, and put one topic into
// a small grammatical frame. If no such topic is known, staying silent is safer.
const MINECRAFT_TOPICS = new Set([
  'armor', 'axe', 'base', 'beacon', 'bed', 'block', 'blocks', 'boat', 'boots',
  'bow', 'bread', 'build', 'chest', 'coal', 'cobble', 'cobblestone', 'copper',
  'diamond', 'diamonds', 'elytra', 'emerald', 'emeralds', 'farm', 'food', 'gear',
  'gold', 'helmet', 'home', 'iron', 'item', 'items', 'lava', 'mine', 'mining',
  'nether', 'obsidian', 'pick', 'pickaxe', 'pickaxes', 'portal', 'potion',
  'potions', 'rail', 'redstone', 'rocket', 'rockets', 'server', 'shell', 'shells',
  'shield', 'shop', 'shulker', 'shulkers', 'spawn', 'stone', 'sword', 'tools',
  'torch', 'torches', 'trade', 'trading', 'village', 'villager', 'villagers',
  'wheat', 'wood'
]);

const STATEMENT_FRAMES = Object.freeze([
  topic => ['what', 'about', 'the', topic],
  topic => ['do', 'you', 'need', topic],
  topic => ['we', 'can', 'use', topic],
  topic => ['i', 'can', 'help', 'with', topic]
]);

const REPLY_FRAMES = Object.freeze([
  topic => ['do', 'you', 'need', topic],
  topic => ['i', 'can', 'help', 'with', topic],
  topic => ['what', 'about', 'the', topic],
  topic => ['we', 'can', 'use', topic]
]);

function shuffle(items, random = Math.random) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function randomSample(items, count, random = Math.random) {
  return shuffle(items, random).slice(0, count);
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

function scoreWords(words, reply = false, random = Math.random) {
  if (words.length < 3) return -100;
  const unique = new Set(words);
  let score = 0;
  const idealLength = reply ? 6 : 7;
  score += 12 - Math.abs(words.length - idealLength);
  score += unique.size * 1.5;
  score += words.filter(word => !FUNCTION_WORDS.has(word)).length * 2;
  if (words.some((word, index) => index > 0 && word === words[index - 1])) score -= 25;
  if (words.length > 1 && words[0] === words[words.length - 1]) score -= 10;
  return score + random() * 3;
}

class MessageGenerator {
  constructor(database, emotionSystem, { random = Math.random } = {}) {
    this.database = database;
    this.emotionSystem = emotionSystem;
    this.random = random;
  }

  getPunctuation(reply = false) {
    const emotion = this.emotionSystem.get();
    if (emotion === 'sleepy') return '...';
    const questionChance = emotion === 'curious' ? 0.55 : reply ? 0.3 : 0.12;
    return this.random() < questionChance ? '?' : '.';
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
    const contextTopics = [...new Set(contextWords)]
      .filter(word => pool.includes(word) && MINECRAFT_TOPICS.has(word));
    const learnedTopics = pool.filter(word => MINECRAFT_TOPICS.has(word));
    const topics = contextTopics.length > 0 ? contextTopics : learnedTopics;
    if (topics.length === 0) return null;

    const topic = topics[Math.floor(this.random() * topics.length)];
    const frames = reply ? REPLY_FRAMES : STATEMENT_FRAMES;
    const words = frames[Math.floor(this.random() * frames.length)](topic);

    if (words.length < 3 || hasMixedLatinCyrillicWords(words)) return null;
    const punctuation = ['do', 'what'].includes(words[0])
      ? '?'
      : this.emotionSystem.get() === 'sleepy' ? '...' : '.';
    return { words, phrase: finish(words, punctuation), score: scoreWords(words, reply, this.random) };
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
