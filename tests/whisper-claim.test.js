'use strict';

const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const { createWhisperFeature, isWhisperClaimEmbed, whisperClaimUsername } = require('../features/whisper');

function stateWithClaim() {
  return {
    whisperChannels: new Map(), pendingWhisperClaims: new Map([['steve', { messageId: 'message-1', lastMessage: 'hello' }]]),
    whisperCleanupTimers: new Map(), lastDialogMessages: new Map(), whisperFooterUpdateIntervals: new Map(),
    whisperDeleteTimestamps: new Map(), customDialogTTL: new Map()
  };
}

const emojis = { farm: { lavaBucket: '1' }, ui: { bookOrange: '2', slowFalling: '3' } };

function fakeChannel(id) {
  const messages = new Map();
  let nextId = 1;
  const channel = {
    id, sent: [],
    isTextBased: () => true,
    send: async payload => {
      const message = {
        id: `m${nextId++}`, author: { id: 'bot-user' }, pinned: false, ...payload,
        edit: async update => Object.assign(message, update),
        pin: async () => { message.pinned = true; },
        delete: async () => messages.delete(message.id)
      };
      messages.set(message.id, message);
      channel.sent.push(message);
      return message;
    },
    messages: {
      fetch: async query => {
        if (typeof query === 'object') return new Map();
        if (!messages.has(query)) throw Object.assign(new Error('Unknown Message'), { code: 10008 });
        return messages.get(query);
      },
      fetchPinned: async () => new Map([...messages].filter(([, message]) => message.pinned))
    }
  };
  return channel;
}

function dialogFeature(state, channels, extra = {}) {
  return createWhisperFeature({
    discordClient: {
      user: { id: 'bot-user' }, isReady: () => true,
      channels: { fetch: async id => {
        if (!channels.has(id)) throw Object.assign(new Error('Unknown Channel'), { code: 10003 });
        return channels.get(id);
      } }
    },
    discordChannelId: 'status-channel', discordDmCategoryId: 'dm-category',
    whisperChannelsFile: path.join(os.tmpdir(), `whisper-channels-test-${process.pid}.json`),
    defaultTtlMs: 600_000, state, emojis,
    loadAvatar: async name => ({ thumbnail: { url: `https://heads/${name}.png` } }),
    profileUrl: name => `https://site/player/${name}`,
    getPlayerColor: async () => 0x2ECC71,
    describeDialog: () => ({ online: true, replyFrom: 'WheatMagnate' }),
    ...extra
  });
}

function emptyState() {
  return {
    whisperChannels: new Map(), pendingWhisperClaims: new Map(), whisperCleanupTimers: new Map(),
    whisperDialogHeaders: new Map(), whisperDeleteTimestamps: new Map(), customDialogTTL: new Map()
  };
}

async function testClaimCardKeepsRecentMessages() {
  const status = fakeChannel('status-channel');
  const state = emptyState();
  const feature = dialogFeature(state, new Map([['status-channel', status]]));
  for (let index = 1; index <= 7; index += 1) {
    await feature.sendWhisperClaimPrompt('Steve', `line ${index}`, 'WheatMagnate');
  }
  assert.equal(status.sent.length, 1, 'later whispers update the same claim card');
  const embed = status.sent[0].embeds[0];
  assert.equal(embed.author.name, 'Steve');
  assert.equal(embed.author.url, 'https://site/player/Steve');
  assert.equal(embed.author.icon_url, 'https://heads/Steve.png');
  assert.equal(embed.description, '> line 3\n> line 4\n> line 5\n> line 6\n> line 7', 'the card quotes the last five whispers');
  assert.match(embed.footer.text, /^to WheatMagnate · 7 messages/);
  assert.equal(state.pendingWhisperClaims.get('steve').messages.length, 5);
  assert.equal(isWhisperClaimEmbed(embed), true, 'the channel cleaner must recognise the new card');
  assert.equal(whisperClaimUsername(embed), 'Steve');
}

async function testDialogHeaderAndBubbles() {
  const dialog = fakeChannel('dialog-1');
  const state = emptyState();
  state.whisperChannels.set('owner:steve', 'dialog-1');
  const feature = dialogFeature(state, new Map([['dialog-1', dialog]]));
  await Promise.all([
    feature.postIncomingDialogMessage(dialog, { username: 'Steve', recipient: 'WheatMagnate', text: 'hi' }),
    feature.postOutgoingDialogMessage(dialog, { username: 'Steve', sender: { name: 'bdiev', iconUrl: 'https://avatar' }, text: 'hello', via: 'WheatMagnate' })
  ]);
  try {
    assert.equal(dialog.sent.length, 3, 'one header and two bubbles');
    const [header, incoming, outgoing] = dialog.sent;
    assert.equal(header.pinned, true, 'the header is pinned');
    assert.equal(header.embeds[0].title, 'Dialog with Steve');
    assert.equal(header.components[0].components[0].data.custom_id, 'delete_dialog_dialog-1');
    assert.match(header.embeds[0].fields[2].value, /^<t:\d+:R>\nafter 10 min idle$/, 'Discord counts the deletion time down itself');
    assert.equal(incoming.embeds[0].author.name, 'Steve → WheatMagnate');
    assert.equal(incoming.embeds[0].description, 'hi');
    assert.equal(outgoing.embeds[0].author.name, 'bdiev → Steve');
    assert.equal(outgoing.embeds[0].footer.text, 'via WheatMagnate');
    assert.equal(state.whisperCleanupTimers.has('dialog-1'), true, 'each message restarts the idle timer');
  } finally {
    feature.cancelWhisperCleanup('dialog-1');
  }
}

async function testDialogTimersComeBackFromHeader() {
  const dialog = fakeChannel('dialog-2');
  const deleteAt = Math.floor((Date.now() + 20 * 60_000) / 1000);
  const header = await dialog.send({
    embeds: [{ title: 'Dialog with Alex', fields: [{ name: 'Auto-delete', value: `<t:${deleteAt}:R>\nafter 30 min idle` }] }],
    components: [{ components: [{ customId: 'delete_dialog_dialog-2' }] }]
  });
  header.pinned = true;
  const state = emptyState();
  state.whisperChannels.set('owner:alex', 'dialog-2');
  state.whisperChannels.set('owner:gone', 'deleted-channel');
  const feature = dialogFeature(state, new Map([['dialog-2', dialog]]));
  await feature.restoreDialogTimers();
  try {
    assert.equal(state.whisperCleanupTimers.has('dialog-2'), true, 'a restart keeps deleting idle dialogs');
    assert.equal(state.customDialogTTL.get('dialog-2'), 30 * 60_000, 'the chosen idle length survives a restart');
    assert.ok(Math.abs(state.whisperDeleteTimestamps.get('dialog-2') - deleteAt * 1000) < 2_000);
    assert.equal(state.whisperChannels.has('owner:gone'), false, 'mappings of deleted channels are dropped');
  } finally {
    feature.cancelWhisperCleanup('dialog-2');
  }
}

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

async function testIdleDialogAsksOwnerFirst() {
  const dialog = fakeChannel('dialog-3');
  dialog.deletable = true;
  dialog.delete = async () => { dialog.deleted = true; };
  const state = emptyState();
  state.whisperChannels.set('owner-1:steve', 'dialog-3');
  const feature = dialogFeature(state, new Map([['dialog-3', dialog]]), { defaultTtlMs: 1_000, confirmGraceMs: 1_000 });

  await feature.postIncomingDialogMessage(dialog, { username: 'Steve', text: 'hi' });
  await wait(1_300);
  const prompt = dialog.sent.find(message => message.embeds?.[0]?.title === 'Delete this dialog?');
  assert.ok(prompt, 'an idle dialog asks before it is deleted');
  assert.equal(prompt.content, '<@owner-1>', 'the owner is pinged');
  assert.deepEqual(prompt.allowedMentions, { users: ['owner-1'] });
  assert.equal(prompt.components[0].components[0].data.custom_id, 'keep_dialog_dialog-3');
  assert.equal(dialog.deleted, undefined, 'nothing is deleted while the owner can still answer');

  await feature.keepDialog(dialog);
  assert.equal(await dialog.messages.fetch(prompt.id).catch(() => null), null, 'keeping the dialog removes the question');
  await wait(600);
  assert.equal(dialog.deleted, undefined, 'a kept dialog starts its idle time again');

  await wait(2_000);
  assert.equal(dialog.deleted, true, 'with no answer the dialog is deleted after the grace time');
  assert.equal(state.whisperChannels.has('owner-1:steve'), false);
}

async function testHeaderFollowsJoinsAndLeaves() {
  const dialog = fakeChannel('dialog-4');
  const other = fakeChannel('dialog-5');
  const state = emptyState();
  state.whisperChannels.set('owner:bdiev_', 'dialog-4');
  state.whisperChannels.set('owner:alex', 'dialog-5');
  const online = new Set(['bdiev_', 'alex']);
  const feature = dialogFeature(state, new Map([['dialog-4', dialog], ['dialog-5', other]]), {
    describeDialog: username => ({ online: online.has(username.toLowerCase()), replyFrom: 'WheatMagnate' })
  });
  try {
    await feature.postIncomingDialogMessage(dialog, { username: 'bdiev_', text: 'hi' });
    await feature.postIncomingDialogMessage(other, { username: 'Alex', text: 'hey' });
    const playerField = channel => channel.sent[0].embeds[0].fields[0].value;
    assert.equal(playerField(dialog), '🟢 Online');

    online.delete('bdiev_');
    await feature.refreshPlayerDialogs('bdiev_');
    assert.equal(playerField(dialog), '⚫ Offline', 'the header shows that the player left');
    assert.equal(playerField(other), '🟢 Online', 'other dialogs are left alone');
    assert.equal(dialog.sent[0].embeds[0].title, 'Dialog with bdiev_');
  } finally {
    feature.cancelWhisperCleanup('dialog-4');
    feature.cancelWhisperCleanup('dialog-5');
  }
}

async function testRepliesWaitForOfflinePlayer() {
  const fs = require('node:fs');
  const outboxFile = path.join(os.tmpdir(), `whisper-outbox-test-${process.pid}.json`);
  fs.rmSync(outboxFile, { force: true });
  const dialog = fakeChannel('dialog-6');
  const state = emptyState();
  state.whisperChannels.set('owner-1:steve', 'dialog-6');
  const sent = [];
  let botOnline = false;
  const options = {
    outboxFile,
    deliverDelayMs: 10,
    sendWhisper: async (username, texts) => {
      if (!botOnline) return null;
      sent.push(...texts.map(text => `${username}: ${text}`));
      return 'WheatMagnate';
    }
  };
  const feature = dialogFeature(state, new Map([['dialog-6', dialog]]), options);
  try {
    const first = await feature.queueOfflineWhisper(dialog, {
      username: 'Steve', ownerId: 'owner-1', sender: { name: 'bdiev' }, texts: ['are you there?', 'need obsidian']
    });
    const second = await feature.queueOfflineWhisper(dialog, {
      username: 'Steve', ownerId: 'owner-1', sender: { name: 'bdiev' }, texts: ['never mind']
    });
    const bubble = id => dialog.sent.find(message => message.id === id);
    assert.match(bubble(first.messageId).embeds[0].footer.text, /^⏳ Not sent yet: Steve is offline/, 'a waiting reply says why it was not sent');
    assert.equal(bubble(first.messageId).components[0].components[0].data.custom_id, `cancel_queued_whisper_${first.id}`);
    assert.match(dialog.sent[0].embeds[0].fields[0].value, /⏳ 2 waiting to be sent/, 'the header counts waiting replies');
    assert.equal(JSON.parse(fs.readFileSync(outboxFile, 'utf8')).length, 2, 'waiting replies survive a restart');

    assert.equal(await feature.cancelQueuedWhisper(second.id, 'someone-else'), 'forbidden');
    assert.equal(await feature.cancelQueuedWhisper(second.id, 'owner-1'), 'cancelled');
    assert.equal(bubble(second.messageId).embeds[0].description, '~~never mind~~');

    assert.equal(await feature.deliverQueuedWhispers('steve'), 0, 'nothing leaves while no bot can send it');
    botOnline = true;
    const restarted = dialogFeature(state, new Map([['dialog-6', dialog]]), options);
    restarted.loadQueuedWhispers();
    restarted.deliverQueuedWhispersSoon('Steve');
    await wait(100);
    assert.deepEqual(sent, ['Steve: are you there?', 'Steve: need obsidian'], 'the reply goes out when the player joins');
    assert.match(bubble(first.messageId).embeds[0].footer.text, /^✅ Sent when Steve came online · via WheatMagnate/);
    assert.deepEqual(bubble(first.messageId).components, []);
    assert.deepEqual(JSON.parse(fs.readFileSync(outboxFile, 'utf8')), []);
    restarted.cancelWhisperCleanup('dialog-6');
  } finally {
    feature.cancelWhisperCleanup('dialog-6');
    fs.rmSync(outboxFile, { force: true });
  }
}

async function testHeadsAreAttachedLikeGameChat() {
  const status = fakeChannel('status-channel');
  const dialog = fakeChannel('dialog-7');
  const state = emptyState();
  state.whisperChannels.set('owner:steve', 'dialog-7');
  const requests = [];
  const feature = dialogFeature(state, new Map([['status-channel', status], ['dialog-7', dialog]]), {
    loadAvatar: async (name, { attachFiles }) => {
      requests.push(attachFiles);
      return attachFiles
        ? { thumbnail: { url: `attachment://minecraft-avatar-${name.toLowerCase()}.png` }, files: [{ name: `minecraft-avatar-${name.toLowerCase()}.png` }] }
        : { thumbnail: { url: `https://heads/${name}.png` } };
    }
  });
  try {
    await feature.sendWhisperClaimPrompt('Steve', 'hi', 'WheatMagnate');
    await feature.sendWhisperClaimPrompt('Steve', 'hello?', 'WheatMagnate');
    const card = status.sent[0];
    assert.equal(card.embeds[0].author.icon_url, 'attachment://minecraft-avatar-steve.png', 'the claim card uses the attached head');
    assert.deepEqual(card.attachments, [], 'an updated card replaces its head instead of adding another');
    assert.equal(card.files.length, 1);

    await feature.postIncomingDialogMessage(dialog, { username: 'Steve', text: 'hi' });
    const [header, bubble] = dialog.sent;
    assert.equal(header.embeds[0].author.icon_url, 'attachment://minecraft-avatar-steve.png', 'the dialog header uses the attached head');
    assert.equal(header.files.length, 1);
    assert.equal(bubble.embeds[0].author.icon_url, 'attachment://minecraft-avatar-steve.png');
    assert.ok(requests.every(Boolean), 'heads are never linked from a remote host when files can be attached');
  } finally {
    feature.cancelWhisperCleanup('dialog-7');
  }
}

async function testDiscordRepliesShowSquareAvatars() {
  const dialog = fakeChannel('dialog-8');
  const state = emptyState();
  state.whisperChannels.set('owner:steve', 'dialog-8');
  const feature = dialogFeature(state, new Map([['dialog-8', dialog]]), {
    loadSenderAvatar: async (url, { attachFiles }) => attachFiles
      ? { thumbnail: { url: 'attachment://discord-avatar.png' }, files: [{ name: 'discord-avatar.png' }] }
      : { thumbnail: { url } }
  });
  const sender = { name: 'bdiev_', iconUrl: 'https://cdn.discordapp.com/avatars/1/a.png' };
  try {
    await feature.postOutgoingDialogMessage(dialog, { username: 'Steve', sender, text: 'hi', via: 'WheatMagnate' });
    const reply = dialog.sent.at(-1);
    assert.equal(reply.embeds[0].author.icon_url, 'attachment://discord-avatar.png', 'a reply shows the padded, square avatar');
    assert.equal(reply.files.length, 1);

    await feature.queueOfflineWhisper(dialog, { username: 'Steve', ownerId: 'owner', sender, texts: ['later'] });
    const queued = dialog.sent.at(-1);
    assert.equal(queued.embeds[0].author.icon_url, 'attachment://discord-avatar.png', 'a waiting reply shows it too');
    assert.equal(queued.files.length, 1);
  } finally {
    feature.cancelWhisperCleanup('dialog-8');
  }
}

async function run() {
  let deleted = false;
  const state = stateWithClaim();
  const feature = createWhisperFeature({
    discordClient: {
      isReady: () => true,
      channels: { fetch: async () => ({
        isTextBased: () => true,
        messages: { fetch: async id => typeof id === 'object' ? new Map() : ({ id, delete: async () => { deleted = true; } }) }
      }) }
    },
    discordChannelId: 'status-channel', discordDmCategoryId: 'dm-category', whisperChannelsFile: 'unused.json',
    defaultTtlMs: 60_000, state, emojis: { farm: { lavaBucket: '1' }, ui: { bookOrange: '2', slowFalling: '3' } }
  });

  assert.equal(await feature.removeWhisperClaimPrompt('Steve'), true);
  assert.equal(deleted, true, 'site claim must delete the Discord claim message');
  assert.equal(state.pendingWhisperClaims.has('steve'), false, 'deleted claim must leave pending state');
  assert.equal(await feature.removeWhisperClaimPrompt('Steve'), false, 'repeated claims must be idempotent');

  let orphanDeleted = false;
  const orphanState = stateWithClaim();
  orphanState.pendingWhisperClaims.clear();
  const orphanFeature = createWhisperFeature({
    discordClient: {
      user: { id: 'bot-user' }, isReady: () => true,
      channels: { fetch: async () => ({
        isTextBased: () => true,
        messages: { fetch: async () => new Map([['orphan', {
          author: { id: 'bot-user' }, embeds: [{ title: 'New whisper from Minecraft', description: 'New /msg from **Steve**\n> hello' }],
          delete: async () => { orphanDeleted = true; }
        }]]) }
      }) }
    },
    discordChannelId: 'status-channel', discordDmCategoryId: 'dm-category', whisperChannelsFile: 'unused.json',
    defaultTtlMs: 60_000, state: orphanState, emojis: { farm: { lavaBucket: '1' }, ui: { bookOrange: '2', slowFalling: '3' } }
  });
  assert.equal(await orphanFeature.removeWhisperClaimPrompt('Steve'), true, 'site claim must find prompts left before a restart');
  assert.equal(orphanDeleted, true, 'orphaned Discord claim message must be deleted');

  await testClaimCardKeepsRecentMessages();
  await testDialogHeaderAndBubbles();
  await testDialogTimersComeBackFromHeader();
  await testIdleDialogAsksOwnerFirst();
  await testHeaderFollowsJoinsAndLeaves();
  await testRepliesWaitForOfflinePlayer();
  await testHeadsAreAttachedLikeGameChat();
  await testDiscordRepliesShowSquareAvatars();

  console.log('Whisper claim tests passed.');
}

run().catch(err => { console.error(err); process.exitCode = 1; });
