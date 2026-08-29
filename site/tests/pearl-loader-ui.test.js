'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname,'..','..');
const html = fs.readFileSync(path.join(root,'site','public','index.html'),'utf8');
const app = fs.readFileSync(path.join(root,'site','public','app.js'),'utf8');
const server = fs.readFileSync(path.join(root,'site','server.js'),'utf8');
const bot = fs.readFileSync(path.join(root,'bot.js'),'utf8');
const botMigration = fs.readFileSync(path.join(root,'database','migrations','040_pearl_loader.sql'),'utf8');
const siteMigration = fs.readFileSync(path.join(root,'site','migrations','040_pearl_loader.sql'),'utf8');

assert.equal(botMigration,siteMigration,'the bot and site must install the same Pearl Loader schema');
assert.match(html,/name="role"[\s\S]*value="pearl_loader">Pearl Loader/);
assert.match(html,/id="adminPlayerPearlHatchX"[\s\S]*id="adminPlayerPearlHatchY"[\s\S]*id="adminPlayerPearlHatchZ"/);
assert.match(app,/role:data\.get\('role'\)/);
assert.match(app,/patch\.pearlHatch = values\.pearlHatch/);
assert.match(server,/Only one bot can have the Pearl Loader role/);
assert.match(server,/Pearl Loader can connect only in response to a player Load request/);
assert.match(bot,/accounts[\s\S]*\.filter\(item => item\.enabled && !item\.isDefault\)[\s\S]*\.filter\(item => item\.role !== PEARL_LOADER_ROLE\)/,
  'Pearl Loader must not auto-start with managed accounts');
assert.match(botMigration,/UNIQUE INDEX[\s\S]*role = 'pearl_loader'/i);
console.log('Pearl Loader admin UI tests passed.');
