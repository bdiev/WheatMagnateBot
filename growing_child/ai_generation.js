'use strict';

const { sanitizePublicPhrase, isSafePublicWord } = require('./safety');

const GRAMMAR_WORDS = Object.freeze([
  'a', 'am', 'an', 'and', 'are', 'as', 'at', 'be', 'but', 'can', 'could', 'did',
  'do', 'does', 'for', 'from', 'had', 'has', 'have', 'he', 'her', 'here', 'him',
  'his', 'how', 'i', 'if', 'in', 'is', 'it', 'me', 'my', 'no', 'not', 'of', 'on',
  'or', 'our', 'she', 'should', 'so', 'some', 'that', 'the', 'their', 'them',
  'there', 'they', 'this', 'to', 'was', 'we', 'were', 'what', 'when', 'where',
  'who', 'why', 'will', 'with', 'would', 'yes', 'you', 'your'
]);

function tokenizePhrase(value) {
  return String(value || '').toLocaleLowerCase().match(/\p{L}+(?:['’]\p{L}+)*/gu) || [];
}

function validateAIGeneratedPhrase({ phrase, learnedWords, isTooSimilar }) {
  const safePhrase = sanitizePublicPhrase(
    String(phrase || '')
      .replace(/^["'`]+|["'`]+$/g, '')
      .replace(/\s+/g, ' ')
      .trim()
  );
  if (!safePhrase) return null;

  const learned = new Set(learnedWords.map(word => String(word).toLocaleLowerCase()));
  const allowed = new Set([...learned, ...GRAMMAR_WORDS]);
  const words = tokenizePhrase(safePhrase);

  if (words.length < 3 || words.length > 12) return null;
  if (words.some(word => !isSafePublicWord(word) || !allowed.has(word))) return null;
  if (!words.some(word => learned.has(word))) return null;
  if (isTooSimilar(words)) return null;
  return safePhrase;
}

module.exports = { GRAMMAR_WORDS, tokenizePhrase, validateAIGeneratedPhrase };
