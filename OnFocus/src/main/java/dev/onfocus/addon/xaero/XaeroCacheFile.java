package dev.onfocus.addon.xaero;

import java.io.BufferedInputStream;
import java.io.DataInputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;
import java.util.zip.ZipInputStream;

/**
 * Reads the picture of a region out of Xaero's World Map texture cache (the {@code x_z.xwmc} files
 * in {@code cache_<version>}): 512 x 512 pixels, one a block, as Xaero draws them.
 * <p>
 * Mirrors {@code xaero.map.region.LeveledRegion.saveCacheTextures} and
 * {@code RegionTexture.writeCacheMapData} (World Map 1.40, cache format 1.24): the texture of each
 * 64 x 64-pixel tile chunk is kept as it goes to the GPU - {@code GL_BGRA} packed as
 * {@code GL_UNSIGNED_INT_8_8_8_8}, so bytes light, red, green, blue - followed by heights and
 * biomes, which are skipped. Free of Minecraft and Xaero classes, so it can run on any thread.
 */
public final class XaeroCacheFile {
    private XaeroCacheFile() {}

    public static final int SIZE = 512;
    private static final int SUPPORTED_VERSION = (1 << 16) | 24;
    private static final int TILE = 64;
    private static final int TEXTURE_BYTES = TILE * TILE * 4;
    /** 4096 13-bit values, 4 to a long. */
    private static final int HEIGHT_LONGS = 1024;
    private static final int BIOME_LONGS = 1024;
    private static final int END = 255;

    /**
     * The region's pixels as ARGB, row by row, undrawn ones 0; null if no tile chunk in it has a
     * texture this can read.
     *
     * @throws IOException unreadable, or a cache format other than the one this knows
     */
    public static int[] read(File file) throws IOException {
        try (ZipInputStream zip = new ZipInputStream(new BufferedInputStream(new FileInputStream(file), 1 << 16));
             DataInputStream in = new DataInputStream(zip)) {
            if (zip.getNextEntry() == null) throw new IOException("empty cache file");
            int version = in.readInt();
            if (version != SUPPORTED_VERSION) {
                throw new IOException("unsupported cache format " + (version >>> 16) + "." + (version & 0xFFFF));
            }

            // MapRegion.writeCacheMetaData: cache hash, reload version, highlights hash, cave start, cave depth
            in.skipNBytes(5 * 4);
            // LeveledRegion.writeCacheMetaData: each tile chunk's texture version
            while (in.readUnsignedByte() != END) in.readInt();
            // saveBiomePalette
            int biomes = in.readInt();
            for (int i = 0; i < biomes; i++) if (in.readUnsignedByte() != END) in.readUTF();

            int[] pixels = new int[SIZE * SIZE];
            boolean any = false;
            byte[] texture = new byte[TEXTURE_BYTES];
            while (true) {
                int coords = in.readUnsignedByte();
                if (coords == END) break;
                int tileX = coords >> 4, tileZ = coords & 15;
                if (tileX > 7 || tileZ > 7) throw new IOException("bad tile chunk coordinates " + coords);
                boolean compressed = in.readUnsignedByte() != 0;
                in.readInt(); // GL internal format
                int length = in.readInt();
                boolean readable = !compressed && length == TEXTURE_BYTES;
                if (readable) in.readFully(texture);
                else in.skipNBytes(length);
                in.readBoolean(); // has light
                in.skipNBytes(8L * HEIGHT_LONGS * 2); // heights, top heights
                skipBiomeIndexStorage(in);
                if (readable) any |= copyTexture(texture, pixels, tileX * TILE, tileZ * TILE);
            }
            return any ? pixels : null;
        }
    }

    /** RegionTexture.saveBiomeIndexStorage */
    private static void skipBiomeIndexStorage(DataInputStream in) throws IOException {
        int paletteSize = in.readInt();
        if (paletteSize <= 0) return;
        for (int i = 0; i < paletteSize; i++) if (in.readInt() != -1) in.readShort();
        if (in.readUnsignedByte() == 1) in.skipNBytes(8L * BIOME_LONGS);
    }

    private static boolean copyTexture(byte[] texture, int[] pixels, int left, int top) {
        boolean any = false;
        for (int y = 0; y < TILE; y++) {
            for (int x = 0; x < TILE; x++) {
                int i = (y * TILE + x) * 4;
                int r = texture[i + 1] & 0xFF, g = texture[i + 2] & 0xFF, b = texture[i + 3] & 0xFF;
                // Undrawn pixels are all zero; the first byte is light for the night view, not alpha
                if ((r | g | b) == 0) continue;
                pixels[(top + y) * SIZE + left + x] = 0xFF000000 | r << 16 | g << 8 | b;
                any = true;
            }
        }
        return any;
    }
}
