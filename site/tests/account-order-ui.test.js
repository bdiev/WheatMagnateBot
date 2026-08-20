'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const appSource = fs.readFileSync(path.resolve(__dirname, '..', 'public', 'app.js'), 'utf8');
const styleSource = fs.readFileSync(path.resolve(__dirname, '..', 'public', 'styles.css'), 'utf8');
const serverSource = fs.readFileSync(path.resolve(__dirname, '..', 'server.js'), 'utf8');

assert.match(appSource, /account\.isDefault[\s\S]*?account-avatar-pinned[\s\S]*?draggable="\$\{!pinned\}"/,
  'the primary account is pinned while secondary avatars are draggable');
assert.match(appSource, /persistAccountOrder[\s\S]*?\/api\/accounts\/reorder[\s\S]*?orderedSecondaryIds/,
  'drag and menu ordering is persisted through the account reorder endpoint');
assert.match(appSource, /move-left[\s\S]*?move-right[\s\S]*?moveAccountInOrder/,
  'secondary profiles expose accessible left and right ordering controls');
assert.match(appSource, /function randomUniqueAccountColor[\s\S]*?ACCOUNT_COLOR_PALETTE\.filter[\s\S]*?color !== previous[\s\S]*?Math\.random\(\)[\s\S]*?state\.lastSuggestedAccountColor = color/,
  'each Add account opening must randomly select an unused color different from the previous suggestion');
assert.match(appSource, /form\.elements\.color\.value = account\?\.color \|\| randomUniqueAccountColor\(\)/,
  'editing must preserve the stored color while each new-account form requests a random suggestion');
assert.match(serverSource, /pickUniqueAccountColor\(registry\.list\(\), input\.color\)/,
  'the server guarantees a unique color when creating an account');
assert.match(serverSource, /url\.pathname === '\/api\/accounts\/reorder'[\s\S]*?filter\(account => !account\.isDefault\)/,
  'the reorder API accepts only secondary profiles');
assert.match(styleSource, /\.account-avatar-reorderable\s*\{[^}]*cursor:grab;[\s\S]*?\.account-avatar-pinned::before/,
  'reorderable and pinned accounts have distinct interaction styling');

console.log('Account order UI tests passed.');
