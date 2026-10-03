'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const appSource = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');
const serverSource = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

const planSource = appSource.match(/\nfunction planChatListUpdate\([\s\S]*?\n\}\r?\n/)?.[0];
assert.ok(planSource, 'app.js must define planChatListUpdate');
const context = {};
vm.runInNewContext(`${planSource}; this.plan = planChatListUpdate;`, context);
const plan = (previous, next) => JSON.parse(JSON.stringify(context.plan(previous, next)));

assert.deepEqual(plan(['1', '2', '3'], ['1', '2', '3', '4', '5']), { type: 'append', trim: 0, appendFrom: 3 },
  'new live messages are appended without rebuilding the rendered rows');
assert.deepEqual(plan(['1', '2', '3'], ['1', '2', '3']), { type: 'append', trim: 0, appendFrom: 3 },
  'an unchanged list is recognized so nothing is rendered');
assert.deepEqual(plan(['1', '2', '3', '4'], ['3', '4', '5']), { type: 'append', trim: 2, appendFrom: 2 },
  'the oldest rows are trimmed while new rows are appended');
assert.deepEqual(plan(['5', '6'], ['3', '4', '5', '6']), { type: 'prepend', count: 2 },
  'older archive pages are inserted above the rendered rows');
assert.equal(plan(['1', '2', '3'], ['1', '9', '3']), null, 'a changed list falls back to a full rebuild');
assert.equal(plan([], ['1']), null, 'the first render is a full render');

assert.match(appSource, /function renderChatMessages[\s\S]*?planChatListUpdate\(state\.chatRenderedIds \|\| \[\], nextIds\)[\s\S]*?list\.append\(fragment\)/,
  'chat rendering must update rows in place instead of replacing the whole list');
assert.match(appSource, /async function refreshChatFromEvent[\s\S]*?\/api\/chat\?after=\$\{state\.chatLatestId\}&limit=100[\s\S]*?payload\.hasGap/,
  'live chat updates must fetch only newer messages and reload in full after a gap');
assert.match(appSource, /mode === 'mergeLatest' && followsBottom && messages\.length > CHAT_HISTORY_LIMIT/,
  'the live chat must cap its rendered history while the reader follows the bottom');
assert.match(serverSource, /if \(afterId\) \{[\s\S]*?AND id > \$2::bigint[\s\S]*?hasGap: result\.rows\.length > limit/,
  'the chat API must serve newer messages without recomputing charts and leaderboards');

console.log('Chat live performance UI tests passed.');
