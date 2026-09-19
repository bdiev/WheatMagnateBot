'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const appSource = fs.readFileSync(path.resolve(__dirname, '..', 'public', 'app.js'), 'utf8');
const stylesSource = fs.readFileSync(path.resolve(__dirname, '..', 'public', 'styles.css'), 'utf8');

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
assert.match(
  stylesSource,
  /\.chart-zoom-reset\s*\{[^}]*flex:\s*0 0 52px;[^}]*width:\s*52px;[^}]*min-width:\s*52px;[^}]*max-width:\s*52px;/s,
  'changing the zoom percentage must not resize or reflow the chart header'
);
assert.match(
  stylesSource,
  /\.chart-controls:not\(\.playtime-scope-controls\)[^}]*grid-template-columns:\s*repeat\(3, minmax\(0, 1fr\)\);[^}]*\}[\s\S]*?\.chart-zoom-controls \.chart-zoom-reset\s*\{[^}]*width:\s*100%;[^}]*min-width:\s*0;[^}]*max-width:\s*none;/,
  'mobile zoom controls must use three equally sized buttons'
);

console.log('Average online chart zoom UI tests passed.');
