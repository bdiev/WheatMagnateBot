require('dotenv').config();
const mineflayer = require('mineflayer');
const fs = require('fs');
const { Client, GatewayIntentBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, ChannelType, PermissionsBitField, MessageFlags } = require('discord.js');
const { Pool } = require('pg');

// Base64 utils for Node.js (btoa/atob polyfill)
const b64encode = (str) => Buffer.from(String(str), 'utf8').toString('base64');
const b64decode = (str) => Buffer.from(String(str), 'base64').toString('utf8');

const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
const DISCORD_CHANNEL_ID = process.env.DISCORD_CHANNEL_ID;
const DISCORD_CHAT_CHANNEL_ID = process.env.DISCORD_CHAT_CHANNEL_ID;
const DISCORD_DM_CATEGORY_ID = process.env.DISCORD_DM_CATEGORY_ID;
const IGNORED_CHAT_USERNAMES = process.env.IGNORED_CHAT_USERNAMES ? process.env.IGNORED_CHAT_USERNAMES.split(',').map(u => u.trim().toLowerCase()) : [];

// Database connection
let pool = null;
if (process.env.DATABASE_URL) {
  console.log('[DB] Database URL found, attempting to connect...');
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });
  pool.on('error', (err) => {
    console.error('[DB] Unexpected error on idle client', err);
  });
  // Silenced DB successful connection log to reduce noise
  pool.on('connect', () => {});
} else {
  console.log('[DB] ❌ No DATABASE_URL environment variable found. Database features disabled.');
}

// Add a startup summary
console.log('=== DATABASE STATUS ===');
if (pool) {
  console.log('[DB] ✅ Database pool created');
  console.log('[DB] 🔄 Waiting for connection...');
} else {
  console.log('[DB] ❌ Database disabled - no connection URL');
}
console.log('======================');

let loadedSession = null;
if (process.env.MINECRAFT_SESSION) {
  try {
    loadedSession = JSON.parse(process.env.MINECRAFT_SESSION);
    console.log('[Bot] Loaded session from env.');
  } catch (err) {
    console.error('[Bot] Failed to parse session from env:', err.message);
  }
}

let lastCommandUser = null;
let statusMessage = null;
let statusUpdateInterval = null;
let isUpdatingStatus = false; // Prevent concurrent updates
let channelCleanerInterval = null;
let tpsHistory = [];
let realTps = null;
let lastTickTime = 0;
let mineflayerStarted = false;
let startTime = Date.now();
let whisperConversations = new Map(); // username -> messageId
let whisperChannels = new Map(); // key: `${ownerId}:${mcUsername}` -> channelId
let pendingWhisperClaims = new Map(); // key: mcUsernameLower -> { messageId, lastMessage }
let whisperCleanupTimers = new Map(); // channelId -> timeout handle
let lastDialogMessages = new Map(); // channelId -> messageId of last message with delete button
let whisperFooterUpdateIntervals = new Map(); // channelId -> interval handle for footer updates
let whisperDeleteTimestamps = new Map(); // channelId -> timestamp when channel will be deleted
let customDialogTTL = new Map(); // channelId -> custom TTL in ms (user-configured)
let recentWhispers = new Map(); // key: `WHISPER:username:message` -> timestamp, to mark whispers and suppress chat forwarding
let pendingChatTimers = new Map(); // key: `CHAT:username:message` -> timeout handle to delay chat forwarding
let outboundWhispers = new Map(); // key: `OUTBOUND:targetUsername:message` -> timestamp, to suppress public echo of our own whispers
let tpsTabInterval = null;
const excludedMessageIds = [];
const pendingAuthLinks = [];
const sentAuthCodes = new Set();
const authMessageIds = new Set();
// Track short-lived windows after a user issues a bang command (e.g., !pt)
// Used to reattribute bot-style responses that appear as if authored by the user
const pendingBotResponses = new Map(); // key: usernameLower -> { cmd, until }
const WHISPER_TTL_MS = 10 * 60 * 1000; // 10 minutes
const WHISPER_MARK_TTL_MS = 3000; // how long to remember whisper markers for suppression
const PENDING_CHAT_DELAY_MS = 400; // delay chat sends to detect whispers first
const OUTBOUND_WHISPER_TTL_MS = 5000; // suppression window for our own /msg echoes

// Debug logging (disabled by default). Enable by setting DEBUG_LOGS=true
const DEBUG_LOGS = String(process.env.DEBUG_LOGS || '').toLowerCase() === 'true';
function debugLog(...args) {
  if (DEBUG_LOGS) console.log(...args);
}

// Get the owner Discord user ID for a dialog channel
function getDialogOwnerId(channelId) {
  for (const [key, value] of whisperChannels.entries()) {
    if (value === channelId) {
      return key.split(':')[0];
    }
  }
  return null;
}

function saveStatusMessageId(id) {
  try {
    fs.writeFileSync('status_message_id.txt', id);
  } catch (e) {
    console.error('[Bot] Failed to save status message ID:', e.message);
  }
}

function loadStatusMessageId() {
  try {
    return fs.readFileSync('status_message_id.txt', 'utf8').trim();
  } catch (e) {
    return null;
  }
}

// Format remaining time for footer
function formatRemainingTime(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  
  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }
  return `${seconds}s`;
}

// Stop footer update interval for a channel
function stopFooterUpdates(channelId) {
  const existing = whisperFooterUpdateIntervals.get(channelId);
  if (existing) {
    clearInterval(existing);
    whisperFooterUpdateIntervals.delete(channelId);
  }
}

// Start footer update interval for a channel (updates plain message footer line)
function startFooterUpdates(channelId) {
  stopFooterUpdates(channelId);
  
  const interval = setInterval(async () => {
    try {
      const deleteTimestamp = whisperDeleteTimestamps.get(channelId);
      const lastMsgId = lastDialogMessages.get(channelId);
      
      if (!deleteTimestamp || !lastMsgId) {
        stopFooterUpdates(channelId);
        return;
      }
      
      const remaining = deleteTimestamp - Date.now();
      if (remaining <= 0) {
        stopFooterUpdates(channelId);
        return;
      }
      
      const ch = await discordClient.channels.fetch(channelId);
      if (!ch || !ch.isTextBased()) {
        stopFooterUpdates(channelId);
        return;
      }
      
      const msg = await ch.messages.fetch(lastMsgId);
      const parts = (msg.content || '').split('\n\n');
      const headerBody = parts[0] || '';
      const footerLine = `Auto-deletes in ${formatRemainingTime(remaining)}`;
      await msg.edit({ content: `${headerBody}\n\n${footerLine}` });
    } catch (e) {
      // Silent error - message might be deleted
      debugLog(`[Whisper] Footer update error:`, e.message);
      stopFooterUpdates(channelId);
    }
  }, 3000);
  
  whisperFooterUpdateIntervals.set(channelId, interval);
}

// Send a plain-text whisper message with auto-delete and live footer countdown
async function sendWhisperEmbed(channel, { senderLabel = 'Message', body, ttlMs = WHISPER_TTL_MS, addDeleteButton = true }) {
  // Use custom TTL if set for this channel
  const effectiveTTL = customDialogTTL.get(channel.id) || ttlMs;
  const deleteTimestamp = Date.now() + effectiveTTL;
  const firstLine = `[${senderLabel}] ${body}`;
  const footerLine = addDeleteButton ? `Auto-deletes in ${formatRemainingTime(effectiveTTL)}` : '';
  const content = addDeleteButton ? `${firstLine}\n\n${footerLine}` : firstLine;
  
  // Stop footer updates for previous message and remove its footer/button
  if (addDeleteButton && lastDialogMessages.has(channel.id)) {
    stopFooterUpdates(channel.id); // Stop the interval FIRST
    try {
      const prevMsgId = lastDialogMessages.get(channel.id);
      const prevMsg = await channel.messages.fetch(prevMsgId);
      const parts = (prevMsg.content || '').split('\n\n');
      const headerOnly = parts[0];
      await prevMsg.edit({ content: headerOnly, components: [] });
    } catch (e) {
      debugLog(`[Whisper] Failed to remove footer from previous message:`, e.message);
    }
  }

  const components = addDeleteButton ? buildDeleteDialogComponents(channel.id) : [];
  const message = await channel.send({ content, components });
  
  // Track this message as the last one with delete button
  if (addDeleteButton) {
    lastDialogMessages.set(channel.id, message.id);
    whisperDeleteTimestamps.set(channel.id, deleteTimestamp);
    startFooterUpdates(channel.id);
  }

  return message;
}

function removeWhisperChannelMappings(channelId) {
  for (const [key, value] of whisperChannels.entries()) {
    if (value === channelId) {
      whisperChannels.delete(key);
    }
  }
  lastDialogMessages.delete(channelId);
  stopFooterUpdates(channelId);
  whisperDeleteTimestamps.delete(channelId);
  customDialogTTL.delete(channelId);
}

function cancelWhisperCleanup(channelId) {
  const existing = whisperCleanupTimers.get(channelId);
  if (existing) {
    clearTimeout(existing);
    whisperCleanupTimers.delete(channelId);
  }
}

function scheduleWhisperCleanup(channelId, ttlMs = WHISPER_TTL_MS) {
  cancelWhisperCleanup(channelId);
  const timer = setTimeout(async () => {
    try {
      const channel = await discordClient.channels.fetch(channelId);
      if (channel && channel.deletable) {
        removeWhisperChannelMappings(channelId);
        await channel.delete('Dialog auto-deleted after inactivity');
      }
    } catch (e) {
      console.error('[Whisper] Failed to auto-delete dialog channel:', e.message);
    } finally {
      cancelWhisperCleanup(channelId);
    }
  }, ttlMs);

  whisperCleanupTimers.set(channelId, timer);
}

// Post or update a claim prompt in the status channel for unassigned whispers
async function sendWhisperClaimPrompt(mcUsername, body) {
  if (!DISCORD_CHANNEL_ID || !discordClient || !discordClient.isReady()) return;
  const mcKey = mcUsername.toLowerCase();
  const channel = await discordClient.channels.fetch(DISCORD_CHANNEL_ID);
  if (!channel || !channel.isTextBased()) return;

  const description = `New /msg from **${mcUsername}**\n> ${body}`;
  const components = [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`claim_whisper_${mcKey}`)
        .setLabel('Claim dialog')
        .setStyle(ButtonStyle.Success)
    )
  ];

  const existing = pendingWhisperClaims.get(mcKey);
  if (existing) {
    try {
      const msg = await channel.messages.fetch(existing.messageId);
      await msg.edit({
        embeds: [{
          title: 'New whisper from Minecraft',
          description,
          color: 16753920,
          timestamp: new Date()
        }],
        components
      });
      pendingWhisperClaims.set(mcKey, { messageId: msg.id, lastMessage: body });
      return;
    } catch (_) {
      pendingWhisperClaims.delete(mcKey);
    }
  }

  try {
    const msg = await channel.send({
      embeds: [{
        title: 'New whisper from Minecraft',
        description,
        color: 16753920,
        timestamp: new Date()
      }],
      components
    });
    pendingWhisperClaims.set(mcKey, { messageId: msg.id, lastMessage: body });
  } catch (e) {
    console.error('[Whisper] Failed to post claim prompt:', e.message);
  }
}

function buildDeleteDialogComponents(channelId) {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`delete_dialog_${channelId}`)
        .setLabel('Delete dialog')
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId(`set_ttl_${channelId}`)
        .setLabel('Set auto-delete time')
        .setStyle(ButtonStyle.Secondary)
    )
  ];
}

// Ensure or create a dedicated whisper channel for the requesting Discord user and target MC username
async function getOrCreateWhisperChannel(ownerId, ownerTag, mcUsername) {
  if (!discordClient || !discordClient.isReady()) return null;
  if (!DISCORD_DM_CATEGORY_ID) {
    console.error('[Whisper] DISCORD_DM_CATEGORY_ID not set. Cannot create private channel.');
    return null;
  }

  // Use status channel guild as reference
  const statusChannel = await discordClient.channels.fetch(DISCORD_CHANNEL_ID);
  if (!statusChannel || !statusChannel.guild) {
    console.error('[Whisper] Cannot resolve guild from status channel.');
    return null;
  }

  const guild = statusChannel.guild;
  const key = `${ownerId}:${mcUsername.toLowerCase()}`;

  if (whisperChannels.has(key)) {
    try {
      const existing = await guild.channels.fetch(whisperChannels.get(key));
      if (existing) return existing;
    } catch (_) {
      whisperChannels.delete(key);
    }
  }

  let parent;
  try {
    parent = await guild.channels.fetch(DISCORD_DM_CATEGORY_ID);
  } catch (err) {
    console.error('[Whisper] Failed to fetch category:', err.message);
    return null;
  }

  if (!parent || parent.type !== ChannelType.GuildCategory) {
    console.error('[Whisper] Provided DISCORD_DM_CATEGORY_ID is not a category.');
    return null;
  }

  const suffix = ownerId.slice(-4);
  const baseName = `dialog-${mcUsername}-${suffix}`
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/--+/g, '-')
    .slice(0, 90) || 'dialog';

  try {
    const channel = await guild.channels.create({
      name: baseName,
      type: ChannelType.GuildText,
      parent: parent.id,
      permissionOverwrites: [
        {
          id: guild.roles.everyone,
          deny: [PermissionsBitField.Flags.ViewChannel]
        },
        {
          id: ownerId,
          allow: [
            PermissionsBitField.Flags.ViewChannel,
            PermissionsBitField.Flags.SendMessages,
            PermissionsBitField.Flags.ReadMessageHistory
          ]
        },
        {
          id: discordClient.user.id,
          allow: [
            PermissionsBitField.Flags.ViewChannel,
            PermissionsBitField.Flags.SendMessages,
            PermissionsBitField.Flags.ReadMessageHistory
          ]
        }
      ]
    });

    whisperChannels.set(key, channel.id);
    console.log(`[Whisper] Created channel ${channel.name} for ${ownerTag} -> ${mcUsername}`);
    return channel;
  } catch (err) {
    console.error('[Whisper] Failed to create channel:', err.message);
    return null;
  }
}

// Ensure we reuse a single persistent Server Status message.
async function ensureStatusMessage() {
  if (!DISCORD_CHANNEL_ID || !discordClient || !discordClient.isReady()) return;
  try {
    const channel = await discordClient.channels.fetch(DISCORD_CHANNEL_ID);
    if (!channel || !channel.isTextBased()) return;

    // Try saved ID first
    const savedId = loadStatusMessageId();
    if (savedId && !statusMessage) {
      try {
        const existing = await channel.messages.fetch(savedId);
        statusMessage = existing;
        if (!excludedMessageIds.includes(statusMessage.id)) excludedMessageIds.push(statusMessage.id);
        return;
      } catch (e) {
        // Saved ID invalid, continue to scan
      }
    }

    // If still not set, scan recent messages for an embed titled 'Server Status'
    if (!statusMessage) {
      try {
        const recent = await channel.messages.fetch({ limit: 50 });
        const found = [...recent.values()].find(m => m.embeds[0]?.title === 'Server Status');
        if (found) {
          statusMessage = found;
          saveStatusMessageId(found.id);
          if (!excludedMessageIds.includes(found.id)) excludedMessageIds.push(found.id);
        }
      } catch {}
    }

    // If still not found, create a new one
    if (!statusMessage) {
      statusMessage = await channel.send({
        embeds: [{
          title: 'Server Status',
          description: getStatusDescription(),
          color: 65280,
          timestamp: new Date()
        }],
        components: createStatusButtons()
      });
      saveStatusMessageId(statusMessage.id);
      if (!excludedMessageIds.includes(statusMessage.id)) excludedMessageIds.push(statusMessage.id);
      // Try to pin for persistence across file resets
      try { await statusMessage.pin(); } catch {}
    }
  } catch (e) {
    console.error('[Discord] ensureStatusMessage failed:', e.message);
  }
}

const config = {
  host: 'oldfag.org',
  username: process.env.MINECRAFT_USERNAME || 'WheatMagnate',
  auth: process.env.MINECRAFT_AUTH || 'microsoft',
  version: false, // Auto-detect version
  session: loadedSession
};


function loadWhitelist() {
  try {
    const data = fs.readFileSync('whitelist.txt', 'utf8');
    return data
      .split('\n')
      .map(l => l.trim())
      .filter(l => l && !l.startsWith('#'));
  } catch (err) {
    sendDiscordNotification('Error loading whitelist: ' + err.message, 16711680);
    console.log('Error loading whitelist:', err.message);
    return [];
  }
}

async function loadWhitelistFromDB() {
  if (!pool) {
    console.log('[DB] ❌ Cannot load whitelist: database pool not available');
    return [];
  }
  try {
    const res = await pool.query('SELECT username FROM whitelist');
    const dbWhitelist = res.rows.map(row => row.username);
    return dbWhitelist;
  } catch (err) {
    console.error('[DB] ❌ Failed to load whitelist:', err.message);
    return [];
  }
}

async function migrateWhitelistToDB() {
  if (!pool) return;
  try {
    const fileWhitelist = loadWhitelist();
    for (const username of fileWhitelist) {
      await pool.query('INSERT INTO whitelist (username, added_by) VALUES ($1, $2) ON CONFLICT (username) DO NOTHING', [username, 'migration']);
    }
    console.log('[DB] Whitelist migrated to database');
  } catch (err) {
    console.error('[DB] Failed to migrate whitelist:', err.message);
  }
}

const ignoredUsernames = loadWhitelist();

// Load ignored chat usernames from DB
async function loadIgnoredChatUsernames() {
  if (!pool) {
    console.log('[DB] ❌ Cannot load ignored users: database pool not available');
    return IGNORED_CHAT_USERNAMES;
  }
  try {
    const res = await pool.query('SELECT username FROM ignored_users');
    const ignoredUsers = res.rows.map(row => row.username.toLowerCase());
    return ignoredUsers;
  } catch (err) {
    console.error('[DB] ❌ Failed to load ignored users:', err.message);
    return IGNORED_CHAT_USERNAMES;
  }
}

let ignoredChatUsernames = IGNORED_CHAT_USERNAMES; // Fallback

// Track player online status
async function updatePlayerActivity(username, isOnline) {
  if (!pool) return;
  
  try {
    const timestamp = new Date();
    if (isOnline) {
      // Player joined - set as online
      await pool.query(`
        INSERT INTO player_activity (username, last_seen, last_online, is_online)
        VALUES ($1, $2, $2, TRUE)
        ON CONFLICT (username)
        DO UPDATE SET last_seen = $2, last_online = $2, is_online = TRUE
      `, [username, timestamp]);
    } else {
      // Player left - set as offline with last_seen timestamp
      await pool.query(`
        INSERT INTO player_activity (username, last_seen, is_online)
        VALUES ($1, $2, FALSE)
        ON CONFLICT (username)
        DO UPDATE SET last_seen = $2, is_online = FALSE
      `, [username, timestamp]);
    }
  } catch (err) {
    // Silent error
  }
}

// Get last seen information for whitelist players
async function getWhitelistActivity() {
  if (!pool) {
    return { error: 'Database not configured' };
  }
  
  try {
    const result = await pool.query(`
      SELECT w.username, pa.last_seen, pa.last_online, pa.is_online
      FROM whitelist w
      LEFT JOIN player_activity pa ON LOWER(w.username) = LOWER(pa.username)
      ORDER BY 
        CASE WHEN pa.is_online = TRUE THEN 0 ELSE 1 END,
        CASE WHEN pa.is_online = TRUE THEN LOWER(w.username) END ASC,
        CASE WHEN pa.is_online = FALSE OR pa.is_online IS NULL THEN pa.last_seen END DESC NULLS LAST
    `);
    
    // Cross-check with actual online players from bot
    const actualOnlinePlayers = new Set();
    if (bot && bot.players) {
      for (const player of Object.values(bot.players)) {
        if (player.username) {
          actualOnlinePlayers.add(player.username.toLowerCase());
        }
      }
    }
    
    // Update is_online status based on actual bot data
    const players = result.rows.map(row => {
      const isActuallyOnline = actualOnlinePlayers.has(row.username.toLowerCase());
      return {
        ...row,
        is_online: isActuallyOnline
      };
    });
    
    // Sort again after updating online status
    players.sort((a, b) => {
      if (a.is_online && !b.is_online) return -1;
      if (!a.is_online && b.is_online) return 1;
      if (a.is_online && b.is_online) {
        return a.username.toLowerCase().localeCompare(b.username.toLowerCase());
      }
      // Both offline - sort by last_seen
      if (!a.last_seen && !b.last_seen) return 0;
      if (!a.last_seen) return 1;
      if (!b.last_seen) return -1;
      return new Date(b.last_seen) - new Date(a.last_seen);
    });
    
    return { players };
  } catch (err) {
    return { error: err.message };
  }
}

// Get mention keywords for checking mentions
async function getMentionKeywords() {
  if (!pool) return [];
  try {
    const res = await pool.query('SELECT discord_id, keyword FROM mention_keywords');
    return res.rows;
  } catch (err) {
    console.error('[DB] ❌ Failed to load mention keywords:', err.message);
    return [];
  }
}

// Add mention keyword for user
async function addMentionKeyword(discordId, keyword) {
  if (!pool) return { success: false, error: 'Database not configured' };
  try {
    await pool.query(
      'INSERT INTO mention_keywords (discord_id, keyword) VALUES ($1, $2) ON CONFLICT (discord_id, keyword) DO NOTHING',
      [discordId, keyword.toLowerCase()]
    );
    return { success: true };
  } catch (err) {
    console.error('[DB] ❌ Failed to add mention keyword:', err.message);
    return { success: false, error: err.message };
  }
}

// Remove mention keyword for user
async function removeMentionKeyword(discordId, keyword) {
  if (!pool) return { success: false, error: 'Database not configured' };
  try {
    const result = await pool.query(
      'DELETE FROM mention_keywords WHERE discord_id = $1 AND keyword = $2',
      [discordId, keyword.toLowerCase()]
    );
    return { success: true, removed: result.rowCount > 0 };
  } catch (err) {
    console.error('[DB] ❌ Failed to remove mention keyword:', err.message);
    return { success: false, error: err.message };
  }
}

// Get user's mention keywords
async function getUserMentionKeywords(discordId) {
  if (!pool) return { success: false, error: 'Database not configured' };
  try {
    const res = await pool.query(
      'SELECT keyword FROM mention_keywords WHERE discord_id = $1 ORDER BY keyword',
      [discordId]
    );
    return { success: true, keywords: res.rows.map(r => r.keyword) };
  } catch (err) {
    console.error('[DB] ❌ Failed to get user mention keywords:', err.message);
    return { success: false, error: err.message };
  }
}

// Initialize DB table and load ignored users
async function initDatabase() {
  if (!pool) {
    console.log('[DB] ❌ Database pool not available, skipping initialization.');
    return;
  }

  try {
    console.log('[DB] 🔧 Initializing database tables...');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS ignored_users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(255) UNIQUE NOT NULL,
        added_by VARCHAR(255),
        added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS whitelist (
        id SERIAL PRIMARY KEY,
        username VARCHAR(255) UNIQUE NOT NULL,
        added_by VARCHAR(255),
        added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS player_activity (
        id SERIAL PRIMARY KEY,
        username VARCHAR(255) UNIQUE NOT NULL,
        last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        last_online TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        is_online BOOLEAN DEFAULT FALSE
      )
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS mention_keywords (
        id SERIAL PRIMARY KEY,
        discord_id VARCHAR(255) NOT NULL,
        keyword VARCHAR(255) NOT NULL,
        added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(discord_id, keyword)
      )
    `);
    console.log('[DB] ✅ Tables initialized successfully.');

    console.log('[DB] 📖 Loading ignored users from database...');
    ignoredChatUsernames = await loadIgnoredChatUsernames();
    console.log(`[DB] 📖 Loaded ${ignoredChatUsernames.length} ignored users.`);

    // Load whitelist from DB into memory (if available)
    console.log('[DB] 📖 Loading whitelist from database...');
    const wl = await loadWhitelistFromDB();
    if (Array.isArray(wl) && wl.length > 0) {
      ignoredUsernames.length = 0;
      ignoredUsernames.push(...wl);
      console.log(`[DB] 📖 Loaded ${wl.length} whitelist entries.`);
    } else {
      console.log('[DB] 📖 No whitelist entries found in database.');
    }
  } catch (err) {
    console.error('[DB] ❌ Failed to initialize database:', err.message);
  }
}

// Discord bot client
const discordClient = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent]
});

if (DISCORD_BOT_TOKEN) {
  console.log('[Discord] Attempting to login with token...');
  discordClient.login(DISCORD_BOT_TOKEN)
    .then(() => {
      console.log('[Discord] Login promise resolved');
    })
    .catch(err => {
      console.error('[Discord] Login failed:', err.message);
      console.error('[Discord] Full error:', err);
    });

  // Debug event removed to reduce log noise

  discordClient.on('warn', message => {
    console.log(`[Discord WARN] ${message}`);
  });

  discordClient.on('error', error => {
    console.error('[Discord ERROR]', error);
  });

  // Update to shard-level events for discord.js v14
  discordClient.on('shardDisconnect', (event, shardId) => {
    console.log(`[Discord SHARD DISCONNECT] shard ${shardId}`, event);
  });

  discordClient.on('shardReconnecting', (shardId) => {
    console.log(`[Discord SHARD RECONNECTING] Attempting to reconnect shard ${shardId}...`);
  });

  discordClient.on('invalidated', () => {
    console.log('[Discord INVALIDATED] Session invalidated, need to reconnect');
  });

  // FIX: correct event name
  discordClient.on('ready', async () => {
    console.log(`[Discord] ✅ Bot logged in as ${discordClient.user.tag}`);
    console.log(`[Discord] Bot ID: ${discordClient.user.id}`);
    console.log(`[Discord] Guilds: ${discordClient.guilds.cache.size}`);

    try {
      discordClient.user.setPresence({ status: 'online' });
      console.log('[Discord] Presence set to online');
    } catch (presenceErr) {
      console.error('[Discord] Failed to set presence:', presenceErr.message);
    }

    // Check if we can see the configured channel
    try {
      const channel = await discordClient.channels.fetch(DISCORD_CHANNEL_ID);
      console.log(`[Discord] ✅ Channel found: ${channel.name} (${channel.id})`);
      console.log(`[Discord] Channel type: ${channel.type}`);
      console.log(`[Discord] Bot permissions in channel: ${channel.permissionsFor(discordClient.user).toArray().join(', ')}`);
    } catch (channelErr) {
      console.error('[Discord] ❌ Failed to fetch channel:', channelErr.message);
      console.error('[Discord] This means the bot cannot see the configured channel!');
    }

    await initDatabase();
    await migrateWhitelistToDB();
    // Reload whitelist after migration
    const wl = await loadWhitelistFromDB();
    if (Array.isArray(wl) && wl.length > 0) {
      ignoredUsernames.length = 0;
      ignoredUsernames.push(...wl);
    }
    if (!mineflayerStarted) {
      mineflayerStarted = true;
      createBot();
    }

    console.log('[Discord] Bot is ready and waiting for interactions...');

    // Start global status update interval (updates every 3 seconds)
    if (!statusUpdateInterval) {
      statusUpdateInterval = setInterval(updateStatusMessage, 3000);
      console.log('[Discord] Status update interval started');
    }

    // Flush any pending auth links captured before client was ready
    if (pendingAuthLinks.length > 0) {
      const links = pendingAuthLinks.splice(0);
      for (const url of links) {
        try { await sendAuthLinkToDiscord(url); } catch {}
      }
    }

    // Start channel cleaner
    if (!channelCleanerInterval) {
      channelCleanerInterval = setInterval(async () => {
        try {
          const channel = await discordClient.channels.fetch(DISCORD_CHANNEL_ID);
          if (channel && channel.isTextBased()) {
            const messages = await channel.messages.fetch({ limit: 100 });
            const twoWeeksAgo = Date.now() - 14 * 24 * 60 * 60 * 1000;
            const messagesToDelete = messages.filter(msg => {
              if (msg.id === statusMessage?.id) return false;
              if (excludedMessageIds.includes(msg.id)) return false;
              if (msg.createdTimestamp < twoWeeksAgo) return false; // cannot bulk delete older than 14 days
              const desc = msg.embeds[0]?.description || '';
              const lowerDesc = desc.toLowerCase();
              if (msg.embeds[0]?.title === 'New whisper from Minecraft') return false; // keep pending /msg claim cards
              // Don't delete death-related messages
              if (lowerDesc.includes('died') || lowerDesc.includes('death') || lowerDesc.includes('perished') || lowerDesc.includes('💀') || desc.includes(':skull:')) return false;
              // Don't delete HTML error summaries (e.g., 504)
              if (lowerDesc.includes('gateway timeout') || lowerDesc.includes('azure front door') || lowerDesc.includes('errorinfo:') || lowerDesc.includes('x-azure-ref')) return false;
              // Don't delete whisper messages and conversations
              if (desc.includes('💬') || lowerDesc.includes('whispered') || desc.includes('⬅️') || desc.includes('➡️') || (msg.embeds[0]?.title && msg.embeds[0].title.startsWith('Conversation with'))) return false;
              return true;
            });
            if (messagesToDelete.size > 0) {
              await channel.bulkDelete(messagesToDelete);
              console.log(`[Discord] Cleaned ${messagesToDelete.size} messages from channel.`);
            }
          }
        } catch (e) {
          console.error('[Discord] Failed to clean channel:', e.message);
        }
      }, 2 * 60 * 1000); // Every 2 minutes
    }
  });
} else {
  // No Discord, start Mineflayer directly
  mineflayerStarted = true;
  createBot();
}


// Function to get nearby players
function getNearbyPlayers() {
  if (!bot || !bot.entity) return [];
  const nearby = [];
  for (const entity of Object.values(bot.entities)) {
    if (!entity || entity.type !== 'player') continue;
    if (!entity.username || entity.username === bot.username) continue;
    if (!entity.position || !bot.entity.position) continue;
    const distance = bot.entity.position.distanceTo(entity.position);
    if (distance <= 300) {
      nearby.push({ username: entity.username, distance: Math.round(distance) });
    }
  }
  return nearby.sort((a, b) => a.distance - b.distance);
}



// Function to convert Minecraft chat component to plain text
function chatComponentToString(component) {
  if (typeof component === 'string') return component;
  if (!component || typeof component !== 'object') return '';

  let text = component.text || '';

  if (component.extra) {
    for (const extra of component.extra) {
      text += chatComponentToString(extra);
    }
  }
  
  // Handle translate components
  if (component.translate) {
    text += component.translate;
    if (component.with) {
      for (const w of component.with) {
        text += ' ' + chatComponentToString(w);
      }
    }
  }

  return text;
}

// Simple HTML page summarizer for ugly error payloads in chat
function summarizeHtmlPayload(raw) {
  if (!raw) return null;
  if (!/(<\s*html|<!doctype\s+html|<body\b|<head\b)/i.test(raw)) return null;

  const cleanInline = (s) => s
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&quot;/gi, '"')
    .replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ')
    .trim();

  const grab = (pattern) => {
    const m = raw.match(pattern);
    return m && m[1] ? cleanInline(m[1]) : '';
  };

  const h1 = grab(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  const h2 = grab(/<h2[^>]*>([\s\S]*?)<\/h2>/i);
  const p1 = grab(/<p[^>]*>([\s\S]*?)<\/p>/i);
  const p2 = grab(/<p[^>]*>[\s\S]*?<\/p>[^<]*<p[^>]*>([\s\S]*?)<\/p>/i);
  const errInfo = grab(/Error Info:<\/span><span[^>]*>([^<]*)<\/span>/i);
  const xref = grab(/x-azure-ref[^<]*?<span[^>]*>([^<]*)<\/span>/i) || grab(/x-azure-ref[^:]*:\s*([A-Za-z0-9\-]+)/i);

  const lines = [];
  if (h1) lines.push(h1);
  if (h2) lines.push(h2);
  if (p1) lines.push(p1);
  if (p2) lines.push(p2);
  if (errInfo) lines.push(`ErrorInfo: ${errInfo}`);
  if (xref) lines.push(`x-azure-ref: ${xref}`);

  if (lines.length === 0) {
    let text = raw
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ')
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&quot;/gi, '"')
      .replace(/&amp;/gi, '&')
      .replace(/\s+/g, ' ')
      .trim();
    if (!text) return null;
    const maxLen = 600;
    if (text.length > maxLen) text = text.slice(0, maxLen) + '…';
    return text;
  }

  const summary = lines.join('\n');
  const maxLen = 600;
  return summary.length > maxLen ? summary.slice(0, maxLen) + '…' : summary;
}

// Heuristic: detect LolRiTTeR-like response lines (e.g., playtime summary)
function looksLikeLolritterResponse(text) {
  if (!text) return false;
  const s = String(text).trim();
  // Examples: "66 Days, 8 Hours, 0 Minutes" or with Seconds
  if (/^\d+\s+Days?,\s*\d+\s+Hours?,\s*\d+\s+Minutes?(?:,\s*\d+\s+Seconds?)?$/i.test(s)) return true;
  // Common keywords from bot replies
  if (/^Playtime\b/i.test(s)) return true;
  if (/^Top\b/i.test(s)) return true;
  if (/^(?:KDR|Kills|Deaths|Balance|Stats)\b/i.test(s)) return true;
  return false;
}

var bot;
let reconnectTimeout = 15000;
let shouldReconnect = true;
let reconnectTimeRemaining = 0;
let reconnectTimestamp = 0;
let reconnectCountdownInterval = null;

let foodMonitorInterval = null;
let playerScannerInterval = null;


// Helper function to send messages to Discord
async function sendDiscordNotification(message, color = 3447003) {
  if (!DISCORD_CHANNEL_ID || !discordClient || !discordClient.isReady()) {
    console.log('[Discord] Bot not ready or no channel configured. Skipped.');
    return;
  }

  const summarized = summarizeHtmlPayload(message) || message;

  try {
    const channel = await discordClient.channels.fetch(DISCORD_CHANNEL_ID);
    if (channel && channel.isTextBased()) {
      await channel.send({
        embeds: [{
          description: summarized,
          color,
          timestamp: new Date()
        }]
      });
    }
  } catch (e) {
    console.error('[Discord Bot] Failed to send:', e.message);
  }
}

// Safely edit an interaction's reply, falling back if the original is unknown/deleted
async function safeEditInteraction(interaction, payload) {
  try {
    await interaction.editReply(payload);
  } catch (e) {
    const msg = (e && e.message) ? e.message : '';
    const isUnknownMessage = e?.code === 10008 || e?.status === 404 || msg.includes('Unknown Message');
    if (!isUnknownMessage) throw e;
    try {
      if (interaction.deferred || interaction.replied) {
        await interaction.followUp({ ...payload, flags: MessageFlags.Ephemeral });
      } else {
        await interaction.reply({ ...payload, flags: MessageFlags.Ephemeral });
      }
    } catch (_) {
      // Final fallback: swallow error to avoid crashing
    }
  }
}

// Function to send whispers to Discord with buttons
async function sendWhisperToDiscord(username, message) {
  if (!DISCORD_CHANNEL_ID || !discordClient || !discordClient.isReady()) {
    console.log('[Discord] Bot not ready for whisper.');
    return;
  }

  const now = new Date();
  const timeStr = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  const headline = `${username} → you`;
  const body = message;

  // Fan out to all private channels tied to this MC username
  const targets = [];
  for (const [key, channelId] of whisperChannels.entries()) {
    const [ownerId, targetUser] = key.split(':');
    if (targetUser === username.toLowerCase()) {
      targets.push({ ownerId, channelId });
    }
  }

  if (targets.length === 0) {
    console.log(`[Whisper] No private channel for ${username}, skipping.`);
    await sendWhisperClaimPrompt(username, body);
    return;
  }

  for (const target of targets) {
    try {
      const statusChannel = await discordClient.channels.fetch(DISCORD_CHANNEL_ID);
      const guild = statusChannel.guild;
      const channel = await guild.channels.fetch(target.channelId);
      if (!channel || !channel.isTextBased()) {
        whisperChannels.delete(`${target.ownerId}:${username.toLowerCase()}`);
        continue;
      }

      await sendWhisperEmbed(channel, {
        senderLabel: username,
        body: `**${body}**`
      });
      const effectiveTTL = customDialogTTL.get(channel.id) || WHISPER_TTL_MS;
      scheduleWhisperCleanup(channel.id, effectiveTTL);
    } catch (e) {
      console.error('[Whisper] Failed to deliver whisper:', e.message);
    }
  }
}

// Function to get server status description
function getStatusDescription() {
  if (!bot || !bot.entity) {
    if (!shouldReconnect) {
      return '⏸️ Bot paused';
    }
    // Show countdown if reconnecting
    if (reconnectTimestamp > 0) {
      const remaining = Math.max(0, reconnectTimestamp - Date.now());
      const minutes = Math.floor(remaining / 60000);
      const seconds = Math.floor((remaining % 60000) / 1000);
      const timeStr = minutes > 0 ? `${minutes}:${seconds.toString().padStart(2, '0')}` : `${seconds}s`;
      return `🔄 Reconnecting in ${timeStr}`;
    }
    return '❌ Bot not connected';
  }

  const playerCount = Object.keys(bot.players || {}).length;
  const onlinePlayers = Object.values(bot.players || {}).map(p => p.username);
  const whitelistOnline = onlinePlayers.filter(username => ignoredUsernames.some(name => name.toLowerCase() === username.toLowerCase()));
  const nearbyPlayers = getNearbyPlayers();
  const avgTps = realTps !== null ? realTps.toFixed(1) : (tpsHistory.length > 0 ? (tpsHistory.reduce((a, b) => a + b, 0) / tpsHistory.length).toFixed(1) : 'Calculating...');

  const nearbyNames = nearbyPlayers.map(p => p.username).join(', ') || 'None';
  const whitelistOnlineDisplay = whitelistOnline.length > 0 ? whitelistOnline.map(u => `\`${u}\``).join(', ') : 'None';
  return `✅ Bot **${bot.username}** connected to \`${config.host}\`\n` +
    `👥 Players online: ${playerCount}\n` +
    `👀 Players nearby: ${nearbyNames}\n` +
    `⚡ TPS: ${avgTps}\n` +
    `:hamburger: Food: ${Math.round(bot.food * 2) / 2}/20\n` +
    `❤️ Health: ${Math.round(bot.health * 2) / 2}/20\n` +
    `📋 Whitelist online: ${whitelistOnlineDisplay}`;
}

// Function to create status buttons
function createStatusButtons() {
  // Determine if bot is paused: shouldReconnect=false means paused
  const isPaused = !shouldReconnect;
  return [
    new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId('pause_resume_button')
          .setLabel(isPaused ? '▶️ Resume' : '⏸️ Pause')
          .setStyle(isPaused ? ButtonStyle.Success : ButtonStyle.Danger),
        new ButtonBuilder()
          .setCustomId('playerlist_button')
          .setLabel('👥 Players')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId('seen_button')
          .setLabel('🕒 Seen')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId('mentions_button')
          .setLabel('🔔 Mentions')
          .setStyle(ButtonStyle.Secondary)
      ),
    new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId('drop_button')
          .setLabel('🗑️ Drop')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId('whitelist_button')
          .setLabel('📋 Whitelist')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId('chat_setting_button')
          .setLabel('⚙️ Chat Settings')
          .setStyle(ButtonStyle.Secondary)
      )
  ];
}

// Function to update server status message
async function updateStatusMessage() {
  if (!statusMessage) return;
  
  // Prevent concurrent updates
  if (isUpdatingStatus) return;
  isUpdatingStatus = true;
  
  try {
    // Allow status updates even if bot is not connected to show offline state
    const description = getStatusDescription();

    await statusMessage.edit({
      embeds: [{
        title: 'Server Status',
        description,
        color: bot ? 65280 : 16711680,
        timestamp: new Date(),
        footer: {
          text: 'Last updated'
        }
      }],
      components: createStatusButtons()
    });
  } catch (e) {
    // Handle specific Discord API errors
    if (e.code === 10008 || e.message.includes('Unknown Message')) {
      console.error('[Discord] Status message was deleted, recreating...');
      statusMessage = null;
      try {
        await ensureStatusMessage();
      } catch (err) {
        console.error('[Discord] Failed to recreate status message:', err.message);
      }
    } else if (e.code === 50013) {
      console.error('[Discord] Missing permissions to edit status message');
    } else if (e.status === 429) {
      // Rate limited - will retry on next interval
    } else {
      console.error('[Discord] Failed to update status:', e.message);
    }
  } finally {
    isUpdatingStatus = false;
  }
}

function createBot() {
  // Before creating a new bot, remove the old bot's listeners (if any remain)
  if (bot) {
    try { bot.removeAllListeners(); } catch {}
  }

  lastTickTime = 0; // Reset TPS tracking for new bot
  bot = mineflayer.createBot(config);

  bot.on('login', async () => {
    if (bot && bot.username) {
      console.log(`[+] Logged in as ${bot.username}`);
    }
    startTime = Date.now();
    lastCommandUser = null; // Reset after use
  });

  bot.on('spawn', () => {
    console.log('[Bot] Spawned.');
    reconnectTimestamp = 0; // Reset reconnect countdown when bot spawns
    clearIntervals();
    startFoodMonitor();
    startNearbyPlayerScanner();

    // Update player activity for all online players
    if (bot && bot.players) {
      setTimeout(async () => {
        for (const player of Object.values(bot.players)) {
          if (player.username && ignoredUsernames.some(name => name.toLowerCase() === player.username.toLowerCase())) {
            await updatePlayerActivity(player.username, true);
          }
        }
      }, 3000);
    }

    // Start TPS from TAB monitor
    tpsTabInterval = setInterval(() => {
      let found = false;
      if (bot && bot.tablist) {
        let text = '';
        if (bot.tablist.header) {
          text += chatComponentToString(bot.tablist.header) + ' ';
        }
        if (bot.tablist.footer) {
          text += chatComponentToString(bot.tablist.footer);
        }
        const tpsMatch = text.match(/(\d+\.?\d*)\s*tps/i);
        if (tpsMatch) {
          realTps = parseFloat(tpsMatch[1]);
          found = true;
          // Update status immediately when TPS changes
          if (statusMessage) updateStatusMessage();
        }
      }
      if (!found && bot && bot.chat) {
        bot.chat('/tps');
      }
    }, 10000); // Check every 10 seconds

    // Reuse or create single persistent status message after spawn
    if (DISCORD_CHANNEL_ID && discordClient && discordClient.isReady()) {
      setTimeout(async () => {
        await ensureStatusMessage();
        if (statusMessage) {
          try {
            await updateStatusMessage();
          } catch (e) {
            console.error('[Discord] Failed to refresh status message after spawn:', e.message);
          }
        }
      }, 2000);
    }
  });

  bot.on('physicsTick', () => {
    const now = Date.now();
    if (lastTickTime > 0) {
      const delta = now - lastTickTime;
      if (delta > 0) {
        const tps = 1000 / delta;
        tpsHistory.push(tps);
        if (tpsHistory.length > 20) tpsHistory.shift();
      }
    }
    lastTickTime = now;
  });


  bot.on('end', (reason) => {
    const reasonStr = chatComponentToString(reason);
    clearIntervals();

    // Mark bot reference null immediately for status display
    bot = null;

    // Don't clear the global status update interval - let it continue
    // so status updates even when disconnected

    if (shouldReconnect || reasonStr === 'socketClosed') {
      const now = new Date();
      const kyivTime = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Kyiv' }));
      const hour = kyivTime.getHours();
      const minute = kyivTime.getMinutes();
      const isRestartTime = hour === 9 && minute >= 0 && minute <= 30;
      const timeout = isRestartTime ? 5 * 60 * 1000 : reconnectTimeout;

      // Set reconnect timestamp for countdown
      reconnectTimestamp = Date.now() + timeout;

      if (isRestartTime) {
        console.log('[!] Restart window. Reconnecting in 5 minutes...');
        // No Discord notification - status message will show countdown
      } else if (reasonStr !== 'Restart command') {
        console.log('[!] Disconnected. Reconnecting in 15 seconds...');
        // No Discord notification - status message will show countdown
      }
      
      setTimeout(() => {
        reconnectTimestamp = 0;
        createBot();
      }, timeout);
    } else {
      console.log('[!] Manual pause. No reconnect.');
      reconnectTimestamp = 0;
      // Status will be updated by interval
    }
  });

  bot.on('error', (err) => {
    console.log(`[x] Error: ${err.message}`);
    sendDiscordNotification(`Error: \`${err.message}\``, 16711680);
  });

  bot.on('kicked', (reason) => {
    const reasonText = chatComponentToString(reason);
    console.log(`[!] Kicked: ${reasonText}`);
    
    // Check if it's restart time - don't spam notifications
    const now = new Date();
    const kyivTime = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Kyiv' }));
    const hour = kyivTime.getHours();
    const minute = kyivTime.getMinutes();
    const isRestartTime = hour === 9 && minute >= 0 && minute <= 30;
    
    // Only send notification if not during restart window or if there's a meaningful reason
    if (!isRestartTime && reasonText && reasonText.trim() !== '') {
      sendDiscordNotification(`Kicked. Reason: \`${reasonText}\``, 16711680);
    }

    // If kicked due to throttling, increase reconnect timeout
    if (reasonText.includes('throttled') || reasonText.includes('too fast') || reasonText.includes('delay')) {
      reconnectTimeout = Math.min(reconnectTimeout * 2, 5 * 60 * 1000); // Max 5 minutes
      console.log(`[!] Throttling detected. Increasing reconnect timeout to ${reconnectTimeout / 1000} seconds.`);
    }

    // If kicked with generic reason, stop reconnecting to avoid infinite loop
    if (reasonText === 'You have been disconnected from the server.') {
      console.log('[!] Generic kick detected. Stopping reconnection.');
      shouldReconnect = false;
    }
  });

  bot.on('death', () => {
    console.log('[Bot] Died.');
    sendDiscordNotification('Bot died. :skull:', 16711680);
  });

  // Track player joins and leaves
  bot.on('playerJoined', async (player) => {
    if (player.username && ignoredUsernames.some(name => name.toLowerCase() === player.username.toLowerCase())) {
      await updatePlayerActivity(player.username, true);
      console.log(`[PlayerJoined] ${player.username} joined the server`);
    }
  });

  bot.on('playerLeft', async (player) => {
    if (player.username && ignoredUsernames.some(name => name.toLowerCase() === player.username.toLowerCase())) {
      await updatePlayerActivity(player.username, false);
      console.log(`[PlayerLeft] ${player.username} left the server`);
    }
  });

  // ------- CHAT COMMANDS -------
  bot.on('chat', async (username, message) => {
    debugLog(`[Chat] Incoming ${username}: raw="${message}"`);
    // Handle commands from bdiev_
    if (username === 'bdiev_') {
      if (message === '!restart') {
        console.log(`[Command] restart by ${username}`);
        lastCommandUser = `${username} (in-game)`;
        bot.quit('Restart command');
        return;
      }

      if (message === '!pause') {
        console.log('[Command] pause 10m');
        lastCommandUser = `${username} (in-game)`;
        shouldReconnect = false;
        bot.quit('Pause 10m');
        setTimeout(() => {
          console.log('[Bot] Pause ended.');
          shouldReconnect = true;
          createBot();
        }, 10 * 60 * 1000);
        return;
      }

      const pauseMatch = message.match(/^!pause\s+(\d+)$/);
      if (pauseMatch) {
        const minutes = parseInt(pauseMatch[1]);
        if (minutes > 0) {
          console.log(`[Command] pause ${minutes}m`);
          lastCommandUser = `${username} (in-game)`;
          shouldReconnect = false;
          bot.quit(`Paused ${minutes}m`);
          setTimeout(() => {
            console.log('[Bot] Custom pause ended.');
            shouldReconnect = true;
            createBot();
          }, minutes * 60 * 1000);
        }
        return;
      }

      const allowMatch = message.match(/^!allow\s+(\w+)$/);
      if (allowMatch) {
        const targetUsername = allowMatch[1];
        (async () => {
          try {
            if (!pool) {
              console.log('[DB] ❌ Database operation attempted but pool not available');
              sendDiscordNotification('Database not configured.', 16711680);
              return;
            }
            await pool.query('INSERT INTO whitelist (username, added_by) VALUES ($1, $2) ON CONFLICT (username) DO NOTHING', [targetUsername, username]);
            // Reload whitelist
            const newWhitelist = await loadWhitelistFromDB();
            ignoredUsernames.length = 0;
            ignoredUsernames.push(...newWhitelist);
            console.log(`[Command] Added ${targetUsername} to whitelist by ${username}`);
            sendDiscordNotification(`✅ Added ${targetUsername} to whitelist. Requested by ${username} (in-game)`, 65280);
          } catch (err) {
            console.error('[Command] Allow error:', err.message);
            sendDiscordNotification(`Failed to add ${targetUsername} to whitelist: \`${err.message}\``, 16711680);
          }
        })();
        return;
      }

      const ignoreMatch = message.match(/^!ignore\s+(\w+)$/);
      if (ignoreMatch) {
        const targetUsername = ignoreMatch[1];
        if (!pool) {
          console.log('[DB] ❌ Database operation attempted but pool not available');
          sendDiscordNotification('Database not configured.', 16711680);
          return;
        }
        (async () => {
          try {
            await pool.query('INSERT INTO ignored_users (username, added_by) VALUES ($1, $2) ON CONFLICT (username) DO NOTHING', [targetUsername.toLowerCase(), username]);
            // Reload ignored
            ignoredChatUsernames = await loadIgnoredChatUsernames();
            console.log(`[Command] Added ${targetUsername} to ignore list by ${username}`);
            sendDiscordNotification(`✅ Added ${targetUsername} to ignore list. Requested by ${username} (in-game)`, 65280);
          } catch (err) {
            console.error('[Command] Ignore error:', err.message);
            sendDiscordNotification(`Failed to add ${targetUsername} to ignore list: \`${err.message}\``, 16711680);
          }
        })();
        return;
      }

      const unignoreMatch = message.match(/^!unignore\s+(\w+)$/);
      if (unignoreMatch) {
        const targetUsername = unignoreMatch[1];
        if (!pool) {
          console.log('[DB] ❌ Database operation attempted but pool not available');
          sendDiscordNotification('Database not configured.', 16711680);
          return;
        }
        (async () => {
          try {
            const result = await pool.query('DELETE FROM ignored_users WHERE username = $1', [targetUsername.toLowerCase()]);
            if (result.rowCount > 0) {
              // Reload ignored
              ignoredChatUsernames = await loadIgnoredChatUsernames();
              console.log(`[Command] Removed ${targetUsername} from ignore list by ${username}`);
              sendDiscordNotification(`✅ Removed ${targetUsername} from ignore list. Requested by ${username} (in-game)`, 65280);
            } else {
              sendDiscordNotification(`${targetUsername} is not in ignore list.`, 16776960);
            }
          } catch (err) {
            console.error('[Command] Unignore error:', err.message);
            sendDiscordNotification(`Failed to remove ${targetUsername} from ignore list: \`${err.message}\``, 16711680);
          }
        })();
        return;
      }
    }

    // Do NOT infer deaths from chat messages. We only notify on the bot's own death
    // via the dedicated bot death event handler.

    // Send all chat messages to Discord chat channel
    if (!DISCORD_CHAT_CHANNEL_ID || !discordClient || !discordClient.isReady()) {
      debugLog(`[Chat] Skip ${username}: Discord not ready or chat channel missing`);
      return;
    }
    
    // Skip any messages from the bot itself to avoid echoing /msg or relayed messages back into Discord
    if (username === bot.username) {
      debugLog(`[Chat] Skip ${username}: message from self`);
      return;
    }
    
    if (ignoredChatUsernames.includes(username.toLowerCase())) {
      debugLog(`[Chat] Skip ${username}: listed in ignoredChatUsernames`);
      return;
    }

    // Clean message - only remove Minecraft color codes and problematic control characters
    let cleanMessage = message
      .replace(/§[0-9a-fk-or]/gi, '') // Remove Minecraft color codes
      .replace(/[\u0000-\u0008\u000B-\u000C\u000E-\u001F\u007F]/g, '') // Remove control chars (keep newlines \n)
      .trim();

    const htmlSummary = summarizeHtmlPayload(message);
    if (htmlSummary) {
      cleanMessage = htmlSummary;
      debugLog(`[Chat] HTML summary applied for ${username}`);
    }

    debugLog(`[Chat] Cleaned message from ${username}: "${cleanMessage}" (raw: "${message}")`);
    if (cleanMessage.startsWith('>')) {
      debugLog(`[Chat] Message starts with '>' for ${username}`);
    }

    if (!cleanMessage) {
      debugLog(`[Chat] Skip ${username}: message empty after cleaning`);
      return;
    }

    // Skip /msg commands - these are relayed from dialog channels
    if (cleanMessage.startsWith('/msg ')) {
      debugLog(`[Chat] Skip ${username}: detected /msg command`);
      return;
    }

    // If user issued a likely command (short message, any prefix), open a short window to reattribute bot responses
    // This covers all LolRiTTeRBot commands: !pt, !faq, !stats, !top, etc.
    const looksLikeCommand = cleanMessage.length <= 30 && /^[!/.#@-]/.test(cleanMessage);
    if (looksLikeCommand) {
      const key = username.toLowerCase();
      const until = Date.now() + 4000; // 4s window
      pendingBotResponses.set(key, { cmd: cleanMessage, until });
      debugLog(`[Chat] Mark pending bot response for ${username}: cmd="${cleanMessage}", until=${new Date(until).toISOString()}`);
    }

    // Suppress whispers: if whisper arrives shortly, don't forward to public chat
    const whisperKey = `WHISPER:${username}:${cleanMessage}`;
    if (recentWhispers.has(whisperKey)) {
      debugLog(`[Chat] Suppressed whisper from ${username}: "${cleanMessage}" (age=${Date.now() - recentWhispers.get(whisperKey)}ms)`);
      return;
    }

    // Suppress any unexpected public echo of our own outgoing /msg to this username
    const outboundKey = `OUTBOUND:${username.toLowerCase()}:${cleanMessage}`;
    const nowTs = Date.now();
    for (const [ok, ts] of outboundWhispers.entries()) {
      if (nowTs - ts > OUTBOUND_WHISPER_TTL_MS) outboundWhispers.delete(ok);
    }
    if (outboundWhispers.has(outboundKey)) {
      debugLog(`[Chat] Suppressed outbound echo to ${username}: "${cleanMessage}" (age=${Date.now() - outboundWhispers.get(outboundKey)}ms)`);
      return;
    }

    const pendingKey = `CHAT:${username}:${cleanMessage}`;
    if (pendingChatTimers.has(pendingKey)) {
      clearTimeout(pendingChatTimers.get(pendingKey));
      pendingChatTimers.delete(pendingKey);
    }

    debugLog(`[Chat] Schedule relay ${pendingKey}`);

    const timer = setTimeout(async () => {
      try {
        debugLog(`[Chat] Timer fire ${pendingKey}`);
        if (recentWhispers.has(whisperKey)) {
          debugLog(`[Chat] Suppressed whisper (late mark) from ${username}: "${cleanMessage}"`);
          return;
        }
        if (outboundWhispers.has(outboundKey)) {
          debugLog(`[Chat] Suppressed outbound echo (late) to ${username}: "${cleanMessage}"`);
          return;
        }
        
        // If there's an active pending bot response window, this might be a bot response
        // Let message event handle it to properly attribute to LolRiTTeRBot
        const now = Date.now();
        for (const [key, pend] of pendingBotResponses.entries()) {
          if (now <= pend.until) {
            debugLog(`[Chat] Suppressed - active bot response window for ${key}, letting message event handle: "${cleanMessage}"`);
            return;
          }
        }
        
        const channel = await discordClient.channels.fetch(DISCORD_CHAT_CHANNEL_ID);
        if (channel && channel.isTextBased()) {
          // Determine displayed author and content (handle relayed formats like "<LolRiTTeRBot> ...")
          let displayAuthor = username;
          let contentForDisplay = cleanMessage;
          const angleTag = contentForDisplay.match(/^<([^>]+)>\s*(.*)$/);
          if (angleTag) {
            const innerSender = angleTag[1].trim();
            const innerLower = innerSender.toLowerCase();
            const remaining = angleTag[2] != null ? angleTag[2] : '';
            // Prefer inner sender when it looks like a relay/bot (e.g., LolRiTTeRBot)
            if (/(lolritter|loltitter)/i.test(innerSender)) {
              displayAuthor = innerSender;
              contentForDisplay = remaining.trim();
              debugLog(`[Chat] Reattributed author to inner tag "${innerSender}"`);
            }
          }

          // Fallback: if user recently sent a bang command and this looks like a bot response, reattribute to LolRiTTeRBot
          if (displayAuthor === username) {
            const pend = pendingBotResponses.get(username.toLowerCase());
            if (pend && Date.now() <= pend.until && looksLikeLolritterResponse(contentForDisplay)) {
              const startedAt = pend.until - 4000;
              const age = Date.now() - startedAt;
              displayAuthor = 'LolRiTTeRBot';
              // Show who asked in the message body for clarity
              contentForDisplay = `> ${username}: ${contentForDisplay}`;
              pendingBotResponses.delete(username.toLowerCase());
              debugLog(`[Chat] Reattributed to LolRiTTeRBot via command-window (cmd=${pend.cmd}, age=${age}ms)`);
            } else {
              // Clean up expired entries lazily
              if (pend && Date.now() > pend.until) pendingBotResponses.delete(username.toLowerCase());
            }
          }

          debugLog(`[Chat] Sending to Discord from ${displayAuthor}: "${contentForDisplay}"`);
          let avatarUrl = `https://minotar.net/avatar/${displayAuthor.toLowerCase()}/28`;
          let displayMessage = contentForDisplay.replace(/([*_`~|\\])/g, '\\$1');
          displayMessage = displayMessage.replace(/\[/g, '\\[').replace(/\]/g, '\\]');
          // Prevent Discord blockquotes caused by leading '>' ONLY for messages we prepended with '>' (reattributed ones)
          // Don't escape '>' for natural user messages to allow quote syntax
          if (displayAuthor !== username && contentForDisplay.startsWith('> ')) {
            const beforeBQ = displayMessage;
            displayMessage = displayMessage.replace(/^>/gm, '\\>');
            if (beforeBQ !== displayMessage) {
              debugLog(`[Chat] Escaped leading '>' for reattributed message from ${username}`);
            }
          }
          const isBridgeMessage = /^\[[^\]]+\]\s/.test(cleanMessage);
          const lowerMessage = cleanMessage.toLowerCase();
          const usersToMention = new Set();
          if (!isBridgeMessage) {
            const mentionKeywords = await getMentionKeywords();
            for (const { discord_id, keyword } of mentionKeywords) {
              const regex = new RegExp(`\\b${keyword.toLowerCase()}\\b`);
              if (regex.test(lowerMessage)) {
                usersToMention.add(discord_id);
              }
            }
          }
          const sendOptions = {
            embeds: [{
              author: { name: displayAuthor, url: `https://namemc.com/profile/${displayAuthor}` },
              description: displayMessage,
              color: 3447003,
              thumbnail: { url: avatarUrl },
              timestamp: new Date()
            }]
          };
          if (usersToMention.size > 0) {
            sendOptions.content = Array.from(usersToMention).map(id => `<@${id}>`).join(' ');
            debugLog(`[Chat] Mentions added for ${username}: ${Array.from(usersToMention).join(', ')}`);
          }
          await channel.send(sendOptions);
          debugLog(`[Chat] Sent to Discord ${pendingKey}`);
          
          // If this was a reattributed bot response, mark as consumed to prevent duplicate from message event
          if (displayAuthor === 'LolRiTTeRBot') {
            pendingBotResponses.delete(username.toLowerCase());
            debugLog(`[Chat] Consumed pending bot response for ${username.toLowerCase()} to prevent duplicate`);
          }
        } else {
          debugLog(`[Chat] No text channel available for relay ${pendingKey}`);
        }
      } catch (e) {
        debugLog(`[Chat] Error while relaying ${username}: ${e.message || e}`);
      } finally {
        pendingChatTimers.delete(pendingKey);
      }
    }, PENDING_CHAT_DELAY_MS);

    pendingChatTimers.set(pendingKey, timer);
  });

  bot.on('whisper', (username, message, translate, jsonMsg, matches) => {
    debugLog(`[Whisper] ⭐ EVENT FIRED for ${username}: "${message}"`);

    let cleanedWhisper = message
      .replace(/§[0-9a-fk-or]/gi, '')
      .replace(/[\u0000-\u0008\u000B-\u000C\u000E-\u001F\u007F]/g, '')
      .trim();

    debugLog(`[Whisper] Cleaned: "${cleanedWhisper}"`);

    const whisperKey = `WHISPER:${username}:${cleanedWhisper}`;
    recentWhispers.set(whisperKey, Date.now());
    debugLog(`[Whisper] ✅ MARKED whisper key: ${whisperKey}`);

    // Cancel any pending public chat send for this message
    const pendingKey = `CHAT:${username}:${cleanedWhisper}`;
    if (pendingChatTimers.has(pendingKey)) {
      clearTimeout(pendingChatTimers.get(pendingKey));
      pendingChatTimers.delete(pendingKey);
      debugLog(`[Whisper] 🛑 Canceled pending chat forward for: ${pendingKey}`);
    }

    // Cleanup old whisper marks
    for (const [k, ts] of recentWhispers.entries()) {
      if (k.startsWith('WHISPER:') && Date.now() - ts > WHISPER_MARK_TTL_MS) {
        recentWhispers.delete(k);
      }
    }

    debugLog(`[Whisper] Calling sendWhisperToDiscord...`);
    sendWhisperToDiscord(username, message);
  });

  bot.on('message', (message) => {
    const text = chatComponentToString(message);
    const tpsMatch = text.match(/(\d+\.?\d*)\s*tps/i);
    if (tpsMatch) {
      realTps = parseFloat(tpsMatch[1]);
    }

    // Debug: surface any non-chat messages mentioning LolRiTTeRBot to diagnose missing chat events
    const lt = text.toLowerCase();
    if (lt.includes('lolritterbot') || lt.includes('lolritter') || lt.includes('lolritterbot') || lt.includes('lolritter')) {
      debugLog('[Message] Non-chat event text:', text, 'json:', JSON.stringify(message));
    }

    // Forward likely command responses that arrive as non-chat messages
    try {
      if (DISCORD_CHAT_CHANNEL_ID && discordClient && discordClient.isReady()) {
        const now = Date.now();
        // Find an active pending window
        let targetKey = null;
        let pend = null;
        for (const [k, v] of pendingBotResponses.entries()) {
          if (now <= v.until) { targetKey = k; pend = v; break; }
          // cleanup expired
          if (now > v.until) pendingBotResponses.delete(k);
        }
        if (targetKey && text && text.trim()) {
          const content = text.trim();
          // Avoid echoing the command itself
          if (pend && pend.cmd && content === pend.cmd) {
            debugLog(`[Message] Skipping duplicate command echo: "${content}"`);
            return;
          }

          (async () => {
            try {
              const channel = await discordClient.channels.fetch(DISCORD_CHAT_CHANNEL_ID);
              if (channel && channel.isTextBased()) {
                const asker = targetKey; // username in lowercase
                const displayAuthor = 'LolRiTTeRBot';
                const avatarUrl = `https://minotar.net/avatar/${displayAuthor.toLowerCase()}/28`;
                
                // Extract target username from command if present (e.g., !pt Johnmcswag -> Johnmcswag)
                let quotedName = asker;
                if (pend && pend.cmd) {
                  const cmdMatch = pend.cmd.match(/^[!/.#@-]\w+\s+(\w+)/);
                  if (cmdMatch) {
                    quotedName = cmdMatch[1];
                  }
                }
                
                let body = `> ${quotedName}: ${content}`;
                // Escape markdown only (NOT leading '>' - we want to show quote prefix naturally)
                body = body.replace(/([*_`~|\\])/g, '\\$1').replace(/\[/g, '\\[').replace(/\]/g, '\\]');
                await channel.send({
                  embeds: [{
                    author: { name: displayAuthor, url: `https://namemc.com/profile/${displayAuthor}` },
                    description: body,
                    color: 3447003,
                    thumbnail: { url: avatarUrl },
                    timestamp: new Date()
                  }]
                });
                debugLog(`[Message] Forwarded non-chat as LolRiTTeRBot via command-window (cmd=${pend?.cmd})`);
                
                // Consume the pending once used to prevent duplicate forwards
                pendingBotResponses.delete(targetKey);
              }
            } catch (e) {
              debugLog('[Message] Forward error:', e.message || e);
            }
          })();
        }
      }
    } catch (_) {}
  });
}

// -------------- INTERVALS MANAGEMENT --------------
function clearIntervals() {
  if (foodMonitorInterval) {
    clearInterval(foodMonitorInterval);
    foodMonitorInterval = null;
  }
  if (playerScannerInterval) {
    clearInterval(playerScannerInterval);
    playerScannerInterval = null;
  }
  if (tpsTabInterval) {
    clearInterval(tpsTabInterval);
    tpsTabInterval = null;
  }
  // Note: statusUpdateInterval is NOT cleared here as it's a global Discord interval
  // that should persist across bot reconnections
}

// -------------- FOOD MONITOR --------------
function startFoodMonitor() {
  let warningSent = false;
  foodMonitorInterval = setInterval(async () => {
    if (!bot || bot.food === undefined) return;

    const hasFood = bot.inventory.items().some(item =>
      ['bread', 'apple', 'beef', 'golden_carrot'].some(n => item.name.includes(n))
    );

    if (!hasFood) {
      if (!warningSent) {
        console.log('[Bot] No food.');
        sendDiscordNotification('No food in inventory!', 16711680);
        warningSent = true;
      }
      return;
    } else {
      warningSent = false;
    }

    if (bot.food < 18 && !bot._isEating) {
      bot._isEating = true;
      await eatFood();
      bot._isEating = false;
    }
  }, 1000);
}

async function eatFood() {
  const foodItem = bot.inventory.items().find(item =>
    ['bread', 'apple', 'beef', 'golden_carrot'].some(n => item.name.includes(n))
  );
  if (!foodItem) return;
  try {
    console.log(`[Bot] Eating ${foodItem.name} (food: ${bot.food})`);
    await bot.equip(foodItem, 'hand');
    await bot.consume();
    console.log('[Bot] Ate.');
  } catch (err) {
    console.error('[Bot] Eat error:', err.message);
    sendDiscordNotification(`Eating ${foodItem.name} failed: \`${err.message}\``, 16711680);
  }
}

// -------------- PLAYER SCANNER  --------------
function startNearbyPlayerScanner() {
  playerScannerInterval = setInterval(() => {
    if (!bot || !bot.entity) return;

    for (const entity of Object.values(bot.entities)) {
      if (!entity || entity.type !== 'player') continue;
      if (!entity.username || entity.username === bot.username) continue;
      if (ignoredUsernames.some(name => name.toLowerCase() === entity.username.toLowerCase())) continue; // Ignore whitelisted players (case-insensitive)
      // Non-whitelisted player
      if (!entity.position || !bot.entity.position) continue;
      const distance = bot.entity.position.distanceTo(entity.position);
      if (distance <= 300) {
        // Enemy detected!
        console.log(`[Bot] Enemy detected: ${entity.username}`);
        sendDiscordNotification(`🚨 **ENEMY DETECTED**: **${entity.username}** entered range! Bot paused until resume command.`, 16711680);
        shouldReconnect = false;
        bot.quit(`Enemy detected: ${entity.username}`);
        return; // Stop scanning after disconnect
      }
    }
  }, 1000);
}


if (String(process.env.DISABLE_BOT).toLowerCase() === 'true') {
  console.log(`Bot disabled by env. DISABLE_BOT=${process.env.DISABLE_BOT}`);
  process.exit(0);
}

// Handle uncaught exceptions to prevent crashes
process.on('uncaughtException', (err) => {
  console.log('Uncaught Exception:', err);
  sendDiscordNotification(`Uncaught exception: \`${err.message}\``, 16711680);
  if (bot) {
    try { bot.quit(); } catch {}
  }
  setTimeout(createBot, 5000);
});

process.on('unhandledRejection', (reason) => {
  console.log('Unhandled Rejection:', reason);
  sendDiscordNotification(`Unhandled rejection: \`${reason}\``, 16711680);
});

// Discord bot commands
if (DISCORD_BOT_TOKEN && DISCORD_CHANNEL_ID) {
  discordClient.on('interactionCreate', async (interaction) => {
    // Interaction logs reduced to minimize noise

    if (interaction.channelId !== DISCORD_CHANNEL_ID) {
      // Allow dialog buttons and select menus in their own channels
      if (!(interaction.isButton() && (interaction.customId?.startsWith('delete_dialog_') || interaction.customId?.startsWith('set_ttl_') || interaction.customId?.startsWith('claim_whisper_'))) && 
          !(interaction.isStringSelectMenu() && interaction.customId?.startsWith('set_ttl_select_'))) {
        return;
      }
    }


    if (interaction.isButton()) {
        if (interaction.customId.startsWith('claim_whisper_')) {
          await interaction.deferReply({ flags: MessageFlags.Ephemeral });
          const mcUsername = interaction.customId.replace('claim_whisper_', '');
          const pending = pendingWhisperClaims.get(mcUsername);
          if (!pending) {
            await interaction.editReply({ content: 'Dialog already claimed or expired.', components: [] });
            return;
          }

          const whisperChannel = await getOrCreateWhisperChannel(interaction.user.id, interaction.user.tag, mcUsername);
          if (!whisperChannel) {
            await interaction.editReply({ content: 'Failed to create a private channel. Check DISCORD_DM_CATEGORY_ID and permissions.', components: [] });
            return;
          }

          whisperChannels.set(`${interaction.user.id}:${mcUsername.toLowerCase()}`, whisperChannel.id);
          pendingWhisperClaims.delete(mcUsername);

          try {
            await sendWhisperEmbed(whisperChannel, {
              headline: `${mcUsername} → You`,
              body: pending.lastMessage,
              color: 3447003,
              directionIcon: '⬅️'
            });
            scheduleWhisperCleanup(whisperChannel.id);
          } catch (e) {
            console.error('[Whisper] Failed to deliver claimed whisper copy:', e.message);
          }

          // Mark claim message as claimed
          try {
            const statusChannel = await discordClient.channels.fetch(DISCORD_CHANNEL_ID);
            const msg = await statusChannel.messages.fetch(pending.messageId);
            await msg.edit({
              embeds: [{
                title: 'Dialog claimed',
                description: `MC: **${mcUsername}**\nDiscord: ${interaction.user.tag}`,
                color: 65280,
                timestamp: new Date()
              }],
              components: []
            });
          } catch (_) {}

          await interaction.editReply({ content: `Channel created: ${whisperChannel}`, components: [] });
          setTimeout(() => interaction.deleteReply().catch(() => {}), 10_000);
          return;
        }
      if (interaction.customId.startsWith('delete_dialog_')) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const channelId = interaction.customId.replace('delete_dialog_', '');
        let ownerId = getDialogOwnerId(channelId);

        if (!ownerId) {
          // Fallback: derive owner from channel permission overwrites after restart
          try {
            const ch = await discordClient.channels.fetch(channelId);
            if (ch && ch.isTextBased() && ch.guild) {
              const overwrites = ch.permissionOverwrites?.cache ?? new Map();
              for (const ov of overwrites.values()) {
                // Skip everyone role and the bot itself
                if (ov.id === ch.guild.roles.everyone.id || ov.id === discordClient.user.id) continue;
                // Only consider member overwrites and those that explicitly allow ViewChannel
                const allowsView = ov.allow?.has?.(PermissionsBitField.Flags.ViewChannel);
                const isMemberType = (ov.type === 1 || ov.type === 'member');
                if (isMemberType && allowsView) {
                  ownerId = ov.id;
                  break;
                }
              }
            }
          } catch (_) {}
        }

        if (!ownerId) {
          await safeEditInteraction(interaction, { content: 'Cannot delete: dialog owner not found.', components: [] });
          return;
        }

        if (interaction.user.id !== ownerId) {
          await safeEditInteraction(interaction, { content: 'Only the dialog owner can delete this channel.', components: [] });
          return;
        }

        try {
          removeWhisperChannelMappings(channelId);
          cancelWhisperCleanup(channelId);

          const channel = await discordClient.channels.fetch(channelId);
          if (channel && channel.deletable) {
            await channel.delete('Dialog deleted by owner');
            await safeEditInteraction(interaction, { content: 'Dialog channel deleted.', components: [] });
          } else {
            await safeEditInteraction(interaction, { content: 'Cannot delete this channel (missing permission).', components: [] });
          }
        } catch (e) {
          await safeEditInteraction(interaction, { content: `Failed to delete dialog: ${e.message}`, components: [] });
        }
        return;
      }
      if (interaction.customId.startsWith('set_ttl_')) {
        const channelId = interaction.customId.replace('set_ttl_', '');
        let ownerId = getDialogOwnerId(channelId);

        if (!ownerId) {
          // Fallback: derive owner from channel permission overwrites
          try {
            const ch = await discordClient.channels.fetch(channelId);
            if (ch && ch.isTextBased() && ch.guild) {
              const overwrites = ch.permissionOverwrites?.cache ?? new Map();
              for (const ov of overwrites.values()) {
                if (ov.id === ch.guild.roles.everyone.id || ov.id === discordClient.user.id) continue;
                const allowsView = ov.allow?.has?.(PermissionsBitField.Flags.ViewChannel);
                const isMemberType = (ov.type === 1 || ov.type === 'member');
                if (isMemberType && allowsView) {
                  ownerId = ov.id;
                  break;
                }
              }
            }
          } catch (_) {}
        }

        if (!ownerId) {
          await interaction.reply({ content: 'Cannot set auto-delete time: dialog owner not found.', flags: MessageFlags.Ephemeral });
          return;
        }

        if (interaction.user.id !== ownerId) {
          await interaction.reply({ content: 'Only the dialog owner can change auto-delete time.', flags: MessageFlags.Ephemeral });
          return;
        }

        const selectMenu = new StringSelectMenuBuilder()
          .setCustomId(`set_ttl_select_${channelId}`)
          .setPlaceholder('Select auto-delete time')
          .addOptions(
            new StringSelectMenuOptionBuilder()
              .setLabel('5 minutes')
              .setValue('5')
              .setEmoji('⏰'),
            new StringSelectMenuOptionBuilder()
              .setLabel('15 minutes')
              .setValue('15')
              .setEmoji('⏱️'),
            new StringSelectMenuOptionBuilder()
              .setLabel('30 minutes')
              .setValue('30')
              .setEmoji('⏲️')
          );

        await interaction.reply({
          content: 'Choose auto-delete time for new messages:',
          components: [new ActionRowBuilder().addComponents(selectMenu)],
          flags: MessageFlags.Ephemeral
        });
        return;
      }
      if (interaction.customId === 'pause_resume_button') {
        await interaction.deferUpdate(); // Defer update to avoid timeout
        lastCommandUser = interaction.user.tag;
        if (shouldReconnect && bot) {
          // Currently running, pause it
          console.log(`[Button] pause by ${interaction.user.tag}`);
          const botToQuit = bot; // Save reference before setting to null
          shouldReconnect = false;
          bot = null; // Set to null immediately for status display
          await updateStatusMessage(); // Update status before quit
          if (botToQuit) botToQuit.quit('Pause until resume');
        } else {
          // Currently paused, resume it
          console.log(`[Button] resume by ${interaction.user.tag}`);
          shouldReconnect = true;
          createBot();
          // Status will be updated automatically when bot spawns
        }
      } else if (interaction.customId === 'say_button') {
        const modal = new ModalBuilder()
          .setCustomId('say_modal')
          .setTitle('Send Message to Minecraft');

        const messageInput = new TextInputBuilder()
          .setCustomId('message_input')
          .setLabel('Message')
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true);

        const actionRow = new ActionRowBuilder().addComponents(messageInput);
        modal.addComponents(actionRow);

        await interaction.showModal(modal);
      } else if (interaction.customId === 'playerlist_button') {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        if (!bot) {
          await interaction.editReply({
            embeds: [{
              description: 'Bot is offline.',
              color: 16711680,
              timestamp: new Date()
            }]
          });
          
          // Auto-hide after 2 minutes
          setTimeout(async () => {
            try {
              await interaction.deleteReply();
            } catch (err) {
              // If deletion fails, try to edit to minimal content
              try {
                await interaction.editReply({ embeds: [], components: [], content: '_ _' });
              } catch (e) {
                // Ignore errors on cleanup
              }
            }
          }, 120000);
          return;
        }
        const allOnlinePlayers = Object.values(bot.players || {}).map(p => p.username);
        const whitelistOnline = allOnlinePlayers.filter(username => ignoredUsernames.some(name => name.toLowerCase() === username.toLowerCase()));
        const otherPlayers = allOnlinePlayers.filter(username => !ignoredUsernames.some(name => name.toLowerCase() === username.toLowerCase()));

        const playerList = [];
        if (whitelistOnline.length > 0) {
          playerList.push(`🛡️ **Whitelist:** ${whitelistOnline.join(', ')}`);
        }
        if (otherPlayers.length > 0) {
          playerList.push(`👥 **Others:** ${otherPlayers.join(', ')}`);
        }
        const description = playerList.length > 0 ? playerList.join('\n\n') : 'No players online.';

        const options = whitelistOnline.slice(0, 25).map(username =>
          new StringSelectMenuOptionBuilder()
            .setLabel(username)
            .setValue(b64encode(username))
        );
        const selectMenu = new StringSelectMenuBuilder()
          .setCustomId('message_select')
          .setPlaceholder('Select player to message')
          .addOptions(options);
        const row = new ActionRowBuilder().addComponents(selectMenu);
        await interaction.editReply({
          embeds: [{
            title: `Online Players (${allOnlinePlayers.length})`,
            description,
            color: 3447003,
            timestamp: new Date()
          }],
          components: options.length > 0 ? [row] : []
        });
        
        // Auto-hide after 2 minutes
        setTimeout(async () => {
          try {
            await interaction.deleteReply();
          } catch (err) {
            // If deletion fails, try to edit to minimal content
            try {
              await interaction.editReply({ embeds: [], components: [], content: '_ _' });
            } catch (e) {
              // Ignore errors on cleanup
            }
          }
        }, 120000);
      } else if (interaction.customId === 'whitelist_button') {
        // Restrict Whitelist to owner/admin only
        const OWNER_ID = '623303738991443968';
        if (interaction.user.id !== OWNER_ID) {
          try {
            await interaction.reply({
              embeds: [{
                description: '❌ You do not have permission to manage the Whitelist.',
                color: 16711680,
                timestamp: new Date()
              }],
              flags: MessageFlags.Ephemeral
            });
          } catch {}
          return;
        }
        // Show two dropdowns: Add (online players not in whitelist) and Delete (whitelisted players)
        await interaction.deferReply();
        try {
          //
          let entries = [];
          let source = 'database';
          if (pool) {
            try {
              //
              const res = await pool.query('SELECT username FROM whitelist ORDER BY username ASC');
              entries = res.rows.map(r => r.username);
            } catch (dbErr) {
              console.error('[DB] Failed to fetch whitelist for UI, falling back to file:', dbErr.message);
              source = 'file';
              entries = loadWhitelist();
            }
          } else {
            //
            source = 'file';
            entries = loadWhitelist();
          }

          const total = entries.length;

          const allOnlinePlayers = bot ? Object.values(bot.players || {}).map(p => p.username) : [];
          const addCandidates = allOnlinePlayers.filter(u => !entries.some(n => n.toLowerCase() === u.toLowerCase()));
          const onlineCount = addCandidates.length;

          const addOptions = addCandidates.slice(0, 25).map(username =>
            new StringSelectMenuOptionBuilder().setLabel(username).setValue(b64encode(username))
          );
          const delOptions = entries.slice(0, 25).map(username =>
            new StringSelectMenuOptionBuilder().setLabel(username).setValue(b64encode(username))
          );

          const components = [];
          const addMenu = new StringSelectMenuBuilder()
            .setCustomId('add_whitelist_select')
            .setPlaceholder('Add to Whitelist (online)')
            .addOptions(addOptions);
          if (addOptions.length === 0) addMenu.setDisabled(true);
          components.push(new ActionRowBuilder().addComponents(addMenu));

          const delMenu = new StringSelectMenuBuilder()
            .setCustomId('delete_whitelist_select')
            .setPlaceholder('Delete from Whitelist')
            .addOptions(delOptions);
          if (delOptions.length === 0) delMenu.setDisabled(true);
          components.push(new ActionRowBuilder().addComponents(delMenu));

          await interaction.editReply({
            embeds: [{
              title: 'Whitelist Management',
              description: `Total: **${total}**
Add candidates online: **${onlineCount}**`,
              color: 3447003,
              timestamp: new Date()
            }],
            components
          });
          //
        } catch (e) {
          console.error('[Discord] Whitelist button handler failed:', e.message);
          await interaction.editReply({
            embeds: [{
              description: `Failed to load whitelist: ${e.message}`,
              color: 16711680,
              timestamp: new Date()
            }],
            components: []
          });
        }
      } else if (interaction.customId === 'drop_button') {
        // Restrict Drop to owner/admin only
        const OWNER_ID = '623303738991443968';
        if (interaction.user.id !== OWNER_ID) {
          try {
            await interaction.reply({
              embeds: [{
                description: '❌ You do not have permission to use Drop.',
                color: 16711680,
                timestamp: new Date()
              }],
              ephemeral: true
            });
          } catch {}
          return;
        }
        await interaction.deferReply();
        if (!bot) {
          await interaction.editReply({
            embeds: [{
              description: 'Bot is offline.',
              color: 16711680,
              timestamp: new Date()
            }]
          });
          return;
        }
        const inventory = bot.inventory.items();
        if (inventory.length === 0) {
          await interaction.editReply({
            embeds: [{
              description: 'Inventory is empty.',
              color: 3447003,
              timestamp: new Date()
            }]
          });
          return;
        }
        const options = inventory.map(item => {
          const name = item.displayName || item.name;
          const count = item.count;
          const value = `${item.slot}_${item.type}_${item.metadata || 0}`;
          return new StringSelectMenuOptionBuilder()
            .setLabel(`${name} x${count}`)
            .setValue(b64encode(value));
        });
        const selectMenu = new StringSelectMenuBuilder()
          .setCustomId('drop_select')
          .setPlaceholder('Select item to drop')
          .addOptions(options.slice(0, 25)); // Discord limit 25 options
        const row = new ActionRowBuilder().addComponents(selectMenu);
        await interaction.editReply({
          embeds: [{
            title: 'Drop Item',
            description: 'Select an item from inventory to drop.',
            color: 3447003,
            timestamp: new Date()
          }],
          components: [row]
        });
      } else if (interaction.customId === 'wn_button') {
        await interaction.deferReply();
        if (!bot || !bot.entity) {
          await interaction.editReply({
            embeds: [{
              description: 'Bot is offline.',
              color: 16711680,
              timestamp: new Date()
            }]
          });
          return;
        }
        const nearby = getNearbyPlayers();
        if (nearby.length === 0) {
          await interaction.editReply({
            embeds: [{
              description: 'No one nearby.',
              color: 3447003,
              timestamp: new Date()
            }]
          });
        } else {
          await interaction.editReply({
            embeds: [{
              title: `Nearby players (${nearby.length})`,
              description: nearby.map(p => `👤 **${p.username}** - ${p.distance} blocks`).join('\n'),
              color: 3447003,
              timestamp: new Date()
            }]
          });
        }
      } else if (interaction.customId === 'chat_setting_button') {
        // Restrict Chat Settings to owner only
        const OWNER_ID = '623303738991443968';
        if (interaction.user.id !== OWNER_ID) {
          try {
            await interaction.reply({
              embeds: [{
                description: '❌ You do not have permission to manage Chat Settings.',
                color: 16711680,
                timestamp: new Date()
              }],
              ephemeral: true
            });
            
            // Auto-hide after 2 minutes
            setTimeout(async () => {
              try {
                await interaction.deleteReply();
              } catch (err) {
                try {
                  await interaction.editReply({ embeds: [], components: [], content: '_ _' });
                } catch (e) {
                  // Ignore errors on cleanup
                }
              }
            }, 120000);
          } catch (err) {
            console.error('[Discord] Error sending permission denied message:', err.message);
          }
          return;
        }
        
        await interaction.deferReply();
        if (!bot) {
          await interaction.editReply({
            embeds: [{
              description: 'Bot is offline.',
              color: 16711680,
              timestamp: new Date()
            }]
          });
          return;
        }
        const allOnlinePlayers = Object.values(bot.players || {}).map(p => p.username);
        const playersToIgnore = allOnlinePlayers.filter(username => !ignoredChatUsernames.includes(username.toLowerCase()));
        const playersToUnignore = ignoredChatUsernames.filter(username => allOnlinePlayers.some(p => p.toLowerCase() === username));

        const ignoreOptions = playersToIgnore.map(username => {
          return new StringSelectMenuOptionBuilder()
            .setLabel(username)
            .setValue(b64encode(username));
        });
        const unignoreOptions = playersToUnignore.map(username => {
          return new StringSelectMenuOptionBuilder()
            .setLabel(username)
            .setValue(b64encode(username));
        });

        const ignoreMenu = new StringSelectMenuBuilder()
          .setCustomId('ignore_select')
          .setPlaceholder('Select player to ignore')
          .addOptions(ignoreOptions.slice(0, 25));
        const unignoreMenu = new StringSelectMenuBuilder()
          .setCustomId('unignore_select')
          .setPlaceholder('Select player to unignore')
          .addOptions(unignoreOptions.slice(0, 25));

        const components = [];
        if (ignoreOptions.length > 0) {
          components.push(new ActionRowBuilder().addComponents(ignoreMenu));
        }
        if (unignoreOptions.length > 0) {
          components.push(new ActionRowBuilder().addComponents(unignoreMenu));
        }

        await interaction.editReply({
          embeds: [{
            title: 'Chat Settings',
            description: 'Manage ignored players for chat messages.',
            color: 3447003,
            timestamp: new Date()
          }],
          components
        });
      } else if (interaction.customId === 'seen_button') {
        await interaction.deferReply();
        
        const activityData = await getWhitelistActivity();
        
        if (activityData.error) {
          await interaction.editReply({
            embeds: [{
              title: '🕒 Player Activity',
              description: `❌ Error: ${activityData.error}`,
              color: 16711680,
              timestamp: new Date()
            }]
          });
          return;
        }
        
        if (!activityData.players || activityData.players.length === 0) {
          await interaction.editReply({
            embeds: [{
              title: '🕒 Player Activity',
              description: 'No whitelist players found.',
              color: 3447003,
              timestamp: new Date()
            }]
          });
          return;
        }
        
        // Format the player activity information
        const formatTimeDiff = (timestamp) => {
          if (!timestamp) return 'Never seen';
          const now = new Date();
          const lastSeen = new Date(timestamp);
          const diffMs = now - lastSeen;
          const diffSecs = Math.floor(diffMs / 1000);
          const diffMins = Math.floor(diffSecs / 60);
          const diffHours = Math.floor(diffMins / 60);
          const diffDays = Math.floor(diffHours / 24);
          
          if (diffSecs < 60) return `${diffSecs}s ago`;
          if (diffMins < 60) return `${diffMins}m ${diffSecs % 60}s ago`;
          if (diffHours < 24) return `${diffHours}h ${diffMins % 60}m ago`;
          return `${diffDays}d ${diffHours % 24}h ago`;
        };
        
        const onlinePlayers = [];
        const offlinePlayers = [];
        
        for (const player of activityData.players) {
          const timeStr = formatTimeDiff(player.last_seen);
          const entry = `**${player.username}** - ${timeStr}`;
          
          if (player.is_online) {
            onlinePlayers.push(`🟢 ${entry}`);
          } else if (player.last_seen) {
            offlinePlayers.push(`⚪ ${entry}`);
          } else {
            offlinePlayers.push(`⚪ **${player.username}** - Never seen`);
          }
        }
        
        const description = [
          onlinePlayers.length > 0 ? '**Online:**\n' + onlinePlayers.join('\n') : '',
          offlinePlayers.length > 0 ? '\n**Offline:**\n' + offlinePlayers.join('\n') : ''
        ].filter(s => s).join('\n') || 'No activity data available.';
        
        // First send the reply without the Remove button to obtain the message ID
        await interaction.editReply({
          embeds: [{
            title: `🕒 Whitelist Activity (${activityData.players.length} players)`,
            description,
            color: 3447003,
            timestamp: new Date()
          }]
        });

        // Fetch the sent reply to get its ID, then add the Remove button bound to that ID
        const activityMessage = await interaction.fetchReply();
        await activityMessage.edit({
          embeds: [{
            title: `🕒 Whitelist Activity (${activityData.players.length} players)`,
            description,
            color: 3447003,
            timestamp: new Date()
          }],
          components: [
            new ActionRowBuilder()
              .addComponents(
                new ButtonBuilder()
                  .setCustomId(`remove_${activityMessage.id}`)
                  .setLabel('Remove')
                  .setStyle(ButtonStyle.Danger)
              )
          ]
        });
        
        // Update the message every 5 seconds
        const updateInterval = setInterval(async () => {
          try {
            const updatedData = await getWhitelistActivity();
            if (updatedData.error || !updatedData.players) {
              clearInterval(updateInterval);
              return;
            }
            
            const onlinePlayersUpdated = [];
            const offlinePlayersUpdated = [];
            
            for (const player of updatedData.players) {
              const timeStr = formatTimeDiff(player.last_seen);
              const entry = `**${player.username}** - ${timeStr}`;
              
              if (player.is_online) {
                onlinePlayersUpdated.push(`🟢 ${entry}`);
              } else if (player.last_seen) {
                offlinePlayersUpdated.push(`⚪ ${entry}`);
              } else {
                offlinePlayersUpdated.push(`⚪ **${player.username}** - Never seen`);
              }
            }
            
            const updatedDescription = [
              onlinePlayersUpdated.length > 0 ? '**Online:**\n' + onlinePlayersUpdated.join('\n') : '',
              offlinePlayersUpdated.length > 0 ? '\n**Offline:**\n' + offlinePlayersUpdated.join('\n') : ''
            ].filter(s => s).join('\n') || 'No activity data available.';
            
            await activityMessage.edit({
              embeds: [{
                title: `🕒 Whitelist Activity (${updatedData.players.length} players)`,
                description: updatedDescription,
                color: 3447003,
                timestamp: new Date()
              }],
              components: [
                new ActionRowBuilder()
                  .addComponents(
                    new ButtonBuilder()
                      .setCustomId(`remove_${activityMessage.id}`)
                      .setLabel('Remove')
                      .setStyle(ButtonStyle.Danger)
                  )
              ]
            });
          } catch (err) {
            // If the message was deleted or is unknown, stop the interval quietly
            const msg = (err && err.message) ? err.message : '';
            if (err.code === 10008 || msg.includes('Unknown Message')) {
              clearInterval(updateInterval);
            } else {
              clearInterval(updateInterval);
            }
          }
        }, 1000);
        
        // Stop updating after 5 minutes to avoid infinite updates.
        setTimeout(() => {
          clearInterval(updateInterval);
        }, 5 * 60 * 1000);
      } else if (interaction.customId === 'mentions_button') {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        
        const result = await getUserMentionKeywords(interaction.user.id);
        
        if (!result.success) {
          await interaction.editReply({
            embeds: [{
              title: '❌ Error',
              description: `Failed to load keywords: ${result.error}`,
              color: 16711680,
              timestamp: new Date()
            }]
          });
          return;
        }

        const keywords = result.keywords || [];
        const description = keywords.length > 0
          ? `**Your current mention keywords:**\n${keywords.map(k => `• \`${k}\``).join('\n')}\n\nYou will be mentioned in Discord when these words appear in game chat.`
          : 'You have no mention keywords set.\n\nAdd keywords to get mentioned when they appear in game chat.';

        const components = [
          new ActionRowBuilder()
            .addComponents(
              new ButtonBuilder()
                .setCustomId('add_mention_keyword')
                .setLabel('➕ Add Keyword')
                .setStyle(ButtonStyle.Success),
              new ButtonBuilder()
                .setCustomId('remove_mention_keyword_button')
                .setLabel('➖ Remove Keyword')
                .setStyle(ButtonStyle.Danger)
                .setDisabled(keywords.length === 0)
            )
        ];

        // Add remove option if there are keywords
        if (keywords.length > 0) {
          const removeOptions = keywords.slice(0, 25).map(keyword =>
            new StringSelectMenuOptionBuilder()
              .setLabel(keyword)
              .setValue(keyword)
          );
          
          const selectMenu = new StringSelectMenuBuilder()
            .setCustomId('remove_mention_keyword_select')
            .setPlaceholder('Select keyword to remove')
            .addOptions(removeOptions);
          
          components.push(new ActionRowBuilder().addComponents(selectMenu));
        }

        await interaction.editReply({
          embeds: [{
            title: '🔔 Mention Keywords',
            description,
            color: 3447003,
            timestamp: new Date()
          }],
          components
        });
        // Auto-hide: try deleting ephemeral reply, else collapse content
        setTimeout(async () => {
          try {
            await interaction.deleteReply();
          } catch (e) {
            try {
              await interaction.editReply({
                embeds: [{
                  description: '🔔 Mentions panel dismissed.',
                  color: 3447003,
                  timestamp: new Date()
                }],
                components: []
              });
            } catch {}
          }
        }, 2 * 60 * 1000);
      } else if (interaction.customId.startsWith('reply_')) {
        const parts = interaction.customId.split('_');
        const encodedUsername = parts[1];
        const username = b64decode(encodedUsername);
        const modal = new ModalBuilder()
          .setCustomId(`reply_modal_${encodedUsername}`)
          .setTitle(`Reply to ${username}`);

        const messageInput = new TextInputBuilder()
          .setCustomId('reply_message')
          .setLabel('Message')
          .setStyle(TextInputStyle.Paragraph)
          .setValue('/r ')
          .setRequired(true);

        const actionRow = new ActionRowBuilder().addComponents(messageInput);
        modal.addComponents(actionRow);

        await interaction.showModal(modal);
      } else if (interaction.customId.startsWith('remove_')) {
        const messageId = interaction.customId.split('_')[1];
        try {
          const message = await interaction.channel.messages.fetch(messageId);
          await message.delete();
          // If it was an auth message, untrack and drop exclusion
          if (authMessageIds.has(messageId)) {
            authMessageIds.delete(messageId);
            const idx = excludedMessageIds.indexOf(messageId);
            if (idx !== -1) excludedMessageIds.splice(idx, 1);
          }
          // Remove from conversations map
          for (const [username, msgId] of whisperConversations) {
            if (msgId === messageId) {
              whisperConversations.delete(username);
              break;
            }
          }
          await interaction.deferUpdate();
        } catch (e) {
          console.error('[Discord] Failed to delete message:', e.message);
          await interaction.reply({ content: 'Failed to delete message.', ephemeral: true });
        }
      } else if (interaction.customId === 'add_mention_keyword') {
        const modal = new ModalBuilder()
          .setCustomId('add_keyword_modal')
          .setTitle('Add Mention Keyword');

        const keywordInput = new TextInputBuilder()
          .setCustomId('keyword_input')
          .setLabel('Keyword')
          .setPlaceholder('e.g., bdiev, bdiev_ or whatever you want')
          .setStyle(TextInputStyle.Short)
          .setRequired(true);

        const actionRow = new ActionRowBuilder().addComponents(keywordInput);
        modal.addComponents(actionRow);

        await interaction.showModal(modal);
      } else if (interaction.customId === 'remove_mention_keyword_button') {
        const modal = new ModalBuilder()
          .setCustomId('remove_keyword_modal')
          .setTitle('Remove Mention Keyword');

        const keywordInput = new TextInputBuilder()
          .setCustomId('keyword_remove_input')
          .setLabel('Keyword to Remove')
          .setPlaceholder('Enter keyword to remove')
          .setStyle(TextInputStyle.Short)
          .setRequired(true);

        const actionRow = new ActionRowBuilder().addComponents(keywordInput);
        modal.addComponents(actionRow);

        await interaction.showModal(modal);
      }
    } else if (interaction.isModalSubmit() && interaction.customId === 'add_keyword_modal') {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      
      const keyword = interaction.fields.getTextInputValue('keyword_input').trim().toLowerCase();
      
      if (!keyword) {
        await interaction.editReply('❌ Keyword cannot be empty.');
        return;
      }

      const result = await addMentionKeyword(interaction.user.id, keyword);
      
      if (result.success) {
        await interaction.editReply({
          embeds: [{
            title: '✅ Keyword Added',
            description: `You will now be mentioned when someone says "\`${keyword}\`" in game chat.`,
            color: 65280,
            timestamp: new Date()
          }]
        });
        setTimeout(async () => {
          try {
            await interaction.deleteReply();
          } catch (e) {
            try {
              await interaction.editReply({
                embeds: [{
                  description: '✅ Keyword added (hidden).',
                  color: 65280,
                  timestamp: new Date()
                }]
              });
            } catch {}
          }
        }, 2 * 60 * 1000);
      } else {
        await interaction.editReply(`❌ Failed to add keyword: ${result.error}`);
      }
    } else if (interaction.isModalSubmit() && interaction.customId === 'remove_keyword_modal') {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      
      const keyword = interaction.fields.getTextInputValue('keyword_remove_input').trim().toLowerCase();
      
      if (!keyword) {
        await interaction.editReply('❌ Keyword cannot be empty.');
        return;
      }

      const result = await removeMentionKeyword(interaction.user.id, keyword);
      
      if (result.success) {
        if (result.removed) {
          await interaction.editReply({
            embeds: [{
              title: '✅ Keyword Removed',
              description: `You will no longer be mentioned for "\`${keyword}\`".`,
              color: 65280,
              timestamp: new Date()
            }]
          });
          setTimeout(async () => {
            try {
              await interaction.deleteReply();
            } catch (e) {
              try {
                await interaction.editReply({
                  embeds: [{
                    description: '✅ Keyword removed (hidden).',
                    color: 65280,
                    timestamp: new Date()
                  }]
                });
              } catch {}
            }
          }, 2 * 60 * 1000);
        } else {
          await interaction.editReply(`Keyword "\`${keyword}\`" was not in your list.`);
        }
      } else {
        await interaction.editReply(`❌ Failed to remove keyword: ${result.error}`);
      }
    } else if (interaction.isModalSubmit() && interaction.customId === 'say_modal') {
      // FIX: ephemeral flags
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const message = interaction.fields.getTextInputValue('message_input');
      if (message && bot) {
        bot.chat(message);
        console.log(`[Modal] Say "${message}" by ${interaction.user.tag}`);
        
        // Delete ephemeral reply after bot sends message
        setTimeout(async () => {
          try {
            await interaction.deleteReply();
          } catch (e) {
            // Silent error
          }
        }, 500);
        
        // Send feedback message to status channel showing what bot sent
        try {
          const statusChannel = await discordClient.channels.fetch(DISCORD_CHANNEL_ID);
          if (statusChannel && statusChannel.isTextBased()) {
            await statusChannel.send({
              embeds: [{
                description: `✅ **${interaction.user.username}** sent:\n\`${message}\``,
                color: 65280,
                timestamp: new Date(),
                footer: {
                  text: 'Sent to game chat'
                }
              }]
            });
          }
        } catch (e) {
          console.error('[Say] Failed to send feedback:', e.message);
        }
      } else {
        setTimeout(() => interaction.deleteReply().catch(() => {}), 1000);
      }
    } else if (interaction.isModalSubmit() && interaction.customId.startsWith('reply_modal_')) {
      // FIX: ephemeral flags
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const encodedUsername = interaction.customId.split('_')[2];
      const username = b64decode(encodedUsername);
      const replyMessage = interaction.fields.getTextInputValue('reply_message');
      console.log(`[Reply] Processing reply for ${username}, message: ${replyMessage}, has conversation: ${whisperConversations.has(username)}`);
      if (replyMessage && bot) {
        let command;
        if (replyMessage.startsWith('/')) {
          command = replyMessage;
          console.log(`[Reply] Sent command "${command}" by ${interaction.user.tag}`);
        } else {
          command = `/msg ${username} ${replyMessage}`;
          console.log(`[Reply] Sent /msg ${username} ${replyMessage} by ${interaction.user.tag}`);
        }
        bot.chat(command);

        // Mark outbound whisper to suppress any unexpected public echo
        let outText = replyMessage;
        if (replyMessage.startsWith('/r ')) {
          outText = replyMessage.slice(3).trim();
        }
        const normalizedOut = outText
          .replace(/§[0-9a-fk-or]/gi, '')
          .replace(/[\u0000-\u0008\u000B-\u000C\u000E-\u001F\u007F]/g, '')
          .trim();
        if (normalizedOut) {
          const outKey = `OUTBOUND:${username.toLowerCase()}:${normalizedOut}`;
          outboundWhispers.set(outKey, Date.now());
        }

        // Update the conversation message
        const now = new Date();
        const timeStr = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
        let displayMessage = replyMessage;
        if (replyMessage.startsWith('/r ')) {
          displayMessage = replyMessage.slice(3).trim();
        }
        const replyEntry = `[${timeStr}] ➡️ ${bot.username}: ${displayMessage}`;

        if (whisperConversations.has(username)) {
          // Update existing conversation
          const messageId = whisperConversations.get(username);
          try {
            const channel = await discordClient.channels.fetch(DISCORD_CHANNEL_ID);
            const existingMessage = await channel.messages.fetch(messageId);
            const currentDesc = existingMessage.embeds[0]?.description || '';
            let updatedDesc = currentDesc + '\n\n' + replyEntry;
            if (updatedDesc.length > 4096) {
              // Truncate to fit within Discord embed limit
              updatedDesc = updatedDesc.substring(updatedDesc.length - 4096 + 100);
              updatedDesc = '...(truncated)\n\n' + updatedDesc.split('\n\n').slice(1).join('\n\n');
            }
            console.log(`[Discord] Updating conversation for ${username}, desc length: ${updatedDesc.length}`);
            await existingMessage.edit({
              embeds: [{
                title: `Conversation with ${username}`,
                description: updatedDesc,
                color: 3447003,
                timestamp: existingMessage.embeds[0]?.timestamp || now
              }],
              components: existingMessage.components
            });
            console.log('[Discord] Conversation updated successfully');
          } catch (e) {
            console.error('[Discord] Failed to update conversation:', e.message);
          }
        } else {
          // Create new conversation
          try {
            const channel = await discordClient.channels.fetch(DISCORD_CHANNEL_ID);
            let displayMessage = replyMessage;
            if (replyMessage.startsWith('/r ')) {
              displayMessage = replyMessage.slice(3).trim();
            }
            const replyEntry = `[${timeStr}] ➡️ ${bot.username}: ${displayMessage}`;
            const sentMessage = await channel.send({
              embeds: [{
                title: `Conversation with ${username}`,
                description: replyEntry,
                color: 3447003,
                timestamp: now
              }]
            });
            whisperConversations.set(username, sentMessage.id);
            await sentMessage.edit({
              embeds: [{
                title: `Conversation with ${username}`,
                description: replyEntry,
                color: 3447003,
                timestamp: now
              }],
              components: [
                new ActionRowBuilder()
                  .addComponents(
                    new ButtonBuilder()
                      .setCustomId(`reply_${b64encode(username)}_${sentMessage.id}`)
                      .setLabel('Reply')
                      .setStyle(ButtonStyle.Primary),
                    new ButtonBuilder()
                      .setCustomId(`remove_${sentMessage.id}`)
                      .setLabel('Remove')
                      .setStyle(ButtonStyle.Danger)
                  )
              ]
            });
            console.log(`[Discord] Created new conversation for ${username}`);
          } catch (e) {
            console.error('[Discord] Failed to create conversation:', e.message);
          }
        }
      }
      setTimeout(() => interaction.deleteReply().catch(() => {}), 1000);
    } else if (interaction.isModalSubmit() && interaction.customId.startsWith('message_modal_')) {
      const encodedUsername = interaction.customId.split('_')[2];
      const selectedUsername = b64decode(encodedUsername);
      const messageText = interaction.fields.getTextInputValue('message_text');
      if (messageText && bot) {
        let command;
        let displayMessage = messageText;
        if (messageText.startsWith('/msg ')) {
          displayMessage = messageText.replace(`/msg ${selectedUsername} `, '');
        }
        if (messageText.startsWith('/')) {
          command = messageText;
          console.log(`[Message] Sent command "${command}" by ${interaction.user.tag}`);
        } else {
          command = `/msg ${selectedUsername} ${messageText}`;
          console.log(`[Message] Sent /msg ${selectedUsername} ${messageText} by ${interaction.user.tag}`);
        }
        bot.chat(command);

        // Mark outbound whisper(s) to suppress any unexpected public echoes
        const normalized = displayMessage
          .replace(/§[0-9a-fk-or]/gi, '')
          .replace(/[\u0000-\u0008\u000B-\u000C\u000E-\u001F\u007F]/g, '')
          .trim();
        if (normalized) {
          const outKey = `OUTBOUND:${selectedUsername.toLowerCase()}:${normalized}`;
          outboundWhispers.set(outKey, Date.now());
        }

        // Ensure private channel per user+target
        const whisperChannel = await getOrCreateWhisperChannel(interaction.user.id, interaction.user.tag, selectedUsername);
        if (!whisperChannel) {
          await interaction.reply({ content: 'Message sent in-game, but failed to create/find your private dialog channel. Check DISCORD_DM_CATEGORY_ID.', flags: MessageFlags.Ephemeral });
          return;
        }

        await interaction.reply({ content: 'Message sent.', flags: MessageFlags.Ephemeral });
        setTimeout(() => interaction.deleteReply().catch(() => {}), 1000);

        // Write conversation entry in the private channel with styling and auto-delete
        try {
          await sendWhisperEmbed(whisperChannel, {
            senderLabel: interaction.user.username,
            body: displayMessage
          });
          scheduleWhisperCleanup(whisperChannel.id);
          // Track channel for inbound replies routing
          whisperChannels.set(`${interaction.user.id}:${selectedUsername.toLowerCase()}`, whisperChannel.id);
        } catch (e) {
          console.error('[Whisper] Failed to write to dialog channel:', e.message);
        }
      }
    } else if (interaction.isStringSelectMenu() && interaction.customId.startsWith('set_ttl_select_')) {
      await interaction.deferUpdate();
      const channelId = interaction.customId.replace('set_ttl_select_', '');
      const minutes = parseInt(interaction.values[0], 10);

      const ttlMs = minutes * 60 * 1000;
      customDialogTTL.set(channelId, ttlMs);

      // Update the deletion timestamp for the current message to apply new TTL immediately
      const newDeleteTimestamp = Date.now() + ttlMs;
      whisperDeleteTimestamps.set(channelId, newDeleteTimestamp);

      // Reschedule the cleanup with new TTL
      scheduleWhisperCleanup(channelId, ttlMs);

      await interaction.editReply({ 
        content: `✅ Auto-delete time set to ${minutes} minute${minutes !== 1 ? 's' : ''}. This will apply to new messages in this dialog.`,
        components: []
      });
      setTimeout(() => interaction.deleteReply().catch(() => {}), 5000);
    } else if (interaction.isStringSelectMenu() && interaction.customId === 'message_select') {
      const encodedUsername = interaction.values[0];
      const selectedUsername = b64decode(encodedUsername);
      const modal = new ModalBuilder()
        .setCustomId(`message_modal_${encodedUsername}`)
        .setTitle(`Message to ${selectedUsername}`);

      const messageInput = new TextInputBuilder()
        .setCustomId('message_text')
        .setLabel('Message')
        .setStyle(TextInputStyle.Paragraph)
        .setValue(`/msg ${selectedUsername} `)
        .setRequired(true);

      const actionRow = new ActionRowBuilder().addComponents(messageInput);
      modal.addComponents(actionRow);

      await interaction.showModal(modal);
    } else if (interaction.isStringSelectMenu() && interaction.customId === 'drop_select') {
      await interaction.deferUpdate();
      const encodedValue = interaction.values[0];
      const selectedValue = b64decode(encodedValue);
      const [slot, type, metadata] = selectedValue.split('_').map((v, i) => i === 2 ? parseInt(v) : v);
      const inventory = bot.inventory.items();
      const item = inventory.find(i => i.slot == slot && i.type == type && (i.metadata || 0) == metadata);
      if (!item) {
        await interaction.editReply({
          embeds: [{
            description: 'Item not found.',
            color: 16711680,
            timestamp: new Date()
          }],
          components: []
        });
        return;
      }
      try {
        // Find nearest player and look at them before dropping
        const nearby = getNearbyPlayers();
        if (nearby.length > 0) {
          const nearest = nearby.sort((a, b) => a.distance - b.distance)[0];
          for (const entity of Object.values(bot.entities)) {
            if (entity.username === nearest.username) {
              await bot.lookAt(entity.position);
              break;
            }
          }
        }
        await bot.toss(item.type, item.metadata || null, item.count);
        console.log(`[Drop] Dropped ${item.count} x ${item.displayName || item.name} by ${interaction.user.tag}`);
        await interaction.editReply({
          embeds: [{
            title: 'Item Dropped',
            description: `Dropped ${item.count} x ${item.displayName || item.name}`,
            color: 65280,
            timestamp: new Date()
          }],
          components: []
        });
      } catch (err) {
        console.error('[Drop] Error:', err.message);
        await interaction.editReply({
          embeds: [{
            description: `Failed to drop item: ${err.message}`,
            color: 16711680,
            timestamp: new Date()
          }],
          components: []
        });
      }
    } else if (interaction.isStringSelectMenu() && interaction.customId === 'remove_mention_keyword_select') {
      await interaction.deferUpdate();
      
      const keyword = interaction.values[0];
      const result = await removeMentionKeyword(interaction.user.id, keyword);
      
      if (result.success && result.removed) {
        // Refresh the mention keywords list
        const updatedResult = await getUserMentionKeywords(interaction.user.id);
        const keywords = updatedResult.keywords || [];
        
        const description = keywords.length > 0
          ? `**Your current mention keywords:**\n${keywords.map(k => `• \`${k}\``).join('\n')}\n\nYou will be mentioned in Discord when these words appear in game chat.`
          : 'You have no mention keywords set.\n\nAdd keywords to get mentioned when they appear in game chat.';

        const components = [
          new ActionRowBuilder()
            .addComponents(
              new ButtonBuilder()
                .setCustomId('add_mention_keyword')
                .setLabel('➕ Add Keyword')
                .setStyle(ButtonStyle.Success)
            )
        ];

        if (keywords.length > 0) {
          const removeOptions = keywords.slice(0, 25).map(kw =>
            new StringSelectMenuOptionBuilder()
              .setLabel(kw)
              .setValue(kw)
          );
          
          const selectMenu = new StringSelectMenuBuilder()
            .setCustomId('remove_mention_keyword_select')
            .setPlaceholder('Select keyword to remove')
            .addOptions(removeOptions);
          
          components.push(new ActionRowBuilder().addComponents(selectMenu));
        }

        await interaction.editReply({
          embeds: [{
            title: '🔔 Mention Keywords',
            description: `✅ Removed keyword "\`${keyword}\`"\n\n${description}`,
            color: 65280,
            timestamp: new Date()
          }],
          components
        });
      } else {
        await interaction.editReply({
          embeds: [{
            title: '❌ Error',
            description: result.error || 'Failed to remove keyword',
            color: 16711680,
            timestamp: new Date()
          }]
        });
      }
    } else if (interaction.isStringSelectMenu() && interaction.customId === 'ignore_select') {
      await interaction.deferUpdate();
      const encodedUsername = interaction.values[0];
      const selectedUsername = b64decode(encodedUsername);
      if (!pool) {
        await interaction.editReply({
          embeds: [{
            description: 'Database not configured.',
            color: 16711680,
            timestamp: new Date()
          }],
          components: []
        });
        return;
      }
      try {
        await pool.query('INSERT INTO ignored_users (username, added_by) VALUES ($1, $2) ON CONFLICT (username) DO NOTHING', [selectedUsername.toLowerCase(), interaction.user.tag]);
        ignoredChatUsernames = await loadIgnoredChatUsernames();
        console.log(`[Ignore] Added ${selectedUsername} to ignore list by ${interaction.user.tag}`);

        // Update the message with new lists
        const allOnlinePlayers = Object.values(bot.players || {}).map(p => p.username);
        const playersToIgnore = allOnlinePlayers.filter(username => !ignoredChatUsernames.includes(username.toLowerCase()));
        const playersToUnignore = ignoredChatUsernames.filter(username => allOnlinePlayers.some(p => p.toLowerCase() === username));

        const ignoreOptions = playersToIgnore.map(username => {
          return new StringSelectMenuOptionBuilder()
            .setLabel(username)
            .setValue(b64encode(username));
        });
        const unignoreOptions = playersToUnignore.map(username => {
          return new StringSelectMenuOptionBuilder()
            .setLabel(username)
            .setValue(b64encode(username));
        });

        const ignoreMenu = new StringSelectMenuBuilder()
          .setCustomId('ignore_select')
          .setPlaceholder('Select player to ignore')
          .addOptions(ignoreOptions.slice(0, 25));
        const unignoreMenu = new StringSelectMenuBuilder()
          .setCustomId('unignore_select')
          .setPlaceholder('Select player to unignore')
          .addOptions(unignoreOptions.slice(0, 25));

        const components = [];
        if (ignoreOptions.length > 0) {
          components.push(new ActionRowBuilder().addComponents(ignoreMenu));
        }
        if (unignoreOptions.length > 0) {
          components.push(new ActionRowBuilder().addComponents(unignoreMenu));
        }

        await interaction.editReply({
          embeds: [{
            title: 'Chat Settings',
            description: `✅ Added ${selectedUsername} to ignore list.\n\nManage ignored players for chat messages.`,
            color: 65280,
            timestamp: new Date()
          }],
          components
        });
        setTimeout(() => interaction.message.delete().catch(() => {}), 1000);
      } catch (err) {
        console.error('[Ignore] Error:', err.message);
        await interaction.editReply({
          embeds: [{
            description: `Failed to add ${selectedUsername} to ignore list: ${err.message}`,
            color: 16711680,
            timestamp: new Date()
          }],
          components: []
        });
      }
    } else if (interaction.isStringSelectMenu() && interaction.customId === 'unignore_select') {
      await interaction.deferUpdate();
      const encodedUsername = interaction.values[0];
      const selectedUsername = b64decode(encodedUsername);
      if (!pool) {
        await interaction.editReply({
          embeds: [{
            description: 'Database not configured.',
            color: 16711680,
            timestamp: new Date()
          }],
          components: []
        });
        return;
      }
      try {
        const result = await pool.query('DELETE FROM ignored_users WHERE username = $1', [selectedUsername.toLowerCase()]);
        if (result.rowCount > 0) {
          ignoredChatUsernames = await loadIgnoredChatUsernames();
          console.log(`[Unignore] Removed ${selectedUsername} from ignore list by ${interaction.user.tag}`);

          // Update the message with new lists
          const allOnlinePlayers = Object.values(bot.players || {}).map(p => p.username);
          const playersToIgnore = allOnlinePlayers.filter(username => !ignoredChatUsernames.includes(username.toLowerCase()));
          const playersToUnignore = ignoredChatUsernames.filter(username => allOnlinePlayers.some(p => p.toLowerCase() === username));

          const ignoreOptions = playersToIgnore.map(username => {
            return new StringSelectMenuOptionBuilder()
              .setLabel(username)
              .setValue(b64encode(username));
          });
          const unignoreOptions = playersToUnignore.map(username => {
            return new StringSelectMenuOptionBuilder()
              .setLabel(username)
              .setValue(b64encode(username));
          });

          const ignoreMenu = new StringSelectMenuBuilder()
            .setCustomId('ignore_select')
            .setPlaceholder('Select player to ignore')
            .addOptions(ignoreOptions.slice(0, 25));
          const unignoreMenu = new StringSelectMenuBuilder()
            .setCustomId('unignore_select')
            .setPlaceholder('Select player to unignore')
            .addOptions(unignoreOptions.slice(0, 25));

          const components = [];
          if (ignoreOptions.length > 0) {
            components.push(new ActionRowBuilder().addComponents(ignoreMenu));
          }
          if (unignoreOptions.length > 0) {
            components.push(new ActionRowBuilder().addComponents(unignoreMenu));
          }

          await interaction.editReply({
            embeds: [{
              title: 'Chat Settings',
              description: `✅ Removed ${selectedUsername} from ignore list.\n\nManage ignored players for chat messages.`,
              color: 65280,
              timestamp: new Date()
            }],
            components
          });
          setTimeout(() => interaction.message.delete().catch(() => {}), 1000);
        } else {
          await interaction.editReply({
            embeds: [{
              description: `${selectedUsername} is not in ignore list.`,
              color: 16776960,
              timestamp: new Date()
            }],
            components: []
          });
        }
      } catch (err) {
        console.error('[Unignore] Error:', err.message);
        await interaction.editReply({
          embeds: [{
            description: `Failed to remove ${selectedUsername} from ignore list: ${err.message}`,
            color: 16711680,
            timestamp: new Date()
          }],
          components: []
        });
      }
    } else if (interaction.isStringSelectMenu() && interaction.customId === 'delete_whitelist_select') {

      try {
        await interaction.deferUpdate();
        

        const encodedUsername = interaction.values[0];
        const selectedUsername = b64decode(encodedUsername);
        

        let whitelist = [];
        let source = 'database';
        let success = false;

        try {
          // Try database first
          if (pool) {
            
            const result = await pool.query('DELETE FROM whitelist WHERE username = $1', [selectedUsername]);
            

            if (result.rowCount > 0) {
              // Reload whitelist from database
              const newWhitelist = await loadWhitelistFromDB();
              ignoredUsernames.length = 0;
              ignoredUsernames.push(...newWhitelist);
              whitelist = newWhitelist;
              
              success = true;
            } else {
              
            }
          }

          // If database failed or not available, try file-based whitelist
          if (!success && !pool) {
            source = 'file';
            
            const fileWhitelist = loadWhitelist();
            const newWhitelist = fileWhitelist.filter(username => username !== selectedUsername);

            if (newWhitelist.length === fileWhitelist.length) {
              
              await interaction.editReply({
                embeds: [{
                  description: `${selectedUsername} is not in whitelist.`,
                  color: 16776960,
                  timestamp: new Date()
                }],
                components: []
              });
              return;
            }

            // Update the file
            fs.writeFileSync('whitelist.txt', newWhitelist.join('\n') + '\n');
            whitelist = newWhitelist;
            ignoredUsernames.length = 0;
            ignoredUsernames.push(...newWhitelist);
            
            success = true;
          }

          if (!success) {
            
            await interaction.editReply({
              embeds: [{
                description: `${selectedUsername} is not in whitelist.`,
                color: 16776960,
                timestamp: new Date()
              }],
              components: []
            });
            return;
          }

          // Update the message
          const allOnlinePlayers = bot ? Object.values(bot.players || {}).map(p => p.username) : [];
          const addCandidates = allOnlinePlayers.filter(u => !whitelist.some(n => n.toLowerCase() === u.toLowerCase()));
          const addOptions = addCandidates.slice(0, 25).map(username =>
            new StringSelectMenuOptionBuilder().setLabel(username).setValue(b64encode(username))
          );
          const delOptions = whitelist.slice(0, 25).map(username =>
            new StringSelectMenuOptionBuilder().setLabel(username).setValue(b64encode(username))
          );

          const components = [];
          const addMenu = new StringSelectMenuBuilder()
            .setCustomId('add_whitelist_select')
            .setPlaceholder('Add to Whitelist (online)')
            .addOptions(addOptions);
          if (addOptions.length === 0) addMenu.setDisabled(true);
          components.push(new ActionRowBuilder().addComponents(addMenu));

          const delMenu = new StringSelectMenuBuilder()
            .setCustomId('delete_whitelist_select')
            .setPlaceholder('Delete from Whitelist')
            .addOptions(delOptions);
          if (delOptions.length === 0) delMenu.setDisabled(true);
          components.push(new ActionRowBuilder().addComponents(delMenu));

          await interaction.editReply({
            embeds: [{
              title: 'Whitelist Management',
              description: `✅ Removed ${selectedUsername} from whitelist.\n\nTotal: **${whitelist.length}**\nAdd candidates online: **${addCandidates.length}**`,
              color: 65280,
              timestamp: new Date()
            }],
            components
          });

          // Close the Whitelist Management message shortly after the action
          setTimeout(() => interaction.message?.delete().catch(() => {}), 1000);

          
        } catch (err) {
          console.error('[Whitelist Delete] Error:', err.message);

          try {
            await interaction.editReply({
              embeds: [{
                description: `Failed to remove ${selectedUsername} from whitelist: ${err.message}`,
                color: 16711680,
                timestamp: new Date()
              }],
              components: []
            });
            
          } catch (finalErr) {
            console.error('Failed to send error reply:', finalErr.message);
            try {
              await interaction.followUp({
                content: `❌ Whitelist removal error: ${finalErr.message}`,
                flags: MessageFlags.Ephemeral
              });
              
            } catch (followUpErr) {
              console.error('All reply methods failed:', followUpErr.message);
            }
          }
        }
      } catch (outerErr) {
        console.error('Whitelist delete outer error:', outerErr.message);
        try {
          await interaction.reply({
            content: `❌ Critical whitelist error: ${outerErr.message}`,
              flags: MessageFlags.Ephemeral
          });
        } catch (replyErr) {
          console.error('Failed to send outer error reply:', replyErr.message);
        }
      }
    } else if (interaction.isStringSelectMenu() && interaction.customId === 'add_whitelist_select') {
      await interaction.deferUpdate();
      const encodedUsername = interaction.values[0];
      const selectedUsername = b64decode(encodedUsername);
      try {
        let whitelist = [];
        let source = 'database';
        let success = false;
        if (pool) {
          try {
            await pool.query('INSERT INTO whitelist (username, added_by) VALUES ($1, $2) ON CONFLICT (username) DO NOTHING', [selectedUsername, interaction.user.tag]);
            const newWhitelist = await loadWhitelistFromDB();
            ignoredUsernames.length = 0;
            ignoredUsernames.push(...newWhitelist);
            whitelist = newWhitelist;
            success = true;
          } catch (dbErr) {
            console.error('[Whitelist Add] DB error:', dbErr.message);
          }
        }
        if (!success && !pool) {
          source = 'file';
          const fileWhitelist = loadWhitelist();
          if (!fileWhitelist.some(n => n.toLowerCase() === selectedUsername.toLowerCase())) {
            fs.appendFileSync('whitelist.txt', `${selectedUsername}\n`);
          }
          whitelist = loadWhitelist();
          ignoredUsernames.length = 0;
          ignoredUsernames.push(...whitelist);
          success = true;
        }

        const allOnlinePlayers = bot ? Object.values(bot.players || {}).map(p => p.username) : [];
        const addCandidates = allOnlinePlayers.filter(u => !whitelist.some(n => n.toLowerCase() === u.toLowerCase()));
        const addOptions = addCandidates.slice(0, 25).map(username =>
          new StringSelectMenuOptionBuilder().setLabel(username).setValue(b64encode(username))
        );
        const delOptions = whitelist.slice(0, 25).map(username =>
          new StringSelectMenuOptionBuilder().setLabel(username).setValue(b64encode(username))
        );

        const components = [];
        const addMenu = new StringSelectMenuBuilder()
          .setCustomId('add_whitelist_select')
          .setPlaceholder('Add to Whitelist (online)')
          .addOptions(addOptions);
        if (addOptions.length === 0) addMenu.setDisabled(true);
        components.push(new ActionRowBuilder().addComponents(addMenu));

        const delMenu = new StringSelectMenuBuilder()
          .setCustomId('delete_whitelist_select')
          .setPlaceholder('Delete from Whitelist')
          .addOptions(delOptions);
        if (delOptions.length === 0) delMenu.setDisabled(true);
        components.push(new ActionRowBuilder().addComponents(delMenu));

        await interaction.editReply({
          embeds: [{
            title: 'Whitelist Management',
            description: `${success ? `✅ Added ${selectedUsername} to whitelist.` : `No changes for ${selectedUsername}.`}\n\nTotal: **${whitelist.length}**\nAdd candidates online: **${addCandidates.length}**`,
            color: success ? 65280 : 16776960,
            timestamp: new Date()
          }],
          components
        });

        // Close the Whitelist Management message shortly after the action
        setTimeout(() => interaction.message?.delete().catch(() => {}), 1000);
      } catch (err) {
        console.error('[Whitelist Add] Error:', err.message);
        await interaction.editReply({
          embeds: [{
            description: `Failed to add ${selectedUsername}: ${err.message}`,
            color: 16711680,
            timestamp: new Date()
          }]
        });
      }
    }
  });

  discordClient.on('messageCreate', async message => {
    if (message.author.bot) return;

    // Dialog channel relay: convert plain text to /msg for the mapped Minecraft player
    for (const [key, channelId] of whisperChannels.entries()) {
      if (channelId === message.channel.id) {
        const [ownerId, mcUsername] = key.split(':');
        if (message.author.id !== ownerId) return; // Only channel owner can send
        if (!bot) {
          await message.reply({ content: 'Bot is offline, message not sent.' });
          return;
        }

        const raw = message.content.trim();
        if (!raw) return;

        // Remove a leading /msg <user> if user typed it manually
        const prefix = new RegExp(`^/msg\s+${mcUsername}\s+`, 'i');
        let clean = raw.replace(prefix, '');
        
        // Handle multiline messages - send each line as separate /msg
        const lines = clean.split('\n').map(line => line.trim()).filter(line => line.length > 0);
        if (lines.length === 0) return;

        for (const line of lines) {
          // Minecraft chat has a 256 character limit per message
          const truncated = line.substring(0, 240);
          const command = `/msg ${mcUsername} ${truncated}`;
          
          try {
            bot.chat(command);
            console.log(`[Whisper Relay] Sent to ${mcUsername}: ${truncated} (by ${message.author.tag})`);
          } catch (e) {
            console.error('[Whisper Relay] Failed to send message:', e.message);
          }

          // Mark outbound whisper to suppress any unexpected public echo
          const normalizedLine = truncated
            .replace(/§[0-9a-fk-or]/gi, '')
            .replace(/[\u0000-\u0008\u000B-\u000C\u000E-\u001F\u007F]/g, '')
            .trim();
          if (normalizedLine) {
            const outKey = `OUTBOUND:${mcUsername.toLowerCase()}:${normalizedLine}`;
            outboundWhispers.set(outKey, Date.now());
          }
        }

        try {
          await sendWhisperEmbed(message.channel, {
            senderLabel: message.author.username,
            body: clean
          });
          scheduleWhisperCleanup(message.channel.id);
        } catch (e) {
          console.error('[Whisper] Failed to mirror outbound message:', e.message);
        }

        // Always delete the original Discord message to keep channel clean
        try { 
          await message.delete(); 
        } catch (e) {
          console.error('[Whisper] Failed to delete original message:', e.message);
        }
        return;
      }
    }

    // Handle chat channel messages
    if (message.channel.id === DISCORD_CHAT_CHANNEL_ID) {
      if (!bot) return;
      const text = message.content.trim();
      if (text) {
        let username = message.author.username;
        // Escape @ symbols with zero-width space to prevent mentions
        username = username.replace(/@/g, '@\u200B');
        // Don't add username prefix for commands (starting with / or !)
        if (text.startsWith('/') || text.startsWith('!')) {
          bot.chat(text);
          console.log(`[Chat] Sent "${text}" by ${message.author.tag}`);
        } else {
          // Send without zero-width space so Minecraft chat is clean
          bot.chat(`[${username}] ${text}`);
          console.log(`[Chat] Sent "[${username}] ${text}" by ${message.author.tag}`);
        }
        
        // Delete original message and send confirmation
        try {
          await message.delete();
        } catch (e) {
          console.error('[Chat] Failed to delete message:', e.message);
        }
        
        // Send confirmation showing what was sent to game
        try {
          let sentText = text;
          if (!text.startsWith('/') && !text.startsWith('!')) {
            sentText = `[${username}] ${text}`;
          }
          await message.channel.send({
            embeds: [{
              description: `✅ **${message.author.username}** sent:\n\`${sentText}\``,
              color: 65280,
              timestamp: new Date(),
              footer: {
                text: 'Sent to game chat'
              }
            }]
          });
        } catch (e) {
          console.error('[Chat] Failed to send confirmation:', e.message);
        }
      }
      return;
    }

    if (message.channel.id !== DISCORD_CHANNEL_ID) return;

    if (message.content === '!wn') {
      if (!bot || !bot.entity) {
        await message.reply({
          embeds: [{
            description: 'Bot is offline.',
            color: 16711680,
            timestamp: new Date()
          }]
        });
        return;
      }
      const nearby = getNearbyPlayers();
      if (nearby.length === 0) {
        await message.reply({
          embeds: [{
            description: 'No one nearby.',
            color: 3447003,
            timestamp: new Date()
          }]
        });
      } else {
        await message.reply({
          embeds: [{
            title: `Nearby players (${nearby.length})`,
            description: nearby.map(p => `👤 **${p.username}** - ${p.distance} blocks`).join('\n'),
            color: 3447003,
            timestamp: new Date()
          }]
        });
      }
    }

    if (message.content === '!restart') {
      console.log(`[Command] restart by ${message.author.tag} via Discord`);
      lastCommandUser = message.author.tag;
      if (statusMessage) {
        statusMessage.edit({
          embeds: [{
            title: 'Server Status',
            description: `🔄 Restarting... Requested by ${lastCommandUser}`,
            color: 16776960,
            timestamp: new Date()
          }],
          components: createStatusButtons()
        }).catch(console.error);
      }
      bot.quit('Restart command');
    }

    if (message.content === '!pause') {
      console.log(`[Command] pause until resume by ${message.author.tag} via Discord`);
      lastCommandUser = message.author.tag;
      const botToQuit = bot;
      shouldReconnect = false;
      bot = null;
      await updateStatusMessage();
      if (botToQuit) botToQuit.quit('Pause until resume');
    }

    const pauseMatch = message.content.match(/^!pause\s+(\d+)$/);
    if (pauseMatch) {
      const minutes = parseInt(pauseMatch[1]);
      if (minutes > 0) {
        console.log(`[Command] pause ${minutes}m by ${message.author.tag} via Discord`);
        sendDiscordNotification(`Command: !pause ${minutes} by \`${message.author.tag}\` via Discord`, 16776960);
        shouldReconnect = false;
        bot.quit(`Paused ${minutes}m`);
        setTimeout(() => {
          console.log('[Bot] Custom pause ended.');
          shouldReconnect = true;
          createBot();
        }, minutes * 60 * 1000);
        await message.reply(`Bot paused for ${minutes} minutes.`);
      }
    }

    if (message.content === '!resume') {
      if (shouldReconnect) {
        await message.reply({
          embeds: [{
            description: 'Bot is already active or resuming.',
            color: 3447003,
            timestamp: new Date()
          }]
        });
        return;
      }
      console.log(`[Command] resume by ${message.author.tag} via Discord`);
      lastCommandUser = message.author.tag;
      shouldReconnect = true;
      await updateStatusMessage();
      createBot();
    }

    // Whitelist management via command
    const wlAddMatch = message.content.match(/^!whitelist\s+add\s+(\w+)$/i);
    if (wlAddMatch) {
      const targetUsername = wlAddMatch[1];
      try {
        let success = false;
        let source = 'database';
        if (pool) {
          try {
            await pool.query('INSERT INTO whitelist (username, added_by) VALUES ($1, $2) ON CONFLICT (username) DO NOTHING', [targetUsername, message.author.tag]);
            const newWhitelist = await loadWhitelistFromDB();
            ignoredUsernames.length = 0;
            ignoredUsernames.push(...newWhitelist);
            success = true;
          } catch (dbErr) {
            console.error('[Whitelist Add Cmd] DB error:', dbErr.message);
          }
        }
        if (!success && !pool) {
          source = 'file';
          const fileWhitelist = loadWhitelist();
          if (!fileWhitelist.some(n => n.toLowerCase() === targetUsername.toLowerCase())) {
            fs.appendFileSync('whitelist.txt', `${targetUsername}\n`);
          }
          const newWhitelist = loadWhitelist();
          ignoredUsernames.length = 0;
          ignoredUsernames.push(...newWhitelist);
          success = true;
        }

        await message.reply({
          embeds: [{
            title: 'Whitelist',
            description: success ? `✅ Added ${targetUsername} to whitelist (${source}).` : `No changes for ${targetUsername}.`,
            color: success ? 65280 : 16776960,
            timestamp: new Date()
          }]
        });
      } catch (err) {
        console.error('[Whitelist Add Cmd] Error:', err.message);
        await message.reply({
          embeds: [{
            description: `Failed to add ${targetUsername}: ${err.message}`,
            color: 16711680,
            timestamp: new Date()
          }]
        });
      }
    }

    const allowMatch = message.content.match(/^!allow\s+(\w+)$/);
    if (allowMatch) {
      const targetUsername = allowMatch[1];
      try {
        if (!pool) {
          console.log('[DB] ❌ Database operation attempted but pool not available');
          await message.reply('Database not configured.');
          return;
        }
        await pool.query('INSERT INTO whitelist (username, added_by) VALUES ($1, $2) ON CONFLICT (username) DO NOTHING', [targetUsername, message.author.tag]);
        // Reload whitelist
        const newWhitelist = await loadWhitelistFromDB();
        ignoredUsernames.length = 0;
        ignoredUsernames.push(...newWhitelist);
        console.log(`[Command] Added ${targetUsername} to whitelist by ${message.author.tag} via Discord`);
        sendDiscordNotification(`Command: !allow ${targetUsername} by \`${message.author.tag}\` via Discord`, 65280);
        await message.reply(`${targetUsername} added to whitelist.`);
      } catch (err) {
        console.error('[Command] Allow error:', err.message);
        sendDiscordNotification(`Failed to add ${targetUsername} to whitelist: \`${err.message}\``, 16711680);
        await message.reply(`Error adding ${targetUsername} to whitelist: ${err.message}`);
      }
    }

    const ignoreMatch = message.content.match(/^!ignore\s+(\w+)$/);
    if (ignoreMatch) {
      const targetUsername = ignoreMatch[1];
      if (!pool) {
        console.log('[DB] ❌ Database operation attempted but pool not available');
        await message.reply('Database not configured.');
        return;
      }
      try {
        await pool.query('INSERT INTO ignored_users (username, added_by) VALUES ($1, $2) ON CONFLICT (username) DO NOTHING', [targetUsername.toLowerCase(), message.author.tag]);
        // Reload ignored
        ignoredChatUsernames = await loadIgnoredChatUsernames();
        console.log(`[Command] Added ${targetUsername} to ignore list by ${message.author.tag}`);
        await message.reply(`✅ Added ${targetUsername} to ignore list.`);
      } catch (err) {
        console.error('[Command] Ignore error:', err.message);
        await message.reply(`Failed to add ${targetUsername} to ignore list: ${err.message}`);
      }
    }

    const unignoreMatch = message.content.match(/^!unignore\s+(\w+)$/);
    if (unignoreMatch) {
      const targetUsername = unignoreMatch[1];
      if (!pool) {
        console.log('[DB] ❌ Database operation attempted but pool not available');
        await message.reply('Database not configured.');
        return;
      }
      try {
        const result = await pool.query('DELETE FROM ignored_users WHERE username = $1', [targetUsername.toLowerCase()]);
        if (result.rowCount > 0) {
          // Reload ignored
          ignoredChatUsernames = await loadIgnoredChatUsernames();
          console.log(`[Command] Removed ${targetUsername} from ignore list by ${message.author.tag}`);
          await message.reply(`✅ Removed ${targetUsername} from ignore list.`);
        } else {
          await message.reply(`${targetUsername} is not in ignore list.`);
        }
      } catch (err) {
        console.error('[Command] Unignore error:', err.message);
        await message.reply(`Failed to remove ${targetUsername} from ignore list: ${err.message}`);
      }
    }

    if (message.content.startsWith('!say ')) {
      if (!bot) {
        await message.reply('Bot is offline.');
        return;
      }
      const text = message.content.slice(5).trim();
      if (text) {
        bot.chat(text);
        console.log(`[Command] Say "${text}" by ${message.author.tag} via Discord`);
        await message.reply({
          embeds: [{
            title: 'Message Sent to Minecraft',
            description: `Sent to Minecraft chat: "${text}"`,
            color: 65280,
            timestamp: new Date()
          }]
        });
      } else {
        await message.reply('Usage: !say <message>');
      }
    }

    // Debug command to get your Discord ID
    if (message.content === '!myid') {
      await message.reply(`Your Discord ID: ${message.author.id}\nMention test: <@${message.author.id}>`);
    }

    // Mention keywords management commands
    if (message.content.startsWith('!addkeyword ')) {
      const keyword = message.content.slice(12).trim().toLowerCase();
      if (!keyword) {
        await message.reply('Usage: !addkeyword <keyword>\nExample: !addkeyword ninja');
        return;
      }
      const result = await addMentionKeyword(message.author.id, keyword);
      if (result.success) {
        await message.reply({
          embeds: [{
            title: '✅ Keyword Added',
            description: `You will now be mentioned when someone says "${keyword}" in game chat.`,
            color: 65280,
            timestamp: new Date()
          }]
        });
      } else {
        await message.reply(`❌ Failed to add keyword: ${result.error}`);
      }
    }

    if (message.content.startsWith('!removekeyword ')) {
      const keyword = message.content.slice(15).trim().toLowerCase();
      if (!keyword) {
        await message.reply('Usage: !removekeyword <keyword>');
        return;
      }
      const result = await removeMentionKeyword(message.author.id, keyword);
      if (result.success) {
        if (result.removed) {
          await message.reply({
            embeds: [{
              title: '✅ Keyword Removed',
              description: `You will no longer be mentioned for "${keyword}".`,
              color: 65280,
              timestamp: new Date()
            }]
          });
        } else {
          await message.reply(`Keyword "${keyword}" was not in your list.`);
        }
      } else {
        await message.reply(`❌ Failed to remove keyword: ${result.error}`);
      }
    }

    if (message.content === '!keywords' || message.content === '!listkeywords') {
      const result = await getUserMentionKeywords(message.author.id);
      if (result.success) {
        if (result.keywords.length > 0) {
          await message.reply({
            embeds: [{
              title: '📋 Your Mention Keywords',
              description: `You will be mentioned when these words appear in game chat:\n\n${result.keywords.map(k => `• ${k}`).join('\n')}\n\nUse \`!addkeyword <word>\` to add more\nUse \`!removekeyword <word>\` to remove`,
              color: 3447003,
              timestamp: new Date()
            }]
          });
        } else {
          await message.reply({
            embeds: [{
              title: '📋 Your Mention Keywords',
              description: 'You have no keywords set.\n\nUse `!addkeyword <word>` to add keywords that will trigger a mention when said in game chat.\n\nExample: `!addkeyword ninja`',
              color: 16776960,
              timestamp: new Date()
            }]
          });
        }
      } else {
        await message.reply(`❌ Failed to get keywords: ${result.error}`);
      }
    }
  });
}

// Send Microsoft auth link to Discord and protect message from cleaner
async function sendAuthLinkToDiscord(url) {
  if (!DISCORD_CHANNEL_ID || !discordClient) return;
  try {
    if (!discordClient.isReady()) {
      pendingAuthLinks.push(url);
      return;
    }
    const channel = await discordClient.channels.fetch(DISCORD_CHANNEL_ID);
    if (channel && channel.isTextBased()) {
      const sentMessage = await channel.send({
        embeds: [{
          title: 'Microsoft Login',
          description: url,
          color: 16776960,
          timestamp: new Date()
        }]
      });
      excludedMessageIds.push(sentMessage.id);
      authMessageIds.add(sentMessage.id);
    }
  } catch (e) {
    console.error('Failed to send auth link to Discord:', e.message);
  }
}

// Delete or neutralize previously sent Microsoft Login messages after successful sign-in
async function cleanupAuthMessages() {
  if (!DISCORD_CHANNEL_ID || !discordClient || !discordClient.isReady()) return;
  if (authMessageIds.size === 0) return;
  try {
    const channel = await discordClient.channels.fetch(DISCORD_CHANNEL_ID);
    if (!channel || !channel.isTextBased()) return;
    for (const id of Array.from(authMessageIds)) {
      try {
        const msg = await channel.messages.fetch(id);
        // Remove buttons first to prevent further clicks
        try { await msg.edit({ components: [] }); } catch {}
        // Then delete the message
        await msg.delete();
      } catch {}
      authMessageIds.delete(id);
      const idx = excludedMessageIds.indexOf(id);
      if (idx !== -1) excludedMessageIds.splice(idx, 1);
    }
  } catch (e) {
    console.error('[Discord] cleanupAuthMessages failed:', e.message);
  }
}

// Hook stdout/stderr to capture Microsoft login links (otc code)
(function hookStdStreamsForAuthLinks() {
  const AUTH_LINK_REGEX = /https?:\/\/(?:www\.)?microsoft\.com\/link\?otc=([A-Z0-9]{8})/i;
  const AUTH_CODE_REGEX = /use\s+the\s+code\s+([A-Z0-9]{8})/i;
  const MSA_SIGNED_REGEX = /\[msa\]\s+Signed in with Microsoft/i;
  const BASE_URL = 'http://microsoft.com/link?otc=';

  function intercept(chunk) {
    try {
      const str = Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk);
      let m = str.match(AUTH_LINK_REGEX);
      if (m) {
        const code = m[1].toUpperCase();
        if (!sentAuthCodes.has(code)) {
          sentAuthCodes.add(code);
          sendAuthLinkToDiscord(BASE_URL + code);
        }
        return;
      }
      m = str.match(AUTH_CODE_REGEX);
      if (m) {
        const code = m[1].toUpperCase();
        if (!sentAuthCodes.has(code)) {
          sentAuthCodes.add(code);
          sendAuthLinkToDiscord(BASE_URL + code);
        }
        return;
      }
      // When Coolify logs indicate Microsoft sign-in success, cleanup auth messages
      if (MSA_SIGNED_REGEX.test(str)) {
        cleanupAuthMessages();
      }
    } catch {}
  }

  const origStdoutWrite = process.stdout.write.bind(process.stdout);
  process.stdout.write = function(chunk, encoding, cb) {
    intercept(chunk);
    return origStdoutWrite(chunk, encoding, cb);
  };

  const origStderrWrite = process.stderr.write.bind(process.stderr);
  process.stderr.write = function(chunk, encoding, cb) {
    intercept(chunk);
    return origStderrWrite(chunk, encoding, cb);
  };
})();