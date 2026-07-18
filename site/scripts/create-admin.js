'use strict';

const path = require('node:path');
const { Pool } = require('pg');
require('dotenv').config({ path: path.resolve(__dirname, '..', '..', '.env'), quiet: true });
const { getAdminCredentials, upsertAdminUser } = require('../auth');
const { loadAdminCliConfig } = require('../../config');

function readUsernameArg(argv) {
  const index = argv.indexOf('--username');
  if (index !== -1) return argv[index + 1] || '';
  const inline = argv.find(arg => arg.startsWith('--username='));
  return inline ? inline.slice('--username='.length) : '';
}

async function main() {
  const cliConfig = loadAdminCliConfig({
    ...process.env,
    SITE_ADMIN_USERNAME: readUsernameArg(process.argv.slice(2)) || process.env.SITE_ADMIN_USERNAME
  });

  const credentials = getAdminCredentials({
    SITE_ADMIN_USERNAME: cliConfig.site.adminUsername,
    SITE_ADMIN_CLI_PASSWORD: cliConfig.site.adminPassword
  }, 'SITE_ADMIN_CLI_PASSWORD');
  if (!credentials) {
    throw new Error('Provide --username and set SITE_ADMIN_CLI_PASSWORD for this command.');
  }

  const db = new Pool({ connectionString: cliConfig.database.url });
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
