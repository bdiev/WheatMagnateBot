package dev.onfocus.addon.explore;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Stream;

/**
 * Everything Area Explorer found on one server in one dimension, over all runs, with no find twice:
 * kept as a table ({@code all-finds_<dimension>.csv}) and written out for reading like a run's finds
 * file ({@code ALL FINDS - <dimension>.txt}).
 * <p>
 * The same sign is the one at the same block; the same item, one of the same kind, count and name at
 * the same block (items lying in unloaded chunks stay there for good); the same base, one within
 * {@link #SAME_BASE_DISTANCE} blocks of a base already in. The finds files of earlier runs are read
 * into it too ({@link #importRunFiles}), as many times as wanted - what's in already is skipped.
 * <p>
 * Not thread-safe: Area Explorer only touches it from its file thread.
 */
public final class FindsArchive {
    public enum Kind { BASE, SIGN, ITEM, MARKER }

    /**
     * One find. {@code name}: the base's ("Base #47"), the sign's block ("Oak Sign"), the item's
     * ("Elytra") or what a marker marks ("End Portal", "Shulker Box", a custom block's name). For a
     * base, {@code details} is what it was scored on; for a sign, {@code details} is the front text
     * and {@code label} the back; for an item, {@code label} is its custom name.
     */
    public record Find(Kind kind, int x, int y, int z, LocalDateTime found, String name, int count, String label, String details) {
        public Find {
            label = label == null ? "" : label;
            details = details == null ? "" : details;
        }
    }

    /** Bases closer than this are taken for one: the same base found again, a little off. */
    public static final int SAME_BASE_DISTANCE = 64;

    private static final DateTimeFormatter CSV_TIME = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");
    private static final DateTimeFormatter TEXT_TIME = DateTimeFormatter.ofPattern("dd.MM.yyyy HH:mm:ss");
    private static final DateTimeFormatter HEADER_TIME = DateTimeFormatter.ofPattern("dd.MM.yyyy HH:mm");
    private static final String CSV_HEADER = "type,x,y,z,found,name,count,label,details";
    private static final String INDENT = "      ";

    private final Path csvFile, textFile;
    private final String server, dimension;
    private final List<Find> finds = new ArrayList<>();
    private final Set<String> keys = new HashSet<>();
    private final List<Find> bases = new ArrayList<>();
    /** Item names in the order the items section lists them; the rest go after. */
    private Map<String, Integer> itemOrder = Map.of();
    private boolean dirty;

    private FindsArchive(Path dir, String server, String dimensionId) {
        this.csvFile = dir.resolve("all-finds_" + dimensionId + ".csv");
        this.textFile = dir.resolve("ALL FINDS - " + dimensionId + ".txt");
        this.server = server;
        this.dimension = prettyName(dimensionId);
    }

    /** The archive of the server whose finds files are in {@code dir}, read from its table if it has one. */
    public static FindsArchive load(Path dir, String server, String dimensionId) throws IOException {
        FindsArchive archive = new FindsArchive(dir, server, dimensionId);
        if (Files.exists(archive.csvFile)) {
            List<List<String>> rows = parseCsv(Files.readString(archive.csvFile, StandardCharsets.UTF_8));
            for (int i = 1; i < rows.size(); i++) {
                Find find = fromRow(rows.get(i));
                if (find != null) archive.add(find);
            }
            archive.dirty = false;
        }
        return archive;
    }

    public Path textFile() {
        return textFile;
    }

    public Path csvFile() {
        return csvFile;
    }

    /** Every find, in the order they came in: the table's order, then the new ones. */
    public List<Find> all() {
        return List.copyOf(finds);
    }

    public int size() {
        return finds.size();
    }

    /** The finds of one kind, in the order they came in. */
    public List<Find> finds(Kind kind) {
        List<Find> list = new ArrayList<>();
        for (Find f : finds) if (f.kind() == kind) list.add(f);
        return list;
    }

    public boolean isDirty() {
        return dirty;
    }

    public void setItemOrder(List<String> names) {
        Map<String, Integer> order = new HashMap<>();
        for (int i = 0; i < names.size(); i++) order.putIfAbsent(names.get(i), i);
        if (!order.equals(itemOrder)) dirty = true;
        itemOrder = order;
    }

    /** Adds the find unless it's in already; true if it was new. */
    public boolean add(Find find) {
        if (find.kind() == Kind.BASE) {
            long d2 = (long) SAME_BASE_DISTANCE * SAME_BASE_DISTANCE;
            for (Find base : bases) {
                long dx = base.x() - find.x(), dz = base.z() - find.z();
                if (dx * dx + dz * dz <= d2) return false;
            }
            bases.add(find);
        } else if (!keys.add(key(find))) {
            return false;
        }
        finds.add(find);
        dirty = true;
        return true;
    }

    private static String key(Find find) {
        String at = find.kind() + " " + find.x() + " " + find.y() + " " + find.z();
        if (find.kind() == Kind.MARKER) return at + " " + find.name();
        return find.kind() == Kind.ITEM ? at + " " + find.name() + " " + find.count() + " " + find.label() : at;
    }

    // Earlier runs' finds files

    /** "2026-10-04_22-45-22_overworld.txt", with the item counts in front or not: a run's finds file. */
    private static Pattern runFileName(String dimensionId) {
        return Pattern.compile(".*\\d{4}-\\d\\d-\\d\\d_\\d\\d-\\d\\d-\\d\\d_" + Pattern.quote(dimensionId) + "\\.txt");
    }

    /** Reads every run's finds file of this dimension in the folder in; how many finds were new. */
    public int importRunFiles(Path dir, String dimensionId) throws IOException {
        Pattern name = runFileName(dimensionId);
        List<Path> files;
        try (Stream<Path> list = Files.list(dir)) {
            files = list.filter(p -> name.matcher(p.getFileName().toString()).matches()).sorted().toList();
        }
        int added = 0;
        for (Path file : files) {
            for (Find find : parseRunFile(Files.readAllLines(file, StandardCharsets.UTF_8))) {
                if (add(find)) added++;
            }
        }
        return added;
    }

    private static final Pattern ENTRY = Pattern.compile("^#\\d+\\s+X (-?\\d+)\\s+Y (-?\\d+)\\s+Z (-?\\d+)\\s+(.*) · (\\d\\d:\\d\\d:\\d\\d)$");
    private static final Pattern ITEM = Pattern.compile("^(.*?) ×(\\d+)(?: \"(.*)\")?$");
    private static final Pattern STARTED = Pattern.compile("Started:\\s+(\\d\\d\\.\\d\\d\\.\\d{4} \\d\\d:\\d\\d)");

    /**
     * The finds in a run's file. Entries only have the time: a time before the run's start is taken
     * for the next day (runs are shorter than a day).
     */
    static List<Find> parseRunFile(List<String> lines) {
        List<Find> out = new ArrayList<>();
        LocalDateTime started = null;
        Kind section = null;
        for (int i = 0; i < lines.size(); i++) {
            String line = lines.get(i);
            Matcher start = STARTED.matcher(line);
            if (started == null && start.find()) {
                started = LocalDateTime.parse(start.group(1), HEADER_TIME);
                // The first files had signs only, with no sections
                section = Kind.SIGN;
                continue;
            }
            if (line.startsWith("── ")) {
                section = line.startsWith("── BASES") ? Kind.BASE : line.startsWith("── SIGNS") ? Kind.SIGN
                    : line.startsWith("── ITEMS") ? Kind.ITEM : line.startsWith("── MARKERS") ? Kind.MARKER : null;
                continue;
            }
            if (line.startsWith("──")) section = null; // the footer
            Matcher entry = ENTRY.matcher(line);
            if (section == null || started == null || !entry.matches()) continue;

            int x = Integer.parseInt(entry.group(1)), y = Integer.parseInt(entry.group(2)), z = Integer.parseInt(entry.group(3));
            String what = entry.group(4);
            LocalTime time = LocalTime.parse(entry.group(5));
            LocalDate day = time.isBefore(started.toLocalTime().withSecond(0)) ? started.toLocalDate().plusDays(1) : started.toLocalDate();
            LocalDateTime found = LocalDateTime.of(day, time);

            switch (section) {
                case BASE -> {
                    String details = i + 1 < lines.size() ? lines.get(i + 1).strip() : "";
                    out.add(new Find(Kind.BASE, x, y, z, found, what, 0, "", details.startsWith("score") ? details : ""));
                }
                case SIGN -> {
                    // The boxes under it: front (untitled or "front") and back
                    StringBuilder front = new StringBuilder(), back = new StringBuilder();
                    StringBuilder box = front;
                    for (int j = i + 1; j < lines.size(); j++) {
                        String l = lines.get(j);
                        if (!l.startsWith(INDENT)) break;
                        String s = l.substring(INDENT.length());
                        if (s.startsWith("┌")) box = s.startsWith("┌─ back ") ? back : front;
                        else if (s.startsWith("│") && s.length() >= 4) {
                            if (!box.isEmpty()) box.append('\n');
                            box.append(s, 2, s.length() - 2);
                            int end = box.length();
                            while (end > 0 && box.charAt(end - 1) == ' ') end--;
                            box.setLength(end);
                        }
                    }
                    out.add(new Find(Kind.SIGN, x, y, z, found, what, 0, back.toString(), front.toString()));
                }
                case ITEM -> {
                    Matcher item = ITEM.matcher(what);
                    if (item.matches()) out.add(new Find(Kind.ITEM, x, y, z, found, item.group(1), Integer.parseInt(item.group(2)), item.group(3), ""));
                    else out.add(new Find(Kind.ITEM, x, y, z, found, what, 1, "", ""));
                }
                case MARKER -> out.add(new Find(Kind.MARKER, x, y, z, found, what, 0, "", ""));
            }
        }
        return out;
    }

    // Writing

    /** Writes the table and the text, each to a temporary file first so a crash can't leave half of one. */
    public void write() throws IOException {
        StringBuilder csv = new StringBuilder(CSV_HEADER).append('\n');
        for (Find f : finds) {
            csv.append(f.kind().name()).append(',').append(f.x()).append(',').append(f.y()).append(',').append(f.z()).append(',')
                .append(f.found().format(CSV_TIME)).append(',').append(csvField(f.name())).append(',').append(f.count()).append(',')
                .append(csvField(f.label())).append(',').append(csvField(f.details())).append('\n');
        }
        writeAtomically(csvFile, csv.toString());
        writeAtomically(textFile, text());
        dirty = false;
    }

    private static void writeAtomically(Path file, String content) throws IOException {
        Path tmp = file.resolveSibling(file.getFileName() + ".tmp");
        Files.writeString(tmp, content, StandardCharsets.UTF_8);
        Files.move(tmp, file, StandardCopyOption.REPLACE_EXISTING);
    }

    private String text() {
        List<Find> baseList = sorted(Kind.BASE, Comparator.comparing(Find::found));
        List<Find> signs = sorted(Kind.SIGN, Comparator.comparing(Find::found));
        List<Find> items = sorted(Kind.ITEM, Comparator.<Find>comparingInt(f -> itemOrder.getOrDefault(f.name(), Integer.MAX_VALUE))
            .thenComparing(Find::found));
        List<Find> markers = sorted(Kind.MARKER, Comparator.comparing(Find::name).thenComparing(Find::found));

        StringBuilder sb = new StringBuilder(header(baseList.size(), signs.size(), items.size(), markers.size()));
        sb.append(sectionTitle("MARKERS", markers.size()));
        int m = 0;
        for (Find f : markers) sb.append(entryLine(++m, f, f.name()));
        if (!markers.isEmpty()) sb.append('\n');
        sb.append(sectionTitle("BASES", baseList.size()));
        int n = 0;
        for (Find f : baseList) {
            sb.append(entryLine(++n, f, f.name()));
            if (!f.details().isEmpty()) sb.append(INDENT).append(f.details()).append('\n');
            sb.append('\n');
        }
        sb.append(sectionTitle("SIGNS", signs.size()));
        n = 0;
        for (Find f : signs) {
            sb.append(entryLine(++n, f, f.name()));
            if (f.label().isEmpty()) sb.append(signBox(f.details(), null));
            else if (f.details().isEmpty()) sb.append(signBox(f.label(), "back"));
            else sb.append(signBox(f.details(), "front")).append(signBox(f.label(), "back"));
            sb.append('\n');
        }
        sb.append(sectionTitle("ITEMS ON THE GROUND", items.size()));
        n = 0;
        for (Find f : items) {
            String what = f.name() + " ×" + f.count() + (f.label().isEmpty() ? "" : " \"" + f.label() + "\"");
            sb.append(entryLine(++n, f, what));
        }
        return sb.toString();
    }

    private List<Find> sorted(Kind kind, Comparator<Find> order) {
        List<Find> list = new ArrayList<>();
        for (Find f : finds) if (f.kind() == kind) list.add(f);
        list.sort(order);
        return list;
    }

    private String header(int bases, int signs, int items, int markers) {
        List<String> rows = List.of(
            "ALL FINDS BY AREA EXPLORER, EVERY RUN",
            "",
            "Server:      " + server,
            "Dimension:   " + dimension,
            "Updated:     " + LocalDateTime.now().format(HEADER_TIME),
            "Found:       %d bases, %d markers, %d signs, %d items".formatted(bases, markers, signs, items)
        );
        int width = 50;
        for (String row : rows) width = Math.max(width, row.length());
        StringBuilder sb = new StringBuilder("╔").append("═".repeat(width + 4)).append("╗\n");
        for (String row : rows) sb.append("║  ").append(row).append(" ".repeat(width - row.length())).append("  ║\n");
        return sb.append("╚").append("═".repeat(width + 4)).append("╝\n\n").toString();
    }

    private static String entryLine(int number, Find f, String what) {
        return "#%-5d X %-9d Y %-5d Z %-9d %s · %s\n".formatted(number, f.x(), f.y(), f.z(), what, f.found().format(TEXT_TIME));
    }

    /** "── SIGNS (12) ───────…", a section's title line. */
    public static String sectionTitle(String title, int count) {
        String text = "── %s (%d) ".formatted(title, count);
        return text + "─".repeat(Math.max(3, 58 - text.length())) + "\n\n";
    }

    /**
     * The text in a box under the entry's coordinates, with an optional title in its top edge:
     * <pre>
     *       ┌─ back ───────────┐
     *       │ Добро пожаловать │
     *       └──────────────────┘
     * </pre>
     */
    public static String signBox(String text, String title) {
        List<String> lines = text.lines().toList();
        int width = title == null ? 0 : title.length() + 3;
        for (String line : lines) width = Math.max(width, line.codePointCount(0, line.length()));

        StringBuilder sb = new StringBuilder(INDENT).append('┌');
        if (title == null) sb.append("─".repeat(width + 2));
        else sb.append("─ ").append(title).append(' ').append("─".repeat(width - title.length() - 1));
        sb.append("┐\n");
        for (String line : lines) {
            sb.append(INDENT).append("│ ").append(line).append(" ".repeat(width - line.codePointCount(0, line.length()))).append(" │\n");
        }
        return sb.append(INDENT).append('└').append("─".repeat(width + 2)).append("┘\n").toString();
    }

    /** "the_nether" -> "The Nether". */
    public static String prettyName(String id) {
        StringBuilder sb = new StringBuilder();
        for (String word : id.split("_")) {
            if (word.isEmpty()) continue;
            if (!sb.isEmpty()) sb.append(' ');
            sb.append(Character.toUpperCase(word.charAt(0))).append(word.substring(1));
        }
        return sb.toString();
    }

    // CSV

    private static String csvField(String s) {
        if (s.isEmpty()) return "";
        if (s.indexOf(',') < 0 && s.indexOf('"') < 0 && s.indexOf('\n') < 0 && s.indexOf('\r') < 0) return s;
        return '"' + s.replace("\"", "\"\"") + '"';
    }

    /** Rows of a CSV text: quoted fields may hold commas, quotes ("") and line breaks. */
    static List<List<String>> parseCsv(String text) {
        List<List<String>> rows = new ArrayList<>();
        List<String> row = new ArrayList<>();
        StringBuilder field = new StringBuilder();
        boolean quoted = false;
        for (int i = 0; i < text.length(); i++) {
            char c = text.charAt(i);
            if (quoted) {
                if (c != '"') field.append(c);
                else if (i + 1 < text.length() && text.charAt(i + 1) == '"') {
                    field.append('"');
                    i++;
                } else quoted = false;
            } else if (c == '"') quoted = true;
            else if (c == ',') {
                row.add(field.toString());
                field.setLength(0);
            } else if (c == '\n') {
                row.add(field.toString());
                field.setLength(0);
                rows.add(row);
                row = new ArrayList<>();
            } else if (c != '\r') field.append(c);
        }
        if (!field.isEmpty() || !row.isEmpty()) {
            row.add(field.toString());
            rows.add(row);
        }
        return rows;
    }

    private static Find fromRow(List<String> r) {
        if (r.size() < 9) return null;
        try {
            return new Find(Kind.valueOf(r.get(0)), Integer.parseInt(r.get(1)), Integer.parseInt(r.get(2)), Integer.parseInt(r.get(3)),
                LocalDateTime.parse(r.get(4), CSV_TIME), r.get(5), Integer.parseInt(r.get(6)), r.get(7), r.get(8));
        } catch (IllegalArgumentException | DateTimeParseException e) {
            return null;
        }
    }
}
