'use strict';

const {
  parseJoinDateResponse,
  parseLastSeenResponse,
  parseMessagesResponse,
  parsePlaytimeResponse
} = require('../features/playerInfoObservation');

const DEFAULT_PLAYTIME_LOOKUP_CHANNEL_ID = '1340779371698589696';
const DEFAULT_PLAYTIME_LOOKUP_BOT_NAME = 'LolRiTTeRBotAPP';
const DEFAULT_PLAYTIME_LOOKUP_TTL_MS = 5 * 60_000;

function normalizeDiscordName(value) {
  return String(value || '').replace(/[^A-Za-z0-9]/g, '').toLowerCase();
}

function discordBotNameVariants(value) {
  const normalized = normalizeDiscordName(value);
  if (!normalized) return [];
  return normalized.endsWith('app')
    ? [normalized, normalized.slice(0, -3)]
    : [normalized, `${normalized}app`];
}

function parseDiscordPlaytimeCommand(value) {
  const match = String(value || '').trim().match(/^!(pt|jd|seen|messages)\s+([A-Za-z0-9_]{1,32})$/i);
  if (!match) return null;
  const prefix = match[1].toLowerCase();
  const metric = prefix === 'pt'
    ? 'playtime'
    : prefix === 'jd' ? 'joinDate' : prefix === 'seen' ? 'lastSeen' : 'messages';
  return { metric,username:match[2],command:`!${prefix} ${match[2]}` };
}

function discordMessageText(message) {
  const parts = [String(message?.content || '').trim()];
  for (const embed of message?.embeds || []) {
    parts.push(String(embed?.description || '').trim());
    for (const field of embed?.fields || []) parts.push(String(field?.value || '').trim());
  }
  return parts.filter(Boolean).join('\n');
}

function parseDiscordPlaytimeResponse(message, parsePlaytime) {
  for (const line of discordMessageText(message).split(/\r?\n/).map(value => value.trim()).filter(Boolean)) {
    const parsed = parsePlaytimeResponse(line, parsePlaytime);
    if (parsed) return parsed;
  }
  return null;
}

function parseDiscordPlayerInfoResponses(message, parsePlaytime, now = () => Date.now()) {
  const responses = [];
  for (const line of discordMessageText(message).split(/\r?\n/).map(value => value.trim()).filter(Boolean)) {
    const candidates = [
      ['messages', parseMessagesResponse(line)],
      ['joinDate', parseJoinDateResponse(line)],
      ['lastSeen', parseLastSeenResponse(line, new Date(now()))],
      ['playtime', parsePlaytimeResponse(line, parsePlaytime)]
    ];
    for (const [metric, parsed] of candidates) {
      if (parsed) responses.push({ metric,...parsed });
    }
  }
  return responses;
}

function isTrustedPlaytimeBot(message, { botId = '', botName = DEFAULT_PLAYTIME_LOOKUP_BOT_NAME } = {}) {
  if (!message?.author?.bot) return false;
  const configuredId = String(botId || '').trim();
  if (configuredId) return String(message.author.id || '') === configuredId;
  const expected = new Set(discordBotNameVariants(botName));
  if (!expected.size) return false;
  return [
    message.author.username,
    message.author.globalName,
    message.member?.displayName
  ].flatMap(discordBotNameVariants).some(value => expected.has(value));
}

function createDiscordPlaytimeImport({
  channelId = DEFAULT_PLAYTIME_LOOKUP_CHANNEL_ID,
  botId = '',
  botName = DEFAULT_PLAYTIME_LOOKUP_BOT_NAME,
  parsePlaytime,
  savePlaytime,
  saveMetric,
  onImported = async () => {},
  now = () => Date.now(),
  ttlMs = DEFAULT_PLAYTIME_LOOKUP_TTL_MS
} = {}) {
  if (typeof parsePlaytime !== 'function') throw new TypeError('parsePlaytime is required');
  if (typeof saveMetric !== 'function' && typeof savePlaytime !== 'function') {
    throw new TypeError('saveMetric is required');
  }
  const persistMetric = typeof saveMetric === 'function'
    ? saveMetric
    : (metric, username, observedValue) => {
      if (metric !== 'playtime' || typeof savePlaytime !== 'function') throw new TypeError('saveMetric is required');
      return savePlaytime(username, observedValue);
    };
  const pending = new Map();
  const lookupChannelId = String(channelId || '').trim();

  function prune() {
    const cutoff = now() - Math.max(1_000, Number(ttlMs) || DEFAULT_PLAYTIME_LOOKUP_TTL_MS);
    for (const [key, item] of pending) {
      if (item.requestedAt < cutoff) pending.delete(key);
    }
  }

  async function handle(message) {
    if (!lookupChannelId || String(message?.channel?.id || '') !== lookupChannelId) return false;
    prune();

    if (!message.author?.bot) {
      const request = parseDiscordPlaytimeCommand(message.content);
      if (!request) return false;
      pending.set(`${request.metric}:${request.username.toLowerCase()}`, {
        ...request,
        requestedAt:now(),
        requestedBy:message.author?.username || null,
        processing:false
      });
      return true;
    }

    if (!isTrustedPlaytimeBot(message, { botId,botName })) return false;
    const responses = parseDiscordPlayerInfoResponses(message, parsePlaytime, now);
    const response = responses.find(candidate => pending.has(`${candidate.metric}:${candidate.targetUsername.toLowerCase()}`));
    if (!response) return false;
    const key = `${response.metric}:${response.targetUsername.toLowerCase()}`;
    const request = pending.get(key);
    if (!request || request.processing) return false;
    request.processing = true;

    try {
      const result = await persistMetric(response.metric, response.targetUsername, response.observedValue);
      if (!result || result.error) throw new Error(result?.error || 'Player information update failed.');
      pending.delete(key);
      await onImported({
        metric:response.metric,
        username:result.username || response.targetUsername,
        requestedUsername:request.username,
        requestedBy:request.requestedBy,
        observedValue:response.observedValue,
        ...(response.metric === 'playtime' ? { totalSeconds:response.observedValue } : {}),
        sourceMessageId:message.id || null
      });
      return true;
    } catch (error) {
      request.processing = false;
      throw error;
    }
  }

  return { handle, pending };
}

module.exports = {
  DEFAULT_PLAYTIME_LOOKUP_BOT_NAME,
  DEFAULT_PLAYTIME_LOOKUP_CHANNEL_ID,
  DEFAULT_PLAYTIME_LOOKUP_TTL_MS,
  createDiscordPlaytimeImport,
  discordBotNameVariants,
  discordMessageText,
  isTrustedPlaytimeBot,
  parseDiscordPlaytimeCommand,
  parseDiscordPlaytimeResponse,
  parseDiscordPlayerInfoResponses
};
