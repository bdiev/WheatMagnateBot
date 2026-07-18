'use strict';

function parseObservedJoinDate(message) {
  const match = String(message || '').trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2}):(\d{2})\b/);
  if (!match) return null;
  const [, month, day, year, hour, minute, second] = match.map(Number);
  const date = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  if (!Number.isFinite(date.getTime())) return null;
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day ||
      date.getUTCHours() !== hour || date.getUTCMinutes() !== minute || date.getUTCSeconds() !== second) return null;
  return date;
}

function formatSeenTimestamp(timestamp, now = Date.now()) {
  if (!timestamp) return 'Never seen';
  const time = new Date(timestamp).getTime();
  if (!Number.isFinite(time)) return 'Never seen';
  const seconds = Math.max(0, Math.floor((now - time) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${seconds % 60}s ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ${minutes % 60}m ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ${hours % 24}h ago`;
}

class SeenResponseTracker {
  constructor({ ttlMs = 20_000, now = () => Date.now() } = {}) {
    this.ttlMs = ttlMs;
    this.now = now;
    this.pending = new Map();
  }
  arm(speaker, target = speaker) {
    const entry = { targetUsername: String(target), timestamp: this.now() };
    this.pending.set(`speaker:${String(speaker).toLowerCase()}`, entry);
    this.pending.set(`target:${String(target).toLowerCase()}`, entry);
    return entry;
  }
  consume(speaker) {
    const key = String(speaker || '').toLowerCase();
    const keys = [`speaker:${key}`, `target:${key}`];
    const entry = keys.map(candidate => this.pending.get(candidate)).find(Boolean);
    if (!entry || this.now() - entry.timestamp > this.ttlMs) {
      for (const candidate of keys) this.pending.delete(candidate);
      return null;
    }
    for (const [candidate, value] of this.pending) if (value === entry) this.pending.delete(candidate);
    return entry;
  }
}

module.exports = { SeenResponseTracker, formatSeenTimestamp, parseObservedJoinDate };
