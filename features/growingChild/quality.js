'use strict';

const { GRAMMAR_WORDS, tokenizePhrase, sharesLongContiguousRun } = require('./ai_generation');

const TOXIC_WORDS = new Set(['idiot','stupid','moron','hate','kill','kys','retard','trash','loser','dumb']);

function overlap(first, second) {
  const a = new Set(first); const b = new Set(second);
  if (!a.size || !b.size) return 0;
  let shared = 0;
  for (const word of a) if (b.has(word)) shared++;
  return shared / (a.size + b.size - shared);
}

function maximumContentRun(words, grammar) {
  let current = 0;
  let maximum = 0;
  for (const word of words) {
    current = grammar.has(word) ? 0 : current + 1;
    maximum = Math.max(maximum, current);
  }
  return maximum;
}

function evaluateGeneration({ phrase, database, config, contextWords = [], reason = null }) {
  const words = tokenizePhrase(phrase);
  const known = new Set(database.getAllWords().map(row => String(row.word).toLowerCase()));
  const grammar = new Set(GRAMMAR_WORDS);
  const unknown = words.filter(word => !known.has(word) && !grammar.has(word));
  const unknownRatio = words.length ? unknown.length / words.length : 1;
  const toxicity = words.length ? words.filter(word => TOXIC_WORDS.has(word)).length / words.length : 0;
  const grammarCount = words.filter(word => grammar.has(word)).length;
  const grammarRatio = words.length ? grammarCount / words.length : 0;
  const contentRun = maximumContentRun(words, grammar);
  const hasSentencePunctuation = /[.?!]\s*$/u.test(String(phrase || ''));
  const startsStructurally = words.length > 0 && grammar.has(words[0]);
  let coherence =
    (words.length >= 3 && words.length <= 12 ? 0.2 : 0) +
    (grammarRatio >= 0.2 && grammarRatio <= 0.85 ? 0.35 : grammarRatio > 0.85 ? 0.2 : 0) +
    (startsStructurally ? 0.15 : 0) +
    (contentRun <= 2 ? 0.2 : contentRun === 3 ? 0.08 : 0) +
    (hasSentencePunctuation ? 0.1 : 0);

  const contextContent = new Set(
    tokenizePhrase(contextWords.join(' ')).filter(word => !grammar.has(word))
  );
  const responseContent = new Set(words.filter(word => !grammar.has(word)));
  const isReaction = reason === 'reaction' && contextContent.size > 0;
  const onTopic = !isReaction || [...responseContent].some(word => contextContent.has(word));
  if (!onTopic) coherence -= 0.3;
  coherence = Math.max(0, Math.min(1, coherence));

  let repetition = 0;
  for (const row of database.getRecentGeneratedPhrases(100)) {
    const previous = tokenizePhrase(row.phrase);
    const currentContent = words.filter(word => !grammar.has(word));
    const previousContent = previous.filter(word => !grammar.has(word));
    const sharedContent = new Set(currentContent.filter(word => previousContent.includes(word))).size;
    const contentUnion = new Set([...currentContent, ...previousContent]).size;
    repetition = Math.max(repetition, sharedContent / Math.max(3, contentUnion));
    if (sharesLongContiguousRun(words, previous, 3)) repetition = Math.max(repetition, 0.9);
  }
  const reasons = [];
  if (coherence < config.qualityMinimumCoherence) reasons.push('low_coherence');
  if (toxicity > config.qualityMaximumToxicity) reasons.push('toxicity');
  if (repetition >= config.qualityMaximumRepetition) reasons.push('repetition');
  if (unknownRatio > config.qualityMaximumUnknownRatio) reasons.push('unknown_words');
  if (!onTopic) reasons.push('off_topic');
  return {
    accepted: reasons.length === 0,
    reasons,
    coherence: Number(coherence.toFixed(3)), toxicity: Number(toxicity.toFixed(3)),
    repetition: Number(repetition.toFixed(3)), unknownRatio: Number(unknownRatio.toFixed(3))
  };
}

module.exports = { evaluateGeneration, overlap };
