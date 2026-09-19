'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const stylesSource = fs.readFileSync(path.resolve(__dirname, '..', 'public', 'styles.css'), 'utf8');

const valueFontRule = stylesSource.match(
  /#farmDetails > div > strong,[\s\S]*?#obsidianAnomalies \.analytics-alert\s*\{[^}]*font-family:\s*var\(--font-pixel\);[^}]*font-variant-numeric:\s*tabular-nums;/
)?.[0] || '';

for (const selector of [
  '#farmDetails > div > strong',
  '#obsidianEfficiency > div > strong',
  '#obsidianForecast > div > strong',
  '#obsidianComparisons > div > strong',
  '#obsidianSettingsSummary > div > strong',
  '#obsidianGoals .goal-target',
  '#obsidianAnalyticsSettings input[type="number"]',
  '#obsidianAnomalies .analytics-alert'
]) {
  assert.ok(valueFontRule.includes(selector), `${selector} must use the Minecraft analytics value font`);
}

console.log('Obsidian analytics value font UI tests passed.');
