# Map tile storage maintenance

Level-0 map tiles are lossless WebP. New uploads try bounded-effort lossless
compression (`quality: 100`, `effort: 4`) and keep the smaller of that and the
baseline encoder. In lossless mode, `quality` controls compression search.
Higher zoom levels retain their existing encoding and visual quality.
Pixel-identical uploads preserve the stored encoding and do not dirty the pyramid.

Existing level-0 tiles can be optimized online. First inspect a sample (dry run):

```sh
node optimize-map-tiles.js --limit 100 --delay-ms 500
```

Apply with a checkpoint outside the application container's ephemeral storage:

```sh
node optimize-map-tiles.js --apply --all --delay-ms 500 --state /maintenance/progress.json
```

Both commands use `DATABASE_URL`. Never put credentials on the command line.
Limit CPU externally when running this alongside production, for example Docker
`--cpus 0.5 --memory 512m`. SIGTERM/SIGINT stops between tiles. The same command
resumes from the checkpoint. Only one process runs per database (session advisory
lock). An interrupted tile may be retried; this does not lose map data.

Every replacement must be smaller and have exactly the same decoded RGBA pixels.
The UPDATE compares the original bytes to avoid overwriting a concurrent upload.
Coordinates, chunk masks, drawing timestamps and zoom levels are preserved.
Existing backups are not modified. Progress records scanned/replaced tiles and
the number of image bytes saved; those bytes are not a measurement of filesystem
space reclaimed. Errors stop the job rather than skipping unverified images.

Ordinary VACUUM lets PostgreSQL reuse space left by old values. Returning all
internal free space to the filesystem requires a separate maintenance operation
with a disk-space and locking plan; do not automatically run VACUUM FULL on a
nearly full volume. A completed checkpoint is retained for auditing; start another
pass with a new checkpoint filename if required.

Tests: `node tests/map-tile-compression.test.js` and
`node tests/xaero-region-map.test.js` (included in `npm test` from this directory).

## VPS run, 19 November 2026

The source changes are applied to the running web container. Include these
repository changes in the next normal deployment: replacing that container with
an older image would restore the old upload encoder.

The separate `map-tile-optimizer` container uses the existing web image, the
`coolify` network, at most 0.5 CPU and 512 MiB of RAM. Its scripts and checkpoint
live in `/data/coolify/map-tile-optimization/`. It resumes on process failures
(up to three Docker retries); it can also be started manually after a VPS reboot.
It does not depend on the current web container continuing to exist.

```sh
docker logs --tail 5 map-tile-optimizer
cat /data/coolify/map-tile-optimization/progress.json
docker stop -t 30 map-tile-optimizer
docker start map-tile-optimizer
```

A concurrent reindex followed by ordinary VACUUM reduced the table from
23,139,287,040 to 22,589,276,160 bytes (about 525 MiB) during this run.
Both indexes were verified valid and ready afterward. These measurements are
stored as `pre-reindex.json` and `post-reindex.json` alongside the checkpoint.
Subsequent live uploads and compression will change the table size.

The original application source is retained there as
`xaero-region-map.original.js`. Existing map backups were not altered.
