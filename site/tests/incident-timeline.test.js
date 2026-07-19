'use strict';

const assert = require('node:assert/strict');
const { newCorrelationId } = require('../operational-events');
const { assertTimelineAccess, normalizeTimelineFilters, queryTimeline } = require('../incident-timeline');

async function run() {
  const now = Date.parse('2026-07-19T12:00:00Z');
  const params = new URLSearchParams({ period: '6h', severity: 'critical', source: 'notifications', eventType: 'bot_kicked', player: 'Steve', correlationId: 'corr-1', limit: '999' });
  const filters = normalizeTimelineFilters(params, now);
  assert.equal(filters.from.toISOString(), '2026-07-19T06:00:00.000Z');
  assert.equal(filters.to.toISOString(), '2026-07-19T12:00:00.000Z');
  assert.equal(filters.limit, 250);
  assert.equal(filters.severity, 'critical');

  let captured;
  const pool = { query: async (sql, values) => { captured = { sql, values }; return { rows: [] }; } };
  await queryTimeline(pool, filters);
  assert.match(captured.sql, /severity=\$3/);
  assert.match(captured.sql, /source=\$4/);
  assert.match(captured.sql, /event_type=\$5/);
  assert.match(captured.sql, /correlation_id=\$6/);
  assert.ok(captured.values.includes('%steve%'), 'player filter must be parameterized');
  assert.equal(captured.values.at(-1), 250);

  assert.doesNotThrow(() => assertTimelineAccess({ role: 'admin' }));
  assert.throws(() => assertTimelineAccess({ role: 'user' }), error => error.statusCode === 403);
  assert.throws(() => assertTimelineAccess(null), error => error.statusCode === 403);

  const first = newCorrelationId();
  const second = newCorrelationId();
  assert.match(first, /^[0-9a-f-]{36}$/);
  assert.notEqual(first, second);
  console.log('Incident timeline tests passed.');
}

run().catch(err => { console.error(err); process.exitCode = 1; });
