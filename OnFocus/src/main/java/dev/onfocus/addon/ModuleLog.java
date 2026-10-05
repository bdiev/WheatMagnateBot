package dev.onfocus.addon;

import net.fabricmc.loader.api.FabricLoader;

import java.io.IOException;
import java.io.PrintWriter;
import java.io.StringWriter;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.nio.file.StandardOpenOption;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.regex.Pattern;

/**
 * A module's own log file, {@code .minecraft/onfocus/logs/<name>.log}, besides the game log.
 * Written on a background thread, so logging never stalls a tick. The file of the last game is
 * kept as {@code <name>.old.log}.
 */
public final class ModuleLog {
    private static final DateTimeFormatter TIME = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");
    /** Meteor's chat colour markers, meaningless in a text file. */
    private static final Pattern CHAT_MARKERS = Pattern.compile("\\((highlight|default)\\)");
    private static final ExecutorService WRITER = Executors.newSingleThreadExecutor(r -> {
        Thread thread = new Thread(r, "OnFocus log writer");
        thread.setDaemon(true);
        return thread;
    });

    private final String tag;
    private final Path file;
    private boolean failed;

    /** @param name the file's name, "area-explorer"; @param tag what its lines in the game log start with, "AreaExplorer" */
    public ModuleLog(String name, String tag) {
        this.tag = tag;
        Path dir = FabricLoader.getInstance().getGameDir().resolve("onfocus").resolve("logs");
        this.file = dir.resolve(name + ".log");
        WRITER.submit(() -> {
            try {
                Files.createDirectories(dir);
                if (Files.exists(file)) Files.move(file, dir.resolve(name + ".old.log"), StandardCopyOption.REPLACE_EXISTING);
            } catch (IOException e) {
                OnFocusAddon.LOG.error("[{}] Couldn't set up the log file", tag, e);
            }
        });
    }

    public static String plain(String message) {
        return CHAT_MARKERS.matcher(message).replaceAll("");
    }

    public void info(String message) {
        message = plain(message);
        OnFocusAddon.LOG.info("[{}] {}", tag, message);
        write("INFO ", message);
    }

    public void warn(String message) {
        message = plain(message);
        OnFocusAddon.LOG.warn("[{}] {}", tag, message);
        write("WARN ", message);
    }

    public void error(String message, Throwable error) {
        message = plain(message);
        OnFocusAddon.LOG.error("[{}] {}", tag, message, error);
        StringWriter trace = new StringWriter();
        if (error != null) error.printStackTrace(new PrintWriter(trace));
        write("ERROR", error == null ? message : message + "\n" + trace.toString().stripTrailing());
    }

    private void write(String level, String message) {
        String line = "[%s] %s %s%n".formatted(LocalDateTime.now().format(TIME), level, message);
        WRITER.submit(() -> {
            if (failed) return;
            try {
                Files.writeString(file, line, StandardCharsets.UTF_8, StandardOpenOption.CREATE, StandardOpenOption.APPEND);
            } catch (IOException e) {
                failed = true; // once is enough in the game log
                OnFocusAddon.LOG.error("[{}] Couldn't write the log file {}", tag, file, e);
            }
        });
    }
}
