package dev.onfocus.addon.xaero;

import java.io.BufferedInputStream;
import java.io.BufferedOutputStream;
import java.io.ByteArrayOutputStream;
import java.io.DataInputStream;
import java.io.DataOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;
import java.util.zip.ZipOutputStream;

/**
 * Merges two of Xaero's World Map region save files ({@code x_z.zip}) chunk by chunk: what one has
 * and the other doesn't goes in, and where both have a chunk, the first file's stays.
 * <p>
 * A region file can't be stitched together from raw bytes: the block states and biomes go in a
 * palette that grows as the file is written, a pixel naming one by its place in it after its first
 * time. So both files are read with what each pixel refers to worked out, and the merged one is
 * written with a palette of its own, the way {@code xaero.map.file.MapSaveLoad.saveRegion} does
 * (World Map 1.40 to 1.46). Only that format, 6.8, is merged; {@link #version} tells.
 * <p>
 * Free of Minecraft and Xaero classes, so it runs on any thread.
 */
public final class XaeroRegionMerge {
    /** The region format World Map writes: major 6, minor 8. */
    public static final int FORMAT = 6 << 16 | 8;
    private static final int TILES = 4 * 4;
    private static final int PIXELS = 16 * 16;

    private XaeroRegionMerge() {}

    /** What a merge did: chunks taken from the second file, and the chunks the merged file has in all. */
    public record Result(int added, int total) {}

    /** The format a region file is saved in ({@link #FORMAT} for the current one), -1 for one older than versions were written. */
    public static int version(File file) throws IOException {
        try (ZipInputStream zip = new ZipInputStream(new BufferedInputStream(new FileInputStream(file), 64));
             DataInputStream in = new DataInputStream(zip)) {
            if (zip.getNextEntry() == null) throw new IOException("empty region file");
            return in.read() == 255 ? in.readInt() : -1;
        }
    }

    /**
     * Writes {@code out} with the chunks of {@code base} and those of {@code extra} that {@code base}
     * lacks. Both have to be in {@link #FORMAT}. {@code out} is left alone when nothing's to add.
     */
    public static Result merge(File base, File extra, File out) throws IOException {
        // Most of the time there's nothing to add: told from which chunks each has, without reading every pixel in
        long[] have = drawn(base), more = drawn(extra);
        boolean missing = false;
        int total = 0;
        for (int i = 0; i < have.length; i++) {
            missing |= (more[i] & ~have[i]) != 0;
            total += Long.bitCount(have[i]);
        }
        if (!missing) return new Result(0, total);

        Region mine = Region.read(base), theirs = Region.read(extra);
        int added = 0;
        total = 0;
        for (int c = 0; c < 64; c++) {
            for (int t = 0; t < TILES; t++) {
                if (mine.tiles[c][t] == null && theirs.tiles[c][t] != null) {
                    mine.tiles[c][t] = theirs.tiles[c][t];
                    added++;
                }
                if (mine.tiles[c][t] != null) total++;
            }
        }
        if (added > 0) mine.write(out);
        return new Result(added, total);
    }

    /** The chunks a region file has drawn, a bit each (chunk x * 32 + z within the region), read the quick way. */
    private static long[] drawn(File file) throws IOException {
        long[] bits = new long[16];
        XaeroRegionFile.read(file, 0, 0, (chunkX, chunkZ) -> {
            int bit = chunkX * 32 + chunkZ;
            bits[bit >> 6] |= 1L << (bit & 63);
        }, () -> false);
        return bits;
    }

    /** How many chunks a region file has drawn. */
    public static int chunks(File file) throws IOException {
        int count = 0;
        for (long bits : drawn(file)) count += Long.bitCount(bits);
        return count;
    }

    /** A palette entry: a block state's NBT as written, or a biome by name or (old saves) number. */
    private record Entry(byte[] bytes) {
        @Override
        public boolean equals(Object o) {
            return o instanceof Entry other && Arrays.equals(bytes, other.bytes);
        }

        @Override
        public int hashCode() {
            return Arrays.hashCode(bytes);
        }
    }

    /** An overlay over a pixel (water, glass...): its flags, its block state (null for plain water) and the int after it, if any. */
    private record Overlay(int params, Entry state, int extra) {}

    /** One pixel, everything it says, with the palette entries it refers to. */
    private record Pixel(int params, Entry state, int height, int topHeight, Overlay[] overlays, Entry biome) {}

    /** A chunk's tile: its 256 pixels column by column, then what Xaero writes after them. */
    private record Tile(Pixel[] pixels, int interpretation, int caveStart, int caveDepth) {}

    private static final int HAS_STATE = 1, HAS_OVERLAYS = 2, HAS_HEIGHT = 64;
    private static final int OVERLAY_STATE = 1, OVERLAY_EXTRA = 4, OVERLAY_NEW_STATE = 1024;
    private static final int HAS_BIOME = 0x100000, NEW_STATE = 0x200000, NEW_BIOME = 0x400000, BIOME_AS_INT = 0x800000, HAS_TOP_HEIGHT = 0x1000000;

    private static final class Region {
        /** By tile chunk (x << 3 | z, 4 x 4 chunks each), then chunk within it (i << 2 | j): null where nothing's drawn. */
        final Tile[][] tiles = new Tile[64][TILES];

        static Region read(File file) throws IOException {
            Region region = new Region();
            List<Entry> states = new ArrayList<>(), biomes = new ArrayList<>();
            try (ZipInputStream zip = new ZipInputStream(new BufferedInputStream(new FileInputStream(file), 8192));
                 // Buffered after inflating too: a pixel is a handful of small reads
                 DataInputStream in = new DataInputStream(new BufferedInputStream(zip, 64 * 1024))) {
                if (zip.getNextEntry() == null) throw new IOException("empty region file");
                if (in.read() != 255) throw new IOException("region file older than versioned saves");
                int version = in.readInt();
                if (version != FORMAT) throw new IOException("region format " + (version >> 16 & 0xFFFF) + "." + (version & 0xFFFF) + " isn't merged");
                while (true) {
                    int coords = in.read();
                    if (coords == -1) break;
                    if ((coords >> 4) > 7 || (coords & 15) > 7) throw new IOException("bad tile chunk coordinates " + coords);
                    int c = (coords >> 4) << 3 | (coords & 15);
                    for (int t = 0; t < TILES; t++) {
                        int first = in.readInt();
                        if (first == -1) continue;
                        Pixel[] pixels = new Pixel[PIXELS];
                        pixels[0] = readPixel(in, first, states, biomes);
                        for (int p = 1; p < PIXELS; p++) pixels[p] = readPixel(in, in.readInt(), states, biomes);
                        region.tiles[c][t] = new Tile(pixels, in.readUnsignedByte(), in.readInt(), in.readUnsignedByte());
                    }
                }
            }
            return region;
        }

        private static Pixel readPixel(DataInputStream in, int params, List<Entry> states, List<Entry> biomes) throws IOException {
            Entry state = null;
            if ((params & HAS_STATE) != 0) state = paletteEntry(in, (params & NEW_STATE) != 0, states);
            int height = (params & HAS_HEIGHT) != 0 ? in.readUnsignedByte() : -1;
            int topHeight = (params & HAS_TOP_HEIGHT) != 0 ? in.readUnsignedByte() : -1;
            Overlay[] overlays = null;
            if ((params & HAS_OVERLAYS) != 0) {
                overlays = new Overlay[in.readUnsignedByte()];
                for (int i = 0; i < overlays.length; i++) {
                    int overlayParams = in.readInt();
                    Entry overlayState = (overlayParams & OVERLAY_STATE) != 0
                        ? paletteEntry(in, (overlayParams & OVERLAY_NEW_STATE) != 0, states) : null;
                    int extra = (overlayParams & OVERLAY_EXTRA) != 0 ? in.readInt() : 0;
                    overlays[i] = new Overlay(overlayParams, overlayState, extra);
                }
            }
            Entry biome = null;
            if ((params & HAS_BIOME) != 0) {
                if ((params & NEW_BIOME) != 0) {
                    ByteArrayOutputStream bytes = new ByteArrayOutputStream();
                    DataOutputStream raw = new DataOutputStream(bytes);
                    // The first byte keeps how it was written: a number (old saves) or a name
                    if ((params & BIOME_AS_INT) != 0) {
                        raw.write(1);
                        raw.writeInt(in.readInt());
                    } else {
                        raw.write(0);
                        raw.writeUTF(in.readUTF());
                    }
                    biome = new Entry(bytes.toByteArray());
                    biomes.add(biome);
                } else {
                    biome = indexed(biomes, in.readInt());
                }
            }
            return new Pixel(params, state, height, topHeight, overlays, biome);
        }

        /** A block state: new to the palette (its NBT follows, kept as it is) or one before it. */
        private static Entry paletteEntry(DataInputStream in, boolean isNew, List<Entry> palette) throws IOException {
            if (!isNew) return indexed(palette, in.readInt());
            Entry entry = new Entry(copyNbt(in));
            palette.add(entry);
            return entry;
        }

        private static Entry indexed(List<Entry> palette, int index) throws IOException {
            if (index < 0 || index >= palette.size()) throw new IOException("palette index " + index + " out of " + palette.size());
            return palette.get(index);
        }

        void write(File file) throws IOException {
            Map<Entry, Integer> states = new HashMap<>(), biomes = new HashMap<>();
            try (ZipOutputStream zip = new ZipOutputStream(new BufferedOutputStream(new FileOutputStream(file)));
                 DataOutputStream out = new DataOutputStream(new BufferedOutputStream(zip, 64 * 1024))) {
                zip.putNextEntry(new ZipEntry("region.xaero"));
                out.write(255);
                out.writeInt(FORMAT);
                for (int c = 0; c < 64; c++) {
                    Tile[] chunk = tiles[c];
                    if (Arrays.stream(chunk).allMatch(tile -> tile == null)) continue;
                    out.write((c >> 3) << 4 | (c & 7));
                    for (Tile tile : chunk) {
                        if (tile == null) {
                            out.writeInt(-1);
                            continue;
                        }
                        for (Pixel pixel : tile.pixels()) writePixel(out, pixel, states, biomes);
                        out.write(tile.interpretation());
                        out.writeInt(tile.caveStart());
                        out.write(tile.caveDepth());
                    }
                }
                out.flush();
                zip.closeEntry();
            }
        }

        private static void writePixel(DataOutputStream out, Pixel pixel, Map<Entry, Integer> states, Map<Entry, Integer> biomes) throws IOException {
            int params = pixel.params() & ~(NEW_STATE | NEW_BIOME | BIOME_AS_INT);
            Integer stateIndex = pixel.state() == null ? null : states.get(pixel.state());
            if (pixel.state() != null && stateIndex == null) params |= NEW_STATE;
            Integer biomeIndex = pixel.biome() == null ? null : biomes.get(pixel.biome());
            if (pixel.biome() != null && biomeIndex == null) {
                params |= NEW_BIOME;
                if (pixel.biome().bytes()[0] == 1) params |= BIOME_AS_INT;
            }
            out.writeInt(params);
            if (pixel.state() != null) {
                if (stateIndex != null) out.writeInt(stateIndex);
                else {
                    out.write(pixel.state().bytes());
                    states.put(pixel.state(), states.size());
                }
            }
            if (pixel.height() >= 0) out.write(pixel.height());
            if (pixel.topHeight() >= 0) out.write(pixel.topHeight());
            if (pixel.overlays() != null) {
                out.write(pixel.overlays().length);
                for (Overlay overlay : pixel.overlays()) {
                    int overlayParams = overlay.params() & ~OVERLAY_NEW_STATE;
                    Integer index = overlay.state() == null ? null : states.get(overlay.state());
                    if (overlay.state() != null && index == null) overlayParams |= OVERLAY_NEW_STATE;
                    out.writeInt(overlayParams);
                    if (overlay.state() != null) {
                        if (index != null) out.writeInt(index);
                        else {
                            out.write(overlay.state().bytes());
                            states.put(overlay.state(), states.size());
                        }
                    }
                    if ((overlay.params() & OVERLAY_EXTRA) != 0) out.writeInt(overlay.extra());
                }
            }
            if (pixel.biome() != null) {
                if (biomeIndex != null) out.writeInt(biomeIndex);
                else {
                    byte[] bytes = pixel.biome().bytes();
                    out.write(bytes, 1, bytes.length - 1);
                    biomes.put(pixel.biome(), biomes.size());
                }
            }
        }
    }

    // ---- NBT copying: a root compound as NbtIo.writeCompound writes it, bytes kept as they are ----

    private static byte[] copyNbt(DataInputStream in) throws IOException {
        ByteArrayOutputStream bytes = new ByteArrayOutputStream(64);
        DataOutputStream out = new DataOutputStream(bytes);
        int type = in.readUnsignedByte();
        out.write(type);
        if (type != 0) {
            out.writeUTF(in.readUTF());
            copyNbtPayload(in, out, type, 0);
        }
        return bytes.toByteArray();
    }

    private static void copyNbtPayload(DataInputStream in, DataOutputStream out, int type, int depth) throws IOException {
        if (depth > 64) throw new IOException("NBT nested too deep");
        switch (type) {
            case 1 -> out.write(in.readByte());
            case 2 -> out.writeShort(in.readShort());
            case 3 -> out.writeInt(in.readInt());
            case 4 -> out.writeLong(in.readLong());
            case 5 -> out.writeFloat(in.readFloat());
            case 6 -> out.writeDouble(in.readDouble());
            case 7 -> copyArray(in, out, 1);
            case 8 -> out.writeUTF(in.readUTF());
            case 9 -> {
                int elementType = in.readUnsignedByte();
                int length = in.readInt();
                out.write(elementType);
                out.writeInt(length);
                for (int i = 0; i < length; i++) copyNbtPayload(in, out, elementType, depth + 1);
            }
            case 10 -> {
                while (true) {
                    int child = in.readUnsignedByte();
                    out.write(child);
                    if (child == 0) break;
                    out.writeUTF(in.readUTF());
                    copyNbtPayload(in, out, child, depth + 1);
                }
            }
            case 11 -> copyArray(in, out, 4);
            case 12 -> copyArray(in, out, 8);
            default -> throw new IOException("bad NBT tag type " + type);
        }
    }

    private static void copyArray(DataInputStream in, DataOutputStream out, int elementBytes) throws IOException {
        int length = in.readInt();
        if (length < 0 || length > 1 << 20) throw new IOException("bad NBT array length " + length);
        out.writeInt(length);
        out.write(in.readNBytes(length * elementBytes));
    }
}
