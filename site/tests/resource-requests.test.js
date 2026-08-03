'use strict';

const assert = require('node:assert/strict');
const {
  ACTIVE_STATUSES,
  normalizeCoordinates,
  normalizeMinecraftUsername,
  normalizeRequestText,
  publicRequest
} = require('../resource-requests');

function testMinecraftUsernameValidation() {
  assert.equal(normalizeMinecraftUsername(' WheatMagnate '), 'WheatMagnate');
  assert.equal(normalizeMinecraftUsername('valid_name_12345'), 'valid_name_12345');
  assert.equal(normalizeMinecraftUsername('too-long-username!'), '');
  assert.equal(normalizeMinecraftUsername('../operator'), '');
}

function testContentNormalization() {
  assert.equal(normalizeCoordinates(' Overworld:\n X 10   Y 64\tZ -20 '), 'Overworld: X 10 Y 64 Z -20');
  assert.equal(normalizeCoordinates('x'.repeat(200)).length, 160);
  assert.equal(normalizeRequestText('  2 stacks\u0000 of stone\n  '), '2 stacks of stone');
  assert.equal(normalizeRequestText('x'.repeat(2100)).length, 2000);
}

function testPublicRequestDoesNotLeakCommandInternals() {
  const result = publicRequest({
    id: 17,
    minecraft_username: 'Steve',
    resources: '64 stone',
    status: 'ready',
    delivery_coordinates: 'X 1 Y 2 Z 3',
    admin_note: null,
    delivery_command_id: 991,
    created_at: new Date('2026-08-03T10:00:00Z'),
    updated_at: new Date('2026-08-03T10:01:00Z')
  });
  assert.equal(result.id, '17');
  assert.equal(result.deliveryCoordinates, 'X 1 Y 2 Z 3');
  assert.equal(result.deliveryQueued, true);
  assert.equal('deliveryCommandId' in result, false);
}

function testActiveStatusContract() {
  assert.deepEqual(ACTIVE_STATUSES, ['pending', 'preparing', 'ready', 'notified']);
}

testMinecraftUsernameValidation();
testContentNormalization();
testPublicRequestDoesNotLeakCommandInternals();
testActiveStatusContract();
console.log('resource request tests passed');
