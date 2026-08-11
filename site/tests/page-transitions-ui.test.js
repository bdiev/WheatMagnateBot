'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const publicDirectory = path.resolve(__dirname, '..', 'public');
const indexSource = fs.readFileSync(path.join(publicDirectory, 'index.html'), 'utf8');
const requestHtmlSource = fs.readFileSync(path.join(publicDirectory, 'request.html'), 'utf8');
const stylesSource = fs.readFileSync(path.join(publicDirectory, 'styles.css'), 'utf8');
const transitionsSource = fs.readFileSync(path.join(publicDirectory, 'page-transitions.js'), 'utf8');
const serviceWorkerSource = fs.readFileSync(path.join(publicDirectory, 'sw.js'), 'utf8');

assert.match(indexSource, /page-transitions\.js\?v=1/, 'the dashboard must load shared page transitions');
assert.match(requestHtmlSource, /styles\.css\?v=173/, 'the request page must load the current shared transition styles');
assert.match(requestHtmlSource, /page-transitions\.js\?v=1/, 'the request page must load shared page transitions');
assert.match(requestHtmlSource, /id="loginPrompt"[^>]*hidden/, 'the request login state must not flash before the session loads');
assert.match(stylesSource, /@view-transition\s*\{\s*navigation:\s*auto;/, 'same-origin navigation must use native cross-document transitions when available');
assert.match(stylesSource, /::view-transition-old\(root\)[\s\S]*::view-transition-new\(root\)/, 'native navigation must animate both page snapshots');
assert.match(stylesSource, /page-fallback-transition-in/, 'browsers without native support must still animate page entry');
assert.match(transitionsSource, /page-transition-leaving[\s\S]*window\.location\.assign/, 'fallback navigation must animate before changing location');
assert.match(transitionsSource, /url\.pathname\.startsWith\('\/api\/'\)/, 'authentication and API links must not be delayed');
assert.match(transitionsSource, /sameDocument && url\.hash/, 'same-page anchor links must not trigger page transitions');
assert.match(transitionsSource, /prefers-reduced-motion: reduce/, 'page transitions must respect reduced-motion preferences');
assert.match(serviceWorkerSource, /'\/page-transitions\.js'/, 'the shared transition module must be available in the offline app shell');

console.log('Page transition UI tests passed.');
