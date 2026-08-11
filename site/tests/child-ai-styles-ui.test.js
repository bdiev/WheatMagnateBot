'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const publicDirectory = path.resolve(__dirname, '..', 'public');
const indexSource = fs.readFileSync(path.join(publicDirectory, 'index.html'), 'utf8');
const appSource = fs.readFileSync(path.join(publicDirectory, 'app.js'), 'utf8');
const stylesSource = fs.readFileSync(path.join(publicDirectory, 'styles.css'), 'utf8');

assert.match(indexSource, /id="childAiStyleSearch"[^>]*type="search"[^>]*aria-controls="childAiStyles"/, 'style profiles must be searchable by nickname');
assert.match(indexSource, /id="childAiStyles"[^>]*role="region"[^>]*tabindex="0"/, 'the scrollable style list must be keyboard accessible');
assert.match(indexSource, /id="childAiMemories"[^>]*child-ai-memory-list[^>]*role="region"[^>]*tabindex="0"/, 'long-term memory must use a keyboard-accessible scroll region');
assert.match(appSource, /function renderChildAiPlayerStyles\(\{ resetScroll = false \} = \{\}\)/, 'style profiles must have a dedicated compact renderer');
assert.match(appSource, /subjectName \|\| profile\.subjectId[\s\S]*toLocaleLowerCase\(\)\.includes\(query\)/, 'nickname search must match the displayed player name');
assert.match(appSource, /isMinecraftPlayer[\s\S]*playerIdentity\(displayName, 28, \{ loading: 'lazy' \}\)/, 'Minecraft style rows must link to the standard player profile without eagerly loading every avatar');
assert.match(appSource, /CHILD_AI_MOBILE_STYLE_BATCH = 40[\s\S]*visibleStyles = filteredStyles\.slice\(0, visibleLimit\)[\s\S]*data-child-style-load-more/, 'mobile style profiles must render in bounded batches');
assert.match(appSource, /function handleChildAiStyleSearch\(\)[\s\S]*requestAnimationFrame/, 'style search must coalesce mobile rendering into animation frames');
assert.match(stylesSource, /\.child-ai-style-list\s*\{[^}]*max-height:[^;]+;[^}]*overflow-y:\s*auto;/s, 'the style list must not grow to fill the entire page');
assert.match(stylesSource, /\.child-ai-memory-list\s*\{[^}]*max-height:\s*min\(460px, 55vh\);[^}]*overflow-y:\s*auto;[^}]*overscroll-behavior:\s*contain;/s, 'long-term memory must use the same bounded scrolling behavior as player styles');
assert.match(stylesSource, /\.child-ai-style-row\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\) auto;/s, 'desktop style rows must use a compact two-column layout');
assert.match(stylesSource, /@media \(max-width: 700px\)[\s\S]*\.child-ai-style-row\s*\{[^}]*content-visibility:\s*auto;/s, 'offscreen mobile style rows must defer rendering work');

console.log('Child AI style UI tests passed.');
