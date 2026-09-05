'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createPlayerAccentTheme, pickPlayerAccent } = require('../public/player-accent');

function solidPixels(red, green, blue, count = 64) {
  return Uint8ClampedArray.from(Array.from({ length: count }, () => [red, green, blue, 255]).flat());
}

const redAccent = pickPlayerAccent(solidPixels(220, 35, 45), 'RedPlayer');
const blueAccent = pickPlayerAccent(solidPixels(30, 80, 225), 'BluePlayer');
assert.ok(redAccent.hue < 25 || redAccent.hue > 335, 'red avatars must produce a red-family accent');
assert.ok(blueAccent.hue > 210 && blueAccent.hue < 250, 'blue avatars must produce a blue-family accent');

const sharedAvatar = solidPixels(80, 170, 95);
assert.notEqual(
  pickPlayerAccent(sharedAvatar, 'PlayerOne').hue,
  pickPlayerAccent(sharedAvatar, 'PlayerTwo').hue,
  'identity must keep very similar avatars visually distinguishable'
);

const theme = createPlayerAccentTheme(redAccent);
assert.match(theme['--player-accent-light'], /^hsl\(/);
assert.match(theme['--player-accent-dark'], /^hsl\(/);
assert.match(theme['--player-accent-light-contrast'], /^#(?:ffffff|0b0f14)$/);

const appSource = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');
const stylesSource = fs.readFileSync(path.join(__dirname, '..', 'public', 'styles.css'), 'utf8');
const indexSource = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
const serviceWorkerSource = fs.readFileSync(path.join(__dirname, '..', 'public', 'sw.js'), 'utf8');
assert.match(appSource, /function applyPlayerProfileAccent\(profile\)[\s\S]*accentFromImage\(image, key\)[\s\S]*setPlayerProfileAccent\(theme\)/);
assert.match(stylesSource, /\.player-profile-card\.has-player-accent[\s\S]*--accent:\s*var\(--player-accent-light\)/);
assert.match(stylesSource, /\.player-profile-actions > \.player-profile-message-action:first-child[\s\S]*background:\s*var\(--accent\)/);
assert.ok(indexSource.indexOf('/player-accent.js?v=1') < indexSource.indexOf('/app.js?v=251'), 'accent extraction must load before the app');
assert.match(serviceWorkerSource, /'\/player-accent\.js'/, 'accent extraction must be available in the offline app shell');
assert.match(appSource, /setPlayerProfileLoading\(true\)[\s\S]*renderPlayerProfileSkeleton\(\)/, 'the profile card must enter its neutral loading theme before rendering the skeleton');
assert.match(stylesSource, /\.player-profile-card\.profile-loading\s*\{[^}]*--accent:\s*#c9ccca;[^}]*border-color:\s*var\(--line\);/s, 'the loading theme must blend into the current surface with a low-contrast neutral accent');
assert.match(appSource, /const resolveAccent = \(\) => \{[\s\S]*setPlayerProfileAccent\(theme\);[\s\S]*setPlayerProfileLoading\(false\);[\s\S]*\};/, 'the neutral loading theme must remain until the avatar accent is ready');
assert.match(
  appSource,
  /function applyWhisperAccent\(username = state\.whisperTarget\)[\s\S]*accentFromImage\(image, key\)[\s\S]*setWhisperAccent\(theme\)/,
  'the open private dialog must derive its accent from the selected player avatar'
);
assert.match(
  appSource,
  /function updateWhisperDialogTitle\(\)[\s\S]*applyWhisperAccent\(state\.whisperTarget\)/,
  'changing the active private dialog must refresh the player accent'
);
assert.match(
  stylesSource,
  /\.whisper-panel\.has-player-accent\s*\{[\s\S]*--accent:\s*var\(--player-accent-light\)[\s\S]*\.whisper-panel\.has-player-accent \.whisper-popover/,
  'private dialog surfaces must transition through the selected player color scheme'
);
assert.match(stylesSource, /\.whisper-popover\s*\{[^}]*transition:\s*background-color 360ms ease/s, 'private dialog color changes must be smooth');

console.log('Player accent tests passed.');
