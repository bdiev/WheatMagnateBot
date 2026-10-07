package dev.onfocus.addon.explore;

import dev.onfocus.addon.explore.CoveragePlanner.Area;
import dev.onfocus.addon.explore.CoveragePlanner.Segment;
import dev.onfocus.addon.explore.WaypointFollower.Point;

import java.util.List;
import java.util.Random;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Comparator;
import java.util.concurrent.atomic.AtomicInteger;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

/** Dependency-free behavioral regressions, run by Gradle check. */
public final class ExplorerRegressionTest {
    public static void main(String[] args) throws Exception {
        waypointArrival();
        coverageGrid();
        patchyCoverage();
        diagnosticsFiles();
        System.out.println("Explorer regressions passed (waypoints and 240 patchy coverage scenarios).");
    }

    private static void diagnosticsFiles() throws Exception {
        Path dir = Files.createTempDirectory("explorer-diagnostics-test-");
        AtomicInteger failures = new AtomicInteger();
        try {
            Path file = dir.resolve("trace.jsonl");
            try (ExplorerDiagnostics trace = new ExplorerDiagnostics(file, 1024, ignored -> failures.incrementAndGet())) {
                JsonObject oversized = new JsonObject();
                oversized.addProperty("message", "x".repeat(2048));
                trace.log(oversized);
                for (int i = 0; i < 80; i++) {
                    JsonObject event = new JsonObject();
                    event.addProperty("event", "test");
                    event.addProperty("sequence", i);
                    event.addProperty("message", "line one\nline two");
                    trace.log(event);
                    event.addProperty("sequence", -1); // queued data must be an immutable snapshot
                }
            }
            require(failures.get() == 0, "Diagnostics unexpectedly failed to write");
            try (var files = Files.list(dir)) {
                List<Path> logs = files.toList();
                require(logs.size() == 4, "Diagnostics must retain only current file and three rotations");
                for (Path log : logs) {
                    require(Files.size(log) <= 1024, "Rotated file exceeded its size limit");
                    for (String line : Files.readAllLines(log)) {
                        JsonObject event = JsonParser.parseString(line).getAsJsonObject();
                        require(event.has("time"), "Diagnostic line lacks a timestamp");
                        if (event.has("sequence")) require(event.get("sequence").getAsInt() >= 0, "Queued event was mutated");
                    }
                }
            }
            List<String> newest = Files.readAllLines(file);
            require(JsonParser.parseString(newest.getLast()).getAsJsonObject().get("sequence").getAsInt() == 79,
                "Rotation lost the newest event");

            Path blocked = dir.resolve("blocked");
            Files.writeString(blocked, "file, not directory");
            try (ExplorerDiagnostics trace = new ExplorerDiagnostics(blocked.resolve("trace.jsonl"), 1024,
                ignored -> failures.incrementAndGet())) {
                trace.log(new JsonObject());
                trace.log(new JsonObject());
            }
            require(failures.get() == 1, "Write failures must be reported once without crashing the producer");

            Path lossFile = dir.resolve("loss.jsonl");
            try (ExplorerDiagnostics trace = new ExplorerDiagnostics(lossFile, 1024, ignored -> failures.incrementAndGet())) {
                JsonObject oversized = new JsonObject();
                oversized.addProperty("message", "x".repeat(2048));
                trace.log(oversized);
                trace.log(new JsonObject());
            }
            JsonObject loss = JsonParser.parseString(Files.readAllLines(lossFile).getFirst()).getAsJsonObject();
            require(loss.get("event").getAsString().equals("diagnostics-dropped") && loss.get("count").getAsInt() == 1,
                "Oversized records must leave an explicit data loss notice");
        } finally {
            try (var paths = Files.walk(dir)) {
                for (Path path : paths.sorted(Comparator.reverseOrder()).toList()) Files.delete(path);
            }
        }
    }

    private static void coverageGrid() {
        Area area = new Area(-20, -10, 30, 40);
        ChunkGrid mapped = new ChunkGrid(area), flown = new ChunkGrid(area);
        mapped.add(-20, -10);
        flown.add(30, 40);
        ChunkGrid planned = mapped.copy();
        planned.addAll(flown);
        require(planned.test(-20, -10) && planned.test(30, 40), "Merged plan lost covered chunks");
        require(!mapped.test(30, 40) && !flown.test(-20, -10), "Planning mutated its source grids");
        planned.clear();
        require(mapped.test(-20, -10) && flown.test(30, 40), "Clearing a snapshot mutated its sources");
        require(!mapped.test(-21, -10), "Chunks outside the selected area must stay uncovered");
        ChunkGrid gaps = new ChunkGrid(new Area(-2, -3, 2, 3));
        gaps.addRect(-2, -3, 2, 3);
        require(gaps.uncoveredSamples(10).isEmpty(), "A full grid must have no gap samples");
        gaps.clear();
        gaps.add(-2, -3);
        List<int[]> samples = gaps.uncoveredSamples(2);
        require(samples.size() == 2 && samples.getFirst()[0] == -2 && samples.getFirst()[1] == -2,
            "Gap samples must honor the limit and decode negative coordinates correctly");
    }

    private static void waypointArrival() {
        WaypointFollower follower = new WaypointFollower();
        Point target = new Point(100, 0, false);
        follower.setRoute(List.of(target), 0, 0);
        require(follower.update(110, 80, 16) == null, "Lateral overshoot skipped an unvisited point");
        require(!follower.isDone(), "Missed waypoint must remain in the route");
        require(follower.update(110, 8, 16) == target, "Overshoot along the flight corridor must advance");

        follower.setRoute(List.of(target), 100, 0);
        require(follower.update(200, 80, 16) == null, "Zero-length leg skipped a distant target");
        require(follower.update(105, 0, 16) == target, "Zero-length leg must accept a nearby target");

        follower.setRoute(List.of(new Point(-100, -100, true)), 0, 0);
        require(follower.update(-140, -60, 16) == null, "Diagonal lateral miss skipped a point");
        require(follower.update(-110, -110, 16) != null, "Diagonal overshoot must advance");

        follower.setRoute(List.of(new Point(0, 100, true)), 0, 0);
        require(follower.update(80, 110, 16) == null, "Z-axis lateral miss skipped a point");
        require(follower.update(0, 110, 16) != null, "Z-axis overshoot must advance");

        follower.setRoute(List.of(target, new Point(100, 100, true)), 0, 0);
        require(follower.update(90, 0, 16) == target, "Close approach must advance");
        require(Math.abs(follower.remainingDistance(90, 0) - Math.hypot(10, 100)) < 1e-6,
            "Advancing must preserve remaining route distance");
    }

    private static void patchyCoverage() {
        Random random = new Random(7281);
        for (int trial = 0; trial < 240; trial++) {
            int minX = random.nextInt(100) - 150, minZ = random.nextInt(100) - 150;
            Area area = new Area(minX, minZ, minX + random.nextInt(45) + 1, minZ + random.nextInt(45) + 1);
            ChunkGrid mapped = new ChunkGrid(area);
            for (int z = area.minCZ(); z <= area.maxCZ(); z++) {
                for (int x = area.minCX(); x <= area.maxCX(); x++) {
                    if (random.nextDouble() < 0.65) mapped.add(x, z);
                }
            }
            int reach = random.nextInt(9) + 1, overlap = random.nextInt(5);
            assertCovered(area, mapped, CoveragePlanner.sweep(area, reach, overlap, mapped, minX + 15, minZ + 15), reach);
            int cleanupRadius = random.nextInt(5);
            assertCovered(area, mapped, CoveragePlanner.cleanup(area, cleanupRadius, mapped, minX, minZ), cleanupRadius);
        }
    }

    private static void assertCovered(Area area, ChunkGrid mapped, List<Segment> route, int reach) {
        ChunkGrid covered = mapped.copy();
        for (Segment leg : route) {
            covered.addRect(Math.min(leg.x1(), leg.x2()) - reach, Math.min(leg.z1(), leg.z2()) - reach,
                Math.max(leg.x1(), leg.x2()) + reach, Math.max(leg.z1(), leg.z2()) + reach);
        }
        for (int z = area.minCZ(); z <= area.maxCZ(); z++) {
            for (int x = area.minCX(); x <= area.maxCX(); x++) {
                require(covered.test(x, z), "Route leaves a gap at " + x + ", " + z + " with reach " + reach);
            }
        }
    }

    private static void require(boolean condition, String message) {
        if (!condition) throw new AssertionError(message);
    }
}
