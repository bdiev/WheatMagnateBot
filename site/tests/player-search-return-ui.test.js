'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const appSource = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');
const indexSource = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
const seenSuggestionHandler = appSource.match(
  /function handleSeenSuggestionClick[\s\S]*?(?=\nfunction setWhisperOpen)/
)?.[0] || '';

assert.match(
  seenSuggestionHandler,
  /query: input\?\.value \|\| ''[\s\S]*?players: \[\.\.\.state\.seenPlayers\][\s\S]*?setSeenSearchOpen\(false\)[\s\S]*?openPlayerProfile\(player\.username, \{ returnToSeenSearch \}\)/,
  'opening a profile from Seen search must retain the original query and result list'
);
assert.doesNotMatch(
  seenSuggestionHandler,
  /clearSeenSearch\(\{ collapse: true \}\)/,
  'opening a Seen result must not clear its search context'
);
assert.match(
  appSource,
  /function closePlayerProfile\(\{ restoreSeenSearch = true \} = \{\}\)[\s\S]*?seenSearchReturn\.query[\s\S]*?renderSeenSuggestions\(seenSearchReturn\.players\)[\s\S]*?setSeenSearchOpen\(true\)[\s\S]*?runSeenSearch\(seenSearchReturn\.query\)/,
  'closing a profile opened from Seen search must restore and refresh that search'
);
assert.match(
  appSource,
  /function openWhisperFromProfile[\s\S]*?closePlayerProfile\(\{ restoreSeenSearch: false \}\)/,
  'leaving a profile for a private-message dialog must not reopen Seen search'
);
assert.match(indexSource, /<script src="\/app\.js\?v=276" defer><\/script>/,
  'the application asset version must expose the search-return behavior immediately');

console.log('Player search return UI tests passed.');
