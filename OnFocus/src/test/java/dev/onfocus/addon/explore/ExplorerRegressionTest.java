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
        deferredCoverage();
        reachStability();
        patchyCoverage();
        narrowCorridors();
        routeEfficiency();
        progressEta();
        findNames();
        diagnosticsFiles();
        System.out.println("Explorer regressions passed (deferred coverage, reach stability, narrow corridors, route efficiency, ETA, waypoints and 240 patchy coverage scenarios).");
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

    private static void deferredCoverage() {
        Area area = new Area(-10, -10, 10, 10);
        DeferredChunks deferred = new DeferredChunks(area);
        AtomicInteger confirmed = new AtomicInteger();
        deferred.add(-2, -3, 0);
        deferred.add(-1, -3, 0);
        deferred.add(0, -3, 0);
        deferred.add(-2, -3, 99); // a repeat observation must not extend grace forever
        DeferredChunks.MapState map = (x, z) -> x == -2 ? DeferredChunks.State.BLANK
            : x == -1 ? DeferredChunks.State.MAPPED : DeferredChunks.State.UNKNOWN;
        require(deferred.reconcile(99, map, key -> confirmed.incrementAndGet()) == 0,
            "Map drawing grace must keep recently loaded chunks deferred");
        require(deferred.reconcile(100, map, key -> confirmed.incrementAndGet()) == 1,
            "Explicitly blank chunks must return to planning after grace");
        require(!deferred.test(-2, -3) && !deferred.test(-1, -3) && deferred.test(0, -3),
            "Reconciliation must distinguish blank, confirmed and unknown map state");
        require(confirmed.get() == 1, "Only actually mapped chunks may be confirmed");
        require(deferred.reconcile(599, map, key -> confirmed.incrementAndGet()) == 0,
            "Unknown map state needs a longer grace period");
        require(deferred.reconcile(600, map, key -> confirmed.incrementAndGet()) == 1,
            "Unknown map state must not suppress planning indefinitely");
        require(!deferred.test(0, -3) && confirmed.get() == 1,
            "Unknown expiry must never manufacture explored coverage");
        deferred.add(-2, -3, 700);
        require(deferred.test(-2, -3), "A later visit must get a fresh grace period");
        ChunkGrid planned = new ChunkGrid(area);
        planned.addAll(deferred.grid());
        require(planned.test(-2, -3), "Pending map drawing must remain in the planning grid");
        deferred.reconcile(800, map, key -> confirmed.incrementAndGet());
        planned.clear();
        planned.addAll(deferred.grid());
        require(!planned.test(-2, -3), "Released gaps must be visible to the next plan");
    }

    private static void reachStability() {
        ReachStability stability = new ReachStability();
        int reach = 3;
        for (int measured : new int[]{2, 3, 2, 3, 3, 2, 3, 3}) {
            reach = stability.update(reach, measured);
            require(reach == 2, "Alternating loaded widths must not repeatedly widen the route");
        }
        require(stability.update(reach, 3) == 3, "Three stable windows must allow wider coverage");
        require(stability.update(3, 1) == 1, "Narrower coverage must apply immediately");
        stability.update(1, 2);
        stability.update(1, 2);
        stability.reset();
        require(stability.update(1, 2) == 1, "A new run must discard old width evidence");
    }

    private static void waypointArrival() {
        double contourTolerance = WaypointFollower.contourArrivalDistance(32, 64, 11.95, 2);
        require(contourTolerance < 20 && contourTolerance > 16,
            "Contour arrivals must tighten while remaining reachable at the recorded flight speed");
        require(WaypointFollower.contourArrivalDistance(32, 0, 11.95, 2) == 8,
            "Slow flight should honor the measured swath limit");
        require(WaypointFollower.contourArrivalDistance(32, 64, 2, 2) > 90,
            "Slow steering must not make the player orbit an unreachable target");
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

    private static void narrowCorridors() {
        Area area = new Area(-20, -30, 30, 40);
        for (boolean alongZ : new boolean[]{true, false}) {
            for (int width = 1; width <= 5; width++) {
                final int stripWidth = width;
                CoveragePlanner.ChunkTest mapped = (x, z) -> {
                    int u = alongZ ? z : x, v = alongZ ? x : z;
                    return u < -10 || u > 20 || v < -4 || v >= -4 + stripWidth;
                };
                List<double[]> route = ContourPlanner.nextLoop(area, 2, 2, mapped,
                    alongZ ? -4 : -10, alongZ ? -10 : -4);
                require(!route.isEmpty(), "Narrow blank strips must be flown, including one-chunk strips");
                double centre = -4 + (width - 1) / 2.0;
                for (double[] point : route) {
                    require(Math.abs((alongZ ? point[0] : point[1]) - centre) < 1e-9,
                        "Odd and even width corridors must use their true centre line");
                }
                assertCorridorCovered(area, mapped, route, 2);

                // Starting inside a strip must retain both ends after route simplification.
                route = ContourPlanner.nextLoop(area, 2, 2, mapped,
                    alongZ ? centre : 5, alongZ ? 5 : centre);
                for (double[] point : route) require(Math.abs((alongZ ? point[0] : point[1]) - centre) < 1e-9,
                    "Efficient entry selection must preserve corridor centering when starting inside");
                assertCorridorCovered(area, mapped, route, 2);
            }
        }

        // A bending strip with a one-chunk section, widening to five chunks.
        CoveragePlanner.ChunkTest bent = (x, z) -> {
            if (z < -10 || z > 20) return true;
            int lo = -4 + Math.max(0, (z + 4) / 3);
            int width = z < 0 ? 1 : z < 10 ? 3 : 5;
            return x < lo || x >= lo + width;
        };
        List<double[]> bentRoute = ContourPlanner.nextLoop(area, 2, 2, bent, -4, -10);
        assertCorridorCovered(area, bent, bentRoute, 2);
        for (double[] point : bentRoute) {
            require(!bent.test((int) Math.round(point[0]), (int) Math.round(point[1])),
                "Bending centre line must stay in blank ground");
        }

        // A wide area must keep a contour, rather than acquiring an arbitrary central strip.
        require(NarrowCorridorPlanner.nearest(area, 2, (x, z) -> false, 0, 0).isEmpty(),
            "Wide blank areas must not be classified as narrow corridors");
        require(!ContourPlanner.nextLoop(area, 2, 2, (x, z) -> false, 0, 0).isEmpty(),
            "Wide areas must retain their contour route");

        // A mapped island divides two parallel corridors: their paths must never be joined.
        CoveragePlanner.ChunkTest separated = (x, z) -> z < -10 || z > 20
            || !(x >= -8 && x <= -6 || x >= 4 && x <= 6);
        List<double[]> separatedRoute = ContourPlanner.nextLoop(area, 2, 2, separated, -7, -10);
        for (double[] point : separatedRoute) require(Math.abs(point[0] + 7) < 1e-9,
            "Mapped islands must keep adjacent corridor centre lines separate");
    }

    private static void assertCorridorCovered(Area area, CoveragePlanner.ChunkTest mapped,
                                              List<double[]> route, int reach) {
        require(!route.isEmpty(), "Corridor route is empty");
        ChunkGrid covered = new ChunkGrid(area);
        for (int i = 0; i < route.size(); i++) {
            double[] a = route.get(i), b = route.get(Math.min(i + 1, route.size() - 1));
            int steps = Math.max(1, (int) Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) * 8));
            for (int j = 0; j <= steps; j++) {
                double t = j / (double) steps;
                double x = a[0] + (b[0] - a[0]) * t, z = a[1] + (b[1] - a[1]) * t;
                // Block coordinates are chunk * 16 + 8: floor(chunk + .5) is the occupied chunk.
                int cx = (int) Math.floor(x + 0.5), cz = (int) Math.floor(z + 0.5);
                require(!mapped.test(cx, cz), "Corridor segment cuts across mapped ground");
                covered.addRect(cx - reach, cz - reach, cx + reach, cz + reach);
            }
        }
        for (int z = area.minCZ(); z <= area.maxCZ(); z++) {
            for (int x = area.minCX(); x <= area.maxCX(); x++) {
                if (!mapped.test(x, z)) require(covered.test(x, z), "Centred corridor leaves an uncovered edge");
            }
        }
    }

    private static void routeEfficiency() {
        Area area = new Area(-20, -20, 20, 20);
        require(!CoveragePlanner.hasOpenAlong(area, 3, (x, z) -> true, -15, -15, 15, 15),
            "Fully covered contour legs should be skipped");
        require(CoveragePlanner.hasOpenAlong(area, 3, (x, z) -> x != 10 || z != 13, -15, -15, 15, 15),
            "A gap at the swath edge must retain a contour leg");
        require(CoveragePlanner.hasOpenAlong(area, 0, (x, z) -> x != 0 || z != 1, -5, -5, 5, 5),
            "Diagonal corner gaps must not be skipped");
        require(CoveragePlanner.hasOpenAlong(area, 2, (x, z) -> x != -4 || z != -6, -4, -4, -4, -4),
            "Zero-length legs must still check their target footprint");

        for (int reach = 1; reach <= 8; reach++) {
            for (double arrival : new double[]{4, 8, 16, 16.01, 24, 32}) {
                int radius = CoveragePlanner.cleanupRadius(reach, arrival);
                if (arrival > reach * 16) continue; // no positive guaranteed footprint at this tolerance
                for (int degrees = 0; degrees < 360; degrees++) {
                    double angle = Math.toRadians(degrees);
                    int px = (int) Math.floor(arrival / 16 * Math.cos(angle) + 0.5);
                    int pz = (int) Math.floor(arrival / 16 * Math.sin(angle) + 0.5);
                    require(Math.abs(px) + radius <= reach && Math.abs(pz) + radius <= reach,
                        "Larger cleanup groups must remain inside the loaded swath at any arrival angle");
                }
            }
        }
        Area holes = new Area(-15, -15, 15, 15);
        List<Segment> individual = CoveragePlanner.cleanup(holes, 0, (x, z) -> false, -15, -15);
        List<Segment> grouped = CoveragePlanner.cleanup(holes, CoveragePlanner.cleanupRadius(2, 16),
            (x, z) -> false, -15, -15);
        require(grouped.size() < individual.size() / 4, "Cleanup grouping must substantially reduce waypoint count");
        assertCovered(holes, new ChunkGrid(holes), grouped, 1);
        require(CoveragePlanner.routeLength(grouped, -15, -15)
            < CoveragePlanner.routeLength(individual, -15, -15), "Grouped cleanup must shorten travel distance");

        Area winding = new Area(-20, -2, 20, 62);
        CoveragePlanner.ChunkTest mapped = (x, z) -> z < 0 || z > 60 || Math.abs(x - zigzagCentre(z)) > 1;
        double fromX = zigzagCentre(30), fromZ = 30;
        List<double[]> route = NarrowCorridorPlanner.nearest(winding, 2, mapped, fromX, fromZ);
        require(!route.isEmpty() && (route.getFirst()[1] == 0 || route.getFirst()[1] == 60),
            "Winding corridors should enter at the cheaper endpoint to avoid flying a section twice");
        double distance = Math.hypot(route.getFirst()[0] - fromX, route.getFirst()[1] - fromZ);
        for (int i = 1; i < route.size(); i++) distance += Math.hypot(route.get(i)[0] - route.get(i - 1)[0],
            route.get(i)[1] - route.get(i - 1)[1]);
        double oldDistance = 90 * Math.sqrt(2); // centre entry: 30 slices to an end, then all 60
        require(distance < oldDistance - 5, "Endpoint selection must reduce total travel, including approach");
        assertCorridorCovered(winding, mapped, route, 2);
    }

    private static int zigzagCentre(int z) {
        return Math.abs(z % 24 - 12) - 6;
    }

    private static void progressEta() {
        ProgressEta eta = new ProgressEta();
        long second = 1_000_000_000L;
        for (int t = 0; t < 30; t++) eta.observe(t * second, t * 20, true, 1);
        require(eta.secondsLeft(1200) == -1, "ETA needs thirty active seconds before trusting coverage rate");
        eta.observe(30 * second, 600, true, 1);
        require(eta.secondsLeft(1200) == 60, "ETA must use confirmed chunks per second");
        require(eta.secondsLeft(600) == 30, "ETA must fall as missing coverage falls without a replan");
        require(eta.secondsLeft(0) == 0, "A completed area has no remaining time");

        // Pauses and map imports may change coverage massively; neither belongs in flight throughput.
        eta.observe(31 * second, 600, false, 1);
        eta.observe(1000 * second, 100600, false, 1);
        eta.observe(1001 * second, 100600, true, 1);
        eta.observe(1002 * second, 100620, true, 1);
        require(eta.secondsLeft(1200) == 60, "Paused time and imported map chunks must not distort ETA");

        eta.observe(1003 * second, 100620, true, 2);
        require(eta.secondsLeft(1200) == -1, "Cleanup must learn its own rate instead of using sweep throughput");
        for (int t = 1; t <= 30; t++) eta.observe((1003L + t) * second, 100620 + t * 5, true, 2);
        require(eta.secondsLeft(1200) == 240, "Slower cleanup coverage must extend its estimate");

        eta.reset();
        eta.observe(0, 0, true, 1);
        eta.observe(60 * second, 600, true, 1);
        require(eta.secondsLeft(600) == 60, "Wall-clock stalls must count toward real active elapsed time");
        for (int t = 61; t <= 300; t++) eta.observe(t * second, 600, true, 1);
        require(eta.secondsLeft(600) == -1 && eta.chunksPerSecond() == 0,
            "Old progress must expire and a stalled flight must not retain a confident ETA");

        eta.reset();
        eta.observe(0, 0, true, 1);
        for (int t = 1; t <= 180; t++) eta.observe(t * second, t * 20, true, 1);
        for (int t = 181; t <= 360; t++) eta.observe(t * second, 3600 + (t - 180) * 10, true, 1);
        require(eta.secondsLeft(600) == 60, "Recent speed must replace older throughput after the rolling window");
    }

    private static void findNames() {
        for (String badge : new String[]{"\uEFF4\uEFF4", new String(Character.toChars(0xF0001)),
            new String(Character.toChars(0x100001))}) {
            require(FindNames.clean("Golden Apple (" + badge + ")").equals("Golden Apple"),
                "Resource-pack badges and their empty brackets must disappear");
        }
        require(FindNames.clean("\u00a76Golden Apple \u00a7f[\uEFF4]").equals("Golden Apple"),
            "Colour codes and private-use glyphs must be removed together");
        require(FindNames.clean("Golden Apple (rare)").equals("Golden Apple (rare)"),
            "Readable name suffixes must remain");
        var find = new FindsArchive.Find(FindsArchive.Kind.ITEM, 1, 64, 2, java.time.LocalDateTime.now(),
            "Golden Apple (\uEFF4)", 1, "Custom label", "Details");
        require(find.name().equals("Golden Apple") && find.label().equals("Custom label")
            && find.details().equals("Details"), "Imported archive names must be cleaned without changing other fields");
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
