'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const botSource = fs.readFileSync(path.join(root, 'bot.js'), 'utf8');
const serverSource = fs.readFileSync(path.join(root, 'site', 'server.js'), 'utf8');

assert.match(
  serverSource,
  /if \(action === 'start' \|\| action === 'stop'\)[\s\S]*?registry\.update\(accountId, \{ enabled:action === 'start' \}\)[\s\S]*?queueBotCommand/,
  'Start and Stop must persist desired account state before queueing the runtime command'
);
assert.match(
  botSource,
  /type === 'account_stop'[\s\S]*?UPDATE bot_accounts SET enabled=FALSE[\s\S]*?shouldReconnect = false;[\s\S]*?pauseMinecraftConnection\(reason\)/,
  'the primary command worker must persist Stop and detach its active connection'
);
assert.match(
  botSource,
  /type === 'account_stop'[\s\S]*?multiAccountRegistry\.update\(command\.account_id, \{ enabled:false \}\)[\s\S]*?multiBotManager\.stop/,
  'the managed command worker must persist Stop before stopping its runtime'
);
assert.match(
  botSource,
  /SELECT enabled FROM bot_accounts[\s\S]*?defaultAccountEnabled[\s\S]*?if \(defaultAccountEnabled\) createBot\(\)/,
  'the default Minecraft profile must respect persisted enabled state after redeploy'
);
assert.doesNotMatch(
  botSource,
  /Initialization without Discord failed:[\s\S]{0,200}\.finally\(\(\) => createBot\(\)\)/,
  'startup without Discord must not unconditionally reconnect a stopped primary account'
);
assert.match(
  botSource,
  /function createBot\(\) \{[\s\S]*?if \(!shouldReconnect\) \{[\s\S]*?Connection attempt skipped: the primary account is stopped/,
  'late callbacks must not recreate a primary connection after Stop'
);
assert.match(
  botSource,
  /accounts\.filter\(item => item\.enabled && !item\.isDefault\)/,
  'only enabled secondary profiles may start after redeploy'
);
assert.match(
  botSource,
  /const runtimeBootResetPromise = resetAccountRuntimeStatusesForBoot\(\)[\s\S]*?await runtimeBootResetPromise;[\s\S]*?await resetAccountRuntimeStatusesForBoot\(\);[\s\S]*?if \(defaultAccountEnabled\) createBot\(\)[\s\S]*?await startBotStatusSnapshotWriter\(\);/,
  'persisted connected flags must be cleared before Minecraft accounts start after redeploy'
);
assert.match(
  botSource,
  /resetAccountRuntimeStatusesForBoot[\s\S]*?'connected',false[\s\S]*?status_payload=EXCLUDED\.status_payload/,
  'the boot reset must publish an explicitly disconnected runtime payload'
);

console.log('Account autostart persistence tests passed.');
