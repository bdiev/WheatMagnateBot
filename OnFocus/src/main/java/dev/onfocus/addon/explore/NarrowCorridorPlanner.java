package dev.onfocus.addon.explore;

import dev.onfocus.addon.explore.CoveragePlanner.Area;
import dev.onfocus.addon.explore.CoveragePlanner.ChunkTest;

import java.util.ArrayList;
import java.util.List;

/** Centre lines of blank runs that fit inside one flight swath, bounded by mapped ground or area edges. */
public final class NarrowCorridorPlanner {
    private record Run(int lo, int hi, List<double[]> path) {}

    private NarrowCorridorPlanner() {}

    public static List<double[]> nearest(Area area, int reach, ChunkTest mapped, double fromX, double fromZ) {
        List<List<double[]>> paths = new ArrayList<>();
        collect(area, reach, mapped, true, paths);
        collect(area, reach, mapped, false, paths);
        List<double[]> best = null;
        int start = 0;
        double distance = Double.POSITIVE_INFINITY;
        for (List<double[]> path : paths) {
            // Isolated spots belong to the cleanup; a corridor must have a direction.
            if (path.size() < 2) continue;
            for (int i = 0; i < path.size(); i++) {
                double[] p = path.get(i);
                double d = Math.hypot(p[0] - fromX, p[1] - fromZ);
                if (d < distance) {
                    distance = d;
                    best = path;
                    start = i;
                }
            }
        }
        if (best == null) return List.of();

        // Compare complete travel distance, not just the distance to the nearest point. Going
        // straight to an endpoint can avoid a long repeated section of a winding corridor.
        double length = 0, toStart = 0;
        for (int i = 1; i < best.size(); i++) {
            double leg = distance(best.get(i - 1), best.get(i));
            length += leg;
            if (i <= start) toStart += leg;
        }
        double viaMiddle = distance + length + Math.min(toStart, length - toStart);
        double viaStart = Math.hypot(best.getFirst()[0] - fromX, best.getFirst()[1] - fromZ) + length;
        double viaEnd = Math.hypot(best.getLast()[0] - fromX, best.getLast()[1] - fromZ) + length;
        if (Math.min(viaStart, viaEnd) <= viaMiddle) start = viaStart <= viaEnd ? 0 : best.size() - 1;

        // Never close the path with a straight chord across mapped ground.
        List<double[]> route = new ArrayList<>();
        if (start == 0 || start != best.size() - 1 && toStart <= length - toStart) {
            for (int i = start; i >= 0; i--) route.add(best.get(i));
            for (int i = 1; i < best.size(); i++) route.add(best.get(i));
        } else {
            for (int i = start; i < best.size(); i++) route.add(best.get(i));
            for (int i = best.size() - 2; i >= 0; i--) route.add(best.get(i));
        }
        return route;
    }

    private static double distance(double[] a, double[] b) {
        return Math.hypot(a[0] - b[0], a[1] - b[1]);
    }

    private static void collect(Area area, int reach, ChunkTest mapped, boolean alongZ, List<List<double[]>> paths) {
        int maxWidth = 2 * reach + 1;
        int minU = alongZ ? area.minCZ() : area.minCX(), maxU = alongZ ? area.maxCZ() : area.maxCX();
        int minV = alongZ ? area.minCX() : area.minCZ(), maxV = alongZ ? area.maxCX() : area.maxCZ();
        List<Run> previous = List.of();
        for (int u = minU; u <= maxU; u++) {
            List<Run> current = new ArrayList<>();
            for (int v = minV; v <= maxV; ) {
                if (done(mapped, alongZ, u, v)) { v++; continue; }
                int lo = v;
                while (v <= maxV && !done(mapped, alongZ, u, v)) v++;
                int hi = v - 1;
                if (hi - lo + 1 <= maxWidth) current.add(new Run(lo, hi, new ArrayList<>()));
            }
            List<Run> connected = new ArrayList<>(current.size());
            int previousIndex = 0;
            for (int runIndex = 0; runIndex < current.size(); runIndex++) {
                Run run = current.get(runIndex);
                Run parent = null;
                int parents = 0;
                while (previousIndex < previous.size() && previous.get(previousIndex).hi() + 1 < run.lo()) previousIndex++;
                for (int i = previousIndex; i < previous.size() && previous.get(i).lo() <= run.hi() + 1; i++) {
                    Run old = previous.get(i);
                    if (overlaps(run, old)) { parent = old; parents++; }
                }
                boolean fork = parents == 1 && ((runIndex > 0 && overlaps(parent, current.get(runIndex - 1)))
                    || (runIndex + 1 < current.size() && overlaps(parent, current.get(runIndex + 1))));
                List<double[]> path;
                // Stop at forks rather than joining unrelated centre lines through mapped ground.
                if (parents == 1 && !fork) {
                    path = parent.path();
                    if (path.size() == 1) paths.add(path);
                    // Cross the slice boundary inside their shared blank interval, including at
                    // sudden width changes where a direct centre-to-centre chord cuts mapped ground.
                    double join = (Math.max(parent.lo(), run.lo()) + Math.min(parent.hi(), run.hi())) / 2.0;
                    path.add(alongZ ? new double[]{join, u - 0.5} : new double[]{u - 0.5, join});
                }
                else {
                    path = run.path();
                }
                double centre = (run.lo() + run.hi()) / 2.0;
                path.add(alongZ ? new double[]{centre, u} : new double[]{u, centre});
                connected.add(new Run(run.lo(), run.hi(), path));
            }
            previous = connected;
        }
    }

    private static boolean overlaps(Run a, Run b) {
        // Consecutive slices may touch at a corner in a one-chunk diagonal corridor.
        return Math.max(a.lo(), b.lo()) <= Math.min(a.hi(), b.hi()) + 1;
    }

    private static boolean done(ChunkTest mapped, boolean alongZ, int u, int v) {
        return alongZ ? mapped.test(v, u) : mapped.test(u, v);
    }
}
