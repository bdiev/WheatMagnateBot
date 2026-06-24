'use strict';

const { loadConfig } = require('./config');
const { GrowingChildDatabase } = require('./database');
const { LearningSystem } = require('./learning');
const { EmotionSystem } = require('./emotion');
const { MessageGenerator } = require('./generator');
const { GrowingChildScheduler } = require('./scheduler');

class GrowingChildAI {
  constructor({ sendOwnerDM, sendChannelMessage }) {
    this.config = loadConfig();
    this.database = new GrowingChildDatabase(this.config.databasePath);
    this.learning = new LearningSystem(this.database, this.config);
    this.emotions = new EmotionSystem(this.database);
    this.generator = new MessageGenerator(this.database, this.emotions);
    this.sendOwnerDM = sendOwnerDM;
    this.sendChannelMessage = sendChannelMessage;
    this.scheduler = new GrowingChildScheduler(
      this.config,
      this.database,
      reason => this.speak(reason)
    );
  }

  start() {
    if (this.config.enabled) this.scheduler.start();
  }

  learn(context) {
    try {
      const result = this.learning.learnMessage(context);
      if (result) {
        this.emotions.update({
          newWords: result.newWords,
          addressed: Boolean(context.addressed)
        });
      }
      return result;
    } catch (err) {
      console.error('[GrowingChild] Learning failed:', err.message);
      return null;
    }
  }

  async speak(reason = 'manual') {
    const phrase = this.generator.generate();
    const stats = this.database.getStats();
    const payload = {
      phrase,
      reason,
      emotion: this.emotions.get(),
      ...stats
    };

    if (
      !this.config.ownerDmOnly &&
      this.config.dailyMessageChannelId &&
      typeof this.sendChannelMessage === 'function'
    ) {
      await this.sendChannelMessage(this.config.dailyMessageChannelId, payload);
    } else {
      await this.sendOwnerDM(payload);
    }
    return payload;
  }

  getStatus() {
    return {
      ...this.database.getStats(),
      emotion: this.emotions.get(),
      topWords: this.database.getWords({ limit: 10 }),
      topTopics: this.database.getTopics(5)
    };
  }

  reset() {
    this.database.reset();
    return this.getStatus();
  }

  stop() {
    this.scheduler.stop();
    this.database.close();
  }
}

module.exports = { GrowingChildAI };
