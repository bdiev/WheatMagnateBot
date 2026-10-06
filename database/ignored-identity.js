'use strict';

const { normalizeWhitelistUuid, whitelistMatchSql, isWhitelistedIdentity } = require('./whitelist-identity');

// Bound ignores follow UUIDs; names are retained for display and legacy entries.
module.exports = {
  normalizeIgnoredUuid: normalizeWhitelistUuid,
  ignoredIdentityMatchSql: whitelistMatchSql,
  isIgnoredIdentity: isWhitelistedIdentity
};
