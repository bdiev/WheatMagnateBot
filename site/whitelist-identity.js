'use strict';

// Copy of the SQL matcher in database/whitelist-identity.js (the site is built
// as a standalone Docker context); keep both in sync.
//
// Whitelist entries are bound to Minecraft UUIDs. A bound entry admits only
// that player: a member who changes their name keeps access, and whoever later
// takes the freed name does not inherit it. Legacy entries that are not bound
// yet, and player rows that carry no UUID, still match by name.
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

module.exports = { whitelistMatchSql };
