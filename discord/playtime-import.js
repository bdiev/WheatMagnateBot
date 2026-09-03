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

function appendDiscordComponentText(component, parts, depth = 0) {
  if (!component || depth > 8) return;
  const data = component.data && typeof component.data === 'object' ? component.data : component;
  for (const key of ['content', 'title', 'description', 'name', 'label', 'value']) {
    if (typeof data[key] === 'string') parts.push(data[key].trim());
  }
  const children = component.components || data.components || component.items || data.items || [];
  for (const child of children) appendDiscordComponentText(child, parts, depth + 1);
}

function discordMessageText(message) {
  const parts = [String(message?.content || '').trim()];
  for (const embed of message?.embeds || []) {
    parts.push(String(embed?.author?.name || '').trim());
    parts.push(String(embed?.title || '').trim());
    parts.push(String(embed?.description || '').trim());
    for (const field of embed?.fields || []) {
      parts.push(String(field?.name || '').trim());
      parts.push(String(field?.value || '').trim());
    }
    parts.push(String(embed?.footer?.text || '').trim());
  }
  for (const component of message?.components || []) appendDiscordComponentText(component, parts);
  return parts.filter(Boolean).join('\n');
}

function cleanDiscordFormatting(value) {
  return String(value || '')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    // Underscores are valid Minecraft username characters and must survive
    // Discord markdown cleanup (for example 0000001_Armorbar).
    .replace(/[*~`|]/g, '')
    .replace(/\\_/g, '_')
    .trim();
}

function parseDiscordMessageStatistics(message) {
  const text = cleanDiscordFormatting(discordMessageText(message));
  const title = text.match(/\bMessage statistics for\s+([A-Za-z0-9_]{1,32})\b/i);
  if (!title) return null;
  const total = text.slice(title.index + title[0].length).match(/\bTotal messages\s+([\d,]+)\b/i);
  if (!total) return null;
  const observedValue = Number(total[1].replace(/,/g, ''));
  if (!Number.isSafeInteger(observedValue) || observedValue <= 0) return null;
  return { targetUsername:title[1],observedValue };
}

function isDiscordUserNotFound(message) {
  return discordMessageText(message)
    .split(/\r?\n/)
    .map(cleanDiscordFormatting)
    .some(line => /^User not found[.!]?$/i.test(line));
}

function parseDiscordNullJoinDateResponse(message) {
  for (const line of discordMessageText(message).split(/\r?\n/).map(cleanDiscordFormatting)) {
    const match = line.match(/^([A-Za-z0-9_]{1,32}):\s*null\s*[.!]?$/i);
    if (match) return { targetUsername:match[1] };
  }
  return null;
}

function parseDiscordPlaytimeResponse(message, parsePlaytime) {
  for (const line of discordMessageText(message).split(/\r?\n/).map(value => value.trim()).filter(Boolean)) {
    const parsed = parsePlaytimeResponse(cleanDiscordFormatting(line), parsePlaytime);
    if (parsed) return parsed;
  }
  return null;
}

function parseDiscordPlayerInfoResponses(message, parsePlaytime, now = () => Date.now()) {
  const responses = [];
  const messageStatistics = parseDiscordMessageStatistics(message);
  if (messageStatistics) responses.push({ metric:'messages',...messageStatistics });
  for (const line of discordMessageText(message).split(/\r?\n/).map(value => value.trim()).filter(Boolean)) {
    const cleanLine = cleanDiscordFormatting(line);
    const candidates = [
      ['messages', parseMessagesResponse(cleanLine)],
      ['joinDate', parseJoinDateResponse(cleanLine)],
      ['lastSeen', parseLastSeenResponse(cleanLine, new Date(now()))],
      ['playtime', parsePlaytimeResponse(cleanLine, parsePlaytime)]
    ];
    for (const [metric, parsed] of candidates) {
      if (parsed) responses.push({ metric,...parsed });
    }
  }
  return responses;
}

function isDiscordApplicationMessage(message) {
  return Boolean(
    message?.author?.bot
    || message?.applicationId
    || message?.webhookId
    || message?.interaction
    || message?.interactionMetadata
  );
}

function isTrustedPlaytimeBot(message, { botId = '', botName = DEFAULT_PLAYTIME_LOOKUP_BOT_NAME } = {}) {
  if (!isDiscordApplicationMessage(message)) return false;
  const configuredId = String(botId || '').trim();
  const expected = new Set(discordBotNameVariants(botName));
  const nameMatches = [
    message.author.username,
    message.author.globalName,
    message.member?.displayName
  ].flatMap(discordBotNameVariants).some(value => expected.has(value));
  const idMatches = configuredId
    && [message.author?.id, message.applicationId].some(value => String(value || '') === configuredId);
  // Discord application webhooks may expose an application ID that differs
  // from the bot user ID copied in Developer Mode. Keep exact-name matching as
  // a fallback, but only for messages Discord identifies as application-owned.
  return Boolean(idMatches || (expected.size > 0 && nameMatches));
}

function isLookupChannel(message, channelId) {
  const expected = String(channelId || '').trim();
  if (!expected) return false;
  return [
    message?.channelId,
    message?.channel?.id,
    message?.channel?.parentId,
    message?.channel?.parent?.id
  ].some(value => String(value || '') === expected);
}

function createDiscordPlaytimeImport({
  channelId = DEFAULT_PLAYTIME_LOOKUP_CHANNEL_ID,
  botId = '',
  botName = DEFAULT_PLAYTIME_LOOKUP_BOT_NAME,
  parsePlaytime,
  savePlaytime,
  saveMetric,
  saveUnavailable,
  onImported = async () => {},
  onUnavailable = async () => {},
  onDiagnostic = async () => {},
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
  const processedResponses = new Map();
  let requestSequence = 0;
  const lookupChannelId = String(channelId || '').trim();

  function prune() {
    const cutoff = now() - Math.max(1_000, Number(ttlMs) || DEFAULT_PLAYTIME_LOOKUP_TTL_MS);
    for (const [key, item] of pending) {
      if (item.requestedAt < cutoff) pending.delete(key);
    }
    for (const [messageId, handledAt] of processedResponses) {
      if (handledAt < cutoff) processedResponses.delete(messageId);
    }
  }

  async function handle(message) {
    if (!isLookupChannel(message, lookupChannelId)) return false;
    prune();

    const trustedSource = isTrustedPlaytimeBot(message, { botId,botName });
    if (!trustedSource) {
      if (isDiscordApplicationMessage(message)) {
        await onDiagnostic({
          stage:'untrusted',
          messageId:message.id || null,
          authorId:message.author?.id || null,
          applicationId:message.applicationId || null,
          authorName:message.author?.username || null,
          pendingCount:pending.size
        });
        return false;
      }
      const request = parseDiscordPlaytimeCommand(message.content);
      if (!request) return false;
      pending.set(`${request.metric}:${request.username.toLowerCase()}`, {
        ...request,
        requestedAt:now(),
        requestedBy:message.author?.username || null,
        requestMessageId:message.id || null,
        channelId:message.channelId || message.channel?.id || null,
        sequence:++requestSequence,
        processing:false
      });
      await onDiagnostic({
        stage:'pending',
        metric:request.metric,
        username:request.username,
        messageId:message.id || null,
        requestedAt:now(),
        channel:message.channel || null
      });
      return true;
    }

    const responseMessageId = String(message.id || '');
    if (responseMessageId && processedResponses.has(responseMessageId)) return false;

    const nullJoinDate = parseDiscordNullJoinDateResponse(message);
    if (isDiscordUserNotFound(message) || nullJoinDate) {
      const referencedMessageId = String(message.reference?.messageId || message.reference?.message_id || '');
      const responseChannelId = String(message.channelId || message.channel?.id || '');
      const candidates = [...pending.values()]
        .filter(item => !item.processing)
        .filter(item => !nullJoinDate || (
          item.metric === 'joinDate'
          && item.username.toLowerCase() === nullJoinDate.targetUsername.toLowerCase()
        ))
        .sort((first, second) => second.requestedAt - first.requestedAt || second.sequence - first.sequence);
      const request = candidates.find(item => referencedMessageId && String(item.requestMessageId || '') === referencedMessageId)
        || candidates.find(item => responseChannelId && String(item.channelId || '') === responseChannelId)
        || candidates[0];
      if (!request || typeof saveUnavailable !== 'function') {
        await onDiagnostic({
          stage:nullJoinDate ? 'unmatched-null-join-date' : 'unmatched-not-found',
          messageId:message.id || null,
          pendingCount:pending.size
        });
        return false;
      }

      request.processing = true;
      try {
        const result = await saveUnavailable(request.username, {
          reason:nullJoinDate ? 'join_date_null' : 'user_not_found',
          metric:request.metric
        });
        if (!result || result.error) throw new Error(result?.error || 'Could not exclude unavailable player lookup.');
        for (const [key, item] of pending) {
          if (item.username.toLowerCase() === request.username.toLowerCase()) pending.delete(key);
        }
        if (responseMessageId) processedResponses.set(responseMessageId, now());
        await onUnavailable({
          username:result.username || request.username,
          requestedBy:request.requestedBy,
          metric:request.metric,
          reason:nullJoinDate ? 'join_date_null' : 'user_not_found',
          sourceMessageId:message.id || null
        });
        return true;
      } catch (error) {
        request.processing = false;
        throw error;
      }
    }

    const responses = parseDiscordPlayerInfoResponses(message, parsePlaytime, now);
    const response = responses.find(candidate => pending.has(`${candidate.metric}:${candidate.targetUsername.toLowerCase()}`));
    if (!response) {
      await onDiagnostic({
        stage:responses.length ? 'unmatched' : 'unparsed',
        messageId:message.id || null,
        responseCount:responses.length,
        responses:responses.map(candidate => ({ metric:candidate.metric,username:candidate.targetUsername })),
        pendingCount:pending.size
      });
      return false;
    }
    const key = `${response.metric}:${response.targetUsername.toLowerCase()}`;
    const request = pending.get(key);
    if (!request || request.processing) return false;
    request.processing = true;

    try {
      const result = await persistMetric(response.metric, response.targetUsername, response.observedValue);
      if (!result || result.error) throw new Error(result?.error || 'Player information update failed.');
      pending.delete(key);
      if (responseMessageId) processedResponses.set(responseMessageId, now());
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

  return { handle, pending,processedResponses };
}

module.exports = {
  DEFAULT_PLAYTIME_LOOKUP_BOT_NAME,
  DEFAULT_PLAYTIME_LOOKUP_CHANNEL_ID,
  DEFAULT_PLAYTIME_LOOKUP_TTL_MS,
  createDiscordPlaytimeImport,
  appendDiscordComponentText,
  discordBotNameVariants,
  discordMessageText,
  isTrustedPlaytimeBot,
  isDiscordApplicationMessage,
  isDiscordUserNotFound,
  isLookupChannel,
  parseDiscordNullJoinDateResponse,
  parseDiscordPlaytimeCommand,
  parseDiscordMessageStatistics,
  parseDiscordPlaytimeResponse,
  parseDiscordPlayerInfoResponses
};
