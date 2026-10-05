package dev.onfocus.addon.explore;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonParser;
import dev.onfocus.addon.xaero.XaeroCacheFile;

import javax.imageio.ImageIO;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.IOException;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.time.Duration;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Consumer;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Sends Xaero's World Map to the WheatMagnateBot site, region by region, so its Area Explorer
 * section shows it: {@code PUT <site>/api/area-explorer/mod/map/regions/<x>/<z>} with a PNG of the
 * region, read from Xaero's texture cache ({@link XaeroCacheFile}).
 * <p>
 * The site says which regions it has and when each was drawn, so only newer ones go: the whole map
 * the first time - every dimension, what was explored before too, within 50,000 blocks of 0, 0 - then what changes as it gets
 * drawn. The most recently drawn regions go first, so the area being explored shows up within a
 * minute or two even while older ones are still on the way.
 * <p>
 * Runs on a thread of its own; {@link #update} and {@link #stop} may be called from any thread.
 */
public final class MapSync {
    private static final Duration TIMEOUT = Duration.ofSeconds(30);
    private static final Pattern REGION_FILE = Pattern.compile("^(-?\\d+)_(-?\\d+)\\.xwmc$");
    /** The site keeps the map up to this many blocks from 0, 0 each way: 100k x 100k. */
    private static final int MAX_DISTANCE = 50_000;
    /** How often the cache folders are listed again, for regions redrawn since. */
    private static final long RESCAN_MS = 60_000;
    /** Between looks at the folders once everything is sent: listing tens of thousands of files isn't free. */
    private static final long IDLE_MS = 20_000;
    private static final long RETRY_MS = 30_000;
    private static final long FULL_MS = 10 * 60_000;
    /** Progress is said in chat after this many regions of a big backlog. */
    private static final int PROGRESS_EVERY = 2_000;

    /** A dimension's cache folder, for the site's server and dimension. */
    public record Target(String server, String dimension, Path folder) {}

    private record Config(String site, String token, List<Target> targets, Consumer<String> problem, Consumer<String> info) {}

    private record Region(int x, int z, File file, long modified) {}

    private final HttpClient http = HttpClient.newBuilder().connectTimeout(TIMEOUT).build();
    private volatile Config config;
    private Thread thread;
    /** What the site has, by "server dimension": region "x,z" to when it was drawn. */
    private final Map<String, Map<String, Long>> onSite = new HashMap<>();
    private String onSiteFor;
    private String lastProblem;

    /** Starts sending, or carries on with these settings. */
    public synchronized void update(String site, String token, List<Target> targets, Consumer<String> problem, Consumer<String> info) {
        config = new Config(site.replaceAll("/+$", ""), token, List.copyOf(targets), problem, info);
        if (thread == null || !thread.isAlive()) {
            thread = new Thread(this::run, "OnFocus map upload");
            thread.setDaemon(true);
            thread.start();
        }
    }

    /** Stops after the region being sent. */
    public synchronized void stop() {
        config = null;
    }

    private void run() {
        while (true) {
            Config current = config;
            if (current == null) return;
            if (!current.site().equals(onSiteFor)) {
                // Another site: what it has is still to be asked
                onSite.clear();
                onSiteFor = current.site();
            }
            long pause = IDLE_MS;
            try {
                pause = sendDue(current);
            } catch (InterruptedException e) {
                return;
            } catch (RuntimeException e) {
                report(current, "map upload failed (" + e + "), trying again in a bit");
                pause = RETRY_MS;
            }
            try {
                Thread.sleep(pause);
            } catch (InterruptedException e) {
                return;
            }
        }
    }

    /** Sends every region drawn since the site got it, newest first; how long to wait before looking again. */
    private long sendDue(Config current) throws InterruptedException {
        List<Region> due = new ArrayList<>();
        Map<Region, Target> targetOf = new HashMap<>();
        for (Target target : current.targets()) {
            Map<String, Long> known = onSite.get(key(target));
            if (known == null) {
                known = fetchIndex(current, target);
                if (known == null) return RETRY_MS;
                onSite.put(key(target), known);
            }
            for (Region region : list(target.folder())) {
                Long sent = known.get(region.x() + "," + region.z());
                if (sent != null && sent >= region.modified()) continue;
                due.add(region);
                targetOf.put(region, target);
            }
        }
        if (due.isEmpty()) return IDLE_MS;
        due.sort(Comparator.comparingLong(Region::modified).reversed());
        boolean backlog = due.size() >= PROGRESS_EVERY;
        if (backlog) say(current, "Map: sending (highlight)%d(default) regions of Xaero's map to the site, the newest first.".formatted(due.size()));

        List<Target> targets = targetOf.values().stream().distinct().toList();
        long listed = System.currentTimeMillis();
        int sent = 0;
        for (Region region : due) {
            if (config != current) return 0; // settings changed or stopped: start over with them
            // Regions drawn since the list was made go before the rest of the backlog
            if (System.currentTimeMillis() - listed > RESCAN_MS) {
                long since = listed;
                listed = System.currentTimeMillis();
                if (sendNewlyDrawn(current, targets, since) < 0) return RETRY_MS;
            }
            Target target = targetOf.get(region);
            Long have = onSite.get(key(target)).get(region.x() + "," + region.z());
            if (have != null && have >= region.modified()) continue; // went with the newly drawn ones
            long wait = send(current, target, region);
            if (wait > 0) return wait;
            sent++;
            if (backlog && sent % PROGRESS_EVERY == 0) say(current, "Map: %d of %d regions sent.".formatted(sent, due.size()));
        }
        if (backlog) say(current, "Map: all of Xaero's map is on the site now; new regions follow as they're drawn.");
        lastProblem = null;
        return IDLE_MS;
    }

    /** Sends regions of the targets drawn after {@code since} that the site doesn't have yet; -1 on a failure. */
    private int sendNewlyDrawn(Config current, List<Target> targets, long since) throws InterruptedException {
        int sent = 0;
        for (Target target : targets) {
            Map<String, Long> known = onSite.get(key(target));
            for (Region region : list(target.folder())) {
                if (region.modified() < since) continue;
                Long have = known.get(region.x() + "," + region.z());
                if (have != null && have >= region.modified()) continue;
                if (send(current, target, region) > 0) return -1;
                sent++;
            }
        }
        return sent;
    }

    /** Sends one region; 0 when done with it (sent, or skipped for good), else how long to wait first. */
    private long send(Config current, Target target, Region region) throws InterruptedException {
        Map<String, Long> known = onSite.get(key(target));
        byte[] png;
        try {
            int[] pixels = XaeroCacheFile.read(region.file());
            if (pixels == null) {
                known.put(region.x() + "," + region.z(), region.modified());
                return 0;
            }
            png = encodePng(pixels);
        } catch (IOException e) {
            if (e.getMessage() != null && e.getMessage().startsWith("unsupported cache format")) {
                report(current, "Xaero's map cache is in a format this version doesn't read (" + e.getMessage() + ") - update OnFocus");
                return FULL_MS;
            }
            // Most likely being written by Xaero right now: the next look tries it again
            return 0;
        }

        String url = current.site() + "/api/area-explorer/mod/map/regions/" + region.x() + "/" + region.z()
            + "?server=" + encode(target.server()) + "&dimension=" + encode(target.dimension()) + "&modified=" + region.modified();
        try {
            HttpResponse<String> response = http.send(HttpRequest.newBuilder(URI.create(url))
                .timeout(TIMEOUT)
                .header("Authorization", "Bearer " + current.token())
                .header("Content-Type", "image/png")
                .PUT(HttpRequest.BodyPublishers.ofByteArray(png))
                .build(), HttpResponse.BodyHandlers.ofString());
            int code = response.statusCode();
            if (code / 100 == 2 || code == 400 || code == 413) {
                // 400/413: the site won't take this one, so it isn't sent again and again
                known.put(region.x() + "," + region.z(), region.modified());
                return 0;
            }
            if (code == 401) {
                report(current, "the site didn't take the token for the map (wrong or revoked) - check site-token");
                return FULL_MS;
            }
            if (code == 429) return retryAfter(response);
            if (code == 507) {
                report(current, "the site's map storage is full (XAERO_MAP_MAX_BYTES) - new regions wait");
                return FULL_MS;
            }
            report(current, "the site answered " + code + " to a map region, trying again in a bit");
            return RETRY_MS;
        } catch (IllegalArgumentException e) {
            report(current, "site-url isn't a valid address: " + current.site());
            return FULL_MS;
        } catch (IOException e) {
            report(current, "can't reach the site with the map (" + e.getClass().getSimpleName() + "), trying again in a bit");
            return RETRY_MS;
        }
    }

    /** What the site has of a dimension; null if it couldn't be asked. */
    private Map<String, Long> fetchIndex(Config current, Target target) throws InterruptedException {
        String url = current.site() + "/api/area-explorer/mod/map/regions?server=" + encode(target.server()) + "&dimension=" + encode(target.dimension());
        try {
            HttpResponse<String> response = http.send(HttpRequest.newBuilder(URI.create(url))
                .timeout(TIMEOUT)
                .header("Authorization", "Bearer " + current.token())
                .GET()
                .build(), HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() == 401) {
                report(current, "the site didn't take the token for the map (wrong or revoked) - check site-token");
                return null;
            }
            if (response.statusCode() / 100 != 2) {
                report(current, "the site answered " + response.statusCode() + " when asked what map it has");
                return null;
            }
            Map<String, Long> known = new HashMap<>();
            JsonArray regions = JsonParser.parseString(response.body()).getAsJsonObject().getAsJsonArray("regions");
            for (JsonElement element : regions) {
                JsonArray region = element.getAsJsonArray();
                known.put(region.get(0).getAsInt() + "," + region.get(1).getAsInt(), region.get(2).getAsLong());
            }
            return known;
        } catch (IllegalArgumentException e) {
            report(current, "site-url isn't a valid address: " + current.site());
            return null;
        } catch (IOException | RuntimeException e) {
            report(current, "can't ask the site what map it has (" + e.getClass().getSimpleName() + "), trying again in a bit");
            return null;
        }
    }

    private static List<Region> list(Path folder) {
        List<Region> regions = new ArrayList<>();
        File[] files = folder.toFile().listFiles();
        if (files == null) return regions;
        for (File file : files) {
            // ".xwmc.outdated" ones are stale: Xaero redraws them before using them again
            Matcher match = REGION_FILE.matcher(file.getName());
            if (!match.matches()) continue;
            int x = Integer.parseInt(match.group(1)), z = Integer.parseInt(match.group(2));
            if (!inRange(x) || !inRange(z)) continue;
            regions.add(new Region(x, z, file, file.lastModified()));
        }
        return regions;
    }

    /** Whether a region, along one axis, reaches into the site's 100k x 100k square around 0, 0. */
    static boolean inRange(int region) {
        long from = (long) region * XaeroCacheFile.SIZE;
        return from < MAX_DISTANCE && from + XaeroCacheFile.SIZE > -MAX_DISTANCE;
    }

    static byte[] encodePng(int[] pixels) throws IOException {
        BufferedImage image = new BufferedImage(XaeroCacheFile.SIZE, XaeroCacheFile.SIZE, BufferedImage.TYPE_INT_ARGB);
        image.setRGB(0, 0, XaeroCacheFile.SIZE, XaeroCacheFile.SIZE, pixels, 0, XaeroCacheFile.SIZE);
        ByteArrayOutputStream out = new ByteArrayOutputStream(64 * 1024);
        if (!ImageIO.write(image, "png", out)) throw new IOException("no PNG writer");
        return out.toByteArray();
    }

    private static long retryAfter(HttpResponse<?> response) {
        long seconds = response.headers().firstValue("Retry-After").map(value -> {
            try {
                return Long.parseLong(value.trim());
            } catch (NumberFormatException e) {
                return 10L;
            }
        }).orElse(10L);
        return Math.max(1, Math.min(seconds, 300)) * 1000;
    }

    private static String key(Target target) {
        return target.server() + " " + target.dimension();
    }

    private static String encode(String value) {
        return URLEncoder.encode(value, StandardCharsets.UTF_8);
    }

    private void say(Config current, String message) {
        current.info().accept(message);
    }

    /** A new kind of problem is said once, not every half minute. */
    private void report(Config current, String message) {
        if (message.equals(lastProblem)) return;
        lastProblem = message;
        current.problem().accept(message);
    }
}
