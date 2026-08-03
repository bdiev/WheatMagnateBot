'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  ACTIVE_STATUSES,
  normalizeCoordinates,
  normalizeMinecraftUsername,
  normalizeRequestText,
  publicRequest
} = require('../resource-requests');

const requestClientSource = fs.readFileSync(path.join(__dirname, '..', 'public', 'request.js'), 'utf8');
const requestStylesSource = fs.readFileSync(path.join(__dirname, '..', 'public', 'request.css'), 'utf8');

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

function testCompactAdminRequestCards() {
  assert.match(requestClientSource, /data-admin-toggle aria-expanded="false"/, 'admin requests must start as compact summaries');
  assert.match(requestClientSource, /class="admin-request-details" hidden/, 'full request controls must start collapsed');
  assert.match(requestClientSource, /details\.hidden = !expanded/, 'clicking an admin summary must toggle its details');
  assert.match(requestStylesSource, /\.request-admin-list\s*\{[^}]*grid-template-columns:\s*repeat\(4,/s, 'admin request tiles must use four desktop columns');
  assert.match(requestStylesSource, /\.admin-request\s*\{[^}]*aspect-ratio:\s*1;/s, 'collapsed admin request tiles must remain square');
  assert.match(requestStylesSource, /\.admin-request\.expanded\s*\{[^}]*grid-column:\s*1\s*\/\s*-1;[^}]*aspect-ratio:\s*auto;/s, 'expanded requests must span the full grid width');
}

testMinecraftUsernameValidation();
testContentNormalization();
testPublicRequestDoesNotLeakCommandInternals();
testActiveStatusContract();
testCompactAdminRequestCards();
console.log('resource request tests passed');
