package dev.onfocus.addon.maps;

import net.minecraft.block.BlockState;
import net.minecraft.block.MapColor;
import net.minecraft.client.world.ClientWorld;
import net.minecraft.fluid.FluidState;
import net.minecraft.util.math.BlockPos;
import net.minecraft.world.Heightmap;
import net.minecraft.world.chunk.ChunkStatus;
import net.minecraft.world.chunk.WorldChunk;

/**
 * Tells which map cell a map's picture shows, by comparing it with the loaded world: the client is
 * never told a map's centre. Every second column of a 128x128 cell is looked at the way the game
 * colours a scale-0 map (the top block that isn't see-through, water as water) and only the base
 * colour is compared, not the shade. New buildings change a few pixels; another place changes most.
 */
public final class MapMatcher {
    /** Columns looked at per side of a cell: every second block. */
    public static final int SIDE = 64;
    private static final int STEP = 128 / SIDE;
    /** Columns with a colour on both sides needed for a score: a quarter of the cell. */
    private static final int MIN_COMPARED = SIDE * SIDE / 4;
    /** How deep under the surface see-through blocks (glass, air under a heightmap glitch) are looked through. */
    private static final int MAX_DEPTH = 64;

    private MapMatcher() {}

    /**
     * The base colour ids of a cell's columns (SIDE x SIDE, rows north to south), 0 where nothing is
     * known; null when under 80% of it is loaded.
     */
    public static byte[] sample(ClientWorld world, int cellX, int cellZ) {
        byte[] out = new byte[SIDE * SIDE];
        int x0 = cellX * 128 - 64, z0 = cellZ * 128 - 64;
        int bottom = world.getBottomY();
        int known = 0;
        BlockPos.Mutable pos = new BlockPos.Mutable();
        for (int chunkX = x0 >> 4; chunkX <= (x0 + 127) >> 4; chunkX++) {
            for (int chunkZ = z0 >> 4; chunkZ <= (z0 + 127) >> 4; chunkZ++) {
                WorldChunk chunk = world.getChunkManager().getChunk(chunkX, chunkZ, ChunkStatus.FULL, false);
                if (chunk == null) continue;
                for (int lx = 0; lx < 16; lx += STEP) {
                    for (int lz = 0; lz < 16; lz += STEP) {
                        int bx = (chunkX << 4) + lx, bz = (chunkZ << 4) + lz;
                        int y = chunk.sampleHeightmap(Heightmap.Type.WORLD_SURFACE, lx, lz);
                        MapColor color = MapColor.CLEAR;
                        BlockState state = null;
                        for (int depth = 0; depth < MAX_DEPTH && y > bottom; depth++) {
                            y--;
                            pos.set(bx, y, bz);
                            state = chunk.getBlockState(pos);
                            color = state.getMapColor(world, pos);
                            if (color != MapColor.CLEAR) break;
                        }
                        if (state != null) {
                            FluidState fluid = state.getFluidState();
                            if (!fluid.isEmpty()) color = fluid.getBlockState().getMapColor(world, pos);
                        }
                        if (color == MapColor.CLEAR) continue;
                        out[(bx - x0) / STEP + (bz - z0) / STEP * SIDE] = (byte) color.id;
                        known++;
                    }
                }
            }
        }
        return known >= SIDE * SIDE * 8 / 10 ? out : null;
    }

    /** Whether a sample tells places apart: not all one colour, as open sea or a desert is. */
    public static boolean distinctive(byte[] sample) {
        int[] counts = new int[256];
        int known = 0, most = 0;
        for (byte b : sample) {
            if (b == 0) continue;
            known++;
            most = Math.max(most, ++counts[b & 0xFF]);
        }
        return known > 0 && most < known * 8 / 10;
    }

    /** Share (0..1) of the columns where the map shows the colour the world has; -1 when too few can be compared. */
    public static double score(byte[] sample, byte[] colors) {
        int compared = 0, same = 0;
        for (int sz = 0; sz < SIDE; sz++) {
            for (int sx = 0; sx < SIDE; sx++) {
                int expected = sample[sx + sz * SIDE] & 0xFF;
                int pixel = colors[sx * STEP + sz * STEP * 128] & 0xFF;
                if (expected == 0 || pixel == 0) continue;
                compared++;
                if (pixel >> 2 == expected) same++;
            }
        }
        return compared < MIN_COMPARED ? -1 : (double) same / compared;
    }
}
