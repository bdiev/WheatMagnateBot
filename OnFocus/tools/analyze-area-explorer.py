"""Summarize Area Explorer JSONL diagnostics using only the Python standard library."""
import argparse
from collections import Counter
import json
from pathlib import Path
import statistics


def load_events(path):
    if path.is_dir():
        path = path / "area-explorer-diagnostics.jsonl"
    # Rotation 3 is oldest; current file is newest. Do not double-read supplied backups.
    files = [Path(str(path) + f".{i}") for i in (3, 2, 1)] + [path]
    events, bad_lines = [], 0
    for file in files:
        if not file.is_file():
            continue
        with file.open(encoding="utf-8") as stream:
            for line in stream:
                try:
                    event = json.loads(line)
                    if not isinstance(event, dict):
                        raise ValueError("expected object")
                    events.append(event)
                except ValueError:
                    bad_lines += 1
    return events, bad_lines


def summarize(events, run=None):
    runs = list(dict.fromkeys(e["run"] for e in events if "run" in e))
    if not runs:
        raise ValueError("No flight records found")
    run = run or runs[-1]
    selected = [e for e in events if e.get("run") == run]
    if not selected:
        raise ValueError(f"Run not found: {run}")
    counts = Counter(e.get("event", "unknown") for e in selected)
    snapshots = [e for e in selected if e.get("event") == "snapshot"]
    positions = [e for e in selected if e.get("event") == "flight-position"]
    widths = [e["measuredReach"] for e in selected if e.get("event") == "loaded-width"]
    routes = [e for e in selected if e.get("event") == "route"]
    reached = [e for e in selected if e.get("event") == "waypoint-reached"]
    first, last = selected[0], selected[-1]
    gaps = next((e.get("firstMissingChunks", []) for e in reversed(snapshots)
                 if e.get("wholeArea")), [])
    stalled = [e for e in selected if e.get("event") == "contour-stop"]
    timed_out = [e for e in selected if e.get("event") == "settle-map-read"
                 and "timed out" in e.get("reason", "")]
    drops = sum(e.get("count", 0) for e in events if e.get("event") == "diagnostics-dropped")
    print(f"Run: {run} ({len(runs)} retained runs)")
    print(f"Time: {first.get('time')} -> {last.get('time')}")
    print(f"Pattern: {first.get('pattern')}; last phase: {last.get('phase')}")
    latest_missing = next((e["missing"] for e in reversed(selected) if "missing" in e), "unknown")
    finish_reason = next((e.get("reason") for e in reversed(selected) if e.get("event") == "finish"), "not recorded")
    print(f"Latest recorded missing chunks: {latest_missing}; finish reason: {finish_reason}")
    print(f"Events: {dict(counts)}")
    print(f"Route plans: {len(routes)}; waypoint arrivals: {len(reached)}; "
          f"passed endpoint plane: {sum(e.get('reason') == 'passed-end-plane' for e in reached)}")
    if positions:
        print(f"Recorded speed (blocks/s): median={statistics.median(e.get('speed', 0) for e in positions):.1f}; "
              f"max={max(e.get('speed', 0) for e in positions):.1f}")
        # This is a diagnostic hint, not proof of a planner fault (e.g. loading or pauses).
        slow_progress = sum(b.get("explored") == a.get("explored")
                            and not b.get("paused") and not b.get("reconnecting")
                            and b.get("phase") == "SWEEP" for a, b in zip(positions, positions[1:]))
        print(f"Position intervals with no explored-count change during sweep: {slow_progress}")
    if widths:
        print(f"Measured loaded reach: min={min(widths)}; median={statistics.median(widths)}; max={max(widths)}")
    for key in ("deferredButBlank", "deferredMapUnknown", "loadedButBlank"):
        print(f"Max sampled {key}: {max((e.get(key, 0) for e in snapshots), default=0)}")
    print(f"Max snapshot cost: {max((e.get('sampleMillis', 0) for e in snapshots), default=0):.2f} ms")
    print(f"Contour stops: {[e.get('reason') for e in stalled]}; map-read timeouts: {len(timed_out)}")
    print(f"Dropped diagnostic records across retained files: {drops}")
    print(f"First exact missing chunk samples [cx, cz, mask]: {gaps[:20]}")
    print("Sampled blank/unknown counts describe snapshots, not the exact area total. "
          "Dropped records and rotations may leave an incomplete run.")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("path", type=Path, help="Log directory or current diagnostics .jsonl file")
    parser.add_argument("--run", help="Run UUID (default: latest retained run)")
    args = parser.parse_args()
    events, bad_lines = load_events(args.path)
    try:
        summarize(events, args.run)
    except ValueError as error:
        parser.error(str(error))
    if bad_lines:
        print(f"Skipped malformed/incomplete lines: {bad_lines}")


if __name__ == "__main__":
    main()
