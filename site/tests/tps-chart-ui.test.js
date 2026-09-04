'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const publicDirectory = path.resolve(__dirname, '..', 'public');
const appSource = fs.readFileSync(path.join(publicDirectory, 'app.js'), 'utf8');
const indexSource = fs.readFileSync(path.join(publicDirectory, 'index.html'), 'utf8');
const stylesSource = fs.readFileSync(path.join(publicDirectory, 'styles.css'), 'utf8');

assert.match(indexSource, /<h2>TPS History<\/h2>[\s\S]*id="tpsChartCoverage"/,
  'TPS card must explain that it is a history view and expose its coverage');
assert.match(indexSource, /data-chart-range="hours">Hourly<[\s\S]*data-chart-range="days">Daily<[\s\S]*data-chart-range="months">Monthly</,
  'TPS range controls must name their aggregation clearly');
assert.match(stylesSource, /\.server-tps-panel \.chart-scroll\s*\{[^}]*overflow-x:\s*hidden;/s,
  'TPS history must not hide most of the timeline behind horizontal scrolling');
assert.match(appSource, /options\.fitWidth[\s\S]*compactLineSeries\(sourceData, Math\.max\(80, Math\.floor\(chartWidth \/ 3\)\)\)/,
  'fit-width line charts must cap rendered points to the available pixels');
assert.match(appSource, /sampleCount: values\.length[\s\S]*Low \$\{formatTps\(item\.minValue\)\} · High \$\{formatTps\(item\.maxValue\)\}/,
  'grouped TPS points must retain their interval count and min/max detail');
assert.match(appSource, /updateTpsChartCoverage\(tpsHistory, range\)/,
  'the visible history coverage must follow the selected aggregation');

console.log('TPS chart UI tests passed.');
