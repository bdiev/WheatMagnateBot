const { Pool } = require('pg');
const config = require('./config');
const fs = require('fs');

let pool = null;

function initDatabase() {
  if (config.DATABASE_URL) {
    pool = new Pool({
      connectionString: config.DATABASE_URL,
    });

    pool.on('error', (err) => {
      console.error('[DB] Unexpected error on idle client', err);
    });

    return pool;
  }
  return null;
}

async function createTables() {
  if (!pool) return;

  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS ignored_users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(255) UNIQUE NOT NULL,
        added_by VARCHAR(255),
        added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create table for storing Minecraft sessions
    await pool.query(`
      CREATE TABLE IF NOT EXISTS minecraft_sessions (
        id SERIAL PRIMARY KEY,
        username VARCHAR(255) UNIQUE NOT NULL,
        session_data JSONB NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    console.log('[DB] Tables initialized.');
  } catch (err) {
    console.error('[DB] Failed to initialize tables:', err.message);
  }
}

async function loadIgnoredChatUsernames() {
  if (!pool) return config.IGNORED_CHAT_USERNAMES;

  try {
    const res = await pool.query('SELECT username FROM ignored_users');
    return res.rows.map(row => row.username.toLowerCase());
  } catch (err) {
    console.error('[DB] Failed to load ignored users:', err.message);
    return config.IGNORED_CHAT_USERNAMES;
  }
}

async function addIgnoredUser(username, addedBy) {
  if (!pool) return false;

  try {
    await pool.query('INSERT INTO ignored_users (username, added_by) VALUES ($1, $2) ON CONFLICT (username) DO NOTHING',
      [username.toLowerCase(), addedBy]);
    return true;
  } catch (err) {
    console.error('[DB] Failed to add ignored user:', err.message);
    return false;
  }
}

async function removeIgnoredUser(username) {
  if (!pool) return false;

  try {
    const result = await pool.query('DELETE FROM ignored_users WHERE username = $1', [username.toLowerCase()]);
    return result.rowCount > 0;
  } catch (err) {
    console.error('[DB] Failed to remove ignored user:', err.message);
    return false;
  }
}

async function saveMinecraftSession(username, sessionData) {
  if (!pool) {
    // Fallback to file system if no database
    try {
      fs.writeFileSync('minecraft_session.json', JSON.stringify(sessionData, null, 2));
      return true;
    } catch (err) {
      console.error('[DB] Failed to save session to file:', err.message);
      return false;
    }
  }

  try {
    const now = new Date();
    await pool.query(`
      INSERT INTO minecraft_sessions (username, session_data, created_at, updated_at)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (username)
      DO UPDATE SET
        session_data = EXCLUDED.session_data,
        updated_at = EXCLUDED.updated_at
    `, [username, sessionData, now, now]);
    return true;
  } catch (err) {
    console.error('[DB] Failed to save Minecraft session:', err.message);
    return false;
  }
}

async function loadMinecraftSession(username) {
  if (!pool) {
    // Fallback to file system if no database
    try {
      if (fs.existsSync('minecraft_session.json')) {
        const data = fs.readFileSync('minecraft_session.json', 'utf8');
        return JSON.parse(data);
      }
    } catch (err) {
      console.error('[DB] Failed to load session from file:', err.message);
    }
    return null;
  }

  try {
    const res = await pool.query('SELECT session_data FROM minecraft_sessions WHERE username = $1', [username]);
    if (res.rows.length > 0) {
      return res.rows[0].session_data;
    }
    return null;
  } catch (err) {
    console.error('[DB] Failed to load Minecraft session:', err.message);
    return null;
  }
}

module.exports = {
  initDatabase,
  createTables,
  loadIgnoredChatUsernames,
  addIgnoredUser,
  removeIgnoredUser,
  saveMinecraftSession,
  loadMinecraftSession,
  getPool: () => pool
};