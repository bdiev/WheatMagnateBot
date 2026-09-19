'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const stylesSource = fs.readFileSync(path.resolve(__dirname, '..', 'public', 'styles.css'), 'utf8');
const mobileStyles = stylesSource.match(/@media \(max-width: 760px\) \{[\s\S]*?\.collapsible-section > summary/)?.[0] || '';

assert.match(mobileStyles, /\.farm-details-panel \.detail-list\s*\{[^}]*grid-auto-rows:\s*auto;[^}]*gap:\s*8px;/s,
  'mobile farm details must use compact content-height rows');
assert.match(mobileStyles, /\.farm-details-panel \.detail-list div\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\);[^}]*min-height:\s*0;/s,
  'mobile farm detail labels and values must receive the full card width');
assert.match(mobileStyles, /\.farm-details-panel \.detail-list div > span,[\s\S]*\.farm-details-panel \.detail-list div > strong\s*\{/,
  'full-width mobile sizing must apply only to direct row content');
assert.doesNotMatch(mobileStyles, /\.farm-details-panel \.detail-list span,/,
  'mobile sizing must not stretch individual animated digit spans');
assert.match(mobileStyles, /\.farm-details-panel \.detail-list strong\.mc-number,[\s\S]*\.farm-details-panel \.mc-number-digits\s*\{[^}]*white-space:\s*nowrap;/s,
  'animated farm digits must stay on one horizontal line');
assert.match(mobileStyles, /overflow-wrap:\s*normal;[\s\S]*word-break:\s*normal;/,
  'long farm values must wrap at natural boundaries instead of one character per line');

console.log('Farm details mobile UI tests passed.');
