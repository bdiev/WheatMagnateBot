package dev.onfocus.addon.explore;

import dev.onfocus.addon.explore.CoveragePlanner.Area;
import dev.onfocus.addon.explore.CoveragePlanner.ChunkTest;
import it.unimi.dsi.fastutil.longs.Long2ObjectOpenHashMap;
import it.unimi.dsi.fastutil.longs.LongOpenHashSet;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

/**
 * The contour pattern: blank ground is flown in loops that follow its own outline, each one inside
 * the last, spiralling in to the middle - instead of straight strips across the whole area.
 * <p>
 * Only the next loop is planned at a time. Every blank chunk gets its distance to the nearest
 * explored chunk (or the area edge); the loop is the line where that distance is half a strip
 * spacing, so the swath along it just overlaps the explored edge. Once it's flown, that ring is
 * explored and the next plan's line lies further in - fitted to how far the map really got drawn.
 * <p>
 * Small explored specks inside blank ground are ignored, or every one of them would get a loop of
 * its own. Nearby narrow corridors are flown along their centre line instead of circling one edge.
 * <p>
 * Pure logic, chunk coordinates; a chunk's number stands for its centre.
 */
public final class ContourPlanner {
    /** Loops shorter than this (chunks) are flown as a single spot at their middle - too tight to circle. */
    private static final double MIN_LOOP_LENGTH = 6;
    /** How far (chunks) a simplified loop may stray from the exact line. */
    private static final double SIMPLIFY_TOLERANCE = 0.25;

    private ContourPlanner() {
    }

    /** A contour loop or open corridor centre line, chunk coordinates {x, z}; empty if none is left. */
    public static List<double[]> nextLoop(Area area, int reach, int overlap, ChunkTest explored, double fromX, double fromZ) {
        int w = area.width(), h = area.depth();
        int spacing = CoveragePlanner.spacing(reach, overlap);
        // Same distance from the edge as a strip's centre line: the first blank row is at distance 1
        double level = 1 + (spacing - 1) / 2.0;

        boolean[] wall = new boolean[w * h];
        for (int z = 0; z < h; z++) {
            for (int x = 0; x < w; x++) wall[x + z * w] = explored.test(area.minCX() + x, area.minCZ() + z);
        }
        dropSpecks(wall, w, h, Math.max(4, spacing * spacing / 2));
        float[] dist = distances(wall, w, h);

        List<List<double[]>> loops = isoLoops(dist, w, h, level);
        List<double[]> corridor = NarrowCorridorPlanner.nearest(area, reach, explored, fromX, fromZ);
        if (loops.isEmpty()) return simplifyOpen(corridor, SIMPLIFY_TOLERANCE);

        // The loop with a point nearest the player, started at that point
        double px = fromX - area.minCX(), pz = fromZ - area.minCZ();
        List<double[]> best = null;
        int bestStart = 0;
        double bestDist = Double.MAX_VALUE;
        for (List<double[]> loop : loops) {
            for (int i = 0; i < loop.size(); i++) {
                double d = Math.hypot(loop.get(i)[0] - px, loop.get(i)[1] - pz);
                if (d < bestDist) {
                    bestDist = d;
                    best = loop;
                    bestStart = i;
                }
            }
        }

        // A centre line is slightly farther from the player than its edge contour. Prefer it
        // within one reach so narrow corridors do not keep getting an off-centre perimeter pass.
        double corridorDistance = Double.POSITIVE_INFINITY;
        for (double[] point : corridor) corridorDistance = Math.min(corridorDistance,
            Math.hypot(point[0] - fromX, point[1] - fromZ));
        if (corridorDistance <= bestDist + reach) return simplifyOpen(corridor, SIMPLIFY_TOLERANCE);

        List<double[]> loop = new ArrayList<>(best.size() + 1);
        for (int i = 0; i < best.size(); i++) loop.add(best.get((bestStart + i) % best.size()));
        if (!blankOnLeft(loop, dist, w, h, level)) {
            Collections.reverse(loop);
            loop.add(0, loop.remove(loop.size() - 1)); // keep the nearest point first
        }
        loop.add(loop.get(0));

        List<double[]> result = length(loop) < MIN_LOOP_LENGTH ? List.of(centroid(loop)) : simplify(loop, SIMPLIFY_TOLERANCE);
        List<double[]> out = new ArrayList<>(result.size());
        for (double[] p : result) out.add(new double[]{p[0] + area.minCX(), p[1] + area.minCZ()});
        return out;
    }

    /** Blank chunks left that a loop could still go round: for a time estimate. */
    public static long openCells(Area area, ChunkTest explored) {
        long n = 0;
        for (int cx = area.minCX(); cx <= area.maxCX(); cx++) {
            for (int cz = area.minCZ(); cz <= area.maxCZ(); cz++) if (!explored.test(cx, cz)) n++;
        }
        return n;
    }

    /** Explored patches (4-connected) smaller than {@code minSize} chunks count as blank. */
    private static void dropSpecks(boolean[] wall, int w, int h, int minSize) {
        boolean[] seen = new boolean[wall.length];
        int[] queue = new int[wall.length];
        for (int start = 0; start < wall.length; start++) {
            if (!wall[start] || seen[start]) continue;
            int head = 0, tail = 0;
            queue[tail++] = start;
            seen[start] = true;
            while (head < tail) {
                int i = queue[head++], x = i % w, z = i / w;
                if (x > 0 && wall[i - 1] && !seen[i - 1]) { seen[i - 1] = true; queue[tail++] = i - 1; }
                if (x < w - 1 && wall[i + 1] && !seen[i + 1]) { seen[i + 1] = true; queue[tail++] = i + 1; }
                if (z > 0 && wall[i - w] && !seen[i - w]) { seen[i - w] = true; queue[tail++] = i - w; }
                if (z < h - 1 && wall[i + w] && !seen[i + w]) { seen[i + w] = true; queue[tail++] = i + w; }
            }
            if (tail < minSize) for (int k = 0; k < tail; k++) wall[queue[k]] = false;
        }
    }

    /**
     * Distance from each chunk to the nearest explored one, in chunks (3-4 chamfer, close to the
     * straight-line distance). Beyond the area edge counts as explored.
     */
    private static float[] distances(boolean[] wall, int w, int h) {
        int[] d = new int[w * h];
        final int inf = Integer.MAX_VALUE / 4;
        for (int i = 0; i < d.length; i++) d[i] = wall[i] ? 0 : inf;

        for (int z = 0; z < h; z++) {
            for (int x = 0; x < w; x++) {
                int i = x + z * w;
                if (d[i] == 0) continue;
                int v = d[i];
                v = Math.min(v, at(d, w, h, x - 1, z) + 3);
                v = Math.min(v, at(d, w, h, x - 1, z - 1) + 4);
                v = Math.min(v, at(d, w, h, x, z - 1) + 3);
                v = Math.min(v, at(d, w, h, x + 1, z - 1) + 4);
                d[i] = v;
            }
        }
        for (int z = h - 1; z >= 0; z--) {
            for (int x = w - 1; x >= 0; x--) {
                int i = x + z * w;
                if (d[i] == 0) continue;
                int v = d[i];
                v = Math.min(v, at(d, w, h, x + 1, z) + 3);
                v = Math.min(v, at(d, w, h, x + 1, z + 1) + 4);
                v = Math.min(v, at(d, w, h, x, z + 1) + 3);
                v = Math.min(v, at(d, w, h, x - 1, z + 1) + 4);
                d[i] = v;
            }
        }

        float[] out = new float[d.length];
        for (int i = 0; i < d.length; i++) out[i] = d[i] / 3f;
        return out;
    }

    private static int at(int[] d, int w, int h, int x, int z) {
        return x < 0 || z < 0 || x >= w || z >= h ? 0 : d[x + z * w];
    }

    private static float sample(float[] dist, int w, int h, int x, int z) {
        return x < 0 || z < 0 || x >= w || z >= h ? 0 : dist[x + z * w];
    }

    /**
     * Closed lines where the distance crosses {@code level} (marching squares, one cell of
     * "explored" padding round the area so every line closes).
     */
    private static List<List<double[]>> isoLoops(float[] dist, int w, int h, double level) {
        Long2ObjectOpenHashMap<double[]> points = new Long2ObjectOpenHashMap<>();
        Long2ObjectOpenHashMap<long[]> links = new Long2ObjectOpenHashMap<>();

        for (int z = -1; z < h; z++) {
            for (int x = -1; x < w; x++) {
                float a = sample(dist, w, h, x, z), b = sample(dist, w, h, x + 1, z);
                float c = sample(dist, w, h, x + 1, z + 1), d = sample(dist, w, h, x, z + 1);
                boolean ia = a >= level, ib = b >= level, ic = c >= level, id = d >= level;
                int crossings = (ia != ib ? 1 : 0) + (ib != ic ? 1 : 0) + (ic != id ? 1 : 0) + (id != ia ? 1 : 0);
                if (crossings == 0) continue;

                // Edges round the square: top a-b, right b-c, bottom d-c, left a-d
                long top = edgeKey(x, z, false), right = edgeKey(x + 1, z, true);
                long bottom = edgeKey(x, z + 1, false), left = edgeKey(x, z, true);
                if (ia != ib) points.put(top, new double[]{x + t(a, b, level), z});
                if (ib != ic) points.put(right, new double[]{x + 1, z + t(b, c, level)});
                if (id != ic) points.put(bottom, new double[]{x + t(d, c, level), z + 1});
                if (ia != id) points.put(left, new double[]{x, z + t(a, d, level)});

                if (crossings == 2) {
                    long[] ends = new long[2];
                    int n = 0;
                    if (ia != ib) ends[n++] = top;
                    if (ib != ic) ends[n++] = right;
                    if (id != ic) ends[n++] = bottom;
                    if (ia != id) ends[n++] = left;
                    link(links, ends[0], ends[1]);
                } else {
                    // Saddle: the middle decides which corners get cut off
                    boolean centre = (a + b + c + d) / 4 >= level;
                    if (ia != centre) {
                        link(links, left, top);
                        link(links, right, bottom);
                    } else {
                        link(links, top, right);
                        link(links, bottom, left);
                    }
                }
            }
        }

        List<List<double[]>> loops = new ArrayList<>();
        LongOpenHashSet used = new LongOpenHashSet();
        for (long start : links.keySet()) {
            if (used.contains(start)) continue;
            List<double[]> loop = new ArrayList<>();
            long prev = Long.MIN_VALUE, cur = start;
            while (cur != Long.MIN_VALUE && used.add(cur)) {
                loop.add(points.get(cur));
                long[] next = links.get(cur);
                long step = next[0] != prev && !used.contains(next[0]) ? next[0] : next[1] != prev && !used.contains(next[1]) ? next[1] : Long.MIN_VALUE;
                prev = cur;
                cur = step;
            }
            if (loop.size() >= 2) loops.add(loop);
        }
        return loops;
    }

    private static long edgeKey(int x, int z, boolean vertical) {
        return ((((long) (x + 2)) << 32) | ((z + 2) & 0xffffffffL)) * 2 + (vertical ? 1 : 0);
    }

    private static double t(float from, float to, double level) {
        return (level - from) / (to - from);
    }

    private static void link(Long2ObjectOpenHashMap<long[]> links, long a, long b) {
        add(links, a, b);
        add(links, b, a);
    }

    private static void add(Long2ObjectOpenHashMap<long[]> links, long from, long to) {
        long[] l = links.get(from);
        if (l == null) links.put(from, new long[]{to, Long.MIN_VALUE});
        else l[1] = to;
    }

    /** Whether the blank side is on the left of the loop's first leg: every loop then turns the same way, so they chain into a spiral. */
    private static boolean blankOnLeft(List<double[]> loop, float[] dist, int w, int h, double level) {
        double[] a = loop.get(0), b = loop.get(1);
        double dx = b[0] - a[0], dz = b[1] - a[1], len = Math.hypot(dx, dz);
        if (len < 1e-9) return true;
        double mx = (a[0] + b[0]) / 2 + dz / len * 0.5, mz = (a[1] + b[1]) / 2 - dx / len * 0.5;
        return sample(dist, w, h, (int) Math.round(mx), (int) Math.round(mz)) >= level;
    }

    private static double length(List<double[]> line) {
        double l = 0;
        for (int i = 1; i < line.size(); i++) l += Math.hypot(line.get(i)[0] - line.get(i - 1)[0], line.get(i)[1] - line.get(i - 1)[1]);
        return l;
    }

    private static double[] centroid(List<double[]> line) {
        double x = 0, z = 0;
        for (double[] p : line) {
            x += p[0];
            z += p[1];
        }
        return new double[]{x / line.size(), z / line.size()};
    }

    private static List<double[]> simplifyOpen(List<double[]> line, double tolerance) {
        if (line.size() < 3) return line;
        boolean[] keep = new boolean[line.size()];
        keep[0] = keep[line.size() - 1] = true;
        simplify(line, 0, line.size() - 1, tolerance, keep);
        List<double[]> out = new ArrayList<>();
        for (int i = 0; i < line.size(); i++) if (keep[i]) out.add(line.get(i));
        return out;
    }

    /** Douglas-Peucker: drops points closer than {@code tolerance} to the segment through their neighbours. */
    private static List<double[]> simplify(List<double[]> line, double tolerance) {
        boolean[] keep = new boolean[line.size()];
        keep[0] = keep[line.size() - 1] = true;
        // The loop starts and ends at the same point: split it at its far point so neither half is degenerate
        int far = 0;
        double farDist = -1;
        for (int i = 1; i < line.size() - 1; i++) {
            double d = Math.hypot(line.get(i)[0] - line.get(0)[0], line.get(i)[1] - line.get(0)[1]);
            if (d > farDist) {
                farDist = d;
                far = i;
            }
        }
        if (far > 0) {
            keep[far] = true;
            simplify(line, 0, far, tolerance, keep);
            simplify(line, far, line.size() - 1, tolerance, keep);
        }
        List<double[]> out = new ArrayList<>();
        for (int i = 0; i < line.size(); i++) if (keep[i]) out.add(line.get(i));
        return out;
    }

    private static void simplify(List<double[]> line, int from, int to, double tolerance, boolean[] keep) {
        if (to - from < 2) return;
        double[] a = line.get(from), b = line.get(to);
        double dx = b[0] - a[0], dz = b[1] - a[1], len = Math.hypot(dx, dz);
        int worst = -1;
        double worstDist = tolerance;
        for (int i = from + 1; i < to; i++) {
            double[] p = line.get(i);
            double projection = len < 1e-9 ? 0 : Math.max(0, Math.min(1,
                ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / (len * len)));
            double d = Math.hypot(p[0] - a[0] - projection * dx, p[1] - a[1] - projection * dz);
            if (d > worstDist) {
                worstDist = d;
                worst = i;
            }
        }
        if (worst < 0) return;
        keep[worst] = true;
        simplify(line, from, worst, tolerance, keep);
        simplify(line, worst, to, tolerance, keep);
    }
}
