'use strict';

const { loadConfig } = require('./config');
const { GrowingChildDatabase } = require('./database');
const { LearningSystem } = require('./learning');
const { EmotionSystem } = require('./emotion');
const { MessageGenerator } = require('./generator');
const { GrowingChildScheduler } = require('./scheduler');
const { sanitizePublicPhrase } = require('./safety');
const { containsSensitiveData, extractMemories, parseForgetRequest } = require('./memory');
const { evaluateGeneration } = require('./quality');
const {
  GRAMMAR_WORDS,
  extractCandidatePhrases,
  sharesLongContiguousRun,
  validateAIGeneratedPhrase
} = require('./ai_generation');

function randomSample(items, count) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, count);
}

class GrowingChildAI {
  constructor({
    sendOwnerDM,
    sendChannelMessage,
    sendMinecraftMessage,
    generateWithAI,
    allowedDiscordChannelId,
    isExternalAIEnabled = () => true,
    onStateChanged = null,
    config = null
  }) {
    this.config = config || loadConfig();
    this.database = new GrowingChildDatabase(this.config.databasePath);
    this.learning = new LearningSystem(this.database, this.config);
    this.emotions = new EmotionSystem(this.database);
    this.generator = new MessageGenerator(this.database, this.emotions);
    this.sendOwnerDM = sendOwnerDM;
    this.sendChannelMessage = sendChannelMessage;
    this.sendMinecraftMessage = sendMinecraftMessage;
    this.generateWithAI = generateWithAI;
    this.isExternalAIEnabled = isExternalAIEnabled;
    this.onStateChanged = onStateChanged;
    this.allowedDiscordChannelId = allowedDiscordChannelId
      ? String(allowedDiscordChannelId)
      : null;
    this.lastReactiveSpeechAt = 0;
    this.pendingReactiveTimer = null;
    this.cleanupTimer = null;
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
    this.runCleanup();
    if (this.cleanupTimer) clearInterval(this.cleanupTimer);
    this.cleanupTimer = setInterval(() => {
      this.runCleanup();
    }, this.config.cleanupIntervalHours * 3_600_000);
    this.cleanupTimer.unref?.();
    this.notifyStateChanged();
  }

  notifyStateChanged() {
    try { this.onStateChanged?.(this.getAdminSnapshot()); } catch (err) { console.error('[GrowingChild] State callback failed:', err.message); }
  }

  runCleanup() {
    try {
      this.database.cleanup(this.config);
      this.notifyStateChanged();
    } catch (err) {
      console.error('[GrowingChild] Automatic cleanup failed:', err.message);
    }
  }

  conversationKey(context) {
    return `${context.source}:${context.channelId || context.authorId || 'global'}`;
  }

  learn(context) {
    try {
      const allowedSource =
        context.source === 'minecraft' ||
        context.source === 'owner_dm' ||
        (
          context.source === 'discord' &&
          this.allowedDiscordChannelId &&
          String(context.channelId) === this.allowedDiscordChannelId
        );
      if (!allowedSource) return null;

      const forget = parseForgetRequest(context.text);
      if (forget?.type === 'user') {
        const deleted = this.database.forgetUser(context.source, context.authorId);
        this.notifyStateChanged();
        return { forgotten: true, deleted };
      }
      if (forget?.type === 'fact') {
        const deleted = this.database.deleteMemory(forget.id, { source: context.source, id: context.authorId });
        this.notifyStateChanged();
        return { forgotten: deleted, factId: forget.id };
      }
      if (containsSensitiveData(context.text)) return { blocked: 'sensitive_data' };

      const conversationKey = this.conversationKey(context);
      this.database.addConversationMessage({
        conversationKey, source: context.source, authorId: context.authorId,
        authorName: context.authorName, role: 'user', content: context.text,
        maxMessages: this.config.maxConversationMessages
      });

      const result = this.learning.learnMessage(context);
      if (result) {
        for (const memory of extractMemories(context, this.config)) this.database.upsertMemory(memory);
        this.emotions.update({
          newWords: result.newWords,
          addressed: Boolean(context.addressed)
        });
        if (!context.trainingOnly) {
          this.scheduler.noteActivity();
          this.maybeReact(context);
        }
        this.notifyStateChanged();
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
    const conversationKey = this.conversationKey(context);
    const contextMessages = this.database.getConversationContext(conversationKey, this.config.conversationContextMessages);
    const memories = this.database.getMemories({ subjectSource: context.source, subjectId: context.authorId, limit: 12 });
    const contextWords = this.learning.tokenize(contextMessages.map(message => message.content).join(' '));

    this.pendingReactiveTimer = setTimeout(async () => {
      this.pendingReactiveTimer = null;
      this.lastReactiveSpeechAt = Date.now();
      try {
        await this.speak('reaction', contextWords, 'minecraft', { conversationKey, contextMessages, memories });
      } catch (err) {
        console.error('[GrowingChild] Reactive speech failed:', err.message);
      }
    }, delayMs);
    this.pendingReactiveTimer.unref?.();
  }

  async speak(reason = 'manual', contextWords = [], target = null, context = {}) {
    if (!this.enabled) return null;
    const generatedPhrase = await this.choosePhrase(reason, contextWords, context);
    if (!generatedPhrase) {
      console.log('[GrowingChild] Not enough learned language to form a new phrase.');
      return null;
    }
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
    this.database.rememberGeneratedPhrase(phrase);
    if (context.conversationKey) this.database.addConversationMessage({
      conversationKey: context.conversationKey, source: 'growing_child', role: 'assistant', content: phrase,
      maxMessages: this.config.maxConversationMessages
    });
    this.notifyStateChanged();
    return payload;
  }

  async choosePhrase(reason, contextWords, context = {}) {
    const aiCandidates = await this.generateAIPhrases(reason, contextWords, context);
    const localCandidates = this.generateLocalPhrases(reason, contextWords);
    const candidates = [
      ...aiCandidates.map(phrase => ({ phrase, generator: 'external_ai' })),
      ...localCandidates.map(phrase => ({ phrase, generator: 'local' }))
    ];

    for (const candidate of candidates) {
      if (!candidate.phrase) continue;
      const quality = evaluateGeneration({ phrase: candidate.phrase, database: this.database, config: this.config });
      if (this.database.hasRecentlyGeneratedPhrase(candidate.phrase)) {
        quality.accepted = false;
        if (!quality.reasons.includes('repetition')) quality.reasons.push('repetition');
      }
      this.database.rememberGenerationAttempt({ phrase: candidate.phrase, generator: candidate.generator,
        accepted: quality.accepted, rejectionReason: quality.reasons.join(',') || null, ...quality });
      if (quality.accepted) return candidate.phrase;
    }

    if (candidates.length > 0) {
      console.log('[GrowingChild] No new phrase available without repetition.');
    }
    this.notifyStateChanged();
    return null;
  }

  generateLocalPhrases(reason, contextWords) {
    const reply = reason === 'reaction';
    if (typeof this.generator.generateCandidates === 'function') {
      return this.generator.generateCandidates({
        reply,
        contextWords,
        attempts: 100,
        limit: 10
      });
    }
    const phrase = reply
      ? this.generator.generateReply(contextWords)
      : this.generator.generate();
    return phrase ? [phrase] : [];
  }

  isTooSimilarToLearnedText(words) {
    if (this.generator.isTooSimilarToChat(words)) return true;
    return this.database.getLearnedSequences(1000).some(row => {
      const learned = row.sequence.split(' ').filter(Boolean);
      return sharesLongContiguousRun(words, learned, 3);
    });
  }

  async generateAIPhrases(reason, contextWords, context = {}) {
    if (
      !this.config.aiGenerationEnabled ||
      typeof this.generateWithAI !== 'function' ||
      !this.isExternalAIEnabled()
    ) {
      return [];
    }

    const learnedWords = this.database
      .getWords({ limit: this.config.aiVocabularyLimit })
      .map(row => row.word)
      .filter(Boolean);
    if (learnedWords.length < 5) return [];

    const known = new Set(learnedWords);
    const grammar = new Set(GRAMMAR_WORDS);
    const contentVocabulary = learnedWords.filter(word => !grammar.has(word));
    if (contentVocabulary.length < this.config.aiWordsPerPhraseMin) return [];

    const isRequestedSpeech = reason === 'button' || reason === 'slash command';
    const minimumSelected = isRequestedSpeech ? 1 : this.config.aiWordsPerPhraseMin;
    const maximumSelected = isRequestedSpeech
      ? Math.min(2, this.config.aiWordsPerPhraseMax)
      : this.config.aiWordsPerPhraseMax;
    const selectedCount = Math.min(
      contentVocabulary.length,
      minimumSelected + Math.floor(Math.random() * (maximumSelected - minimumSelected + 1))
    );
    const knownContext = [...new Set(
      contextWords.filter(word => known.has(word) && !grammar.has(word))
    )];
    const selectedContext = randomSample(knownContext, Math.min(2, selectedCount));
    const remainingVocabulary = contentVocabulary.filter(word => !selectedContext.includes(word));
    const selectedWords = [
      ...selectedContext,
      ...randomSample(remainingVocabulary, selectedCount - selectedContext.length)
    ];

    try {
      const results = [];
      const seen = new Set();
      const attempts = isRequestedSpeech ? 3 : 2;
      for (let attempt = 1; attempt <= attempts; attempt++) {
        const attemptSelectedWords = attempt === 1
          ? selectedWords
          : randomSample(contentVocabulary, selectedCount);
        const response = await this.generateWithAI({
          reason,
          emotion: this.emotions.get(),
          contextWords: knownContext,
          selectedWords: attemptSelectedWords,
          learnedWords,
          grammarWords: GRAMMAR_WORDS,
          candidateCount: this.config.aiCandidateCount,
          contextMessages: context.contextMessages || [],
          memories: context.memories || []
        });
        for (const phrase of extractCandidatePhrases(response)) {
          const validated = validateAIGeneratedPhrase({
            phrase,
            learnedWords,
            requiredWords: attemptSelectedWords,
            minRequiredWords: Math.min(2, attemptSelectedWords.length),
            isTooSimilar: words =>
              this.isTooSimilarToLearnedText(words) ||
              this.database.hasRecentlyGeneratedPhrase(words.join(' '))
          });
          if (!validated) {
            this.database.rememberGenerationAttempt({ phrase, generator: 'external_ai', accepted: false, rejectionReason: 'validation_failed' });
            continue;
          }
          if (seen.has(validated.toLocaleLowerCase())) continue;
          seen.add(validated.toLocaleLowerCase());
          results.push(validated);
        }
        if (results.length >= 3) return results;
        console.log(`[GrowingChild] AI candidates accepted ${results.length}/${this.config.aiCandidateCount} (${attempt}/${attempts}).`);
      }
      return results;
    } catch (err) {
      console.error('[GrowingChild] AI generation failed, trying learned word chains:', err.message);
      return [];
    }
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

  getAllWords() {
    return this.database.getAllWords();
  }

  getAdminSnapshot() {
    return { ...this.database.getAdminSnapshot(), enabled: this.enabled, emotion: this.emotions.get() };
  }

  correctMemory(id, patch) {
    if (containsSensitiveData(patch?.factValue) || !String(patch?.factValue || '').trim()) throw new Error('Memory cannot contain secrets or personal data.');
    const result = this.database.correctMemory(id, { ...patch, factValue: String(patch.factValue).replace(/\s+/g, ' ').trim().slice(0, 120) });
    if (!result) throw new Error('Memory fact was not found or was already deleted.');
    this.notifyStateChanged(); return result;
  }
  deleteMemory(id) { const result = this.database.deleteMemory(id); if (!result) throw new Error('Memory fact was not found or was already deleted.'); this.notifyStateChanged(); return result; }
  forgetUser(source, id) { const result = this.database.forgetUser(source, id); this.notifyStateChanged(); return result; }
  exportState() { return this.database.exportState(); }
  importState(payload) { const result = this.database.importState(payload); this.database.cleanup(this.config); this.notifyStateChanged(); return result; }

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
    this.notifyStateChanged();
    return this.getStatus();
  }

  toggleEnabled() {
    return this.setEnabled(!this.enabled);
  }

  setMinecraftPublicSpeechEnabled(enabled) {
    this.config.minecraftPublicSpeechEnabled = Boolean(enabled);
    this.notifyStateChanged();
    return this.getStatus();
  }

  reset() {
    if (this.pendingReactiveTimer) clearTimeout(this.pendingReactiveTimer);
    this.pendingReactiveTimer = null;
    this.lastReactiveSpeechAt = 0;
    this.database.reset();
    this.database.setState('enabled', String(this.enabled));
    this.notifyStateChanged();
    return this.getStatus();
  }

  stop() {
    this.scheduler.stop();
    if (this.pendingReactiveTimer) clearTimeout(this.pendingReactiveTimer);
    if (this.cleanupTimer) clearInterval(this.cleanupTimer);
    this.database.close();
  }
}

module.exports = { GrowingChildAI };
