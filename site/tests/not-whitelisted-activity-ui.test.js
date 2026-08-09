'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const siteDirectory = path.resolve(__dirname, '..');
const publicDirectory = path.join(siteDirectory, 'public');
const serverSource = fs.readFileSync(path.join(siteDirectory, 'server.js'), 'utf8');
const indexSource = fs.readFileSync(path.join(publicDirectory, 'index.html'), 'utf8');
const appSource = fs.readFileSync(path.join(publicDirectory, 'app.js'), 'utf8');
const activityQuery = serverSource.match(/WITH recorded_events AS \([\s\S]*?ORDER BY bucket/)?.[0] || '';

assert.doesNotMatch(
  activityQuery,
  /date_trunc\('hour', NOW\(\) - INTERVAL '167 hours'\)/,
  'not-whitelisted activity must not be limited to the latest seven days'
);
assert.match(
  activityQuery,
  /FROM operational_events e[\s\S]*FROM operational_events_archive e[\s\S]*historical_events/,
  'not-whitelisted activity must include both active and archived player events'
);
assert.match(
  activityQuery,
  /SELECT pa\.last_seen, LOWER\(pa\.username\)[\s\S]*NOT EXISTS \([\s\S]*FROM recorded_events/,
  'players recorded before event history was introduced must remain visible'
);
assert.match(
  indexSource,
  /Full recorded history; current hour shows players online now\./,
  'the chart description must state its full-history scope'
);
assert.match(
  appSource,
  /aggregateSeries\(state\.charts\.unwhitelistedHourly, range\)/,
  'all chart modes must aggregate the complete server series'
);

console.log('Not-whitelisted activity UI tests passed.');
