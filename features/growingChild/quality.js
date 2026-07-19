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

function evaluateGeneration({ phrase, database, config }) {
  const words = tokenizePhrase(phrase);
  const known = new Set(database.getAllWords().map(row => String(row.word).toLowerCase()));
  const grammar = new Set(GRAMMAR_WORDS);
  const unknown = words.filter(word => !known.has(word) && !grammar.has(word));
  const unknownRatio = words.length ? unknown.length / words.length : 1;
  const toxicity = words.length ? words.filter(word => TOXIC_WORDS.has(word)).length / words.length : 0;
  const contentCount = words.filter(word => !grammar.has(word)).length;
  const uniqueRatio = words.length ? new Set(words).size / words.length : 0;
  const coherence = Math.max(0, Math.min(1,
    (words.length >= 3 && words.length <= 12 ? 0.35 : 0) +
    Math.min(0.35, contentCount * 0.08) + uniqueRatio * 0.3
  ));
  let repetition = 0;
  for (const row of database.getRecentGeneratedPhrases(100)) {
    const previous = tokenizePhrase(row.phrase);
    repetition = Math.max(repetition, overlap(words, previous));
    if (sharesLongContiguousRun(words, previous, 3)) repetition = Math.max(repetition, 0.9);
  }
  const reasons = [];
  if (coherence < config.qualityMinimumCoherence) reasons.push('low_coherence');
  if (toxicity > config.qualityMaximumToxicity) reasons.push('toxicity');
  if (repetition >= config.qualityMaximumRepetition) reasons.push('repetition');
  if (unknownRatio > config.qualityMaximumUnknownRatio) reasons.push('unknown_words');
  return {
    accepted: reasons.length === 0,
    reasons,
    coherence: Number(coherence.toFixed(3)), toxicity: Number(toxicity.toFixed(3)),
    repetition: Number(repetition.toFixed(3)), unknownRatio: Number(unknownRatio.toFixed(3))
  };
}

module.exports = { evaluateGeneration, overlap };
