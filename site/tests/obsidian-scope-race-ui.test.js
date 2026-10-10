'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.resolve(__dirname, '..', 'public', 'app.js'), 'utf8');
const extract = (start, end) => source.slice(source.indexOf(start), source.indexOf(end, source.indexOf(start)));
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };

function harness() {
  const requests = [], animations = [], rendered = [], saved = [];
  const buttons = ['personal', 'all'].map(scope => ({
    dataset: { obsidianScope: scope }, disabled: false,
    classList: { toggle() {} }, setAttribute(name, value) { this[name] = value; }
  }));
  const control = { dataset: {}, querySelectorAll: () => buttons };
  const state = {
    activeAccountId: 'primary', accountSwitchGeneration: 1,
    currentUser: { role: 'admin' }, obsidianStatsScope: 'personal', obsidianScopeTransition: null
  };
  const context = vm.createContext({
    state, $: () => control,
    activeAccountIsPrimary: () => state.activeAccountId === 'primary',
    localStorage: { setItem: (key, value) => saved.push(value) },
    fetchJson: url => { const request = deferred(); requests.push({ url, ...request }); return request.promise; },
    startObsidianScopeAnimation: direction => {
      const done = deferred();
      const animation = { direction, finished: done.promise, finish: done.resolve, cancel: done.resolve };
      animations.push(animation);
      return animation;
    },
    updateObsidianFarmControlsVisibility: scope => rendered.push(scope)
  });
  vm.runInContext(extract('function obsidianStatsPath()', 'function startObsidianScopeAnimation'), context);
  vm.runInContext(extract('async function changeObsidianStatsScope(', 'function obsidianSeriesValueForAccount'), context);
  // Exercise the actual render guard without unrelated chart/DOM rendering.
  vm.runInContext(extract('function renderObsidian(payload)', '  const scopeControl =') + '\n}', context);
  const click = scope => context.changeObsidianStatsScope({ target: {
    closest: () => buttons.find(button => button.dataset.obsidianScope === scope)
  } });
  return { context, state, requests, animations, buttons, rendered, saved, click };
}

(async () => {
  {
    const h = harness();
    const pending = [];
    for (let i = 0; i < 15; i++) {
      const scope = i % 2 === 0 ? 'all' : 'personal';
      pending.push(h.click(scope));
      assert.equal(h.state.obsidianStatsScope, scope);
      assert.ok(h.buttons.every(button => !button.disabled), 'rapid clicks remain available during loading/animation');
    }
    // Responses arrive in reverse order, including obsolete failures.
    h.animations.at(-1).finish();
    h.requests[14].resolve({ scope: 'all' });
    await flush();
    h.animations.at(-1).finish();
    for (let i = 13; i >= 0; i--) {
      if (i % 3 === 0) h.requests[i].reject(new Error('obsolete failure'));
      else h.requests[i].resolve({ scope: i % 2 === 0 ? 'all' : 'personal' });
    }
    await Promise.all(pending);
    assert.deepEqual(h.rendered, ['all'], 'only the latest request renders');
    assert.equal(h.state.obsidianStatsScope, 'all');
    assert.equal(h.saved.at(-1), 'all', 'stale failures cannot roll back the selection');
    assert.equal(h.state.obsidianScopeTransition, null);
    h.context.renderObsidian({ scope: 'personal' });
    assert.deepEqual(h.rendered, ['all'], 'old periodic/SSE responses cannot repaint the previous scope');
    assert.equal(h.buttons[1]['aria-pressed'], 'true');
  }
  {
    const h = harness();
    const pending = h.click('all');
    h.requests[0].resolve({ scope: 'all' });
    h.animations[0].finish();
    await flush();
    const next = h.click('personal');
    h.requests[1].resolve({ scope: 'personal' });
    h.animations.at(-1).finish();
    await flush();
    h.animations.at(-1).finish();
    await Promise.all([pending, next]);
    assert.deepEqual(h.rendered, ['all', 'personal'], 'clicks during entrance animation switch correctly');
    assert.equal(h.state.obsidianStatsScope, 'personal');
  }
  {
    const h = harness();
    const pending = h.click('all');
    h.state.activeAccountId = 'secondary';
    h.state.accountSwitchGeneration++;
    h.requests[0].resolve({ scope: 'all' });
    h.animations[0].finish();
    await pending;
    assert.deepEqual(h.rendered, [], 'an account change invalidates the pending transition');
  }
  {
    const h = harness();
    const pending = h.click('all');
    const failed = assert.rejects(pending, /current failure/);
    h.requests[0].reject(new Error('current failure'));
    h.animations[0].finish();
    await flush();
    assert.equal(h.state.obsidianStatsScope, 'personal', 'a current failure restores the previous choice');
    h.requests[1].resolve({ scope: 'personal' });
    await flush();
    h.animations.at(-1).finish();
    await failed;
    assert.ok(h.buttons.every(button => !button.disabled));
    assert.equal(h.state.obsidianScopeTransition, null);
  }
  console.log('Obsidian scope race UI tests passed.');
})().catch(error => { console.error(error); process.exitCode = 1; });
