'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  MIN_ACCOUNT_AGE_MS,
  MIN_MESSAGES,
  MIN_PLAYTIME_SECONDS,
  createPlayerInfoFirstJoinCheck,
  passesFirstJoinThreshold
} = require('../features/playerInfoFirstJoinCheck');

const botSource = fs.readFileSync(path.resolve(__dirname, '..', 'bot.js'), 'utf8');
assert.match(
  botSource,
  /handleMinecraftPlayerChat[\s\S]*playerInfoFirstJoinCheck\?\.observePlayerMessage\(username\)/,
  'public messages from a queued player must contribute to the first-session adjustment'
);
assert.match(
  botSource,
  /bot\.on\('playerJoined'[\s\S]*playerInfoFirstJoinCheck\?\.playerJoined\(player\.username\)[\s\S]*bot\.on\('playerLeft'[\s\S]*playerInfoFirstJoinCheck\?\.playerLeft\(player\.username\)/,
  'first-join checks must pause on join and resume only after leave'
);

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

async function testFirstCommandWaitsForLeaveThenUsesTenToFifteenSecondDelay() {
  const { check, clock, sent } = createCheck({ random: () => 0.999 });
  assert.equal(check.enqueue('NewPlayer'), true);
  assert.equal(check.enqueue('newplayer'), false, 'one player must only have one active check');
  assert.equal(clock.nextDelay(), undefined, 'joining for the first time must not start a command timer');
  await clock.advance(60_000);
  assert.equal(sent.length, 0, 'no commands may be sent while the new player remains online');
  assert.equal(check.playerLeft('NewPlayer'), true);
  assert.ok(clock.nextDelay() >= 10_000 && clock.nextDelay() <= 15_000);
  await clock.advance(15_000);
  assert.equal(sent.length, 1);
  assert.match(sent[0].command, /^!(?:pt|msgs|jd) NewPlayer$/);
}

async function testBelowThresholdStopsRemainingChecks() {
  const { check, clock, sent } = createCheck();
  check.enqueue('FreshPlayer');
  check.playerLeft('FreshPlayer');
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
  check.playerLeft('EstablishedPlayer');
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

async function testRejoiningPausesCommandsUntilTheNextLeave() {
  const { check, clock, sent } = createCheck();
  check.enqueue('ReturningPlayer');
  check.playerLeft('ReturningPlayer');
  await clock.advance(5_000);
  assert.equal(check.playerJoined('ReturningPlayer'), true);
  await clock.advance(60_000);
  assert.equal(sent.length, 0, 'a player who rejoins during the delay must not receive an automatic command');

  check.playerLeft('ReturningPlayer');
  await clock.advance(10_000);
  assert.equal(sent.length, 1);
  check.observe({
    metric: 'playtime', targetUsername: 'ReturningPlayer',
    observedValue: MIN_PLAYTIME_SECONDS + 60, reason: 'first-join'
  });
  check.playerJoined('ReturningPlayer');
  await clock.advance(60_000);
  assert.equal(sent.length, 1, 'remaining checks must pause when the player comes back online');
  check.playerLeft('ReturningPlayer');
  await clock.advance(20_000);
  assert.equal(sent.length, 2, 'the remaining checks may resume after the player leaves again');
}

async function testLongFirstSessionDoesNotInflatePlaytimeGate() {
  const { check, clock, sent } = createCheck();
  check.enqueue('LongSessionPlayer');
  await clock.advance(60 * 60 * 1000);
  check.playerLeft('LongSessionPlayer');
  await clock.advance(10_000);
  assert.equal(sent[0].item.metric, 'playtime');
  check.observe({
    metric: 'playtime',
    targetUsername: 'LongSessionPlayer',
    observedValue: (60 * 60) + MIN_PLAYTIME_SECONDS - 1,
    reason: 'first-join'
  });
  assert.equal(check.getStatus().pendingPlayers, 0,
    'playtime earned during the first observed session must be removed before checking the threshold');
}

async function testFirstSessionMessagesDoNotInflateMessageGate() {
  const { check, clock, sent } = createCheck({ random: () => 0.5 });
  check.enqueue('ChattyNewPlayer');
  for (let index = 0; index < 100; index += 1) check.observePlayerMessage('ChattyNewPlayer');
  check.playerLeft('ChattyNewPlayer');
  await clock.advance(15_000);
  assert.equal(sent[0].item.metric, 'messages');
  check.observe({
    metric: 'messages',
    targetUsername: 'ChattyNewPlayer',
    observedValue: 100 + MIN_MESSAGES - 1,
    reason: 'first-join'
  });
  assert.equal(check.getStatus().pendingPlayers, 0,
    'messages sent after the first observed join must be removed before checking the threshold');
}

async function testWaitingDoesNotInflateJoinDateGate() {
  const { check, clock, sent } = createCheck({ random: () => 0.999 });
  check.enqueue('BrandNewAccount');
  await clock.advance(60 * 60 * 1000);
  check.playerLeft('BrandNewAccount');
  await clock.advance(15_000);
  assert.equal(sent[0].item.metric, 'joinDate');
  check.observe({
    metric: 'joinDate',
    targetUsername: 'BrandNewAccount',
    observedValue: new Date(clock.now() - (60 * 60 * 1000 + MIN_ACCOUNT_AGE_MS - 1)),
    observedAgeMs: 60 * 60 * 1000 + MIN_ACCOUNT_AGE_MS - 1,
    reason: 'first-join'
  });
  assert.equal(check.getStatus().pendingPlayers, 0,
    'account age must be evaluated at the first observed join rather than after the player leaves');
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
  .then(testFirstCommandWaitsForLeaveThenUsesTenToFifteenSecondDelay)
  .then(testBelowThresholdStopsRemainingChecks)
  .then(testPassingResultsCheckAllRemainingMetrics)
  .then(testRejoiningPausesCommandsUntilTheNextLeave)
  .then(testLongFirstSessionDoesNotInflatePlaytimeGate)
  .then(testFirstSessionMessagesDoNotInflateMessageGate)
  .then(testWaitingDoesNotInflateJoinDateGate)
  .then(testThresholdBoundaries)
  .then(() => console.log('Player first-join info check tests passed.'));
