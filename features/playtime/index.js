'use strict';

const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { formatPlaytime, parsePlaytime } = require('./duration');

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

  async function syncWhitelistPlaytime(onlineUsernames = getOnlinePlayerUsernames()) {
    if (!pool) return;

    return enqueuePlaytimeWrite(async () => {
    let client = null;
    try {
      client = await pool.connect();
      await client.query('BEGIN');
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
          VALUES ($1, NOW())
          ON CONFLICT (LOWER(username))
          DO UPDATE SET username = EXCLUDED.username,
                        tracking_since = NOW(),
                        updated_at = NOW()
        `, [username]);
      }
      await client.query('COMMIT');
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

    return enqueuePlaytimeWrite(async () => {
    try {
      const result = await pool.query(`
        INSERT INTO player_playtime (username, total_seconds)
        VALUES ($1, $2)
        ON CONFLICT (LOWER(username))
        DO UPDATE SET username = EXCLUDED.username,
                      total_seconds = EXCLUDED.total_seconds,
                      tracking_since = CASE WHEN player_playtime.tracking_since IS NULL THEN NULL ELSE NOW() END,
                      updated_at = NOW()
        RETURNING username
      `, [username, totalSeconds]);
      return { username: result.rows[0].username };
    } catch (err) {
      return { error: err.message };
    }
    });
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
