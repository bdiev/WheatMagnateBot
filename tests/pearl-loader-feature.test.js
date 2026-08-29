'use strict';

const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { createPearlLoaderFeature } = require('../features/pearlLoader');
const { createModulesForBot } = require('../site/accounts/module-registry');
const { MinecraftBotRuntime } = require('../site/accounts/minecraft-bot-runtime');

const loaderAccount = {
  id:'00000000-0000-4000-8000-000000000002',
  username:'PearlBot',displayName:'Pearl Bot',role:'pearl_loader',isDefault:false
};

function delay(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

async function testCompleteCycle() {
  let open = true;
  const movementsSeen = [];
  const chats = [];
  const taskStates = [];
  const bot = {
    username:'PearlBot',
    entity:{ position:{ distanceTo:position => position.distance ?? 0 } },
    entities:{},
    pathfinder:{
      setMovements(movements) { movementsSeen.push(movements); },
      async goto(goal) { this.goal = goal; }
    },
    async waitForChunksToLoad() {},
    blockAt(position) {
      assert.deepEqual({x:position.x,y:position.y,z:position.z},{x:10,y:64,z:-20});
      return { name:'oak_trapdoor',getProperties:() => ({ open }) };
    },
    async activateBlock() { open = !open; },
    chat(message) { chats.push(message); }
  };
  const runtime = new EventEmitter();
  runtime.bot = bot;
  runtime.assignTask = task => taskStates.push(task);
  let stopped = 0;
  runtime.stop = async reason => { stopped += 1; runtime.stopReason = reason; runtime.bot = null; };
  let recreated = 0;
  const manager = {
    async start(id) { assert.equal(id,loaderAccount.id); },
    async recreate(id) { assert.equal(id,loaderAccount.id); recreated += 1; },
    get:() => runtime
  };
  let registryLoads = 0;
  const primaryReplies = [];
  const feature = createPearlLoaderFeature({
    pool:{ query:async () => ({rows:[{username:'bdiev_',pearl_hatch_x:10,pearl_hatch_y:64,pearl_hatch_z:-20}]}) },
    getRegistry:() => ({load:async () => { registryLoads += 1; },list:() => [loaderAccount]}),
    getManager:() => manager,
    sendPrimaryWhisper:async (username,message) => primaryReplies.push({username,message}),
    movementsFactory:() => ({}),
    goalFactory:(x,y,z,range) => ({x,y,z,range}),
    openDelayMs:5,
    visibilityPollMs:5,
    interactionSettleMs:1,
    readyTimeoutMs:1_000,
    visibilityTimeoutMs:1_000
  });

  assert.equal(await feature.handlePrimaryWhisper('bdiev_','  LOAD  '),true);
  assert.equal(registryLoads,1,'each Load request refreshes bot roles from the database');
  assert.equal(recreated,1,'an existing stopped runtime is recreated from the refreshed account settings');
  assert.equal(feature.getStatus().stage,'awaiting_yes');
  assert.deepEqual(chats,['/w bdiev_ Ready?']);
  assert.equal(bot.pathfinder.goal.range,1,'the Loader must approach within one block of the trapdoor');
  assert.equal(movementsSeen[0].canDig,false,'pathfinder must never dig blocks');
  assert.equal(movementsSeen[0].allow1by1towers,false);
  assert.equal(await feature.handleLoaderWhisper(loaderAccount.id,'SomeoneElse','Yes'),false);

  bot.entities.player={type:'player',username:'bdiev_',position:{distance:4}};
  assert.equal(await feature.handleLoaderWhisper(loaderAccount.id,'bdiev_','YES'),true);
  assert.equal(open,false,'Yes closes an open trapdoor immediately');
  assert.deepEqual(chats,[
    '/w bdiev_ Ready?',
    '/w bdiev_ Remember to throw a new ender pearl.'
  ],'the Loader reminds the visible player to throw a replacement pearl');
  assert.ok(chats.every(message => message.startsWith('/w bdiev_ ')),'Pearl Loader must never write feature messages to public chat');
  await delay(20);
  assert.equal(open,true,'the trapdoor opens after the configured delay once the player is visible');
  assert.deepEqual(feature.getStatus(),{active:false});
  assert.deepEqual(taskStates,['pearl_loader','idle']);
  assert.equal(stopped,1,'the Loader must disconnect after completing the request');
  assert.equal(runtime.stopReason,'Pearl Loader request complete');
  assert.deepEqual(primaryReplies,[]);
  feature.dispose();
}

async function testMissingCoordinates() {
  const replies = [];
  const feature = createPearlLoaderFeature({
    pool:{query:async () => ({rows:[{username:'NoHatch',pearl_hatch_x:null,pearl_hatch_y:null,pearl_hatch_z:null}]})},
    getRegistry:() => ({list:() => [loaderAccount]}),
    getManager:() => ({start:async () => { throw new Error('must not start'); }}),
    sendPrimaryWhisper:async (username,message) => replies.push({username,message})
  });
  assert.equal(await feature.handlePrimaryWhisper('NoHatch','load'),true);
  assert.match(replies[0].message,/coordinates are not configured/i);
  assert.equal(await feature.handlePrimaryWhisper('NoHatch','loader'),false);
}

function testRestrictedRuntimeModules() {
  const modules = createModulesForBot({accountId:loaderAccount.id,account:loaderAccount});
  assert.throws(() => modules.obsidianFarm.configure(1,2,3),/disabled for the Pearl Loader/);
  assert.doesNotThrow(() => modules.obsidianFarm.configureRuntime({}),
    'runtime wiring must remain available without enabling Obsidian Farm');
  assert.throws(() => modules.killAura.setEnabled(true),/disabled for the Pearl Loader/);
  assert.throws(() => modules.follow.start('Player'),/disabled for the Pearl Loader/);
  assert.equal(modules.killAura.getStatus().enabled,false);
}

async function testLoaderRuntimeWhispers() {
  const bot = new EventEmitter();
  bot.pathfinder = {};
  bot.quit = () => {};
  const runtime = new MinecraftBotRuntime({account:loaderAccount,botFactory:() => bot});
  await runtime.start();
  let whisper = null;
  runtime.once('whisper', event => { whisper = event; });
  bot.emit('whisper','bdiev_','Yes');
  assert.deepEqual(whisper,{accountId:loaderAccount.id,username:'bdiev_',message:'Yes'});
  await runtime.destroy();
}

(async () => {
  await testCompleteCycle();
  await testMissingCoordinates();
  testRestrictedRuntimeModules();
  await testLoaderRuntimeWhispers();
  console.log('Pearl Loader feature tests passed.');
})().catch(error => { console.error(error); process.exitCode=1; });
