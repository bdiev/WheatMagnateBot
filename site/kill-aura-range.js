'use strict';

const MIN_KILL_AURA_RANGE = 0.5;
const MAX_KILL_AURA_RANGE = 3;
const DEFAULT_KILL_AURA_RANGE = 3;
const KILL_AURA_RANGE_STEP = 0.1;

function normalizeKillAuraRange(value, fallback = DEFAULT_KILL_AURA_RANGE) {
  const numeric = Number(value);
  const fallbackNumeric = Number(fallback);
  const resolved = Number.isFinite(numeric)
    ? numeric
    : Number.isFinite(fallbackNumeric) ? fallbackNumeric : DEFAULT_KILL_AURA_RANGE;
  const clamped = Math.max(MIN_KILL_AURA_RANGE, Math.min(MAX_KILL_AURA_RANGE, resolved));
  return Number((Math.round(clamped / KILL_AURA_RANGE_STEP) * KILL_AURA_RANGE_STEP).toFixed(1));
}

function isValidKillAuraRange(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric)
    && numeric >= MIN_KILL_AURA_RANGE
    && numeric <= MAX_KILL_AURA_RANGE
    && Math.abs(numeric * 10 - Math.round(numeric * 10)) < 1e-9;
}

module.exports = { isValidKillAuraRange, normalizeKillAuraRange };
