'use strict';

const { sanitizePublicPhrase, isSafePublicWord } = require('./safety');

const APOSTROPHE_CHARS = "'\u2019";
const WORD_RE = new RegExp(`[\\p{L}]+(?:[${APOSTROPHE_CHARS}][\\p{L}]+)*`, 'gu');

const GRAMMAR_WORDS = Object.freeze([
  'a', 'am', 'an', 'and', 'are', 'as', 'at', 'be', 'but', 'can', 'could', 'did',
  'do', 'does', 'for', 'from', 'had', 'has', 'have', 'he', 'her', 'here', 'him',
  'his', 'how', 'i', 'if', 'in', 'is', 'it', 'me', 'my', 'no', 'not', 'of', 'on',
  'or', 'our', 'she', 'should', 'so', 'some', 'that', 'the', 'their', 'them',
  'there', 'they', 'this', 'to', 'was', 'we', 'were', 'what', 'when', 'where',
  'who', 'why', 'will', 'with', 'would', 'yes', 'you', 'your'
]);

function tokenizePhrase(value) {
  return String(value || '').toLocaleLowerCase().match(WORD_RE) || [];
}

function extractCandidatePhrases(value) {
  return String(value || '')
    .split(/\r?\n|[\u2022*-]\s+/u)
    .map(line => line
      .replace(/^\s*(?:\d+[\).:-]\s*)/u, '')
      .replace(/^["'`]+|["'`]+$/g, '')
      .replace(/\s+/g, ' ')
      .trim())
    .filter(Boolean);
}

function isGenericPhrase(words) {
  return [
    'what is this',
    'what is that',
    'i do not know',
    'i dont know',
    'i am here',
    'hello there',
    'how are you'
  ].includes(words.join(' '));
}

function validateAIGeneratedPhrase({
  phrase,
  learnedWords,
  requiredWords = [],
  minRequiredWords = requiredWords.length,
  isTooSimilar
}) {
  const safePhrase = sanitizePublicPhrase(
    String(phrase || '')
      .replace(/^["'`]+|["'`]+$/g, '')
      .replace(/\s+/g, ' ')
      .trim()
  );
  if (!safePhrase) return null;

  const learned = new Set(learnedWords.map(word => String(word).toLocaleLowerCase()));
  const grammar = new Set(GRAMMAR_WORDS);
  const required = new Set(requiredWords.map(word => String(word).toLocaleLowerCase()));
  const contentWords = new Set([...learned].filter(word => !grammar.has(word)));
  const allowed = new Set([...learned, ...grammar]);
  const words = tokenizePhrase(safePhrase);
  const usedWords = new Set(words);
  const requiredUsed = [...required].filter(word => usedWords.has(word)).length;

  if (words.length < 3 || words.length > 12) return null;
  if (words.some(word => !isSafePublicWord(word) || !allowed.has(word))) return null;
  if (!words.some(word => contentWords.has(word))) return null;
  if (required.size > 0 && requiredUsed < Math.min(required.size, minRequiredWords)) return null;
  if (isGenericPhrase(words)) return null;
  if (words.some((word, index) => index > 0 && word === words[index - 1])) return null;
  if (typeof isTooSimilar === 'function' && isTooSimilar(words)) return null;
  return safePhrase;
}

module.exports = {
  GRAMMAR_WORDS,
  extractCandidatePhrases,
  tokenizePhrase,
  validateAIGeneratedPhrase
};
