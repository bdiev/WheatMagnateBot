'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { Client } = require('pg');

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('Migration verification requires DATABASE_URL.');
  process.exit(1);
}

const schema = `migration_check_${process.pid}_${Date.now()}`;
const quotedSchema = `"${schema}"`;
const migrationPath = path.join(__dirname, '..', 'site', 'migrations', '001_secure_registration_defaults.sql');
const migration = fs.readFileSync(migrationPath, 'utf8');
const client = new Client({ connectionString: databaseUrl });

async function main() {
  await client.connect();
  try {
    await client.query(`CREATE SCHEMA ${quotedSchema}`);
    await client.query(`SET search_path TO ${quotedSchema}`);
    await client.query(`
      CREATE TABLE site_users (
        id BIGSERIAL PRIMARY KEY,
        username VARCHAR(64) NOT NULL UNIQUE,
        password_hash TEXT NOT NULL
      )
    `);
    await client.query(
      'INSERT INTO site_users (username, password_hash) VALUES ($1, $2)',
      ['LegacyUser', 'not-a-real-password-hash']
    );

    // Run twice: a retried deployment must remain safe.
    await client.query(migration);
    await client.query(migration);

    const legacy = await client.query(
      'SELECT username, role, status FROM site_users WHERE username = $1',
      ['LegacyUser']
    );
    if (legacy.rows.length !== 1 || legacy.rows[0].role !== 'user' || legacy.rows[0].status !== 'approved') {
      throw new Error('Migration changed or failed to preserve the legacy account.');
    }

    await client.query(
      'INSERT INTO site_users (username, password_hash) VALUES ($1, $2)',
      ['NewUser', 'not-a-real-password-hash']
    );
    const created = await client.query(
      'SELECT role, status FROM site_users WHERE username = $1',
      ['NewUser']
    );
    if (created.rows[0]?.role !== 'user' || created.rows[0]?.status !== 'pending') {
      throw new Error('Secure defaults were not applied to a newly registered account.');
    }

    console.log('PostgreSQL migration verification passed, including idempotency and secure defaults.');
  } finally {
    await client.query('SET search_path TO public').catch(() => {});
    await client.query(`DROP SCHEMA IF EXISTS ${quotedSchema} CASCADE`).catch(() => {});
    await client.end();
  }
}

main().catch(error => {
  console.error(`Migration verification failed: ${error.message}`);
  process.exitCode = 1;
});
