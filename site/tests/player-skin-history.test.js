'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { resolveOfficialMinecraftSkin } = require('../minecraft-avatar');

const root = path.resolve(__dirname, '..', '..');
const siteMigration = fs.readFileSync(path.join(root, 'site/migrations/052_player_skin_history.sql'), 'utf8');
const botMigration = fs.readFileSync(path.join(root, 'database/migrations/052_player_skin_history.sql'), 'utf8');
const siteCapeMigration = fs.readFileSync(path.join(root, 'site/migrations/053_player_skin_capes.sql'), 'utf8');
const botCapeMigration = fs.readFileSync(path.join(root, 'database/migrations/053_player_skin_capes.sql'), 'utf8');
const siteCapeHistoryMigration = fs.readFileSync(path.join(root, 'site/migrations/054_player_cape_history.sql'), 'utf8');
const botCapeHistoryMigration = fs.readFileSync(path.join(root, 'database/migrations/054_player_cape_history.sql'), 'utf8');
const serverSource = fs.readFileSync(path.join(root, 'site/server.js'), 'utf8');
const appSource = fs.readFileSync(path.join(root, 'site/public/app.js'), 'utf8');
const htmlSource = fs.readFileSync(path.join(root, 'site/public/index.html'), 'utf8');
const viewerSource = fs.readFileSync(path.join(root, 'site/public/minecraft-skin-viewer.js'), 'utf8');

assert.equal(siteMigration, botMigration, 'bot and site must apply the same skin-history schema');
assert.equal(siteCapeMigration, botCapeMigration, 'bot and site must apply the same cape-history schema');
assert.equal(siteCapeHistoryMigration, botCapeHistoryMigration, 'bot and site must apply the same independent cape-history schema');
assert.match(siteMigration, /UNIQUE \(player_uuid, texture_hash\)/, 'a player skin must be stored only once');
assert.match(siteCapeHistoryMigration, /UNIQUE \(player_uuid, cape_hash\)[\s\S]*INSERT INTO player_cape_history/, 'cape history must be unique and backfilled from saved skins');
assert.match(serverSource, /ON CONFLICT\(player_uuid,texture_hash\)[\s\S]*last_seen=NOW\(\)/, 're-observed skins must update their last-seen time');
assert.match(serverSource, /ON CONFLICT\(player_uuid,cape_hash\)[\s\S]*cape_url=EXCLUDED\.cape_url,last_seen=NOW\(\)/, 're-observed capes must update their last-seen time');
assert.match(serverSource, /\/api\/player-skins/, 'the authenticated skin-history endpoint must exist');
assert.match(serverSource, /textures\.minecraft\.net/, 'raw skin proxying must be restricted to the official texture host');
assert.match(serverSource, /\/api\/minecraft-cape\//, 'official cape textures must be available to the elytra renderer');
assert.match(appSource, /data-player-skins[\s\S]*openPlayerSkins/, 'the profile avatar must open the skin wardrobe');
assert.match(appSource, /openPlayerSkins\(username\)[\s\S]*fetchJson\(`\/api\/player-skins\?username=/, 'the skin wardrobe must use the dashboard JSON request helper');
assert.doesNotMatch(appSource, /\bgetJson\(/, 'the skin wardrobe must not call an undefined request helper');
assert.match(appSource, /data-player-skin-hash/, 'saved skins must be selectable');
assert.match(appSource, /Cape history[\s\S]*data-player-cape-hash[\s\S]*selectPlayerCape/, 'saved capes must be rendered in a selectable wardrobe');
assert.match(htmlSource, /id="playerSkinsOverlay"[\s\S]*skinview3d\.bundle\.js[\s\S]*minecraft-skin-viewer\.js/, 'the skin dialog and renderer bundle must be loaded in dependency order');
assert.match(serverSource, /mount: '\/vendor\/skinview3d'[\s\S]*SKINVIEW3D_BUNDLES_DIR/, 'the pinned local renderer bundle must be served by the site');
assert.match(viewerSource, /new skinview3d\.SkinViewer[\s\S]*enableControls: true/, 'skinview3d controls must allow free model rotation');
assert.match(viewerSource, /new skinview3d\.WalkingAnimation[\s\S]*walkingAnimation\.speed = 1/, 'the model must use the natural walking animation pace');
assert.match(viewerSource, /onAnimationPointerUp[\s\S]*toggleAnimation\(\)[\s\S]*walkingAnimation\.paused = !this\.walkingAnimation\.paused/, 'a click without dragging must pause or resume the animation');
assert.match(appSource, /skinvieweranimationchange[\s\S]*Animation paused · Click to resume/, 'the skin viewer must explain its current animation state');
assert.match(viewerSource, /loadCape\(capeUrl, \{ backEquipment:'elytra' \}\)/, 'official cape textures must use skinview3d elytra geometry and UV mapping');
assert.doesNotMatch(viewerSource, /drawPixelFace|wingWorldPoints|runPhase/, 'the old pixel-grid renderer must not remain in the adapter');

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
    model:'slim',
    capeHash:null,
    capeUrl:null
  });
  console.log('Player skin history tests passed.');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
