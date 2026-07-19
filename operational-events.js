'use strict';

// Compatibility entry point for the bot and shared root modules. Keeping the
// implementation under site makes a Coolify subdirectory deployment complete.
module.exports = require('./site/operational-events');
