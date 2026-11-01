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

  console.log('Whisper claim tests passed.');
}

run().catch(err => { console.error(err); process.exitCode = 1; });
