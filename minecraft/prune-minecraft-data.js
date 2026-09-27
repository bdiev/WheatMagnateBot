'use strict';

/**
 * Remove Bedrock Edition data from minecraft-data after npm install.
 *
 * The bot only connects to Java Edition servers, yet minecraft-data ships
 * ~280 MB of Bedrock version folders. Every data file is loaded lazily through
 * getters, and only bedrock/common (the protocol version list read when the
 * package is required) is touched for a Java bot, so it is kept.
 *
 * Runs as the package `postinstall` script. It never fails the install: if the
 * layout is unexpected, it logs and leaves the files alone.
 */

const fs = require('node:fs');
const path = require('node:path');

const KEEP = new Set(['common']);

function prune() {
  let packageDir;
  try {
    packageDir = path.dirname(require.resolve('minecraft-data/package.json'));
  } catch {
    console.log('[prune-minecraft-data] minecraft-data is not installed; nothing to prune.');
    return;
  }

  const bedrockDir = path.join(packageDir, 'minecraft-data', 'data', 'bedrock');
  if (!fs.existsSync(path.join(bedrockDir, 'common'))) {
    console.log(`[prune-minecraft-data] Unexpected layout at ${bedrockDir}; skipped.`);
    return;
  }

  let removed = 0;
  for (const entry of fs.readdirSync(bedrockDir, { withFileTypes: true })) {
    if (!entry.isDirectory() || KEEP.has(entry.name)) continue;
    fs.rmSync(path.join(bedrockDir, entry.name), { recursive: true, force: true });
    removed++;
  }

  // Fail loudly in the build log if Java data no longer loads, instead of
  // discovering it when the bot connects.
  const minecraftData = require('minecraft-data');
  if (!minecraftData.versions?.pc?.length || !minecraftData('1.20.4')?.blocksByName?.obsidian) {
    throw new Error('Java Edition data failed to load after pruning Bedrock data.');
  }

  console.log(`[prune-minecraft-data] Removed ${removed} Bedrock version folder(s); Java data verified.`);
}

try {
  prune();
} catch (error) {
  console.error(`[prune-minecraft-data] ${error.message}`);
  process.exitCode = error.message.startsWith('Java Edition data') ? 1 : 0;
}
