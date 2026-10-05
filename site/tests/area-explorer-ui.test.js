'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../public/app.js'), 'utf8');
function functionSource(name) {
  const start = source.indexOf(`async function ${name}(`);
  const next = source.indexOf('\nfunction ', start + 1);
  const nextAsync = source.indexOf('\nasync function ', start + 1);
  return source.slice(start, Math.min(...[next, nextAsync].filter(index => index >= 0)));
}
function fixture() {
  const ae = { scope: 'test|overworld', kind: '', markerName: '', q: '', offset: 0, total: 0, points: [], view: {}, pointsScope: 'test|overworld' };
  const nodes = new Map();
  const requests = [];
  const node = selector => {
    if (!nodes.has(selector)) nodes.set(selector, {
      innerHTML: '', hidden: false, scrollTop: 150, attributes: {},
      setAttribute(key, value) { this.attributes[key] = value; },
      removeAttribute(key) { delete this.attributes[key]; }
    });
    return nodes.get(selector);
  };
  const context = vm.createContext({
    areaExplorerState: () => ae, $: node, AREA_EXPLORER_PAGE_SIZE: 50,
    AREA_EXPLORER_KIND_ORDER: { SIGN: 0, ITEM: 1, MARKER: 2, BASE: 3 },
    areaExplorerScopeParams: params => JSON.stringify({ scope: ae.scope, ...params }),
    areaExplorerMarkerFilter: () => ae.markerName,
    renderAreaExplorerFind: find => find.name,
    renderAreaExplorerPager() {}, bindAreaExplorerMap() {}, fitAreaExplorerMap() {}, queueAreaExplorerMapDraw() {},
    loadXaeroRegionMap: async () => {}, escapeHtml: String,
    fetchJson: url => new Promise((resolve, reject) => requests.push({ url, resolve, reject }))
  });
  for (const name of ['loadAreaExplorerFinds', 'loadAreaExplorerMap', 'selectAreaExplorerFind']) vm.runInContext(functionSource(name), context);
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

(async () => {
  await testFindsRaceAndScroll();
  await testMapRace();
  await testSelectionRace();
  console.log('Area Explorer UI behavior tests passed.');
})().catch(error => { console.error(error); process.exitCode = 1; });
