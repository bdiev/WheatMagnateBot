'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { GrowingChildDatabase } = require('./database');
const { GrowingChildAI } = require('./index');
const { MessageGenerator } = require('./generator');
const { extractMemories, containsSensitiveData } = require('./memory');
const { evaluateGeneration } = require('./quality');

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'growing-child-deterministic-'));
const filename = path.join(directory, 'state.sqlite');
const config = {
  enabled: false, databasePath: filename, ignoredUsers: new Set(), ignoredChannels: new Set(),
  minimumWordLength: 2, xpPerMessage: 1, xpPerLearnedWord: 1, maxLearnedMessages: 100,
  randomSpeechEnabled: false, dailySpeechEnabled: false, reactiveSpeechEnabled: false,
  randomSpeechMinMinutes: 10, randomSpeechMaxMinutes: 10, messagesPerSpeechMin: 10,
  messagesPerSpeechMax: 10, activitySpeechDelayMinSeconds: 1, activitySpeechDelayMaxSeconds: 1,
  randomSpeechCooldownMinutes: 30, aiGenerationEnabled: true, aiVocabularyLimit: 100,
  aiCandidateCount: 2, aiWordsPerPhraseMin: 3, aiWordsPerPhraseMax: 3,
  conversationContextMessages: 3, maxConversationMessages: 20, memoryDefaultTtlDays: 30,
  maxMemories: 100, maxGenerationAttempts: 100, maxGeneratedPhrases: 50,
  maxDatabaseBytes: 5 * 1024 * 1024, cleanupIntervalHours: 6,
  qualityMinimumCoherence: 0.35, qualityMaximumToxicity: 0.15,
  qualityMaximumRepetition: 0.72, qualityMaximumUnknownRatio: 0.2
};

function learnVocabulary(database) {
  const now = new Date().toISOString();
  database.learn({
    frequencies: new Map('hello obsidian farm needs more rockets today please'.split(' ').map(word => [word, 1])),
    topics: new Map([['obsidian', 1]]), sequence: ['hello', 'obsidian', 'farm'], source: 'test',
    authorId: 'tester', authorName: 'Tester', channelId: 'test', channelName: 'Test', xp: 1, maxMessages: 100
  });
  assert.ok(now <= database.getWords({ limit: 1 })[0].last_seen);
}

function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

async function run() {
  let database = new GrowingChildDatabase(filename);
  learnVocabulary(database);
  const beforeMigration = database.getWords({ limit: 100 }).find(row => row.word === 'obsidian').times_seen;
  database.close();
  database = new GrowingChildDatabase(filename);
  assert.equal(database.getWords({ limit: 100 }).find(row => row.word === 'obsidian').times_seen, beforeMigration,
    'Opening the migrated database must preserve vocabulary and experience.');

  const context = { source: 'minecraft', authorId: 'uuid-1', authorName: 'Alex', messageId: '42', text: 'I prefer silk touch pickaxes' };
  const extracted = extractMemories(context, config);
  assert.equal(extracted.length, 1);
  const firstId = database.upsertMemory(extracted[0]);
  const saved = database.getMemories({ subjectId: 'uuid-1' })[0];
  assert.equal(saved.fact_value, 'silk touch pickaxes');
  assert.equal(saved.source_ref, '42');
  assert.ok(saved.confidence > 0 && saved.expires_at);

  const correctedId = database.correctMemory(firstId, {
    factValue: 'fortune pickaxes', confidence: 0.99,
    expiresAt: new Date(Date.now() + 86_400_000).toISOString(), sourceRef: 'admin'
  });
  assert.notEqual(correctedId, firstId);
  assert.equal(database.getMemories({ subjectId: 'uuid-1' })[0].fact_value, 'fortune pickaxes');
  assert.equal(database.getMemories({ subjectId: 'uuid-1', includeDeleted: true }).length, 2);

  database.addConversationMessage({ conversationKey: 'minecraft:room', source: 'minecraft', authorId: 'uuid-1', content: 'first' });
  database.addConversationMessage({ conversationKey: 'minecraft:room', source: 'minecraft', authorId: 'uuid-1', content: 'second' });
  database.addConversationMessage({ conversationKey: 'minecraft:room', source: 'minecraft', authorId: 'uuid-1', content: 'third' });
  database.addConversationMessage({ conversationKey: 'minecraft:room', source: 'minecraft', authorId: 'uuid-1', content: 'fourth' });
  assert.deepEqual(database.getConversationContext('minecraft:room', 3).map(row => row.content), ['second', 'third', 'fourth']);

  const accepted = evaluateGeneration({ phrase: 'hello obsidian farm today', database, config });
  assert.equal(accepted.accepted, true);
  const toxic = evaluateGeneration({ phrase: 'hello stupid obsidian farm', database, config });
  assert.ok(toxic.reasons.includes('toxicity'));
  const unknown = evaluateGeneration({ phrase: 'zorb blarg obsidian farm', database, config });
  assert.ok(unknown.reasons.includes('unknown_words'));
  database.rememberGeneratedPhrase('hello obsidian farm today');
  const repeated = evaluateGeneration({ phrase: 'hello obsidian farm today', database, config });
  assert.ok(repeated.reasons.includes('repetition'));
  assert.equal(containsSensitiveData('my API token is abc123'), true);
  assert.equal(containsSensitiveData('мой пароль secretvalue'), true);

  const generatorDatabase = {
    getAllWords: () => 'hello obsidian farm needs more rockets today please mining safely quickly'.split(' ').map(word => ({ word })),
    getLearnedSequences: () => []
  };
  const generatorEmotion = { get: () => 'neutral' };
  const firstGenerated = new MessageGenerator(generatorDatabase, generatorEmotion, { random: seededRandom(7) })
    .generateCandidates({ attempts: 12, limit: 4 });
  const secondGenerated = new MessageGenerator(generatorDatabase, generatorEmotion, { random: seededRandom(7) })
    .generateCandidates({ attempts: 12, limit: 4 });
  assert.ok(firstGenerated.length > 0);
  assert.deepEqual(firstGenerated, secondGenerated, 'Seeded generation must be deterministic.');

  const exportPayload = database.exportState();
  const currentCount = database.getWords({ limit: 100 }).find(row => row.word === 'obsidian').times_seen;
  database.importState(exportPayload);
  assert.equal(database.getWords({ limit: 100 }).find(row => row.word === 'obsidian').times_seen, currentCount,
    'Import must merge without replacing current vocabulary counters.');
  assert.equal(database.forgetUser('minecraft', 'uuid-1'), 1);
  assert.equal(database.getMemories({ subjectId: 'uuid-1' }).length, 0);
  assert.equal(database.getConversationContext('minecraft:room', 10).length, 0);
  database.close();

  let externalCalls = 0;
  const child = new GrowingChildAI({
    config: { ...config, databasePath: path.join(directory, 'disabled-ai.sqlite') },
    sendOwnerDM: async () => {}, sendChannelMessage: async () => {}, sendMinecraftMessage: async () => true,
    generateWithAI: async () => { externalCalls++; return 'hello obsidian farm'; },
    isExternalAIEnabled: () => false
  });
  await child.generateAIPhrases('button', [], {});
  assert.equal(externalCalls, 0, 'External AI must not be called while its runtime flag is disabled.');
  child.stop();

  console.log('Growing Child deterministic tests passed.');
}

run().finally(() => {
  try { fs.rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }); } catch {}
}).catch(err => {
  console.error(err);
  process.exitCode = 1;
});
