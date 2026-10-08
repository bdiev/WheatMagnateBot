package dev.onfocus.addon.explore;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Plans how to fly over a rectangle of chunks so that every one of them gets loaded. Pure logic -
 * no game state - so a whole route is built at once and its length is known up front.
 * <p>
 * Flying over a chunk loads everything within {@code reach} chunks to either side of it, so the
 * sweep is a set of parallel strips ("lawnmower") along the longer side of the area, spaced so that
 * neighbouring swaths overlap a little. Each strip answers for a band of rows, and is only flown where
 * those rows still have unexplored chunks. Bands start at the first row still open after the last
 * one, so ground explored before is skipped instead of cut through by a fixed grid, and each piece
 * of a strip runs down the middle of the rows still open beside it rather than along the edge of
 * explored ground, where half its swath would be wasted. The piece nearest the player always comes
 * first; the rest are ordered after it by 2-opt (which also flips pieces around) to cut the transit
 * between them. The explorer plans again after every strip, so it keeps heading for the nearest
 * blank ground rather than following an old long-range order.
 * <p>
 * The cleanup is for whatever the sweep missed: missing chunks are grouped into square cells small
 * enough that passing a cell's centre loads all of them, and each next centre is the nearest one left.
 * <p>
 * All coordinates are chunk coordinates; a chunk's number stands for its centre.
 */
public final class CoveragePlanner {
    /** Explored stretches of a strip longer than this many strip spacings split it into separate pieces. */
    private static final int SPLIT_GAP_SPACINGS = 3;
    /**
     * Time 2-opt may spend improving a route. The re-plan after each strip runs in the background,
     * but the first plan is made on the game thread, so this is a frame's worth or so; only the next
     * few pieces really matter, as it's planned again after each strip.
     */
    private static final long OPTIMIZE_BUDGET_NANOS = 15_000_000L;
    /**
     * A fully mapped transit leg is deliberately worth a sizeable detour through blank ground.
     * Transit still has a finite cost, so disconnected blank islands remain reachable instead of
     * making the route impossible.
     */
    private static final double EXPLORED_TRANSIT_PENALTY = 8.0;

    private CoveragePlanner() {
    }

    @FunctionalInterface
    public interface ChunkTest {
        boolean test(int cx, int cz);
    }

    /** Inclusive rectangle of chunks. */
    public record Area(int minCX, int minCZ, int maxCX, int maxCZ) {
        public int width() {
            return maxCX - minCX + 1;
        }

        public int depth() {
            return maxCZ - minCZ + 1;
        }

        public long total() {
            return (long) width() * depth();
        }

        public boolean contains(int cx, int cz) {
            return cx >= minCX && cx <= maxCX && cz >= minCZ && cz <= maxCZ;
        }
    }

    /** A straight stretch to fly, from chunk (x1, z1) to chunk (x2, z2). Both ends are the same for a spot to pass through. */
    public record Segment(int x1, int z1, int x2, int z2) {
        public boolean isSpot() {
            return x1 == x2 && z1 == z2;
        }

        public Segment reversed() {
            return new Segment(x2, z2, x1, z1);
        }

        public double length() {
            return Math.hypot(x2 - x1, z2 - z1);
        }
    }

    /** Distance between neighbouring strips, so that their swaths share {@code overlap} chunks. */
    public static int spacing(int reach, int overlap) {
        return Math.max(1, 2 * reach + 1 - overlap);
    }

    /** How far short of the last unexplored chunk a strip may stop. */
    public static int margin(int reach, int overlap) {
        return Math.max(0, reach - overlap);
    }

    /** Guaranteed cleanup footprint after allowing for the maximum waypoint arrival offset. */
    public static int cleanupRadius(int reach, double arrivalBlocks) {
        return Math.max(0, reach - (int) Math.ceil(arrivalBlocks / 16.0));
    }

    /** Conservative supercover of a flight leg's swath; provisional loading never counts here. */
    public static boolean hasOpenAlong(Area area, int reach, ChunkTest explored,
                                       double x1, double z1, double x2, double z2) {
        int steps = Math.max(1, (int) Math.ceil(Math.max(Math.abs(x2 - x1), Math.abs(z2 - z1)) * 2));
        int previousX = (int) Math.floor(x1 + 0.5), previousZ = (int) Math.floor(z1 + 0.5);
        for (int i = 0; i <= steps; i++) {
            double t = i / (double) steps;
            int x = (int) Math.floor(x1 + (x2 - x1) * t + 0.5);
            int z = (int) Math.floor(z1 + (z2 - z1) * t + 0.5);
            if (i > 0 && x == previousX && z == previousZ) continue;
            // Include both corner-adjacent chunks, so a diagonal cannot skip a small gap.
            for (int cx = Math.max(area.minCX(), Math.min(previousX, x) - reach);
                 cx <= Math.min(area.maxCX(), Math.max(previousX, x) + reach); cx++) {
                for (int cz = Math.max(area.minCZ(), Math.min(previousZ, z) - reach);
                     cz <= Math.min(area.maxCZ(), Math.max(previousZ, z) + reach); cz++) {
                    if (!explored.test(cx, cz)) return true;
                }
            }
            previousX = x;
            previousZ = z;
        }
        return false;
    }

    /** Total length of flying the route from (fromX, fromZ), transit included. */
    public static double routeLength(List<Segment> route, double fromX, double fromZ) {
        double length = 0, x = fromX, z = fromZ;
        for (Segment s : route) {
            length += Math.hypot(s.x1() - x, s.z1() - z) + s.length();
            x = s.x2();
            z = s.z2();
        }
        return length;
    }

    /**
     * The sweep over every chunk of the area that {@code explored} doesn't accept, starting from
     * the player at chunk (fromX, fromZ). Empty if there's nothing left to explore.
     */
    public static List<Segment> sweep(Area area, int reach, int overlap, ChunkTest explored, double fromX, double fromZ) {
        boolean alongX = area.width() >= area.depth();
        int uMin = alongX ? area.minCX() : area.minCZ(), uMax = alongX ? area.maxCX() : area.maxCZ();
        int vMin = alongX ? area.minCZ() : area.minCX(), vMax = alongX ? area.maxCZ() : area.maxCX();
        int spacing = spacing(reach, overlap), margin = margin(reach, overlap);
        int splitGap = SPLIT_GAP_SPACINGS * spacing;
        int shiftTolerance = Math.max(1, reach / 2);
        List<int[]> bands = bands(alongX, uMin, uMax, vMin, vMax, spacing, explored);

        // Start at the corner nearest the player
        double pu = alongX ? fromX : fromZ, pv = alongX ? fromZ : fromX;
        boolean vAscending = Math.abs(pv - vMin) <= Math.abs(pv - vMax);
        boolean uAscending = Math.abs(pu - uMin) <= Math.abs(pu - uMax);

        List<Segment> route = new ArrayList<>();
        for (int k = 0; k < bands.size(); k++) {
            int[] band = bands.get(vAscending ? k : bands.size() - 1 - k);

            // Pieces of the strip: {first u, last u, lowest open row, highest open row, ends trimmed (bit 0 start, bit 1 end)}
            List<int[]> pieces = new ArrayList<>();
            int[] piece = null;
            for (int u = uMin; u <= uMax; u++) {
                int lo = band[1] + 1, hi = band[0] - 1;
                for (int v = band[0]; v <= band[1]; v++) {
                    if (alongX ? explored.test(u, v) : explored.test(v, u)) continue;
                    lo = Math.min(lo, v);
                    hi = v;
                }
                if (hi < lo) continue;
                if (piece != null && u - piece[1] - 1 > splitGap) {
                    pieces.add(piece);
                    piece = null;
                } else if (piece != null && Math.abs((lo + hi) - (piece[2] + piece[3])) > 2 * shiftTolerance) {
                    // The open rows moved across the band: carry on beside them, not along explored ground
                    piece[4] &= ~2;
                    pieces.add(piece);
                    piece = new int[]{u, u, lo, hi, 2};
                }
                if (piece == null) piece = new int[]{u, u, lo, hi, 3};
                piece[1] = u;
                piece[2] = Math.min(piece[2], lo);
                piece[3] = Math.max(piece[3], hi);
            }
            if (piece != null) pieces.add(piece);
            if (pieces.isEmpty()) continue;

            for (int p = 0; p < pieces.size(); p++) {
                int[] next = pieces.get(uAscending ? p : pieces.size() - 1 - p);
                int from = (next[4] & 1) != 0 ? next[0] + margin : next[0], to = (next[4] & 2) != 0 ? next[1] - margin : next[1];
                if (from > to) from = to = Math.floorDiv(next[0] + next[1], 2);
                int a = uAscending ? from : to, b = uAscending ? to : from;
                // A band is narrower than a swath, so its middle open row covers all its open rows
                int c = Math.floorDiv(next[2] + next[3], 2);
                route.add(alongX ? new Segment(a, c, b, c) : new Segment(c, a, c, b));
            }
            uAscending = !uAscending;
        }
        // If the player is already inside the swath of a strip, start opening it right here
        // instead of treating the flight to one of its distant ends as empty transit.
        splitNearestAtStart(route, fromX, fromZ, reach);
        return nearestFirst(route, fromX, fromZ, explored);
    }

    /**
     * The segment with the end nearest (fromX, fromZ) first, flown away from that end, then the rest
     * ordered after it. Whatever 2-opt finds cheaper overall, the next stop is the nearest one.
     * <p>
     * Only the first {@link #ORDERED_AHEAD} are ordered with care: the sweep is planned again after
     * every strip, so the rest only count towards the length (and time) left, and they keep the
     * lawnmower order they were made in. Ordering thousands of pieces took a tenth of a second at
     * every turn on a big, patchy map.
     */
    private static List<Segment> nearestFirst(List<Segment> segments, double fromX, double fromZ, ChunkTest explored) {
        List<Segment> ordered = nearestNeighbour(segments, fromX, fromZ, ORDERED_AHEAD);
        if (ordered.size() <= 2) return ordered;
        int ahead = Math.min(ordered.size(), ORDERED_AHEAD);
        Segment head = ordered.get(0);
        List<Segment> route = optimize(ordered.subList(1, ahead), head.x2(), head.z2(), explored);
        route.add(0, head);
        route.addAll(ordered.subList(ahead, ordered.size()));
        return route;
    }

    /** Pieces of the sweep put in flying order with care; see {@link #nearestFirst}. */
    public static final int ORDERED_AHEAD = 48;

    /**
     * Splits the closest strip at the player's projection when the player is already close enough
     * for that strip to load their current ground. Both halves stay in the plan; nearest-neighbour
     * ordering starts one of them at the split point, so useful coverage begins immediately.
     */
    private static void splitNearestAtStart(List<Segment> route, double fromX, double fromZ, int reach) {
        int bestIndex = -1, splitX = 0, splitZ = 0;
        double bestDistance = Double.MAX_VALUE;
        for (int i = 0; i < route.size(); i++) {
            Segment s = route.get(i);
            int x, z;
            if (s.z1() == s.z2()) {
                x = (int) Math.round(clamp(fromX, Math.min(s.x1(), s.x2()), Math.max(s.x1(), s.x2())));
                z = s.z1();
            } else {
                x = s.x1();
                z = (int) Math.round(clamp(fromZ, Math.min(s.z1(), s.z2()), Math.max(s.z1(), s.z2())));
            }
            double distance = dist(fromX, fromZ, x, z);
            if (distance < bestDistance) {
                bestDistance = distance;
                bestIndex = i;
                splitX = x;
                splitZ = z;
            }
        }
        if (bestIndex < 0 || bestDistance > reach + 0.5) return;

        Segment s = route.get(bestIndex);
        boolean atStart = splitX == s.x1() && splitZ == s.z1();
        boolean atEnd = splitX == s.x2() && splitZ == s.z2();
        if (atStart || atEnd) return;

        route.set(bestIndex, new Segment(splitX, splitZ, s.x1(), s.z1()));
        route.add(new Segment(splitX, splitZ, s.x2(), s.z2()));
    }

    /**
     * Spots to pass through so every chunk {@code explored} doesn't accept gets within
     * {@code radius} chunks of one of them, in flying order from chunk (fromX, fromZ).
     */
    public static List<Segment> cleanup(Area area, int radius, ChunkTest explored, double fromX, double fromZ) {
        int cell = 2 * Math.max(0, radius) + 1;
        // Bounding box of the missing chunks in each cell: minX, minZ, maxX, maxZ
        Map<Long, int[]> boxes = new HashMap<>();
        for (int cx = area.minCX(); cx <= area.maxCX(); cx++) {
            for (int cz = area.minCZ(); cz <= area.maxCZ(); cz++) {
                if (explored.test(cx, cz)) continue;
                long key = ((long) ((cx - area.minCX()) / cell) << 32) | ((cz - area.minCZ()) / cell);
                int[] box = boxes.get(key);
                if (box == null) boxes.put(key, new int[]{cx, cz, cx, cz});
                else {
                    box[0] = Math.min(box[0], cx);
                    box[1] = Math.min(box[1], cz);
                    box[2] = Math.max(box[2], cx);
                    box[3] = Math.max(box[3], cz);
                }
            }
        }

        List<Segment> spots = new ArrayList<>(boxes.size());
        for (int[] box : boxes.values()) {
            int x = Math.floorDiv(box[0] + box[2], 2), z = Math.floorDiv(box[1] + box[3], 2);
            spots.add(new Segment(x, z, x, z));
        }
        // Exact nearest-neighbour is quadratic: 67k gaps used to block the game for 42 seconds.
        // Large cleanups use sorted alternating rows, keeping every spot in O(n log n).
        if (spots.size() > 512) return orderedCleanup(spots, area, cell, fromX, fromZ);
        return nearestNeighbour(spots, fromX, fromZ);
    }

    private static List<Segment> orderedCleanup(List<Segment> spots, Area area, int cell, double fromX, double fromZ) {
        List<Segment> best = null;
        double bestDistance = Double.POSITIVE_INFINITY;
        for (boolean alongX : new boolean[]{true, false}) {
            List<Segment> sorted = new ArrayList<>(spots);
            java.util.function.ToIntFunction<Segment> row = s -> Math.floorDiv(
                alongX ? s.z1() - area.minCZ() : s.x1() - area.minCX(), cell);
            sorted.sort(java.util.Comparator.comparingInt(row)
                .thenComparingInt(s -> alongX ? s.x1() : s.z1()));
            List<Segment> snake = new ArrayList<>(spots.size());
            boolean reverse = false;
            for (int start = 0; start < sorted.size(); ) {
                int end = start + 1;
                while (end < sorted.size() && row.applyAsInt(sorted.get(end)) == row.applyAsInt(sorted.get(start))) end++;
                if (reverse) for (int i = end - 1; i >= start; i--) snake.add(sorted.get(i));
                else snake.addAll(sorted.subList(start, end));
                reverse = !reverse;
                start = end;
            }
            for (int direction = 0; direction < 2; direction++) {
                if (direction == 1) java.util.Collections.reverse(snake);
                double distance = routeLength(snake, fromX, fromZ);
                if (distance < bestDistance) {
                    bestDistance = distance;
                    best = new ArrayList<>(snake);
                }
            }
        }
        return best;
    }

    /**
     * Bands of rows, {first, last}, each at most {@code spacing} wide, every one starting at the first
     * row after the last band that still has an unexplored chunk anywhere along it.
     */
    static List<int[]> bands(boolean alongX, int uMin, int uMax, int vMin, int vMax, int spacing, ChunkTest explored) {
        List<int[]> bands = new ArrayList<>();
        int v = vMin;
        while (v <= vMax) {
            if (!rowHasOpen(alongX, v, uMin, uMax, explored)) {
                v++;
                continue;
            }
            int to = Math.min(vMax, v + spacing - 1);
            bands.add(new int[]{v, to});
            v = to + 1;
        }
        return bands;
    }

    private static boolean rowHasOpen(boolean alongX, int v, int uFrom, int uTo, ChunkTest explored) {
        for (int u = uFrom; u <= uTo; u++) {
            if (!(alongX ? explored.test(u, v) : explored.test(v, u))) return true;
        }
        return false;
    }

    /** Each next segment is the one with an end nearest to where the last one finished. */
    static List<Segment> nearestNeighbour(List<Segment> segments, double fromX, double fromZ) {
        return nearestNeighbour(segments, fromX, fromZ, Integer.MAX_VALUE);
    }

    /** The same for the first {@code picks} segments; the rest follow in the order given. */
    static List<Segment> nearestNeighbour(List<Segment> segments, double fromX, double fromZ, int picks) {
        List<Segment> left = new ArrayList<>(segments);
        List<Segment> route = new ArrayList<>(segments.size());
        double x = fromX, z = fromZ;
        if (picks < segments.size()) {
            // Swap-removing below would scramble the rest; keep it in order instead
            List<Segment> picked = new ArrayList<>(picks);
            boolean[] taken = new boolean[segments.size()];
            for (int n = 0; n < picks; n++) {
                int best = -1;
                boolean flip = false;
                double bestDist = Double.MAX_VALUE;
                for (int i = 0; i < segments.size(); i++) {
                    if (taken[i]) continue;
                    Segment s = segments.get(i);
                    double d1 = dist(x, z, s.x1(), s.z1()), d2 = dist(x, z, s.x2(), s.z2());
                    if (d1 < bestDist) {
                        bestDist = d1;
                        best = i;
                        flip = false;
                    }
                    if (d2 < bestDist) {
                        bestDist = d2;
                        best = i;
                        flip = true;
                    }
                }
                taken[best] = true;
                Segment s = flip ? segments.get(best).reversed() : segments.get(best);
                picked.add(s);
                x = s.x2();
                z = s.z2();
            }
            for (int i = 0; i < segments.size(); i++) if (!taken[i]) picked.add(segments.get(i));
            return picked;
        }
        while (!left.isEmpty()) {
            int best = 0;
            boolean flip = false;
            double bestDist = Double.MAX_VALUE;
            for (int i = 0; i < left.size(); i++) {
                Segment s = left.get(i);
                double d1 = dist(x, z, s.x1(), s.z1()), d2 = dist(x, z, s.x2(), s.z2());
                if (d1 < bestDist) {
                    bestDist = d1;
                    best = i;
                    flip = false;
                }
                if (d2 < bestDist) {
                    bestDist = d2;
                    best = i;
                    flip = true;
                }
            }
            // Swap-remove keeps this O(n) per pick
            Segment s = left.get(best);
            left.set(best, left.get(left.size() - 1));
            left.remove(left.size() - 1);
            if (flip) s = s.reversed();
            route.add(s);
            x = s.x2();
            z = s.z2();
        }
        return route;
    }

    /**
     * 2-opt on an open route with a fixed start: reversing a run of segments (which also flips each
     * of them) whenever that shortens the transit around it. Stops when nothing improves or the
     * time budget runs out.
     */
    static List<Segment> optimize(List<Segment> route, double fromX, double fromZ) {
        return optimize(route, fromX, fromZ, null);
    }

    /** 2-opt using mapped-ground-aware costs for the transit legs between sweep pieces. */
    static List<Segment> optimize(List<Segment> route, double fromX, double fromZ, ChunkTest explored) {
        Segment[] s = route.toArray(new Segment[0]);
        int n = s.length;
        long deadline = System.nanoTime() + OPTIMIZE_BUDGET_NANOS;

        boolean improved = n > 1;
        while (improved && System.nanoTime() < deadline) {
            improved = false;
            for (int i = 0; i < n; i++) {
                double px = i == 0 ? fromX : s[i - 1].x2(), pz = i == 0 ? fromZ : s[i - 1].z2();
                for (int j = i; j < n; j++) {
                    if (System.nanoTime() > deadline) break;
                    double delta = transitCost(px, pz, s[j].x2(), s[j].z2(), explored)
                        - transitCost(px, pz, s[i].x1(), s[i].z1(), explored);
                    if (j + 1 < n) {
                        delta += transitCost(s[i].x1(), s[i].z1(), s[j + 1].x1(), s[j + 1].z1(), explored)
                            - transitCost(s[j].x2(), s[j].z2(), s[j + 1].x1(), s[j + 1].z1(), explored);
                    }
                    if (delta < -1e-6) {
                        reverse(s, i, j);
                        improved = true;
                    }
                }
                if ((i & 31) == 0 && System.nanoTime() > deadline) break;
            }
        }
        return new ArrayList<>(Arrays.asList(s));
    }

    /**
     * Cost of a straight transit leg. Up to 256 evenly distributed samples estimate how much of
     * the line crosses mapped ground, so evaluating routes remains bounded even for huge selected
     * areas. The end points are omitted: sweep ends and cleanup spots are blank by construction,
     * while the player's starting chunk should not dictate the whole route.
     */
    public static double transitCost(double x1, double z1, double x2, double z2, ChunkTest explored) {
        double length = dist(x1, z1, x2, z2);
        if (explored == null || length < 1) return length;

        int samples = Math.max(1, (int) Math.ceil(length * 2));
        int step = Math.max(1, (int) Math.ceil(samples / 256.0));
        int mapped = 0, visited = 0;
        int lastX = Integer.MIN_VALUE, lastZ = Integer.MIN_VALUE;
        for (int i = step; i < samples; i += step) {
            double t = (double) i / samples;
            int cx = (int) Math.floor(x1 + (x2 - x1) * t);
            int cz = (int) Math.floor(z1 + (z2 - z1) * t);
            if (cx == lastX && cz == lastZ) continue;
            lastX = cx;
            lastZ = cz;
            visited++;
            if (explored.test(cx, cz)) mapped++;
        }
        if (visited == 0) return length;
        return length * (1 + EXPLORED_TRANSIT_PENALTY * mapped / visited);
    }

    private static void reverse(Segment[] s, int i, int j) {
        for (; i < j; i++, j--) {
            Segment t = s[i];
            s[i] = s[j].reversed();
            s[j] = t.reversed();
        }
        if (i == j) s[i] = s[i].reversed();
    }

    private static double dist(double x1, double z1, double x2, double z2) {
        return Math.hypot(x2 - x1, z2 - z1);
    }

    private static double clamp(double value, double min, double max) {
        return Math.max(min, Math.min(max, value));
    }
}
