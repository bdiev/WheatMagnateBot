'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const siteDirectory = path.resolve(__dirname, '..');
const publicDirectory = path.join(siteDirectory, 'public');
const serverSource = fs.readFileSync(path.join(siteDirectory, 'server.js'), 'utf8');
const indexSource = fs.readFileSync(path.join(publicDirectory, 'index.html'), 'utf8');
const appSource = fs.readFileSync(path.join(publicDirectory, 'app.js'), 'utf8');
const activityQuery = serverSource.match(/WITH ordered_events AS \([\s\S]*?ORDER BY bucket/)?.[0] || '';

assert.doesNotMatch(
  activityQuery,
  /FROM whitelist/,
  'average server online must include both whitelisted and non-whitelisted players'
);
assert.match(
  activityQuery,
  /FROM player_session_events[\s\S]*event_type = 'player_joined'/,
  'average server online must use the dedicated player session history'
);
assert.match(
  activityQuery,
  /COALESCE\(bucket_totals\.online_seconds, 0\)[\s\S]*NULLIF\(EXTRACT\(EPOCH/,
  'hourly values must average concurrent online time over each bucket'
);
assert.match(
  activityQuery,
  /generate_series\([\s\S]*first_occurred_at[\s\S]*LEFT JOIN bucket_totals/,
  'hours with no online players must remain in the series as zeroes'
);
assert.match(
  indexSource,
  /<h2>Average Server Online<\/h2>[\s\S]*Average online across all players\./,
  'the card must describe the combined average-online metric'
);
assert.match(
  appSource,
  /aggregateSeries\(state\.charts\.hourlyAverageOnline, range, 'avg'\)/,
  'daily and monthly chart modes must average the hourly server series'
);
assert.match(
  appSource,
  /group\.weightedValues\.reduce\([\s\S]*item\.value \* item\.weight/,
  'partial current hours must be weighted by their recorded duration'
);
assert.match(
  appSource,
  /function drawChartAxisLabels[\s\S]*measureText\(label\)[\s\S]*candidate\.right \+ minimumGap > nextLabelLeft/,
  'chart date labels must be measured and de-duplicated before drawing on narrow viewports'
);

console.log('Average server online UI tests passed.');
