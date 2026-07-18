'use strict';

const net = require('node:net');
const path = require('node:path');

class ConfigValidationError extends Error {
  constructor(errors) {
    super(`Invalid configuration:\n${errors.map(error => `- ${error}`).join('\n')}`);
    this.name = 'ConfigValidationError';
    this.code = 'INVALID_CONFIGURATION';
    this.errors = [...errors];
  }
}

function createReader(env, errors, strict) {
  const text = (name, { required = false, fallback = '' } = {}) => {
    const value = String(env[name] ?? '').trim();
    if (!value && required && strict) errors.push(`${name} is required.`);
    return value || fallback;
  };

  const secret = (name, options = {}) => text(name, options);

  const integer = (name, { required = false, fallback, min, max, allowed } = {}) => {
    const raw = String(env[name] ?? '').trim();
    if (!raw) {
      if (required && strict) errors.push(`${name} is required.`);
      return fallback;
    }
    if (!/^-?\d+$/.test(raw)) {
      errors.push(`${name} must be an integer.`);
      return fallback;
    }
    const value = Number(raw);
    if (!Number.isSafeInteger(value)) errors.push(`${name} must be a safe integer.`);
    else if (min != null && value < min) errors.push(`${name} must be at least ${min}.`);
    else if (max != null && value > max) errors.push(`${name} must be at most ${max}.`);
    else if (allowed && !allowed.includes(value)) errors.push(`${name} must be one of: ${allowed.join(', ')}.`);
    return value;
  };

  const boolean = (name, { fallback = false } = {}) => {
    const raw = String(env[name] ?? '').trim().toLowerCase();
    if (!raw) return fallback;
    if (raw === 'true') return true;
    if (raw === 'false') return false;
    errors.push(`${name} must be either true or false.`);
    return fallback;
  };

  const url = (name, { required = false, fallback = null, protocols = ['http:', 'https:'] } = {}) => {
    const raw = text(name, { required });
    if (!raw) return fallback;
    try {
      const parsed = new URL(raw);
      if (!protocols.includes(parsed.protocol)) throw new Error('protocol');
      return parsed.toString().replace(/\/$/, '');
    } catch {
      errors.push(`${name} must be a valid ${protocols.map(value => value.slice(0, -1)).join('/')} URL.`);
      return fallback;
    }
  };

  const discordId = (name, { required = false } = {}) => {
    const value = text(name, { required });
    if (value && !/^\d{17,20}$/.test(value)) errors.push(`${name} must be a 17-20 digit Discord ID.`);
    return value || null;
  };

  const minecraftUsername = (name, { required = false, fallback = '' } = {}) => {
    const value = text(name, { required, fallback });
    if (value && !/^[A-Za-z0-9_]{3,16}$/.test(value)) {
      errors.push(`${name} must be a 3-16 character Minecraft username using letters, numbers, or underscore.`);
    }
    return value;
  };

  const siteUsername = (name, { required = false } = {}) => {
    const value = text(name, { required });
    if (value && !/^[A-Za-z0-9_.-]{2,64}$/.test(value)) {
      errors.push(`${name} must be 2-64 characters using letters, numbers, dot, dash, or underscore.`);
    }
    return value;
  };

  return { boolean, discordId, integer, minecraftUsername, secret, siteUsername, text, url };
}

function validateHost(value) {
  if (net.isIP(value)) return true;
  if (!value || value.length > 253 || /[\s/:]/.test(value)) return false;
  return value.split('.').every(label => /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/.test(label));
}

function parseJsonSecret(raw, name, errors) {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw);
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('shape');
    return value;
  } catch {
    errors.push(`${name} must contain a valid JSON object.`);
    return null;
  }
}

function createRedactor(secretValues) {
  const secrets = secretValues.filter(value => typeof value === 'string' && value.length >= 4);
  return value => secrets.reduce(
    (result, secretValue) => result.split(secretValue).join('[REDACTED]'),
    String(value ?? '')
  );
}

function collectNestedSecretStrings(value, output = []) {
  if (typeof value === 'string') output.push(value);
  else if (Array.isArray(value)) value.forEach(item => collectNestedSecretStrings(item, output));
  else if (value && typeof value === 'object') Object.values(value).forEach(item => collectNestedSecretStrings(item, output));
  return output;
}

function loadConfig(env = process.env, { profile = 'bot', strict = true } = {}) {
  const errors = [];
  const read = createReader(env, errors, strict);
  const botProfile = profile === 'bot';
  const siteProfile = profile === 'site';
  const adminProfile = profile === 'admin-cli';
  if (!botProfile && !siteProfile && !adminProfile) throw new Error(`Unknown configuration profile: ${profile}`);

  const databaseUrl = read.url('DATABASE_URL', {
    required: botProfile || siteProfile || adminProfile,
    protocols: ['postgres:', 'postgresql:']
  });

  const minecraftHost = read.text('MINECRAFT_HOST', { required: botProfile, fallback: strict ? '' : 'localhost' });
  if (minecraftHost && !validateHost(minecraftHost)) errors.push('MINECRAFT_HOST must be a valid hostname or IP address without a protocol or port.');
  const minecraftAuth = read.text('MINECRAFT_AUTH', { required: botProfile, fallback: 'microsoft' }).toLowerCase();
  if (!['microsoft', 'mojang', 'offline'].includes(minecraftAuth)) {
    errors.push('MINECRAFT_AUTH must be one of: microsoft, mojang, offline.');
  }

  const sessionRaw = read.secret('MINECRAFT_SESSION');
  const geminiModels = [env.GEMINI_MODELS, env.GEMINI_MODEL, env.GEMINI_FALLBACK_MODEL, 'gemini-2.5-flash-lite']
    .flatMap(value => String(value || '').split(','))
    .map(value => value.trim())
    .filter((value, index, values) => value && values.indexOf(value) === index);

  const config = {
    profile,
    database: { url: databaseUrl },
    discord: {
      token: read.secret('DISCORD_BOT_TOKEN', { required: botProfile }),
      channelId: read.discordId('DISCORD_CHANNEL_ID', { required: botProfile }),
      chatChannelId: read.discordId('DISCORD_CHAT_CHANNEL_ID', { required: botProfile }),
      dmCategoryId: read.discordId('DISCORD_DM_CATEGORY_ID', { required: botProfile }),
      ownerId: read.discordId('DISCORD_OWNER_ID', { required: botProfile }),
      loginRetryMs: read.integer('DISCORD_LOGIN_RETRY_MS', { fallback: 15_000, min: 1_000, max: 600_000 }),
      attachmentLimitBytes: read.integer('DISCORD_ATTACHMENT_LIMIT_BYTES', {
        fallback: 24 * 1024 * 1024, min: 1_048_576, max: 25 * 1024 * 1024
      })
    },
    minecraft: {
      host: minecraftHost,
      port: read.integer('MINECRAFT_PORT', { required: botProfile, fallback: 25565, min: 1, max: 65535 }),
      username: read.minecraftUsername('MINECRAFT_USERNAME', { required: botProfile, fallback: strict ? '' : 'WheatMagnate' }),
      adminUsername: read.minecraftUsername('MINECRAFT_ADMIN_USERNAME', { required: botProfile, fallback: strict ? '' : 'Admin' }),
      commandBotUsername: read.minecraftUsername('MINECRAFT_COMMAND_BOT_USERNAME', { required: botProfile, fallback: strict ? '' : 'CommandBot' }),
      auth: minecraftAuth,
      serverName: read.text('MINECRAFT_SERVER_NAME', { fallback: minecraftHost || 'Minecraft server' }),
      profilesFolder: path.resolve(read.text('MINECRAFT_PROFILES_FOLDER', { fallback: path.join('data', 'auth-cache') })),
      session: parseJsonSecret(sessionRaw, 'MINECRAFT_SESSION', errors),
      reconnectTimeoutMs: read.integer('MINECRAFT_RECONNECT_TIMEOUT_MS', { fallback: 15_000, min: 1_000, max: 3_600_000 }),
      connectTimeoutMs: read.integer('MINECRAFT_CONNECT_TIMEOUT_MS', { fallback: 20_000, min: 1_000, max: 300_000 }),
      privateMessageLength: read.integer('MINECRAFT_PRIVATE_MESSAGE_LENGTH', { fallback: 180, min: 32, max: 256 })
    },
    farm: {
      target: {
        x: read.integer('FARM_TARGET_X', { required: botProfile, fallback: 0, min: -30_000_000, max: 30_000_000 }),
        y: read.integer('FARM_TARGET_Y', { required: botProfile, fallback: 64, min: -2048, max: 2048 }),
        z: read.integer('FARM_TARGET_Z', { required: botProfile, fallback: 0, min: -30_000_000, max: 30_000_000 })
      },
      radius: read.integer('FARM_CAULDRON_RADIUS', { required: botProfile, fallback: 5, allowed: [4, 5, 6] }),
      statsUpdateIntervalMs: read.integer('FARM_STATS_UPDATE_INTERVAL_MS', { fallback: 30_000, min: 1_000, max: 3_600_000 }),
      statsWatchdogIntervalMs: read.integer('FARM_STATS_WATCHDOG_INTERVAL_MS', { fallback: 300_000, min: 10_000, max: 86_400_000 })
    },
    gemini: {
      apiKey: read.secret('GEMINI_API_KEY'),
      models: geminiModels,
      enabled: read.boolean('GEMINI_ENABLED', { fallback: true })
    },
    runtime: {
      ignoredChatUsernames: read.text('IGNORED_CHAT_USERNAMES').split(',').map(value => value.trim().toLowerCase()).filter(Boolean),
      defaultSiteWhisperUsername: read.minecraftUsername('DEFAULT_SITE_WHISPER_USERNAME', { required: botProfile, fallback: strict ? '' : 'WheatMagnate' }),
      dangerRadius: read.integer('DANGER_RADIUS_BLOCKS', { fallback: 300, allowed: [100, 200, 300, 500, 1000] }),
      whitelistMode: read.boolean('WHITELIST_MODE', { fallback: true }),
      autoEat: read.boolean('AUTO_EAT', { fallback: true }),
      childPublicSpeech: read.boolean('CHILD_PUBLIC_SPEECH', { fallback: true }),
      commandCooldownMs: read.integer('WM_COMMAND_COOLDOWN_MS', { fallback: 20_000, allowed: [0, 5000, 10_000, 20_000, 60_000] }),
      debugLogs: read.boolean('DEBUG_LOGS', { fallback: false }),
      disabled: read.boolean('DISABLE_BOT', { fallback: false }),
      testMode: read.boolean('BOT_TEST_MODE', { fallback: false }),
      healthPort: read.integer('BOT_HEALTH_PORT', { fallback: 3090, min: 1, max: 65535 }),
      growingChildDatabasePath: read.text('GROWING_CHILD_DATABASE_PATH', { fallback: 'data/growing_child.sqlite' })
    },
    limits: {
      questionLength: read.integer('WM_MAX_QUESTION_LENGTH', { fallback: 300, min: 32, max: 2000 }),
      responseLength: read.integer('WM_MAX_RESPONSE_LENGTH', { fallback: 900, min: 64, max: 4000 }),
      outputTokens: read.integer('WM_MAX_OUTPUT_TOKENS', { fallback: 300, min: 32, max: 4096 }),
      chatChunkLength: read.integer('WM_CHAT_CHUNK_LENGTH', { fallback: 190, min: 32, max: 256 }),
      whisperTtlMs: read.integer('WHISPER_TTL_MS', { fallback: 600_000, min: 1_000, max: 86_400_000 }),
      whisperMarkTtlMs: read.integer('WHISPER_MARK_TTL_MS', { fallback: 3_000, min: 100, max: 60_000 }),
      pendingChatDelayMs: read.integer('PENDING_CHAT_DELAY_MS', { fallback: 1_500, min: 0, max: 60_000 }),
      outboundWhisperTtlMs: read.integer('OUTBOUND_WHISPER_TTL_MS', { fallback: 5_000, min: 100, max: 60_000 }),
      siteWhisperTtlMs: read.integer('SITE_WHISPER_TTL_MS', { fallback: 600_000, min: 1_000, max: 86_400_000 })
    },
    site: {
      port: read.integer('SITE_PORT', { required: siteProfile, fallback: 3080, min: 1, max: 65535 }),
      adminUsername: read.siteUsername('SITE_ADMIN_USERNAME', { required: adminProfile }),
      adminPassword: read.secret(adminProfile ? 'SITE_ADMIN_CLI_PASSWORD' : 'SITE_ADMIN_PASSWORD', { required: adminProfile }),
      publicOrigin: read.url('SITE_PUBLIC_ORIGIN', { required: siteProfile, fallback: 'http://localhost:3080' }),
      trustProxy: read.boolean('SITE_TRUST_PROXY', { fallback: false }),
      cookieSecure: String(env.NODE_ENV || '').toLowerCase() === 'production' || read.boolean('SITE_COOKIE_SECURE', { fallback: false }),
      sessionMaxAgeSeconds: read.integer('SITE_SESSION_MAX_AGE_SECONDS', { fallback: 2_592_000, min: 300, max: 31_536_000 }),
      loginRateLimit: {
        maxAttempts: read.integer('SITE_LOGIN_MAX_ATTEMPTS', { fallback: 20, min: 1, max: 10_000 }),
        maxFailures: read.integer('SITE_LOGIN_MAX_FAILURES', { fallback: 5, min: 1, max: 100 }),
        windowMs: read.integer('SITE_LOGIN_WINDOW_SECONDS', { fallback: 900, min: 1, max: 86_400 }) * 1000,
        blockMs: read.integer('SITE_LOGIN_BLOCK_SECONDS', { fallback: 900, min: 1, max: 604_800 }) * 1000
      },
      registerRateLimit: {
        maxAttempts: read.integer('SITE_REGISTER_MAX_ATTEMPTS', { fallback: 10, min: 1, max: 10_000 }),
        maxFailures: read.integer('SITE_REGISTER_MAX_FAILURES', { fallback: 5, min: 1, max: 100 }),
        windowMs: read.integer('SITE_REGISTER_WINDOW_SECONDS', { fallback: 3600, min: 1, max: 604_800 }) * 1000,
        blockMs: read.integer('SITE_REGISTER_BLOCK_SECONDS', { fallback: 1800, min: 1, max: 604_800 }) * 1000
      }
    }
  };

  let databasePassword = '';
  try {
    databasePassword = decodeURIComponent(new URL(String(env.DATABASE_URL || '')).password);
  } catch {}
  config.redact = createRedactor([
    env.DATABASE_URL,
    databasePassword,
    env.DISCORD_BOT_TOKEN,
    env.GEMINI_API_KEY,
    env.MINECRAFT_SESSION,
    env.SITE_ADMIN_PASSWORD,
    env.SITE_ADMIN_CLI_PASSWORD,
    ...collectNestedSecretStrings(config.minecraft.session)
  ]);

  if (config.site.loginRateLimit.maxFailures > config.site.loginRateLimit.maxAttempts) {
    errors.push('SITE_LOGIN_MAX_FAILURES cannot exceed SITE_LOGIN_MAX_ATTEMPTS.');
  }
  if (config.site.registerRateLimit.maxFailures > config.site.registerRateLimit.maxAttempts) {
    errors.push('SITE_REGISTER_MAX_FAILURES cannot exceed SITE_REGISTER_MAX_ATTEMPTS.');
  }
  if (siteProfile && Boolean(config.site.adminUsername) !== Boolean(config.site.adminPassword)) {
    errors.push('SITE_ADMIN_USERNAME and SITE_ADMIN_PASSWORD must either both be set or both be omitted.');
  }
  if (
    (siteProfile || adminProfile) &&
    config.site.adminPassword &&
    (config.site.adminPassword.length < 6 || config.site.adminPassword.length > 256)
  ) {
    errors.push(`${adminProfile ? 'SITE_ADMIN_CLI_PASSWORD' : 'SITE_ADMIN_PASSWORD'} must be between 6 and 256 characters.`);
  }
  if (config.site.publicOrigin) {
    const parsedOrigin = new URL(config.site.publicOrigin);
    if (config.site.publicOrigin !== parsedOrigin.origin) {
      errors.push('SITE_PUBLIC_ORIGIN must contain only the origin (scheme, host, and optional port), without a path.');
    }
  }
  if (errors.length) throw new ConfigValidationError(errors);
  return Object.freeze(config);
}

const loadBotConfig = (env = process.env, options = {}) => loadConfig(env, { profile: 'bot', ...options });
const loadSiteConfig = (env = process.env, options = {}) => loadConfig(env, { profile: 'site', ...options });
const loadAdminCliConfig = (env = process.env, options = {}) => loadConfig(env, { profile: 'admin-cli', ...options });

module.exports = {
  ConfigValidationError,
  collectNestedSecretStrings,
  createRedactor,
  loadAdminCliConfig,
  loadBotConfig,
  loadConfig,
  loadSiteConfig,
  validateHost
};
