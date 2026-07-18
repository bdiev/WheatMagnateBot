'use strict';

function cleanMinecraftChatMessage(message) {
  return String(message || '')
    .replace(/(?:\u00a7|\u00c2\u00a7)[0-9a-fk-or]/gi, '')
    .replace(/[\u0000-\u0008\u000B-\u000C\u000E-\u001F\u007F]/g, '')
    .trim();
}

function splitMinecraftMessage(text, maxLength = 180) {
  if (!Number.isInteger(maxLength) || maxLength < 1) throw new RangeError('maxLength must be a positive integer.');
  const words = String(text || '').trim().split(/\s+/).filter(Boolean);
  const chunks = [];
  let current = '';
  for (const word of words) {
    if (word.length > maxLength) {
      if (current) chunks.push(current);
      current = '';
      for (let index = 0; index < word.length; index += maxLength) chunks.push(word.slice(index, index + maxLength));
      continue;
    }
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length > maxLength) {
      chunks.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function isPrivateMinecraftChatLine(text, botUsername = null) {
  const clean = cleanMinecraftChatMessage(text).replace(/\s+/g, ' ').trim();
  if (!clean) return false;
  const botName = botUsername ? escapeRegExp(botUsername) : '[A-Za-z0-9_]{1,16}';
  return [
    /^(?:from|to)\s+[A-Za-z0-9_]{1,16}\s*[:>»]/i,
    /^[A-Za-z0-9_]{1,16}\s+(?:whispers?|whispered|tells?|messages?|msgs?)\s+(?:to\s+)?(?:you|me)\s*[:>»]/i,
    /^(?:you|me)\s+(?:whisper|tell|message|msg)\s+(?:to\s+)?[A-Za-z0-9_]{1,16}\s*[:>»]/i,
    new RegExp(`^\\[?[A-Za-z0-9_]{1,16}\\s*(?:->|→)\\s*(?:you|me|${botName})\\]?\\s*:?`, 'i'),
    new RegExp(`^\\[?(?:you|me|${botName})\\s*(?:->|→)\\s*[A-Za-z0-9_]{1,16}\\]?\\s*:?`, 'i')
  ].some(pattern => pattern.test(clean));
}

module.exports = { cleanMinecraftChatMessage, isPrivateMinecraftChatLine, splitMinecraftMessage };
