'use strict';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const WEEKDAY_INDEX = Object.freeze({ Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 });
// A runaway session (for example an unmatched join from years ago) must not
// turn a profile request into millions of heatmap slices.
const MAX_HOUR_SLICES = 200_000;

const formatterCache = new Map();

function resolveTimeZone(timeZone) {
  const candidate = String(timeZone || '').trim() || 'UTC';
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: candidate }).format();
    return candidate;
  } catch {
    return 'UTC';
  }
}

function localPartsFormatter(timeZone) {
  if (!formatterCache.has(timeZone)) {
    formatterCache.set(timeZone, new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      weekday: 'short',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    }));
  }
  return formatterCache.get(timeZone);
}

function localParts(timestampMs, timeZone) {
  const parts = {};
  for (const part of localPartsFormatter(timeZone).formatToParts(new Date(timestampMs))) {
    parts[part.type] = part.value;
  }
  const hour = Number(parts.hour) % 24;
  const localAsUtcMs = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), hour, Number(parts.minute), Number(parts.second));
  return {
    weekday: WEEKDAY_INDEX[parts.weekday] ?? 0,
    hour,
    dayKey: `${parts.year}-${parts.month}-${parts.day}`,
    offsetMs: localAsUtcMs - Math.floor(timestampMs / 1000) * 1000
  };
}

// Intl formatting is by far the slowest step, so the UTC offset of every UTC
// day is remembered across requests. A day whose offset is the same at both
// ends has no DST change inside it; on a changeover day every slice gets a
// fresh lookup (changes happen on local hour marks, so a slice never
// straddles one).
const MAX_CACHED_OFFSET_DAYS = 50_000;
const dayOffsetCache = new Map();

function createOffsetResolver(timeZone) {
  if (!dayOffsetCache.has(timeZone)) dayOffsetCache.set(timeZone, new Map());
  const days = dayOffsetCache.get(timeZone);
  return timestampMs => {
    const utcDay = Math.floor(timestampMs / DAY_MS);
    let offsetMs = days.get(utcDay);
    if (offsetMs === undefined) {
      const startOffset = localParts(utcDay * DAY_MS, timeZone).offsetMs;
      offsetMs = localParts((utcDay + 1) * DAY_MS, timeZone).offsetMs === startOffset ? startOffset : null;
      if (days.size >= MAX_CACHED_OFFSET_DAYS) days.clear();
      days.set(utcDay, offsetMs);
    }
    return offsetMs ?? localParts(timestampMs, timeZone).offsetMs;
  };
}

function dayNumber(dayKey) {
  const [year, month, day] = dayKey.split('-').map(Number);
  return Math.round(Date.UTC(year, month - 1, day) / DAY_MS);
}

// Day 0 (1970-01-01) was a Thursday; weekdays are Monday-based.
function weekdayOfDayNumber(day) {
  return ((day + 3) % 7 + 7) % 7;
}

function streakStats(days, today) {
  const sorted = [...days].sort((first, second) => first - second);
  let longest = 0;
  let run = 0;
  let previous = null;
  for (const day of sorted) {
    run = previous != null && day === previous + 1 ? run + 1 : 1;
    longest = Math.max(longest, run);
    previous = day;
  }

  // A streak stays alive through today until the day ends without a session.
  let cursor = days.has(today) ? today : today - 1;
  let current = 0;
  while (days.has(cursor)) {
    current += 1;
    cursor -= 1;
  }
  return { current, longest };
}

// How many times each weekday occurred from the first observed local day to
// today, inclusive: the denominator for "online on N of M Mondays".
function weekdayOccurrences(firstDay, today) {
  const counts = Array(7).fill(0);
  if (firstDay == null || today < firstDay) return counts;
  const total = today - firstDay + 1;
  const fullWeeks = Math.floor(total / 7);
  counts.fill(fullWeeks);
  for (let offset = 0; offset < total % 7; offset += 1) {
    counts[weekdayOfDayNumber(firstDay + fullWeeks * 7 + offset)] += 1;
  }
  return counts;
}

function normalizedSessions(sessions, nowMs) {
  const list = [];
  for (const session of Array.isArray(sessions) ? sessions : []) {
    const startMs = new Date(session?.startedAt).getTime();
    const endMs = Math.min(nowMs, session?.endedAt == null ? nowMs : new Date(session.endedAt).getTime());
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) continue;
    list.push({ startMs, endMs, isCurrent: Boolean(session.isCurrent) });
  }
  return list.sort((first, second) => first.startMs - second.startMs || first.endMs - second.endMs);
}

function buildPlayerActivityPattern(sessions = [], { timeZone = 'UTC', now = new Date() } = {}) {
  const zone = resolveTimeZone(timeZone);
  const nowMs = new Date(now).getTime();
  const offsetAt = createOffsetResolver(zone);
  const heatmap = Array.from({ length: 7 }, () => Array(24).fill(0));
  const heatmapDays = Array.from({ length: 7 }, () => Array(24).fill(0));
  const seenDayHours = new Set();
  const activeDays = new Set();
  let completedCount = 0;
  let completedSeconds = 0;
  let longestSession = null;
  let coveredUntil = -Infinity;
  let slices = 0;

  const ordered = normalizedSessions(sessions, nowMs);
  const firstObservedAt = ordered.length ? ordered[0].startMs : null;
  const heatmapRanges = [];
  for (const session of ordered) {
    const durationSeconds = Math.floor((session.endMs - session.startMs) / 1000);
    if (!session.isCurrent) {
      completedCount += 1;
      completedSeconds += durationSeconds;
    }
    if (!longestSession || durationSeconds > longestSession.durationSeconds) {
      longestSession = {
        startedAt: new Date(session.startMs).toISOString(),
        durationSeconds,
        isCurrent: session.isCurrent
      };
    }
    // Overlapping records (a stale live-session start, duplicated joins) must
    // not count the same minutes twice.
    const startMs = Math.max(session.startMs, coveredUntil);
    if (session.endMs > startMs) heatmapRanges.push([startMs, session.endMs]);
    coveredUntil = Math.max(coveredUntil, session.endMs);
  }

  // Walk newest first, so the slice budget keeps recent history intact.
  for (let index = heatmapRanges.length - 1; index >= 0; index -= 1) {
    const [startMs, endMs] = heatmapRanges[index];
    let cursor = startMs;
    while (cursor < endMs && slices < MAX_HOUR_SLICES) {
      const localMs = cursor + offsetAt(cursor);
      const sliceEnd = Math.min(endMs, cursor + HOUR_MS - (((localMs % HOUR_MS) + HOUR_MS) % HOUR_MS));
      const day = Math.floor(localMs / DAY_MS);
      const weekday = weekdayOfDayNumber(day);
      const hour = new Date(localMs).getUTCHours();
      heatmap[weekday][hour] += (sliceEnd - cursor) / 1000;
      const dayHourKey = day * 24 + hour;
      if (!seenDayHours.has(dayHourKey)) {
        seenDayHours.add(dayHourKey);
        heatmapDays[weekday][hour] += 1;
      }
      activeDays.add(day);
      cursor = sliceEnd;
      slices += 1;
    }
  }

  let peak = null;
  let maxCellSeconds = 0;
  heatmap.forEach((row, weekday) => row.forEach((seconds, hour) => {
    if (seconds > maxCellSeconds) {
      maxCellSeconds = seconds;
      peak = { weekday, hour };
    }
  }));
  const today = dayNumber(localParts(nowMs, zone).dayKey);
  const streaks = streakStats(activeDays, today);
  const firstDay = firstObservedAt == null ? null : Math.floor((firstObservedAt + offsetAt(firstObservedAt)) / DAY_MS);

  return {
    timeZone: zone,
    heatmap: heatmap.map(row => row.map(seconds => Math.round(seconds))),
    heatmapDays,
    weekdayCounts: weekdayOccurrences(firstDay, today),
    maxCellSeconds: Math.round(maxCellSeconds),
    peak,
    completedSessionCount: completedCount,
    averageSessionSeconds: completedCount ? Math.round(completedSeconds / completedCount) : 0,
    longestSession,
    activeDays: activeDays.size,
    currentStreakDays: streaks.current,
    longestStreakDays: streaks.longest,
    firstObservedAt: firstObservedAt == null ? null : new Date(firstObservedAt).toISOString()
  };
}

module.exports = { buildPlayerActivityPattern, resolveTimeZone };
