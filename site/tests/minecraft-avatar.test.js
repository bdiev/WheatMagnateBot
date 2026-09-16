'use strict';

const assert = require('node:assert/strict');
const { minecraftAvatarSources } = require('../minecraft-avatar');

const sources = minecraftAvatarSources('moooomoooo');

assert.equal(sources.at(-1), 'https://mc-heads.net/head/moooomoooo/64');
assert.ok(
  sources.indexOf('https://mc-heads.net/head/moooomoooo/64')
    > sources.indexOf('https://mc-heads.net/avatar/moooomoooo/64/slim'),
  'the detailed head renderer must remain the fallback after flat avatar variants'
);
assert.equal(
  minecraftAvatarSources('player name').at(-1),
  'https://mc-heads.net/head/player%20name/64',
  'avatar identities must be URL encoded'
);

console.log('Minecraft avatar tests passed.');
