'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');
const {
  ConfigValidationError,
  loadAdminCliConfig,
  loadBotConfig,
  loadSiteConfig
} = require('./index');

function validBotEnv() {
  return {
    DATABASE_URL: 'postgresql://bot:super-secret@db.example.test:5432/wheat',
    DISCORD_BOT_TOKEN: 'discord-secret-token',
    DISCORD_CHANNEL_ID: '123456789012345678',
    DISCORD_CHAT_CHANNEL_ID: '223456789012345678',
    DISCORD_DM_CATEGORY_ID: '323456789012345678',
    DISCORD_OWNER_ID: '423456789012345678',
    MINECRAFT_HOST: 'minecraft.example.test',
    MINECRAFT_PORT: '25565',
    MINECRAFT_USERNAME: 'WheatBot',
    MINECRAFT_ADMIN_USERNAME: 'ServerAdmin',
    MINECRAFT_COMMAND_BOT_USERNAME: 'CommandBot',
    MINECRAFT_AUTH: 'microsoft',
    DEFAULT_SITE_WHISPER_USERNAME: 'WhisperBot',
    FARM_TARGET_X: '1000',
    FARM_TARGET_Y: '64',
    FARM_TARGET_Z: '-2000',
    FARM_CAULDRON_RADIUS: '5'
  };
}

test('valid bot configuration is parsed into typed centralized settings', () => {
  const config = loadBotConfig({
    ...validBotEnv(),
    WHITELIST_MODE: 'false',
    MINECRAFT_RECONNECT_TIMEOUT_MS: '45000',
    SITE_PORT: '4000'
  });
  assert.equal(config.minecraft.port, 25565);
  assert.equal(config.minecraft.reconnectTimeoutMs, 45_000);
  assert.deepEqual(config.farm.target, { x: 1000, y: 64, z: -2000 });
  assert.equal(config.runtime.whitelistMode, false);
  assert.equal(config.discord.ownerId, '423456789012345678');
});

test('missing required bot variables are reported together without secret values', () => {
  assert.throws(
    () => loadBotConfig({ DISCORD_BOT_TOKEN: 'must-not-appear' }),
    error => {
      assert.ok(error instanceof ConfigValidationError);
      assert.match(error.message, /DATABASE_URL is required/);
      assert.match(error.message, /MINECRAFT_HOST is required/);
      assert.match(error.message, /DISCORD_OWNER_ID is required/);
      assert.doesNotMatch(error.message, /must-not-appear/);
      return true;
    }
  );
});

test('invalid booleans, URLs, Discord IDs, usernames and coordinates fail strictly', () => {
  assert.throws(
    () => loadBotConfig({
      ...validBotEnv(),
      DATABASE_URL: 'https://db.example.test/wheat',
      DISCORD_OWNER_ID: 'owner-id',
      MINECRAFT_USERNAME: 'bad name!',
      WHITELIST_MODE: 'yes',
      FARM_TARGET_X: '30000001',
      FARM_TARGET_Y: '64.5'
    }),
    error => {
      assert.match(error.message, /DATABASE_URL must be a valid postgres\/postgresql URL/);
      assert.match(error.message, /DISCORD_OWNER_ID must be a 17-20 digit Discord ID/);
      assert.match(error.message, /MINECRAFT_USERNAME must be a 3-16 character Minecraft username/);
      assert.match(error.message, /WHITELIST_MODE must be either true or false/);
      assert.match(error.message, /FARM_TARGET_X must be at most 30000000/);
      assert.match(error.message, /FARM_TARGET_Y must be an integer/);
      return true;
    }
  );
});

test('port, radius, auth mode and JSON session are validated', () => {
  assert.throws(
    () => loadBotConfig({
      ...validBotEnv(),
      MINECRAFT_PORT: '70000',
      MINECRAFT_AUTH: 'magic',
      FARM_CAULDRON_RADIUS: '20',
      MINECRAFT_SESSION: '{secret broken json'
    }),
    error => {
      assert.match(error.message, /MINECRAFT_PORT must be at most 65535/);
      assert.match(error.message, /MINECRAFT_AUTH must be one of/);
      assert.match(error.message, /FARM_CAULDRON_RADIUS must be one of: 4, 5, 6/);
      assert.match(error.message, /MINECRAFT_SESSION must contain a valid JSON object/);
      assert.doesNotMatch(error.message, /secret broken json/);
      return true;
    }
  );
});

test('site profile validates its own required settings independently', () => {
  const config = loadSiteConfig({
    DATABASE_URL: 'postgres://site:secret@db.example.test/site',
    SITE_PORT: '3080',
    SITE_ADMIN_USERNAME: 'site-admin',
    SITE_ADMIN_PASSWORD: 'strong-password',
    SITE_PUBLIC_ORIGIN: 'https://panel.example.test',
    SITE_COOKIE_SECURE: 'true'
  });
  assert.equal(config.site.port, 3080);
  assert.equal(config.site.adminUsername, 'site-admin');
  assert.equal(config.site.cookieSecure, true);
});

test('site administrator bootstrap credentials must be supplied as a pair', () => {
  assert.throws(
    () => loadSiteConfig({
      DATABASE_URL: 'postgres://site:secret@db.example.test/site',
      SITE_PORT: '3080',
      SITE_PUBLIC_ORIGIN: 'https://panel.example.test',
      SITE_ADMIN_USERNAME: 'site-admin'
    }),
    /SITE_ADMIN_USERNAME and SITE_ADMIN_PASSWORD must either both be set or both be omitted/
  );
});

test('admin CLI profile requires only database and CLI credentials', () => {
  const config = loadAdminCliConfig({
    DATABASE_URL: 'postgresql://admin:secret@db.example.test/site',
    SITE_ADMIN_USERNAME: 'admin',
    SITE_ADMIN_CLI_PASSWORD: 'one-time-secret'
  });
  assert.equal(config.site.adminUsername, 'admin');
  assert.equal(config.site.adminPassword, 'one-time-secret');
  assert.equal(config.discord.token, '');
});

test('known secrets are redacted before values are written to logs', () => {
  const config = loadBotConfig(validBotEnv());
  const message = config.redact(`failed password=super-secret ${validBotEnv().DATABASE_URL} token=${validBotEnv().DISCORD_BOT_TOKEN}`);
  assert.equal(message.includes('super-secret'), false);
  assert.equal(message.includes('discord-secret-token'), false);
  assert.match(message, /\[REDACTED\]/);
});

test('bot exits on invalid configuration before database, Discord, or Minecraft startup', () => {
  const root = path.resolve(__dirname, '..');
  const emptyRequired = {
    DATABASE_URL: '', DISCORD_BOT_TOKEN: '', DISCORD_CHANNEL_ID: '',
    DISCORD_CHAT_CHANNEL_ID: '', DISCORD_DM_CATEGORY_ID: '', DISCORD_OWNER_ID: '',
    MINECRAFT_HOST: '', MINECRAFT_PORT: '', MINECRAFT_USERNAME: '', MINECRAFT_AUTH: '',
    MINECRAFT_ADMIN_USERNAME: '', MINECRAFT_COMMAND_BOT_USERNAME: '',
    DEFAULT_SITE_WHISPER_USERNAME: '',
    FARM_TARGET_X: '', FARM_TARGET_Y: '', FARM_TARGET_Z: '', FARM_CAULDRON_RADIUS: ''
  };
  const result = spawnSync(process.execPath, ['bot.js'], {
    cwd: root,
    env: { ...process.env, ...emptyRequired },
    encoding: 'utf8',
    timeout: 5000
  });
  const output = `${result.stdout}\n${result.stderr}`;
  assert.equal(result.status, 1);
  assert.match(output, /\[Config\] Invalid configuration/);
  assert.doesNotMatch(output, /\[DB\]|Attempting to login|Starting Minecraft connection/);
});
