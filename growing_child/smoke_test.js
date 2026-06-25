'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { GrowingChildDatabase } = require('./database');
const { LearningSystem } = require('./learning');
const { EmotionSystem } = require('./emotion');
const { MessageGenerator } = require('./generator');
const { sanitizePublicPhrase } = require('./safety');
const { validateAIGeneratedPhrase } = require('./ai_generation');

const filename = path.join(os.tmpdir(), `growing-child-${process.pid}.sqlite`);
const cleanup = () => {
  for (const suffix of ['', '-shm', '-wal']) {
    try { fs.unlinkSync(filename + suffix); } catch {}
  }
};

cleanup();
const database = new GrowingChildDatabase(filename);
try {
  const config = {
    enabled: true,
    minimumWordLength: 3,
    ignoredUsers: new Set(),
    ignoredChannels: new Set(),
    xpPerMessage: 1,
    xpPerLearnedWord: 5,
    maxLearnedMessages: 100
  };
  const learning = new LearningSystem(database, config);
  const emotions = new EmotionSystem(database);
  const generator = new MessageGenerator(database, emotions);
  const result = learning.learnMessage({
    source: 'test',
    authorId: 'tester',
    authorName: 'Tester',
    channelId: 'test',
    channelName: 'Test',
    text: 'hello obsidian farm needs more rockets x3402889 68 -672222',
    addressed: true
  });
  emotions.update({ newWords: result.newWords, addressed: true });

  const known = new Set(database.getWords({ limit: 100 }).map(row => row.word));
  const allWords = database.getAllWords();
  if (allWords.length !== result.knownWords) {
    throw new Error(`Full vocabulary export is incomplete: ${allWords.length}/${result.knownWords}`);
  }
  const phrase = generator.generate();
  const reply = generator.generateReply(['obsidian', 'unknown-word']);
  const normalizedLearned = 'hello obsidian farm needs more rockets';
  const normalizedPhrase = phrase.toLocaleLowerCase().match(/[\p{L}\p{N}]+/gu)?.join(' ') || '';
  const normalizedReply = reply.toLocaleLowerCase().match(/[\p{L}\p{N}]+/gu)?.join(' ') || '';
  if (normalizedPhrase === normalizedLearned || normalizedReply === normalizedLearned) {
    throw new Error(`Generator copied a learned message: ${phrase} / ${reply}`);
  }
  if (
    !['hello', 'obsidian', 'farm', 'needs', 'more', 'rockets'].some(word => normalizedPhrase.includes(word)) ||
    !normalizedReply.includes('obsidian')
  ) {
    throw new Error(`Original fallback lost its selected topic: ${phrase} / ${reply}`);
  }
  if (known.has('x3402889') || known.has('68') || known.has('672222')) {
    throw new Error('Coordinate-like tokens entered the vocabulary.');
  }
  if (sanitizePublicPhrase('hello 3402889 farm') !== null) {
    throw new Error('Coordinate safety filter accepted digits.');
  }
  if (sanitizePublicPhrase('/msg hello') !== null) {
    throw new Error('Coordinate safety filter accepted a command.');
  }
  if (sanitizePublicPhrase('minus three hundred') !== null) {
    throw new Error('Coordinate safety filter accepted spelled-out numbers.');
  }
  if (sanitizePublicPhrase('hello farm?') !== 'hello farm?') {
    throw new Error('Coordinate safety filter rejected a safe phrase.');
  }
  const aiPhrase = validateAIGeneratedPhrase({
    phrase: 'Do you have more rockets?',
    learnedWords: [...known],
    isTooSimilar: () => false
  });
  if (aiPhrase !== 'Do you have more rockets?') {
    throw new Error('AI phrase validation rejected a valid constrained phrase.');
  }
  if (validateAIGeneratedPhrase({
    phrase: 'Please bring diamonds now.',
    learnedWords: [...known],
    isTooSimilar: () => false
  }) !== null) {
    throw new Error('AI phrase validation accepted unknown words.');
  }
  if (validateAIGeneratedPhrase({
    phrase: 'Hello obsidian farm needs more rockets.',
    learnedWords: [...known],
    isTooSimilar: () => true
  }) !== null) {
    throw new Error('AI phrase validation accepted copied chat.');
  }

  database.reset();
  const reset = database.getStats();
  if (reset.level !== 0 || reset.knownWords !== 0 || reset.xp !== 0) {
    throw new Error(`Reset failed: ${JSON.stringify(reset)}`);
  }
  console.log('Growing Child AI smoke test passed.');
} finally {
  database.close();
  cleanup();
}
