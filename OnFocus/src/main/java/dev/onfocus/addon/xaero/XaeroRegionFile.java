package dev.onfocus.addon.xaero;

import java.io.BufferedInputStream;
import java.io.DataInputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;
import java.util.function.BooleanSupplier;
import java.util.zip.ZipInputStream;

/**
 * Reads which chunks a Xaero's World Map region save file (the {@code x_z.zip} files) has a tile
 * for, without decoding any pixels.
 * <p>
 * Mirrors {@code xaero.map.file.MapSaveLoad.loadRegion}/{@code loadPixel}/{@code loadOverlay}
 * (World Map 1.40): every field those read is read here too, just thrown away. Deliberately free
 * of Minecraft and Xaero classes, so it can run on any thread.
 */
public final class XaeroRegionFile {
    private XaeroRegionFile() {}

    /** Receives the chunk coordinates of every chunk that has a saved tile. */
    @FunctionalInterface
    public interface ChunkSink {
        void accept(int chunkX, int chunkZ);
    }

    /**
     * @param regionX region coordinate (chunk X >> 5)
     * @param regionZ region coordinate (chunk Z >> 5)
     * @param cancelled polled between tile chunks, to abandon the read early
     */
    public static void read(File file, int regionX, int regionZ, ChunkSink sink, BooleanSupplier cancelled) throws IOException {
        try (ZipInputStream zip = new ZipInputStream(new BufferedInputStream(new FileInputStream(file), 8192));
             DataInputStream in = new DataInputStream(zip)) {
            if (zip.getNextEntry() == null) return;

            int minor = -1, major = 0;
            boolean is115not114 = false;
            int firstByte = in.read();
            if (firstByte == 255) {
                int fullVersion = in.readInt();
                minor = fullVersion & 0xFFFF;
                major = fullVersion >> 16 & 0xFFFF;
                if (major == 2 && minor >= 5) is115not114 = in.read() == 1;
                if (minor > 8 || major > 6) throw new IOException("unsupported map format " + major + "." + minor);
                firstByte = -1;
            }
            boolean stillUsesColorTypes = minor < 5 || major <= 2 && !is115not114;

            while (true) {
                int coords = firstByte == -1 ? in.read() : firstByte;
                firstByte = -1;
                if (coords == -1) break;
                if (cancelled.getAsBoolean()) return;
                if ((coords >> 4) > 7 || (coords & 15) > 7) throw new IOException("bad tile chunk coordinates " + coords);

                int tileChunkX = (regionX << 3) + (coords >> 4);
                int tileChunkZ = (regionZ << 3) + (coords & 15);

                for (int i = 0; i < 4; i++) {
                    for (int j = 0; j < 4; j++) {
                        int next = in.readInt();
                        if (next == -1) continue; // no tile saved for this chunk

                        sink.accept((tileChunkX << 2) + i, (tileChunkZ << 2) + j);

                        skipPixel(in, next, minor, major, stillUsesColorTypes);
                        for (int p = 1; p < 256; p++) skipPixel(in, in.readInt(), minor, major, stillUsesColorTypes);

                        if (minor >= 4) in.readByte(); // world interpretation version
                        if (minor >= 6) {
                            in.readInt(); // written cave start
                            if (minor >= 7) in.readByte(); // written cave depth
                        }
                    }
                }
            }
        }
    }

    private static void skipPixel(DataInputStream in, int params, int minor, int major, boolean stillUsesColorTypes) throws IOException {
        if ((params & 1) != 0) {
            if (major == 0 || (params & 0x200000) == 0) in.readInt(); // state id / palette index
            else skipNbtCompound(in); // new palette entry
        }
        if ((params & 64) != 0) in.readByte(); // height
        if (minor >= 4 && (params & 0x1000000) != 0) in.readByte(); // top height

        if ((params & 2) != 0) {
            int overlays = in.readUnsignedByte();
            for (int i = 0; i < overlays; i++) skipOverlay(in, minor, major, stillUsesColorTypes);
        }

        int colourType = stillUsesColorTypes ? params >> 2 & 3 : 0;
        if (colourType == 3) in.readInt();

        if (colourType != 0 && colourType != 3 || (params & 0x100000) != 0) {
            if (major < 4) {
                int biomeByte = in.readUnsignedByte();
                if (minor >= 3 && biomeByte >= 255) in.readInt();
            } else if ((params & 0x400000) != 0) {
                if ((params & 0x800000) != 0) in.readInt();
                else in.readUTF();
            } else {
                in.readInt();
            }
        }

        if (minor == 2 && (params & 16) != 0) in.readByte(); // slope
    }

    private static void skipOverlay(DataInputStream in, int minor, int major, boolean stillUsesColorTypes) throws IOException {
        int params = in.readInt();
        if ((params & 1) != 0) {
            if (major == 0 || (params & 1024) == 0) in.readInt();
            else skipNbtCompound(in);
        }
        if (minor < 1 && (params & 2) != 0) in.readInt();

        int colourType = stillUsesColorTypes ? params >> 8 & 3 : 0;
        if (colourType == 2 || (params & 4) != 0) in.readInt();
        if (minor < 8 && (params & 8) != 0) in.readInt();
    }

    // ---- Minimal NBT skipping (a root compound, as written by NbtIo.writeCompound) ----

    private static void skipNbtCompound(DataInputStream in) throws IOException {
        int type = in.readUnsignedByte();
        if (type == 0) return; // TAG_End as root: empty
        in.readUTF(); // root name
        skipNbtPayload(in, type);
    }

    private static void skipNbtPayload(DataInputStream in, int type) throws IOException {
        switch (type) {
            case 1 -> in.readByte();
            case 2 -> in.readShort();
            case 3 -> in.readInt();
            case 4 -> in.readLong();
            case 5 -> in.readFloat();
            case 6 -> in.readDouble();
            case 7 -> in.skipNBytes(in.readInt());
            case 8 -> in.readUTF();
            case 9 -> {
                int elementType = in.readUnsignedByte();
                int length = in.readInt();
                for (int i = 0; i < length; i++) skipNbtPayload(in, elementType);
            }
            case 10 -> {
                while (true) {
                    int child = in.readUnsignedByte();
                    if (child == 0) break;
                    in.readUTF();
                    skipNbtPayload(in, child);
                }
            }
            case 11 -> in.skipNBytes(4L * in.readInt());
            case 12 -> in.skipNBytes(8L * in.readInt());
            default -> throw new IOException("bad NBT tag type " + type);
        }
    }
}
