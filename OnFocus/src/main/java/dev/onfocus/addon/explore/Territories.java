package dev.onfocus.addon.explore;

import dev.onfocus.addon.explore.CoveragePlanner.Area;
import net.minecraft.nbt.NbtCompound;
import net.minecraft.nbt.NbtIo;
import net.minecraft.nbt.NbtSizeTracker;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.time.Instant;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Consumer;
import java.util.stream.Stream;

/**
 * The ground Area Explorer has scanned, kept per server: one territory per run (the run's area and
 * the cells of it really flown over), plus one rebuilt from the finds file for runs from before
 * territories were kept. Each can be shown on Xaero's World Map or hidden; a file each, under
 * {@code onfocus/area-explorer/territories/<server>/}.
 */
public final class Territories {
    /** What a territory came from. */
    public enum Kind { RUN, RESCAN, FINDS }

    public static final class Territory {
        public final String id;
        public final String dimension;
        public final Kind kind;
        public final long createdAt;
        public final Area area;
        public Coverage coverage;
        public boolean visible;

        Territory(String id, String dimension, Kind kind, long createdAt, Area area, Coverage coverage, boolean visible) {
            this.id = id;
            this.dimension = dimension;
            this.kind = kind;
            this.createdAt = createdAt;
            this.area = area;
            this.coverage = coverage;
            this.visible = visible;
        }

        private static final DateTimeFormatter DATE = DateTimeFormatter.ofPattern("dd.MM HH:mm").withZone(ZoneId.systemDefault());

        /** "06.10 18:14 · Rescan 1369x1233 · 42%" */
        public String title() {
            String what = switch (kind) {
                case RUN -> "Run %dx%d".formatted(area.width(), area.depth());
                case RESCAN -> "Rescan %dx%d".formatted(area.width(), area.depth());
                case FINDS -> "Earlier runs, from the finds";
            };
            return "%s · %s · %d%%".formatted(DATE.format(Instant.ofEpochMilli(createdAt)), what, Math.round(coverage.coveredShare() * 100));
        }

        /** "X -2592..17247, Z -5760..13167" */
        public String where() {
            return "X %d..%d, Z %d..%d".formatted(area.minCX() * 16, area.maxCX() * 16 + 15, area.minCZ() * 16, area.maxCZ() * 16 + 15);
        }
    }

    private static final Map<Path, Territories> OPEN = new HashMap<>();

    private final Path dir;
    private final List<Territory> list = new ArrayList<>();
    private final Consumer<String> problem;

    private Territories(Path dir, Consumer<String> problem) {
        this.dir = dir;
        this.problem = problem;
        load();
    }

    /** The territories of a server (by its folder), read from disk the first time. */
    public static synchronized Territories of(Path dir, Consumer<String> problem) {
        return OPEN.computeIfAbsent(dir, d -> new Territories(d, problem));
    }

    /** Newest first. */
    public synchronized List<Territory> all() {
        return new ArrayList<>(list);
    }

    public synchronized Territory get(String id) {
        for (Territory t : list) if (t.id.equals(id)) return t;
        return null;
    }

    /** The shown ones of a dimension ("overworld"), leaving out the one with the given id (the run going on). */
    public synchronized List<Territory> visible(String dimension, String except) {
        List<Territory> shown = new ArrayList<>();
        for (Territory t : list) {
            if (t.visible && t.dimension.equals(dimension) && !t.id.equals(except)) shown.add(t);
        }
        return shown;
    }

    /** A new territory, or the same one again with its coverage as it is now. */
    public synchronized Territory put(String id, String dimension, Kind kind, Area area, Coverage coverage) {
        Territory t = get(id);
        // Rebuilt over different ground (the finds one, after more finds): a new one, shown or not as it was
        boolean visible = t == null || t.visible;
        if (t != null && !t.area.equals(area)) {
            list.remove(t);
            t = null;
        }
        if (t == null) {
            t = new Territory(id, dimension, kind, System.currentTimeMillis(), area, coverage, visible);
            list.add(t);
            list.sort(Comparator.comparingLong((Territory x) -> x.createdAt).reversed());
        } else {
            t.coverage = coverage;
        }
        save(t);
        return t;
    }

    public synchronized void setVisible(Territory t, boolean visible) {
        t.visible = visible;
        save(t);
    }

    public synchronized void delete(Territory t) {
        list.remove(t);
        try {
            Files.deleteIfExists(file(t.id));
        } catch (IOException e) {
            problem.accept("Couldn't delete territory " + t.id + ": " + e.getMessage());
        }
    }

    private Path file(String id) {
        return dir.resolve(id.replaceAll("[^A-Za-z0-9._-]", "_") + ".nbt");
    }

    private void save(Territory t) {
        NbtCompound tag = new NbtCompound();
        tag.putString("id", t.id);
        tag.putString("dimension", t.dimension);
        tag.putString("kind", t.kind.name());
        tag.putLong("created", t.createdAt);
        tag.putBoolean("visible", t.visible);
        tag.putInt("min-x", t.area.minCX());
        tag.putInt("min-z", t.area.minCZ());
        tag.putInt("max-x", t.area.maxCX());
        tag.putInt("max-z", t.area.maxCZ());
        tag.putLongArray("cells", t.coverage.toLongArray());
        try {
            Files.createDirectories(dir);
            Path out = file(t.id), tmp = out.resolveSibling(out.getFileName() + ".tmp");
            NbtIo.writeCompressed(tag, tmp);
            Files.move(tmp, out, StandardCopyOption.REPLACE_EXISTING);
        } catch (IOException e) {
            problem.accept("Couldn't save territory " + t.id + ": " + e.getMessage());
        }
    }

    private void load() {
        if (!Files.isDirectory(dir)) return;
        try (Stream<Path> files = Files.list(dir)) {
            for (Path f : files.filter(p -> p.getFileName().toString().endsWith(".nbt")).toList()) {
                try {
                    NbtCompound tag = NbtIo.readCompressed(f, NbtSizeTracker.ofUnlimitedBytes());
                    Area area = new Area(tag.getInt("min-x"), tag.getInt("min-z"), tag.getInt("max-x"), tag.getInt("max-z"));
                    Coverage coverage = new Coverage(area);
                    coverage.restore(tag.getLongArray("cells"));
                    Kind kind;
                    try {
                        kind = Kind.valueOf(tag.getString("kind"));
                    } catch (IllegalArgumentException e) {
                        kind = Kind.RUN;
                    }
                    list.add(new Territory(tag.getString("id"), tag.getString("dimension"), kind, tag.getLong("created"), area, coverage, tag.getBoolean("visible")));
                } catch (IOException | RuntimeException e) {
                    problem.accept("Couldn't read territory " + f.getFileName() + ": " + e.getMessage());
                }
            }
        } catch (IOException e) {
            problem.accept("Couldn't list territories: " + e.getMessage());
        }
        list.sort(Comparator.comparingLong((Territory x) -> x.createdAt).reversed());
    }
}
