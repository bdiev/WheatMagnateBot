'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require('@electric-sql/pglite');
const {
  bearerToken,
  createAreaExplorerService,
  dedupeKey,
  normalizeFind,
  normalizeStatus,
  publicStatus
} = require('../area-explorer');

const migrationSql = fs.readFileSync(path.join(__dirname, '..', 'migrations', '067_area_explorer.sql'), 'utf8');
const markersMigrationSql = fs.readFileSync(path.join(__dirname, '..', 'migrations', '070_area_explorer_markers.sql'), 'utf8');
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
  assert.equal(status.area, null, 'an area needs all four sides');

  assert.equal(bearerToken({ headers: { authorization: 'Bearer aex_0123456789abcdef' } }), 'aex_0123456789abcdef');
  assert.equal(bearerToken({ headers: { authorization: 'Basic abc' } }), '');
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
      status: { player: 'Steve', phase: 'SWEEP', mode: 'Area', percent: 12.5, etaSeconds: 3600, x: 10, z: 20, runFinds: { bases: 2, signs: 1, items: 1 } }
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
    assert.equal(summary.statuses[0].tokenName, 'Gaming PC');
    assert.equal(summary.statuses[0].runFinds.bases, 2);

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
    assert.equal(map.points.every(point => point.length === 4), true);

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
    assert.deepEqual(points.points.map(point => point.slice(1)), [['MARKER', 100, 200]]);
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
  assert.match(indexSource, /data-area-kind="MARKER"[^>]*>Markers <span data-area-count="MARKER">/, 'markers have a filter of their own');
  assert.match(indexSource, /id="areaExplorerMarkerName"/, 'and a pick of what they mark');
  assert.match(appSource, /MARKER: 'Marker'/);
  assert.match(appSource, /name: areaExplorerMarkerFilter\(\)/, 'the pick narrows the list and the map');
}

(async () => {
  testNormalization();
  testStatusOnline();
  await testIngestAndQueries();
  await testMarkers();
  testWiring();
  console.log('area-explorer tests passed');
})().catch(error => {
  console.error(error);
  process.exit(1);
});
