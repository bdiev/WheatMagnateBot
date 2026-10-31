package dev.onfocus.addon.xaero;

import java.io.File;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Regions of Xaero's map last saved so long ago that they're to be drawn again: their chunks don't
 * count as explored until the World Map has drawn them anew, in this session or one before.
 * <p>
 * A region file's date says when any of it was last drawn, so once flying over part of it saves it,
 * the date says nothing of the rest: a region found old is kept as such, with the chunks drawn
 * again since, in {@code onfocus-redraw.txt} next to the map's region files, until every chunk of it
 * has been. Then it's like any other region.
 * <p>
 * Free of Minecraft and Xaero classes; safe from any thread.
 */
public final class StaleRegions {
    private static final String FILE = "onfocus-redraw.txt";
    private static final long DAY_MS = 24L * 60 * 60 * 1000;
    private static final long SAVE_EVERY_MS = 30_000;
    private static final Map<Path, StaleRegions> BY_FOLDER = new HashMap<>();
    /** Regions last saved longer ago than this get drawn again; 0: none. */
    private static volatile long maxAgeMs = 182 * DAY_MS;

    private final Path folder;
    /** Region (x, z packed as ChunkPos does) to the chunks of it drawn again: a bit each, chunk x * 32 + z within it. */
    private final Map<Long, long[]> stale = new HashMap<>();
    /** Regions whose file was found recent enough, or missing: nothing to draw again there. */
    private final Set<Long> fresh = new HashSet<>();
    private boolean dirty;
    private long savedAt;

    private StaleRegions(Path folder) {
        this.folder = folder;
        load();
    }

    /** Regions older than this many days are drawn again; 0 turns it off. */
    public static void setMaxAgeDays(int days) {
        maxAgeMs = Math.max(0, days) * DAY_MS;
    }

    /** For the folder a dimension's region files are in ({@code .../null/mw$default}). */
    public static synchronized StaleRegions of(Path folder) {
        return BY_FOLDER.computeIfAbsent(folder, StaleRegions::new);
    }

    /** Writes every map's list that changed and hasn't been written for a while. */
    public static void saveAllIfDue() {
        List<StaleRegions> all;
        synchronized (StaleRegions.class) {
            all = List.copyOf(BY_FOLDER.values());
        }
        for (StaleRegions regions : all) regions.saveIfDue(false);
    }

    /** Writes every map's list that changed, now. */
    public static void saveAll() {
        List<StaleRegions> all;
        synchronized (StaleRegions.class) {
            all = List.copyOf(BY_FOLDER.values());
        }
        for (StaleRegions regions : all) regions.saveIfDue(true);
    }

    /** The chunk is in a region to be drawn again, and hasn't been yet: what the map shows of it is old. */
    public synchronized boolean outdated(int chunkX, int chunkZ) {
        if (maxAgeMs <= 0) return false;
        long[] redrawn = staleRegion(chunkX >> 5, chunkZ >> 5);
        return redrawn != null && (redrawn[bit(chunkX, chunkZ) >> 6] & 1L << (bit(chunkX, chunkZ) & 63)) == 0;
    }

    /** The World Map has drawn the chunk anew. */
    public synchronized void redrawn(int chunkX, int chunkZ) {
        long key = regionKey(chunkX >> 5, chunkZ >> 5);
        long[] bits = stale.get(key);
        if (bits == null) return;
        int bit = bit(chunkX, chunkZ);
        if ((bits[bit >> 6] & 1L << (bit & 63)) != 0) return;
        bits[bit >> 6] |= 1L << (bit & 63);
        dirty = true;
        for (long word : bits) if (word != -1L) return;
        // All of it drawn again: its file's date says it now
        stale.remove(key);
        fresh.add(key);
    }

    /** The chunks drawn again of a region to be drawn again, null for one that isn't. */
    private long[] staleRegion(int regionX, int regionZ) {
        long key = regionKey(regionX, regionZ);
        long[] bits = stale.get(key);
        if (bits != null || fresh.contains(key)) return bits;
        File file = folder.resolve(regionX + "_" + regionZ + ".zip").toFile();
        long modified = file.lastModified(); // 0 when there's no file: nothing drawn there yet
        if (modified == 0 || System.currentTimeMillis() - modified <= maxAgeMs) {
            fresh.add(key);
            return null;
        }
        bits = new long[16];
        stale.put(key, bits);
        dirty = true;
        return bits;
    }

    private static int bit(int chunkX, int chunkZ) {
        return (chunkX & 31) * 32 + (chunkZ & 31);
    }

    private static long regionKey(int x, int z) {
        return (long) x & 0xFFFFFFFFL | ((long) z & 0xFFFFFFFFL) << 32;
    }

    /** "x z" and the 16 words of drawn-again chunks in hex, a region a line. */
    private void load() {
        Path file = folder.resolve(FILE);
        if (!Files.exists(file)) return;
        try {
            for (String line : Files.readAllLines(file, StandardCharsets.UTF_8)) {
                String[] parts = line.trim().split(" ");
                if (parts.length != 18) continue;
                try {
                    long[] bits = new long[16];
                    for (int i = 0; i < 16; i++) bits[i] = Long.parseUnsignedLong(parts[i + 2], 16);
                    stale.put(regionKey(Integer.parseInt(parts[0]), Integer.parseInt(parts[1])), bits);
                } catch (NumberFormatException ignored) {
                }
            }
        } catch (IOException ignored) {
            // Read as none: they're found again by their files' dates, those not saved since
        }
    }

    private void saveIfDue(boolean now) {
        String text;
        synchronized (this) {
            if (!dirty || !now && System.currentTimeMillis() - savedAt < SAVE_EVERY_MS) return;
            StringBuilder out = new StringBuilder();
            stale.forEach((key, bits) -> {
                out.append((int) (long) key).append(' ').append((int) (key >>> 32));
                for (long word : bits) out.append(' ').append(Long.toHexString(word));
                out.append('\n');
            });
            text = out.toString();
            dirty = false;
            savedAt = System.currentTimeMillis();
        }
        try {
            if (!Files.isDirectory(folder)) return;
            Path file = folder.resolve(FILE), temp = folder.resolve(FILE + ".tmp");
            Files.writeString(temp, text, StandardCharsets.UTF_8);
            Files.move(temp, file, StandardCopyOption.REPLACE_EXISTING);
        } catch (IOException e) {
            synchronized (this) {
                dirty = true;
            }
        }
    }
}
