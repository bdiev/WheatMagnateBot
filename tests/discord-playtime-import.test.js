'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createPlaytimeFeature } = require('../features/playtime');
const {
  DEFAULT_PLAYTIME_LOOKUP_CHANNEL_ID,
  createDiscordPlaytimeImport,
  isDiscordApplicationMessage,
  isDiscordUserNotFound,
  isLookupChannel,
  isTrustedPlaytimeBot,
  parseDiscordNullJoinDateResponse,
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
  assert.deepEqual(
    parseDiscordPlayerInfoResponses(
      message({ bot:true,embeds:[{ description:'**AlexFart**: 09/20/2019 22:11:49' }] }),
      parsePlaytime
    ),
    [{ metric:'joinDate',targetUsername:'AlexFart',observedValue:new Date('2019-09-20T22:11:49.000Z') }],
    'bold Discord usernames in !jd embeds must be parsed'
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
      embeds:[{
        title:'Message statistics for 0000001_Armorbar',
        description:'**Total messages**\n1360 \u200b\n\n**Last 5 messages**\n**7 minutes ago**: mrow'
      }]
    })),
    { targetUsername:'0000001_Armorbar',observedValue:1_360 },
    'Minecraft underscores must survive Discord markdown cleanup'
  );
  assert.deepEqual(
    parseDiscordMessageStatistics(message({
      bot:true,
      embeds:[{ title:'Message statistics for 0000001\\_Armorbar',fields:[{ name:'Total messages',value:'1,360' }] }]
    })),
    { targetUsername:'0000001_Armorbar',observedValue:1_360 },
    'explicitly escaped Discord underscores must also be restored'
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
  assert.equal(isTrustedPlaytimeBot(message({ bot:true,username:'LolRiTTeRBot' }), { botId:'another-id' }), true,
    'exact application-name matching must survive Discord bot-user/application ID differences');
  const webhookResponse = message({ bot:false,username:'LolRiTTeRBot',webhookId:'webhook-1' });
  assert.equal(isDiscordApplicationMessage(webhookResponse), true);
  assert.equal(isTrustedPlaytimeBot(webhookResponse), true,
    'application-owned webhook responses must not be mistaken for human messages');
  assert.equal(isLookupChannel(message({ channel:'thread-id',parentId:channelId }), channelId), true,
    'responses inside a configured channel thread must be accepted');
  assert.equal(isDiscordUserNotFound(message({ content:'User not found.',bot:true })), true);
  assert.equal(isDiscordUserNotFound(message({ bot:true,embeds:[{ description:'User not found.' }] })), true);
  assert.deepEqual(
    parseDiscordNullJoinDateResponse(message({ bot:true,embeds:[{ description:'**Herobrine**: null\u00a0' }] })),
    { targetUsername:'Herobrine' },
    'null join-date embeds must preserve and identify the target username'
  );
}

async function testPendingRequestImport() {
  const saved = [];
  const imported = [];
  const unavailable = [];
  const coordinator = createDiscordPlaytimeImport({
    channelId,
    parsePlaytime,
    now:() => new Date('2026-08-20T12:00:00.000Z').getTime(),
    saveMetric:async (metric, username, observedValue) => {
      saved.push({ metric,username,observedValue });
      return { username };
    },
    saveUnavailable:async (username, details) => {
      unavailable.push({ username,...details });
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
  assert.equal(await coordinator.handle(message({ content:'!messages 0000001_Armorbar' })), true);
  assert.equal(await coordinator.handle(message({ content:'!jd Herobrine',id:'missing-herobrine-jd' })), true);
  assert.equal(await coordinator.handle(message({ content:'bdiev_: 80 Days, 22 Hours, 19 Minutes',bot:true,username:'UnrelatedBot' })), false);
  assert.equal(await coordinator.handle(message({
    bot:true,
    username:'LolRiTTeRBot',
    id:'reply-1',
    embeds:[{ description:'bdiev_: 80 Days, 22 Hours, 19 Minutes' }]
  })), true);
  assert.equal(await coordinator.handle(message({ content:'!pt 1x09',id:'missing-pt' })), true);
  assert.equal(await coordinator.handle(message({ content:'!messages 1x09',id:'missing-messages' })), true);
  assert.equal(await coordinator.handle(message({
    content:'User not found.',bot:true,username:'LolRiTTeRBot',id:'reply-not-found'
  })), true);
  assert.equal(await coordinator.handle(message({
    bot:true,
    username:'LolRiTTeRBot',
    id:'reply-null-jd',
    embeds:[{ description:'**Herobrine**: null\u00a0' }]
  })), true);
  assert.equal(await coordinator.handle(message({
    bot:true,
    username:'LolRiTTeRBot',
    id:'reply-7',
    embeds:[{
      title:'Message statistics for 0000001_Armorbar',
      description:'**Total messages**\n1360 \u200b\n\n**Last 5 messages**\n**7 minutes ago**: mrow'
    }]
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
    { metric:'messages',username:'0000001_Armorbar',observedValue:1_360 },
    { metric:'messages',username:'ThreadPlayer',observedValue:77 },
    { metric:'joinDate',username:'bdiev_',observedValue:new Date('2024-11-16T00:00:00.000Z') },
    { metric:'lastSeen',username:'bdiev_',observedValue:new Date('2026-08-20T10:00:00.000Z') },
    { metric:'messages',username:'bdiev_',observedValue:10_758 },
    { metric:'messages',username:'2wd',observedValue:58_929 }
  ]);
  assert.equal(imported[0].requestedUsername, 'bdiev_');
  assert.equal(imported[0].sourceMessageId, 'reply-1');
  assert.deepEqual(imported.map(item => item.metric), ['playtime', 'messages', 'messages', 'joinDate', 'lastSeen', 'messages', 'messages']);
  assert.deepEqual(unavailable, [
    { username:'1x09',reason:'user_not_found',metric:'messages' },
    { username:'Herobrine',reason:'join_date_null',metric:'joinDate' }
  ]);
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
  assert.match(botSource, /scheduleDiscordPlayerInfoFetch[\s\S]*channel\.messages\.fetch\(\{ limit:25 \}\)[\s\S]*discordPlaytimeImport\.handle\(candidate\)/,
    'missed Gateway events must fall back to fetching recent Discord embeds through REST');
  assert.match(botSource, /saveUnavailable:markPlayerInfoLookupUnavailable[\s\S]*Removed \$\{result\.username\} from missing lookups/,
    'User not found responses must persistently remove a username from missing lookups');
  assert.match(botSource, /event\.metric === 'joinDate'[\s\S]*playerInfoObservationStore\.requestRefresh\('joinDate', event\.username\)/,
    'Discord !jd commands must permit replacement of a previously imported suspicious date');
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
