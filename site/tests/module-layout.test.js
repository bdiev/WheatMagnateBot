'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');

for (const moduleName of ['account-repository','account-registry','account-schema']) {
  const resolved = require.resolve(`../accounts/${moduleName}`);
  assert.equal(path.dirname(resolved), path.resolve(__dirname,'..','accounts'));
  require(resolved);
}

// This is the same resolution graph used by `node server.js` in the site image.
require('../server');
console.log('Site module layout tests passed.');
