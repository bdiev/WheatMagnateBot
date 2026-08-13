'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const appSource = fs.readFileSync(path.resolve(__dirname, '..', 'public', 'app.js'), 'utf8');
const htmlSource = fs.readFileSync(path.resolve(__dirname, '..', 'public', 'index.html'), 'utf8');
const serverSource = fs.readFileSync(path.resolve(__dirname, '..', 'server.js'), 'utf8');

assert.match(htmlSource, /id="obsidianStatsScope"[\s\S]*?data-obsidian-scope="personal"[\s\S]*?data-obsidian-scope="all"/,
  'the primary Obsidian page exposes Personal and All Bots choices');
assert.match(htmlSource, /id="accountSwitcher"[\s\S]*?id="obsidianStatsScope"[\s\S]*?id="themeToggle"/,
  'the Obsidian scope switch is placed between Minecraft profiles and the theme switch');
assert.doesNotMatch(htmlSource, /id="obsidianStatsScope"[^>]*>[\s\S]*?<span>Statistics<\/span>/,
  'the compact topbar switch has no redundant Statistics label');
assert.match(appSource, /function obsidianStatsPath\(\)[\s\S]*?scope=/,
  'every Obsidian statistics refresh uses the selected scope');
assert.match(appSource, /function updateObsidianStatsScopeVisibility\(\)[\s\S]*?role === 'admin'[\s\S]*?activeAccountIsPrimary\(\)[\s\S]*?state\.activeTab === 'obsidian'/,
  'the switch is visible only to an admin on the primary Obsidian page');
assert.match(appSource, /function updateObsidianFarmControlsVisibility\(scope = state\.obsidianStatsScope\)[\s\S]*?scope === 'all'[\s\S]*?adminCarousel\.hidden = state\.currentUser\?\.role !== 'admin' \|\| aggregate/,
  'Farm Power, Search Radius and Coordinates controls are hidden in All Bots scope');
assert.match(appSource, /if \(aggregate\) state\.obsidianCoordinateEditorOpen = false;/,
  'switching to All Bots closes the coordinate editor');
assert.match(appSource, /state\.obsidianStatsScope = scope;[\s\S]*?updateObsidianFarmControlsVisibility\(scope\);/,
  'farm controls disappear immediately when All Bots is selected');
assert.match(appSource, /state\.charts\.obsidianHourly = payload\.hourly[\s\S]*?state\.charts\.obsidianDaily = payload\.daily/,
  'scope payloads replace both Obsidian chart series');
assert.match(serverSource, /requestedScope === 'all'[\s\S]*?assertAdminUser\(currentUser\)/,
  'all-bot statistics require administrator access');
assert.match(serverSource, /obsidian_account_farm_daily[\s\S]*?SUM\(mined\)/,
  'the API aggregates account-scoped farm buckets on the server');
assert.doesNotMatch(serverSource, /totalMined:localFarm\.cyclesCompleted/,
  'secondary accounts no longer expose session-only placeholder totals');
assert.match(
  serverSource,
  /url\.pathname === '\/api\/live-dashboard'[\s\S]*?obsidian_account_farm_supply_snapshot[\s\S]*?WHERE account_id=\$1::uuid[\s\S]*?normalizeSupplySnapshot/,
  'secondary live dashboard refreshes retain the selected account supply snapshot'
);
assert.doesNotMatch(
  serverSource,
  /supplies:\{hasSnapshot:false,inventory:null,barrel:null,barrelError:'No account supply snapshot yet\.'/,
  'secondary live dashboard no longer overwrites valid supplies with a placeholder'
);

console.log('Obsidian statistics scope UI tests passed.');
