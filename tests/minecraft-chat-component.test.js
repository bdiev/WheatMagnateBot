'use strict';

const assert = require('node:assert/strict');
const {
  analyzeMinecraftChatComponent,
  chatComponentToString,
  isGreenColor,
  parseGreenChatComponent,
  safeOpenUrl
} = require('../minecraft-chat-component');

function run() {
  assert.equal(
    chatComponentToString({ text: '<Alice> ', extra: [{ text: 'https://example.com/path?q=1' }] }),
    '<Alice> https://example.com/path?q=1'
  );

  assert.equal(
    chatComponentToString({
      text: '<Alice> ',
      extra: [{ text: 'Open website', clickEvent: { action: 'open_url', value: 'https://example.com/path' } }]
    }),
    '<Alice> Open website (https://example.com/path)'
  );
  assert.equal(
    chatComponentToString({ text: '<Alice> https://example.com', clickEvent: { action: 'open_url', value: 'https://example.com' } }),
    '<Alice> https://example.com'
  );

  const mineflayerLike = {
    json: {
      text: '<Bob> ',
      extra: [{ text: 'Server map', clickEvent: { action: 'open_url', value: 'https://map.example.net/' } }]
    },
    toString() { return '<Bob> Server map'; }
  };
  assert.equal(chatComponentToString(mineflayerLike), '<Bob> Server map (https://map.example.net/)');

  assert.equal(
    chatComponentToString({ text: '<Eve> unsafe', clickEvent: { action: 'open_url', value: 'javascript:alert(1)' } }),
    '<Eve> unsafe'
  );
  assert.equal(safeOpenUrl('https://example.com/a'), 'https://example.com/a');
  assert.equal(safeOpenUrl('javascript:alert(1)'), null);

  const actualServerGreenJson = {
    extra: [
      { '': '<bdiev_> ' },
      {
        italic: 0,
        underlined: 0,
        bold: 0,
        color: 'green',
        obfuscated: 0,
        strikethrough: 0,
        text: '> test'
      }
    ],
    text: ''
  };
  assert.deepEqual(parseGreenChatComponent(actualServerGreenJson), {
    username: 'bdiev_',
    message: '> test'
  });
  const actualServerGreenChat = analyzeMinecraftChatComponent(actualServerGreenJson, {
    knownUsernames: [],
    position: 'system'
  });
  assert.equal(actualServerGreenChat.isPlayerChat, true);
  assert.equal(actualServerGreenChat.username, 'bdiev_');
  assert.equal(actualServerGreenChat.message, '> test');
  assert.deepEqual(actualServerGreenChat.evidence, ['green_component', 'empty_key_sender']);

  assert.deepEqual(parseGreenChatComponent({
    extra: [
      { color: 'green', text: '> reordered' },
      { '': '<OrderSafe_1> ' }
    ],
    text: ''
  }), { username: 'OrderSafe_1', message: '> reordered' });

  assert.deepEqual(parseGreenChatComponent({
    extra: [
      { extra: [{ '': '<Nested_1> ' }] },
      { extra: [{ color: 'green', text: '> nested' }] }
    ],
    text: ''
  }), { username: 'Nested_1', message: '> nested' });

  assert.equal(parseGreenChatComponent({
    extra: [{ '': 'Server' }, { color: 'green', text: 'announcement' }],
    text: ''
  }), null, 'an empty-key value without the exact <username> format must be rejected');
  assert.equal(parseGreenChatComponent({
    extra: [{ '': '<Alice> ' }, { '': '<Bob> ' }, { color: 'green', text: '> ambiguous' }],
    text: ''
  }), null, 'components with multiple possible senders must be rejected');
  assert.equal(parseGreenChatComponent({
    extra: [{ '': '<name-that-is-too-long> ' }, { color: 'green', text: '> invalid' }],
    text: ''
  }), null, 'invalid Minecraft usernames must be rejected');
  assert.doesNotThrow(() => parseGreenChatComponent({ extra: [null, 4, [], {}], text: '' }));

  const translatedGreenChat = analyzeMinecraftChatComponent({
    translate: 'chat.type.text',
    with: [
      { text: 'Alice', insertion: 'Alice', clickEvent: { action: 'suggest_command', value: '/tell Alice ' } },
      { text: 'hello from green chat', color: 'green' }
    ]
  }, { knownUsernames: ['Alice'], position: 'system' });
  assert.equal(translatedGreenChat.isGreenChat, true);
  assert.equal(translatedGreenChat.isPlayerChat, true);
  assert.equal(translatedGreenChat.username, 'Alice');
  assert.equal(translatedGreenChat.message, 'hello from green chat');

  const metadataGreenChat = analyzeMinecraftChatComponent({
    text: '',
    extra: [
      {
        text: 'Bob',
        insertion: 'Bob',
        hoverEvent: { action: 'show_entity', contents: { name: { text: 'Bob' } } }
      },
      { text: ': ' },
      { text: 'component-only green chat', color: '#55ff55' }
    ]
  }, { knownUsernames: ['Bob'], position: 'system' });
  assert.equal(metadataGreenChat.isPlayerChat, true);
  assert.equal(metadataGreenChat.username, 'Bob');
  assert.equal(metadataGreenChat.message, 'component-only green chat');

  const hiddenSenderGreenChat = analyzeMinecraftChatComponent({
    json: {
      text: '',
      extra: [
        { text: '', insertion: 'Carol', clickEvent: { action: 'suggest_command', value: '/msg Carol ' } },
        { text: '> hello', color: 'dark_green' }
      ]
    },
    toString() { return '> hello'; }
  }, { knownUsernames: ['Carol'], position: 'system' });
  assert.equal(hiddenSenderGreenChat.isPlayerChat, true);
  assert.equal(hiddenSenderGreenChat.username, 'Carol');
  assert.equal(hiddenSenderGreenChat.message, '> hello');

  const rankedGreenChat = analyzeMinecraftChatComponent({
    text: '[VIP] Dave » ranked green chat',
    color: 'green',
    extra: [{ text: '', insertion: 'Dave' }]
  }, { knownUsernames: ['Dave'], position: 'system' });
  assert.equal(rankedGreenChat.isPlayerChat, true);
  assert.equal(rankedGreenChat.username, 'Dave');
  assert.equal(rankedGreenChat.message, 'ranked green chat');

  const legacyGreenChat = analyzeMinecraftChatComponent({
    text: '<Eve> \u00a7alegacy green chat'
  }, { knownUsernames: ['Eve'], position: 'system' });
  assert.equal(legacyGreenChat.isGreenChat, true);
  assert.equal(legacyGreenChat.isPlayerChat, true);

  const greenAnnouncement = analyzeMinecraftChatComponent({
    text: 'Server restart in five minutes',
    color: 'green'
  }, { knownUsernames: ['Alice'], position: 'system' });
  assert.equal(greenAnnouncement.isGreenChat, true);
  assert.equal(greenAnnouncement.isPlayerChat, false, 'green system announcements must not become player chat');

  const fakePlayerAnnouncement = analyzeMinecraftChatComponent({
    text: '[Server]: maintenance',
    color: '#00ff00'
  }, { knownUsernames: ['Alice'], position: 'system' });
  assert.equal(fakePlayerAnnouncement.isPlayerChat, false, 'visible system labels are not trusted as player identities');

  const advancement = analyzeMinecraftChatComponent({
    text: '[Alice] has made the advancement Stone Age',
    color: 'green',
    extra: [{ text: '', insertion: 'Alice' }]
  }, { knownUsernames: ['Alice'], position: 'system' });
  assert.equal(advancement.isPlayerChat, false, 'advancements must not match bracketed player chat without a delimiter');

  const actionBar = analyzeMinecraftChatComponent({
    translate: 'chat.type.text',
    color: 'green',
    with: [{ text: 'Alice' }, { text: 'not public chat' }]
  }, { knownUsernames: ['Alice'], position: 'game_info' });
  assert.equal(actionBar.isPlayerChat, false, 'action-bar components must never enter public chat');

  assert.equal(isGreenColor('green'), true);
  assert.equal(isGreenColor('#55FF55'), true);
  assert.equal(isGreenColor('yellow'), false);

  console.log('Minecraft chat component tests passed.');
}

run();
