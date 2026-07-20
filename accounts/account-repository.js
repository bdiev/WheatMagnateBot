'use strict';

const crypto = require('node:crypto');

const ACCOUNT_FIELDS = `id,username,display_name,host,port,minecraft_version,auth_type,enabled,color,
  created_at,updated_at,last_connected_at,sort_order,reconnect_backoff_ms,is_default`;

function accountFromRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    host: row.host,
    port: Number(row.port),
    minecraftVersion: row.minecraft_version,
    authType: row.auth_type,
    enabled: Boolean(row.enabled),
    color: row.color,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastConnectedAt: row.last_connected_at,
    sortOrder: Number(row.sort_order),
    reconnectBackoffMs: Number(row.reconnect_backoff_ms),
    isDefault: Boolean(row.is_default)
  };
}

class AccountRepository {
  constructor(pool) {
    if (!pool) throw new Error('AccountRepository requires a database pool.');
    this.pool = pool;
  }

  async list({ includeDisabled = true } = {}) {
    const result = await this.pool.query(`SELECT ${ACCOUNT_FIELDS} FROM bot_accounts
      WHERE deleted_at IS NULL${includeDisabled ? '' : ' AND enabled=TRUE'} ORDER BY sort_order,created_at,id`);
    return result.rows.map(accountFromRow);
  }

  async get(id) {
    const result = await this.pool.query(`SELECT ${ACCOUNT_FIELDS} FROM bot_accounts WHERE id=$1::uuid AND deleted_at IS NULL`, [id]);
    return accountFromRow(result.rows[0]);
  }

  async getDefault() {
    const result = await this.pool.query(`SELECT ${ACCOUNT_FIELDS} FROM bot_accounts
      WHERE deleted_at IS NULL ORDER BY is_default DESC,sort_order,created_at LIMIT 1`);
    return accountFromRow(result.rows[0]);
  }

  async create(input) {
    const id = input.id || crypto.randomUUID();
    const result = await this.pool.query(`INSERT INTO bot_accounts
      (id,username,display_name,host,port,minecraft_version,auth_type,enabled,color,sort_order,reconnect_backoff_ms,is_default)
      VALUES($1::uuid,$2,$3,$4,$5,$6,$7,$8,$9,
        COALESCE($10,(SELECT COALESCE(MAX(sort_order),-1)+1 FROM bot_accounts)),$11,
        NOT EXISTS(SELECT 1 FROM bot_accounts)) RETURNING ${ACCOUNT_FIELDS}`,
    [id,input.username,input.displayName,input.host,input.port,input.minecraftVersion || null,input.authType,
      input.enabled !== false,input.color || null,input.sortOrder ?? null,input.reconnectBackoffMs || 5000]);
    return accountFromRow(result.rows[0]);
  }

  async update(id, changes) {
    const values = [];
    const assignments = [];
    const columns = {
      username: 'username', displayName: 'display_name', host: 'host', port: 'port',
      minecraftVersion: 'minecraft_version', authType: 'auth_type', enabled: 'enabled', color: 'color',
      sortOrder: 'sort_order', reconnectBackoffMs: 'reconnect_backoff_ms'
    };
    for (const [key, column] of Object.entries(columns)) {
      if (!Object.hasOwn(changes, key)) continue;
      values.push(changes[key]);
      assignments.push(`${column}=$${values.length}`);
    }
    if (!assignments.length) return this.get(id);
    values.push(id);
    const result = await this.pool.query(`UPDATE bot_accounts SET ${assignments.join(',')},updated_at=NOW()
      WHERE id=$${values.length}::uuid RETURNING ${ACCOUNT_FIELDS}`, values);
    return accountFromRow(result.rows[0]);
  }

  async remove(id) {
    const result = await this.pool.query(`UPDATE bot_accounts SET enabled=FALSE,deleted_at=NOW(),updated_at=NOW()
      WHERE id=$1::uuid AND is_default=FALSE AND deleted_at IS NULL RETURNING ${ACCOUNT_FIELDS}`, [id]);
    return accountFromRow(result.rows[0]);
  }

  async markConnected(id) {
    await this.pool.query('UPDATE bot_accounts SET last_connected_at=NOW(),updated_at=NOW() WHERE id=$1::uuid', [id]);
  }
}

module.exports = { AccountRepository, accountFromRow };
