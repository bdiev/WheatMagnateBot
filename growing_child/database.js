'use strict';

const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const START_TOKEN = '__start__';
const END_TOKEN = '__end__';

function getLevel(knownWords) {
  if (knownWords === 0) return 0;
  if (knownWords < 50) return 1;
  if (knownWords < 150) return 2;
  if (knownWords < 300) return 3;
  if (knownWords < 500) return 4;
  return 5 + Math.floor((knownWords - 500) / 500);
}

class GrowingChildDatabase {
  constructor(filename) {
    fs.mkdirSync(path.dirname(filename), { recursive: true });
    this.db = new DatabaseSync(filename);
    this.db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
    this.migrate();
    this.prepare();
  }

  migrate() {
    const hadLearnedSequences = Boolean(this.db.prepare(`
      SELECT 1 FROM sqlite_master
      WHERE type = 'table' AND name = 'learned_sequences'
    `).get());

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS words (
        word TEXT PRIMARY KEY,
        times_seen INTEGER NOT NULL DEFAULT 1,
        first_seen TEXT NOT NULL,
        last_seen TEXT NOT NULL,
        learned_at_level INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS members (
        source TEXT NOT NULL,
        member_id TEXT NOT NULL,
        name TEXT NOT NULL,
        times_seen INTEGER NOT NULL DEFAULT 1,
        first_seen TEXT NOT NULL,
        last_seen TEXT NOT NULL,
        PRIMARY KEY (source, member_id)
      );
      CREATE TABLE IF NOT EXISTS channels (
        source TEXT NOT NULL,
        channel_id TEXT NOT NULL,
        name TEXT NOT NULL,
        times_seen INTEGER NOT NULL DEFAULT 1,
        first_seen TEXT NOT NULL,
        last_seen TEXT NOT NULL,
        PRIMARY KEY (source, channel_id)
      );
      CREATE TABLE IF NOT EXISTS topics (
        topic TEXT PRIMARY KEY,
        times_seen INTEGER NOT NULL DEFAULT 1,
        first_seen TEXT NOT NULL,
        last_seen TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS learned_messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        source TEXT NOT NULL,
        author_name TEXT,
        channel_name TEXT,
        learned_words INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS word_transitions (
        previous_word TEXT NOT NULL,
        current_word TEXT NOT NULL,
        next_word TEXT NOT NULL,
        times_seen INTEGER NOT NULL DEFAULT 1,
        last_seen TEXT NOT NULL,
        PRIMARY KEY (previous_word, current_word, next_word)
      );
      CREATE TABLE IF NOT EXISTS learned_sequences (
        sequence TEXT PRIMARY KEY,
        times_seen INTEGER NOT NULL DEFAULT 1,
        last_seen TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS state (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_words_last_seen ON words(last_seen DESC);
      CREATE INDEX IF NOT EXISTS idx_words_times_seen ON words(times_seen DESC);
      CREATE INDEX IF NOT EXISTS idx_topics_times_seen ON topics(times_seen DESC);
      CREATE INDEX IF NOT EXISTS idx_transitions_pair
        ON word_transitions(previous_word, current_word, times_seen DESC);
      CREATE INDEX IF NOT EXISTS idx_transitions_current
        ON word_transitions(current_word, times_seen DESC);
      CREATE INDEX IF NOT EXISTS idx_sequences_last_seen
        ON learned_sequences(last_seen DESC);
    `);

    // Transition rows created by older versions cannot be matched back to
    // their source messages. Drop only those links once so they cannot be
    // replayed as near-verbatim chat; vocabulary and progression stay intact.
    if (!hadLearnedSequences) {
      this.db.exec('DELETE FROM word_transitions;');
    }
  }

  prepare() {
    this.statements = {
      word: this.db.prepare(`
        INSERT INTO words(word, times_seen, first_seen, last_seen, learned_at_level)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(word) DO UPDATE SET
          times_seen = times_seen + excluded.times_seen,
          last_seen = excluded.last_seen
      `),
      member: this.db.prepare(`
        INSERT INTO members(source, member_id, name, first_seen, last_seen)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(source, member_id) DO UPDATE SET
          name = excluded.name,
          times_seen = times_seen + 1,
          last_seen = excluded.last_seen
      `),
      channel: this.db.prepare(`
        INSERT INTO channels(source, channel_id, name, first_seen, last_seen)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(source, channel_id) DO UPDATE SET
          name = excluded.name,
          times_seen = times_seen + 1,
          last_seen = excluded.last_seen
      `),
      topic: this.db.prepare(`
        INSERT INTO topics(topic, times_seen, first_seen, last_seen)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(topic) DO UPDATE SET
          times_seen = times_seen + excluded.times_seen,
          last_seen = excluded.last_seen
      `),
      message: this.db.prepare(`
        INSERT INTO learned_messages(source, author_name, channel_name, learned_words, created_at)
        VALUES (?, ?, ?, ?, ?)
      `),
      transition: this.db.prepare(`
        INSERT INTO word_transitions(previous_word, current_word, next_word, times_seen, last_seen)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(previous_word, current_word, next_word) DO UPDATE SET
          times_seen = times_seen + excluded.times_seen,
          last_seen = excluded.last_seen
      `),
      sequence: this.db.prepare(`
        INSERT INTO learned_sequences(sequence, times_seen, last_seen)
        VALUES (?, ?, ?)
        ON CONFLICT(sequence) DO UPDATE SET
          times_seen = times_seen + excluded.times_seen,
          last_seen = excluded.last_seen
      `),
      state: this.db.prepare(`
        INSERT INTO state(key, value) VALUES (?, ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value
      `)
    };
  }

  getStats() {
    const knownWords = Number(this.db.prepare('SELECT COUNT(*) AS count FROM words').get().count);
    const messages = Number(this.getState('total_messages', '0'));
    const xp = Number(this.getState('xp', '0'));
    return { knownWords, messages, xp, level: getLevel(knownWords) };
  }

  learn({ frequencies, topics, sequence = [], source, authorId, authorName, channelId, channelName, xp, maxMessages }) {
    const now = new Date().toISOString();
    const before = this.getStats();
    let newWords = 0;

    this.db.exec('BEGIN IMMEDIATE');
    try {
      for (const [word, count] of frequencies) {
        const exists = this.db.prepare('SELECT 1 FROM words WHERE word = ?').get(word);
        if (!exists) newWords++;
        this.statements.word.run(word, count, now, now, Math.max(1, before.level));
      }
      for (const [topic, count] of topics) {
        this.statements.topic.run(topic, count, now, now);
      }
      if (sequence.length > 0) {
        const chain = [START_TOKEN, START_TOKEN, ...sequence, END_TOKEN];
        for (let i = 0; i < chain.length - 2; i++) {
          this.statements.transition.run(chain[i], chain[i + 1], chain[i + 2], 1, now);
        }
        this.statements.sequence.run(sequence.join(' '), 1, now);
      }
      if (authorId && authorName) {
        this.statements.member.run(source, String(authorId), String(authorName), now, now);
      }
      if (channelId && channelName) {
        this.statements.channel.run(source, String(channelId), String(channelName), now, now);
      }
      this.statements.message.run(source, authorName || null, channelName || null, newWords, now);
      this.setState('xp', String(before.xp + xp));
      this.setState('total_messages', String(before.messages + 1));
      this.db.prepare(`
        DELETE FROM learned_messages
        WHERE id NOT IN (SELECT id FROM learned_messages ORDER BY id DESC LIMIT ?)
      `).run(maxMessages);
      this.db.exec('COMMIT');
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    }

    return { newWords, ...this.getStats() };
  }

  getWords({ limit = 100, recent = false } = {}) {
    const order = recent ? 'last_seen DESC' : 'times_seen DESC, last_seen DESC';
    return this.db.prepare(`
      SELECT word, times_seen, first_seen, last_seen, learned_at_level
      FROM words ORDER BY ${order} LIMIT ?
    `).all(limit);
  }

  getAllWords() {
    return this.db.prepare(`
      SELECT word, times_seen, first_seen, last_seen, learned_at_level
      FROM words
      ORDER BY times_seen DESC, word ASC
    `).all();
  }

  getMembers(limit = 25) {
    return this.db.prepare(
      'SELECT name, times_seen FROM members ORDER BY times_seen DESC, last_seen DESC LIMIT ?'
    ).all(limit);
  }

  getTopics(limit = 25) {
    return this.db.prepare(
      'SELECT topic, times_seen FROM topics ORDER BY times_seen DESC, last_seen DESC LIMIT ?'
    ).all(limit);
  }

  getNextWords(previousWord, currentWord, limit = 50) {
    return this.db.prepare(`
      SELECT next_word, times_seen
      FROM word_transitions
      WHERE previous_word = ? AND current_word = ?
      ORDER BY times_seen DESC, last_seen DESC
      LIMIT ?
    `).all(previousWord, currentWord, limit);
  }

  getContextsForWord(word, limit = 50) {
    return this.db.prepare(`
      SELECT previous_word, current_word, times_seen
      FROM word_transitions
      WHERE current_word = ? AND next_word != ?
      ORDER BY times_seen DESC, last_seen DESC
      LIMIT ?
    `).all(word, END_TOKEN, limit);
  }

  getLearnedSequences(limit = 1000) {
    return this.db.prepare(`
      SELECT sequence, times_seen
      FROM learned_sequences
      ORDER BY last_seen DESC
      LIMIT ?
    `).all(limit);
  }

  getRecentActivity(minutes = 10) {
    const since = new Date(Date.now() - minutes * 60_000).toISOString();
    return Number(this.db.prepare(
      'SELECT COUNT(*) AS count FROM learned_messages WHERE created_at >= ?'
    ).get(since).count);
  }

  getState(key, fallback = null) {
    return this.db.prepare('SELECT value FROM state WHERE key = ?').get(key)?.value ?? fallback;
  }

  setState(key, value) {
    this.statements.state.run(key, String(value));
  }

  reset() {
    this.db.exec(`
      BEGIN IMMEDIATE;
      DELETE FROM words;
      DELETE FROM members;
      DELETE FROM channels;
      DELETE FROM topics;
      DELETE FROM word_transitions;
      DELETE FROM learned_sequences;
      DELETE FROM learned_messages;
      DELETE FROM state;
      DELETE FROM sqlite_sequence WHERE name = 'learned_messages';
      COMMIT;
    `);
  }

  close() {
    this.db.close();
  }
}

module.exports = { GrowingChildDatabase, getLevel, START_TOKEN, END_TOKEN };
