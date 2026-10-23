package dev.onfocus.addon.explore;

import java.nio.file.Path;
import java.util.HashMap;
import java.util.Map;

/**
 * The colour each marker from the site's map was given there, by its block: what the other PC gets
 * with it (share-mode Serve), whatever colour it's been given in Xaero here since - a colour is each
 * PC's own. Kept in {@code site-colors.tsv} per server under {@code .minecraft/onfocus/shared}.
 * Every method is synchronized: the game thread and the files thread use it.
 */
public final class SiteMarkerColors {
    private final Path root;
    private final Map<String, Map<String, Long>> servers = new HashMap<>();

    public SiteMarkerColors(Path root) {
        this.root = root;
    }

    private static String key(String dimension, int x, int y, int z) {
        return dimension + " " + x + " " + y + " " + z;
    }

    private Map<String, Long> load(String server) {
        return servers.computeIfAbsent(server, s -> ShareFiles.readNumbers(file(s)));
    }

    private Path file(String server) {
        return ShareFiles.serverFolder(root, server).resolve("site-colors.tsv");
    }

    public synchronized void put(String server, String dimension, int x, int y, int z, int rgb) {
        Map<String, Long> colors = load(server);
        Long before = colors.put(key(dimension, x, y, z), (long) rgb);
        if (before == null || before != rgb) ShareFiles.writeNumbers(file(server), colors);
    }

    /** The colour the site gave the marker at this block, or {@code otherwise} for one it didn't make. */
    public synchronized int get(String server, String dimension, int x, int y, int z, int otherwise) {
        Long rgb = load(server).get(key(dimension, x, y, z));
        return rgb == null ? otherwise : (int) (long) rgb;
    }
}
