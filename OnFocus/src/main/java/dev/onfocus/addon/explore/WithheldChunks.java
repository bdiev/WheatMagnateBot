package dev.onfocus.addon.explore;

import it.unimi.dsi.fastutil.longs.Long2IntOpenHashMap;

/**
 * Rescan: chunks the server keeps not sending although the player flies right by them, with
 * chunks around them loaded. Without the map a rescanned chunk is one the server sent, so these
 * would stay blank for good and the sweep would fly back at them strip after strip. Once one has
 * been in reach unsent for long enough in total, or a few strips meant to cover it ended without
 * it, it's given up on and planned around.
 */
public final class WithheldChunks {
    /** 30 s in reach in total: a pass along a strip keeps a chunk in reach for some 7 s. */
    public static final int GIVE_UP_TICKS = 600;
    /** Strips flown to the end over it without it coming: one is a lag, three a pattern. */
    public static final int GIVE_UP_STRIPS = 3;

    private final ChunkGrid grid;
    private final Long2IntOpenHashMap missingTicks = new Long2IntOpenHashMap();
    private final Long2IntOpenHashMap missedStrips = new Long2IntOpenHashMap();
    private int count;

    public WithheldChunks(CoveragePlanner.Area area) {
        grid = new ChunkGrid(area);
    }

    public ChunkGrid grid() { return grid; }
    public boolean test(int cx, int cz) { return grid.test(cx, cz); }
    /** Chunks given up on and not sent since. */
    public int size() { return count; }

    /** The chunk was in reach and not loaded for that many ticks; true if it's given up on just now. */
    public boolean missed(int cx, int cz, int ticks) {
        if (!grid.area().contains(cx, cz) || grid.test(cx, cz)) return false;
        long key = key(cx, cz);
        int total = missingTicks.addTo(key, ticks) + ticks;
        if (total < GIVE_UP_TICKS) return false;
        giveUp(cx, cz, key);
        return true;
    }

    /** A strip meant to cover the chunk got flown to its end without it; true if it's given up on just now. */
    public boolean missedStrip(int cx, int cz) {
        if (!grid.area().contains(cx, cz) || grid.test(cx, cz)) return false;
        long key = key(cx, cz);
        if (missedStrips.addTo(key, 1) + 1 < GIVE_UP_STRIPS) return false;
        giveUp(cx, cz, key);
        return true;
    }

    private void giveUp(int cx, int cz, long key) {
        missingTicks.remove(key);
        missedStrips.remove(key);
        grid.add(cx, cz);
        count++;
    }

    /** The chunk came after all: it's planned for again if it goes missing later. */
    public void loaded(int cx, int cz) {
        if (!grid.area().contains(cx, cz)) return;
        long key = key(cx, cz);
        missingTicks.remove(key);
        missedStrips.remove(key);
        if (!grid.test(cx, cz)) return;
        grid.remove(cx, cz);
        count--;
    }

    /** Minecraft's packed chunk layout, without initializing client registries in pure tests. */
    private static long key(int cx, int cz) {
        return (cx & 0xffffffffL) | ((cz & 0xffffffffL) << 32);
    }
}
