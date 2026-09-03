'use strict';

function finiteEnvironmentNumber(name, fallback, { minimum = 0 } = {}) {
  const raw = process.env[name];
  if (raw == null || String(raw).trim() === '') return fallback;
  const value = Number(raw);
  return Number.isFinite(value) && value >= minimum ? value : fallback;
}

const MAX_FARM_PING_MS = finiteEnvironmentNumber('OBSIDIAN_FARM_MAX_PING_MS', 150);
const FARM_HIGH_PING_GRACE_MS = finiteEnvironmentNumber('OBSIDIAN_FARM_HIGH_PING_GRACE_MS', 10_000);
const FARM_PING_RECOVERY_MS = finiteEnvironmentNumber('OBSIDIAN_FARM_PING_RECOVERY_MS', 5_000);

function botPingMs(bot) {
  const ping = Number(bot?.player?.ping);
  return Number.isFinite(ping) && ping >= 0 ? ping : null;
}

function isFarmPingTooHigh(ping, maximum = MAX_FARM_PING_MS) {
  return Number.isFinite(ping) && ping > maximum;
}

/**
 * Convert noisy point-in-time Minecraft latency into stable pause/resume
 * decisions. Mineflayer's player ping can briefly jump during a server save or
 * host backup, so one watchdog tick must not interrupt an in-flight farm cycle.
 */
function createFarmPingMonitor({
  maximumPing = MAX_FARM_PING_MS,
  highPingGraceMs = FARM_HIGH_PING_GRACE_MS,
  recoveryMs = FARM_PING_RECOVERY_MS
} = {}) {
  const maximum = finiteNonNegative(maximumPing, MAX_FARM_PING_MS);
  const pauseDelay = finiteNonNegative(highPingGraceMs, FARM_HIGH_PING_GRACE_MS);
  const recoveryDelay = finiteNonNegative(recoveryMs, FARM_PING_RECOVERY_MS);
  let highSince = null;
  let normalSince = null;

  function observe(ping, now = Date.now()) {
    const timestamp = Number(now);
    const observedAt = Number.isFinite(timestamp) ? timestamp : Date.now();
    const tooHigh = isFarmPingTooHigh(ping, maximum);
    const known = Number.isFinite(ping);

    if (tooHigh) {
      if (highSince == null) highSince = observedAt;
      normalSince = null;
      const highForMs = Math.max(0, observedAt - highSince);
      return {
        known,
        tooHigh: true,
        pauseConfirmed: highForMs >= pauseDelay,
        recoveryConfirmed: false,
        highForMs,
        normalForMs: 0
      };
    }

    highSince = null;
    if (!known) {
      normalSince = null;
      return {
        known: false,
        tooHigh: false,
        pauseConfirmed: false,
        recoveryConfirmed: false,
        highForMs: 0,
        normalForMs: 0
      };
    }

    if (normalSince == null) normalSince = observedAt;
    const normalForMs = Math.max(0, observedAt - normalSince);
    return {
      known: true,
      tooHigh: false,
      pauseConfirmed: false,
      recoveryConfirmed: normalForMs >= recoveryDelay,
      highForMs: 0,
      normalForMs
    };
  }

  function reset() {
    highSince = null;
    normalSince = null;
  }

  return { observe, reset, maximumPing:maximum, highPingGraceMs:pauseDelay, recoveryMs:recoveryDelay };
}

function finiteNonNegative(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : fallback;
}

module.exports = {
  MAX_FARM_PING_MS,
  FARM_HIGH_PING_GRACE_MS,
  FARM_PING_RECOVERY_MS,
  botPingMs,
  isFarmPingTooHigh,
  createFarmPingMonitor
};
