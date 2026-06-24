'use strict';

const { loadConfig } = require('./config');
const { GrowingChildDatabase } = require('./database');
const { LearningSystem } = require('./learning');
const { EmotionSystem } = require('./emotion');
const { MessageGenerator } = require('./generator');
const { GrowingChildScheduler } = require('./scheduler');
const { sanitizePublicPhrase } = require('./safety');

class GrowingChildAI {
  constructor({ sendOwnerDM, sendChannelMessage, sendMinecraftMessage, allowedDiscordChannelId }) {
    this.config = loadConfig();
    this.database = new GrowingChildDatabase(this.config.databasePath);
    this.learning = new LearningSystem(this.database, this.config);
    this.emotions = new EmotionSystem(this.database);
    this.generator = new MessageGenerator(this.database, this.emotions);
    this.sendOwnerDM = sendOwnerDM;
    this.sendChannelMessage = sendChannelMessage;
    this.sendMinecraftMessage = sendMinecraftMessage;
    this.allowedDiscordChannelId = allowedDiscordChannelId
      ? String(allowedDiscordChannelId)
      : null;
    this.lastReactiveSpeechAt = 0;
    this.pendingReactiveTimer = null;
    const savedEnabled = this.database.getState('enabled');
    this.enabled = savedEnabled == null
      ? Boolean(this.config.enabled)
      : savedEnabled === 'true';
    this.config.enabled = this.enabled;
    this.scheduler = new GrowingChildScheduler(
      this.config,
      this.database,
      reason => this.speak(reason)
    );
  }

  start() {
    if (this.enabled) this.scheduler.start();
  }

  learn(context) {
    try {
      const allowedSource =
        context.source === 'minecraft' ||
        (
          context.source === 'discord' &&
          this.allowedDiscordChannelId &&
          String(context.channelId) === this.allowedDiscordChannelId
        );
      if (!allowedSource) return null;

      const result = this.learning.learnMessage(context);
      if (result) {
        this.emotions.update({
          newWords: result.newWords,
          addressed: Boolean(context.addressed)
        });
        this.scheduler.noteActivity();
        this.maybeReact(context);
      }
      return result;
    } catch (err) {
      console.error('[GrowingChild] Learning failed:', err.message);
      return null;
    }
  }

  maybeReact(context) {
    if (!this.config.reactiveSpeechEnabled || this.pendingReactiveTimer) return;
    if (context.source !== 'minecraft' || !context.addressed) return;
    const cooldownMs = this.config.reactiveCooldownMinutes * 60_000;
    if (Date.now() - this.lastReactiveSpeechAt < cooldownMs) return;

    const chance = context.addressed
      ? this.config.addressedSpeechChance
      : this.config.reactiveSpeechChance;
    if (Math.random() >= chance) return;

    const min = this.config.reactiveDelayMinSeconds;
    const max = this.config.reactiveDelayMaxSeconds;
    const delayMs = (min + Math.random() * (max - min)) * 1000;
    const contextWords = this.learning.tokenize(context.text);

    this.pendingReactiveTimer = setTimeout(async () => {
      this.pendingReactiveTimer = null;
      this.lastReactiveSpeechAt = Date.now();
      try {
        await this.speak('reaction', contextWords, 'minecraft');
      } catch (err) {
        console.error('[GrowingChild] Reactive speech failed:', err.message);
      }
    }, delayMs);
    this.pendingReactiveTimer.unref?.();
  }

  async speak(reason = 'manual', contextWords = [], target = null) {
    if (!this.enabled) return null;
    const generatedPhrase = reason === 'reaction'
      ? this.generator.generateReply(contextWords)
      : this.generator.generate();
    const publicTarget =
      target === 'minecraft' ||
      reason === 'random' ||
      reason === 'activity' ||
      reason === 'slash command' ||
      reason === 'button';
    const phrase = publicTarget ? sanitizePublicPhrase(generatedPhrase) : generatedPhrase;
    if (!phrase) {
      console.log('[GrowingChild] Blocked unsafe public phrase.');
      return null;
    }
    const stats = this.database.getStats();
    const payload = {
      phrase,
      reason,
      emotion: this.emotions.get(),
      ...stats
    };

    if (
      publicTarget &&
      this.config.minecraftPublicSpeechEnabled &&
      typeof this.sendMinecraftMessage === 'function'
    ) {
      const sent = await this.sendMinecraftMessage(payload);
      if (!sent) return null;
    } else if (
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
      enabled: this.enabled,
      ...this.database.getStats(),
      emotion: this.emotions.get(),
      topWords: this.database.getWords({ limit: 10 }),
      topTopics: this.database.getTopics(5)
    };
  }

  setEnabled(enabled) {
    this.enabled = Boolean(enabled);
    this.config.enabled = this.enabled;
    this.database.setState('enabled', String(this.enabled));
    if (this.enabled) {
      this.scheduler.start();
    } else {
      this.scheduler.stop();
      if (this.pendingReactiveTimer) clearTimeout(this.pendingReactiveTimer);
      this.pendingReactiveTimer = null;
    }
    return this.getStatus();
  }

  toggleEnabled() {
    return this.setEnabled(!this.enabled);
  }

  reset() {
    if (this.pendingReactiveTimer) clearTimeout(this.pendingReactiveTimer);
    this.pendingReactiveTimer = null;
    this.lastReactiveSpeechAt = 0;
    this.database.reset();
    this.database.setState('enabled', String(this.enabled));
    return this.getStatus();
  }

  stop() {
    this.scheduler.stop();
    if (this.pendingReactiveTimer) clearTimeout(this.pendingReactiveTimer);
    this.database.close();
  }
}

module.exports = { GrowingChildAI };
