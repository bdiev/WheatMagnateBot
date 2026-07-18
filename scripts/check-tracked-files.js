'use strict';

const { execFileSync } = require('node:child_process');

const tracked = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' })
  .split('\0')
  .filter(Boolean)
  .map(file => file.replaceAll('\\', '/'));

const forbidden = tracked.filter(file => {
  if (file.endsWith('/.env.example') || file === '.env.example') return false;
  return /(^|\/)\.env(?:\.|$)/.test(file) || /(^|\/)node_modules(?:\/|$)/.test(file);
});

if (forbidden.length > 0) {
  console.error('CI policy violation: environment or dependency files are tracked:');
  for (const file of forbidden) console.error(`- ${file}`);
  process.exitCode = 1;
} else {
  console.log('Tracked-file policy passed: no .env or node_modules content is tracked.');
}
