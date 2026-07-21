'use strict';

const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const path = require('node:path');
const { AccountRegistry } = require('../site/accounts/account-registry');
const { ActiveAccountContext } = require('../site/accounts/active-account-context');
const { MinecraftBotRuntime } = require('../site/accounts/minecraft-bot-runtime');
const { BotManager } = require('../site/accounts/bot-manager');

class MemoryRepository {
  constructor(accounts=[]) { this.accounts=accounts.map(item=>({...item})); }
  async list(){return this.accounts.map(item=>({...item}));}
  async create(input){const account={id:input.id,sortOrder:this.accounts.length,isDefault:!this.accounts.length,...input};this.accounts.push(account);return {...account};}
  async update(id,changes){const account=this.accounts.find(item=>item.id===id);Object.assign(account,changes);return {...account};}
  async remove(id){const index=this.accounts.findIndex(item=>item.id===id);return index<0?null:this.accounts.splice(index,1)[0];}
}

const first={id:'00000000-0000-4000-8000-000000000001',username:'FirstBot',displayName:'First',host:'one.test',port:25565,authType:'microsoft',enabled:true,sortOrder:0,isDefault:true,reconnectBackoffMs:5000};
const second={id:'00000000-0000-4000-8000-000000000002',username:'SecondBot',displayName:'Second',host:'two.test',port:25566,authType:'microsoft',enabled:true,sortOrder:1,isDefault:false,reconnectBackoffMs:6000};

async function main(){
  const repository=new MemoryRepository([first]); const registry=new AccountRegistry(repository); await registry.load();
  await registry.add(second); assert.equal(registry.list().length,2,'second account is added');
  const context=new ActiveAccountContext(registry); assert.equal(context.current().id,first.id); context.select(second.id); assert.equal(context.current().id,second.id); await registry.remove(second.id); assert.equal(context.current().id,first.id,'deleted selection falls back to first account');

  await registry.add(second); const bots=[]; const factoryOptions=[];
  const manager=new BotManager({registry,startDelayMs:0,maxConcurrentBots:2,runtimeFactory:account=>new MinecraftBotRuntime({account,authCacheRoot:path.join('data','auth-cache'),botFactory:options=>{factoryOptions.push(options);const bot=new EventEmitter();bot.quit=()=>{};bots.push(bot);return bot;}})});
  const [a,b]=await Promise.all([manager.start(first.id),manager.start(second.id)]); assert.equal(a.accountId,first.id);assert.equal(b.accountId,second.id);assert.equal(bots.length,2,'runtimes do not share Mineflayer instances');
  assert.notEqual(factoryOptions[0].profilesFolder,factoryOptions[1].profilesFolder,'auth-cache directories are isolated');
  const firstRuntime=manager.get(first.id); const secondRuntime=manager.get(second.id); assert.notEqual(firstRuntime.intervals,secondRuntime.intervals,'timer collections are isolated');
  const duplicate=await Promise.all([manager.start(first.id),manager.start(first.id)]); assert.equal(bots.length,2,'concurrent starts do not create duplicate runtimes'); assert.equal(duplicate[0].accountId,first.id);
  bots[1].username='RenamedSecondBot'; bots[1].emit('spawn'); assert.equal(secondRuntime.status,'connected','runtime accepts a renamed profile under the same immutable account ID'); assert.equal(secondRuntime.account.username,'RenamedSecondBot');
  firstRuntime.assignTask('obsidian'); secondRuntime.assignTask('follow'); assert.equal(firstRuntime.task,'obsidian');assert.equal(secondRuntime.task,'follow');
  await manager.shutdown(); assert.equal(firstRuntime.status,'stopped');assert.equal(secondRuntime.status,'stopped');
  const publicStatus=firstRuntime.getStatus(); assert.equal(Object.hasOwn(publicStatus,'authCachePath'),true); assert.equal(publicStatus.authCachePath,undefined,'status never exposes auth-cache path');

  let failedStarts=0;
  const retryRuntime=new MinecraftBotRuntime({account:second,reconnectBackoffMs:1000,botFactory:()=>{
    failedStarts += 1;
    throw new Error('temporary startup failure');
  }});
  await assert.rejects(retryRuntime.start(),/temporary startup failure/);
  assert.equal(retryRuntime.status,'connecting','a pre-Mineflayer startup failure enters the reconnect path');
  assert.ok(retryRuntime.reconnectTimer,'a pre-Mineflayer startup failure schedules a retry');
  assert.equal(failedStarts,1);
  await retryRuntime.stop();
  assert.equal(retryRuntime.reconnectTimer,null,'stopping cancels the startup retry');

  const safetyBot=new EventEmitter();
  safetyBot.username='SecondBot'; safetyBot.food=12;
  safetyBot.entity={position:{distanceTo:position=>position.distance}};
  safetyBot.entities={enemy:{type:'player',username:'Enemy',position:{distance:8}}};
  safetyBot.inventory={items:()=>[{name:'raw_beef'},{name:'golden_carrot'}]};
  let equipped=null; let consumed=0; let quitReason=null;
  safetyBot.equip=async item=>{equipped=item.name;}; safetyBot.consume=async()=>{consumed+=1;};
  safetyBot.quit=reason=>{quitReason=reason; safetyBot.emit('end',reason);};
  const safetyRuntime=new MinecraftBotRuntime({account:second,reconnectBackoffMs:1000,dangerRadius:32,isWhitelisted:name=>name==='Friend',botFactory:()=>safetyBot});
  await safetyRuntime.start(); safetyBot.emit('spawn');
  await safetyRuntime.runAfkChecks();
  assert.match(quitReason,/Enemy/,'an unwhitelisted nearby player causes an immediate disconnect');
  assert.equal(safetyRuntime.reconnectTimer,null,'a security disconnect cannot reconnect into the threat');
  assert.equal(safetyRuntime.status,'stopped');

  const foodBot=new EventEmitter();
  foodBot.username='SecondBot'; foodBot.food=12; foodBot.entity={position:{distanceTo:()=>100}}; foodBot.entities={};
  foodBot.inventory={items:()=>[{name:'raw_beef'},{name:'bread'},{name:'golden_carrot'}]};
  foodBot.equip=async item=>{equipped=item.name;}; foodBot.consume=async()=>{consumed+=1;}; foodBot.quit=()=>{};
  const foodRuntime=new MinecraftBotRuntime({account:second,botFactory:()=>foodBot});
  await foodRuntime.start(); foodBot.emit('spawn'); consumed=0; equipped=null;
  await foodRuntime.runAfkChecks();
  assert.equal(equipped,'golden_carrot','auto-eat selects the best safe food instead of raw food');
  assert.equal(consumed,1);
  await foodRuntime.stop();
  console.log('Multi-account tests passed.');
}

main().catch(error=>{console.error(error);process.exitCode=1;});
