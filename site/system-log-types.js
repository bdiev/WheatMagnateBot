'use strict';

// Admin System Log "type" filter. One logical type spans several storage
// categories (e.g. reconnects show up as minecraft events, notifications and
// captured console lines), so each type is an SQL condition, not a category.
// Fragments are static: no user input is ever interpolated into them.
const OBSIDIAN_NOTIFICATIONS = "'farm_stalled','low_pickaxe_durability','no_pickaxes','daily_obsidian_report'";
const CONNECTION_NOTIFICATIONS = "'bot_disconnected','bot_reconnected','bot_kicked','repeated_reconnects'";

const SYSTEM_LOG_TYPES = Object.freeze([
  {
    id: 'obsidian',
    label: 'Obsidian Farm',
    logCondition: `(
      category IN ('obsidian', 'obsidian_click', 'obsidian_analytics')
      OR (category = 'notification' AND details->>'eventType' IN (${OBSIDIAN_NOTIFICATIONS}))
      OR (category = 'bot_console' AND message ~* '^\\[obsidian')
      OR (category = 'command_bus' AND message ~* 'obsidian')
    )`,
    commandCondition: "command_type LIKE 'obsidian%'"
  },
  {
    id: 'connection',
    label: 'Connection & reconnects',
    logCondition: `(
      category IN ('minecraft', 'minecraft_runtime')
      OR (category = 'notification' AND details->>'eventType' IN (${CONNECTION_NOTIFICATIONS}))
      OR (category = 'bot_console' AND message ~* '(reconnect|disconnect|connection|kicked)')
    )`,
    commandCondition: "command_type IN ('pause', 'resume', 'restart', 'reconnect', 'disconnect', 'connect')"
  },
  {
    id: 'notifications',
    label: 'Notifications',
    logCondition: "category = 'notification'",
    commandCondition: null
  },
  {
    id: 'commands',
    label: 'Bot commands',
    logCondition: "category IN ('command_bus', 'bot_command')",
    commandCondition: 'TRUE'
  },
  {
    id: 'admin',
    label: 'Admin & security',
    logCondition: `category IN (
      'auth', 'security', 'accounts', 'admin_users', 'admin_players', 'admin_data',
      'user_settings', 'push_settings', 'notification_rules', 'log_retention', 'resource_requests'
    )`,
    commandCondition: null
  },
  {
    id: 'console',
    label: 'Bot console',
    logCondition: "category = 'bot_console'",
    commandCondition: null
  }
]);

const SYSTEM_LOG_TYPE_BY_ID = new Map(SYSTEM_LOG_TYPES.map(type => [type.id, type]));

function resolveSystemLogType(value) {
  const id = String(value || 'all').trim().toLowerCase();
  const type = SYSTEM_LOG_TYPE_BY_ID.get(id);
  return type
    ? { id: type.id, logCondition: type.logCondition, commandCondition: type.commandCondition }
    : { id: 'all', logCondition: 'TRUE', commandCondition: 'TRUE' };
}

function listSystemLogTypes() {
  return [{ id: 'all', label: 'All types' }, ...SYSTEM_LOG_TYPES.map(({ id, label }) => ({ id, label }))];
}

module.exports = { SYSTEM_LOG_TYPES, resolveSystemLogType, listSystemLogTypes };
