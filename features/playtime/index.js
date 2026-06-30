'use strict';

const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

function createPlaytimeFeature({
  pool,
  getOnlineWhitelistUsernames,
  getPlayerHeadEmoji,
  statusEmojis,
  uiButtonEmojis
}) {
  async function syncWhitelistPlaytime(onlineUsernames = getOnlineWhitelistUsernames()) {
    if (!pool) return;

    let client = null;
    try {
      client = await pool.connect();
      await client.query('BEGIN');
      await client.query(`
        INSERT INTO player_playtime (username)
        SELECT username FROM whitelist
        ON CONFLICT (username) DO NOTHING
      `);
      await client.query(`
        UPDATE player_playtime
        SET total_seconds = total_seconds + GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (NOW() - tracking_since)))::BIGINT),
            tracking_since = NULL,
            updated_at = NOW()
        WHERE tracking_since IS NOT NULL
      `);

      for (const username of onlineUsernames) {
        await client.query(`
          INSERT INTO player_playtime (username, tracking_since)
          SELECT username, NOW()
          FROM whitelist
          WHERE LOWER(username) = LOWER($1)
          ON CONFLICT (username)
          DO UPDATE SET tracking_since = NOW(), updated_at = NOW()
        `, [username]);
      }
      await client.query('COMMIT');
    } catch (err) {
      if (client) await client.query('ROLLBACK').catch(() => {});
      console.error('[Playtime] Failed to synchronize:', err.message);
    } finally {
      if (client) client.release();
    }
  }

  async function getWhitelistPlaytime() {
    if (!pool) return { error: 'Database not configured' };

    try {
      await pool.query(`
        INSERT INTO player_playtime (username)
        SELECT username FROM whitelist
        ON CONFLICT (username) DO NOTHING
      `);
      const result = await pool.query(`
        SELECT w.username,
               COALESCE(pt.total_seconds, 0) +
                 CASE WHEN pt.tracking_since IS NULL THEN 0
                      ELSE GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (NOW() - pt.tracking_since)))::BIGINT)
                 END AS total_seconds
        FROM whitelist w
        LEFT JOIN player_playtime pt ON pt.username = w.username
        ORDER BY total_seconds DESC, LOWER(w.username)
      `);
      return { players: result.rows };
    } catch (err) {
      return { error: err.message };
    }
  }

  function parsePlaytime(value) {
    const input = String(value || '').trim();
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
      components: [
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId('playtime_refresh_button')
            .setLabel('Refresh')
            .setEmoji(uiButtonEmojis.slowFalling)
            .setStyle(ButtonStyle.Secondary)
        )
      ]
    };
  }

  async function setPlayerPlaytime(username, totalSeconds) {
    if (!pool) return { error: 'Database not configured' };

    try {
      const result = await pool.query(`
        INSERT INTO player_playtime (username, total_seconds)
        SELECT username, $2 FROM whitelist WHERE LOWER(username) = LOWER($1)
        ON CONFLICT (username)
        DO UPDATE SET total_seconds = EXCLUDED.total_seconds,
                      tracking_since = CASE WHEN player_playtime.tracking_since IS NULL THEN NULL ELSE NOW() END,
                      updated_at = NOW()
        RETURNING username
      `, [username, totalSeconds]);
      if (result.rowCount === 0) return { error: 'Player is not in the whitelist' };
      return { username: result.rows[0].username };
    } catch (err) {
      return { error: err.message };
    }
  }

  return {
    syncWhitelistPlaytime,
    getWhitelistPlaytime,
    parsePlaytime,
    formatPlaytime,
    formatPlaytimeLeaderboard,
    buildWhitelistPlaytimeMessage,
    setPlayerPlaytime
  };
}

module.exports = { createPlaytimeFeature };
