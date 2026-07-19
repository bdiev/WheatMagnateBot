'use strict';

const fs = require('fs');
const path = require('path');

async function runMigrations(pool, directory = path.join(__dirname, 'migrations')) {
  if (!pool) return false;
  await pool.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    name TEXT PRIMARY KEY,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  const files = fs.readdirSync(directory).filter(name => name.endsWith('.sql')).sort();
  for (const name of files) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`wheatmagnate:${name}`]);
      const applied = await client.query('SELECT 1 FROM schema_migrations WHERE name = $1', [name]);
      if (applied.rowCount) {
        await client.query('COMMIT');
        continue;
      }
      await client.query(fs.readFileSync(path.join(directory, name), 'utf8'));
      await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [name]);
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  }
  return true;
}

module.exports = { runMigrations };
