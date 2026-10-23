'use strict';

// Area Explorer (the OnFocus Meteor addon's explorer module) on the dashboard: the mod uploads
// what it finds - bases, signs, items on the ground, markers (End Portals, Shulker Boxes...) - and its live run status with an API token;
// signed-in users browse the finds and watch the run.

const crypto = require('node:crypto');

const KINDS = Object.freeze(['BASE', 'SIGN', 'ITEM', 'MARKER']);
const SAME_BASE_DISTANCE = 64;
/** A named pet sent again within this many blocks of where it was is the same pet (the mod's waypoints go by this too). */
const SAME_PET_DISTANCE = 48;
/** The marker with a tab of its own; the Markers tab is the rest. */
const END_PORTAL = 'End Portal';
const PLACED_SHULKER = 'Placed Shulker Box';
// A pet's name as compared: no case, spaces or invisible characters
const PET_LABEL_SQL = "lower(regexp_replace(label, '[[:space:]\\u00a0\\u200b-\\u200f\\ufeff]', '', 'g'))";
const MAX_FINDS_PER_BATCH = 1000;
const MAX_INGEST_BYTES = 2 * 1024 * 1024;
const MAX_COORDINATE = 30_000_000;
const MAX_Y = 4096;
const ONLINE_WINDOW_MS = 90_000;
const TOKEN_PREFIX = 'aex_';
const MAX_PAGE_SIZE = 200;
// A Java name, or a Bedrock one through Geyser/Floodgate (".Name", "*Name")
const PLAYER_NAME_PATTERN = /^[.*]?[A-Za-z0-9_]{1,32}$/;
const TOP_LOOT_NAMES = 8;
// Commands from the site's map to a mod: what they can be, how big an area, how long they wait to be picked up
const COMMAND_KINDS = Object.freeze(['EXPLORE', 'RESCAN']);
// A marker made on the site's map waits far longer for its mod than an area: it goes into Xaero once the game is on its server
const WAYPOINT_TTL_DAYS = 30;
// The command protocol a mod needs for a kind of command: an older one would take a marker for an area to explore
const COMMAND_PROTOCOLS = Object.freeze({ EXPLORE: 0, RESCAN: 0, WAYPOINT: 3, UNMARK: 4 });
// Commands that wait for the mod to be on their server, for days, and don't replace each other
const MARKER_COMMANDS = Object.freeze(['WAYPOINT', 'UNMARK']);
// Markers taken out in game per request, and how near a loot marker's items lie (twice the mod's pile radius)
const MAX_REMOVED_MARKERS = 500;
const LOOT_MARKER_REACH = 32;
const MAX_WAYPOINT_NAME = 32;
// Xaero's waypoints come in Minecraft's 16 chat colours only
const WAYPOINT_COLORS = Object.freeze([0x000000, 0x0000AA, 0x00AA00, 0x00AAAA, 0xAA0000, 0xAA00AA, 0xFFAA00, 0xAAAAAA,
  0x555555, 0x5555FF, 0x55FF55, 0x55FFFF, 0xFF5555, 0xFF55FF, 0xFFFF55, 0xFFFFFF]);
const MAX_COMMAND_SIDE_CHUNKS = 8192;
const COMMAND_TTL_MINUTES = 10;
// A command the mod hasn't confirmed goes again with its next check-in this many seconds on
const COMMAND_REDELIVER_SECONDS = 5;
// What a mod reports of a command it got (by id), and the states the site gives it itself
const COMMAND_MOD_STATES = Object.freeze(['accepted', 'running', 'stopped', 'completed', 'rejected']);
const COMMAND_STATES = Object.freeze(['queued', 'delivered', ...COMMAND_MOD_STATES, 'cancelled', 'expired']);
const COMMAND_FINAL_STATES = Object.freeze(['completed', 'rejected']);
const MAX_COMMAND_UPDATES = 100;
const MAX_COMMAND_REASON = 300;
const COMMAND_LIST_LIMIT = 50;
// How the system log names a command of each kind
const COMMAND_NOUNS = Object.freeze({ EXPLORE: 'explore', RESCAN: 'rescan', WAYPOINT: 'marker', UNMARK: 'take-out' });
// The flown-over grid: cells a side at most, and cells in all
const MAX_COVERAGE_SIDE = 2000;
const MAX_COVERAGE_CELLS = 250_000;
// Markers of structures that stay where they are: they never come off the site
const PERMANENT_MARKERS = Object.freeze(['End Portal', 'End Gateway', 'End City', 'Ancient City', 'Trial Chamber']);
const EVENT_LEVELS = Object.freeze(['info', 'success', 'warn', 'error']);
const MAX_EVENTS_PER_BATCH = 200;
const MAX_EVENT_PAGE = 200;
// What the log's "Connection" filter shows: losing and getting back the server
const CONNECTION_EVENT_TYPES = Object.freeze(['disconnect', 'reconnect', 'rejoin', 'totem', 'leave']);
const EVENT_RETENTION_DAYS = 90;
const EVENT_PRUNE_INTERVAL_MS = 60 * 60_000;

// What loot is worth, by the name the game gives it: the higher, the more it's worth going back for
const LOOT_VALUES = Object.freeze({
  'Dragon Egg': 100, Elytra: 95, 'Nether Star': 90, Beacon: 88, 'Heavy Core': 86, Mace: 85,
  'Netherite Block': 84, 'Netherite Chestplate': 82, 'Netherite Leggings': 81, 'Netherite Helmet': 80, 'Netherite Boots': 80,
  'Netherite Sword': 79, 'Netherite Pickaxe': 79, 'Netherite Axe': 78, 'Netherite Shovel': 74, 'Netherite Hoe': 72,
  'Totem of Undying': 77, 'Enchanted Golden Apple': 76, 'Netherite Ingot': 73, 'Netherite Upgrade': 70,
  'Trident': 68, 'Dragon Head': 66, 'Written Book': 64, Map: 62, 'Enchanted Book': 60, 'Diamond Block': 58,
  'Ancient Debris': 56, 'Netherite Scrap': 55, 'End Crystal': 52, 'Book and Quill': 50, 'Ender Chest': 45,
  'Diamond Chestplate': 42, 'Diamond Leggings': 41, 'Diamond Helmet': 40, 'Diamond Boots': 40, 'Diamond Sword': 39,
  'Diamond Pickaxe': 39, 'Diamond Axe': 38, 'Diamond Shovel': 34, 'Diamond Hoe': 32, Diamond: 30,
  'Golden Apple': 25, 'Experience Bottle': 20
});

/** How much a kind of loot is worth; shulker boxes of every colour alike. 0: not worth listing. */
function lootValue(name) {
  if (/Shulker Box$/.test(name)) return 75;
  return LOOT_VALUES[name] || 0;
}

function stripControl(value, { keepNewlines = false } = {}) {
  const pattern = keepNewlines ? /[\u0000-\u0009\u000B-\u001F\u007F]/g : /[\u0000-\u001F\u007F]/g;
  return String(value ?? '').replace(/\r\n?/g, '\n').replace(pattern, '');
}

function normalizeText(value, maxLength, options) {
  return stripControl(value, options).trim().slice(0, maxLength);
}

/**
 * A find's name without the § colour codes a resource pack or a server's translations may put in it
 * ("Golden Apple §f(§f§f)") and the empty brackets they leave - the mods before this sent them.
 */
function cleanFindName(value) {
  return String(value ?? '').replace(/§.?/g, '').replace(/\p{Co}/gu, '')
    .replace(/\(\s*\)|\[\s*\]/g, '').replace(/\s+/g, ' ').trim();
}

function normalizeScopeName(value, maxLength) {
  return normalizeText(value, maxLength).toLowerCase();
}

function normalizeInteger(value, limit) {
  const number = Number(value);
  if (!Number.isInteger(number) || Math.abs(number) > limit) return null;
  return number;
}

function normalizeFoundAt(value, now = Date.now()) {
  const time = typeof value === 'number' ? value : Date.parse(String(value || ''));
  // Not before Minecraft, not more than a day ahead of the server's clock
  if (!Number.isFinite(time) || time < Date.UTC(2009, 0, 1) || time > now + 86_400_000) return null;
  return new Date(time);
}

/** A find as the mod sends it, checked and trimmed; null if it isn't one. */
function normalizeFind(raw, now = Date.now()) {
  if (!raw || typeof raw !== 'object') return null;
  const kind = String(raw.kind || '').toUpperCase();
  if (!KINDS.includes(kind)) return null;
  const x = normalizeInteger(raw.x, MAX_COORDINATE);
  const y = normalizeInteger(raw.y, MAX_Y);
  const z = normalizeInteger(raw.z, MAX_COORDINATE);
  const foundAt = normalizeFoundAt(raw.foundAt, now);
  const cleanName = normalizeText(cleanFindName(raw.name), 128);
  // Builds of the mod before placed shulker boxes were told from loot called theirs "Shulker Box"
  const name = kind === 'MARKER' && cleanName === 'Shulker Box' ? PLACED_SHULKER : cleanName;
  if (x === null || y === null || z === null || !foundAt || !name) return null;
  const count = kind === 'ITEM' ? Math.min(Math.max(normalizeInteger(raw.count, 1_000_000) ?? 1, 1), 1_000_000) : 0;
  return {
    kind, x, y, z, foundAt, name, count,
    label: normalizeText(raw.label, 512, { keepNewlines: kind === 'SIGN' }),
    details: normalizeText(raw.details, 2000, { keepNewlines: kind === 'SIGN' })
  };
}

/** What makes two finds the same: a sign's block; an item's block, kind, count and name; a marker's block and what it marks (and a named pet's name). Bases are told apart by distance. */
function dedupeKey(find) {
  const at = `${find.kind}:${find.x}:${find.y}:${find.z}`;
  if (find.kind === 'MARKER') return find.label ? `${at}:${find.name}:${find.label}` : `${at}:${find.name}`;
  return find.kind === 'ITEM' ? `${at}:${find.name}:${find.count}:${find.label}` : at;
}

/** A marker with a name of its own: a named pet ("Named Dog" "Rex"). */
function isNamedPet(find) {
  return find.kind === 'MARKER' && !!find.label;
}

/** A pet's name as compared, as PET_LABEL_SQL has it. */
function petLabelKey(label) {
  return String(label || '').replace(/[\s\u00a0\u200b-\u200f\ufeff]/g, '').toLowerCase();
}

/**
 * The flown-over grid as the mod sends it, checked: undefined when it didn't send one (keep the
 * last), null when it's no good.
 */
function normalizeCoverage(raw) {
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw !== 'object') return null;
  const cell = normalizeInteger(raw.cell, 4096);
  const cols = normalizeInteger(raw.cols, MAX_COVERAGE_SIDE);
  const rows = normalizeInteger(raw.rows, MAX_COVERAGE_SIDE);
  const minCX = normalizeInteger(raw.minCX, MAX_COORDINATE / 16);
  const minCZ = normalizeInteger(raw.minCZ, MAX_COORDINATE / 16);
  const version = normalizeInteger(raw.version, 2 ** 31 - 1);
  const bits = typeof raw.bits === 'string' ? raw.bits : '';
  if ([cell, cols, rows, minCX, minCZ, version].some(value => value === null) || cell < 1 || cols < 1 || rows < 1) return null;
  if (cols * rows > MAX_COVERAGE_CELLS || !/^[A-Za-z0-9+/]*={0,2}$/.test(bits)) return null;
  if (Buffer.from(bits, 'base64').length !== Math.ceil((cols * rows) / 8)) return null;
  return { version, cell, minCX, minCZ, cols, rows, bits };
}

/** Biggest sector grid whose cells are kept: one letter each. */
const MAX_SECTOR_CELLS = 4096;

/**
 * A Sectors run's grid inside the status area: size and origin, counts, and one letter per cell row by
 * row (a current, n next, c finished, d deferred, s skipped, o to do); null if it isn't one.
 */
function normalizeSectors(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const size = normalizeInteger(raw.size, 4096);
  const cols = normalizeInteger(raw.cols, 1_000_000);
  const rows = normalizeInteger(raw.rows, 1_000_000);
  const count = normalizeInteger(raw.count, 1e12);
  if (!(size > 0 && cols > 0 && rows > 0 && count > 0)) return null;
  const counted = value => Math.min(Math.max(0, normalizeInteger(value, 1e12) ?? 0), count);
  const cells = typeof raw.cells === 'string' && cols * rows <= MAX_SECTOR_CELLS
    && raw.cells.length === cols * rows && /^[ancdso]*$/.test(raw.cells) ? raw.cells : null;
  return {
    size, cols, rows, count,
    originX: normalizeInteger(raw.originX, MAX_COORDINATE) ?? 0,
    originZ: normalizeInteger(raw.originZ, MAX_COORDINATE) ?? 0,
    done: counted(raw.done),
    deferred: counted(raw.deferred),
    skipped: counted(raw.skipped),
    reach: Math.max(0, normalizeInteger(raw.reach, 64) ?? 0),
    cells
  };
}

function normalizeStatus(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const percent = Number(raw.percent);
  const eta = Number(raw.etaSeconds);
  const yaw = raw.yaw === null || raw.yaw === undefined || raw.yaw === '' ? NaN : Number(raw.yaw);
  const area = raw.area && typeof raw.area === 'object' ? {
    minX: normalizeInteger(raw.area.minX, MAX_COORDINATE),
    minZ: normalizeInteger(raw.area.minZ, MAX_COORDINATE),
    maxX: normalizeInteger(raw.area.maxX, MAX_COORDINATE),
    maxZ: normalizeInteger(raw.area.maxZ, MAX_COORDINATE)
  } : null;
  const runFinds = raw.runFinds && typeof raw.runFinds === 'object' ? {
    bases: Math.max(0, normalizeInteger(raw.runFinds.bases, 1e9) ?? 0),
    signs: Math.max(0, normalizeInteger(raw.runFinds.signs, 1e9) ?? 0),
    items: Math.max(0, normalizeInteger(raw.runFinds.items, 1e9) ?? 0)
  } : null;
  const sectors = area ? normalizeSectors(raw.area.sectors) : null;
  if (area && sectors) area.sectors = sectors;
  return {
    player: normalizeText(raw.player, 16),
    phase: normalizeText(raw.phase, 16).toUpperCase() || 'IDLE',
    mode: normalizeText(raw.mode, 16),
    paused: raw.paused === true,
    percent: Number.isFinite(percent) ? Math.min(Math.max(percent, 0), 100) : null,
    etaSeconds: Number.isFinite(eta) && eta >= 0 ? Math.min(Math.round(eta), 10 * 365 * 86_400) : null,
    x: normalizeInteger(raw.x, MAX_COORDINATE),
    y: normalizeInteger(raw.y, MAX_Y),
    z: normalizeInteger(raw.z, MAX_COORDINATE),
    yaw: Number.isFinite(yaw) ? ((yaw % 360) + 360) % 360 : null,
    area: area && ['minX', 'minZ', 'maxX', 'maxZ'].every(key => area[key] !== null) ? area : null,
    runFinds,
    coverage: normalizeCoverage(raw.coverage)
  };
}

/** A run log event as the mod sends it, checked and trimmed; null if it isn't one. */
function normalizeEvent(raw, now = Date.now()) {
  if (!raw || typeof raw !== 'object') return null;
  const key = String(raw.id ?? '');
  if (!/^[A-Za-z0-9-]{8,64}$/.test(key)) return null;
  const occurredAt = normalizeFoundAt(raw.at, now);
  const message = normalizeText(raw.message, 500);
  if (!occurredAt || !message) return null;
  const level = String(raw.level || '').toLowerCase();
  const type = normalizeText(raw.type, 24).toLowerCase().replace(/[^a-z_-]/g, '') || 'note';
  const coordinate = (value, limit) => value === null || value === undefined ? null : normalizeInteger(value, limit);
  return {
    key, occurredAt, message, type,
    level: EVENT_LEVELS.includes(level) ? level : 'info',
    player: normalizeText(raw.player, 16),
    x: coordinate(raw.x, MAX_COORDINATE),
    y: coordinate(raw.y, MAX_Y),
    z: coordinate(raw.z, MAX_COORDINATE)
  };
}

function publicEvent(row, tokenName = row.token_name) {
  return {
    id: String(row.id),
    server: row.server,
    dimension: row.dimension,
    player: row.player,
    level: row.level,
    type: row.type,
    message: row.message,
    x: row.x,
    y: row.y,
    z: row.z,
    occurredAt: row.occurred_at,
    tokenName: tokenName || null
  };
}

function publicFind(row) {
  return {
    id: String(row.id),
    server: row.server,
    dimension: row.dimension,
    kind: row.kind,
    x: row.x,
    y: row.y,
    z: row.z,
    foundAt: row.found_at,
    name: cleanFindName(row.name),
    count: row.item_count,
    label: row.label,
    details: row.details,
    // Starred by the user asking: their Favorites tab
    favorite: row.favorite === true
  };
}

function publicStatus(row, now = Date.now()) {
  const updatedAt = new Date(row.updated_at);
  return {
    tokenId: String(row.token_id),
    tokenName: row.token_name || null,
    server: row.server,
    dimension: row.dimension,
    player: row.player,
    phase: row.phase,
    mode: row.mode,
    paused: row.paused,
    percent: row.percent === null || row.percent === undefined ? null : Number(row.percent),
    etaSeconds: row.eta_seconds,
    x: row.x,
    y: row.y ?? null,
    z: row.z,
    area: row.area || null,
    yaw: row.yaw === null || row.yaw === undefined ? null : Number(row.yaw),
    runFinds: row.run_finds || null,
    // The cells themselves are fetched on their own when this changes: not sent every second
    coverageVersion: row.coverage?.version ?? null,
    updatedAt: row.updated_at,
    // Stopped, or the game in its main menu (ready for a command to any server): no run going
    online: row.phase !== 'IDLE' && row.phase !== 'MENU' && now - updatedAt.getTime() <= ONLINE_WINDOW_MS
  };
}

function publicCommand(row) {
  return {
    id: String(row.id),
    tokenId: String(row.token_id),
    tokenName: row.token_name || null,
    kind: row.kind,
    server: row.server,
    dimension: row.dimension,
    minX: row.min_cx * 16,
    minZ: row.min_cz * 16,
    maxX: row.max_cx * 16 + 15,
    maxZ: row.max_cz * 16 + 15,
    size: `${row.max_cx - row.min_cx + 1}x${row.max_cz - row.min_cz + 1} chunks`,
    createdBy: row.created_by || null,
    createdAt: row.created_at,
    state: row.state,
    reason: row.state_reason || null,
    stateAt: row.state_at || row.created_at,
    deliveredAt: row.delivered_at || null,
    deliveries: row.delivery_count ?? 0,
    confirms: Boolean(row.confirms),
    acceptedAt: row.accepted_at || null,
    startedAt: row.started_at || null,
    finishedAt: row.finished_at || null,
    ...(MARKER_COMMANDS.includes(row.kind) ? { waypoint: publicWaypoint(row) } : {})
  };
}

/** A WAYPOINT command's marker: its name, block and colour (0xRRGGBB); an UNMARK's find, with its kind. */
function publicWaypoint(row) {
  return {
    name: row.waypoint_name, x: row.waypoint_x, y: row.waypoint_y, z: row.waypoint_z, color: row.waypoint_color,
    ...(row.kind === 'UNMARK' ? { findKind: row.waypoint_find_kind } : {})
  };
}

/** Markers the mod took out of Xaero ({kind, name, x, y, z} each), checked; bad ones are left out. */
function normalizeRemovedMarkers(raw) {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) throw httpError(400, 'removedMarkers must be a list.');
  if (raw.length > MAX_REMOVED_MARKERS) throw httpError(413, `At most ${MAX_REMOVED_MARKERS} removed markers per request.`);
  const markers = [];
  for (const item of raw) {
    const kind = String(item?.kind || '').toUpperCase();
    const x = normalizeInteger(item?.x, MAX_COORDINATE);
    const y = normalizeInteger(item?.y, MAX_Y);
    const z = normalizeInteger(item?.z, MAX_COORDINATE);
    if (!['BASE', 'ITEM', 'MARKER'].includes(kind) || x === null || y === null || z === null) continue;
    markers.push({ kind, name: normalizeText(item.name, 128), x, y, z });
  }
  return markers;
}

/** A mod's reports of what became of commands: {id, state, reason} each; bad ones are left out. */
function normalizeCommandUpdates(raw) {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) throw httpError(400, 'commandUpdates must be a list.');
  if (raw.length > MAX_COMMAND_UPDATES) throw httpError(413, `At most ${MAX_COMMAND_UPDATES} command updates per request.`);
  const latest = new Map();
  for (const update of raw) {
    const id = String(update?.id ?? '');
    const state = String(update?.state || '').toLowerCase();
    if (!/^\d{1,18}$/.test(id) || !COMMAND_MOD_STATES.includes(state)) continue;
    const reason = typeof update.reason === 'string' ? update.reason.replace(/[\u0000-\u001f\u007f]+/g, ' ').trim().slice(0, MAX_COMMAND_REASON) : '';
    latest.set(id, { id, state, reason: reason || null });
  }
  return [...latest.values()];
}

function publicToken(row) {
  return {
    id: String(row.id),
    name: row.name,
    hint: row.token_hint,
    createdBy: row.created_by,
    createdAt: row.created_at,
    lastUsedAt: row.last_used_at,
    revokedAt: row.revoked_at
  };
}

function generateToken() {
  return TOKEN_PREFIX + crypto.randomBytes(32).toString('base64url');
}

function bearerToken(req) {
  const match = String(req.headers.authorization || '').match(/^Bearer\s+(\S{10,200})$/i);
  return match ? match[1] : '';
}

function likePattern(text) {
  return `%${text.replace(/[\\%_]/g, char => `\\${char}`)}%`;
}

function httpError(statusCode, message) {
  return Object.assign(new Error(message), { statusCode });
}

function createAreaExplorerService({ pool, hashToken, readJsonBody, sendJson, sendError, enforceRateLimit, publish = () => {}, recordSystemLog = async () => {} }) {
  async function authenticate(req) {
    const token = bearerToken(req);
    if (!token) return null;
    const result = await pool.query(
      `UPDATE area_explorer_tokens SET last_used_at = NOW()
       WHERE token_hash = $1 AND revoked_at IS NULL
       RETURNING id, name`,
      [hashToken(token)]
    );
    return result.rows[0] || null;
  }

  /**
   * Stores a batch of finds for one server and dimension, skipping the ones in already, and the
   * mod's status. Bases are checked against each other under a lock on the scope, so two batches
   * can't both add the same base.
   */
  async function ingest(token, body, now = Date.now()) {
    const server = normalizeScopeName(body.server, 128);
    const dimension = normalizeScopeName(body.dimension, 64);
    if (!server || !dimension) throw httpError(400, 'server and dimension are required.');
    const rawFinds = Array.isArray(body.finds) ? body.finds : [];
    if (rawFinds.length > MAX_FINDS_PER_BATCH) throw httpError(413, `At most ${MAX_FINDS_PER_BATCH} finds per request.`);
    const finds = rawFinds.map(raw => normalizeFind(raw, now)).filter(Boolean);
    const status = normalizeStatus(body.status);
    const rawEvents = Array.isArray(body.events) ? body.events : [];
    if (rawEvents.length > MAX_EVENTS_PER_BATCH) throw httpError(413, `At most ${MAX_EVENTS_PER_BATCH} events per request.`);
    const events = rawEvents.map(raw => normalizeEvent(raw, now)).filter(Boolean);
    const commandUpdates = normalizeCommandUpdates(body.commandUpdates);
    // A mod that confirms its commands gets each again until it has; an older one gets each once
    const confirms = Number(body.commandProtocol) >= 2;
    const protocol = Number(body.commandProtocol) || 0;
    const removedMarkers = normalizeRemovedMarkers(body.removedMarkers);

    let added = 0;
    let liveStatus = null;
    let newEvents = [];
    let removedIds = [];
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      if (finds.some(find => find.kind === 'BASE' || isNamedPet(find))) {
        await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`area-explorer:${server}:${dimension}`]);
      }
      for (const find of finds.filter(f => f.kind === 'BASE')) {
        const near = await client.query(
          `SELECT 1 FROM area_explorer_finds
           WHERE server = $1 AND dimension = $2 AND kind = 'BASE'
             AND (x - $3::bigint) * (x - $3::bigint) + (z - $4::bigint) * (z - $4::bigint) <= $5::bigint
           LIMIT 1`,
          [server, dimension, find.x, find.z, SAME_BASE_DISTANCE * SAME_BASE_DISTANCE]
        );
        if (near.rows.length) continue;
        added += (await insertFinds(client, server, dimension, [find], token.id)).length;
      }
      // A named pet is checked against the ones in, one by one: the same pet a little off, or its name
      // sent a little differently, isn't another
      for (const find of finds.filter(isNamedPet)) {
        const same = await client.query(
          `SELECT 1 FROM area_explorer_finds
           WHERE server = $1 AND dimension = $2 AND kind = 'MARKER' AND name = $3 AND ${PET_LABEL_SQL} = $4
             AND (x - $5::bigint) * (x - $5::bigint) + (z - $6::bigint) * (z - $6::bigint) <= $7::bigint
           LIMIT 1`,
          [server, dimension, find.name, petLabelKey(find.label), find.x, find.z, SAME_PET_DISTANCE * SAME_PET_DISTANCE]
        );
        if (same.rows.length) continue;
        added += (await insertFinds(client, server, dimension, [find], token.id)).length;
      }
      const others = finds.filter(f => f.kind !== 'BASE' && !isNamedPet(f));
      if (others.length) added += (await insertFinds(client, server, dimension, others, token.id)).length;
      if (status) liveStatus = await upsertStatus(client, token.id, server, dimension, status);
      if (events.length) newEvents = await insertEvents(client, server, dimension, events, token.id);
      if (removedMarkers.length) removedIds = await removeInGame(client, token, server, dimension, removedMarkers);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally {
      client.release();
    }
    if (added > 0 || status || newEvents.length) {
      publish('area_explorer_updated', {
        server, dimension, added, status: Boolean(status),
        ...(liveStatus ? { liveStatus } : {}),
        ...(newEvents.length ? { events: newEvents.map(row => publicEvent(row, token.name)) } : {})
      });
    }
    if (newEvents.length) pruneEvents(now);
    if (removedIds.length) {
      publish('area_explorer_updated', { server, dimension, removed: removedIds });
      await recordSystemLog({
        category: 'area_explorer', actor: token.name,
        message: `${removedIds.length} ${removedIds.length === 1 ? 'find' : 'finds'} taken off the site: their markers were taken out in game (${server}, ${dimension}).`
      });
    }
    const commandAcks = commandUpdates.length ? await applyCommandUpdates(token, commandUpdates) : [];
    // A status upload is the mod checking in: it gets the commands waiting for it
    const commands = status ? await takeCommands(token, confirms, protocol) : [];
    return {
      received: rawFinds.length, accepted: finds.length, added, duplicates: finds.length - added,
      ...(body.removedMarkers !== undefined ? { removedFinds: removedIds.length } : {}),
      ...(rawEvents.length ? { events: newEvents.length } : {}),
      ...(commandUpdates.length ? { commandAcks } : {}),
      ...(commands.length ? { commands } : {})
    };
  }

  /** Command rows with their mod's token name, for the page. */
  async function commandRows(ids) {
    if (!ids.length) return [];
    return (await pool.query(
      `SELECT c.*, t.name AS token_name FROM area_explorer_commands c
       JOIN area_explorer_tokens t ON t.id = c.token_id
       WHERE c.id = ANY($1::bigint[]) ORDER BY c.id DESC`, [ids]
    )).rows;
  }

  async function publishCommands(ids) {
    const rows = await commandRows(ids);
    if (rows.length) publish('area_explorer_updated', { commands: rows.map(publicCommand) });
  }

  /**
   * What the mod reports of its commands: stored, and the ids it can stop sending (those of this mod
   * the site knows, changed or not). A command already completed or rejected stays so.
   */
  async function applyCommandUpdates(token, updates) {
    const known = (await pool.query(
      'SELECT id FROM area_explorer_commands WHERE token_id = $1 AND id = ANY($2::bigint[])',
      [token.id, updates.map(update => update.id)]
    )).rows.map(row => String(row.id));
    const changed = [];
    for (const update of updates.filter(item => known.includes(item.id))) {
      const row = (await pool.query(
        `UPDATE area_explorer_commands SET
           state = $3, state_reason = $4, state_at = NOW(),
           accepted_at = COALESCE(accepted_at, NOW()),
           started_at = CASE WHEN $3 = 'running' THEN COALESCE(started_at, NOW()) ELSE started_at END,
           finished_at = CASE WHEN $3 = ANY($5::text[]) THEN NOW() ELSE NULL END
         WHERE id = $1 AND token_id = $2 AND NOT (state = ANY($5::text[]))
           AND (state <> $3 OR state_reason IS DISTINCT FROM $4)
         RETURNING id`,
        [update.id, token.id, update.state, update.reason, COMMAND_FINAL_STATES]
      )).rows[0];
      if (row) changed.push(String(row.id));
    }
    if (changed.length) {
      await publishCommands(changed);
      const rows = await commandRows(changed);
      for (const row of rows.filter(item => item.state === 'rejected')) {
        await recordSystemLog({
          category: 'area_explorer', level: 'warn', actor: token.name,
          message: `"${token.name}" turned down the ${COMMAND_NOUNS[row.kind] || 'explore'} command #${row.id}: ${row.state_reason || 'no reason given'}.`
        });
      }
    }
    return known;
  }

  /**
   * The mod's commands waiting for it, marked as delivered. A mod that confirms them gets each again
   * (a few seconds on) until it has - the answer that carried it may never have arrived; one that
   * doesn't gets each once, as before. Ones never confirmed in time are given up on. A kind of command
   * only goes to a mod on the protocol it needs ({@link COMMAND_PROTOCOLS}); markers wait for it for
   * days: it confirms one only once the game is on the marker's server.
   */
  async function takeCommands(token, confirms, protocol = 0) {
    const expired = (await pool.query(
      `UPDATE area_explorer_commands SET state = 'expired', state_at = NOW(),
         state_reason = CASE WHEN state = 'queued' THEN 'The mod did not check in in time' ELSE 'The mod never confirmed it' END
       WHERE token_id = $1 AND (state = 'queued' OR (state = 'delivered' AND confirms))
         AND created_at <= NOW() - CASE WHEN kind = ANY($4::text[]) THEN make_interval(days => $3) ELSE make_interval(mins => $2) END
       RETURNING id`,
      [token.id, COMMAND_TTL_MINUTES, WAYPOINT_TTL_DAYS, MARKER_COMMANDS]
    )).rows.map(row => String(row.id));
    const rows = (await pool.query(
      confirms
        ? `UPDATE area_explorer_commands SET
             state = 'delivered', confirms = TRUE, delivered_at = NOW(), delivery_count = delivery_count + 1,
             state_at = CASE WHEN state = 'queued' THEN NOW() ELSE state_at END
           WHERE token_id = $1 AND (state = 'queued' OR (state = 'delivered' AND confirms))
             AND (kind <> ALL($4::text[]) OR (kind = 'WAYPOINT' AND $3::int >= $5::int) OR (kind = 'UNMARK' AND $3::int >= $6::int))
             AND (delivered_at IS NULL OR delivered_at <= NOW() - make_interval(secs => $2))
           RETURNING *`
        : `UPDATE area_explorer_commands SET state = 'delivered', delivered_at = NOW(), delivery_count = delivery_count + 1, state_at = NOW()
           WHERE token_id = $1 AND state = 'queued' AND kind <> ALL($2::text[])
           RETURNING *`,
      confirms
        ? [token.id, COMMAND_REDELIVER_SECONDS, protocol, MARKER_COMMANDS, COMMAND_PROTOCOLS.WAYPOINT, COMMAND_PROTOCOLS.UNMARK]
        : [token.id, MARKER_COMMANDS]
    )).rows;
    // The page hears of the first delivery and of the ones given up on, not of every resend
    const changed = [...expired, ...rows.filter(row => row.delivery_count === 1).map(row => String(row.id))];
    if (changed.length) await publishCommands(changed);
    return rows.sort((a, b) => Number(a.id) - Number(b.id)).map(row => ({
      id: String(row.id), kind: row.kind, server: row.server, dimension: row.dimension,
      minCX: row.min_cx, minCZ: row.min_cz, maxCX: row.max_cx, maxCZ: row.max_cz, by: row.created_by || '',
      ...(MARKER_COMMANDS.includes(row.kind) ? publicWaypoint(row) : {})
    }));
  }

  /** The latest commands sent from the map, newest first, with what became of them. */
  async function listCommands(url) {
    const limit = Math.min(COMMAND_LIST_LIMIT, Math.max(1, Number(url?.searchParams?.get('limit')) || 20));
    const rows = (await pool.query(
      `SELECT c.*, t.name AS token_name FROM area_explorer_commands c
       JOIN area_explorer_tokens t ON t.id = c.token_id
       ORDER BY c.id DESC LIMIT $1`, [limit]
    )).rows;
    return { commands: rows.map(publicCommand) };
  }

  /**
   * An administrator sends a mod to explore or rescan a rectangle picked on the map (block
   * coordinates, made chunks here). Replaces the mod's command still waiting, if any.
   */
  async function createCommand(currentUser, body) {
    const kind = String(body?.kind || '').toUpperCase();
    if (!COMMAND_KINDS.includes(kind)) throw httpError(400, 'Explore or rescan?');
    const tokenId = String(body?.tokenId || '');
    if (!/^\d{1,18}$/.test(tokenId)) throw httpError(400, 'Which mod?');
    const server = normalizeScopeName(body?.server, 128);
    const dimension = normalizeScopeName(body?.dimension, 64);
    if (!server || !dimension) throw httpError(400, 'server and dimension are required.');
    const coords = ['minX', 'minZ', 'maxX', 'maxZ'].map(key => normalizeInteger(body?.[key], MAX_COORDINATE));
    if (coords.some(value => value === null)) throw httpError(400, 'The area is outside the world.');
    const [x1, z1, x2, z2] = coords;
    const minCX = Math.floor(Math.min(x1, x2) / 16), maxCX = Math.floor(Math.max(x1, x2) / 16);
    const minCZ = Math.floor(Math.min(z1, z2) / 16), maxCZ = Math.floor(Math.max(z1, z2) / 16);
    if (maxCX - minCX + 1 > MAX_COMMAND_SIDE_CHUNKS || maxCZ - minCZ + 1 > MAX_COMMAND_SIDE_CHUNKS) {
      throw httpError(400, `At most ${MAX_COMMAND_SIDE_CHUNKS} chunks a side.`);
    }
    const token = (await pool.query('SELECT id, name FROM area_explorer_tokens WHERE id = $1 AND revoked_at IS NULL', [tokenId])).rows[0];
    if (!token) throw httpError(404, 'That mod token is gone.');
    const client = await pool.connect();
    let row;
    let cancelled = [];
    try {
      await client.query('BEGIN');
      cancelled = (await client.query(
        `UPDATE area_explorer_commands SET state = 'cancelled', cancelled_at = NOW(), state_at = NOW(), state_reason = 'Replaced by a newer command'
         WHERE token_id = $1 AND kind <> ALL($2::text[]) AND (state = 'queued' OR (state = 'delivered' AND confirms)) RETURNING id`, [tokenId, MARKER_COMMANDS])).rows.map(item => String(item.id));
      row = (await client.query(
        `INSERT INTO area_explorer_commands (token_id, kind, server, dimension, min_cx, min_cz, max_cx, max_cz, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
        [tokenId, kind, server, dimension, minCX, minCZ, maxCX, maxCZ, currentUser.username]
      )).rows[0];
      row.token_name = token.name;
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally {
      client.release();
    }
    const size = `${maxCX - minCX + 1}x${maxCZ - minCZ + 1} chunks`;
    await recordSystemLog({
      category: 'area_explorer', actor: currentUser.username,
      message: `Sent "${token.name}" to ${kind === 'RESCAN' ? 'rescan' : 'explore'} ${size} at X ${minCX * 16}..${maxCX * 16 + 15}, Z ${minCZ * 16}..${maxCZ * 16 + 15} (${server}, ${dimension}).`
    });
    await publishCommands([...cancelled, String(row.id)]);
    return { command: { ...publicCommand(row), minCX, minCZ, maxCX, maxCZ } };
  }

  /**
   * An administrator puts a marker on the map for a mod: it shows on the site's map as a marker find
   * at once, and a WAYPOINT command takes it to the mod's Xaero waypoints - the PC that takes that
   * mod's markers through sharing gets it from there. Doesn't replace the mod's other commands.
   */
  async function createWaypoint(currentUser, body) {
    const tokenId = String(body?.tokenId || '');
    if (!/^\d{1,18}$/.test(tokenId)) throw httpError(400, 'Which mod?');
    const server = normalizeScopeName(body?.server, 128);
    const dimension = normalizeScopeName(body?.dimension, 64);
    if (!server || !dimension) throw httpError(400, 'server and dimension are required.');
    const name = normalizeText(cleanFindName(body?.name), MAX_WAYPOINT_NAME);
    if (!name) throw httpError(400, 'Give the marker a name.');
    const x = normalizeInteger(body?.x, MAX_COORDINATE);
    const y = normalizeInteger(body?.y, MAX_Y);
    const z = normalizeInteger(body?.z, MAX_COORDINATE);
    if (x === null || y === null || z === null) throw httpError(400, 'The marker is outside the world.');
    const color = body?.color === undefined || body?.color === null ? 0xFFFFFF : Number(body.color);
    if (!WAYPOINT_COLORS.includes(color)) throw httpError(400, "Pick one of Xaero's 16 waypoint colours.");
    const token = (await pool.query('SELECT id, name FROM area_explorer_tokens WHERE id = $1 AND revoked_at IS NULL', [tokenId])).rows[0];
    if (!token) throw httpError(404, 'That mod token is gone.');
    const details = `Put on the map on the site by ${currentUser.username}`;
    const client = await pool.connect();
    let row;
    let findRow;
    try {
      await client.query('BEGIN');
      // The same marker made again (taken off the site before, say) is that one, back on
      findRow = (await client.query(
        `INSERT INTO area_explorer_finds (server, dimension, kind, x, y, z, found_at, name, item_count, label, details, dedupe_key, token_id)
         VALUES ($1, $2, 'MARKER', $3, $4, $5, NOW(), $6, 0, '', $7, $8, $9)
         ON CONFLICT (server, dimension, dedupe_key) DO UPDATE SET removed_at = NULL, removed_by = NULL
         RETURNING *`,
        [server, dimension, x, y, z, name, details, dedupeKey({ kind: 'MARKER', x, y, z, name, label: '' }), tokenId]
      )).rows[0];
      row = (await client.query(
        `INSERT INTO area_explorer_commands (token_id, kind, server, dimension, min_cx, min_cz, max_cx, max_cz, created_by,
           waypoint_name, waypoint_x, waypoint_y, waypoint_z, waypoint_color)
         VALUES ($1, 'WAYPOINT', $2, $3, $4, $5, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`,
        [tokenId, server, dimension, Math.floor(x / 16), Math.floor(z / 16), currentUser.username, name, x, y, z, color]
      )).rows[0];
      row.token_name = token.name;
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally {
      client.release();
    }
    await recordSystemLog({
      category: 'area_explorer', actor: currentUser.username,
      message: `Sent "${token.name}" the marker "${name}" at ${x} ${y} ${z} (${server}, ${dimension}).`
    });
    publish('area_explorer_updated', { server, dimension, added: 1 });
    await publishCommands([String(row.id)]);
    return { command: publicCommand(row), find: publicFind(findRow) };
  }

  /**
   * Markers taken out of Xaero in game - on the mod's PC, the PC taking its markers, or by the site's
   * own say - take their finds off the site: a base's and a marker's at its block, loot's lying near
   * enough to be its pile's. Structures that stay where they are stay on the site. The ids taken off.
   */
  async function removeInGame(client, token, server, dimension, markers) {
    const by = `${token.name} (in game)`;
    const ids = [];
    for (const marker of markers) {
      const rows = marker.kind === 'ITEM'
        ? await client.query(
          `UPDATE area_explorer_finds SET removed_at = NOW(), removed_by = $6
           WHERE server = $1 AND dimension = $2 AND kind = 'ITEM' AND removed_at IS NULL
             AND (x - $3::bigint) * (x - $3::bigint) + (z - $4::bigint) * (z - $4::bigint) <= $5::bigint
           RETURNING id`,
          [server, dimension, marker.x, marker.z, LOOT_MARKER_REACH * LOOT_MARKER_REACH, by])
        : await client.query(
          `UPDATE area_explorer_finds SET removed_at = NOW(), removed_by = $7
           WHERE server = $1 AND dimension = $2 AND kind = $3 AND removed_at IS NULL AND x = $4 AND z = $6
             AND ($3 = 'BASE' OR (y = $5 AND name <> ALL($8::text[])))
           RETURNING id`,
          [server, dimension, marker.kind, marker.x, marker.y, marker.z, by, PERMANENT_MARKERS]);
      ids.push(...rows.rows.map(row => String(row.id)));
    }
    return ids;
  }

  /** The run log's events, skipping ones sent before (same mod, same id); oldest first. */
  async function insertEvents(client, server, dimension, events, tokenId) {
    const result = await client.query(
      `INSERT INTO area_explorer_events (token_id, event_key, server, dimension, player, level, type, message, x, y, z, occurred_at)
       SELECT $1, e.event_key, $2, $3, e.player, e.level, e.type, e.message, e.x, e.y, e.z, e.occurred_at
       FROM unnest($4::text[], $5::text[], $6::text[], $7::text[], $8::text[], $9::int[], $10::int[], $11::int[], $12::timestamptz[])
         AS e(event_key, player, level, type, message, x, y, z, occurred_at)
       ON CONFLICT (token_id, event_key) DO NOTHING
       RETURNING *`,
      [tokenId, server, dimension, events.map(e => e.key), events.map(e => e.player), events.map(e => e.level),
        events.map(e => e.type), events.map(e => e.message), events.map(e => e.x), events.map(e => e.y), events.map(e => e.z),
        events.map(e => e.occurredAt.toISOString())]
    );
    return result.rows.sort((a, b) => new Date(a.occurred_at) - new Date(b.occurred_at) || Number(a.id) - Number(b.id));
  }

  let lastPrune = 0;
  /** The log keeps the last 90 days; checked at most once an hour, in the background. */
  function pruneEvents(now = Date.now()) {
    if (now - lastPrune < EVENT_PRUNE_INTERVAL_MS) return;
    lastPrune = now;
    pool.query('DELETE FROM area_explorer_events WHERE occurred_at < NOW() - make_interval(days => $1)', [EVENT_RETENTION_DAYS])
      .catch(error => console.error('[Area Explorer] Pruning the run log failed:', error.message));
  }

  /**
   * The run log, newest first: of one server or all, everything / problems (warnings and errors) /
   * connection (kicks, reconnects, totem pops). before=<time>|<id> pages back.
   */
  async function getEvents(url) {
    const params = [];
    const where = [];
    const server = normalizeScopeName(url.searchParams.get('server'), 128);
    if (server) { params.push(server); where.push(`e.server = $${params.length}`); }
    const filter = url.searchParams.get('filter');
    if (filter === 'problems') where.push(`e.level IN ('warn', 'error')`);
    else if (filter === 'connection') { params.push(CONNECTION_EVENT_TYPES); where.push(`e.type = ANY($${params.length}::text[])`); }
    const before = String(url.searchParams.get('before') || '').match(/^([^|]{10,40})\|(\d{1,18})$/);
    if (before && Number.isFinite(Date.parse(before[1]))) {
      params.push(new Date(before[1]).toISOString(), before[2]);
      where.push(`(e.occurred_at, e.id) < ($${params.length - 1}::timestamptz, $${params.length}::bigint)`);
    }
    const limit = Math.min(Math.max(Number.parseInt(url.searchParams.get('limit'), 10) || 50, 1), MAX_EVENT_PAGE);
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const rows = await pool.query(
      `SELECT e.*, t.name AS token_name FROM area_explorer_events e
       LEFT JOIN area_explorer_tokens t ON t.id = e.token_id
       ${whereSql} ORDER BY e.occurred_at DESC, e.id DESC LIMIT ${limit + 1}`,
      params
    );
    return { events: rows.rows.slice(0, limit).map(row => publicEvent(row)), hasMore: rows.rows.length > limit };
  }

  async function insertFinds(client, server, dimension, finds, tokenId) {
    const columns = { kind: [], x: [], y: [], z: [], foundAt: [], name: [], count: [], label: [], details: [], key: [] };
    for (const find of finds) {
      columns.kind.push(find.kind);
      columns.x.push(find.x);
      columns.y.push(find.y);
      columns.z.push(find.z);
      columns.foundAt.push(find.foundAt.toISOString());
      columns.name.push(find.name);
      columns.count.push(find.count);
      columns.label.push(find.label);
      columns.details.push(find.details);
      columns.key.push(dedupeKey(find));
    }
    const result = await client.query(
      `INSERT INTO area_explorer_finds (server, dimension, kind, x, y, z, found_at, name, item_count, label, details, dedupe_key, token_id)
       SELECT $1, $2, f.kind, f.x, f.y, f.z, f.found_at, f.name, f.item_count, f.label, f.details, f.dedupe_key, $13
       FROM unnest($3::text[], $4::int[], $5::int[], $6::int[], $7::timestamptz[], $8::text[], $9::int[], $10::text[], $11::text[], $12::text[])
         AS f(kind, x, y, z, found_at, name, item_count, label, details, dedupe_key)
       ON CONFLICT (server, dimension, dedupe_key) DO NOTHING
       RETURNING id`,
      [server, dimension, columns.kind, columns.x, columns.y, columns.z, columns.foundAt, columns.name,
        columns.count, columns.label, columns.details, columns.key, tokenId]
    );
    return result.rows;
  }

  async function upsertStatus(client, tokenId, server, dimension, status) {
    // The flown-over grid: a new one replaces it; none sent keeps the last while the run goes on,
    // and a run that's ended (or has no area) has none
    const runEnded = status.phase === 'IDLE' || status.phase === 'MENU' || !status.area;
    const replaceCoverage = runEnded || status.coverage !== undefined;
    const coverage = runEnded || !status.coverage ? null : JSON.stringify(status.coverage);
    const result = await client.query(
      `INSERT INTO area_explorer_status (token_id, server, dimension, player, phase, mode, paused, percent, eta_seconds, x, y, z, area, run_finds, yaw, coverage, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, NOW())
       ON CONFLICT (token_id) DO UPDATE SET
         server = EXCLUDED.server, dimension = EXCLUDED.dimension, player = EXCLUDED.player, phase = EXCLUDED.phase,
         mode = EXCLUDED.mode, paused = EXCLUDED.paused, percent = EXCLUDED.percent, eta_seconds = EXCLUDED.eta_seconds,
         x = EXCLUDED.x, y = EXCLUDED.y, z = EXCLUDED.z, area = EXCLUDED.area, run_finds = EXCLUDED.run_finds, yaw = EXCLUDED.yaw,
         coverage = CASE WHEN $17::boolean THEN EXCLUDED.coverage ELSE area_explorer_status.coverage END, updated_at = NOW()
       RETURNING *`,
      [tokenId, server, dimension, status.player, status.phase, status.mode, status.paused, status.percent, status.etaSeconds,
        status.x, status.y, status.z, status.area ? JSON.stringify(status.area) : null, status.runFinds ? JSON.stringify(status.runFinds) : null, status.yaw,
        coverage, replaceCoverage]
    );
    return publicStatus(result.rows[0]);
  }

  /**
   * The runs, and the newest find and run log event (their ids): a page that isn't getting the live
   * stream (phones drop it) polls this and reloads the finds or the log once either moves on.
   */
  async function getLive() {
    const [result, versions] = await Promise.all([
      pool.query(`SELECT s.*, t.name AS token_name FROM area_explorer_status s
        JOIN area_explorer_tokens t ON t.id = s.token_id WHERE t.revoked_at IS NULL ORDER BY s.updated_at DESC`),
      pool.query(`SELECT (SELECT COALESCE(MAX(id), 0) FROM area_explorer_finds)::text AS finds,
        (SELECT COALESCE(MAX(id), 0) FROM area_explorer_events)::text AS events`)
    ]);
    return { statuses: result.rows.map(row => publicStatus(row)), versions: versions.rows[0] };
  }

  /** The ground a run has flown over: the grid the mod last sent, for the map. */
  async function getCoverage(url) {
    const tokenId = String(url.searchParams.get('token') || '');
    if (!/^\d{1,18}$/.test(tokenId)) throw httpError(400, 'Invalid token id.');
    const row = (await pool.query(
      `SELECT s.coverage, s.server, s.dimension FROM area_explorer_status s
       JOIN area_explorer_tokens t ON t.id = s.token_id WHERE s.token_id = $1 AND t.revoked_at IS NULL`, [tokenId]
    )).rows[0];
    return { coverage: row?.coverage || null, server: row?.server || null, dimension: row?.dimension || null };
  }

  /** POST /api/area-explorer/ingest - from the mod, with its token instead of a session. */
  async function handleIngest(req, res) {
    if (req.method !== 'POST') {
      sendError(res, 405, 'Use POST.');
      return;
    }
    const token = await authenticate(req);
    if (!token) {
      sendError(res, 401, 'A valid Area Explorer token is required.');
      return;
    }
    if (!enforceRateLimit(req, res, 'area_explorer_ingest', `token:${token.id}`, { limit: 120, windowMs: 60_000 })) return;
    const body = await readJsonBody(req, MAX_INGEST_BYTES);
    sendJson(res, 200, await ingest(token, body));
  }

  async function getSummary(currentUser = null) {
    // Loot picked up in game is left out of everything
    const [counts, statuses, markerNames, itemNames, latest, favorites] = await Promise.all([
      pool.query(`SELECT server, dimension, kind, COUNT(*)::int AS count, MAX(found_at) AS last_found_at
                  FROM area_explorer_finds WHERE removed_at IS NULL GROUP BY server, dimension, kind ORDER BY server, dimension, kind`),
      pool.query(`SELECT s.*, t.name AS token_name FROM area_explorer_status s
                  JOIN area_explorer_tokens t ON t.id = s.token_id
                  WHERE t.revoked_at IS NULL ORDER BY s.updated_at DESC`),
      pool.query(`SELECT server, dimension, name, COUNT(*)::int AS count FROM area_explorer_finds
                  WHERE kind = 'MARKER' AND removed_at IS NULL GROUP BY server, dimension, name ORDER BY count DESC, name`),
      // Every kind of loot with how much of it: the most valuable are picked from these below. Shulker
      // boxes of every colour are one kind, as a click on it lists them all (the name is searched for)
      pool.query(`SELECT server, dimension, CASE WHEN name LIKE '%Shulker Box' THEN 'Shulker Box' ELSE name END AS name,
                    COUNT(*)::int AS count, SUM(item_count)::int AS items
                  FROM area_explorer_finds WHERE kind = 'ITEM' AND removed_at IS NULL GROUP BY 1, 2, 3`),
      pool.query(`SELECT DISTINCT ON (server, dimension) * FROM area_explorer_finds WHERE removed_at IS NULL
                  ORDER BY server, dimension, found_at DESC, id DESC`),
      // The user's own stars, for the Favorites tab
      currentUser?.id ? pool.query(`SELECT f.server, f.dimension, COUNT(*)::int AS count FROM area_explorer_favorites fav
                  JOIN area_explorer_finds f ON f.id = fav.find_id
                  WHERE fav.user_id = $1 AND f.removed_at IS NULL GROUP BY f.server, f.dimension`, [currentUser.id]) : { rows: [] }
    ]);
    const scopes = new Map();
    for (const row of counts.rows) {
      const key = `${row.server}\u0000${row.dimension}`;
      if (!scopes.has(key)) scopes.set(key, { server: row.server, dimension: row.dimension, bases: 0, signs: 0, items: 0, markers: 0, favorites: 0, markerNames: [], valuableItems: [], latest: null, lastFoundAt: null });
      const scope = scopes.get(key);
      scope[{ BASE: 'bases', SIGN: 'signs', ITEM: 'items', MARKER: 'markers' }[row.kind]] = row.count;
      if (!scope.lastFoundAt || new Date(row.last_found_at) > new Date(scope.lastFoundAt)) scope.lastFoundAt = row.last_found_at;
    }
    for (const row of favorites.rows) {
      const scope = scopes.get(`${row.server}\u0000${row.dimension}`);
      if (scope) scope.favorites = row.count;
    }
    // What the markers mark, most first: End Portal 12, Shulker Box 5...
    for (const row of markerNames.rows) {
      scopes.get(`${row.server}\u0000${row.dimension}`)?.markerNames.push({ name: row.name, count: row.count });
    }
    // The most valuable loot: Elytra, netherite gear, shulker boxes, maps, written books... the
    // dearest first, then the one found most; anything not on the list doesn't make it
    for (const row of itemNames.rows) {
      const value = lootValue(row.name);
      if (value > 0) scopes.get(`${row.server}\u0000${row.dimension}`)?.valuableItems.push({ name: row.name, count: row.count, items: row.items, value });
    }
    for (const scope of scopes.values()) {
      scope.valuableItems = scope.valuableItems
        .sort((a, b) => b.value - a.value || b.count - a.count || a.name.localeCompare(b.name))
        .slice(0, TOP_LOOT_NAMES);
    }
    for (const row of latest.rows) {
      const scope = scopes.get(`${row.server}\u0000${row.dimension}`);
      if (scope) scope.latest = publicFind(row);
    }
    return { scopes: [...scopes.values()], statuses: statuses.rows.map(row => publicStatus(row)) };
  }

  function scopeFilter(url, params, where, currentUser = null) {
    const server = normalizeScopeName(url.searchParams.get('server'), 128);
    const dimension = normalizeScopeName(url.searchParams.get('dimension'), 64);
    if (server) { params.push(server); where.push(`server = $${params.length}`); }
    if (dimension) { params.push(dimension); where.push(`dimension = $${params.length}`); }
    where.push('removed_at IS NULL');
    const kind = String(url.searchParams.get('kind') || '').toUpperCase();
    const name = normalizeText(url.searchParams.get('name'), 128);
    // The user's starred finds, of every kind
    if (kind === 'FAVORITE') {
      params.push(currentUser?.id ?? null);
      where.push(`id IN (SELECT find_id FROM area_explorer_favorites WHERE user_id = $${params.length})`);
      return;
    }
    // End Portals have a tab of their own: the markers' is the rest, unless one kind of them is asked for
    if (kind === 'END_PORTAL') {
      params.push(END_PORTAL);
      where.push(`kind = 'MARKER' AND name = $${params.length}`);
      return;
    }
    if (KINDS.includes(kind)) { params.push(kind); where.push(`kind = $${params.length}`); }
    // One kind of marker: "Shulker Box"
    if (kind === 'MARKER' && name) { params.push(name); where.push(`name = $${params.length}`); }
    else if (kind === 'MARKER') { params.push(END_PORTAL); where.push(`name <> $${params.length}`); }
  }

  /** Whether the user starred each find, as a column: favorite. */
  function favoriteColumn(params, currentUser) {
    params.push(currentUser?.id ?? null);
    return `EXISTS (SELECT 1 FROM area_explorer_favorites fav WHERE fav.find_id = area_explorer_finds.id AND fav.user_id = $${params.length}) AS favorite`;
  }

  async function getFinds(url, currentUser = null) {
    const params = [];
    const where = [];
    scopeFilter(url, params, where, currentUser);
    const q = normalizeText(url.searchParams.get('q'), 100);
    if (q) {
      params.push(likePattern(q));
      where.push(`(name ILIKE $${params.length} OR label ILIKE $${params.length} OR details ILIKE $${params.length})`);
    }
    const limit = Math.min(Math.max(Number.parseInt(url.searchParams.get('limit'), 10) || 50, 1), MAX_PAGE_SIZE);
    const offset = Math.min(Math.max(Number.parseInt(url.searchParams.get('offset'), 10) || 0, 0), 1_000_000);
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    // Newest first, by name, highest base score, or nearest a spot (the middle of the map in view)
    const sort = url.searchParams.get('sort');
    const nearX = normalizeInteger(url.searchParams.get('nearX'), MAX_COORDINATE);
    const nearZ = normalizeInteger(url.searchParams.get('nearZ'), MAX_COORDINATE);
    let orderSql = 'ORDER BY found_at DESC, id DESC';
    const orderParams = [...params];
    if (sort === 'name') orderSql = 'ORDER BY name, found_at DESC, id DESC';
    // A base's details start "score 30: ...": the rest have none and come after the bases
    else if (sort === 'score') orderSql = `ORDER BY CASE WHEN kind = 'BASE' THEN substring(details from '^score ([0-9]{1,9})')::int END DESC NULLS LAST, found_at DESC, id DESC`;
    else if (sort === 'nearest' && nearX !== null && nearZ !== null) {
      orderParams.push(nearX, nearZ);
      const ax = `$${orderParams.length - 1}`, az = `$${orderParams.length}`;
      orderSql = `ORDER BY (x - ${ax}::bigint) * (x - ${ax}::bigint) + (z - ${az}::bigint) * (z - ${az}::bigint), id DESC`;
    }
    const favorite = favoriteColumn(orderParams, currentUser);
    const [rows, total] = await Promise.all([
      pool.query(`SELECT *, ${favorite} FROM area_explorer_finds ${whereSql} ${orderSql} LIMIT ${limit} OFFSET ${offset}`, orderParams),
      pool.query(`SELECT COUNT(*)::int AS total FROM area_explorer_finds ${whereSql}`, params)
    ]);
    return { finds: rows.rows.map(publicFind), total: total.rows[0]?.total || 0, limit, offset };
  }

  /**
   * Every find of the scope as a point for the map, [id, kind, x, z], with a marker's name after
   * them, [id, kind, x, z, name], so End Portals get a checkbox of their own - all of them,
   * however many (answers this big go gzipped). minX, minZ, maxX, maxZ narrow it to an area if given.
   */
  async function getMapPoints(url) {
    const params = [];
    const where = [];
    scopeFilter(url, params, where);
    // A missing one is no bound at all, not 0
    const bounds = ['minX', 'minZ', 'maxX', 'maxZ'].map(key => (url.searchParams.has(key) ? normalizeInteger(url.searchParams.get(key), MAX_COORDINATE) : null));
    const [minX, minZ, maxX, maxZ] = bounds;
    if (bounds.every(value => value !== null)) {
      params.push(Math.min(minX, maxX), Math.max(minX, maxX), Math.min(minZ, maxZ), Math.max(minZ, maxZ));
      where.push(`x BETWEEN $${params.length - 3} AND $${params.length - 2} AND z BETWEEN $${params.length - 1} AND $${params.length}`);
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const rows = await pool.query(`SELECT id, kind, x, z, CASE WHEN kind = 'MARKER' THEN name END AS name FROM area_explorer_finds ${whereSql}`, params);
    return { points: rows.rows.map(row => (row.kind === 'MARKER' ? [String(row.id), row.kind, row.x, row.z, row.name] : [String(row.id), row.kind, row.x, row.z])) };
  }

  /**
   * The signs a player's name is written on, newest first: the name as a word of its own, any case,
   * so "Steve" finds "steve's base" but not "Steven". Both sides of the sign are read.
   */
  async function getPlayerSigns(url) {
    const player = String(url.searchParams.get('player') || '').trim();
    if (!PLAYER_NAME_PATTERN.test(player)) throw httpError(400, 'Invalid player name.');
    const pattern = `(^|[^A-Za-z0-9_])${player.replace(/[.*]/g, '\\$&')}($|[^A-Za-z0-9_])`;
    // Just how many, for the profile's Signs button
    if (url.searchParams.get('count') === '1') {
      const { total } = (await pool.query(
        `SELECT COUNT(*)::int AS total FROM area_explorer_finds
         WHERE kind = 'SIGN' AND removed_at IS NULL AND (details ~* $1 OR label ~* $1)`,
        [pattern]
      )).rows[0];
      return { total };
    }
    const rows = (await pool.query(
      `SELECT *, COUNT(*) OVER()::int AS total FROM area_explorer_finds
       WHERE kind = 'SIGN' AND removed_at IS NULL AND (details ~* $1 OR label ~* $1)
       ORDER BY found_at DESC, id DESC LIMIT $2`,
      [pattern, MAX_PAGE_SIZE]
    )).rows;
    return { signs: rows.map(row => publicFind(row)), total: rows[0]?.total || 0 };
  }

  async function getFind(id, currentUser = null) {
    if (!/^\d{1,18}$/.test(id)) throw httpError(400, 'Invalid find id.');
    const params = [id];
    const favorite = favoriteColumn(params, currentUser);
    const row = (await pool.query(`SELECT *, ${favorite} FROM area_explorer_finds WHERE id = $1 AND removed_at IS NULL`, params)).rows[0];
    if (!row) throw httpError(404, 'Find not found.');
    return { find: publicFind(row) };
  }

  /** Stars a find for the user (their Favorites tab), or takes the star off. */
  async function setFavorite(currentUser, id, favorite) {
    if (!/^\d{1,18}$/.test(id)) throw httpError(400, 'Invalid find id.');
    if (!currentUser?.id) throw httpError(401, 'Sign in to keep favorites.');
    const row = (await pool.query('SELECT id FROM area_explorer_finds WHERE id = $1 AND removed_at IS NULL', [id])).rows[0];
    if (!row) throw httpError(404, 'Find not found.');
    if (favorite) {
      await pool.query('INSERT INTO area_explorer_favorites (user_id, find_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [currentUser.id, id]);
    } else {
      await pool.query('DELETE FROM area_explorer_favorites WHERE user_id = $1 AND find_id = $2', [currentUser.id, id]);
    }
    return { id: String(id), favorite: !!favorite };
  }

  /**
   * Takes loot off the site once it's been picked up in game, a base, or a marker that's wrong or no
   * longer there (a shulker box taken, a portal broken). It stays in the table, marked, so the mod
   * sending it again (it's in its all-finds file for good) doesn't bring it back. Its waypoint goes
   * out of the game of the mod that found it ({@link #unmark}).
   */
  async function removeFind(currentUser, id) {
    if (!/^\d{1,18}$/.test(id)) throw httpError(400, 'Invalid find id.');
    const row = (await pool.query(
      `UPDATE area_explorer_finds SET removed_at = NOW(), removed_by = $2
       WHERE id = $1 AND removed_at IS NULL
         AND (kind IN ('ITEM', 'BASE') OR (kind = 'MARKER' AND name <> ALL($3::text[])))
       RETURNING *`,
      [id, currentUser.username, PERMANENT_MARKERS]
    )).rows[0];
    if (!row) throw httpError(404, 'No loot, base or removable marker like that on the site (removed already?).');
    await unmark(currentUser, row);
    const what = row.kind === 'ITEM' ? `Loot picked up: ${row.name} ×${row.item_count}` : row.kind === 'BASE' ? `Base removed: ${row.name}` : `Marker removed: ${row.name}`;
    await recordSystemLog({
      category: 'area_explorer', actor: currentUser.username,
      message: `${what} at ${row.x} ${row.y} ${row.z} (${row.server}, ${row.dimension}).`
    });
    publish('area_explorer_updated', { server: row.server, dimension: row.dimension, removed: String(row.id) });
    return { removed: publicFind(row) };
  }

  /**
   * A find taken off the site: an UNMARK command takes its waypoint out of the game of the mod that
   * found it - and that mod's sharing takes it out of the other PC. Loot only once no other loot is left
   * near it: the mod has one marker for the pile. A site marker the mod hasn't taken yet just isn't sent.
   */
  async function unmark(currentUser, row) {
    if (!row.token_id) return;
    if (row.kind === 'MARKER') {
      await pool.query(
        `UPDATE area_explorer_commands SET state = 'cancelled', cancelled_at = NOW(), state_at = NOW(), state_reason = 'Taken off the site'
         WHERE token_id = $1 AND kind = 'WAYPOINT' AND state IN ('queued', 'delivered')
           AND server = $2 AND dimension = $3 AND waypoint_x = $4 AND waypoint_y = $5 AND waypoint_z = $6`,
        [row.token_id, row.server, row.dimension, row.x, row.y, row.z]);
    }
    if (row.kind === 'ITEM') {
      const left = (await pool.query(
        `SELECT 1 FROM area_explorer_finds
         WHERE server = $1 AND dimension = $2 AND kind = 'ITEM' AND removed_at IS NULL
           AND (x - $3::bigint) * (x - $3::bigint) + (z - $4::bigint) * (z - $4::bigint) <= $5::bigint
         LIMIT 1`,
        [row.server, row.dimension, row.x, row.z, LOOT_MARKER_REACH * LOOT_MARKER_REACH])).rows.length;
      if (left) return;
    }
    const token = (await pool.query('SELECT id FROM area_explorer_tokens WHERE id = $1 AND revoked_at IS NULL', [row.token_id])).rows[0];
    if (!token) return;
    const command = (await pool.query(
      `INSERT INTO area_explorer_commands (token_id, kind, server, dimension, min_cx, min_cz, max_cx, max_cz, created_by,
         waypoint_name, waypoint_x, waypoint_y, waypoint_z, waypoint_find_kind)
       VALUES ($1, 'UNMARK', $2, $3, $4, $5, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id`,
      [row.token_id, row.server, row.dimension, Math.floor(row.x / 16), Math.floor(row.z / 16), currentUser.username,
        cleanFindName(row.name), row.x, row.y, row.z, row.kind]
    )).rows[0];
    await publishCommands([String(command.id)]);
  }

  async function listTokens() {
    const rows = await pool.query('SELECT * FROM area_explorer_tokens ORDER BY revoked_at IS NOT NULL, created_at DESC');
    return { tokens: rows.rows.map(publicToken) };
  }

  async function createToken(currentUser, body) {
    const name = normalizeText(body?.name, 64);
    if (!name) throw httpError(400, 'Give the token a name, such as the PC it is for.');
    const token = generateToken();
    const row = (await pool.query(
      `INSERT INTO area_explorer_tokens (name, token_hash, token_hint, created_by) VALUES ($1, $2, $3, $4) RETURNING *`,
      [name, hashToken(token), token.slice(-4), currentUser.username]
    )).rows[0];
    await recordSystemLog({ category: 'area_explorer', actor: currentUser.username, message: `Area Explorer token "${name}" created.` });
    // The only time the token itself is shown
    return { token, record: publicToken(row) };
  }

  async function revokeToken(currentUser, id) {
    if (!/^\d{1,18}$/.test(id)) throw httpError(400, 'Invalid token id.');
    const row = (await pool.query(
      'UPDATE area_explorer_tokens SET revoked_at = NOW() WHERE id = $1 AND revoked_at IS NULL RETURNING *', [id]
    )).rows[0];
    if (!row) throw httpError(404, 'Token not found or already revoked.');
    await recordSystemLog({ category: 'area_explorer', actor: currentUser.username, message: `Area Explorer token "${row.name}" revoked.` });
    publish('area_explorer_updated', { tokenRevoked: true });
    return { record: publicToken(row) };
  }

  /**
   * The dashboard's routes, for a signed-in user: {statusCode, payload}, or null for a path that
   * isn't one of them. Token routes are for administrators only.
   */
  async function handleApi(req, currentUser, url, { assertAdmin, readBody }) {
    const path = url.pathname;
    if (path === '/api/area-explorer/summary' && req.method === 'GET') return { statusCode: 200, payload: await getSummary(currentUser) };
    if (path === '/api/area-explorer/live' && req.method === 'GET') return { statusCode: 200, payload: await getLive() };
    if (path === '/api/area-explorer/finds' && req.method === 'GET') return { statusCode: 200, payload: await getFinds(url, currentUser) };
    if (path === '/api/area-explorer/map' && req.method === 'GET') return { statusCode: 200, payload: await getMapPoints(url) };
    if (path === '/api/area-explorer/events' && req.method === 'GET') return { statusCode: 200, payload: await getEvents(url) };
    if (path === '/api/area-explorer/coverage' && req.method === 'GET') return { statusCode: 200, payload: await getCoverage(url) };
    if (path === '/api/area-explorer/signs' && req.method === 'GET') return { statusCode: 200, payload: await getPlayerSigns(url) };
    // Sending a mod off to explore: administrators only - it flies someone's game
    if (path === '/api/area-explorer/commands' && req.method === 'GET') {
      assertAdmin(currentUser);
      return { statusCode: 200, payload: await listCommands(url) };
    }
    if (path === '/api/area-explorer/commands' && req.method === 'POST') {
      assertAdmin(currentUser);
      return { statusCode: 201, payload: await createCommand(currentUser, await readBody(req)) };
    }
    // A marker for a mod's Xaero waypoints: administrators only, as it changes someone's game
    if (path === '/api/area-explorer/waypoints' && req.method === 'POST') {
      assertAdmin(currentUser);
      return { statusCode: 201, payload: await createWaypoint(currentUser, await readBody(req)) };
    }
    const findMatch = path.match(/^\/api\/area-explorer\/finds\/([^/]+)$/);
    if (findMatch && req.method === 'GET') return { statusCode: 200, payload: await getFind(findMatch[1], currentUser) };
    // A user's own stars: anyone signed in
    const favoriteMatch = path.match(/^\/api\/area-explorer\/finds\/([^/]+)\/favorite$/);
    if (favoriteMatch && (req.method === 'PUT' || req.method === 'DELETE')) {
      return { statusCode: 200, payload: await setFavorite(currentUser, favoriteMatch[1], req.method === 'PUT') };
    }
    // Loot picked up in game: administrators take it off the site
    if (findMatch && req.method === 'DELETE') {
      assertAdmin(currentUser);
      return { statusCode: 200, payload: await removeFind(currentUser, findMatch[1]) };
    }
    if (path === '/api/admin/area-explorer/tokens') {
      assertAdmin(currentUser);
      if (req.method === 'GET') return { statusCode: 200, payload: await listTokens() };
      if (req.method === 'POST') return { statusCode: 201, payload: await createToken(currentUser, await readBody(req)) };
    }
    const tokenMatch = path.match(/^\/api\/admin\/area-explorer\/tokens\/([^/]+)$/);
    if (tokenMatch && req.method === 'DELETE') {
      assertAdmin(currentUser);
      return { statusCode: 200, payload: await revokeToken(currentUser, tokenMatch[1]) };
    }
    return null;
  }

  return { authenticate, ingest, handleIngest, handleApi, getSummary, getEvents, getCoverage, createCommand, createWaypoint, listCommands, getFinds, getMapPoints, getFind, setFavorite, getPlayerSigns, removeFind, listTokens, createToken, revokeToken };
}

module.exports = {
  COMMAND_STATES,
  CONNECTION_EVENT_TYPES,
  KINDS,
  PERMANENT_MARKERS,
  SAME_BASE_DISTANCE,
  MAX_FINDS_PER_BATCH,
  TOKEN_PREFIX,
  WAYPOINT_COLORS,
  bearerToken,
  normalizeRemovedMarkers,
  cleanFindName,
  createAreaExplorerService,
  dedupeKey,
  generateToken,
  lootValue,
  normalizeCommandUpdates,
  normalizeCoverage,
  normalizeEvent,
  normalizeFind,
  normalizeSectors,
  normalizeStatus,
  publicCommand,
  publicEvent,
  publicFind,
  publicStatus
};
