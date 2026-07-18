'use strict';

const path = require('node:path');
const { Pool } = require('pg');
require('dotenv').config({ path: path.resolve(__dirname, '..', '..', '.env') });
const { getAdminCredentials, upsertAdminUser } = require('../auth');

function readUsernameArg(argv) {
  const index = argv.indexOf('--username');
  if (index !== -1) return argv[index + 1] || '';
  const inline = argv.find(arg => arg.startsWith('--username='));
  return inline ? inline.slice('--username='.length) : '';
}

async function main() {
  const databaseUrl = String(process.env.DATABASE_URL || '').trim();
  if (!databaseUrl) throw new Error('DATABASE_URL is required.');

  const credentials = getAdminCredentials({
    SITE_ADMIN_USERNAME: readUsernameArg(process.argv.slice(2)) || process.env.SITE_ADMIN_USERNAME,
    SITE_ADMIN_CLI_PASSWORD: process.env.SITE_ADMIN_CLI_PASSWORD
  }, 'SITE_ADMIN_CLI_PASSWORD');
  if (!credentials) {
    throw new Error('Provide --username and set SITE_ADMIN_CLI_PASSWORD for this command.');
  }

  const db = new Pool({ connectionString: databaseUrl });
  try {
    const result = await upsertAdminUser(db, credentials);
    console.log(`[Site Admin] ${result.created ? 'Created' : 'Updated'} administrator ${result.user.username}.`);
  } finally {
    await db.end();
  }
}

main().catch(err => {
  console.error(`[Site Admin] ${err.message}`);
  process.exitCode = 1;
});
