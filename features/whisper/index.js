'use strict';

const fs = require('fs');
const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  PermissionsBitField
} = require('discord.js');

function formatRemainingTime(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }
  return `${seconds}s`;
}

function createWhisperFeature({
  discordClient,
  discordChannelId,
  discordDmCategoryId,
  whisperChannelsFile,
  defaultTtlMs,
  state,
  emojis,
  debugLog = () => {}
}) {
  function saveWhisperChannels() {
    try {
      const payload = Object.fromEntries(state.whisperChannels.entries());
      fs.writeFileSync(whisperChannelsFile, JSON.stringify(payload, null, 2));
    } catch (e) {
      console.error('[Whisper] Failed to save channel mappings:', e.message);
    }
  }

  function loadWhisperChannels() {
    try {
      const raw = fs.readFileSync(whisperChannelsFile, 'utf8').trim();
      if (!raw) return;

      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        console.error('[Whisper] Ignoring invalid channel mapping file format.');
        return;
      }

      state.whisperChannels.clear();
      for (const [key, value] of Object.entries(parsed)) {
        state.whisperChannels.set(key, value);
      }
    } catch (e) {
      if (e.code !== 'ENOENT') {
        console.error('[Whisper] Failed to load channel mappings:', e.message);
      }
    }
  }

  function setWhisperChannelMapping(ownerId, mcUsername, channelId) {
    state.whisperChannels.set(`${ownerId}:${mcUsername.toLowerCase()}`, channelId);
    saveWhisperChannels();
  }

  function getDialogOwnerId(channelId) {
    for (const [key, value] of state.whisperChannels.entries()) {
      if (value === channelId) {
        return key.split(':')[0];
      }
    }
    return null;
  }

  function stopFooterUpdates(channelId) {
    const existing = state.whisperFooterUpdateIntervals.get(channelId);
    if (existing) {
      clearInterval(existing);
      state.whisperFooterUpdateIntervals.delete(channelId);
    }
  }

  function startFooterUpdates(channelId) {
    stopFooterUpdates(channelId);

    const interval = setInterval(async () => {
      try {
        const deleteTimestamp = state.whisperDeleteTimestamps.get(channelId);
        const lastMsgId = state.lastDialogMessages.get(channelId);

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
        debugLog('[Whisper] Footer update error:', e.message);
        stopFooterUpdates(channelId);
      }
    }, 3000);

    state.whisperFooterUpdateIntervals.set(channelId, interval);
  }

  async function sendWhisperEmbed(channel, {
    senderLabel = 'Message',
    body,
    ttlMs = defaultTtlMs,
    addDeleteButton = true
  }) {
    const effectiveTTL = state.customDialogTTL.get(channel.id) || ttlMs;
    const deleteTimestamp = Date.now() + effectiveTTL;
    const firstLine = `[${senderLabel}] ${body}`;
    const footerLine = addDeleteButton ? `Auto-deletes in ${formatRemainingTime(effectiveTTL)}` : '';
    const content = addDeleteButton ? `${firstLine}\n\n${footerLine}` : firstLine;

    if (addDeleteButton && state.lastDialogMessages.has(channel.id)) {
      stopFooterUpdates(channel.id);
      try {
        const prevMsgId = state.lastDialogMessages.get(channel.id);
        const prevMsg = await channel.messages.fetch(prevMsgId);
        const parts = (prevMsg.content || '').split('\n\n');
        const headerOnly = parts[0];
        await prevMsg.edit({ content: headerOnly, components: [] });
      } catch (e) {
        debugLog('[Whisper] Failed to remove footer from previous message:', e.message);
      }
    }

    const components = addDeleteButton ? buildDeleteDialogComponents(channel.id) : [];
    const message = await channel.send({ content, components });

    if (addDeleteButton) {
      state.lastDialogMessages.set(channel.id, message.id);
      state.whisperDeleteTimestamps.set(channel.id, deleteTimestamp);
      startFooterUpdates(channel.id);
    }

    return message;
  }

  function removeWhisperChannelMappings(channelId) {
    let changed = false;
    for (const [key, value] of state.whisperChannels.entries()) {
      if (value === channelId) {
        state.whisperChannels.delete(key);
        changed = true;
      }
    }
    if (changed) saveWhisperChannels();
    state.lastDialogMessages.delete(channelId);
    stopFooterUpdates(channelId);
    state.whisperDeleteTimestamps.delete(channelId);
    state.customDialogTTL.delete(channelId);
  }

  function cancelWhisperCleanup(channelId) {
    const existing = state.whisperCleanupTimers.get(channelId);
    if (existing) {
      clearTimeout(existing);
      state.whisperCleanupTimers.delete(channelId);
    }
  }

  function scheduleWhisperCleanup(channelId, ttlMs = defaultTtlMs) {
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

    state.whisperCleanupTimers.set(channelId, timer);
  }

  async function sendWhisperClaimPrompt(mcUsername, body) {
    if (!discordChannelId || !discordClient || !discordClient.isReady()) return;
    const mcKey = mcUsername.toLowerCase();
    const channel = await discordClient.channels.fetch(discordChannelId);
    if (!channel || !channel.isTextBased()) return;

    const description = `New /msg from **${mcUsername}**\n> ${body}`;
    const components = [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`claim_whisper_${mcKey}`)
          .setLabel('Claim dialog')
          .setEmoji(emojis.ui.bookOrange)
          .setStyle(ButtonStyle.Success)
      )
    ];

    const existing = state.pendingWhisperClaims.get(mcKey);
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
        state.pendingWhisperClaims.set(mcKey, { messageId: msg.id, lastMessage: body });
        return;
      } catch (_) {
        state.pendingWhisperClaims.delete(mcKey);
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
      state.pendingWhisperClaims.set(mcKey, { messageId: msg.id, lastMessage: body });
    } catch (e) {
      console.error('[Whisper] Failed to post claim prompt:', e.message);
    }
  }

  async function removeWhisperClaimPrompt(mcUsername) {
    const mcKey = String(mcUsername || '').toLowerCase();
    const pending = state.pendingWhisperClaims.get(mcKey);
    let shouldClear = false;
    try {
      const channel = await discordClient.channels.fetch(discordChannelId);
      if (!channel?.isTextBased()) return false;
      if (pending) {
        const message = await channel.messages.fetch(pending.messageId);
        await message.delete();
        shouldClear = true;
        return true;
      }

      const recent = await channel.messages.fetch({ limit: 100 });
      const matches = [...recent.values()].filter(message => {
        if (discordClient.user?.id && message.author?.id !== discordClient.user.id) return false;
        const embed = message.embeds?.[0];
        if (embed?.title !== 'New whisper from Minecraft') return false;
        const description = String(embed.description || '');
        const usernameMatch = description.match(/New \/msg from \*\*([^*]+)\*\*/i);
        return String(usernameMatch?.[1] || '').toLowerCase() === mcKey;
      });
      await Promise.all(matches.map(message => message.delete()));
      return matches.length > 0;
    } catch (err) {
      if (err?.code === 10008 || err?.status === 404 || String(err?.message || '').includes('Unknown Message')) {
        shouldClear = true;
        return true;
      }
      console.error('[Whisper] Failed to remove claim prompt:', err.message);
      return false;
    } finally {
      if (shouldClear) state.pendingWhisperClaims.delete(mcKey);
    }
  }

  function buildDeleteDialogComponents(channelId) {
    return [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`delete_dialog_${channelId}`)
          .setLabel('Delete dialog')
          .setEmoji(emojis.farm.lavaBucket)
          .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
          .setCustomId(`set_ttl_${channelId}`)
          .setLabel('Set auto-delete time')
          .setEmoji(emojis.ui.slowFalling)
          .setStyle(ButtonStyle.Secondary)
      )
    ];
  }

  async function getOrCreateWhisperChannel(ownerId, ownerTag, mcUsername) {
    if (!discordClient || !discordClient.isReady()) return null;
    if (!discordDmCategoryId) {
      console.error('[Whisper] DISCORD_DM_CATEGORY_ID not set. Cannot create private channel.');
      return null;
    }

    const statusChannel = await discordClient.channels.fetch(discordChannelId);
    if (!statusChannel || !statusChannel.guild) {
      console.error('[Whisper] Cannot resolve guild from status channel.');
      return null;
    }

    const guild = statusChannel.guild;
    const key = `${ownerId}:${mcUsername.toLowerCase()}`;

    if (state.whisperChannels.has(key)) {
      try {
        const existing = await guild.channels.fetch(state.whisperChannels.get(key));
        if (existing) return existing;
      } catch (_) {
        state.whisperChannels.delete(key);
        saveWhisperChannels();
      }
    }

    let parent;
    try {
      parent = await guild.channels.fetch(discordDmCategoryId);
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

      setWhisperChannelMapping(ownerId, mcUsername, channel.id);
      console.log(`[Whisper] Created channel ${channel.name} for ${ownerTag} -> ${mcUsername}`);
      return channel;
    } catch (err) {
      console.error('[Whisper] Failed to create channel:', err.message);
      return null;
    }
  }

  return {
    saveWhisperChannels,
    loadWhisperChannels,
    setWhisperChannelMapping,
    getDialogOwnerId,
    sendWhisperEmbed,
    removeWhisperChannelMappings,
    cancelWhisperCleanup,
    scheduleWhisperCleanup,
    sendWhisperClaimPrompt,
    removeWhisperClaimPrompt,
    buildDeleteDialogComponents,
    getOrCreateWhisperChannel
  };
}

module.exports = { createWhisperFeature };
