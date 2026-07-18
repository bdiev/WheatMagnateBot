'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { addUniqueUsername, normalizeUsername, usernamesEqual, whitelistIncludes } = require('./usernames');

test('username and whitelist matching is case-insensitive', () => {
  assert.equal(normalizeUsername('  WheatMagnate '), 'wheatmagnate');
  assert.equal(usernamesEqual('Steve', 'sTEVE'), true);
  assert.equal(usernamesEqual('', ''), false);
  assert.equal(whitelistIncludes(['Alex', 'Steve'], 'aLeX'), true);
  assert.deepEqual(addUniqueUsername(['Alex'], 'alex'), ['Alex']);
  assert.deepEqual(addUniqueUsername(['Alex'], 'Steve'), ['Alex', 'Steve']);
});
