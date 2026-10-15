package dev.onfocus.addon.explore;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

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
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Consumer;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicReference;

/**
 * Sends Area Explorer's finds and run status to the WheatMagnateBot site
 * ({@code POST <site>/api/area-explorer/ingest}, with an API token made on the site).
 * <p>
 * Finds go straight from the all-finds file ({@link #track}), in batches, in the order they came in:
 * per server and dimension only how far the site has taken them is kept, so none is ever dropped
 * however long the site is out of reach. A batch the site didn't take (offline, an error) is sent
 * again next time; the site keeps no find twice, so sending one again is harmless. How far it got is
 * kept next to the file, and only the finds after that go next time.
 * <p>
 * Run log events ({@link #addEvent}) - started, kicked and why, reconnected... - wait in a queue of
 * their own and go as soon as they're added, ahead of the finds; the site keeps none twice (each has an id).
 * <p>
 * Find and event queues are confined to the file thread; live status has an independent, coalesced async sender.
 */
public final class SiteSync {
    /** Finds per request; the site takes up to 1000. */
    private static final int BATCH = 500;
    /** Events per request; the site takes up to 200. */
    private static final int EVENT_BATCH = 100;
    /** Events kept waiting at most while the site can't be reached: the oldest go first. */
    private static final int MAX_EVENTS = 2_000;
    /** The mark file's format: before it, a full queue dropped finds and still moved the mark past them. */
    private static final String MARK_VERSION = "v2";
    private static final Duration TIMEOUT = Duration.ofSeconds(20);

    public record Scope(String server, String dimension) {}

    private final HttpClient http = HttpClient.newBuilder().connectTimeout(TIMEOUT).build();
    /** Per server and dimension: the all-finds file and how far the site has taken it. */
    private final Map<Scope, Cursor> cursors = new LinkedHashMap<>();
    private record Event(Scope scope, JsonObject json) {}
    private final ArrayDeque<Event> events = new ArrayDeque<>();
    private JsonObject status;
    private Scope statusScope;
    private String lastProblem;
    private final AtomicBoolean liveInFlight = new AtomicBoolean();
    private volatile String lastLiveProblem;
    private record LiveUpload(String site, String token, Scope scope, JsonObject status, JsonArray commandUpdates,
                              Consumer<String> problem, Consumer<JsonArray> commands, Consumer<JsonArray> acks) {}
    /** Tells the site this mod confirms the commands it gets, by id: it sends each until confirmed, never runs one twice. */
    private static final int COMMAND_PROTOCOL = 2;
    private final AtomicReference<LiveUpload> latestLive = new AtomicReference<>();

    /**
     * Independent of archive uploads: at most one live request, never a queue of old positions.
     * {@code commandUpdates}: what became of the site's commands, not confirmed yet ({@link SiteCommands#pending});
     * {@code acks} gets the ids of those the site took. {@code commands} gets what the site's map sent
     * this mod (explore / rescan an area). Both on the HTTP thread, when the answer has any.
     */
    public void sendLiveStatus(String site, String token, Scope scope, JsonObject live, JsonArray commandUpdates,
                               Consumer<String> problem, Consumer<JsonArray> commands, Consumer<JsonArray> acks) {
        latestLive.set(new LiveUpload(site, token, scope, live, commandUpdates, problem, commands, acks));
        flushLiveStatus();
    }

    private void flushLiveStatus() {
        if (latestLive.get() == null || !liveInFlight.compareAndSet(false, true)) return;
        LiveUpload next = latestLive.getAndSet(null);
        if (next == null) { liveInFlight.set(false); return; }
        String site = next.site(), token = next.token();
        Scope scope = next.scope();
        JsonObject live = next.status();
        Consumer<String> problem = next.problem();
        try {
            HttpRequest request = HttpRequest.newBuilder(URI.create(site.replaceAll("/+$", "") + "/api/area-explorer/ingest"))
                .timeout(Duration.ofSeconds(5))
                .header("Authorization", "Bearer " + token)
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(liveBody(scope, live, next.commandUpdates()).toString(), StandardCharsets.UTF_8))
                .build();
            http.sendAsync(request, HttpResponse.BodyHandlers.ofString()).whenComplete((response, error) -> {
                try {
                    String message = error != null ? "live position upload failed, retrying"
                        : response.statusCode() / 100 == 2 ? null : "live position upload returned " + response.statusCode();
                    if (message != null && !message.equals(lastLiveProblem)) problem.accept(message);
                    lastLiveProblem = message;
                    if (message == null) readAnswer(response.body(), next.commands(), next.acks());
                } finally {
                    liveInFlight.set(false);
                    flushLiveStatus();
                }
            });
        } catch (IllegalArgumentException e) {
            liveInFlight.set(false);
            String message = "site-url isn't a valid address";
            if (!message.equals(lastLiveProblem)) problem.accept(message);
            lastLiveProblem = message;
            flushLiveStatus();
        }
    }

    private static JsonObject liveBody(Scope scope, JsonObject live, JsonArray commandUpdates) {
        JsonObject body = body(scope, new JsonArray(), live);
        body.addProperty("commandProtocol", COMMAND_PROTOCOL);
        if (commandUpdates != null && !commandUpdates.isEmpty()) body.add("commandUpdates", commandUpdates);
        return body;
    }

    /** The commands, and the command reports the site took, in a status upload's answer, if any. */
    private static void readAnswer(String body, Consumer<JsonArray> commands, Consumer<JsonArray> acks) {
        if (body == null || !body.contains("\"command")) return;
        try {
            JsonObject answer = JsonParser.parseString(body).getAsJsonObject();
            if (acks != null && answer.has("commandAcks") && answer.get("commandAcks").isJsonArray()) acks.accept(answer.getAsJsonArray("commandAcks"));
            if (commands != null && answer.has("commands") && answer.get("commands").isJsonArray()) commands.accept(answer.getAsJsonArray("commands"));
        } catch (RuntimeException ignored) {
            // Not an answer to read: nothing sent
        }
    }

    /** An all-finds file going to a site: the finds before {@code sent} the site has; {@code marked} is what the mark file says. */
    private static final class Cursor {
        final FindsArchive archive;
        final Path markFile;
        final String site;
        int sent, marked;

        Cursor(FindsArchive archive, Path markFile, String site, int sent) {
            this.archive = archive;
            this.markFile = markFile;
            this.site = site;
            this.sent = this.marked = sent;
        }

        int waiting() {
            return Math.max(0, archive.size() - sent);
        }
    }

    /** A line for the site's run log; see {@link #event} for what it holds. */
    public void addEvent(Scope scope, JsonObject event) {
        if (events.size() >= MAX_EVENTS) events.pollFirst();
        events.addLast(new Event(scope, event));
    }

    /** A run log event: when, how bad (info, success, warn, error), what kind, what happened, who and where (x, y, z may be null). */
    public static JsonObject event(long at, String level, String type, String message, String player, Integer x, Integer y, Integer z) {
        JsonObject json = new JsonObject();
        json.addProperty("id", java.util.UUID.randomUUID().toString());
        json.addProperty("at", at);
        json.addProperty("level", level);
        json.addProperty("type", type);
        json.addProperty("message", message);
        json.addProperty("player", player);
        if (x != null && z != null) {
            json.addProperty("x", x);
            if (y != null) json.addProperty("y", y);
            json.addProperty("z", z);
        }
        return json;
    }

    /** Sends the waiting events, in order; false if the site didn't take them (they stay queued). */
    public boolean flushEvents(String site, String token, Consumer<String> problem) {
        String endpoint = site.replaceAll("/+$", "") + "/api/area-explorer/ingest";
        while (!events.isEmpty()) {
            // A batch is one server and dimension: the events in a row that share them
            Scope scope = events.peekFirst().scope();
            List<Event> taken = new ArrayList<>();
            while (!events.isEmpty() && taken.size() < EVENT_BATCH && events.peekFirst().scope().equals(scope)) taken.add(events.pollFirst());
            JsonArray batch = new JsonArray();
            for (Event event : taken) batch.add(event.json());
            JsonObject body = body(scope, new JsonArray(), null);
            body.add("events", batch);
            Result result = post(endpoint, token, body);
            if (result.retry()) {
                for (int i = taken.size() - 1; i >= 0; i--) events.addFirst(taken.get(i));
                report(problem, result.message());
                return false;
            }
            if (result.kind() == Result.Kind.REJECTED) report(problem, "the site refused some run log events (bad data?) - skipped them");
        }
        return true;
    }

    public void setStatus(Scope scope, JsonObject status) {
        this.statusScope = scope;
        this.status = status;
    }

    /**
     * Sends the archive's finds to the site from now on, as they come in: all of them the first time,
     * for this site, then only those after the count kept in {@code <table>.site}. How many are waiting.
     */
    public int track(Scope scope, FindsArchive archive, String site) {
        Path markFile = archive.csvFile().resolveSibling(archive.csvFile().getFileName() + ".site");
        int from = 0;
        try {
            if (Files.exists(markFile)) {
                List<String> lines = Files.readAllLines(markFile, StandardCharsets.UTF_8);
                // An older mark may have skipped finds a full queue dropped: those go again, all of them
                if (lines.size() >= 3 && lines.get(0).equals(site) && lines.get(2).trim().equals(MARK_VERSION)) {
                    from = Integer.parseInt(lines.get(1).trim());
                }
            }
        } catch (IOException | NumberFormatException ignored) {
            // Sent again in full: the site skips what it has
        }
        if (from < 0 || from > archive.size()) from = 0; // a different file now
        Cursor cursor = new Cursor(archive, markFile, site, from);
        cursors.put(scope, cursor);
        return cursor.waiting();
    }

    /**
     * Sends what's waiting, and the status. Stops at the first request the site doesn't take; that
     * batch stays queued. {@code problem} hears of a new kind of failure once, not every half minute.
     */
    public void flush(String site, String token, Consumer<String> problem) {
        if (!flushEvents(site, token, problem)) return;
        String endpoint = site.replaceAll("/+$", "") + "/api/area-explorer/ingest";
        boolean statusSent = status == null;
        for (Map.Entry<Scope, Cursor> entry : new ArrayList<>(cursors.entrySet())) {
            Scope scope = entry.getKey();
            Cursor cursor = entry.getValue();
            // Tracked for another site: it's tracked again for this one when its archive is next used
            if (!cursor.site.equals(site)) continue;
            while (cursor.waiting() > 0) {
                List<FindsArchive.Find> taken = cursor.archive.range(cursor.sent, Math.min(cursor.archive.size(), cursor.sent + BATCH));
                JsonArray batch = new JsonArray();
                for (FindsArchive.Find find : taken) batch.add(toJson(find));
                boolean withStatus = !statusSent && scope.equals(statusScope);
                Result result = post(endpoint, token, body(scope, batch, withStatus ? status : null));
                if (result.retry()) {
                    // Still waiting in the file: from the same place next time
                    writeMark(cursor);
                    report(problem, result.message());
                    return;
                }
                if (result.kind() == Result.Kind.REJECTED) report(problem, "the site refused a batch of finds (bad data?) - skipped it");
                cursor.sent += taken.size();
                if (withStatus) statusSent = true;
            }
            writeMark(cursor);
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

    /** Whether anything is still to go to this site: run log events, the status, or finds of its files. */
    public boolean pending(String site) {
        if (!events.isEmpty() || status != null) return true;
        for (Cursor cursor : cursors.values()) {
            if (cursor.site.equals(site) && cursor.waiting() > 0) return true;
        }
        return false;
    }

    public int queued() {
        int n = 0;
        for (Cursor cursor : cursors.values()) n += cursor.waiting();
        return n;
    }

    private void report(Consumer<String> problem, String message) {
        if (message.equals(lastProblem)) return;
        lastProblem = message;
        problem.accept(message);
    }

    /**
     * Keeps how far the site has taken the file, but never past what the file holds on disk: finds not
     * written yet are lost with a crash, and the ones read in instead next time would be skipped.
     */
    private static void writeMark(Cursor cursor) {
        int mark = Math.min(cursor.sent, cursor.archive.savedSize());
        if (mark == cursor.marked) return;
        try {
            Files.writeString(cursor.markFile, cursor.site + "\n" + mark + "\n" + MARK_VERSION + "\n", StandardCharsets.UTF_8);
            cursor.marked = mark;
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
