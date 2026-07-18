'use strict';

function parsePlaytime(value) {
  const input = String(value || '').trim();
  if (!input) return null;
  const units = {
    d: 86400, day: 86400, days: 86400,
    h: 3600, hour: 3600, hours: 3600,
    m: 60, min: 60, mins: 60, minute: 60, minutes: 60,
    s: 1, sec: 1, secs: 1, second: 1, seconds: 1
  };
  let total = 0;
  let matches = 0;
  const remainder = input.replace(/(\d+)\s*(days?|d|hours?|h|minutes?|mins?|m|seconds?|secs?|s)\b/gi, (_, amount, unit) => {
    total += Number(amount) * units[unit.toLowerCase()];
    matches += 1;
    return '';
  }).replace(/[\s,]+/g, '');
  return matches > 0 && !remainder && Number.isSafeInteger(total) ? total : null;
}

function formatPlaytime(value) {
  let seconds = Math.max(0, Math.floor(Number(value) || 0));
  const days = Math.floor(seconds / 86400);
  seconds %= 86400;
  const hours = Math.floor(seconds / 3600);
  seconds %= 3600;
  const minutes = Math.floor(seconds / 60);
  const parts = [];
  if (days) parts.push(`${days}d`);
  if (hours || days) parts.push(`${hours}h`);
  parts.push(`${minutes}m`);
  return parts.join(' ');
}

module.exports = { formatPlaytime, parsePlaytime };
