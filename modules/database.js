const { Pool } = require('pg');
const config = require('./config');

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

module.exports = {
  initDatabase,
  createTables,
  loadIgnoredChatUsernames,
  addIgnoredUser,
  removeIgnoredUser,
  getPool: () => pool
};