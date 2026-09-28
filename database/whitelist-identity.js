'use strict';

// Whitelist entries are bound to Minecraft UUIDs. A bound entry admits only
// that player: a member who changes their name keeps access, and whoever later
// takes the freed name does not inherit it. Legacy entries that are not bound
// yet, and player rows that carry no UUID, still match by name.
//
// The site keeps a copy of this module in site/whitelist-identity.js because it
// is built as a standalone Docker context; keep both in sync.

const UUID_PATTERN = /^[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}$/i;

function normalizeWhitelistUuid(value) {
  const text = String(value || '').trim().toLowerCase();
  if (!UUID_PATTERN.test(text)) return null;
  const hex = text.replace(/-/g, '');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

// SQL predicate: does whitelist row `entry` admit the player (`username`, `uuid`)?
// All three arguments are SQL expressions; `uuid` must be of type UUID.
function whitelistMatchSql(entry, username, uuid) {
  return `(
    (${entry}.player_uuid IS NOT NULL AND ${entry}.player_uuid = ${uuid})
    OR (
      (${entry}.player_uuid IS NULL OR ${uuid} IS NULL)
      AND LOWER(${entry}.username) = LOWER(${username})
    )
  )`;
}

// Statements, run in order, that bind legacy name-only entries to the UUID
// currently observed under that name and rename bound entries to the player's
// current name. Binding only narrows access: a name-only entry already admits
// whoever holds the name.
const SYNC_WHITELIST_IDENTITIES_SQL = [`
  WITH candidates AS (
    SELECT DISTINCT ON (entry.id) entry.id, activity.player_uuid
    FROM whitelist entry
    JOIN player_activity activity
      ON activity.player_uuid IS NOT NULL
     AND LOWER(activity.username) = LOWER(entry.username)
    WHERE entry.player_uuid IS NULL
    ORDER BY entry.id, activity.is_online DESC,
             COALESCE(activity.last_seen, activity.last_online) DESC NULLS LAST, activity.id DESC
  ), unique_candidates AS (
    SELECT DISTINCT ON (player_uuid) id, player_uuid
    FROM candidates
    WHERE NOT EXISTS (
      SELECT 1 FROM whitelist bound WHERE bound.player_uuid = candidates.player_uuid
    )
    ORDER BY player_uuid, id
  )
  UPDATE whitelist entry
  SET player_uuid = unique_candidates.player_uuid
  FROM unique_candidates
  WHERE entry.id = unique_candidates.id
`, `
  UPDATE whitelist entry
  SET username = activity.username
  FROM player_activity activity
  WHERE entry.player_uuid IS NOT NULL
    AND activity.player_uuid = entry.player_uuid
    AND entry.username IS DISTINCT FROM activity.username
`];

function isWhitelistedIdentity(entries, username, uuid = null) {
  const nameKey = String(username || '').trim().toLowerCase();
  const playerUuid = normalizeWhitelistUuid(uuid);
  if (!nameKey && !playerUuid) return false;
  return (entries || []).some(entry => {
    const entryUuid = normalizeWhitelistUuid(entry?.uuid);
    if (entryUuid && playerUuid) return entryUuid === playerUuid;
    return Boolean(nameKey) && String(entry?.username || '').trim().toLowerCase() === nameKey;
  });
}

module.exports = {
  normalizeWhitelistUuid,
  whitelistMatchSql,
  SYNC_WHITELIST_IDENTITIES_SQL,
  isWhitelistedIdentity
};
