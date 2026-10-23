package dev.onfocus.addon.explore;

import dev.onfocus.addon.xaero.XaeroMapFolders.MapWorld;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * What sharing between PCs keeps on disk, a folder per server under {@code .minecraft/onfocus/shared}:
 * where Xaero keeps the server's map ({@code map.txt}), and what was taken from the other PC.
 */
final class ShareFiles {
    /** The dimensions whose maps and markers are shared. */
    static final List<String> DIMENSIONS = List.of("overworld", "the_nether", "the_end");

    private ShareFiles() {}

    static Path serverFolder(Path root, String server) {
        return root.resolve(server.replaceAll("[^A-Za-z0-9._-]", "_"));
    }

    /** Where this PC keeps the map of the server: for the main menu, where Xaero doesn't say. */
    static void rememberMap(Path root, String server, MapWorld map) {
        Path folder = serverFolder(root, server);
        String text = server + "\n" + map.folder() + "\n" + map.mw() + "\n";
        Path file = folder.resolve("map.txt");
        try {
            if (Files.exists(file) && Files.readString(file, StandardCharsets.UTF_8).equals(text)) return;
            Files.createDirectories(folder);
            Files.writeString(file, text, StandardCharsets.UTF_8);
        } catch (IOException e) {
            // The next look
        }
    }

    static MapWorld readMap(Path root, String server) {
        List<String> lines = readLines(serverFolder(root, server).resolve("map.txt"));
        return lines.size() >= 3 ? new MapWorld(Path.of(lines.get(1)), lines.get(2)) : null;
    }

    static List<String> readLines(Path file) {
        try {
            return Files.exists(file) ? Files.readAllLines(file, StandardCharsets.UTF_8) : List.of();
        } catch (IOException e) {
            return List.of();
        }
    }

    /** "key<TAB>number" lines. */
    static Map<String, Long> readNumbers(Path file) {
        Map<String, Long> numbers = new LinkedHashMap<>();
        for (String line : readLines(file)) {
            int tab = line.lastIndexOf('\t');
            if (tab <= 0) continue;
            try {
                numbers.put(line.substring(0, tab), Long.parseLong(line.substring(tab + 1).trim()));
            } catch (NumberFormatException ignored) {
            }
        }
        return numbers;
    }

    static void writeNumbers(Path file, Map<String, Long> numbers) {
        StringBuilder text = new StringBuilder();
        numbers.forEach((key, value) -> text.append(key).append('\t').append(value).append('\n'));
        // Not written: taken again next time - the merge and the marker check skip what's in already
        writeText(file, text.toString());
    }

    /** The file's text, in whole or not at all; false if it couldn't be written. */
    static boolean writeText(Path file, String text) {
        try {
            Files.createDirectories(file.getParent());
            Path temp = file.resolveSibling(file.getFileName() + ".tmp");
            Files.writeString(temp, text, StandardCharsets.UTF_8);
            Files.move(temp, file, StandardCopyOption.REPLACE_EXISTING);
            return true;
        } catch (IOException e) {
            return false;
        }
    }
}
