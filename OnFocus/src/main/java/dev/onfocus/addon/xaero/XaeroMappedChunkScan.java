package dev.onfocus.addon.xaero;

import dev.onfocus.addon.modules.AreaExplorer;
import it.unimi.dsi.fastutil.longs.Long2IntOpenHashMap;
import it.unimi.dsi.fastutil.longs.LongArrayList;
import it.unimi.dsi.fastutil.longs.LongOpenHashSet;
import it.unimi.dsi.fastutil.longs.LongSet;
import net.minecraft.util.math.ChunkPos;
import xaero.map.MapProcessor;
import xaero.map.WorldMapSession;
import xaero.map.region.MapRegion;
import xaero.map.region.MapTile;
import xaero.map.region.MapTileChunk;

import java.io.File;
import java.nio.file.Path;
import java.util.Queue;
import java.util.concurrent.ConcurrentLinkedQueue;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Finds which chunks of a rectangle are already drawn on Xaero's World Map.
 * <p>
 * The map is stored in 32x32-chunk regions, each read from its save file on a background thread.
 * A region also loaded in memory adds what it holds there (chunks drawn since the last save) - on
 * its own it can't be trusted: one loaded for showing on the map keeps hardly any tiles. Xaero itself usually
 * brings unviewed regions in only as cached textures (load state 3), which don't say which chunks
 * are drawn, so waiting for it to load them properly doesn't work - see {@link XaeroRegionFile}.
 * <p>
 * {@link #tick} must run on the client thread (Xaero refuses region lookups from anywhere else).
 */
public class XaeroMappedChunkScan {
    private static final byte REGION_LOADED = 2;
    /**
     * Xaero's surface layer - the normal map. Its "current" layer follows the player into cave
     * mode (under trees, roofs, underground), and cave layers have files of their own; asking for
     * those made a mapped area read as blank.
     */
    private static final int SURFACE_LAYER = Integer.MAX_VALUE;
    private static final int MAX_READ_ATTEMPTS = 3;
    private static final ExecutorService IO = Executors.newSingleThreadExecutor(r -> {
        Thread thread = new Thread(r, "OnFocus Xaero map reader");
        thread.setDaemon(true);
        return thread;
    });

    /** A region file finished reading: the drawn chunks inside the rectangle, or null if it failed. */
    private record Result(long region, LongArrayList mapped) {}

    /** Receives each region once it's been read: every drawn chunk of it inside the rectangle. */
    @FunctionalInterface
    public interface RegionListener {
        void onRegion(long region, LongArrayList mapped);
    }

    /** Region files queued to the reader thread at once; the rest wait, so they can still be reordered. */
    private static final int MAX_IN_FLIGHT = 4;

    private final int minCX, minCZ, maxCX, maxCZ;
    private int focusRX, focusRZ;
    private final long startedNanos = System.nanoTime();
    private final LongSet pendingRegions = new LongOpenHashSet();
    private final LongSet reading = new LongOpenHashSet();
    private final Long2IntOpenHashMap attempts = new Long2IntOpenHashMap();
    private final Queue<Result> results = new ConcurrentLinkedQueue<>();
    private volatile boolean cancelled;

    /** @param readAll queue every region of the rectangle right away; otherwise only what gets {@link #request}ed */
    public XaeroMappedChunkScan(int minCX, int minCZ, int maxCX, int maxCZ, boolean readAll) {
        this.minCX = minCX;
        this.minCZ = minCZ;
        this.maxCX = maxCX;
        this.maxCZ = maxCZ;
        focus(Math.floorDiv(minCX + maxCX, 2), Math.floorDiv(minCZ + maxCZ, 2));
        if (readAll) for (int rx = minCX >> 5; rx <= maxCX >> 5; rx++) {
            for (int rz = minCZ >> 5; rz <= maxCZ >> 5; rz++) pendingRegions.add(ChunkPos.toLong(rx, rz));
        }
    }

    public static final int MAPPED = 1, NOT_MAPPED = 0, UNKNOWN = -1;

    /**
     * Whether the chunk is drawn on the map, from memory only: {@link #UNKNOWN} when its region
     * isn't fully loaded right now (Xaero unloads regions we've flown away from, and cache-only
     * regions don't know per chunk) - that is not the same as "not drawn", read the file instead.
     */
    public static int mapState(int chunkX, int chunkZ) {
        WorldMapSession session = WorldMapSession.getCurrentSession();
        if (session == null || !session.isUsable()) return UNKNOWN;
        MapProcessor processor = session.getMapProcessor();
        if (processor == null || processor.getMapWorld() == null) return UNKNOWN;

        int caveLayer = SURFACE_LAYER;
        MapRegion region = processor.getLeafMapRegion(caveLayer, chunkX >> 5, chunkZ >> 5, false);
        if (region == null) return processor.regionExists(caveLayer, chunkX >> 5, chunkZ >> 5) ? UNKNOWN : NOT_MAPPED;
        if (region.getLoadState() != REGION_LOADED) return UNKNOWN;

        MapTileChunk tileChunk = region.getChunk((chunkX >> 2) & 7, (chunkZ >> 2) & 7);
        if (tileChunk == null) return NOT_MAPPED;
        MapTile tile = tileChunk.getTile(chunkX & 3, chunkZ & 3);
        return tile != null && tile.isLoaded() ? MAPPED : NOT_MAPPED;
    }

    /** Queues the region holding this chunk to be (re)read. */
    public void request(int chunkX, int chunkZ) {
        long key = ChunkPos.toLong(chunkX >> 5, chunkZ >> 5);
        if (pendingRegions.add(key)) attempts.remove(key);
    }

    // What happened to the regions, for the log
    private int fromFiles, inMemory, absent, noFile, undetected;
    private long chunksFromFiles, chunksInMemory;

    /** One line on how the regions were read: says straight away if the map wasn't found. */
    public String summary() {
        return "%d regions read from files (%d chunks drawn, %d of the files missed by Xaero's detection), %d in memory (%d chunks), %d never mapped, %d without a file, %.1f s so far"
            .formatted(fromFiles, chunksFromFiles, undetected, inMemory, chunksInMemory, absent, noFile, (System.nanoTime() - startedNanos) / 1e9);
    }

    public int pendingRegions() {
        return pendingRegions.size();
    }

    /** Regions are read nearest this chunk first - where the player is. */
    public void focus(int chunkX, int chunkZ) {
        focusRX = chunkX >> 5;
        focusRZ = chunkZ >> 5;
    }

    private long focusDistance(long region) {
        long dx = ChunkPos.getPackedX(region) - focusRX, dz = ChunkPos.getPackedZ(region) - focusRZ;
        return dx * dx + dz * dz;
    }

    /** Whether every region within this many regions of the chunk (a square) has been read. */
    public boolean readAround(int chunkX, int chunkZ, int regions) {
        int rx = chunkX >> 5, rz = chunkZ >> 5;
        for (long key : pendingRegions) {
            if (Math.abs(ChunkPos.getPackedX(key) - rx) <= regions && Math.abs(ChunkPos.getPackedZ(key) - rz) <= regions) return false;
        }
        return true;
    }

    /**
     * Xaero discovers saved region files asynchronously after entering a world. Until that index
     * is complete, both getLeafMapRegion and regionExists can report a false absence for map data
     * that is plainly visible from cached textures.
     */
    public boolean regionIndexReady() {
        WorldMapSession session = WorldMapSession.getCurrentSession();
        if (session == null || !session.isUsable()) return false;
        MapProcessor processor = session.getMapProcessor();
        return processor != null && processor.getMapWorld() != null
            && processor.getMapSaveLoad().isRegionDetectionComplete();
    }

    /** Stops background reads whose results nobody will pick up any more. */
    public void cancel() {
        cancelled = true;
    }

    /** Reports every region that became readable. Returns true once no region is pending. */
    public boolean tick(RegionListener listener) {
        Result result;
        while ((result = results.poll()) != null) {
            reading.remove(result.region());
            if (result.mapped() != null) {
                listener.onRegion(result.region(), result.mapped());
                pendingRegions.remove(result.region());
                fromFiles++;
                chunksFromFiles += result.mapped().size();
            } else if (attempts.addTo(result.region(), 1) + 1 >= MAX_READ_ATTEMPTS) {
                pendingRegions.remove(result.region()); // give up, it'll just be flown over
            }
        }
        if (pendingRegions.isEmpty()) return true;

        WorldMapSession session = WorldMapSession.getCurrentSession();
        if (session == null || !session.isUsable()) return false;
        MapProcessor processor = session.getMapProcessor();
        if (processor == null || processor.getMapWorld() == null) return false;
        // Do not turn "not indexed yet" into "not mapped". getLeafMapRegion itself returns null
        // before this flag becomes true, regardless of whether the region file exists.
        if (!processor.getMapSaveLoad().isRegionDetectionComplete()) return false;
        int caveLayer = SURFACE_LAYER;
        Path mapFolder = mapFolder(processor);

        // Nearest the focus first, a few at a time: what's read later can still be put behind
        // regions that came closer as the player moved
        LongArrayList order = new LongArrayList();
        for (long key : pendingRegions) if (!reading.contains(key)) order.add(key);
        order.sort((a, b) -> Long.compare(focusDistance(a), focusDistance(b)));
        int budget = MAX_IN_FLIGHT - reading.size();

        for (int i = 0; i < order.size() && budget > 0; i++) {
            long key = order.getLong(i);
            int rx = ChunkPos.getPackedX(key), rz = ChunkPos.getPackedZ(key);

            MapRegion region = processor.getLeafMapRegion(caveLayer, rx, rz, false);
            File file;
            if (region != null && region.getLoadState() == REGION_LOADED) {
                // In memory it may hold chunks not saved yet - but a region loaded for showing on the
                // map keeps hardly any tiles (that once read a whole area as 2% explored), so the file
                // gets read as well and the two add up
                LongArrayList found = new LongArrayList();
                readLoadedRegion(region, rx, rz, found);
                listener.onRegion(key, found);
                inMemory++;
                chunksInMemory += found.size();
            }
            if (region == null && !processor.regionExists(caveLayer, rx, rz)) {
                // Xaero's list of saved regions can't be trusted alone: when the map is still locked
                // or the world unknown while joining, its detection is skipped but marked done anyway,
                // and then only the regions around the player "exist" - that read half a mapped area
                // as 0%. Whether the file is there says it for sure.
                file = mapFolder != null ? mapFolder.resolve(rx + "_" + rz + ".zip").toFile() : null;
                if (file == null || !file.exists()) {
                    listener.onRegion(key, new LongArrayList()); // nothing was ever mapped here
                    pendingRegions.remove(key);
                    absent++;
                    continue;
                }
                undetected++;
            } else {
                if (region == null) region = processor.getLeafMapRegion(caveLayer, rx, rz, true);
                if (region == null) continue;

                // Singleplayer "world save" maps are read from the world's own region files - not ours to parse
                file = region.isNormalMapData() ? processor.getMapSaveLoad().getFile(region) : null;
                if (file == null || !file.exists()) {
                    pendingRegions.remove(key);
                    noFile++;
                    continue;
                }
            }

            File regionFile = file;
            reading.add(key);
            budget--;
            IO.submit(() -> {
                if (cancelled) return;
                LongArrayList found = new LongArrayList();
                try {
                    XaeroRegionFile.read(regionFile, rx, rz, (cx, cz) -> {
                        if (cx >= minCX && cx <= maxCX && cz >= minCZ && cz <= maxCZ) found.add(ChunkPos.toLong(cx, cz));
                    }, () -> cancelled);
                    results.add(new Result(key, found));
                } catch (Exception e) {
                    // Most likely Xaero was writing it at that moment; retried on a later tick
                    AreaExplorer.FILE_LOG.info("Couldn't read map region %d, %d: %s".formatted(rx, rz, e));
                    results.add(new Result(key, null));
                }
            });
        }
        return pendingRegions.isEmpty();
    }

    /**
     * The folder the current map's surface region files are in, or null for a singleplayer map
     * drawn from the world save (no files of its own) or while the world isn't known.
     */
    private static Path mapFolder(MapProcessor processor) {
        try {
            if (processor.getMapWorld().getCurrentDimension().isUsingWorldSave()) return null;
            String worldId = processor.getCurrentWorldId(), dimId = processor.getCurrentDimId(), mwId = processor.getCurrentMWId();
            if (worldId == null || dimId == null || mwId == null) return null;
            return processor.getMapSaveLoad().getMWSubFolder(worldId, dimId, mwId);
        } catch (RuntimeException e) {
            return null; // mid world change
        }
    }

    private void readLoadedRegion(MapRegion region, int rx, int rz, LongArrayList out) {
        int fromX = Math.max(minCX, rx << 5), toX = Math.min(maxCX, (rx << 5) + 31);
        int fromZ = Math.max(minCZ, rz << 5), toZ = Math.min(maxCZ, (rz << 5) + 31);
        for (int cx = fromX; cx <= toX; cx++) {
            for (int cz = fromZ; cz <= toZ; cz++) {
                MapTileChunk tileChunk = region.getChunk((cx >> 2) & 7, (cz >> 2) & 7);
                if (tileChunk == null) continue;
                MapTile tile = tileChunk.getTile(cx & 3, cz & 3);
                if (tile != null && tile.isLoaded()) out.add(ChunkPos.toLong(cx, cz));
            }
        }
    }
}
