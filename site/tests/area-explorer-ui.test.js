'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../public/app.js'), 'utf8');
function functionSource(name) {
  const asyncStart = source.indexOf(`async function ${name}(`);
  const start = asyncStart >= 0 ? asyncStart : source.indexOf(`function ${name}(`);
  const next = source.indexOf('\nfunction ', start + 1);
  const nextAsync = source.indexOf('\nasync function ', start + 1);
  return source.slice(start, Math.min(...[next, nextAsync].filter(index => index >= 0)));
}
function fixture() {
  const ae = { scope: 'test|overworld', kind: '', markerName: '', q: '', offset: 0, total: 0, points: [], view: {}, pointsScope: 'test|overworld', showFinds: true };
  const nodes = new Map();
  const requests = [];
  const node = selector => {
    if (!nodes.has(selector)) nodes.set(selector, {
      innerHTML: '', hidden: false, scrollTop: 150, attributes: {},
      classList: { toggle() {} },
      setAttribute(key, value) { this.attributes[key] = value; },
      removeAttribute(key) { delete this.attributes[key]; }
    });
    return nodes.get(selector);
  };
  const context = vm.createContext({
    state: { activeTab: 'area-explorer', currentUser: {} }, document: { visibilityState: 'visible' },
    areaExplorerState: () => ae, $: node, AREA_EXPLORER_PAGE_SIZE: 50,
    AREA_EXPLORER_KIND_ORDER: { SIGN: 0, ITEM: 1, MARKER: 2, BASE: 3 },
    areaExplorerScopeParams: params => JSON.stringify({ scope: ae.scope, ...params }),
    areaExplorerMarkerFilter: () => ae.markerName,
    renderAreaExplorerFind: find => find.name,
    renderAreaExplorerPager() {}, bindAreaExplorerMap() {}, fitAreaExplorerMap() {}, fitAreaExplorerToData() {}, queueAreaExplorerMapDraw() {},
    ensureItemIcons: async () => ({}),
    loadXaeroRegionMap: async () => {}, escapeHtml: String,
    renderAreaExplorerStatus() {},
    saveAreaExplorerSetting(key, value) { context.savedSetting = { key, value }; },
    fetchJson: url => new Promise((resolve, reject) => requests.push({ url, resolve, reject }))
  });
  for (const name of ['loadAreaExplorerFinds', 'loadAreaExplorerMap', 'setAreaExplorerFindsVisible', 'selectAreaExplorerFind', 'areaExplorerHeading', 'areaExplorerLiveStatus', 'recordAreaExplorerTrail', 'areaExplorerTrail', 'applyAreaExplorerLiveStatus', 'loadAreaExplorerLive']) vm.runInContext(functionSource(name), context);
  return { ae, node, requests, context };
}

async function testFindsRaceAndScroll() {
  const { ae, node, requests, context } = fixture();
  const first = context.loadAreaExplorerFinds();
  ae.kind = 'BASE';
  const second = context.loadAreaExplorerFinds();
  requests[1].resolve({ total: 1, finds: [{ name: 'New base' }] });
  await second;
  requests[0].resolve({ total: 80, finds: [{ name: 'Old signs' }] });
  await first;
  const list = node('#areaExplorerFinds');
  assert.equal(list.innerHTML, 'New base', 'late responses must not overwrite a newer filter');
  assert.equal(ae.total, 1);
  assert.equal(list.scrollTop, 0, 'a changed filter starts at the top');
  list.scrollTop = 90;
  const refresh = context.loadAreaExplorerFinds();
  requests[2].resolve({ total: 1, finds: [{ name: 'Updated base' }] });
  await refresh;
  assert.equal(list.scrollTop, 90, 'live updates preserve the reading position');
  const failed = context.loadAreaExplorerFinds();
  requests[3].reject(new Error('offline'));
  await assert.rejects(failed, /offline/);
  assert.equal(list.attributes['aria-busy'], undefined, 'errors must clear the loading state');
  const loading = context.loadAreaExplorerFinds();
  ae.scope = '';
  await context.loadAreaExplorerFinds();
  requests[4].resolve({ total: 1, finds: [{ name: 'Removed scope' }] });
  await loading;
  assert.equal(list.innerHTML, '');
  assert.equal(list.attributes['aria-busy'], undefined);
}

async function testMapRace() {
  const { ae, requests, context } = fixture();
  const first = context.loadAreaExplorerMap();
  ae.kind = 'BASE';
  const second = context.loadAreaExplorerMap();
  requests[1].resolve({ points: [['new', 'BASE', 5, 6]] });
  await second;
  requests[0].resolve({ points: [['old', 'SIGN', 1, 2]] });
  await first;
  assert.equal(ae.points[0].id, 'new', 'map filters must also discard late responses');
}

async function testSelectionRace() {
  const { node, requests, context } = fixture();
  const first = context.selectAreaExplorerFind('same');
  await context.selectAreaExplorerFind(null);
  const second = context.selectAreaExplorerFind('same');
  requests[1].resolve({ find: { name: 'Current details' } });
  await second;
  requests[0].resolve({ find: { name: 'Old details' } });
  await first;
  assert.ok(node('#areaExplorerSelected').innerHTML.includes('Current details'));
  assert.ok(!node('#areaExplorerSelected').innerHTML.includes('Old details'));
}

async function testMarkerVisibility() {
  const { ae, node, requests, context } = fixture();
  const selection = context.selectAreaExplorerFind('base');
  context.setAreaExplorerFindsVisible(false);
  assert.equal(ae.showFinds, false);
  assert.equal(ae.selectedId, null);
  assert.equal(node('#areaExplorerToggleFinds').attributes['aria-label'], 'Show map markers');
  assert.equal(context.savedSetting.value, false);
  requests[0].resolve({ find: { name: 'Hidden base' } });
  await selection;
  assert.equal(node('#areaExplorerSelected').hidden, true, 'hiding markers cancels pending details');
  const focus = context.selectAreaExplorerFind('base');
  assert.equal(ae.showFinds, true, 'choosing a find from the list shows its map marker again');
  requests[1].resolve({ find: { name: 'Focused base' } });
  await focus;
  assert.equal(node('#areaExplorerSelected').hidden, false);
  assert.equal(node('#areaExplorerToggleFinds').attributes['aria-pressed'], 'false');
}

async function testLiveTelemetry() {
  const { ae, requests, context } = fixture();
  const live = { tokenId: '1', server: 'test', dimension: 'overworld', online: true, x: 0, z: 0, yaw: 0, updatedAt: '2026-10-05T12:00:01Z' };
  context.recordAreaExplorerTrail(live, 1000);
  context.recordAreaExplorerTrail({ ...live, x: 20 }, 2000);
  assert.equal(context.areaExplorerTrail(live, 2500).length, 2);
  assert.equal(context.areaExplorerTrail(live, 5000).length, 0, 'the trail expires without new reports');
  context.recordAreaExplorerTrail({ ...live, x: 2000 }, 2500);
  assert.equal(ae.trail.samples.length, 1, 'teleports never draw a line across the map');
  context.recordAreaExplorerTrail({ ...live, dimension: 'the_nether' }, 2600);
  assert.equal(context.areaExplorerTrail(live, 2700).length, 0, 'trails never cross dimensions');
  context.recordAreaExplorerTrail({ ...live, online: false }, 2800);
  assert.equal(ae.trail, null);
  assert.equal(Math.round(Math.cos(context.areaExplorerHeading(0))), -1, 'yaw zero points south');
  assert.equal(Math.round(Math.sin(context.areaExplorerHeading(90))), -1, 'yaw 90 points west');
  assert.equal(context.areaExplorerHeading(null), 0, 'old mods retain the default orientation');
  context.applyAreaExplorerLiveStatus(live);
  context.applyAreaExplorerLiveStatus({ ...live, x: 99, updatedAt: '2026-10-05T12:00:00Z' });
  assert.equal(ae.summary.statuses[0].x, 0, 'old telemetry cannot move the player backwards');
  const pending = context.loadAreaExplorerLive();
  await context.loadAreaExplorerLive();
  assert.equal(requests.length, 1, 'slow polling must not accumulate requests');
  requests[0].resolve({ statuses: [{ ...live, x: 25, updatedAt: '2026-10-05T12:00:02Z' }] });
  await pending;
  assert.equal(ae.summary.statuses[0].x, 25);
  context.state.eventSource = { readyState: 1 };
  await context.loadAreaExplorerLive();
  assert.equal(requests.length, 1, 'healthy live SSE avoids redundant polling');
}

(async () => {
  await testFindsRaceAndScroll();
  await testMapRace();
  await testSelectionRace();
  await testMarkerVisibility();
  await testLiveTelemetry();
  console.log('Area Explorer UI behavior tests passed.');
})().catch(error => { console.error(error); process.exitCode = 1; });
