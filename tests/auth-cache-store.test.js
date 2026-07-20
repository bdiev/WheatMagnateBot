'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { AuthCacheStore } = require('../site/accounts/auth-cache-store');

async function main() {
  let saved = null;
  const pool = { query:async (sql,values) => {
    if (sql.startsWith('INSERT')) { saved={ciphertext:values[1],nonce:values[2],auth_tag:values[3]}; return {rows:[]}; }
    if (sql.startsWith('SELECT')) return {rows:saved?[saved]:[]};
    if (sql.startsWith('DELETE')) { saved=null; return {rows:[]}; }
    throw new Error('Unexpected SQL');
  }};
  const root = await fs.promises.mkdtemp(path.join(os.tmpdir(),'wm-auth-cache-'));
  const source = path.join(root,'source');
  const restored = path.join(root,'restored');
  try {
    await fs.promises.mkdir(path.join(source,'nested'),{recursive:true});
    await fs.promises.writeFile(path.join(source,'nested','token.json'),'super-secret-token');
    const store = new AuthCacheStore({pool,secret:'test-encryption-key'});
    await store.persist('00000000-0000-4000-8000-000000000001',source);
    assert(saved?.ciphertext);
    assert.equal(saved.ciphertext.includes(Buffer.from('super-secret-token')),false,'database payload is encrypted');
    await store.hydrate('00000000-0000-4000-8000-000000000001',restored);
    assert.equal(await fs.promises.readFile(path.join(restored,'nested','token.json'),'utf8'),'super-secret-token');
    await store.remove('00000000-0000-4000-8000-000000000001');
    assert.equal(saved,null,'reauthorization removes the database backup');
  } finally {
    await fs.promises.rm(root,{recursive:true,force:true});
  }
  console.log('Auth-cache store tests passed.');
}

main().catch(error => { console.error(error); process.exitCode=1; });
