'use strict';

const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');
const { containsSensitiveData } = require('./memory');

const START_TOKEN = '__start__';
const END_TOKEN = '__end__';

function normalizeGeneratedPhrase(phrase) {
  return (
    String(phrase || '').toLocaleLowerCase().match(/\p{L}+(?:['’]\p{L}+)*/gu) || []
  ).join(' ');
}

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
    this.filename = filename;
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
      CREATE TABLE IF NOT EXISTS generated_phrases (
        phrase TEXT PRIMARY KEY,
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS conversation_messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        conversation_key TEXT NOT NULL,
        source TEXT NOT NULL,
        author_id TEXT,
        author_name TEXT,
        role TEXT NOT NULL DEFAULT 'user',
        content TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS memories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        subject_source TEXT NOT NULL,
        subject_id TEXT NOT NULL,
        subject_name TEXT,
        kind TEXT NOT NULL,
        fact_key TEXT NOT NULL,
        fact_value TEXT NOT NULL,
        confidence REAL NOT NULL,
        source_type TEXT NOT NULL,
        source_ref TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        corrected_from INTEGER,
        deleted_at TEXT,
        FOREIGN KEY(corrected_from) REFERENCES memories(id) ON DELETE SET NULL
      );
      CREATE TABLE IF NOT EXISTS generation_attempts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        phrase TEXT,
        generator TEXT NOT NULL,
        accepted INTEGER NOT NULL DEFAULT 0,
        rejection_reason TEXT,
        coherence REAL NOT NULL DEFAULT 0,
        toxicity REAL NOT NULL DEFAULT 0,
        repetition REAL NOT NULL DEFAULT 0,
        unknown_ratio REAL NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS emotion_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        emotion TEXT NOT NULL,
        reason TEXT,
        created_at TEXT NOT NULL
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
      CREATE INDEX IF NOT EXISTS idx_generated_phrases_created
        ON generated_phrases(created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_conversation_key_created
        ON conversation_messages(conversation_key, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_memories_subject
        ON memories(subject_source, subject_id, updated_at DESC);
      CREATE INDEX IF NOT EXISTS idx_memories_expiry
        ON memories(expires_at, deleted_at);
      CREATE INDEX IF NOT EXISTS idx_generation_attempts_created
        ON generation_attempts(created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_emotion_history_created
        ON emotion_history(created_at DESC);
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

  hasRecentlyGeneratedPhrase(phrase, limit = 50) {
    const normalized = normalizeGeneratedPhrase(phrase);
    if (!normalized) return false;
    return Boolean(this.db.prepare(`
      SELECT 1
      FROM (
        SELECT phrase FROM generated_phrases ORDER BY created_at DESC LIMIT ?
      )
      WHERE phrase = ?
    `).get(limit, normalized));
  }

  rememberGeneratedPhrase(phrase) {
    const normalized = normalizeGeneratedPhrase(phrase);
    if (!normalized) return;
    this.db.prepare(`
      INSERT INTO generated_phrases(phrase, created_at)
      VALUES (?, ?)
      ON CONFLICT(phrase) DO UPDATE SET created_at = excluded.created_at
    `).run(normalized, new Date().toISOString());
    this.db.exec(`
      DELETE FROM generated_phrases
      WHERE phrase NOT IN (
        SELECT phrase FROM generated_phrases ORDER BY created_at DESC LIMIT 100
      )
    `);
  }

  getRecentActivity(minutes = 10) {
    const since = new Date(Date.now() - minutes * 60_000).toISOString();
    return Number(this.db.prepare(
      'SELECT COUNT(*) AS count FROM learned_messages WHERE created_at >= ?'
    ).get(since).count);
  }

  addConversationMessage({ conversationKey, source, authorId = null, authorName = null, role = 'user', content, maxMessages = 1500 }) {
    const clean = String(content || '').replace(/\s+/g, ' ').trim().slice(0, 500);
    if (!conversationKey || !clean) return;
    this.db.prepare(`INSERT INTO conversation_messages
      (conversation_key,source,author_id,author_name,role,content,created_at)
      VALUES(?,?,?,?,?,?,?)`).run(String(conversationKey), String(source), authorId == null ? null : String(authorId), authorName == null ? null : String(authorName), role, clean, new Date().toISOString());
    this.db.prepare(`DELETE FROM conversation_messages WHERE id NOT IN
      (SELECT id FROM conversation_messages ORDER BY id DESC LIMIT ?)`).run(maxMessages);
  }

  getConversationContext(conversationKey, limit = 8) {
    return this.db.prepare(`SELECT id,source,author_id,author_name,role,content,created_at
      FROM conversation_messages WHERE conversation_key=? ORDER BY id DESC LIMIT ?`).all(String(conversationKey), limit).reverse();
  }

  upsertMemory(memory) {
    const now = new Date().toISOString();
    const existing = this.db.prepare(`SELECT id FROM memories
      WHERE subject_source=? AND subject_id=? AND kind=? AND fact_key=? AND deleted_at IS NULL
      ORDER BY updated_at DESC LIMIT 1`).get(memory.subjectSource, memory.subjectId, memory.kind, memory.factKey);
    if (existing) {
      this.db.prepare(`UPDATE memories SET deleted_at=?,updated_at=? WHERE id=?`).run(now, now, existing.id);
    }
    const result = this.db.prepare(`INSERT INTO memories
      (subject_source,subject_id,subject_name,kind,fact_key,fact_value,confidence,source_type,source_ref,created_at,updated_at,expires_at,corrected_from)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      memory.subjectSource, memory.subjectId, memory.subjectName || null, memory.kind,
      memory.factKey, memory.factValue, memory.confidence, memory.sourceType,
      memory.sourceRef || null, now, now, memory.expiresAt, existing?.id || null
    );
    return Number(result.lastInsertRowid);
  }

  getMemories({ subjectSource = null, subjectId = null, limit = 100, includeDeleted = false } = {}) {
    const clauses = ['expires_at > ?'];
    const args = [new Date().toISOString()];
    if (!includeDeleted) clauses.push('deleted_at IS NULL');
    if (subjectSource) { clauses.push('subject_source=?'); args.push(String(subjectSource)); }
    if (subjectId) { clauses.push('subject_id=?'); args.push(String(subjectId)); }
    args.push(limit);
    return this.db.prepare(`SELECT * FROM memories WHERE ${clauses.join(' AND ')} ORDER BY updated_at DESC LIMIT ?`).all(...args);
  }

  correctMemory(id, { factValue, confidence, expiresAt, sourceType = 'admin_correction', sourceRef = null }) {
    const existing = this.db.prepare('SELECT * FROM memories WHERE id=? AND deleted_at IS NULL').get(Number(id));
    if (!existing) return null;
    return this.upsertMemory({
      subjectSource: existing.subject_source, subjectId: existing.subject_id,
      subjectName: existing.subject_name, kind: existing.kind, factKey: existing.fact_key,
      factValue, confidence, expiresAt, sourceType, sourceRef
    });
  }

  deleteMemory(id, subject = null) {
    const now = new Date().toISOString();
    const result = subject
      ? this.db.prepare(`UPDATE memories SET deleted_at=?,updated_at=? WHERE id=? AND subject_source=? AND subject_id=? AND deleted_at IS NULL`).run(now, now, Number(id), subject.source, String(subject.id))
      : this.db.prepare(`UPDATE memories SET deleted_at=?,updated_at=? WHERE id=? AND deleted_at IS NULL`).run(now, now, Number(id));
    return Number(result.changes) > 0;
  }

  forgetUser(source, subjectId) {
    const now = new Date().toISOString();
    const memoryChanges = this.db.prepare(`UPDATE memories SET deleted_at=?,updated_at=?
      WHERE subject_source=? AND subject_id=? AND deleted_at IS NULL`).run(now, now, String(source), String(subjectId)).changes;
    this.db.prepare(`DELETE FROM conversation_messages WHERE source=? AND author_id=?`).run(String(source), String(subjectId));
    return Number(memoryChanges);
  }

  rememberGenerationAttempt({ phrase = null, generator = 'local', accepted = false, rejectionReason = null, coherence = 0, toxicity = 0, repetition = 0, unknownRatio = 0 }) {
    this.db.prepare(`INSERT INTO generation_attempts
      (phrase,generator,accepted,rejection_reason,coherence,toxicity,repetition,unknown_ratio,created_at)
      VALUES(?,?,?,?,?,?,?,?,?)`).run(phrase, generator, accepted ? 1 : 0, rejectionReason, coherence, toxicity, repetition, unknownRatio, new Date().toISOString());
  }

  getGenerationAttempts(limit = 100) {
    return this.db.prepare(`SELECT id,phrase,generator,accepted,rejection_reason,coherence,toxicity,repetition,unknown_ratio,created_at
      FROM generation_attempts ORDER BY id DESC LIMIT ?`).all(limit);
  }

  getRecentGeneratedPhrases(limit = 100) {
    return this.db.prepare(`SELECT phrase,created_at FROM generated_phrases ORDER BY created_at DESC LIMIT ?`).all(limit);
  }

  recordEmotion(emotion, reason = null) {
    this.db.prepare('INSERT INTO emotion_history(emotion,reason,created_at) VALUES(?,?,?)').run(emotion, reason, new Date().toISOString());
  }

  getEmotionHistory(limit = 50) {
    return this.db.prepare('SELECT emotion,reason,created_at FROM emotion_history ORDER BY id DESC LIMIT ?').all(limit);
  }

  cleanup(config = {}) {
    const now = new Date().toISOString();
    this.db.prepare('DELETE FROM memories WHERE expires_at <= ? OR deleted_at IS NOT NULL').run(now);
    this.db.prepare(`DELETE FROM conversation_messages WHERE id NOT IN
      (SELECT id FROM conversation_messages ORDER BY id DESC LIMIT ?)`).run(config.maxConversationMessages || 1500);
    this.db.prepare(`DELETE FROM generation_attempts WHERE id NOT IN
      (SELECT id FROM generation_attempts ORDER BY id DESC LIMIT ?)`).run(config.maxGenerationAttempts || 1000);
    this.db.prepare(`DELETE FROM generated_phrases WHERE phrase NOT IN
      (SELECT phrase FROM generated_phrases ORDER BY created_at DESC LIMIT ?)`).run(config.maxGeneratedPhrases || 200);
    this.db.prepare(`DELETE FROM memories WHERE id NOT IN
      (SELECT id FROM memories ORDER BY updated_at DESC LIMIT ?)`).run(config.maxMemories || 2000);
    this.db.exec(`DELETE FROM emotion_history WHERE id NOT IN (SELECT id FROM emotion_history ORDER BY id DESC LIMIT 500);`);
    const size = (() => { try { return fs.statSync(this.filename).size; } catch (_) { return 0; } })();
    if (size > (config.maxDatabaseBytes || 25 * 1024 * 1024)) {
      this.db.exec(`DELETE FROM learned_messages WHERE id NOT IN (SELECT id FROM learned_messages ORDER BY id DESC LIMIT 1000);
        DELETE FROM learned_sequences WHERE sequence NOT IN (SELECT sequence FROM learned_sequences ORDER BY last_seen DESC LIMIT 3000);
        PRAGMA wal_checkpoint(TRUNCATE); VACUUM;`);
    }
    return { sizeBytes: size, memories: Number(this.db.prepare('SELECT COUNT(*) count FROM memories').get().count) };
  }

  getAdminSnapshot() {
    return {
      stats: this.getStats(), words: this.getWords({ limit: 100 }), topics: this.getTopics(50),
      memories: this.getMemories({ limit: 200 }), emotions: this.getEmotionHistory(50),
      generations: this.getGenerationAttempts(100),
      databaseSizeBytes: (() => { try { return fs.statSync(this.filename).size; } catch (_) { return 0; } })()
    };
  }

  exportState() {
    const tables = ['words','members','channels','topics','learned_messages','word_transitions','learned_sequences','generated_phrases','conversation_messages','memories','generation_attempts','emotion_history','state'];
    return { version: 2, exportedAt: new Date().toISOString(), tables: Object.fromEntries(tables.map(table => [table, this.db.prepare(`SELECT * FROM ${table}`).all()])) };
  }

  importState(payload) {
    if (!payload || Number(payload.version) !== 2 || !payload.tables) throw new Error('Unsupported Growing Child state export.');
    const allowed = {
      words:['word','times_seen','first_seen','last_seen','learned_at_level'], members:['source','member_id','name','times_seen','first_seen','last_seen'],
      channels:['source','channel_id','name','times_seen','first_seen','last_seen'], topics:['topic','times_seen','first_seen','last_seen'],
      learned_messages:['source','author_name','channel_name','learned_words','created_at'],
      word_transitions:['previous_word','current_word','next_word','times_seen','last_seen'],
      learned_sequences:['sequence','times_seen','last_seen'], generated_phrases:['phrase','created_at'],
      conversation_messages:['conversation_key','source','author_id','author_name','role','content','created_at'],
      memories:['subject_source','subject_id','subject_name','kind','fact_key','fact_value','confidence','source_type','source_ref','created_at','updated_at','expires_at','deleted_at'],
      generation_attempts:['phrase','generator','accepted','rejection_reason','coherence','toxicity','repetition','unknown_ratio','created_at'],
      emotion_history:['emotion','reason','created_at'],
      state:['key','value']
    };
    for (const row of payload.tables.memories || []) {
      if (containsSensitiveData(row.fact_value)) throw new Error('Import contains prohibited sensitive memory data.');
    }
    for (const row of payload.tables.conversation_messages || []) {
      if (containsSensitiveData(row.content)) throw new Error('Import contains prohibited sensitive conversation data.');
    }
    this.db.exec('BEGIN IMMEDIATE');
    try {
      for (const [table, columns] of Object.entries(allowed)) {
        const rows = Array.isArray(payload.tables[table]) ? payload.tables[table] : [];
        const statement = this.db.prepare(`INSERT OR IGNORE INTO ${table}(${columns.join(',')}) VALUES(${columns.map(() => '?').join(',')})`);
        const hasNaturalPrimaryKey = ['words','members','channels','topics','word_transitions','learned_sequences','generated_phrases','state'].includes(table);
        const duplicate = hasNaturalPrimaryKey ? null : this.db.prepare(`SELECT 1 FROM ${table} WHERE ${columns.map(column => `${column} IS ?`).join(' AND ')} LIMIT 1`);
        for (const row of rows) {
          const values = columns.map(column => row[column] ?? null);
          if (!duplicate?.get(...values)) statement.run(...values);
        }
      }
      this.db.exec('COMMIT');
    } catch (err) { this.db.exec('ROLLBACK'); throw err; }
    return this.getStats();
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
      DELETE FROM generated_phrases;
      DELETE FROM conversation_messages;
      DELETE FROM memories;
      DELETE FROM generation_attempts;
      DELETE FROM emotion_history;
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
