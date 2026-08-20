'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { resolveObsidianDebugLogPath } = require('../server');

const root = path.resolve(__dirname, '..', '..');
const appSource = fs.readFileSync(path.join(root, 'site', 'public', 'app.js'), 'utf8');
const stylesSource = fs.readFileSync(path.join(root, 'site', 'public', 'styles.css'), 'utf8');
const serverSource = fs.readFileSync(path.join(root, 'site', 'server.js'), 'utf8');

const primary = resolveObsidianDebugLogPath({
  accountId:'00000000-0000-4000-8000-000000000001',
  createdAt:'2026-08-16T08:02:00.000Z'
});
assert.equal(primary.dateKey, '2026-08-16');
assert.equal(
  primary.filePath,
  path.join(root, 'data', 'bots', '00000000-0000-4000-8000-000000000001', 'obsidian-farm-debug-2026-08-16.log'),
  'the primary account must use the same account-scoped log directory as the farm runtime'
);
assert.deepEqual(primary.candidatePaths, [
  path.join(root, 'data', 'bots', '00000000-0000-4000-8000-000000000001', 'obsidian-farm-debug-2026-08-16.log'),
  path.join(root, 'obsidian_farm_debug-2026-08-16.log')
], 'legacy primary logs must remain downloadable during the path migration');

const managedId = '11111111-1111-4111-8111-111111111111';
const managed = resolveObsidianDebugLogPath({ accountId:managedId, createdAt:'2026-08-15T23:59:59.000Z' });
assert.equal(
  managed.filePath,
  path.join(root, 'data', 'bots', managedId, 'obsidian-farm-debug-2026-08-15.log'),
  'managed account downloads must remain inside the account log directory'
);
assert.deepEqual(managed.candidatePaths, [managed.filePath]);
assert.throws(
  () => resolveObsidianDebugLogPath({ accountId:'../../app', createdAt:new Date() }),
  /Invalid Minecraft account ID/,
  'account input must not permit path traversal'
);

assert.match(appSource, /function renderObsidianDebugLogDownload[\s\S]*details\?\.eventType !== 'farm_stalled'/);
assert.match(appSource, /\/api\/admin\/system-logs\/\$\{logId\}\/obsidian-debug-log/);
assert.match(stylesSource, /\.admin-log-entry\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\) auto;/s);
assert.match(stylesSource, /\.admin-log-download\s*\{[^}]*display:\s*inline-flex;/s);
assert.match(serverSource, /assertAdminUser\(currentUser\);[\s\S]*entry\.details\?\.eventType !== 'farm_stalled'/);
assert.match(serverSource, /Content-Type': 'application\/x-ndjson; charset=utf-8'/);
assert.match(serverSource, /for \(const candidatePath of debugLog\.candidatePaths\)/);

console.log('Obsidian debug download tests passed.');
