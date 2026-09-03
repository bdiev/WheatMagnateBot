'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createPlaytimeFeature } = require('../features/playtime');
const {
  DEFAULT_PLAYTIME_LOOKUP_CHANNEL_ID,
  createDiscordPlaytimeImport,
  isDiscordApplicationMessage,
  isLookupChannel,
  isTrustedPlaytimeBot,
  parseDiscordPlaytimeCommand,
  parseDiscordMessageStatistics,
  parseDiscordPlayerInfoResponses,
  parseDiscordPlaytimeResponse
} = require('../discord/playtime-import');

const channelId = '1340779371698589696';
const { parsePlaytime } = createPlaytimeFeature({ pool:null });

function message({ content = '', channel = channelId, parentId = null, bot = false, username = 'Admin', id = '1', embeds = [], components = [], applicationId = null, webhookId = null } = {}) {
  return {
    id,
    content,
    embeds,
    components,
    channelId:channel,
    channel:{ id:channel,parentId },
    applicationId,
    webhookId,
    author:{ id:bot ? 'lookup-bot-id' : 'admin-id',bot,username }
  };
}

async function testParsingAndTrust() {
  assert.deepEqual(parseDiscordPlaytimeCommand(' !pt bdiev_ '), { metric:'playtime',username:'bdiev_',command:'!pt bdiev_' });
  assert.deepEqual(parseDiscordPlaytimeCommand('!jd bdiev_'), { metric:'joinDate',username:'bdiev_',command:'!jd bdiev_' });
  assert.deepEqual(parseDiscordPlaytimeCommand('!seen bdiev_'), { metric:'lastSeen',username:'bdiev_',command:'!seen bdiev_' });
  assert.deepEqual(parseDiscordPlaytimeCommand('!messages bdiev_'), { metric:'messages',username:'bdiev_',command:'!messages bdiev_' });
  assert.equal(parseDiscordPlaytimeCommand('!pt bad name'), null);
  assert.deepEqual(
    parseDiscordPlaytimeResponse(message({ content:'bdiev_: 80 Days, 22 Hours, 19 Minutes',bot:true }), parsePlaytime),
    { targetUsername:'bdiev_',observedValue:6_992_340 }
  );
  assert.deepEqual(
    parseDiscordPlayerInfoResponses(
      message({ content:'bdiev_: 10,758 messages.',bot:true }),
      parsePlaytime
    ),
    [{ metric:'messages',targetUsername:'bdiev_',observedValue:10_758 }]
  );
  const messageStatisticsEmbed = message({
    bot:true,
    username:'LolRiTTeRBot',
    embeds:[{
      title:'Message statistics for 2wd',
      description:'**Total messages**\n58929 \u200b\n\n**Last 5 messages**\n**15 days ago**: !rape ItzRubyy'
    }]
  });
  assert.deepEqual(
    parseDiscordMessageStatistics(messageStatisticsEmbed),
    { targetUsername:'2wd',observedValue:58_929 },
    'the current LolRiTTeRBot statistics embed must be parsed'
  );
  assert.deepEqual(
    parseDiscordMessageStatistics(message({
      bot:true,
      embeds:[{ title:'Message statistics for 2wd',fields:[{ name:'Total messages',value:'58,929' }] }]
    })),
    { targetUsername:'2wd',observedValue:58_929 },
    'the field-based variant of the statistics embed must also be parsed'
  );
  assert.deepEqual(
    parseDiscordMessageStatistics(message({
      bot:true,
      components:[{ components:[
        { content:'**Message statistics for 2wd**' },
        { content:'**Total messages**\n58,929 \u200b' },
        { content:'**Last 5 messages**\n**15 days ago**: hello' }
      ] }]
    })),
    { targetUsername:'2wd',observedValue:58_929 },
    'Discord Components V2 statistics responses must also be parsed'
  );
  assert.equal(isTrustedPlaytimeBot(message({ bot:true,username:'LolRiTTeRBot' })), true,
    'Discord renders APP as a badge, so both the displayed APP form and the username must match');
  assert.equal(isTrustedPlaytimeBot(message({ bot:true,username:'UnrelatedBot' })), false);
  assert.equal(isTrustedPlaytimeBot(message({ bot:true,username:'LolRiTTeRBot' }), { botId:'another-id' }), false,
    'an immutable configured bot ID must take precedence over display names');
  const webhookResponse = message({ bot:false,username:'LolRiTTeRBot',webhookId:'webhook-1' });
  assert.equal(isDiscordApplicationMessage(webhookResponse), true);
  assert.equal(isTrustedPlaytimeBot(webhookResponse), true,
    'application-owned webhook responses must not be mistaken for human messages');
  assert.equal(isLookupChannel(message({ channel:'thread-id',parentId:channelId }), channelId), true,
    'responses inside a configured channel thread must be accepted');
}

async function testPendingRequestImport() {
  const saved = [];
  const imported = [];
  const coordinator = createDiscordPlaytimeImport({
    channelId,
    parsePlaytime,
    now:() => new Date('2026-08-20T12:00:00.000Z').getTime(),
    saveMetric:async (metric, username, observedValue) => {
      saved.push({ metric,username,observedValue });
      return { username };
    },
    onImported:async result => imported.push(result)
  });

  assert.equal(await coordinator.handle(message({ content:'!pt bdiev_',channel:'wrong-channel' })), false);
  assert.equal(await coordinator.handle(message({ content:'bdiev_: 80 Days, 22 Hours, 19 Minutes',bot:true,username:'LolRiTTeRBot' })), false,
    'unsolicited bot replies must never write playtime');
  assert.equal(await coordinator.handle(message({ content:'!pt bdiev_' })), true);
  assert.equal(await coordinator.handle(message({ content:'!jd bdiev_' })), true);
  assert.equal(await coordinator.handle(message({ content:'!seen bdiev_' })), true);
  assert.equal(await coordinator.handle(message({ content:'!messages bdiev_' })), true);
  assert.equal(await coordinator.handle(message({ content:'!messages 2wd' })), true);
  assert.equal(await coordinator.handle(message({ content:'!messages ThreadPlayer',channel:'thread-id',parentId:channelId })), true);
  assert.equal(await coordinator.handle(message({ content:'bdiev_: 80 Days, 22 Hours, 19 Minutes',bot:true,username:'UnrelatedBot' })), false);
  assert.equal(await coordinator.handle(message({
    bot:true,
    username:'LolRiTTeRBot',
    id:'reply-1',
    embeds:[{ description:'bdiev_: 80 Days, 22 Hours, 19 Minutes' }]
  })), true);
  assert.equal(await coordinator.handle(message({
    bot:false,
    username:'LolRiTTeRBot',
    webhookId:'webhook-1',
    channel:'thread-id',
    parentId:channelId,
    id:'reply-6',
    embeds:[{ title:'Message statistics for ThreadPlayer',fields:[{ name:'Total messages',value:'77' }] }]
  })), true);
  assert.equal(await coordinator.handle(message({
    content:'I first saw bdiev_ 2 years ago on Nov 16th, 2024.',bot:true,username:'LolRiTTeRBot',id:'reply-2'
  })), true);
  assert.equal(await coordinator.handle(message({
    content:'I saw bdiev_ 2 hours ago',bot:true,username:'LolRiTTeRBot',id:'reply-3'
  })), true);
  assert.equal(await coordinator.handle(message({
    content:'bdiev_: 10,758 messages.',bot:true,username:'LolRiTTeRBot',id:'reply-4'
  })), true);
  assert.equal(await coordinator.handle(message({
    bot:true,
    username:'LolRiTTeRBot',
    id:'reply-5',
    embeds:[{
      title:'Message statistics for 2wd',
      description:'**Total messages**\n58929 \u200b\n\n**Last 5 messages**\n**15 days ago**: !rape ItzRubyy'
    }]
  })), true);
  assert.deepEqual(saved, [
    { metric:'playtime',username:'bdiev_',observedValue:6_992_340 },
    { metric:'messages',username:'ThreadPlayer',observedValue:77 },
    { metric:'joinDate',username:'bdiev_',observedValue:new Date('2024-11-16T00:00:00.000Z') },
    { metric:'lastSeen',username:'bdiev_',observedValue:new Date('2026-08-20T10:00:00.000Z') },
    { metric:'messages',username:'bdiev_',observedValue:10_758 },
    { metric:'messages',username:'2wd',observedValue:58_929 }
  ]);
  assert.equal(imported[0].requestedUsername, 'bdiev_');
  assert.equal(imported[0].sourceMessageId, 'reply-1');
  assert.deepEqual(imported.map(item => item.metric), ['playtime', 'messages', 'joinDate', 'lastSeen', 'messages', 'messages']);
  assert.equal(coordinator.pending.size, 0);
}

function testBotIntegrationOrder() {
  const botSource = fs.readFileSync(path.resolve(__dirname, '..', 'bot.js'), 'utf8');
  const handler = botSource.match(/discordClient\.on\('messageCreate',[\s\S]+?const trimmedContent/)?.[0] || '';
  assert.match(handler, /discordPlaytimeImport\.handle\(message\)[\s\S]*message\.author\.bot/,
    'lookup replies must be handled before the general bot-message guard');
  assert.match(botSource, /saveMetric:[\s\S]*setPlayerPlaytime[\s\S]*reconcileObservedJoinDate[\s\S]*reconcileObservedLastSeen[\s\S]*reconcileObservedMessages/,
    'all four Discord response types must be persisted by their matching handler');
  assert.equal(DEFAULT_PLAYTIME_LOOKUP_CHANNEL_ID, channelId, 'the requested lookup channel must be the default');
  assert.match(botSource, /discordClient\.on\('messageUpdate'[\s\S]*discordPlaytimeImport\.handle\(message\)/,
    'edited application responses must be imported too');
}

(async () => {
  await testParsingAndTrust();
  await testPendingRequestImport();
  testBotIntegrationOrder();
  console.log('Discord player information import tests passed.');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
