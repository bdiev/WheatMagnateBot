'use strict';

const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

function createPlaytimeFeature({
  pool,
  getOnlinePlayerUsernames,
  getPlayerHeadEmoji,
  statusEmojis,
  uiButtonEmojis
}) {
  let playtimeWriteQueue = Promise.resolve();

  function enqueuePlaytimeWrite(task) {
    const run = playtimeWriteQueue.then(task, task);
    playtimeWriteQueue = run.catch(() => {});
    return run;
  }

  async function syncWhitelistPlaytime(
    onlineUsernames = getOnlinePlayerUsernames(),
    { allowEmptySnapshot = false } = {}
  ) {
    if (!pool) return;

    const onlineByKey = new Map();
    for (const rawUsername of Array.isArray(onlineUsernames) ? onlineUsernames : []) {
      const username = String(rawUsername || '').trim();
      if (!/^[A-Za-z0-9_]{1,32}$/.test(username)) continue;
      if (!onlineByKey.has(username.toLowerCase())) onlineByKey.set(username.toLowerCase(), username);
    }
    const normalizedOnlineUsernames = [...onlineByKey.values()];
    const onlineUsernameKeys = [...onlineByKey.keys()];
    if (!normalizedOnlineUsernames.length && !allowEmptySnapshot) {
      console.warn('[Playtime] Skipping an empty online-player snapshot.');
      return { skipped: true, reason: 'empty-snapshot' };
    }

    return enqueuePlaytimeWrite(async () => {
    let client = null;
    try {
      client = await pool.connect();
      await client.query('BEGIN');
      // Persist complete seconds while carrying the sub-second remainder into
      // the next checkpoint. This makes repeated checkpoints equivalent to
      // flooring once at the end of the whole session instead of losing a
      // fraction of a second every 30 seconds.
      await client.query(`
        WITH elapsed AS (
          SELECT username,
                 GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (NOW() - tracking_since)))::BIGINT) AS whole_seconds,
                 LOWER(username) = ANY($1::text[]) AS remains_online
          FROM player_playtime
          WHERE tracking_since IS NOT NULL
        )
        UPDATE player_playtime pt
        SET total_seconds = pt.total_seconds + elapsed.whole_seconds,
            tracking_since = CASE
              WHEN elapsed.remains_online
                THEN pt.tracking_since + elapsed.whole_seconds * INTERVAL '1 second'
              ELSE NULL
            END,
            updated_at = NOW()
        FROM elapsed
        WHERE pt.username = elapsed.username
      `, [onlineUsernameKeys]);

      for (const username of normalizedOnlineUsernames) {
        await client.query(`
          WITH identity AS (
            SELECT pa.player_uuid
            FROM player_activity pa
            WHERE pa.player_uuid IS NOT NULL
              AND (
                LOWER(pa.username) = LOWER($1)
                OR EXISTS (
                  SELECT 1 FROM player_name_history pnh
                  WHERE pnh.player_uuid = pa.player_uuid
                    AND LOWER(pnh.username) = LOWER($1)
                )
              )
            LIMIT 1
          ), updated_by_uuid AS (
            UPDATE player_playtime pt
            SET username = $1,
                tracking_since = COALESCE(pt.tracking_since, NOW()),
                updated_at = NOW()
            WHERE pt.player_uuid = (SELECT player_uuid FROM identity)
            RETURNING 1
          )
          INSERT INTO player_playtime (username, player_uuid, tracking_since)
          SELECT $1, (SELECT player_uuid FROM identity), NOW()
          WHERE NOT EXISTS (SELECT 1 FROM updated_by_uuid)
          ON CONFLICT (LOWER(username))
          DO UPDATE SET username = EXCLUDED.username,
                        player_uuid = COALESCE(EXCLUDED.player_uuid, player_playtime.player_uuid),
                        tracking_since = COALESCE(player_playtime.tracking_since, NOW()),
                        updated_at = NOW()
        `, [username]);
      }
      await client.query('COMMIT');
      return { synchronized: true, onlineCount: normalizedOnlineUsernames.length };
    } catch (err) {
      if (client) await client.query('ROLLBACK').catch(() => {});
      console.error('[Playtime] Failed to synchronize:', err.message);
    } finally {
      if (client) client.release();
    }
    });
  }

  async function getWhitelistPlaytime() {
    if (!pool) return { error: 'Database not configured' };

    try {
      const result = await pool.query(`
        WITH matched AS (
          SELECT
            COALESCE(pa.username, w.username) AS username,
            COALESCE(pa.player_uuid::text, LOWER(w.username)) AS identity_key,
            COALESCE(pt.total_seconds, 0) +
              CASE WHEN pt.tracking_since IS NULL THEN 0
                   ELSE GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (NOW() - pt.tracking_since)))::BIGINT)
              END AS total_seconds
          FROM whitelist w
          LEFT JOIN LATERAL (
            SELECT candidate.username, candidate.player_uuid
            FROM player_activity candidate
            WHERE candidate.player_uuid IS NOT NULL
              AND (
                LOWER(candidate.username) = LOWER(w.username)
                OR EXISTS (
                  SELECT 1 FROM player_name_history pnh
                  WHERE pnh.player_uuid = candidate.player_uuid
                    AND LOWER(pnh.username) = LOWER(w.username)
                )
              )
            LIMIT 1
          ) pa ON TRUE
          LEFT JOIN player_playtime pt
            ON (pa.player_uuid IS NOT NULL AND pt.player_uuid = pa.player_uuid)
            OR (pa.player_uuid IS NULL AND pt.player_uuid IS NULL AND LOWER(pt.username) = LOWER(w.username))
        ), deduplicated AS (
          SELECT DISTINCT ON (identity_key) username, identity_key, total_seconds
          FROM matched
          ORDER BY identity_key, total_seconds DESC
        )
        SELECT username, total_seconds
        FROM deduplicated
        ORDER BY total_seconds DESC, LOWER(username)
      `);
      return { players: result.rows };
    } catch (err) {
      return { error: err.message };
    }
  }

  async function searchNonWhitelistPlaytime(query, limit = 25) {
    if (!pool) return { error: 'Database not configured' };

    const search = String(query || '').trim();
    if (search.length < 2) return { error: 'Type at least 2 characters.' };
    const safeLimit = Math.max(1, Math.min(25, Number(limit) || 25));

    try {
      const result = await pool.query(`
        SELECT COALESCE(pa.username, pt.username) AS username,
               COALESCE(pt.total_seconds, 0) +
                 CASE WHEN pt.tracking_since IS NULL THEN 0
                      ELSE GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (NOW() - pt.tracking_since)))::BIGINT)
                 END AS total_seconds
        FROM player_playtime pt
        LEFT JOIN player_activity pa ON pa.player_uuid = pt.player_uuid
        WHERE (
            LOWER(COALESCE(pa.username, pt.username)) LIKE LOWER($1)
            OR EXISTS (
              SELECT 1 FROM player_name_history searched_name
              WHERE searched_name.player_uuid = pt.player_uuid
                AND LOWER(searched_name.username) LIKE LOWER($1)
            )
          )
          AND NOT EXISTS (
            SELECT 1
            FROM whitelist w
            WHERE LOWER(w.username) = LOWER(COALESCE(pa.username, pt.username))
               OR (
                 pt.player_uuid IS NOT NULL
                 AND EXISTS (
                   SELECT 1 FROM player_name_history whitelisted_name
                   WHERE whitelisted_name.player_uuid = pt.player_uuid
                     AND LOWER(whitelisted_name.username) = LOWER(w.username)
                 )
               )
          )
        ORDER BY total_seconds DESC, LOWER(COALESCE(pa.username, pt.username))
        LIMIT $2
      `, [`%${search}%`, safeLimit]);
      return { players: result.rows };
    } catch (err) {
      return { error: err.message };
    }
  }

  function parsePlaytime(value) {
    const input = String(value || '')
      .trim()
      // !pt responses may append the player's rank/total after the duration,
      // for example: "20 days 15 hours 19 minutes 30 seconds. [329/50368]".
      .replace(/\s*\[\d+\s*\/\s*\d+\]\s*$/, '')
      .replace(/[.!]\s*$/, '')
      .trim();
    if (!input) return null;

    const units = {
      d: 86400, day: 86400, days: 86400,
      h: 3600, hour: 3600, hours: 3600,
      m: 60, min: 60, mins: 60, minute: 60, minutes: 60,
      s: 1, sec: 1, secs: 1, second: 1, seconds: 1
    };
    let total = 0;
    let matches = 0;
    const tokenPattern = /(\d+)\s*(days?|d|hours?|h|minutes?|mins?|m|seconds?|secs?|s)\b/gi;
    const remainder = input.replace(tokenPattern, (_, amount, unit) => {
      total += Number(amount) * units[unit.toLowerCase()];
      matches += 1;
      return '';
    }).replace(/[\s,]+/g, '');

    return matches > 0 && !remainder && Number.isSafeInteger(total) ? total : null;
  }

  function formatPlaytime(value) {
    let seconds = Math.max(0, Math.floor(Number(value) || 0));
    const days = Math.floor(seconds / 86400);
    seconds %= 86400;
    const hours = Math.floor(seconds / 3600);
    seconds %= 3600;
    const minutes = Math.floor(seconds / 60);
    const parts = [];
    if (days) parts.push(`${days}d`);
    if (hours || days) parts.push(`${hours}h`);
    parts.push(`${minutes}m`);
    return parts.join(' ');
  }

  function formatPlaytimeLeaderboard(players) {
    const visiblePlayers = players.slice(0, 50);
    const rankWidth = Math.max(1, String(visiblePlayers.length).length);
    const lines = visiblePlayers.map((player, index) => {
      const rank = String(index + 1).padStart(rankWidth, '0');
      return `\`${rank}.\` ${getPlayerHeadEmoji(player.username)} **${player.username}** - \`${formatPlaytime(player.total_seconds)}\``;
    });
    if (players.length > visiblePlayers.length) {
      lines.push(`...and ${players.length - visiblePlayers.length} more`);
    }
    return lines.length > 0 ? lines.join('\n') : 'No whitelist players found.';
  }

  function buildPlaytimeComponents() {
    const searchButton = new ButtonBuilder()
      .setCustomId('playtime_non_whitelist_search')
      .setLabel('Search non-whitelist')
      .setStyle(ButtonStyle.Secondary);
    if (uiButtonEmojis.search) searchButton.setEmoji(uiButtonEmojis.search);

    return [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('playtime_refresh_button')
          .setLabel('Refresh')
          .setEmoji(uiButtonEmojis.slowFalling)
          .setStyle(ButtonStyle.Secondary),
        searchButton
      )
    ];
  }

  async function buildWhitelistPlaytimeMessage() {
    const playtimeData = await getWhitelistPlaytime();
    if (playtimeData.error) {
      return {
        embeds: [{
          title: 'Whitelist Playtime',
          description: `Error: ${playtimeData.error}`,
          color: 16711680,
          timestamp: new Date()
        }],
        components: []
      };
    }

    const players = playtimeData.players || [];
    const description = formatPlaytimeLeaderboard(players);

    return {
      embeds: [{
        title: `${statusEmojis.playtime} Whitelist Playtime · ${players.length} players`,
        description,
        color: 3447003,
        timestamp: new Date(),
        footer: { text: 'Press Refresh to update this table' }
      }],
      components: buildPlaytimeComponents()
    };
  }

  async function setPlayerPlaytime(username, totalSeconds) {
    if (!pool) return { error: 'Database not configured' };

    return enqueuePlaytimeWrite(async () => {
    try {
      const result = await pool.query(`
        WITH identity AS (
          SELECT pa.username, pa.player_uuid
          FROM player_activity pa
          WHERE pa.player_uuid IS NOT NULL
            AND (
              LOWER(pa.username) = LOWER($1)
              OR EXISTS (
                SELECT 1 FROM player_name_history pnh
                WHERE pnh.player_uuid = pa.player_uuid
                  AND LOWER(pnh.username) = LOWER($1)
              )
            )
          LIMIT 1
        ), updated_by_uuid AS (
          UPDATE player_playtime pt
          SET username = (SELECT username FROM identity),
              total_seconds = $2,
              tracking_since = CASE WHEN pt.tracking_since IS NULL THEN NULL ELSE NOW() END,
              updated_at = NOW()
          WHERE pt.player_uuid = (SELECT player_uuid FROM identity)
          RETURNING username
        ), inserted AS (
          INSERT INTO player_playtime (username, player_uuid, total_seconds)
          SELECT COALESCE((SELECT username FROM identity), $1),
                 (SELECT player_uuid FROM identity),
                 $2
          WHERE NOT EXISTS (SELECT 1 FROM updated_by_uuid)
        ON CONFLICT (LOWER(username))
        DO UPDATE SET username = EXCLUDED.username,
                      player_uuid = COALESCE(EXCLUDED.player_uuid, player_playtime.player_uuid),
                      total_seconds = EXCLUDED.total_seconds,
                      tracking_since = CASE WHEN player_playtime.tracking_since IS NULL THEN NULL ELSE NOW() END,
                      updated_at = NOW()
          RETURNING username
        )
        SELECT username FROM updated_by_uuid
        UNION ALL
        SELECT username FROM inserted
      `, [username, totalSeconds]);
      return { username: result.rows[0]?.username || username };
    } catch (err) {
      return { error: err.message };
    }
    });
  }

  return {
    syncWhitelistPlaytime,
    getWhitelistPlaytime,
    searchNonWhitelistPlaytime,
    parsePlaytime,
    formatPlaytime,
    formatPlaytimeLeaderboard,
    buildPlaytimeComponents,
    buildWhitelistPlaytimeMessage,
    setPlayerPlaytime
  };
}

module.exports = { createPlaytimeFeature };
