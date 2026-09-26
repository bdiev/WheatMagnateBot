'use strict';

const MAX_TPS = 20;
// Paper prints values slightly above 20 (e.g. "*20.02"); anything far above is
// not a real server tick rate and is rejected instead of clamped.
const MAX_ACCEPTED_TPS = 25;
const NUMBER = '(\\d+(?:[.,]\\d+)?)';

const PAPER_TPS_PATTERN = new RegExp(`tps from last[^:\\n]*:\\s*\\*?${NUMBER}`, 'i');
const TPS_SUFFIX_PATTERN = new RegExp(`\\*?${NUMBER}\\s*tps\\b(?!\\s*[:=])`, 'i');
const TPS_PREFIX_PATTERN = new RegExp(`\\btps\\b\\s*[:=]?\\s*\\*?${NUMBER}`, 'i');
// Lines that are clearly written by a player: "<Name> ...", "[Rank] <Name> ...",
// "Name: ...", "Name » ...", whisper formats.
const PLAYER_LINE_PATTERNS = [
  /^\s*(?:\[[^\]\r\n]{1,24}\]\s*)*<[^>\r\n]{1,32}>/,
  /^\s*(?:\[[^\]\r\n]{1,24}\]\s*)*(?!tps\b)[A-Za-z0-9_]{3,16}\s*[:»›>]\s/i,
  /\bwhispers\b|\s->\s|\bfrom\s+[A-Za-z0-9_]{3,16}\s*:/i
];

function normalizeTps(value) {
  const tps = Number(String(value ?? '').replace(',', '.'));
  if (!Number.isFinite(tps) || tps < 0 || tps > MAX_ACCEPTED_TPS) return null;
  return Math.min(MAX_TPS, tps);
}

function stripFormatting(text) {
  return String(text || '').replace(/§[0-9a-fk-orx]/gi, '');
}

// Parses server-controlled text (TAB header/footer or a /tps reply).
function parseTpsText(text) {
  const clean = stripFormatting(text);
  if (!/tps/i.test(clean)) return null;
  for (const pattern of [PAPER_TPS_PATTERN, TPS_SUFFIX_PATTERN, TPS_PREFIX_PATTERN]) {
    const match = clean.match(pattern);
    if (match) return normalizeTps(match[1]);
  }
  return null;
}

function looksLikePlayerLine(text) {
  const clean = stripFormatting(text);
  return PLAYER_LINE_PATTERNS.some(pattern => pattern.test(clean));
}

function createTpsTracker({
  now = Date.now,
  reportedTtlMs = 2 * 60_000,
  measureWindowMs = 30_000,
  minMeasureSpanMs = 5_000
} = {}) {
  let reported = null; // { value, at, source }
  let ageSamples = []; // { age, at } from server update_time packets

  function setReported(value, source = 'unknown') {
    const tps = normalizeTps(value);
    if (tps === null) return null;
    reported = { value: tps, at: now(), source };
    return tps;
  }

  function hasFreshReported() {
    return Boolean(reported) && now() - reported.at <= reportedTtlMs;
  }

  // World age advances by one per server tick, and the server sends it every
  // 20 ticks, so age delta over wall-clock time is the real server tick rate.
  function observeWorldAge(age) {
    const value = Number(age);
    if (!Number.isFinite(value)) return;
    const at = now();
    const last = ageSamples[ageSamples.length - 1];
    if (last && value < last.age) ageSamples = [];
    ageSamples.push({ age: value, at });
    while (ageSamples.length > 2 && at - ageSamples[1].at >= measureWindowMs) ageSamples.shift();
  }

  function getMeasuredTps() {
    if (ageSamples.length < 2) return null;
    const first = ageSamples[0];
    const last = ageSamples[ageSamples.length - 1];
    const spanMs = last.at - first.at;
    if (spanMs < minMeasureSpanMs) return null;
    let tps = ((last.age - first.age) * 1000) / spanMs;
    // No update_time for a while means fewer than 20 ticks passed since the
    // last one; don't keep showing the pre-freeze rate.
    const silenceMs = now() - last.at;
    if (silenceMs > 3_000) tps = Math.min(tps, (20 * 1000) / silenceMs);
    return Math.max(0, Math.min(MAX_TPS, tps));
  }

  function getTps() {
    if (hasFreshReported()) return reported.value;
    return getMeasuredTps();
  }

  function reset() {
    reported = null;
    ageSamples = [];
  }

  return { setReported, hasFreshReported, observeWorldAge, getMeasuredTps, getTps, reset };
}

module.exports = {
  MAX_TPS,
  normalizeTps,
  parseTpsText,
  looksLikePlayerLine,
  createTpsTracker
};
