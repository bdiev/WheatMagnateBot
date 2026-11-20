'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { Pool } = require('pg');
const { compressStoredTile } = require('./map-tile-compression');

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const LOCK = 'wheatmagnate:optimize-map-tiles';

// Compare the bytes we actually read. A concurrent upload must never be overwritten.
async function replaceTile(client, row, candidate) {
  if (candidate.length >= row.data.length) return false;
  const result = await client.query(
    `UPDATE area_explorer_region_tiles SET data = $5
     WHERE server = $1 AND dimension = $2 AND level = 0 AND x = $3 AND z = $4 AND data = $6`,
    [row.server, row.dimension, row.x, row.z, candidate, row.data]
  );
  // Keep drawing timestamps and masks unchanged: the pixels did not change.
  return result.rowCount === 1;
}

function saveProgress(filename, progress) {
  fs.mkdirSync(path.dirname(filename), { recursive: true });
  const temporary = `${filename}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(progress, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(temporary, filename);
}

async function optimizeMapTiles(client, { apply = false, limit = 500, delayMs = 500, stateFile, log = console.log, shouldStop = () => false } = {}) {
  const locked = (await client.query('SELECT pg_try_advisory_lock(hashtext($1)) AS locked', [LOCK])).rows[0].locked;
  if (!locked) throw new Error('Another map optimization is already running');
  let progress;
  try {
    progress = apply && stateFile && fs.existsSync(stateFile)
      ? JSON.parse(fs.readFileSync(stateFile, 'utf8'))
      : { cursor: null, scanned: 0, replaced: 0, savedBytes: 0, startedAt: new Date().toISOString() };
    if (progress.complete) { log(JSON.stringify(progress)); return progress; }
    let processed = 0;
    while (processed < limit && !shouldStop()) {
      const cursor = progress.cursor;
      // Match the primary key's collation so each batch can seek into the index.
      const batch = (await client.query(
        `SELECT server, dimension, x, z, data FROM area_explorer_region_tiles
         WHERE level = 0 ${cursor ? 'AND (server, dimension, x, z) > ($1, $2, $3, $4)' : ''}
         ORDER BY server, dimension, x, z LIMIT ${Math.min(8, limit - processed)}`,
        cursor ?? []
      )).rows;
      if (!batch.length) { progress.complete = true; break; }
      for (const row of batch) {
        if (shouldStop()) break;
        row.data = Buffer.from(row.data);
        const candidate = await compressStoredTile(row.data);
        if (candidate.length < row.data.length) {
          const replaced = !apply || await replaceTile(client, row, candidate);
          if (replaced) { progress.replaced++; progress.savedBytes += row.data.length - candidate.length; }
        }
        progress.cursor = [row.server, row.dimension, row.x, row.z];
        progress.scanned++;
        processed++;
        progress.updatedAt = new Date().toISOString();
        if (apply && stateFile) saveProgress(stateFile, progress);
        if (progress.scanned % 50 === 0) log(JSON.stringify(progress));
        if (delayMs) await sleep(delayMs);
      }
    }
    if (apply && stateFile) saveProgress(stateFile, progress);
    log(JSON.stringify({ ...progress, apply }));
    return progress;
  } finally {
    await client.query('SELECT pg_advisory_unlock(hashtext($1))', [LOCK]);
  }
}

async function main() {
  require('dotenv').config({ quiet: true });
  const args = process.argv.slice(2);
  const value = (name, fallback) => {
    const index = args.indexOf(name);
    return index < 0 ? fallback : args[index + 1];
  };
  const apply = args.includes('--apply');
  const limit = args.includes('--all') ? Infinity : Number(value('--limit', 500));
  const delayMs = Number(value('--delay-ms', 500));
  const stateFile = value('--state', null);
  const allowed = new Set(['--apply', '--all', '--limit', '--delay-ms', '--state']);
  for (let i = 0; i < args.length; i++) {
    if (!allowed.has(args[i])) throw new Error(`Unknown argument: ${args[i]}`);
    if (['--limit', '--delay-ms', '--state'].includes(args[i])) i++;
  }
  if (!(limit === Infinity || Number.isSafeInteger(limit) && limit > 0) || !Number.isSafeInteger(delayMs) || delayMs < 0) throw new Error('Invalid limit or delay');
  if (apply && !stateFile) throw new Error('--apply requires --state for resumable progress');
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
  // One tile at a time under a CPU quota: extra libvips threads only add contention
  // and the cache only holds pixels that are never reused.
  const sharp = require('sharp');
  sharp.concurrency(1);
  sharp.cache(false);
  let stopped = false;
  process.on('SIGTERM', () => { stopped = true; });
  process.on('SIGINT', () => { stopped = true; });
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1, application_name: 'map-tile-optimizer' });
  const client = await pool.connect();
  try {
    await client.query("SET statement_timeout = '30s'");
    await client.query("SET lock_timeout = '2s'");
    await optimizeMapTiles(client, { apply, limit, delayMs, stateFile, shouldStop: () => stopped });
  } finally { client.release(); await pool.end(); }
}

if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { optimizeMapTiles, replaceTile };
