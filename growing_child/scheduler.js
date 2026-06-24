'use strict';

class GrowingChildScheduler {
  constructor(config, database, onSpeech) {
    this.config = config;
    this.database = database;
    this.onSpeech = onSpeech;
    this.randomTimer = null;
    this.activityTimer = null;
    this.messagesObserved = 0;
    this.messageTarget = this.createMessageTarget();
    this.dailyTimer = null;
  }

  start() {
    this.stop();
    if (this.config.randomSpeechEnabled) this.scheduleRandom();
    if (this.config.dailySpeechEnabled) {
      this.dailyTimer = setInterval(() => this.checkDaily(), 60_000);
      this.checkDaily();
    }
  }

  scheduleRandom() {
    if (this.randomTimer) clearTimeout(this.randomTimer);
    const min = this.config.randomSpeechMinMinutes;
    const max = this.config.randomSpeechMaxMinutes;
    const minutes = min + Math.random() * (max - min);
    this.randomTimer = setTimeout(async () => {
      await this.tryRandomSpeech('random');
    }, minutes * 60_000);
    this.randomTimer.unref?.();
  }

  createMessageTarget() {
    const min = this.config.messagesPerSpeechMin;
    const max = this.config.messagesPerSpeechMax;
    return Math.floor(min + Math.random() * (max - min + 1));
  }

  noteActivity() {
    if (!this.config.randomSpeechEnabled || this.activityTimer) return;
    this.messagesObserved++;
    if (this.messagesObserved < this.messageTarget) return;

    const min = this.config.activitySpeechDelayMinSeconds;
    const max = this.config.activitySpeechDelayMaxSeconds;
    const delayMs = (min + Math.random() * (max - min)) * 1000;
    this.activityTimer = setTimeout(async () => {
      this.activityTimer = null;
      await this.tryRandomSpeech('activity');
    }, delayMs);
    this.activityTimer.unref?.();
  }

  async tryRandomSpeech(reason) {
    if (this.randomTimer) {
      clearTimeout(this.randomTimer);
      this.randomTimer = null;
    }
    try {
      const lastSpeechAt = Number(this.database.getState('last_random_speech_at', '0'));
      const cooldownMs = this.config.randomSpeechCooldownMinutes * 60_000;
      const remainingCooldown = cooldownMs - (Date.now() - lastSpeechAt);
      if (remainingCooldown > 0) {
        this.activityTimer = setTimeout(async () => {
          this.activityTimer = null;
          await this.tryRandomSpeech(reason);
        }, remainingCooldown);
        this.activityTimer.unref?.();
        return;
      }

      const sent = await this.onSpeech(reason);
      if (sent) {
        this.database.setState('last_random_speech_at', String(Date.now()));
        this.messagesObserved = 0;
        this.messageTarget = this.createMessageTarget();
      }
    } catch (err) {
      console.error('[GrowingChild] Random speech failed:', err.message);
    } finally {
      this.scheduleRandom();
    }
  }

  async checkDaily() {
    const [hour, minute] = String(this.config.dailyMessageTime).split(':').map(Number);
    const now = new Date();
    const dateKey = [
      now.getFullYear(),
      String(now.getMonth() + 1).padStart(2, '0'),
      String(now.getDate()).padStart(2, '0')
    ].join('-');
    if (now.getHours() !== hour || now.getMinutes() !== minute) return;
    if (this.database.getState('last_daily_date') === dateKey) return;
    this.database.setState('last_daily_date', dateKey);
    try {
      await this.onSpeech('daily');
    } catch (err) {
      console.error('[GrowingChild] Daily speech failed:', err.message);
    }
  }

  stop() {
    if (this.randomTimer) clearTimeout(this.randomTimer);
    if (this.activityTimer) clearTimeout(this.activityTimer);
    if (this.dailyTimer) clearInterval(this.dailyTimer);
    this.randomTimer = null;
    this.activityTimer = null;
    this.dailyTimer = null;
  }
}

module.exports = { GrowingChildScheduler };
