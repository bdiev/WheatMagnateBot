'use strict';

const SERVER_STATUS_HIDDEN_TAG = 'Our Bot';
const SERVER_STATUS_HIDDEN_TAG_KEYS = Object.freeze([
  'our bot',
  'hide-from-server-status'
]);

function normalizeUsername(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizeUuid(value) {
  return String(value || '').trim().toLowerCase().replaceAll('-', '');
}

function hasServerStatusHiddenTag(tags) {
  return Array.isArray(tags) && tags.some(tag => SERVER_STATUS_HIDDEN_TAG_KEYS.includes(normalizeUsername(tag)));
}

function createServerStatusHiddenIndex(rows = []) {
  const usernames = new Set();
  const uuids = new Set();

  for (const row of Array.isArray(rows) ? rows : []) {
    if (Array.isArray(row?.admin_tags) && !hasServerStatusHiddenTag(row.admin_tags)) continue;

    const names = [row?.username, ...(Array.isArray(row?.aliases) ? row.aliases : [])];
    for (const name of names) {
      const normalized = normalizeUsername(name);
      if (normalized) usernames.add(normalized);
    }

    const uuid = normalizeUuid(row?.player_uuid);
    if (uuid) uuids.add(uuid);
  }

  return { usernames, uuids };
}

function isServerStatusIdentityHidden(index, { username, uuid } = {}) {
  const normalizedUsername = normalizeUsername(username);
  const normalizedUuid = normalizeUuid(uuid);
  return Boolean(
    (normalizedUsername && index?.usernames?.has(normalizedUsername)) ||
    (normalizedUuid && index?.uuids?.has(normalizedUuid))
  );
}

module.exports = {
  SERVER_STATUS_HIDDEN_TAG,
  SERVER_STATUS_HIDDEN_TAG_KEYS,
  createServerStatusHiddenIndex,
  hasServerStatusHiddenTag,
  isServerStatusIdentityHidden
};
