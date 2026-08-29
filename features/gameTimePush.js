'use strict';

const TICKS_PER_GAME_DAY = 24_000;
const MINUTES_PER_GAME_DAY = 24 * 60;
const MINECRAFT_DAY_START_MINUTE = 6 * 60;
const MAX_NATURAL_ADVANCE_TICKS = 1_200;

function normalizeGameTime(value, fallback = '06:00') {
  const match = String(value || '').match(/^(\d{2}):(\d{2})$/);
  if (!match) return fallback;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  return hour <= 23 && minute <= 59 ? `${match[1]}:${match[2]}` : fallback;
}

function gameTimeToMinute(value, fallback = 360) {
  const normalized = normalizeGameTime(value, null);
  if (!normalized) return fallback;
  const [hour, minute] = normalized.split(':').map(Number);
  return hour * 60 + minute;
}

function formatGameTimeMinute(value) {
  const minute = Number(value);
  const normalized = Number.isInteger(minute) && minute >= 0 && minute < MINUTES_PER_GAME_DAY ? minute : MINECRAFT_DAY_START_MINUTE;
  return `${String(Math.floor(normalized / 60)).padStart(2, '0')}:${String(normalized % 60).padStart(2, '0')}`;
}

function gameTimeMinuteToTick(value) {
  const minute = Number(value);
  if (!Number.isInteger(minute) || minute < 0 || minute >= MINUTES_PER_GAME_DAY) {
    throw new TypeError('Game time minute must be an integer from 0 through 1439.');
  }
  const sinceSixAm = (minute - MINECRAFT_DAY_START_MINUTE + MINUTES_PER_GAME_DAY) % MINUTES_PER_GAME_DAY;
  return Math.round(sinceSixAm * TICKS_PER_GAME_DAY / MINUTES_PER_GAME_DAY) % TICKS_PER_GAME_DAY;
}

function crossedGameTimeTargets(previousTime, currentTime, targetMinutes, { maxAdvanceTicks = MAX_NATURAL_ADVANCE_TICKS } = {}) {
  const previous = Number(previousTime);
  const current = Number(currentTime);
  if (!Number.isSafeInteger(previous) || !Number.isSafeInteger(current)) return [];
  const advance = current - previous;
  // Ignore reconnect baselines, backwards clock changes and large /time jumps.
  // Natural progression (including midnight) advances the absolute world time.
  if (advance <= 0 || advance > maxAdvanceTicks) return [];

  const uniqueMinutes = [...new Set((Array.isArray(targetMinutes) ? targetMinutes : []).map(Number))]
    .filter(value => Number.isInteger(value) && value >= 0 && value < MINUTES_PER_GAME_DAY);
  const crossed = [];
  for (const gameTimeMinute of uniqueMinutes) {
    const targetTick = gameTimeMinuteToTick(gameTimeMinute);
    const occurrence = (Math.floor((previous - targetTick) / TICKS_PER_GAME_DAY) + 1) * TICKS_PER_GAME_DAY + targetTick;
    if (occurrence > previous && occurrence <= current) {
      crossed.push({ gameTimeMinute, targetTick, gameDay: Math.floor(occurrence / TICKS_PER_GAME_DAY), occurrence });
    }
  }
  return crossed.sort((a, b) => a.occurrence - b.occurrence || a.gameTimeMinute - b.gameTimeMinute);
}

class GameTimePushMonitor {
  constructor({ getTargets, onTrigger, maxAdvanceTicks = MAX_NATURAL_ADVANCE_TICKS, onError = () => {} } = {}) {
    if (typeof getTargets !== 'function') throw new TypeError('getTargets is required.');
    if (typeof onTrigger !== 'function') throw new TypeError('onTrigger is required.');
    this.getTargets = getTargets;
    this.onTrigger = onTrigger;
    this.maxAdvanceTicks = maxAdvanceTicks;
    this.onError = onError;
    this.previousTime = null;
    this.queue = Promise.resolve();
  }

  reset() {
    this.previousTime = null;
  }

  observe(currentTime, { daylightCycle = true } = {}) {
    const current = Number(currentTime);
    if (!Number.isSafeInteger(current)) return this.queue;
    const previous = this.previousTime;
    this.previousTime = current;
    if (previous === null || !daylightCycle) return this.queue;

    this.queue = this.queue.then(async () => {
      const targets = await this.getTargets();
      const events = crossedGameTimeTargets(previous, current, targets, { maxAdvanceTicks: this.maxAdvanceTicks });
      for (const event of events) await this.onTrigger(event);
    }).catch(error => this.onError(error));
    return this.queue;
  }
}

module.exports = {
  GameTimePushMonitor,
  MAX_NATURAL_ADVANCE_TICKS,
  MINECRAFT_DAY_START_MINUTE,
  MINUTES_PER_GAME_DAY,
  TICKS_PER_GAME_DAY,
  crossedGameTimeTargets,
  formatGameTimeMinute,
  gameTimeMinuteToTick,
  gameTimeToMinute,
  normalizeGameTime
};
