'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { GrowingChildDatabase } = require('./database');
const { GrowingChildAI, matchingResponseExamples } = require('./index');
const { MessageGenerator } = require('./generator');
const { extractMemories, containsSensitiveData } = require('./memory');
const { evaluateGeneration } = require('./quality');
const { getIdentityReply } = require('./identity');

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
  qualityMinimumCoherence: 0.6, qualityMaximumToxicity: 0.15,
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
  const legacyStyleFilename = path.join(directory, 'legacy-style.sqlite');
  const legacyStyleDatabase = new DatabaseSync(legacyStyleFilename);
  legacyStyleDatabase.exec(`
    CREATE TABLE player_style_profiles (
      source TEXT NOT NULL, subject_id TEXT NOT NULL, subject_name TEXT,
      messages_seen INTEGER NOT NULL DEFAULT 0, total_words INTEGER NOT NULL DEFAULT 0,
      total_characters INTEGER NOT NULL DEFAULT 0, short_messages INTEGER NOT NULL DEFAULT 0,
      question_messages INTEGER NOT NULL DEFAULT 0, exclamation_messages INTEGER NOT NULL DEFAULT 0,
      emoji_messages INTEGER NOT NULL DEFAULT 0, uppercase_messages INTEGER NOT NULL DEFAULT 0,
      greeting_messages INTEGER NOT NULL DEFAULT 0, courtesy_messages INTEGER NOT NULL DEFAULT 0,
      cyrillic_characters INTEGER NOT NULL DEFAULT 0, latin_characters INTEGER NOT NULL DEFAULT 0,
      admin_tone TEXT NOT NULL DEFAULT 'auto', admin_length TEXT NOT NULL DEFAULT 'auto',
      admin_notes TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
      PRIMARY KEY(source, subject_id)
    );
    CREATE TABLE conversation_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT, conversation_key TEXT NOT NULL, source TEXT NOT NULL,
      author_id TEXT, author_name TEXT, role TEXT NOT NULL DEFAULT 'user', content TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    INSERT INTO player_style_profiles(source,subject_id,subject_name,messages_seen,total_words,
      total_characters,short_messages,latin_characters,created_at,updated_at)
    VALUES('minecraft','legacy-carlos','Carlos',2,10,50,0,42,'2026-01-01','2026-01-01');
    INSERT INTO conversation_messages(conversation_key,source,author_id,author_name,role,content,created_at)
    VALUES
      ('minecraft:room','minecraft','legacy-carlos','Carlos','user','hola gracias donde esta mi base','2026-01-01'),
      ('minecraft:room','minecraft','legacy-carlos','Carlos','user','yo no puedo encontrar netherite porque esta lejos','2026-01-01');
  `);
  legacyStyleDatabase.close();
  const migratedStyleDatabase = new GrowingChildDatabase(legacyStyleFilename);
  const migratedStyleProfile = migratedStyleDatabase.getPlayerStyle('minecraft', 'legacy-carlos');
  assert.equal(migratedStyleProfile.language, 'Spanish', 'retained conversation context must backfill legacy language evidence');
  assert.equal(migratedStyleProfile.languageEvidenceMessages, 2);
  migratedStyleDatabase.close();

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

  database.observePlayerStyle({
    source: 'minecraft', subjectId: 'uuid-1', subjectName: 'Alex',
    text: 'HEY! Can you help please?'
  });
  database.observePlayerStyle({
    source: 'minecraft', subjectId: 'uuid-1', subjectName: 'Alex',
    text: 'Thanks!'
  });
  let profile = database.getPlayerStyle('minecraft', 'uuid-1');
  assert.equal(profile.subjectName, 'Alex');
  assert.equal(profile.messagesSeen, 2);
  assert.ok(profile.signals.some(signal => signal.startsWith('polite wording in ')));
  assert.equal(profile.language, 'English');
  assert.equal(profile.learningStatus, 'insufficient');
  assert.ok(profile.languageConfidence > 0 && profile.languageConfidence < 0.3);
  profile = database.updatePlayerStyle('minecraft', 'uuid-1', {
    tone: 'friendly', responseLength: 'short', notes: 'Answer warmly'
  });
  assert.equal(profile.tone, 'friendly');
  assert.equal(profile.responseLength, 'short');
  assert.equal(profile.adminNotes, 'Answer warmly');

  for (let index = 0; index < 12; index++) {
    database.observePlayerStyle({
      source: 'minecraft', subjectId: 'spanish-player', subjectName: 'Carlos',
      text: index % 2 ? 'hola gracias donde esta mi base' : 'yo no puedo encontrar netherite porque esta lejos'
    });
    database.observePlayerStyle({
      source: 'minecraft', subjectId: 'playful-player', subjectName: 'Mrow',
      text: 'lol bro thats wild :3'
    });
    database.observePlayerStyle({
      source: 'minecraft', subjectId: 'question-player', subjectName: 'Curious',
      text: 'where is the farm and how can I help?'
    });
    database.observePlayerStyle({
      source: 'minecraft', subjectId: 'turkish-player', subjectName: 'Efe',
      text: 'merhaba teşekkürler benim base nerede'
    });
    database.observePlayerStyle({
      source: 'minecraft', subjectId: 'russian-player', subjectName: 'Ivan',
      text: 'привет спасибо где моя база и как пройти'
    });
    database.observePlayerStyle({
      source: 'minecraft', subjectId: 'multilingual-player', subjectName: 'Polyglot',
      text: index % 2 ? 'hello thanks where is my base' : 'hola gracias donde esta mi base'
    });
  }
  const spanishProfile = database.getPlayerStyle('minecraft', 'spanish-player');
  assert.equal(spanishProfile.language, 'Spanish');
  assert.ok(spanishProfile.languageConfidence >= 0.7, 'repeated Spanish evidence must produce a confident language');
  const playfulProfile = database.getPlayerStyle('minecraft', 'playful-player');
  assert.equal(playfulProfile.detectedTone, 'playful');
  assert.ok(playfulProfile.signals.some(signal => signal.startsWith('humor markers in ')));
  const questionProfile = database.getPlayerStyle('minecraft', 'question-player');
  assert.equal(questionProfile.detectedTone, 'inquisitive', 'questions are inquisitive rather than helpful/casual');
  assert.equal(database.getPlayerStyle('minecraft', 'turkish-player').language, 'Turkish');
  assert.equal(database.getPlayerStyle('minecraft', 'russian-player').language, 'Russian');
  const multilingualProfile = database.getPlayerStyle('minecraft', 'multilingual-player');
  assert.equal(multilingualProfile.multilingual, true);
  assert.ok(multilingualProfile.languageBreakdown.some(item => item.name === 'English'));
  assert.ok(multilingualProfile.languageBreakdown.some(item => item.name === 'Spanish'));
  database.observePlayerStyle({
    source: 'minecraft', subjectId: 'unknown-latin', subjectName: 'Miner', text: 'netherite quartz spawn'
  });
  assert.equal(database.getPlayerStyle('minecraft', 'unknown-latin').language, 'Latin (undetermined)');
  const exampleId = database.addResponseExample({
    subjectSource: 'minecraft', subjectId: 'uuid-1',
    triggerText: 'Can you help with the farm?',
    responseText: 'I can help with your farm.',
    createdBy: 'admin'
  });
  assert.equal(database.getResponseExamples({ subjectSource: 'minecraft', subjectId: 'uuid-1' })[0].id, exampleId);
  database.updateResponseExample(exampleId, { responseText: 'I can help with the farm.' });
  assert.equal(database.getResponseExamples({ subjectSource: 'minecraft', subjectId: 'uuid-1' })[0].response_text, 'I can help with the farm.');
  assert.equal(matchingResponseExamples(
    database.getResponseExamples({ subjectSource: 'minecraft', subjectId: 'uuid-1' }),
    'Could you help with this farm?'
  )[0].id, exampleId);

  const accepted = evaluateGeneration({ phrase: 'Do you need obsidian today?', database, config });
  assert.equal(accepted.accepted, true);
  const wordSalad = evaluateGeneration({
    phrase: 'Onto stars dip fixed alla phase subs mio honestly schweet finder.',
    database: {
      getAllWords: () => 'onto stars dip fixed alla phase subs mio honestly schweet finder'.split(' ').map(word => ({ word })),
      getRecentGeneratedPhrases: () => []
    },
    config
  });
  assert.equal(wordSalad.accepted, false);
  assert.ok(wordSalad.reasons.includes('low_coherence'));
  assert.ok(wordSalad.coherence < 0.6);
  const offTopic = evaluateGeneration({
    phrase: 'Do you need rockets?',
    database,
    config,
    contextWords: ['obsidian', 'farm'],
    reason: 'reaction'
  });
  assert.equal(offTopic.accepted, false);
  assert.ok(offTopic.reasons.includes('off_topic'));
  const onTopic = evaluateGeneration({
    phrase: 'Do you need obsidian?',
    database,
    config,
    contextWords: ['obsidian', 'farm'],
    reason: 'reaction'
  });
  assert.equal(onTopic.accepted, true);
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
  assert.equal(exportPayload.version, 4);
  assert.equal(exportPayload.tables.player_style_profiles.length, 8);
  assert.equal(exportPayload.tables.response_examples.length, 1);
  const currentCount = database.getWords({ limit: 100 }).find(row => row.word === 'obsidian').times_seen;
  database.importState(exportPayload);
  assert.equal(database.getWords({ limit: 100 }).find(row => row.word === 'obsidian').times_seen, currentCount,
    'Import must merge without replacing current vocabulary counters.');
  assert.equal(database.forgetUser('minecraft', 'uuid-1'), 1);
  assert.equal(database.getMemories({ subjectId: 'uuid-1' }).length, 0);
  assert.equal(database.getConversationContext('minecraft:room', 10).length, 0);
  database.close();

  const botSource = fs.readFileSync(path.resolve(__dirname, '..', '..', 'bot.js'), 'utf8');
  assert.match(botSource, /learnedLanguageIsReliable[\s\S]*preferredLanguage/, 'generation must only trust sufficiently confident language evidence');
  assert.match(botSource, /responseWordRange[\s\S]*playerStyle\?\.responseLength/, 'detected reply length must change the generation constraint');

  let externalCalls = 0;
  const child = new GrowingChildAI({
    config: { ...config, databasePath: path.join(directory, 'disabled-ai.sqlite') },
    sendOwnerDM: async () => {}, sendChannelMessage: async () => {}, sendMinecraftMessage: async () => true,
    generateWithAI: async () => { externalCalls++; return 'hello obsidian farm'; },
    isExternalAIEnabled: () => false
  });
  await child.generateAIPhrases('button', [], {});
  assert.equal(externalCalls, 0, 'External AI must not be called while its runtime flag is disabled.');
  const taughtId = child.addResponseExample({
    subjectSource: 'minecraft', subjectId: 'alex',
    triggerText: 'Can you help with my farm?',
    responseText: 'I can help with your farm.'
  });
  assert.ok(taughtId > 0);
  const taughtReply = await child.choosePhrase('reaction', ['help', 'farm'], {
    responseExamples: [{ id: taughtId, response_text: 'I can help with your farm.', matchScore: 1 }]
  });
  assert.equal(taughtReply, 'I can help with your farm.');
  const identityReply = getIdentityReply('whose bot are you?');
  assert.equal(
    await child.choosePhrase('reaction', [], { identityReply }),
    'My owner is bdiev_.',
    'identity replies must bypass learned-vocabulary availability without using external AI'
  );
  child.stop();

  console.log('Growing Child deterministic tests passed.');
}

run().finally(() => {
  try { fs.rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }); } catch {}
}).catch(err => {
  console.error(err);
  process.exitCode = 1;
});
