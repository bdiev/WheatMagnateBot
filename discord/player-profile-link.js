'use strict';

function playerProfileUrl(username, env = process.env) {
  const base = new URL(env.SITE_PUBLIC_URL || 'https://bdiev.org');
  if (!['http:', 'https:'].includes(base.protocol)) throw new Error('SITE_PUBLIC_URL must use HTTP or HTTPS.');
  return new URL(`/player/${encodeURIComponent(username)}`, base).href;
}

module.exports = { playerProfileUrl };
