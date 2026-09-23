'use strict';

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEKDAY_INDEX = Object.freeze({ Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 });
// A runaway session (for example an unmatched join from years ago) must not
// turn a profile request into millions of timezone conversions.
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
  return {
    weekday: WEEKDAY_INDEX[parts.weekday] ?? 0,
    hour: Number(parts.hour) % 24,
    minute: Number(parts.minute),
    second: Number(parts.second),
    dayKey: `${parts.year}-${parts.month}-${parts.day}`
  };
}

function dayNumber(dayKey) {
  const [year, month, day] = dayKey.split('-').map(Number);
  return Math.round(Date.UTC(year, month - 1, day) / DAY_MS);
}

function streakStats(dayKeys, todayKey) {
  const days = [...new Set([...dayKeys].map(dayNumber))].sort((first, second) => first - second);
  let longest = 0;
  let run = 0;
  let previous = null;
  for (const day of days) {
    run = previous != null && day === previous + 1 ? run + 1 : 1;
    longest = Math.max(longest, run);
    previous = day;
  }

  // A streak stays alive through today until the day ends without a session.
  const daySet = new Set(days);
  const today = dayNumber(todayKey);
  let cursor = daySet.has(today) ? today : today - 1;
  let current = 0;
  while (daySet.has(cursor)) {
    current += 1;
    cursor -= 1;
  }
  return { current, longest };
}

function buildPlayerActivityPattern(sessions = [], { timeZone = 'UTC', now = new Date() } = {}) {
  const zone = resolveTimeZone(timeZone);
  const nowMs = new Date(now).getTime();
  const heatmap = Array.from({ length: 7 }, () => Array(24).fill(0));
  const activeDays = new Set();
  let completedCount = 0;
  let completedSeconds = 0;
  let longestSession = null;
  let firstObservedAt = null;
  let slices = 0;

  for (const session of Array.isArray(sessions) ? sessions : []) {
    const startMs = new Date(session?.startedAt).getTime();
    const endMs = session?.endedAt == null ? nowMs : new Date(session.endedAt).getTime();
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) continue;
    if (firstObservedAt == null || startMs < firstObservedAt) firstObservedAt = startMs;

    const durationSeconds = Math.floor((endMs - startMs) / 1000);
    if (!session.isCurrent) {
      completedCount += 1;
      completedSeconds += durationSeconds;
    }
    if (!longestSession || durationSeconds > longestSession.durationSeconds) {
      longestSession = {
        startedAt: new Date(startMs).toISOString(),
        durationSeconds,
        isCurrent: Boolean(session.isCurrent)
      };
    }

    let cursor = startMs;
    while (cursor < endMs && slices < MAX_HOUR_SLICES) {
      const parts = localParts(cursor, zone);
      const untilNextHourMs = (3600 - parts.minute * 60 - parts.second) * 1000 - (cursor % 1000);
      const sliceEnd = Math.min(endMs, cursor + untilNextHourMs);
      heatmap[parts.weekday][parts.hour] += (sliceEnd - cursor) / 1000;
      activeDays.add(parts.dayKey);
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
  const streaks = streakStats(activeDays, localParts(nowMs, zone).dayKey);

  return {
    timeZone: zone,
    heatmap: heatmap.map(row => row.map(seconds => Math.round(seconds))),
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
