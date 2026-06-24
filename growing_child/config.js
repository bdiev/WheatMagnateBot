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
  randomSpeechMinMinutes: 480,
  randomSpeechMaxMinutes: 960,
  reactiveSpeechEnabled: true,
  reactiveSpeechChance: 0,
  addressedSpeechChance: 1,
  reactiveCooldownMinutes: 10,
  reactiveDelayMinSeconds: 5,
  reactiveDelayMaxSeconds: 25,
  dailySpeechEnabled: false,
  ownerDmOnly: true,
  minecraftPublicSpeechEnabled: true,
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
  config.randomSpeechMinMinutes = Math.max(1, Number(config.randomSpeechMinMinutes) || 480);
  config.randomSpeechMaxMinutes = Math.max(
    config.randomSpeechMinMinutes,
    Number(config.randomSpeechMaxMinutes) || 960
  );
  config.reactiveSpeechChance = Math.max(0, Math.min(1, Number(config.reactiveSpeechChance) || 0));
  config.addressedSpeechChance = Math.max(0, Math.min(1, Number(config.addressedSpeechChance) || 0));
  config.reactiveCooldownMinutes = Math.max(1, Number(config.reactiveCooldownMinutes) || 10);
  config.reactiveDelayMinSeconds = Math.max(1, Number(config.reactiveDelayMinSeconds) || 5);
  config.reactiveDelayMaxSeconds = Math.max(
    config.reactiveDelayMinSeconds,
    Number(config.reactiveDelayMaxSeconds) || 25
  );
  config.databasePath = path.resolve(path.dirname(__dirname), config.databasePath);
  return config;
}

module.exports = { loadConfig };
