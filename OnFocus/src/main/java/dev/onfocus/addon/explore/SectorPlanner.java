package dev.onfocus.addon.explore;

import dev.onfocus.addon.explore.CoveragePlanner.Area;
import dev.onfocus.addon.explore.CoveragePlanner.ChunkTest;
import dev.onfocus.addon.explore.CoveragePlanner.Segment;
import java.util.ArrayList;
import java.util.List;

/**
 * Routes inside one sector. Two route families compete on length, including the crossing to the
 * reserved next sector: an inset perimeter followed by the core, and a plain snake whose turns run
 * along the inset edges. Both cover every chunk, corners included, for the given swath.
 */
public final class SectorPlanner {
    /** Smallest and fallback swath: chunks loaded to each side of the flight line. */
    public static final int REACH = 2;
    public static final double ARRIVAL_BLOCKS = 6;

    private SectorPlanner() {}
    private record Candidate(List<Segment> route, int perimeter) {}

    public static Area flightArea(Area sector) {
        return flightArea(sector, REACH);
    }

    public static Area flightArea(Area sector, int reach) {
        int xInset = Math.min(reach, (sector.width() - 1) / 2);
        int zInset = Math.min(reach, (sector.depth() - 1) / 2);
        return new Area(sector.minCX() + xInset, sector.minCZ() + zInset,
            sector.maxCX() - xInset, sector.maxCZ() - zInset);
    }

    /** Distance between strips that share no chunks. */
    public static int spacing(int reach) {
        return 2 * reach + 1;
    }

    /** Nearest sector size (at least 8) that a whole number of strips covers without overlap. */
    public static int fittedSize(int size, int reach) {
        int spacing = spacing(reach);
        int lower = Math.max(spacing, size / spacing * spacing), upper = lower + spacing;
        int best = size - lower <= upper - size ? lower : upper;
        while (best < 8) best += spacing;
        return best;
    }

    public static List<Segment> sweep(Area sector, ChunkTest done, double fromX, double fromZ) {
        return sweep(sector, REACH, done, fromX, fromZ, null);
    }

    public static List<Segment> sweep(Area sector, ChunkTest done, double fromX, double fromZ, Area nextSector) {
        return sweep(sector, REACH, done, fromX, fromZ, nextSector);
    }

    /** The shortest perimeter or snake route, finishing on the side shared with the next sector. */
    public static List<Segment> sweep(Area sector, int reach, ChunkTest done, double fromX, double fromZ, Area nextSector) {
        List<Segment> best = List.of();
        double bestCost = Double.POSITIVE_INFINITY;
        for (int first = 0; first < 4; first++) for (int direction : new int[]{1, -1}) {
            Candidate candidate = perimeterCandidate(sector, reach, done, fromX, fromZ, first, direction);
            if (candidate.route().isEmpty()) return candidate.route();
            for (int reverse = 0; reverse < 2; reverse++) {
                List<Segment> route = new ArrayList<>(candidate.route());
                // Perimeter legs always precede the interior. Reverse only
                // the interior work, preserving corner-first coverage.
                int perimeter = candidate.perimeter();
                if (reverse == 1 && route.size() > perimeter) {
                    List<Segment> interior = new ArrayList<>();
                    for (int i = route.size() - 1; i >= perimeter; i--) interior.add(route.get(i).reversed());
                    route.subList(perimeter, route.size()).clear();
                    route.addAll(interior);
                }
                double cost = finishRoute(sector, reach, nextSector, route, fromX, fromZ);
                if (cost < bestCost) { bestCost = cost; best = route; }
            }
        }
        for (boolean alongX : new boolean[]{true, false}) for (boolean fromMax : new boolean[]{false, true}) {
            for (boolean startHigh : new boolean[]{false, true}) {
                List<Segment> route = snake(sector, reach, done, alongX, fromMax, startHigh);
                if (route.isEmpty()) continue;
                double cost = finishRoute(sector, reach, nextSector, route, fromX, fromZ);
                if (cost < bestCost) { bestCost = cost; best = route; }
            }
        }
        return best;
    }

    private static Candidate perimeterCandidate(Area sector, int reach, ChunkTest done, double fromX, double fromZ, int first, int direction) {
        Area inner = flightArea(sector, reach);
        int[][] corners = {{inner.minCX(), inner.minCZ()}, {inner.maxCX(), inner.minCZ()},
            {inner.maxCX(), inner.maxCZ()}, {inner.minCX(), inner.maxCZ()}};
        int[] a0 = corners[first], b0 = corners[Math.floorMod(first + direction, 4)];
        int entryX = clamp((int) Math.round(fromX), Math.min(a0[0], b0[0]), Math.max(a0[0], b0[0]));
        int entryZ = clamp((int) Math.round(fromZ), Math.min(a0[1], b0[1]), Math.max(a0[1], b0[1]));
        List<Segment> route = new ArrayList<>();
        for (int step = 0; step < 4; step++) {
            int[] a = corners[Math.floorMod(first + direction * step, 4)];
            int[] b = corners[Math.floorMod(first + direction * (step + 1), 4)];
            appendPerimeter(route, sector, reach, done, step == 0 ? entryX : a[0], step == 0 ? entryZ : a[1], b[0], b[1]);
        }
        if (entryX != a0[0] || entryZ != a0[1]) appendPerimeter(route, sector, reach, done, a0[0], a0[1], entryX, entryZ);
        int perimeter = route.size();
        // The perimeter already covers the outer rows from every edge. Only the remaining core
        // needs strips, spaced by the guaranteed footprint, without overlap.
        int edge = spacing(reach);
        if (sector.width() > 2 * edge && sector.depth() > 2 * edge) {
            Area core = new Area(sector.minCX() + edge, sector.minCZ() + edge,
                sector.maxCX() - edge, sector.maxCZ() - edge);
            if (!route.isEmpty()) {
                Segment last = route.getLast();
                fromX = last.x2(); fromZ = last.z2();
            }
            for (Segment leg : CoveragePlanner.sweep(core, reach, 0, done, fromX, fromZ)) route.add(project(sector, reach, leg));
        }
        return new Candidate(route, perimeter);
    }

    /**
     * Strips across the sector, each placed {@code reach} rows past the first row still open, and
     * trimmed to the open stretch of its band. Its turns follow the inset edges, so the sector's
     * corners and sides are covered without a separate perimeter lap.
     */
    private static List<Segment> snake(Area sector, int reach, ChunkTest done, boolean alongX, boolean fromMax, boolean startHigh) {
        Area inner = flightArea(sector, reach);
        int vMin = alongX ? sector.minCZ() : sector.minCX(), vMax = alongX ? sector.maxCZ() : sector.maxCX();
        int uMin = alongX ? sector.minCX() : sector.minCZ(), uMax = alongX ? sector.maxCX() : sector.maxCZ();
        int innerVMin = alongX ? inner.minCZ() : inner.minCX(), innerVMax = alongX ? inner.maxCZ() : inner.maxCX();
        int innerUMin = alongX ? inner.minCX() : inner.minCZ(), innerUMax = alongX ? inner.maxCX() : inner.maxCZ();
        int step = fromMax ? -1 : 1;
        List<Segment> route = new ArrayList<>();
        boolean high = startHigh;
        int v = fromMax ? vMax : vMin;
        while (v >= vMin && v <= vMax) {
            int open = v;
            while (open >= vMin && open <= vMax && !rowOpen(sector, done, alongX, open, uMin, uMax)) open += step;
            if (open < vMin || open > vMax) break;
            int row = clamp(open + step * reach, innerVMin, innerVMax);
            int bandMin = Math.max(vMin, row - reach), bandMax = Math.min(vMax, row + reach);
            int first = Integer.MAX_VALUE, last = Integer.MIN_VALUE;
            for (int u = uMin; u <= uMax; u++) {
                for (int b = bandMin; b <= bandMax; b++) {
                    if (!done.test(alongX ? u : b, alongX ? b : u)) {
                        first = Math.min(first, u);
                        last = Math.max(last, u);
                        break;
                    }
                }
            }
            int a = clamp(first + reach, innerUMin, innerUMax), b = clamp(last - reach, innerUMin, innerUMax);
            if (a > b) a = b = clamp(Math.floorDiv(first + last, 2), innerUMin, innerUMax);
            int start = high ? b : a, end = high ? a : b;
            route.add(alongX ? new Segment(start, row, end, row) : new Segment(row, start, row, end));
            high = !high;
            v = row + step * (reach + 1);
        }
        return route;
    }

    private static boolean rowOpen(Area sector, ChunkTest done, boolean alongX, int v, int uMin, int uMax) {
        for (int u = uMin; u <= uMax; u++) if (!done.test(alongX ? u : v, alongX ? v : u)) return true;
        return false;
    }

    private static void appendPerimeter(List<Segment> route, Area sector, int reach, ChunkTest done, int x1, int z1, int x2, int z2) {
        if (!CoveragePlanner.hasOpenAlong(sector, reach, done, x1, z1, x2, z2)) return;
        Segment leg = new Segment(x1, z1, x2, z2);
        if (leg.isSpot() && !route.isEmpty()) return;
        if (!route.contains(leg) && !route.contains(leg.reversed())) route.add(leg);
    }

    public static List<Segment> cleanup(Area sector, ChunkTest done, double fromX, double fromZ) {
        return cleanup(sector, REACH, done, fromX, fromZ, null);
    }

    public static List<Segment> cleanup(Area sector, ChunkTest done, double fromX, double fromZ, Area nextSector) {
        return cleanup(sector, REACH, done, fromX, fromZ, nextSector);
    }

    public static List<Segment> cleanup(Area sector, int reach, ChunkTest done, double fromX, double fromZ, Area nextSector) {
        List<Segment> route = new ArrayList<>(CoveragePlanner.cleanup(sector, reach, done, fromX, fromZ).stream()
            .map(spot -> project(sector, reach, spot)).distinct().toList());
        if (route.isEmpty()) return route;
        List<Segment> reversed = new ArrayList<>(route.reversed());
        double forwardCost = finishRoute(sector, reach, nextSector, route, fromX, fromZ);
        double reverseCost = finishRoute(sector, reach, nextSector, reversed, fromX, fromZ);
        return reverseCost < forwardCost ? reversed : route;
    }

    private static double finishRoute(Area sector, int reach, Area nextSector, List<Segment> route, double fromX, double fromZ) {
        Segment last = route.getLast();
        if (nextSector != null) {
            Segment exit = exitPoint(sector, reach, nextSector, last.x2(), last.z2());
            if (exit.x1() != last.x2() || exit.z1() != last.z2()) route.add(exit);
            Area entry = flightArea(nextSector, reach);
            double dx = Math.max(entry.minCX() - exit.x1(), Math.max(0, exit.x1() - entry.maxCX()));
            double dz = Math.max(entry.minCZ() - exit.z1(), Math.max(0, exit.z1() - entry.maxCZ()));
            return CoveragePlanner.routeLength(route, fromX, fromZ) + Math.hypot(dx, dz);
        }
        return CoveragePlanner.routeLength(route, fromX, fromZ);
    }

    /** Cost of the whole local job plus crossing into a candidate neighbour. */
    public static double handoffCost(Area sector, Area nextSector, ChunkTest done, double fromX, double fromZ) {
        return handoffCost(sector, REACH, nextSector, done, fromX, fromZ);
    }

    public static double handoffCost(Area sector, int reach, Area nextSector, ChunkTest done, double fromX, double fromZ) {
        List<Segment> route = new ArrayList<>(sweep(sector, reach, done, fromX, fromZ, nextSector));
        if (route.isEmpty()) route.add(exitPoint(sector, reach, nextSector, fromX, fromZ));
        return finishRoute(sector, reach, nextSector, route, fromX, fromZ);
    }

    public static Segment exitPoint(Area sector, Area nextSector, double fromX, double fromZ) {
        return exitPoint(sector, REACH, nextSector, fromX, fromZ);
    }

    /** A point on the inset side facing the reserved next sector. */
    public static Segment exitPoint(Area sector, int reach, Area nextSector, double fromX, double fromZ) {
        Area inner = flightArea(sector, reach);
        int x = clamp((int) Math.round(fromX), inner.minCX(), inner.maxCX());
        int z = clamp((int) Math.round(fromZ), inner.minCZ(), inner.maxCZ());
        if (nextSector.minCX() > sector.maxCX()) x = inner.maxCX();
        else if (nextSector.maxCX() < sector.minCX()) x = inner.minCX();
        else if (nextSector.minCZ() > sector.maxCZ()) z = inner.maxCZ();
        else z = inner.minCZ();
        return new Segment(x, z, x, z);
    }

    public static Segment project(Area sector, Segment leg) {
        return project(sector, REACH, leg);
    }

    public static Segment project(Area sector, int reach, Segment leg) {
        Area inner = flightArea(sector, reach);
        return new Segment(clamp(leg.x1(), inner.minCX(), inner.maxCX()), clamp(leg.z1(), inner.minCZ(), inner.maxCZ()),
            clamp(leg.x2(), inner.minCX(), inner.maxCX()), clamp(leg.z2(), inner.minCZ(), inner.maxCZ()));
    }

    /** Bound one movement component without teleporting a player approaching from outside. */
    public static double boundMovement(double position, double movement, double min, double max) {
        if (position < min) return Math.max(0, Math.min(movement, max - position));
        if (position > max) return Math.min(0, Math.max(movement, min - position));
        return Math.max(min - position, Math.min(movement, max - position));
    }

    private static int clamp(int value, int min, int max) { return Math.max(min, Math.min(value, max)); }
}
