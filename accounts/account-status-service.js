'use strict';

class AccountStatusService {
  constructor(pool) { if (!pool) throw new Error('AccountStatusService requires a database pool.'); this.pool=pool; }
  async list() { const result=await this.pool.query('SELECT account_id,status,current_task,last_error,started_at,updated_at,status_payload FROM bot_account_runtime_state'); return result.rows; }
  async get(accountId) { const result=await this.pool.query('SELECT account_id,status,current_task,last_error,started_at,updated_at,status_payload FROM bot_account_runtime_state WHERE account_id=$1::uuid',[accountId]); return result.rows[0] || null; }
  async write(status) { await this.pool.query(`INSERT INTO bot_account_runtime_state(account_id,status,current_task,last_error,started_at,updated_at,status_payload) VALUES($1::uuid,$2,$3,$4,$5,NOW(),$6) ON CONFLICT(account_id) DO UPDATE SET status=EXCLUDED.status,current_task=EXCLUDED.current_task,last_error=EXCLUDED.last_error,started_at=EXCLUDED.started_at,updated_at=NOW(),status_payload=EXCLUDED.status_payload`,[status.accountId,status.status,status.task,status.lastError,status.startedAt,status]); return status; }
}

module.exports = { AccountStatusService };
