'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const {
  isScheduledRestartConnectionEvent
} = require('../features/obsidianFarm/restart-schedule');

const kyiv = (hour, minute) => new Date(`2026-08-21T${String(hour - 3).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00.000Z`);

for (const eventType of [
  'bot_disconnected',
  'bot_reconnected',
  'bot_kicked',
  'repeated_reconnects'
]) {
  assert.equal(
    isScheduledRestartConnectionEvent(eventType, kyiv(9, 0)),
    true,
    `${eventType} must be suppressed during the scheduled restart`
  );
}

assert.equal(isScheduledRestartConnectionEvent('bot_kicked', kyiv(8, 58)), false);
assert.equal(isScheduledRestartConnectionEvent('bot_disconnected', kyiv(9, 31)), false);
assert.equal(
  isScheduledRestartConnectionEvent('unauthorized_player_nearby', kyiv(9, 0)),
  false,
  'unrelated safety alerts must remain enabled during the restart window'
);

const botSource = fs.readFileSync(path.join(__dirname, '..', 'bot.js'), 'utf8');
assert.doesNotMatch(
  botSource,
  /NOTIFICATION_DISCORD_CHANNEL_ID/,
  'notification delivery must not fall back to the server-status channel'
);
assert.match(
  botSource,
  /discordSender:\s*async notification =>[\s\S]*?sendOwnerDM\(notification\.title, notification\.message/,
  'notification-center Discord delivery must use the owner DM'
);
assert.match(
  botSource,
  /async function sendDiscordNotification[\s\S]*?return sendOwnerDM\(/,
  'legacy operational notifications must also use the owner DM'
);

console.log('Scheduled restart notification policy tests passed.');
