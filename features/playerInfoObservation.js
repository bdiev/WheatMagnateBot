'use strict';

const PREFERRED_SOURCE = 'lolritterbot';
const FALLBACK_SOURCE = 'moooomoooo';
const DEFAULT_LOOKUP_TTL_MS = 20_000;
const DEFAULT_FALLBACK_GRACE_MS = 2_500;

function normalizeUsername(value) {
  const username = String(value || '').trim();
  return /^[A-Za-z0-9_]{1,32}$/.test(username) ? username : '';
}

function parseNumericJoinDate(value) {
  const match = String(value || '').trim().match(
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2}):(\d{2})\b/
  );
  if (!match) return null;
  const [, month, day, year, hour, minute, second] = match.map(Number);
  const date = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  if (
    !Number.isFinite(date.getTime()) ||
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day ||
    date.getUTCHours() !== hour ||
    date.getUTCMinutes() !== minute ||
    date.getUTCSeconds() !== second
  ) {
    return null;
  }
  return date;
}

function parseNamedJoinDate(value) {
  const match = String(value || '').trim().match(
    /^I first saw\s+([A-Za-z0-9_]{1,32})\b[\s\S]*?\bon\s+([A-Za-z]{3,9})\s+(\d{1,2})(?:st|nd|rd|th)?,\s+(\d{4})\.?$/i
  );
  if (!match) return null;
  const months = {
    jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2,
    apr: 3, april: 3, may: 4, jun: 5, june: 5, jul: 6, july: 6,
    aug: 7, august: 7, sep: 8, sept: 8, september: 8,
    oct: 9, october: 9, nov: 10, november: 10, dec: 11, december: 11
  };
  const month = months[match[2].toLowerCase()];
  const day = Number(match[3]);
  const year = Number(match[4]);
  if (month == null) return null;
  const date = new Date(Date.UTC(year, month, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return { targetUsername: match[1], observedDate: date };
}

function parsePlaytimeResponse(message, parsePlaytime) {
  const match = String(message || '').trim().match(/^([A-Za-z0-9_]{1,32}):\s+([\s\S]+)$/);
  if (!match) return null;
  const observedSeconds = parsePlaytime(match[2]);
  if (!Number.isFinite(observedSeconds)) return null;
  return { targetUsername: match[1], observedValue: observedSeconds };
}

function parseJoinDateResponse(message) {
  const cleanMessage = String(message || '').trim();
  const named = parseNamedJoinDate(cleanMessage);
  if (named) {
    return { targetUsername: named.targetUsername, observedValue: named.observedDate };
  }

  const numeric = cleanMessage.match(/^([A-Za-z0-9_]{1,32}):\s+([\s\S]+)$/);
  if (!numeric) return null;
  const observedDate = parseNumericJoinDate(numeric[2]);
  if (!observedDate) return null;
  return { targetUsername: numeric[1], observedValue: observedDate };
}

function parseRelativeDurationMs(value) {
  const input = String(value || '').trim();
  if (!input) return null;
  const unitMilliseconds = {
    day: 86_400_000,
    days: 86_400_000,
    hour: 3_600_000,
    hours: 3_600_000,
    minute: 60_000,
    minutes: 60_000,
    second: 1_000,
    seconds: 1_000
  };
  const tokenPattern = /(\d+)\s+(days?|hours?|minutes?|seconds?)/gi;
  const seenUnits = new Set();
  let totalMilliseconds = 0;
  let tokenCount = 0;
  for (const match of input.matchAll(tokenPattern)) {
    const unit = match[2].toLowerCase().replace(/s$/, '');
    if (seenUnits.has(unit)) return null;
    seenUnits.add(unit);
    totalMilliseconds += Number(match[1]) * unitMilliseconds[match[2].toLowerCase()];
    tokenCount += 1;
  }
  const remainder = input
    .replace(tokenPattern, '')
    .replace(/\band\b/gi, '')
    .replace(/[\s,]+/g, '');
  return tokenCount > 0 && !remainder && Number.isSafeInteger(totalMilliseconds)
    ? totalMilliseconds
    : null;
}

function parseLastSeenResponse(message, now = new Date()) {
  const cleanMessage = String(message || '').trim();
  const match = cleanMessage.match(
    /^(?:I saw\s+([A-Za-z0-9_]{1,32})\s+|([A-Za-z0-9_]{1,32}):\s+)([\s\S]+?)\s+ago\.?$/i
  );
  if (!match) return null;
  const elapsedMilliseconds = parseRelativeDurationMs(match[3]);
  const observedAt = new Date(now);
  if (elapsedMilliseconds == null || !Number.isFinite(observedAt.getTime())) return null;
  observedAt.setTime(observedAt.getTime() - elapsedMilliseconds);
  return { targetUsername: match[1] || match[2], observedValue: observedAt };
}

function createPlayerInfoObservation({
  parsePlaytime,
  onPlaytime,
  onJoinDate,
  onLastSeen,
  isSourceOnline = () => false,
  now = () => Date.now(),
  setTimer = setTimeout,
  clearTimer = clearTimeout,
  lookupTtlMs = DEFAULT_LOOKUP_TTL_MS,
  fallbackGraceMs = DEFAULT_FALLBACK_GRACE_MS
}) {
  if (typeof parsePlaytime !== 'function') throw new TypeError('parsePlaytime is required');

  const lookups = {
    playtime: new Map(),
    joinDate: new Map(),
    lastSeen: new Map()
  };

  function cancelTimer(timer) {
    if (timer != null) clearTimer(timer);
  }

  function deleteLookup(type, targetKey, pending) {
    const lookup = lookups[type];
    if (lookup.get(targetKey) !== pending) return;
    cancelTimer(pending.fallbackTimer);
    cancelTimer(pending.expiryTimer);
    lookup.delete(targetKey);
  }

  function registerLookup(type, targetUsername, reason = 'chat') {
    const targetKey = targetUsername.toLowerCase();
    const lookup = lookups[type];
    const previous = lookup.get(targetKey);
    if (previous?.reason === 'site' && reason !== 'site') return previous;
    if (previous) deleteLookup(type, targetKey, previous);

    const pending = {
      targetUsername,
      reason,
      createdAt: now(),
      appliedSource: null,
      fallbackCandidate: null,
      fallbackTimer: null,
      expiryTimer: null
    };
    pending.expiryTimer = setTimer(() => deleteLookup(type, targetKey, pending), lookupTtlMs);
    pending.expiryTimer?.unref?.();
    lookup.set(targetKey, pending);
  }

  function applyCandidate(type, targetKey, pending, candidate) {
    if (candidate.source === FALLBACK_SOURCE && pending.appliedSource) return;
    const handler = type === 'playtime'
      ? onPlaytime
      : type === 'joinDate' ? onJoinDate : onLastSeen;
    handler?.(pending.targetUsername, candidate.observedValue, candidate.source, { reason: pending.reason });
    pending.appliedSource = candidate.source;
    deleteLookup(type, targetKey, pending);
  }

  function acceptCandidate(type, candidate) {
    const targetKey = candidate.targetUsername.toLowerCase();
    const pending = lookups[type].get(targetKey);
    if (!pending) return false;
    if (now() - pending.createdAt > lookupTtlMs) {
      deleteLookup(type, targetKey, pending);
      return false;
    }

    if (candidate.source === PREFERRED_SOURCE) {
      applyCandidate(type, targetKey, pending, candidate);
      return true;
    }

    if (pending.appliedSource === PREFERRED_SOURCE) return false;
    pending.fallbackCandidate = candidate;
    if (!isSourceOnline(PREFERRED_SOURCE)) {
      applyCandidate(type, targetKey, pending, candidate);
      return true;
    }

    if (pending.fallbackTimer == null) {
      pending.fallbackTimer = setTimer(() => {
        pending.fallbackTimer = null;
        if (lookups[type].get(targetKey) !== pending || !pending.fallbackCandidate) return;
        applyCandidate(type, targetKey, pending, pending.fallbackCandidate);
      }, fallbackGraceMs);
      pending.fallbackTimer?.unref?.();
    }
    return true;
  }

  function observe(username, message) {
    const speaker = normalizeUsername(username);
    const cleanMessage = String(message || '').replace(/\u00a7[0-9a-fk-or]/gi, '').trim();
    if (!speaker || !cleanMessage) return false;

    const playtimeCommand = cleanMessage.match(/^!(?:pt|playtime)(?:\s+([A-Za-z0-9_]{1,32}))?$/i);
    if (playtimeCommand) {
      registerLookup('playtime', playtimeCommand[1] || speaker);
      return true;
    }

    const joinDateCommand = cleanMessage.match(/^!(?:jd|joindate)(?:\s+([A-Za-z0-9_]{1,32}))?$/i);
    if (joinDateCommand) {
      registerLookup('joinDate', joinDateCommand[1] || speaker);
      return true;
    }

    const lastSeenCommand = cleanMessage.match(/^!seen(?:\s+([A-Za-z0-9_]{1,32}))?$/i);
    if (lastSeenCommand) {
      registerLookup('lastSeen', lastSeenCommand[1] || speaker);
      return true;
    }

    const source = speaker.toLowerCase();
    if (source !== PREFERRED_SOURCE && source !== FALLBACK_SOURCE) return false;

    const playtimeResponse = parsePlaytimeResponse(cleanMessage, parsePlaytime);
    if (playtimeResponse) {
      return acceptCandidate('playtime', { ...playtimeResponse, source });
    }

    const joinDateResponse = parseJoinDateResponse(cleanMessage);
    if (joinDateResponse) {
      return acceptCandidate('joinDate', { ...joinDateResponse, source });
    }

    const lastSeenResponse = parseLastSeenResponse(cleanMessage, new Date(now()));
    if (lastSeenResponse) {
      return acceptCandidate('lastSeen', { ...lastSeenResponse, source });
    }
    return false;
  }

  function requestSiteRefresh(metric, targetUsername) {
    const username = normalizeUsername(targetUsername);
    const type = metric === 'playtime'
      ? 'playtime'
      : metric === 'joinDate' ? 'joinDate' : metric === 'lastSeen' ? 'lastSeen' : '';
    if (!username || !type) return false;
    registerLookup(type, username, 'site');
    return true;
  }

  function clear() {
    for (const [type, lookup] of Object.entries(lookups)) {
      for (const [targetKey, pending] of lookup.entries()) {
        deleteLookup(type, targetKey, pending);
      }
    }
  }

  return { observe, requestSiteRefresh, clear };
}

module.exports = {
  FALLBACK_SOURCE,
  PREFERRED_SOURCE,
  createPlayerInfoObservation,
  parseJoinDateResponse,
  parseLastSeenResponse,
  parseNumericJoinDate,
  parseRelativeDurationMs,
  parsePlaytimeResponse
};
