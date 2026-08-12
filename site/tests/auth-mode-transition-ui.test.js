'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const publicDirectory = path.resolve(__dirname, '..', 'public');
const indexSource = fs.readFileSync(path.join(publicDirectory, 'index.html'), 'utf8');
const appSource = fs.readFileSync(path.join(publicDirectory, 'app.js'), 'utf8');
const stylesSource = fs.readFileSync(path.join(publicDirectory, 'styles.css'), 'utf8');

assert.match(indexSource, /id="appLoader"[^>]*role="status"/, 'a dedicated loader must cover the initial session check');
assert.match(indexSource, /id="authScreen"[^>]*hidden/, 'the login form must not flash before the session check finishes');
assert.match(indexSource, /class="shell app-locked"/, 'the dashboard must stay locked during the initial session check');
assert.match(appSource, /function dismissAppLoader\(\)[\s\S]*app-loader-leaving[\s\S]*loader\.hidden = true/, 'the initial loader must leave cleanly after session resolution');
assert.match(appSource, /function showAuthScreen[\s\S]*dismissAppLoader\(\)/, 'unauthenticated visitors must transition from the loader to login');
assert.match(appSource, /function hideAuthScreen[\s\S]*dismissAppLoader\(\)/, 'authenticated visitors must transition from the loader to the dashboard');
assert.match(stylesSource, /@keyframes app-loader-progress/, 'the initial session loader must include visible progress animation');
assert.match(appSource, /function transitionAuthMode\(mode\)/, 'auth mode changes must use one shared transition');
assert.match(appSource, /classList\.add\('auth-mode-exit'\)[\s\S]*setAuthMode\(form\.authModeTarget\)[\s\S]*classList\.add\('auth-mode-enter'\)/, 'the old mode must leave before the new mode enters');
assert.match(appSource, /authModeSwapTimer[\s\S]*140/, 'the content swap must happen at the exit animation midpoint');
assert.match(appSource, /authModeEnterTimer[\s\S]*380/, 'the enter animation must clean itself up after the staggered content');
assert.match(appSource, /setAttribute\('aria-busy', 'true'\)[\s\S]*removeAttribute\('aria-busy'\)/, 'the transition must expose its busy state accessibly');
assert.match(appSource, /prefers-reduced-motion: reduce[\s\S]*setAuthMode\(nextMode\)/, 'reduced motion must switch modes immediately');
assert.match(appSource, /#authModeToggle[^\n]*transitionAuthMode/, 'the Login/Register toggle must use the animated transition');
assert.match(stylesSource, /@keyframes auth-mode-exit/, 'Login/Register must have an exit animation');
assert.match(stylesSource, /@keyframes auth-mode-enter/, 'Login/Register must have an enter animation');
assert.match(stylesSource, /@keyframes auth-mode-content-enter/, 'the new form content must use a subtle staggered reveal');
assert.match(stylesSource, /@media \(prefers-reduced-motion: reduce\)[\s\S]*\.auth-card,[\s\S]*animation: none !important;/, 'auth animations must respect reduced-motion preferences');

console.log('Auth mode transition UI tests passed.');
