require('dotenv').config({ quiet: true });
const { loadBotConfig } = require('./config');
let appConfig;
try {
  appConfig = loadBotConfig(process.env);
} catch (err) {
  console.error(`[Config] ${err.message}`);
  process.exit(1);
}
const fs = require('fs');
const path = require('path');
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, ChannelType, PermissionsBitField, MessageFlags, InteractionContextType, SlashCommandBuilder, ActivityType } = require('discord.js');
const { pathfinder } = require('mineflayer-pathfinder');
const { createDiscordClient, saveStatusMessageId, loadStatusMessageId } = require('./discord');
const { createMinecraftBot } = require('./minecraft');
const {
  createDatabasePool,
  logDatabaseStatus,
  createMentionKeywordRepository,
  createPlayerActivityRepository,
  createWhitelistRepository,
  createAdminSettingsRepository,
  createSystemLogRepository
} = require('./database');
const { createPlaytimeFeature } = require('./features/playtime');
const { createWhisperFeature } = require('./features/whisper');
const { createFollowFeature } = require('./features/follow');
const farm = require('./features/obsidianFarm');
const { GrowingChildAI } = require('./features/growingChild');
const { sanitizePublicPhrase } = require('./features/growingChild/safety');

// Base64 utils for Node.js (btoa/atob polyfill)
const b64encode = (str) => Buffer.from(String(str), 'utf8').toString('base64');
const b64decode = (str) => Buffer.from(String(str), 'base64').toString('utf8');

const DATABASE_URL = appConfig.database.url;
const DISCORD_BOT_TOKEN = appConfig.discord.token;
const DISCORD_CHANNEL_ID = appConfig.discord.channelId;
const DISCORD_CHAT_CHANNEL_ID = appConfig.discord.chatChannelId;
const DISCORD_DM_CATEGORY_ID = appConfig.discord.dmCategoryId;
const DISCORD_OWNER_ID = appConfig.discord.ownerId;
const IGNORED_CHAT_USERNAMES = appConfig.runtime.ignoredChatUsernames;
const GEMINI_API_KEY = appConfig.gemini.apiKey;
const GEMINI_MODELS = appConfig.gemini.models;
const GEMINI_MODEL = GEMINI_MODELS[0] || 'gemini-2.5-flash-lite';
const WM_COMMAND_COOLDOWN_MS = appConfig.runtime.commandCooldownMs;
const WM_MAX_QUESTION_LENGTH = appConfig.limits.questionLength;
const WM_MAX_RESPONSE_LENGTH = appConfig.limits.responseLength;
const WM_MAX_OUTPUT_TOKENS = appConfig.limits.outputTokens;
const WM_CHAT_CHUNK_LENGTH = appConfig.limits.chatChunkLength;
const MINECRAFT_PRIVATE_MESSAGE_LENGTH = appConfig.minecraft.privateMessageLength;
const RECONNECT_INTERVAL_MS = appConfig.minecraft.reconnectTimeoutMs;
const MINECRAFT_CONNECT_TIMEOUT_MS = appConfig.minecraft.connectTimeoutMs;
const MINECRAFT_PROFILES_FOLDER = appConfig.minecraft.profilesFolder;
const BOT_PUBLIC_CHAT_STATUS_FILE = path.resolve('data', 'bot_public_chat_status.json');
const BOT_CHAT_STATUS_EMOJIS_FILE = path.resolve('data', 'bot_chat_status_emojis.json');
const PLAYER_HEAD_EMOJIS_FILE = path.resolve('data', 'player_head_emojis.json');
const OBSIDIAN_STATS_MESSAGES_FILE = path.resolve('data', 'obsidian_stats_messages.json');
const OBSIDIAN_FARM_DEBUG_LOG_FILE = path.resolve('obsidian_farm_debug.log');
const OBSIDIAN_STATS_UPDATE_INTERVAL_MS = appConfig.farm.statsUpdateIntervalMs;
const OBSIDIAN_STATS_WATCHDOG_INTERVAL_MS = appConfig.farm.statsWatchdogIntervalMs;
const DISCORD_ATTACHMENT_SAFE_LIMIT_BYTES = appConfig.discord.attachmentLimitBytes;
const LEGACY_OBSIDIAN_TARGET = Object.freeze({
  ...appConfig.farm.target,
  radius: appConfig.farm.radius
});

console.log(
  `[Gemini] ${GEMINI_API_KEY ? 'Configured' : 'Disabled: GEMINI_API_KEY is missing'}; ` +
  `models=${GEMINI_MODELS.join(', ')}; fetch=${typeof fetch}`
);
const STATUS_EMOJIS = {
  axolotlBucket: '<:Axolotl_Bucket:1519794666860449812>',
  connected: '<:Confirm:1519301205346619392>',
  serverPing: '<:Server_Ping_5:1519367779155968080>',
  serverPinging: '<:Server_Pinging_3:1521526226055987300>',
  serverUnreachable: '<:Server_Unreachable:1519385218824278066>',
  update: '<:Update:1519384987139575990>',
  map: '<:Map:1519384986330071050>',
  players: '<:Player_Head:1519301212367884348>',
  nearby: '<:Compass_03:1519302276651548692>',
  tps: '<:Repeater:1519301215282794526>',
  food: '<:Food_Full:1519301206457978920>',
  health: '<:Heart_Full:1519301207493968082>',
  whitelist: '<:Writable_Book:1519301216675430541>',
  obsidian: '<:Obsidian:1519367777691898079>',
  pause: '<:Map_X:1519305980263796767>',
  resume: '<:Confirm:1519301205346619392>',
  seen: '<:Spyglass:1519309308855189626>',
  playtime: '<:Clock:1519301203966824491>',
  mentions: '<:Bell:1519301202754535424>',
  drop: '<:pink_bundle:1519309307596767373>',
  chatSettings: '<:Crafting_Table:1519309305558601900>'
};
const STATUS_BUTTON_EMOJIS = {
  pause: { name: 'Map_X', id: '1519305980263796767' },
  resume: { name: 'Confirm', id: '1519301205346619392' },
  players: { name: 'Player_Head', id: '1519301212367884348' },
  seen: { name: 'Spyglass', id: '1519309308855189626' },
  playtime: { name: 'Clock', id: '1519301203966824491' },
  mentions: { name: 'Bell', id: '1519301202754535424' },
  drop: { name: 'pink_bundle', id: '1519309307596767373' },
  whitelist: { name: 'Writable_Book', id: '1519301216675430541' },
  chatSettings: { name: 'Crafting_Table', id: '1519309305558601900' },
  obsidian: { name: 'Obsidian', id: '1519367777691898079' }
};
const UI_BUTTON_EMOJIS = {
  arrowRightCurved: { name: 'Arrow_Right_Curved', id: '1519567352432300154' },
  arrowLeftCurved: { name: 'Arrow_Left_Curved', id: '1519567351442440343' },
  jellieCatBaby: { name: 'Jellie_Cat_Baby', id: '1519567349035040939' },
  commandBlock: { name: 'Command_Block', id: '1519567348259094560' },
  redstone: { name: 'Redstone', id: '1519569071442493561' },
  blindness: { name: 'Blindness', id: '1519569073862738000' },
  shears: { name: 'Shears', id: '1519760020659634309' },
  cat: { name: 'Cat', id: '1519760017614573809' },
  beacon: { name: 'Beacon', id: '1519760012715491460' },
  enchantingTable: { name: 'Enchanting_Table', id: '1519760011495084192' },
  witherSkeletonSkull: { name: 'Wither_Skeleton_Skull', id: '1519760008382910606' },
  haste: { name: 'Haste', id: '1519760002267742380' },
  slowFalling: { name: 'Slow_Falling', id: '1519760003316060160' },
  bookBlack: { name: 'Book_Black', id: '1519760004943577239' },
  bookOrange: { name: 'Book_Orange', id: '1519760006029902044' },
  bookYellow: { name: 'Book_Yellow', id: '1519760007107969114' }
};
const NETHER_STAR_EMOJI = '<:Nether_Star:1519569072809836584>';
const ADMIN_PANEL_BOT_NAME = appConfig.minecraft.username;
const BOT_CHAT_STATUS_EMOJI_FALLBACK = [
  '<:End_Crystal:1519954272282873877>',
  '<:Bee_Angry:1519954270865326132>',
  '<:Allay:1519954269665624064>',
  '<:Calico_Cat_Baby:1519954268172456057>',
  '<:Parrot_Gray:1519954266620559481>',
  '<:Turtle:1519954265706070147>',
  '<:Axolotl_Bucket:1519794666860449812>',
  '<:Red_Mushroom:1519760022471577742>',
  '<:Red_Tulip:1519760019430572202>',
  '<:Rabbit_Salt_Pepper:1519760016175923251>',
  '<:Creeper_Head:1519760015097987102>',
  '<:Cat:1519760017614573809>',
  '<:Carved_Pumpkin:1519760013902614752>',
  '<:Wither_Skeleton_Skull:1519760008382910606>',
  '<:Jellie_Cat_Baby:1519567349035040939>',
  '<:Elytra:1519963167302746162>'
];
const BOT_CHAT_STATUS_EMOJIS = loadBotChatStatusEmojis();
const FARM_EMOJIS = {
  waterBucket: '<:Water_Bucket:1519367780804071608>',
  obsidian: '<:Obsidian:1519367777691898079>',
  lavaBucket: '<:Lava_Bucket:1519367776488259715>',
  diamondPickaxe: '<:Diamond_Pickaxe:1519367775024447498>',
  netheritePickaxe: '<:Netherite_Pickaxe:1519301211000541224>',
  cauldron: '<:Cauldron:1519367773539668038>',
  bucket: '<:Bucket:1519367771777929326>',
  barrel: '<:Barrel:1519371578666913963>',
  chest: '<:Chest:1519371577131798649>',
  lever: '<:Lever:1519371575604940830>',
  shulkerClosed: '<:Shulker_Closed:1519371574296318162>'
};
const FOOD_EMOJIS = {
  golden_carrot: '<:Golden_Carrot:1519367418953207829>',
  golden_apple: '<:Golden_Apple:1519367417980260412>',
  cooked_porkchop: '<:Cooked_Porkchop:1519367415283322950>',
  cooked_beef: '<:Cooked_Beef:1519367413903261777>',
  steak: '<:Cooked_Beef:1519367413903261777>',
  carrot: '<:Carrot:1519367413026783263>',
  bread: '<:Bread:1519367410904469664>',
  baked_potato: '<:Baked_Potato:1519367409658495146>',
  apple: '<:Apple:1519367408073314365>'
};
const ITEM_EMOJIS = {
  ...FOOD_EMOJIS,
  red_mushroom: '<:Red_Mushroom:1519760022471577742>',
  shears: '<:Shears:1519760020659634309>',
  red_tulip: '<:Red_Tulip:1519760019430572202>',
  cat_spawn_egg: '<:Cat:1519760017614573809>',
  rabbit: '<:Rabbit_Salt_Pepper:1519760016175923251>',
  cooked_rabbit: '<:Rabbit_Salt_Pepper:1519760016175923251>',
  rabbit_stew: '<:Rabbit_Salt_Pepper:1519760016175923251>',
  creeper_head: '<:Creeper_Head:1519760015097987102>',
  carved_pumpkin: '<:Carved_Pumpkin:1519760013902614752>',
  pumpkin: '<:Carved_Pumpkin:1519760013902614752>',
  beacon: '<:Beacon:1519760012715491460>',
  enchanting_table: '<:Enchanting_Table:1519760011495084192>',
  wither_skeleton_skull: '<:Wither_Skeleton_Skull:1519760008382910606>',
  book: '<:Book_Yellow:1519760007107969114>',
  writable_book: '<:Book_Orange:1519760006029902044>',
  written_book: '<:Book_Orange:1519760006029902044>',
  enchanted_book: '<:Book_Black:1519760004943577239>',
  knowledge_book: '<:Book_Black:1519760004943577239>',
  water_bucket: FARM_EMOJIS.waterBucket,
  lava_bucket: FARM_EMOJIS.lavaBucket,
  bucket: FARM_EMOJIS.bucket,
  obsidian: FARM_EMOJIS.obsidian,
  diamond_pickaxe: FARM_EMOJIS.diamondPickaxe,
  netherite_pickaxe: FARM_EMOJIS.netheritePickaxe,
  cauldron: FARM_EMOJIS.cauldron,
  barrel: FARM_EMOJIS.barrel,
  chest: FARM_EMOJIS.chest,
  trapped_chest: FARM_EMOJIS.chest,
  lever: FARM_EMOJIS.lever,
  shulker_box: FARM_EMOJIS.shulkerClosed,
  totem_of_undying: '<:Totem_Of_Undying:1519380252583923932>',
  firework_rocket: '<:Firework_Rocket:1519380253649408046>'
};
const PLAYER_HEAD_EMOJIS = new Map([
  ['wheatmagnate', '<:WheatMagnate:1519314847073046568>'],
  ['wheatemperor', '<:wheatemperor:1519314845151789197>'],
  ['vendell', '<:Vendell:1519314843545501726>'],
  ['twistedinsane', '<:TWISTEDINSANE:1519314842467696820><:ender_dragon_spawn_egg:1522245100351127723>'],
  ['tckrtxa', '<:tckrtxa:1519314840982782092>'],
  ['robo_hbr', '<:Robo_HBr:1519314839586078790>'],
  ['recreational_pot', '<:Recreational_Pot:1519314837996568697>'],
  ['piff_chiefington', '<:Piff_chiefington:1519314837107245156>'],
  ['ninjaoversurge', '<:NinjaOverSurge:1519314835781849168>'],
  ['namy_mcnameface', '<:Namy_McNameface:1519314834414633030>'],
  ['mrautofish', '<:MrAutoFish:1519314833152147596>'],
  ['me_is_gt', '<:ME_IS_GT:1519314831943929907>'],
  ['lontony', '<:Lontony:1519314830899679303>'],
  ['llednev', '<:lledneV:1519314829586862152>'],
  ['karatecheese', '<:KarateCheese:1519314825170124830>'],
  ['john200410', '<:John200410:1520294986137075833>'],
  ['kittr', '<:kittr:1519314827019944046>'],
  ['liketinos2341', '<:liketinos2341:1519314828001542356>'],
  ['itzrubyy', '<:ItzRubyy:1519314823790461000>'],
  ['hugoash', '<:HugoAsh:1519314822569656451>'],
  ['h4ywire', '<:H4YWiRE:1519571949947195565>'],
  ['gibsinnep', '<:GIBSINNEP:1519314821370216551>'],
  ['funkygamer26', '<:FunkyGamer26:1519314820401205410>'],
  ['deireide', '<:Deireide:1519314819034120292>'],
  ['chief_piffington', '<:chief_piffington:1519314816236261516>'],
  ['christianfemboy', '<:ChristianFemboy:1519314817771638834>'],
  ['catsfish', '<:CatsFish:1519314815011782666>'],
  ['c03packetplayer', '<:C03PacketPlayer:1520293801342537888>'],
  ['bulbax', '<:bulbax:1519314813686255726>'],
  ['bulbalt', '<:bulbalt:1519314812192952451>'],
  ['bublax', '<:bublax:1519314811513733160>'],
  ['blubax', '<:blubax:1519314810481676338>'],
  ['blabux', '<:blabux:1519314809479368876>'],
  ['beetroot_bot', '<:Beetroot_Bot:1519314808455958628>'],
  ['bdiev_', '<:bdiev_:1519314806992142457>'],
  ['balbux', '<:balbux:1519314805729525843>'],
  ['9pus', '<:9pus:1519314804224036874>'],
  ['7pus', '<:7pus:1519314802772545688>'],
  ['1amfero1', '<:1Amfero1:1519314801287762101>'],
  ['0x003a47d4', '<:0x003A47D4:1519314799647916162>']
]);
const pendingPlayerHeadEmojiImports = new Set();
const failedPlayerHeadEmojiImports = new Set();

loadPlayerHeadEmojiCache();

function getPlayerHeadEmoji(username) {
  const key = normalizePlayerHeadUsername(username);
  const emoji = PLAYER_HEAD_EMOJIS.get(key);
  if (emoji) return emoji;

  queuePlayerHeadEmojiImport(username);
  return STATUS_EMOJIS.players;
}

function normalizePlayerHeadUsername(username) {
  return String(username || '').trim().toLowerCase();
}

function getDiscordEmojiNameForPlayer(username) {
  const cleaned = String(username || 'player')
    .trim()
    .replace(/[^A-Za-z0-9_]/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 32);
  if (cleaned.length >= 2) return cleaned;
  return `p_${cleaned || 'head'}`.slice(0, 32);
}

function loadPlayerHeadEmojiCache() {
  try {
    if (!fs.existsSync(PLAYER_HEAD_EMOJIS_FILE)) return;
    const parsed = JSON.parse(fs.readFileSync(PLAYER_HEAD_EMOJIS_FILE, 'utf8'));
    const entries = Array.isArray(parsed) ? parsed : Object.entries(parsed || {});
    for (const [username, emoji] of entries) {
      const key = normalizePlayerHeadUsername(username);
      const value = String(emoji || '').trim();
      if (key && /^<a?:[A-Za-z0-9_]+:\d+>$/.test(value)) {
        PLAYER_HEAD_EMOJIS.set(key, value);
      }
    }
  } catch (err) {
    console.error('[PlayerHeads] Failed to load emoji cache:', err.message);
  }
}

function savePlayerHeadEmojiCache() {
  try {
    fs.mkdirSync(path.dirname(PLAYER_HEAD_EMOJIS_FILE), { recursive: true });
    const sorted = [...PLAYER_HEAD_EMOJIS.entries()]
      .sort(([a], [b]) => a.localeCompare(b));
    fs.writeFileSync(PLAYER_HEAD_EMOJIS_FILE, JSON.stringify(Object.fromEntries(sorted), null, 2));
  } catch (err) {
    console.error('[PlayerHeads] Failed to save emoji cache:', err.message);
  }
}

function queuePlayerHeadEmojiImport(username) {
  const safeUsername = String(username || '').trim();
  if (!/^[A-Za-z0-9_]{1,16}$/.test(safeUsername)) return;

  const key = normalizePlayerHeadUsername(safeUsername);
  if (
    !key ||
    pendingPlayerHeadEmojiImports.has(key) ||
    failedPlayerHeadEmojiImports.has(key) ||
    PLAYER_HEAD_EMOJIS.has(key)
  ) return;

  pendingPlayerHeadEmojiImports.add(key);
  importPlayerHeadEmoji(safeUsername)
    .catch(err => {
      failedPlayerHeadEmojiImports.add(key);
      console.warn(`[PlayerHeads] Skipping ${safeUsername} after failed import:`, err.message);
    })
    .finally(() => pendingPlayerHeadEmojiImports.delete(key));
}

async function getPlayerHeadEmojiGuild() {
  if (!DISCORD_CHANNEL_ID || !discordClient?.isReady?.()) return null;
  const channel = await discordClient.channels.fetch(DISCORD_CHANNEL_ID).catch(() => null);
  return channel?.guild || null;
}

async function fetchPlayerHeadImageBuffer(imageUrl, source) {
  const response = await fetch(imageUrl, {
    headers: {
      'User-Agent': 'WheatMagnateBot/1.0 (+https://namemc.com/)'
    }
  });
  if (!response.ok) {
    return { error: new Error(`${source} returned HTTP ${response.status}`), status: response.status };
  }

  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('image/')) {
    throw new Error(`${source} returned ${contentType || 'non-image content'}`);
  }

  const imageBuffer = Buffer.from(await response.arrayBuffer());
  if (imageBuffer.length === 0) throw new Error(`${source} returned an empty image`);
  if (imageBuffer.length > 256 * 1024) throw new Error(`${source} image is too large for an emoji`);

  return { imageBuffer };
}

async function resolveMinecraftProfile(username) {
  const response = await fetch(`https://api.mojang.com/users/profiles/minecraft/${encodeURIComponent(username)}`);
  if (response.status === 204 || response.status === 404) return null;
  if (!response.ok) throw new Error(`Mojang API returned HTTP ${response.status}`);

  const profile = await response.json();
  const id = String(profile?.id || '').trim();
  const name = String(profile?.name || username).trim();
  if (!/^[0-9a-f]{32}$/i.test(id)) return null;

  return { id, name };
}

async function fetchPlayerHeadImage(username) {
  const namemcUrl = `https://render.namemc.com/skin/2d/face.png?skin=${encodeURIComponent(username)}&scale=8`;
  const namemcResult = await fetchPlayerHeadImageBuffer(namemcUrl, 'NameMC');
  if (namemcResult.imageBuffer || namemcResult.status !== 404) return namemcResult;

  const profile = await resolveMinecraftProfile(username);
  if (!profile) return namemcResult;

  const fallbackUrls = [
    `https://mc-heads.net/avatar/${profile.id}/64`,
    `https://minotar.net/avatar/${profile.id}/64`
  ];
  let lastError = namemcResult.error;

  for (const fallbackUrl of fallbackUrls) {
    const source = new URL(fallbackUrl).hostname;
    const result = await fetchPlayerHeadImageBuffer(fallbackUrl, source);
    if (result.imageBuffer) return result;
    lastError = result.error;
  }

  return { error: lastError };
}

async function importPlayerHeadEmoji(username) {
  const guild = await getPlayerHeadEmojiGuild();
  if (!guild) return null;

  const emojiName = getDiscordEmojiNameForPlayer(username);
  await guild.emojis.fetch().catch(() => null);

  const existing = guild.emojis.cache.find(emoji =>
    emoji.name?.toLowerCase() === emojiName.toLowerCase()
  );
  if (existing) {
    const emojiText = `<:${existing.name}:${existing.id}>`;
    PLAYER_HEAD_EMOJIS.set(normalizePlayerHeadUsername(username), emojiText);
    savePlayerHeadEmojiCache();
    return emojiText;
  }

  const { imageBuffer, error } = await fetchPlayerHeadImage(username);
  if (!imageBuffer) throw error || new Error('No player head image was returned');

  const created = await guild.emojis.create({
    attachment: imageBuffer,
    name: emojiName,
    reason: `Imported Minecraft head for ${username}`
  });

  const emojiText = `<:${created.name}:${created.id}>`;
  PLAYER_HEAD_EMOJIS.set(normalizePlayerHeadUsername(username), emojiText);
  savePlayerHeadEmojiCache();
  console.log(`[PlayerHeads] Imported ${username} as ${emojiText}`);
  return emojiText;
}

function formatPlayerHeadName(username, style = 'code') {
  const safeUsername = String(username || 'Unknown');
  const label = style === 'bold'
    ? `**${safeUsername}**`
    : `\`${safeUsername}\``;
  return `${getPlayerHeadEmoji(safeUsername)}\u00A0${label}`;
}

function createDeleteDMRow() {
  return new ActionRowBuilder().addComponents(
    createDeleteDMButton()
  );
}

function createDeleteDMButton() {
  return new ButtonBuilder()
    .setCustomId('delete_dm_message')
    .setLabel('Delete')
    .setEmoji(FARM_EMOJIS.lavaBucket)
    .setStyle(ButtonStyle.Danger);
}

function createGrowingChildControls() {
  const enabled = growingChild?.getStatus().enabled ?? false;
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('growing_child_toggle')
      .setLabel(enabled ? 'Disable' : 'Enable')
      .setEmoji(UI_BUTTON_EMOJIS.redstone)
      .setStyle(enabled ? ButtonStyle.Danger : ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId('growing_child_say')
      .setLabel('Say something')
      .setEmoji(UI_BUTTON_EMOJIS.cat)
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('growing_child_status')
      .setLabel('Status')
      .setEmoji(UI_BUTTON_EMOJIS.bookYellow)
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('growing_child_reset')
      .setLabel('Reset to level 0')
      .setEmoji(UI_BUTTON_EMOJIS.witherSkeletonSkull)
      .setStyle(ButtonStyle.Danger),
    createDeleteDMButton()
  );
}

function createGrowingChildResetConfirmation() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('growing_child_reset_confirm')
      .setLabel('Delete all learning')
      .setEmoji(FARM_EMOJIS.lavaBucket)
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId('growing_child_reset_cancel')
      .setLabel('Cancel')
      .setStyle(ButtonStyle.Secondary)
  );
}

async function ensureDMDeleteButton(message) {
  if (
    !message ||
    message.author?.id !== discordClient.user?.id ||
    !message.channel?.isDMBased?.()
  ) {
    return;
  }
  if (growingChildPlainMessageIds.has(message.id)) return;

  const hasDeleteButton = message.components?.some(row =>
    row.components?.some(component => component.customId === 'delete_dm_message')
  );
  if (hasDeleteButton || (message.components?.length || 0) >= 5) return;

  await message.edit({
    components: [
      ...(message.components || []).map(row => row.toJSON()),
      createDeleteDMRow()
    ]
  });
}

// Database connection
let pool = createDatabasePool(DATABASE_URL);
logDatabaseStatus(pool);
const {
  getMentionKeywords,
  addMentionKeyword,
  removeMentionKeyword,
  getUserMentionKeywords
} = createMentionKeywordRepository(pool);
const {
  loadIgnoredChatUsernames,
  updatePlayerActivity,
  getWhitelistActivity,
  searchNonWhitelistActivity
} = createPlayerActivityRepository({
  pool,
  ignoredFallback: IGNORED_CHAT_USERNAMES,
  getBot: () => bot
});
const {
  loadAdminSettings,
  saveAdminSetting,
  saveAdminSettings
} = createAdminSettingsRepository(pool);
const {
  ensureSystemLogTable,
  recordSystemLog
} = createSystemLogRepository(pool);
const originalConsoleLog = console.log.bind(console);
const originalConsoleError = console.error.bind(console);
let persistBotConsoleLogs = false;

function stringifyConsoleArg(value) {
  if (value instanceof Error) return appConfig.redact(value.stack || value.message);
  if (typeof value === 'string') return appConfig.redact(value);
  try {
    return appConfig.redact(JSON.stringify(value));
  } catch {
    return appConfig.redact(String(value));
  }
}

function captureBotConsoleLog(level, args) {
  if (!persistBotConsoleLogs) return;
  const message = args.map(stringifyConsoleArg).join(' ').trim();
  if (!message || message.startsWith('[SystemLog]')) return;
  recordSystemLog({
    level,
    category: 'bot_console',
    message
  }).catch(() => {});
}

console.log = (...args) => {
  const safeArgs = args.map(stringifyConsoleArg);
  originalConsoleLog(...safeArgs);
  captureBotConsoleLog('info', safeArgs);
};

console.error = (...args) => {
  const safeArgs = args.map(stringifyConsoleArg);
  originalConsoleError(...safeArgs);
  captureBotConsoleLog('error', safeArgs);
};

// Discord bot client
const discordClient = createDiscordClient();

const loadedSession = appConfig.minecraft.session;
if (loadedSession) console.log('[Bot] Loaded session from configuration.');

let lastCommandUser = null;
let statusMessage = null;
let adminPanelMessage = null;
let adminPanelView = 'main';
let statusUpdateInterval = null;
let adminPanelUpdateInterval = null;
let siteGameChatOutboxInterval = null;
let isUpdatingStatus = false; // Prevent concurrent updates
let lastPresenceText = null;
let lastPresenceUpdateAt = 0;
const obsidianStatsUpdaters = new Map(); // channelId -> { messageId, timer, supplies, updating }
let latestObsidianStatsSupplies = null;
let obsidianStatsWatchdogInterval = null;
let channelCleanerInterval = null;
let tpsHistory = [];
let realTps = null;
let lastTickTime = 0;
let lastTpsSampleAt = 0;
const nearbyPlayerSightingWriteAt = new Map();
let mineflayerStarted = false;
let startTime = Date.now();
let obsidianStats = {
  sessionMined: 0,
  totalMined: 0,
  retiredPickaxes: 0,
  retiredPickaxeBlocks: 0,
  desiredEnabled: false,
  sessionStartedAt: null
};
let growingChild = null;
const followFeature = createFollowFeature();
let obsidianStatsWriteQueue = Promise.resolve();
let whisperConversations = new Map(); // username -> messageId
let whisperChannels = new Map(); // key: `${ownerId}:${mcUsername}` -> channelId
let pendingWhisperClaims = new Map(); // key: mcUsernameLower -> { messageId, lastMessage }
let whisperCleanupTimers = new Map(); // channelId -> timeout handle
let lastDialogMessages = new Map(); // channelId -> messageId of last message with delete button
let whisperFooterUpdateIntervals = new Map(); // channelId -> interval handle for footer updates
let whisperDeleteTimestamps = new Map(); // channelId -> timestamp when channel will be deleted
let customDialogTTL = new Map(); // channelId -> custom TTL in ms (user-configured)
const temporaryInteractionMessages = new Map(); // messageId -> { interval, timeout, deadline }
const seenActivityUpdateIntervals = new Map();
const growingChildPlainMessageIds = new Set();
let recentWhispers = new Map(); // key: `WHISPER:username:message` -> timestamp, to mark whispers and suppress chat forwarding
let pendingChatTimers = new Map(); // normalized message key -> Set<timeout handle>
let outboundWhispers = new Map(); // key: `OUTBOUND:targetUsername:message` -> timestamp, to suppress public echo of our own whispers
let siteWhisperTargets = new Map(); // lowercase username -> { timestamp, siteUsername }, suppress Discord whisper fallback for site dialogs
class DeferredBotCommandError extends Error {
  constructor(message, payloadPatch = {}) {
    super(message);
    this.name = 'DeferredBotCommandError';
    this.payloadPatch = payloadPatch;
  }
}
let recentlyForwardedGameChat = new Map(); // normalized message key -> { source, timestamp }
let recentCommandBotResponses = []; // raw command-bot replies used to reject truncated chat-event copies
const COMMAND_RESPONSE_DISPLAY_USERNAME = appConfig.minecraft.commandBotUsername;
const COMMAND_RESPONSE_BOT_USERNAMES = new Set([COMMAND_RESPONSE_DISPLAY_USERNAME.toLowerCase()]);
let rawChatTraceUntil = 0;
let tpsTabInterval = null;
let playtimeSyncInterval = null;
let playerActivitySyncInterval = null;
let playerActivitySyncRunning = false;
let lastObservedOnlinePlayerKeys = null;
let playerActivityJoinEventsReady = false;
const pendingPlaytimeLookups = new Map(); // lookup key -> { targetUsername, timestamp }
const pendingJoinDateLookups = new Map(); // lookup key -> { targetUsername, timestamp }
let botStatusSnapshotInterval = null;
let wheatMagnatePlaytimeDisplay = 'N/A';
let wheatMagnatePlaytimeCacheAt = 0;
const DANGER_RADIUS_OPTIONS = [100, 200, 300, 500, 1000];
const MESSAGE_COOLDOWN_OPTIONS = [0, 5000, 10_000, 20_000, 60_000];
const runtimeSettings = {
  dangerRadius: appConfig.runtime.dangerRadius,
  whitelistMode: appConfig.runtime.whitelistMode,
  autoEat: appConfig.runtime.autoEat,
  geminiEnabled: appConfig.gemini.enabled,
  childPublicSpeech: appConfig.runtime.childPublicSpeech,
  messageCooldownMs: appConfig.runtime.commandCooldownMs
};

function normalizeRuntimeSettings(settings = runtimeSettings) {
  const dangerRadius = Number(settings.dangerRadius);
  settings.dangerRadius = DANGER_RADIUS_OPTIONS.includes(dangerRadius)
    ? dangerRadius
    : appConfig.runtime.dangerRadius;

  const messageCooldownMs = Number(settings.messageCooldownMs);
  settings.messageCooldownMs = MESSAGE_COOLDOWN_OPTIONS.includes(messageCooldownMs)
    ? messageCooldownMs
    : appConfig.runtime.commandCooldownMs;

  settings.whitelistMode = Boolean(settings.whitelistMode);
  settings.autoEat = Boolean(settings.autoEat);
  settings.geminiEnabled = Boolean(settings.geminiEnabled);
  settings.childPublicSpeech = Boolean(settings.childPublicSpeech);
  return settings;
}

async function loadRuntimeSettingsFromDB() {
  const loaded = await loadAdminSettings(runtimeSettings);
  Object.assign(runtimeSettings, normalizeRuntimeSettings(loaded));
}

async function persistRuntimeSetting(key) {
  if (!Object.prototype.hasOwnProperty.call(runtimeSettings, key)) return false;
  return saveAdminSetting(key, runtimeSettings[key]);
}
const geminiModelBackoffUntil = new Map(); // model -> unix ms
let lastBotPublicChatPhrase = null;
let lastBotPublicChatEmoji = null;
let botChatStatusEmojiQueue = [];
loadLastBotPublicChatStatus();
const excludedMessageIds = [];
const pendingAuthLinks = [];
const pendingOwnerDMs = [];
const growingChildFeedDmUsers = new Set();
const sentAuthCodes = new Set();
const authMessageIds = new Map(); // messageId -> DM channelId
const wmCommandCooldowns = new Map(); // lowercase username -> last request timestamp
const wmRequestsInFlight = new Set(); // lowercase username
const recentOutboundChat = new Map(); // normalized message -> timestamps awaiting self-echo suppression
const WHISPER_TTL_MS = appConfig.limits.whisperTtlMs;
const WHISPER_MARK_TTL_MS = appConfig.limits.whisperMarkTtlMs;
const PENDING_CHAT_DELAY_MS = appConfig.limits.pendingChatDelayMs;
const OUTBOUND_WHISPER_TTL_MS = appConfig.limits.outboundWhisperTtlMs;
const SITE_WHISPER_TTL_MS = appConfig.limits.siteWhisperTtlMs;
const DEFAULT_SITE_WHISPER_USERNAME = appConfig.runtime.defaultSiteWhisperUsername;
const WHISPER_CHANNELS_FILE = 'whisper_channels.json';

// Debug logging (disabled by default). Enable by setting DEBUG_LOGS=true
const DEBUG_LOGS = appConfig.runtime.debugLogs;
function debugLog(...args) {
  if (DEBUG_LOGS) console.log(...args);
}

function formatCountdown(ms) {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
}

function getTemporaryMessageFooter(messageId) {
  const state = temporaryInteractionMessages.get(messageId);
  if (!state) return null;
  return { text: `Closes in ${formatCountdown(state.deadline - Date.now())}` };
}

function stopSeenActivityUpdates(messageId) {
  const interval = seenActivityUpdateIntervals.get(messageId);
  if (interval) {
    clearInterval(interval);
    seenActivityUpdateIntervals.delete(messageId);
  }
}

async function startTemporaryInteractionMessage(interaction, ttlMs = 2 * 60 * 1000) {
  let message;
  try {
    message = await interaction.fetchReply();
  } catch (_) {
    return;
  }

  const existing = temporaryInteractionMessages.get(message.id);
  if (existing) {
    clearInterval(existing.interval);
    clearTimeout(existing.timeout);
  }

  const deadline = Date.now() + ttlMs;
  const originalFooter = message.embeds?.[0]?.footer?.text || '';

  const updateCountdown = async () => {
    const remaining = deadline - Date.now();
    if (remaining <= 0) return;
    try {
      const current = await interaction.fetchReply();
      if (!current.embeds?.length) return;
      const embeds = current.embeds.map((embed, index) => {
        const data = embed.toJSON();
        if (index === 0) {
          const prefix = originalFooter && !originalFooter.startsWith('Closes in ')
            ? `${originalFooter} • `
            : '';
          data.footer = { text: `${prefix}Closes in ${formatCountdown(remaining)}` };
        }
        return data;
      });
      await interaction.editReply({ embeds });
    } catch (_) {}
  };

  await updateCountdown();
  const interval = setInterval(updateCountdown, 10_000);
  const timeout = setTimeout(async () => {
    clearInterval(interval);
    temporaryInteractionMessages.delete(message.id);
    try {
      await interaction.deleteReply();
    } catch (_) {
      try {
        await interaction.editReply({ content: '_ _', embeds: [], components: [] });
      } catch (_) {}
    }
  }, ttlMs);

  temporaryInteractionMessages.set(message.id, { interval, timeout, deadline });
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const {
  loadWhisperChannels,
  setWhisperChannelMapping,
  getDialogOwnerId,
  sendWhisperEmbed,
  removeWhisperChannelMappings,
  cancelWhisperCleanup,
  scheduleWhisperCleanup,
  sendWhisperClaimPrompt,
  getOrCreateWhisperChannel
} = createWhisperFeature({
  discordClient,
  discordChannelId: DISCORD_CHANNEL_ID,
  discordDmCategoryId: DISCORD_DM_CATEGORY_ID,
  whisperChannelsFile: WHISPER_CHANNELS_FILE,
  defaultTtlMs: WHISPER_TTL_MS,
  state: {
    whisperChannels,
    pendingWhisperClaims,
    whisperCleanupTimers,
    lastDialogMessages,
    whisperFooterUpdateIntervals,
    whisperDeleteTimestamps,
    customDialogTTL
  },
  emojis: {
    farm: FARM_EMOJIS,
    ui: UI_BUTTON_EMOJIS
  },
  debugLog
});

loadWhisperChannels();

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

    // If still not set, scan recent messages for the dynamic Server Status title.
    if (!statusMessage) {
      try {
        const recent = await channel.messages.fetch({ limit: 50 });
        const found = [...recent.values()].find(m =>
          String(m.embeds[0]?.title || '').endsWith('Server Status')
        );
        if (found) {
          statusMessage = found;
          saveStatusMessageId(found.id);
          if (!excludedMessageIds.includes(found.id)) excludedMessageIds.push(found.id);
        }
      } catch {}
    }

    // If still not found, create a new one
    if (!statusMessage) {
      await refreshWheatMagnatePlaytimeDisplay();
      statusMessage = await channel.send({
        embeds: [{
          title: getServerStatusTitle(),
          description: `${getStatusDescription()}\n\n${getLastBotPublicChatStatusLine()}`,
          color: bot?.entity ? 65280 : 16711680,
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

const minecraftConnectionConfig = {
  host: appConfig.minecraft.host,
  port: appConfig.minecraft.port,
  username: appConfig.minecraft.username,
  auth: appConfig.minecraft.auth,
  version: false, // Auto-detect version
  closeTimeout: MINECRAFT_CONNECT_TIMEOUT_MS,
  profilesFolder: MINECRAFT_PROFILES_FOLDER,
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

function buildSecurityAlertComponents(playerName) {
  const safePlayerName = String(playerName || '').trim();
  if (!safePlayerName) return [];

  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`security_add_whitelist_${b64encode(safePlayerName)}`)
        .setLabel('Add to whitelist')
        .setEmoji(UI_BUTTON_EMOJIS.bookYellow)
        .setStyle(ButtonStyle.Success)
    )
  ];
}

async function whitelistAlertPlayerAndReconnect(playerName, requestedBy) {
  const result = await addUsernameToWhitelist(playerName, requestedBy);

  shouldReconnect = true;
  reconnectTimestamp = 0;
  reconnectTimeRemaining = 0;

  const reconnectMode = bot ? 'scheduled' : 'immediate';
  if (reconnectMode === 'immediate') {
    createBot();
  } else {
    updateStatusMessage().catch(() => {});
  }

  return { ...result, reconnectMode };
}

const ignoredUsernames = loadWhitelist();
const {
  loadWhitelistFromDB,
  migrateWhitelistToDB,
  addUsernameToWhitelist
} = createWhitelistRepository({
  pool,
  loadWhitelistFile: loadWhitelist,
  appendWhitelistFile: username => fs.appendFileSync('whitelist.txt', `${username}\n`),
  updateWhitelistMemory: whitelist => {
    ignoredUsernames.length = 0;
    ignoredUsernames.push(...whitelist);
  }
});

let ignoredChatUsernames = IGNORED_CHAT_USERNAMES; // Fallback

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
        last_seen TIMESTAMP,
        last_online TIMESTAMP,
        registration_at TIMESTAMPTZ,
        is_online BOOLEAN DEFAULT FALSE
      )
    `);
    await pool.query('ALTER TABLE player_activity ALTER COLUMN last_seen DROP DEFAULT');
    await pool.query('ALTER TABLE player_activity ALTER COLUMN last_online DROP DEFAULT');
    await pool.query('ALTER TABLE player_activity ADD COLUMN IF NOT EXISTS registration_at TIMESTAMPTZ');
    await pool.query(`
      UPDATE player_activity
      SET registration_at = COALESCE(last_online, last_seen, NOW())
      WHERE registration_at IS NULL
    `);
    await pool.query(`
      WITH ranked AS (
        SELECT
          id,
          LOWER(username) AS username_key,
          ROW_NUMBER() OVER (
            PARTITION BY LOWER(username)
            ORDER BY is_online DESC, COALESCE(last_seen, last_online, registration_at) DESC NULLS LAST, id DESC
          ) AS rn,
          MAX(last_seen) OVER (PARTITION BY LOWER(username)) AS merged_last_seen,
          MAX(last_online) OVER (PARTITION BY LOWER(username)) AS merged_last_online,
          MIN(registration_at) OVER (PARTITION BY LOWER(username)) AS merged_registration_at,
          BOOL_OR(is_online) OVER (PARTITION BY LOWER(username)) AS merged_is_online
        FROM player_activity
      ),
      updated AS (
        UPDATE player_activity pa
        SET last_seen = ranked.merged_last_seen,
            last_online = ranked.merged_last_online,
            registration_at = ranked.merged_registration_at,
            is_online = ranked.merged_is_online
        FROM ranked
        WHERE pa.id = ranked.id
          AND ranked.rn = 1
        RETURNING pa.id
      )
      DELETE FROM player_activity pa
      USING ranked
      WHERE pa.id = ranked.id
        AND ranked.rn > 1
    `);
    await pool.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS player_activity_username_lower_unique_idx
      ON player_activity (LOWER(username))
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS player_playtime (
        username VARCHAR(255) PRIMARY KEY,
        total_seconds BIGINT NOT NULL DEFAULT 0 CHECK (total_seconds >= 0),
        tracking_since TIMESTAMPTZ,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await pool.query(`
      DELETE FROM whitelist newer
      USING whitelist older
      WHERE LOWER(newer.username) = LOWER(older.username)
        AND newer.id > older.id
    `);
    await pool.query('CREATE UNIQUE INDEX IF NOT EXISTS whitelist_username_lower_idx ON whitelist (LOWER(username))');
    await pool.query(`
      CREATE TEMP TABLE deduplicated_player_playtime ON COMMIT DROP AS
      SELECT LOWER(username) AS username_key,
             SUM(total_seconds)::BIGINT AS total_seconds
      FROM player_playtime
      GROUP BY LOWER(username);
      TRUNCATE player_playtime;
      INSERT INTO player_playtime (username, total_seconds)
      SELECT COALESCE(
               (SELECT w.username FROM whitelist w
                WHERE LOWER(w.username) = d.username_key
                LIMIT 1),
               d.username_key
             ),
             d.total_seconds
      FROM deduplicated_player_playtime d;
    `);
    await pool.query('CREATE UNIQUE INDEX IF NOT EXISTS player_playtime_username_lower_idx ON player_playtime (LOWER(username))');
    // A previous process may have stopped without a final flush. Never count
    // offline time after a crash as playtime.
    await pool.query('UPDATE player_playtime SET tracking_since = NULL WHERE tracking_since IS NOT NULL');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS mention_keywords (
        id SERIAL PRIMARY KEY,
        discord_id VARCHAR(255) NOT NULL,
        keyword VARCHAR(255) NOT NULL,
        added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(discord_id, keyword)
      )
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS obsidian_farm_state (
        id SMALLINT PRIMARY KEY CHECK (id = 1),
        session_mined BIGINT NOT NULL DEFAULT 0 CHECK (session_mined >= 0),
        total_mined BIGINT NOT NULL DEFAULT 0 CHECK (total_mined >= 0),
        desired_enabled BOOLEAN NOT NULL DEFAULT FALSE,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await pool.query(`
      ALTER TABLE obsidian_farm_state
      ADD COLUMN IF NOT EXISTS session_started_at TIMESTAMPTZ
    `);
    await pool.query(`
      ALTER TABLE obsidian_farm_state
      ADD COLUMN IF NOT EXISTS retired_pickaxes BIGINT NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS retired_pickaxe_blocks BIGINT NOT NULL DEFAULT 0
    `);
    await pool.query(`
      ALTER TABLE obsidian_farm_state
      ADD COLUMN IF NOT EXISTS target_x INTEGER,
      ADD COLUMN IF NOT EXISTS target_y INTEGER,
      ADD COLUMN IF NOT EXISTS target_z INTEGER,
      ADD COLUMN IF NOT EXISTS target_radius INTEGER
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS obsidian_farm_daily (
        farm_date DATE PRIMARY KEY,
        mined BIGINT NOT NULL DEFAULT 0 CHECK (mined >= 0),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS obsidian_farm_hourly (
        bucket TIMESTAMPTZ PRIMARY KEY,
        mined BIGINT NOT NULL DEFAULT 0 CHECK (mined >= 0),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS obsidian_farm_supply_snapshot (
        id SMALLINT PRIMARY KEY CHECK (id = 1),
        supplies JSONB NOT NULL,
        observed_at TIMESTAMPTZ,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS admin_settings (
        key TEXT PRIMARY KEY,
        value JSONB NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS bot_tps_samples (
        id BIGSERIAL PRIMARY KEY,
        sampled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        tps NUMERIC(5,2) NOT NULL CHECK (tps >= 0)
      )
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS bot_tps_samples_sampled_at_idx
      ON bot_tps_samples (sampled_at DESC)
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS game_chat_messages (
        id BIGSERIAL PRIMARY KEY,
        username VARCHAR(255) NOT NULL,
        message TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS game_chat_messages_created_at_idx
      ON game_chat_messages (created_at DESC)
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS site_game_chat_outbox (
        id BIGSERIAL PRIMARY KEY,
        sender_username VARCHAR(64) NOT NULL,
        message TEXT NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'pending',
        error TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        sent_at TIMESTAMPTZ
      )
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS site_game_chat_outbox_status_created_idx
      ON site_game_chat_outbox (status, created_at)
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS site_whisper_messages (
        id BIGSERIAL PRIMARY KEY,
        player_username VARCHAR(255) NOT NULL,
        direction VARCHAR(16) NOT NULL CHECK (direction IN ('incoming', 'outgoing')),
        site_username VARCHAR(64),
        message TEXT NOT NULL,
        delivery_status VARCHAR(16) NOT NULL DEFAULT 'delivered'
          CHECK (delivery_status IN ('sent', 'delivered')),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await pool.query(`
      ALTER TABLE site_whisper_messages
      ADD COLUMN IF NOT EXISTS delivery_status VARCHAR(16) NOT NULL DEFAULT 'delivered'
    `);
    await pool.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conname = 'site_whisper_messages_delivery_status_check'
        ) THEN
          ALTER TABLE site_whisper_messages
          ADD CONSTRAINT site_whisper_messages_delivery_status_check
          CHECK (delivery_status IN ('sent', 'delivered'));
        END IF;
      END $$;
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS site_whisper_messages_player_created_idx
      ON site_whisper_messages (LOWER(player_username), created_at DESC)
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS site_whisper_messages_site_player_created_idx
      ON site_whisper_messages (LOWER(site_username), LOWER(player_username), created_at DESC)
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS bot_commands (
        id BIGSERIAL PRIMARY KEY,
        source VARCHAR(32) NOT NULL,
        requested_by VARCHAR(255),
        command_type VARCHAR(64) NOT NULL,
        payload JSONB NOT NULL DEFAULT '{}'::jsonb,
        status VARCHAR(20) NOT NULL DEFAULT 'pending',
        result JSONB,
        error TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        started_at TIMESTAMPTZ,
        finished_at TIMESTAMPTZ
      )
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS bot_commands_status_created_idx
      ON bot_commands (status, created_at)
    `);
    await ensureSystemLogTable();
    persistBotConsoleLogs = true;
    await recordSystemLog({
      level: 'info',
      category: 'bot',
      message: 'Bot database initialized.'
    });
    await pool.query(`
      CREATE TABLE IF NOT EXISTS nearby_player_sightings (
        username VARCHAR(255) PRIMARY KEY,
        last_seen TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        distance INTEGER NOT NULL CHECK (distance >= 0)
      )
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS nearby_player_sightings_last_seen_idx
      ON nearby_player_sightings (last_seen DESC)
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS bot_status_snapshots (
        id SMALLINT PRIMARY KEY CHECK (id = 1),
        status JSONB NOT NULL,
        observed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await pool.query(`
      INSERT INTO obsidian_farm_state (id)
      VALUES (1)
      ON CONFLICT (id) DO NOTHING
    `);
    // Compatibility migration: previous deployments used these coordinates
    // from code and did not persist them. Preserve an already enabled farm
    // once, while a user reset still leaves all target columns NULL.
    await pool.query(`
      UPDATE obsidian_farm_state
      SET target_x = $1,
          target_y = $2,
          target_z = $3,
          target_radius = COALESCE(target_radius, $4),
          updated_at = NOW()
      WHERE id = 1
        AND desired_enabled = TRUE
        AND target_x IS NULL
        AND target_y IS NULL
        AND target_z IS NULL
    `, [
      LEGACY_OBSIDIAN_TARGET.x,
      LEGACY_OBSIDIAN_TARGET.y,
      LEGACY_OBSIDIAN_TARGET.z,
      LEGACY_OBSIDIAN_TARGET.radius
    ]);
    const farmStateResult = await pool.query(`
      SELECT session_mined, total_mined, retired_pickaxes, retired_pickaxe_blocks,
             desired_enabled, session_started_at, target_x, target_y, target_z, target_radius
      FROM obsidian_farm_state
      WHERE id = 1
    `);
    if (farmStateResult.rows[0]) {
      obsidianStats = {
        sessionMined: Number(farmStateResult.rows[0].session_mined) || 0,
        totalMined: Number(farmStateResult.rows[0].total_mined) || 0,
        retiredPickaxes: Number(farmStateResult.rows[0].retired_pickaxes) || 0,
        retiredPickaxeBlocks: Number(farmStateResult.rows[0].retired_pickaxe_blocks) || 0,
        desiredEnabled: Boolean(farmStateResult.rows[0].desired_enabled),
        sessionStartedAt: farmStateResult.rows[0].session_started_at
          ? new Date(farmStateResult.rows[0].session_started_at)
          : null
      };
      const rawTargetX = farmStateResult.rows[0].target_x;
      const rawTargetY = farmStateResult.rows[0].target_y;
      const rawTargetZ = farmStateResult.rows[0].target_z;
      const targetX = Number(rawTargetX);
      const targetY = Number(rawTargetY);
      const targetZ = Number(rawTargetZ);
      const targetRadius = farmStateResult.rows[0].target_radius == null
        ? appConfig.farm.radius
        : Number(farmStateResult.rows[0].target_radius);
      if (
        rawTargetX != null &&
        rawTargetY != null &&
        rawTargetZ != null &&
        Number.isFinite(targetX) &&
        Number.isFinite(targetY) &&
        Number.isFinite(targetZ)
      ) {
        farm.configure(targetX, targetY, targetZ, { maxCauldronDist: targetRadius });
        console.log(`[DB] Loaded obsidian target: (${targetX}, ${targetY}, ${targetZ}), radius ${farm.getStatus().config?.maxCauldronDist || 5}.`);
      }
    }
    console.log('[DB] Tables initialized successfully.');

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

let discordLoginRetryTimer = null;
let discordLoginInProgress = false;

function formatGrowingChildStatus(status) {
  const topWords = status.topWords.length > 0
    ? status.topWords.map(entry => `${entry.word} (${entry.times_seen})`).join(', ')
    : 'none yet';
  const topics = status.topTopics.length > 0
    ? status.topTopics.map(entry => entry.topic).join(', ')
    : 'none yet';
  return [
    `State: **${status.enabled ? 'Enabled' : 'Disabled'}**`,
    `Level: **${status.level}**`,
    `Known words: **${status.knownWords}**`,
    `Experience: **${status.xp} XP**`,
    `Messages studied: **${status.messages}**`,
    `Emotion: **${status.emotion}**`,
    `Frequent words: ${topWords}`,
    `Topics: ${topics}`
  ].join('\n');
}

function escapeCsvValue(value) {
  const text = String(value ?? '');
  return `"${text.replaceAll('"', '""')}"`;
}

const EXCEL_CSV_DELIMITER = ';';

function buildGrowingChildVocabularyCsv() {
  const rows = growingChild?.getAllWords() || [];
  const header = ['word', 'times_seen', 'first_seen', 'last_seen', 'learned_at_level'];
  const lines = [
    header.map(escapeCsvValue).join(EXCEL_CSV_DELIMITER),
    ...rows.map(row => [
      row.word,
      row.times_seen,
      row.first_seen,
      row.last_seen,
      row.learned_at_level
    ].map(escapeCsvValue).join(EXCEL_CSV_DELIMITER))
  ];
  return {
    count: rows.length,
    buffer: Buffer.from(`\uFEFF${lines.join('\r\n')}`, 'utf8')
  };
}

async function sendGrowingChildVocabularyDM() {
  if (!DISCORD_OWNER_ID || !discordClient?.isReady()) return false;
  const owner = await discordClient.users.fetch(DISCORD_OWNER_ID);
  if (!owner) return false;
  const vocabulary = buildGrowingChildVocabularyCsv();
  const date = new Date().toISOString().slice(0, 10);
  await owner.send({
    content: `Growing Child vocabulary: **${vocabulary.count}** words.`,
    files: [{
      attachment: vocabulary.buffer,
      name: `growing-child-vocabulary-${date}.csv`
    }]
  });
  return true;
}

async function sendGrowingChildOwnerDM(payload) {
  if (!DISCORD_OWNER_ID || !discordClient?.isReady()) return;
  const owner = await discordClient.users.fetch(DISCORD_OWNER_ID);
  if (!owner) return;
  const sent = await owner.send(payload.phrase);
  growingChildPlainMessageIds.add(sent.id);
  setTimeout(() => growingChildPlainMessageIds.delete(sent.id), 60_000).unref?.();
}

async function sendGrowingChildChannelMessage(channelId, payload) {
  const channel = await discordClient.channels.fetch(channelId);
  if (!channel?.isTextBased()) return;
  await channel.send({
    embeds: [{
      title: `${NETHER_STAR_EMOJI} Growing Child AI`,
      description: payload.phrase,
      color: 10181046,
      footer: { text: `Level ${payload.level} · ${payload.emotion}` },
      timestamp: new Date()
    }]
  });
}

async function sendGrowingChildMinecraftMessage(payload) {
  if (!bot?.entity || typeof bot.chat !== 'function') return false;
  const safePhrase = sanitizePublicPhrase(payload.phrase);
  if (!safePhrase) {
    console.log('[GrowingChild] Minecraft message blocked by coordinate safety filter.');
    return false;
  }
  const sent = sendMinecraftChat(safePhrase, { trackStatus: true });
  if (!sent) return false;

  await sendGameChatMessageToDiscord(bot.username, safePhrase, {
    allowMentions: false
  });
  return true;
}

function buildGrowingChildStatusEmbed(status, note = null) {
  return {
    title: `${NETHER_STAR_EMOJI} Growing Child AI · Status`,
    description: `${note ? `${note}\n\n` : ''}${formatGrowingChildStatus(status)}`,
    color: status.enabled ? 65280 : 8421504,
    timestamp: new Date()
  };
}

async function sendGrowingChildStatusDM(note = null) {
  if (!growingChild || !DISCORD_OWNER_ID || !discordClient?.isReady()) return;
  const owner = await discordClient.users.fetch(DISCORD_OWNER_ID);
  if (!owner) return;
  const status = growingChild.getStatus();
  await owner.send({
    embeds: [{
      title: `${NETHER_STAR_EMOJI} Growing Child AI · Status`,
      description: `${note ? `${note}\n\n` : ''}${formatGrowingChildStatus(status)}`,
      color: 10181046,
      timestamp: new Date()
    }],
    components: [createGrowingChildControls()]
  });
}

async function sendGrowingChildResetPrompt() {
  if (!DISCORD_OWNER_ID || !discordClient?.isReady()) return;
  const owner = await discordClient.users.fetch(DISCORD_OWNER_ID);
  if (!owner) return;
  await owner.send({
    embeds: [{
      title: 'Reset Growing Child AI?',
      description: 'This permanently deletes its vocabulary, experience, topics, members, channels and emotional state.',
      color: 16711680,
      timestamp: new Date()
    }],
    components: [createGrowingChildResetConfirmation()]
  });
}

function splitGrowingChildFeedText(text, { maxLines = 500, maxLineLength = 500 } = {}) {
  return String(text || '')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map(line => line.trim())
    .filter(line => line && !/^```/.test(line))
    .slice(0, maxLines)
    .map(line => line.slice(0, maxLineLength));
}

async function readGrowingChildFeedAttachments(message) {
  const texts = [];
  const warnings = [];
  for (const attachment of message.attachments?.values?.() || []) {
    const name = String(attachment.name || 'attachment');
    const contentType = String(attachment.contentType || '');
    const isText =
      contentType.startsWith('text/') ||
      /\.(txt|md|text|log)$/i.test(name);
    if (!isText) continue;
    if (attachment.size && attachment.size > 256 * 1024) {
      warnings.push(`Skipped ${name}: file is larger than 256 KB.`);
      continue;
    }
    try {
      const response = await fetch(attachment.url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      texts.push(await response.text());
    } catch (err) {
      warnings.push(`Skipped ${name}: ${err.message}.`);
    }
  }
  return { text: texts.join('\n'), warnings };
}

function formatGrowingChildFeedSummary(summary) {
  return [
    `Fed lines: **${summary.learned}/${summary.total}**`,
    `New words: **${summary.newWords}**`,
    `Known words: **${summary.knownWords}**`,
    `Messages studied: **${summary.messages}**`,
    summary.truncated ? 'Note: only the first 500 non-empty lines were processed.' : null
  ].filter(Boolean).join('\n');
}

async function feedGrowingChildTextFromDM(message, text) {
  if (!growingChild) initializeGrowingChild();
  const allLines = String(text || '')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map(line => line.trim())
    .filter(line => line && !/^```/.test(line));
  const lines = splitGrowingChildFeedText(text);
  if (lines.length === 0) {
    await message.reply('Send text after `!feed`, paste lines while feed mode is active, or attach a `.txt` file.');
    return null;
  }

  let learned = 0;
  let newWords = 0;
  let latestStatus = growingChild.getStatus();
  for (const line of lines) {
    const result = growingChild.learn({
      source: 'owner_dm',
      authorId: message.author.id,
      authorName: message.author.username,
      channelId: 'owner_dm_feed',
      channelName: 'Owner DM feed',
      text: line,
      addressed: false,
      trainingOnly: true
    });
    if (!result) continue;
    learned++;
    newWords += Number(result.newWords || 0);
    latestStatus = result;
  }

  const summary = {
    total: lines.length,
    learned,
    newWords,
    knownWords: latestStatus.knownWords,
    messages: latestStatus.messages,
    truncated: allLines.length > lines.length
  };
  await message.reply(formatGrowingChildFeedSummary(summary));
  console.log(`[GrowingChild Feed] ${message.author.tag} fed ${learned}/${lines.length} lines, ${newWords} new words.`);
  return summary;
}

async function handleGrowingChildFeedDM(message) {
  const content = message.content.trim();
  const lower = content.toLowerCase();
  const isFeedCommand = lower === '!feed' || lower.startsWith('!feed ');
  const isInFeedMode = growingChildFeedDmUsers.has(message.author.id);
  if (!isFeedCommand && !isInFeedMode) return false;

  if (isFeedCommand) {
    const arg = content.slice('!feed'.length).trim();
    const argLower = arg.toLowerCase();
    if (!arg || argLower === 'start' || argLower === 'on') {
      growingChildFeedDmUsers.add(message.author.id);
      await message.reply('Feed mode enabled. Paste text or attach `.txt` files here. Use `!feed stop` to finish.');
      return true;
    }
    if (['stop', 'off', 'end', 'done'].includes(argLower)) {
      growingChildFeedDmUsers.delete(message.author.id);
      await message.reply('Feed mode disabled.');
      return true;
    }
    if (argLower === 'help') {
      await message.reply('Use `!feed` to enable feed mode, `!feed stop` to disable it, or `!feed <text>` to feed one pasted block immediately.');
      return true;
    }

    const attachments = await readGrowingChildFeedAttachments(message);
    await feedGrowingChildTextFromDM(message, `${arg}\n${attachments.text}`.trim());
    if (attachments.warnings.length > 0) await message.reply(attachments.warnings.join('\n'));
    return true;
  }

  const attachments = await readGrowingChildFeedAttachments(message);
  await feedGrowingChildTextFromDM(message, `${content}\n${attachments.text}`.trim());
  if (attachments.warnings.length > 0) await message.reply(attachments.warnings.join('\n'));
  return true;
}

function initializeGrowingChild() {
  if (growingChild) return growingChild;
  growingChild = new GrowingChildAI({
    sendOwnerDM: sendGrowingChildOwnerDM,
    sendChannelMessage: sendGrowingChildChannelMessage,
    sendMinecraftMessage: sendGrowingChildMinecraftMessage,
    generateWithAI: GEMINI_API_KEY ? generateGrowingChildPhrase : null,
    allowedDiscordChannelId: DISCORD_CHAT_CHANNEL_ID
  });
  growingChild.setMinecraftPublicSpeechEnabled(runtimeSettings.childPublicSpeech);
  growingChild.start();
  console.log('[GrowingChild] Learning system started.');
  return growingChild;
}

async function generateGrowingChildPhrase({
  reason,
  emotion,
  contextWords,
  selectedWords,
  learnedWords,
  grammarWords,
  candidateCount = 5
}) {
  if (!GEMINI_API_KEY || !runtimeSettings.geminiEnabled) return null;

  const replyInstruction = reason === 'reaction' && contextWords.length > 0
    ? `Reply naturally to a Minecraft message whose known context is: ${contextWords.join(', ')}.`
    : 'Write a casual standalone Minecraft chat message.';
  const selectedWordLine = selectedWords.length > 0
    ? `Try to include at least ${Math.min(2, selectedWords.length)} of these learned topic words: ${selectedWords.join(', ')}.`
    : 'Use at least one specific learned topic word.';
  const prompt = [
    replyInstruction,
    `Mood: ${emotion}.`,
    `Write ${candidateCount} different coherent English sentences of 3 to 12 words.`,
    'Put each sentence on its own line. No numbering, bullets, quotes, labels, or explanations.',
    selectedWordLine,
    'Prefer natural Minecraft chat over perfect grammar if needed.',
    'You may use any words from the learned vocabulary plus basic grammar words.',
    'Do not return empty generic phrases such as "what is this", "what is that", or "I do not know".',
    'Do not force unrelated words together or produce nonsense.',
    'Do not copy or closely paraphrase a message you have seen.',
    'Do not preserve the order of the topic words. Use them as ingredients, not as a quote.',
    'Every sentence must feel complete, with a clear small thought.',
    'Do not add names, numbers, coordinates, commands, quotes, labels, emojis, or explanations.',
    'Basic grammar words:',
    grammarWords.join(', '),
    'Topic words:',
    selectedWords.join(', '),
    'Learned vocabulary:',
    learnedWords.join(', ')
  ].join('\n');

  return askGemini(prompt, {
    systemInstruction:
      'You write short, natural Minecraft chat sentences under strict vocabulary constraints. Return only plain text candidate sentences, one per line.',
    temperature: 0.95,
    maxOutputTokens: 120,
    maxResponseLength: 500
  });
}

function loginDiscord() {
  if (!DISCORD_BOT_TOKEN || discordClient.isReady() || discordLoginInProgress) return;

  discordLoginInProgress = true;
  console.log('[Discord] Attempting to login with token...');
  discordClient.login(DISCORD_BOT_TOKEN)
    .then(() => {
      console.log('[Discord] Login promise resolved');
    })
    .catch(err => {
      console.error('[Discord] Login failed:', err.message);

      if (!discordLoginRetryTimer) {
        console.log(`[Discord] Retrying login in ${appConfig.discord.loginRetryMs / 1000} seconds...`);
        discordLoginRetryTimer = setTimeout(() => {
          discordLoginRetryTimer = null;
          loginDiscord();
        }, appConfig.discord.loginRetryMs);
      }
    })
    .finally(() => {
      discordLoginInProgress = false;
    });
}

if (DISCORD_BOT_TOKEN) {
  loginDiscord();

  // Debug event removed to reduce log noise

  discordClient.on('warn', message => {
    console.log(`[Discord WARN] ${message}`);
  });

  discordClient.on('error', error => {
    console.error('[Discord ERROR]', error);
  });

  // Add a Delete button to every message the bot sends in a direct message.
  discordClient.on('messageCreate', message => {
    if (
      message.author?.id !== discordClient.user?.id ||
      !message.channel?.isDMBased?.()
    ) {
      return;
    }

    setTimeout(async () => {
      try {
        const current = await message.channel.messages.fetch(message.id);
        await ensureDMDeleteButton(current);
      } catch (err) {
        if (err.code !== 10008) {
          console.error('[Discord] Failed to add DM delete button:', err.message);
        }
      }
    }, 750);
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
    if (discordLoginRetryTimer) {
      clearTimeout(discordLoginRetryTimer);
      discordLoginRetryTimer = null;
    }
    console.log(`[Discord] Bot logged in as ${discordClient.user.tag}`);
    console.log(`[Discord] Bot ID: ${discordClient.user.id}`);
    console.log(`[Discord] Guilds: ${discordClient.guilds.cache.size}`);
    await recordSystemLog({
      level: 'info',
      category: 'discord',
      message: `Discord bot ready as ${discordClient.user.tag}.`,
      details: { guilds: discordClient.guilds.cache.size }
    });

    try {
      updateDiscordPresence({ force: true });
      console.log('[Discord] Presence update started');
    } catch (presenceErr) {
      console.error('[Discord] Failed to set presence:', presenceErr.message);
    }

    // Check if we can see the configured channel
    try {
      const channel = await discordClient.channels.fetch(DISCORD_CHANNEL_ID);
      console.log(`[Discord] Channel found: ${channel.name} (${channel.id})`);
      console.log(`[Discord] Channel type: ${channel.type}`);
      console.log(`[Discord] Bot permissions in channel: ${channel.permissionsFor(discordClient.user).toArray().join(', ')}`);
    } catch (channelErr) {
      console.error('[Discord] ❌ Failed to fetch channel:', channelErr.message);
      console.error('[Discord] This means the bot cannot see the configured channel!');
    }

    await initDatabase();
    await loadRuntimeSettingsFromDB();
    await saveAdminSettings(runtimeSettings);
    startBotStatusSnapshotWriter();
    try {
      await registerApplicationCommands();
    } catch (err) {
      console.error('[Discord] Failed to register application commands:', err.message);
      console.error('[Discord] Command registration details:', err.rawError || err);
    }
    await migrateWhitelistToDB();
    // Reload whitelist after migration
    const wl = await loadWhitelistFromDB();
    if (Array.isArray(wl) && wl.length > 0) {
      ignoredUsernames.length = 0;
      ignoredUsernames.push(...wl);
    }
    initializeGrowingChild();
    if (!mineflayerStarted) {
      mineflayerStarted = true;
      createBot();
    }

    console.log('[Discord] Bot is ready and waiting for interactions...');

    // Load or create the persistent status message even when Minecraft is
    // offline and never reaches the spawn event.
    await ensureStatusMessage();
    await updateStatusMessage();
    await ensureAdminPanelDM();
    await updateAdminPanel();
    await restoreObsidianStatsUpdaters();
    ensureObsidianStatsWatchdog();

    // Start global status update interval (updates every 3 seconds)
    if (!statusUpdateInterval) {
      statusUpdateInterval = setInterval(updateStatusMessage, 3000);
      console.log('[Discord] Status update interval started');
    }
    if (!adminPanelUpdateInterval) {
      adminPanelUpdateInterval = setInterval(updateAdminPanel, 10_000);
      console.log('[Discord] Admin panel update interval started');
    }
    if (!siteGameChatOutboxInterval) {
      siteGameChatOutboxInterval = setInterval(() => {
        processBotCommands().catch(err => {
          console.error('[Command Bus] Worker failed:', err.message);
          recordSystemLog({
            level: 'error',
            category: 'command_bus',
            message: 'Command bus worker failed.',
            details: { error: err.message }
          }).catch(() => {});
        });
        processSiteGameChatOutbox().catch(err => {
          console.error('[Site Chat] Outbox worker failed:', err.message);
        });
      }, 1000);
      console.log('[Command Bus] Worker started');
      await recordSystemLog({
        level: 'info',
        category: 'command_bus',
        message: 'Command bus worker started.'
      });
    }

    // Flush any pending auth links captured before client was ready
    if (pendingAuthLinks.length > 0) {
      const links = pendingAuthLinks.splice(0);
      for (const url of links) {
        try { await sendAuthLinkToDiscord(url); } catch {}
      }
    }

    if (pendingOwnerDMs.length > 0) {
      const messages = pendingOwnerDMs.splice(0);
      for (const message of messages) {
        await sendOwnerDM(message.title, message.description, message.color);
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
              // Interactive panels have their own exact two-minute lifetime.
              // The periodic channel cleaner must not delete them early.
              if (temporaryInteractionMessages.has(msg.id)) return false;
              if (msg.createdTimestamp < twoWeeksAgo) return false; // cannot bulk delete older than 14 days
              const desc = msg.embeds[0]?.description || '';
              const lowerDesc = desc.toLowerCase();
              if (msg.embeds[0]?.title === 'New whisper from Minecraft') return false; // keep pending /msg claim cards
              // Don't delete death-related messages
              if (lowerDesc.includes('died') || lowerDesc.includes('death') || lowerDesc.includes('perished') || lowerDesc.includes('💀') || desc.includes(':skull:')) return false;
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

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function getNearestPlayerEntity(maxDistance = 300) {
  if (!bot?.entity) return null;
  return Object.values(bot.entities || {})
    .filter(entity =>
      entity &&
      entity.type === 'player' &&
      entity.username &&
      entity.username !== bot.username &&
      entity.position
    )
    .map(entity => ({
      entity,
      distance: bot.entity.position.distanceTo(entity.position)
    }))
    .filter(entry => entry.distance <= maxDistance)
    .sort((a, b) => a.distance - b.distance)[0]?.entity || null;
}

async function lookAtNearestPlayerForDrop() {
  const nearest = getNearestPlayerEntity();
  if (!nearest) throw new Error('No nearby player visible to drop the item to.');
  const lookPosition = typeof nearest.position.offset === 'function'
    ? nearest.position.offset(0, 1.4, 0)
    : nearest.position;
  await bot.lookAt(lookPosition, true);
  return nearest.username;
}

async function dropItemToNearestPlayer(item) {
  const farmWasEnabled = farm.getStatus().enabled;
  const farmWasDesired = obsidianStats.desiredEnabled;
  const followStatus = followFeature.getStatus();
  const followTarget = followStatus.enabled ? followStatus.targetUsername : null;
  let targetUsername = null;

  try {
    farm.suspend();
    if (followStatus.enabled) followFeature.stop();
    await sleep(350);

    targetUsername = await lookAtNearestPlayerForDrop();
    await sleep(250);

    if (typeof bot.tossStack === 'function') {
      await bot.tossStack(item);
    } else {
      await bot.toss(item.type, item.metadata || null, item.count);
    }

    await sleep(1_250);
  } finally {
    if (bot?.entity) {
      if (followTarget) {
        followFeature.start(bot, followTarget);
      } else if (farmWasEnabled || farmWasDesired) {
        farm.resume(bot, () => {});
      }
    }
  }

  return targetUsername;
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

function getOnlineWhitelistUsernames() {
  if (!bot || !bot.players) return [];
  const usernames = Object.values(bot.players)
    .map(player => player.username)
    .filter(username => username && ignoredUsernames.some(
      whitelisted => whitelisted.toLowerCase() === username.toLowerCase()
    ));
  if (
    bot.username &&
    bot.entity &&
    ignoredUsernames.some(username => username.toLowerCase() === bot.username.toLowerCase()) &&
    !usernames.some(username => username.toLowerCase() === bot.username.toLowerCase())
  ) {
    usernames.push(bot.username);
  }
  return usernames;
}

function addObservedOnlineUsername(usernames, rawUsername) {
  const username = String(rawUsername || '').trim();
  if (!/^[A-Za-z0-9_]{1,32}$/.test(username)) return;
  const key = username.toLowerCase();
  if (!usernames.has(key)) {
    usernames.set(key, username);
  }
}

function getOnlinePlayerUsernames() {
  if (!bot) return [];
  const usernames = new Map();

  for (const player of Object.values(bot.players || {})) {
    addObservedOnlineUsername(usernames, player?.username);
  }

  for (const player of Object.values(bot.tablist?.players || {})) {
    addObservedOnlineUsername(usernames, player?.username);
    addObservedOnlineUsername(usernames, player?.profile?.name);
    const displayName = player?.displayName ? chatComponentToString(player.displayName) : '';
    addObservedOnlineUsername(usernames, displayName);
  }

  return [...usernames.values()];
}

async function syncPlayerActivityOnlineState() {
  if (!pool || !bot || playerActivitySyncRunning) return;

  playerActivitySyncRunning = true;
  try {
    const botUsername = String(bot.username || '').toLowerCase();
    const observedUsernames = getOnlinePlayerUsernames();
    const hasAnyObservedPlayers = observedUsernames.length > 0;
    const hasObservedSelf = botUsername && observedUsernames.some(username => username.toLowerCase() === botUsername);
    if (!hasAnyObservedPlayers && lastObservedOnlinePlayerKeys) {
      console.warn('[PlayerActivity] Skipping offline sync because Mineflayer returned an empty player snapshot.');
      return;
    }

    const onlineUsernames = observedUsernames
      .filter(username => username.toLowerCase() !== botUsername);
    const onlineByKey = new Map(onlineUsernames.map(username => [username.toLowerCase(), username]));
    const onlineKeys = new Set(onlineByKey.keys());

    await Promise.all(onlineUsernames.map(username => updatePlayerActivity(username, true, { recordEvent: false })));

    if (lastObservedOnlinePlayerKeys) {
      const leftUsernames = [...lastObservedOnlinePlayerKeys]
        .filter(key => !onlineKeys.has(key))
        .map(key => lastObservedOnlinePlayerKeys.get(key))
        .filter(Boolean);
      await Promise.all(leftUsernames.map(username => updatePlayerActivity(username, false, { recordEvent: true })));
    }

    if (onlineUsernames.length > 0 || hasObservedSelf || lastObservedOnlinePlayerKeys) {
      lastObservedOnlinePlayerKeys = onlineByKey;
    }
  } catch (err) {
    console.error('[PlayerActivity] Failed to synchronize online state:', err.message);
  } finally {
    playerActivitySyncRunning = false;
  }
}

const {
  syncWhitelistPlaytime,
  getWhitelistPlaytime,
  parsePlaytime,
  formatPlaytime,
  formatPlaytimeLeaderboard,
  buildWhitelistPlaytimeMessage,
  setPlayerPlaytime
} = createPlaytimeFeature({
  pool,
  getOnlinePlayerUsernames,
  getPlayerHeadEmoji,
  statusEmojis: STATUS_EMOJIS,
  uiButtonEmojis: UI_BUTTON_EMOJIS
});

async function refreshWheatMagnatePlaytimeDisplay({ force = false } = {}) {
  const now = Date.now();
  if (!force && now - wheatMagnatePlaytimeCacheAt < 30_000) {
    return wheatMagnatePlaytimeDisplay;
  }

  wheatMagnatePlaytimeCacheAt = now;
  try {
    const playtimeData = await getWhitelistPlaytime();
    if (playtimeData.error) return wheatMagnatePlaytimeDisplay;
    const player = (playtimeData.players || []).find(row =>
      String(row.username || '').toLowerCase() === ADMIN_PANEL_BOT_NAME.toLowerCase()
    );
    if (player) {
      wheatMagnatePlaytimeDisplay = formatPlaytime(player.total_seconds);
    }
  } catch (_) {}

  return wheatMagnatePlaytimeDisplay;
}

function getWheatMagnateStatusLine() {
  return `${getPlayerHeadEmoji(ADMIN_PANEL_BOT_NAME)} **${ADMIN_PANEL_BOT_NAME}** Playtime: **${wheatMagnatePlaytimeDisplay}**`;
}

async function getEffectivePlayerPlaytime(username) {
  if (!pool) return { error: 'Database not configured' };

  const safeUsername = String(username || '').replace(/[^A-Za-z0-9_]/g, '').trim().slice(0, 32);
  if (!safeUsername) return { error: 'Username is required' };

  try {
    const result = await pool.query(`
      SELECT username,
             COALESCE(total_seconds, 0) +
               CASE WHEN tracking_since IS NULL THEN 0
                    ELSE GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (NOW() - tracking_since)))::BIGINT)
               END AS effective_seconds
      FROM player_playtime
      WHERE LOWER(username) = LOWER($1)
      LIMIT 1
    `, [safeUsername]);
    const row = result.rows[0];
    return {
      username: row?.username || safeUsername,
      totalSeconds: Number(row?.effective_seconds || 0)
    };
  } catch (err) {
    return { error: err.message };
  }
}

async function reconcileObservedPlaytime(targetUsername, observedSeconds) {
  if (!pool || !targetUsername || !Number.isFinite(observedSeconds)) return;

  const safeUsername = String(targetUsername || '').replace(/[^A-Za-z0-9_]/g, '').trim().slice(0, 32);
  const safeSeconds = Math.max(0, Math.floor(observedSeconds));
  if (!safeUsername) return;

  try {
    const result = await pool.query(`
      SELECT username,
             COALESCE(total_seconds, 0) +
               CASE WHEN tracking_since IS NULL THEN 0
                    ELSE GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (NOW() - tracking_since)))::BIGINT)
               END AS effective_seconds
      FROM player_playtime
      WHERE LOWER(username) = LOWER($1)
      LIMIT 1
    `, [safeUsername]);
    const currentSeconds = Number(result.rows[0]?.effective_seconds || 0);
    const diffSeconds = Math.abs(currentSeconds - safeSeconds);
    if (diffSeconds < 60) return;

    const updateResult = await setPlayerPlaytime(safeUsername, safeSeconds);
    if (updateResult.error) {
      console.error(`[Playtime] Failed to update observed !pt for ${safeUsername}: ${updateResult.error}`);
      return;
    }
    console.log(
      `[Playtime] Updated ${updateResult.username} from observed !pt: ${formatPlaytime(currentSeconds)} -> ${formatPlaytime(safeSeconds)}`
    );
  } catch (err) {
    console.error('[Playtime] Failed to reconcile observed !pt:', err.message);
  }
}

function handleObservedPlaytimeChat(username, message) {
  const safeSpeaker = String(username || '').replace(/[^A-Za-z0-9_]/g, '').trim().slice(0, 32);
  const cleanMessage = String(message || '').replace(/\u00a7[0-9a-fk-or]/gi, '').trim();
  if (!safeSpeaker || !cleanMessage) return;

  const speakerKey = safeSpeaker.toLowerCase();
  const commandMatch = cleanMessage.match(/^!(?:pt|playtime)(?:\s+([A-Za-z0-9_]{1,32}))?$/i);
  if (commandMatch) {
    const targetUsername = commandMatch[1] || safeSpeaker;
    const pending = {
      targetUsername,
      timestamp: Date.now()
    };
    pendingPlaytimeLookups.set(`speaker:${speakerKey}`, pending);
    pendingPlaytimeLookups.set(`target:${targetUsername.toLowerCase()}`, pending);
    return;
  }

  const observedSeconds = parsePlaytime(cleanMessage);
  if (observedSeconds == null) return;

  const pendingKeys = [
    `speaker:${speakerKey}`,
    `target:${speakerKey}`
  ];
  const pending = pendingKeys.map(key => pendingPlaytimeLookups.get(key)).find(Boolean);
  if (!pending || Date.now() - pending.timestamp > 20_000) {
    for (const key of pendingKeys) pendingPlaytimeLookups.delete(key);
    return;
  }

  for (const [key, value] of pendingPlaytimeLookups.entries()) {
    if (value === pending) pendingPlaytimeLookups.delete(key);
  }
  reconcileObservedPlaytime(pending.targetUsername, observedSeconds).catch(() => {});
}

function parseObservedJoinDate(message) {
  const match = String(message || '').trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2}):(\d{2})\b/);
  if (!match) return null;
  const [, month, day, year, hour, minute, second] = match.map(Number);
  const date = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  if (!Number.isFinite(date.getTime())) return null;
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day ||
    date.getUTCHours() !== hour ||
    date.getUTCMinutes() !== minute ||
    date.getUTCSeconds() !== second
  ) {
    return null;
  }
  return date;
}

async function reconcileObservedJoinDate(targetUsername, observedDate) {
  if (!pool || !targetUsername || !(observedDate instanceof Date) || !Number.isFinite(observedDate.getTime())) return;

  const safeUsername = String(targetUsername || '').replace(/[^A-Za-z0-9_]/g, '').trim().slice(0, 32);
  if (!safeUsername) return;

  try {
    const result = await pool.query(`
      INSERT INTO player_activity (username, registration_at)
      VALUES ($1, $2)
      ON CONFLICT (LOWER(username))
      DO UPDATE SET username = EXCLUDED.username,
                    registration_at = EXCLUDED.registration_at
      WHERE player_activity.registration_at IS DISTINCT FROM EXCLUDED.registration_at
      RETURNING username
    `, [safeUsername, observedDate]);
    if (result.rowCount > 0) {
      console.log(`[JoinDate] Updated ${result.rows[0].username} registration date to ${observedDate.toISOString()}`);
    }
  } catch (err) {
    console.error('[JoinDate] Failed to reconcile observed !jd:', err.message);
  }
}

function handleObservedJoinDateChat(username, message) {
  const safeSpeaker = String(username || '').replace(/[^A-Za-z0-9_]/g, '').trim().slice(0, 32);
  const cleanMessage = String(message || '').replace(/\u00a7[0-9a-fk-or]/gi, '').trim();
  if (!safeSpeaker || !cleanMessage) return;

  const speakerKey = safeSpeaker.toLowerCase();
  const commandMatch = cleanMessage.match(/^!(?:jd|joindate)(?:\s+([A-Za-z0-9_]{1,32}))?$/i);
  if (commandMatch) {
    const targetUsername = commandMatch[1] || safeSpeaker;
    const pending = {
      targetUsername,
      timestamp: Date.now()
    };
    pendingJoinDateLookups.set(`speaker:${speakerKey}`, pending);
    pendingJoinDateLookups.set(`target:${targetUsername.toLowerCase()}`, pending);
    return;
  }

  const observedDate = parseObservedJoinDate(cleanMessage);
  if (!observedDate) return;

  const pendingKeys = [
    `speaker:${speakerKey}`,
    `target:${speakerKey}`
  ];
  const pending = pendingKeys.map(key => pendingJoinDateLookups.get(key)).find(Boolean);
  if (!pending || Date.now() - pending.timestamp > 20_000) {
    for (const key of pendingKeys) pendingJoinDateLookups.delete(key);
    return;
  }

  for (const [key, value] of pendingJoinDateLookups.entries()) {
    if (value === pending) pendingJoinDateLookups.delete(key);
  }
  reconcileObservedJoinDate(pending.targetUsername, observedDate).catch(() => {});
}

async function beginObsidianFarmSession() {
  // Do not reset the session while writes from the previous run are pending.
  await obsidianStatsWriteQueue;
  obsidianStats.sessionMined = 0;
  obsidianStats.desiredEnabled = true;
  obsidianStats.sessionStartedAt = new Date();
  if (!pool) return;

  try {
    const result = await pool.query(`
      UPDATE obsidian_farm_state
      SET session_mined = 0,
          desired_enabled = TRUE,
          session_started_at = NOW(),
          updated_at = NOW()
      WHERE id = 1
      RETURNING session_mined, total_mined, desired_enabled, session_started_at
    `);
    if (result.rows[0]) {
      obsidianStats = {
        sessionMined: Number(result.rows[0].session_mined) || 0,
        totalMined: Number(result.rows[0].total_mined) || 0,
        retiredPickaxes: obsidianStats.retiredPickaxes,
        retiredPickaxeBlocks: obsidianStats.retiredPickaxeBlocks,
        desiredEnabled: Boolean(result.rows[0].desired_enabled),
        sessionStartedAt: new Date(result.rows[0].session_started_at)
      };
    }
  } catch (err) {
    console.error('[DB] Failed to start obsidian farm session:', err.message);
  }
}

async function setObsidianFarmDesiredEnabled(enabled) {
  obsidianStats.desiredEnabled = Boolean(enabled);
  if (!pool) return;
  try {
    await pool.query(`
      UPDATE obsidian_farm_state
      SET desired_enabled = $1,
          updated_at = NOW()
      WHERE id = 1
    `, [Boolean(enabled)]);
  } catch (err) {
    console.error('[DB] Failed to update obsidian farm desired state:', err.message);
  }
}

async function persistObsidianFarmCoordinates(config = farm.getStatus().config) {
  if (!pool || !config) return;
  await pool.query(`
    UPDATE obsidian_farm_state
    SET target_x = $1,
        target_y = $2,
        target_z = $3,
        target_radius = $4,
        updated_at = NOW()
    WHERE id = 1
  `, [config.x, config.y, config.z, config.maxCauldronDist]);
}

async function clearObsidianFarmCoordinates() {
  if (!pool) return;
  await pool.query(`
    UPDATE obsidian_farm_state
    SET target_x = NULL,
        target_y = NULL,
        target_z = NULL,
        target_radius = NULL,
        updated_at = NOW()
    WHERE id = 1
  `);
}

async function startConfiguredObsidianFarm() {
  const config = farm.getStatus().config;
  if (!config) throw new Error('Farm coordinates are not configured.');
  if (!bot?.entity) throw new Error('Minecraft bot is offline.');

  await farm.prepareStart(bot);
  await beginObsidianFarmSession();
  const startingBot = bot;
  ensureObsidianFarmRunning(startingBot, { freshSession: true }).catch(err => {
    console.error('[Obsidian] Manual farm start retry loop failed:', err.message);
  });

  const startupDeadline = Date.now() + 15_000;
  while (
    Date.now() < startupDeadline &&
    bot === startingBot &&
    obsidianStats.desiredEnabled &&
    !farm.getStatus().enabled
  ) {
    await new Promise(resolve => setTimeout(resolve, 250));
  }

  return {
    started: farm.getStatus().enabled,
    config: farm.getStatus().config
  };
}

async function toggleObsidianFarmFromControl() {
  const farmStatus = farm.getStatus();
  if (farmStatus.enabled || obsidianStats.desiredEnabled) {
    farm.suspend();
    const leverProtected = await setProtectionLeverState(true).catch(() => false);
    await setObsidianFarmDesiredEnabled(false);
    return {
      enabled: false,
      leverProtected,
      sessionMined: obsidianStats.sessionMined
    };
  }

  const result = await startConfiguredObsidianFarm();
  return {
    enabled: true,
    started: result.started,
    config: result.config
  };
}

function buildObsidianStartEmbed(started, config) {
  return {
    description: started
      ? `${STATUS_EMOJIS.connected} Obsidian farm started at \`(${config.x}, ${config.y}, ${config.z})\`.`
      : `⏳ Obsidian farm start is queued for \`(${config.x}, ${config.y}, ${config.z})\`. The bot will keep checking the ${FARM_EMOJIS.lever} protection lever and start automatically as soon as it is OFF.`,
    color: started ? 65280 : 16776960,
    timestamp: new Date()
  };
}

async function persistObsidianMined() {
  if (!pool) {
    return;
  }

  let client;
  try {
    client = await pool.connect();
    await client.query('BEGIN');
    const result = await client.query(`
      UPDATE obsidian_farm_state
      SET session_mined = session_mined + 1,
          total_mined = total_mined + 1,
          updated_at = NOW()
      WHERE id = 1
      RETURNING session_mined, total_mined, desired_enabled, session_started_at
    `);
    await client.query(`
      INSERT INTO obsidian_farm_daily (farm_date, mined)
      VALUES ((NOW() AT TIME ZONE 'Europe/Kyiv')::date, 1)
      ON CONFLICT (farm_date)
      DO UPDATE SET mined = obsidian_farm_daily.mined + 1,
                    updated_at = NOW()
    `);
    await client.query(`
      INSERT INTO obsidian_farm_hourly (bucket, mined)
      VALUES (date_trunc('hour', NOW()), 1)
      ON CONFLICT (bucket)
      DO UPDATE SET mined = obsidian_farm_hourly.mined + 1,
                    updated_at = NOW()
    `);
    await client.query('COMMIT');
    if (result.rows[0]) {
      obsidianStats.desiredEnabled = Boolean(result.rows[0].desired_enabled);
      obsidianStats.sessionStartedAt = result.rows[0].session_started_at
        ? new Date(result.rows[0].session_started_at)
        : obsidianStats.sessionStartedAt;
    }
  } catch (err) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    console.error('[DB] Failed to persist obsidian mined count:', err.message);
  } finally {
    if (client) client.release();
  }
}

function recordObsidianMined() {
  // Update displayed counters immediately and serialize persistence in the
  // background so PostgreSQL latency never delays the next farming cycle.
  obsidianStats.sessionMined++;
  obsidianStats.totalMined++;
  obsidianStatsWriteQueue = obsidianStatsWriteQueue
    .then(() => persistObsidianMined())
    .catch(err => {
      console.error('[DB] Obsidian stats queue failed:', err.message);
    });
}

function recordPickaxeRetired({ blocksMined = 0, countInAverage = false }) {
  if (!countInAverage) return;
  const completedBlocks = Math.max(0, Number(blocksMined) || 0);
  obsidianStats.retiredPickaxes++;
  obsidianStats.retiredPickaxeBlocks += completedBlocks;
  if (!pool) return;

  obsidianStatsWriteQueue = obsidianStatsWriteQueue
    .then(() => pool.query(`
      UPDATE obsidian_farm_state
      SET retired_pickaxes = retired_pickaxes + 1,
          retired_pickaxe_blocks = retired_pickaxe_blocks + $1,
          updated_at = NOW()
      WHERE id = 1
    `, [completedBlocks]))
    .catch(err => {
      console.error('[DB] Failed to persist retired pickaxe statistics:', err.message);
    });
}

async function getObsidianDailyStats(days = 7) {
  if (!pool) return [];
  try {
    const result = await pool.query(`
      WITH dates AS (
        SELECT generate_series(
          (NOW() AT TIME ZONE 'Europe/Kyiv')::date - ($1::int - 1),
          (NOW() AT TIME ZONE 'Europe/Kyiv')::date,
          INTERVAL '1 day'
        )::date AS farm_date
      )
      SELECT TO_CHAR(dates.farm_date, 'YYYY-MM-DD') AS farm_date,
             COALESCE(stats.mined, 0)::BIGINT AS mined
      FROM dates
      LEFT JOIN obsidian_farm_daily stats USING (farm_date)
      ORDER BY dates.farm_date DESC
    `, [days]);
    return result.rows.map(row => ({
      date: row.farm_date,
      mined: Number(row.mined) || 0
    }));
  } catch (err) {
    console.error('[DB] Failed to load daily obsidian statistics:', err.message);
    return [];
  }
}

function formatCompactCount(value) {
  const count = Math.max(0, Number(value) || 0);
  if (count < 1000) return String(Math.floor(count));
  if (count < 1_000_000) {
    const thousands = count / 1000;
    return `${thousands >= 10 ? Math.floor(thousands) : Math.floor(thousands * 10) / 10}k`;
  }
  const millions = count / 1_000_000;
  return `${millions >= 10 ? Math.floor(millions) : Math.floor(millions * 10) / 10}m`;
}

function formatDurationShort(milliseconds) {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m ${seconds}s`;
}

function formatFoodSupply(food = {}) {
  const entries = Object.entries(food);
  return entries.length > 0
    ? entries.map(([name, count]) => {
        const emoji = FOOD_EMOJIS[name];
        return emoji
          ? `${emoji} x${count}`
          : `${name.replaceAll('_', ' ')} x${count}`;
      }).join(', ')
    : 'None';
}

function formatPickaxeSupply(pickaxes = []) {
  if (pickaxes.length === 0) return 'None';
  const groups = new Map();
  for (const pickaxe of pickaxes) {
    const key = `${pickaxe.name}:${pickaxe.usable ? 'usable' : 'low'}`;
    const group = groups.get(key) || {
      name: pickaxe.name,
      usable: pickaxe.usable,
      count: 0,
      min: 100,
      max: 0
    };
    group.count++;
    group.min = Math.min(group.min, pickaxe.remainingPercent);
    group.max = Math.max(group.max, pickaxe.remainingPercent);
    groups.set(key, group);
  }

  return [...groups.values()].map(group => {
    const durability = Math.abs(group.max - group.min) < 0.05
      ? `${group.max.toFixed(1)}%`
      : `${group.min.toFixed(1)}-${group.max.toFixed(1)}%`;
    const emoji = group.name === 'diamond_pickaxe'
      ? FARM_EMOJIS.diamondPickaxe
      : FARM_EMOJIS.netheritePickaxe;
    return `${emoji} x${group.count} (${durability})`;
  }).join('\n');
}

function getItemEmoji(name) {
  if (ITEM_EMOJIS[name]) return ITEM_EMOJIS[name];
  if (String(name).endsWith('_shulker_box')) return FARM_EMOJIS.shulkerClosed;
  return null;
}

function formatAllItems(items = [], maxLength = 1000) {
  if (!Array.isArray(items) || items.length === 0) return 'Empty';

  const groups = new Map();
  for (const item of items) {
    const hasDurability = Number.isFinite(item.remainingPercent);
    const durabilityKey = hasDurability ? Number(item.remainingPercent).toFixed(1) : '';
    const lowKey = item.usable === false ? 'low' : '';
    const key = `${item.name}:${durabilityKey}:${lowKey}`;
    const group = groups.get(key) || {
      name: item.name,
      count: 0,
      remainingPercent: hasDurability ? Number(item.remainingPercent) : null,
      usable: item.usable
    };
    group.count += Number(item.count) || 0;
    groups.set(key, group);
  }

  const lines = [...groups.values()].map(group => {
    const emoji = getItemEmoji(group.name);
    const label = emoji || group.name.replaceAll('_', ' ');
    const durability = group.remainingPercent == null
      ? ''
      : ` (${group.remainingPercent.toFixed(1)}%)`;
    return `${label} x${group.count}${durability}`;
  });

  const visible = [];
  let length = 0;
  for (const line of lines) {
    const addedLength = line.length + (visible.length > 0 ? 1 : 0);
    if (length + addedLength > maxLength - 30) {
      visible.push(`…and ${lines.length - visible.length} more`);
      break;
    }
    visible.push(line);
    length += addedLength;
  }
  return visible.join('\n');
}

async function buildObsidianStatsEmbed(cachedSupplies = null) {
  const effectiveSupplies = cachedSupplies || latestObsidianStatsSupplies;
  const [farmStatus, dailyStats] = await Promise.all([
    farm.getDetailedStatus(bot, {
      inspectBarrel: false,
      barrel: effectiveSupplies?.barrel || null,
      barrelError: effectiveSupplies?.barrelError || null
    }),
    getObsidianDailyStats(7)
  ]);
  await rememberObsidianSuppliesForSite(farmStatus.supplies);
  const sessionStartedAt = obsidianStats.sessionStartedAt
    ? new Date(obsidianStats.sessionStartedAt)
    : null;
  const sessionMs = sessionStartedAt ? Date.now() - sessionStartedAt.getTime() : 0;
  const sessionHours = sessionMs / 3_600_000;
  const perHour = sessionHours > 0 ? obsidianStats.sessionMined / sessionHours : 0;
  const perMinute = perHour / 60;
  const blocksPerPickaxe = obsidianStats.retiredPickaxes > 0
    ? obsidianStats.retiredPickaxeBlocks / obsidianStats.retiredPickaxes
    : null;
  const inventory = farmStatus.supplies?.inventory;
  const barrel = farmStatus.supplies?.barrel;
  const barrelObservedAt = effectiveSupplies?.observedAt
    ? new Date(effectiveSupplies.observedAt)
    : null;
  const barrelObservedText = barrelObservedAt && !Number.isNaN(barrelObservedAt.getTime())
    ? `Last opened: <t:${Math.floor(barrelObservedAt.getTime() / 1000)}:R>\n`
    : '';
  const barrelDisplay = barrel
    ? `${barrelObservedText}${formatAllItems(barrel.allItems)}`
    : `Unavailable - ${farmStatus.supplies?.barrelError || 'not found'}`;
  const dailyDisplay = dailyStats.length > 0
    ? dailyStats.map(entry => {
        const [year, month, day] = String(entry.date).split('-');
        const label = `${day}.${month}.${year}`;
        return `\`${label}\` — **${formatCompactCount(entry.mined)}**`;
      }).join('\n')
    : 'No daily data yet';
  const compactDailyDisplay = dailyStats.length > 0
    ? dailyStats.map(entry => {
        const [, month, day] = String(entry.date).split('-');
        return `\`${day}.${month}\` **${formatCompactCount(entry.mined)}**`;
      }).join(' | ')
    : dailyDisplay;

  return {
    title: `${FARM_EMOJIS.obsidian} Obsidian Farm Statistics`,
    color: farmStatus.enabled ? 65280 : 16776960,
    fields: [
      {
        name: `${FARM_EMOJIS.obsidian} Blocks mined`,
        value: `Session: **${formatCompactCount(obsidianStats.sessionMined)}**\nAll time: **${formatCompactCount(obsidianStats.totalMined)}**`,
        inline: true
      },
      {
        name: `${STATUS_EMOJIS.playtime} Session`,
        value: `Duration: **${formatDurationShort(sessionMs)}**\nRate: **${perMinute.toFixed(1)}/min** (${formatCompactCount(Math.round(perHour))}/h)\nPickaxe avg: **${blocksPerPickaxe == null ? 'No data' : `${formatCompactCount(Math.round(blocksPerPickaxe))} blocks`}**`,
        inline: true
      },
      {
        name: `${STATUS_EMOJIS.playtime} Last 7 days`,
        value: compactDailyDisplay,
        inline: false
      },
      {
        name: `${STATUS_EMOJIS.serverPing} Status`,
        value: `Running **${farmStatus.enabled ? 'Yes' : 'No'}** | Auto-resume **${obsidianStats.desiredEnabled ? 'Yes' : 'No'}** | ${FARM_EMOJIS.lavaBucket} Phase **${farmStatus.phase}** | Radius **${farmStatus.config?.maxCauldronDist || 5} blocks**`,
        inline: false
      },
      {
        name: `${FARM_EMOJIS.chest} Inventory`,
        value: formatAllItems(inventory?.allItems),
        inline: false
      },
      {
        name: `${FARM_EMOJIS.barrel} Barrel`,
        value: barrelDisplay,
        inline: false
      }
    ],
    footer: {
      text: 'Stats auto-update; barrel snapshot updates when the bot opens it'
    },
    timestamp: new Date()
  };
}

async function buildDetailedObsidianStatsEmbed(cachedSupplies = null) {
  const farmStatus = await farm.getDetailedStatus(bot, cachedSupplies
    ? {
        inspectBarrel: false,
        barrel: cachedSupplies.barrel || null,
        barrelError: cachedSupplies.barrelError || null
      }
    : {});
  await rememberObsidianSuppliesForSite(farmStatus.supplies);
  const config = farmStatus.config;
  const sessionStartedAt = obsidianStats.sessionStartedAt
    ? new Date(obsidianStats.sessionStartedAt)
    : null;
  const sessionMs = sessionStartedAt ? Date.now() - sessionStartedAt.getTime() : 0;
  const sessionHours = sessionMs / 3_600_000;
  const perHour = sessionHours > 0 ? obsidianStats.sessionMined / sessionHours : 0;
  const inventory = farmStatus.supplies?.inventory;
  const barrel = farmStatus.supplies?.barrel;
  const botPosition = bot?.entity?.position
    ? `${bot.entity.position.x.toFixed(1)}, ${bot.entity.position.y.toFixed(1)}, ${bot.entity.position.z.toFixed(1)}`
    : 'Offline';

  return {
    title: `${FARM_EMOJIS.obsidian} Detailed Obsidian Farm Statistics`,
    color: farmStatus.enabled ? 65280 : 16776960,
    fields: [
      {
        name: `${STATUS_EMOJIS.serverPing} Runtime`,
        value: [
          `Connected: **${farmStatus.connected ? 'Yes' : 'No'}**`,
          `Running: **${farmStatus.enabled ? 'Yes' : 'No'}**`,
          `Auto-resume: **${obsidianStats.desiredEnabled ? 'Yes' : 'No'}**`,
          `Phase: **${farmStatus.phase}**`,
          `Completed cycles: **${farmStatus.cyclesCompleted}**`
        ].join('\n'),
        inline: true
      },
      {
        name: `${FARM_EMOJIS.cauldron} Configuration`,
        value: config
          ? [
              `${FARM_EMOJIS.obsidian} Target: \`${config.x}, ${config.y}, ${config.z}\``,
              `${FARM_EMOJIS.cauldron} Cauldron radius: **${config.maxCauldronDist || 5} blocks**`,
              `Bot position: \`${botPosition}\``
            ].join('\n')
          : 'Not configured',
        inline: true
      },
      {
        name: `${FARM_EMOJIS.obsidian} Session totals`,
        value: [
          `Started: ${sessionStartedAt ? `<t:${Math.floor(sessionStartedAt.getTime() / 1000)}:R>` : '**Not started**'}`,
          `Duration: **${formatDurationShort(sessionMs)}**`,
          `Mined: **${obsidianStats.sessionMined.toLocaleString('en-US')}**`,
          `Rate: **${Math.round(perHour).toLocaleString('en-US')}/h**`,
          `All time: **${obsidianStats.totalMined.toLocaleString('en-US')}**`
        ].join('\n'),
        inline: false
      },
      {
        name: `${FARM_EMOJIS.diamondPickaxe} Pickaxe history`,
        value: [
          `Retired pickaxes: **${obsidianStats.retiredPickaxes}**`,
          `Blocks on retired pickaxes: **${obsidianStats.retiredPickaxeBlocks.toLocaleString('en-US')}**`,
          `Average: **${obsidianStats.retiredPickaxes > 0
            ? Math.round(obsidianStats.retiredPickaxeBlocks / obsidianStats.retiredPickaxes).toLocaleString('en-US')
            : 'No data'}**`
        ].join('\n'),
        inline: false
      },
      {
        name: `${FARM_EMOJIS.chest} Bot inventory`,
        value: formatAllItems(inventory?.allItems),
        inline: false
      },
      {
        name: `${FARM_EMOJIS.barrel} Supply barrel`,
        value: barrel
          ? [
              `Position: \`${barrel.position || 'Unknown'}\``,
              `Distance: **${Number(barrel.distance || 0).toFixed(2)} blocks**`,
              formatAllItems(barrel.allItems, 900)
            ].join('\n')
          : `Unavailable — ${farmStatus.supplies?.barrelError || 'not found'}`,
        inline: false
      },
      {
        name: 'Last retry/error',
        value: farmStatus.lastErrorMessage
          ? `\`${String(farmStatus.lastErrorMessage).slice(0, 950)}\``
          : 'None',
        inline: false
      }
    ],
    footer: {
      text: cachedSupplies
        ? 'Stats auto-update; barrel snapshot updates when the bot opens it'
        : 'Fresh barrel and inventory inspection'
    },
    timestamp: new Date()
  };
}

function createObsidianStatsComponents(view = 'summary') {
  const farmRunning = farm.getStatus().enabled || obsidianStats.desiredEnabled;
  const farmConfig = farm.getStatus().config;
  const cauldronRadius = farmConfig?.maxCauldronDist || 5;
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('ofstats_toggle_farm')
        .setLabel(farmRunning ? 'Stop farm' : 'Start farm')
        .setEmoji(farmRunning ? STATUS_BUTTON_EMOJIS.pause : STATUS_BUTTON_EMOJIS.resume)
        .setStyle(farmRunning ? ButtonStyle.Danger : ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId('ofstats_radius_toggle')
        .setLabel(`Radius: ${cauldronRadius}`)
        .setEmoji(FARM_EMOJIS.cauldron)
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(!farmConfig),
      new ButtonBuilder()
        .setCustomId(view === 'detailed' ? 'ofstats_summary' : 'ofstats_detailed')
        .setLabel(view === 'detailed' ? 'Summary' : 'Detailed')
        .setEmoji(UI_BUTTON_EMOJIS.beacon)
        .setStyle(ButtonStyle.Secondary)
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('ofstats_reset_coordinates')
        .setLabel('Reset coordinates')
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId('ofstats_logs_menu')
        .setLabel('Logs')
        .setEmoji(UI_BUTTON_EMOJIS.commandBlock)
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('admin_panel_back')
        .setLabel('Back')
        .setEmoji(UI_BUTTON_EMOJIS.arrowLeftCurved)
        .setStyle(ButtonStyle.Secondary)
    )
  ];
}

function createObsidianLogsComponents() {
  const loggingEnabled = farm.getDebugLoggingEnabled?.() !== false;
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('ofstats_toggle_debug_logging')
        .setLabel(loggingEnabled ? 'Disable logging' : 'Enable logging')
        .setEmoji(loggingEnabled ? STATUS_BUTTON_EMOJIS.pause : STATUS_BUTTON_EMOJIS.resume)
        .setStyle(loggingEnabled ? ButtonStyle.Danger : ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId('ofstats_download_debug_log')
        .setLabel('Download logs')
        .setEmoji(UI_BUTTON_EMOJIS.commandBlock)
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('ofstats_logs_back')
        .setLabel('Back')
        .setEmoji(UI_BUTTON_EMOJIS.arrowLeftCurved)
        .setStyle(ButtonStyle.Secondary)
    )
  ];
}

function buildObsidianLogsEmbed() {
  const loggingEnabled = farm.getDebugLoggingEnabled?.() !== false;
  return {
    title: `${FARM_EMOJIS.obsidian} Obsidian Farm Logs`,
    color: loggingEnabled ? 65280 : 16776960,
    description: [
      `Debug logging: **${loggingEnabled ? 'Enabled' : 'Disabled'}**`,
      `File: \`${OBSIDIAN_FARM_DEBUG_LOG_FILE}\``
    ].join('\n'),
    footer: { text: 'Download sends the current log file or its latest tail if it is too large' },
    timestamp: new Date()
  };
}

async function readFileTail(filePath, maxBytes) {
  const handle = await fs.promises.open(filePath, 'r');
  try {
    const stat = await handle.stat();
    const length = Math.min(stat.size, maxBytes);
    const buffer = Buffer.alloc(length);
    await handle.read(buffer, 0, length, stat.size - length);
    return {
      buffer,
      originalSize: stat.size,
      truncated: stat.size > length
    };
  } finally {
    await handle.close();
  }
}

function formatBytes(bytes) {
  const value = Number(bytes) || 0;
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  if (value < 1024 * 1024 * 1024) return `${(value / 1024 / 1024).toFixed(1)} MB`;
  return `${(value / 1024 / 1024 / 1024).toFixed(1)} GB`;
}

async function sendObsidianDebugLog(interaction) {
  let stat;
  try {
    stat = await fs.promises.stat(OBSIDIAN_FARM_DEBUG_LOG_FILE);
  } catch (err) {
    if (err.code === 'ENOENT') {
      await interaction.editReply({
        content:
          'Obsidian farm debug log has not been created yet.\n' +
          `Expected path inside the bot container: \`${OBSIDIAN_FARM_DEBUG_LOG_FILE}\``
      });
      return;
    }
    throw err;
  }

  if (!stat.isFile()) {
    await interaction.editReply({
      content: `Debug log path exists but is not a file: \`${OBSIDIAN_FARM_DEBUG_LOG_FILE}\``
    });
    return;
  }

  const date = new Date().toISOString().replace(/[:.]/g, '-');
  if (stat.size <= DISCORD_ATTACHMENT_SAFE_LIMIT_BYTES) {
    await interaction.editReply({
      content: `Obsidian farm debug log (${formatBytes(stat.size)}).`,
      files: [{
        attachment: OBSIDIAN_FARM_DEBUG_LOG_FILE,
        name: `obsidian_farm_debug_${date}.log`
      }]
    });
    return;
  }

  const tail = await readFileTail(
    OBSIDIAN_FARM_DEBUG_LOG_FILE,
    DISCORD_ATTACHMENT_SAFE_LIMIT_BYTES - 1024
  );
  const notice = Buffer.from(
    `Log was too large for Discord (${formatBytes(tail.originalSize)}). ` +
    `This file contains the latest ${formatBytes(tail.buffer.length)}.\n\n`,
    'utf8'
  );
  await interaction.editReply({
    content:
      `Obsidian farm debug log is too large for one Discord attachment ` +
      `(${formatBytes(tail.originalSize)}). Sending the latest entries instead.`,
    files: [{
      attachment: Buffer.concat([notice, tail.buffer]),
      name: `obsidian_farm_debug_tail_${date}.log`
    }]
  });
}

function saveObsidianStatsUpdaters() {
  try {
    fs.mkdirSync(path.dirname(OBSIDIAN_STATS_MESSAGES_FILE), { recursive: true });
    const entries = [...obsidianStatsUpdaters.entries()].map(([channelId, updater]) => ({
      channelId,
      messageId: updater.messageId,
      supplies: updater.supplies || null,
      view: updater.view || 'summary',
      updatedAt: new Date().toISOString()
    }));
    fs.writeFileSync(OBSIDIAN_STATS_MESSAGES_FILE, JSON.stringify({
      latestSupplies: latestObsidianStatsSupplies || null,
      messages: entries
    }, null, 2));
  } catch (err) {
    console.error('[Obsidian Stats] Failed to save updater state:', err.message);
  }
}

function loadObsidianStatsUpdaterRecords() {
  try {
    const raw = fs.readFileSync(OBSIDIAN_STATS_MESSAGES_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    latestObsidianStatsSupplies = parsed?.latestSupplies || latestObsidianStatsSupplies;
    return (Array.isArray(parsed) ? parsed : parsed?.messages || [])
      .filter(record => record?.channelId && record?.messageId);
  } catch (err) {
    if (err.code !== 'ENOENT') {
      console.error('[Obsidian Stats] Failed to load updater state:', err.message);
    }
    return [];
  }
}

function stopObsidianStatsUpdater(channelId) {
  const updater = obsidianStatsUpdaters.get(channelId);
  if (!updater) return;
  if (updater.timer) clearTimeout(updater.timer);
  obsidianStatsUpdaters.delete(channelId);
  saveObsidianStatsUpdaters();
}

function stopAdminPanelObsidianStatsUpdater() {
  if (!adminPanelMessage?.channelId || !adminPanelMessage?.id) return;
  const updater = obsidianStatsUpdaters.get(adminPanelMessage.channelId);
  if (updater?.messageId === adminPanelMessage.id) {
    stopObsidianStatsUpdater(adminPanelMessage.channelId);
  }
}

function mergeObsidianSupplies(previous, next) {
  if (!next) return previous;
  const nextHasBarrelItems = Array.isArray(next.barrel?.allItems);
  return {
    inventory: next.inventory || previous?.inventory || null,
    barrel: nextHasBarrelItems ? next.barrel : previous?.barrel || next.barrel || null,
    barrelError: nextHasBarrelItems
      ? null
      : next.barrelError || previous?.barrelError || null,
    observedAt: next.observedAt || previous?.observedAt || null
  };
}

function withObsidianStatsTimeout(promise, timeoutMs = 20_000) {
  let timeout;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timeout = setTimeout(
        () => reject(new Error(`Obsidian statistics update timed out after ${timeoutMs}ms`)),
        timeoutMs
      );
    })
  ]).finally(() => clearTimeout(timeout));
}

async function buildObsidianStatsUpdaterEmbed(updater) {
  return updater.view === 'detailed'
    ? buildDetailedObsidianStatsEmbed(updater.supplies || latestObsidianStatsSupplies)
    : buildObsidianStatsEmbed(updater.supplies);
}

async function updateObsidianStatsUpdater(channelId, updater) {
  if (updater.updating || obsidianStatsUpdaters.get(channelId) !== updater) return;
  updater.updating = true;
  try {
    await withObsidianStatsTimeout((async () => {
      const channel = await discordClient.channels.fetch(channelId);
      if (!channel?.messages) throw new Error('Statistics channel is unavailable');
      const message = await channel.messages.fetch(updater.messageId);
      await message.edit({
        embeds: [await buildObsidianStatsUpdaterEmbed(updater)],
        components: createObsidianStatsComponents(updater.view)
      });
    })());
    updater.consecutiveFailures = 0;
  } catch (err) {
    updater.consecutiveFailures = (updater.consecutiveFailures || 0) + 1;
    if (err.code === 10008) {
      stopObsidianStatsUpdater(channelId);
      return;
    }
    if ((err.code === 50001 || err.code === 50013) && updater.consecutiveFailures >= 20) {
      stopObsidianStatsUpdater(channelId);
      return;
    }
    console.error(
      `[Obsidian Stats] Update failed (${updater.consecutiveFailures}), retrying later:`,
      err.message
    );
  } finally {
    updater.updating = false;
    if (updater.pendingRefresh && obsidianStatsUpdaters.get(channelId) === updater) {
      updater.pendingRefresh = false;
      updater.immediateRefresh = true;
      if (!updater.inScheduledTick) {
        updater.immediateRefresh = false;
        scheduleObsidianStatsUpdater(channelId, updater, 0);
      }
    }
  }
}

function scheduleObsidianStatsUpdater(channelId, updater, delayMs = OBSIDIAN_STATS_UPDATE_INTERVAL_MS) {
  if (obsidianStatsUpdaters.get(channelId) !== updater) return;
  if (updater.timer) clearTimeout(updater.timer);
  updater.timer = setTimeout(async () => {
    if (obsidianStatsUpdaters.get(channelId) !== updater) return;
    updater.inScheduledTick = true;
    try {
      await updateObsidianStatsUpdater(channelId, updater);
    } catch (err) {
      console.error('[Obsidian Stats] Scheduled update crashed:', err.message);
    } finally {
      updater.inScheduledTick = false;
      if (obsidianStatsUpdaters.get(channelId) === updater) {
        const nextDelay = updater.immediateRefresh ? 0 : OBSIDIAN_STATS_UPDATE_INTERVAL_MS;
        updater.immediateRefresh = false;
        scheduleObsidianStatsUpdater(channelId, updater, nextDelay);
      }
    }
  }, delayMs);
  updater.timer.unref?.();
}

async function refreshObsidianStatsUpdaters() {
  await Promise.all([...obsidianStatsUpdaters.entries()].map(
    ([channelId, updater]) => updateObsidianStatsUpdater(channelId, updater)
  ));
}

async function updateObsidianStatsSupplies(supplies) {
  latestObsidianStatsSupplies = mergeObsidianSupplies(latestObsidianStatsSupplies, supplies);
  await saveObsidianSupplySnapshot(latestObsidianStatsSupplies);
  await Promise.all([...obsidianStatsUpdaters.entries()].map(async ([channelId, updater]) => {
    updater.supplies = mergeObsidianSupplies(updater.supplies, latestObsidianStatsSupplies);
    if (updater.updating) {
      updater.pendingRefresh = true;
      return;
    }
    await updateObsidianStatsUpdater(channelId, updater);
  }));
  saveObsidianStatsUpdaters();
}

async function rememberObsidianSuppliesForSite(supplies) {
  if (!supplies) return;
  latestObsidianStatsSupplies = mergeObsidianSupplies(latestObsidianStatsSupplies, supplies);
  await saveObsidianSupplySnapshot(latestObsidianStatsSupplies);
}

async function refreshObsidianSupplySnapshotForSite() {
  if (!bot?.entity) return;
  try {
    const farmStatus = await farm.getDetailedStatus(bot, {
      inspectBarrel: false,
      barrel: latestObsidianStatsSupplies?.barrel || null,
      barrelError: latestObsidianStatsSupplies?.barrelError || null
    });
    await rememberObsidianSuppliesForSite(farmStatus.supplies);
  } catch (err) {
    console.error('[Obsidian Stats] Failed to refresh site supply snapshot:', err.message);
  }
}

async function saveObsidianSupplySnapshot(supplies) {
  if (!pool || !supplies) return;
  try {
    await pool.query(`
      INSERT INTO obsidian_farm_supply_snapshot (id, supplies, observed_at, updated_at)
      VALUES (1, $1::jsonb, $2, NOW())
      ON CONFLICT (id)
      DO UPDATE SET supplies = EXCLUDED.supplies,
                    observed_at = EXCLUDED.observed_at,
                    updated_at = NOW()
    `, [
      JSON.stringify(supplies),
      supplies.observedAt ? new Date(supplies.observedAt) : null
    ]);
  } catch (err) {
    console.error('[DB] Failed to save obsidian supply snapshot:', err.message);
  }
}

function startObsidianSupplySnapshotWriter() {
  if (obsidianSupplySnapshotInterval) {
    clearInterval(obsidianSupplySnapshotInterval);
  }

  refreshObsidianSupplySnapshotForSite().catch(() => {});
  obsidianSupplySnapshotInterval = setInterval(() => {
    refreshObsidianSupplySnapshotForSite().catch(() => {});
  }, 10_000);
  obsidianSupplySnapshotInterval.unref?.();
}

function startObsidianStatsUpdater(message, supplies, { view = 'summary' } = {}) {
  const channelId = message.channelId;
  stopObsidianStatsUpdater(channelId);

  const updater = {
    messageId: message.id,
    supplies,
    view,
    updating: false,
    timer: null,
    consecutiveFailures: 0,
    pendingRefresh: false,
    immediateRefresh: false,
    inScheduledTick: false
  };

  obsidianStatsUpdaters.set(channelId, updater);
  saveObsidianStatsUpdaters();
  scheduleObsidianStatsUpdater(channelId, updater);
}

async function openObsidianStatsPanel(interaction, { updateMessage = false, deferredUpdate = false } = {}) {
  const existingUpdater = obsidianStatsUpdaters.get(interaction.channelId);
  const supplies = existingUpdater?.supplies || latestObsidianStatsSupplies || {
    barrel: null,
    barrelError: 'Waiting for bot to open the supply barrel'
  };
  const payload = {
    embeds: [await buildObsidianStatsEmbed(supplies)],
    components: createObsidianStatsComponents()
  };

  if (updateMessage) {
    if (deferredUpdate) {
      await interaction.message.edit(payload);
    } else {
      await interaction.update(payload);
    }
  } else {
    await interaction.editReply(payload);
  }

  const statsMessage = updateMessage
    ? interaction.message
    : await interaction.fetchReply();
  if (adminPanelMessage?.id === statsMessage.id) {
    adminPanelView = 'obsidian';
  }
  startObsidianStatsUpdater(statsMessage, supplies);
}

async function restoreObsidianStatsUpdaters() {
  const records = loadObsidianStatsUpdaterRecords();
  if (records.length === 0) return;

  for (const record of records) {
    try {
      if (
        adminPanelMessage?.id === record.messageId &&
        adminPanelMessage?.channelId === record.channelId
      ) {
        continue;
      }
      const channel = await discordClient.channels.fetch(record.channelId);
      if (!channel?.messages) throw new Error('Statistics channel is unavailable');
      const message = await channel.messages.fetch(record.messageId);
      startObsidianStatsUpdater(message, record.supplies || {
        barrel: null,
        barrelError: 'Waiting for bot to open the supply barrel'
      }, { view: record.view || 'summary' });
      const updater = obsidianStatsUpdaters.get(record.channelId);
      if (updater) {
        await updateObsidianStatsUpdater(record.channelId, updater);
      }
    } catch (err) {
      console.error('[Obsidian Stats] Could not restore updater:', err.message);
      stopObsidianStatsUpdater(record.channelId);
    }
  }
  saveObsidianStatsUpdaters();
}

function ensureObsidianStatsWatchdog() {
  if (obsidianStatsWatchdogInterval) return;

  obsidianStatsWatchdogInterval = setInterval(async () => {
    try {
      for (const [channelId, updater] of obsidianStatsUpdaters.entries()) {
        if (!updater.timer || updater.timer._destroyed) {
          scheduleObsidianStatsUpdater(channelId, updater, 0);
        }
      }
      await restoreObsidianStatsUpdaters();
    } catch (err) {
      console.error('[Obsidian Stats] Watchdog failed:', err.message);
    }
  }, OBSIDIAN_STATS_WATCHDOG_INTERVAL_MS);
  obsidianStatsWatchdogInterval.unref?.();
}

async function registerApplicationCommands() {
  if (!discordClient.application) return;
  const contexts = [InteractionContextType.Guild, InteractionContextType.BotDM];
  const builders = [
    new SlashCommandBuilder()
      .setName('ofstats')
      .setDescription('Show detailed obsidian farm statistics')
      .setContexts(...contexts),
    new SlashCommandBuilder()
      .setName('clear')
      .setDescription('Clear messages in the current dialog')
      .setContexts(...contexts),
    new SlashCommandBuilder()
      .setName('panel')
      .setDescription('Open or refresh the owner admin panel in DM')
      .setContexts(...contexts),
    new SlashCommandBuilder()
      .setName('child')
      .setDescription('Control Growing Child AI')
      .setContexts(...contexts)
      .addSubcommand(command => command
        .setName('say')
        .setDescription('Ask the child to say a phrase'))
      .addSubcommand(command => command
        .setName('status')
        .setDescription('Show learning progress'))
      .addSubcommand(command => command
        .setName('vocabulary')
        .setDescription('Export the complete learned vocabulary as CSV'))
      .addSubcommand(command => command
        .setName('reset')
        .setDescription('Reset all learning after confirmation')),
    new SlashCommandBuilder()
      .setName('playtime')
      .setDescription('Set a Minecraft player playtime value')
      .setContexts(...contexts)
      .addStringOption(option => option
        .setName('player')
        .setDescription('Minecraft username')
        .setRequired(true)
        .setMinLength(1)
        .setMaxLength(16))
      .addStringOption(option => option
        .setName('time')
        .setDescription('Example: 192d 23h 32m')
        .setRequired(true)
        .setMaxLength(100))
  ];
  const globalDefinitions = builders.map(builder => builder.toJSON());
  const registeredGlobal = await discordClient.application.commands.set(globalDefinitions);
  console.log(
    `[Discord] Registered global commands: ${[...registeredGlobal.values()].map(command => `/${command.name}`).join(', ')}`
  );

  // Guild commands update immediately while global commands remain available in bot DMs.
  const guildDefinitions = globalDefinitions.map(definition => {
    const copy = { ...definition };
    delete copy.contexts;
    delete copy.integration_types;
    return copy;
  });
  for (const guild of discordClient.guilds.cache.values()) {
    const registeredGuild = await guild.commands.set(guildDefinitions);
    console.log(
      `[Discord] Registered commands in ${guild.name}: ${[...registeredGuild.values()].map(command => `/${command.name}`).join(', ')}`
    );
  }
}

async function clearCurrentDialog(channel, excludedIds = new Set()) {
  if (!channel?.isTextBased?.() || !channel.messages) return 0;

  let deleted = 0;
  let before;
  for (let page = 0; page < 10; page++) {
    const messages = await channel.messages.fetch({ limit: 100, ...(before ? { before } : {}) });
    if (messages.size === 0) break;
    before = messages.last().id;

    const deletable = messages.filter(message => {
      if (excludedIds.has(message.id)) return false;
      if (!message.deletable) return false;
      if (channel.isDMBased?.()) return message.author.id === discordClient.user.id;
      return true;
    });

    for (const message of deletable.values()) {
      try {
        await message.delete();
        deleted++;
      } catch (_) {}
    }

    if (messages.size < 100) break;
  }

  return deleted;
}

farm.configureRuntime({
  onMined: recordObsidianMined,
  onPickaxeRetired: recordPickaxeRetired,
  onSuppliesChanged: updateObsidianStatsSupplies,
  onFatalStop: async (err) => {
    await setProtectionLeverState(true);
    await setObsidianFarmDesiredEnabled(false);
    await sendOwnerDM(
      'Obsidian farm stopped',
      `Reason: ${err.message}\nSession: ${formatCompactCount(obsidianStats.sessionMined)}\nAll time: ${formatCompactCount(obsidianStats.totalMined)}`,
      16711680
    );
  }
});

function resolveRelayedChatUsername(username, jsonMessage) {
  if (!jsonMessage) return username;

  const rawMessage = typeof jsonMessage.toString === 'function'
    ? jsonMessage.toString()
    : chatComponentToString(jsonMessage);
  const cleanRawMessage = normalizeOutboundChat(rawMessage);
  const relayMatch = cleanRawMessage.match(/^<([A-Za-z0-9_]{1,16})>\s*>\s*[A-Za-z0-9_]{1,16}\s*:/);

  if (!relayMatch) return username;
  debugLog(`[Chat] Corrected relayed sender ${username} -> ${relayMatch[1]} from: "${cleanRawMessage}"`);
  return relayMatch[1];
}

function resolvePublicChatEnvelope(username, message, jsonMessage) {
  const fallback = {
    username: resolveRelayedChatUsername(username, jsonMessage),
    message: cleanMinecraftChatMessage(message)
  };

  const targetKey = `target:${String(username || '').toLowerCase()}`;
  const playtimeLookup = pendingPlaytimeLookups.get(targetKey);
  const joinDateLookup = pendingJoinDateLookups.get(targetKey);
  const now = Date.now();
  const expectedLookup = [playtimeLookup, joinDateLookup].find(lookup =>
    lookup && now - lookup.timestamp <= 20_000
  );
  const isExpectedResult = Boolean(
    (playtimeLookup && now - playtimeLookup.timestamp <= 20_000 && parsePlaytime(fallback.message) != null) ||
    (joinDateLookup && now - joinDateLookup.timestamp <= 20_000 && parseObservedJoinDate(fallback.message))
  );
  if (expectedLookup && isExpectedResult) {
    return {
      username: COMMAND_RESPONSE_DISPLAY_USERNAME,
      message: `> ${expectedLookup.targetUsername}: ${fallback.message}`
    };
  }

  if (!jsonMessage) return fallback;

  const candidates = [
    typeof jsonMessage.toString === 'function' ? jsonMessage.toString() : '',
    chatComponentToString(jsonMessage)
  ];
  for (const candidate of candidates) {
    const parsed = parseRawPublicChatLine(candidate);
    if (parsed && COMMAND_RESPONSE_BOT_USERNAMES.has(parsed.username.toLowerCase())) {
      return parsed;
    }
  }
  return fallback;
}

function normalizeStatusReason(reason) {
  return String(reason || '').replace(/\s+/g, ' ').trim();
}

function setDisconnectReason(reason) {
  const cleanReason = normalizeStatusReason(reason);
  lastDisconnectReason = cleanReason || null;
  if (cleanReason) lastOfflineReason = cleanReason;
}

function buildDisconnectReason(reason, fallback = 'Connection lost') {
  const cleanReason = normalizeStatusReason(reason);

  if (!cleanReason) return fallback;
  if (cleanReason === 'Restart command') {
    return lastCommandUser ? `Restart requested by ${lastCommandUser}` : 'Restart requested';
  }
  if (cleanReason === 'Pause until resume') {
    return lastCommandUser ? `Paused by ${lastCommandUser}` : 'Paused until resume';
  }

  const pauseMatch = cleanReason.match(/^Pause(?:d)?\s+(\d+)m$/i);
  if (pauseMatch) {
    return lastCommandUser ? `Paused for ${pauseMatch[1]}m by ${lastCommandUser}` : `Paused for ${pauseMatch[1]}m`;
  }

  if (cleanReason === 'socketClosed') {
    return fallback;
  }

  return cleanReason;
}

var bot;
let shouldReconnect = true;
let reconnectTimeRemaining = 0;
let reconnectTimestamp = 0;
let lastDisconnectReason = null;
let lastOfflineReason = null;
let reconnectCountdownInterval = null;
let reconnectTimer = null;
let resumeTimer = null;
let securityDisconnectTriggered = false;

let foodMonitorInterval = null;
let playerScannerInterval = null;
let restartProtectionInterval = null;
let obsidianFarmWatchdogInterval = null;
let obsidianSupplySnapshotInterval = null;
let lastEnemyMentionAt = 0;
let restartProtectionDateKey = null;
let leverOperation = Promise.resolve();
let protectionLeverPosition = null;
let obsidianFarmResumeBot = null;

function clearReconnectTimer() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  reconnectTimestamp = 0;
}

function clearResumeTimer() {
  if (resumeTimer) {
    clearTimeout(resumeTimer);
    resumeTimer = null;
  }
}

function scheduleReconnect(delayMs, logMessage) {
  clearReconnectTimer();
  reconnectTimestamp = Date.now() + delayMs;
  if (logMessage) console.log(logMessage);

  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    reconnectTimestamp = 0;
    if (!shouldReconnect || bot) return;
    createBot();
  }, delayMs);
}

function scheduleResume(delayMs, logMessage) {
  clearReconnectTimer();
  clearResumeTimer();
  reconnectTimestamp = Date.now() + delayMs;
  if (logMessage) console.log(logMessage);

  resumeTimer = setTimeout(() => {
    resumeTimer = null;
    reconnectTimestamp = 0;
    shouldReconnect = true;
    if (!bot) createBot();
  }, delayMs);
}

function resumeBot() {
  shouldReconnect = true;
  clearReconnectTimer();
  clearResumeTimer();
  if (!bot) createBot();
}

function safelyCloseMinecraftBot(targetBot, reason = 'Connection closed') {
  if (!targetBot) return;
  try {
    if (typeof targetBot.quit === 'function' && targetBot.entity) {
      targetBot.quit(reason);
      return;
    }
    if (typeof targetBot.end === 'function') {
      targetBot.end(reason);
      return;
    }
    targetBot._client?.end?.(reason);
  } catch (err) {
    console.log(`[Bot] Failed to close connection cleanly: ${err.message}`);
    try { targetBot._client?.socket?.destroy?.(); } catch (_) {}
  }
}

function pauseMinecraftConnection(reason) {
  const currentBot = bot;
  bot = null;
  clearIntervals();
  followFeature.stop();
  farm.suspend();
  safelyCloseMinecraftBot(currentBot, reason);
  updateStatusMessage().catch(() => {});
}

function disconnectForNonWhitelistedPlayer(entity, distance) {
  if (securityDisconnectTriggered) return;
  securityDisconnectTriggered = true;

  const playerName = entity?.username || 'Unknown';
  const roundedDistance = Math.round(Number(distance) || 0);
  const reason = `Enemy detected: ${playerName}`;
  const currentBot = bot;

  console.log(`[Bot] ${reason} (${roundedDistance} blocks). Disconnecting with auto-reconnect disabled.`);
  shouldReconnect = false;
  clearReconnectTimer();
  clearResumeTimer();
  followFeature.stop();
  farm.suspend();
  setDisconnectReason(`${reason} (${roundedDistance} blocks)`);

  if (Date.now() - lastEnemyMentionAt > 15000) {
    lastEnemyMentionAt = Date.now();
    sendDiscordStatusMention({
      playerName,
      distance: roundedDistance,
      serverAction: 'Bot left the server and auto-reconnect was disabled.'
    });
  }

  if (currentBot) {
    bot = null;
    clearIntervals();
    safelyCloseMinecraftBot(currentBot, reason);
  }

  writeBotStatusSnapshot().catch(() => {});
  updateStatusMessage().catch(() => {});
}

function getKyivDateParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Kyiv',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return {
    dateKey: `${values.year}-${values.month}-${values.day}`,
    hour: Number(values.hour),
    minute: Number(values.minute)
  };
}

function findProtectionLever(currentBot) {
  if (!currentBot?.entity) return null;

  if (protectionLeverPosition) {
    const cached = currentBot.blockAt(protectionLeverPosition);
    const cachedDistance = currentBot.entity.position.distanceTo(
      protectionLeverPosition.offset(0.5, 0.5, 0.5)
    );
    if (cached?.name === 'lever' && cachedDistance <= 4.5) return cached;
    protectionLeverPosition = null;
  }

  // Do not depend on findBlocks immediately after spawn: its palette search can
  // briefly miss an otherwise loaded nearby block. Read the local cube directly.
  const base = currentBot.entity.position.floored();
  const origin = currentBot.entity.position.offset(0, 0.5, 0);
  const candidates = [];
  for (let dx = -4; dx <= 4; dx++) {
    for (let dy = -3; dy <= 3; dy++) {
      for (let dz = -4; dz <= 4; dz++) {
        const position = base.offset(dx, dy, dz);
        const block = currentBot.blockAt(position);
        if (block?.name !== 'lever') continue;
        const distance = origin.distanceTo(position.offset(0.5, 0.5, 0.5));
        if (distance <= 4.5) candidates.push({ block, distance });
      }
    }
  }
  const nearest = candidates.sort((a, b) => a.distance - b.distance)[0];

  if (!nearest) return null;
  protectionLeverPosition = nearest.block.position.clone();
  return nearest.block;
}

function isLeverPowered(block) {
  const powered = block?.getProperties?.().powered;
  return powered === true || powered === 'true';
}

async function setProtectionLeverState(powered) {
  const operation = async () => {
    const currentBot = bot;
    if (!currentBot?.entity) return false;
    const lever = findProtectionLever(currentBot);
    if (!lever) {
      console.log('[Obsidian] Protection lever is not loaded or is out of interaction range.');
      return false;
    }

    if (typeof currentBot.clearControlStates === 'function') {
      currentBot.clearControlStates();
    }
    currentBot.pathfinder?.stop();

    const leverPosition = lever.position.clone();
    const initialState = isLeverPowered(lever);
    console.log(
      `[Obsidian] Protection lever at ${leverPosition} is ${initialState ? 'ON' : 'OFF'}; ` +
      `required state is ${powered ? 'ON' : 'OFF'}.`
    );
    if (initialState === powered) return true;

    // Never right-click the lever while a lava/water bucket is selected.
    if (currentBot.heldItem?.name?.includes('bucket')) {
      try {
        const safeHandItem = currentBot.inventory.items().find(
          item => !item.name.includes('bucket')
        );
        if (safeHandItem) {
          await currentBot.equip(safeHandItem, 'hand');
        } else {
          await currentBot.unequip('hand');
        }
      } catch (err) {
        console.log(`[Obsidian] Could not select a safe item before lever use: ${err.message}`);
        return false;
      }
    }

    for (let attempt = 1; attempt <= 3; attempt++) {
      const currentLever = currentBot.blockAt(leverPosition);
      if (currentLever?.name !== 'lever') return false;
      if (isLeverPowered(currentLever) === powered) return true;

      try {
        // Use Mineflayer's ordinary block interaction, exactly like the
        // successful barrel interaction used during farm preparation.
        await currentBot.activateBlock(currentLever);
        console.log(`[Obsidian] Activated protection lever (attempt ${attempt}/3).`);
      } catch (err) {
        console.log(`[Obsidian] Lever click ${attempt}/3 failed: ${err.message}`);
        await new Promise(resolve => setTimeout(resolve, 100));
        continue;
      }

      const deadline = Date.now() + 2_000;
      while (Date.now() < deadline) {
        const updated = currentBot.blockAt(leverPosition);
        if (updated?.name === 'lever' && isLeverPowered(updated) === powered) {
          console.log(`[Obsidian] Protection lever switched ${powered ? 'ON' : 'OFF'}.`);
          return true;
        }
        await new Promise(resolve => setTimeout(resolve, 40));
      }

      console.log(`[Obsidian] Lever click ${attempt}/3 was not confirmed by the server.`);
    }
    return false;
  };

  leverOperation = leverOperation.then(operation, operation);
  return leverOperation;
}

async function ensureObsidianFarmRunning(createdBot, { freshSession = false } = {}) {
  if (obsidianFarmResumeBot === createdBot) return;
  if (!farm.getStatus().config) {
    console.log('[Obsidian] Auto-resume skipped: farm coordinates are not configured.');
    return;
  }
  obsidianFarmResumeBot = createdBot;
  let attempts = 0;
  let warningSent = false;

  try {
    // The spawn event fires before all nearby chunks, inventory slots and
    // interactions are necessarily synchronized. The manual stats Refresh
    // succeeds because its barrel inspection naturally completes that setup.
    // Run the same safe preparation before touching the protection lever.
    try {
      await createdBot.waitForChunksToLoad();
    } catch (err) {
      console.log(`[Obsidian] Chunk readiness wait ended early: ${err.message}`);
    }

    if (
      bot !== createdBot ||
      !createdBot?.entity ||
      !obsidianStats.desiredEnabled
    ) {
      return;
    }

    await new Promise(resolve => setTimeout(resolve, 1_000));
    const reconnectSupplies = await farm.inspectSupplies(createdBot);
    if (reconnectSupplies?.barrelError) {
      console.log(`[Obsidian] Reconnect barrel preparation: ${reconnectSupplies.barrelError}`);
    } else {
      console.log('[Obsidian] Reconnect barrel preparation completed.');
    }

    while (
      bot === createdBot &&
      createdBot?.entity &&
      obsidianStats.desiredEnabled &&
      !farm.getStatus().enabled
    ) {
      attempts++;
      let leverReady = false;
      try {
        leverReady = await setProtectionLeverState(false);
      } catch (err) {
        console.error(`[Obsidian] Lever recheck attempt ${attempts} failed:`, err.message);
      }

      if (
        bot !== createdBot ||
        !createdBot?.entity ||
        !obsidianStats.desiredEnabled
      ) {
        return;
      }

      if (leverReady) {
        if (freshSession) {
          farm.start(createdBot, () => {});
        } else {
          farm.resume(createdBot, () => {});
        }
        await new Promise(resolve => setTimeout(resolve, 250));
        const startedStatus = farm.getStatus();
        if (startedStatus.enabled) {
          console.log(
            `[Obsidian] Farm started (lever check attempt ${attempts}); phase=${startedStatus.phase}.`
          );
          updateStatusMessage().catch(() => {});
          refreshObsidianStatsUpdaters().catch(() => {});
          return;
        }
        console.log(
          `[Obsidian] Farm start did not remain active after attempt ${attempts}; ` +
          `phase=${startedStatus.phase}, lastError=${startedStatus.lastErrorMessage || 'none'}.`
        );
      }

      if (!warningSent && attempts >= 3) {
        warningSent = true;
        await sendOwnerDM(
          'Obsidian farm start delayed',
          'The protection lever could not yet be confirmed OFF. The bot will keep checking and will start the farm automatically.',
          16776960
        ).catch(err => {
          console.error('[Obsidian] Could not send delayed-resume warning:', err.message);
        });
      }

      await new Promise(resolve => setTimeout(resolve, attempts < 3 ? 2_000 : 5_000));
    }
  } finally {
    if (obsidianFarmResumeBot === createdBot) {
      obsidianFarmResumeBot = null;
    }
  }
}

function startRestartProtectionMonitor() {
  if (restartProtectionInterval) clearInterval(restartProtectionInterval);
  restartProtectionInterval = setInterval(async () => {
    if (!bot?.entity || !obsidianStats.desiredEnabled) return;
    const { dateKey, hour, minute } = getKyivDateParts();
    const inPreparationWindow = (hour === 8 && minute >= 59) || (hour === 9 && minute <= 30);
    if (!inPreparationWindow || restartProtectionDateKey === dateKey) return;

    restartProtectionDateKey = dateKey;
    farm.suspend();
    const protectedState = await setProtectionLeverState(true);
    if (!protectedState) {
      await sendOwnerDM(
        'Obsidian farm protection warning',
        'The bot could not switch the protection lever ON before the scheduled server restart.',
        16711680
      );
    }
  }, 5000);
}

function startObsidianFarmWatchdog() {
  if (obsidianFarmWatchdogInterval) clearInterval(obsidianFarmWatchdogInterval);
  let recovering = false;

  obsidianFarmWatchdogInterval = setInterval(async () => {
    if (
      recovering ||
      !bot?.entity ||
      !obsidianStats.desiredEnabled ||
      farm.getStatus().enabled ||
      !farm.getStatus().config
    ) {
      return;
    }

    const { hour, minute } = getKyivDateParts();
    const inRestartWindow = (hour === 8 && minute >= 59) || (hour === 9 && minute <= 30);
    if (inRestartWindow) return;

    recovering = true;
    console.log('[Obsidian] Watchdog detected desired farm is idle; attempting recovery.');
    try {
      await ensureObsidianFarmRunning(bot);
      const status = farm.getStatus();
      console.log(
        `[Obsidian] Watchdog recovery result: enabled=${status.enabled}, phase=${status.phase}.`
      );
      await updateStatusMessage();
      await refreshObsidianStatsUpdaters();
    } catch (err) {
      console.error('[Obsidian] Watchdog recovery failed:', err.message);
    } finally {
      recovering = false;
    }
  }, 10_000);
}

function normalizeOutboundChat(message) {
  return String(message || '')
    .replace(/\u00a7[0-9a-fk-or]/gi, '')
    .replace(/[\u0000-\u0008\u000B-\u000C\u000E-\u001F\u007F]/g, '')
    .trim();
}

function normalizeOutboundEchoComparable(message) {
  return normalizeOutboundChat(message)
    .replace(/[^\x20-\x7E]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function loadBotChatStatusEmojis() {
  try {
    const raw = fs.readFileSync(BOT_CHAT_STATUS_EMOJIS_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    const emojis = Array.isArray(parsed) ? parsed : parsed?.emojis;
    if (Array.isArray(emojis)) {
      const cleaned = emojis
        .map(emoji => String(emoji || '').trim())
        .filter(Boolean);
      if (cleaned.length > 0) return [...new Set(cleaned)];
    }
  } catch (err) {
    if (err.code !== 'ENOENT') {
      console.error('[Bot] Failed to load bot chat status emojis:', err.message);
    }
  }

  return BOT_CHAT_STATUS_EMOJI_FALLBACK;
}

function shuffleBotStatusEmojis(emojis) {
  const shuffled = [...emojis];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

function refillBotStatusEmojiQueue() {
  botChatStatusEmojiQueue = shuffleBotStatusEmojis(BOT_CHAT_STATUS_EMOJIS);
  if (
    lastBotPublicChatEmoji &&
    botChatStatusEmojiQueue.length > 1 &&
    botChatStatusEmojiQueue[0] === lastBotPublicChatEmoji
  ) {
    const swapIndex = botChatStatusEmojiQueue.findIndex(emoji => emoji !== lastBotPublicChatEmoji);
    [botChatStatusEmojiQueue[0], botChatStatusEmojiQueue[swapIndex]] =
      [botChatStatusEmojiQueue[swapIndex], botChatStatusEmojiQueue[0]];
  }
}

function messageHasAnyComponentCustomId(message, customIds) {
  const wanted = new Set(customIds);
  return message.components?.some(row =>
    row.components?.some(component => wanted.has(component.customId))
  );
}

function isExistingAdminPanelMessage(message) {
  if (message.author?.id !== discordClient.user?.id) return false;
  const title = String(message.embeds?.[0]?.title || '');
  if (title === 'Admin Panel') return true;

  return messageHasAnyComponentCustomId(message, [
    'pause_resume_button',
    'drop_button',
    'chat_setting_button',
    'obsidian_farm_button',
    'admin_child_status',
    'admin_panel_back',
    'ofstats_toggle_farm',
    'ofstats_detailed',
    'ofstats_reset_coordinates',
    'ofstats_logs_menu',
    'ofstats_logs_back',
    'ofstats_toggle_debug_logging',
    'ofstats_download_debug_log'
  ]);
}

async function ensureAdminPanelDM() {
  if (!DISCORD_OWNER_ID || !discordClient || !discordClient.isReady()) return;
  try {
    const owner = await discordClient.users.fetch(DISCORD_OWNER_ID);
    if (!owner) return;
    const dm = await owner.createDM();
    const savedId = loadStatusMessageId('admin_panel_message_id.txt');

    if (savedId && !adminPanelMessage) {
      try {
        adminPanelMessage = await dm.messages.fetch(savedId);
        return;
      } catch (_) {}
    }

    if (!adminPanelMessage) {
      try {
        const recent = await dm.messages.fetch({ limit: 50 });
        const found = [...recent.values()].find(isExistingAdminPanelMessage);
        if (found) {
          adminPanelMessage = found;
          saveStatusMessageId(found.id, 'admin_panel_message_id.txt');
          return;
        }
      } catch (_) {}
    }

    if (!adminPanelMessage) {
      adminPanelMessage = await dm.send({
        embeds: [await buildAdminPanelEmbed()],
        components: createAdminPanelButtons()
      });
      saveStatusMessageId(adminPanelMessage.id, 'admin_panel_message_id.txt');
    }
  } catch (e) {
    console.error('[Discord] ensureAdminPanelDM failed:', e.message);
  }
}

async function updateAdminPanel() {
  if (!DISCORD_OWNER_ID || !discordClient || !discordClient.isReady()) return;
  if (adminPanelView !== 'main') return;
  if (!adminPanelMessage) {
    await ensureAdminPanelDM();
    if (!adminPanelMessage) return;
  }

  try {
    await adminPanelMessage.edit({
      embeds: [await buildAdminPanelEmbed()],
      components: createAdminPanelButtons()
    });
    recordTpsSample().catch(() => {});
  } catch (e) {
    if (e.code === 10008 || e.message.includes('Unknown Message')) {
      adminPanelMessage = null;
      await ensureAdminPanelDM();
    } else {
      console.error('[Discord] Failed to update admin panel:', e.message);
    }
  }
}

function pickNextBotStatusEmoji() {
  botChatStatusEmojiQueue = botChatStatusEmojiQueue
    .filter(emoji => BOT_CHAT_STATUS_EMOJIS.includes(emoji));

  if (botChatStatusEmojiQueue.length === 0) refillBotStatusEmojiQueue();

  return botChatStatusEmojiQueue.shift() || STATUS_EMOJIS.axolotlBucket;
}

function loadLastBotPublicChatStatus() {
  try {
    const raw = fs.readFileSync(BOT_PUBLIC_CHAT_STATUS_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') {
      lastBotPublicChatPhrase = typeof parsed.phrase === 'string' && parsed.phrase.trim()
        ? parsed.phrase.slice(0, 180)
        : null;
      lastBotPublicChatEmoji = typeof parsed.emoji === 'string' && parsed.emoji.trim()
        ? parsed.emoji
        : null;
      if (Array.isArray(parsed.emojiQueue)) {
        botChatStatusEmojiQueue = [...new Set(parsed.emojiQueue
          .map(emoji => String(emoji || '').trim())
          .filter(emoji => BOT_CHAT_STATUS_EMOJIS.includes(emoji)))];
      }
    }
  } catch (err) {
    if (err.code !== 'ENOENT') {
      console.error('[Bot] Failed to load last public chat status:', err.message);
    }
  }
}

function saveLastBotPublicChatStatus() {
  try {
    fs.mkdirSync(path.dirname(BOT_PUBLIC_CHAT_STATUS_FILE), { recursive: true });
    fs.writeFileSync(BOT_PUBLIC_CHAT_STATUS_FILE, JSON.stringify({
      phrase: lastBotPublicChatPhrase,
      emoji: lastBotPublicChatEmoji,
      emojiQueue: botChatStatusEmojiQueue,
      updatedAt: new Date().toISOString()
    }, null, 2));
  } catch (err) {
    console.error('[Bot] Failed to save last public chat status:', err.message);
  }
}

function rememberBotPublicChatPhrase(message) {
  const phrase = normalizeOutboundChat(message);
  if (!phrase || phrase.startsWith('/') || phrase.startsWith('!')) return;
  lastBotPublicChatPhrase = phrase.slice(0, 180);
  lastBotPublicChatEmoji = pickNextBotStatusEmoji();
  saveLastBotPublicChatStatus();
  updateStatusMessage().catch(() => {});
}

function sendMinecraftChat(message, options = {}) {
  if (!bot || typeof bot.chat !== 'function') return false;
  const normalized = normalizeOutboundChat(message);
  const cutoff = Date.now() - 10_000;
  for (const [key, timestamps] of recentOutboundChat.entries()) {
    const fresh = timestamps.filter(timestamp => timestamp >= cutoff);
    if (fresh.length > 0) recentOutboundChat.set(key, fresh);
    else recentOutboundChat.delete(key);
  }
  if (normalized) {
    const timestamps = recentOutboundChat.get(normalized) || [];
    timestamps.push(Date.now());
    recentOutboundChat.set(normalized, timestamps);
  }
  bot.chat(message);
  if (options.trackStatus) rememberBotPublicChatPhrase(message);
  return true;
}

function armSeenCommandResponseCapture(message) {
  if (/^!(?:seen|seenplayer)(?:\s|$)/i.test(String(message || '').trim())) {
    rawChatTraceUntil = Date.now() + 8_000;
  }
}

function splitMinecraftMessage(text, maxLength = MINECRAFT_PRIVATE_MESSAGE_LENGTH) {
  const words = String(text || '').trim().split(/\s+/).filter(Boolean);
  const chunks = [];
  let current = '';

  for (const word of words) {
    if (word.length > maxLength) {
      if (current) {
        chunks.push(current);
        current = '';
      }
      for (let i = 0; i < word.length; i += maxLength) {
        chunks.push(word.slice(i, i + maxLength));
      }
      continue;
    }

    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length > maxLength) {
      chunks.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }

  if (current) chunks.push(current);
  return chunks;
}

function truncateTextForChat(text, maxLength) {
  const cleanText = String(text || '').trim();
  if (!Number.isFinite(maxLength) || maxLength <= 0 || cleanText.length <= maxLength) {
    return cleanText;
  }

  const suffix = '... [truncated]';
  const limit = Math.max(0, maxLength - suffix.length);
  const clipped = cleanText.slice(0, limit).replace(/\s+\S*$/, '').trim();
  return `${clipped || cleanText.slice(0, limit).trim()}${suffix}`;
}

async function sendPrivateMinecraftMessage(username, text) {
  const cleanText = String(text || '')
    .replace(/\u00a7[0-9a-fk-or]/gi, '')
    .replace(/[\r\n]+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/[\u0000-\u001F\u007F]/g, '')
    .trim();

  for (const chunk of splitMinecraftMessage(cleanText)) {
    if (!bot?.entity) return;
    sendMinecraftChat(`/msg ${username} ${chunk}`);
    outboundWhispers.set(`OUTBOUND:${String(username).toLowerCase()}:${cleanMinecraftChatMessage(chunk)}`, Date.now());
    await new Promise(resolve => setTimeout(resolve, 400));
  }
}

async function sendGameChatMessageToDiscord(username, message, { allowMentions = true } = {}) {
  const cleanMessage = String(message || '')
    .replace(/\u00a7[0-9a-fk-or]/gi, '')
    .replace(/[\u0000-\u0008\u000B-\u000C\u000E-\u001F\u007F]/g, '')
    .trim();

  if (!cleanMessage || cleanMessage.startsWith('/msg ')) {
    return false;
  }

  const safeUsername = String(username || bot?.username || 'Minecraft');
  recordGameChatMessage(safeUsername, cleanMessage).catch(() => {});

  if (!DISCORD_CHAT_CHANNEL_ID || !discordClient || !discordClient.isReady()) {
    return false;
  }

  try {
    const channel = await discordClient.channels.fetch(DISCORD_CHAT_CHANNEL_ID);
    if (!channel?.isTextBased?.()) return false;

    const avatarUrl = `https://minotar.net/avatar/${safeUsername.toLowerCase()}/28`;
    let displayMessage = neutralizeDiscordInviteLinks(flattenMarkdownLinks(cleanMessage))
      .replace(/([*_`~|>\\])/g, '\\$1');
    displayMessage = displayMessage.replace(/\[/g, '\\[').replace(/\]/g, '\\]');

    const sendOptions = {
      embeds: [{
        author: {
          name: safeUsername,
          url: `https://namemc.com/profile/${encodeURIComponent(safeUsername)}`
        },
        description: displayMessage,
        color: 3447003,
        thumbnail: { url: avatarUrl },
        timestamp: new Date()
      }]
    };

    const isBridgeMessage = /^\[[^\]]+\]\s/.test(cleanMessage);
    if (allowMentions && !isBridgeMessage) {
      const lowerMessage = cleanMessage.toLowerCase();
      const usersToMention = new Set();
      const mentionKeywords = await getMentionKeywords();
      for (const { discord_id, keyword } of mentionKeywords) {
        const normalizedKeyword = keyword.toLowerCase().trim();
        if (!normalizedKeyword) continue;

        const regex = new RegExp(`\\b${escapeRegExp(normalizedKeyword)}\\b`);
        if (regex.test(lowerMessage)) {
          usersToMention.add(discord_id);
        }
      }
      if (usersToMention.size > 0) {
        sendOptions.content = Array.from(usersToMention).map(id => `<@${id}>`).join(' ');
      }
    }

    await channel.send(sendOptions);
    return true;
  } catch (e) {
    console.error('[Discord Chat] Failed to send game chat message:', e.message);
    return false;
  }
}

async function recordGameChatMessage(username, message) {
  if (!pool) return;

  const safeUsername = String(username || 'Minecraft').trim().slice(0, 255);
  const cleanMessage = String(message || '')
    .replace(/\u00a7[0-9a-fk-or]/gi, '')
    .replace(/[\u0000-\u0008\u000B-\u000C\u000E-\u001F\u007F]/g, '')
    .trim();

  if (!safeUsername || !cleanMessage || cleanMessage.startsWith('/msg ')) return;

  try {
    await pool.query(
      'INSERT INTO game_chat_messages (username, message) VALUES ($1, $2)',
      [safeUsername, cleanMessage]
    );
    await pool.query("DELETE FROM game_chat_messages WHERE created_at < NOW() - INTERVAL '30 days'");
  } catch (err) {
    console.error('[DB] Failed to record game chat message:', err.message);
  }
}

async function recordSiteWhisperMessage(username, direction, message, siteUsername = null) {
  if (!pool) return;

  const safeUsername = String(username || '').replace(/[^A-Za-z0-9_]/g, '').trim().slice(0, 32);
  const safeDirection = direction === 'outgoing' ? 'outgoing' : 'incoming';
  const safeSiteUsername = siteUsername
    ? String(siteUsername).replace(/[\u0000-\u001F\u007F]/g, '').trim().slice(0, 64)
    : null;
  const cleanMessage = String(message || '')
    .replace(/\u00a7[0-9a-fk-or]/gi, '')
    .replace(/[\r\n]+/g, ' ')
    .replace(/[\u0000-\u0008\u000B-\u000C\u000E-\u001F\u007F]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 240);

  if (!safeUsername || !cleanMessage) return;

  try {
    await pool.query(
      `INSERT INTO site_whisper_messages (player_username, direction, site_username, message, delivery_status)
       VALUES ($1, $2, $3, $4, 'delivered')`,
      [safeUsername, safeDirection, safeSiteUsername, cleanMessage]
    );
    await pool.query("DELETE FROM site_whisper_messages WHERE created_at < NOW() - INTERVAL '30 days'");
  } catch (err) {
    console.error('[DB] Failed to record site whisper message:', err.message);
  }
}

async function processSiteGameChatOutbox() {
  if (!pool || !bot || typeof bot.chat !== 'function') return;

  let items = [];
  try {
    const result = await pool.query(`
      WITH next_items AS (
        SELECT id
        FROM site_game_chat_outbox
        WHERE status = 'pending'
        ORDER BY created_at ASC
        LIMIT 5
        FOR UPDATE SKIP LOCKED
      )
      UPDATE site_game_chat_outbox outbox
      SET status = 'processing',
          error = NULL
      FROM next_items
      WHERE outbox.id = next_items.id
      RETURNING outbox.id, outbox.sender_username, outbox.message
    `);
    items = result.rows;
  } catch (err) {
    console.error('[Site Chat] Failed to load queued messages:', err.message);
    return;
  }

  for (const item of items) {
    const sender = String(item.sender_username || 'site')
      .replace(/[\[\]\r\n]/g, '')
      .trim()
      .slice(0, 32) || 'site';
    const cleanMessage = String(item.message || '')
      .replace(/\u00a7[0-9a-fk-or]/gi, '')
      .replace(/[\u0000-\u0008\u000B-\u000C\u000E-\u001F\u007F]/g, '')
      .trim()
      .slice(0, 240);
    const outgoing = `[${sender}] ${cleanMessage}`;

    try {
      if (!cleanMessage) throw new Error('Queued message is empty.');
      const sent = sendMinecraftChat(outgoing);
      if (!sent) throw new Error('Minecraft bot is not ready.');
      await sendGameChatMessageToDiscord(bot.username || ADMIN_PANEL_BOT_NAME, outgoing, { allowMentions: false });
      await pool.query(`
        UPDATE site_game_chat_outbox
        SET status = 'sent',
            sent_at = NOW(),
            error = NULL
        WHERE id = $1
      `, [item.id]);
      console.log(`[Site Chat] Sent "${outgoing}" from site user ${sender}`);
    } catch (err) {
      await pool.query(`
        UPDATE site_game_chat_outbox
        SET status = 'failed',
            error = $2
        WHERE id = $1
      `, [item.id, err.message]);
      console.error('[Site Chat] Failed to send queued message:', err.message);
    }
  }
}

function sanitizeBridgeSender(value) {
  return String(value || 'site')
    .replace(/[\[\]\r\n]/g, '')
    .trim()
    .slice(0, 32) || 'site';
}

function sanitizeSiteChatMessage(value) {
  return String(value || '')
    .replace(/\u00a7[0-9a-fk-or]/gi, '')
    .replace(/[\u0000-\u0008\u000B-\u000C\u000E-\u001F\u007F]/g, '')
    .trim()
    .slice(0, 240);
}

function isMinecraftPlayerOnline(username) {
  const target = String(username || '').toLowerCase();
  if (!target || !bot?.players) return false;
  return Object.values(bot.players).some(player =>
    String(player?.username || '').toLowerCase() === target
  );
}

async function scheduleQueuedSiteWhispersForPlayer(username) {
  if (!pool) return;
  const safeUsername = String(username || '').replace(/[^A-Za-z0-9_]/g, '').trim().slice(0, 32);
  if (!safeUsername) return;

  try {
    const result = await pool.query(`
      UPDATE bot_commands
      SET payload = payload
          || jsonb_build_object(
            'offlineUntilJoin', false,
            'deferredUntil', to_jsonb(NOW() + INTERVAL '5 seconds')
          )
      WHERE status = 'pending'
        AND command_type = 'site_whisper'
        AND LOWER(payload->>'username') = LOWER($1)
        AND payload->>'offlineUntilJoin' = 'true'
    `, [safeUsername]);
    if (result.rowCount > 0) {
      console.log(`[Site Whisper] Scheduled ${result.rowCount} queued message(s) for ${safeUsername} in 5 seconds.`);
    }
  } catch (err) {
    console.error('[Site Whisper] Failed to schedule queued whispers:', err.message);
  }
}

async function scheduleQueuedSiteWhispersForOnlinePlayers() {
  if (!bot?.players) return;
  const usernames = [...new Set(Object.values(bot.players)
    .map(player => String(player?.username || '').trim())
    .filter(username => username && username.toLowerCase() !== String(bot.username || '').toLowerCase()))];

  for (const username of usernames) {
    await scheduleQueuedSiteWhispersForPlayer(username);
  }
}

async function executeBotCommand(command) {
  const type = String(command.command_type || '').toLowerCase();
  const payload = command.payload || {};
  const requestedBy = sanitizeBridgeSender(command.requested_by || command.source);

  if (type === 'chat') {
    if (!bot || typeof bot.chat !== 'function') throw new Error('Minecraft bot is not ready.');
    const cleanMessage = sanitizeSiteChatMessage(payload.message);
    if (!cleanMessage) throw new Error('Queued message is empty.');
    const isCommand = cleanMessage.startsWith('/') || cleanMessage.startsWith('!');
    const outgoing = isCommand ? cleanMessage : `[${requestedBy}] ${cleanMessage}`;
    armSeenCommandResponseCapture(cleanMessage);
    const sent = sendMinecraftChat(outgoing);
    if (!sent) throw new Error('Minecraft bot is not ready.');
    const sentToDiscord = await sendGameChatMessageToDiscord(isCommand ? requestedBy : (bot.username || ADMIN_PANEL_BOT_NAME), isCommand ? cleanMessage : outgoing, { allowMentions: false });
    if (!sentToDiscord && DISCORD_CHAT_CHANNEL_ID && discordClient?.isReady?.()) {
      console.warn(`[Site Chat] Sent "${outgoing}" to Minecraft but failed to mirror it to Discord.`);
    }
    return { message: outgoing };
  }

  if (type === 'site_whisper') {
    if (!bot || typeof bot.chat !== 'function') throw new Error('Minecraft bot is not ready.');
    const username = String(payload.username || '')
      .replace(/[^A-Za-z0-9_]/g, '')
      .trim()
      .slice(0, 32);
    const cleanMessage = sanitizeSiteChatMessage(payload.message);
    if (!username) throw new Error('Whisper target is required.');
    if (!cleanMessage) throw new Error('Queued whisper is empty.');
    if (!isMinecraftPlayerOnline(username)) {
      throw new DeferredBotCommandError(`Whisper target ${username} is offline; waiting for join.`, {
        offlineUntilJoin: true,
        deferredUntil: null
      });
    }

    siteWhisperTargets.set(username.toLowerCase(), {
      timestamp: Date.now(),
      siteUsername: requestedBy || null
    });
    let sentChunks = 0;
    for (const chunk of splitMinecraftMessage(cleanMessage)) {
      if (!bot?.entity) throw new Error('Minecraft bot is not ready.');
      const sent = sendMinecraftChat(`/msg ${username} ${chunk}`);
      if (!sent) throw new Error('Minecraft bot is not ready.');
      outboundWhispers.set(`OUTBOUND:${username.toLowerCase()}:${cleanMinecraftChatMessage(chunk)}`, Date.now());
      sentChunks += 1;
      await new Promise(resolve => setTimeout(resolve, 400));
    }

    const messageId = String(payload.messageId || '').replace(/[^\d]/g, '');
    if (messageId && pool) {
      await pool.query(`
        UPDATE site_whisper_messages
        SET delivery_status = 'delivered'
        WHERE id = $1
          AND direction = 'outgoing'
      `, [messageId]);
    }

    return { username, chunks: sentChunks };
  }

  if (type === 'pause') {
    shouldReconnect = false;
    const minutes = Number(payload.minutes);
    lastCommandUser = `${requestedBy} via ${command.source || 'command bus'}`;
    if (Number.isFinite(minutes) && minutes > 0) {
      const safeMinutes = Math.min(1440, Math.floor(minutes));
      setDisconnectReason(`Paused for ${safeMinutes}m by ${requestedBy}`);
      if (bot) bot.quit(`Paused ${safeMinutes}m`);
      scheduleResume(safeMinutes * 60_000, `[Command Bus] Resume scheduled in ${safeMinutes}m`);
      return { message: `Paused for ${safeMinutes} minutes.` };
    }

    clearReconnectTimer();
    clearResumeTimer();
    setDisconnectReason(`Paused by ${requestedBy}`);
    if (bot) bot.quit('Pause until resume');
    return { message: 'Paused until resume.' };
  }

  if (type === 'resume') {
    shouldReconnect = true;
    clearResumeTimer();
    clearReconnectTimer();
    setDisconnectReason(null);
    if (!bot) createBot();
    return { message: 'Resume requested.' };
  }

  if (type === 'restart') {
    shouldReconnect = true;
    clearResumeTimer();
    clearReconnectTimer();
    lastCommandUser = `${requestedBy} via ${command.source || 'command bus'}`;
    setDisconnectReason(`Restart requested by ${requestedBy}`);
    if (bot) {
      bot.quit('Restart command');
    } else {
      createBot();
    }
    return { message: 'Restart requested.' };
  }

  if (type === 'set_whitelist_mode') {
    runtimeSettings.whitelistMode = Boolean(payload.enabled);
    await persistRuntimeSetting('whitelistMode');
    return { whitelistMode: runtimeSettings.whitelistMode };
  }

  if (type === 'set_danger_radius') {
    const value = Number(payload.value);
    if (!DANGER_RADIUS_OPTIONS.includes(value)) throw new Error('Invalid danger radius.');
    runtimeSettings.dangerRadius = value;
    await persistRuntimeSetting('dangerRadius');
    return { dangerRadius: value };
  }

  if (type === 'set_message_cooldown') {
    const value = Number(payload.value);
    if (!MESSAGE_COOLDOWN_OPTIONS.includes(value)) throw new Error('Invalid message cooldown.');
    runtimeSettings.messageCooldownMs = value;
    await persistRuntimeSetting('messageCooldownMs');
    return { messageCooldownMs: value };
  }

  if (type === 'follow') {
    if (!bot?.entity) throw new Error('Minecraft bot is offline.');
    const username = String(payload.username || '').trim();
    if (!username) throw new Error('Username is required.');
    farm.suspend();
    followFeature.start(bot, username);
    return { targetUsername: followFeature.getStatus().targetUsername };
  }

  if (type === 'follow_stop') {
    followFeature.stop();
    return { message: 'Follow stopped.' };
  }

  if (type === 'drop_item') {
    if (!bot?.entity) throw new Error('Minecraft bot is offline.');
    const slot = Number(payload.slot);
    const name = String(payload.name || '').trim();
    const allSlots = (bot.inventory?.slots || []).filter(Boolean);
    const item = Number.isFinite(slot)
      ? allSlots.find(entry => entry.slot === slot)
      : allSlots.find(entry => name && entry.name === name);
    if (!item) throw new Error('Item not found in inventory.');

    const targetUsername = await dropItemToNearestPlayer(item);
    await writeBotStatusSnapshot().catch(() => {});
    return { item: item.name, count: item.count, targetUsername };
  }

  if (type === 'whitelist_add') {
    const username = String(payload.username || '').trim();
    if (!username) throw new Error('Username is required.');
    const { whitelist, changed } = await addUsernameToWhitelist(username, requestedBy);
    ignoredUsernames.length = 0;
    ignoredUsernames.push(...whitelist);
    return { username, changed };
  }

  if (type === 'whitelist_remove') {
    const username = String(payload.username || '').trim();
    if (!username) throw new Error('Username is required.');
    if (pool) await pool.query('DELETE FROM whitelist WHERE LOWER(username) = LOWER($1)', [username]);
    const newWhitelist = ignoredUsernames.filter(entry => entry.toLowerCase() !== username.toLowerCase());
    fs.writeFileSync('whitelist.txt', newWhitelist.join('\n') + (newWhitelist.length ? '\n' : ''));
    ignoredUsernames.length = 0;
    ignoredUsernames.push(...newWhitelist);
    return { username };
  }

  if (type === 'ignore_chat') {
    const username = String(payload.username || '').trim();
    if (!username) throw new Error('Username is required.');
    if (!pool) throw new Error('Database not configured.');
    await pool.query(
      'INSERT INTO ignored_users (username, added_by) VALUES ($1, $2) ON CONFLICT (username) DO NOTHING',
      [username.toLowerCase(), requestedBy]
    );
    ignoredChatUsernames = await loadIgnoredChatUsernames();
    return { username };
  }

  if (type === 'unignore_chat') {
    const username = String(payload.username || '').trim();
    if (!username) throw new Error('Username is required.');
    if (!pool) throw new Error('Database not configured.');
    await pool.query('DELETE FROM ignored_users WHERE username = $1', [username.toLowerCase()]);
    ignoredChatUsernames = await loadIgnoredChatUsernames();
    return { username };
  }

  if (type === 'obsidian_toggle') {
    return toggleObsidianFarmFromControl();
  }

  if (type === 'obsidian_radius_toggle') {
    const nextRadius = farm.cycleCauldronRadius();
    if (!nextRadius) throw new Error('Configure obsidian farm coordinates before changing the radius.');
    await persistObsidianFarmCoordinates();
    await writeBotStatusSnapshot().catch(() => {});
    return { radius: nextRadius };
  }

  if (type === 'obsidian_reset_coordinates') {
    farm.suspend();
    await setProtectionLeverState(true).catch(() => false);
    await setObsidianFarmDesiredEnabled(false);
    await clearObsidianFarmCoordinates();
    farm.resetConfig();
    await writeBotStatusSnapshot().catch(() => {});
    return { message: 'Farm coordinates were reset.' };
  }

  if (type === 'obsidian_set_coordinates') {
    const x = Number(payload.x);
    const y = Number(payload.y);
    const z = Number(payload.z);
    const radius = Number(payload.radius);
    if (![x, y, z].every(Number.isFinite)) {
      throw new Error('X, Y and Z coordinates must be numbers.');
    }
    const options = Number.isFinite(radius) ? { maxCauldronDist: radius } : {};
    farm.configure(x, y, z, options);
    await persistObsidianFarmCoordinates();
    await writeBotStatusSnapshot().catch(() => {});
    return { config: farm.getStatus().config };
  }

  if (type === 'child_toggle') {
    if (!growingChild) initializeGrowingChild();
    const status = growingChild.toggleEnabled();
    return { enabled: status.enabled };
  }

  if (type === 'child_say') {
    if (!bot?.entity || typeof bot.chat !== 'function') throw new Error('Minecraft bot is offline.');
    if (!growingChild) initializeGrowingChild();
    const payload = await growingChild?.speak('button', [], 'minecraft');
    if (!payload) throw new Error('Growing Child AI is disabled or has nothing to say.');
    return { phrase: payload.phrase || null };
  }

  if (type === 'gemini_toggle') {
    runtimeSettings.geminiEnabled = !runtimeSettings.geminiEnabled;
    await persistRuntimeSetting('geminiEnabled');
    return { geminiEnabled: runtimeSettings.geminiEnabled };
  }

  if (type === 'child_public_toggle') {
    runtimeSettings.childPublicSpeech = !runtimeSettings.childPublicSpeech;
    growingChild?.setMinecraftPublicSpeechEnabled(runtimeSettings.childPublicSpeech);
    await persistRuntimeSetting('childPublicSpeech');
    return { childPublicSpeech: runtimeSettings.childPublicSpeech };
  }

  throw new Error(`Unsupported command type: ${type}`);
}

async function processBotCommands() {
  if (!pool) return;

  let commands = [];
  try {
    const includeChat = Boolean(bot && typeof bot.chat === 'function');
    const result = await pool.query(`
      WITH next_commands AS (
        SELECT id
        FROM bot_commands
        WHERE status = 'pending'
          AND ($1::boolean OR command_type <> 'chat')
          AND ($1::boolean OR command_type <> 'site_whisper')
          AND (
            command_type <> 'site_whisper'
            OR COALESCE(payload->>'offlineUntilJoin', 'false') <> 'true'
          )
          AND (
            command_type <> 'site_whisper'
            OR payload->>'deferredUntil' IS NULL
            OR (payload->>'deferredUntil')::timestamptz <= NOW()
          )
        ORDER BY created_at ASC
        LIMIT 5
        FOR UPDATE SKIP LOCKED
      )
      UPDATE bot_commands commands
      SET status = 'processing',
          started_at = NOW(),
          error = NULL
      FROM next_commands
      WHERE commands.id = next_commands.id
      RETURNING commands.id, commands.source, commands.requested_by, commands.command_type, commands.payload
    `, [includeChat]);
    commands = result.rows;
  } catch (err) {
    console.error('[Command Bus] Failed to load commands:', err.message);
    return;
  }

  for (const command of commands) {
    try {
      const result = await executeBotCommand(command);
      await writeBotStatusSnapshot().catch(() => {});
      await pool.query(`
        UPDATE bot_commands
        SET status = 'done',
            result = $2,
            error = NULL,
            finished_at = NOW()
        WHERE id = $1
      `, [command.id, result || {}]);
      console.log(`[Command Bus] Completed ${command.command_type} #${command.id}`);
      await recordSystemLog({
        level: 'audit',
        category: 'command_bus',
        actor: command.requested_by,
        message: `Completed bot command ${command.command_type} #${command.id}.`,
        details: { commandId: String(command.id), source: command.source, result: result || {} }
      });
    } catch (err) {
      if (err instanceof DeferredBotCommandError) {
        await pool.query(`
          UPDATE bot_commands
          SET status = 'pending',
              payload = payload || $2::jsonb,
              result = jsonb_build_object('deferred', true, 'reason', $3::text),
              error = NULL,
              started_at = NULL
          WHERE id = $1
        `, [command.id, JSON.stringify(err.payloadPatch || {}), err.message]);
        console.log(`[Command Bus] Deferred ${command.command_type} #${command.id}: ${err.message}`);
        await recordSystemLog({
          level: 'info',
          category: 'command_bus',
          actor: command.requested_by,
          message: `Deferred bot command ${command.command_type} #${command.id}.`,
          details: { commandId: String(command.id), reason: err.message, payloadPatch: err.payloadPatch || {} }
        });
        continue;
      }
      await pool.query(`
        UPDATE bot_commands
        SET status = 'failed',
            error = $2,
            finished_at = NOW()
        WHERE id = $1
      `, [command.id, err.message]);
      console.error(`[Command Bus] Failed ${command.command_type} #${command.id}:`, err.message);
      await recordSystemLog({
        level: 'error',
        category: 'command_bus',
        actor: command.requested_by,
        message: `Failed bot command ${command.command_type} #${command.id}.`,
        details: { commandId: String(command.id), error: err.message }
      });
    }
  }
}

function neutralizeDiscordInviteLinks(message) {
  return String(message || '')
    .replace(/\b(discord\.gg|discord(?:app)?\.com\/invite)\//gi, match =>
      match.replace(/\./g, '[.]')
    );
}

function flattenMarkdownLinks(message) {
  return String(message || '').replace(/\[([^\]\r\n]{1,300})\]\((https?:\/\/[^\s)<>]{1,500})\)/gi, (match, label, url) => {
    const cleanLabel = String(label || '').trim();
    const cleanUrl = String(url || '').trim();
    if (!cleanLabel || !cleanUrl) return match;
    if (cleanLabel === cleanUrl) return cleanUrl;
    return `${cleanLabel} (${cleanUrl})`;
  });
}

function cleanMinecraftChatMessage(message) {
  return String(message || '')
    .replace(/(?:\u00a7|\u00c2\u00a7)[0-9a-fk-or]/gi, '')
    .replace(/[\u0000-\u0008\u000B-\u000C\u000E-\u001F\u007F]/g, '')
    .trim();
}

function isPrivateMinecraftChatLine(text) {
  const clean = cleanMinecraftChatMessage(text).replace(/\s+/g, ' ').trim();
  if (!clean) return false;
  const botName = bot?.username ? escapeRegExp(bot.username) : '[A-Za-z0-9_]{1,16}';
  const privatePatterns = [
    /^(?:from|to)\s+[A-Za-z0-9_]{1,16}\s*[:>»]/i,
    /^[A-Za-z0-9_]{1,16}\s+(?:whispers?|whispered|tells?|messages?|msgs?)\s+(?:to\s+)?(?:you|me)\s*[:>»]/i,
    /^(?:you|me)\s+(?:whisper|tell|message|msg)\s+(?:to\s+)?[A-Za-z0-9_]{1,16}\s*[:>»]/i,
    new RegExp(`^\\[?[A-Za-z0-9_]{1,16}\\s*(?:->|→)\\s*(?:you|me|${botName})\\]?\\s*:?`, 'i'),
    new RegExp(`^\\[?(?:you|me|${botName})\\s*(?:->|→)\\s*[A-Za-z0-9_]{1,16}\\]?\\s*:?`, 'i')
  ];
  return privatePatterns.some(pattern => pattern.test(clean));
}

function cancelPendingGameChat(username, message) {
  const key = `CHAT:${String(username || '').toLowerCase()}:${cleanMinecraftChatMessage(message)}`;
  const timers = pendingChatTimers.get(key);
  if (!timers) return false;
  for (const timer of timers) clearTimeout(timer);
  pendingChatTimers.delete(key);
  return true;
}

function rememberCommandBotResponse(message) {
  const match = cleanMinecraftChatMessage(message).match(/^>\s*([A-Za-z0-9_]{1,32})\s*:\s*([\s\S]+)$/);
  if (!match) return;
  const now = Date.now();
  recentCommandBotResponses = recentCommandBotResponses
    .filter(entry => now - entry.timestamp < 5_000)
    .concat({
      target: match[1].toLowerCase(),
      message: cleanMinecraftChatMessage(match[2]),
      timestamp: now
    });
}

function isTruncatedCommandBotResponse(username, message) {
  const now = Date.now();
  const target = String(username || '').toLowerCase();
  const cleanMessage = cleanMinecraftChatMessage(message);
  recentCommandBotResponses = recentCommandBotResponses.filter(entry => now - entry.timestamp < 5_000);
  return recentCommandBotResponses.some(entry =>
    entry.target === target && entry.message === cleanMessage
  );
}

function scheduleGameChatForward(username, message, source = 'chat') {
  const cleanMessage = cleanMinecraftChatMessage(message);
  if (!cleanMessage || cleanMessage.startsWith('/msg ')) return false;

  const safeUsername = String(username || '').trim();
  if (!safeUsername) return false;
  const isCommandResponseBot = COMMAND_RESPONSE_BOT_USERNAMES.has(safeUsername.toLowerCase());

  const nowTs = Date.now();
  const isSelfMessage = bot?.username && safeUsername.toLowerCase() === bot.username.toLowerCase();
  const pendingKey = `CHAT:${safeUsername.toLowerCase()}:${cleanMessage}`;
  for (const [key, state] of recentlyForwardedGameChat.entries()) {
    if (nowTs - state.timestamp > 2_000) recentlyForwardedGameChat.delete(key);
  }
  const duplicate = recentlyForwardedGameChat.get(pendingKey);
  if (duplicate && duplicate.source !== source && nowTs - duplicate.timestamp < 1_500) return false;
  if (isSelfMessage && consumeOutboundSelfEcho(cleanMessage)) {
    recentlyForwardedGameChat.set(pendingKey, { source, timestamp: nowTs });
    return false;
  }

  if (!isSelfMessage && !isCommandResponseBot && ignoredChatUsernames.includes(safeUsername.toLowerCase())) {
    if (/^[>›»]/.test(cleanMessage)) console.warn(`[Chat] Suppressed leading-greater message from ignored user ${safeUsername}: ${cleanMessage}`);
    return false;
  }

  const whisperKey = `WHISPER:${safeUsername}:${cleanMessage}`;
  const whisperLowerKey = `WHISPER:${safeUsername.toLowerCase()}:${cleanMessage}`;
  if (recentWhispers.has(whisperKey) || recentWhispers.has(whisperLowerKey)) {
    debugLog(`[Chat] Suppressed whisper from ${safeUsername}: "${cleanMessage}"`);
    if (/^[>›»]/.test(cleanMessage)) console.warn(`[Chat] Suppressed leading-greater message as whisper from ${safeUsername}: ${cleanMessage}`);
    return false;
  }

  const outboundKey = `OUTBOUND:${safeUsername.toLowerCase()}:${cleanMessage}`;
  for (const [ok, ts] of outboundWhispers.entries()) {
    if (nowTs - ts > OUTBOUND_WHISPER_TTL_MS) outboundWhispers.delete(ok);
  }
  if (outboundWhispers.has(outboundKey)) {
    debugLog(`[Chat] Suppressed outbound echo to ${safeUsername}: "${cleanMessage}"`);
    if (/^[>›»]/.test(cleanMessage)) console.warn(`[Chat] Suppressed leading-greater message as outbound echo from ${safeUsername}: ${cleanMessage}`);
    return false;
  }

  recentlyForwardedGameChat.set(pendingKey, { source, timestamp: nowTs });
  const timer = setTimeout(async () => {
    try {
      if (source === 'chat' && !isCommandResponseBot && isTruncatedCommandBotResponse(safeUsername, cleanMessage)) {
        debugLog(`[Chat] Suppressed truncated command-bot copy attributed to ${safeUsername}: "${cleanMessage}"`);
        return;
      }
      if (recentWhispers.has(whisperKey) || recentWhispers.has(whisperLowerKey)) {
        debugLog(`[Chat] Suppressed whisper (late mark) from ${safeUsername}: "${cleanMessage}"`);
        if (/^[>›»]/.test(cleanMessage)) console.warn(`[Chat] Suppressed leading-greater message as late whisper from ${safeUsername}: ${cleanMessage}`);
        return;
      }
      if (outboundWhispers.has(outboundKey)) {
        debugLog(`[Chat] Suppressed outbound echo (late) to ${safeUsername}: "${cleanMessage}"`);
        if (/^[>›»]/.test(cleanMessage)) console.warn(`[Chat] Suppressed leading-greater message as late outbound echo from ${safeUsername}: ${cleanMessage}`);
        return;
      }
      recentlyForwardedGameChat.set(pendingKey, { source, timestamp: Date.now() });
      const sent = await sendGameChatMessageToDiscord(safeUsername, cleanMessage);
      if (!sent && DISCORD_CHAT_CHANNEL_ID && discordClient?.isReady?.()) {
        console.warn(`[Chat] Forwarded ${safeUsername} to site DB but failed to mirror to Discord.`);
      }
    } catch (e) {
      console.error(`[Chat] Failed to forward ${safeUsername}:`, e.message);
    } finally {
      const timers = pendingChatTimers.get(pendingKey);
      timers?.delete(timer);
      if (timers?.size === 0) pendingChatTimers.delete(pendingKey);
    }
  }, PENDING_CHAT_DELAY_MS);

  const timers = pendingChatTimers.get(pendingKey) || new Set();
  timers.add(timer);
  pendingChatTimers.set(pendingKey, timers);
  return true;
}

function parseRawPublicChatLine(text) {
  if (isPrivateMinecraftChatLine(text)) return null;
  const clean = cleanMinecraftChatMessage(text);
  if (Date.now() < rawChatTraceUntil && /^>\s+I\s+saw\s+[A-Za-z0-9_]{1,32}\b/i.test(clean)) {
    return {
      username: COMMAND_RESPONSE_DISPLAY_USERNAME,
      message: clean
    };
  }

  const commandBotMatch = clean.match(new RegExp(
    `(?:<|\\[)?(${escapeRegExp(COMMAND_RESPONSE_DISPLAY_USERNAME)})(?:>|\\])?\\s*([>›»:]?)\\s*([\\s\\S]+)$`,
    'i'
  ));
  if (commandBotMatch) {
    const message = commandBotMatch[3].trim();
    if (message) {
      return {
        username: commandBotMatch[1],
        message: message.startsWith('>') ? message : `> ${message}`
      };
    }
  }

  const commandResponseMatch = clean.match(/^(?:<([A-Za-z0-9_]{1,32})>|\[([A-Za-z0-9_]{1,32})\]|([A-Za-z0-9_]{1,32}))\s*[>›»]\s+([\s\S]+)$/);
  if (commandResponseMatch) {
    const username = commandResponseMatch[1] || commandResponseMatch[2] || commandResponseMatch[3];
    const message = commandResponseMatch[4].trim();
    if (COMMAND_RESPONSE_BOT_USERNAMES.has(String(username || '').toLowerCase())) {
      return { username, message: `> ${message}` };
    }
  }

  const angleMatch = clean.match(/^<([A-Za-z0-9_]{1,32})>\s+([\s\S]+)$/);
  if (angleMatch) {
    return {
      username: angleMatch[1],
      message: angleMatch[2].trim()
    };
  }

  const prefixedAngleMatch = clean.match(/(?:^|[\s.])<([A-Za-z0-9_]{1,32})>\s*([>›»][\s\S]*)$/);
  if (prefixedAngleMatch) {
    return {
      username: prefixedAngleMatch[1],
      message: prefixedAngleMatch[2].trim()
    };
  }

  const plainLeadingGreaterMatch = clean.match(/^([A-Za-z0-9_]{1,32})\s+([>›»][\s\S]*)$/);
  if (plainLeadingGreaterMatch) {
    return {
      username: plainLeadingGreaterMatch[1],
      message: plainLeadingGreaterMatch[2].trim()
    };
  }

  const prefixedPlainLeadingGreaterMatch = clean.match(/(?:^|[\s.])([A-Za-z0-9_]{1,32})\s+([>›»][\s\S]*)$/);
  if (prefixedPlainLeadingGreaterMatch) {
    return {
      username: prefixedPlainLeadingGreaterMatch[1],
      message: prefixedPlainLeadingGreaterMatch[2].trim()
    };
  }

  const match = clean.match(/^(?:\[([A-Za-z0-9_]{1,32})\]|([A-Za-z0-9_]{1,32}))\s*(?:>|:)\s+([\s\S]+)$/);
  if (!match) return null;
  return {
    username: match[1] || match[2],
    message: match[3].trim()
  };
}

function forwardRawPublicChatText(text, source = 'raw', position = '') {
  if (Date.now() < rawChatTraceUntil) {
    const cleanTraceText = cleanMinecraftChatMessage(text).replace(/\s+/g, ' ').trim();
    if (cleanTraceText) {
      console.log(`[Chat Raw Trace] ${source}${position ? `/${position}` : ''}: ${cleanTraceText.slice(0, 300)}`);
    }
  }

  const rawChat = parseRawPublicChatLine(text);
  if (!rawChat) {
    if (String(text || '').toLowerCase().includes('lolritter')) {
      console.warn(`[Chat Raw] Saw ${COMMAND_RESPONSE_DISPLAY_USERNAME} text but could not parse it: ${String(text).slice(0, 300)}`);
    }
    return false;
  }
  if (COMMAND_RESPONSE_BOT_USERNAMES.has(String(rawChat.username || '').toLowerCase())) {
    rememberCommandBotResponse(rawChat.message);
  }
  const forwarded = scheduleGameChatForward(rawChat.username, rawChat.message, source);
  if (String(rawChat.username || '').toLowerCase() === COMMAND_RESPONSE_DISPLAY_USERNAME.toLowerCase()) {
    console.log(`[Chat Raw] Forwarded ${COMMAND_RESPONSE_DISPLAY_USERNAME} message: ${rawChat.message}`);
  }
  return forwarded;
}

async function requestGeminiModel(model, question, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  let response;
  try {
    response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': GEMINI_API_KEY
        },
        signal: controller.signal,
        body: JSON.stringify({
          system_instruction: {
            parts: [{
              text: options.systemInstruction ||
                'Answer in English. Be concise and direct. Use plain text only, no Markdown. Give at most 2 short sentences.'
            }]
          },
          contents: [{
            role: 'user',
            parts: [{ text: question }]
          }],
          generationConfig: {
            temperature: options.temperature ?? 0.4,
            maxOutputTokens: options.maxOutputTokens ?? 120
          }
        })
      }
    );
  } finally {
    clearTimeout(timeout);
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const err = new Error(data?.error?.message || `Gemini request failed with HTTP ${response.status}`);
    err.status = response.status;
    err.geminiCode = data?.error?.status || null;
    err.model = model;
    throw err;
  }

  const answer = data?.candidates?.[0]?.content?.parts
    ?.map(part => part.text || '')
    .join('\n')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map(line => line.replace(/[ \t]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  if (!answer) {
    throw new Error('Gemini returned no answer');
  }
  return truncateTextForChat(answer, options.maxResponseLength ?? WM_MAX_RESPONSE_LENGTH);
}

function getGeminiRetryDelayMs(err) {
  const message = String(err?.message || '');
  const match = message.match(/retry in\s+([\d.]+)\s*(ms|s|sec|seconds?)/i);
  if (!match) return null;
  const value = Number(match[1]);
  if (!Number.isFinite(value) || value <= 0) return null;
  return match[2].toLowerCase() === 'ms' ? value : value * 1000;
}

function markGeminiModelBackoff(model, err) {
  let delayMs = null;
  if (err?.status === 429) {
    delayMs = getGeminiRetryDelayMs(err) ?? 60_000;
  } else if (err?.status === 404 || err?.status === 400 || err?.status === 403) {
    delayMs = 30 * 60_000;
  }
  if (!delayMs) return;
  const until = Date.now() + Math.min(delayMs + 1_000, 30 * 60_000);
  geminiModelBackoffUntil.set(model, until);
  console.log(`[Gemini] Backing off ${model} for ${Math.ceil((until - Date.now()) / 1000)}s.`);
}

async function askGemini(question, options = {}) {
  if (!GEMINI_API_KEY) {
    throw new Error('Gemini API key is not configured');
  }

  const configuredModels = options.models?.length
    ? [...new Set(options.models.filter(Boolean))]
    : GEMINI_MODELS;
  const now = Date.now();
  const models = configuredModels.filter(model => (geminiModelBackoffUntil.get(model) || 0) <= now);
  if (models.length === 0) {
    throw new Error('All Gemini models are temporarily rate-limited or unavailable');
  }
  let lastError = null;

  for (const model of models) {
    const attempts = options.attemptsPerModel ?? 2;
    for (let attempt = 1; attempt <= attempts; attempt++) {
      try {
        const answer = await requestGeminiModel(model, question, options);
        if (model !== models[0]) {
          console.log(`[Gemini] Used alternate model ${model}.`);
        }
        return answer;
      } catch (err) {
        lastError = err;
        const quotaOrAccess =
          err?.status === 400 ||
          err?.status === 403 ||
          err?.status === 404 ||
          err?.status === 429 ||
          /quota|rate|limit|not found|not supported|permission/i.test(String(err?.message || ''));
        const retryable =
          err?.status === 500 ||
          err?.status === 503 ||
          err?.name === 'AbortError' ||
          /network|fetch failed|ECONNRESET|ETIMEDOUT/i.test(String(err?.message || ''));
        console.log(
          `[Gemini] ${model} attempt ${attempt}/${attempts} failed: ` +
          `${err?.status || err?.name || 'error'} ${err.message}`
        );
        if (quotaOrAccess) {
          markGeminiModelBackoff(model, err);
          break;
        }
        if (!retryable || attempt === attempts) break;
        await new Promise(resolve => setTimeout(resolve, attempt * 1_500));
      }
    }
  }

  throw lastError || new Error('All Gemini models failed');
}

function classifyGeminiError(err) {
  const message = String(err?.message || '');
  const status = Number(err?.status) || 0;
  if (err?.name === 'AbortError') return 'TIMEOUT';
  if (status === 400) return 'BAD_REQUEST';
  if (status === 401 || status === 403) return 'AUTH';
  if (status === 404) return 'MODEL';
  if (status === 429) return 'QUOTA';
  if (status >= 500) return 'GEMINI_DOWN';
  if (/fetch is not defined/i.test(message)) return 'NODE_VERSION';
  if (/ENOTFOUND|ECONNRESET|ETIMEDOUT|network|fetch failed/i.test(message)) return 'NETWORK';
  return 'UNKNOWN';
}

async function handleWmCommand(username, question) {
  const usernameKey = username.toLowerCase();
  if (!ignoredUsernames.some(name => name.toLowerCase() === usernameKey)) {
    await sendPrivateMinecraftMessage(username, '[AI] This command is available only to whitelisted players.');
    return;
  }

  if (!GEMINI_API_KEY) {
    await sendPrivateMinecraftMessage(username, '[AI] Gemini API is not configured.');
    return;
  }
  if (!runtimeSettings.geminiEnabled) {
    await sendPrivateMinecraftMessage(username, '[AI] Gemini is disabled in the admin panel.');
    return;
  }

  const cleanQuestion = String(question || '').trim();
  if (!cleanQuestion) {
    await sendPrivateMinecraftMessage(username, '[AI] Usage: !wm <question>');
    return;
  }
  if (cleanQuestion.length > WM_MAX_QUESTION_LENGTH) {
    await sendPrivateMinecraftMessage(username, `[AI] Keep the question under ${WM_MAX_QUESTION_LENGTH} characters.`);
    return;
  }
  if (wmRequestsInFlight.has(usernameKey)) {
    await sendPrivateMinecraftMessage(username, '[AI] Your previous question is still being processed.');
    return;
  }

  const lastRequestAt = wmCommandCooldowns.get(usernameKey) || 0;
  const cooldownRemaining = runtimeSettings.messageCooldownMs - (Date.now() - lastRequestAt);
  if (cooldownRemaining > 0) {
    await sendPrivateMinecraftMessage(
      username,
      `[AI] Please wait ${Math.ceil(cooldownRemaining / 1000)} seconds before asking again.`
    );
    return;
  }

  wmCommandCooldowns.set(usernameKey, Date.now());
  wmRequestsInFlight.add(usernameKey);
  try {
    const answer = await askGemini(cleanQuestion, {
      maxOutputTokens: WM_MAX_OUTPUT_TOKENS,
      maxResponseLength: WM_MAX_RESPONSE_LENGTH
    });
    const chunks = splitMinecraftMessage(answer.replace(/[\r\n]+/g, ' '), WM_CHAT_CHUNK_LENGTH);
    for (let index = 0; index < chunks.length; index++) {
      if (!bot?.entity) return;
      const prefix = chunks.length > 1 ? `[${index + 1}/${chunks.length}] ` : '';
      const message = `${prefix}${chunks[index]}`;
      sendMinecraftChat(message);
      await sendGameChatMessageToDiscord(bot.username, message, { allowMentions: false });
      await new Promise(resolve => setTimeout(resolve, 400));
    }
  } catch (err) {
    const errorCode = classifyGeminiError(err);
    const diagnostic = [
      `Player: ${username}`,
      `Model: ${err?.model || GEMINI_MODEL}`,
      `Code: ${errorCode}`,
      `HTTP: ${err?.status || 'none'}`,
      `Gemini status: ${err?.geminiCode || 'none'}`,
      `Reason: ${String(err?.message || err).slice(0, 1000)}`
    ].join('\n');
    console.error(`[Gemini] Request failed\n${diagnostic}`);
    sendOwnerDM('Gemini command failed', diagnostic, 16711680).catch(() => {});
    await sendPrivateMinecraftMessage(
      username,
      `[AI] Request failed (${errorCode}). Please try again later.`
    );
  } finally {
    wmRequestsInFlight.delete(usernameKey);
  }
}

function extractMinecraftUsernameFromDiscordMessage(message) {
  if (!message) return null;

  for (const embed of message.embeds?.values?.() || message.embeds || []) {
    const authorName = embed.author?.name?.trim();
    const authorUrl = embed.author?.url || '';
    const urlMatch = authorUrl.match(/namemc\.com\/profile\/([A-Za-z0-9_]{1,16})/i);

    if (urlMatch) return urlMatch[1];
    if (/^[A-Za-z0-9_]{1,16}$/.test(authorName)) return authorName;
  }

  return null;
}

async function getReplyMinecraftUsername(message) {
  const reference = message.reference;
  if (!reference?.messageId) return null;

  try {
    const channel = reference.channelId && reference.channelId !== message.channel.id
      ? await discordClient.channels.fetch(reference.channelId)
      : message.channel;

    if (!channel?.isTextBased?.()) return null;

    const repliedMessage = await channel.messages.fetch(reference.messageId);
    return extractMinecraftUsernameFromDiscordMessage(repliedMessage);
  } catch (e) {
    debugLog('[Chat] Failed to fetch replied message:', e.message);
    return null;
  }
}

function consumeOutboundSelfEcho(message) {
  const normalized = normalizeOutboundChat(message);
  const cutoff = Date.now() - 10_000;

  for (const [key, timestamps] of recentOutboundChat.entries()) {
    const fresh = timestamps.filter(timestamp => timestamp >= cutoff);
    if (fresh.length > 0) recentOutboundChat.set(key, fresh);
    else recentOutboundChat.delete(key);
  }

  let matchedKey = normalized;
  let timestamps = recentOutboundChat.get(matchedKey);

  // Some servers corrupt unsupported characters (notably emoji) in the echoed
  // chat event. Fall back to the stable ASCII portion so that echo is still
  // consumed instead of being mirrored back to Discord as a second message.
  if (!timestamps || timestamps.length === 0) {
    const comparable = normalizeOutboundEchoComparable(normalized);
    if (comparable) {
      for (const [key, pendingTimestamps] of recentOutboundChat.entries()) {
        if (pendingTimestamps.length > 0 && normalizeOutboundEchoComparable(key) === comparable) {
          matchedKey = key;
          timestamps = pendingTimestamps;
          break;
        }
      }
    }
  }

  if (!timestamps || timestamps.length === 0) return false;
  timestamps.shift();
  if (timestamps.length === 0) recentOutboundChat.delete(matchedKey);
  return true;
}


// Helper function to send messages to Discord
async function sendDiscordNotification(message, color = 3447003) {
  if (!DISCORD_CHANNEL_ID || !discordClient || !discordClient.isReady()) {
    console.log('[Discord] Bot not ready or no channel configured. Skipped.');
    return;
  }
  try {
    const channel = await discordClient.channels.fetch(DISCORD_CHANNEL_ID);
    if (channel && channel.isTextBased()) {
      await channel.send({
        embeds: [{
          description: message,
          color,
          timestamp: new Date()
        }]
      });
    }
  } catch (e) {
    console.error('[Discord Bot] Failed to send:', e.message);
  }
}

async function sendDiscordStatusMention({ playerName, distance, serverAction = 'Bot is leaving the server.' }) {
  if (!DISCORD_CHANNEL_ID || !discordClient || !discordClient.isReady()) {
    console.log('[Discord] Bot not ready or no channel configured. Skipped mention.');
    return;
  }
  try {
    const channel = await discordClient.channels.fetch(DISCORD_CHANNEL_ID);
    if (channel && channel.isTextBased()) {
      const mentionPrefix = `<@${DISCORD_OWNER_ID}>`;
      const sentMessage = await channel.send({
        content: mentionPrefix,
        embeds: [{
          title: '🚨 Security Alert',
          description: [
            `A non-whitelisted player was detected near the bot.`,
            '',
            `**Player:** ${playerName}`,
            `**Distance:** ${distance} blocks`,
            `**Action:** ${serverAction}`
          ].join('\n'),
          color: 16711680,
          footer: { text: `${ADMIN_PANEL_BOT_NAME} Security System` },
          timestamp: new Date()
        }],
        components: buildSecurityAlertComponents(playerName)
      });
      if (sentMessage && !excludedMessageIds.includes(sentMessage.id)) {
        excludedMessageIds.push(sentMessage.id);
      }
    }
  } catch (e) {
    console.error('[Discord Bot] Failed to send mention:', e.message);
  }
}

function clampSelectPage(page, items) {
  const totalPages = Math.max(1, Math.ceil((items?.length || 0) / 25));
  const numericPage = Number.isFinite(page) ? page : 0;
  return Math.min(Math.max(0, numericPage), totalPages - 1);
}

function buildPagedSelectRow(items, customIdBase, placeholder, page = 0, disabledLabel = 'Nothing available') {
  const safePage = clampSelectPage(page, items);
  const pageItems = items.slice(safePage * 25, safePage * 25 + 25);

  const menu = new StringSelectMenuBuilder()
    .setCustomId(`${customIdBase}_${safePage}`)
    .setPlaceholder(placeholder);

  if (pageItems.length === 0) {
    menu
      .setDisabled(true)
      .addOptions(
        new StringSelectMenuOptionBuilder()
          .setLabel(disabledLabel)
          .setValue(`${customIdBase}_empty`)
      );
  } else {
    menu.addOptions(
      pageItems.map(username =>
        new StringSelectMenuOptionBuilder().setLabel(username).setValue(b64encode(username))
      )
    );
  }

  return new ActionRowBuilder().addComponents(menu);
}

function buildWhitelistPagerRow(target, currentPage, totalPages, addPage, deletePage) {
  if (totalPages <= 1) return null;

  const prevAddPage = target === 'add' ? currentPage - 1 : addPage;
  const nextAddPage = target === 'add' ? currentPage + 1 : addPage;
  const prevDeletePage = target === 'delete' ? currentPage - 1 : deletePage;
  const nextDeletePage = target === 'delete' ? currentPage + 1 : deletePage;

  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`whitelist_page_${prevAddPage}_${prevDeletePage}`)
      .setLabel('Previous')
      .setEmoji(UI_BUTTON_EMOJIS.arrowLeftCurved)
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(currentPage <= 0),
    new ButtonBuilder()
      .setCustomId(`whitelist_page_info_${target}_${currentPage}`)
      .setLabel(`${target === 'add' ? 'Add list' : 'Whitelist'} ${currentPage + 1}/${totalPages}`)
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(true),
    new ButtonBuilder()
      .setCustomId(`whitelist_page_${nextAddPage}_${nextDeletePage}`)
      .setLabel('Next')
      .setEmoji(UI_BUTTON_EMOJIS.arrowRightCurved)
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(currentPage >= totalPages - 1)
  );
}

function formatPageList(items, page, emptyText) {
  const safePage = clampSelectPage(page, items);
  const pageItems = items.slice(safePage * 25, safePage * 25 + 25);
  if (pageItems.length === 0) return emptyText;
  return pageItems.map(username => `• ${username}`).join('\n');
}

async function getWhitelistEntriesForUI() {
  if (pool) {
    try {
      const res = await pool.query('SELECT username FROM whitelist ORDER BY username ASC');
      return res.rows.map(r => r.username);
    } catch (dbErr) {
      console.error('[DB] Failed to fetch whitelist for UI, falling back to file:', dbErr.message);
    }
  }
  return loadWhitelist();
}

function buildWhitelistManagementView(entries, addCandidates, notice = '', color = 3447003, addPage = 0, deletePage = 0) {
  const safeAddPage = clampSelectPage(addPage, addCandidates);
  const safeDeletePage = clampSelectPage(deletePage, entries);
  const addTotalPages = Math.max(1, Math.ceil(addCandidates.length / 25));
  const deleteTotalPages = Math.max(1, Math.ceil(entries.length / 25));

  const components = [
    buildPagedSelectRow(addCandidates, 'add_whitelist_select', 'Add to Whitelist (online)', safeAddPage, 'No online players available'),
    buildPagedSelectRow(entries, 'delete_whitelist_select', 'Delete from Whitelist', safeDeletePage, 'Whitelist is empty')
  ];

  const addPagerRow = buildWhitelistPagerRow('add', safeAddPage, addTotalPages, safeAddPage, safeDeletePage);
  const deletePagerRow = buildWhitelistPagerRow('delete', safeDeletePage, deleteTotalPages, safeAddPage, safeDeletePage);
  if (addPagerRow) components.push(addPagerRow);
  if (deletePagerRow) components.push(deletePagerRow);
  components.push(...createAdminBackComponents());

  const description = [
    notice || null,
    `Total whitelist: **${entries.length}**`,
    `Add candidates online: **${addCandidates.length}**`,
    '',
    `**Online players page ${safeAddPage + 1}/${addTotalPages}:**`,
    formatPageList(addCandidates, safeAddPage, '_No online players available._'),
    '',
    `**Whitelist page ${safeDeletePage + 1}/${deleteTotalPages}:**`,
    formatPageList(entries, safeDeletePage, '_Whitelist is empty._'),
    (addTotalPages > 1 || deleteTotalPages > 1) ? '\n_Use the buttons below to browse all pages._' : null
  ].filter(part => part !== null).join('\n');

  return {
    embeds: [{
      title: 'Whitelist Management',
      description,
      color,
      timestamp: new Date()
    }],
    components
  };
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
const canonicalPlayerNames = new Map([
  [appConfig.minecraft.adminUsername.toLowerCase().replace(/_+$/, ''), appConfig.minecraft.adminUsername]
]);

function getCanonicalWhitelistUsername(username) {
  const normalized = String(username || '').toLowerCase().replace(/_+$/, '');
  if (!normalized) return null;

  const whitelistMatches = ignoredUsernames
    .filter(name => name.toLowerCase().replace(/_+$/, '') === normalized);
  if (whitelistMatches.length === 0) return null;

  return canonicalPlayerNames.get(normalized) ||
    whitelistMatches.sort((a, b) => b.length - a.length)[0];
}

function getCurrentTpsDisplay() {
  return realTps !== null
    ? realTps.toFixed(1)
    : tpsHistory.length > 0
      ? (tpsHistory.reduce((a, b) => a + b, 0) / tpsHistory.length).toFixed(1)
      : 'Calculating...';
}

function getCurrentTpsNumber() {
  if (realTps !== null && Number.isFinite(realTps)) return realTps;
  if (tpsHistory.length === 0) return null;
  return tpsHistory.reduce((a, b) => a + b, 0) / tpsHistory.length;
}

function getBotPingDisplay() {
  const ping = bot?.player?.ping ?? bot?.players?.[bot.username]?.ping;
  return Number.isFinite(ping) ? `${Math.round(ping)} ms` : 'N/A';
}

async function recordTpsSample(force = false) {
  if (!pool) return;
  const tps = getCurrentTpsNumber();
  if (!Number.isFinite(tps)) return;
  const now = Date.now();
  if (!force && now - lastTpsSampleAt < 60_000) return;
  lastTpsSampleAt = now;

  try {
    await pool.query(
      'INSERT INTO bot_tps_samples (tps) VALUES ($1)',
      [Math.max(0, Math.min(20, Number(tps.toFixed(2))))]
    );
    await pool.query("DELETE FROM bot_tps_samples WHERE sampled_at < NOW() - INTERVAL '14 days'");
  } catch (err) {
    console.error('[DB] Failed to record TPS sample:', err.message);
  }
}

async function getDailyTpsAverages(days = 7) {
  if (!pool) return [];
  try {
    const result = await pool.query(`
      WITH dates AS (
        SELECT generate_series(
          (NOW() AT TIME ZONE 'Europe/Kyiv')::date - ($1::int - 1),
          (NOW() AT TIME ZONE 'Europe/Kyiv')::date,
          INTERVAL '1 day'
        )::date AS sample_date
      )
      SELECT TO_CHAR(dates.sample_date, 'DD.MM') AS label,
             ROUND(AVG(samples.tps)::numeric, 1) AS avg_tps
      FROM dates
      LEFT JOIN bot_tps_samples samples
        ON (samples.sampled_at AT TIME ZONE 'Europe/Kyiv')::date = dates.sample_date
      GROUP BY dates.sample_date
      ORDER BY dates.sample_date DESC
    `, [days]);
    return result.rows.map(row => ({
      label: row.label,
      avgTps: row.avg_tps == null ? null : Number(row.avg_tps)
    }));
  } catch (err) {
    console.error('[DB] Failed to load TPS averages:', err.message);
    return [];
  }
}

async function recordNearbyPlayerSighting(username, distance) {
  if (!pool || !username) return;
  const key = String(username).toLowerCase();
  const now = Date.now();
  if (now - (nearbyPlayerSightingWriteAt.get(key) || 0) < 60_000) return;
  nearbyPlayerSightingWriteAt.set(key, now);

  try {
    await pool.query(`
      INSERT INTO nearby_player_sightings (username, last_seen, distance)
      VALUES ($1, NOW(), $2)
      ON CONFLICT (username)
      DO UPDATE SET last_seen = NOW(),
                    distance = EXCLUDED.distance
    `, [username, Math.max(0, Math.round(Number(distance) || 0))]);
  } catch (err) {
    console.error('[DB] Failed to record nearby player sighting:', err.message);
  }
}

async function getRecentNearbyPlayerSightings(limit = 5) {
  if (!pool) return [];
  try {
    const result = await pool.query(`
      SELECT username,
             distance,
             EXTRACT(EPOCH FROM (NOW() - last_seen))::BIGINT AS seconds_ago
      FROM nearby_player_sightings
      ORDER BY last_seen DESC
      LIMIT $1
    `, [limit]);
    return result.rows.map(row => ({
      username: row.username,
      distance: Number(row.distance) || 0,
      secondsAgo: Number(row.seconds_ago) || 0
    }));
  } catch (err) {
    console.error('[DB] Failed to load nearby player sightings:', err.message);
    return [];
  }
}

function getDiscordPresenceText() {
  if (!bot?.entity) {
    return shouldReconnect
      ? `Reconnecting to ${appConfig.minecraft.serverName}`
      : `Paused on ${appConfig.minecraft.serverName}`;
  }

  const playerCount = Object.keys(bot.players || {}).length;
  return `${playerCount} players · ${getCurrentTpsDisplay()} TPS · ${appConfig.minecraft.serverName}`;
}

function updateDiscordPresence({ force = false } = {}) {
  if (!discordClient?.user) return;

  const presenceText = getDiscordPresenceText();
  const now = Date.now();
  if (!force && presenceText === lastPresenceText) return;
  if (!force && now - lastPresenceUpdateAt < 15_000) return;

  discordClient.user.setPresence({
    status: 'online',
    activities: [{
      name: presenceText,
      type: ActivityType.Playing
    }]
  });
  lastPresenceText = presenceText;
  lastPresenceUpdateAt = now;
}

function escapeStatusDescriptionText(value) {
  return String(value || '')
    .replace(/\\/g, '\\\\')
    .replace(/([`*_~|>])/g, '\\$1')
    .replace(/@/g, '@\u200b');
}

function escapeStatusInlineCodeText(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\\/g, '\\\\')
    .replace(/`/g, '\\`')
    .replace(/@/g, '@\u200b');
}

function getLastBotPublicChatStatusLine() {
  const phrase = lastBotPublicChatPhrase
    ? escapeStatusInlineCodeText(lastBotPublicChatPhrase)
    : 'No bot chat yet';
  return `${lastBotPublicChatEmoji || STATUS_EMOJIS.axolotlBucket} > \`${phrase}\``;
}

function getStatusDescription() {
  const reasonLine = lastDisconnectReason ? `\n${STATUS_EMOJIS.map} Reason: ${lastDisconnectReason}` : '';

  if (!bot || !bot.entity) {
    if (!shouldReconnect) {
      return `${lastDisconnectReason ? `${STATUS_EMOJIS.pause} ${lastDisconnectReason}` : `${STATUS_EMOJIS.pause} Bot paused`}\n${getWheatMagnateStatusLine()}`;
    }
    if (shouldReconnect) {
      return `${STATUS_EMOJIS.update} Trying to reconnect.\n${getWheatMagnateStatusLine()}`;
    }
    return `❌ Bot not connected${reasonLine}`;
  }

  const playerCount = Object.keys(bot.players || {}).length;
  const onlinePlayers = Object.values(bot.players || {}).map(p => p.username);
  const whitelistOnline = [...new Set(onlinePlayers
    .filter(username => username.toLowerCase() !== bot.username.toLowerCase())
    .map(getCanonicalWhitelistUsername)
    .filter(Boolean))];
  const nearbyPlayers = getNearbyPlayers();
  const avgTps = getCurrentTpsDisplay();

  const nearbyNames = nearbyPlayers
    .map(player => getCanonicalWhitelistUsername(player.username) || player.username)
    .map(username => formatPlayerHeadName(username));
  const whitelistOnlineDisplay = formatCompactInlineList(
    whitelistOnline.map(username => formatPlayerHeadName(username))
  );
  const obsidianMined = `${formatCompactCount(obsidianStats.sessionMined)}/${formatCompactCount(obsidianStats.totalMined)}`;
  return `${STATUS_EMOJIS.serverPing} Bot **${bot.username}** connected to \`${config.host}\`\n` +
    `${STATUS_EMOJIS.players} Players online: ${playerCount}\n` +
    `${STATUS_EMOJIS.nearby} Players nearby: ${formatCompactInlineList(nearbyNames)}\n` +
    `${STATUS_EMOJIS.tps} TPS: ${avgTps}\n` +
    `${STATUS_EMOJIS.food} Food: ${Math.round(bot.food * 2) / 2}/20\n` +
    `${STATUS_EMOJIS.health} Health: ${Math.round(bot.health * 2) / 2}/20\n` +
    `${STATUS_EMOJIS.whitelist} Whitelist online: ${whitelistOnlineDisplay}\n` +
    `${FARM_EMOJIS.netheritePickaxe} Obsidian mined: ${obsidianMined}\n\n` +
    `${getWheatMagnateStatusLine()}`;
}

function getServerStatusTitle() {
  return bot?.entity
    ? 'Server Status'
    : `${STATUS_EMOJIS.serverUnreachable} Server Status`;
}

function formatCompactInlineList(entries, maxVisible = 8) {
  if (!entries || entries.length === 0) return 'None';
  const visible = entries.slice(0, maxVisible);
  const remaining = entries.length - visible.length;
  return remaining > 0
    ? `${visible.join(', ')} +${remaining} more`
    : visible.join(', ');
}

function formatInlineCodeUsernameList(usernames) {
  return usernames
    .map(username => `\`${String(username || 'Unknown').replace(/`/g, '\\`')}\``)
    .join(', ');
}

function chunkInlineCodeUsernameList(usernames, maxLength = 1000) {
  const chunks = [];
  let chunk = '';

  for (const username of usernames) {
    const entry = `\`${String(username || 'Unknown').replace(/`/g, '\\`')}\``;
    const nextChunk = chunk ? `${chunk}, ${entry}` : entry;
    if (nextChunk.length > maxLength && chunk) {
      chunks.push(chunk);
      chunk = entry;
    } else {
      chunk = nextChunk;
    }
  }

  if (chunk) chunks.push(chunk);
  return chunks.length > 0 ? chunks : [formatInlineCodeUsernameList(usernames)];
}

function buildRosterFields(title, usernames, { empty = 'None online', withHeads = false, inlineCodeList = false } = {}) {
  const lines = usernames && usernames.length > 0
    ? (inlineCodeList
        ? chunkInlineCodeUsernameList(usernames)
        : usernames.map(username => withHeads
            ? formatPlayerHeadName(username, 'bold')
            : `\`${String(username || 'Unknown')}\``))
    : [empty];
  const fields = [];
  let value = '';

  for (const line of lines) {
    const nextValue = value ? `${value}\n${line}` : line;
    if (nextValue.length > 1000 && value) {
      fields.push({ name: fields.length === 0 ? title : `${title} continued`, value, inline: false });
      value = line;
    } else {
      value = nextValue;
    }
  }

  fields.push({ name: fields.length === 0 ? title : `${title} continued`, value, inline: false });
  return fields;
}

function buildOnlinePlayersMessage() {
  const allOnlinePlayers = [...new Set(Object.values(bot?.players || {})
    .map(player => player.username)
    .filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
  const whitelistOnline = allOnlinePlayers.filter(username =>
    ignoredUsernames.some(name => name.toLowerCase() === username.toLowerCase())
  );
  const otherPlayers = allOnlinePlayers.filter(username =>
    !ignoredUsernames.some(name => name.toLowerCase() === username.toLowerCase())
  );
  const whitelistCount = whitelistOnline.length;
  const otherCount = otherPlayers.length;
  const totalCount = allOnlinePlayers.length;
  const summary = totalCount > 0
    ? `${STATUS_EMOJIS.players} **${totalCount} online**  |  ${STATUS_EMOJIS.whitelist} **${whitelistCount} whitelist**  |  ${STATUS_EMOJIS.nearby} **${otherCount} others**`
    : `${STATUS_EMOJIS.players} No players online right now.`;
  const fields = [
    ...buildRosterFields(`${STATUS_EMOJIS.whitelist} Whitelist (${whitelistCount})`, whitelistOnline, {
      empty: 'No whitelist players online.',
      withHeads: true
    }),
    ...buildRosterFields(`${STATUS_EMOJIS.players} Others (${otherCount})`, otherPlayers, {
      empty: 'No other players online.',
      inlineCodeList: true
    })
  ];

  const options = whitelistOnline.slice(0, 25).map(username =>
    new StringSelectMenuOptionBuilder()
      .setLabel(username)
      .setValue(b64encode(username))
  );
  const components = [];
  if (options.length > 0) {
    components.push(
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('message_select')
          .setPlaceholder('Message a whitelist player')
          .addOptions(options)
      )
    );
  }

  return {
    embeds: [{
      title: `${STATUS_EMOJIS.players} Online Players`,
      description: summary,
      fields,
      color: totalCount > 0 ? 3447003 : 10066329,
      timestamp: new Date(),
      footer: options.length > 0
        ? { text: 'Use the menu below to send a private Minecraft message.' }
        : { text: 'Whitelist players will appear in the message menu when online.' }
    }],
    components
  };
}

function buildAdminServerStatusValue() {
  if (!bot || !bot.entity) {
    return getStatusDescription();
  }

  const playerCount = Object.keys(bot.players || {}).length;
  const onlinePlayers = Object.values(bot.players || {}).map(p => p.username);
  const whitelistOnline = [...new Set(onlinePlayers
    .filter(username => username.toLowerCase() !== bot.username.toLowerCase())
    .map(getCanonicalWhitelistUsername)
    .filter(Boolean))];
  const nearbyPlayers = getNearbyPlayers();
  const nearbyNameEntries = nearbyPlayers
    .map(player => getCanonicalWhitelistUsername(player.username) || player.username)
    .map(username => formatPlayerHeadName(username));
  const nearbyNames = formatCompactInlineList(nearbyNameEntries);
  const whitelistOnlineDisplay = formatCompactInlineList(
    whitelistOnline.map(u => formatPlayerHeadName(u))
  );
  const obsidianMined = `${formatCompactCount(obsidianStats.sessionMined)}/${formatCompactCount(obsidianStats.totalMined)}`;

  return [
    getWheatMagnateStatusLine(),
    `${STATUS_EMOJIS.players} Players online: ${playerCount}`,
    `${STATUS_EMOJIS.nearby} Players nearby: ${nearbyNames}`,
    `${STATUS_EMOJIS.tps} TPS: ${getCurrentTpsDisplay()}`,
    `${STATUS_EMOJIS.food} Food: ${Math.round(bot.food * 2) / 2}/20`,
    `${STATUS_EMOJIS.health} Health: ${Math.round(bot.health * 2) / 2}/20`,
    `${STATUS_EMOJIS.nearby} Following: ${followFeature.getStatus().targetUsername || 'None'}`,
    `${STATUS_EMOJIS.whitelist} Whitelist online: ${whitelistOnlineDisplay}`,
    `${FARM_EMOJIS.netheritePickaxe} Obsidian mined: ${obsidianMined}`
  ].join('\n');
}

function createServerStatusButtons() {
  return [
    new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId('seen_button')
          .setLabel('Seen')
          .setEmoji(STATUS_BUTTON_EMOJIS.seen)
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId('playtime_button')
          .setLabel('Playtime')
          .setEmoji(STATUS_BUTTON_EMOJIS.playtime)
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId('playerlist_button')
          .setLabel('Players')
          .setEmoji(STATUS_BUTTON_EMOJIS.players)
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId('mentions_button')
          .setLabel('Mentions')
          .setEmoji(STATUS_BUTTON_EMOJIS.mentions)
          .setStyle(ButtonStyle.Secondary)
      )
  ];
}

function createAdminPanelButtons() {
  const isPaused = !shouldReconnect;
  return [
    new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId('pause_resume_button')
          .setLabel(isPaused ? 'Resume' : 'Pause')
          .setEmoji(isPaused ? STATUS_BUTTON_EMOJIS.resume : STATUS_BUTTON_EMOJIS.pause)
          .setStyle(isPaused ? ButtonStyle.Success : ButtonStyle.Danger)
      ),
    new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId('drop_button')
          .setLabel('Drop')
          .setEmoji(STATUS_BUTTON_EMOJIS.drop)
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId('chat_setting_button')
          .setLabel('Chat')
          .setEmoji(STATUS_BUTTON_EMOJIS.chatSettings)
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId('obsidian_farm_button')
          .setLabel('Obsidian')
          .setEmoji(STATUS_BUTTON_EMOJIS.obsidian)
          .setStyle((farm.getStatus().enabled || obsidianStats.desiredEnabled) ? ButtonStyle.Success : ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId('follow_button')
          .setLabel('Follow')
          .setEmoji(STATUS_BUTTON_EMOJIS.players)
          .setStyle(followFeature.getStatus().enabled ? ButtonStyle.Success : ButtonStyle.Secondary)
      ),
    new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId('admin_child_status')
          .setLabel('Child')
          .setEmoji(UI_BUTTON_EMOJIS.bookYellow)
          .setStyle(growingChild?.getStatus().enabled ? ButtonStyle.Success : ButtonStyle.Danger)
      )
  ];
}

function createAdminSettingsSelects() {
  const dangerSelect = new StringSelectMenuBuilder()
    .setCustomId('admin_danger_radius_select')
    .setPlaceholder(`Danger radius: ${runtimeSettings.dangerRadius} blocks`)
    .addOptions(DANGER_RADIUS_OPTIONS.map(value =>
      new StringSelectMenuOptionBuilder()
        .setLabel(`${value} blocks`)
        .setValue(String(value))
        .setDefault(value === runtimeSettings.dangerRadius)
    ));
  const cooldownSelect = new StringSelectMenuBuilder()
    .setCustomId('admin_message_cooldown_select')
    .setPlaceholder(`Message cooldown: ${Math.round(runtimeSettings.messageCooldownMs / 1000)}s`)
    .addOptions(MESSAGE_COOLDOWN_OPTIONS.map(value =>
      new StringSelectMenuOptionBuilder()
        .setLabel(value === 0 ? 'No cooldown' : `${Math.round(value / 1000)} seconds`)
        .setValue(String(value))
        .setDefault(value === runtimeSettings.messageCooldownMs)
    ));
  return [
    new ActionRowBuilder().addComponents(dangerSelect),
    new ActionRowBuilder().addComponents(cooldownSelect)
  ];
}

function buildChatSettingsPayload() {
  const allOnlinePlayers = bot ? Object.values(bot.players || {}).map(p => p.username) : [];
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

  const components = [
    ...createChatSettingsHeaderComponents(),
    ...createAdminSettingsSelects()
  ];
  if (ignoreOptions.length > 0) {
    components.push(new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('ignore_select')
        .setPlaceholder('Select player to ignore')
        .addOptions(ignoreOptions.slice(0, 25))
    ));
  }
  if (unignoreOptions.length > 0) {
    components.push(new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('unignore_select')
        .setPlaceholder('Select player to unignore')
        .addOptions(unignoreOptions.slice(0, 25))
    ));
  }

  return {
    embeds: [{
      title: 'Chat Settings',
      description: [
        `Whitelist mode: **${runtimeSettings.whitelistMode ? 'On' : 'Off'}**`,
        `Danger radius: **${runtimeSettings.dangerRadius} blocks**`,
        `Message cooldown: **${Math.round(runtimeSettings.messageCooldownMs / 1000)}s**`,
        `Ignored chat users: **${ignoredChatUsernames.length}**`,
        bot ? 'Manage ignored online players below.' : 'Minecraft bot is offline. Online ignore menus are unavailable.'
      ].join('\n'),
      color: 3447003,
      timestamp: new Date()
    }],
    components
  };
}

function buildFollowManagementPayload(message = '', color = 3447003) {
  const status = followFeature.getStatus();
  const nearby = getNearbyPlayers();
  const options = nearby
    .filter(player => player.username)
    .slice(0, 25)
    .map(player =>
      new StringSelectMenuOptionBuilder()
        .setLabel(player.username)
        .setDescription(`${player.distance} blocks away`)
        .setValue(b64encode(player.username))
    );

  const components = [];
  if (options.length > 0) {
    components.push(
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('follow_select')
          .setPlaceholder('Choose a nearby player to follow')
          .addOptions(options)
      )
    );
  }

  if (status.enabled) {
    components.push(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('follow_stop')
          .setLabel('Stop following')
          .setEmoji(STATUS_BUTTON_EMOJIS.pause)
          .setStyle(ButtonStyle.Danger)
      )
    );
  }

  components.push(...createAdminBackComponents());

  return {
    embeds: [{
      title: 'Follow',
      description: [
        message || (bot?.entity ? 'Select a nearby player. The bot will only walk; block breaking is disabled.' : 'Bot is offline.'),
        `Current target: **${status.targetUsername || 'None'}**`,
        options.length > 0 ? `Nearby players: **${nearby.length}**` : 'No nearby players visible.'
      ].join('\n'),
      color,
      timestamp: new Date()
    }],
    components
  };
}

function formatRelativeShort(secondsAgo) {
  const seconds = Math.max(0, Number(secondsAgo) || 0);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ${minutes % 60}m ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ${hours % 24}h ago`;
}

function formatSeenTimestamp(timestamp) {
  if (!timestamp) return 'Never seen';
  const diffSecs = Math.max(0, Math.floor((Date.now() - new Date(timestamp).getTime()) / 1000));
  if (diffSecs < 60) return `${diffSecs}s ago`;
  const diffMins = Math.floor(diffSecs / 60);
  if (diffMins < 60) return `${diffMins}m ${diffSecs % 60}s ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ${diffMins % 60}m ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ${diffHours % 24}h ago`;
}

function createSeenActivityComponents(messageId) {
  const buttons = [
    new ButtonBuilder()
      .setCustomId('seen_non_whitelist_search')
      .setLabel('Search non-whitelist')
      .setEmoji(STATUS_BUTTON_EMOJIS.seen)
      .setStyle(ButtonStyle.Secondary)
  ];

  if (messageId) {
    buttons.push(
      new ButtonBuilder()
        .setCustomId(`remove_${messageId}`)
        .setLabel('Remove')
        .setStyle(ButtonStyle.Danger)
    );
  }

  return [
    new ActionRowBuilder()
      .addComponents(...buttons)
  ];
}

function buildNonWhitelistSeenSearchEmbed(query, result) {
  const players = result.players || [];
  const description = result.error
    ? result.error
    : players.length === 0
      ? `No non-whitelist players found for \`${query}\`.`
      : players
          .map(player => {
            const status = player.is_online ? 'Online' : formatSeenTimestamp(player.last_seen);
            return `${formatPlayerHeadName(player.username, 'bold')} - ${status}`;
          })
          .join('\n');

  return {
    title: `${STATUS_EMOJIS.seen} Non-whitelist Search: ${query}`,
    description,
    color: result.error ? 16711680 : 3447003,
    timestamp: new Date(),
    footer: players.length >= 25 ? { text: 'Showing first 25 matches. Type more letters to narrow it down.' } : undefined
  };
}

function formatDailyTpsAverages(rows) {
  if (!rows || rows.length === 0) return 'No TPS samples yet.';
  return rows
    .map(row => `\`${row.label}\` ${row.avgTps == null ? 'N/A' : row.avgTps.toFixed(1)}`)
    .join(' | ');
}

function formatNearbySightings(rows) {
  if (!rows || rows.length === 0) return 'No recent nearby players.';
  return rows
    .map(row => `${formatPlayerHeadName(row.username, 'bold')} - ${row.distance} blocks - ${formatRelativeShort(row.secondsAgo)}`)
    .join('\n');
}

function getAdminPanelStatusSnapshot() {
  if (!bot || !bot.entity) {
    return null;
  }

  const playerCount = Object.keys(bot.players || {}).length;
  const onlinePlayers = Object.values(bot.players || {}).map(p => p.username);
  const whitelistOnline = [...new Set(onlinePlayers
    .filter(username => username.toLowerCase() !== bot.username.toLowerCase())
    .map(getCanonicalWhitelistUsername)
    .filter(Boolean))];
  const nearbyPlayers = getNearbyPlayers();
  const nearbyNameEntries = nearbyPlayers
    .map(player => getCanonicalWhitelistUsername(player.username) || player.username)
    .map(username => formatPlayerHeadName(username));
  const whitelistOnlineEntries = whitelistOnline.map(username => formatPlayerHeadName(username));

  return {
    playerCount,
    nearbyNames: formatCompactInlineList(nearbyNameEntries, 5),
    whitelistOnline: formatCompactInlineList(whitelistOnlineEntries, 5),
    tps: getCurrentTpsDisplay(),
    food: `${Math.round(bot.food * 2) / 2}/20`,
    health: `${Math.round(bot.health * 2) / 2}/20`,
    followTarget: followFeature.getStatus().targetUsername || 'None',
    obsidianMined: `${formatCompactCount(obsidianStats.sessionMined)}/${formatCompactCount(obsidianStats.totalMined)}`
  };
}

function compactInventoryItem(item) {
  const maxDurability = Number(item.maxDurability);
  const durabilityUsed = Number(item.durabilityUsed);
  const remainingPercent = maxDurability > 0 && Number.isFinite(durabilityUsed)
    ? Math.max(0, Math.min(100, ((maxDurability - durabilityUsed) / maxDurability) * 100))
    : null;

  return {
    name: item.name,
    displayName: item.displayName || item.name,
    count: item.count,
    slot: item.slot,
    remainingPercent,
    maxDurability: maxDurability > 0 ? maxDurability : null,
    durabilityUsed: Number.isFinite(durabilityUsed) ? durabilityUsed : null
  };
}

function compactInventoryItems(items = []) {
  return items
    .map(compactInventoryItem);
}

function getCompactBotInventorySlots() {
  return (bot.inventory?.slots || [])
    .filter(item => item && Number(item.slot) >= 9 && Number(item.slot) <= 45)
    .map(compactInventoryItem);
}

function getBotStatusSnapshot() {
  const connected = Boolean(bot?.entity);
  const position = connected && bot.entity.position
    ? {
        x: Math.round(bot.entity.position.x * 10) / 10,
        y: Math.round(bot.entity.position.y * 10) / 10,
        z: Math.round(bot.entity.position.z * 10) / 10
      }
    : null;
  const armorItems = connected
    ? (bot.inventory?.slots || [])
        .slice(5, 9)
        .filter(Boolean)
        .map(compactInventoryItem)
    : [];
  const inventoryItems = connected ? getCompactBotInventorySlots() : [];

  return {
    connected,
    status: connected ? 'online' : shouldReconnect ? 'reconnecting' : 'paused',
    username: bot?.username || ADMIN_PANEL_BOT_NAME,
    server: appConfig.minecraft.serverName,
    uptimeMs: connected ? Math.max(0, Date.now() - startTime) : 0,
    reconnectInMs: !connected && reconnectTimestamp ? Math.max(0, reconnectTimestamp - Date.now()) : null,
    lastDisconnectReason,
    lastOfflineReason,
    health: connected && bot.health != null ? Math.round(bot.health * 2) / 2 : null,
    food: connected && bot.food != null ? Math.round(bot.food * 2) / 2 : null,
    armor: armorItems,
    armorCount: armorItems.length,
    ping: connected ? (bot.player?.ping ?? null) : null,
    gameMode: connected ? (bot.game?.gameMode || null) : null,
    dimension: connected ? (bot.game?.dimension || null) : null,
    position,
    heldItem: connected && bot.heldItem
      ? compactInventoryItem(bot.heldItem)
      : null,
    inventory: inventoryItems,
    inventorySlotsUsed: inventoryItems.length,
    nearbyPlayers: connected ? getNearbyPlayers() : [],
    xpLevel: connected ? (bot.experience?.level ?? null) : null,
    followTarget: followFeature.getStatus().targetUsername || null,
    obsidian: {
      enabled: farm.getStatus().enabled,
      desiredEnabled: obsidianStats.desiredEnabled,
      config: farm.getStatus().config
    },
    child: {
      enabled: growingChild?.getStatus().enabled ?? false,
      geminiEnabled: runtimeSettings.geminiEnabled,
      publicSpeech: runtimeSettings.childPublicSpeech
    },
    observedAt: new Date().toISOString()
  };
}

async function writeBotStatusSnapshot() {
  if (!pool) return;
  const snapshot = getBotStatusSnapshot();
  try {
    await pool.query(`
      INSERT INTO bot_status_snapshots (id, status, observed_at)
      VALUES (1, $1, NOW())
      ON CONFLICT (id)
      DO UPDATE SET status = EXCLUDED.status, observed_at = EXCLUDED.observed_at
    `, [snapshot]);
  } catch (err) {
    console.error('[Bot Status] Failed to write snapshot:', err.message);
  }
}

function startBotStatusSnapshotWriter() {
  if (botStatusSnapshotInterval) clearInterval(botStatusSnapshotInterval);
  writeBotStatusSnapshot().catch(() => {});
  botStatusSnapshotInterval = setInterval(() => {
    writeBotStatusSnapshot().catch(() => {});
  }, 10_000);
}

async function buildAdminPanelEmbed() {
  await refreshWheatMagnatePlaytimeDisplay();
  const [dailyTps, nearbySightings] = await Promise.all([
    getDailyTpsAverages(7),
    getRecentNearbyPlayerSightings(5)
  ]);
  const status = getAdminPanelStatusSnapshot();
  const fields = status
    ? [
        {
          name: 'Overview',
          value: [
            getWheatMagnateStatusLine(),
            `${STATUS_EMOJIS.players} Online: **${status.playerCount}**`,
            `${STATUS_EMOJIS.tps} TPS: **${status.tps}**`,
            `${STATUS_EMOJIS.serverPinging} Ping: **${getBotPingDisplay()}**`,
            `${STATUS_EMOJIS.playtime} Uptime: **${formatDurationShort(Date.now() - startTime)}**`
          ].join('\n'),
          inline: false
        },
        {
          name: 'Bot',
          value: [
            `${STATUS_EMOJIS.health} Health: **${status.health}**`,
            `${STATUS_EMOJIS.food} Food: **${status.food}**`,
            `${STATUS_EMOJIS.nearby} Following: **${status.followTarget}**`,
            `${FARM_EMOJIS.netheritePickaxe} Obsidian: **${status.obsidianMined}**`
          ].join('\n'),
          inline: true
        },
        {
          name: 'Players',
          value: [
            `${STATUS_EMOJIS.nearby} Nearby: ${status.nearbyNames}`,
            `${STATUS_EMOJIS.whitelist} Whitelist: ${status.whitelistOnline}`
          ].join('\n'),
          inline: true
        },
        {
          name: '7-Day TPS',
          value: formatDailyTpsAverages(dailyTps),
          inline: false
        },
        {
          name: 'Recent Nearby',
          value: formatNearbySightings(nearbySightings),
          inline: false
        }
      ]
    : [
        {
          name: 'Overview',
          value: buildAdminServerStatusValue(),
          inline: false
        },
        {
          name: 'Connection',
          value: [
            `${STATUS_EMOJIS.serverPing} Bot **${ADMIN_PANEL_BOT_NAME}** connected to **${appConfig.minecraft.serverName}**`,
            `${STATUS_EMOJIS.serverPinging} Ping: **${getBotPingDisplay()}**`,
            `${STATUS_EMOJIS.playtime} Uptime: **${formatDurationShort(Date.now() - startTime)}**`
          ].join('\n'),
          inline: false
        },
        {
          name: '7-Day TPS',
          value: formatDailyTpsAverages(dailyTps),
          inline: false
        },
        {
          name: 'Recent Nearby',
          value: formatNearbySightings(nearbySightings),
          inline: false
        }
      ];

  return {
    title: 'Admin Panel',
    fields,
    color: bot?.entity ? 3447003 : shouldReconnect ? 16776960 : 8421504,
    timestamp: new Date()
  };
}

function createChatSettingsHeaderComponents() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('whitelist_button')
        .setLabel('Manage whitelist')
        .setEmoji(STATUS_BUTTON_EMOJIS.whitelist)
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('admin_whitelist_mode')
        .setLabel('Whitelist mode')
        .setEmoji(STATUS_BUTTON_EMOJIS.whitelist)
        .setStyle(runtimeSettings.whitelistMode ? ButtonStyle.Success : ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('admin_panel_back')
        .setLabel('Back')
        .setEmoji(UI_BUTTON_EMOJIS.arrowLeftCurved)
        .setStyle(ButtonStyle.Secondary)
    )
  ];
}

function createAdminBackComponents() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('admin_panel_back')
        .setLabel('Back')
        .setEmoji(UI_BUTTON_EMOJIS.arrowLeftCurved)
        .setStyle(ButtonStyle.Secondary)
    )
  ];
}

function createChildAdminComponents() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('growing_child_toggle')
        .setLabel(growingChild?.getStatus().enabled ? 'Disable child' : 'Enable child')
        .setEmoji(UI_BUTTON_EMOJIS.redstone)
        .setStyle(growingChild?.getStatus().enabled ? ButtonStyle.Danger : ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId('growing_child_say')
        .setLabel('Say')
        .setEmoji(UI_BUTTON_EMOJIS.cat)
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId('admin_gemini_toggle')
        .setLabel('Gemini')
        .setEmoji(UI_BUTTON_EMOJIS.enchantingTable)
        .setStyle(runtimeSettings.geminiEnabled ? ButtonStyle.Success : ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('admin_child_public_toggle')
        .setLabel('Public chat')
        .setEmoji(UI_BUTTON_EMOJIS.cat)
        .setStyle(runtimeSettings.childPublicSpeech ? ButtonStyle.Success : ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('growing_child_reset')
        .setLabel('Reset')
        .setEmoji(UI_BUTTON_EMOJIS.witherSkeletonSkull)
        .setStyle(ButtonStyle.Danger)
    ),
    ...createAdminBackComponents()
  ];
}

function buildAdminChildPayload() {
  return {
    embeds: [buildGrowingChildStatusEmbed(
      growingChild.getStatus(),
      `Gemini: ${runtimeSettings.geminiEnabled ? 'On' : 'Off'} В· Public chat: ${runtimeSettings.childPublicSpeech ? 'On' : 'Off'}`
    )],
    components: createChildAdminComponents()
  };
}

function createStatusButtons() {
  return createServerStatusButtons();
}

function isAdminPanelCustomId(customId = '') {
  return customId === 'pause_resume_button' ||
    customId === 'drop_button' ||
    customId === 'whitelist_button' ||
    customId === 'chat_setting_button' ||
    customId === 'obsidian_farm_button' ||
    customId === 'follow_button' ||
    customId === 'follow_stop' ||
    customId === 'admin_panel_back' ||
    customId === 'admin_whitelist_mode' ||
    customId === 'admin_gemini_toggle' ||
    customId === 'admin_child_public_toggle' ||
    customId === 'admin_child_status' ||
    customId.startsWith('whitelist_page_');
}

function isAdminPanelSelectCustomId(customId = '') {
  return customId === 'admin_danger_radius_select' ||
    customId === 'admin_message_cooldown_select' ||
    customId === 'follow_select';
}

// Function to update server status message
async function updateStatusMessage() {
  if (!statusMessage) {
    await ensureStatusMessage();
    if (!statusMessage) return;
  }
  
  // Prevent concurrent updates
  if (isUpdatingStatus) return;
  isUpdatingStatus = true;
  
  try {
    try {
      updateDiscordPresence();
    } catch (presenceErr) {
      console.error('[Discord] Failed to update presence:', presenceErr.message);
    }
    await refreshWheatMagnatePlaytimeDisplay();

    // Allow status updates even if bot is not connected to show offline state
    const description = `${getStatusDescription()}\n\n${getLastBotPublicChatStatusLine()}`;

    await statusMessage.edit({
      embeds: [{
        title: getServerStatusTitle(),
        description,
        color: bot?.entity ? 65280 : 16711680,
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
  clearReconnectTimer();

  // Never replace a live/connecting instance. Late events from the old instance
  // could otherwise clear the new global reference and leave an orphaned socket.
  if (bot) {
    console.log('[Bot] Connection attempt skipped: a bot instance already exists.');
    return;
  }

  lastTickTime = 0; // Reset TPS tracking for new bot
  recordSystemLog({
    level: 'info',
    category: 'minecraft',
    message: 'Starting Minecraft connection.'
  }).catch(() => {});
  try {
    bot = createMinecraftBot(minecraftConnectionConfig);
  } catch (err) {
    bot = null;
    console.log(`[x] Failed to create Minecraft connection: ${err.message}`);
    recordSystemLog({
      level: 'error',
      category: 'minecraft',
      message: 'Failed to create Minecraft connection.',
      details: { error: err.message }
    }).catch(() => {});
    if (shouldReconnect) scheduleReconnect(RECONNECT_INTERVAL_MS);
    return;
  }
  const createdBot = bot;
  let fireEmergencyTriggered = false;
  let connectionFinalized = false;
  let reachedLogin = false;
  const connectionWatchdog = setTimeout(() => {
    if (connectionFinalized || createdBot.entity) return;
    console.log('[x] Minecraft connection attempt timed out before spawn.');
    recordSystemLog({
      level: 'warn',
      category: 'minecraft',
      message: 'Minecraft connection attempt timed out before spawn.'
    }).catch(() => {});
    finalizeConnectionLoss('Connection attempt timed out');
  }, MINECRAFT_CONNECT_TIMEOUT_MS + 5_000);
  bot.loadPlugin(pathfinder);

  function finalizeConnectionLoss(reason) {
    if (connectionFinalized) return;
    connectionFinalized = true;
    clearTimeout(connectionWatchdog);
    if (bot !== createdBot) return;

    clearIntervals();
    followFeature.stop();
    farm.suspend();
    bot = null;
    safelyCloseMinecraftBot(createdBot, reason);
    setDisconnectReason(buildDisconnectReason(reason, 'Connection lost'));

    if (shouldReconnect) {
      scheduleReconnect(
        RECONNECT_INTERVAL_MS,
        `[!] Connection failed. Trying again in ${RECONNECT_INTERVAL_MS / 1000} seconds...`
      );
    } else if (!resumeTimer) {
      clearReconnectTimer();
    }
    updateStatusMessage().catch(() => {});
  }

  function emergencyExitOnFire() {
    if (fireEmergencyTriggered || bot !== createdBot) return;
    fireEmergencyTriggered = true;
    shouldReconnect = false;
    followFeature.stop();
    farm.suspend();
    obsidianStats.desiredEnabled = false;
    setDisconnectReason('Emergency exit: bot caught fire');
    try { createdBot.quit('Emergency exit: on fire'); } catch (_) {}
    setObsidianFarmDesiredEnabled(false).catch(() => {});
    sendOwnerDM(
      'Emergency fire exit',
      'The bot detected that it was on fire and disconnected immediately. Auto-reconnect and farm auto-resume were disabled.',
      16711680
    ).catch(() => {});
  }

  function checkBotFireState(entity = createdBot.entity) {
    if (!entity || entity.id !== createdBot.entity?.id) return;
    const sharedFlags = Number(entity.metadata?.[0]) || 0;
    if ((sharedFlags & 0x01) !== 0) emergencyExitOnFire();
  }

  bot.on('entityUpdate', checkBotFireState);

  bot.on('login', async () => {
    reachedLogin = true;
    if (bot && bot.username) {
      console.log(`[+] Logged in as ${bot.username}`);
    }
    await recordSystemLog({
      level: 'info',
      category: 'minecraft',
      message: `Minecraft login as ${bot?.username || 'unknown'}.`
    });
    securityDisconnectTriggered = false;
    startTime = Date.now();
    lastCommandUser = null; // Reset after use
    lastDisconnectReason = null;
  });

  bot.on('spawn', async () => {
    clearTimeout(connectionWatchdog);
    console.log('[Bot] Spawned.');
    await recordSystemLog({
      level: 'info',
      category: 'minecraft',
      message: 'Minecraft bot spawned.'
    });
    playerActivityJoinEventsReady = false;
    reconnectTimestamp = 0; // Reset reconnect countdown when bot spawns
    clearIntervals();
    startFoodMonitor();
    startNearbyPlayerScanner();
    startRestartProtectionMonitor();
    startObsidianFarmWatchdog();
    startObsidianSupplySnapshotWriter();
    scheduleQueuedSiteWhispersForOnlinePlayers().catch(err => {
      console.error('[Site Whisper] Failed to schedule queued whispers after spawn:', err.message);
    });

    if (obsidianStats.desiredEnabled) {
      const { dateKey, hour, minute } = getKyivDateParts();
      if (hour === 9 && minute <= 30) restartProtectionDateKey = dateKey;
      await new Promise(resolve => setTimeout(resolve, 1000));
      ensureObsidianFarmRunning(createdBot).catch(err => {
        console.error('[Obsidian] Farm resume retry loop failed:', err.message);
      });
    }

    // Keep website online/offline state aligned with Mineflayer's current player list.
    setTimeout(async () => {
      try {
        await syncPlayerActivityOnlineState();
        await syncWhitelistPlaytime();
      } catch (err) {
        console.error('[PlayerActivity] Initial sync after spawn failed:', err.message);
      } finally {
        playerActivityJoinEventsReady = true;
      }
    }, 3000);

    playerActivitySyncInterval = setInterval(() => {
      syncPlayerActivityOnlineState().catch(err => {
        console.error('[PlayerActivity] Sync interval failed:', err.message);
      });
    }, 1000);

    playtimeSyncInterval = setInterval(() => {
      syncWhitelistPlaytime().catch(err => console.error('[Playtime] Sync interval failed:', err.message));
    }, 30_000);

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
          recordTpsSample().catch(() => {});
          found = true;
          // Update status immediately when TPS changes
          if (statusMessage) updateStatusMessage();
        }
      }
      if (!found && bot && bot.chat) {
        sendMinecraftChat('/tps');
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
    checkBotFireState();
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
    recordSystemLog({
      level: 'warn',
      category: 'minecraft',
      message: 'Minecraft bot disconnected.',
      details: { reason: reasonStr || null }
    }).catch(() => {});
    const observedOnlineAtDisconnect = lastObservedOnlinePlayerKeys;
    lastObservedOnlinePlayerKeys = null;
    playerActivityJoinEventsReady = false;
    if (observedOnlineAtDisconnect?.size) {
      Promise.all([...observedOnlineAtDisconnect.values()].map(username =>
        updatePlayerActivity(username, false, { recordEvent: false })
      ))
        .catch(err => console.error('[PlayerActivity] Disconnect offline flush failed:', err.message));
    }
    syncWhitelistPlaytime([]).catch(err => console.error('[Playtime] Disconnect flush failed:', err.message));
    const now = new Date();
    const kyivTime = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Kyiv' }));
    const hour = kyivTime.getHours();
    const minute = kyivTime.getMinutes();
    const isRestartTime = hour === 9 && minute >= 0 && minute <= 30;

    const fallback = isRestartTime ? 'Server restart/reload in progress' : 'Connection lost';
    finalizeConnectionLoss(reasonStr && reasonStr !== 'socketClosed' ? reasonStr : fallback);
  });

  bot.on('error', (err) => {
    console.log(`[x] Error: ${err.message}`);
    recordSystemLog({
      level: 'error',
      category: 'minecraft',
      message: 'Minecraft bot error.',
      details: { error: err.message }
    }).catch(() => {});
    if (!reachedLogin || !createdBot.entity) {
      finalizeConnectionLoss(err.message || 'Connection error');
    }
  });

  bot.on('kicked', (reason) => {
    const reasonText = chatComponentToString(reason);
    console.log(`[!] Kicked: ${reasonText}`);
    recordSystemLog({
      level: 'warn',
      category: 'minecraft',
      message: 'Minecraft bot was kicked.',
      details: { reason: reasonText || null }
    }).catch(() => {});
    if (reasonText && reasonText.trim() !== '') {
      setDisconnectReason(reasonText);
    }
    
    // Keep reconnecting after generic kicks so persistent jobs can resume.
    if (reasonText === 'You have been disconnected from the server.') {
      console.log('[!] Generic kick detected. Reconnect remains enabled.');
    }
  });

  bot.on('death', () => {
    console.log('[Bot] Died.');
    recordSystemLog({
      level: 'warn',
      category: 'minecraft',
      message: 'Minecraft bot died.'
    }).catch(() => {});
    sendDiscordNotification('Bot died. :skull:', 16711680);
  });

  // Track player joins and leaves
  bot.on('playerJoined', async (player) => {
    if (player.username && player.username.toLowerCase() !== bot.username.toLowerCase()) {
      if (!lastObservedOnlinePlayerKeys) lastObservedOnlinePlayerKeys = new Map();
      lastObservedOnlinePlayerKeys.set(player.username.toLowerCase(), player.username);
      await updatePlayerActivity(player.username, true, { recordEvent: playerActivityJoinEventsReady });
      await scheduleQueuedSiteWhispersForPlayer(player.username);
    }
    if (player.username) {
      const onlineUsernames = getOnlinePlayerUsernames();
      if (!onlineUsernames.some(username => username.toLowerCase() === player.username.toLowerCase())) {
        onlineUsernames.push(player.username);
      }
      await syncWhitelistPlaytime(onlineUsernames);
    }
  });

  bot.on('playerLeft', async (player) => {
    if (player.username && player.username.toLowerCase() !== bot.username.toLowerCase()) {
      lastObservedOnlinePlayerKeys?.delete(player.username.toLowerCase());
      await updatePlayerActivity(player.username, false);
    }
    if (player.username) {
      const onlineUsernames = getOnlinePlayerUsernames().filter(
        username => username.toLowerCase() !== player.username.toLowerCase()
      );
      await syncWhitelistPlaytime(onlineUsernames);
    }
  });

  // ------- CHAT COMMANDS -------
  bot.on('chat', async (username, message, translate, jsonMessage) => {
    const observedUsername = username;
    const observedMessage = message;
    ({ username, message } = resolvePublicChatEnvelope(username, message, jsonMessage));
    handleObservedPlaytimeChat(observedUsername, observedMessage);
    handleObservedJoinDateChat(observedUsername, observedMessage);

    const wmMatch = message.match(/^!wm(?:\s+([\s\S]*))?$/i);
    if (wmMatch) {
      await sendGameChatMessageToDiscord(username, message);
      await handleWmCommand(username, wmMatch[1] || '');
      return;
    }

    if (username.toLowerCase() === 'theonlyslash' && /^!(?:pt|playtime)$/i.test(message.trim())) {
      const playtime = await getEffectivePlayerPlaytime(username);
      if (playtime.error) {
        sendMinecraftChat(`Playtime unavailable for ${username}: ${playtime.error}`);
      } else {
        sendMinecraftChat(`${username}: ${formatPlaytime(playtime.totalSeconds)}`);
      }
      return;
    }

    if (
      username.toLowerCase() !== String(bot?.username || '').toLowerCase() &&
      !message.startsWith('!') &&
      !message.startsWith('/')
    ) {
      growingChild?.learn({
        source: 'minecraft',
        authorId: username.toLowerCase(),
        authorName: username,
        channelId: 'minecraft_public_chat',
        channelName: 'Minecraft public chat',
        text: message,
        addressed: new RegExp(`\\b(?:${escapeRegExp(appConfig.minecraft.username)}|child|ребенок|ребёнок)\\b`, 'iu').test(message) ||
          /(?:^|\s)бот(?:\s|$|[?!.,])/iu.test(message)
      });
    }

    // Only the configured in-game administrator may use emergency commands.
    if (username.toLowerCase() === appConfig.minecraft.adminUsername.toLowerCase()) {
      if (message === '!restart') {
        console.log(`[Command] restart by ${username}`);
        lastCommandUser = `${username} (in-game)`;
        setDisconnectReason(`Restart requested by ${lastCommandUser}`);
        bot.quit('Restart command');
        return;
      }

      if (message === '!pause') {
        console.log('[Command] pause 10m');
        lastCommandUser = `${username} (in-game)`;
        shouldReconnect = false;
        clearReconnectTimer();
        setDisconnectReason(`Paused for 10m by ${lastCommandUser}`);
        bot.quit('Pause 10m');
        scheduleResume(10 * 60 * 1000, '[Bot] Paused for 10 minutes.');
        return;
      }

      const pauseMatch = message.match(/^!pause\s+(\d+)$/);
      if (pauseMatch) {
        const minutes = parseInt(pauseMatch[1]);
        if (minutes > 0) {
          console.log(`[Command] pause ${minutes}m`);
          lastCommandUser = `${username} (in-game)`;
          shouldReconnect = false;
          clearReconnectTimer();
          clearResumeTimer();
          setDisconnectReason(`Paused for ${minutes}m by ${lastCommandUser}`);
          bot.quit(`Paused ${minutes}m`);
          scheduleResume(minutes * 60 * 1000, `[Bot] Paused for ${minutes} minutes.`);
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
            await pool.query('INSERT INTO whitelist (username, added_by) VALUES ($1, $2) ON CONFLICT DO NOTHING', [targetUsername, username]);
            // Reload whitelist
            const newWhitelist = await loadWhitelistFromDB();
            ignoredUsernames.length = 0;
            ignoredUsernames.push(...newWhitelist);
            console.log(`[Command] Added ${targetUsername} to whitelist by ${username}`);
            sendDiscordNotification(`${STATUS_EMOJIS.connected} Added ${targetUsername} to whitelist. Requested by ${username} (in-game)`, 65280);
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
            sendDiscordNotification(`${STATUS_EMOJIS.connected} Added ${targetUsername} to ignore list. Requested by ${username} (in-game)`, 65280);
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
              sendDiscordNotification(`${STATUS_EMOJIS.connected} Removed ${targetUsername} from ignore list. Requested by ${username} (in-game)`, 65280);
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

    armSeenCommandResponseCapture(message);
    scheduleGameChatForward(username, message, 'chat');
    return;

    // Send all chat messages to Discord chat channel
    if (!DISCORD_CHAT_CHANNEL_ID || !discordClient || !discordClient.isReady()) {
      return;
    }
    
    // Suppress only exact echoes of messages we sent. Plugin/server responses can
    // also use our username and still need to reach the Discord game-chat channel.
    const isSelfMessage = username === bot.username;
    if (isSelfMessage && consumeOutboundSelfEcho(message)) {
      return;
    }

    if (!isSelfMessage && ignoredChatUsernames.includes(username.toLowerCase())) {
      return;
    }

    // Clean message - only remove Minecraft color codes and problematic control characters
    let cleanMessage = message
      .replace(/§[0-9a-fk-or]/gi, '') // Remove Minecraft color codes
      .replace(/[\u0000-\u0008\u000B-\u000C\u000E-\u001F\u007F]/g, '') // Remove control chars (keep newlines \n)
      .trim();

    if (!cleanMessage) {
      return;
    }

    // Skip /msg commands - these are relayed from dialog channels
    if (cleanMessage.startsWith('/msg ')) {
      return;
    }

    // Suppress whispers: if whisper arrives shortly, don't forward to public chat
    const whisperKey = `WHISPER:${username}:${cleanMessage}`;
    if (recentWhispers.has(whisperKey)) {
      debugLog(`[Chat] Suppressed whisper from ${username}: "${cleanMessage}"`);
      return;
    }

    // Suppress any unexpected public echo of our own outgoing /msg to this username
    const outboundKey = `OUTBOUND:${username.toLowerCase()}:${cleanMessage}`;
    const nowTs = Date.now();
    for (const [ok, ts] of outboundWhispers.entries()) {
      if (nowTs - ts > OUTBOUND_WHISPER_TTL_MS) outboundWhispers.delete(ok);
    }
    if (outboundWhispers.has(outboundKey)) {
      debugLog(`[Chat] Suppressed outbound echo to ${username}: "${cleanMessage}"`);
      return;
    }

    const pendingKey = `CHAT:${username}:${cleanMessage}`;
    if (pendingChatTimers.has(pendingKey)) {
      clearTimeout(pendingChatTimers.get(pendingKey));
      pendingChatTimers.delete(pendingKey);
    }

    const timer = setTimeout(async () => {
      try {
        if (recentWhispers.has(whisperKey)) {
          debugLog(`[Chat] Suppressed whisper (late mark) from ${username}: "${cleanMessage}"`);
          return;
        }
        if (outboundWhispers.has(outboundKey)) {
          debugLog(`[Chat] Suppressed outbound echo (late) to ${username}: "${cleanMessage}"`);
          return;
        }
        await sendGameChatMessageToDiscord(username, cleanMessage);
      } catch (e) {
        // Silent
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
    cleanedWhisper = cleanMinecraftChatMessage(cleanedWhisper);

    debugLog(`[Whisper] Cleaned: "${cleanedWhisper}"`);

    const whisperUsernameKey = String(username || '').toLowerCase();
    if (ignoredChatUsernames.some(ignoredUsername =>
      String(ignoredUsername || '').toLowerCase() === whisperUsernameKey
    )) {
      siteWhisperTargets.delete(whisperUsernameKey);
      debugLog(`[Whisper] Suppressed private message from ignored player ${username}.`);
      return;
    }

    const whisperKey = `WHISPER:${username}:${cleanedWhisper}`;
    recentWhispers.set(whisperKey, Date.now());
    recentWhispers.set(`WHISPER:${String(username).toLowerCase()}:${cleanedWhisper}`, Date.now());
    debugLog(`[Whisper] MARKED whisper key: ${whisperKey}`);

    // Cancel any pending public chat send for this message
    const pendingKey = `CHAT:${String(username).toLowerCase()}:${cleanedWhisper}`;
    if (cancelPendingGameChat(username, cleanedWhisper)) {
      debugLog(`[Whisper] 🛑 Canceled pending chat forward for: ${pendingKey}`);
    }

    // Cleanup old whisper marks
    for (const [k, ts] of recentWhispers.entries()) {
      if (k.startsWith('WHISPER:') && Date.now() - ts > WHISPER_MARK_TTL_MS) {
        recentWhispers.delete(k);
      }
    }

    const siteWhisperKey = whisperUsernameKey;
    for (const [target, state] of siteWhisperTargets.entries()) {
      const timestamp = typeof state === 'object' ? state.timestamp : state;
      if (Date.now() - timestamp > SITE_WHISPER_TTL_MS) siteWhisperTargets.delete(target);
    }
    const siteWhisperState = siteWhisperTargets.get(siteWhisperKey);
    const hasActiveSiteDialog = siteWhisperTargets.has(siteWhisperKey);
    const siteUsername = typeof siteWhisperState === 'object' && siteWhisperState.siteUsername
      ? siteWhisperState.siteUsername
      : DEFAULT_SITE_WHISPER_USERNAME;
    recordSiteWhisperMessage(username, 'incoming', cleanedWhisper, siteUsername).catch(() => {});

    debugLog(`[Whisper] Calling sendWhisperToDiscord...`);
    if (hasActiveSiteDialog) {
      siteWhisperTargets.set(siteWhisperKey, {
        timestamp: Date.now(),
        siteUsername
      });
      debugLog(`[Whisper] Routed ${username} reply to site dialog only.`);
      return;
    }
    sendWhisperToDiscord(username, message);
  });

  bot.on('message', (message, position) => {
    const text = chatComponentToString(message);
    const tpsMatch = text.match(/(\d+\.?\d*)\s*tps/i);
    if (tpsMatch) {
      realTps = parseFloat(tpsMatch[1]);
      recordTpsSample().catch(() => {});
    }

    forwardRawPublicChatText(text, 'message', position);
  });

  bot.on('messagestr', (message, position) => {
    forwardRawPublicChatText(message, 'messagestr', position);
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
  if (playtimeSyncInterval) {
    clearInterval(playtimeSyncInterval);
    playtimeSyncInterval = null;
  }
  if (playerActivitySyncInterval) {
    clearInterval(playerActivitySyncInterval);
    playerActivitySyncInterval = null;
  }
  if (restartProtectionInterval) {
    clearInterval(restartProtectionInterval);
    restartProtectionInterval = null;
  }
  if (obsidianFarmWatchdogInterval) {
    clearInterval(obsidianFarmWatchdogInterval);
    obsidianFarmWatchdogInterval = null;
  }
  if (obsidianSupplySnapshotInterval) {
    clearInterval(obsidianSupplySnapshotInterval);
    obsidianSupplySnapshotInterval = null;
  }
  // Note: statusUpdateInterval is NOT cleared here as it's a global Discord interval
  // that should persist across bot reconnections
}

// -------------- FOOD MONITOR --------------
function startFoodMonitor() {
  let warningSent = false;
  foodMonitorInterval = setInterval(async () => {
    if (!bot || bot.food === undefined) return;
    if (!runtimeSettings.autoEat) return;

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
      if (!entity.position || !bot.entity.position) continue;
      const distance = bot.entity.position.distanceTo(entity.position);
      if (distance <= runtimeSettings.dangerRadius) {
        recordNearbyPlayerSighting(entity.username, distance).catch(() => {});
      }
      if (!runtimeSettings.whitelistMode) continue;
      if (ignoredUsernames.some(name => name.toLowerCase() === entity.username.toLowerCase())) continue; // Ignore whitelisted players (case-insensitive)
      // Non-whitelisted player
      if (distance <= runtimeSettings.dangerRadius) {
        disconnectForNonWhitelistedPlayer(entity, distance);
        return; // Stop scanning after disconnect
      }
    }
  }, 1000);
}


if (appConfig.runtime.disabled) {
  console.log('Bot disabled by configuration.');
  recordSystemLog({
    level: 'warn',
    category: 'bot',
    message: 'Bot disabled by configuration.'
  }).catch(() => {});
  process.exit(0);
}

// Handle uncaught exceptions to prevent crashes
process.on('uncaughtException', (err) => {
  console.log('Uncaught Exception:', err);
  recordSystemLog({
    level: 'error',
    category: 'bot',
    message: 'Uncaught exception.',
    details: { error: err.message, stack: err.stack }
  }).catch(() => {});
  sendDiscordNotification(`Uncaught exception: \`${err.message}\``, 16711680);
  if (bot) {
    try { bot.quit(); } catch {}
  }
  if (shouldReconnect) {
    setTimeout(() => {
      if (!bot && shouldReconnect) createBot();
    }, 5000);
  }
});

process.on('unhandledRejection', (reason) => {
  console.log('Unhandled Rejection:', reason);
  recordSystemLog({
    level: 'error',
    category: 'bot',
    message: 'Unhandled rejection.',
    details: { reason: reason?.message || String(reason), stack: reason?.stack || null }
  }).catch(() => {});
  sendDiscordNotification(`Unhandled rejection: \`${reason}\``, 16711680);
});

// Discord bot commands
if (DISCORD_BOT_TOKEN && DISCORD_CHANNEL_ID) {
  discordClient.on('interactionCreate', async (interaction) => {
    // Interaction logs reduced to minimize noise

    if (interaction.isChatInputCommand() && interaction.commandName === 'panel') {
      if (interaction.user.id !== DISCORD_OWNER_ID) {
        await interaction.reply({
          content: 'Only the owner can open the admin panel.',
          flags: MessageFlags.Ephemeral
        });
        return;
      }

      await ensureAdminPanelDM();
      adminPanelView = 'main';
      stopAdminPanelObsidianStatsUpdater();
      await updateAdminPanel();
      const reply = { content: 'Admin panel sent to DM.' };
      if (interaction.guildId) reply.flags = MessageFlags.Ephemeral;
      await interaction.reply(reply);
      if (!interaction.guildId) {
        setTimeout(() => interaction.deleteReply().catch(() => {}), 2000);
      }
      return;
    }

    if (interaction.isChatInputCommand() && interaction.commandName === 'child') {
      if (interaction.user.id !== DISCORD_OWNER_ID) {
        await interaction.reply({
          content: 'Only the owner can control Growing Child AI.',
          flags: MessageFlags.Ephemeral
        });
        return;
      }

      const action = interaction.options.getSubcommand();
      const childEnabled = growingChild?.getStatus().enabled;
      const minecraftAvailable = Boolean(bot?.entity && typeof bot.chat === 'function');
      const replyOptions = {
        content: action === 'say' && !childEnabled
          ? 'Growing Child AI is disabled. Use `/child status` and press Enable.'
          : action === 'say' && !minecraftAvailable
            ? 'Minecraft bot is offline, so the phrase was not sent.'
          : 'Done.'
      };
      if (interaction.guildId) replyOptions.flags = MessageFlags.Ephemeral;
      await interaction.reply(replyOptions);

      if (action === 'status') {
        await sendGrowingChildStatusDM();
      } else if (action === 'vocabulary') {
        await sendGrowingChildVocabularyDM();
      } else if (action === 'reset') {
        await sendGrowingChildResetPrompt();
      } else if (minecraftAvailable) {
        await growingChild?.speak('slash command');
      }

      if (!interaction.guildId) {
        setTimeout(() => interaction.deleteReply().catch(() => {}), 1000);
      }
      return;
    }

    if (interaction.isChatInputCommand() && interaction.commandName === 'playtime') {
      if (interaction.user.id !== DISCORD_OWNER_ID) {
        await interaction.reply({
          content: 'Only the owner can update playtime.',
          flags: MessageFlags.Ephemeral
        });
        return;
      }

      const username = interaction.options.getString('player', true).trim();
      const duration = interaction.options.getString('time', true).trim();
      const totalSeconds = parsePlaytime(duration);
      if (totalSeconds === null) {
        const reply = { content: 'Invalid time. Use `192d 23h 32m` or `192 Days, 23 Hours, 32 Minutes`.' };
        if (interaction.guildId) reply.flags = MessageFlags.Ephemeral;
        await interaction.reply(reply);
        return;
      }

      const result = await setPlayerPlaytime(username, totalSeconds);
      const reply = {
        content: result.error
          ? `Failed to update playtime: ${result.error}`
          : `Updated **${result.username}** playtime to **${formatPlaytime(totalSeconds)}**.`
      };
      if (interaction.guildId) reply.flags = MessageFlags.Ephemeral;
      await interaction.reply(reply);
      return;
    }

    if (interaction.isButton() && interaction.customId.startsWith('growing_child_')) {
      if (interaction.user.id !== DISCORD_OWNER_ID) {
        await interaction.reply({
          content: 'Only the owner can control Growing Child AI.',
          flags: MessageFlags.Ephemeral
        });
        return;
      }

      if (interaction.customId === 'growing_child_say') {
        await interaction.deferUpdate();
        const payload = await growingChild?.speak('button');
        if (!payload) {
          const status = growingChild?.getStatus();
          const minecraftAvailable = Boolean(bot?.entity && typeof bot.chat === 'function');
          const content = !status?.enabled
            ? 'Growing Child AI is disabled.'
            : !minecraftAvailable
              ? 'Minecraft bot is offline, so the phrase was not sent.'
              : 'Growing Child AI could not form a new non-repeating phrase from what it has learned yet.';
          if (adminPanelView === 'child') {
            await interaction.editReply(buildAdminChildPayload());
            return;
          }
          await interaction.followUp({
            content,
            flags: MessageFlags.Ephemeral
          });
        }
        return;
      }
      if (interaction.customId === 'growing_child_toggle') {
        const status = growingChild.toggleEnabled();
        if (adminPanelView === 'child') {
          await interaction.update(buildAdminChildPayload());
          return;
        }
        await interaction.update({
          embeds: [{
            title: 'Growing Child AI · Status',
            description: formatGrowingChildStatus(status),
            color: status.enabled ? 65280 : 8421504,
            timestamp: new Date()
          }],
          components: [createGrowingChildControls()]
        });
        return;
      }
      if (interaction.customId === 'growing_child_status') {
        const status = growingChild.getStatus();
        if (adminPanelView === 'child') {
          await interaction.update(buildAdminChildPayload());
          return;
        }
        await interaction.update({
          embeds: [buildGrowingChildStatusEmbed(status)],
          components: [createGrowingChildControls()]
        });
        return;
      }
      if (interaction.customId === 'growing_child_reset') {
        await interaction.update({
          embeds: [{
            title: 'Reset Growing Child AI?',
            description: 'This permanently deletes its vocabulary, experience, topics, members, channels and emotional state.',
            color: 16711680,
            timestamp: new Date()
          }],
          components: [createGrowingChildResetConfirmation()]
        });
        return;
      }
      if (interaction.customId === 'growing_child_reset_cancel') {
        if (adminPanelView === 'child') {
          await interaction.update(buildAdminChildPayload());
          return;
        }
        await interaction.update({
          embeds: [{
            title: 'Growing Child AI',
            description: 'Reset cancelled.',
            color: 10181046,
            timestamp: new Date()
          }],
          components: [createGrowingChildControls()]
        });
        return;
      }
      if (interaction.customId === 'growing_child_reset_confirm') {
        const status = growingChild.reset();
        if (adminPanelView === 'child') {
          await interaction.update(buildAdminChildPayload());
          return;
        }
        await interaction.update({
          embeds: [{
            title: 'Growing Child AI · Reset complete',
            description: `Level **0** · Known words **${status.knownWords}** · Experience **${status.xp} XP**`,
            color: 65280,
            timestamp: new Date()
          }],
          components: [createGrowingChildControls()]
        });
        return;
      }
    }

    if (interaction.isChatInputCommand() && interaction.commandName === 'ofstats') {
      if (interaction.user.id !== DISCORD_OWNER_ID) {
        const reply = { content: 'Only the owner can view obsidian farm statistics.' };
        if (interaction.guildId) reply.flags = MessageFlags.Ephemeral;
        await interaction.reply(reply);
        return;
      }
      if (interaction.guildId) {
        await interaction.reply({
          content: 'Use `/ofstats` in the bot DM to view private farm statistics.',
          flags: MessageFlags.Ephemeral
        });
        return;
      }
      await interaction.deferReply();
      await openObsidianStatsPanel(interaction);
      return;
    }

    if (interaction.isButton() && interaction.customId === 'delete_dm_message') {
      if (interaction.user.id !== DISCORD_OWNER_ID) {
        await interaction.reply({
          content: 'Only the owner can delete this message.',
          flags: MessageFlags.Ephemeral
        });
        return;
      }

      await interaction.deferUpdate();
      const updater = obsidianStatsUpdaters.get(interaction.channelId);
      if (updater?.messageId === interaction.message.id) {
        stopObsidianStatsUpdater(interaction.channelId);
      }
      const temporary = temporaryInteractionMessages.get(interaction.message.id);
      if (temporary) {
        clearInterval(temporary.interval);
        clearTimeout(temporary.timeout);
        temporaryInteractionMessages.delete(interaction.message.id);
      }
      await interaction.message.delete().catch(err => {
        if (err.code !== 10008) throw err;
      });
      return;
    }

    if (interaction.isButton() && interaction.customId === 'ofstats_refresh') {
      if (interaction.user.id !== DISCORD_OWNER_ID) {
        await interaction.reply({
          content: 'Only the owner can inspect obsidian farm statistics.',
          flags: MessageFlags.Ephemeral
        });
        return;
      }

      await interaction.deferUpdate();
      const supplies = await farm.inspectSupplies(bot);
      const updater = obsidianStatsUpdaters.get(interaction.channelId);
      if (updater && updater.messageId === interaction.message.id) {
        updater.supplies = mergeObsidianSupplies(updater.supplies, supplies);
        updater.view = 'summary';
        saveObsidianStatsUpdaters();
      } else {
        startObsidianStatsUpdater(interaction.message, supplies);
      }
      const activeUpdater = obsidianStatsUpdaters.get(interaction.channelId);
      await interaction.message.edit({
        embeds: [await buildObsidianStatsEmbed(activeUpdater?.supplies || supplies)],
        components: createObsidianStatsComponents()
      });
      return;
    }

    if (interaction.isButton() && interaction.customId === 'ofstats_logs_menu') {
      if (interaction.user.id !== DISCORD_OWNER_ID) {
        await interaction.reply({
          content: 'Only the owner can view obsidian farm logs.',
          flags: MessageFlags.Ephemeral
        });
        return;
      }

      await interaction.update({
        embeds: [buildObsidianLogsEmbed()],
        components: createObsidianLogsComponents()
      });
      return;
    }

    if (interaction.isButton() && interaction.customId === 'ofstats_logs_back') {
      if (interaction.user.id !== DISCORD_OWNER_ID) {
        await interaction.reply({
          content: 'Only the owner can view obsidian farm statistics.',
          flags: MessageFlags.Ephemeral
        });
        return;
      }

      const updater = obsidianStatsUpdaters.get(interaction.channelId);
      if (updater && updater.messageId === interaction.message.id) {
        updater.view = 'summary';
        saveObsidianStatsUpdaters();
      }
      await interaction.update({
        embeds: [await buildObsidianStatsEmbed(updater?.supplies || null)],
        components: createObsidianStatsComponents()
      });
      return;
    }

    if (interaction.isButton() && interaction.customId === 'ofstats_toggle_debug_logging') {
      if (interaction.user.id !== DISCORD_OWNER_ID) {
        await interaction.reply({
          content: 'Only the owner can change obsidian farm logging.',
          flags: MessageFlags.Ephemeral
        });
        return;
      }

      const nextEnabled = !(farm.getDebugLoggingEnabled?.() !== false);
      farm.setDebugLoggingEnabled?.(nextEnabled);
      await interaction.update({
        embeds: [buildObsidianLogsEmbed()],
        components: createObsidianLogsComponents()
      });
      return;
    }

    if (interaction.isButton() && interaction.customId === 'ofstats_download_debug_log') {
      if (interaction.user.id !== DISCORD_OWNER_ID) {
        await interaction.reply({
          content: 'Only the owner can download the obsidian farm debug log.',
          flags: MessageFlags.Ephemeral
        });
        return;
      }

      if (interaction.guildId) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      } else {
        await interaction.deferReply();
      }
      await sendObsidianDebugLog(interaction);
      return;
    }

    if (interaction.isButton() && interaction.customId === 'ofstats_radius_toggle') {
      if (interaction.user.id !== DISCORD_OWNER_ID) {
        await interaction.reply({
          content: 'Only the owner can change the obsidian farm radius.',
          flags: MessageFlags.Ephemeral
        });
        return;
      }

      await interaction.deferUpdate();
      const nextRadius = farm.cycleCauldronRadius();
      if (!nextRadius) {
        await interaction.followUp({
          content: 'Configure obsidian farm coordinates before changing the radius.',
          flags: MessageFlags.Ephemeral
        }).catch(() => {});
        return;
      }

      await persistObsidianFarmCoordinates().catch(err => {
        console.error('[DB] Failed to persist obsidian farm radius:', err.message);
      });
      const updater = obsidianStatsUpdaters.get(interaction.channelId);
      if (updater && updater.messageId === interaction.message.id) {
        updater.view = 'summary';
        saveObsidianStatsUpdaters();
      }
      await interaction.message.edit({
        embeds: [await buildObsidianStatsEmbed(updater?.supplies || null)],
        components: createObsidianStatsComponents()
      }).catch(() => {});
      return;
    }

    if (interaction.isButton() && interaction.customId === 'ofstats_toggle_farm') {
      if (interaction.user.id !== DISCORD_OWNER_ID) {
        await interaction.reply({
          content: 'Only the owner can control the obsidian farm.',
          flags: MessageFlags.Ephemeral
        });
        return;
      }

      const farmStatus = farm.getStatus();
      if (farmStatus.enabled || obsidianStats.desiredEnabled) {
        await interaction.deferUpdate();
        farm.suspend();
        const leverProtected = await setProtectionLeverState(true).catch(() => false);
        await setObsidianFarmDesiredEnabled(false);
        await interaction.followUp({
          embeds: [{
            description: `Obsidian farm stopped. Session mined: **${formatCompactCount(obsidianStats.sessionMined)}**${leverProtected ? '' : `\nWarning: ${FARM_EMOJIS.lever} protection lever could not be switched ON.`}`,
            color: 16711680,
            timestamp: new Date()
          }],
          flags: MessageFlags.Ephemeral
        }).catch(() => {});
      } else if (farmStatus.config) {
        await interaction.deferUpdate();
        try {
          const result = await startConfiguredObsidianFarm();
          await interaction.followUp({
            embeds: [buildObsidianStartEmbed(result.started, result.config)],
            flags: MessageFlags.Ephemeral
          }).catch(() => {});
        } catch (err) {
          await setObsidianFarmDesiredEnabled(false);
          await interaction.followUp({
            embeds: [{
              description: `Failed to start obsidian farm: ${err.message}`,
              color: 16711680,
              timestamp: new Date()
            }],
            flags: MessageFlags.Ephemeral
          }).catch(() => {});
        }
      } else {
        const modal = new ModalBuilder()
          .setCustomId('obsidian_farm_modal')
          .setTitle('Obsidian Farm Target');

        const xInput = new TextInputBuilder()
          .setCustomId('farm_x')
          .setLabel('Target X')
          .setPlaceholder(String(appConfig.farm.target.x))
          .setStyle(TextInputStyle.Short)
          .setRequired(true);
        const yInput = new TextInputBuilder()
          .setCustomId('farm_y')
          .setLabel('Target Y')
          .setPlaceholder(String(appConfig.farm.target.y))
          .setStyle(TextInputStyle.Short)
          .setRequired(true);
        const zInput = new TextInputBuilder()
          .setCustomId('farm_z')
          .setLabel('Target Z')
          .setPlaceholder(String(appConfig.farm.target.z))
          .setStyle(TextInputStyle.Short)
          .setRequired(true);

        modal.addComponents(
          new ActionRowBuilder().addComponents(xInput),
          new ActionRowBuilder().addComponents(yInput),
          new ActionRowBuilder().addComponents(zInput)
        );
        await interaction.showModal(modal);
        return;
      }

      const updater = obsidianStatsUpdaters.get(interaction.channelId);
      if (updater && updater.messageId === interaction.message.id) {
        updater.supplies = updater.supplies || {
          barrel: null,
          barrelError: 'Waiting for bot to open the supply barrel'
        };
        updater.view = 'summary';
        saveObsidianStatsUpdaters();
      }
      await interaction.message.edit({
        embeds: [await buildObsidianStatsEmbed(updater?.supplies || null)],
        components: createObsidianStatsComponents()
      }).catch(() => {});
      updateAdminPanel().catch(() => {});
      return;
    }

    if (interaction.isButton() && interaction.customId === 'ofstats_summary') {
      if (interaction.user.id !== DISCORD_OWNER_ID) {
        await interaction.reply({
          content: 'Only the owner can view obsidian farm statistics.',
          flags: MessageFlags.Ephemeral
        });
        return;
      }

      await interaction.deferUpdate();
      const updater = obsidianStatsUpdaters.get(interaction.channelId);
      if (updater && updater.messageId === interaction.message.id) {
        updater.view = 'summary';
        saveObsidianStatsUpdaters();
      }
      await interaction.message.edit({
        embeds: [await buildObsidianStatsEmbed(updater?.supplies || null)],
        components: createObsidianStatsComponents('summary')
      });
      return;
    }

    if (interaction.isButton() && interaction.customId === 'ofstats_detailed') {
      if (interaction.user.id !== DISCORD_OWNER_ID) {
        await interaction.reply({
          content: 'Only the owner can view detailed obsidian farm statistics.',
          flags: MessageFlags.Ephemeral
        });
        return;
      }

      await interaction.deferUpdate();
      const updater = obsidianStatsUpdaters.get(interaction.channelId);
      if (updater && updater.messageId === interaction.message.id) {
        updater.view = 'detailed';
        saveObsidianStatsUpdaters();
      }
      await interaction.message.edit({
        embeds: [await buildDetailedObsidianStatsEmbed()],
        components: createObsidianStatsComponents('detailed')
      });
      return;
    }

    if (interaction.isButton() && interaction.customId === 'ofstats_reset_coordinates') {
      if (interaction.user.id !== DISCORD_OWNER_ID) {
        await interaction.reply({
          content: 'Only the owner can reset farm coordinates.',
          flags: MessageFlags.Ephemeral
        });
        return;
      }
      const resetReply = {
        embeds: [{
          title: 'Reset Obsidian Farm coordinates?',
          description: 'The farm will stop and the Obsidian button will ask for new coordinates next time.',
          color: 16711680,
          timestamp: new Date()
        }],
        components: [new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId('ofstats_reset_coordinates_confirm')
            .setLabel('Reset coordinates')
            .setStyle(ButtonStyle.Danger),
          new ButtonBuilder()
            .setCustomId('ofstats_reset_coordinates_cancel')
            .setLabel('Cancel')
            .setStyle(ButtonStyle.Secondary)
        )]
      };
      if (interaction.guildId) resetReply.flags = MessageFlags.Ephemeral;
      await interaction.reply(resetReply);
      return;
    }

    if (interaction.isButton() && interaction.customId === 'ofstats_reset_coordinates_cancel') {
      await interaction.update({
        embeds: [{
          description: 'Coordinate reset cancelled.',
          color: 8421504,
          timestamp: new Date()
        }],
        components: []
      });
      return;
    }

    if (interaction.isButton() && interaction.customId === 'ofstats_reset_coordinates_confirm') {
      if (interaction.user.id !== DISCORD_OWNER_ID) return;
      farm.suspend();
      await setProtectionLeverState(true).catch(() => false);
      await setObsidianFarmDesiredEnabled(false);
      await clearObsidianFarmCoordinates();
      farm.resetConfig();
      await interaction.update({
        embeds: [{
          description: `${STATUS_EMOJIS.connected} Farm coordinates were reset. The next Obsidian start will ask for X, Y and Z.`,
          color: 65280,
          timestamp: new Date()
        }],
        components: []
      });
      return;
    }

    if (interaction.isChatInputCommand() && interaction.commandName === 'clear') {
      if (interaction.user.id !== DISCORD_OWNER_ID) {
        const reply = { content: 'Only the owner can clear dialogs.' };
        if (interaction.guildId) reply.flags = MessageFlags.Ephemeral;
        await interaction.reply(reply);
        return;
      }

      await interaction.deferReply(interaction.guildId ? { flags: MessageFlags.Ephemeral } : {});
      const deferredReply = await interaction.fetchReply();
      stopObsidianStatsUpdater(interaction.channelId);
      const excludedIds = new Set([
        deferredReply.id,
        statusMessage?.id,
        ...excludedMessageIds
      ].filter(Boolean));
      const deleted = await clearCurrentDialog(interaction.channel, excludedIds);
      await interaction.editReply(`Deleted ${deleted} message${deleted === 1 ? '' : 's'}.`);
      if (!interaction.guildId) {
        setTimeout(() => interaction.deleteReply().catch(() => {}), 2000);
      }
      return;
    }

    if (interaction.channelId !== DISCORD_CHANNEL_ID) {
      // Allow dialog buttons and select menus in their own channels
      if (!(interaction.isButton() && (interaction.customId?.startsWith('delete_dialog_') || interaction.customId?.startsWith('set_ttl_') || interaction.customId?.startsWith('claim_whisper_'))) && 
          !(interaction.isButton() && isAdminPanelCustomId(interaction.customId) && interaction.user.id === DISCORD_OWNER_ID) &&
          !(interaction.isStringSelectMenu() && isAdminPanelSelectCustomId(interaction.customId) && interaction.user.id === DISCORD_OWNER_ID) &&
          !(interaction.isStringSelectMenu() && (interaction.customId?.startsWith('add_whitelist_select') || interaction.customId?.startsWith('delete_whitelist_select')) && interaction.user.id === DISCORD_OWNER_ID) &&
          !(interaction.isStringSelectMenu() && ['drop_select', 'ignore_select', 'unignore_select'].includes(interaction.customId) && interaction.user.id === DISCORD_OWNER_ID) &&
          !(interaction.isStringSelectMenu() && interaction.customId?.startsWith('set_ttl_select_'))) {
        return;
      }
    }

    if (interaction.isStringSelectMenu() && isAdminPanelSelectCustomId(interaction.customId)) {
      if (interaction.user.id !== DISCORD_OWNER_ID) {
        await interaction.reply({
          content: 'Only the owner can use admin controls.',
          flags: MessageFlags.Ephemeral
        });
        return;
      }

      await interaction.deferUpdate();
      if (interaction.customId === 'follow_select') {
        const selectedUsername = b64decode(interaction.values[0]);
        try {
          farm.suspend();
          await setObsidianFarmDesiredEnabled(false);
          followFeature.start(bot, selectedUsername);
          adminPanelView = 'follow';
          await interaction.editReply(buildFollowManagementPayload(`Following **${selectedUsername}**.`, 65280));
          updateAdminPanel().catch(() => {});
        } catch (err) {
          await interaction.editReply(buildFollowManagementPayload(`Failed to follow **${selectedUsername}**: ${err.message}`, 16711680));
        }
        return;
      }
      if (interaction.customId === 'admin_danger_radius_select') {
        const value = Number(interaction.values[0]);
        if (DANGER_RADIUS_OPTIONS.includes(value)) {
          runtimeSettings.dangerRadius = value;
          await persistRuntimeSetting('dangerRadius');
        }
      }
      if (interaction.customId === 'admin_message_cooldown_select') {
        const value = Number(interaction.values[0]);
        if (MESSAGE_COOLDOWN_OPTIONS.includes(value)) {
          runtimeSettings.messageCooldownMs = value;
          await persistRuntimeSetting('messageCooldownMs');
        }
      }
      if (adminPanelView === 'chat') {
        await interaction.editReply(buildChatSettingsPayload());
      } else {
        await updateAdminPanel();
      }
      return;
    }


    if (interaction.isButton()) {
        if (isAdminPanelCustomId(interaction.customId) && interaction.user.id !== DISCORD_OWNER_ID) {
          await interaction.reply({
            content: 'Only the owner can use admin controls.',
            flags: MessageFlags.Ephemeral
          });
          return;
        }
        if (interaction.customId === 'admin_panel_back') {
          adminPanelView = 'main';
          stopAdminPanelObsidianStatsUpdater();
          await interaction.update({
            embeds: [await buildAdminPanelEmbed()],
            components: createAdminPanelButtons()
          });
          updateAdminPanel().catch(() => {});
          return;
        }
        if (interaction.customId === 'admin_whitelist_mode') {
          await interaction.deferUpdate();
          runtimeSettings.whitelistMode = !runtimeSettings.whitelistMode;
          await persistRuntimeSetting('whitelistMode');
          if (adminPanelView === 'chat') {
            await interaction.editReply(buildChatSettingsPayload());
          } else {
            await updateAdminPanel();
          }
          return;
        }
        if (interaction.customId === 'admin_gemini_toggle') {
          await interaction.deferUpdate();
          runtimeSettings.geminiEnabled = !runtimeSettings.geminiEnabled;
          await persistRuntimeSetting('geminiEnabled');
          if (adminPanelView === 'child') {
            await interaction.editReply(buildAdminChildPayload());
          } else {
            await updateAdminPanel();
          }
          return;
        }
        if (interaction.customId === 'admin_child_public_toggle') {
          await interaction.deferUpdate();
          runtimeSettings.childPublicSpeech = !runtimeSettings.childPublicSpeech;
          growingChild?.setMinecraftPublicSpeechEnabled(runtimeSettings.childPublicSpeech);
          await persistRuntimeSetting('childPublicSpeech');
          if (adminPanelView === 'child') {
            await interaction.editReply(buildAdminChildPayload());
          } else {
            await updateAdminPanel();
          }
          return;
        }
        if (interaction.customId === 'admin_child_status') {
          adminPanelView = 'child';
          await interaction.update(buildAdminChildPayload());
          return;
          await interaction.update({
            embeds: [buildGrowingChildStatusEmbed(
              growingChild.getStatus(),
              `Gemini: ${runtimeSettings.geminiEnabled ? 'On' : 'Off'} · Public chat: ${runtimeSettings.childPublicSpeech ? 'On' : 'Off'}`
            )],
            components: createChildAdminComponents()
          });
          return;
        }
        if (interaction.customId === 'follow_button') {
          adminPanelView = 'follow';
          await interaction.update(buildFollowManagementPayload());
          return;
        }
        if (interaction.customId === 'follow_stop') {
          await interaction.deferUpdate();
          followFeature.stop();
          if (adminPanelView === 'follow') {
            await interaction.editReply(buildFollowManagementPayload('Follow stopped.', 3447003));
          } else {
            await updateAdminPanel();
          }
          return;
        }
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

          setWhisperChannelMapping(interaction.user.id, mcUsername, whisperChannel.id);
          pendingWhisperClaims.delete(mcUsername);

          try {
            await sendWhisperEmbed(whisperChannel, {
              senderLabel: mcUsername,
              body: pending.lastMessage
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
        if (interaction.customId.startsWith('security_add_whitelist_')) {
          if (interaction.user.id !== DISCORD_OWNER_ID) {
            await interaction.reply({
              content: 'Only the owner can whitelist players from security alerts.',
              flags: MessageFlags.Ephemeral
            });
            return;
          }

          await interaction.deferReply({ flags: MessageFlags.Ephemeral });
          const encodedUsername = interaction.customId.replace('security_add_whitelist_', '');
          const selectedUsername = b64decode(encodedUsername);

          try {
            const { changed, reconnectMode } = await whitelistAlertPlayerAndReconnect(selectedUsername, interaction.user.tag);

            await interaction.message.delete().catch(async () => {
              await interaction.message.edit({ components: [] }).catch(() => {});
            });

            await interaction.editReply({
              content: changed
                ? (reconnectMode === 'immediate'
                    ? `${STATUS_EMOJIS.connected} ${selectedUsername} added to whitelist. Alert removed, bot is reconnecting now.`
                    : `${STATUS_EMOJIS.connected} ${selectedUsername} added to whitelist. Alert removed, bot will reconnect automatically.`)
                : `ℹ️ ${selectedUsername} is already in whitelist. Alert removed.`
            });
            setTimeout(() => interaction.deleteReply().catch(() => {}), 10_000);
          } catch (err) {
            console.error('[Security Alert] Failed to whitelist player:', err.message);
            await interaction.editReply({
              content: `❌ Failed to add ${selectedUsername} to whitelist: ${err.message}`
            });
          }
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
              .setEmoji(STATUS_BUTTON_EMOJIS.playtime),
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
      if (interaction.customId.startsWith('whitelist_page_')) {
        if (interaction.customId.startsWith('whitelist_page_info_')) return;
        await interaction.deferUpdate();

        const match = interaction.customId.match(/^whitelist_page_(\d+)_(\d+)$/);
        if (!match) return;

        const addPage = Number.parseInt(match[1], 10);
        const deletePage = Number.parseInt(match[2], 10);
        const entries = await getWhitelistEntriesForUI();
        const allOnlinePlayers = bot ? Object.values(bot.players || {}).map(p => p.username) : [];
        const addCandidates = allOnlinePlayers.filter(u => !entries.some(n => n.toLowerCase() === u.toLowerCase()));

        await interaction.editReply(
          buildWhitelistManagementView(entries, addCandidates, '', 3447003, addPage, deletePage)
        );
        return;
      }
      if (interaction.customId === 'pause_resume_button') {
        await interaction.deferUpdate(); // Defer update to avoid timeout
        lastCommandUser = interaction.user.tag;
        if (shouldReconnect) {
          // Pause an active connection or an in-progress reconnect attempt.
          console.log(`[Button] pause by ${interaction.user.tag}`);
          shouldReconnect = false;
          clearReconnectTimer();
          clearResumeTimer();
          setDisconnectReason(`Paused by ${lastCommandUser}`);
          pauseMinecraftConnection('Pause until resume');
        } else {
          // Currently paused, resume it
          console.log(`[Button] resume by ${interaction.user.tag}`);
          setDisconnectReason(null);
          resumeBot();
          // Status will be updated automatically when bot spawns
        }
        updateAdminPanel().catch(() => {});
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
              title: `${STATUS_EMOJIS.serverUnreachable} Online Players`,
              description: 'Bot is offline. Player roster is unavailable until the Minecraft connection returns.',
              color: 16711680,
              timestamp: new Date()
            }]
          });
          
          await startTemporaryInteractionMessage(interaction);
          return;
        }
        await interaction.editReply(buildOnlinePlayersMessage());
        await startTemporaryInteractionMessage(interaction);
        return;
      } else if (interaction.customId === 'playtime_button') {
        await interaction.deferReply();
        const playtimeData = await getWhitelistPlaytime();
        if (playtimeData.error) {
          await interaction.editReply({
            embeds: [{
              title: 'Whitelist Playtime',
              description: `Error: ${playtimeData.error}`,
              color: 16711680,
              timestamp: new Date()
            }]
          });
          await startTemporaryInteractionMessage(interaction);
          return;
        }

        const players = playtimeData.players || [];
        const description = formatPlaytimeLeaderboard(players);

        await interaction.editReply({
          embeds: [{
            title: `${STATUS_EMOJIS.playtime} Whitelist Playtime · ${players.length} players`,
            description,
            color: 3447003,
            timestamp: new Date(),
            footer: { text: 'Press Refresh to update this table' }
          }],
          components: [
            new ActionRowBuilder().addComponents(
              new ButtonBuilder()
                .setCustomId('playtime_refresh_button')
                .setLabel('Refresh')
                .setEmoji(UI_BUTTON_EMOJIS.slowFalling)
                .setStyle(ButtonStyle.Secondary)
            )
          ]
        }); 
        await startTemporaryInteractionMessage(interaction);
      } else if (interaction.customId === 'playtime_refresh_button') {
        await interaction.deferUpdate();
        await interaction.editReply(await buildWhitelistPlaytimeMessage());
      } else if (interaction.customId === 'whitelist_button') {
        // Restrict Whitelist to owner/admin only
        if (interaction.user.id !== DISCORD_OWNER_ID) {
          try {
            await interaction.reply({
              embeds: [{
                description: '❌ You do not have permission to manage the Whitelist.',
                color: 16711680,
                timestamp: new Date()
              }],
              flags: MessageFlags.Ephemeral
            });
            await startTemporaryInteractionMessage(interaction);
          } catch {}
          return;
        }
        // Show two dropdowns: Add (online players not in whitelist) and Delete (whitelisted players)
        adminPanelView = 'whitelist';
        try {
          const entries = await getWhitelistEntriesForUI();
          const allOnlinePlayers = bot ? Object.values(bot.players || {}).map(p => p.username) : [];
          const addCandidates = allOnlinePlayers.filter(u => !entries.some(n => n.toLowerCase() === u.toLowerCase()));

          await interaction.update(
            buildWhitelistManagementView(entries, addCandidates, '', 3447003, 0, 0)
          );
          //
        } catch (e) {
          console.error('[Discord] Whitelist button handler failed:', e.message);
          await interaction.update({
            embeds: [{
              description: `Failed to load whitelist: ${e.message}`,
              color: 16711680,
              timestamp: new Date()
            }],
            components: createAdminBackComponents()
          });
        }
      } else if (interaction.customId === 'drop_button') {
        // Restrict Drop to owner/admin only
        if (interaction.user.id !== DISCORD_OWNER_ID) {
          try {
            await interaction.reply({
              embeds: [{
                description: '❌ You do not have permission to use Drop.',
                color: 16711680,
                timestamp: new Date()
              }],
              ephemeral: true
            });
            await startTemporaryInteractionMessage(interaction);
          } catch {}
          return;
        }
        adminPanelView = 'drop';
        if (!bot) {
          await interaction.update({
            embeds: [{
              description: 'Bot is offline.',
              color: 16711680,
              timestamp: new Date()
            }],
            components: createAdminBackComponents()
          });
          return;
        }
        const inventory = bot.inventory.items();
        if (inventory.length === 0) {
          await interaction.update({
            embeds: [{
              description: 'Inventory is empty.',
              color: 3447003,
              timestamp: new Date()
            }],
            components: createAdminBackComponents()
          });
          return;
        }
        const options = inventory.map(item => {
          const name = item.displayName || item.name;
          const count = item.count;
          const value = `${item.slot}_${item.type}_${item.metadata || 0}`;
          const option = new StringSelectMenuOptionBuilder()
            .setLabel(`${name} x${count}`)
            .setValue(b64encode(value));
          const emoji = getItemEmoji(item.name);
          if (emoji) option.setEmoji(emoji);
          return option;
        });
        const selectMenu = new StringSelectMenuBuilder()
          .setCustomId('drop_select')
          .setPlaceholder('Select item to drop')
          .addOptions(options.slice(0, 25)); // Discord limit 25 options
        const row = new ActionRowBuilder().addComponents(selectMenu);
        await interaction.update({
          embeds: [{
            title: 'Drop Item',
            description: 'Select an item from inventory to drop.',
            color: 3447003,
            timestamp: new Date()
          }],
          components: [row, ...createAdminBackComponents()]
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
        if (interaction.user.id !== DISCORD_OWNER_ID) {
          try {
            await interaction.reply({
              embeds: [{
                description: '❌ You do not have permission to manage Chat Settings.',
                color: 16711680,
                timestamp: new Date()
              }],
              ephemeral: true
            });
            
            await startTemporaryInteractionMessage(interaction);
          } catch (err) {
            console.error('[Discord] Error sending permission denied message:', err.message);
          }
          return;
        }
        
        adminPanelView = 'chat';
        await interaction.update(buildChatSettingsPayload());
      } else if (interaction.customId === 'seen_button') {
        await interaction.deferReply();
        
        const activityData = await getWhitelistActivity();
        
        if (activityData.error) {
          await interaction.editReply({
            embeds: [{
              title: `${STATUS_EMOJIS.seen} Player Activity`,
              description: `❌ Error: ${activityData.error}`,
              color: 16711680,
              timestamp: new Date()
            }]
          });
          await startTemporaryInteractionMessage(interaction);
          return;
        }
        
        if (!activityData.players || activityData.players.length === 0) {
          await interaction.editReply({
            embeds: [{
              title: `${STATUS_EMOJIS.seen} Player Activity`,
              description: 'No whitelist players found.',
              color: 3447003,
              timestamp: new Date()
            }]
          });
          await startTemporaryInteractionMessage(interaction);
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
          const entry = `${formatPlayerHeadName(player.username, 'bold')} - ${timeStr}`;

          if (player.is_online) {
            onlinePlayers.push(entry);
          } else if (player.last_seen) {
            offlinePlayers.push(entry);
          } else {
            offlinePlayers.push(`${formatPlayerHeadName(player.username, 'bold')} - Never seen`);
          }
        }
        
        const description = [
          onlinePlayers.length > 0 ? '**Online:**\n' + onlinePlayers.join('\n') : '',
          offlinePlayers.length > 0 ? '\n**Offline:**\n' + offlinePlayers.join('\n') : ''
        ].filter(s => s).join('\n') || 'No activity data available.';
        
        // First send the reply without the Remove button to obtain the message ID
        await interaction.editReply({
          embeds: [{
            title: `${STATUS_EMOJIS.seen} Whitelist Activity (${activityData.players.length} players)`,
            description,
            color: 3447003,
            timestamp: new Date()
          }],
          components: createSeenActivityComponents()
        });

        // Fetch the sent reply to get its ID, then add the Remove button bound to that ID
        const activityMessage = await interaction.fetchReply();
        await activityMessage.edit({
          embeds: [{
            title: `${STATUS_EMOJIS.seen} Whitelist Activity (${activityData.players.length} players)`,
            description,
            color: 3447003,
            timestamp: new Date()
          }],
          components: createSeenActivityComponents(activityMessage.id)
        });
        
        // Refresh activity data every 10 seconds.
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
              const entry = `${formatPlayerHeadName(player.username, 'bold')} - ${timeStr}`;

              if (player.is_online) {
                onlinePlayersUpdated.push(entry);
              } else if (player.last_seen) {
                offlinePlayersUpdated.push(entry);
              } else {
                offlinePlayersUpdated.push(`${formatPlayerHeadName(player.username, 'bold')} - Never seen`);
              }
            }
            
            const updatedDescription = [
              onlinePlayersUpdated.length > 0 ? '**Online:**\n' + onlinePlayersUpdated.join('\n') : '',
              offlinePlayersUpdated.length > 0 ? '\n**Offline:**\n' + offlinePlayersUpdated.join('\n') : ''
            ].filter(s => s).join('\n') || 'No activity data available.';
            const countdownFooter = getTemporaryMessageFooter(activityMessage.id);

            await activityMessage.edit({
              embeds: [{
                title: `${STATUS_EMOJIS.seen} Whitelist Activity (${updatedData.players.length} players)`,
                description: updatedDescription,
                color: 3447003,
                timestamp: new Date(),
                ...(countdownFooter ? { footer: countdownFooter } : {})
              }],
              components: createSeenActivityComponents(activityMessage.id)
            });
          } catch (err) {
            // If the message was deleted or is unknown, stop the interval quietly
            const msg = (err && err.message) ? err.message : '';
            if (err.code === 10008 || msg.includes('Unknown Message')) {
              clearInterval(updateInterval);
              seenActivityUpdateIntervals.delete(activityMessage.id);
            } else {
              clearInterval(updateInterval);
              seenActivityUpdateIntervals.delete(activityMessage.id);
            }
          }
        }, 10_000);
        seenActivityUpdateIntervals.set(activityMessage.id, updateInterval);

        await startTemporaryInteractionMessage(interaction);

        // The temporary message itself is deleted after 2 minutes.
        setTimeout(() => {
          clearInterval(updateInterval);
          seenActivityUpdateIntervals.delete(activityMessage.id);
        }, 2 * 60 * 1000);
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
          await startTemporaryInteractionMessage(interaction);
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
            title: `${STATUS_EMOJIS.mentions} Mention Keywords`,
            description,
            color: 3447003,
            timestamp: new Date()
          }],
          components
        });
        await startTemporaryInteractionMessage(interaction);
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
      } else if (interaction.customId === 'seen_non_whitelist_search') {
        stopSeenActivityUpdates(interaction.message?.id);
        const modal = new ModalBuilder()
          .setCustomId('seen_non_whitelist_search_modal')
          .setTitle('Search non-whitelist seen');

        const usernameInput = new TextInputBuilder()
          .setCustomId('seen_search_query')
          .setLabel('Nickname contains')
          .setPlaceholder('Type at least 2 characters')
          .setStyle(TextInputStyle.Short)
          .setRequired(true);

        modal.addComponents(new ActionRowBuilder().addComponents(usernameInput));
        await interaction.showModal(modal);
      } else if (interaction.customId.startsWith('remove_')) {
        const messageId = interaction.customId.split('_')[1];
        try {
          stopSeenActivityUpdates(messageId);
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
          .setPlaceholder(`e.g., ${appConfig.minecraft.adminUsername}`)
          .setStyle(TextInputStyle.Short)
          .setRequired(true);

        const actionRow = new ActionRowBuilder().addComponents(keywordInput);
        modal.addComponents(actionRow);

        await interaction.showModal(modal);
      } else if (interaction.customId === 'obsidian_farm_button') {
        if (interaction.user.id !== DISCORD_OWNER_ID) {
          await interaction.reply({
            content: 'Only the owner can view obsidian farm controls.',
            flags: MessageFlags.Ephemeral
          });
          return;
        }
        await interaction.deferUpdate();
        await openObsidianStatsPanel(interaction, { updateMessage: true, deferredUpdate: true });
        return;
      }
    } else if (interaction.isModalSubmit() && interaction.customId === 'seen_non_whitelist_search_modal') {
      const query = interaction.fields.getTextInputValue('seen_search_query').trim();
      stopSeenActivityUpdates(interaction.message?.id);
      try {
        await interaction.deferUpdate();
        const result = await searchNonWhitelistActivity(query, 25);
        const payload = {
          embeds: [buildNonWhitelistSeenSearchEmbed(query, result)],
          components: interaction.message?.id ? createSeenActivityComponents(interaction.message.id) : []
        };
        if (interaction.message) {
          await interaction.message.edit(payload);
        }
      } catch (err) {
        const errorPayload = {
          embeds: [{
            title: `${STATUS_EMOJIS.seen} Non-whitelist Search`,
            description: `Search failed: ${err.message}`,
            color: 16711680,
            timestamp: new Date()
          }],
          components: interaction.message?.id ? createSeenActivityComponents(interaction.message.id) : []
        };
        if (interaction.message && interaction.deferred) {
          await interaction.message.edit(errorPayload).catch(() => {});
        } else if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({
            ...errorPayload,
            flags: MessageFlags.Ephemeral
          }).catch(() => {});
        }
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
            title: `${STATUS_EMOJIS.connected} Keyword Added`,
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
                  description: `${STATUS_EMOJIS.connected} Keyword added (hidden).`,
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
              title: `${STATUS_EMOJIS.connected} Keyword Removed`,
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
                    description: `${STATUS_EMOJIS.connected} Keyword removed (hidden).`,
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
        const sentToGame = sendMinecraftChat(message);
        if (sentToGame && !message.trim().startsWith('/') && !message.trim().startsWith('!')) {
          recordGameChatMessage(bot.username || ADMIN_PANEL_BOT_NAME, message).catch(() => {});
        }
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
                description: `${STATUS_EMOJIS.connected} **${interaction.user.username}** sent:\n\`${message}\``,
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
        sendMinecraftChat(command);

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
        sendMinecraftChat(command);

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
          setWhisperChannelMapping(interaction.user.id, selectedUsername, whisperChannel.id);
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
        content: `${STATUS_EMOJIS.connected} Auto-delete time set to ${minutes} minute${minutes !== 1 ? 's' : ''}. This will apply to new messages in this dialog.`,
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
          components: createAdminBackComponents()
        });
        return;
      }
      try {
        const targetUsername = await dropItemToNearestPlayer(item);
        console.log(`[Drop] Dropped ${item.count} x ${item.displayName || item.name} toward ${targetUsername || 'nearest player'} by ${interaction.user.tag}`);
        await interaction.editReply({
          embeds: [{
            title: 'Item Dropped',
            description: `Dropped ${item.count} x ${item.displayName || item.name}${targetUsername ? ` to ${targetUsername}` : ''}`,
            color: 65280,
            timestamp: new Date()
          }],
          components: createAdminBackComponents()
        });
      } catch (err) {
        console.error('[Drop] Error:', err.message);
        await interaction.editReply({
          embeds: [{
            description: `Failed to drop item: ${err.message}`,
            color: 16711680,
            timestamp: new Date()
          }],
          components: createAdminBackComponents()
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
            title: `${STATUS_EMOJIS.mentions} Mention Keywords`,
            description: `${STATUS_EMOJIS.connected} Removed keyword "\`${keyword}\`"\n\n${description}`,
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
          components: createAdminBackComponents()
        });
        return;
      }
      try {
        await pool.query('INSERT INTO ignored_users (username, added_by) VALUES ($1, $2) ON CONFLICT (username) DO NOTHING', [selectedUsername.toLowerCase(), interaction.user.tag]);
        ignoredChatUsernames = await loadIgnoredChatUsernames();
        console.log(`[Ignore] Added ${selectedUsername} to ignore list by ${interaction.user.tag}`);
        await interaction.editReply(buildChatSettingsPayload());
        return;

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
            description: `${STATUS_EMOJIS.connected} Added ${selectedUsername} to ignore list.\n\nManage ignored players for chat messages.`,
            color: 65280,
            timestamp: new Date()
          }],
          components
        });
      } catch (err) {
        console.error('[Ignore] Error:', err.message);
        await interaction.editReply({
          embeds: [{
            description: `Failed to add ${selectedUsername} to ignore list: ${err.message}`,
            color: 16711680,
            timestamp: new Date()
          }],
          components: createAdminBackComponents()
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
          components: createAdminBackComponents()
        });
        return;
      }
      try {
        const result = await pool.query('DELETE FROM ignored_users WHERE username = $1', [selectedUsername.toLowerCase()]);
        if (result.rowCount > 0) {
          ignoredChatUsernames = await loadIgnoredChatUsernames();
          console.log(`[Unignore] Removed ${selectedUsername} from ignore list by ${interaction.user.tag}`);
          await interaction.editReply(buildChatSettingsPayload());
          return;

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
              description: `${STATUS_EMOJIS.connected} Removed ${selectedUsername} from ignore list.\n\nManage ignored players for chat messages.`,
              color: 65280,
              timestamp: new Date()
            }],
            components
          });
        } else {
          await interaction.editReply({
            embeds: [{
              description: `${selectedUsername} is not in ignore list.`,
              color: 16776960,
              timestamp: new Date()
            }],
            components: createAdminBackComponents()
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
          components: createAdminBackComponents()
        });
      }
    } else if (interaction.isStringSelectMenu() && interaction.customId.startsWith('delete_whitelist_select')) {

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
                components: createAdminBackComponents()
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
              components: createAdminBackComponents()
            });
            return;
          }

          // Update the message
          const allOnlinePlayers = bot ? Object.values(bot.players || {}).map(p => p.username) : [];
          const addCandidates = allOnlinePlayers.filter(u => !whitelist.some(n => n.toLowerCase() === u.toLowerCase()));

          await interaction.editReply(
            buildWhitelistManagementView(whitelist, addCandidates, `${STATUS_EMOJIS.connected} Removed ${selectedUsername} from whitelist.`, 65280)
          );

        } catch (err) {
          console.error('[Whitelist Delete] Error:', err.message);

          try {
            await interaction.editReply({
              embeds: [{
                description: `Failed to remove ${selectedUsername} from whitelist: ${err.message}`,
                color: 16711680,
                timestamp: new Date()
              }],
              components: createAdminBackComponents()
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
    } else if (interaction.isModalSubmit() && interaction.customId === 'obsidian_farm_modal') {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      if (interaction.user.id !== DISCORD_OWNER_ID) {
        await interaction.editReply({ embeds: [{ description: '❌ Only the owner can configure the obsidian farm.', color: 16711680, timestamp: new Date() }] });
        return;
      }
      const rawX = interaction.fields.getTextInputValue('farm_x').trim();
      const rawY = interaction.fields.getTextInputValue('farm_y').trim();
      const rawZ = interaction.fields.getTextInputValue('farm_z').trim();
      const x = Number(rawX), y = Number(rawY), z = Number(rawZ);
      if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
        await interaction.editReply({ embeds: [{ description: '❌ Invalid coordinates — X, Y and Z must be numbers.', color: 16711680, timestamp: new Date() }] });
        return;
      }
      farm.configure(x, y, z);
      try {
        await persistObsidianFarmCoordinates();
        const result = await startConfiguredObsidianFarm();
        await interaction.editReply({
          embeds: [buildObsidianStartEmbed(result.started, result.config)]
        });
      } catch (err) {
        await interaction.editReply({
          embeds: [{
            description: `❌ Obsidian farm could not start: ${err.message}`,
            color: 16711680,
            timestamp: new Date()
          }]
        });
        return;
      }
      await startTemporaryInteractionMessage(interaction);
    } else if (interaction.isStringSelectMenu() && interaction.customId.startsWith('add_whitelist_select')) {
      await interaction.deferUpdate();
      const encodedUsername = interaction.values[0];
      const selectedUsername = b64decode(encodedUsername);
      try {
        const { whitelist, changed } = await addUsernameToWhitelist(selectedUsername, interaction.user.tag);

        const allOnlinePlayers = bot ? Object.values(bot.players || {}).map(p => p.username) : [];
        const addCandidates = allOnlinePlayers.filter(u => !whitelist.some(n => n.toLowerCase() === u.toLowerCase()));

        await interaction.editReply(
          buildWhitelistManagementView(
            whitelist,
            addCandidates,
            changed ? `${STATUS_EMOJIS.connected} Added ${selectedUsername} to whitelist.` : `${selectedUsername} is already in whitelist.`,
            changed ? 65280 : 16776960
          )
        );

      } catch (err) {
        console.error('[Whitelist Add] Error:', err.message);
        await interaction.editReply({
          embeds: [{
            description: `Failed to add ${selectedUsername}: ${err.message}`,
            color: 16711680,
            timestamp: new Date()
          }],
          components: createAdminBackComponents()
        });
      }
    }
  });

  discordClient.on('messageCreate', async message => {
    if (message.author.bot) return;

    const trimmedContent = message.content.trim();
    if (
      message.guild &&
      message.channel.id === DISCORD_CHAT_CHANNEL_ID &&
      trimmedContent &&
      !trimmedContent.startsWith('!') &&
      !trimmedContent.startsWith('/')
    ) {
      growingChild?.learn({
        source: 'discord',
        authorId: message.author.id,
        authorName: message.member?.displayName || message.author.username,
        channelId: message.channel.id,
        channelName: message.channel.name || 'Discord channel',
        text: trimmedContent,
        addressed:
          Boolean(discordClient.user && message.mentions.users.has(discordClient.user.id)) ||
          /\b(?:wheatmagnate|magnate|child|бот|ребенок|ребёнок)\b/iu.test(trimmedContent)
      });
    }

    if (!message.guild) {
      if (message.author.id !== DISCORD_OWNER_ID) return;
      if (await handleGrowingChildFeedDM(message)) return;
      return;
    }

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
            sendMinecraftChat(command);
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
        const replyUsername = await getReplyMinecraftUsername(message);
        const gameText = replyUsername && !text.startsWith('/') && !text.startsWith('!')
          ? `${replyUsername} ${text}`
          : text;
        // Don't add username prefix for commands (starting with / or !)
        if (gameText.startsWith('/') || gameText.startsWith('!')) {
          armSeenCommandResponseCapture(gameText);
          const sentToGame = sendMinecraftChat(gameText);
          if (sentToGame) {
            await sendGameChatMessageToDiscord(username, gameText, { allowMentions: false });
          }
          console.log(`[Chat] Sent "${gameText}" by ${message.author.tag}`);
        } else {
          // Send without zero-width space so Minecraft chat is clean
          const sentToGame = sendMinecraftChat(`[${username}] ${gameText}`);
          if (sentToGame) {
            recordGameChatMessage(bot.username || ADMIN_PANEL_BOT_NAME, `[${username}] ${gameText}`).catch(() => {});
          }
          console.log(`[Chat] Sent "[${username}] ${gameText}" by ${message.author.tag}`);
        }
        
        // Delete original message and send confirmation
        try {
          await message.delete();
        } catch (e) {
          console.error('[Chat] Failed to delete message:', e.message);
        }
        
        // Send confirmation showing what was sent to game
        try {
          let sentText = gameText;
          if (!gameText.startsWith('/') && !gameText.startsWith('!')) {
            sentText = `[${username}] ${gameText}`;
          }
          await message.channel.send({
            embeds: [{
              description: `${STATUS_EMOJIS.connected} **${message.author.username}** sent:\n\`${sentText}\``,
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
      setDisconnectReason(`Restart requested by ${lastCommandUser}`);
      if (!bot) {
        shouldReconnect = true;
        createBot();
        await message.reply('Bot is offline. Started a new connection attempt.');
        return;
      }
      if (statusMessage) {
        statusMessage.edit({
          embeds: [{
            title: getServerStatusTitle(),
            description: `${STATUS_EMOJIS.update} Restarting... Requested by ${lastCommandUser}`,
            color: 16776960,
            timestamp: new Date()
          }],
          components: createStatusButtons()
        }).catch(console.error);
      }
      pauseMinecraftConnection('Restart command');
      shouldReconnect = true;
      createBot();
    }

    if (message.content === '!pause') {
      console.log(`[Command] pause until resume by ${message.author.tag} via Discord`);
      lastCommandUser = message.author.tag;
      shouldReconnect = false;
      clearReconnectTimer();
      clearResumeTimer();
      setDisconnectReason(`Paused by ${lastCommandUser}`);
      pauseMinecraftConnection('Pause until resume');
    }

    const pauseMatch = message.content.match(/^!pause\s+(\d+)$/);
    if (pauseMatch) {
      const minutes = parseInt(pauseMatch[1]);
      if (minutes > 0) {
        console.log(`[Command] pause ${minutes}m by ${message.author.tag} via Discord`);
        sendDiscordNotification(`Command: !pause ${minutes} by \`${message.author.tag}\` via Discord`, 16776960);
        shouldReconnect = false;
        clearReconnectTimer();
        setDisconnectReason(`Paused for ${minutes}m by ${message.author.tag}`);
        pauseMinecraftConnection(`Paused ${minutes}m`);
        scheduleResume(minutes * 60 * 1000, `[Bot] Paused for ${minutes} minutes.`);
        await message.reply(`Bot paused for ${minutes} minutes.`);
      }
    }

    if (message.content === '!resume') {
      setDisconnectReason(null);
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
      await updateStatusMessage();
      resumeBot();
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
            await pool.query('INSERT INTO whitelist (username, added_by) VALUES ($1, $2) ON CONFLICT DO NOTHING', [targetUsername, message.author.tag]);
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
            description: success ? `${STATUS_EMOJIS.connected} Added ${targetUsername} to whitelist (${source}).` : `No changes for ${targetUsername}.`,
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
        await pool.query('INSERT INTO whitelist (username, added_by) VALUES ($1, $2) ON CONFLICT DO NOTHING', [targetUsername, message.author.tag]);
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
        await message.reply(`${STATUS_EMOJIS.connected} Added ${targetUsername} to ignore list.`);
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
          await message.reply(`${STATUS_EMOJIS.connected} Removed ${targetUsername} from ignore list.`);
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
        const sentToGame = sendMinecraftChat(text);
        if (sentToGame && !text.startsWith('/') && !text.startsWith('!')) {
          recordGameChatMessage(bot.username || ADMIN_PANEL_BOT_NAME, text).catch(() => {});
        }
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
            title: `${STATUS_EMOJIS.connected} Keyword Added`,
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
              title: `${STATUS_EMOJIS.connected} Keyword Removed`,
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
              title: `${STATUS_EMOJIS.whitelist} Your Mention Keywords`,
              description: `You will be mentioned when these words appear in game chat:\n\n${result.keywords.map(k => `• ${k}`).join('\n')}\n\nUse \`!addkeyword <word>\` to add more\nUse \`!removekeyword <word>\` to remove`,
              color: 3447003,
              timestamp: new Date()
            }]
          });
        } else {
          await message.reply({
            embeds: [{
              title: `${STATUS_EMOJIS.whitelist} Your Mention Keywords`,
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

// Send Microsoft auth link only to the configured owner's Discord DM.
async function sendOwnerDM(title, description, color = 16711680) {
  if (!DISCORD_OWNER_ID) return;
  if (!discordClient?.isReady()) {
    pendingOwnerDMs.push({ title, description, color });
    return;
  }
  try {
    const owner = await discordClient.users.fetch(DISCORD_OWNER_ID);
    if (!owner) return;
    await owner.send({
      embeds: [{
        title,
        description,
        color,
        timestamp: new Date()
      }],
      components: [createDeleteDMRow()]
    });
  } catch (err) {
    console.error('[Discord] Failed to DM owner:', err.message);
  }
}

async function sendAuthLinkToDiscord(url) {
  if (!DISCORD_OWNER_ID || !discordClient) return;
  try {
    if (!discordClient.isReady()) {
      pendingAuthLinks.push(url);
      return;
    }
    const owner = await discordClient.users.fetch(DISCORD_OWNER_ID);
    if (owner) {
      const sentMessage = await owner.send({
        embeds: [{
          title: 'Microsoft Login',
          description: url,
          color: 16776960,
          timestamp: new Date()
        }],
        components: [createDeleteDMRow()]
      });
      authMessageIds.set(sentMessage.id, sentMessage.channelId);
    }
  } catch (e) {
    console.error('Failed to send auth link to Discord:', e.message);
  }
}

// Delete or neutralize previously sent Microsoft Login messages after successful sign-in
async function cleanupAuthMessages() {
  if (!discordClient || !discordClient.isReady()) return;
  if (authMessageIds.size === 0) return;
  try {
    for (const [id, channelId] of Array.from(authMessageIds.entries())) {
      try {
        const channel = await discordClient.channels.fetch(channelId);
        if (!channel || !channel.isTextBased()) continue;
        const msg = await channel.messages.fetch(id);
        // Remove buttons first to prevent further clicks
        try { await msg.edit({ components: [] }); } catch {}
        // Then delete the message
        await msg.delete();
      } catch {}
      authMessageIds.delete(id);
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
  const BASE_URL = 'https://microsoft.com/link?otc=';

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
