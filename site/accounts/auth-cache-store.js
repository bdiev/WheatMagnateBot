'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const MAX_CACHE_BYTES = 5 * 1024 * 1024;

class AuthCacheStore {
  constructor({ pool, secret = process.env.MINECRAFT_AUTH_CACHE_KEY || process.env.DATABASE_URL } = {}) {
    this.pool = pool;
    this.key = secret ? crypto.createHash('sha256').update(String(secret)).digest() : null;
  }

  get enabled() { return Boolean(this.pool && this.key); }

  async readDirectory(root) {
    const files = {};
    let total = 0;
    const visit = async (directory, prefix = '') => {
      const entries = await fs.promises.readdir(directory, { withFileTypes:true }).catch(error => error.code === 'ENOENT' ? [] : Promise.reject(error));
      for (const entry of entries) {
        if (entry.isSymbolicLink()) continue;
        const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
        const absolute = path.join(directory, entry.name);
        if (entry.isDirectory()) await visit(absolute, relative);
        else if (entry.isFile()) {
          const value = await fs.promises.readFile(absolute);
          total += value.length;
          if (total > MAX_CACHE_BYTES) throw new Error('Minecraft auth cache exceeds the database backup limit.');
          files[relative] = value.toString('base64');
        }
      }
    };
    await visit(root);
    return files;
  }

  async persist(accountId, directory) {
    if (!this.enabled) return false;
    const files = await this.readDirectory(directory);
    if (!Object.keys(files).length) return false;
    const nonce = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.key, nonce);
    cipher.setAAD(Buffer.from(String(accountId)));
    const encrypted = Buffer.concat([cipher.update(JSON.stringify({ version:1,files }),'utf8'),cipher.final()]);
    const tag = cipher.getAuthTag();
    await this.pool.query(`INSERT INTO bot_account_auth_cache(account_id,ciphertext,nonce,auth_tag,updated_at)
      VALUES($1::uuid,$2,$3,$4,NOW()) ON CONFLICT(account_id) DO UPDATE SET
      ciphertext=EXCLUDED.ciphertext,nonce=EXCLUDED.nonce,auth_tag=EXCLUDED.auth_tag,updated_at=NOW()`,
    [accountId,encrypted,nonce,tag]);
    return true;
  }

  async hydrate(accountId, directory) {
    if (!this.enabled) return false;
    const existing = await fs.promises.readdir(directory).catch(error => error.code === 'ENOENT' ? [] : Promise.reject(error));
    if (existing.length) return false;
    const result = await this.pool.query('SELECT ciphertext,nonce,auth_tag FROM bot_account_auth_cache WHERE account_id=$1::uuid',[accountId]);
    if (!result.rows[0]) return false;
    const row = result.rows[0];
    const decipher = crypto.createDecipheriv('aes-256-gcm',this.key,Buffer.from(row.nonce));
    decipher.setAAD(Buffer.from(String(accountId)));
    decipher.setAuthTag(Buffer.from(row.auth_tag));
    const archive = JSON.parse(Buffer.concat([decipher.update(Buffer.from(row.ciphertext)),decipher.final()]).toString('utf8'));
    await fs.promises.mkdir(directory,{recursive:true});
    for (const [relative,base64] of Object.entries(archive.files || {})) {
      if (!relative || path.isAbsolute(relative) || relative.split('/').includes('..')) throw new Error('Unsafe auth-cache archive path.');
      const target = path.resolve(directory,...relative.split('/'));
      if (!target.startsWith(`${path.resolve(directory)}${path.sep}`)) throw new Error('Unsafe auth-cache extraction path.');
      await fs.promises.mkdir(path.dirname(target),{recursive:true});
      await fs.promises.writeFile(target,Buffer.from(base64,'base64'),{mode:0o600});
    }
    return true;
  }

  async remove(accountId) {
    if (!this.pool) return false;
    await this.pool.query('DELETE FROM bot_account_auth_cache WHERE account_id=$1::uuid',[accountId]);
    return true;
  }
}

module.exports = { AuthCacheStore };
