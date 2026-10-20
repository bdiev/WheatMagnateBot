package dev.onfocus.addon.maps;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.DataInputStream;
import java.io.DataOutputStream;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentLinkedQueue;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.function.Consumer;
import java.util.stream.Stream;
import java.util.zip.DeflaterOutputStream;
import java.util.zip.InflaterInputStream;

/**
 * Map pictures kept on disk, a folder per server and a file per map id, so a map seen once shows
 * its picture again after leaving the server or restarting the game, without being taken in hand
 * for the server to send it. Files are read and written on a thread of their own; what's read comes
 * back through {@link #poll}, on the game's thread. Nothing here touches Minecraft's classes.
 */
public final class MapCache {
    public static final int SIZE = 128 * 128;
    private static final int FORMAT = 1;
    private static final String SUFFIX = ".map";

    /** A map's picture as kept: its scale, whether it's locked, its dimension ("minecraft:overworld") and its 128x128 colours. */
    public record Picture(int id, byte scale, boolean locked, String dimension, byte[] colors) {}

    private final ExecutorService io = Executors.newSingleThreadExecutor(r -> {
        Thread thread = new Thread(r, "OnFocus map cache");
        thread.setDaemon(true);
        return thread;
    });
    private final ConcurrentLinkedQueue<Picture> loaded = new ConcurrentLinkedQueue<>();
    /** Where what happened goes (from the files thread too): how many are kept, what couldn't be read or written. */
    private final Consumer<String> log;

    public MapCache() {
        this(message -> {});
    }

    public MapCache(Consumer<String> log) {
        this.log = log;
    }

    private Path folder;
    /** Ids with a file, once the folder's been listed; null until then. */
    private volatile Set<Integer> onDisk;
    /** Ids being read now. */
    private final Set<Integer> loading = new HashSet<>();
    /** What each map's colours hashed to when last written or read: only a change gets written again. */
    private final Map<Integer, Integer> savedHashes = new HashMap<>();

    /** Switches to a server's folder (null for none), listing its files in the background. */
    public void open(Path serverFolder) {
        if (serverFolder == null ? folder == null : serverFolder.equals(folder)) return;
        folder = serverFolder;
        onDisk = null;
        loading.clear();
        savedHashes.clear();
        loaded.clear();
        if (serverFolder == null) return;
        io.execute(() -> {
            Set<Integer> ids = new HashSet<>();
            try (Stream<Path> files = Files.list(serverFolder)) {
                files.forEach(file -> {
                    Integer id = idOf(file.getFileName().toString());
                    if (id != null) ids.add(id);
                });
            } catch (IOException ignored) {
                // No folder yet: nothing kept for this server
            }
            log.accept("%d map pictures kept for %s".formatted(ids.size(), serverFolder.getFileName()));
            if (serverFolder.equals(folder)) onDisk = java.util.Collections.synchronizedSet(ids);
        });
    }

    /** Whether the folder's listing is in: until then nobody knows which maps are kept. */
    public boolean ready() {
        return folder != null && onDisk != null;
    }

    /** Whether a picture of this map is kept (or being read): no need to take it in hand. */
    public boolean has(int id) {
        Set<Integer> ids = onDisk;
        return ids != null && ids.contains(id);
    }

    /** Starts reading a kept picture, unless it's being read already; it comes back through {@link #poll}. */
    public void request(int id) {
        Path dir = folder;
        if (dir == null || !has(id) || !loading.add(id)) return;
        io.execute(() -> {
            try {
                Picture picture = decode(id, Files.readAllBytes(dir.resolve(id + SUFFIX)));
                if (dir.equals(folder)) loaded.add(picture);
            } catch (IOException | RuntimeException e) {
                // Unreadable: forgotten, so the map gets taken in hand and kept again
                log.accept("Couldn't read the kept picture of map %d: %s".formatted(id, e));
                Set<Integer> ids = onDisk;
                if (ids != null && dir.equals(folder)) ids.remove(id);
            }
        });
    }

    /** The next picture read, or null; call on the game's thread. */
    public Picture poll() {
        Picture picture = loaded.poll();
        if (picture != null) {
            loading.remove(picture.id());
            savedHashes.put(picture.id(), java.util.Arrays.hashCode(picture.colors()));
        }
        return picture;
    }

    /** Keeps a map's picture if it's new or changed since it was last kept; the colours are copied. A blank map isn't kept. */
    public void save(int id, byte scale, boolean locked, String dimension, byte[] colors) {
        Path dir = folder;
        if (dir == null || colors == null || colors.length != SIZE) return;
        int hash = java.util.Arrays.hashCode(colors);
        Integer saved = savedHashes.get(id);
        if (saved != null && saved == hash) return;
        if (blank(colors)) return;
        savedHashes.put(id, hash);
        Picture picture = new Picture(id, scale, locked, dimension, colors.clone());
        io.execute(() -> {
            try {
                Files.createDirectories(dir);
                Path file = dir.resolve(id + SUFFIX);
                Path temp = dir.resolve(id + SUFFIX + ".tmp");
                Files.write(temp, encode(picture));
                Files.move(temp, file, StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
                Set<Integer> ids = onDisk;
                if (ids != null && dir.equals(folder)) ids.add(id);
            } catch (IOException e) {
                // Not kept this time: the next change tries again
                log.accept("Couldn't keep the picture of map %d: %s".formatted(id, e));
            }
        });
        // Written or not, the cache knows the map from now on
        Set<Integer> ids = onDisk;
        if (ids != null) ids.add(id);
    }

    public static boolean blank(byte[] colors) {
        for (byte color : colors) if (color != 0) return false;
        return true;
    }

    static Integer idOf(String fileName) {
        if (!fileName.endsWith(SUFFIX)) return null;
        try {
            return Integer.parseInt(fileName.substring(0, fileName.length() - SUFFIX.length()));
        } catch (NumberFormatException e) {
            return null;
        }
    }

    public static byte[] encode(Picture picture) throws IOException {
        ByteArrayOutputStream bytes = new ByteArrayOutputStream();
        try (DataOutputStream out = new DataOutputStream(new DeflaterOutputStream(bytes))) {
            out.writeByte(FORMAT);
            out.writeByte(picture.scale());
            out.writeBoolean(picture.locked());
            out.writeUTF(picture.dimension());
            out.write(picture.colors());
        }
        return bytes.toByteArray();
    }

    public static Picture decode(int id, byte[] data) throws IOException {
        try (DataInputStream in = new DataInputStream(new InflaterInputStream(new ByteArrayInputStream(data)))) {
            int format = in.readUnsignedByte();
            if (format != FORMAT) throw new IOException("Unknown map cache format " + format);
            byte scale = in.readByte();
            boolean locked = in.readBoolean();
            String dimension = in.readUTF();
            byte[] colors = new byte[SIZE];
            in.readFully(colors);
            return new Picture(id, scale, locked, dimension, colors);
        }
    }
}
