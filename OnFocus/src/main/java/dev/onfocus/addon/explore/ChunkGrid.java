package dev.onfocus.addon.explore;

import dev.onfocus.addon.explore.CoveragePlanner.Area;
import dev.onfocus.addon.explore.CoveragePlanner.ChunkTest;
import it.unimi.dsi.fastutil.longs.LongIterable;
import it.unimi.dsi.fastutil.longs.LongIterator;
import net.minecraft.util.math.ChunkPos;

import java.util.BitSet;
import java.util.ArrayList;
import java.util.List;

/**
 * A set of chunks of one area as a flat bit grid, for the planners. They test every chunk of the
 * area, some many times over; through hash sets that took long enough on a big area to freeze the
 * game at every turn, when the route is planned again. Chunks outside the area are never in it.
 */
public final class ChunkGrid implements ChunkTest {
    private final Area area;
    private final int depth;
    private final BitSet bits;

    public ChunkGrid(Area area) {
        this.area = area;
        this.depth = area.depth();
        this.bits = new BitSet((int) Math.min(Integer.MAX_VALUE, area.total()));
    }

    public Area area() {
        return area;
    }

    public void clear() {
        bits.clear();
    }

    /** Makes this grid hold just what the other one (of the same area) holds: a copy of its bits, far quicker than adding its chunks again. */
    public void setTo(ChunkGrid other) {
        bits.clear();
        bits.or(other.bits);
    }

    /** A copy to hand to another thread, which this one can go on changing. */
    public ChunkGrid copy() {
        ChunkGrid copy = new ChunkGrid(area);
        copy.bits.or(bits);
        return copy;
    }

    /** Merges another grid without iterating through every covered chunk. */
    public void addAll(ChunkGrid other) {
        if (!area.equals(other.area)) throw new IllegalArgumentException("Cannot merge different areas");
        bits.or(other.bits);
    }

    /** Bounded exact gap coordinates for diagnostics, without scanning every covered chunk. */
    public List<int[]> uncoveredSamples(int limit) {
        List<int[]> samples = new ArrayList<>();
        for (int bit = bits.nextClearBit(0); bit < area.total() && samples.size() < limit; bit = bits.nextClearBit(bit + 1)) {
            samples.add(new int[]{area.minCX() + bit / depth, area.minCZ() + bit % depth});
        }
        return samples;
    }

    private int index(int cx, int cz) {
        return (cx - area.minCX()) * depth + (cz - area.minCZ());
    }

    public void add(int cx, int cz) {
        if (area.contains(cx, cz)) bits.set(index(cx, cz));
    }

    public void remove(int cx, int cz) {
        if (area.contains(cx, cz)) bits.clear(index(cx, cz));
    }

    /** Adds packed {@link ChunkPos} keys. */
    public void addAll(LongIterable keys) {
        for (LongIterator it = keys.iterator(); it.hasNext(); ) {
            long key = it.nextLong();
            add(ChunkPos.getPackedX(key), ChunkPos.getPackedZ(key));
        }
    }

    /** Adds the rectangle of chunks from (x1, z1) to (x2, z2), inclusive, as far as it's inside the area. */
    public void addRect(int x1, int z1, int x2, int z2) {
        int fromX = Math.max(area.minCX(), Math.min(x1, x2)), toX = Math.min(area.maxCX(), Math.max(x1, x2));
        int fromZ = Math.max(area.minCZ(), Math.min(z1, z2)), toZ = Math.min(area.maxCZ(), Math.max(z1, z2));
        if (fromZ > toZ) return;
        // A column of the area is one run of bits
        for (int cx = fromX; cx <= toX; cx++) bits.set(index(cx, fromZ), index(cx, toZ) + 1);
    }

    @Override
    public boolean test(int cx, int cz) {
        return area.contains(cx, cz) && bits.get(index(cx, cz));
    }

    /** Any uncovered chunk in a rectangle, using bit runs instead of checking each footprint cell. */
    public boolean hasOpenRect(int x1, int z1, int x2, int z2) {
        int fromX = Math.max(area.minCX(), Math.min(x1, x2)), toX = Math.min(area.maxCX(), Math.max(x1, x2));
        int fromZ = Math.max(area.minCZ(), Math.min(z1, z2)), toZ = Math.min(area.maxCZ(), Math.max(z1, z2));
        if (fromZ > toZ) return false;
        for (int x = fromX; x <= toX; x++) {
            if (bits.nextClearBit(index(x, fromZ)) <= index(x, toZ)) return true;
        }
        return false;
    }
}
