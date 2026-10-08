package dev.onfocus.addon.explore;

import it.unimi.dsi.fastutil.longs.Long2IntOpenHashMap;

/**
 * Rescan: which chunks the server sent just now. The client keeps the chunks of the strip flown
 * before (they're a strip spacing away, well inside the client's own view distance), so counting
 * every loaded chunk across the strip read 13-16 instead of the 4 the server sends a player flying
 * past, widened the swath and threw the route around. A chunk beside the player arrives a second or
 * so before it's passed; one left from a neighbouring strip is much older.
 */
public final class FreshChunks {
    /** 10 s: the server sends a chunk in reach a second or two before it's abeam, even when it lags. */
    public static final int FRESH_TICKS = 200;

    private final Long2IntOpenHashMap arrived = new Long2IntOpenHashMap();
    private int tick;

    /** One game tick on; old arrivals are dropped every so often. */
    public void tick() {
        tick++;
        if (tick % FRESH_TICKS == 0) arrived.values().removeIf(at -> tick - at > FRESH_TICKS);
    }

    public void arrived(long chunk) {
        arrived.put(chunk, tick);
    }

    public boolean isFresh(long chunk) {
        return arrived.containsKey(chunk) && tick - arrived.get(chunk) <= FRESH_TICKS;
    }

    public void clear() {
        arrived.clear();
    }

    public int size() {
        return arrived.size();
    }
}
