'use strict';

const { Pool } = require('pg');

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

  async function updatePlayerActivity(username, isOnline) {
    if (!pool) return;

    try {
      const timestamp = new Date();
      if (isOnline) {
        await pool.query(`
          INSERT INTO player_activity (username, last_seen, last_online, is_online)
          VALUES ($1, $2, $2, TRUE)
          ON CONFLICT (username)
          DO UPDATE SET last_seen = $2, last_online = $2, is_online = TRUE
        `, [username, timestamp]);
      } else {
        await pool.query(`
          INSERT INTO player_activity (username, last_seen, is_online)
          VALUES ($1, $2, FALSE)
          ON CONFLICT (username)
          DO UPDATE SET last_seen = $2, is_online = FALSE
        `, [username, timestamp]);
      }
    } catch (_) {
      // Keep activity tracking best-effort; chat and reconnect flows should not fail on this.
    }
  }

  async function getWhitelistActivity() {
    if (!pool) {
      return { error: 'Database not configured' };
    }

    try {
      const result = await pool.query(`
        SELECT w.username, pa.last_seen, pa.last_online, pa.is_online
        FROM whitelist w
        LEFT JOIN player_activity pa ON LOWER(w.username) = LOWER(pa.username)
        ORDER BY
          CASE WHEN pa.is_online = TRUE THEN 0 ELSE 1 END,
          CASE WHEN pa.is_online = TRUE THEN LOWER(w.username) END ASC,
          CASE WHEN pa.is_online = FALSE OR pa.is_online IS NULL THEN pa.last_seen END DESC NULLS LAST
      `);

      const bot = getBot();
      const actualOnlinePlayers = new Set();
      if (bot && bot.players) {
        for (const player of Object.values(bot.players)) {
          if (player.username) {
            actualOnlinePlayers.add(player.username.toLowerCase());
          }
        }
      }

      const players = result.rows.map(row => ({
        ...row,
        is_online: actualOnlinePlayers.has(row.username.toLowerCase())
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

  return {
    loadIgnoredChatUsernames,
    updatePlayerActivity,
    getWhitelistActivity
  };
}

function createWhitelistRepository({
  pool,
  loadWhitelistFile,
  appendWhitelistFile,
  updateWhitelistMemory
}) {
  async function loadWhitelistFromDB() {
    if (!pool) {
      console.log('[DB] Cannot load whitelist: database pool not available');
      return [];
    }
    try {
      const res = await pool.query('SELECT username FROM whitelist');
      return res.rows.map(row => row.username);
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
        await pool.query(
          'INSERT INTO whitelist (username, added_by) VALUES ($1, $2) ON CONFLICT DO NOTHING',
          [username, 'migration']
        );
      }
      console.log('[DB] Whitelist migrated to database');
    } catch (err) {
      console.error('[DB] Failed to migrate whitelist:', err.message);
    }
  }

  async function addUsernameToWhitelist(targetUsername, addedBy = 'system') {
    const safeUsername = String(targetUsername || '').trim();
    if (!safeUsername) {
      throw new Error('Username is required.');
    }

    if (pool) {
      try {
        const insertResult = await pool.query(
          'INSERT INTO whitelist (username, added_by) VALUES ($1, $2) ON CONFLICT DO NOTHING',
          [safeUsername, addedBy]
        );
        const newWhitelist = await loadWhitelistFromDB();
        updateWhitelistMemory(newWhitelist);
        return {
          whitelist: newWhitelist,
          source: 'database',
          changed: insertResult.rowCount > 0
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
    updateWhitelistMemory(newWhitelist);
    return {
      whitelist: newWhitelist,
      source: 'file',
      changed: !alreadyListed
    };
  }

  return {
    loadWhitelistFromDB,
    migrateWhitelistToDB,
    addUsernameToWhitelist
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

module.exports = {
  createDatabasePool,
  logDatabaseStatus,
  createMentionKeywordRepository,
  createPlayerActivityRepository,
  createWhitelistRepository,
  createAdminSettingsRepository
};
