'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { cleanMinecraftChatMessage, isPrivateMinecraftChatLine, splitMinecraftMessage } = require('./messages');

test('Minecraft chat cleaning removes formatting and unsafe controls', () => {
  assert.equal(cleanMinecraftChatMessage('  §aHello\u0000 §lworld\u007f  '), 'Hello world');
  assert.equal(cleanMinecraftChatMessage('Â§cError'), 'Error');
});

test('long Minecraft messages split on words and hard-split oversized words', () => {
  assert.deepEqual(splitMinecraftMessage('one two three four', 7), ['one two', 'three', 'four']);
  assert.deepEqual(splitMinecraftMessage('abcdefghij ok', 4), ['abcd', 'efgh', 'ij', 'ok']);
  assert.ok(splitMinecraftMessage('alpha beta gamma', 6).every(chunk => chunk.length <= 6));
  assert.throws(() => splitMinecraftMessage('text', 0), RangeError);
});

test('private Minecraft lines are recognized without hiding public chat', () => {
  assert.equal(isPrivateMinecraftChatLine('From Steve: hello'), true);
  assert.equal(isPrivateMinecraftChatLine('[Steve -> WheatBot] hello', 'WheatBot'), true);
  assert.equal(isPrivateMinecraftChatLine('Steve whispers to you » hello'), true);
  assert.equal(isPrivateMinecraftChatLine('<Steve> hello everyone', 'WheatBot'), false);
});
