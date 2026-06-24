'use strict';

const URL_RE = /(?:https?:\/\/\S+|www\.\S+)/giu;
const CUSTOM_EMOJI_RE = /<a?:[A-Za-z0-9_]+:\d+>/g;
const MENTION_RE = /<[@#&]!?(\d+)>/g;
const EMOJI_RE = /\p{Extended_Pictographic}/gu;
const WORD_RE = /[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu;
const TOPIC_STOP_WORDS = new Set([
  'the', 'and', 'for', 'that', 'this', 'with', 'you', 'your', 'are', 'was', 'have',
  'как', 'что', 'это', 'для', 'его', 'она', 'они', 'тут', 'там', 'или', 'уже',
  'меня', 'тебя', 'мне', 'тебе', 'когда', 'если', 'еще', 'ещё'
]);

class LearningSystem {
  constructor(database, config) {
    this.database = database;
    this.config = config;
  }

  tokenize(text) {
    const cleaned = String(text || '')
      .replace(URL_RE, ' ')
      .replace(CUSTOM_EMOJI_RE, ' ')
      .replace(MENTION_RE, ' ')
      .replace(EMOJI_RE, ' ')
      .toLocaleLowerCase();
    return (cleaned.match(WORD_RE) || []).filter(word =>
      word.length >= this.config.minimumWordLength &&
      !/\d/u.test(word)
    );
  }

  learnMessage(context) {
    if (!this.config.enabled) return null;
    const authorId = String(context.authorId || '').toLowerCase();
    const authorName = String(context.authorName || '').toLowerCase();
    if (this.config.ignoredUsers.has(authorId) || this.config.ignoredUsers.has(authorName)) return null;
    if (context.channelId && this.config.ignoredChannels.has(String(context.channelId))) return null;

    const words = this.tokenize(context.text);
    if (words.length === 0) return null;

    const frequencies = new Map();
    for (const word of words) frequencies.set(word, (frequencies.get(word) || 0) + 1);
    const topics = new Map(
      [...frequencies].filter(([word]) => !TOPIC_STOP_WORDS.has(word) && word.length >= 4)
    );
    const current = this.database.getStats();
    const unknown = [...frequencies.keys()].filter(word =>
      !this.database.db.prepare('SELECT 1 FROM words WHERE word = ?').get(word)
    ).length;
    const xp = this.config.xpPerMessage + unknown * this.config.xpPerLearnedWord;

    return this.database.learn({
      frequencies,
      topics,
      source: context.source,
      authorId: context.authorId,
      authorName: context.authorName,
      channelId: context.channelId,
      channelName: context.channelName,
      xp,
      maxMessages: this.config.maxLearnedMessages
    });
  }
}

module.exports = { LearningSystem };
