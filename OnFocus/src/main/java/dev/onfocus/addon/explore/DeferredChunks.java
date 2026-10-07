package dev.onfocus.addon.explore;

import it.unimi.dsi.fastutil.longs.Long2IntOpenHashMap;

import java.util.function.LongConsumer;

/** Loaded chunks get a short map-drawing grace period, never permanent planning credit. */
public final class DeferredChunks {
    public enum State { MAPPED, BLANK, UNKNOWN }
    @FunctionalInterface public interface MapState { State at(int cx, int cz); }

    private static final int DRAW_TICKS = 100, UNKNOWN_TICKS = 600;
    private final ChunkGrid grid;
    private final Long2IntOpenHashMap firstSeen = new Long2IntOpenHashMap();

    public DeferredChunks(CoveragePlanner.Area area) {
        grid = new ChunkGrid(area);
    }

    public ChunkGrid grid() { return grid; }
    public boolean test(int cx, int cz) { return grid.test(cx, cz); }

    public void add(int cx, int cz, int tick) {
        if (!grid.area().contains(cx, cz)) return;
        // Minecraft's packed chunk layout, without initializing client registries in pure tests.
        long key = (cx & 0xffffffffL) | ((cz & 0xffffffffL) << 32);
        if (!firstSeen.containsKey(key)) firstSeen.put(key, tick);
        grid.add(cx, cz);
    }

    /** Unknown regions get longer to become readable; expiry only removes provisional credit. */
    public int reconcile(int tick, MapState map, LongConsumer confirmed) {
        int released = 0;
        var entries = firstSeen.long2IntEntrySet().fastIterator();
        while (entries.hasNext()) {
            var entry = entries.next();
            int age = tick - entry.getIntValue();
            if (age < DRAW_TICKS) continue;
            long key = entry.getLongKey();
            int cx = (int) key, cz = (int) (key >> 32);
            State state = map.at(cx, cz);
            if (state == State.UNKNOWN && age < UNKNOWN_TICKS) continue;
            if (state == State.MAPPED) confirmed.accept(key);
            else released++;
            grid.remove(cx, cz);
            entries.remove();
        }
        return released;
    }
}
