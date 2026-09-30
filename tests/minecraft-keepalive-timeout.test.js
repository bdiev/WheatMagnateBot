'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'bot.js'), 'utf8');
const envExample = fs.readFileSync(path.join(root, '.env.example'), 'utf8');

assert.match(
  source,
  /const MINECRAFT_KEEP_ALIVE_TIMEOUT_MS = positiveInteger\([\s\S]*?60_000,[\s\S]*?\{ min: 30_000 \}/,
  'keep-alive timeout must default to 60 seconds and reject unsafe values below the protocol default'
);
assert.match(
  source,
  /const config = \{[\s\S]*?checkTimeoutInterval: MINECRAFT_KEEP_ALIVE_TIMEOUT_MS/,
  'the primary Minecraft account must use the configured keep-alive timeout'
);
assert.match(
  source,
  /createMinecraftBot\(\{[\s\S]*?\.\.\.options,[\s\S]*?checkTimeoutInterval: MINECRAFT_KEEP_ALIVE_TIMEOUT_MS[\s\S]*?\}\)/,
  'managed Minecraft accounts must use the configured keep-alive timeout'
);
assert.match(
  source,
  /reasonStr === 'keepAliveError' && lastConnectionError[\s\S]*?Keep-alive timeout:/,
  'keep-alive disconnects must retain the underlying timeout error in logs and notifications'
);
assert.match(envExample, /^MINECRAFT_KEEP_ALIVE_TIMEOUT_MS=60000$/m);

console.log('Minecraft keep-alive timeout tests passed.');
