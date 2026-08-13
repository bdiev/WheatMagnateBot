'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const appSource = fs.readFileSync(path.resolve(__dirname, '..', 'public', 'app.js'), 'utf8');
const htmlSource = fs.readFileSync(path.resolve(__dirname, '..', 'public', 'index.html'), 'utf8');
const serverSource = fs.readFileSync(path.resolve(__dirname, '..', 'server.js'), 'utf8');

assert.match(htmlSource, /id="obsidianStatsScope"[\s\S]*?data-obsidian-scope="personal"[\s\S]*?data-obsidian-scope="all"/,
  'the primary Obsidian page exposes Personal and All Bots choices');
assert.match(htmlSource, /id="accountSwitcher"[\s\S]*?id="logoutButton"[\s\S]*?id="themeToggle"/,
  'Log out occupies the former scope-switch position between profiles and the theme switch');
assert.match(htmlSource, /id="tab-obsidian"[\s\S]*?id="obsidianStatsScope"[\s\S]*?id="obsidianStatsCarousel"[\s\S]*?Total Mined/,
  'the Obsidian scope switch is placed immediately above the statistics beginning with Total Mined');
assert.doesNotMatch(htmlSource, /id="obsidianStatsScope"[^>]*>[\s\S]*?<span>Statistics<\/span>/,
  'the compact topbar switch has no redundant Statistics label');
assert.match(appSource, /function obsidianStatsPath\(\)[\s\S]*?scope=/,
  'every Obsidian statistics refresh uses the selected scope');
assert.match(appSource, /function updateObsidianStatsScopeVisibility\(\)[\s\S]*?role === 'admin'[\s\S]*?activeAccountIsPrimary\(\)[\s\S]*?state\.activeTab === 'obsidian'/,
  'the switch is visible only to an admin on the primary Obsidian page');
assert.match(appSource, /function updateObsidianFarmControlsVisibility\(scope = state\.obsidianStatsScope\)[\s\S]*?scope === 'all'[\s\S]*?adminCarousel\.hidden = state\.currentUser\?\.role !== 'admin' \|\| aggregate/,
  'Farm Power, Search Radius and Coordinates controls are hidden in All Bots scope');
assert.match(htmlSource, /id="obsidianSupplyPanels"[\s\S]*?Bot Inventory Supplies[\s\S]*?Supply Barrel/,
  'the two personal supply panels share a stable visibility container');
assert.match(appSource, /const supplyPanels = \$\('#obsidianSupplyPanels'\);[\s\S]*?supplyPanels\.hidden = aggregate;/,
  'Bot Inventory Supplies and Supply Barrel are hidden immediately in All Bots scope');
assert.match(appSource, /if \(aggregate\) state\.obsidianCoordinateEditorOpen = false;/,
  'switching to All Bots closes the coordinate editor');
assert.match(appSource, /state\.obsidianStatsScope = scope;[\s\S]*?startObsidianScopeAnimation\('out'\)[\s\S]*?renderObsidian\(await payloadPromise\)/,
  'farm controls and aggregate-only content swap between the exit and entrance phases');
assert.match(appSource, /function startObsidianScopeAnimation[\s\S]*?filter: 'blur\(5px\)'[\s\S]*?cubic-bezier\(\.16, 1, \.3, 1\)/,
  'Personal and All Bots content uses a soft staggered exit and entrance animation');
assert.match(appSource, /matchMedia\?\.\('\(prefers-reduced-motion: reduce\)'\)/,
  'the scope transition respects reduced-motion preferences');
assert.match(appSource, /state\.charts\.obsidianHourly = payload\.hourly[\s\S]*?state\.charts\.obsidianDaily = payload\.daily/,
  'scope payloads replace both Obsidian chart series');
assert.match(serverSource, /attachObsidianAccountSegments[\s\S]*?account\.color[\s\S]*?obsidian_account_farm_daily[\s\S]*?obsidian_account_farm_hourly/,
  'All Bots chart points retain ordered account segments and Account colors');
assert.match(serverSource, /accountRateResult[\s\S]*?obsidian_farm_state[\s\S]*?obsidian_account_farm_state[\s\S]*?farm\.sessionPerHour = accountRateResult\.rows[\s\S]*?compactFarmState\(row\)\.sessionPerHour/,
  'All Bots Rate is the sum of rates calculated from every bot\'s own session');
assert.match(appSource, /options\.stacked[\s\S]*?item\.segments[\s\S]*?segment\.color[\s\S]*?fillRect/,
  'the chart renderer paints account segments as stacked colored bars');
assert.match(appSource, /function aggregateSeries[\s\S]*?segments: new Map\(\)[\s\S]*?segments: Array\.from/,
  'day and month ranges preserve the per-account stack');
assert.match(htmlSource, /id="obsidianChartLegend"[^>]*hidden/,
  'the Obsidian chart exposes a color legend for aggregate mode');
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
