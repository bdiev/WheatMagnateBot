'use strict';

const fs = require('node:fs');
const { execFileSync } = require('node:child_process');

const tracked = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' })
  .split('\0')
  .filter(Boolean);

const signatures = [
  ['private key', /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/],
  ['AWS access key', /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/],
  ['GitHub token', /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{30,255}\b/],
  ['Slack token', /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/],
  ['Google API key', /\bAIza[0-9A-Za-z_-]{35}\b/],
  ['Discord bot token', /\b[A-Za-z0-9_-]{23,28}\.[A-Za-z0-9_-]{6}\.[A-Za-z0-9_-]{25,110}\b/]
];

const secretAssignment = /^[ \t]*(?:export[ \t]+)?(?:DISCORD_BOT_TOKEN|GEMINI_API_KEY|SITE_ADMIN_PASSWORD|SITE_ADMIN_CLI_PASSWORD|POSTGRES_PASSWORD|MINECRAFT_SESSION)[ \t]*=[ \t]*([^\r\n]*)[ \t]*$/gm;
const findings = [];

for (const file of tracked) {
  let buffer;
  try {
    buffer = fs.readFileSync(file);
  } catch {
    continue;
  }
  if (buffer.includes(0)) continue;
  const content = buffer.toString('utf8');

  for (const [name, pattern] of signatures) {
    if (pattern.test(content)) findings.push(`${file}: possible ${name}`);
  }

  for (const match of content.matchAll(secretAssignment)) {
    const value = match[1].trim().replace(/^['"]|['"]$/g, '');
    const isTemplate = value === '' || value.startsWith('${') || /^(?:example|change[-_]?me|placeholder|test|dummy)/i.test(value);
    if (!isTemplate && value.length >= 8) {
      const line = content.slice(0, match.index).split('\n').length;
      findings.push(`${file}:${line}: populated secret variable`);
    }
  }
}

if (findings.length > 0) {
  console.error('Potential secrets found (values are intentionally not printed):');
  for (const finding of findings) console.error(`- ${finding}`);
  process.exitCode = 1;
} else {
  console.log(`Secret scan passed for ${tracked.length} tracked files.`);
}
