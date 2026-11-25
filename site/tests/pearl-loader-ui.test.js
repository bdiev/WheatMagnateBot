'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname,'..','..');
const html = fs.readFileSync(path.join(root,'site','public','index.html'),'utf8');
const app = fs.readFileSync(path.join(root,'site','public','app.js'),'utf8');
const server = fs.readFileSync(path.join(root,'site','server.js'),'utf8');
const css = () => fs.readFileSync(path.join(root,'site','public','styles.css'),'utf8');
const bot = fs.readFileSync(path.join(root,'bot.js'),'utf8');
const botMigration = fs.readFileSync(path.join(root,'database','migrations','040_pearl_loader.sql'),'utf8');
const siteMigration = fs.readFileSync(path.join(root,'site','migrations','040_pearl_loader.sql'),'utf8');

assert.equal(botMigration,siteMigration,'the bot and site must install the same Pearl Loader schema');
assert.match(html,/name="role"[\s\S]*value="pearl_loader">Pearl Loader/);
assert.match(html,/id="adminPlayerPearlHatchX"[\s\S]*id="adminPlayerPearlHatchY"[\s\S]*id="adminPlayerPearlHatchZ"/);
assert.match(app,/role:data\.get\('role'\)/);
assert.match(app,/patch\.pearlHatch = values\.pearlHatch/);
assert.match(server,/Only one bot can have the Pearl Loader role/);
assert.match(server,/Pearl Loader can connect only in response to a player Load request/);
assert.match(bot,/accounts[\s\S]*\.filter\(item => item\.enabled && !item\.isDefault\)[\s\S]*\.filter\(item => item\.role !== PEARL_LOADER_ROLE\)/,
  'Pearl Loader must not auto-start with managed accounts');
assert.match(botMigration,/UNIQUE INDEX[\s\S]*role = 'pearl_loader'/i);
const counterMigration = fs.readFileSync(path.join(root,'database','migrations','062_pearl_loader_requests.sql'),'utf8');
assert.equal(counterMigration,fs.readFileSync(path.join(root,'site','migrations','062_pearl_loader_requests.sql'),'utf8'),
  'the bot and site must install the same Pearl Loader counter schema');
assert.match(html,/class="admin-hero-stats"[\s\S]*Pearl loads[\s\S]*id="adminPearlLoads"[\s\S]*id="adminPearlLoadsDetail"/,
  'Control center shows the Pearl Loader counter card');
assert.match(server,/FROM pearl_loader_requests[\s\S]*pearlLoads:/,'admin control state reports Pearl Loader counts');
assert.match(app,/setRollingNumber\('#adminPearlLoads', payload\.pearlLoads\?\.completed\)/);
for (const file of ['093_pearl_chamber_scans.sql','094_pearl_chamber_scan_details.sql']) {
  assert.equal(fs.readFileSync(path.join(root,'database','migrations',file),'utf8'),
    fs.readFileSync(path.join(root,'site','migrations',file),'utf8'),`the bot and site must install the same ${file}`);
}
assert.match(html,/id="adminPlayerPearlHatchZ"[\s\S]*id="adminPlayerPearlChamber"/,'the player card shows the chamber state under the hatch coordinates');
assert.match(server,/pearlHatch: profileHatch\(profile\),\s*pearlChamber/,'the admin player profile carries the chamber state');
assert.match(app,/no_trapdoor: 'No trapdoor'/);
assert.match(bot,/pearlLoaderFeature\?\.scanWithBots\(/,'bots in game keep the chamber scan fresh');
assert.match(bot,/pearlLoaderFeature\?\.remindEmptyChamber\(/,'joining players hear about an empty chamber');
// The Pearl Loader page
assert.match(html,/data-tab="pearl-loader"[^>]*>Pearl Loader</,'the Pearl Loader has its own page in the menu');
assert.match(html,/id="tab-pearl-loader"[\s\S]*id="pearlLoaderSteps"[\s\S]*id="pearlLoaderQueueNote"[\s\S]*id="pearlChambers"[\s\S]*id="pearlLoaderRecent"/);
assert.doesNotMatch(html,/id="pearlLoaderQueue"/,'queues are rare, so there is no separate queue panel');
assert.doesNotMatch(css(),/pearl-hero-sky|pearl-orb|pearl-twinkle/,'the page uses the site look, without the End-sky decoration');
assert.doesNotMatch(html,/adminPearlChambers/,'the chamber list moved out of Control center');
assert.match(app,/NAV_DEFAULT_ORDER = Object\.freeze\(\[[^\]]*'trader', 'pearl-loader'/);
assert.match(server,/NAVIGATION_SECTION_ORDER = Object\.freeze\(\[[^\]]*'trader', 'pearl-loader'/);
assert.match(app,/if \(tab === 'pearl-loader'\) loadPearlLoader\(\)/);
assert.match(server,/url\.pathname === '\/api\/pearl-loader'/);
const pageCode = app.slice(app.indexOf('// Pearl Loader page'), app.indexOf('function resetAdminPlayerPearlHatch'));
assert.doesNotMatch(pageCode,/hatch\.x|hatch\.y|hatch\.z|\.hatch\b/,'the Pearl Loader page never shows coordinates');
const chamberRender = app.slice(app.indexOf('function renderPearlChambers'), app.indexOf('function renderPearlLoader('));
assert.match(chamberRender,/patchPearlRows\(\$\('#pearlChambers'\)/,'chamber rows are updated in place, not rebuilt on every refresh');
assert.match(html,/class="pearl-box pearl-bar"[\s\S]*id="pearlLoaderSteps" class="pearl-dots"[\s\S]*class="pearl-box pearl-nums"/,
  'the compact layout: one status line, then the numbers in a row');
assert.match(html,/<tbody id="pearlChambers"><\/tbody>[\s\S]*<tbody id="pearlLoaderRecent"><\/tbody>/,'chambers and requests are tables');
assert.doesNotMatch(chamberRender,/grid\.innerHTML\s*=/,'rebuilding the grid every refresh made the cards blink');
console.log('Pearl Loader admin UI tests passed.');
