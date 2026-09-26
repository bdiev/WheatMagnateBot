'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { SYSTEM_LOG_TYPES, resolveSystemLogType, listSystemLogTypes } = require('../system-log-types');

assert.deepEqual(
  listSystemLogTypes().map(type => type.id),
  ['all', 'obsidian', 'pearl_loader', 'connection', 'notifications', 'commands', 'admin', 'console']
);

const all = resolveSystemLogType(undefined);
assert.equal(all.id, 'all');
assert.equal(all.logCondition, 'TRUE');
assert.equal(all.commandCondition, 'TRUE');

// Unknown or hostile values fall back to "all" instead of reaching SQL.
for (const value of ['nope', "obsidian' OR 1=1 --", '', null]) {
  assert.equal(resolveSystemLogType(value).id, 'all');
}
assert.equal(resolveSystemLogType(' Obsidian ').id, 'obsidian');

const obsidian = resolveSystemLogType('obsidian');
assert.match(obsidian.logCondition, /'obsidian', 'obsidian_click', 'obsidian_analytics'/);
assert.match(obsidian.logCondition, /'farm_stalled'/);
assert.match(obsidian.logCondition, /message ~\* '\^\\\[obsidian'/, 'console lines tagged [Obsidian...] belong to the farm');
assert.match(obsidian.commandCondition, /LIKE 'obsidian%'/);

const pearl = resolveSystemLogType('pearl_loader');
assert.equal(pearl.accountScope, 'global', 'Pearl Loader spans the primary bot and the loader account');
assert.match(pearl.logCondition, /category = 'pearl_loader'/);
assert.match(pearl.logCondition, /role = 'pearl_loader'/, 'the loader bot connection events must be included');
assert.equal(resolveSystemLogType('obsidian').accountScope, 'account');
assert.equal(resolveSystemLogType('all').accountScope, 'account');

const connection = resolveSystemLogType('connection');
assert.match(connection.logCondition, /'minecraft', 'minecraft_runtime'/);
assert.match(connection.logCondition, /'repeated_reconnects'/);
assert.match(connection.logCondition, /reconnect/);

assert.equal(resolveSystemLogType('notifications').commandCondition, null, 'notification-only views must not mix in bot commands');
assert.equal(resolveSystemLogType('commands').commandCondition, 'TRUE');

for (const type of SYSTEM_LOG_TYPES) {
  assert.doesNotMatch(type.logCondition, /\$\d/, `${type.id} must be a static SQL fragment`);
}

const siteRoot = path.join(__dirname, '..');
const serverSource = fs.readFileSync(path.join(siteRoot, 'server.js'), 'utf8');
const appSource = fs.readFileSync(path.join(siteRoot, 'public', 'app.js'), 'utf8');
const indexSource = fs.readFileSync(path.join(siteRoot, 'public', 'index.html'), 'utf8');

assert.match(serverSource, /const logType = resolveSystemLogType\(url\.searchParams\.get\('type'\)\);/);
assert.match(serverSource, /AND \$\{logType\.logCondition\}/);
assert.match(serverSource, /WHERE \(\$4::boolean OR account_id = \$1::uuid\)[\s\S]*logType\.accountScope === 'global'/);
assert.match(serverSource, /logType\.commandCondition\s*\?\s*pool\.query/);

for (const { id } of listSystemLogTypes()) {
  assert.match(indexSource, new RegExp(`<select id="adminLogType"[\\s\\S]*<option value="${id}">`), `the type filter must offer ${id}`);
}
assert.match(appSource, /&type=\$\{encodeURIComponent\(type\)\}/);
assert.match(appSource, /\$\('#adminLogType'\)\?\.addEventListener\('change', loadAdminSystemLogs\)/);
assert.match(appSource, /state\.adminLogsReloadQueued = true;/, 'a filter change during a request must be replayed');
assert.match(appSource, /No log entries match these filters\./);

console.log('system log type tests passed');
