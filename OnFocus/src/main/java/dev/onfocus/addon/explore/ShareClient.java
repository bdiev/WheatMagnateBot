package dev.onfocus.addon.explore;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import dev.onfocus.addon.xaero.XaeroMapFolders.MapWorld;
import dev.onfocus.addon.xaero.XaeroRegionMerge;

import java.io.File;
import java.io.IOException;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.time.Duration;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.Executor;
import java.util.concurrent.TimeUnit;
import java.util.function.Consumer;
import java.util.function.Function;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * The player's own PC's side of sharing: takes the markers and Xaero's map straight from the PC
 * that explores ({@link ShareServer}).
 * <p>
 * The markers go to the game thread, which puts them in this PC's groups. The region files are
 * downloaded to {@code .minecraft/onfocus/shared/<server>/inbox} and merged into this PC's map
 * chunk by chunk ({@link XaeroRegionMerge}) - only while the game isn't on that server, as Xaero
 * keeps what it has drawn in memory and would write over them; so the new ground shows from the
 * next time the server is joined. What's taken is remembered: nothing comes twice, and a marker
 * deleted here stays deleted.
 * <p>
 * Runs on a thread of its own; {@link #update} and {@link #stop} may be called from any thread.
 */
public final class ShareClient {
    private static final Pattern INBOX_FILE = Pattern.compile("^(-?\\d+)_(-?\\d+)\\.zip$");
    private static final long IDLE_MS = 30_000;
    private static final long RETRY_MS = 60_000;
    /** The other PC's map list is asked for this often: it's every region it has. */
    private static final long REGIONS_REFRESH_MS = 2 * 60_000;
    /** After leaving a server, Xaero gets this long to finish saving its map before files are merged into it. */
    private static final long AFTER_LEAVING_MS = 15_000;
    private static final Duration TIMEOUT = Duration.ofSeconds(60);
    /**
     * Off the server, downloading stops after this many regions to let what's downloaded go into the
     * map: time off it is short, and a whole map's worth would take all of it.
     */
    private static final int DOWNLOAD_BATCH = 300;
    /** More is waiting to be downloaded: the next round comes right after. */
    private static final long MORE_MS = 1_000;
    /** Merging this many regions or more is said in chat as it goes. */
    private static final int PROGRESS_EVERY = 2000;

    /** A marker the other PC has: the group it's in there, its name and initials. */
    public record Shared(String group, String name, String initials, int x, int y, int z) {
        String key(String dimension) {
            return dimension + " " + name + " " + x + " " + y + " " + z;
        }
    }

    /**
     * Where things stand, from the game thread: the other PC ({@code host:port}) and the secret; the
     * server the game is on (null off one), where Xaero keeps its map, and the dimensions it keeps
     * waypoints for; {@code addMarkers} puts markers of a dimension in Xaero, run on
     * {@code onGameThread} - false if it couldn't. {@code info} is said to the player, {@code log}
     * only written down: what comes every few minutes.
     */
    public record Config(String address, String secret, String server, MapWorld map, Set<String> markerDimensions,
                         Function<String, Function<List<Shared>, Boolean>> addMarkers, Executor onGameThread,
                         Consumer<String> problem, Consumer<String> info, Consumer<String> log) {}

    private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(15)).build();
    private final Path root;
    private volatile Config config;
    private Thread thread;
    /** When each server's map list was last asked for. */
    private final Map<String, Long> regionsAskedAt = new HashMap<>();
    private String lastServer;
    /** The server the player was told, this time on it, that the map taken shows from the next join. */
    private volatile String toldOn;
    private long leftAt;
    private String lastProblem;

    public ShareClient(Path root) {
        this.root = root;
    }

    /** Starts, or carries on with this config: a new server or address is taken up right away. */
    public synchronized void update(Config next) {
        Config previous = config;
        String was = previous != null ? previous.server() : lastServer;
        if (was != null && !was.equals(next.server())) {
            leftAt = System.currentTimeMillis();
            toldOn = null;
        }
        if (next.server() != null) lastServer = next.server();
        config = next;
        if (thread == null || !thread.isAlive()) {
            thread = new Thread(this::run, "OnFocus sharing");
            thread.setDaemon(true);
            thread.start();
        } else if (previous == null || changed(previous, next)) {
            notifyAll();
        }
    }

    public synchronized void stop() {
        config = null;
        notifyAll();
    }

    /** Whether what's taken from where differs: not just the markers' dimensions or the map. */
    private static boolean changed(Config a, Config b) {
        return !a.address().equals(b.address()) || !a.secret().equals(b.secret()) || !Objects.equals(a.server(), b.server());
    }

    /** The round under way is to stop: sharing stopped, or set up differently. */
    private boolean stale(Config current) {
        Config now = config;
        return now == null || changed(current, now);
    }

    private void run() {
        while (true) {
            Config current;
            synchronized (this) {
                current = config;
                if (current == null) {
                    thread = null;
                    return;
                }
            }
            long pause;
            try {
                pause = round(current);
            } catch (InterruptedException e) {
                return;
            } catch (RuntimeException e) {
                report(current, "taking from the other PC failed (" + e + "), trying again in a bit");
                pause = RETRY_MS;
            }
            synchronized (this) {
                if (stale(current)) continue; // new settings: at them right away
                try {
                    wait(pause);
                } catch (InterruptedException e) {
                    return;
                }
            }
        }
    }

    /**
     * One go at everything; how long to wait before the next. What's downloaded already goes into
     * Xaero's map first: off the server is the only time it can, and a long download mustn't use it up.
     */
    private long round(Config current) throws InterruptedException {
        long pause = IDLE_MS;
        boolean soon = false, more = false;
        List<String> servers = new ArrayList<>();
        File[] folders = root.toFile().listFiles(File::isDirectory);
        if (folders != null) {
            for (File folder : folders) {
                List<String> lines = ShareFiles.readLines(folder.toPath().resolve("map.txt"));
                if (lines.size() >= 3) servers.add(lines.get(0));
            }
        }
        for (String server : servers) {
            if (stale(current)) return 0;
            if (mayMerge(current, server)) applyRegions(current, server);
            else if (!server.equals(current.server())) soon = true; // just left: in a moment
        }
        if (current.server() != null) {
            if (current.map() != null) ShareFiles.rememberMap(root, current.server(), current.map());
            pause = Math.max(pause, takeMarkers(current));
        }
        for (String server : servers) {
            if (stale(current)) return 0;
            if (System.currentTimeMillis() - regionsAskedAt.getOrDefault(server, 0L) < REGIONS_REFRESH_MS) continue;
            long wait = downloadRegions(current, server);
            if (wait == IDLE_MS) regionsAskedAt.put(server, System.currentTimeMillis());
            if (wait == MORE_MS) soon = more = true;
            else pause = Math.max(pause, wait);
            if (mayMerge(current, server)) applyRegions(current, server);
        }
        if (pause == IDLE_MS) lastProblem = null;
        return soon ? Math.min(pause, more ? MORE_MS : AFTER_LEAVING_MS) : pause;
    }

    /** The game isn't on the server, nor just left it (Xaero may still be saving its map): its map can be merged into. */
    private boolean mayMerge(Config current, String server) {
        if (server.equals(current.server())) return false;
        return !server.equals(lastServer) || System.currentTimeMillis() - leftAt >= AFTER_LEAVING_MS;
    }

    // ---- Markers ----

    /** The other PC's markers of each dimension this PC has waypoints in, but those taken before. */
    private long takeMarkers(Config current) throws InterruptedException {
        HttpResponse<String> response = get(current, "/markers", current.server());
        if (response == null) return RETRY_MS;
        if (response.statusCode() != 200) return failed(current, response.statusCode());
        JsonObject answer = JsonParser.parseString(response.body()).getAsJsonObject();
        Path file = ShareFiles.serverFolder(root, current.server()).resolve("markers-taken.tsv");
        Map<String, Long> taken = ShareFiles.readNumbers(file);
        Map<String, List<Shared>> byDimension = new LinkedHashMap<>();
        for (JsonElement element : answer.getAsJsonArray("markers")) {
            JsonArray m = element.getAsJsonArray();
            String dimension = m.get(0).getAsString();
            if (!current.markerDimensions().contains(dimension)) continue; // never there on this PC: Xaero has nowhere to put it yet
            Shared marker = new Shared(m.get(1).getAsString(), m.get(2).getAsString(), m.get(3).getAsString(),
                m.get(4).getAsInt(), m.get(5).getAsInt(), m.get(6).getAsInt());
            if (!taken.containsKey(marker.key(dimension))) byDimension.computeIfAbsent(dimension, d -> new ArrayList<>()).add(marker);
        }
        for (var entry : byDimension.entrySet()) {
            if (stale(current)) return 0;
            Function<List<Shared>, Boolean> add = current.addMarkers().apply(entry.getKey());
            List<Shared> markers = entry.getValue();
            boolean done;
            try {
                done = CompletableFuture.supplyAsync(() -> add.apply(markers), current.onGameThread()).get(30, TimeUnit.SECONDS);
            } catch (InterruptedException e) {
                throw e;
            } catch (Exception e) {
                done = false;
            }
            if (!done) return RETRY_MS; // left the server meanwhile, say: next time
            long now = System.currentTimeMillis();
            for (Shared marker : markers) taken.put(marker.key(entry.getKey()), now);
            ShareFiles.writeNumbers(file, taken);
        }
        return IDLE_MS;
    }

    // ---- Map regions ----

    /** The other PC's regions of the server newer than taken before, into the inbox. */
    private long downloadRegions(Config current, String server) throws InterruptedException {
        HttpResponse<String> response = get(current, "/regions", server);
        if (response == null) return RETRY_MS;
        if (response.statusCode() != 200) return failed(current, response.statusCode());
        Path folder = ShareFiles.serverFolder(root, server);
        Path takenFile = folder.resolve("regions-taken.tsv");
        Map<String, Long> taken = ShareFiles.readNumbers(takenFile);
        List<JsonArray> due = new ArrayList<>();
        for (JsonElement element : JsonParser.parseString(response.body()).getAsJsonObject().getAsJsonArray("regions")) {
            JsonArray r = element.getAsJsonArray();
            if (!ShareFiles.DIMENSIONS.contains(r.get(0).getAsString())) continue;
            if (r.get(3).getAsLong() > taken.getOrDefault(regionKey(r), 0L)) due.add(r);
        }
        due.sort(Comparator.comparingLong((JsonArray r) -> r.get(3).getAsLong()).reversed());
        int got = 0;
        for (JsonArray r : due) {
            if (stale(current)) break;
            if (got >= DOWNLOAD_BATCH && !server.equals(current.server())) break; // the map first
            String dimension = r.get(0).getAsString();
            int x = r.get(1).getAsInt(), z = r.get(2).getAsInt();
            HttpResponse<byte[]> file;
            try {
                file = http.send(request(current, "/regions/" + dimension + "/" + x + "/" + z, server), HttpResponse.BodyHandlers.ofByteArray());
            } catch (IOException | IllegalArgumentException e) {
                report(current, "can't reach the other PC at " + current.address() + " (" + e.getClass().getSimpleName() + "), trying again in a bit");
                break;
            }
            if (file.statusCode() == 404) continue; // gone meanwhile
            if (file.statusCode() != 200) return failed(current, file.statusCode());
            try {
                Path inbox = folder.resolve("inbox").resolve(dimension);
                Files.createDirectories(inbox);
                Path temp = inbox.resolve(x + "_" + z + ".part");
                Files.write(temp, file.body());
                Files.move(temp, inbox.resolve(x + "_" + z + ".zip"), StandardCopyOption.REPLACE_EXISTING);
                taken.put(regionKey(r), r.get(3).getAsLong());
                if (++got % 50 == 0) ShareFiles.writeNumbers(takenFile, taken);
            } catch (IOException e) {
                report(current, "couldn't keep a region from the other PC (" + e.getMessage() + ")");
                break;
            }
        }
        if (got > 0) {
            ShareFiles.writeNumbers(takenFile, taken);
            Config now = config;
            boolean onIt = now != null && server.equals(now.server());
            String took = "Took (highlight)%d(default) regions of the map of %s from the other PC".formatted(got, server);
            // Said once a join: they come every few minutes. Off the server, merging them says it
            if (onIt && !server.equals(toldOn)) {
                toldOn = server;
                say(current, took + "; more come as the other PC explores. They go into Xaero's map once you're off the server (the main menu will do), and show from the next join.");
            } else {
                current.log().accept(took.replace("(highlight)", "").replace("(default)", "") + ".");
            }
        }
        if (got < due.size()) return stale(current) ? RETRY_MS : MORE_MS;
        return IDLE_MS;
    }

    private static String regionKey(JsonArray r) {
        return r.get(0).getAsString() + " " + r.get(1).getAsInt() + " " + r.get(2).getAsInt();
    }

    /** Merges the downloaded regions into Xaero's map of the server, and drops the textures Xaero has of them so it draws them again. */
    private void applyRegions(Config current, String server) {
        MapWorld map = ShareFiles.readMap(root, server);
        if (map == null) return;
        Path folder = ShareFiles.serverFolder(root, server);
        Map<String, File[]> inbox = new LinkedHashMap<>();
        int waiting = 0;
        for (String dimension : ShareFiles.DIMENSIONS) {
            File[] files = folder.resolve("inbox").resolve(dimension).toFile().listFiles();
            if (files == null || files.length == 0) continue;
            // Ground this PC has no map of at all first: it's what shows
            String[] have = map.regionFolder(dimension).toFile().list();
            Set<String> mapped = have == null ? Set.of() : Set.of(have);
            Arrays.sort(files, Comparator.comparing((File file) -> mapped.contains(file.getName())));
            inbox.put(dimension, files);
            waiting += files.length;
        }
        if (waiting == 0) return;
        boolean backlog = waiting >= PROGRESS_EVERY;
        if (backlog) say(current, "Merging (highlight)%d(default) regions from the other PC into Xaero's map of %s - stay off the server till it's done.".formatted(waiting, server));
        int regions = 0, chunks = 0, skipped = 0, done = 0;
        for (var entry : inbox.entrySet()) {
            String dimension = entry.getKey();
            File[] caches = map.regionFolder(dimension).toFile().listFiles(file -> file.isDirectory() && file.getName().startsWith("cache_"));
            for (File file : entry.getValue()) {
                // Joined a server meanwhile - this one, maybe: Xaero has its map now. The rest goes next time
                if (stale(current)) {
                    if (regions > 0) say(current, "Merged %d chunks of %d regions into Xaero's map of %s so far; the other %d regions go next time you're off the server.".formatted(
                        chunks, regions, server, waiting - done));
                    return;
                }
                if (++done % PROGRESS_EVERY == 0 && backlog) say(current, "Map from the other PC: %d of %d regions looked at.".formatted(done, waiting));
                Matcher match = INBOX_FILE.matcher(file.getName());
                if (!match.matches()) continue;
                int x = Integer.parseInt(match.group(1)), z = Integer.parseInt(match.group(2));
                Path regionFolder = map.regionFolder(dimension);
                Path target = regionFolder.resolve(x + "_" + z + ".zip");
                Path temp = regionFolder.resolve(x + "_" + z + ".zip.onfocus");
                try {
                    Files.createDirectories(regionFolder);
                    int added;
                    if (!Files.exists(target)) {
                        Files.copy(file.toPath(), temp, StandardCopyOption.REPLACE_EXISTING);
                        Files.move(temp, target, StandardCopyOption.REPLACE_EXISTING);
                        added = XaeroRegionMerge.version(target.toFile()) == XaeroRegionMerge.FORMAT ? XaeroRegionMerge.chunks(target.toFile()) : 1;
                    } else if (XaeroRegionMerge.version(target.toFile()) != XaeroRegionMerge.FORMAT || XaeroRegionMerge.version(file) != XaeroRegionMerge.FORMAT) {
                        // A map format this doesn't merge (an old World Map's): this PC's own stays
                        added = 0;
                        skipped++;
                    } else {
                        Files.deleteIfExists(temp);
                        added = XaeroRegionMerge.merge(target.toFile(), file, temp.toFile()).added();
                        if (added > 0) Files.move(temp, target, StandardCopyOption.REPLACE_EXISTING);
                    }
                    if (added > 0) {
                        dropCache(caches, x, z);
                        regions++;
                        chunks += added;
                    }
                    Files.delete(file.toPath());
                } catch (IOException | RuntimeException e) {
                    report(current, "couldn't merge region " + x + ", " + z + " from the other PC into Xaero's map (" + e.getMessage() + ")");
                    try {
                        // A broken download is fetched again
                        Files.delete(file.toPath());
                        Files.deleteIfExists(temp);
                        Path takenFile = folder.resolve("regions-taken.tsv");
                        Map<String, Long> taken = ShareFiles.readNumbers(takenFile);
                        taken.remove(dimension + " " + x + " " + z);
                        ShareFiles.writeNumbers(takenFile, taken);
                    } catch (IOException ignored) {
                    }
                }
            }
        }
        if (regions > 0) {
            say(current, "Merged (highlight)%d(default) chunks in (highlight)%d(default) regions from the other PC into Xaero's map of %s%s.".formatted(
                chunks, regions, server, skipped > 0 ? " (%d regions in an older map format left as they were)".formatted(skipped) : ""));
        }
    }

    /** Xaero's textures of a region, in every cache folder: without them it draws the region again from the merged file. */
    private static void dropCache(File[] caches, int x, int z) throws IOException {
        if (caches == null) return;
        for (File cache : caches) {
            Files.deleteIfExists(cache.toPath().resolve(x + "_" + z + ".xwmc"));
            Files.deleteIfExists(cache.toPath().resolve(x + "_" + z + ".xwmc.outdated"));
        }
    }

    // ---- HTTP ----

    private HttpRequest request(Config current, String path, String server) {
        String address = current.address().replaceFirst("^https?://", "").replaceAll("/+$", "");
        return HttpRequest.newBuilder(URI.create("http://" + address + path + "?server=" + URLEncoder.encode(server, StandardCharsets.UTF_8)))
            .timeout(TIMEOUT)
            .header("Authorization", "Bearer " + current.secret())
            .GET()
            .build();
    }

    /** The answer, or null when the other PC couldn't be reached (said once). */
    private HttpResponse<String> get(Config current, String path, String server) throws InterruptedException {
        try {
            return http.send(request(current, path, server), HttpResponse.BodyHandlers.ofString());
        } catch (IllegalArgumentException e) {
            report(current, "take-from isn't a valid address: " + current.address());
            return null;
        } catch (IOException e) {
            report(current, "can't reach the other PC at " + current.address() + " (" + e.getClass().getSimpleName() + "), trying again in a bit");
            return null;
        }
    }

    private long failed(Config current, int code) {
        if (code == 401) report(current, "the other PC didn't take the share-secret - it has to be the same on both");
        else report(current, "the other PC answered " + code + ", trying again in a bit");
        return RETRY_MS;
    }

    private void say(Config current, String message) {
        current.info().accept(message);
    }

    /** A new kind of problem is said once, not every round. */
    private void report(Config current, String message) {
        if (message.equals(lastProblem)) return;
        lastProblem = message;
        current.problem().accept(message);
    }
}
