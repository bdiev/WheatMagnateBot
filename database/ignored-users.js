'use strict';

const { normalizeIgnoredUuid } = require('./ignored-identity');

function createIgnoredUsersRepository({ pool, fallback = [], resolveIdentity, updateMemory }) {
  async function loadIgnoredChatUsernames() {
    if (!pool) {
      updateMemory(fallback.map(username => ({ username, uuid: null })));
      return fallback;
    }
    // Bind names first observed after the migration, without moving bound entries.
    await pool.query(`
      UPDATE ignored_users entry SET player_uuid = activity.player_uuid
      FROM player_activity activity
      WHERE entry.player_uuid IS NULL AND activity.player_uuid IS NOT NULL
        AND LOWER(entry.username) = LOWER(activity.username)
        AND NOT EXISTS (SELECT 1 FROM ignored_users bound WHERE bound.player_uuid = activity.player_uuid)
        AND entry.id = (SELECT MIN(other.id) FROM ignored_users other
                        WHERE other.player_uuid IS NULL AND LOWER(other.username)=LOWER(entry.username))
    `);
    const result = await pool.query(`
      SELECT COALESCE(activity.username, entry.username) AS username, entry.player_uuid AS uuid
      FROM ignored_users entry
      LEFT JOIN player_activity activity ON activity.player_uuid = entry.player_uuid
      ORDER BY entry.id
    `);
    updateMemory(result.rows);
    return result.rows.map(row => row.username.toLowerCase());
  }

  async function addIgnoredPlayer(username, addedBy) {
    if (!pool) throw new Error('Database not configured.');
    const identity = await resolveIdentity(username);
    const uuid = normalizeIgnoredUuid(identity?.uuid);
    if (!uuid) throw new Error(`Cannot resolve UUID for ${username}. Try again when the player is online.`);
    // A legacy entry is claimed by the resolved identity; duplicate UUIDs coalesce.
    await pool.query(`
      WITH legacy AS (
        DELETE FROM ignored_users WHERE player_uuid IS NULL AND LOWER(username)=LOWER($4)
        RETURNING added_by, added_at
      )
      INSERT INTO ignored_users (username, player_uuid, added_by, added_at)
      VALUES ($1, $2::uuid, COALESCE((SELECT added_by FROM legacy LIMIT 1), $3),
              COALESCE((SELECT added_at FROM legacy LIMIT 1), CURRENT_TIMESTAMP))
      ON CONFLICT (player_uuid) WHERE player_uuid IS NOT NULL DO NOTHING
    `, [identity.username || username, uuid, addedBy, username]);
    await loadIgnoredChatUsernames();
  }

  async function removeIgnoredPlayer(username, uuid = null) {
    if (!pool) throw new Error('Database not configured.');
    // Resolve the current owner first, so a reused nickname cannot unignore its former owner.
    const identity = await resolveIdentity(username);
    const resolvedUuid = normalizeIgnoredUuid(uuid || identity?.uuid);
    const result = await pool.query(`
      DELETE FROM ignored_users
      WHERE ($2::uuid IS NOT NULL AND player_uuid=$2::uuid)
         OR (player_uuid IS NULL AND LOWER(username)=LOWER($1))
         OR ($2::uuid IS NULL AND LOWER(username)=LOWER($1))
    `, [username, resolvedUuid]);
    await loadIgnoredChatUsernames();
    return result;
  }

  return { loadIgnoredChatUsernames, addIgnoredPlayer, removeIgnoredPlayer };
}

module.exports = { createIgnoredUsersRepository };
