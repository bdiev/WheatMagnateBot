'use strict';

const { resolveOfficialMinecraftSkin } = require('./minecraft-avatar');
const { resolveNameMcCapes } = require('./namemc-capes');

function normalizePlayerIdentity(identity = {}) {
  const username = String(identity.username || '').trim();
  const compactUuid = String(identity.player_uuid || identity.uuid || '').replace(/-/g,'').toLowerCase();
  if (!/^[A-Za-z0-9_]{1,16}$/.test(username) || !/^[0-9a-f]{32}$/.test(compactUuid)) return null;
  return {
    username,
    player_uuid:`${compactUuid.slice(0,8)}-${compactUuid.slice(8,12)}-${compactUuid.slice(12,16)}-${compactUuid.slice(16,20)}-${compactUuid.slice(20)}`
  };
}

function createPlayerSkinHistoryService({
  pool,
  resolveSkin = resolveOfficialMinecraftSkin,
  resolveCapes = resolveNameMcCapes,
  forceCapeRefresh = false,
  warn = message => console.warn(message)
} = {}) {
  const activeRefreshes = new Map();

  async function refresh(identity) {
    const player = normalizePlayerIdentity(identity);
    if (!pool || !player) return null;

    const current = await resolveSkin({
      username:player.username,
      uuid:player.player_uuid,
      signal:AbortSignal.timeout(8_000)
    });
    await pool.query(`
      INSERT INTO player_skin_history(player_uuid,texture_hash,texture_url,model,cape_hash,cape_url)
      VALUES($1::uuid,$2,$3,$4,$5,$6)
      ON CONFLICT(player_uuid,texture_hash) DO UPDATE SET
        texture_url=EXCLUDED.texture_url,model=EXCLUDED.model,
        cape_hash=EXCLUDED.cape_hash,cape_url=EXCLUDED.cape_url,last_seen=NOW()
    `, [player.player_uuid,current.textureHash,current.textureUrl,current.model,current.capeHash,current.capeUrl]);

    let currentCapeHash = current.capeHash;
    if (current.capeHash && current.capeUrl) {
      await pool.query(`
        INSERT INTO player_cape_history(player_uuid,cape_hash,cape_url)
        VALUES($1::uuid,$2,$3)
        ON CONFLICT(player_uuid,cape_hash) DO UPDATE SET
          cape_url=EXCLUDED.cape_url,last_seen=NOW()
      `, [player.player_uuid,current.capeHash,current.capeUrl]);
    }

    try {
      const nameMc = await resolveCapes({
        username:player.username,
        currentCapeUrl:current.capeUrl,
        forceRefresh:Boolean(forceCapeRefresh)
      });
      if (nameMc.capes.length) {
        await pool.query(`
          INSERT INTO player_cape_history(player_uuid,cape_hash,cape_url,cape_name,cape_source)
          SELECT $1::uuid,item.cape_hash,
                 'https://s.namemc.com/i/' || item.cape_hash || '.js',
                 item.cape_name,'namemc'
          FROM UNNEST($2::text[],$3::text[]) AS item(cape_hash,cape_name)
          ON CONFLICT(player_uuid,cape_hash) DO UPDATE SET
            cape_url=EXCLUDED.cape_url,cape_name=EXCLUDED.cape_name,
            cape_source=EXCLUDED.cape_source,last_seen=NOW()
        `, [
          player.player_uuid,
          nameMc.capes.map(cape => cape.hash),
          nameMc.capes.map(cape => cape.name)
        ]);
      }
      if (nameMc.currentCapeHash) currentCapeHash = nameMc.currentCapeHash;
    } catch (error) {
      warn(`[PlayerSkinHistory] Could not import NameMC capes for ${player.username}: ${error.message}`);
    }
    return currentCapeHash;
  }

  function refreshOnce(identity) {
    const player = normalizePlayerIdentity(identity);
    if (!pool || !player) return Promise.resolve(null);
    const key = player.player_uuid;
    const activeRefresh = activeRefreshes.get(key);
    if (activeRefresh) return activeRefresh;
    const refreshPromise = refresh(player).finally(() => {
      if (activeRefreshes.get(key) === refreshPromise) activeRefreshes.delete(key);
    });
    activeRefreshes.set(key,refreshPromise);
    return refreshPromise;
  }

  return { refresh,refreshOnce };
}

module.exports = { createPlayerSkinHistoryService,normalizePlayerIdentity };
