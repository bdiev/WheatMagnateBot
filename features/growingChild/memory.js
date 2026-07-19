'use strict';

const SECRET_RE = /(?:\b(?:password|passwd|secret|token|api[_ -]?key|private[_ -]?key|seed phrase|recovery code|credit card|cvv|passport|social security)\b|(?:^|[^\p{L}])(?:парол[ья]|секрет|токен|api[_ -]?ключ|приватн(?:ый|ого) ключ|сид фраза|код восстановления|банковск(?:ая|ой) карт[аы]|паспорт)(?=$|[^\p{L}]))/iu;
const PII_RE = /(?:https?:\/\/|www\.|[\w.+-]+@[\w.-]+\.[a-z]{2,}|\b(?:\d[ -]?){7,}\d\b|\b\d{1,3}(?:\.\d{1,3}){3}\b|\b-?\d{2,7}[, ]+-?\d{2,7}\b)/iu;

function containsSensitiveData(value) {
  const text = String(value || '');
  return SECRET_RE.test(text) || PII_RE.test(text);
}

function cleanFactValue(value) {
  const clean = String(value || '').replace(/[^\p{L}\p{N}_' -]/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, 120);
  if (!clean || containsSensitiveData(clean)) return null;
  return clean;
}

function expiry(config, days = null) {
  const ttl = Math.max(1, Number(days) || config.memoryDefaultTtlDays || 180);
  return new Date(Date.now() + ttl * 86_400_000).toISOString();
}

function extractMemories(context, config) {
  const text = String(context.text || '').replace(/\s+/g, ' ').trim();
  if (!text || containsSensitiveData(text) || !context.authorId) return [];
  const base = {
    subjectSource: String(context.source), subjectId: String(context.authorId),
    subjectName: String(context.authorName || context.authorId).slice(0, 64),
    sourceType: 'user_statement', sourceRef: context.messageId ? String(context.messageId) : null,
    expiresAt: expiry(config)
  };
  const facts = [];
  const add = (kind, factKey, factValue, confidence) => {
    const value = cleanFactValue(factValue);
    if (value) facts.push({ ...base, kind, factKey, factValue: value, confidence });
  };

  let match = text.match(/\b(?:actually,?\s+)?I\s+(?:really\s+)?(like|love|prefer|dislike|hate)\s+([\p{L}\p{N}_' -]{2,80})[.!?]?$/iu);
  if (match) add('preference', ['dislike', 'hate'].includes(match[1].toLowerCase()) ? 'dislikes' : 'likes', match[2], 0.9);
  match = text.match(/\bmy\s+favorite\s+([\p{L} ]{2,30})\s+is\s+([\p{L}\p{N}_' -]{2,80})[.!?]?$/iu);
  if (match) add('preference', `favorite:${cleanFactValue(match[1])?.toLowerCase()}`, match[2], 0.95);
  match = text.match(/\b(?:my\s+friend\s+is|I\s+am\s+friends\s+with)\s+([A-Za-z0-9_]{1,32})\b/iu);
  if (match) add('relationship', `friend:${match[1].toLowerCase()}`, match[1], 0.85);
  match = text.match(/\bI\s+(?:usually\s+)?play\s+([\p{L}\p{N}_' -]{2,60})[.!?]?$/iu);
  if (match) add('user_fact', 'plays', match[1], 0.8);
  match = text.match(/\bwe\s+(finished|completed|won|built|started)\s+([\p{L}\p{N}_' -]{2,90})[.!?]?$/iu);
  if (match) add('important_event', `${match[1].toLowerCase()}:${new Date().toISOString().slice(0, 10)}`, `${match[1]} ${match[2]}`, 0.75);
  return facts;
}

function parseForgetRequest(text) {
  const clean = String(text || '').trim();
  if (/^(?:please\s+)?forget\s+(?:everything\s+about\s+)?me[.!?]?$/iu.test(clean)) return { type: 'user' };
  const fact = clean.match(/^(?:please\s+)?forget\s+(?:fact\s+)?#?(\d+)[.!?]?$/iu);
  return fact ? { type: 'fact', id: Number(fact[1]) } : null;
}

module.exports = { containsSensitiveData, extractMemories, parseForgetRequest, cleanFactValue };
