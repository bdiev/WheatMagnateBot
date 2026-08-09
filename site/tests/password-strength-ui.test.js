'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const publicDirectory = path.resolve(__dirname, '..', 'public');
const indexSource = fs.readFileSync(path.join(publicDirectory, 'index.html'), 'utf8');
const appSource = fs.readFileSync(path.join(publicDirectory, 'app.js'), 'utf8');
const stylesSource = fs.readFileSync(path.join(publicDirectory, 'styles.css'), 'utf8');

assert.match(indexSource, /id="authPasswordStrength"[^>]*data-password-strength[^>]*hidden/, 'registration must include a password-strength meter hidden during sign-in');
assert.match(indexSource, /id="accountNewPasswordStrength"[^>]*data-password-strength/, 'Change password must include a strength meter for the new password');
assert.match(indexSource, /class="password-strength-sparkles" aria-hidden="true"/, 'celebration decorations must stay out of the accessibility tree');
assert.match(indexSource, /role="progressbar"[^>]*aria-valuemin="0"[^>]*aria-valuemax="4"[^>]*aria-valuenow="0"/, 'password strength must expose accessible progress semantics');
assert.match(appSource, /function assessPasswordStrength\(value\)/, 'password strength must use one shared assessment function');
assert.match(appSource, /password\.length >= 18 && characterGroups >= 2/, 'long passphrases must be eligible for a strong rating');
assert.match(appSource, /#authPasswordStrength[^\n]*!\(isRegister \|\| isBootstrap\)/, 'the registration meter must stay hidden on sign-in');
assert.match(appSource, /#authPassword[^\n]*addEventListener\('input'[^\n]*updatePasswordStrength/, 'registration strength must update while typing');
assert.match(appSource, /#accountNewPassword[^\n]*addEventListener\('input'[^\n]*updatePasswordStrength/, 'new-password strength must update while typing');
assert.match(stylesSource, /\.password-strength\[data-score="4"\] \.password-strength-track span \{ width: 100%; background: #65a94a; \}/, 'Strong must fill the complete green bar');
assert.match(stylesSource, /\.account-password-strength \{ grid-column: 2 \/ 4;/, 'desktop Change password layout must place the meter below the new-password fields');
assert.match(appSource, /previousScore === strength\.score/, 'unchanged strength must not replay the animation on every keystroke');
assert.match(appSource, /strength\.score === 4[\s\S]*is-strong-celebration/, 'entering Strong must trigger the celebration class');
assert.match(appSource, /passwordStrengthCelebrationTimer[\s\S]*1250/, 'the Strong celebration must clean itself up');
assert.match(stylesSource, /@keyframes password-strong-party/, 'Strong must have an intentionally excessive celebration animation');
assert.match(stylesSource, /@keyframes password-strength-rainbow/, 'the completed bar must animate through celebration colors');
assert.match(stylesSource, /@keyframes password-star-one[\s\S]*@keyframes password-star-two/, 'Strong must launch decorative stars');
assert.match(stylesSource, /@media \(prefers-reduced-motion: reduce\)[\s\S]*animation: none !important;/, 'password animations must respect reduced-motion preferences');

console.log('Password strength UI tests passed.');
