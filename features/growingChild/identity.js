'use strict';

const BOT_IDENTITY = Object.freeze({
  name: 'WheatMagnate',
  owner: 'bdiev_',
  server: 'oldfag.org',
  serverKind: 'anarchy',
  purpose: 'harvests a lot of wheat'
});

const OWNER_QUESTION_RE = /(?:\bwhose\s+bot\b|\bwho\s+(?:is\s+your\s+owner|owns\s+you|do\s+you\s+belong\s+to)\b|чей\s+(?:это\s+|он\s+|ты\s+)?бот|кто\s+(?:твой\s+хозяин|твой\s+владелец|тебя\s+создал)|кому\s+ты\s+принадлежишь)/iu;
const SERVER_QUESTION_RE = /(?:\bwhat\s+server\b|\bwhich\s+server\b|\bwhere\s+(?:are\s+you|do\s+you\s+live)\b|на\s+каком\s+сервере|где\s+(?:ты|он|бот)\s+(?:находишься|находится|живешь|живёт|играешь|играет))/iu;
const PURPOSE_QUESTION_RE = /(?:\bwhat\s+do\s+you\s+do\b|\bwhat\s+is\s+your\s+(?:job|purpose)\b|\bwhy\s+are\s+you\s+here\b|что\s+(?:ты|он|бот)\s+делаешь|чем\s+(?:ты|он|бот)\s+занимаешься|зачем\s+(?:ты|он|бот)\s+(?:здесь|нужен)|для\s+чего\s+(?:ты|он|бот))/iu;
const NAME_QUESTION_RE = /(?:\bwho\s+are\s+you\b|\bwhat(?:'s|\s+is)\s+your\s+name\b|\btell\s+me\s+about\s+yourself\b|кто\s+ты|ты\s+кто|кто\s+(?:он|этот\s+бот)|как\s+тебя\s+зовут|расскажи\s+о\s+себе|что\s+ты\s+такое)/iu;

function identityQuestionKind(text) {
  const value = String(text || '').replace(/\s+/g, ' ').trim();
  if (!value) return null;
  if (OWNER_QUESTION_RE.test(value)) return 'owner';
  if (SERVER_QUESTION_RE.test(value)) return 'server';
  if (PURPOSE_QUESTION_RE.test(value)) return 'purpose';
  if (NAME_QUESTION_RE.test(value)) return 'identity';
  return null;
}

function getIdentityReply(text) {
  const kind = identityQuestionKind(text);
  if (!kind) return null;
  const russian = /\p{Script=Cyrillic}/u.test(String(text));

  if (russian) {
    if (kind === 'owner') return `Я бот игрока ${BOT_IDENTITY.owner}.`;
    if (kind === 'server') return `Я нахожусь на анархическом сервере ${BOT_IDENTITY.server}.`;
    if (kind === 'purpose') return `Я ${BOT_IDENTITY.name} и добываю много пшеницы.`;
    return `Я ${BOT_IDENTITY.name}, бот игрока ${BOT_IDENTITY.owner}. Я добываю много пшеницы на анархическом сервере ${BOT_IDENTITY.server}.`;
  }

  if (kind === 'owner') return `My owner is ${BOT_IDENTITY.owner}.`;
  if (kind === 'server') return `I live on the ${BOT_IDENTITY.serverKind} server ${BOT_IDENTITY.server}.`;
  if (kind === 'purpose') return `I am ${BOT_IDENTITY.name} and I harvest a lot of wheat.`;
  return `I am ${BOT_IDENTITY.name}, ${BOT_IDENTITY.owner}'s bot. I harvest wheat on the ${BOT_IDENTITY.serverKind} server ${BOT_IDENTITY.server}.`;
}

module.exports = { BOT_IDENTITY, getIdentityReply, identityQuestionKind };
