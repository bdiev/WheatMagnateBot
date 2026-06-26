'use strict';

const { START_TOKEN, END_TOKEN } = require('./database');
const { isSafePublicWord } = require('./safety');

const FUNCTION_WORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'but', 'can', 'do', 'does', 'for',
  'from', 'have', 'he', 'her', 'here', 'him', 'his', 'i', 'if', 'in', 'is', 'it',
  'me', 'my', 'no', 'not', 'of', 'on', 'or', 'our', 'she', 'some', 'that', 'the',
  'their', 'them', 'there', 'they', 'this', 'to', 'was', 'we', 'what', 'when',
  'where', 'who', 'why', 'with', 'you', 'your'
]);

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
      const lengthRatio = Math.min(words.length, learned.length) / Math.max(words.length, learned.length);
      return lengthRatio >= 0.55 && similarity(words, learned) >= 0.8;
    });
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

  makeCandidate(reply = false, contextWords = []) {
    const safeContext = [...new Set(contextWords.filter(isSafePublicWord))];
    const meaningfulContext = safeContext.filter(word => !FUNCTION_WORDS.has(word));

    if (reply) {
      const candidates = [];
      for (const word of meaningfulContext.length > 0 ? meaningfulContext : safeContext) {
        for (const row of this.database.getContextsForWord(word, 20)) {
          candidates.push({ ...row, context_word: word });
        }
      }
      if (candidates.length === 0) return null;

      const selectedWord = weightedPick(candidates, 'context_word');
      const matching = candidates.filter(row => row.context_word === selectedWord);
      const selectedPrevious = weightedPick(matching, 'previous_word');
      const maxLength = 4 + Math.floor(Math.random() * 7);
      const words = this.walk(selectedPrevious, selectedWord, [selectedWord], maxLength);
      return { words, phrase: finish(words, this.getPunctuation(true)), score: scoreWords(words, true) };
    }

    const starts = this.database.getNextWords(START_TOKEN, START_TOKEN)
      .filter(row => isSafePublicWord(row.next_word));
    if (starts.length === 0) return null;

    const first = weightedPick(starts, 'next_word');
    const maxLength = 4 + Math.floor(Math.random() * 8);
    const words = this.walk(START_TOKEN, first, [first], maxLength);
    return { words, phrase: finish(words, this.getPunctuation(false)), score: scoreWords(words, false) };
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
