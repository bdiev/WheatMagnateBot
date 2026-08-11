'use strict';

const WORD_RE = /[\p{L}\p{N}]+(?:['\u2019][\p{L}\p{N}]+)*/gu;
const EMOJI_RE = /\p{Extended_Pictographic}/gu;
const GREETING_RE = /\b(?:hello|hi|hey|yo|hola|bonjour|salut|hallo|ciao|ol[aá]|merhaba|привет|здравствуй|здравствуйте|дарова|вітаю|привіт)\b/iu;
const COURTESY_RE = /\b(?:please|thanks|thank\s+you|pls|thx|gracias|por\s+favor|merci|bitte|danke|grazie|obrigad[oa]|lütfen|tesekkür|teşekkür|пожалуйста|спасибо|плиз|будь\s+ласка|дякую)\b/iu;
const LAUGHTER_RE = /(?:\b(?:lol|lmao|lmfao|rofl|haha+|hehe+|jaja+|k+|x+d+)\b|(?:^|\s)[хx]{2,}(?:\s|$))/iu;
const SLANG_RE = /\b(?:bro|bruh|fr|ngl|idk|imo|imho|tbh|btw|wtf|nah|yeah|yep|gonna|wanna|rn|ty|np|gg|ez|af|tho|cuz|bc|omg|pls|plz)\b/iu;
const POSITIVE_RE = /\b(?:good|great|nice|awesome|cool|love|glad|perfect|based|thanks|gracias|genial|bueno|bien|merci|danke|grazie|спасибо|круто|хорошо|дякую|добре)\b/iu;
const ADVICE_RE = /\b(?:you\s+should|you\s+can|try|use|better\s+to|recommend|можешь|попробуй|используй|лучше|deber[ií]as|puedes|prueba|usa)\b/iu;
const DIRECTIVE_RE = /^(?:please\s+)?(?:help|give|tell|show|send|bring|take|come|go|stop|wait|look|check|follow|join|leave|try|use|put|drop|kill|build|mine)\b/iu;
const EMOTICON_RE = /(?:^|\s)(?::3|[:;=8xX][-^']?[)(DPp/\\]|<3)(?=\s|$)/u;

const LANGUAGE_DEFINITIONS = [
  ['English', 'i im you he she we they the a an and or but is are was were be have has do does not no yes this that thats these those my your our their to of in on at for from with what why where when how can could would should please thanks hello hey its dont cant just like really still now'.split(' ')],
  ['Spanish', 'yo tú tu él ella nosotros ustedes el la los las un una y o pero es son de en por para con sin que qué como cómo donde dónde cuando muy mi mis su sus te se si sí no hola gracias quiero puedo puedes hay esto esta'.split(' ')],
  ['Portuguese', 'eu você voces vocês ele ela nós nos eles o os a as um uma e ou mas é são de em por para com sem que como onde quando muito meu minha seu sua sim não nao olá ola obrigado obrigada posso pode tem isso'.split(' ')],
  ['French', 'je tu il elle nous vous ils elles le la les un une et ou mais est sont de des du en pour avec sans que quoi comment où quand très mon ma mes ton ta oui non bonjour merci peux peut'.split(' ')],
  ['German', 'ich du er sie wir ihr der die das ein eine und oder aber ist sind nicht kein ja nein von zu in auf mit für was warum wo wann wie mein dein bitte danke kann'.split(' ')],
  ['Italian', 'io tu lui lei noi voi loro il lo la i gli le un una e o ma è sono di da in per con senza che cosa come dove quando molto mio tua sì si no ciao grazie posso puoi'.split(' ')],
  ['Turkish', 'ben sen o biz siz onlar bir ve veya ama bu şu ne neden nasıl nerede zaman için ile değil evet hayır benim senin var yok merhaba teşekkür lütfen yapabilir misin'.split(' ')],
  ['Dutch', 'ik jij je hij zij wij jullie ze de het een en of maar is zijn niet geen ja nee van naar in op met voor wat waarom waar wanneer hoe mijn jouw dank alsjeblieft kan'.split(' ')],
  ['Russian', 'я ты он она мы вы они и или но это тот эта что как где когда почему мой твой наш ваш да нет не на в во с со для у к из привет спасибо пожалуйста можно можешь есть'.split(' ')],
  ['Ukrainian', 'я ти він вона ми ви вони і або але це той ця що як де коли чому мій твій наш ваш так ні не на в з для у до із привіт дякую будь ласка можна можеш є'.split(' ')]
].map(([name, words]) => [name, new Set(words)]);

const LANGUAGE_HINTS = [
  ['Spanish', /[¿¡ñ]|\b(?:porque|quiero|tengo|eres|estoy|vamos)\b/giu],
  ['Portuguese', /[ãõç]|\b(?:não|você|vocês|obrigad[oa]|tenho|vamos)\b/giu],
  ['French', /[àâçéèêëîïôûùüÿœ]|\b(?:bonjour|merci|avec|pourquoi|être)\b/giu],
  ['German', /[äöüß]|\b(?:nicht|danke|bitte|warum|kannst)\b/giu],
  ['Italian', /\b(?:grazie|perché|sono|dove|ciao)\b/giu],
  ['Turkish', /[çğıöşü]|\b(?:değil|evet|hayır|teşekkür|lütfen)\b/giu],
  ['Dutch', /\b(?:niet|geen|dank|waarom|alsjeblieft)\b/giu],
  ['Russian', /[ыэъё]|\b(?:спасибо|пожалуйста|почему|можешь|привет)\b/giu],
  ['Ukrainian', /[іїєґ]|\b(?:дякую|будь\s+ласка|чому|можеш|привіт)\b/giu]
];

function clamp(value, min = 0, max = 1) {
  return Math.max(min, Math.min(max, Number(value) || 0));
}

function ratio(value, total) {
  return total > 0 ? Number(value || 0) / total : 0;
}

function parseLanguageScores(value) {
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return Object.fromEntries(Object.entries(parsed)
      .map(([name, score]) => [String(name), Number(score) || 0])
      .filter(([, score]) => score > 0));
  } catch (_) {
    return {};
  }
}

function mergeLanguageScores(base, addition) {
  const merged = { ...parseLanguageScores(base) };
  for (const [name, score] of Object.entries(parseLanguageScores(addition))) {
    merged[name] = Number((Number(merged[name] || 0) + score).toFixed(3));
  }
  return merged;
}

function detectMessageLanguage(text, words) {
  const scores = {};
  const normalizedWords = words.map(word => word.toLocaleLowerCase());
  for (const word of normalizedWords) {
    const matches = LANGUAGE_DEFINITIONS.filter(([, markers]) => markers.has(word));
    const weight = matches.length === 1 ? 1 : matches.length === 2 ? 0.55 : 0.25;
    for (const [name] of matches) scores[name] = (scores[name] || 0) + weight;
  }
  for (const [name, pattern] of LANGUAGE_HINTS) {
    const matches = String(text).match(pattern) || [];
    if (matches.length) scores[name] = (scores[name] || 0) + Math.min(4, matches.length * 1.5);
  }

  const scriptSignals = [
    ['Japanese', /[\p{Script=Hiragana}\p{Script=Katakana}]/gu],
    ['Korean', /\p{Script=Hangul}/gu],
    ['Arabic', /\p{Script=Arabic}/gu],
    ['Greek', /\p{Script=Greek}/gu]
  ];
  for (const [name, pattern] of scriptSignals) {
    const count = (String(text).match(pattern) || []).length;
    if (count) scores[name] = (scores[name] || 0) + Math.min(8, 2 + count / 3);
  }
  const hanCount = (String(text).match(/\p{Script=Han}/gu) || []).length;
  const kanaCount = (String(text).match(/[\p{Script=Hiragana}\p{Script=Katakana}]/gu) || []).length;
  if (hanCount && !kanaCount) scores.Chinese = (scores.Chinese || 0) + Math.min(8, 2 + hanCount / 3);

  const ranked = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  const total = ranked.reduce((sum, [, score]) => sum + score, 0);
  const top = ranked[0];
  const second = ranked[1];
  const confident = Boolean(top && top[1] >= 0.8 && (!second || top[1] >= second[1] * 1.15));
  return {
    scores,
    evidence: total > 0 ? 1 : 0,
    mixed: confident && second && second[1] >= top[1] * 0.65 ? 1 : 0,
    detected: confident ? top[0] : null
  };
}

function analyzeMessageStyle(value) {
  const text = String(value || '').trim();
  const words = text.match(WORD_RE) || [];
  const letters = text.match(/\p{L}/gu) || [];
  const uppercase = text.match(/\p{Lu}/gu) || [];
  const cyrillic = text.match(/\p{Script=Cyrillic}/gu) || [];
  const latin = text.match(/\p{Script=Latin}/gu) || [];
  const language = detectMessageLanguage(text, words);
  return {
    words: words.length,
    characters: text.length,
    short: words.length > 0 && words.length <= 4 ? 1 : 0,
    question: /\?/u.test(text) ? 1 : 0,
    exclamation: /!|\?{2,}|!{2,}/u.test(text) ? 1 : 0,
    emoji: (text.match(EMOJI_RE) || []).length > 0 ? 1 : 0,
    uppercase: letters.length >= 3 && uppercase.length / letters.length >= 0.6 ? 1 : 0,
    greeting: GREETING_RE.test(text) ? 1 : 0,
    courtesy: COURTESY_RE.test(text) ? 1 : 0,
    laughter: LAUGHTER_RE.test(text) ? 1 : 0,
    slang: SLANG_RE.test(text) ? 1 : 0,
    directive: DIRECTIVE_RE.test(text) ? 1 : 0,
    positive: POSITIVE_RE.test(text) ? 1 : 0,
    advice: ADVICE_RE.test(text) ? 1 : 0,
    ellipsis: /\.{3,}|…/u.test(text) ? 1 : 0,
    emoticon: EMOTICON_RE.test(text) ? 1 : 0,
    cyrillic: cyrillic.length,
    latin: latin.length,
    languageScores: language.scores,
    languageEvidence: language.evidence,
    mixedLanguage: language.mixed
  };
}

function languageProfile(row) {
  const scores = Object.entries(parseLanguageScores(row.language_scores_json))
    .sort((a, b) => b[1] - a[1]);
  const total = scores.reduce((sum, [, score]) => sum + score, 0);
  const evidenceMessages = Number(row.language_evidence_messages || 0);
  if (!scores.length || total <= 0) {
    const cyrillic = Number(row.cyrillic_characters || 0);
    const latin = Number(row.latin_characters || 0);
    const fallback = cyrillic > latin * 1.25
      ? 'Cyrillic (undetermined)'
      : latin > cyrillic * 1.25 ? 'Latin (undetermined)' : 'unknown';
    return { language: fallback, languageConfidence: 0, languageEvidenceMessages: 0, languageBreakdown: [], multilingual: false };
  }

  const breakdown = scores.slice(0, 3).map(([name, score]) => ({
    name,
    share: Number((score / total).toFixed(2)),
    score: Number(score.toFixed(2))
  }));
  const sampleFactor = Math.min(1, evidenceMessages / 12);
  const confidence = clamp((breakdown[0]?.share || 0) * sampleFactor);
  const multilingual = evidenceMessages >= 6 && (breakdown[1]?.share || 0) >= 0.24;
  return {
    language: breakdown[0]?.name || 'unknown',
    languageConfidence: Number(confidence.toFixed(2)),
    languageEvidenceMessages: evidenceMessages,
    languageBreakdown: breakdown,
    multilingual
  };
}

function toneProfile(row, messages, averageWords) {
  const rates = {
    short: ratio(row.short_messages, messages),
    question: ratio(row.question_messages, messages),
    exclamation: ratio(row.exclamation_messages, messages),
    emoji: ratio(row.emoji_messages, messages),
    uppercase: ratio(row.uppercase_messages, messages),
    greeting: ratio(row.greeting_messages, messages),
    courtesy: ratio(row.courtesy_messages, messages),
    laughter: ratio(row.laughter_messages, messages),
    slang: ratio(row.slang_messages, messages),
    directive: ratio(row.directive_messages, messages),
    positive: ratio(row.positive_messages, messages),
    advice: ratio(row.advice_messages, messages),
    ellipsis: ratio(row.ellipsis_messages, messages),
    emoticon: ratio(row.emoticon_messages, messages)
  };
  const scores = {
    energetic: rates.exclamation * 1.35 + rates.uppercase * 1.4 + rates.emoji * 0.45,
    friendly: rates.courtesy * 1.35 + rates.greeting * 1.05 + rates.positive * 0.75,
    inquisitive: rates.question * 1.65,
    playful: rates.laughter * 1.55 + rates.emoticon * 1.1 + rates.slang * 0.45 + rates.emoji * 0.35,
    helpful: rates.advice * 1.7 + rates.courtesy * 0.35,
    direct: rates.directive * 1.5 + rates.short * 0.3,
    reserved: rates.short * 0.55 + rates.ellipsis * 0.75 - rates.exclamation * 0.35 - rates.laughter * 0.35,
    formal: rates.courtesy * 0.65 + (averageWords >= 10 ? 0.45 : 0) - rates.slang * 0.7 - rates.laughter * 0.4
  };
  const ranked = Object.entries(scores)
    .map(([name, score]) => ({ name, score: Math.max(0, score) }))
    .sort((a, b) => b.score - a.score);
  const top = ranked[0] || { name: 'neutral', score: 0 };
  const second = ranked[1] || { name: 'neutral', score: 0 };
  const distinctive = top.score >= 0.48 && top.score - second.score >= 0.08;
  const sampleFactor = Math.min(1, messages / 18);
  const confidence = distinctive
    ? (0.55 * clamp(top.score / 1.2) + 0.45 * clamp((top.score - second.score) / 1.2)) * sampleFactor
    : 0;
  return {
    detectedTone: distinctive ? top.name : 'neutral',
    toneConfidence: Number(confidence.toFixed(2)),
    toneBreakdown: ranked.slice(0, 3).map(item => ({ name: item.name, score: Number(item.score.toFixed(2)) })),
    rates
  };
}

function percent(value) {
  return `${Math.round(clamp(value) * 100)}%`;
}

function presentPlayerStyle(row) {
  if (!row) return null;
  const rawMessages = Number(row.messages_seen) || 0;
  const messages = Math.max(1, rawMessages);
  const averageWords = Number(row.total_words || 0) / messages;
  const shortRate = ratio(row.short_messages, messages);
  const detectedLength = averageWords <= 3.5 || shortRate >= 0.72
    ? 'short'
    : averageWords >= 10 && shortRate < 0.45 ? 'detailed' : 'balanced';
  const language = languageProfile(row);
  const toneProfileResult = toneProfile(row, messages, averageWords);
  const responseLength = row.admin_length && row.admin_length !== 'auto'
    ? row.admin_length
    : detectedLength;
  const tone = row.admin_tone && row.admin_tone !== 'auto'
    ? row.admin_tone
    : toneProfileResult.detectedTone;
  const rates = toneProfileResult.rates;
  const signals = [];
  if (rates.question >= 0.18) signals.push(`questions in ${percent(rates.question)} of messages`);
  if (rates.laughter + rates.emoticon >= 0.15) signals.push(`humor markers in ${percent(rates.laughter + rates.emoticon)} of messages`);
  if (rates.slang >= 0.18) signals.push(`slang in ${percent(rates.slang)} of messages`);
  if (rates.courtesy >= 0.12) signals.push(`polite wording in ${percent(rates.courtesy)} of messages`);
  if (rates.greeting >= 0.12) signals.push(`greets in ${percent(rates.greeting)} of messages`);
  if (rates.exclamation >= 0.18) signals.push(`expressive punctuation in ${percent(rates.exclamation)} of messages`);
  if (rates.uppercase >= 0.12) signals.push(`uppercase in ${percent(rates.uppercase)} of messages`);
  if (rates.directive >= 0.15) signals.push(`direct requests in ${percent(rates.directive)} of messages`);
  if (rates.advice >= 0.12) signals.push(`offers suggestions in ${percent(rates.advice)} of messages`);
  if (!signals.length && rawMessages >= 5) signals.push(`${percent(shortRate)} short messages`);
  const learningStatus = rawMessages < 5 ? 'insufficient' : rawMessages < 15 ? 'developing' : rawMessages < 40 ? 'moderate' : 'strong';

  return {
    source: row.source,
    subjectId: row.subject_id,
    subjectName: row.subject_name,
    messagesSeen: rawMessages,
    averageWords: Number(averageWords.toFixed(1)),
    detectedLength,
    detectedTone: toneProfileResult.detectedTone,
    toneConfidence: toneProfileResult.toneConfidence,
    toneBreakdown: toneProfileResult.toneBreakdown,
    tone,
    responseLength,
    adminTone: row.admin_tone || 'auto',
    adminLength: row.admin_length || 'auto',
    adminNotes: row.admin_notes || '',
    signals,
    learningStatus,
    sampleConfidence: Number(Math.min(1, rawMessages / 40).toFixed(2)),
    ...language,
    updatedAt: row.updated_at
  };
}

module.exports = {
  analyzeMessageStyle,
  mergeLanguageScores,
  parseLanguageScores,
  presentPlayerStyle
};
