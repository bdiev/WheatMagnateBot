'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { resolveOfficialMinecraftSkin } = require('../minecraft-avatar');
const { decodeNameMcCapeScript, parseNameMcCapes } = require('../namemc-capes');
const { createPlayerSkinHistoryService } = require('../player-skin-history');

const root = path.resolve(__dirname, '..', '..');
const siteMigration = fs.readFileSync(path.join(root, 'site/migrations/052_player_skin_history.sql'), 'utf8');
const botMigration = fs.readFileSync(path.join(root, 'database/migrations/052_player_skin_history.sql'), 'utf8');
const siteCapeMigration = fs.readFileSync(path.join(root, 'site/migrations/053_player_skin_capes.sql'), 'utf8');
const botCapeMigration = fs.readFileSync(path.join(root, 'database/migrations/053_player_skin_capes.sql'), 'utf8');
const siteCapeHistoryMigration = fs.readFileSync(path.join(root, 'site/migrations/054_player_cape_history.sql'), 'utf8');
const botCapeHistoryMigration = fs.readFileSync(path.join(root, 'database/migrations/054_player_cape_history.sql'), 'utf8');
const siteCapeMetadataMigration = fs.readFileSync(path.join(root, 'site/migrations/055_player_cape_metadata.sql'), 'utf8');
const botCapeMetadataMigration = fs.readFileSync(path.join(root, 'database/migrations/055_player_cape_metadata.sql'), 'utf8');
const serverSource = fs.readFileSync(path.join(root, 'site/server.js'), 'utf8');
const historySource = fs.readFileSync(path.join(root, 'site/player-skin-history.js'), 'utf8');
const botSource = fs.readFileSync(path.join(root, 'bot.js'), 'utf8');
const runtimeSource = fs.readFileSync(path.join(root, 'site/accounts/minecraft-bot-runtime.js'), 'utf8');
const appSource = fs.readFileSync(path.join(root, 'site/public/app.js'), 'utf8');
const htmlSource = fs.readFileSync(path.join(root, 'site/public/index.html'), 'utf8');
const viewerSource = fs.readFileSync(path.join(root, 'site/public/minecraft-skin-viewer.js'), 'utf8');
const stylesSource = fs.readFileSync(path.join(root, 'site/public/styles.css'), 'utf8');

assert.equal(siteMigration, botMigration, 'bot and site must apply the same skin-history schema');
assert.equal(siteCapeMigration, botCapeMigration, 'bot and site must apply the same cape-history schema');
assert.equal(siteCapeHistoryMigration, botCapeHistoryMigration, 'bot and site must apply the same independent cape-history schema');
assert.equal(siteCapeMetadataMigration, botCapeMetadataMigration, 'bot and site must apply the same cape metadata schema');
assert.match(siteMigration, /UNIQUE \(player_uuid, texture_hash\)/, 'a player skin must be stored only once');
assert.match(siteCapeHistoryMigration, /UNIQUE \(player_uuid, cape_hash\)[\s\S]*INSERT INTO player_cape_history/, 'cape history must be unique and backfilled from saved skins');
assert.match(historySource, /ON CONFLICT\(player_uuid,texture_hash\)[\s\S]*last_seen=NOW\(\)/, 're-observed skins must update their last-seen time');
assert.match(historySource, /ON CONFLICT\(player_uuid,cape_hash\)[\s\S]*cape_url=EXCLUDED\.cape_url,last_seen=NOW\(\)/, 're-observed capes must update their last-seen time');
assert.match(historySource, /resolveNameMcCapes[\s\S]*cape_source=EXCLUDED\.cape_source/, 'all NameMC profile capes must be imported with their metadata');
assert.match(botSource, /createPlayerSkinHistoryService\(\{ pool,forceCapeRefresh:true \}\)/, 'every join refresh must bypass the NameMC profile cache');
assert.match(serverSource, /currentCapeHash = await playerSkinHistory\.refreshOnce\(identity\)[\s\S]*return readPlayerSkinHistory\(identity/, 'the wardrobe must refresh the current skin before returning saved history');
assert.match(serverSource, /textureHash[\s\S]*const cacheKey = `v5:\$\{avatarIdentity\.toLowerCase\(\)\}:\$\{textureHash \|\| 'unknown'\}`/, 'avatar caching must be versioned by the current skin texture');
assert.match(serverSource, /renderOfficialMinecraftAvatar[\s\S]*const sources = minecraftAvatarSources/, 'site avatars must prefer the official Mojang texture over third-party renderers');
assert.match(serverSource, /const displayCapeRows = \[\.\.\.capeResult\.rows\]/, 'the wardrobe must show the complete saved Mojang and NameMC cape history');
assert.doesNotMatch(serverSource, /nameMcCapeRows\.length[\s\S]*cape_source !== 'namemc'/, 'NameMC imports must not hide older Mojang cape observations');
assert.match(historySource, /activeRefreshes\.get[\s\S]*activeRefreshes\.set/, 'concurrent external skin refreshes must be deduplicated');
assert.match(botSource, /bot\.on\('playerJoined'[\s\S]*schedulePlayerSkinHistoryRefresh\(player\)/, 'the primary bot must refresh skin history after every player join');
assert.match(runtimeSource, /bot\.on\?\.\('playerJoined'[\s\S]*this\.emit\('player-joined'/, 'managed Minecraft runtimes must forward player join events');
assert.match(botSource, /runtime\.on\('player-joined'[\s\S]*schedulePlayerSkinHistoryRefresh\(player/, 'managed accounts must refresh skin history from forwarded join events');
assert.match(serverSource, /\/api\/player-skins/, 'the authenticated skin-history endpoint must exist');
assert.match(serverSource, /textures\.minecraft\.net/, 'raw skin proxying must be restricted to the official texture host');
assert.match(serverSource, /\/api\/minecraft-cape\//, 'official cape textures must be available to the elytra renderer');
assert.match(appSource, /data-player-skins[\s\S]*openPlayerSkins/, 'the profile avatar must open the skin wardrobe');
assert.match(appSource, /profileAvatar\.src = playerHeadUrl\(payload\.username,96,\{ uuid:payload\.uuid,skinHash:skins\[0\]\.hash \}\)/, 'loading current skin history must refresh the visible profile avatar');
assert.match(appSource, /openPlayerSkins\(username\)[\s\S]*fetchJson\(`\/api\/player-skins\?username=/, 'the skin wardrobe must use the dashboard JSON request helper');
assert.doesNotMatch(appSource, /\bgetJson\(/, 'the skin wardrobe must not call an undefined request helper');
assert.match(appSource, /data-player-skin-hash/, 'saved skins must be selectable');
assert.match(appSource, /Cape history[\s\S]*data-player-cape-hash[\s\S]*selectPlayerCape/, 'saved capes must be rendered in a selectable wardrobe');
assert.match(appSource, /cape\.name \|\| \(current/, 'NameMC cape names must be shown in the wardrobe');
assert.match(appSource, /player-skins-skeleton-stage[\s\S]*Loading skin wardrobe/, 'the skin wardrobe must render a structural loading skeleton');
assert.match(appSource, /PLAYER_SKIN_BACKGROUNDS[\s\S]*preparePlayerSkinBackground\(overlay\)[\s\S]*player-skins-skeleton-stage/, 'a rotating scene background must begin loading before the wardrobe skeleton is rendered');
assert.match(stylesSource, /player-skin-stage::before,[\s\S]*player-skins-skeleton-stage::before[\s\S]*filter:blur\(3px\)/, 'the viewer and its skeleton must share the blurred scene background');
assert.match(htmlSource, /id="playerSkinsOverlay"[\s\S]*skinview3d\.bundle\.js[\s\S]*minecraft-skin-viewer\.js/, 'the skin dialog and renderer bundle must be loaded in dependency order');
assert.match(serverSource, /mount: '\/vendor\/skinview3d'[\s\S]*SKINVIEW3D_BUNDLES_DIR/, 'the pinned local renderer bundle must be served by the site');
assert.match(viewerSource, /new skinview3d\.SkinViewer[\s\S]*enableControls: true/, 'skinview3d controls must allow free model rotation');
assert.match(viewerSource, /new (?:skinview3d\.WalkingAnimation|WalkingAnimationWithElytra)[\s\S]*walkingAnimation\.speed = 1/, 'the model must use the natural walking animation pace');
assert.match(viewerSource, /onAnimationPointerUp[\s\S]*toggleAnimation\(\)[\s\S]*walkingAnimation\.paused = !this\.walkingAnimation\.paused/, 'a click without dragging must pause or resume the animation');
assert.match(appSource, /skinvieweranimationchange[\s\S]*Animation paused · Click to resume/, 'the skin viewer must explain its current animation state');
assert.match(viewerSource, /loadCape\(capeUrl, \{ backEquipment:'elytra' \}\)/, 'official cape textures must use skinview3d elytra geometry and UV mapping');
assert.doesNotMatch(viewerSource, /drawPixelFace|wingWorldPoints|runPhase/, 'the old pixel-grid renderer must not remain in the adapter');

const parsedNameMcCapes = parseNameMcCapes(`
  **Capes (2)**
  [](http://namemc.com/cape/fd7c1a3d5fa7a9f1 "Crafter")
  [](https://namemc.com/cape/ff3b90ad33a937ef "Moonlight Trail")
  [](http://namemc.com/cape/fd7c1a3d5fa7a9f1 "Crafter")
`);
assert.deepEqual(parsedNameMcCapes, [
  { hash:'fd7c1a3d5fa7a9f1',name:'Crafter',source:'namemc' },
  { hash:'ff3b90ad33a937ef',name:'Moonlight Trail',source:'namemc' }
]);
const pngSignature = Buffer.from([137,80,78,71,13,10,26,10]);
assert.deepEqual(
  decodeNameMcCapeScript('fd7c1a3d5fa7a9f1',`nmci({"fd7c1a3d5fa7a9f1":"${pngSignature.toString('base64')}"});`),
  pngSignature,
  'NameMC JSONP cape textures must be decoded safely'
);

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

  const statements = [];
  let skinCalls = 0;
  let capeRequest = null;
  let releaseSkin;
  const skinGate = new Promise(resolve => { releaseSkin = resolve; });
  const service = createPlayerSkinHistoryService({
    pool:{ query:async (sql,params) => { statements.push({ sql,params }); return { rows:[],rowCount:1 }; } },
    forceCapeRefresh:true,
    resolveSkin:async () => {
      skinCalls += 1;
      await skinGate;
      return {
        textureHash:'skin-hash',textureUrl:'https://textures.minecraft.net/texture/skin-hash',model:'classic',
        capeHash:'mojang-cape',capeUrl:'https://textures.minecraft.net/texture/mojang-cape'
      };
    },
    resolveCapes:async options => {
      capeRequest = options;
      return {
        capes:[{ hash:'1234567890abcdef',name:'Test Cape' }],
        currentCapeHash:'1234567890abcdef'
      };
    }
  });
  const identity = { username:'TestPlayer',player_uuid:'12345678-90ab-cdef-1234-567890abcdef' };
  const firstRefresh = service.refreshOnce(identity);
  const duplicateRefresh = service.refreshOnce(identity);
  assert.equal(firstRefresh,duplicateRefresh,'simultaneous join observers must share one skin refresh');
  releaseSkin();
  assert.equal(await firstRefresh,'1234567890abcdef');
  assert.equal(skinCalls,1,'a deduplicated join must call Mojang once');
  assert.equal(capeRequest.forceRefresh,true,'join refreshes must bypass the cached NameMC profile');
  assert.equal(statements.length,3,'skin, official cape, and NameMC cape history must all be persisted');
  assert.match(statements[0].sql,/INSERT INTO player_skin_history/);
  assert.match(statements[2].sql,/cape_source/);
  console.log('Player skin history tests passed.');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
