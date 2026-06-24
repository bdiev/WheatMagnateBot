'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { GrowingChildDatabase } = require('./database');
const { LearningSystem } = require('./learning');
const { EmotionSystem } = require('./emotion');
const { MessageGenerator } = require('./generator');

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
    text: 'hello obsidian farm doors important rockets',
    addressed: true
  });
  emotions.update({ newWords: result.newWords, addressed: true });

  const known = new Set(database.getWords({ limit: 100 }).map(row => row.word));
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
