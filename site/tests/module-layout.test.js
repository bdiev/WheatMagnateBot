'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const siteDirectory = path.resolve(__dirname, '..');
const serverSource = fs.readFileSync(path.join(siteDirectory, 'server.js'), 'utf8');
for (const match of serverSource.matchAll(/require\(['"](\.[^'"]+)['"]\)/g)) {
  const resolved = require.resolve(path.resolve(siteDirectory, match[1]));
  assert.ok(
    resolved === siteDirectory || resolved.startsWith(`${siteDirectory}${path.sep}`),
    `server dependency must remain inside the standalone site Docker context: ${match[1]}`
  );
}

for (const moduleName of ['account-repository','account-registry','account-schema']) {
  const resolved = require.resolve(`../accounts/${moduleName}`);
  assert.equal(path.dirname(resolved), path.resolve(__dirname,'..','accounts'));
  require(resolved);
}

const milestoneModule = require.resolve('../player-milestones');
assert.equal(
  path.dirname(milestoneModule),
  siteDirectory,
  'standalone site modules must not resolve outside the Docker build context'
);
require(milestoneModule);

const chatNormalizationModule = require.resolve('../chat-message-normalization');
assert.equal(
  path.dirname(chatNormalizationModule),
  siteDirectory,
  'chat normalization must remain inside the standalone site Docker build context'
);
require(chatNormalizationModule);

// This is the same resolution graph used by `node server.js` in the site image.
require('../server');
console.log('Site module layout tests passed.');
