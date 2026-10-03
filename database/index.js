'use strict';

const { Pool } = require('pg');
const {
  normalizeWhitelistUuid,
  whitelistMatchSql,
  SYNC_WHITELIST_IDENTITIES_SQL
} = require('./whitelist-identity');

function createDatabasePool(databaseUrl = process.env.DATABASE_URL) {
  if (!databaseUrl) {
    console.log('[DB] No DATABASE_URL environment variable found. Database features disabled.');
    return null;
  }

  console.log('[DB] Database URL found, attempting to connect...');
  const pool = new Pool({
    connectionString: databaseUrl
  });

  pool.on('error', (err) => {
    console.error('[DB] Unexpected error on idle client', err);
  });
  pool.on('connect', () => {});

  return pool;
}

function logDatabaseStatus(pool) {
  console.log('=== DATABASE STATUS ===');
  if (pool) {
    console.log('[DB] Database pool created');
    console.log('[DB] Waiting for connection...');
  } else {
    console.log('[DB] Database disabled - no connection URL');
  }
  console.log('======================');
}

function createMentionKeywordRepository(pool) {
  async function getMentionKeywords() {
    if (!pool) return [];
    try {
      const res = await pool.query('SELECT discord_id, keyword FROM mention_keywords');
      return res.rows;
    } catch (err) {
      console.error('[DB] Failed to load mention keywords:', err.message);
      return [];
    }
  }

  async function addMentionKeyword(discordId, keyword) {
    if (!pool) return { success: false, error: 'Database not configured' };
    try {
      await pool.query(
        'INSERT INTO mention_keywords (discord_id, keyword) VALUES ($1, $2) ON CONFLICT (discord_id, keyword) DO NOTHING',
        [discordId, keyword.toLowerCase()]
      );
      return { success: true };
    } catch (err) {
      console.error('[DB] Failed to add mention keyword:', err.message);
      return { success: false, error: err.message };
    }
  }

  async function removeMentionKeyword(discordId, keyword) {
    if (!pool) return { success: false, error: 'Database not configured' };
    try {
      const result = await pool.query(
        'DELETE FROM mention_keywords WHERE discord_id = $1 AND keyword = $2',
        [discordId, keyword.toLowerCase()]
      );
      return { success: true, removed: result.rowCount > 0 };
    } catch (err) {
      console.error('[DB] Failed to remove mention keyword:', err.message);
      return { success: false, error: err.message };
    }
  }

  async function getUserMentionKeywords(discordId) {
    if (!pool) return { success: false, error: 'Database not configured' };
    try {
      const res = await pool.query(
        'SELECT keyword FROM mention_keywords WHERE discord_id = $1 ORDER BY keyword',
        [discordId]
      );
      return { success: true, keywords: res.rows.map(r => r.keyword) };
    } catch (err) {
      console.error('[DB] Failed to get user mention keywords:', err.message);
      return { success: false, error: err.message };
    }
  }

  return {
    getMentionKeywords,
    addMentionKeyword,
    removeMentionKeyword,
    getUserMentionKeywords
  };
}

function createPlayerActivityRepository({ pool, ignoredFallback = [], getBot = () => null }) {
  async function loadIgnoredChatUsernames() {
    if (!pool) {
      console.log('[DB] Cannot load ignored users: database pool not available');
      return ignoredFallback;
    }
    try {
      const res = await pool.query('SELECT username FROM ignored_users');
      return res.rows.map(row => row.username.toLowerCase());
    } catch (err) {
      console.error('[DB] Failed to load ignored users:', err.message);
      return ignoredFallback;
    }
  }

  async function updatePlayerActivity(username, isOnline, { recordEvent = true, uuid = null, resetSession = false } = {}) {
    if (!pool) return;

    username = String(username || '').trim();
    if (!/^[A-Za-z0-9_]{1,16}$/.test(username)) return;

    const timestamp = new Date();
    const normalizedUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(uuid || ''))
      ? String(uuid).toLowerCase()
      : null;
    if (!normalizedUuid) {
      const existingIdentity = await pool.query(
        'SELECT 1 FROM player_activity WHERE LOWER(username)=LOWER($1) LIMIT 1',
        [username]
      ).catch(() => ({ rows: [] }));
      // A TAB display value is not a player identity. Only a packet carrying a
      // UUID may create a new observed profile; UUID-less events can still
      // update records that were established previously.
      if (!existingIdentity.rows[0]) return;
    }
    let previousOnline = null;
    let previousPresenceObservedAt = null;
    if (recordEvent || resetSession) {
      const previous = await pool.query(`SELECT is_online,presence_observed_at FROM player_activity
        WHERE ($2::uuid IS NOT NULL AND player_uuid=$2::uuid) OR LOWER(username)=LOWER($1)
        ORDER BY is_online DESC, COALESCE(last_seen,last_online) DESC NULLS LAST,id DESC LIMIT 1`,
      [username, normalizedUuid]).catch(() => ({ rows: [] }));
      previousOnline = previous.rows[0]?.is_online;
      previousPresenceObservedAt = previous.rows[0]?.presence_observed_at || null;
    }
    const reconcileUuidAndUsernameRows = async executor => {
      if (!normalizedUuid) return;
      const matches = await executor.query(`
        SELECT id,username,player_uuid
        FROM player_activity
        WHERE player_uuid=$1::uuid OR LOWER(username)=LOWER($2)
        ORDER BY id
        FOR UPDATE
      `, [normalizedUuid, username]);
      const uuidRow = matches.rows.find(row => String(row.player_uuid || '').toLowerCase() === normalizedUuid);
      const nameRow = matches.rows.find(row => String(row.username || '').toLowerCase() === String(username).toLowerCase());
      if (!uuidRow || !nameRow || String(uuidRow.id) === String(nameRow.id)) return;
      const nameRowUuid = String(nameRow.player_uuid || '').toLowerCase();
      if (nameRowUuid && nameRowUuid !== normalizedUuid) {
        throw new Error(`Username ${username} is already linked to a different player UUID.`);
      }

      await executor.query(`
        UPDATE player_activity target
        SET last_seen = CASE
              WHEN target.last_seen IS NULL THEN source.last_seen
              WHEN source.last_seen IS NULL THEN target.last_seen
              ELSE GREATEST(target.last_seen,source.last_seen)
            END,
            last_online = CASE
              WHEN target.last_online IS NULL THEN source.last_online
              WHEN source.last_online IS NULL THEN target.last_online
              ELSE GREATEST(target.last_online,source.last_online)
            END,
            online_since = GREATEST(
              CASE WHEN target.is_online THEN target.online_since END,
              CASE WHEN source.is_online THEN source.online_since END
            ),
            presence_observed_at = GREATEST(target.presence_observed_at,source.presence_observed_at),
            registration_at = CASE
              WHEN target.registration_at IS NULL THEN source.registration_at
              WHEN source.registration_at IS NULL THEN target.registration_at
              ELSE LEAST(target.registration_at,source.registration_at)
            END,
            observed_message_count = COALESCE(target.observed_message_count, source.observed_message_count),
            observed_message_count_at = CASE
              WHEN target.observed_message_count IS NULL THEN source.observed_message_count_at
              ELSE target.observed_message_count_at
            END,
            is_online = COALESCE(target.is_online,FALSE) OR COALESCE(source.is_online,FALSE),
            admin_notes = COALESCE(NULLIF(target.admin_notes,''),source.admin_notes),
            pearl_hatch_x = COALESCE(target.pearl_hatch_x,source.pearl_hatch_x),
            pearl_hatch_y = COALESCE(target.pearl_hatch_y,source.pearl_hatch_y),
            pearl_hatch_z = COALESCE(target.pearl_hatch_z,source.pearl_hatch_z),
            admin_tags = ARRAY(
              SELECT DISTINCT tag
              FROM UNNEST(COALESCE(target.admin_tags,'{}'::text[]) || COALESCE(source.admin_tags,'{}'::text[])) tag
              ORDER BY tag
            )
        FROM player_activity source
        WHERE target.id=$1 AND source.id=$2
      `, [uuidRow.id, nameRow.id]);
      await executor.query('DELETE FROM player_activity WHERE id=$1', [nameRow.id]);
    };
    const reconcileUuidOwnedData = async executor => {
      if (!normalizedUuid) return;
      const playtimeRows = await executor.query(`
        SELECT username,player_uuid,total_seconds,tracking_since,updated_at
        FROM player_playtime
        WHERE player_uuid=$1::uuid
           OR (
             player_uuid IS NULL
             AND LOWER(username) IN (
               SELECT LOWER(own_name.username)
               FROM player_name_history own_name
               WHERE own_name.player_uuid=$1::uuid
                 AND NOT EXISTS (
                   SELECT 1 FROM player_name_history reused_name
                   WHERE LOWER(reused_name.username)=LOWER(own_name.username)
                     AND reused_name.player_uuid<>$1::uuid
                 )
             )
           )
        ORDER BY updated_at DESC NULLS LAST
        FOR UPDATE
      `, [normalizedUuid]);
      if (playtimeRows.rows.length) {
        const totalSeconds = playtimeRows.rows.reduce(
          (total, row) => total + BigInt(row.total_seconds || 0),
          0n
        );
        const trackingSince = playtimeRows.rows
          .map(row => row.tracking_since)
          .filter(Boolean)
          .sort((first, second) => new Date(first) - new Date(second))[0] || null;
        await executor.query(
          'DELETE FROM player_playtime WHERE username=ANY($1::text[])',
          [playtimeRows.rows.map(row => row.username)]
        );
        await executor.query(`
          INSERT INTO player_playtime(username,player_uuid,total_seconds,tracking_since,updated_at)
          VALUES($1,$2::uuid,$3::bigint,$4,NOW())
        `, [username, normalizedUuid, totalSeconds.toString(), trackingSince]);
      }

      await executor.query(`
        UPDATE game_chat_messages
        SET player_uuid=$1::uuid
        WHERE player_uuid IS NULL
          AND LOWER(username) IN (
            SELECT LOWER(own_name.username)
            FROM player_name_history own_name
            WHERE own_name.player_uuid=$1::uuid
              AND NOT EXISTS (
                SELECT 1 FROM player_name_history reused_name
                WHERE LOWER(reused_name.username)=LOWER(own_name.username)
                  AND reused_name.player_uuid<>$1::uuid
              )
          )
      `, [normalizedUuid]);
    };
    const runUpdate = async (executor = pool) => {
      if (normalizedUuid) {
        await executor.query(`
          INSERT INTO player_name_history (player_uuid, username, first_seen, last_seen)
          VALUES ($1::uuid, $2, $3, $3)
          ON CONFLICT (player_uuid, (LOWER(username)))
          DO UPDATE SET username = EXCLUDED.username, last_seen = EXCLUDED.last_seen
        `, [normalizedUuid, username, timestamp]);
      }
      if (isOnline) {
        const result = await executor.query(`
          WITH updated AS (
            UPDATE player_activity
            SET username = CASE WHEN $4::uuid IS NULL THEN player_activity.username ELSE $1 END,
                player_uuid = COALESCE($4::uuid, player_activity.player_uuid),
                last_seen = CASE
                  WHEN $3::boolean AND player_activity.is_online IS DISTINCT FROM TRUE THEN $2::timestamp
                  ELSE player_activity.last_seen
                END,
                last_online = CASE
                  WHEN $3::boolean AND player_activity.is_online IS DISTINCT FROM TRUE THEN $2::timestamp
                  ELSE player_activity.last_online
                END,
                online_since = CASE
                  WHEN $5::boolean THEN NULL
                  WHEN player_activity.is_online IS TRUE THEN player_activity.online_since
                  WHEN $3::boolean THEN $6::timestamptz
                  ELSE NULL
                END,
                presence_observed_at = $2::timestamptz,
                registration_at = COALESCE(player_activity.registration_at, NOW()),
                is_online = TRUE
            WHERE id = (
              SELECT id
              FROM player_activity
              WHERE ($4::uuid IS NOT NULL AND player_uuid = $4::uuid)
                 OR LOWER(username) = LOWER($1)
              ORDER BY is_online DESC, COALESCE(last_seen, last_online) DESC NULLS LAST, id DESC
              LIMIT 1
            )
            RETURNING id
          )
          INSERT INTO player_activity (username, player_uuid, last_seen, last_online, online_since, presence_observed_at, registration_at, is_online)
          SELECT $1, $4::uuid,
                 CASE WHEN $3::boolean THEN $2::timestamp ELSE NULL END,
                 CASE WHEN $3::boolean THEN $2::timestamp ELSE NULL END,
                 CASE WHEN $3::boolean AND NOT $5::boolean THEN $6::timestamptz ELSE NULL END,
                 $2::timestamptz,
                 NOW(),
                 TRUE
          WHERE NOT EXISTS (SELECT 1 FROM updated)
          RETURNING id
        `, [username, timestamp, recordEvent, normalizedUuid, resetSession, timestamp.toISOString()]);
        return { created: result.rowCount > 0 };
      } else {
        const result = await executor.query(`
          WITH updated AS (
            UPDATE player_activity
            SET username = CASE WHEN $4::uuid IS NULL THEN player_activity.username ELSE $1 END,
                player_uuid = COALESCE($4::uuid, player_activity.player_uuid),
                last_seen = CASE
                  WHEN $3::boolean AND player_activity.is_online IS DISTINCT FROM FALSE THEN $2::timestamp
                  ELSE player_activity.last_seen
                END,
                presence_observed_at = $2::timestamptz,
                registration_at = COALESCE(player_activity.registration_at, NOW()),
                is_online = FALSE,
                online_since = NULL
            WHERE id = (
              SELECT id
              FROM player_activity
              WHERE ($4::uuid IS NOT NULL AND player_uuid = $4::uuid)
                 OR LOWER(username) = LOWER($1)
              ORDER BY is_online DESC, COALESCE(last_seen, last_online) DESC NULLS LAST, id DESC
              LIMIT 1
            )
            RETURNING id
          )
          INSERT INTO player_activity (username, player_uuid, last_seen, presence_observed_at, registration_at, is_online)
          SELECT $1, $4::uuid, CASE WHEN $3::boolean THEN $2::timestamp ELSE NULL END, $2::timestamptz, NOW(), FALSE
          WHERE NOT EXISTS (SELECT 1 FROM updated)
          RETURNING id
        `, [username, timestamp, recordEvent, normalizedUuid]);
        return { created: result.rowCount > 0 };
      }
    };
    const executeUpdate = async () => {
      if (!normalizedUuid) {
        return runUpdate();
      }
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await reconcileUuidAndUsernameRows(client);
        const result = await runUpdate(client);
        await reconcileUuidOwnedData(client);
        await client.query('COMMIT');
        return result;
      } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        throw error;
      } finally {
        client.release();
      }
    };

    try {
      const result = await executeUpdate();
      if (normalizedUuid) {
        // A renamed member keeps their whitelist entry; mirror the new name.
        await pool.query(`
          UPDATE whitelist SET username = $2
          WHERE player_uuid = $1::uuid AND username IS DISTINCT FROM $2
        `, [normalizedUuid, username]).catch(() => {});
      }
      // The initial TAB snapshot after a reconnect is not a confirmed game
      // join, so it must not start the player's live "online since" timer.
      // It is still the beginning of an observed presence interval, however,
      // and the average-online history needs that boundary in order to count
      // players who were already connected when the bot arrived.
      if (Boolean(isOnline) && resetSession && previousOnline === true && previousPresenceObservedAt) {
        await pool.query(`
          INSERT INTO player_session_events(username,event_type,occurred_at)
          VALUES($1,'player_left',LEAST($2::timestamptz,$3::timestamptz))
          ON CONFLICT DO NOTHING
        `, [username, previousPresenceObservedAt, timestamp]);
      }
      const shouldRecordSessionBoundary = (recordEvent && previousOnline !== Boolean(isOnline))
        || (Boolean(isOnline) && resetSession);
      if (shouldRecordSessionBoundary) {
        await pool.query(`
          INSERT INTO player_session_events(username,event_type,occurred_at)
          VALUES($1,$2,$3::timestamptz)
          ON CONFLICT DO NOTHING
        `, [username, isOnline ? 'player_joined' : 'player_left', timestamp]);
      }
      return { ...result, previousOnline, isOnline: Boolean(isOnline) };
    } catch (err) {
      if (err?.code === '42703') {
        try {
          await pool.query('ALTER TABLE player_activity ADD COLUMN IF NOT EXISTS registration_at TIMESTAMPTZ');
          await pool.query('ALTER TABLE player_activity ADD COLUMN IF NOT EXISTS presence_observed_at TIMESTAMPTZ');
          const result = await executeUpdate();
          return { ...result, previousOnline, isOnline: Boolean(isOnline) };
        } catch (retryErr) {
          console.error(`[DB] Failed to update player activity for ${username} after migration retry:`, retryErr.message);
          return;
        }
      }
      console.error(`[DB] Failed to update player activity for ${username}:`, err.message);
    }
  }

  function getObservedOnlinePlayers() {
    const names = new Set();
    const uuids = new Set();
    const bot = getBot();
    for (const player of Object.values(bot?.players || {})) {
      if (player?.username) names.add(player.username.toLowerCase());
      const uuid = normalizeWhitelistUuid(player?.uuid);
      if (uuid) uuids.add(uuid);
    }
    return {
      has: row => {
        const uuid = normalizeWhitelistUuid(row.player_uuid);
        return uuid ? uuids.has(uuid) : names.has(String(row.username || '').toLowerCase());
      }
    };
  }

  async function getWhitelistActivity() {
    if (!pool) {
      return { error: 'Database not configured' };
    }

    try {
      const result = await pool.query(`
        SELECT COALESCE(pa.username, w.username) AS username,
               COALESCE(w.player_uuid, pa.player_uuid) AS player_uuid,
               pa.last_seen, pa.last_online, pa.is_online, pa.online_since
        FROM whitelist w
        LEFT JOIN LATERAL (
          SELECT activity.username, activity.player_uuid, activity.last_seen,
                 activity.last_online, activity.is_online, activity.online_since
          FROM player_activity activity
          WHERE ${whitelistMatchSql('w', 'activity.username', 'activity.player_uuid')}
          ORDER BY activity.is_online DESC,
                   COALESCE(activity.last_seen, activity.last_online) DESC NULLS LAST, activity.id DESC
          LIMIT 1
        ) pa ON TRUE
      `);

      const onlinePlayers = getObservedOnlinePlayers();
      const players = result.rows.map(row => ({
        ...row,
        is_online: onlinePlayers.has(row)
      }));

      players.sort((a, b) => {
        if (a.is_online && !b.is_online) return -1;
        if (!a.is_online && b.is_online) return 1;
        if (a.is_online && b.is_online) {
          return a.username.toLowerCase().localeCompare(b.username.toLowerCase());
        }
        if (!a.last_seen && !b.last_seen) return 0;
        if (!a.last_seen) return 1;
        if (!b.last_seen) return -1;
        return new Date(b.last_seen) - new Date(a.last_seen);
      });

      return { players };
    } catch (err) {
      return { error: err.message };
    }
  }

  async function searchNonWhitelistActivity(query, limit = 25) {
    if (!pool) {
      return { error: 'Database not configured' };
    }

    const search = String(query || '').trim();
    if (search.length < 2) {
      return { error: 'Type at least 2 characters.' };
    }

    try {
      const result = await pool.query(`
        WITH activity AS (
          SELECT DISTINCT ON (LOWER(username))
            LOWER(username) AS username_key,
            username,
            player_uuid,
            last_seen,
            last_online,
            is_online
          FROM player_activity
          ORDER BY LOWER(username), is_online DESC, COALESCE(last_seen, last_online) DESC NULLS LAST, id DESC
        )
        SELECT pa.username, pa.player_uuid, pa.last_seen, pa.last_online, pa.is_online
        FROM activity pa
        WHERE LOWER(pa.username) LIKE LOWER($1)
          AND NOT EXISTS (
            SELECT 1
            FROM whitelist w
            WHERE ${whitelistMatchSql('w', 'pa.username', 'pa.player_uuid')}
          )
        ORDER BY
          CASE WHEN pa.is_online = TRUE THEN 0 ELSE 1 END,
          pa.last_seen DESC NULLS LAST,
          LOWER(pa.username) ASC
        LIMIT $2
      `, [`%${search}%`, limit]);

      const onlinePlayers = getObservedOnlinePlayers();
      return {
        players: result.rows.map(row => ({
          ...row,
          is_online: onlinePlayers.has(row)
        }))
      };
    } catch (err) {
      return { error: err.message };
    }
  }

  return {
    loadIgnoredChatUsernames,
    updatePlayerActivity,
    getWhitelistActivity,
    searchNonWhitelistActivity
  };
}

function createWhitelistRepository({
  pool,
  loadWhitelistFile,
  appendWhitelistFile,
  updateWhitelistMemory,
  resolvePlayerIdentity = async () => null
}) {
  async function syncWhitelistIdentities() {
    for (const statement of SYNC_WHITELIST_IDENTITIES_SQL) {
      await pool.query(statement);
    }
  }

  // Returns [{ username, uuid }]. Unbound entries are bound to the UUID
  // observed under their name first, and bound entries show the current name.
  async function loadWhitelistFromDB() {
    if (!pool) {
      console.log('[DB] Cannot load whitelist: database pool not available');
      return [];
    }
    try {
      await syncWhitelistIdentities().catch(err => {
        console.warn('[DB] Could not bind whitelist entries to player UUIDs:', err.message);
      });
      const res = await pool.query(`
        SELECT username, player_uuid
        FROM whitelist
        ORDER BY LOWER(username), id
      `);
      return res.rows.map(row => ({
        username: row.username,
        uuid: normalizeWhitelistUuid(row.player_uuid)
      }));
    } catch (err) {
      console.error('[DB] Failed to load whitelist:', err.message);
      return [];
    }
  }

  async function migrateWhitelistToDB() {
    if (!pool) return;
    try {
      const fileWhitelist = loadWhitelistFile();
      for (const username of fileWhitelist) {
        // Skip names already listed, and former names of bound members: the
        // file still holds the name a member had when they were added, and
        // re-importing it would admit whoever took that name afterwards.
        await pool.query(`
          INSERT INTO whitelist (username, added_by)
          SELECT $1::varchar, $2::varchar
          WHERE NOT EXISTS (
            SELECT 1 FROM whitelist entry
            WHERE LOWER(entry.username) = LOWER($1)
               OR EXISTS (
                 SELECT 1 FROM player_name_history history
                 WHERE history.player_uuid = entry.player_uuid
                   AND LOWER(history.username) = LOWER($1)
               )
          )
          ON CONFLICT DO NOTHING
        `, [username, 'migration']);
      }
      console.log('[DB] Whitelist migrated to database');
    } catch (err) {
      console.error('[DB] Failed to migrate whitelist:', err.message);
    }
  }

  async function addEntryToDatabase(requestedUsername, addedBy) {
    const identity = await Promise.resolve(resolvePlayerIdentity(requestedUsername)).catch(err => {
      console.warn(`[Whitelist Add] Could not resolve ${requestedUsername}:`, err.message);
      return null;
    });
    const uuid = normalizeWhitelistUuid(identity?.uuid);
    const username = String(identity?.username || requestedUsername).trim();

    if (!uuid) {
      // Without a UUID the entry stays name-only until the player is observed.
      const inserted = await pool.query(`
        INSERT INTO whitelist (username, added_by)
        SELECT $1::varchar, $2::varchar
        WHERE NOT EXISTS (SELECT 1 FROM whitelist WHERE LOWER(username) = LOWER($1))
        ON CONFLICT DO NOTHING
      `, [username, addedBy]);
      return { changed: inserted.rowCount > 0, username, uuid: null };
    }

    const bound = await pool.query(`
      UPDATE whitelist SET username = $2
      WHERE player_uuid = $1::uuid
      RETURNING id
    `, [uuid, username]);
    if (bound.rowCount) return { changed: false, username, uuid };

    // A name-only entry for this name now belongs to the resolved player.
    const claimed = await pool.query(`
      UPDATE whitelist SET player_uuid = $1::uuid, username = $2
      WHERE id = (
        SELECT id FROM whitelist
        WHERE player_uuid IS NULL AND LOWER(username) IN (LOWER($2), LOWER($3))
        ORDER BY id
        LIMIT 1
      )
      RETURNING id
    `, [uuid, username, requestedUsername]);
    if (claimed.rowCount) return { changed: false, username, uuid };

    const inserted = await pool.query(`
      INSERT INTO whitelist (username, player_uuid, added_by)
      VALUES ($1, $2::uuid, $3)
      ON CONFLICT DO NOTHING
    `, [username, uuid, addedBy]);
    return { changed: inserted.rowCount > 0, username, uuid };
  }

  async function addUsernameToWhitelist(targetUsername, addedBy = 'system') {
    const safeUsername = String(targetUsername || '').trim();
    if (!safeUsername) {
      throw new Error('Username is required.');
    }

    if (pool) {
      try {
        const { changed, username, uuid } = await addEntryToDatabase(safeUsername, addedBy);
        const entries = await loadWhitelistFromDB();
        updateWhitelistMemory(entries);
        return {
          whitelist: entries.map(entry => entry.username),
          entries,
          username,
          uuid,
          source: 'database',
          changed
        };
      } catch (dbErr) {
        console.error('[Whitelist Add] DB error:', dbErr.message);
      }
    }

    const fileWhitelist = loadWhitelistFile();
    const alreadyListed = fileWhitelist.some(name => name.toLowerCase() === safeUsername.toLowerCase());
    if (!alreadyListed) {
      appendWhitelistFile(safeUsername);
    }

    const newWhitelist = loadWhitelistFile();
    const entries = newWhitelist.map(username => ({ username, uuid: null }));
    updateWhitelistMemory(entries);
    return {
      whitelist: newWhitelist,
      entries,
      username: safeUsername,
      uuid: null,
      source: 'file',
      changed: !alreadyListed
    };
  }

  // Removes the entry shown under this name. Names are refreshed first so a
  // stale name left behind by a rename cannot remove someone else's entry.
  async function removeUsernameFromWhitelistDB(targetUsername) {
    if (!pool) return { changed: false };
    await syncWhitelistIdentities().catch(err => {
      console.warn('[DB] Could not bind whitelist entries to player UUIDs:', err.message);
    });
    const result = await pool.query(
      'DELETE FROM whitelist WHERE LOWER(username) = LOWER($1)',
      [targetUsername]
    );
    return { changed: result.rowCount > 0 };
  }

  return {
    loadWhitelistFromDB,
    migrateWhitelistToDB,
    addUsernameToWhitelist,
    removeUsernameFromWhitelistDB
  };
}

function createAdminSettingsRepository(pool) {
  async function loadAdminSettings(defaults = {}) {
    if (!pool) return { ...defaults };
    try {
      const result = await pool.query('SELECT key, value FROM admin_settings');
      const settings = { ...defaults };
      for (const row of result.rows) {
        settings[row.key] = row.value;
      }
      return settings;
    } catch (err) {
      console.error('[DB] Failed to load admin settings:', err.message);
      return { ...defaults };
    }
  }

  async function saveAdminSetting(key, value) {
    if (!pool) return false;
    try {
      await pool.query(`
        INSERT INTO admin_settings (key, value, updated_at)
        VALUES ($1, $2::jsonb, NOW())
        ON CONFLICT (key)
        DO UPDATE SET value = EXCLUDED.value,
                      updated_at = NOW()
      `, [key, JSON.stringify(value)]);
      return true;
    } catch (err) {
      console.error(`[DB] Failed to save admin setting ${key}:`, err.message);
      return false;
    }
  }

  async function saveAdminSettings(settings = {}) {
    if (!pool) return false;
    try {
      const entries = Object.entries(settings);
      if (entries.length === 0) return true;
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        for (const [key, value] of entries) {
          await client.query(`
            INSERT INTO admin_settings (key, value, updated_at)
            VALUES ($1, $2::jsonb, NOW())
            ON CONFLICT (key)
            DO UPDATE SET value = EXCLUDED.value,
                          updated_at = NOW()
          `, [key, JSON.stringify(value)]);
        }
        await client.query('COMMIT');
        return true;
      } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        throw err;
      } finally {
        client.release();
      }
    } catch (err) {
      console.error('[DB] Failed to save admin settings:', err.message);
      return false;
    }
  }

  return {
    loadAdminSettings,
    saveAdminSetting,
    saveAdminSettings
  };
}

function createSystemLogRepository(pool) {
  async function ensureSystemLogTable() {
    if (!pool) return false;
    await pool.query(`
      CREATE TABLE IF NOT EXISTS site_system_logs (
        id BIGSERIAL PRIMARY KEY,
        level VARCHAR(16) NOT NULL DEFAULT 'info',
        category VARCHAR(64) NOT NULL DEFAULT 'site',
        actor_username VARCHAR(64),
        message TEXT NOT NULL,
        details JSONB,
        account_id UUID,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await pool.query(`ALTER TABLE site_system_logs ADD COLUMN IF NOT EXISTS account_id UUID`);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS site_system_logs_created_at_idx
      ON site_system_logs (created_at DESC)
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS site_system_logs_level_created_idx
      ON site_system_logs (level, created_at DESC)
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS site_system_logs_account_created_idx ON site_system_logs (account_id, created_at DESC)`);
    return true;
  }

  async function recordSystemLog({ level = 'info', category = 'bot', actor = null, message = '', details = null, accountId = null } = {}) {
    if (!pool || !message) return false;
    const safeLevel = ['debug', 'info', 'warn', 'error', 'audit'].includes(level) ? level : 'info';
    const safeCategory = String(category || 'bot').trim().slice(0, 64) || 'bot';
    const safeActor = actor ? String(actor).trim().slice(0, 64) : null;
    try {
      await pool.query(`
        INSERT INTO site_system_logs (level, category, actor_username, message, details, account_id)
        VALUES ($1, $2, $3, $4, $5, COALESCE($6::uuid, '00000000-0000-4000-8000-000000000001'::uuid))
      `, [safeLevel, safeCategory, safeActor, String(message).slice(0, 2000), details || null, accountId]);
      return true;
    } catch (err) {
      console.error('[SystemLog] Failed to write system log:', err.message);
      return false;
    }
  }

  return {
    ensureSystemLogTable,
    recordSystemLog
  };
}

module.exports = {
  createDatabasePool,
  logDatabaseStatus,
  createMentionKeywordRepository,
  createPlayerActivityRepository,
  createWhitelistRepository,
  createAdminSettingsRepository,
  createSystemLogRepository
};
