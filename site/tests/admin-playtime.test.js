'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { parsePlaytimeSeconds, setAdminPlaytime } = require('../server');

const admin = { username:'SiteAdmin', role:'admin', status:'approved' };

async function testCopiedPlaytimeResponse() {
  assert.equal(
    parsePlaytimeSeconds('20 days 15 hours 19 minutes 30 seconds. [329/50368]'),
    1_783_170,
    'a full copied !pt response must be accepted by the admin endpoint'
  );
  assert.equal(parsePlaytimeSeconds('2d 3h 4m'), 183_840);
  assert.equal(parsePlaytimeSeconds('2 days unexpected text'), null);
}

async function testPlaytimeWrite() {
  const queries = [];
  const audits = [];
  const database = {
    async query(sql, params) {
      queries.push({ sql:String(sql).replace(/\s+/g, ' ').trim(), params });
      return { rows:[{ username:'CurrentName' }], rowCount:1 };
    }
  };
  const result = await setAdminPlaytime(admin, {
    line:'OldName: 20 days 15 hours 19 minutes 30 seconds. [329/50368]'
  }, database, entry => audits.push(entry));

  assert.deepEqual(result, {
    username:'CurrentName',
    totalSeconds:1_783_170,
    playtime:'20d 15h 19m'
  });
  assert.deepEqual(queries[0].params, ['OldName', 1_783_170]);
  assert.match(queries[0].sql, /player_name_history pnh/, 'old player names must resolve to the UUID-owned playtime row');
  assert.equal(audits[0].category, 'admin_data');
  assert.deepEqual(audits[0].details, { username:'OldName', totalSeconds:1_783_170 });
}

async function testValidation() {
  const unusedDatabase = { query:async () => { throw new Error('must not query'); } };
  await assert.rejects(
    setAdminPlaytime(admin, { line:'missing separator' }, unusedDatabase, () => {}),
    error => error.statusCode === 400 && /Use format/.test(error.message)
  );
  await assert.rejects(
    setAdminPlaytime(admin, { line:'Player: unknown duration' }, unusedDatabase, () => {}),
    error => error.statusCode === 400 && /parse playtime/.test(error.message)
  );
}

function testUiFeedback() {
  const root = path.resolve(__dirname, '..', '..');
  const html = fs.readFileSync(path.join(root, 'site', 'public', 'index.html'), 'utf8');
  const app = fs.readFileSync(path.join(root, 'site', 'public', 'app.js'), 'utf8');
  const styles = fs.readFileSync(path.join(root, 'site', 'public', 'styles.css'), 'utf8');

  assert.match(html, /id="adminDataToast"[^>]*role="status"[^>]*aria-live="polite"[\s\S]*id="adminDataToastTitle"[\s\S]*id="adminDataToastMessage"/,
    'playtime and registration updates must expose a centered toast');
  assert.doesNotMatch(html, /id="adminPlayerDataNotice"/,
    'the old inline confirmation must not duplicate toast notifications');
  assert.doesNotMatch(app, /setAdminPlayerDataNotice/,
    'player-data results must have a single notification path');
  assert.match(app, /title:'Playtime updated'[\s\S]*title:'Registration date updated'/,
    'both player-data actions must show successful toast notifications');
  assert.match(app, /kind:'error'[\s\S]*Could not update playtime[\s\S]*Could not update registration date/,
    'failed player-data actions must show their reason in an error toast');
  assert.match(app, /#adminPlaytimeInput'[\s\S]*event\.key !== 'Enter'[\s\S]*\.click\(\)/,
    'pressing Enter in the playtime field must submit it');
  assert.match(html, /id="adminPlaytimeMissingCount"[\s\S]*id="adminPlaytimeCommands"[^>]*aria-live="polite"/,
    'the card must expose the missing lookup count and live command list');
  assert.match(html, /class="admin-playtime-fallback"[\s\S]*id="adminPlaytimeInput"/,
    'manual entry must remain available as a fallback');
  assert.match(app, /function renderAdminPlaytimeCommands[\s\S]*data-copy-playtime-command[\s\S]*function copyAdminPlaytimeCommand/,
    'missing values must be rendered as copyable player-information commands');
  assert.match(app, /writeClipboardText\(command\)[\s\S]*Copied[\s\S]*Discord lookup channel/,
    'copying a command must give immediate clipboard feedback');
  assert.match(app, /player_info_updated[\s\S]*admin-player-info[\s\S]*loadAdminPlayers/,
    'Discord imports must refresh the admin command list without reloading the page');
  assert.match(styles, /\.admin-playtime-command-list[\s\S]*\.admin-playtime-command\.copied/,
    'the command list and copied state must be styled');
  assert.doesNotMatch(styles, /\.admin-player-data-notice/);
  assert.match(styles, /\.admin-data-toast\[data-kind="success"\][\s\S]*#48b978/,
    'successful player-data updates must have a styled success state');
  assert.match(styles, /\.admin-data-toast\.visible\s*\{[\s\S]*admin-data-toast-enter/,
    'the player-data toast must animate into the viewport');
  assert.match(styles, /admin-data-toast-success-icon-in[\s\S]*admin-data-toast-error-icon-in/,
    'success and error notifications must animate their icons independently');
  assert.match(styles, /admin-data-toast-progress var\(--admin-data-toast-duration/,
    'the notification must visualize its remaining lifetime');
  assert.match(styles, /prefers-reduced-motion: reduce[\s\S]*\.admin-data-toast::after[\s\S]*animation: none !important/,
    'notification animations must honor reduced-motion preferences');
  assert.match(app, /const durationMs = isError \? 9_000 : 6_000[\s\S]*--admin-data-toast-duration[\s\S]*void toast\.offsetWidth/,
    'repeated notifications must restart their animation and countdown');
}

(async () => {
  await testCopiedPlaytimeResponse();
  await testPlaytimeWrite();
  await testValidation();
  testUiFeedback();
  console.log('Admin playtime tests passed.');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
