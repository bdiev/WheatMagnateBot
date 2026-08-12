'use strict';

const assert = require('node:assert/strict');
const { createPlaytimeFeature } = require('../features/playtime');
const {
  createPlayerInfoObservation,
  parseJoinDateResponse,
  parsePlaytimeResponse
} = require('../features/playerInfoObservation');

const { parsePlaytime } = createPlaytimeFeature({
  pool: null,
  getOnlinePlayerUsernames: () => [],
  getPlayerHeadEmoji: () => '',
  statusEmojis: {},
  uiButtonEmojis: {}
});

function fakeClock() {
  let currentTime = 0;
  let nextId = 1;
  const timers = new Map();
  return {
    now: () => currentTime,
    setTimer(callback, delay) {
      const id = nextId++;
      timers.set(id, { callback, at: currentTime + delay });
      return id;
    },
    clearTimer(id) {
      timers.delete(id);
    },
    advance(milliseconds) {
      const end = currentTime + milliseconds;
      while (true) {
        const due = [...timers.entries()]
          .filter(([, timer]) => timer.at <= end)
          .sort((first, second) => first[1].at - second[1].at)[0];
        if (!due) break;
        currentTime = due[1].at;
        timers.delete(due[0]);
        due[1].callback();
      }
      currentTime = end;
    }
  };
}

function createTracker({ preferredOnline = true } = {}) {
  const clock = fakeClock();
  const updates = [];
  const reasons = [];
  const tracker = createPlayerInfoObservation({
    parsePlaytime,
    now: clock.now,
    setTimer: clock.setTimer,
    clearTimer: clock.clearTimer,
    fallbackGraceMs: 2_500,
    lookupTtlMs: 20_000,
    isSourceOnline: source => source === 'lolritterbot' && preferredOnline,
    onPlaytime: (targetUsername, value, source, context) => {
      updates.push({ type: 'pt', targetUsername, value, source });
      reasons.push(context?.reason);
    },
    onJoinDate: (targetUsername, value, source, context) => {
      updates.push({ type: 'jd', targetUsername, value, source });
      reasons.push(context?.reason);
    }
  });
  return { clock, tracker, updates, reasons };
}

function testActualResponseFormats() {
  assert.deepEqual(
    parsePlaytimeResponse('bdiev_: 77 Days, 9 Hours, 5 Minutes', parsePlaytime),
    { targetUsername: 'bdiev_', observedValue: 6_685_500 }
  );
  assert.deepEqual(
    parsePlaytimeResponse('bdiev_: 76 days 17 hours 57 minutes. [81/50375]', parsePlaytime),
    { targetUsername: 'bdiev_', observedValue: 6_631_020 }
  );
  assert.deepEqual(
    parseJoinDateResponse('I first saw bdiev_ 2 years ago on Nov 16th, 2024.'),
    { targetUsername: 'bdiev_', observedValue: new Date('2024-11-16T00:00:00.000Z') }
  );
  assert.deepEqual(
    parseJoinDateResponse('bdiev_: 11/16/2024 10:30:37 (1 year, 268 days ago)'),
    { targetUsername: 'bdiev_', observedValue: new Date('2024-11-16T10:30:37.000Z') }
  );
}

function testPreferredPlaytimeWins() {
  const { tracker, updates } = createTracker({ preferredOnline: true });
  tracker.observe('Requester', '!pt bdiev_');
  tracker.observe('moooomoooo', 'bdiev_: 76 days 17 hours 57 minutes. [81/50375]');
  assert.deepEqual(updates, [], 'fallback must wait while LolRiTTeRBot is online');
  tracker.observe('LolRiTTeRBot', 'bdiev_: 77 Days, 9 Hours, 5 Minutes');
  assert.deepEqual(updates, [{
    type: 'pt', targetUsername: 'bdiev_', value: 6_685_500, source: 'lolritterbot'
  }]);
}

function testFallbackWhenPreferredDoesNotAnswer() {
  const { clock, tracker, updates } = createTracker({ preferredOnline: true });
  tracker.observe('bdiev_', '!pt');
  tracker.observe('moooomoooo', 'bdiev_: 76 days 17 hours 57 minutes. [81/50375]');
  clock.advance(2_499);
  assert.equal(updates.length, 0);
  clock.advance(1);
  assert.deepEqual(updates, [{
    type: 'pt', targetUsername: 'bdiev_', value: 6_631_020, source: 'moooomoooo'
  }]);
}

function testFallbackWhenPreferredIsOffline() {
  const { tracker, updates } = createTracker({ preferredOnline: false });
  tracker.observe('Requester', '!jd bdiev_');
  tracker.observe('moooomoooo', 'bdiev_: 11/16/2024 10:30:37 (1 year, 268 days ago)');
  assert.equal(updates.length, 1, 'fallback must apply immediately when LolRiTTeRBot is offline');
  assert.equal(updates[0].source, 'moooomoooo');
  assert.equal(updates[0].value.toISOString(), '2024-11-16T10:30:37.000Z');
}

function testFallbackJoinDateAppliesOnlyOnce() {
  const { tracker, updates } = createTracker({ preferredOnline: false });
  tracker.observe('Requester', '!jd bdiev_');
  tracker.observe('moooomoooo', 'bdiev_: 11/16/2024 10:30:37 (1 year, 268 days ago)');
  tracker.observe('LolRiTTeRBot', 'I first saw bdiev_ 2 years ago on Nov 16th, 2024.');
  assert.deepEqual(updates.map(update => update.source), ['moooomoooo'], 'one lookup must update a metric only once');
  assert.equal(updates[0].value.toISOString(), '2024-11-16T10:30:37.000Z');
}

function testSiteRefreshSurvivesEchoedCommand() {
  const { tracker, updates, reasons } = createTracker({ preferredOnline: false });
  assert.equal(tracker.requestSiteRefresh('playtime', 'bdiev_'), true);
  tracker.observe('WheatMagnate', '!pt bdiev_');
  tracker.observe('moooomoooo', 'bdiev_: 76 days 17 hours 57 minutes. [81/50375]');
  assert.equal(updates.length, 1);
  assert.equal(updates[0].type, 'pt');
  assert.deepEqual(reasons, ['site'], 'an echoed command must not downgrade a site-authorized refresh');
}

function testInvalidSiteRefreshIsRejected() {
  const { tracker, updates } = createTracker();
  assert.equal(tracker.requestSiteRefresh('unknown', 'bdiev_'), false);
  assert.equal(tracker.requestSiteRefresh('playtime', 'not a player'), false);
  assert.deepEqual(updates, []);
}

function testUntrustedSpeakersAndUnrequestedResponsesAreIgnored() {
  const { tracker, updates } = createTracker();
  tracker.observe('Requester', '!pt bdiev_');
  tracker.observe('RandomPlayer', 'bdiev_: 999 Days, 1 Hour');
  tracker.observe('LolRiTTeRBot', 'SomebodyElse: 77 Days, 9 Hours, 5 Minutes');
  assert.deepEqual(updates, []);
}

testActualResponseFormats();
testPreferredPlaytimeWins();
testFallbackWhenPreferredDoesNotAnswer();
testFallbackWhenPreferredIsOffline();
testFallbackJoinDateAppliesOnlyOnce();
testSiteRefreshSurvivesEchoedCommand();
testInvalidSiteRefreshIsRejected();
testUntrustedSpeakersAndUnrequestedResponsesAreIgnored();
console.log('Player info observation tests passed.');
