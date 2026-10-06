package dev.onfocus.addon.explore;

import dev.onfocus.addon.explore.CoveragePlanner.Area;

import java.util.ArrayList;
import java.util.Base64;
import java.util.BitSet;
import java.util.List;

/**
 * The ground of an area flown over this run, for showing where the explorer has been: on Xaero's
 * World Map and on the site. A grid of square cells of whole chunks over the area - as many chunks
 * a side as keeps the grid to about {@link #MAX_CELLS} cells, so it stays small enough to send to
 * the site every few seconds however big the area is. A cell counts once its middle chunk has been
 * loaded within the swath of the player - what the server really sent, not what the strip spacing assumes.
 */
public final class Coverage {
    /** Cells in the grid at most, about: 100,000 bits are 12.5 KB. */
    public static final int MAX_CELLS = 100_000;

    private final Area area;
    /** Chunks a side of a cell. */
    private final int cell;
    private final int cols, rows;
    private final BitSet bits;
    private int version;
    /** The rectangles to draw, worked out again only after a change. */
    private List<int[]> runs;
    private int runsVersion = -1;

    public Coverage(Area area) {
        this.area = area;
        this.cell = Math.max(1, (int) Math.ceil(Math.sqrt(area.total() / (double) MAX_CELLS)));
        this.cols = Math.floorDiv(area.width() + cell - 1, cell);
        this.rows = Math.floorDiv(area.depth() + cell - 1, cell);
        this.bits = new BitSet(cols * rows);
    }

    public Area area() {
        return area;
    }

    public int cell() {
        return cell;
    }

    /** Goes up with every change: whoever shows it knows when to draw it again. */
    public int version() {
        return version;
    }

    /**
     * The cells whose middle chunk is within {@code reach} chunks (a square) of chunk (cx, cz) and
     * {@code loaded}. True if any were new.
     */
    public boolean markAround(int cx, int cz, int reach, CoveragePlanner.ChunkTest loaded) {
        int minCol = Math.max(0, Math.floorDiv(cx - reach - area.minCX(), cell));
        int maxCol = Math.min(cols - 1, Math.floorDiv(cx + reach - area.minCX(), cell));
        int minRow = Math.max(0, Math.floorDiv(cz - reach - area.minCZ(), cell));
        int maxRow = Math.min(rows - 1, Math.floorDiv(cz + reach - area.minCZ(), cell));
        boolean changed = false;
        for (int row = minRow; row <= maxRow; row++) {
            int midZ = area.minCZ() + row * cell + cell / 2;
            if (Math.abs(midZ - cz) > reach) continue;
            for (int col = minCol; col <= maxCol; col++) {
                int midX = area.minCX() + col * cell + cell / 2;
                if (Math.abs(midX - cx) > reach) continue;
                int index = row * cols + col;
                if (bits.get(index) || !loaded.test(midX, midZ)) continue;
                bits.set(index);
                changed = true;
            }
        }
        if (changed) version++;
        return changed;
    }

    /** The cell holding chunk (cx, cz), whether its middle is near or not: a find there means it was loaded. */
    public boolean markChunk(int cx, int cz) {
        if (!area.contains(cx, cz)) return false;
        int index = Math.floorDiv(cz - area.minCZ(), cell) * cols + Math.floorDiv(cx - area.minCX(), cell);
        if (bits.get(index)) return false;
        bits.set(index);
        version++;
        return true;
    }

    /** Share of the grid covered, 0..1. */
    public double coveredShare() {
        return bits.cardinality() / (double) (cols * rows);
    }

    /**
     * The covered ground as rectangles of chunks {minCX, minCZ, maxCX, maxCZ}: each row's runs of
     * covered cells, joined with the rows below while they run the same - a strip is one rectangle.
     */
    public List<int[]> rectangles() {
        if (runsVersion == version && runs != null) return runs;
        List<int[]> done = new ArrayList<>();
        // Runs of the row above still growing downwards, by {startCol, endCol, startRow}
        List<int[]> open = new ArrayList<>();
        for (int row = 0; row <= rows; row++) {
            List<int[]> current = new ArrayList<>();
            if (row < rows) {
                int col = bits.nextSetBit(row * cols);
                while (col >= 0 && col < (row + 1) * cols) {
                    int end = bits.nextClearBit(col);
                    int last = Math.min(end, (row + 1) * cols) - 1;
                    current.add(new int[]{col - row * cols, last - row * cols});
                    col = bits.nextSetBit(last + 1);
                }
            }
            List<int[]> stillOpen = new ArrayList<>();
            for (int[] run : open) {
                int[] match = null;
                for (int[] c : current) if (c[0] == run[0] && c[1] == run[1]) match = c;
                if (match != null) {
                    current.remove(match);
                    stillOpen.add(run);
                } else {
                    done.add(toChunks(run[0], run[1], run[2], row - 1));
                }
            }
            for (int[] c : current) stillOpen.add(new int[]{c[0], c[1], row});
            open = stillOpen;
        }
        runs = done;
        runsVersion = version;
        return runs;
    }

    private int[] toChunks(int startCol, int endCol, int startRow, int endRow) {
        return new int[]{
            area.minCX() + startCol * cell, area.minCZ() + startRow * cell,
            Math.min(area.maxCX(), area.minCX() + (endCol + 1) * cell - 1), Math.min(area.maxCZ(), area.minCZ() + (endRow + 1) * cell - 1)
        };
    }

    /** The cells as base64, bit i (row-major) in byte i / 8 at bit i % 8 - what the site reads. */
    public String encode() {
        byte[] bytes = new byte[(cols * rows + 7) / 8];
        byte[] set = bits.toByteArray();
        System.arraycopy(set, 0, bytes, 0, Math.min(set.length, bytes.length));
        return Base64.getEncoder().encodeToString(bytes);
    }

    public int cols() {
        return cols;
    }

    public int rows() {
        return rows;
    }

    /** For the saved run. */
    public long[] toLongArray() {
        return bits.toLongArray();
    }

    /** A saved run's cells, if it was the same area. */
    public void restore(long[] saved) {
        bits.clear();
        bits.or(BitSet.valueOf(saved));
        if (bits.length() > cols * rows) bits.clear(cols * rows, bits.length());
        version++;
    }
}
