'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { GrowingChildDatabase } = require('./database');
const { LearningSystem } = require('./learning');
const { EmotionSystem } = require('./emotion');
const { MessageGenerator } = require('./generator');
const { sanitizePublicPhrase } = require('./safety');

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
    text: 'hello obsidian farm doors important rockets x3402889 68 -672222',
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
  const generatedWords = phrase.toLocaleLowerCase().match(/[\p{L}\p{N}]+/gu) || [];
  const replyWords = reply.toLocaleLowerCase().match(/[\p{L}\p{N}]+/gu) || [];
  if (!generatedWords.every(word => known.has(word))) {
    throw new Error(`Generator used an unknown word: ${phrase}`);
  }
  if (!replyWords.every(word => known.has(word))) {
    throw new Error(`Reply generator used an unknown word: ${reply}`);
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
