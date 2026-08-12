'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const publicDirectory = path.resolve(__dirname, '..', 'public');
const indexSource = fs.readFileSync(path.join(publicDirectory, 'index.html'), 'utf8');
const requestHtmlSource = fs.readFileSync(path.join(publicDirectory, 'request.html'), 'utf8');
const appSource = fs.readFileSync(path.join(publicDirectory, 'app.js'), 'utf8');
const stylesSource = fs.readFileSync(path.join(publicDirectory, 'styles.css'), 'utf8');
const transitionsSource = fs.readFileSync(path.join(publicDirectory, 'page-transitions.js'), 'utf8');
const serviceWorkerSource = fs.readFileSync(path.join(publicDirectory, 'sw.js'), 'utf8');

assert.match(indexSource, /page-transitions\.js\?v=1/, 'the dashboard must load shared page transitions');
assert.match(requestHtmlSource, /styles\.css\?v=196/, 'the request page must load the current shared transition styles');
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
assert.match(indexSource, /class="dashboard-brand"/, 'the dashboard identity must expose a stable animation target');
assert.match(appSource, /function scheduleDashboardBrandVisibility\(\)[\s\S]*requestAnimationFrame\(updateDashboardBrandVisibility\)/, 'dashboard identity scroll work must be coalesced into animation frames');
assert.match(appSource, /delta > 2[\s\S]*classList\.add\('dashboard-brand-hidden'\)[\s\S]*delta < -2[\s\S]*classList\.remove\('dashboard-brand-hidden'\)/, 'dashboard identity must hide while scrolling down and return while approaching the top');
assert.match(appSource, /addEventListener\('scroll', scheduleDashboardBrandVisibility, \{ passive: true \}\)/, 'dashboard identity scrolling must use a passive listener');
assert.match(stylesSource, /\.dashboard-brand\.dashboard-brand-hidden[\s\S]*filter: blur\(5px\)[\s\S]*translate3d/, 'dashboard identity must use the fade, blur and movement transition');
assert.match(stylesSource, /\.topbar\s*\{[\s\S]*position: sticky;[\s\S]*top: env\(safe-area-inset-top, 0px\)/, 'the combined dashboard header must remain pinned to the viewport');
assert.match(stylesSource, /\.topbar\.topbar-compact[\s\S]*gap: 0/, 'the pinned control row must close the title gap after the identity leaves');
assert.match(appSource, /topbar-stuck[\s\S]*scrollY > 96[\s\S]*topbar-compact/, 'the title must stay pinned briefly before collapsing into the control row');

console.log('Page transition UI tests passed.');
