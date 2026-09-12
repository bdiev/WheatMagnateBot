'use strict';

const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { Vec3 } = require('vec3');
const { createPearlLoaderFeature, hasEnderPearlNear, trapdoorInteraction } = require('../features/pearlLoader');
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
  const eventOrder = [];
  const interactionPackets = [];
  const taskStates = [];
  let hatchVisible = true;
  const bot = {
    username:'PearlBot',
    entity:{ position:new Vec3(9,64,-20),eyeHeight:1.62 },
    entities:{
      pearl:{type:'projectile',name:'ender_pearl',displayName:'Thrown Ender Pearl',position:new Vec3(10.5,64.5,-19.5)}
    },
    world:{
      raycast() {
        return { position:hatchVisible ? new Vec3(10,64,-20) : new Vec3(9,64,-20) };
      }
    },
    pathfinder:{
      setMovements(movements) { movementsSeen.push(movements); },
      async goto(goal) { this.goal = goal; eventOrder.push('arrived'); }
    },
    async waitForChunksToLoad() {},
    blockAt(position) {
      assert.deepEqual({x:position.x,y:position.y,z:position.z},{x:10,y:64,z:-20});
      return { name:'oak_trapdoor',position:new Vec3(10,64,-20),getProperties:() => ({ open,facing:'west',half:'bottom' }) };
    },
    canSeeBlock() { return true; },
    async lookAt(target) { eventOrder.push(`look:${target.x},${target.y},${target.z}`); },
    supportFeature(name) { return name === 'blockPlaceHasInsideBlock'; },
    _client:{
      write(name, packet) {
        interactionPackets.push({name,packet});
        eventOrder.push('click');
        open = !open;
      }
    },
    swingArm() {},
    async activateBlock() { throw new Error('the production interaction must not re-aim at the empty block centre'); },
    chat(message) { chats.push(message); eventOrder.push(`chat:${message}`); }
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
    openDelayMs:5,
    visibilityPollMs:5,
    navigationSettleMs:1,
    interactionSettleMs:1,
    readyTimeoutMs:1_000,
    visibilityTimeoutMs:1_000
  });

  assert.equal(await feature.handlePrimaryWhisper('bdiev_','  LOAD  '),true);
  assert.equal(registryLoads,1,'each Load request refreshes bot roles from the database');
  assert.equal(recreated,1,'an existing stopped runtime is recreated from the refreshed account settings');
  assert.equal(feature.getStatus().stage,'awaiting_yes');
  assert.deepEqual(chats,['/w bdiev_ Type "/r yes" when you ready.']);
  assert.deepEqual(eventOrder.slice(0,3),[
    'arrived',
    'chat:/w bdiev_ Type "/r yes" when you ready.',
    'look:10.8125,64.5,-19.5'
  ],'the loader must arrive, send the prompt, and then aim at the actual trapdoor slab');
  assert.deepEqual(
    bot.pathfinder.goal.goals.map(goal => goal.constructor.name),
    ['GoalNear','GoalLookAtBlock'],
    'navigation must require both proximity and a visible trapdoor face'
  );
  assert.equal(bot.pathfinder.goal.isEnd(new Vec3(9,64,-20)),true,'an adjacent visible position is valid');
  hatchVisible = false;
  assert.equal(bot.pathfinder.goal.isEnd(new Vec3(9,64,-20)),false,'an adjacent position behind a wall is invalid');
  hatchVisible = true;
  assert.equal(bot.pathfinder.goal.isEnd(new Vec3(8,64,-20)),true,'a visible position two blocks away can bypass an obstacle');
  assert.equal(bot.pathfinder.goal.isEnd(new Vec3(7,64,-20)),false,'a position beyond navigation range is invalid');
  assert.equal(movementsSeen[0].canDig,false,'pathfinder must never dig blocks');
  assert.equal(movementsSeen[0].allow1by1towers,false);
  assert.equal(await feature.handleLoaderWhisper(loaderAccount.id,'SomeoneElse','Yes'),false);

  bot.entities.player={type:'player',username:'bdiev_',position:new Vec3(13,64,-20)};
  assert.equal(await feature.handleLoaderWhisper(loaderAccount.id,'bdiev_','YES'),true);
  assert.equal(open,false,'Yes closes an open trapdoor immediately');
  assert.deepEqual(eventOrder.slice(3,5),[
    'look:10.8125,64.5,-19.5',
    'click'
  ],'Yes rechecks the aim and immediately sends exactly one trapdoor click');
  assert.equal(interactionPackets.length,1);
  assert.deepEqual(chats,[
    '/w bdiev_ Type "/r yes" when you ready.',
    '/w bdiev_ Remember to throw a new ender pearl.'
  ],'the Loader reminds the visible player to throw a replacement pearl');
  assert.ok(chats.every(message => message.startsWith('/w bdiev_ ')),'Pearl Loader must never write feature messages to public chat');
  await delay(50);
  assert.equal(open,true,'the trapdoor opens after the configured delay once the player is visible');
  assert.deepEqual(feature.getStatus(),{active:false});
  assert.deepEqual(taskStates,['pearl_loader','idle']);
  assert.equal(stopped,1,'the Loader must disconnect after completing the request');
  assert.equal(runtime.stopReason,'Pearl Loader request complete');
  assert.deepEqual(primaryReplies,[]);
  feature.dispose();
}

function testTrapdoorInteractionFaces() {
  const position = new Vec3(10,64,-20);
  const cases = [
    ['north',new Vec3(10,64,-21),new Vec3(0,0,-1),new Vec3(0.5,0.5,13 / 16)],
    ['south',new Vec3(10,64,-19),new Vec3(0,0,1),new Vec3(0.5,0.5,3 / 16)],
    ['west',new Vec3(9,64,-20),new Vec3(-1,0,0),new Vec3(13 / 16,0.5,0.5)],
    ['east',new Vec3(11,64,-20),new Vec3(1,0,0),new Vec3(3 / 16,0.5,0.5)]
  ];
  for (const [facing,botPosition,direction,cursor] of cases) {
    const block = {position,getProperties:() => ({open:true,facing,half:'bottom'})};
    const interaction = trapdoorInteraction(block,{entity:{position:botPosition,eyeHeight:1.62}});
    assert.deepEqual(interaction.direction,direction,`${facing} trapdoor uses its visible vertical face`);
    assert.deepEqual(interaction.cursor,cursor,`${facing} trapdoor click lands on its 3/16 slab`);
  }

  const closed = trapdoorInteraction({position,getProperties:() => ({open:false,facing:'north',half:'bottom'})},null);
  assert.deepEqual(closed.direction,new Vec3(0,1,0));
  assert.deepEqual(closed.cursor,new Vec3(0.5,3 / 16,0.5),'a closed bottom trapdoor is clicked on its top surface');
}

async function testDelayedTrapdoorUpdate() {
  let open = true;
  let activations = 0;
  const bot = {
    entity:{position:new Vec3(9,64,-20),eyeHeight:1.62},
    entities:{pearl:{name:'ender_pearl',position:new Vec3(10.5,64.5,-19.5)}},
    world:{},
    pathfinder:{setMovements() {},async goto() {}},
    async waitForChunksToLoad() {},
    blockAt:() => ({name:'oak_trapdoor',position:new Vec3(10,64,-20),getProperties:() => ({open,facing:'west',half:'bottom'})}),
    canSeeBlock:() => true,
    async lookAt() {},
    async activateBlock() {
      activations += 1;
      setTimeout(() => { open = false; }, 30);
    },
    chat() {}
  };
  const runtime = new EventEmitter();
  runtime.bot = bot;
  runtime.assignTask = () => {};
  runtime.stop = async () => { runtime.bot = null; };
  const feature = createPearlLoaderFeature({
    pool:{query:async () => ({rows:[{username:'bdiev_',pearl_hatch_x:10,pearl_hatch_y:64,pearl_hatch_z:-20}]})},
    getRegistry:() => ({load:async () => {},list:() => [loaderAccount]}),
    getManager:() => ({get:() => runtime,recreate:async () => {}}),
    movementsFactory:() => ({}),
    navigationSettleMs:1,
    interactionSettleMs:5,
    interactionTimeoutMs:100,
    readyTimeoutMs:1_000
  });

  await feature.handlePrimaryWhisper('bdiev_','Load');
  assert.equal(await feature.handleLoaderWhisper(loaderAccount.id,'bdiev_','Yes'),true);
  assert.equal(feature.getStatus().stage,'waiting_visibility','a delayed block update must not fail the request');
  assert.equal(open,false);
  assert.equal(activations,1,'confirmation polling must not toggle the trapdoor twice');
  feature.dispose();
}

async function testNavigationTimeout() {
  let pathStops = 0;
  let runtimeStops = 0;
  const chats = [];
  const replies = [];
  const bot = {
    entity:{position:new Vec3(0,64,0),eyeHeight:1.62},
    entities:{},
    pathfinder:{
      setMovements() {},
      goto:() => new Promise(() => {}),
      stop:() => { pathStops += 1; }
    },
    async waitForChunksToLoad() {},
    clearControlStates() {},
    chat:message => chats.push(message)
  };
  const runtime = new EventEmitter();
  runtime.bot = bot;
  runtime.assignTask = () => {};
  runtime.stop = async () => { runtimeStops += 1; runtime.bot = null; };
  const feature = createPearlLoaderFeature({
    pool:{query:async () => ({rows:[{username:'Blocked',pearl_hatch_x:10,pearl_hatch_y:64,pearl_hatch_z:-20}]})},
    getRegistry:() => ({load:async () => {},list:() => [loaderAccount]}),
    getManager:() => ({get:() => runtime,recreate:async () => {}}),
    sendPrimaryWhisper:async (username,message) => replies.push({username,message}),
    movementsFactory:() => ({}),
    navigationTimeoutMs:10,
    navigationAttempts:2,
    navigationSettleMs:1
  });

  await feature.handlePrimaryWhisper('Blocked','Load');
  assert.equal(pathStops,2,'a stuck path is stopped after every bounded attempt');
  assert.equal(runtimeStops,1,'the loader disconnects instead of remaining AFK after navigation failure');
  assert.deepEqual(chats,[],'the ready prompt is never sent before reaching the hatch');
  assert.match(replies[0].message,/could not approach the trapdoor/i);
  assert.deepEqual(feature.getStatus(),{active:false});
}

async function testMissingEnderPearl() {
  const chats = [];
  const bot = {
    entity:{position:new Vec3(9,64,-20),eyeHeight:1.62},
    entities:{},
    world:{raycast:() => ({position:new Vec3(10,64,-20)})},
    pathfinder:{setMovements() {},async goto() {}},
    async waitForChunksToLoad() {},
    blockAt:() => ({name:'oak_trapdoor',position:new Vec3(10,64,-20),getProperties:() => ({open:true})}),
    canSeeBlock:() => true,
    chat:message => chats.push(message)
  };
  const runtime = new EventEmitter();
  runtime.bot = bot;
  runtime.assignTask = () => {};
  let stopped = 0;
  runtime.stop = async reason => { stopped += 1; runtime.stopReason = reason; runtime.bot = null; };
  const feature = createPearlLoaderFeature({
    pool:{query:async () => ({rows:[{username:'bdiev_',pearl_hatch_x:10,pearl_hatch_y:64,pearl_hatch_z:-20}]})},
    getRegistry:() => ({load:async () => {},list:() => [loaderAccount]}),
    getManager:() => ({get:() => runtime,recreate:async () => {}}),
    movementsFactory:() => ({})
  });

  await feature.handlePrimaryWhisper('bdiev_','Load');
  assert.deepEqual(chats,['/w bdiev_ Your ender pearl is not set.']);
  assert.deepEqual(feature.getStatus(),{active:false});
  assert.equal(stopped,1,'the Loader disconnects when no pearl is installed');
  assert.equal(runtime.stopReason,'Pearl Loader ender pearl is not set');
}

function testEnderPearlRadius() {
  const hatch = {x:10,y:64,z:-20};
  const center = new Vec3(10.5,64.5,-19.5);
  assert.equal(hasEnderPearlNear({entities:{pearl:{name:'ender_pearl',position:center.offset(2,0,0)}}},hatch),true,
    'a thrown pearl exactly two blocks away is accepted');
  assert.equal(hasEnderPearlNear({entities:{pearl:{name:'ender_pearl',position:center.offset(2.01,0,0)}}},hatch),false,
    'a thrown pearl outside the two-block radius is rejected');
  assert.equal(hasEnderPearlNear({entities:{item:{name:'item',displayName:'Ender Pearl',position:center}}},hatch),false,
    'a dropped pearl item is not mistaken for a thrown pearl');
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
  testTrapdoorInteractionFaces();
  await testCompleteCycle();
  await testDelayedTrapdoorUpdate();
  await testNavigationTimeout();
  await testMissingEnderPearl();
  testEnderPearlRadius();
  await testMissingCoordinates();
  testRestrictedRuntimeModules();
  await testLoaderRuntimeWhispers();
  console.log('Pearl Loader feature tests passed.');
})().catch(error => { console.error(error); process.exitCode=1; });
