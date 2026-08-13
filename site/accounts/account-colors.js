'use strict';

const ACCOUNT_COLOR_PALETTE = Object.freeze([
  '#f1c232', '#4b91e5', '#d26cf0', '#55c9ba', '#ef7373', '#f28c48',
  '#8c78e8', '#7cc242', '#e56aa6', '#41b6d7', '#b78b59', '#8dbb61'
]);

function normalizeAccountColor(value) {
  const color = String(value || '').trim().toLowerCase();
  return /^#[0-9a-f]{6}$/.test(color) ? color : null;
}

function pickUniqueAccountColor(accounts = [], preferred = null) {
  const used = new Set(accounts.map(account => normalizeAccountColor(account?.color)).filter(Boolean));
  const requested = normalizeAccountColor(preferred);
  if (requested && !used.has(requested)) return requested;
  return ACCOUNT_COLOR_PALETTE.find(color => !used.has(color)) || (() => {
    // More accounts than palette entries are unusual, but retain uniqueness
    // deterministically by walking the RGB color space from a golden-ratio seed.
    for (let index = 0; index < 0xffffff; index += 1) {
      const value = (0x4b91e5 + index * 0x9e3779) & 0xffffff;
      const color = `#${value.toString(16).padStart(6, '0')}`;
      if (!used.has(color)) return color;
    }
    return '#f1c232';
  })();
}

module.exports = { ACCOUNT_COLOR_PALETTE, normalizeAccountColor, pickUniqueAccountColor };
