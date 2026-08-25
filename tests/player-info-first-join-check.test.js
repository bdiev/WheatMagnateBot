'use strict';

const assert = require('node:assert/strict');
const {
  MIN_ACCOUNT_AGE_MS,
  MIN_MESSAGES,
  MIN_PLAYTIME_SECONDS,
  createPlayerInfoFirstJoinCheck,
  passesFirstJoinThreshold
} = require('../features/playerInfoFirstJoinCheck');

function createClock() {
  let currentTime = 1_000_000;
  let nextId = 1;
  const timers = new Map();
  return {
    now: () => currentTime,
    setTimer(callback, delay) {
      const id = nextId++;
      timers.set(id, { callback, at: currentTime + delay, delay });
      return id;
    },
    clearTimer(id) {
      timers.delete(id);
    },
    nextDelay() {
      return [...timers.values()].sort((first, second) => first.at - second.at)[0]?.delay;
    },
    async advance(milliseconds) {
      const target = currentTime + milliseconds;
      while (true) {
        const due = [...timers.entries()]
          .filter(([, timer]) => timer.at <= target)
          .sort((first, second) => first[1].at - second[1].at)[0];
        if (!due) break;
        currentTime = due[1].at;
        timers.delete(due[0]);
        await due[1].callback();
      }
      currentTime = target;
    }
  };
}

function createCheck({ random = () => 0 } = {}) {
  const clock = createClock();
  const sent = [];
  const prepared = [];
  const logs = [];
  const sender = { accountId: 'selected-bot' };
  const check = createPlayerInfoFirstJoinCheck({
    isReady: () => true,
    selectSender: () => sender,
    prepareLookup: async item => {
      prepared.push(item);
      return true;
    },
    sendCommand: (command, item, selectedSender) => {
      assert.equal(selectedSender, sender);
      sent.push({ command, item });
      return true;
    },
    initialDelayMinMs: 10_000,
    initialDelayMaxMs: 15_000,
    commandDelayMinMs: 20_000,
    commandDelayMaxMs: 20_000,
    responseTimeoutMs: 25_000,
    setTimer: clock.setTimer,
    clearTimer: clock.clearTimer,
    now: clock.now,
    random,
    onLog: message => logs.push(message),
    onError: error => { throw error; }
  });
  return { check, clock, sent, prepared, logs };
}

async function testFirstCommandUsesTenToFifteenSecondDelay() {
  const { check, clock, sent } = createCheck({ random: () => 0.999 });
  assert.equal(check.enqueue('NewPlayer'), true);
  assert.equal(check.enqueue('newplayer'), false, 'one player must only have one active check');
  assert.ok(clock.nextDelay() >= 10_000 && clock.nextDelay() <= 15_000);
  await clock.advance(15_000);
  assert.equal(sent.length, 1);
  assert.match(sent[0].command, /^!(?:pt|msgs|jd) NewPlayer$/);
}

async function testBelowThresholdStopsRemainingChecks() {
  const { check, clock, sent } = createCheck();
  check.enqueue('FreshPlayer');
  await clock.advance(10_000);
  assert.equal(sent[0].item.metric, 'playtime');
  assert.equal(check.observe({
    metric: 'playtime',
    targetUsername: 'FreshPlayer',
    observedValue: MIN_PLAYTIME_SECONDS - 1,
    reason: 'first-join'
  }), true);
  await clock.advance(60_000);
  assert.equal(sent.length, 1, 'a failed gate must cancel all remaining commands');
  assert.equal(check.getStatus().pendingPlayers, 0);
}

async function testPassingResultsCheckAllRemainingMetrics() {
  const { check, clock, sent } = createCheck();
  check.enqueue('EstablishedPlayer');
  await clock.advance(10_000);
  check.observe({
    metric: 'playtime', targetUsername: 'EstablishedPlayer',
    observedValue: MIN_PLAYTIME_SECONDS, reason: 'first-join'
  });
  await clock.advance(20_000);
  assert.equal(sent[1].item.metric, 'messages');
  check.observe({
    metric: 'messages', targetUsername: 'EstablishedPlayer',
    observedValue: MIN_MESSAGES, reason: 'first-join'
  });
  await clock.advance(20_000);
  assert.equal(sent[2].item.metric, 'joinDate');
  check.observe({
    metric: 'joinDate', targetUsername: 'EstablishedPlayer',
    observedValue: new Date(clock.now() - MIN_ACCOUNT_AGE_MS), reason: 'first-join'
  });
  assert.equal(check.getStatus().pendingPlayers, 0);
  assert.deepEqual(sent.map(entry => entry.item.metric), ['playtime', 'messages', 'joinDate']);
}

function testThresholdBoundaries() {
  const now = 2_000_000;
  assert.equal(passesFirstJoinThreshold('playtime', 599, now), false);
  assert.equal(passesFirstJoinThreshold('playtime', 600, now), true);
  assert.equal(passesFirstJoinThreshold('messages', 4, now), false);
  assert.equal(passesFirstJoinThreshold('messages', 5, now), true);
  assert.equal(passesFirstJoinThreshold('joinDate', new Date(now - MIN_ACCOUNT_AGE_MS + 1), now), false);
  assert.equal(passesFirstJoinThreshold('joinDate', new Date(now - MIN_ACCOUNT_AGE_MS), now), true);
  assert.equal(
    passesFirstJoinThreshold('joinDate', new Date(0), now, { observedAgeMs: MIN_ACCOUNT_AGE_MS - 1 }),
    false,
    'the relative age in a named jd response must override its date-only timestamp'
  );
}

Promise.resolve()
  .then(testFirstCommandUsesTenToFifteenSecondDelay)
  .then(testBelowThresholdStopsRemainingChecks)
  .then(testPassingResultsCheckAllRemainingMetrics)
  .then(testThresholdBoundaries)
  .then(() => console.log('Player first-join info check tests passed.'));
