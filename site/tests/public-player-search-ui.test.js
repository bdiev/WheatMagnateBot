'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

class Element {
  constructor() { this.events = {}; this.attributes = {}; this.children = []; this.hidden = false; }
  addEventListener(type, handler) { this.events[type] = handler; }
  setAttribute(name, value) { this.attributes[name] = value; }
  removeAttribute(name) { delete this.attributes[name]; }
  replaceChildren() { this.children = []; }
  append(child) { this.children.push(child); }
  dispatch(type, extra = {}) {
    const event = { preventDefault() { this.prevented = true; }, stopPropagation() {}, ...extra };
    this.events[type]?.(event);
    return event;
  }
}

async function run() {
  const input = new Element();
  const list = new Element();
  const status = new Element();
  const form = new Element();
  form.elements = { username: input };
  form.querySelector = selector => selector.includes('listbox') ? list : status;
  const document = { activeElement: input, createElement: () => new Element() };
  const requests = [];
  let timer;
  let destination;
  const context = vm.createContext({
    document, AbortController, encodeURIComponent,
    window: { location: { assign(url) { destination = url; } } },
    setTimeout(callback) { timer = callback; return 1; },
    clearTimeout() { timer = undefined; },
    fetch(url, options) { return new Promise(resolve => requests.push({ url, options, resolve })); }
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../public/public-player-search.js'), 'utf8'), context);
  context.setupPublicPlayerSearch(form);

  const type = value => { input.value = value; input.dispatch('input'); };
  const complete = (index, players, ok = true) => requests[index].resolve({ ok, json: async () => ({ players }) });
  type('b');
  type('bd');
  assert.equal(requests.length, 0, 'typing is debounced');
  const older = timer();
  type('bdie');
  assert.equal(requests[0].options.signal.aborted, true);
  const newer = timer();
  complete(1, [{ username: 'bdiev_' }, { username: '<script>' }, { username: 'BdieTwo' }]);
  await newer;
  complete(0, [{ username: 'StaleName' }]);
  await older;
  assert.deepEqual(list.children.map(child => child.textContent), ['bdiev_', 'BdieTwo'], 'stale responses and invalid nicknames cannot replace suggestions');
  assert.equal(list.hidden, false);
  assert.equal(input.attributes['aria-expanded'], 'true');
  input.dispatch('keydown', { key: 'ArrowDown' });
  assert.equal(list.children[0].attributes['aria-selected'], 'true');
  input.dispatch('keydown', { key: 'ArrowUp' });
  input.dispatch('keydown', { key: 'Enter' });
  assert.equal(destination, '/player/BdieTwo', 'Enter opens the highlighted suggestion');
  assert.equal(list.children[0].dispatch('pointerdown').prevented, true, 'touch and mouse selection preserve input focus');

  type('new');
  const pending = timer();
  input.dispatch('keydown', { key: 'Escape' });
  complete(2, [{ username: 'NewPlayer' }]);
  await pending;
  assert.equal(list.hidden, true, 'a late response must not reopen a dismissed list');
  input.dispatch('focus');
  assert.equal(list.hidden, false);
  input.dispatch('blur');
  assert.equal(list.hidden, true);

  type('Unknown');
  const empty = timer();
  complete(3, []);
  await empty;
  assert.equal(status.textContent, 'No players found');
  form.dispatch('submit');
  assert.equal(destination, '/player/Unknown', 'exact nickname navigation remains available without suggestions');
  type('bad.name');
  assert.equal(timer, undefined);
  form.dispatch('submit');
  assert.equal(destination, '/player/Unknown', 'invalid names cannot navigate');
  console.log('Public player autocomplete race, keyboard and validation tests passed.');
}

run().catch(error => { console.error(error); process.exitCode = 1; });
