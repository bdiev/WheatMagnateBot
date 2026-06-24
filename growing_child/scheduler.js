'use strict';

class GrowingChildScheduler {
  constructor(config, database, onSpeech) {
    this.config = config;
    this.database = database;
    this.onSpeech = onSpeech;
    this.randomTimer = null;
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
    const min = this.config.randomSpeechMinMinutes;
    const max = this.config.randomSpeechMaxMinutes;
    const minutes = min + Math.random() * (max - min);
    this.randomTimer = setTimeout(async () => {
      try {
        await this.onSpeech('random');
      } catch (err) {
        console.error('[GrowingChild] Random speech failed:', err.message);
      } finally {
        this.scheduleRandom();
      }
    }, minutes * 60_000);
    this.randomTimer.unref?.();
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
    if (this.dailyTimer) clearInterval(this.dailyTimer);
    this.randomTimer = null;
    this.dailyTimer = null;
  }
}

module.exports = { GrowingChildScheduler };
