'use strict';

const COMMAND_TYPES = new Set([
  'chat', 'site_whisper', 'pause', 'resume', 'restart', 'set_whitelist_mode',
  'set_danger_radius', 'set_message_cooldown', 'follow', 'follow_stop', 'drop_item',
  'whitelist_add', 'whitelist_remove', 'ignore_chat', 'unignore_chat', 'obsidian_toggle',
  'obsidian_radius_toggle', 'obsidian_reset_coordinates', 'obsidian_set_coordinates',
  'child_toggle', 'child_say', 'gemini_toggle', 'child_public_toggle'
]);

class DeferredCommandError extends Error {
  constructor(message, payloadPatch = {}) {
    super(message);
    this.name = 'DeferredCommandError';
    this.payloadPatch = payloadPatch;
  }
}

function normalizeCommand({ source = 'site', requestedBy = null, commandType, payload = {} }, allowedTypes = COMMAND_TYPES) {
  const type = String(commandType || '').trim().toLowerCase();
  if (!allowedTypes.has(type)) {
    const error = new Error('Unsupported bot command.');
    error.statusCode = 400;
    throw error;
  }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    const error = new Error('Command payload must be an object.');
    error.statusCode = 400;
    throw error;
  }
  return {
    source: String(source || 'site').trim().slice(0, 32) || 'site',
    requestedBy: requestedBy == null ? null : String(requestedBy).trim().slice(0, 255) || null,
    commandType: type,
    payload: { ...payload }
  };
}

async function enqueueCommand(db, input, options = {}) {
  const command = normalizeCommand(input, options.allowedTypes || COMMAND_TYPES);
  const result = await db.query(`
    INSERT INTO bot_commands (source, requested_by, command_type, payload)
    VALUES ($1, $2, $3, $4)
    RETURNING id, source, requested_by, command_type, payload, status, created_at
  `, [command.source, command.requestedBy, command.commandType, command.payload]);
  const row = result.rows[0];
  return { queued: true, command: {
    id: String(row.id), source: row.source, requestedBy: row.requested_by,
    commandType: row.command_type, payload: row.payload, status: row.status, createdAt: row.created_at
  } };
}

async function processPendingCommands(db, execute, { includeChat = true, limit = 5 } = {}) {
  const claimed = await db.query(`
    WITH next_commands AS (
      SELECT id FROM bot_commands
      WHERE status = 'pending'
        AND ($1::boolean OR command_type NOT IN ('chat', 'site_whisper'))
        AND (command_type <> 'site_whisper' OR COALESCE(payload->>'offlineUntilJoin', 'false') <> 'true')
        AND (command_type <> 'site_whisper' OR payload->>'deferredUntil' IS NULL OR (payload->>'deferredUntil')::timestamptz <= NOW())
      ORDER BY created_at ASC, id ASC LIMIT $2 FOR UPDATE SKIP LOCKED
    )
    UPDATE bot_commands command
    SET status = 'processing', started_at = NOW(), error = NULL
    FROM next_commands WHERE command.id = next_commands.id
    RETURNING command.id, command.source, command.requested_by, command.command_type, command.payload
  `, [includeChat, limit]);
  const transitions = [];
  for (const command of claimed.rows) {
    try {
      const result = await execute(command);
      await db.query("UPDATE bot_commands SET status='done', result=$2, error=NULL, finished_at=NOW() WHERE id=$1", [command.id, result || {}]);
      transitions.push({ ...command, id: String(command.id), status: 'done', result: result || {} });
    } catch (error) {
      if (error instanceof DeferredCommandError) {
        await db.query(`UPDATE bot_commands SET status='pending', payload=payload || $2::jsonb,
          result=jsonb_build_object('deferred', true, 'reason', $3::text), error=NULL, started_at=NULL WHERE id=$1`,
        [command.id, JSON.stringify(error.payloadPatch || {}), error.message]);
        transitions.push({ ...command, id: String(command.id), status: 'pending', deferred: true, error: error.message, payloadPatch: error.payloadPatch || {} });
      } else {
        await db.query("UPDATE bot_commands SET status='failed', error=$2, finished_at=NOW() WHERE id=$1", [command.id, error.message]);
        transitions.push({ ...command, id: String(command.id), status: 'failed', error: error.message });
      }
    }
  }
  return transitions;
}

module.exports = { COMMAND_TYPES, DeferredCommandError, enqueueCommand, normalizeCommand, processPendingCommands };
