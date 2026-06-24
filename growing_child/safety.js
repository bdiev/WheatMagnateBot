'use strict';

// Public child speech is intentionally stricter than ordinary chat:
// no digits, signs, separators or command prefixes can leave the module.
const SAFE_PUBLIC_PHRASE_RE = /^[\p{L}\s'’.,!?…-]+$/u;
const SAFE_WORD_RE = /^\p{L}+(?:['’]\p{L}+)*$/u;
const NUMBER_WORDS = new Set([
  'zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine',
  'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen',
  'seventeen', 'eighteen', 'nineteen', 'twenty', 'thirty', 'forty', 'fifty',
  'sixty', 'seventy', 'eighty', 'ninety', 'hundred', 'thousand', 'million', 'minus',
  'ноль', 'один', 'одна', 'одно', 'два', 'две', 'три', 'четыре', 'пять', 'шесть',
  'семь', 'восемь', 'девять', 'десять', 'одиннадцать', 'двенадцать', 'тринадцать',
  'четырнадцать', 'пятнадцать', 'шестнадцать', 'семнадцать', 'восемнадцать',
  'девятнадцать', 'двадцать', 'тридцать', 'сорок', 'пятьдесят', 'шестьдесят',
  'семьдесят', 'восемьдесят', 'девяносто', 'сто', 'сотня', 'тысяча', 'тысяч',
  'миллион', 'минус'
]);

function isSafePublicWord(word) {
  const normalized = String(word || '').toLocaleLowerCase();
  return SAFE_WORD_RE.test(normalized) && !NUMBER_WORDS.has(normalized);
}

function sanitizePublicPhrase(phrase) {
  const value = String(phrase || '').replace(/\s+/g, ' ').trim();
  if (!value || value.startsWith('/') || value.startsWith('!')) return null;
  if (/\d/u.test(value)) return null;
  if (!SAFE_PUBLIC_PHRASE_RE.test(value)) return null;
  const words = value.toLocaleLowerCase().match(/\p{L}+(?:['’]\p{L}+)*/gu) || [];
  if (words.some(word => NUMBER_WORDS.has(word))) return null;
  return value.slice(0, 220).trim() || null;
}

module.exports = { isSafePublicWord, sanitizePublicPhrase };
