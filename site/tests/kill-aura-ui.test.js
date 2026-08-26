'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const publicDirectory = path.resolve(__dirname, '..', 'public');
const indexSource = fs.readFileSync(path.join(publicDirectory, 'index.html'), 'utf8');
const appSource = fs.readFileSync(path.join(publicDirectory, 'app.js'), 'utf8');
const stylesSource = fs.readFileSync(path.join(publicDirectory, 'styles.css'), 'utf8');
const serverSource = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
const botSource = fs.readFileSync(path.join(__dirname, '..', '..', 'bot.js'), 'utf8');
const historyMigration = fs.readFileSync(path.join(__dirname, '..', 'migrations', '035_kill_aura_hourly_history.sql'), 'utf8');
const rangeMigration = fs.readFileSync(path.join(__dirname, '..', 'migrations', '038_kill_aura_attack_range.sql'), 'utf8');
const botRangeMigration = fs.readFileSync(path.join(__dirname, '..', '..', 'database', 'migrations', '038_kill_aura_attack_range.sql'), 'utf8');
const criticalsMigration = fs.readFileSync(path.join(__dirname, '..', 'migrations', '039_kill_aura_criticals.sql'), 'utf8');
const botCriticalsMigration = fs.readFileSync(path.join(__dirname, '..', '..', 'database', 'migrations', '039_kill_aura_criticals.sql'), 'utf8');
const rangeValidation = require('../kill-aura-range');
const { KILL_AURA_MOBS } = require('../kill-aura-catalog');

assert.match(
  indexSource,
  /id="killAuraTargetModalOpen"[\s\S]*?aria-haspopup="dialog"[\s\S]*?aria-controls="killAuraTargetModal"/,
  'Kill Aura Control must open an accessible target dialog'
);
assert.match(
  indexSource,
  /id="killAuraTargetModal" class="kill-aura-target-modal" hidden>[\s\S]*?role="dialog" aria-modal="true"/,
  'the target dialog must start hidden and expose modal semantics'
);
assert.match(
  indexSource,
  /id="killAuraSearch"[\s\S]*?id="killAuraMobList"[\s\S]*?id="killAuraSaveTargets"/,
  'the target dialog must include search, mob selection, and save controls'
);
assert.match(appSource, /function setKillAuraTargetModalOpen\(open,/);
assert.match(appSource, /event\.key === 'Escape'/, 'the dialog must support keyboard dismissal');
assert.match(appSource, /trapKillAuraModalFocus/, 'the dialog must keep keyboard focus inside while open');
assert.match(stylesSource, /\.kill-aura-target-modal\s*\{[^}]*position:\s*fixed;/s);
assert.match(stylesSource, /\.kill-aura-target-modal\s*\{[^}]*pointer-events:\s*none;/s, 'the closed dialog must never intercept navigation clicks');
assert.match(stylesSource, /\.kill-aura-target-modal\.is-open\s*\{[^}]*pointer-events:\s*auto;/s, 'only the visible dialog may intercept clicks');
assert.match(appSource, /modal\.classList\.add\('is-open'\)/);
assert.match(appSource, /modal\.classList\.remove\('is-open'\)/);
assert.doesNotMatch(appSource, /setKillAuraMobDropdownOpen/, 'removed dropdown helpers must not break navigation');
assert.match(appSource, /setKillAuraTargetModalOpen\(false, \{ restoreSelection: true, restoreFocus: false \}\)/, 'tab navigation must close the target dialog safely');
assert.doesNotMatch(indexSource, /<details class="panel admin-command-panel kill-aura-control-panel"/);
assert.doesNotMatch(indexSource, /<h2>Combat Mode<\/h2>/, 'the static Combat Mode card must be replaced');
assert.match(
  indexSource,
  /<h2>Attack Range<\/h2>[\s\S]*?id="killAuraAttackRange" type="range" min="0\.5" max="3" step="0\.1"/,
  'Kill Aura must expose an accessible 0.5-3.0 block range slider'
);
assert.match(appSource, /commandType:\s*'kill_aura_range'[\s\S]*?payload:\s*\{ value \}/, 'range changes must be persisted through the bot command queue');
assert.match(appSource, /--range-progress[\s\S]*?aria-valuetext/, 'the slider fill and accessible value must follow the selected range');
assert.match(stylesSource, /#killAuraAttackRange::-(?:webkit-slider-thumb|moz-range-thumb)/, 'the range slider must provide a site-styled drag handle');
assert.match(serverSource, /'kill_aura_range'[\s\S]*?isValidKillAuraRange\(payload\.value\)/, 'the server must validate range commands');
assert.equal(rangeMigration, botRangeMigration, 'the bot and site must apply the same Kill Aura range migration');
assert.match(rangeMigration, /attack_range NUMERIC\(2,1\)[\s\S]*CHECK \(attack_range >= 0\.5 AND attack_range <= 3\.0\)/);
assert.equal(rangeValidation.isValidKillAuraRange(0.5), true);
assert.equal(rangeValidation.isValidKillAuraRange(3), true);
assert.equal(rangeValidation.isValidKillAuraRange(3.1), false);
assert.equal(rangeValidation.normalizeKillAuraRange(1.26), 1.3);
assert.deepEqual(
  KILL_AURA_MOBS.find(mob => mob.id === 'shulker_bullet'),
  { id: 'shulker_bullet', name: 'Shulker Bullet', category: 'projectile' },
  'Shulker Bullet must be exposed as a projectile target'
);
assert.match(indexSource, /id="killAuraSelectProjectiles"/, 'the target dialog must expose a Projectiles quick filter');
assert.match(appSource, /killAuraSelectProjectiles[\s\S]*?mob\.category === 'projectile'/, 'the Projectiles filter must select projectile targets');
assert.match(
  indexSource,
  /id="killAuraCriticalsButton"[^>]*data-bot-command="kill_aura_criticals_toggle"[^>]*aria-pressed="false"/,
  'Kill Aura must expose an accessible Criticals toggle'
);
assert.match(appSource, /aura\.criticalsEnabled[\s\S]*?killAuraCriticalsButton[\s\S]*?aria-pressed/, 'the Criticals button must reflect persisted state');
assert.match(serverSource, /'kill_aura_criticals_toggle'/, 'the server must accept Criticals commands');
assert.match(botSource, /type === 'kill_aura_criticals_toggle'[\s\S]*?setCriticalsEnabled/, 'the bot must apply Criticals commands');
assert.equal(criticalsMigration, botCriticalsMigration, 'the bot and site must apply the same Criticals migration');
assert.match(criticalsMigration, /criticals_enabled BOOLEAN NOT NULL DEFAULT FALSE/);
assert.doesNotMatch(
  indexSource,
  /kill-aura-hero|kill-aura-page-intro|kill-aura-stat-mark/,
  'Kill Aura must not use a separate visual theme'
);
assert.match(
  indexSource,
  /class="kill-aura-stats-grid"/,
  'Kill Aura must use its dedicated five-card metric layout'
);
assert.doesNotMatch(indexSource, /class="stats-grid five kill-aura-stats-grid"/, 'Kill Aura metrics must not inherit the legacy contents-based grid');
assert.match(
  indexSource,
  /class="farm-admin-grid kill-aura-admin-grid admin-only"/,
  'Kill Aura controls must reuse the Obsidian Farm control-card grid'
);
assert.match(
  indexSource,
  /class="split-grid kill-aura-data-grid"[\s\S]*?<h2>Kill Statistics<\/h2>[\s\S]*?<h2>Combat Details<\/h2>/,
  'Kill Aura data panels must reuse the Obsidian Farm split layout'
);
assert.match(
  appSource,
  /minecraftIconUrl\('mob', mob\.id\)[\s\S]*data-minecraft-mob-icon[\s\S]*data-fallback-src="\/items\/Target\.png"/,
  'Kill Statistics must request the matching mob render and retain the target icon only as a fallback'
);
assert.match(
  appSource,
  /localItemIconUrl\(item\) \|\| minecraftIconUrl\('item', item\?\.name \|\| item\?\.label\)/,
  'missing local item icons must use the same cached Minecraft icon endpoint'
);
assert.match(
  serverSource,
  /\/api\\\/minecraft-icon\\\/\(mob\|item\)[\s\S]*sendMinecraftIcon\(req, res, minecraftIconRoute\[1\], iconId\)/,
  'the server must expose the validated cached mob and item icon route'
);
assert.match(
  indexSource,
  /<h2>Kills Over Time<\/h2>[\s\S]*data-chart-controls="killAuraKillsChart"[\s\S]*data-chart-range="hours"[\s\S]*data-chart-range="days"[\s\S]*data-chart-range="months"[\s\S]*id="killAuraKillsChart"/,
  'Kill Aura must expose an hourly, daily, and monthly history chart'
);
assert.match(
  appSource,
  /case 'killAuraKillsChart':[\s\S]*killAuraHourly[\s\S]*killAuraDaily[\s\S]*killAuraMonthly[\s\S]*hourlyKills\.map\(localizedChartItem\)[\s\S]*Number\(item\.value\) === 1 \? 'kill' : 'kills'/,
  'the Kill Aura chart must select the matching time series and format kill tooltips'
);
assert.match(
  serverSource,
  /INTERVAL '167 hours'[\s\S]*INTERVAL '1 hour'[\s\S]*kill_aura_hourly_kills[\s\S]*INTERVAL '91 days'[\s\S]*MIN\(date_trunc\('month',bucket AT TIME ZONE \$2\)\)[\s\S]*killHistory:/,
  'the API must provide zero-filled hourly, daily, and monthly kill series'
);
assert.match(
  botSource,
  /WITH total AS[\s\S]*INSERT INTO kill_aura_kills[\s\S]*INSERT INTO kill_aura_hourly_kills[\s\S]*date_trunc\('hour',NOW\(\)\)[\s\S]*kills=kill_aura_hourly_kills\.kills\+1/,
  'each credited kill must update the all-time and hourly counters atomically'
);
assert.match(historyMigration, /PRIMARY KEY \(account_id, mob_name, bucket\)/);
assert.match(
  indexSource,
  /kill-aura-section-title[\s\S]*Clock\.png[\s\S]*Kills Over Time[\s\S]*Netherite_Sword\.png[\s\S]*Kill Statistics[\s\S]*Iron_Sword\.png[\s\S]*Combat Details/,
  'each Kill Aura data section must have a recognizable Minecraft emblem'
);
assert.match(
  stylesSource,
  /@media \(max-width: 760px\)[\s\S]*\.kill-aura-history-panel \.rank-item:has\(\.rank-index\)[^{]*\{[^}]*grid-template-columns:\s*32px minmax\(0, 1fr\) auto;[\s\S]*\.kill-aura-data-grid \.detail-list div\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\) auto;/,
  'mobile Kill Aura rank and detail entries must stay on one compact row'
);

console.log('Kill Aura UI tests passed.');
