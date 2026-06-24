'use strict';

const fs = require('fs');
const path = require('path');

const DEFAULTS = Object.freeze({
  enabled: true,
  databasePath: 'data/growing_child.sqlite',
  dailyMessageChannelId: null,
  ignoredChannels: [],
  ignoredUsers: [],
  minimumWordLength: 3,
  dailyMessageTime: '18:00',
  xpPerLearnedWord: 5,
  xpPerMessage: 1,
  randomSpeechEnabled: true,
  randomSpeechMinMinutes: 45,
  randomSpeechMaxMinutes: 180,
  dailySpeechEnabled: true,
  ownerDmOnly: true,
  maxLearnedMessages: 5000
});

function loadConfig(configPath = path.join(__dirname, 'config.json')) {
  let fileConfig = {};
  try {
    fileConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }

  const config = { ...DEFAULTS, ...fileConfig };
  config.ignoredChannels = new Set((config.ignoredChannels || []).map(String));
  config.ignoredUsers = new Set((config.ignoredUsers || []).map(value => String(value).toLowerCase()));
  config.minimumWordLength = Math.max(1, Number(config.minimumWordLength) || 3);
  config.randomSpeechMinMinutes = Math.max(1, Number(config.randomSpeechMinMinutes) || 45);
  config.randomSpeechMaxMinutes = Math.max(
    config.randomSpeechMinMinutes,
    Number(config.randomSpeechMaxMinutes) || 180
  );
  config.databasePath = path.resolve(path.dirname(__dirname), config.databasePath);
  return config;
}

module.exports = { loadConfig };
