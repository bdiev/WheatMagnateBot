'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const appSource = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');
const start = appSource.indexOf('const SYSTEM_LOG_REPEAT_MAX_PERIOD');
const end = appSource.indexOf('function renderAdminSystemLogGroup');
assert.ok(start >= 0 && end > start, 'system log grouping helpers must exist');
const context = {};
vm.runInNewContext(`${appSource.slice(start, end)}\nthis.groupRepeatedSystemLogs = groupRepeatedSystemLogs;`, context);
const { groupRepeatedSystemLogs } = context;

const entry = (message, level = 'info', category = 'minecraft') => ({ kind: 'system', level, category, message });
const shape = logs => JSON.parse(JSON.stringify(
  groupRepeatedSystemLogs(logs).map(group => [group.entries.length, group.period, group.repeats])
));

// Newest first, as the API returns them: a reconnect loop followed by pickaxe reminders.
const logs = [
  entry('Minecraft bot spawned.'),
  entry('Starting Minecraft connection.'),
  entry('Minecraft bot disconnected.', 'warn'),
  entry('Starting Minecraft connection.'),
  entry('Minecraft bot disconnected.', 'warn'),
  entry('Starting Minecraft connection.'),
  entry('Minecraft bot disconnected.', 'warn'),
  entry('Minecraft bot was kicked.', 'warn'),
  entry('No usable pickaxes', 'error', 'notification'),
  entry('No usable pickaxes', 'error', 'notification'),
  entry('No usable pickaxes', 'error', 'notification'),
  entry('Pruned expired records.', 'audit', 'log_retention')
];
assert.deepEqual(shape(logs), [
  [1, 1, 1],
  [6, 2, 3],
  [1, 1, 1],
  [3, 1, 3],
  [1, 1, 1]
], 'repeated entries and short repeated cycles must collapse into single groups');

assert.deepEqual(
  shape([entry('a'), entry('a', 'warn'), entry('a', 'info', 'bot')]),
  [[1, 1, 1], [1, 1, 1], [1, 1, 1]],
  'entries that differ in level or category must stay separate'
);
assert.equal(
  groupRepeatedSystemLogs([entry('a'), entry('a'), entry('a'), entry('a')])[0].period,
  1,
  'a run of one message must not be shown as a repeated pair'
);
assert.equal(
  groupRepeatedSystemLogs(logs).flatMap(group => group.entries).length,
  logs.length,
  'grouping must keep every entry'
);

console.log('System log grouping tests passed.');
