'use strict';

const fs = require('fs');
const { Client, GatewayIntentBits, Partials } = require('discord.js');

function createDiscordClient() {
  return new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.DirectMessages,
      GatewayIntentBits.MessageContent
    ],
    partials: [Partials.Channel]
  });
}

function saveStatusMessageId(id, file = 'status_message_id.txt') {
  try {
    fs.writeFileSync(file, id);
  } catch (e) {
    console.error('[Bot] Failed to save status message ID:', e.message);
  }
}

function loadStatusMessageId(file = 'status_message_id.txt') {
  try {
    return fs.readFileSync(file, 'utf8').trim();
  } catch (e) {
    return null;
  }
}

module.exports = {
  createDiscordClient,
  saveStatusMessageId,
  loadStatusMessageId
};
