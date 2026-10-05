package dev.onfocus.addon.explore;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.time.ZoneId;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Consumer;

/**
 * Sends Area Explorer's finds and run status to the WheatMagnateBot site
 * ({@code POST <site>/api/area-explorer/ingest}, with an API token made on the site).
 * <p>
 * Finds wait in a queue per server and dimension and go in batches; a batch the site didn't take
 * (offline, an error) is sent again next time. The site keeps no find twice, so sending one again
 * is harmless. The all-finds file is sent once per site ({@link #backfill}): how far it got is kept
 * next to the file, and only the finds added after that go next time.
 * <p>
 * Not thread-safe: Area Explorer only uses it on its file thread.
 */
public final class SiteSync {
    /** Finds per request; the site takes up to 1000. */
    private static final int BATCH = 500;
    /** Finds kept waiting at most, per server and dimension, while the site can't be reached. */
    private static final int MAX_QUEUED = 50_000;
    private static final Duration TIMEOUT = Duration.ofSeconds(20);

    public record Scope(String server, String dimension) {}

    private final HttpClient http = HttpClient.newBuilder().connectTimeout(TIMEOUT).build();
    private final Map<Scope, ArrayDeque<JsonObject>> queues = new LinkedHashMap<>();
    /** The all-finds file sent up to here (its finds' count) once the queue is empty: where to write that. */
    private final Map<Scope, Mark> marks = new HashMap<>();
    private JsonObject status;
    private Scope statusScope;
    private String lastProblem;

    private record Mark(Path file, String site, int count) {}

    public void add(Scope scope, FindsArchive.Find find) {
        ArrayDeque<JsonObject> queue = queues.computeIfAbsent(scope, s -> new ArrayDeque<>());
        if (queue.size() >= MAX_QUEUED) queue.pollFirst();
        queue.addLast(toJson(find));
    }

    public void setStatus(Scope scope, JsonObject status) {
        this.statusScope = scope;
        this.status = status;
    }

    /**
     * Queues the archive's finds the site hasn't had yet: all of them the first time, for this site,
     * then only those after the count kept in {@code <table>.site}.
     */
    public int backfill(Scope scope, FindsArchive archive, String site) {
        Path markFile = archive.csvFile().resolveSibling(archive.csvFile().getFileName() + ".site");
        int from = 0;
        try {
            if (Files.exists(markFile)) {
                List<String> lines = Files.readAllLines(markFile, StandardCharsets.UTF_8);
                if (lines.size() >= 2 && lines.get(0).equals(site)) from = Integer.parseInt(lines.get(1).trim());
            }
        } catch (IOException | NumberFormatException ignored) {
            // Sent again in full: the site skips what it has
        }
        List<FindsArchive.Find> all = archive.all();
        if (from > all.size()) from = 0; // a different file now
        for (int i = from; i < all.size(); i++) add(scope, all.get(i));
        marks.put(scope, new Mark(markFile, site, all.size()));
        return all.size() - from;
    }

    /**
     * Sends what's waiting, and the status. Stops at the first request the site doesn't take; that
     * batch stays queued. {@code problem} hears of a new kind of failure once, not every half minute.
     */
    public void flush(String site, String token, Consumer<String> problem) {
        String endpoint = site.replaceAll("/+$", "") + "/api/area-explorer/ingest";
        boolean statusSent = status == null;
        for (Map.Entry<Scope, ArrayDeque<JsonObject>> entry : new ArrayList<>(queues.entrySet())) {
            Scope scope = entry.getKey();
            ArrayDeque<JsonObject> queue = entry.getValue();
            while (!queue.isEmpty()) {
                JsonArray batch = new JsonArray();
                List<JsonObject> taken = new ArrayList<>();
                while (!queue.isEmpty() && taken.size() < BATCH) taken.add(queue.pollFirst());
                taken.forEach(batch::add);
                boolean withStatus = !statusSent && scope.equals(statusScope);
                Result result = post(endpoint, token, body(scope, batch, withStatus ? status : null));
                if (result.retry()) {
                    // Back in front, in order, for next time
                    for (int i = taken.size() - 1; i >= 0; i--) queue.addFirst(taken.get(i));
                    report(problem, result.message());
                    return;
                }
                if (result.kind() == Result.Kind.REJECTED) report(problem, "the site refused a batch of finds (bad data?) - skipped it");
                if (withStatus) statusSent = true;
            }
            writeMark(scope);
        }
        if (!statusSent) {
            Result result = post(endpoint, token, body(statusScope, new JsonArray(), status));
            if (result.retry()) {
                report(problem, result.message());
                return;
            }
        }
        status = null;
        lastProblem = null;
    }

    public int queued() {
        int n = 0;
        for (ArrayDeque<JsonObject> queue : queues.values()) n += queue.size();
        return n;
    }

    private void report(Consumer<String> problem, String message) {
        if (message.equals(lastProblem)) return;
        lastProblem = message;
        problem.accept(message);
    }

    private void writeMark(Scope scope) {
        Mark mark = marks.remove(scope);
        if (mark == null) return;
        try {
            Files.writeString(mark.file(), mark.site() + "\n" + mark.count() + "\n", StandardCharsets.UTF_8);
        } catch (IOException ignored) {
            // The finds go again next time; the site skips them
        }
    }

    /** How a request went: taken, refused for good (bad data: dropped), or to try again, and why. */
    private record Result(Kind kind, String message) {
        enum Kind { OK, REJECTED, RETRY }

        static final Result OK = new Result(Kind.OK, "");
        static final Result REJECTED = new Result(Kind.REJECTED, "");

        static Result retry(String message) {
            return new Result(Kind.RETRY, message);
        }

        boolean retry() {
            return kind == Kind.RETRY;
        }
    }

    private Result post(String endpoint, String token, JsonObject body) {
        try {
            HttpRequest request = HttpRequest.newBuilder(URI.create(endpoint))
                .timeout(TIMEOUT)
                .header("Authorization", "Bearer " + token)
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(body.toString(), StandardCharsets.UTF_8))
                .build();
            HttpResponse<String> response = http.send(request, HttpResponse.BodyHandlers.ofString());
            int code = response.statusCode();
            if (code / 100 == 2) return Result.OK;
            if (code == 401) return Result.retry("the site didn't take the token (wrong or revoked) - check site-token");
            if (code == 400 || code == 413) return Result.REJECTED;
            return Result.retry("the site answered " + code + ", trying again in a bit");
        } catch (IllegalArgumentException e) {
            return Result.retry("site-url isn't a valid address: " + endpoint);
        } catch (IOException e) {
            return Result.retry("can't reach the site (" + e.getClass().getSimpleName() + "), trying again in a bit");
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            return Result.retry("interrupted");
        }
    }

    private static JsonObject body(Scope scope, JsonArray finds, JsonObject status) {
        JsonObject body = new JsonObject();
        body.addProperty("server", scope.server());
        body.addProperty("dimension", scope.dimension());
        body.add("finds", finds);
        if (status != null) body.add("status", status);
        return body;
    }

    private static JsonObject toJson(FindsArchive.Find find) {
        JsonObject json = new JsonObject();
        json.addProperty("kind", find.kind().name());
        json.addProperty("x", find.x());
        json.addProperty("y", find.y());
        json.addProperty("z", find.z());
        json.addProperty("foundAt", find.found().atZone(ZoneId.systemDefault()).toInstant().toEpochMilli());
        json.addProperty("name", find.name());
        json.addProperty("count", find.count());
        json.addProperty("label", find.label());
        json.addProperty("details", find.details());
        return json;
    }
}
