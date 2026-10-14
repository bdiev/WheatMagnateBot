'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../public/app.js'), 'utf8');
const sharedSearch = source.slice(source.indexOf('function seenPlayerStatusText('), source.indexOf('\nfunction setWhisperOpen('));

async function run() {
  let pathRequested;
  let destination;
  let openedProfile;
  let collapsed;
  const suggestions = { hidden: true, innerHTML: '' };
  const input = { value: 'OldName', blur() {} };
  const player = { username: 'bdiev_', uuid: 'uuid', isOnline: true, onlineSince: '2026-10-14T10:00:00Z' };
  const state = { seenPlayers: [], seenSearchTimer: null, seenOnlineTimer: null };
  const context = vm.createContext({
    state, publicPlayerUsername: 'CurrentPlayer',
    $: selector => selector === '#seenSuggestions' ? suggestions : input,
    fetchJson: async path => { pathRequested = path; return { players: [player] }; },
    playerIdentity: username => `<span>${username}</span>`,
    escapeHtml: text => text,
    formatDurationMs: () => '1h', formatAgo: () => '1d ago',
    updateSeenOnlineDurations() {},
    setInterval: () => 1, clearInterval() {}, setTimeout: callback => callback(), clearTimeout() {},
    window: { location: { assign(path) { destination = path; } }, scrollTo() {} },
    setSeenSearchOpen: open => { collapsed = open; },
    openPlayerProfile: (username, options) => { openedProfile = { username, options }; },
    encodeURIComponent
  });
  vm.runInContext(sharedSearch, context);
  suggestions.querySelectorAll = () => [];
  await context.runSeenSearch(' OldName ');
  assert.equal(pathRequested, '/api/seen-search?query=OldName');
  assert.equal(suggestions.hidden, false);
  assert.match(suggestions.innerHTML, /class="seen-option"/);
  assert.match(suggestions.innerHTML, /bdiev_/);
  assert.match(suggestions.innerHTML, /data-seen-online-since/);
  const click = { target: { closest: () => ({ dataset: { index: '0' } }) } };
  context.handleSeenSuggestionClick(click);
  assert.equal(destination, '/player/bdiev_', 'public search opens the canonical player URL');
  assert.equal(openedProfile, undefined);
  context.publicPlayerUsername = '';
  context.handleSeenSuggestionClick(click);
  assert.equal(collapsed, false);
  assert.equal(openedProfile.username, 'bdiev_');
  assert.equal(openedProfile.options.returnToSeenSearch.query, 'OldName', 'dashboard keeps its search-return behavior');
  await context.runSeenSearch('');
  assert.equal(suggestions.hidden, true);
  assert.equal(state.seenPlayers.length, 0);
  console.log('Shared player search rendering and public/dashboard navigation tests passed.');
}
run().catch(error => { console.error(error); process.exitCode = 1; });
