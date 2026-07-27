'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');

for (const moduleName of ['account-repository','account-registry','account-schema']) {
  const resolved = require.resolve(`../accounts/${moduleName}`);
  assert.equal(path.dirname(resolved), path.resolve(__dirname,'..','accounts'));
  require(resolved);
}

const milestoneModule = require.resolve('../player-milestones');
assert.equal(
  path.dirname(milestoneModule),
  path.resolve(__dirname, '..'),
  'standalone site modules must not resolve outside the Docker build context'
);
require(milestoneModule);

// This is the same resolution graph used by `node server.js` in the site image.
require('../server');
console.log('Site module layout tests passed.');
