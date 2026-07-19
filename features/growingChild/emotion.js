'use strict';

const EMOTIONS = ['happy', 'curious', 'confused', 'sleepy'];

class EmotionSystem {
  constructor(database) {
    this.database = database;
  }

  update({ newWords = 0, addressed = false } = {}) {
    const activity = this.database.getRecentActivity(10);
    let emotion;
    if (addressed) emotion = 'curious';
    else if (newWords >= 4) emotion = 'happy';
    else if (activity === 0) emotion = 'sleepy';
    else if (activity >= 20) emotion = 'confused';
    else emotion = EMOTIONS[Math.floor(Math.random() * EMOTIONS.length)];
    this.database.setState('emotion', emotion);
    this.database.recordEmotion(emotion, addressed ? 'addressed' : newWords >= 4 ? 'new_words' : 'activity');
    return emotion;
  }

  get() {
    return this.database.getState('emotion', 'curious');
  }
}

module.exports = { EmotionSystem };
