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
  randomSpeechMaxMinutes: 480,
  messagesPerSpeechMin: 50,
  messagesPerSpeechMax: 100,
  activitySpeechDelayMinSeconds: 15,
  activitySpeechDelayMaxSeconds: 90,
  randomSpeechCooldownMinutes: 120,
  reactiveSpeechEnabled: true,
  reactiveSpeechChance: 0,
  addressedSpeechChance: 1,
  reactiveCooldownMinutes: 10,
  reactiveDelayMinSeconds: 5,
  reactiveDelayMaxSeconds: 25,
  dailySpeechEnabled: false,
  ownerDmOnly: true,
  minecraftPublicSpeechEnabled: true,
  aiGenerationEnabled: true,
  aiVocabularyLimit: 800,
  aiCandidateCount: 5,
  aiWordsPerPhraseMin: 3,
  aiWordsPerPhraseMax: 6,
  maxLearnedMessages: 5000,
  conversationContextMessages: 8,
  maxConversationMessages: 1500,
  memoryDefaultTtlDays: 180,
  maxMemories: 2000,
  maxGenerationAttempts: 1000,
  maxGeneratedPhrases: 200,
  maxDatabaseBytes: 26214400,
  cleanupIntervalHours: 6,
  qualityMinimumCoherence: 0.35,
  qualityMaximumToxicity: 0.15,
  qualityMaximumRepetition: 0.72,
  qualityMaximumUnknownRatio: 0.2
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
    Number(config.randomSpeechMaxMinutes) || 480
  );
  config.messagesPerSpeechMin = Math.max(1, Number(config.messagesPerSpeechMin) || 50);
  config.messagesPerSpeechMax = Math.max(
    config.messagesPerSpeechMin,
    Number(config.messagesPerSpeechMax) || 100
  );
  config.activitySpeechDelayMinSeconds = Math.max(
    1,
    Number(config.activitySpeechDelayMinSeconds) || 15
  );
  config.activitySpeechDelayMaxSeconds = Math.max(
    config.activitySpeechDelayMinSeconds,
    Number(config.activitySpeechDelayMaxSeconds) || 90
  );
  config.randomSpeechCooldownMinutes = Math.max(
    30,
    Number(config.randomSpeechCooldownMinutes) || 120
  );
  config.reactiveSpeechChance = Math.max(0, Math.min(1, Number(config.reactiveSpeechChance) || 0));
  config.addressedSpeechChance = Math.max(0, Math.min(1, Number(config.addressedSpeechChance) || 0));
  config.reactiveCooldownMinutes = Math.max(1, Number(config.reactiveCooldownMinutes) || 10);
  config.reactiveDelayMinSeconds = Math.max(1, Number(config.reactiveDelayMinSeconds) || 5);
  config.reactiveDelayMaxSeconds = Math.max(
    config.reactiveDelayMinSeconds,
    Number(config.reactiveDelayMaxSeconds) || 25
  );
  config.aiVocabularyLimit = Math.max(50, Number(config.aiVocabularyLimit) || 800);
  config.aiCandidateCount = Math.max(1, Math.min(8, Number(config.aiCandidateCount) || 5));
  config.aiWordsPerPhraseMin = Math.max(3, Number(config.aiWordsPerPhraseMin) || 3);
  config.aiWordsPerPhraseMax = Math.max(
    config.aiWordsPerPhraseMin,
    Number(config.aiWordsPerPhraseMax) || 6
  );
  config.conversationContextMessages = Math.max(1, Math.min(30, Number(config.conversationContextMessages) || 8));
  config.maxConversationMessages = Math.max(100, Number(config.maxConversationMessages) || 1500);
  config.memoryDefaultTtlDays = Math.max(1, Number(config.memoryDefaultTtlDays) || 180);
  config.maxMemories = Math.max(100, Number(config.maxMemories) || 2000);
  config.maxGenerationAttempts = Math.max(100, Number(config.maxGenerationAttempts) || 1000);
  config.maxGeneratedPhrases = Math.max(50, Number(config.maxGeneratedPhrases) || 200);
  config.maxDatabaseBytes = Math.max(5 * 1024 * 1024, Number(config.maxDatabaseBytes) || 25 * 1024 * 1024);
  config.cleanupIntervalHours = Math.max(1, Number(config.cleanupIntervalHours) || 6);
  config.qualityMinimumCoherence = Math.max(0, Math.min(1, Number(config.qualityMinimumCoherence) || 0.35));
  config.qualityMaximumToxicity = Math.max(0, Math.min(1, Number(config.qualityMaximumToxicity) || 0.15));
  config.qualityMaximumRepetition = Math.max(0, Math.min(1, Number(config.qualityMaximumRepetition) || 0.72));
  config.qualityMaximumUnknownRatio = Math.max(0, Math.min(1, Number(config.qualityMaximumUnknownRatio) || 0.2));
  config.databasePath = path.resolve(__dirname, '..', '..', config.databasePath);
  return config;
}

module.exports = { loadConfig };
