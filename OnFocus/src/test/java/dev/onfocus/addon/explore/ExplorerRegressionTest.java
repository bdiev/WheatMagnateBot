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
        sectorTraversal();
        sectorRouting();
        deferredCoverage();
        withheldChunks();
        reachStability();
        pendingReach();
        freshChunks();
        patchyCoverage();
        centeredSweep();
        nearbySweepEntry();
        coveredSweepEntry();
        narrowCorridors();
        routeEfficiency();
        largeCleanup();
        progressEta();
        sectorProgressEta();
        sectorReachAndEta();
        steadyEta();
        findNames();
        diagnosticsFiles();
        System.out.println("Explorer regressions passed (deferred coverage, reach stability, mid-strip widths, fresh chunks, narrow corridors, route efficiency, ETA, waypoints and 240 patchy coverage scenarios).");
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
        require(mapped.hasOpenRect(-20, -10, -19, -10), "An open rectangle edge must keep a task");
        require(!mapped.hasOpenRect(-21, -11, -20, -10), "Covered rectangles must clip to the selected area");
        require(!mapped.hasOpenRect(31, 41, 32, 42), "Rectangles outside the selected area contain no work");
        ChunkGrid gaps = new ChunkGrid(new Area(-2, -3, 2, 3));
        gaps.addRect(-2, -3, 2, 3);
        require(gaps.uncoveredSamples(10).isEmpty(), "A full grid must have no gap samples");
        gaps.clear();
        gaps.add(-2, -3);
        List<int[]> samples = gaps.uncoveredSamples(2);
        require(samples.size() == 2 && samples.getFirst()[0] == -2 && samples.getFirst()[1] == -2,
            "Gap samples must honor the limit and decode negative coordinates correctly");
    }

    private static void withheldChunks() {
        Area area = new Area(-10, -10, 10, 10);
        WithheldChunks withheld = new WithheldChunks(area);
        int step = 20;
        for (int t = step; t < WithheldChunks.GIVE_UP_TICKS; t += step) {
            require(!withheld.missed(-3, 4, step), "A chunk must get its full wait before being given up on");
        }
        require(withheld.missed(-3, 4, step) && withheld.test(-3, 4) && withheld.size() == 1,
            "A chunk the server keeps not sending must leave planning instead of drawing the sweep back forever");
        require(!withheld.missed(-3, 4, step) && withheld.size() == 1, "A given-up chunk must be counted once");
        ChunkGrid planned = new ChunkGrid(area);
        planned.addAll(withheld.grid());
        require(planned.test(-3, 4) && !planned.test(-2, 4), "Only the withheld chunk may be planned around");
        withheld.loaded(-3, 4);
        require(!withheld.test(-3, 4) && withheld.size() == 0, "A chunk sent after all must return to planning");
        withheld.missed(5, 5, WithheldChunks.GIVE_UP_TICKS - step);
        withheld.loaded(5, 5);
        require(!withheld.missed(5, 5, step), "Arriving must reset the wait");
        require(!withheld.missed(20, 20, WithheldChunks.GIVE_UP_TICKS), "Chunks outside the area are never tracked");
        for (int i = 1; i < WithheldChunks.GIVE_UP_STRIPS; i++) {
            require(!withheld.missedStrip(7, -7), "One strip ending without a chunk may be a lag");
        }
        require(withheld.missedStrip(7, -7) && withheld.test(7, -7),
            "Strips that keep ending without a chunk must stop the sweep planning them again and again");
        withheld.loaded(7, -7);
        require(!withheld.test(7, -7) && !withheld.missedStrip(7, -7), "A chunk that came must start its strikes over");
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

    private static void freshChunks() {
        FreshChunks fresh = new FreshChunks();
        long previousStrip = 7L, beside = 3L;
        fresh.arrived(previousStrip);
        for (int t = 0; t < 30 * 20; t++) fresh.tick(); // flying the next strip for half a minute
        fresh.arrived(beside);
        for (int t = 0; t < 20; t++) fresh.tick(); // sent a second before it's abeam
        require(fresh.isFresh(beside), "A chunk the server just sent must count across the strip");
        require(!fresh.isFresh(previousStrip), "A chunk kept from the strip before must not widen the swath");
        require(!fresh.isFresh(99L), "A chunk never seen arriving is not fresh");
        for (int t = 0; t < FreshChunks.FRESH_TICKS * 2; t++) fresh.tick();
        require(fresh.size() == 0, "Old arrivals must be dropped, not kept for the whole run");
    }

    private static void pendingReach() {
        // As traced: swath 3, a window just after the turn onto a strip read 1, then 2, then 3 again
        ReachStability stability = new ReachStability();
        PendingReach pending = new PendingReach();
        int reach = 3;
        int accepted = stability.update(pending.target(reach), 1);
        require(pending.offer(reach, 1, accepted) && pending.width() == 1, "A narrower width mid-strip must wait for the strip's end");
        accepted = stability.update(pending.target(reach), 2);
        require(!pending.offer(reach, 2, accepted) && pending.width() == 1, "A narrower width waiting must not widen on one window");
        accepted = stability.update(pending.target(reach), 3);
        pending.offer(reach, 3, accepted);
        require(pending.width() == 0 && pending.take(reach) == 3, "Back at the strip's width, what waited was a blip");

        // A real change still reaches the next strip
        stability.reset();
        for (int i = 0; i < 3; i++) pending.offer(reach, 6, stability.update(pending.target(reach), 6));
        require(pending.width() == 6, "Three stable wider windows must widen the next strip");
        require(!pending.offer(reach, 6, stability.update(pending.target(reach), 6)), "The same width waiting is not logged again");
        require(pending.take(reach) == 6 && pending.width() == 0, "The next strip takes the width that waited");
        require(pending.take(6) == 6, "Nothing waits after it's taken");
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

                // Starting inside a strip enters locally; subsequent plans cover the other half.
                route = ContourPlanner.nextLoop(area, 2, 2, mapped,
                    alongZ ? centre : 5, alongZ ? 5 : centre);
                require(Math.hypot(route.getFirst()[0] - (alongZ ? centre : 5),
                    route.getFirst()[1] - (alongZ ? 5 : centre)) < 1e-9,
                    "Starting inside a corridor must not send the player to a distant endpoint");
                for (double[] point : route) require(Math.abs((alongZ ? point[0] : point[1]) - centre) < 1e-9,
                    "Efficient entry selection must preserve corridor centering when starting inside");
                finishContourPlans(area, mapped, 2, alongZ ? centre : 5, alongZ ? 5 : centre);
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

        CoveragePlanner.ChunkTest smallGap = (x, z) -> !(x == 0 && z == 0)
            && !(x == 15 && z >= -10 && z <= 20);
        List<double[]> nearby = ContourPlanner.nextLoop(area, 2, 2, smallGap, 1, 0);
        require(nearby.size() == 1 && nearby.getFirst()[0] == 0 && nearby.getFirst()[1] == 0,
            "A nearby isolated gap must be visited before a distant corridor");
        nearby = ContourPlanner.nextLoop(area, 2, 2, (x, z) -> x != 0 || z != 0, 1, 0);
        require(nearby.size() == 1, "Contour must retain the last isolated gap for planning");
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
        require(!route.isEmpty() && route.getFirst()[0] == fromX && route.getFirst()[1] == fromZ,
            "Winding corridors must start at nearby work rather than a distant endpoint");
        for (int i = 1; i < route.size(); i++) require(route.get(i)[1] <= route.get(i - 1)[1],
            "A corridor plan must not reverse over its freshly covered half");
        double distance = finishContourPlans(winding, mapped, 2, fromX, fromZ);
        require(distance < 90 * Math.sqrt(2),
            "Replanning both halves must reduce travel compared with retracing the full corridor");
    }

    private static double finishContourPlans(Area area, CoveragePlanner.ChunkTest mapped, int reach,
                                             double x, double z) {
        ChunkGrid covered = new ChunkGrid(area);
        for (int cx = area.minCX(); cx <= area.maxCX(); cx++)
            for (int cz = area.minCZ(); cz <= area.maxCZ(); cz++)
                if (mapped.test(cx, cz)) covered.add(cx, cz);
        double distance = 0;
        for (int pass = 0; pass < 20 && ContourPlanner.openCells(area, covered) > 0; pass++) {
            List<double[]> route = ContourPlanner.nextLoop(area, reach, 2, covered, x, z);
            require(!route.isEmpty(), "Replanning lost an unvisited corridor half or small gap");
            for (double[] point : route) {
                double leg = Math.hypot(point[0] - x, point[1] - z);
                distance += leg;
                int steps = Math.max(1, (int) Math.ceil(leg * 8));
                for (int i = 0; i <= steps; i++) {
                    double t = i / (double) steps;
                    int cx = (int) Math.floor(x + (point[0] - x) * t + .5);
                    int cz = (int) Math.floor(z + (point[1] - z) * t + .5);
                    covered.addRect(cx - reach, cz - reach, cx + reach, cz + reach);
                }
                x = point[0];
                z = point[1];
            }
        }
        require(ContourPlanner.openCells(area, covered) == 0, "Repeated local plans must cover every gap");
        return distance;
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

    private static void sectorRouting() {
        Random random = new Random(1495358);
        for (int width : new int[]{1, 3, 5, 8, 10, 11, 19, 30, 31}) {
            for (int depth : new int[]{1, 4, 9, 10, 11, 19, 30}) {
                Area sector = new Area(-31, -17, -32 + width, -18 + depth);
                Area inner = SectorPlanner.flightArea(sector);
                ChunkGrid mapped = new ChunkGrid(sector);
                for (int x = sector.minCX(); x <= sector.maxCX(); x++) {
                    for (int z = sector.minCZ(); z <= sector.maxCZ(); z++) {
                        if (random.nextInt(4) == 0) mapped.add(x, z);
                    }
                }
                List<Segment> route = SectorPlanner.sweep(sector, mapped, sector.maxCX() + 8, sector.minCZ() - 8);
                for (Segment leg : route) {
                    require(inner.contains(leg.x1(), leg.z1()) && inner.contains(leg.x2(), leg.z2()),
                        "Sector sweep must stay inset from every edge, including clipped sectors");
                }
                assertCovered(sector, mapped, route, 2);
                List<Segment> cleanup = SectorPlanner.cleanup(sector, mapped, 0, 0);
                for (Segment spot : cleanup) {
                    require(inner.contains(spot.x1(), spot.z1()), "Cleanup must use the same inset flight area");
                }
                assertCovered(sector, mapped, cleanup, 2);
            }
        }
        for (int reach = 1; reach <= 7; reach++) {
            for (int width : new int[]{1, 6, 13, 30, 47}) {
                for (int depth : new int[]{2, 15, 30}) {
                    Area sector = new Area(100, -40, 99 + width, -41 + depth);
                    Area inner = SectorPlanner.flightArea(sector, reach);
                    ChunkGrid mapped = new ChunkGrid(sector);
                    for (int x = sector.minCX(); x <= sector.maxCX(); x++) {
                        for (int z = sector.minCZ(); z <= sector.maxCZ(); z++) if (random.nextInt(3) == 0) mapped.add(x, z);
                    }
                    for (Area next : new Area[]{null, new Area(sector.maxCX() + 1, sector.minCZ(), sector.maxCX() + 30, sector.maxCZ())}) {
                        List<Segment> route = SectorPlanner.sweep(sector, reach, mapped, sector.minCX() - 5, sector.maxCZ() + 3, next);
                        for (Segment leg : route) require(inner.contains(leg.x1(), leg.z1()) && inner.contains(leg.x2(), leg.z2()),
                            "Wider swaths must keep the route inset by their own reach");
                        assertCovered(sector, mapped, route, reach);
                        assertCovered(sector, mapped, SectorPlanner.cleanup(sector, reach, mapped, 0, 0, next), reach);
                    }
                }
            }
        }
        Area square = new Area(0, 0, 29, 29);
        ChunkGrid blank = new ChunkGrid(square);
        List<Segment> route = SectorPlanner.sweep(square, blank, -10, -10);
        require(route.getFirst().x1() == 2 && route.getFirst().z1() == 2, "Start at the nearest inset corner");
        assertCovered(square, blank, route, 2);
        require(CoveragePlanner.routeLength(route, 2, 2) <= 176,
            "An empty 30x30 sector must take the snake when it beats perimeter plus core: " + CoveragePlanner.routeLength(route, 2, 2));
        require(CoveragePlanner.routeLength(route, 2, 2)
            < CoveragePlanner.routeLength(CoveragePlanner.sweep(square, 2, 2, blank, 2, 2), 2, 2),
            "The sector route must improve on the old overlapped sector route");
        List<Segment> wide = SectorPlanner.sweep(square, 4, blank, -10, -10, null);
        assertCovered(square, blank, wide, 4);
        require(CoveragePlanner.routeLength(wide, 4, 4) < CoveragePlanner.routeLength(route, 2, 2) * 0.7,
            "A swath of four must need far fewer strips than the fallback of two");
        require(SectorPlanner.fittedSize(30, 2) == 30 && SectorPlanner.fittedSize(32, 2) == 30
            && SectorPlanner.fittedSize(33, 2) == 35 && SectorPlanner.fittedSize(30, 4) == 27 && SectorPlanner.fittedSize(5, 2) == 10,
            "Fitted sector sizes must be whole numbers of strips, at least eight chunks");
        require(SectorPlanner.sweep(square, (x, z) -> true, 0, 0).isEmpty(), "Completed sectors need no flight");
        for (Area next : List.of(new Area(30, 0, 59, 29), new Area(-30, 0, -1, 29),
            new Area(0, 30, 29, 59), new Area(0, -30, 29, -1))) {
            List<Segment> handoff = SectorPlanner.sweep(square, blank, 2, 14, next);
            Segment end = handoff.getLast();
            Segment expectedExit = SectorPlanner.exitPoint(square, next, end.x2(), end.z2());
            require(end.x2() == expectedExit.x1() && end.z2() == expectedExit.z1(),
                "Every route must finish at the inset side shared with its next neighbour");
            assertCovered(square, blank, handoff, 2);
            List<Segment> cleanupHandoff = SectorPlanner.cleanup(square, blank, 2, 14, next);
            assertCovered(square, blank, cleanupHandoff, 2);
        }
        Area east = new Area(30, 0, 59, 29);
        List<Segment> entry = SectorPlanner.sweep(east, new ChunkGrid(east), 27, 14);
        require(entry.getFirst().x1() == 32, "Enter the next sector on the side facing the player");
        require(CoveragePlanner.routeLength(entry, 27, 14) <= 185 + 13,
            "Entry may start at a strip end only while the whole route stays shorter: " + CoveragePlanner.routeLength(entry, 27, 14));

        require(SectorPlanner.boundMovement(99, 5, 0, 100) == 1, "Movement must stop at the positive boundary");
        require(SectorPlanner.boundMovement(1, -5, 0, 100) == -1, "Movement must stop at the negative boundary");
        require(SectorPlanner.boundMovement(-20, -5, 0, 100) == 0, "Approaching from outside must not move further away");
        require(SectorPlanner.boundMovement(-20, 5, 0, 100) == 5, "Entry must allow ordinary movement, without teleporting");
        require(SectorPlanner.boundMovement(120, -5, 0, 100) == -5, "Entry from the positive side must work");
        WaypointFollower follower = new WaypointFollower();
        follower.setRoute(List.of(new Point(40, 40, true)), 8, 40);
        require(follower.update(8, 40, SectorPlanner.ARRIVAL_BLOCKS) == null,
            "A two-chunk leg must not count as reached immediately from its start");
        require(follower.update(35, 40, SectorPlanner.ARRIVAL_BLOCKS) != null,
            "Tighter arrivals must still let the flight advance near the target");
    }

    private static void sectorProgressEta() {
        ProgressEta eta = new ProgressEta();
        long second = 1_000_000_000L;
        long covered = 0;
        eta.observe(0, covered, true, 1, true);
        // Four short sectors: 6 seconds of coverage followed by 6 of checks and 3 of cleanup.
        // No individual phase reaches the normal thirty-second learning threshold.
        for (int t = 1; t <= 60; t++) {
            int step = (t - 1) % 15;
            int phase = step < 6 ? 1 : step < 12 ? 2 : 3;
            if (step < 6) covered += 20;
            eta.observe(t * second, covered, true, phase, true);
        }
        require(covered == 480 && eta.secondsLeft(480) == 60,
            "Sector ETA must survive short phase changes and include checking time in throughput");
        eta.observe(61 * second, covered, false, 2, true);
        eta.observe(1000 * second, covered + 100000, false, 2, true);
        eta.observe(1001 * second, covered + 100000, true, 1, true);
        require(eta.secondsLeft(480) == 60, "Sector pauses and bulk imports must not alter the learned rate");
    }

    private static void sectorReachAndEta() {
        SectorReach reach = new SectorReach();
        reach.start(7, 0);
        require(reach.current() == 6, "Auto swath starts one chunk inside the expected width");
        require(reach.swept(true) && reach.current() == SectorReach.MIN, "Gaps after a sector's own route fall back to the minimum");
        require(!reach.swept(false) && !reach.swept(false) && reach.swept(false) && reach.current() == 3,
            "Three gap-free sectors widen the swath by one chunk");
        for (int i = 0; i < 30; i++) reach.swept(false);
        require(reach.current() == 5 && reach.ceiling() == 5, "Widening stops one chunk short of the width that left gaps");
        reach.start(1, 0);
        require(reach.current() == SectorReach.MIN, "The minimum holds even when the view distance looks tiny");
        reach.start(9, 3);
        require(reach.current() == 3 && !reach.swept(true) && reach.current() == 3, "A fixed swath is never changed");
        reach.restore(6, 4, 0);
        require(reach.current() == 4 && reach.ceiling() == 6, "A saved run keeps its learned swath");

        SectorEta eta = new SectorEta();
        eta.finished(100, 900);
        eta.finished(0, 0);
        eta.finished(40, 0);
        require(eta.secondsLeft(new long[]{900}) == -1, "No estimate before three worked sectors; crossings are not work");
        eta.finished(60, 500);
        eta.finished(140, 1300);
        // 10 s per sector plus 0.1 s per chunk
        require(Math.abs(eta.secondsLeft(new long[]{900, 0, 450}) - (100 + 55)) < 1e-6,
            "Remaining sectors are estimated from the fitted fixed and per-chunk parts");
        SectorEta flat = new SectorEta();
        for (int i = 0; i < 3; i++) flat.finished(90, 900);
        require(Math.abs(flat.secondsLeft(new long[]{300}) - 30) < 1e-6, "Equal sectors fall back to the plain per-chunk rate");
    }

    private static void steadyEta() {
        SteadyEta eta = new SteadyEta();
        long second = 1_000_000_000L;
        require(eta.secondsLeft() == -1, "No estimate before one is fed");
        eta.observe(0, 1200, true, 1);
        require(eta.secondsLeft() == 1200, "The first estimate shows as it is");
        for (int t = 1; t <= 60; t++) eta.observe(t * second, 1200 - t, true, 1);
        require(eta.secondsLeft() == 1140, "A steady estimate counts down by the second");

        // One noisy reading of 2 hours must not throw a 19-minute estimate to 2 hours.
        eta.observe(61 * second, 7200, true, 1);
        require(eta.secondsLeft() < 1300, "A single jump must barely move the shown time");
        for (int t = 62; t <= 120; t++) eta.observe(t * second, 1200 - t, true, 1);
        require(Math.abs(eta.secondsLeft() - 1080) < 60, "Back on track, the shown time returns to the estimate");

        // A real change is followed within a few settle times, not ignored.
        for (int t = 121; t <= 720; t++) eta.observe(t * second, 3600, true, 1);
        require(Math.abs(eta.secondsLeft() - 3600) < 300, "A lasting new estimate is reached over a few minutes");

        int before = eta.secondsLeft();
        eta.observe(721 * second, -1, false, 1);
        eta.observe(5000 * second, -1, false, 1);
        require(eta.secondsLeft() == before, "Paused time must not count down");
        eta.observe(5001 * second, -1, true, 1);
        eta.observe(5011 * second, -1, true, 1);
        require(eta.secondsLeft() == before - 10, "Without a fresh estimate the shown time keeps counting down");
        eta.observe(5012 * second, 0, true, 1);
        require(eta.secondsLeft() == 0, "A finished area shows no time left at once");
        eta.observe(5013 * second, 500, true, 2);
        require(eta.secondsLeft() == 500, "A new phase starts from its own estimate");
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

    private static void largeCleanup() {
        // Same scale as the reported freeze: exactly 67,047 uncovered chunks at radius zero.
        Area area = new Area(-1875, -1875, -1615, -1619);
        CoveragePlanner.ChunkTest explored = (x, z) -> x == area.minCX() && z < area.minCZ() + 30;
        long started = System.nanoTime();
        List<Segment> route = CoveragePlanner.cleanup(area, 0, explored, -1800, -1800);
        long millis = (System.nanoTime() - started) / 1_000_000;
        require(route.size() == 67047, "Large cleanup must retain every missing chunk");
        java.util.Set<Long> visited = new java.util.HashSet<>();
        for (Segment spot : route) {
            require(spot.isSpot() && area.contains(spot.x1(), spot.z1()) && !explored.test(spot.x1(), spot.z1()),
                "Large cleanup must contain only missing spots in the selected area");
            require(visited.add((spot.x1() & 0xffffffffL) | ((long) spot.z1() << 32)),
                "Large cleanup must not repeat spots");
        }
        require(millis < 5000, "Large cleanup regressed to the quadratic planner that froze the game");
        require(CoveragePlanner.routeLength(route, -1800, -1800) < 70000,
            "Large cleanup ordering must preserve short neighbouring-row transits");
        System.out.println("Large cleanup regression: 67,047 spots in " + millis + " ms.");
    }

    private static void coveredSweepEntry() {
        for (boolean alongX : new boolean[]{true, false}) {
            Area area = alongX ? new Area(-100, -30, 100, 30) : new Area(-30, -100, 30, 100);
            ChunkGrid covered = new ChunkGrid(area);
            // Two pockets share a strip but its middle is already done. Another real pocket
            // is closer than either end: entering the covered middle must not win selection.
            CoveragePlanner.ChunkTest done = (x, z) -> {
                int u = alongX ? x : z, v = alongX ? z : x;
                return !(Math.abs(u) == 10 && v == 0 || u == 0 && v == 4);
            };
            for (int x = area.minCX(); x <= area.maxCX(); x++)
                for (int z = area.minCZ(); z <= area.maxCZ(); z++)
                    if (done.test(x, z)) covered.add(x, z);
            List<Segment> route = CoveragePlanner.sweep(area, 3, 0, covered, 0, 0);
            Segment first = route.getFirst();
            require(CoveragePlanner.hasOpenAlong(area, 3, covered,
                    first.x1(), first.z1(), first.x1(), first.z1()),
                "Nearest sweep entry must actually cover missing chunks, not a covered gap between pockets");
            require((alongX ? first.x1() : first.z1()) == 0 && (alongX ? first.z1() : first.x1()) == 4,
                "A nearby real pocket must precede a projection into a covered strip gap");
            assertCovered(area, covered, route, 3);
            // Once the task loads on approach, the same predicate used by tickSweep must
            // release its stale destination without pretending that a different hole is done.
            covered.addRect(first.x1() - 3, first.z1() - 3, first.x1() + 3, first.z1() + 3);
            require(!covered.hasOpenRect(Math.min(first.x1(), first.x2()) - 3,
                    Math.min(first.z1(), first.z2()) - 3, Math.max(first.x1(), first.x2()) + 3,
                    Math.max(first.z1(), first.z2()) + 3),
                "Fully loaded sweep task must permit replanning before waypoint arrival");
            assertCovered(area, covered, CoveragePlanner.sweep(area, 3, 0, covered, 0, 0), 3);
        }
    }

    private static void sectorTraversal() {
        Area area = new Area(-1490, -350, 4, 7); // 1495 x 358, including negative coordinates
        SectorTraversal traversal = new SectorTraversal(area, 30, -10, -10);
        require(traversal.total() == 600, "Large selection must produce 600 clipped sectors");
        require(traversal.current().contains(-10, -10), "First sector must be nearest the player");
        ChunkGrid confirmed = new ChunkGrid(area);
        require(!traversal.advance(confirmed), "Unexplored sector must not advance");
        Area first = traversal.current();
        // Completing all but one chunk must still block progress.
        for (int x = first.minCX(); x <= first.maxCX(); x++) {
            for (int z = first.minCZ(); z <= first.maxCZ(); z++) confirmed.add(x, z);
        }
        confirmed.remove(first.minCX(), first.minCZ());
        require(traversal.missing(confirmed) == 1 && !traversal.advance(confirmed),
            "One unconfirmed chunk must keep the current sector active");
        confirmed.add(first.minCX(), first.minCZ());
        Area next = traversal.next(confirmed, first.minCX(), first.minCZ());
        Segment exit = SectorPlanner.exitPoint(first, next, first.minCX(), first.minCZ());
        require(traversal.advance(confirmed, exit.x1(), exit.z1()), "Confirmed sector must advance at the shared exit");
        require(adjacent(first, traversal.current()), "The next sector must share a side");
        SectorTraversal restored = new SectorTraversal(area, traversal.size(), traversal.currentIndex(), traversal.completed(), 10000, 10000);
        require(restored.current().equals(traversal.current()), "Restore must keep the current sector regardless of player position");
        require(java.util.Arrays.equals(restored.completed(), traversal.completed()),
            "Restore must preserve completed sector identities after dynamic neighbour choices");
        Area active = traversal.current();
        List<Segment> sweep = CoveragePlanner.sweep(active, 4, 2, confirmed, first.minCX(), first.minCZ());
        require(!sweep.isEmpty(), "Next unexplored sector must have work");
        for (Segment leg : sweep) {
            require(active.contains(leg.x1(), leg.z1()) && active.contains(leg.x2(), leg.z2()),
                "Sweep targets must stay in the active sector even with a global coverage grid");
        }
        assertCovered(active, confirmed, sweep, 4);
        List<Segment> cleanup = CoveragePlanner.cleanup(active, 3, confirmed, first.minCX(), first.minCZ());
        for (Segment spot : cleanup) require(active.contains(spot.x1(), spot.z1()), "Cleanup must stay in the active sector");
        assertCovered(active, confirmed, cleanup, 3);

        for (boolean worldGrid : new boolean[]{false, true}) {
            ChunkGrid partition = new ChunkGrid(area);
            SectorTraversal all = new SectorTraversal(area, 30, worldGrid, area.minCX(), area.minCZ());
            long total = 0;
            int transitions = 0, jumps = 0;
            while (all.current() != null) {
                Area sector = all.current();
                require(sector.width() <= 30 && sector.depth() <= 30, "Edge sectors must be clipped");
                if (worldGrid) require(Math.floorMod(sector.minCX(), 30) == 0 || sector.minCX() == area.minCX(),
                    "World grid sectors must start on multiples of the size");
                for (int x = sector.minCX(); x <= sector.maxCX(); x++) {
                    for (int z = sector.minCZ(); z <= sector.maxCZ(); z++) {
                        require(area.contains(x, z), "Sectors must stay within the selection");
                        if (!partition.test(x, z)) { partition.add(x, z); total++; }
                    }
                }
                Area neighbour = all.next(partition, sector.minCX(), sector.minCZ());
                Segment handoff = neighbour == null ? new Segment(sector.minCX(), sector.minCZ(), sector.minCX(), sector.minCZ())
                    : SectorPlanner.exitPoint(sector, neighbour, sector.minCX(), sector.minCZ());
                require(all.advance(partition, handoff.x1(), handoff.z1()), "Fully covered sector must advance at its exit");
                if (all.current() != null && !adjacent(sector, all.current())) jumps++;
                require(++transitions < 600 * 8, "Neighbour traversal must not loop forever");
            }
            require(total == area.total() && all.visited() == all.total(), "Traversal must include every selected chunk");
            require(jumps == 0, "Warnsdorff order must leave no stranded sectors on a blank selection: " + jumps + " jumps");
            require(!all.advance((x, z) -> true), "Finished traversal must stay finished");
        }
        SectorTraversal world = new SectorTraversal(new Area(-1490, -350, 4, 7), 30, true, 0, 0);
        require(world.total() == 51 * 13 && world.sector(world.indexOf(-1490, -350)).equals(new Area(-1490, -350, -1471, -331)),
            "World grid edges sit on multiples of the size, clipped to the selection");
        require(world.indexOf(-1471, -331) == world.indexOf(-1490, -350) && world.indexOf(-1470, -331) != world.indexOf(-1490, -350)
            && world.indexOf(5, 0) == -1, "Chunk lookup must follow the world grid");

        SectorTraversal tiny = new SectorTraversal(new Area(-2, -3, 2, 3), 30, 0, 0);
        require(tiny.total() == 1 && tiny.current().total() == 35, "Selections smaller than a sector must work");
        require(tiny.advance((x, z) -> true) && tiny.current() == null, "Incidental coverage must skip a finished sector");

        Area islands = new Area(0, 0, 89, 29);
        ChunkGrid islandCoverage = new ChunkGrid(islands);
        islandCoverage.addRect(0, 0, 59, 29);
        SectorTraversal bridge = new SectorTraversal(islands, 30, 2, 2);
        require(bridge.next(islandCoverage, 2, 2).minCX() == 60 && !bridge.nextIsAdjacent(),
            "With no open neighbour, head for the nearest open sector over finished ground");
        require(bridge.advance(islandCoverage, 2, 2) && bridge.current().minCX() == 60 && !bridge.transit(),
            "A jump over mapped ground needs no shared exit and no transit sector");
        require(bridge.state(1) == SectorTraversal.State.COMPLETED, "Mapped sectors seen while choosing count as finished");

        Area strip = new Area(0, 0, 119, 29);
        ChunkGrid stripCoverage = new ChunkGrid(strip);
        SectorTraversal deferring = new SectorTraversal(strip, 30, true, 2, 2);
        require(deferring.defer(stripCoverage, 2, 2) && deferring.currentIndex() == 1 && deferring.state(0) == SectorTraversal.State.DEFERRED,
            "An unfinished sector must be deferred and the run carry on next door");
        for (int i = 1; i < 4; i++) {
            Area done = deferring.current();
            stripCoverage.addRect(done.minCX(), done.minCZ(), done.maxCX(), done.maxCZ());
            require(deferring.advance(stripCoverage, done.maxCX() - 2, 2), "Finished sectors advance past the deferred one");
        }
        require(deferring.currentIndex() == 0 && deferring.retrying(), "Deferred sectors are retried once everything else is done");
        require(!deferring.defer(stripCoverage, 2, 2) && deferring.state(0) == SectorTraversal.State.SKIPPED
            && deferring.skippedCount() == 1 && deferring.finished(), "A second failure skips the sector and finishes the run");
        SectorTraversal lone = new SectorTraversal(new Area(0, 0, 29, 29), 30, true, 0, 0);
        require(lone.defer(new ChunkGrid(new Area(0, 0, 29, 29)), 2, 2) && lone.currentIndex() == 0 && lone.retrying(),
            "The only sector left is retried at once");
        SectorTraversal manual = new SectorTraversal(strip, 30, true, 2, 2);
        ChunkGrid manualCoverage = new ChunkGrid(strip);
        manual.prioritise(3);
        require(manual.next(manualCoverage, 2, 2).minCX() == 90, "A sector picked on the map comes next");
        require(manual.skip(0, manualCoverage, 2, 2) && manual.currentIndex() == 3, "Skipping the current sector moves on at once");
        manual.prioritise(0);
        require(manual.state(0) == SectorTraversal.State.OPEN && manual.priority() == 0, "A skipped sector can be put back first");
        SectorTraversal saved = new SectorTraversal(strip, 30, true, 0, 0);
        saved.restore(manual.currentIndex(), manual.completed(), manual.deferred(), manual.skipped(), manual.retrying(), manual.priority());
        require(saved.currentIndex() == 3 && saved.priority() == 0, "Restore must keep the current and prioritised sectors");
        SectorTraversal migrated = new SectorTraversal(islands, 30, 2, 1, 0, 0);
        require(migrated.currentIndex() == 0 && migrated.visited() == 1,
            "Legacy snake sessions must restore their exact current sector and completed prefix");
        long[] beforeRepair = migrated.completed();
        require(migrated.reanchorIfDistant(85, 15) && migrated.current().contains(85, 15),
            "A distant legacy wrap target must resume at the player's local sector");
        require(java.util.Arrays.equals(beforeRepair, migrated.completed()),
            "Repairing a distant target must preserve completed sector identities");
        SectorTraversal nearby = new SectorTraversal(islands, 30, 1, new long[0], 27, 15);
        require(!nearby.reanchorIfDistant(27, 15) && nearby.currentIndex() == 1,
            "A normal transition into a nearby saved neighbour must not be reanchored");
    }

    private static boolean adjacent(Area a, Area b) {
        return (a.maxCX() + 1 == b.minCX() || b.maxCX() + 1 == a.minCX())
            && Math.max(a.minCZ(), b.minCZ()) <= Math.min(a.maxCZ(), b.maxCZ())
            || (a.maxCZ() + 1 == b.minCZ() || b.maxCZ() + 1 == a.minCZ())
            && Math.max(a.minCX(), b.minCX()) <= Math.min(a.maxCX(), b.maxCX());
    }

    private static void nearbySweepEntry() {
        for (boolean alongX : new boolean[]{true, false}) {
            Area area = alongX ? new Area(-200, -50, 200, 50) : new Area(-50, -200, 50, 200);
            ChunkGrid covered = new ChunkGrid(area);
            for (int x = area.minCX(); x <= area.maxCX(); x++) {
                for (int z = area.minCZ(); z <= area.maxCZ(); z++) {
                    int u = alongX ? x : z, v = alongX ? z : x;
                    boolean nearbyStrip = Math.abs(u) <= 80 && Math.abs(v) == 10;
                    boolean distantSpot = u == 40 && v == 0;
                    if (!nearbyStrip && !distantSpot) covered.add(x, z);
                }
            }
            List<Segment> route = CoveragePlanner.sweep(area, 3, 0, covered, 0, 0);
            Segment first = route.getFirst();
            require((alongX ? first.x1() : first.z1()) == 0
                    && Math.abs(alongX ? first.z1() : first.x1()) == 10,
                "Enter a nearby strip at its middle instead of choosing a distant spot or strip endpoint");
            require(route.stream().filter(s -> Math.abs(alongX ? s.z1() : s.x1()) == 10).count() == 3,
                "Entering a nearby strip in the middle must preserve both halves and the other strip");
            assertCovered(area, covered, route, 3);
        }
    }

    private static void centeredSweep() {
        for (boolean alongX : new boolean[]{true, false}) {
            for (boolean ascending : new boolean[]{true, false}) {
                for (int overlap : new int[]{0, 2}) {
                    Area area = alongX ? new Area(-80, -30, 80, 30) : new Area(-30, -80, 30, 80);
                    ChunkGrid covered = new ChunkGrid(area);
                    int low = -27, high = -5, reach = 3;
                    for (int v = -30; v <= 30; v++) {
                        if (v >= low && v <= high) continue;
                        if (alongX) covered.addRect(-80, v, 80, v);
                        else covered.addRect(v, -80, v, 80);
                    }
                    double u = -80, v = ascending ? low - 1 : high + 1;
                    int spacing = CoveragePlanner.spacing(reach, overlap);
                    while (high - low + 1 >= spacing) {
                        List<Segment> route = CoveragePlanner.sweep(area, reach, overlap, covered,
                            alongX ? u : v, alongX ? v : u);
                        assertCovered(area, covered, route, reach);
                        Segment first = route.getFirst();
                        int centre = alongX ? first.z1() : first.x1();
                        int expected = ascending ? Math.floorDiv(2 * low + spacing - 1, 2)
                            : Math.floorDiv(2 * high - spacing + 1, 2);
                        require(centre == expected,
                            "Sweep must centre a full band from the nearby open edge, including after replanning: expected "
                                + expected + ", got " + centre);
                        require(centre > low && centre < high,
                            "A wide remaining area must load new ground on both sides of the strip");
                        covered.addRect(Math.min(first.x1(), first.x2()) - reach, Math.min(first.z1(), first.z2()) - reach,
                            Math.max(first.x1(), first.x2()) + reach, Math.max(first.z1(), first.z2()) + reach);
                        u = alongX ? first.x2() : first.z2();
                        v = centre;
                        if (ascending) low = centre + reach + 1;
                        else high = centre - reach - 1;
                    }
                    assertCovered(area, covered, CoveragePlanner.sweep(area, reach, overlap, covered,
                        alongX ? u : v, alongX ? v : u), reach);
                }
            }
        }
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
