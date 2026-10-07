'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require('@electric-sql/pglite');
const {
  bearerToken,
  cleanFindName,
  createAreaExplorerService,
  dedupeKey,
  lootValue,
  normalizeCoverage,
  normalizeEvent,
  normalizeFind,
  normalizeStatus,
  publicStatus
} = require('../area-explorer');

const migrationSql = fs.readFileSync(path.join(__dirname, '..', 'migrations', '067_area_explorer.sql'), 'utf8');
const markersMigrationSql = fs.readFileSync(path.join(__dirname, '..', 'migrations', '070_area_explorer_markers.sql'), 'utf8');
const statusYMigrationSql = fs.readFileSync(path.join(__dirname, '..', 'migrations', '071_area_explorer_status_y.sql'), 'utf8');
const pickedUpMigrationSql = fs.readFileSync(path.join(__dirname, '..', 'migrations', '072_area_explorer_picked_up.sql'), 'utf8');
const indexSource = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
const appSource = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');
const serverSource = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

const NOW = Date.UTC(2026, 9, 5, 12, 0, 0);

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/** PGlite behind the slice of pg's Pool the service uses. */
function poolFor(db) {
  const query = async (sql, params) => db.query(sql, params);
  return { query, connect: async () => ({ query, release() {} }) };
}

function testNormalization() {
  const sign = normalizeFind({ kind: 'sign', x: 10, y: 64, z: -20, foundAt: NOW, name: ' Oak Sign ', details: 'Hello\r\nworld\u0007' }, NOW);
  assert.equal(sign.kind, 'SIGN');
  assert.equal(sign.name, 'Oak Sign');
  assert.equal(sign.details, 'Hello\nworld', 'sign text keeps its lines, loses control characters');
  assert.equal(sign.count, 0);

  const item = normalizeFind({ kind: 'ITEM', x: 1, y: 2, z: 3, foundAt: '2026-10-05T10:00:00Z', name: 'Elytra', count: 0 }, NOW);
  assert.equal(item.count, 1, 'an item counts at least one');
  assert.equal(dedupeKey(item), 'ITEM:1:2:3:Elytra:1:');

  assert.equal(normalizeFind({ kind: 'CHEST', x: 1, y: 2, z: 3, foundAt: NOW, name: 'x' }, NOW), null);
  assert.equal(normalizeFind({ kind: 'SIGN', x: 1.5, y: 2, z: 3, foundAt: NOW, name: 'x' }, NOW), null, 'coordinates are whole blocks');
  assert.equal(normalizeFind({ kind: 'SIGN', x: 40_000_000, y: 2, z: 3, foundAt: NOW, name: 'x' }, NOW), null);
  assert.equal(normalizeFind({ kind: 'SIGN', x: 1, y: 2, z: 3, foundAt: NOW + 3 * 86_400_000, name: 'x' }, NOW), null, 'no finds from the future');
  assert.equal(normalizeFind({ kind: 'SIGN', x: 1, y: 2, z: 3, foundAt: NOW, name: '' }, NOW), null);

  const status = normalizeStatus({ phase: 'sweep', percent: 140, etaSeconds: -5, x: 5, z: 6, paused: 'yes', area: { minX: 1, minZ: 2, maxX: 3 } });
  assert.equal(status.phase, 'SWEEP');
  assert.equal(status.percent, 100);
  assert.equal(status.etaSeconds, null);
  assert.equal(status.paused, false, 'only a real true pauses');
  assert.equal(normalizeStatus({ yaw: -450 }).yaw, 270);
  assert.equal(normalizeStatus({ yaw: null }).yaw, null);
  assert.equal(normalizeStatus({ yaw: 'invalid' }).yaw, null);
  assert.equal(status.area, null, 'an area needs all four sides');

  assert.equal(bearerToken({ headers: { authorization: 'Bearer aex_0123456789abcdef' } }), 'aex_0123456789abcdef');
  assert.equal(bearerToken({ headers: { authorization: 'Basic abc' } }), '');
}

function testLootValue() {
  assert.ok(lootValue('Elytra') > lootValue('Netherite Chestplate'));
  assert.ok(lootValue('Netherite Chestplate') > lootValue('Diamond Chestplate'));
  assert.equal(lootValue('Red Shulker Box'), lootValue('Shulker Box'), 'every colour of shulker box alike');
  assert.ok(lootValue('Written Book') > 0 && lootValue('Map') > 0 && lootValue('Enchanted Book') > 0);
  assert.equal(lootValue('Cobblestone'), 0, 'not worth listing');
}

function testStatusOnline() {
  const row = { token_id: 1, phase: 'SWEEP', updated_at: new Date(NOW - 30_000), percent: '42.5' };
  assert.equal(publicStatus(row, NOW).online, true);
  assert.equal(publicStatus(row, NOW).percent, 42.5);
  assert.equal(publicStatus({ ...row, updated_at: new Date(NOW - 120_000) }, NOW).online, false, 'silent for long: offline');
  assert.equal(publicStatus({ ...row, phase: 'IDLE' }, NOW).online, false, 'a stopped run is not online');
}

async function testIngestAndQueries() {
  const db = new PGlite();
  try {
    await db.exec(migrationSql);
    await db.exec(statusYMigrationSql);
    await db.exec(pickedUpMigrationSql);
    await db.exec(fs.readFileSync(path.join(__dirname, '../migrations/072_area_explorer_yaw.sql'), 'utf8'));
    await db.exec(fs.readFileSync(path.join(__dirname, '../migrations/074_area_explorer_coverage.sql'), 'utf8'));
    await db.exec(fs.readFileSync(path.join(__dirname, '../migrations/076_area_explorer_commands.sql'), 'utf8'));
    await db.exec(fs.readFileSync(path.join(__dirname, '../migrations/073_area_explorer_events.sql'), 'utf8'));
    const published = [];
    const logs = [];
    const service = createAreaExplorerService({
      pool: poolFor(db),
      hashToken,
      readJsonBody: async () => ({}),
      sendJson() {},
      sendError() {},
      enforceRateLimit: () => true,
      publish: (type, payload) => published.push({ type, payload }),
      recordSystemLog: async entry => logs.push(entry)
    });
    const admin = { username: 'admin', role: 'admin' };

    const created = await service.createToken(admin, { name: 'Gaming PC' });
    assert.match(created.token, /^aex_[A-Za-z0-9_-]{40,}$/);
    assert.equal(created.record.hint, created.token.slice(-4));
    const stored = await db.query('SELECT token_hash FROM area_explorer_tokens');
    assert.equal(stored.rows[0].token_hash, hashToken(created.token), 'only the hash is stored');
    assert.equal(logs.length, 1);

    const token = await service.authenticate({ headers: { authorization: `Bearer ${created.token}` } });
    assert.equal(token.name, 'Gaming PC');
    assert.equal(await service.authenticate({ headers: { authorization: 'Bearer aex_wrongwrongwrong' } }), null);

    const batch = {
      server: 'OldFrog.org',
      dimension: 'overworld',
      finds: [
        { kind: 'SIGN', x: 1, y: 64, z: 1, foundAt: NOW - 1000, name: 'Oak Sign', details: 'Welcome\nto spawn' },
        { kind: 'SIGN', x: 1, y: 64, z: 1, foundAt: NOW, name: 'Oak Sign', details: 'Welcome\nto spawn' },
        { kind: 'ITEM', x: 5, y: 70, z: 5, foundAt: NOW, name: 'Elytra', count: 1, label: 'Wings' },
        { kind: 'BASE', x: 1000, y: 40, z: 1000, foundAt: NOW, name: 'Base #1', details: 'score 30: ender chest' },
        { kind: 'BASE', x: 1030, y: 40, z: 1040, foundAt: NOW, name: 'Base #2', details: 'score 20' },
        { kind: 'BASE', x: 1100, y: 40, z: 1000, foundAt: NOW, name: 'Base #3', details: 'score 25' },
        { kind: 'NOPE', x: 0, y: 0, z: 0, foundAt: NOW, name: 'x' }
      ],
      status: { player: 'Steve', phase: 'SWEEP', mode: 'Area', percent: 12.5, etaSeconds: 3600, x: 10, y: -40, z: 20, yaw: -90, runFinds: { bases: 2, signs: 1, items: 1 } }
    };
    const first = await service.ingest(token, batch, NOW);
    assert.deepEqual(first, { received: 7, accepted: 6, added: 4, duplicates: 2 },
      'the second sign is the same block; Base #2 is within 64 blocks of Base #1');

    const again = await service.ingest(token, { ...batch, status: undefined }, NOW);
    assert.equal(again.added, 0, 'sending the same finds again adds nothing');

    await service.ingest(token, { server: 'oldfrog.org', dimension: 'the_nether', finds: [batch.finds[0]] }, NOW);

    const summary = await service.getSummary();
    const overworld = summary.scopes.find(scope => scope.dimension === 'overworld');
    assert.equal(overworld.server, 'oldfrog.org', 'server names are kept lower-case');
    assert.deepEqual([overworld.bases, overworld.signs, overworld.items], [2, 1, 1]);
    assert.equal(summary.scopes.length, 2);
    assert.equal(summary.statuses.length, 1);
    assert.equal(summary.statuses[0].player, 'Steve');
    assert.equal(summary.statuses[0].yaw, 270);
    assert.equal(published[0].payload.liveStatus.yaw, 270);
    assert.equal(published[0].payload.liveStatus.x, 10);
    const liveResponse = await service.handleApi({ method: 'GET' }, admin, new URL('http://x/api/area-explorer/live'), {});
    assert.equal(liveResponse.statusCode, 200);
    assert.equal(liveResponse.payload.statuses[0].yaw, 270);
    assert.equal(liveResponse.payload.scopes, undefined, 'live polling does not count or reload finds');
    assert.match(liveResponse.payload.versions.finds, /^\d+$/, 'but it says how far the finds have got, for pages without the live stream');
    assert.ok(Number(liveResponse.payload.versions.finds) > 0);
    assert.equal(summary.statuses[0].tokenName, 'Gaming PC');
    assert.equal(summary.statuses[0].runFinds.bases, 2);
    assert.deepEqual([summary.statuses[0].x, summary.statuses[0].y, summary.statuses[0].z], [10, -40, 20], 'the explorer\'s height comes with its position');

    const url = query => new URL(`http://x/api/area-explorer/finds?${query}`);
    const searched = await service.getFinds(url('server=oldfrog.org&dimension=overworld&q=SPAWN'));
    assert.equal(searched.total, 1);
    assert.equal(searched.finds[0].details, 'Welcome\nto spawn');
    const wildcard = await service.getFinds(url('q=%25'));
    assert.equal(wildcard.total, 0, 'a % in the search is a literal %');
    const bases = await service.getFinds(url('kind=base&dimension=overworld'));
    assert.deepEqual(bases.finds.map(find => find.name).sort(), ['Base #1', 'Base #3']);
    const paged = await service.getFinds(url('limit=1&offset=1&dimension=overworld'));
    assert.equal(paged.finds.length, 1);
    assert.equal(paged.total, 4);

    const map = await service.getMapPoints(new URL('http://x/api/area-explorer/map?dimension=overworld'));
    assert.equal(map.points.length, 4);
    assert.equal(map.points.every(point => point.length === 4), true, 'a point is just [id, kind, x, z]');
    const inView = await service.getMapPoints(new URL('http://x/api/area-explorer/map?dimension=overworld&minX=-10&minZ=-10&maxX=10&maxZ=10'));
    assert.deepEqual(inView.points.map(point => [point[2], point[3]]).sort(), [[1, 1], [5, 5]], 'only the part of the map in view');

    // Sorting: by name, and nearest a spot
    const byName = await service.getFinds(url('dimension=overworld&sort=name'));
    assert.deepEqual(byName.finds.map(find => find.name), ['Base #1', 'Base #3', 'Elytra', 'Oak Sign']);
    const nearest = await service.getFinds(url('dimension=overworld&sort=nearest&nearX=1090&nearZ=1000'));
    assert.equal(nearest.finds[0].name, 'Base #3', 'the closest to the spot first');
    assert.equal(nearest.finds.at(-1).name, 'Oak Sign');
    const summaryScope = (await service.getSummary()).scopes.find(scope => scope.dimension === 'overworld');
    assert.deepEqual(summaryScope.valuableItems, [{ name: 'Elytra', count: 1, items: 1, value: 95 }], 'the most valuable loot');
    assert.ok(summaryScope.latest?.name, 'and the latest find');

    // Loot picked up in game comes off the site, and the mod sending it again doesn't bring it back
    const elytra = byName.finds.find(find => find.name === 'Elytra');
    const sign = byName.finds.find(find => find.name === 'Oak Sign');
    const asAdmin = { assertAdmin() {}, readBody: async () => ({}) };
    await assert.rejects(service.handleApi({ method: 'DELETE' }, { username: 'viewer', role: 'user' },
      new URL(`http://x/api/area-explorer/finds/${elytra.id}`),
      { assertAdmin() { throw Object.assign(new Error('Admin access required.'), { statusCode: 403 }); }, readBody: async () => ({}) }),
    /Admin access required/, 'only administrators take loot off');
    const removed = await service.handleApi({ method: 'DELETE' }, admin, new URL(`http://x/api/area-explorer/finds/${elytra.id}`), asAdmin);
    assert.equal(removed.payload.removed.name, 'Elytra');
    assert.ok(published.some(event => event.payload.removed === elytra.id), 'open pages hear of it');
    assert.equal((await service.getFinds(url('dimension=overworld'))).total, 3);
    assert.equal((await service.getMapPoints(new URL('http://x/api/area-explorer/map?dimension=overworld'))).points.length, 3);
    await assert.rejects(service.getFind(elytra.id), /not found/);
    const afterPickup = (await service.getSummary()).scopes.find(scope => scope.dimension === 'overworld');
    assert.equal(afterPickup.items, 0);
    assert.deepEqual(afterPickup.valuableItems, []);
    const sentAgain = await service.ingest(token, { server: 'oldfrog.org', dimension: 'overworld', finds: [batch.finds[2]] }, NOW);
    assert.equal(sentAgain.added, 0, 'the mod sending it again does not bring it back');
    await assert.rejects(service.removeFind(admin, elytra.id), /removed already/);
    await assert.rejects(service.removeFind(admin, sign.id), /removed already/, 'signs are not taken off');

    const routed = await service.handleApi({ method: 'GET' }, { username: 'viewer', role: 'user' },
      new URL('http://x/api/area-explorer/summary'), { assertAdmin() { throw new Error('not for viewers'); }, readBody: async () => ({}) });
    assert.equal(routed.statusCode, 200, 'any signed-in user reads the summary');
    await assert.rejects(service.handleApi({ method: 'GET' }, { username: 'viewer', role: 'user' },
      new URL('http://x/api/admin/area-explorer/tokens'), {
        assertAdmin(user) { if (user.role !== 'admin') throw Object.assign(new Error('Admin access required.'), { statusCode: 403 }); },
        readBody: async () => ({})
      }), /Admin access required/, 'tokens are for administrators');

    await service.revokeToken(admin, created.record.id);
    assert.equal(await service.authenticate({ headers: { authorization: `Bearer ${created.token}` } }), null, 'a revoked token stops working');
    assert.equal((await service.getSummary()).statuses.length, 0, 'a revoked token\'s status is hidden');
    assert.ok(published.some(event => event.type === 'area_explorer_updated' && event.payload.added === 4));
  } finally {
    await db.close();
  }
}

async function testMarkers() {
  const db = new PGlite();
  try {
    await db.exec(migrationSql);
    // A database from before markers: their kind is added to the check
    await assert.rejects(db.query(`INSERT INTO area_explorer_finds (server, dimension, kind, x, y, z, found_at, name, dedupe_key)
      VALUES ('a', 'overworld', 'MARKER', 0, 0, 0, NOW(), 'End Portal', 'k')`), /check/i);
    await db.exec(markersMigrationSql);
    await db.exec(statusYMigrationSql);
    await db.exec(pickedUpMigrationSql);
    await db.exec(fs.readFileSync(path.join(__dirname, '../migrations/072_area_explorer_yaw.sql'), 'utf8'));
    await db.exec(fs.readFileSync(path.join(__dirname, '../migrations/074_area_explorer_coverage.sql'), 'utf8'));
    await db.exec(fs.readFileSync(path.join(__dirname, '../migrations/076_area_explorer_commands.sql'), 'utf8'));
    const service = createAreaExplorerService({
      pool: poolFor(db), hashToken, readJsonBody: async () => ({}), sendJson() {}, sendError() {}, enforceRateLimit: () => true
    });
    const token = (await db.query(`INSERT INTO area_explorer_tokens (name, token_hash, token_hint) VALUES ('PC', 'h', 'h') RETURNING id, name`)).rows[0];
    const marker = (name, x, z) => ({ kind: 'MARKER', x, y: 30, z, foundAt: NOW, name });
    const result = await service.ingest(token, {
      server: 'oldfrog.org', dimension: 'overworld',
      finds: [marker('End Portal', 100, 200), marker('End Portal', 100, 200), marker('Shulker Box', 5, 5), marker('Shulker Box', 900, 5), marker('Spawner', 0, 0),
        { kind: 'SIGN', x: 1, y: 64, z: 1, foundAt: NOW, name: 'Oak Sign', details: 'hi' }]
    }, NOW);
    assert.deepEqual([result.added, result.duplicates], [5, 1], 'a marker is one per block and name');

    const overworld = (await service.getSummary()).scopes[0];
    assert.equal(overworld.markers, 4);
    assert.deepEqual(overworld.markerNames, [{ name: 'Shulker Box', count: 2 }, { name: 'End Portal', count: 1 }, { name: 'Spawner', count: 1 }],
      'what the markers mark, most first');

    const url = query => new URL(`http://x/api/area-explorer/finds?${query}`);
    assert.equal((await service.getFinds(url('kind=MARKER'))).total, 4);
    const shulkers = await service.getFinds(url('kind=marker&name=Shulker%20Box'));
    assert.deepEqual(shulkers.finds.map(find => [find.name, find.x]).sort(), [['Shulker Box', 5], ['Shulker Box', 900]]);
    assert.equal((await service.getFinds(url('name=Shulker%20Box'))).total, 5, 'the name only narrows markers');
    const points = await service.getMapPoints(new URL('http://x/api/area-explorer/map?kind=MARKER&name=End%20Portal'));
    assert.deepEqual(points.points.map(point => point.slice(1)), [['MARKER', 100, 200, 'End Portal']], "a marker's point carries its name");

    // A marker that's wrong or gone comes off the site, and the mod finding it again doesn't bring it back
    const gone = shulkers.finds.find(find => find.x === 5);
    const removed = await service.removeFind({ username: 'admin' }, gone.id);
    assert.equal(removed.removed.kind, 'MARKER');
    const afterRemoval = (await service.getSummary()).scopes[0];
    assert.equal(afterRemoval.markers, 3);
    assert.deepEqual(afterRemoval.markerNames.find(item => item.name === 'Shulker Box'), { name: 'Shulker Box', count: 1 });
    const again = await service.ingest(token, { server: 'oldfrog.org', dimension: 'overworld', finds: [marker('Shulker Box', 5, 5)] }, NOW);
    assert.equal(again.added, 0, 'sent again by the mod: stays off');
    assert.equal((await service.getFinds(url('kind=MARKER&name=Shulker%20Box'))).total, 1);
    const portal = (await service.getFinds(url('kind=MARKER&name=End%20Portal'))).finds[0];
    await assert.rejects(service.removeFind({ username: 'admin' }, portal.id), /removable marker/, 'an End Portal stays');
  } finally {
    await db.close();
  }
}

function testWiring() {
  assert.match(serverSource, /url\.pathname === '\/api\/area-explorer\/ingest'/, 'the ingest route is served');
  const ingestAt = serverSource.indexOf("url.pathname === '/api/area-explorer/ingest'");
  const originAt = serverSource.indexOf('const origin = validateOrigin(req');
  assert.ok(ingestAt > 0 && ingestAt < originAt, 'the mod has no browser Origin: ingest is routed before the origin and CSRF checks');
  assert.match(serverSource, /'area-explorer'/, 'the section is a known navigation section on the server');
  assert.match(indexSource, /data-tab="area-explorer"/);
  assert.match(indexSource, /id="tab-area-explorer"/);
  assert.match(appSource, /'area_explorer_updated'/, 'the page listens for live updates');
  assert.match(indexSource, /data-area-kind="MARKER"[^>]*><img src="\/items\/Ender_Eye\.png"[^>]*><span class="area-explorer-kind-tab-label">Markers<\/span> <span class="area-explorer-kind-tab-count" data-area-count="MARKER">/, 'markers have a filter of their own, with its icon');
  // Each find shows its own item: the book is a book, the shulker a shulker
  assert.match(appSource, /if \(find\.kind === 'ITEM' \|\| find\.kind === 'SIGN'\) \{\s+key = itemIdForName\(normalizeItemIconKey\(find\.name\)/);
  assert.match(appSource, /return state\.itemNameIds\[key\] \|\| key;/, 'names the game shows are turned into item ids: a map is a filled map, a trim its smithing template');
  assert.match(appSource, /'End Portal': 'ender_eye'/, 'a marker shows the item that stands for it');
  assert.match(appSource, /data-fallback="\$\{escapeHtml\(icon\.fallback\)\}"/, 'an icon that fails falls back to its kind');
  assert.match(appSource, /class="area-explorer-find-count"/, 'a stack shows its size on the icon');
  // The map across the whole width; the run, highlights and tokens in one column beside the finds
  const side = indexSource.slice(indexSource.indexOf('<div class="area-explorer-side">'), indexSource.indexOf('<section class="panel area-explorer-finds-panel">'));
  for (const panel of ['area-explorer-status-panel', 'area-explorer-highlights-panel', 'area-explorer-tokens-panel']) {
    assert.ok(side.includes(panel), `${panel} is in the side column`);
  }
  // The most valuable loot in the highlights; loot picked up in game taken off by an administrator
  assert.match(appSource, /Most valuable<\/span>/);
  assert.match(appSource, /scope\.valuableItems\.map\(/);
  assert.match(appSource, /const removable = find\.kind === 'ITEM' \|\| \(find\.kind === 'MARKER' && !AREA_EXPLORER_PERMANENT_MARKERS\.includes\(find\.name\)\);/, 'loot and markers, not signs or lasting structures');
  const { PERMANENT_MARKERS } = require('../area-explorer');
  assert.ok(appSource.includes(`const AREA_EXPLORER_PERMANENT_MARKERS = Object.freeze(${JSON.stringify(PERMANENT_MARKERS).replace(/"/g, "'").replace(/,/g, ', ')});`), 'the page and the site agree on them');
  assert.match(appSource, /const pickup = removable && state\.currentUser\?\.role === 'admin'/, 'only for administrators');
  assert.match(appSource, /await deleteJson\(`\/api\/area-explorer\/finds\/\$\{encodeURIComponent\(id\)\}`\);/);
  assert.match(appSource, /if \(payload\.added \|\| payload\.removed\) ae\.findsDirty = true;/, 'other open pages drop it too');
  // Highlights and the list's order
  for (const id of ['areaExplorerHighlights', 'areaExplorerSort']) {
    assert.ok(indexSource.includes(`id="${id}"`), `${id} is on the page`);
  }
  assert.match(appSource, /data-area-filter-kind="MARKER" data-area-filter-name=/, 'a marker highlight lists that kind of marker');
  assert.match(appSource, /sort: ae\.sort === 'newest' \? '' : ae\.sort, \.\.\.near/, 'the list asks for its order');
  assert.match(indexSource, /id="areaExplorerMarkerName"/, 'and a pick of what they mark');
  assert.match(appSource, /MARKER: 'Marker'/);
  assert.match(appSource, /name: areaExplorerMarkerFilter\(\)/, 'the pick narrows the list and the map');
  // The page: no hand-uploaded PNGs any more, the run's height shown, a map that works on a phone
  assert.doesNotMatch(indexSource, /xaeroMap|xaero-map-panel/, 'the Xaero PNG upload is gone');
  assert.doesNotMatch(appSource, /\/api\/area-explorer\/layers|setupXaeroMap/);
  assert.match(appSource, /` · Y \$\{status\.y\}`/, 'the run shows its Y between X and Z');
  for (const id of ['areaExplorerZoomIn', 'areaExplorerZoomOut', 'areaExplorerMapReset', 'areaExplorerFullscreen', 'areaExplorerSelected']) {
    assert.ok(indexSource.includes(`id="${id}"`), `${id} is on the map`);
  }
  assert.match(appSource, /if \(canvas\.width !== backingWidth \|\| canvas\.height !== backingHeight\)/, 'the canvas is only reallocated when its size changes');
  assert.match(appSource, /if \(full \|\| ae\.findsDirty \|\| ae\.pointsScope !== ae\.scope\)/, 'a status update does not reload every map point');
}

function testEventNormalization() {
  const event = normalizeEvent({ id: 'a1b2c3d4-0000', at: NOW, level: 'ERROR', type: 'Disconnect!', message: ' Kicked\u0007 for flying ', player: 'Steve', x: 10, z: -5 }, NOW);
  assert.equal(event.level, 'error', 'levels in lower case');
  assert.equal(normalizeEvent({ id: 'a1b2c3d4-0000', at: NOW, level: 'fatal', message: 'x' }, NOW).level, 'info', 'an unknown level is info');
  assert.equal(normalizeEvent({ id: 'a1b2c3d4-0000', at: NOW, level: 'error', message: 'x' }, NOW).level, 'error');
  assert.equal(event.type, 'disconnect');
  assert.equal(event.message, 'Kicked for flying');
  assert.equal(event.y, null, 'no Y given');
  assert.equal(normalizeEvent({ id: 'short', at: NOW, message: 'x' }, NOW), null, 'the id keeps a resend from being stored twice');
  assert.equal(normalizeEvent({ id: 'a1b2c3d4-0000', at: NOW, message: '' }, NOW), null);
  assert.equal(normalizeEvent({ id: 'a1b2c3d4-0000', at: NOW + 3 * 86_400_000, message: 'x' }, NOW), null);
}

/** However many finds there are, the map gets every one of them as a point. */
async function testMapCrowds() {
  const db = new PGlite();
  try {
    for (const file of ['067_area_explorer.sql', '070_area_explorer_markers.sql', '072_area_explorer_picked_up.sql', '077_area_explorer_finds_xz.sql']) {
      await db.exec(fs.readFileSync(path.join(__dirname, '../migrations', file), 'utf8'));
    }
    // 25,000 signs over 100,000 blocks, and a base
    await db.exec(`INSERT INTO area_explorer_finds (server, dimension, kind, x, y, z, found_at, name, dedupe_key)
      SELECT 's', 'overworld', 'SIGN', (i * 4) - 50000, 64, (i % 100) * 7, NOW(), 'Oak Sign', 'SIGN:' || i FROM generate_series(1, 25000) AS i`);
    await db.exec(`INSERT INTO area_explorer_finds (server, dimension, kind, x, y, z, found_at, name, dedupe_key)
      VALUES ('s', 'overworld', 'BASE', 0, 64, 0, NOW(), 'Base #1', 'BASE:0')`);
    const service = createAreaExplorerService({ pool: poolFor(db), hashToken, readJsonBody: async () => ({}), sendJson() {}, sendError() {}, enforceRateLimit: () => true });
    const all = await service.getMapPoints(new URL('http://x/api/area-explorer/map?server=s&dimension=overworld'));
    assert.equal(all.points.length, 25_001, 'every find, no cap');
    assert.ok(all.points.some(point => point[1] === 'BASE'), 'the base too');
  } finally {
    await db.close();
  }
}

async function testCommands() {
  const db = new PGlite();
  try {
    for (const file of ['067_area_explorer.sql', '070_area_explorer_markers.sql', '071_area_explorer_status_y.sql', '072_area_explorer_picked_up.sql',
      '072_area_explorer_yaw.sql', '073_area_explorer_events.sql', '074_area_explorer_coverage.sql', '076_area_explorer_commands.sql']) {
      await db.exec(fs.readFileSync(path.join(__dirname, '../migrations', file), 'utf8'));
    }
    const logs = [];
    const service = createAreaExplorerService({
      pool: poolFor(db), hashToken, readJsonBody: async () => ({}), sendJson() {}, sendError() {},
      enforceRateLimit: () => true, publish() {}, recordSystemLog: async entry => logs.push(entry)
    });
    const admin = { username: 'admin', role: 'admin' };
    const created = await service.createToken(admin, { name: 'PC' });
    const token = await service.authenticate({ headers: { authorization: `Bearer ${created.token}` } });
    const area = { kind: 'explore', tokenId: token.id, server: 'OldFrog.org', dimension: 'overworld', minX: 100, minZ: -40, maxX: -20, maxZ: 70 };

    await service.createCommand(admin, area);
    const { command } = await service.createCommand(admin, { ...area, kind: 'RESCAN' });
    assert.equal(command.size, '9x8 chunks', 'blocks out to whole chunks, corners in any order');
    assert.match(logs.at(-1).message, /Sent "PC" to rescan 9x8 chunks/);

    const status = { player: 'Steve', phase: 'IDLE', x: 0, z: 0 };
    const answer = await service.ingest(token, { server: 'oldfrog.org', dimension: 'overworld', status }, NOW);
    assert.equal(answer.commands.length, 1, 'a newer command replaces the one still waiting');
    assert.deepEqual([answer.commands[0].kind, answer.commands[0].minCX, answer.commands[0].maxCX, answer.commands[0].minCZ, answer.commands[0].maxCZ, answer.commands[0].by],
      ['RESCAN', -2, 6, -3, 4, 'admin']);
    const again = await service.ingest(token, { server: 'oldfrog.org', dimension: 'overworld', status }, NOW);
    assert.equal(again.commands, undefined, 'picked up once');

    const viewer = { username: 'viewer', role: 'user' };
    await assert.rejects(service.handleApi({ method: 'POST' }, viewer, new URL('http://x/api/area-explorer/commands'), {
      assertAdmin(user) { if (user.role !== 'admin') throw Object.assign(new Error('Admin access required.'), { statusCode: 403 }); },
      readBody: async () => area
    }), /Admin access required/, 'only administrators send a mod off');
    await assert.rejects(service.createCommand(admin, { ...area, maxX: 200_000 }), /chunks a side/);
    await assert.rejects(service.createCommand(admin, { ...area, kind: 'DIG' }), /Explore or rescan/);
  } finally {
    await db.close();
  }
}

async function testCleanNames() {
  assert.equal(cleanFindName('Golden Apple §f(§f§f)'), 'Golden Apple');
  assert.equal(cleanFindName('§6Elytra'), 'Elytra');
  assert.equal(cleanFindName('Diamond'), 'Diamond');
  assert.equal(normalizeFind({ kind: 'ITEM', x: 1, y: 2, z: 3, foundAt: NOW, name: 'Golden Apple §f(§f§f)', count: 2 }, NOW).name, 'Golden Apple');

  // Finds stored before: cleaned by the migration, and one that's the same as a clean find dropped
  const db = new PGlite();
  try {
    for (const file of ['067_area_explorer.sql', '070_area_explorer_markers.sql', '072_area_explorer_picked_up.sql']) {
      await db.exec(fs.readFileSync(path.join(__dirname, '../migrations', file), 'utf8'));
    }
    const insert = (name, x, key) => db.query(`INSERT INTO area_explorer_finds (server, dimension, kind, x, y, z, found_at, name, item_count, label, dedupe_key)
      VALUES ('s', 'overworld', 'ITEM', $1, 64, 0, NOW(), $2, 1, '', $3)`, [x, name, key]);
    await insert('Golden Apple §f(§f§f)', 1, 'ITEM:1:64:0:Golden Apple §f(§f§f):1:');
    await insert('Golden Apple §f(§f§f)', 2, 'ITEM:2:64:0:Golden Apple §f(§f§f):1:');
    await insert('Golden Apple', 2, 'ITEM:2:64:0:Golden Apple:1:');
    await db.exec(fs.readFileSync(path.join(__dirname, '../migrations/075_area_explorer_clean_names.sql'), 'utf8'));
    const rows = (await db.query('SELECT x, name, dedupe_key FROM area_explorer_finds ORDER BY x')).rows;
    assert.deepEqual(rows.map(row => [row.x, row.name, row.dedupe_key]),
      [[1, 'Golden Apple', 'ITEM:1:64:0:Golden Apple:1:'], [2, 'Golden Apple', 'ITEM:2:64:0:Golden Apple:1:']]);
  } finally {
    await db.close();
  }
}

async function testCoverage() {
  // 10 x 3 cells: 30 bits in 4 bytes
  const grid = { version: 3, cell: 2, minCX: -10, minCZ: 5, cols: 10, rows: 3, bits: Buffer.from([0b00000111, 0, 0, 0]).toString('base64') };
  assert.deepEqual(normalizeCoverage(grid), grid);
  assert.equal(normalizeCoverage(undefined), undefined, 'none sent: keep the last');
  assert.equal(normalizeCoverage({ ...grid, bits: Buffer.from([1]).toString('base64') }), null, 'the bits must fit the grid');
  assert.equal(normalizeCoverage({ ...grid, cols: 5000 }), null);

  const db = new PGlite();
  try {
    for (const file of ['067_area_explorer.sql', '070_area_explorer_markers.sql', '071_area_explorer_status_y.sql', '072_area_explorer_picked_up.sql',
      '072_area_explorer_yaw.sql', '073_area_explorer_events.sql', '074_area_explorer_coverage.sql', '076_area_explorer_commands.sql']) {
      await db.exec(fs.readFileSync(path.join(__dirname, '../migrations', file), 'utf8'));
    }
    const published = [];
    const service = createAreaExplorerService({
      pool: poolFor(db), hashToken, readJsonBody: async () => ({}), sendJson() {}, sendError() {},
      enforceRateLimit: () => true, publish: (type, payload) => published.push(payload), recordSystemLog: async () => {}
    });
    const created = await service.createToken({ username: 'admin', role: 'admin' }, { name: 'PC' });
    const token = await service.authenticate({ headers: { authorization: `Bearer ${created.token}` } });
    const area = { minX: -160, minZ: 80, maxX: 159, maxZ: 175 };
    const status = extra => ({ server: 'oldfrog.org', dimension: 'overworld', status: { player: 'Steve', phase: 'SWEEP', x: 0, z: 0, area, ...extra } });
    const coverageUrl = new URL(`http://x/api/area-explorer/coverage?token=${token.id}`);

    await service.ingest(token, status({ coverage: grid }), NOW);
    assert.equal(published.at(-1).liveStatus.coverageVersion, 3, 'the live status says which grid there is');
    assert.equal(published.at(-1).liveStatus.coverage, undefined, 'not the cells: they are fetched on their own');
    assert.deepEqual((await service.getCoverage(coverageUrl)).coverage, grid);

    await service.ingest(token, status({ coverageVersion: 3 }), NOW);
    assert.deepEqual((await service.getCoverage(coverageUrl)).coverage, grid, 'a status without the grid keeps it');

    await service.ingest(token, status({ phase: 'IDLE', area: undefined }), NOW);
    assert.equal((await service.getCoverage(coverageUrl)).coverage, null, 'the run over, the colour goes');
    assert.equal(published.at(-1).liveStatus.coverageVersion, null);
  } finally {
    await db.close();
  }
}

async function testRunLog() {
  const db = new PGlite();
  try {
    await db.exec(migrationSql);
    await db.exec(statusYMigrationSql);
    await db.exec(pickedUpMigrationSql);
    await db.exec(fs.readFileSync(path.join(__dirname, '../migrations/072_area_explorer_yaw.sql'), 'utf8'));
    await db.exec(fs.readFileSync(path.join(__dirname, '../migrations/074_area_explorer_coverage.sql'), 'utf8'));
    await db.exec(fs.readFileSync(path.join(__dirname, '../migrations/076_area_explorer_commands.sql'), 'utf8'));
    await db.exec(fs.readFileSync(path.join(__dirname, '../migrations/073_area_explorer_events.sql'), 'utf8'));
    const published = [];
    const service = createAreaExplorerService({
      pool: poolFor(db), hashToken, readJsonBody: async () => ({}), sendJson() {}, sendError() {},
      enforceRateLimit: () => true, publish: (type, payload) => published.push({ type, payload }), recordSystemLog: async () => {}
    });
    const created = await service.createToken({ username: 'admin', role: 'admin' }, { name: 'Gaming PC' });
    const token = await service.authenticate({ headers: { authorization: `Bearer ${created.token}` } });
    const events = [
      { id: 'event-0001', at: NOW - 3000, level: 'info', type: 'start', message: 'Started exploring a 10x10 chunk area', player: 'Steve', x: 1, y: 200, z: 2 },
      { id: 'event-0002', at: NOW - 2000, level: 'error', type: 'disconnect', message: 'Disconnected from oldfrog.org: Timed out', player: 'Steve', x: 100, z: 200 },
      { id: 'event-0003', at: NOW - 1000, level: 'success', type: 'rejoin', message: 'Back on the server after 1 reconnect attempt, 15s offline', player: 'Steve' },
      { id: 'event-0004', at: NOW, level: 'warn', type: 'warning', message: "You're not flying", player: 'Steve' }
    ];
    const result = await service.ingest(token, { server: 'OldFrog.org', dimension: 'overworld', finds: [], events }, NOW);
    assert.equal(result.events, 4);
    const update = published.at(-1).payload;
    assert.equal(update.events.length, 4, 'the page gets the events in the live update');
    assert.equal(update.events[0].tokenName, 'Gaming PC');
    assert.equal(update.status, false, 'events alone are not a status update');

    const again = await service.ingest(token, { server: 'oldfrog.org', dimension: 'overworld', events: events.slice(0, 2) }, NOW);
    assert.equal(again.events, 0, 'a batch sent again is not stored twice');
    await service.ingest(token, { server: 'other.net', dimension: 'the_nether', events: [{ id: 'event-0005', at: NOW, level: 'info', type: 'start', message: 'Elsewhere' }] }, NOW);

    const all = await service.getEvents(new URL('http://x/api/area-explorer/events'));
    assert.deepEqual(all.events.map(e => e.message.slice(0, 9)), ['Elsewhere', "You're no", 'Back on t', 'Disconnec', 'Started e'], 'newest first');
    const one = await service.getEvents(new URL('http://x/api/area-explorer/events?server=OldFrog.org'));
    assert.equal(one.events.length, 4, 'one server');
    assert.equal(one.events[3].y, 200);
    const problems = await service.getEvents(new URL('http://x/api/area-explorer/events?filter=problems&server=oldfrog.org'));
    assert.deepEqual(problems.events.map(e => e.level), ['warn', 'error']);
    const connection = await service.getEvents(new URL('http://x/api/area-explorer/events?filter=connection'));
    assert.deepEqual(connection.events.map(e => e.type), ['rejoin', 'disconnect']);

    const page = await service.getEvents(new URL('http://x/api/area-explorer/events?server=oldfrog.org&limit=2'));
    assert.equal(page.hasMore, true);
    const last = page.events[1];
    const older = await service.getEvents(new URL(`http://x/api/area-explorer/events?server=oldfrog.org&limit=2&before=${encodeURIComponent(`${new Date(last.occurredAt).toISOString()}|${last.id}`)}`));
    assert.deepEqual(older.events.map(e => e.type), ['disconnect', 'start'], 'paging back carries on after the last one shown');
    assert.equal(older.hasMore, false);

    await assert.rejects(service.ingest(token, { server: 'a', dimension: 'b', events: Array.from({ length: 201 }, () => ({})) }, NOW), /At most 200 events/);
  } finally {
    await db.close();
  }
}

function testNightWiring() {
  // The night view's tiles are loaded as "<dimension>@night": drawing must take that map, not only the scope's own
  assert.match(appSource, /const nightMap = ae\.regionMaps\.get\(`\$\{server\}\|\$\{dimension\}@night`\);/);
  // Dusk and dawn: the ground darkens first, the lights come on after
  assert.match(appSource, /const darkness = easeInOut\(n \/ 0\.8\);/);
  assert.match(appSource, /const lights = easeInOut\(\(n - 0\.45\) \/ 0\.55\);/);
  assert.match(appSource, /globalCompositeOperation = 'source-atop'/, 'the dark falls on drawn ground only');
  assert.match(indexSource, /class="area-explorer-map-button area-explorer-night"/, 'Night is one of the map buttons');
}

function testRunLogWiring() {
  for (const id of ['areaExplorerLog', 'areaExplorerLogMore']) assert.ok(indexSource.includes(`id="${id}"`), `${id} is on the page`);
  assert.match(indexSource, /data-area-log-filter="problems"/);
  assert.match(appSource, /\/api\/area-explorer\/events\?/, 'the page loads the log');
  assert.match(appSource, /if \(eventPayload\.events\) applyAreaExplorerEvents\(eventPayload\.events\)/, 'live events go straight into the log');
}

(async () => {
  testNormalization();
  testEventNormalization();
  testStatusOnline();
  testLootValue();
  await testIngestAndQueries();
  await testMarkers();
  await testRunLog();
  await testCoverage();
  await testCleanNames();
  await testCommands();
  await testMapCrowds();
  testWiring();
  testRunLogWiring();
  testNightWiring();
  console.log('area-explorer tests passed');
})().catch(error => {
  console.error(error);
  process.exit(1);
});
