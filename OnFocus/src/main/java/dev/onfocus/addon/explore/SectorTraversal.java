package dev.onfocus.addon.explore;

import dev.onfocus.addon.explore.CoveragePlanner.Area;
import dev.onfocus.addon.explore.CoveragePlanner.ChunkTest;
import java.util.ArrayList;
import java.util.BitSet;
import java.util.List;

/**
 * Which sector to work next. A side neighbour with work is preferred, and among those the one with
 * the fewest open neighbours of its own (Warnsdorff), so the run doesn't leave stranded holes. With
 * no open neighbour, it heads straight for the nearest open sector over finished ground.
 * <p>
 * A sector that can't be finished is deferred and retried once after every other sector; failing
 * again, it is skipped and reported, so one bad sector never stops the run.
 */
public final class SectorTraversal {
    public enum State { OPEN, COMPLETED, DEFERRED, SKIPPED }

    /** Weight of each open neighbour a candidate keeps, in sector widths. */
    private static final double WARNSDORFF_WEIGHT = 0.5;

    private final List<Area> sectors = new ArrayList<>();
    private final int size;
    private final int first;
    private final int columns, rows;
    private final boolean worldGrid;
    private final int originX, originZ;
    private final BitSet completed = new BitSet(), deferred = new BitSet(), skipped = new BitSet();
    private boolean retrying;
    private int currentIndex, reservedNext = -2, priority = -1;
    private int reach = SectorPlanner.REACH;

    public SectorTraversal(Area area, int size, double fromX, double fromZ) {
        this(area, size, false, -1, 0, fromX, fromZ);
    }

    /** {@code worldGrid}: sector edges on multiples of the size in world chunk coordinates, the same for every selection. */
    public SectorTraversal(Area area, int size, boolean worldGrid, double fromX, double fromZ) {
        this(area, size, worldGrid, -1, 0, fromX, fromZ);
    }

    public SectorTraversal(Area area, int size, int first, int visited, double fromX, double fromZ) {
        this(area, size, false, first, visited, fromX, fromZ);
    }

    private SectorTraversal(Area area, int size, boolean worldGrid, int first, int visited, double fromX, double fromZ) {
        if (size <= 0) throw new IllegalArgumentException("Sector size must be positive");
        this.size = size;
        this.worldGrid = worldGrid;
        originX = worldGrid ? Math.floorDiv(area.minCX(), size) * size : area.minCX();
        originZ = worldGrid ? Math.floorDiv(area.minCZ(), size) * size : area.minCZ();
        columns = Math.floorDiv(area.maxCX() - originX, size) + 1;
        rows = Math.floorDiv(area.maxCZ() - originZ, size) + 1;
        for (int i = 0; i < columns * rows; i++) {
            int column = column(i), row = row(i);
            int x = originX + column * size, z = originZ + row * size;
            sectors.add(new Area(Math.max(x, area.minCX()), Math.max(z, area.minCZ()),
                Math.min(x + size - 1, area.maxCX()), Math.min(z + size - 1, area.maxCZ())));
        }
        int nearest = 0;
        double distance = Double.POSITIVE_INFINITY;
        for (int i = 0; i < sectors.size(); i++) {
            double candidate = distance(sectors.get(i), fromX, fromZ);
            if (candidate < distance) { distance = candidate; nearest = i; }
        }
        this.first = first >= 0 && first < sectors.size() ? first : nearest;
        int count = Math.max(0, Math.min(visited, total()));
        for (int i = 0; i < count; i++) completed.set((this.first + i) % total());
        currentIndex = count < total() ? (this.first + count) % total() : -1;
    }

    /** New sessions save explicit sector identities instead of a position in a fixed snake. */
    public SectorTraversal(Area area, int size, int current, long[] done, double fromX, double fromZ) {
        this(area, size, false, fromX, fromZ);
        restore(current, done, new long[0], new long[0], false, -1);
    }

    public void restore(int current, long[] done, long[] deferredSectors, long[] skippedSectors, boolean retryRound, int prioritised) {
        completed.clear();
        completed.or(BitSet.valueOf(done));
        deferred.clear();
        deferred.or(BitSet.valueOf(deferredSectors));
        skipped.clear();
        skipped.or(BitSet.valueOf(skippedSectors));
        for (BitSet set : List.of(completed, deferred, skipped)) if (set.length() > total()) set.clear(total(), set.length());
        retrying = retryRound;
        priority = prioritised >= 0 && prioritised < total() ? prioritised : -1;
        currentIndex = current >= 0 && current < total() ? current : finished() ? -1 : currentIndex;
        reservedNext = -2;
    }

    // Legacy grids number the sectors as a snake, so saved indices keep meaning the same sector.
    private int column(int index) {
        int row = index / columns, step = index % columns;
        return worldGrid || row % 2 == 0 ? step : columns - 1 - step;
    }

    private int row(int index) {
        return index / columns;
    }

    private int index(int column, int row) {
        return row * columns + (worldGrid || row % 2 == 0 ? column : columns - 1 - column);
    }

    public int size() { return size; }
    public int first() { return first; }
    public boolean worldGrid() { return worldGrid; }
    public int columns() { return columns; }
    public int rows() { return rows; }
    public int originX() { return originX; }
    public int originZ() { return originZ; }
    /** Sectors finished or given up on. */
    public int visited() { return completed.cardinality() + skipped.cardinality(); }
    public int total() { return sectors.size(); }
    public int currentIndex() { return currentIndex; }
    public int priority() { return priority; }
    public boolean retrying() { return retrying; }
    public long[] completed() { return completed.toLongArray(); }
    public long[] deferred() { return deferred.toLongArray(); }
    public long[] skipped() { return skipped.toLongArray(); }
    public int skippedCount() { return skipped.cardinality(); }
    public int deferredCount() { return deferred.cardinality(); }
    public Area current() { return currentIndex < 0 ? null : sectors.get(currentIndex); }
    public Area sector(int index) { return sectors.get(index); }
    public boolean transit() { return currentIndex >= 0 && completed.get(currentIndex); }
    public Area plannedNext() { return reservedNext >= 0 ? sectors.get(reservedNext) : null; }
    public int plannedNextIndex() { return reservedNext; }
    public int reach() { return reach; }

    /** The inset used for exits follows the swath the current route was planned with. */
    public void setReach(int reach) {
        this.reach = Math.max(1, reach);
    }

    public State state(int index) {
        if (skipped.get(index)) return State.SKIPPED;
        if (completed.get(index)) return State.COMPLETED;
        if (deferred.get(index)) return State.DEFERRED;
        return State.OPEN;
    }

    /** The sector at grid cell (column, row), or -1 outside the grid. */
    public int indexAt(int column, int row) {
        return column < 0 || column >= columns || row < 0 || row >= rows ? -1 : index(column, row);
    }

    /** The sector holding the chunk, or -1 outside the selection. */
    public int indexOf(int cx, int cz) {
        int index = indexAt(Math.floorDiv(cx - originX, size), Math.floorDiv(cz - originZ, size));
        return index >= 0 && sectors.get(index).contains(cx, cz) ? index : -1;
    }

    /** Old cyclic sessions can retain a destination across the entire selection. Resume locally. */
    public boolean reanchorIfDistant(double fromX, double fromZ) {
        if (current() == null || distance(current(), fromX, fromZ) <= size) return false;
        int nearest = currentIndex;
        double best = distance(current(), fromX, fromZ);
        for (int i = 0; i < total(); i++) {
            double candidate = distance(sectors.get(i), fromX, fromZ);
            if (candidate < best) {
                nearest = i;
                best = candidate;
            }
        }
        if (nearest == currentIndex) return false;
        currentIndex = nearest;
        reservedNext = -2;
        return true;
    }

    public long missing(ChunkTest confirmed) {
        return currentIndex < 0 ? 0 : missing(currentIndex, confirmed);
    }

    public long missing(int index, ChunkTest confirmed) {
        Area sector = sectors.get(index);
        long missing = 0;
        for (int x = sector.minCX(); x <= sector.maxCX(); x++) {
            for (int z = sector.minCZ(); z <= sector.maxCZ(); z++) {
                if (!confirmed.test(x, z)) missing++;
            }
        }
        return missing;
    }

    /** Unconfirmed chunks of every sector still to be worked (current included), for the estimate. */
    public long[] remainingWork(ChunkTest confirmed) {
        long[] work = new long[total()];
        for (int i = 0; i < total(); i++) {
            if (completed.get(i) || skipped.get(i)) continue;
            work[i] = missing(i, confirmed);
        }
        return work;
    }

    /** Reserve the next sector before planning the current sector's exit. */
    public Area next(ChunkTest confirmed, double fromX, double fromZ) {
        if (currentIndex < 0) return null;
        if (reservedNext == -2) reservedNext = chooseNext(confirmed, fromX, fromZ);
        return reservedNext < 0 ? null : sectors.get(reservedNext);
    }

    /** Whether the reserved next sector is a side neighbour, entered at the shared exit. */
    public boolean nextIsAdjacent() {
        return reservedNext >= 0 && currentIndex >= 0 && adjacent(currentIndex, reservedNext);
    }

    public boolean canAdvance(ChunkTest confirmed, double fromX, double fromZ) {
        if (current() == null || missing(confirmed) != 0) return false;
        Area next = next(confirmed, fromX, fromZ);
        // Nothing left, or a jump over finished ground: no shared exit to reach first
        if (next == null || !adjacent(currentIndex, reservedNext)) return true;
        Area inner = SectorPlanner.flightArea(current(), reach);
        if (!current().contains((int) Math.floor(fromX + 0.5), (int) Math.floor(fromZ + 0.5))) return false;
        if (next.minCX() > current().maxCX()) return fromX >= inner.maxCX() - 0.375;
        if (next.maxCX() < current().minCX()) return fromX <= inner.minCX() + 0.375;
        if (next.minCZ() > current().maxCZ()) return fromZ >= inner.maxCZ() - 0.375;
        return fromZ <= inner.minCZ() + 0.375;
    }

    /** Advance only on confirmed coverage. */
    public boolean advance(ChunkTest confirmed, double fromX, double fromZ) {
        if (!canAdvance(confirmed, fromX, fromZ)) return false;
        next(confirmed, fromX, fromZ);
        completed.set(currentIndex);
        deferred.clear(currentIndex);
        moveTo(reservedNext, confirmed);
        return true;
    }

    public boolean advance(ChunkTest confirmed) {
        Area area = current();
        return area != null && advance(confirmed, (area.minCX() + area.maxCX()) / 2.0, (area.minCZ() + area.maxCZ()) / 2.0);
    }

    /**
     * The current sector couldn't be finished: defer it to after every other sector, or skip it
     * when its one retry fails as well. Returns false once nothing is left to work.
     */
    public boolean defer(ChunkTest confirmed, double fromX, double fromZ) {
        int failed = currentIndex;
        if (failed < 0) return false;
        if (retrying && deferred.get(failed)) {
            deferred.clear(failed);
            skipped.set(failed);
        } else {
            deferred.set(failed);
        }
        if (priority == failed) priority = -1;
        reservedNext = -2;
        int next = chooseNext(confirmed, fromX, fromZ);
        // The only sector left is the one just deferred: its retry is now
        if (next < 0 && deferred.get(failed)) {
            retrying = true;
            next = failed;
        }
        moveTo(next, confirmed);
        return currentIndex >= 0;
    }

    /** Leave the sector out of this run. Returns true when it was the current one. */
    public boolean skip(int index, ChunkTest confirmed, double fromX, double fromZ) {
        if (index < 0 || index >= total() || skipped.get(index)) return false;
        skipped.set(index);
        deferred.clear(index);
        completed.clear(index);
        if (priority == index) priority = -1;
        if (reservedNext == index) reservedNext = -2;
        if (index != currentIndex) return false;
        reservedNext = -2;
        moveTo(chooseNext(confirmed, fromX, fromZ), confirmed);
        return true;
    }

    /** Work this sector right after the current one, whatever its state; it is retried from scratch. */
    public void prioritise(int index) {
        if (index < 0 || index >= total()) return;
        skipped.clear(index);
        deferred.clear(index);
        completed.clear(index);
        if (index == currentIndex) return;
        priority = index;
        reservedNext = -2;
    }

    /** No current sector left: every sector is finished or skipped. */
    public boolean finished() {
        return visited() == total();
    }

    private void moveTo(int index, ChunkTest confirmed) {
        currentIndex = index;
        reservedNext = -2;
        if (priority == index) priority = -1;
        if (currentIndex < 0) {
            for (int i = 0; i < total(); i++) if (!skipped.get(i)) completed.set(i);
            deferred.clear();
        } else if (!hasOpen(current(), confirmed)) {
            completed.set(currentIndex);
        }
    }

    private boolean eligible(int index, ChunkTest confirmed) {
        if (index == currentIndex || completed.get(index) || skipped.get(index)) return false;
        if (deferred.get(index) && !retrying) return false;
        if (hasOpen(sectors.get(index), confirmed)) return true;
        // Covered on the way: finished without a visit
        completed.set(index);
        deferred.clear(index);
        return false;
    }

    private int chooseNext(ChunkTest confirmed, double fromX, double fromZ) {
        if (priority >= 0 && priority != currentIndex) {
            if (eligible(priority, confirmed)) return priority;
            priority = -1;
        }
        int best = -1;
        double bestScore = Double.POSITIVE_INFINITY;
        if (currentIndex >= 0) {
            Area current = current();
            for (int neighbour : neighbours(currentIndex)) {
                if (!eligible(neighbour, confirmed)) continue;
                Area candidate = sectors.get(neighbour);
                // Local flight + exit + entry for normal sector sizes. For unusually large
                // sectors, keep the choice cheap on the game thread.
                double cost = current.total() <= 4096
                    ? SectorPlanner.handoffCost(current, reach, candidate, confirmed, fromX, fromZ)
                    : distance(SectorPlanner.flightArea(candidate, reach), fromX, fromZ);
                int degree = 0;
                for (int other : neighbours(neighbour)) {
                    if (other != currentIndex && !completed.get(other) && !skipped.get(other)
                        && (retrying || !deferred.get(other)) && hasOpen(sectors.get(other), confirmed)) degree++;
                }
                double score = cost + degree * size * WARNSDORFF_WEIGHT;
                if (score < bestScore) { bestScore = score; best = neighbour; }
            }
        }
        if (best >= 0) return best;
        for (int i = 0; i < total(); i++) {
            if (!eligible(i, confirmed)) continue;
            double distance = distance(SectorPlanner.flightArea(sectors.get(i), reach), fromX, fromZ);
            if (distance < bestScore) { bestScore = distance; best = i; }
        }
        if (best < 0 && !retrying && !deferred.isEmpty()) {
            retrying = true;
            return chooseNext(confirmed, fromX, fromZ);
        }
        return best;
    }

    private int[] neighbours(int index) {
        int column = column(index), row = row(index);
        int[][] cells = {{column - 1, row}, {column + 1, row}, {column, row - 1}, {column, row + 1}};
        int[] result = new int[4];
        int count = 0;
        for (int[] cell : cells) {
            int other = indexAt(cell[0], cell[1]);
            if (other >= 0) result[count++] = other;
        }
        return java.util.Arrays.copyOf(result, count);
    }

    private boolean adjacent(int a, int b) {
        return Math.abs(column(a) - column(b)) + Math.abs(row(a) - row(b)) == 1;
    }

    private static boolean hasOpen(Area area, ChunkTest confirmed) {
        for (int x = area.minCX(); x <= area.maxCX(); x++) for (int z = area.minCZ(); z <= area.maxCZ(); z++) {
            if (!confirmed.test(x, z)) return true;
        }
        return false;
    }

    private static double distance(Area area, double x, double z) {
        double dx = Math.max(area.minCX() - x, Math.max(0, x - area.maxCX()));
        double dz = Math.max(area.minCZ() - z, Math.max(0, z - area.maxCZ()));
        return Math.hypot(dx, dz);
    }
}
