'use strict';

function normalizeUsername(value) {
  return String(value || '').trim().toLowerCase();
}

function usernamesEqual(left, right) {
  const normalizedLeft = normalizeUsername(left);
  return Boolean(normalizedLeft) && normalizedLeft === normalizeUsername(right);
}

function whitelistIncludes(whitelist, username) {
  return Array.isArray(whitelist) && whitelist.some(entry => usernamesEqual(entry, username));
}

function addUniqueUsername(whitelist, username) {
  const clean = String(username || '').trim();
  if (!clean || whitelistIncludes(whitelist, clean)) return [...whitelist];
  return [...whitelist, clean];
}

module.exports = { addUniqueUsername, normalizeUsername, usernamesEqual, whitelistIncludes };
