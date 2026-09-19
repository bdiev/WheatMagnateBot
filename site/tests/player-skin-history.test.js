'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { resolveOfficialMinecraftSkin } = require('../minecraft-avatar');

const root = path.resolve(__dirname, '..', '..');
const siteMigration = fs.readFileSync(path.join(root, 'site/migrations/052_player_skin_history.sql'), 'utf8');
const botMigration = fs.readFileSync(path.join(root, 'database/migrations/052_player_skin_history.sql'), 'utf8');
const serverSource = fs.readFileSync(path.join(root, 'site/server.js'), 'utf8');
const appSource = fs.readFileSync(path.join(root, 'site/public/app.js'), 'utf8');
const htmlSource = fs.readFileSync(path.join(root, 'site/public/index.html'), 'utf8');
const viewerSource = fs.readFileSync(path.join(root, 'site/public/minecraft-skin-viewer.js'), 'utf8');

assert.equal(siteMigration, botMigration, 'bot and site must apply the same skin-history schema');
assert.match(siteMigration, /UNIQUE \(player_uuid, texture_hash\)/, 'a player skin must be stored only once');
assert.match(serverSource, /ON CONFLICT\(player_uuid,texture_hash\)[\s\S]*last_seen=NOW\(\)/, 're-observed skins must update their last-seen time');
assert.match(serverSource, /\/api\/player-skins/, 'the authenticated skin-history endpoint must exist');
assert.match(serverSource, /textures\.minecraft\.net/, 'raw skin proxying must be restricted to the official texture host');
assert.match(appSource, /data-player-skins[\s\S]*openPlayerSkins/, 'the profile avatar must open the skin wardrobe');
assert.match(appSource, /openPlayerSkins\(username\)[\s\S]*fetchJson\(`\/api\/player-skins\?username=/, 'the skin wardrobe must use the dashboard JSON request helper');
assert.doesNotMatch(appSource, /\bgetJson\(/, 'the skin wardrobe must not call an undefined request helper');
assert.match(appSource, /data-player-skin-hash/, 'saved skins must be selectable');
assert.match(htmlSource, /id="playerSkinsOverlay"[\s\S]*minecraft-skin-viewer\.js/, 'the skin dialog and local renderer must be loaded');
assert.match(viewerSource, /pointerdown[\s\S]*pointermove[\s\S]*ArrowLeft/, 'the model must support pointer and keyboard rotation');

(async () => {
  const uuid = '1234567890abcdef1234567890abcdef';
  const hash = 'a'.repeat(64);
  const encoded = Buffer.from(JSON.stringify({
    textures: { SKIN: { url:`http://textures.minecraft.net/texture/${hash}`, metadata:{ model:'slim' } } }
  })).toString('base64');
  const resolved = await resolveOfficialMinecraftSkin({
    uuid,
    fetchImpl: async url => {
      assert.match(String(url), new RegExp(uuid));
      return { ok:true, json:async () => ({ properties:[{ name:'textures',value:encoded }] }) };
    }
  });
  assert.deepEqual(resolved, {
    uuid,
    textureHash:hash,
    textureUrl:`https://textures.minecraft.net/texture/${hash}`,
    model:'slim'
  });
  console.log('Player skin history tests passed.');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
