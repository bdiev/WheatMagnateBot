'use strict';

const assert = require('node:assert/strict');
const { DiscordChatForwardQueue } = require('../discord/chat-forward-queue');
const { formatDiscordBridgeMessage } = require('../discord/chat-message-format');

const wait = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

function testDiscordInviteFormatting() {
  const expectedInvite = 'Join: https://discord\\[.\\]gg/4RQJvRngwy';
  const clickableInvite = 'Join: https://discord.gg/4RQJvRngwy';
  assert.equal(
    formatDiscordBridgeMessage('Join: [https://discord.gg/4RQJvRngwy](https://discord.gg/4RQJvRngwy)'),
    expectedInvite
  );
  assert.equal(
    formatDiscordBridgeMessage('Join: [https://discord[.]gg/4RQJvRngwy](https://discord[.]gg/4RQJvRngwy)'),
    expectedInvite,
    'an already neutralized invite label must not break Markdown parsing'
  );
  assert.equal(
    formatDiscordBridgeMessage('Join: [https://discord/[./]gg/4RQJvRngwy](https://discord[.]gg/4RQJvRngwy)'),
    expectedInvite,
    'a server-obfuscated invite label must collapse to the clean destination once'
  );
  assert.equal(
    formatDiscordBridgeMessage(
      'Join: [https://discord.gg/4RQJvRngwy](https://discord.gg/4RQJvRngwy)',
      { allowDiscordInvites: true }
    ),
    clickableInvite,
    'trusted bot invites must remain clickable'
  );
  assert.equal(
    formatDiscordBridgeMessage(
      'Join: [https://discord/[./]gg/4RQJvRngwy](https://discord[.]gg/4RQJvRngwy)',
      { allowDiscordInvites: true }
    ),
    clickableInvite,
    'trusted server-obfuscated invites must be restored after flattening'
  );
  assert.equal(
    formatDiscordBridgeMessage('[Server map](https://map.example.net/)'),
    'Server map (https://map.example.net/)'
  );
}

async function testSerialDelivery() {
  let active = 0;
  let maxActive = 0;
  const delivered = [];
  const sources = [];
  const forwarder = new DiscordChatForwardQueue({
    perUserBurst: 20,
    minSendIntervalMs: 0,
    send: async item => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await wait(5);
      delivered.push(item.message);
      sources.push(item.source);
      active -= 1;
      return true;
    }
  });

  const results = await Promise.all([
    forwarder.enqueue({ username: 'Alice', message: 'one', source: 'mineflayer-message-greenchat' }),
    forwarder.enqueue({ username: 'Bob', message: 'two' }),
    forwarder.enqueue({ username: 'Carol', message: 'three' })
  ]);

  assert.deepEqual(results, [true, true, true]);
  assert.equal(maxActive, 1, 'only one Discord request may be in flight');
  assert.deepEqual(delivered, ['one', 'two', 'three']);
  assert.deepEqual(sources, ['mineflayer-message-greenchat', 'unspecified', 'unspecified']);
}

async function testFloodSuppressionAndSummary() {
  const delivered = [];
  const suppressed = [];
  const forwarder = new DiscordChatForwardQueue({
    perUserBurst: 2,
    perUserWindowMs: 1_000,
    summaryDelayMs: 10,
    minSendIntervalMs: 0,
    send: async item => {
      delivered.push(item);
      return true;
    },
    onSuppressed: event => suppressed.push(event)
  });

  const results = await Promise.all([
    forwarder.enqueue({ username: 'Spammer', message: 'one' }),
    forwarder.enqueue({ username: 'Spammer', message: 'two' }),
    forwarder.enqueue({ username: 'Spammer', message: 'three' }),
    forwarder.enqueue({ username: 'Spammer', message: 'four' }),
    forwarder.enqueue({ username: 'Spammer', message: 'five' })
  ]);
  await wait(30);

  assert.deepEqual(results, [true, true, true, true, true]);
  assert.equal(delivered.length, 3, 'suppressed flood must become one summary');
  assert.deepEqual(delivered.slice(0, 2).map(item => item.message), ['one', 'two']);
  assert.match(delivered[2].message, /Skipped 3 messages/);
  assert.equal(delivered[2].allowMentions, false);
  assert.equal(delivered[2].summaryCount, 3);
  assert.deepEqual(
    suppressed.map(event => [event.reason, event.message]),
    [
      ['per-user-burst', 'three'],
      ['per-user-burst', 'four'],
      ['per-user-burst', 'five']
    ],
    'flood suppression must report which messages were not delivered'
  );
}

async function testSameMillisecondDuplicatesAreSuppressed() {
  const delivered = [];
  const suppressed = [];
  const forwarder = new DiscordChatForwardQueue({
    perUserBurst: 8,
    perUserWindowMs: 10_000,
    duplicateWindowMs: 5_000,
    summaryDelayMs: 10,
    minSendIntervalMs: 0,
    send: async item => {
      delivered.push(item);
      return true;
    },
    onSuppressed: event => suppressed.push(event)
  });

  const repeated = 'same flood message';
  const createdAt = Date.now();
  const results = await Promise.all(Array.from({ length: 8 }, () =>
    forwarder.enqueue({ username: 'Spammer', message: repeated, createdAt })
  ));
  await wait(30);

  assert.deepEqual(results, Array(8).fill(true));
  assert.equal(delivered.length, 2, 'only the first duplicate and one summary may reach Discord');
  assert.equal(delivered[0].message, repeated);
  assert.match(delivered[1].message, /Skipped 7 messages/);
  assert.equal(suppressed.length, 7);
  assert.equal(suppressed.every(event => event.reason === 'duplicate-message'), true);
}

async function testDuplicateNormalizationAndExpiry() {
  const delivered = [];
  let currentTime = 10_000;
  const forwarder = new DiscordChatForwardQueue({
    perUserBurst: 20,
    duplicateWindowMs: 1_000,
    summaryDelayMs: 10_000,
    minSendIntervalMs: 0,
    now: () => currentTime,
    send: async item => {
      delivered.push(item.message);
      return true;
    }
  });

  await forwarder.enqueue({ username: 'Alice', message: 'Hello   World' });
  await forwarder.enqueue({ username: 'Alice', message: ' hello\u200B world ' });
  currentTime += 999;
  await forwarder.enqueue({ username: 'Alice', message: 'HELLO WORLD' });
  currentTime += 1_001;
  await forwarder.enqueue({ username: 'Alice', message: 'HELLO WORLD' });

  assert.deepEqual(delivered, ['Hello   World', 'HELLO WORLD']);
}

async function testSystemMessagesBypassFloodButStillDeduplicate() {
  const delivered = [];
  const suppressed = [];
  const forwarder = new DiscordChatForwardQueue({
    perUserBurst: 2,
    perUserWindowMs: 10_000,
    duplicateWindowMs: 5_000,
    summaryDelayMs: 10,
    minSendIntervalMs: 0,
    send: async item => {
      delivered.push(item.message);
      return true;
    },
    onSuppressed: event => suppressed.push(event)
  });

  const serverMessages = [
    'Restarting in 10..',
    'Restarting in 9..',
    'Restarting in 8..',
    'Restarting in 8..',
    'Restarting in 7..',
    'Restarting in 6..'
  ];
  await Promise.all(serverMessages.map(message => forwarder.enqueue({
    username: 'SERVER',
    message,
    bypassFloodProtection: true
  })));
  await wait(30);

  assert.deepEqual(delivered, [
    'Restarting in 10..',
    'Restarting in 9..',
    'Restarting in 8..',
    'Restarting in 7..',
    'Restarting in 6..'
  ], 'every distinct server message must bypass the player burst limit');
  assert.deepEqual(
    suppressed.map(event => [event.reason, event.message]),
    [['duplicate-message', 'Restarting in 8..']],
    'identical server messages must still collapse to the first copy'
  );
  assert.equal(delivered.some(message => /^Skipped /.test(message)), false,
    'a duplicate server message must not create a flood summary');
}

async function testStaleMessagesAreNotSent() {
  const delivered = [];
  let releaseFirst;
  const firstBlocked = new Promise(resolve => { releaseFirst = resolve; });
  const forwarder = new DiscordChatForwardQueue({
    maxAgeMs: 10,
    perUserBurst: 20,
    summaryDelayMs: 10,
    minSendIntervalMs: 0,
    send: async item => {
      delivered.push(item.message);
      if (item.message === 'blocking') await firstBlocked;
      return true;
    }
  });

  const first = forwarder.enqueue({ username: 'Alice', message: 'blocking' });
  const stale = forwarder.enqueue({ username: 'Bob', message: 'old news' });
  await wait(20);
  releaseFirst();
  assert.equal(await first, true);
  assert.equal(await stale, true);
  await wait(30);

  assert.equal(delivered.includes('old news'), false, 'expired queue entries must be discarded');
  assert.equal(delivered.some(message => /Skipped 1 message/.test(message)), true);
}

async function testQueueCapacityIsBounded() {
  let releaseFirst;
  const firstBlocked = new Promise(resolve => { releaseFirst = resolve; });
  const delivered = [];
  const forwarder = new DiscordChatForwardQueue({
    maxQueueSize: 1,
    perUserBurst: 20,
    summaryDelayMs: 10,
    minSendIntervalMs: 0,
    send: async item => {
      delivered.push(item.message);
      if (item.message === 'blocking') await firstBlocked;
      return true;
    }
  });

  const first = forwarder.enqueue({ username: 'Alice', message: 'blocking' });
  const second = forwarder.enqueue({ username: 'Bob', message: 'queued' });
  const overflow = await forwarder.enqueue({ username: 'Carol', message: 'overflow' });
  assert.equal(overflow, true, 'overflow is handled by suppression instead of failing the caller');
  assert.equal(forwarder.pendingCount, 2, 'the active request plus one queued request is the hard bound');

  releaseFirst();
  await Promise.all([first, second]);
  await wait(30);
  assert.equal(delivered.includes('overflow'), false);
}

async function testFloodCannotDisplaceAnotherPlayer() {
  let releaseFirst;
  const firstBlocked = new Promise(resolve => { releaseFirst = resolve; });
  const delivered = [];
  const suppressed = [];
  const forwarder = new DiscordChatForwardQueue({
    maxQueueSize: 3,
    perUserBurst: 20,
    summaryDelayMs: 1_000,
    minSendIntervalMs: 0,
    send: async item => {
      delivered.push(`${item.username}:${item.message}`);
      if (item.message === 'blocking') await firstBlocked;
      return true;
    },
    onSuppressed: event => suppressed.push(event)
  });

  const pending = [
    forwarder.enqueue({ username: 'Spammer', message: 'blocking' }),
    forwarder.enqueue({ username: 'Spammer', message: 'spam two' }),
    forwarder.enqueue({ username: 'Spammer', message: 'spam three' }),
    forwarder.enqueue({ username: 'Spammer', message: 'spam four' })
  ];
  const normalPlayer = forwarder.enqueue({ username: 'Alice', message: 'normal message' });

  assert.equal(forwarder.pendingCount, 4, 'the active request plus the bounded queue must remain the hard limit');
  assert.deepEqual(
    suppressed.map(event => [event.username, event.message, event.reason]),
    [['Spammer', 'spam four', 'queue-fairness']],
    'a repeated spam message must make room for a different player'
  );

  releaseFirst();
  await Promise.all([...pending, normalPlayer]);
  assert.equal(delivered.includes('Alice:normal message'), true, 'an ordinary player must not be suppressed by another user flood');
  assert.equal(delivered.includes('Spammer:spam four'), false);
}

(async () => {
  testDiscordInviteFormatting();
  await testSerialDelivery();
  await testFloodSuppressionAndSummary();
  await testSameMillisecondDuplicatesAreSuppressed();
  await testDuplicateNormalizationAndExpiry();
  await testSystemMessagesBypassFloodButStillDeduplicate();
  await testStaleMessagesAreNotSent();
  await testQueueCapacityIsBounded();
  await testFloodCannotDisplaceAnotherPlayer();
  console.log('Discord chat forward queue tests passed.');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
