'use strict';

const crypto = require('node:crypto');

function normalizeUsername(value) {
  return String(value || '').trim();
}

function validateCredentials(username, password) {
  if (!/^[A-Za-z0-9_.-]{2,64}$/.test(username)) {
    const err = new Error('Username must be 2-64 characters and use letters, numbers, dot, dash or underscore.');
    err.statusCode = 400;
    throw err;
  }
  if (String(password || '').length < 6 || String(password || '').length > 256) {
    const err = new Error('Password must be between 6 and 256 characters.');
    err.statusCode = 400;
    throw err;
  }
}

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `scrypt:${salt}:${hash}`;
}

function verifyPassword(password, storedHash) {
  const [method, salt, hash] = String(storedHash || '').split(':');
  if (method !== 'scrypt' || !salt || !hash) return false;
  const actual = crypto.scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, 'hex');
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

async function registerPendingUser(db, { username, password }) {
  const normalizedUsername = normalizeUsername(username);
  validateCredentials(normalizedUsername, password);

  const existing = await db.query(
    `SELECT id FROM site_users WHERE LOWER(username) = LOWER($1)`,
    [normalizedUsername]
  );
  if (existing.rowCount) {
    const err = new Error('This username is already registered.');
    err.statusCode = 409;
    throw err;
  }

  const inserted = await db.query(`
    INSERT INTO site_users (username, password_hash, role, status, approved_at)
    VALUES ($1, $2, 'user', 'pending', NULL)
    RETURNING id, username, role, status, created_at, approved_at
  `, [normalizedUsername, hashPassword(password)]);
  return inserted.rows[0];
}

function getAdminCredentials(env = {}, passwordVariable = 'SITE_ADMIN_PASSWORD') {
  const username = normalizeUsername(env.SITE_ADMIN_USERNAME);
  const password = String(env[passwordVariable] || '');
  if (!username && !password) return null;
  if (!username || !password) {
    const err = new Error(`SITE_ADMIN_USERNAME and ${passwordVariable} must both be set.`);
    err.code = 'SITE_ADMIN_CONFIG_INCOMPLETE';
    throw err;
  }
  validateCredentials(username, password);
  return { username, password };
}

async function upsertAdminUser(db, { username, password }) {
  const normalizedUsername = normalizeUsername(username);
  validateCredentials(normalizedUsername, password);
  const passwordHash = hashPassword(password);
  const updated = await db.query(`
    UPDATE site_users
    SET username = $1,
        password_hash = $2,
        role = 'admin',
        status = 'approved',
        approved_at = COALESCE(approved_at, NOW())
    WHERE LOWER(username) = LOWER($1)
    RETURNING id, username, role, status, created_at, approved_at
  `, [normalizedUsername, passwordHash]);
  if (updated.rowCount) {
    await db.query(`DELETE FROM site_sessions WHERE user_id = $1`, [updated.rows[0].id]);
    return { created: false, user: updated.rows[0] };
  }

  const inserted = await db.query(`
    INSERT INTO site_users (username, password_hash, role, status, approved_at)
    VALUES ($1, $2, 'admin', 'approved', NOW())
    RETURNING id, username, role, status, created_at, approved_at
  `, [normalizedUsername, passwordHash]);
  return { created: true, user: inserted.rows[0] };
}

async function bootstrapAdminFromEnvironment(db, env = {}) {
  const credentials = getAdminCredentials(env);
  if (!credentials) return null;
  return upsertAdminUser(db, credentials);
}

module.exports = {
  bootstrapAdminFromEnvironment,
  getAdminCredentials,
  hashPassword,
  normalizeUsername,
  registerPendingUser,
  upsertAdminUser,
  validateCredentials,
  verifyPassword
};
