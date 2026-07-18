'use strict';

const target = process.argv[2];
if (!target) {
  console.error('Healthcheck URL is required.');
  process.exit(2);
}

const controller = new AbortController();
const timeout = setTimeout(() => controller.abort(), 3000);
fetch(target, { signal: controller.signal, cache: 'no-store' })
  .then(response => {
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
  })
  .then(() => process.exit(0))
  .catch(() => process.exit(1))
  .finally(() => clearTimeout(timeout));
