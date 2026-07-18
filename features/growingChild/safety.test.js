'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { hasMixedLatinCyrillicWords, isSafePublicWord, sanitizePublicPhrase } = require('./safety');

test('Growing Child public speech blocks commands, coordinates and number words', () => {
  assert.equal(sanitizePublicPhrase('/op player'), null);
  assert.equal(sanitizePublicPhrase('meet at 10 64 20'), null);
  assert.equal(sanitizePublicPhrase('one hundred blocks'), null);
  assert.equal(sanitizePublicPhrase('Привет мир!'), 'Привет мир!');
});

test('Growing Child safety rejects mixed scripts and unsafe words', () => {
  assert.equal(hasMixedLatinCyrillicWords(['hello', 'мир']), true);
  assert.equal(sanitizePublicPhrase('hello мир'), null);
  assert.equal(isSafePublicWord('hello'), true);
  assert.equal(isSafePublicWord('twenty'), false);
});
