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
    state: { activeTab: 'area-explorer', currentUser: {}, realtimeRefreshTimers: {} }, document: { visibilityState: 'visible' },
    areaExplorerState: () => ae, $: node, $$: () => [], AREA_EXPLORER_PAGE_SIZE: 50,
    AREA_EXPLORER_KIND_LABELS: { BASE: 'Base', MARKER: 'Marker', ITEM: 'Loot', SIGN: 'Sign' },
    AREA_EXPLORER_KIND_ORDER: { SIGN: 0, ITEM: 1, MARKER: 2, BASE: 3 },
    AREA_EXPLORER_MAP_LAYERS: ['BASE', 'END_PORTAL', 'MARKER', 'ITEM', 'SIGN'], AREA_EXPLORER_DEFAULT_LAYERS: ['END_PORTAL'], AREA_EXPLORER_NEARBY_RADIUS: 100,
    areaExplorerScopeParams: params => JSON.stringify({ scope: ae.scope, ...params }),
    areaExplorerMarkerFilter: () => ae.markerName,
    renderAreaExplorerFind: find => find.name,
    revealAreaExplorerFind() {}, renderAreaExplorerPager() {}, bindAreaExplorerMap() {}, fitAreaExplorerMap() {}, queueAreaExplorerMapDraw() {},
    ensureItemIcons: async () => ({}),
    loadXaeroRegionMap: async () => {}, escapeHtml: String,
    renderAreaExplorerStatus() {},
    saveAreaExplorerSetting(key, value) { context.savedSetting = { key, value }; },
    formatNumber: String, AREA_EXPLORER_LOG_PAGE: 50, URLSearchParams,
    queueRealtimeRefresh(key) { context.refreshed = (context.refreshed || []).concat(key); },
    refreshAreaExplorerFromEvent() {}, applyAreaExplorerEvents() {},
    fetchJson: url => new Promise((resolve, reject) => requests.push({ url, resolve, reject }))
  });
  for (const name of ['renderAreaExplorerMarkerVisibility', 'areaExplorerPointLayer', 'isAreaExplorerPointNearby', 'isAreaExplorerPointVisible', 'setAreaExplorerMarkerKind', 'loadAreaExplorerFinds', 'loadAreaExplorerMap', 'setAreaExplorerFindsVisible', 'selectAreaExplorerFind', 'areaExplorerHeading', 'areaExplorerLiveStatus', 'recordAreaExplorerTrail', 'areaExplorerTrail', 'applyAreaExplorerLiveStatus', 'loadAreaExplorerLive', 'noteAreaExplorerVersions', 'queueAreaExplorerRefresh', 'areaExplorerListAnchor', 'areaExplorerListIds', 'markAreaExplorerNewFinds', 'setAreaExplorerNewFinds']) vm.runInContext(functionSource(name), context);
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
  assert.equal(ae.showFinds, false, 'choosing a find from the list leaves the other markers hidden');
  assert.equal(context.isAreaExplorerPointVisible({ id: 'base', kind: 'BASE' }), true, 'but shows the chosen one');
  assert.equal(context.isAreaExplorerPointVisible({ id: 'other', kind: 'BASE' }), false);
  requests[1].resolve({ find: { name: 'Focused base', kind: 'BASE' } });
  await focus;
  assert.equal(node('#areaExplorerSelected').hidden, false);
  assert.equal(ae.visibleKinds, undefined, 'the checkboxes stay as they were');
}

function testEndPortalLayer() {
  const { ae, context } = fixture();
  const portal = { id: 'p', kind: 'MARKER', name: 'End Portal' }, spawner = { id: 's', kind: 'MARKER', name: 'Spawner' };
  assert.equal(context.isAreaExplorerPointVisible(portal), true, 'End Portals show by default');
  assert.equal(context.isAreaExplorerPointVisible(spawner), false, 'other markers do not');
  assert.equal(context.isAreaExplorerPointVisible({ id: 'b', kind: 'BASE' }), false, 'nor bases');
  context.setAreaExplorerMarkerKind('MARKER', true);
  assert.deepEqual([...ae.visibleKinds], ['END_PORTAL', 'MARKER']);
  assert.equal(context.isAreaExplorerPointVisible(spawner), true);
  ae.selectedId = 'b';
  assert.equal(context.isAreaExplorerPointVisible({ id: 'b', kind: 'BASE' }), true, 'the picked find shows with its box off');
}

function testNearbyMarkers() {
  const { ae, context } = fixture();
  ae.showFinds = false;
  const near = { id: 'n', kind: 'SIGN', x: 160, z: 280 }, far = { id: 'f', kind: 'SIGN', x: 200, z: 300 };
  ae.nearby = { x: 100, z: 200 };
  assert.equal(context.isAreaExplorerPointVisible(near), true, 'a find within 100 blocks shows, markers hidden or not');
  assert.equal(context.isAreaExplorerPointVisible(far), false, 'one further off does not');
  ae.nearby = null;
  assert.equal(context.isAreaExplorerPointVisible(near), false);
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

  // Without the live stream, the poll's newest find id tells when the finds and highlights are stale
  context.noteAreaExplorerVersions({ finds: '10', events: '3' });
  assert.equal(context.refreshed, undefined, 'the first versions seen are only remembered');
  context.noteAreaExplorerVersions({ finds: '10', events: '3' });
  assert.equal(context.refreshed, undefined);
  context.noteAreaExplorerVersions({ finds: '12', events: '3' });
  assert.deepEqual(context.refreshed, ['area-explorer'], 'a newer find reloads the section');
  assert.equal(ae.findsDirty, true);
}

/** Fake list items at given heights, for the reading position tests. */
function fakeList(ids, scrollTop) {
  const list = {
    scrollTop,
    getBoundingClientRect: () => ({ top: 100 }),
    querySelectorAll: () => list.items
  };
  list.setIds = next => {
    list.items = next.map((id, index) => ({
      dataset: { findId: id }, classes: [],
      classList: { add(name) { this.owner.classes.push(name); } },
      // 50 px each, the list scrolled by scrollTop
      getBoundingClientRect: () => ({ top: 100 + index * 50 - list.scrollTop, bottom: 150 + index * 50 - list.scrollTop })
    }));
    for (const item of list.items) item.classList.owner = item;
  };
  list.setIds(ids);
  return list;
}

function testReadingPositionKept() {
  const { ae, node, context } = fixture();
  ae.newFindsAbove = 0;
  // Scrolled so find "c" is at the top of the list
  const list = fakeList(['a', 'b', 'c', 'd'], 100);
  const anchor = context.areaExplorerListAnchor(list);
  assert.equal(anchor.id, 'c');
  assert.equal(anchor.offset, 0);
  const shown = context.areaExplorerListIds(list);
  list.setIds(['new1', 'new2', 'a', 'b', 'c', 'd']);
  context.markAreaExplorerNewFinds(list, shown, anchor);
  assert.equal(list.scrollTop, 200, 'two new finds above: scrolled down by their height, "c" stays at the top');
  assert.equal(ae.newFindsAbove, 2);
  assert.equal(node('#areaExplorerNewFinds').hidden, false, 'and a button says how many');
  assert.deepEqual(list.items.filter(item => item.classes.includes('is-new')).map(item => item.dataset.findId), ['new1', 'new2']);

  // At the very top the newest simply show up there
  const top = fakeList(['a', 'b'], 0);
  assert.equal(context.areaExplorerListAnchor(top), null);
  const before = context.areaExplorerListIds(top);
  top.setIds(['new', 'a', 'b']);
  context.markAreaExplorerNewFinds(top, before, null);
  assert.equal(top.scrollTop, 0);
  assert.equal(ae.newFindsAbove, 0);
}

function gestureFixture({ interactive = true } = {}) {
  const ae = { view: { cx: 0, cz: 0, scale: 1 }, showFinds: true, points: [] };
  const listeners = new Map(), timers = new Map();
  let nextTimer = 0;
  const canvas = {
    clientWidth: 400, clientHeight: 400,
    classList: { contains: () => interactive },
    getBoundingClientRect: () => ({ left: 0, top: 0 }),
    setPointerCapture() {},
    addEventListener: (name, listener) => listeners.set(name, listener)
  };
  const nodes = {
    '#areaExplorerMap': canvas,
    '#areaExplorerCursor': { hidden: true },
    '#areaExplorerMapWrap': { classList: { contains: () => interactive } },
    '#areaExplorerMenu': { hidden: true }
  };
  const context = vm.createContext({
    areaExplorerState: () => ae, $: selector => nodes[selector],
    state: { activeTab: 'area-explorer' },
    document: { addEventListener() {} }, window: { addEventListener() {} },
    setTimeout: callback => { const id = ++nextTimer; timers.set(id, callback); return id; },
    clearTimeout: id => timers.delete(id),
    AREA_EXPLORER_MAX_SCALE: 16,
    clampAreaExplorerView() {}, queueAreaExplorerMapDraw() {}, noteAreaExplorerViewMoved() {},
    openAreaExplorerMenu(x, z) { context.menuAt = [x, z]; }, closeAreaExplorerMenu() {},
    selectAreaExplorerFind: async id => { context.selections = (context.selections || []).concat(id); },
    areaExplorerInTerritory: () => true, areaExplorerToScreen: () => [200, 200],
    isAreaExplorerPointVisible: () => true,
    setBanner: message => { throw new Error(message); }
  });
  vm.runInContext(functionSource('zoomAreaExplorerMap'), context);
  vm.runInContext(functionSource('areaExplorerHitAt'), context);
  vm.runInContext(functionSource('bindAreaExplorerMap'), context);
  context.bindAreaExplorerMap();
  const send = (type, id, x, y = 200) => listeners.get(type)({
    pointerId: id, pointerType: 'touch', button: 0, clientX: x, clientY: y
  });
  const hold = () => { for (const callback of [...timers.values()]) callback(); timers.clear(); };
  return { ae, context, timers, send, hold, listeners };
}

function testTouchGestures() {
  let f = gestureFixture({ interactive: false });
  f.send('pointerdown', 1, 200);
  assert.equal(f.timers.size, 1, 'embedded map supports holding for actions');
  f.send('pointermove', 1, 230);
  f.send('pointerup', 1, 230);
  assert.equal(f.ae.view.cx, -30, 'one finger pans the embedded map');
  assert.equal(f.ae.view.scale, 1, 'one finger never changes the map zoom');
  assert.equal(f.context.selections, undefined, 'a map swipe must not select a find');

  f = gestureFixture();
  f.send('pointerdown', 1, 200);
  f.hold();
  assert.deepEqual(f.context.menuAt, [200, 200], 'holding opens actions at the touched point');
  f.send('pointerup', 1, 200);
  assert.equal(f.context.selections, undefined, 'releasing a hold must not select a marker or close the menu');

  f = gestureFixture();
  f.send('pointerdown', 1, 200);
  f.send('pointermove', 1, 220);
  assert.equal(f.timers.size, 0, 'dragging cancels the hold timer');
  f.send('pointerup', 1, 220);
  f.hold();
  assert.equal(f.context.menuAt, undefined);
  assert.equal(f.ae.view.cx, -20);

  f = gestureFixture();
  f.send('pointerdown', 1, 100);
  f.send('pointerdown', 2, 300);
  assert.equal(f.timers.size, 0, 'a second finger cancels the hold timer');
  f.send('pointermove', 1, 120);
  f.send('pointermove', 2, 320);
  assert.ok(Math.abs(f.ae.view.cx) < 0.001, 'two fingers moving together do not pan the map');
  assert.ok(Math.abs(f.ae.view.scale - 1) < 0.001, 'parallel movement preserves zoom');
  f.send('pointermove', 2, 420);
  assert.ok(f.ae.view.scale > 1, 'spreading fingers zooms in');
  f.send('pointerup', 2, 420);
  f.send('pointerup', 1, 120);
  assert.equal(f.context.selections, undefined, 'ending a pinch never selects the point underneath');

  f = gestureFixture();
  f.send('pointerdown', 1, 200);
  f.send('pointercancel', 1, 200);
  f.hold();
  f.send('pointerup', 1, 200);
  assert.equal(f.context.menuAt, undefined, 'cancelled touches never open a delayed menu');
  assert.equal(f.context.selections, undefined);
  f.send('pointerdown', 2, 200);
  f.send('pointerup', 2, 200);
  assert.equal(f.context.selections.length, 1, 'a normal tap still works after cancellation');
}

function testFullscreenEscapePriority() {
  const nodes = new Map(), handlers = [];
  const ae = { liveTimer: 1, showFinds: true };
  const node = selector => {
    if (!nodes.has(selector)) nodes.set(selector, {
      hidden: false, value: '', addEventListener() {}, classList: { contains: () => true }
    });
    return nodes.get(selector);
  };
  const context = vm.createContext({
    areaExplorerState: () => ae, $: node, $$: () => [],
    document: { addEventListener: (name, handler) => { if (name === 'keydown') handlers.push(handler); } },
    setAreaExplorerFindsVisible() {}, renderAreaExplorerExtent() {}, bindAreaExplorerVisibility() {}, focusAreaExplorerPlayer() {},
    setAreaExplorerFullscreen: on => { context.fullscreen = on; }
  });
  vm.runInContext(functionSource('setupAreaExplorer'), context);
  context.setupAreaExplorer();
  handlers[0]({ key: 'Escape' });
  assert.equal(context.fullscreen, undefined, 'Escape first closes a menu without leaving full screen');
  node('#areaExplorerMenu').hidden = true;
  node('#areaExplorerMarkerFilters').hidden = true;
  ae.areaSelection = { picking: true };
  handlers[0]({ key: 'Escape' });
  assert.equal(context.fullscreen, undefined, 'Escape clears the area selection before leaving full screen');
  ae.areaSelection = null;
  handlers[0]({ key: 'Escape' });
  assert.equal(context.fullscreen, false, 'Escape leaves full screen once overlays have been dismissed');
}

function testMarkerAboveDetails() {
  const ae = { view: { cx: 0, cz: 0, scale: 1 } };
  const canvas = { clientWidth: 400, clientHeight: 400, getBoundingClientRect: () => ({ top: 60 }) };
  let sheetTop = 240;
  const sheet = { hidden: false, getBoundingClientRect: () => ({ top: sheetTop }) };
  const context = vm.createContext({
    areaExplorerState: () => ae, $: selector => selector === '#areaExplorerMap' ? canvas : sheet,
    clampAreaExplorerView() {}, queueAreaExplorerMapDraw() {}, noteAreaExplorerViewMoved() {}
  });
  vm.runInContext(functionSource('areaExplorerToScreen'), context);
  vm.runInContext(functionSource('revealAreaExplorerFind'), context);
  context.revealAreaExplorerFind({ x: 0, z: 0 });
  const [, y] = context.areaExplorerToScreen(ae.view, canvas, 0, 0);
  assert.ok(y >= 64 && y < sheetTop - 60 - 24, 'selected point is visible between the legend and its sheet');
  const previousCentre = ae.view.cz;
  sheetTop = 400;
  context.revealAreaExplorerFind({ x: 0, z: 0 });
  assert.equal(ae.view.cz, previousCentre, 'opening details does not move a marker that is already visible');
}

function testEmbeddedTouch() {
  const f = gestureFixture({ interactive: false });
  let prevented = 0;
  f.send('pointerdown', 1, 100);
  f.send('pointerdown', 2, 300);
  f.send('pointermove', 2, 400);
  assert.equal(f.ae.view.scale, 1.5, 'embedded map pinch changes map zoom');
  f.send('pointerup', 2, 400);
  const afterPinch = f.ae.view.cx;
  f.send('pointermove', 1, 130);
  assert.equal(f.ae.view.cx, afterPinch - 20, 'remaining finger resumes panning at the current zoom');
  assert.equal(f.ae.view.scale, 1.5, 'resuming a one-finger drag does not zoom');
  f.send('pointerup', 1, 130);
  assert.equal(f.context.selections, undefined, 'touch gesture completion cannot select a marker');
  const wheel = { deltaY: -100, clientX: 200, clientY: 200, preventDefault: () => { prevented++; } };
  const before = prevented;
  const scaleBeforeWheel = f.ae.view.scale;
  f.listeners.get('wheel')(wheel);
  assert.equal(prevented, before + 1, 'ordinary wheel zooms the embedded map without Ctrl');
  assert.ok(f.ae.view.scale > scaleBeforeWheel, 'wheel scrolling increases map zoom');
}

function testEyeClickAndHold() {
  const handlers = new Map(), timers = new Map();
  let nextTimer = 0;
  const ae = { showFinds: true };
  const eye = { setPointerCapture() {}, setAttribute() {}, addEventListener: (name, fn) => handlers.set(name, fn) };
  const filters = { hidden: true, addEventListener() {}, querySelector: () => ({ focus() {}, addEventListener() {} }) };
  const context = vm.createContext({
    $: selector => selector === '#areaExplorerToggleFinds' ? eye : filters,
    areaExplorerState: () => ae, document: { addEventListener() {} },
    closeAreaExplorerMenu() {}, renderAreaExplorerMarkerVisibility() {},
    closeAreaExplorerMarkerFilters: () => { filters.hidden = true; },
    setAreaExplorerFindsVisible: show => { ae.showFinds = show; },
    setTimeout: fn => { timers.set(++nextTimer, fn); return nextTimer; }, clearTimeout: id => timers.delete(id)
  });
  vm.runInContext(functionSource('bindAreaExplorerVisibility'), context);
  context.bindAreaExplorerVisibility();
  const press = () => handlers.get('pointerdown')({ button: 0, pointerId: 1, clientX: 100, clientY: 100 });
  press(); handlers.get('pointerup')(); handlers.get('click')();
  assert.equal(ae.showFinds, false, 'short click hides markers');
  assert.equal(filters.hidden, true);
  press(); handlers.get('pointerup')(); handlers.get('click')();
  assert.equal(ae.showFinds, true, 'next short click restores markers');
  press(); for (const fn of [...timers.values()]) fn();
  handlers.get('pointerup')(); handlers.get('click')();
  assert.equal(filters.hidden, false, 'hold opens the marker type selector');
  assert.equal(ae.showFinds, true, 'the click after releasing a hold must not hide markers');
  filters.hidden = true;
  press(); handlers.get('pointercancel')();
  for (const fn of [...timers.values()]) fn();
  assert.equal(filters.hidden, true, 'cancelled holds never open the filter selector');
}

function testMarkerTypes() {
  const { ae, context } = fixture();
  ae.visibleKinds = ['BASE', 'SIGN'];
  const sign = { id: 'sign', kind: 'SIGN' };
  const base = { id: 'base', kind: 'BASE' };
  assert.equal(context.isAreaExplorerPointVisible(sign), true);
  context.setAreaExplorerMarkerKind('SIGN', false);
  assert.equal(context.isAreaExplorerPointVisible(sign), false, 'disabled types are excluded from map drawing and hit testing');
  assert.equal(context.isAreaExplorerPointVisible(base), true);
  context.setAreaExplorerFindsVisible(false);
  context.setAreaExplorerFindsVisible(true);
  assert.deepEqual([...ae.visibleKinds], ['BASE'], 'quick hide/show preserves the chosen types');
  context.setAreaExplorerMarkerKind('BASE', false);
  assert.equal(ae.showFinds, false, 'disabling the final type also hides the eye');
  context.setAreaExplorerFindsVisible(true);
  assert.equal(ae.visibleKinds.length, 5, 'showing an empty selection restores all types');
}

function testLocatePlayer() {
  let live = { x: 123, z: -456, online: true };
  const context = vm.createContext({
    areaExplorerLiveStatus: () => live,
    selectAreaExplorerFind: id => { context.selected = id; },
    focusAreaExplorerMap: (x, z) => { context.focused = [x, z]; },
    showAreaExplorerNote: text => { context.note = text; },
    areaExplorerFoundAgo: () => '5m ago'
  });
  vm.runInContext(functionSource('focusAreaExplorerPlayer'), context);
  context.focusAreaExplorerPlayer();
  assert.deepEqual(context.focused, [123, -456]);
  assert.equal(context.selected, null, 'locating the player closes the selected find sheet');
  live = { ...live, online: false };
  context.focusAreaExplorerPlayer();
  assert.match(context.note, /Last reported position/);
  live = null; context.focused = null;
  context.focusAreaExplorerPlayer();
  assert.equal(context.focused, null, 'unknown positions cannot move the map');
}

function testCountsKeepUp() {
  // Steady uploads must not keep pushing the refresh back, so the finds count moves while the mod runs
  const queued = [];
  const context = vm.createContext({ Date, state: { realtimeRefreshTimers: {} }, refreshAreaExplorerFromEvent() {} });
  context.queueRealtimeRefresh = (key, callback, delay) => { queued.push(delay); context.state.realtimeRefreshTimers[key] = 1; };
  vm.runInContext(functionSource('queueAreaExplorerRefresh'), context);
  context.queueAreaExplorerRefresh(180);
  context.queueAreaExplorerRefresh(180);
  context.queueAreaExplorerRefresh(2000);
  assert.deepEqual(queued, [180], 'a refresh on its way is not postponed');
  // Back from the background (or a reconnect): the full sync brings the counts up to date too
  assert.match(functionSource('loadAll'), /activeTab === 'area-explorer'[\s\S]*?loadAreaExplorer\(\{ full: false \}\)/);
  assert.match(functionSource('loadAreaExplorer'), /summaryRequestId !== requestId\) return/, 'an older summary never replaces a newer one');
}

function testPlayerSigns() {
  // The profile's Signs button opens the list of signs with the player's name on them
  assert.match(functionSource('renderPlayerProfile'), /\$\{renderPlayerSignsButton\(profileUsername\)\}/, 'the profile has a Signs button');
  // The button is the count of signs, still opening them; a shimmer until the count is in
  const counts = vm.createContext({ state: {}, escapeHtml: String, formatNumber: value => value.toLocaleString('en-US'), Date });
  for (const name of ['playerSignCount', 'renderPlayerSignsButton']) vm.runInContext(functionSource(name), counts);
  assert.match(counts.renderPlayerSignsButton('Steve'), /data-player-signs="Steve"[^>]*><span class="is-loading-value" data-player-signs-count>-<\/span><\/button>/);
  counts.state.playerSignCounts = new Map([['steve', { total: 1234, at: Date.now() }]]);
  const button = counts.renderPlayerSignsButton('Steve');
  assert.match(button, /data-player-signs="Steve"/);
  assert.match(button, /<span data-player-signs-count>1,234<\/span><\/button>/);
  assert.match(button, /aria-label="Show 1,234 signs with Steve"/);
  assert.match(functionSource('ensurePlayerSignCount'), /signs\?player=\$\{encodeURIComponent\(username\)\}&count=1/);
  assert.match(functionSource('ensurePlayerSignCount'), /PLAYER_SIGN_COUNT_TTL_MS/, 'not fetched on every profile redraw');
  assert.match(functionSource('replacePlayerProfileContent'), /ensurePlayerSignCount\(profile\.username\)/);
  assert.doesNotMatch(source, /<span>Nearby Seen<\/span>/, 'it replaces Nearby Seen');
  assert.match(functionSource('openPlayerSigns'), /content\.innerHTML = renderPlayerSignsSkeleton\(\)/, 'a skeleton while the signs load');
  assert.match(functionSource('openPlayerSigns'), /\/api\/area-explorer\/signs\?player=\$\{encodeURIComponent\(username\)\}/);
  const context = vm.createContext({});
  vm.runInContext(functionSource('highlightPlayerSignName'), context);
  const sign = text => `<pre class="area-explorer-sign"><span class="area-explorer-sign-text">${text}</span></pre>`;
  assert.equal(context.highlightPlayerSignName(sign('Base of steve&#39;s Steven'), 'Steve'), sign('Base of <mark>steve</mark>&#39;s Steven'),
    'the name as a word, any case');
  assert.equal(context.highlightPlayerSignName(sign('say &quot;hi&quot;'), 'quot'), sign('say &quot;hi&quot;'), 'entities are left alone');
  assert.equal(context.highlightPlayerSignName('<span class="area-explorer-find-name">Steve</span>', 'Steve'), '<span class="area-explorer-find-name">Steve</span>',
    'only the sign text is marked');
  // Picked from the list, the sign opens in the Area Explorer once its scope is loaded
  assert.match(functionSource('loadAreaExplorer'), /pending\.scope === ae\.scope[\s\S]*?focusAreaExplorerMap\(pending\.x, pending\.z\)/);
}

function testMenuHeight() {
  // The right-click menu gives the spot with a fixed Y, in the copied coordinates and the Baritone command
  assert.match(source, /const AREA_EXPLORER_MENU_Y = 325;/);
  const menu = functionSource('openAreaExplorerMenu');
  assert.match(menu, /Copy coordinates \(\$\{x\} \$\{AREA_EXPLORER_MENU_Y\} \$\{z\}\)/);
  assert.match(menu, /`#goto \$\{x\} \$\{AREA_EXPLORER_MENU_Y\} \$\{z\}`/);
}

function testClusters() {
  const ae = { showFinds: true, visibleKinds: ['BASE', 'END_PORTAL', 'MARKER', 'ITEM', 'SIGN'], selectedId: null, nearby: null, extent: 1e9, points: [] };
  const context = vm.createContext({
    Math, Map, Set, Object, areaExplorerState: () => ae, AREA_EXPLORER_DEFAULT_LAYERS: ['END_PORTAL'],
    AREA_EXPLORER_KIND_ORDER: { SIGN: 0, ITEM: 1, MARKER: 2, BASE: 3 },
    areaExplorerInTerritory: () => true,
    isAreaExplorerPointNearby: point => !!ae.nearby && Math.hypot(point.x - ae.nearby.x, point.z - ae.nearby.z) <= 100
  });
  vm.runInContext(source.match(/const AREA_EXPLORER_MERGE_PX = \d+;/)[0].replace('const', 'var'), context);
  vm.runInContext(source.match(/const AREA_EXPLORER_MERGE_MAX_SCALE = [\d.]+;/)[0].replace('const', 'var'), context);
  for (const name of ['areaExplorerPointLayer', 'isAreaExplorerPointVisible', 'areaExplorerPointSize', 'areaExplorerPointZoomFactor', 'areaExplorerVisiblePoints',
    'areaExplorerMergeCell', 'areaExplorerMergedPoints', 'drawAreaExplorerPoints', 'areaExplorerHitAt']) vm.runInContext(functionSource(name), context);

  assert.equal(context.areaExplorerMergeCell(1), 0, 'close in, every find is drawn');
  assert.equal(context.areaExplorerMergeCell(0.05), 64, 'cells a power of two, a few pixels across');
  assert.equal(context.areaExplorerMergeCell(0.04), context.areaExplorerMergeCell(0.035), 'a small zoom keeps the same cells');
  assert.equal(context.areaExplorerPointZoomFactor(1), 1, 'full size close in');
  assert.equal(context.areaExplorerPointZoomFactor(0.001), 0.6, 'a little smaller far out, never tiny');
  // The finds look as they always did: no bubbles, rings or numbers over the map
  assert.doesNotMatch(functionSource('drawAreaExplorerPoints'), /fillText|globalAlpha/);

  ae.points = [
    { id: 'a', kind: 'SIGN', x: 10, z: 10 }, { id: 'b', kind: 'SIGN', x: 20, z: 30 }, { id: 'c', kind: 'BASE', x: 30, z: 20 },
    { id: 'far', kind: 'ITEM', x: 5000, z: 5000 }
  ];
  let visible = context.areaExplorerVisiblePoints();
  const drawn = context.areaExplorerMergedPoints(visible, 128);
  assert.deepEqual([...drawn.map(point => point.id)], ['a', 'c', 'far'], 'one find of a kind a cell, every kind kept');
  assert.equal(context.areaExplorerMergedPoints(visible, 128), drawn, 'worked out once a level');
  assert.equal(context.areaExplorerVisiblePoints(), visible, 'kept while nothing changes');

  // The picked find is always drawn
  ae.selectedId = 'a';
  visible = context.areaExplorerVisiblePoints();
  assert.deepEqual([...visible.alone.map(point => point.id)], ['a']);
  assert.equal(context.areaExplorerMergedPoints(visible, 128)[0].id, 'b', 'the next sign stands for the cell');
  ae.selectedId = null;

  // Drawn and hit
  const calls = { fill: 0 };
  const ctx = new Proxy({}, { get: (target, name) => name in target ? target[name] : name === 'fill' ? () => { calls.fill += 1; } : () => {}, set: (target, name, value) => { target[name] = value; return true; } });
  const colors = { SIGN: '#1', ITEM: '#2', MARKER: '#3', BASE: '#4', bg: '#0', text: '#f', signOutline: '#5' };
  context.drawAreaExplorerPoints(ctx, { cx: 0, cz: 0, scale: 0.05 }, colors, 800, 600);
  assert.equal(context.areaExplorerHitAt(400 + 5000 * 0.05, 300 + 5000 * 0.05, 10).id, 'far');
  assert.equal(context.areaExplorerHitAt(10, 10, 10), null);
  context.drawAreaExplorerPoints(ctx, { cx: 0, cz: 0, scale: 2 }, colors, 800, 600);
  assert.equal(context.areaExplorerHitAt(400 + 30 * 2, 300 + 20 * 2, 10).id, 'c');

  // 77,000 finds crowded round a base, zoomed out: a few thousand drawn, not 77,000, and fast once worked out
  ae.points = Array.from({ length: 77_000 }, (unused, i) => ({ id: String(i), kind: ['SIGN', 'ITEM', 'MARKER', 'BASE'][i % 4], x: (i * 7919) % 30_000 - 15_000, z: (i * 104_729) % 30_000 - 15_000 }))
    .sort((a, b) => context.AREA_EXPLORER_KIND_ORDER[a.kind] - context.AREA_EXPLORER_KIND_ORDER[b.kind]); // as the page sorts them
  const far = { cx: 0, cz: 0, scale: 0.004 };
  context.drawAreaExplorerPoints(ctx, far, colors, 800, 600);
  assert.ok(ae.drawnHits.length < 10_000, `merged instead of every find (${ae.drawnHits.length} drawn)`);
  calls.fill = 0;
  const started = performance.now();
  for (let frame = 0; frame < 20; frame++) context.drawAreaExplorerPoints(ctx, { ...far, cx: frame * 100 }, colors, 800, 600);
  const perFrame = (performance.now() - started) / 20;
  assert.ok(perFrame < 25, `panning redraws quickly (${perFrame.toFixed(1)} ms a frame)`);
  assert.ok(calls.fill <= 20 * 4, `one fill a kind (${calls.fill / 20} a frame)`);
  // The drawn finds are a picture reused while the view stays: the live trail's redraws skip them
  assert.match(functionSource('drawAreaExplorerPointsLayer'), /if \(layer\.key !== key \|\| layer\.visible !== visible\)/);
  assert.match(source, /drawAreaExplorerPointsLayer\(ctx, view, colors, width, height, ratio\);/);
}

(async () => {
  await testFindsRaceAndScroll();
  await testMapRace();
  await testSelectionRace();
  await testMarkerVisibility();
  testEndPortalLayer();
  testNearbyMarkers();
  await testLiveTelemetry();
  testReadingPositionKept();
  testTouchGestures();
  testFullscreenEscapePriority();
  testMarkerAboveDetails();
  testEmbeddedTouch();
  testEyeClickAndHold();
  testMarkerTypes();
  testLocatePlayer();
  testCountsKeepUp();
  testPlayerSigns();
  testMenuHeight();
  testClusters();
  console.log('Area Explorer UI behavior tests passed.');
})().catch(error => { console.error(error); process.exitCode = 1; });
