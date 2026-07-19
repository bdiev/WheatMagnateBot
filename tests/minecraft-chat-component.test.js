'use strict';

const assert = require('node:assert/strict');
const { chatComponentToString, safeOpenUrl } = require('../minecraft-chat-component');

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

  console.log('Minecraft chat component tests passed.');
}

run();
