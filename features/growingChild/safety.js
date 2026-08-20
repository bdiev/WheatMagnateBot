'use strict';

// Public child speech is intentionally stricter than ordinary chat:
// no digits, signs, separators or command prefixes can leave the module.
const SAFE_PUBLIC_PHRASE_RE = /^[\p{L}\s'’.,!?…-]+$/u;
const SAFE_WORD_RE = /^\p{L}+(?:['’]\p{L}+)*$/u;
const PUBLIC_IDENTITY_WORDS = new Set(['wheatmagnate', 'bdiev', 'oldfag', 'org']);
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

function getWordScript(word) {
  const value = String(word || '');
  if (/\p{Script=Latin}/u.test(value)) return 'latin';
  if (/\p{Script=Cyrillic}/u.test(value)) return 'cyrillic';
  return 'other';
}

function hasMixedLatinCyrillicWords(words) {
  const scripts = new Set();
  for (const word of words) {
    const script = getWordScript(word);
    if (script === 'latin' || script === 'cyrillic') scripts.add(script);
  }
  return scripts.size > 1;
}

function sanitizePublicPhrase(phrase) {
  const value = String(phrase || '').replace(/\s+/g, ' ').trim();
  if (!value || value.startsWith('/') || value.startsWith('!')) return null;
  if (/\d/u.test(value)) return null;
  const syntaxValue = value.replace(/\bbdiev_\b/giu, 'bdiev');
  if (!SAFE_PUBLIC_PHRASE_RE.test(syntaxValue)) return null;
  const words = value.toLocaleLowerCase().match(/\p{L}+(?:['’]\p{L}+)*/gu) || [];
  if (words.some(word => NUMBER_WORDS.has(word))) return null;
  if (hasMixedLatinCyrillicWords(words.filter(word => !PUBLIC_IDENTITY_WORDS.has(word)))) return null;
  return value.slice(0, 220).trim() || null;
}

module.exports = {
  hasMixedLatinCyrillicWords,
  isSafePublicWord,
  sanitizePublicPhrase
};
