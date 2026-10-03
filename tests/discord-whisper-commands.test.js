'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const botSource = fs.readFileSync(path.resolve(__dirname, '..', 'bot.js'), 'utf8');

function extractFunction(name) {
  const source = botSource.match(new RegExp(`function ${name}\\([\\s\\S]*?\\n\\}`))?.[0];
  assert.ok(source, `${name} must exist in bot.js`);
  return source;
}

const buildPlayerWhisperCommands = vm.runInNewContext(`
  ${extractFunction('escapeRegExp')}
  ${extractFunction('buildPlayerWhisperCommands')}
  buildPlayerWhisperCommands;
`);
const commands = (username, text) => Array.from(buildPlayerWhisperCommands(username, text), entry => entry.command);

assert.deepEqual(commands('Steve', 'hello'), ['/msg Steve hello']);
assert.deepEqual(commands('Steve', '/msg Steve hello'), ['/msg Steve hello'], 'a habitual /msg prefix is dropped, not doubled');
assert.deepEqual(commands('Steve', '/r hello'), ['/msg Steve hello'], 'a habitual /r prefix is dropped');
assert.deepEqual(commands('Steve', '/kill'), ['/msg Steve /kill'], 'any other command is only whispered as text');
assert.deepEqual(commands('Steve', '/msg Alex hi'), ['/msg Steve /msg Alex hi'], 'the target player cannot be swapped');
assert.deepEqual(commands('Steve', 'one\n\n/tpa Alex'), ['/msg Steve one', '/msg Steve /tpa Alex'], 'every line stays a whisper');
assert.deepEqual(commands('Steve', '   '), []);
assert.deepEqual(commands('Bad Name', 'hi'), [], 'only valid Minecraft names may be targeted');
assert.ok(commands('Steve', 'x'.repeat(400))[0].length <= 256, 'whispers fit the Minecraft chat limit');

for (const handler of ['message_modal_', 'reply_modal_']) {
  const start = botSource.indexOf(`customId.startsWith('${handler}')`);
  assert.ok(start > 0, `${handler} handler must exist`);
  const body = botSource.slice(start, botSource.indexOf('} else if (interaction.', start + 1));
  assert.match(body, /buildPlayerWhisperCommands\(/, `${handler} must build whispers through the safe helper`);
  assert.doesNotMatch(body, /startsWith\('\/'\)/, `${handler} must not forward raw slash commands`);
}

console.log('discord whisper command tests passed');
