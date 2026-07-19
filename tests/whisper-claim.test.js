'use strict';

const assert = require('node:assert/strict');
const { createWhisperFeature } = require('../features/whisper');

function stateWithClaim() {
  return {
    whisperChannels: new Map(), pendingWhisperClaims: new Map([['steve', { messageId: 'message-1', lastMessage: 'hello' }]]),
    whisperCleanupTimers: new Map(), lastDialogMessages: new Map(), whisperFooterUpdateIntervals: new Map(),
    whisperDeleteTimestamps: new Map(), customDialogTTL: new Map()
  };
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

  console.log('Whisper claim tests passed.');
}

run().catch(err => { console.error(err); process.exitCode = 1; });
