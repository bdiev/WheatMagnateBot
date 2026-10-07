package dev.onfocus.addon.explore;

import com.google.gson.JsonObject;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.nio.file.StandardOpenOption;
import java.time.Instant;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicLong;
import java.util.function.Consumer;

/** Bounded, asynchronous JSONL trace. Diagnostics never write to disk on the game thread. */
public final class ExplorerDiagnostics implements AutoCloseable {
    private final Path file;
    private final long maxBytes;
    private final Consumer<String> failure;
    private final AtomicLong dropped = new AtomicLong();
    private final ThreadPoolExecutor writer;
    private boolean failed;

    public ExplorerDiagnostics(Path file, Consumer<String> failure) {
        this(file, 8 * 1024 * 1024, failure);
    }

    ExplorerDiagnostics(Path file, long maxBytes, Consumer<String> failure) {
        this.file = file;
        this.maxBytes = maxBytes;
        this.failure = failure;
        writer = new ThreadPoolExecutor(1, 1, 0, TimeUnit.MILLISECONDS, new ArrayBlockingQueue<>(256), r -> {
            Thread thread = new Thread(r, "Area Explorer diagnostics");
            thread.setDaemon(true);
            return thread;
        }, (task, executor) -> dropped.incrementAndGet());
    }

    public void log(JsonObject event) {
        event.addProperty("time", Instant.now().toString());
        byte[] bytes = (event + "\n").getBytes(StandardCharsets.UTF_8);
        if (bytes.length > Math.min(maxBytes, 64 * 1024)) {
            dropped.incrementAndGet();
            return;
        }
        writer.execute(() -> {
            if (failed) return;
            try {
                Files.createDirectories(file.getParent());
                long lost = dropped.getAndSet(0);
                if (lost > 0) {
                    JsonObject notice = new JsonObject();
                    notice.addProperty("event", "diagnostics-dropped");
                    notice.addProperty("count", lost);
                    notice.addProperty("time", Instant.now().toString());
                    append((notice + "\n").getBytes(StandardCharsets.UTF_8));
                }
                append(bytes);
            } catch (IOException e) {
                failed = true;
                failure.accept("Area Explorer diagnostics could not write " + file + ": " + e.getMessage());
            }
        });
    }

    private void append(byte[] bytes) throws IOException {
        if (Files.exists(file) && Files.size(file) + bytes.length > maxBytes) {
            for (int i = 3; i >= 1; i--) {
                Path source = i == 1 ? file : backup(i - 1);
                if (Files.exists(source)) Files.move(source, backup(i), StandardCopyOption.REPLACE_EXISTING);
            }
        }
        Files.write(file, bytes, StandardOpenOption.CREATE, StandardOpenOption.APPEND);
    }

    private Path backup(int index) {
        return file.resolveSibling(file.getFileName() + "." + index);
    }

    /** For tests and orderly shutdown; the live module keeps its writer between runs. */
    @Override
    public void close() throws InterruptedException {
        writer.shutdown();
        if (!writer.awaitTermination(5, TimeUnit.SECONDS)) writer.shutdownNow();
    }
}
