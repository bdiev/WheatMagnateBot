'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { dashedMinecraftUuid,resolveMinecraftProfile } = require('../minecraft/profile-identity');
const siteProfileIdentity = require('../site/player-profile-identity');

(async () => {
  const profile = await resolveMinecraftProfile('gerald0mc', {
    fetchImpl: async url => {
      assert.match(String(url), /users\/profiles\/minecraft\/gerald0mc$/);
      return {
        ok:true,
        status:200,
        json:async () => ({ id:'6714531a1c69438eb7d6d6d41ca6838b',name:'gerald0mc' })
      };
    }
  });

  assert.deepEqual(profile, {
    id:'6714531a1c69438eb7d6d6d41ca6838b',
    name:'gerald0mc'
  });
  assert.equal(
    dashedMinecraftUuid(profile.id),
    '6714531a-1c69-438e-b7d6-d6d41ca6838b'
  );
  assert.equal(await resolveMinecraftProfile('not a player'), null);
  assert.equal(
    siteProfileIdentity.dashedMinecraftUuid(profile.id),
    '6714531a-1c69-438e-b7d6-d6d41ca6838b'
  );

  const botSource = fs.readFileSync(path.join(__dirname, '..', 'bot.js'), 'utf8');
  for (const source of ['whitelist add', 'playtime update', '!pt import', '!jd import', '!messages import', '!seen import']) {
    assert.match(
      botSource,
      new RegExp(`ensureMinecraftProfileIdentity\\([^\\n]+source:'${source.replace(/[!]/g, '\\!')}'`),
      `${source} must resolve a UUID before it can create player data`
    );
  }
  assert.match(botSource, /setInterval\(\(\) => \{[\s\S]*backfillExistingPlayerProfiles\(\)[\s\S]*6 \* 60 \* 60 \* 1000/);

  const siteSource = fs.readFileSync(path.join(__dirname, '..', 'site', 'server.js'), 'utf8');
  assert.match(siteSource, /ensureSiteMinecraftProfileIdentity\(username, 'admin playtime update'\)/);
  assert.match(siteSource, /ensureSiteMinecraftProfileIdentity\(username, 'admin registration-date update'\)/);
  console.log('minecraft profile identity tests passed');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
