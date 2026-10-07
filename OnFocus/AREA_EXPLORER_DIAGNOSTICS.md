# Area Explorer diagnostics

`diagnostic-logging` is enabled by default. The trace is local to the Minecraft instance:

```text
<game directory>/onfocus/logs/area-explorer-diagnostics.jsonl
```

The current file and backups `.jsonl.1`, `.jsonl.2`, `.jsonl.3` retain up to 32 MiB total.
Keep all four files when investigating a run, plus `area-explorer.log` for existing warnings,
map-reader summaries and timing logs. Disabling the setting stops new trace records.
File writing uses a dedicated background worker with a bounded 256-record queue. If the
queue fills or a record exceeds 64 KiB, a subsequent write reports `diagnostics-dropped`.
A write failure is reported once in the regular module log.

Every record has a UTC timestamp, run UUID, monotonic sequence within the run, active tick,
phase, coverage counts, reach, spacing, cleanup state, position and current target when
available. A resumed session receives a new trace UUID when its flight state is initialized.
The header records server, dimension and relevant client/module settings. Coordinates and
server address are included intentionally for correlating a trace with a map screenshot.

## Events

- `flight-start`: settings and initial reach.
- `flight-position`: actual movement, speed, yaw and target every 20 client ticks.
- `route`: reason, point count, first 128 points and last point; coordinates are in blocks.
- `waypoint-reached`: reached point, distance, tolerance and proximity/endpoint-plane reason.
- `cleanup-skip`: target skipped because its footprint is already explored.
- `loaded-width`: sorted width samples, current two-sided width and selected reach.
- `mapped-width`, `reach-change`: Xaero width evidence and replanning trigger.
- `contour-stop`: no loop or no coverage progress.
- `settle-start`, `settle-target`, `settle-map-read`: map wait, target and completion/timeout.
- `state-change`, `deactivate`, `finish`: transitions and final reason.
- `snapshot`: local chunk state every 100 client ticks; sampled area every 600 ticks and
  at cleanup, settle, contour-stop, finish and deactivation boundaries.

Snapshots are sampled on the game thread, where chunk/map access is valid. `sampleMillis`
measures their cost. Local snapshots contain at most 41 by 41 chunks. Global snapshots
contain at most 64 by 64 sampled chunks; `stepX` and `stepZ` specify the stride. They also
include up to 128 exact unexplored chunk coordinates from the planner's explored grid,
so isolated holes between sample positions remain diagnosable. This list is bounded and
ordered by grid column, not a ranking of hole sizes.

`chunkRows` contains two hexadecimal digits per sampled chunk. Rows increase Z; columns
increase X from `minCX`, `minCZ`. The value is a bit mask:

| Bit | Meaning |
| --- | --- |
| 1 | Currently loaded by the client |
| 2 | Drawn in Xaero's in-memory map |
| 4 | Xaero map state unknown (e.g. region not resident) |
| 8 | Confirmed explored by the module |
| 16 | Loaded along the flight path and deferred during sweep planning |
| 32 | Inside the selected area |

Unknown map state is not evidence of a missing map tile. Deferred but blank chunks can
indicate ordinary map lag; persistence across successive snapshots is more informative.
`firstMissingChunks` entries are `[chunkX, chunkZ, mask]`. The exact total missing count
is the record's `missing`; sampled counters are not area-wide totals. Snapshot progress
and chunk-event counters are deltas since the preceding snapshot, including global ones.

## Analyze a captured run

```powershell
python OnFocus/tools/analyze-area-explorer.py "C:/path/to/.minecraft/onfocus/logs"
```

The analyzer reads backups in chronological order and summarizes the latest retained run.
Use `--run UUID` for an earlier run. Check the route points against position records to
find corner cutting, then compare loaded vs mapped vs deferred masks around a persistent
hole. Check width samples, map-read timeouts and the final reason before attributing a
gap to the planner. Rotation or dropped records can leave a partial trace.

Validation: `OnFocus/gradlew.bat -p OnFocus check build --offline` runs regression checks
including file rotation, JSONL validity, queue snapshot immutability, oversized-record
reporting and handling of unwritable paths.
