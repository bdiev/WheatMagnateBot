'use strict';

const WORD_RE = /[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu;
const EMOJI_RE = /\p{Extended_Pictographic}/gu;
const GREETING_RE = /\b(?:hello|hi|hey|yo|привет|здравствуй|здравствуйте|дарова)\b/iu;
const COURTESY_RE = /\b(?:please|thanks|thank you|pls|thx|пожалуйста|спасибо|плиз)\b/iu;

function analyzeMessageStyle(value) {
  const text = String(value || '').trim();
  const words = text.match(WORD_RE) || [];
  const letters = text.match(/\p{L}/gu) || [];
  const uppercase = text.match(/\p{Lu}/gu) || [];
  const cyrillic = text.match(/\p{Script=Cyrillic}/gu) || [];
  const latin = text.match(/\p{Script=Latin}/gu) || [];
  return {
    words: words.length,
    characters: text.length,
    short: words.length > 0 && words.length <= 4 ? 1 : 0,
    question: /\?/u.test(text) ? 1 : 0,
    exclamation: /!/u.test(text) ? 1 : 0,
    emoji: (text.match(EMOJI_RE) || []).length > 0 ? 1 : 0,
    uppercase: letters.length >= 3 && uppercase.length / letters.length >= 0.6 ? 1 : 0,
    greeting: GREETING_RE.test(text) ? 1 : 0,
    courtesy: COURTESY_RE.test(text) ? 1 : 0,
    cyrillic: cyrillic.length,
    latin: latin.length
  };
}

function ratio(value, total) {
  return total > 0 ? Number(value || 0) / total : 0;
}

function presentPlayerStyle(row) {
  if (!row) return null;
  const messages = Math.max(1, Number(row.messages_seen) || 0);
  const averageWords = Number(row.total_words || 0) / messages;
  const detectedLength = averageWords <= 4 ? 'short' : averageWords >= 11 ? 'detailed' : 'balanced';
  const detectedTone = ratio(row.exclamation_messages, messages) >= 0.3
    ? 'energetic'
    : ratio(row.courtesy_messages, messages) >= 0.25
      ? 'friendly'
      : ratio(row.question_messages, messages) >= 0.45 ? 'helpful' : 'casual';
  const language = Number(row.cyrillic_characters || 0) > Number(row.latin_characters || 0)
    ? 'Russian'
    : Number(row.latin_characters || 0) > 0 ? 'English' : 'unknown';
  const responseLength = row.admin_length && row.admin_length !== 'auto'
    ? row.admin_length
    : detectedLength;
  const tone = row.admin_tone && row.admin_tone !== 'auto' ? row.admin_tone : detectedTone;
  const signals = [];
  if (ratio(row.question_messages, messages) >= 0.35) signals.push('often asks questions');
  if (ratio(row.exclamation_messages, messages) >= 0.25) signals.push('uses expressive punctuation');
  if (ratio(row.emoji_messages, messages) >= 0.2) signals.push('uses emoji');
  if (ratio(row.greeting_messages, messages) >= 0.2) signals.push('usually greets first');
  if (ratio(row.courtesy_messages, messages) >= 0.2) signals.push('uses polite language');
  if (ratio(row.uppercase_messages, messages) >= 0.2) signals.push('sometimes types in uppercase');
  return {
    source: row.source,
    subjectId: row.subject_id,
    subjectName: row.subject_name,
    messagesSeen: Number(row.messages_seen) || 0,
    averageWords: Number(averageWords.toFixed(1)),
    language,
    detectedTone,
    detectedLength,
    tone,
    responseLength,
    adminTone: row.admin_tone || 'auto',
    adminLength: row.admin_length || 'auto',
    adminNotes: row.admin_notes || '',
    signals,
    updatedAt: row.updated_at
  };
}

module.exports = { analyzeMessageStyle, presentPlayerStyle };
