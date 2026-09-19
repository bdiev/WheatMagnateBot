'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const appSource = fs.readFileSync(path.resolve(__dirname, '..', 'public', 'app.js'), 'utf8');

const zoomHandler = appSource.match(/function handleChartZoomClick\(event\) \{[\s\S]*?\n\}/)?.[0] || '';
const averageOnlineCase = appSource.match(/case 'averageOnlineChart': \{[\s\S]*?\n    \}/)?.[0] || '';

assert.match(
  zoomHandler,
  /drawChartById\(chartId\)[\s\S]*viewport\.scrollLeft\s*=[\s\S]*scheduleChartViewportRedraw\(viewport\)/,
  'zoom must resize the chart, restore the viewport center, and redraw for the final visible range'
);
assert.match(
  appSource,
  /safeCanvasWidth \* zoom \/ maxZoom[\s\S]*Math\.min\(canvasWidthLimit, requestedWidth\)/,
  'the safe canvas width cap must scale with zoom for long hourly histories'
);
assert.match(
  averageOnlineCase,
  /pointWidth: 44 \* zoom,[\s\S]*zoom,[\s\S]*maxZoom: CHART_ZOOM_MAX/,
  'the average-online chart must pass its zoom level to canvas sizing'
);

console.log('Average online chart zoom UI tests passed.');
