package dev.onfocus.addon.explore;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import dev.onfocus.addon.xaero.XaeroMapFolders.MapWorld;

import java.io.BufferedOutputStream;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.net.SocketException;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.function.Consumer;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * The exploring PC's side of sharing (a VDS, say): a small HTTP server in the game that gives the
 * player's own PC ({@link ShareClient}) Area Explorer's markers, each with its group, and Xaero's
 * World Map region files as they are - nothing goes through anywhere else.
 * <p>
 * {@code GET /markers?server=}, {@code GET /regions?server=} and {@code GET /regions/<dimension>/<x>/<z>?server=},
 * each with {@code Authorization: Bearer <secret>}. A region file Xaero wrote less than a minute ago
 * isn't listed: it may be written again any moment. The markers come with the ones taken out here
 * ({@link MarkerDeletions}), for the other PC to take out too; {@code POST /markers/removed?server=}
 * is the other PC's markers taken out there, to go here too.
 * <p>
 * Its own threads; {@link #update} and {@link #stop} may be called from any thread.
 */
public final class ShareServer {
    private static final Pattern REGION_FILE = Pattern.compile("^(-?\\d+)_(-?\\d+)\\.zip$");
    private static final Pattern REGION_PATH = Pattern.compile("^/regions/([a-z_]+)/(-?\\d{1,6})/(-?\\d{1,6})$");
    /** A region file Xaero wrote less than this long ago may be written again any moment: it waits. */
    private static final long SETTLE_MS = 60_000;
    private static final int MAX_HEAD_BYTES = 16 * 1024;
    /** A list of markers taken out on the other PC: a few hundred thousand at most. */
    private static final int MAX_BODY_BYTES = 8 * 1024 * 1024;
    private static final int SOCKET_TIMEOUT_MS = 60_000;

    /** One of Area Explorer's markers: the dimension as the game names it ("overworld"); its colour here as 0xRRGGBB. */
    public record Marker(String dimension, String group, String name, String initials, int x, int y, int z, int rgb) {}

    private final Path root;
    private final MarkerDeletions deletions;
    private final Map<String, List<Marker>> markers = new ConcurrentHashMap<>();
    private volatile String secret = "";
    private ServerSocket socket;
    private int port;
    private ExecutorService handlers;
    private String lastProblem;

    public ShareServer(Path root, MarkerDeletions deletions) {
        this.root = root;
        this.deletions = deletions;
    }

    /**
     * Serves on the port (started, or moved to it), with the secret; with {@code server} the game is
     * on, its markers and where Xaero keeps its map are taken as they are now.
     */
    public synchronized void update(int port, String secret, String server, List<Marker> serverMarkers, MapWorld map,
                                    Consumer<String> problem, Consumer<String> info) {
        this.secret = secret;
        if (server != null) {
            markers.put(server, List.copyOf(serverMarkers));
            if (map != null) ShareFiles.rememberMap(root, server, map);
        }
        if (socket != null && this.port == port && !socket.isClosed()) return;
        close();
        try {
            ServerSocket listening = new ServerSocket();
            listening.setReuseAddress(true);
            listening.bind(new InetSocketAddress(port));
            socket = listening;
            this.port = port;
            handlers = Executors.newFixedThreadPool(4, r -> {
                Thread thread = new Thread(r, "OnFocus sharing server");
                thread.setDaemon(true);
                return thread;
            });
            Thread accept = new Thread(() -> accept(listening), "OnFocus sharing server accept");
            accept.setDaemon(true);
            accept.start();
            lastProblem = null;
            info.accept("Sharing: your other PC can take the markers and the map from port (highlight)%d(default) here.".formatted(port));
        } catch (IOException e) {
            String message = "couldn't serve on port " + port + " (" + e.getMessage() + ") - is it taken?";
            if (!message.equals(lastProblem)) problem.accept(message);
            lastProblem = message;
        }
    }

    public synchronized void stop() {
        close();
    }

    private void close() {
        if (socket != null) {
            try {
                socket.close();
            } catch (IOException ignored) {
            }
        }
        socket = null;
        if (handlers != null) handlers.shutdownNow();
        handlers = null;
    }

    private void accept(ServerSocket listening) {
        ExecutorService pool = handlers;
        while (!listening.isClosed()) {
            try {
                Socket client = listening.accept();
                pool.execute(() -> handle(client));
            } catch (SocketException e) {
                return; // closed
            } catch (IOException | RuntimeException e) {
                // One bad connection: the next
            }
        }
    }

    private void handle(Socket client) {
        try (client) {
            client.setSoTimeout(SOCKET_TIMEOUT_MS);
            Request request = Request.read(client.getInputStream());
            OutputStream out = new BufferedOutputStream(client.getOutputStream(), 64 * 1024);
            if (request == null) {
                respond(out, 400, "text/plain", "Bad request".getBytes(StandardCharsets.UTF_8));
                return;
            }
            String expected = "Bearer " + secret;
            String given = request.headers().getOrDefault("authorization", "");
            if (secret.isEmpty() || !MessageDigest.isEqual(expected.getBytes(StandardCharsets.UTF_8), given.getBytes(StandardCharsets.UTF_8))) {
                respond(out, 401, "text/plain", "Wrong share-secret".getBytes(StandardCharsets.UTF_8));
                return;
            }
            boolean removing = request.method().equals("POST") && request.path().equals("/markers/removed");
            if (!request.method().equals("GET") && !removing) {
                respond(out, 405, "text/plain", "Use GET".getBytes(StandardCharsets.UTF_8));
                return;
            }
            String server = request.query().getOrDefault("server", "").toLowerCase(Locale.ROOT);
            if (server.isEmpty()) {
                respond(out, 400, "text/plain", "server is required".getBytes(StandardCharsets.UTF_8));
                return;
            }
            if (removing) {
                takeRemoved(client.getInputStream(), out, request, server);
                return;
            }
            if (request.path().equals("/markers")) {
                respond(out, 200, "application/json", markersOf(server).getBytes(StandardCharsets.UTF_8));
                return;
            }
            if (request.path().equals("/regions")) {
                respond(out, 200, "application/json", regionsOf(server).getBytes(StandardCharsets.UTF_8));
                return;
            }
            Matcher region = REGION_PATH.matcher(request.path());
            MapWorld map = ShareFiles.readMap(root, server);
            if (region.matches() && map != null && ShareFiles.DIMENSIONS.contains(region.group(1))) {
                Path file = map.regionFolder(region.group(1)).resolve(Integer.parseInt(region.group(2)) + "_" + Integer.parseInt(region.group(3)) + ".zip");
                byte[] bytes;
                try {
                    bytes = Files.readAllBytes(file);
                } catch (IOException e) {
                    bytes = null;
                }
                if (bytes != null) {
                    respond(out, 200, "application/zip", bytes);
                    return;
                }
            }
            respond(out, 404, "text/plain", "Not found".getBytes(StandardCharsets.UTF_8));
        } catch (IOException | RuntimeException e) {
            // Gone mid-answer: nothing to do
        }
    }

    /**
     * The other PC's markers taken out there: {"markers": [[dimension, x, y, z], ...]}. Kept, and taken
     * out here once the game is on the server; answered {"taken": how many}.
     */
    private void takeRemoved(InputStream in, OutputStream out, Request request, String server) throws IOException {
        int length;
        try {
            length = Integer.parseInt(request.headers().getOrDefault("content-length", "-1"));
        } catch (NumberFormatException e) {
            length = -1;
        }
        if (length < 0 || length > MAX_BODY_BYTES) {
            respond(out, 400, "text/plain", "A Content-Length up to 8 MB is required".getBytes(StandardCharsets.UTF_8));
            return;
        }
        byte[] body = in.readNBytes(length);
        List<MarkerDeletions.Spot> spots = new ArrayList<>();
        try {
            for (JsonElement element : JsonParser.parseString(new String(body, StandardCharsets.UTF_8)).getAsJsonObject().getAsJsonArray("markers")) {
                JsonArray m = element.getAsJsonArray();
                String dimension = m.get(0).getAsString();
                if (ShareFiles.DIMENSIONS.contains(dimension)) spots.add(new MarkerDeletions.Spot(dimension, m.get(1).getAsInt(), m.get(2).getAsInt(), m.get(3).getAsInt()));
            }
        } catch (RuntimeException e) {
            respond(out, 400, "text/plain", "Not a list of markers".getBytes(StandardCharsets.UTF_8));
            return;
        }
        deletions.request(server, spots);
        JsonObject answer = new JsonObject();
        answer.addProperty("taken", spots.size());
        respond(out, 200, "application/json", answer.toString().getBytes(StandardCharsets.UTF_8));
    }

    /**
     * {"markers": [[dimension, group, name, initials, x, y, z, rgb], ...], "removed": [[dimension, x, y, z, at], ...],
     * "known": whether the game's been on the server}. The colour and the removed ones came later: a
     * build before takes the first seven and leaves "removed" be.
     */
    private String markersOf(String server) {
        List<Marker> list = markers.get(server);
        JsonArray array = new JsonArray();
        if (list != null) {
            for (Marker marker : list) {
                JsonArray m = new JsonArray();
                m.add(marker.dimension());
                m.add(marker.group());
                m.add(marker.name());
                m.add(marker.initials());
                m.add(marker.x());
                m.add(marker.y());
                m.add(marker.z());
                m.add(marker.rgb());
                array.add(m);
            }
        }
        JsonArray removed = new JsonArray();
        for (MarkerDeletions.Removed gone : deletions.removed(server)) {
            JsonArray r = new JsonArray();
            r.add(gone.spot().dimension());
            r.add(gone.spot().x());
            r.add(gone.spot().y());
            r.add(gone.spot().z());
            r.add(gone.at());
            removed.add(r);
        }
        JsonObject answer = new JsonObject();
        answer.add("markers", array);
        answer.add("removed", removed);
        answer.addProperty("known", list != null);
        return answer.toString();
    }

    /** {"regions": [[dimension, x, z, modifiedMs, bytes], ...]}: the settled region files of the server's map. */
    private String regionsOf(String server) {
        JsonArray array = new JsonArray();
        MapWorld map = ShareFiles.readMap(root, server);
        long now = System.currentTimeMillis();
        if (map != null) {
            for (String dimension : ShareFiles.DIMENSIONS) {
                File[] files = map.regionFolder(dimension).toFile().listFiles();
                if (files == null) continue;
                for (File file : files) {
                    Matcher match = REGION_FILE.matcher(file.getName());
                    if (!match.matches()) continue;
                    long modified = file.lastModified();
                    if (now - modified < SETTLE_MS) continue;
                    JsonArray r = new JsonArray();
                    r.add(dimension);
                    r.add(Integer.parseInt(match.group(1)));
                    r.add(Integer.parseInt(match.group(2)));
                    r.add(modified);
                    r.add(file.length());
                    array.add(r);
                }
            }
        }
        JsonObject answer = new JsonObject();
        answer.add("regions", array);
        return answer.toString();
    }

    private static void respond(OutputStream out, int code, String type, byte[] body) throws IOException {
        String reason = switch (code) {
            case 200 -> "OK";
            case 400 -> "Bad Request";
            case 401 -> "Unauthorized";
            case 405 -> "Method Not Allowed";
            default -> "Not Found";
        };
        String head = "HTTP/1.1 " + code + " " + reason + "\r\nContent-Type: " + type + "\r\nContent-Length: " + body.length
            + "\r\nConnection: close\r\n\r\n";
        out.write(head.getBytes(StandardCharsets.US_ASCII));
        out.write(body);
        out.flush();
    }

    /** A request's first line and headers (names lower case); the body, if any, is read by what answers it. */
    private record Request(String method, String path, Map<String, String> query, Map<String, String> headers) {
        static Request read(InputStream in) throws IOException {
            ByteArrayOutputStream head = new ByteArrayOutputStream();
            // Up to the blank line: the last four bytes "\r\n\r\n"
            int last = 0;
            while (last != 0x0D0A0D0A) {
                int b = in.read();
                if (b == -1 || head.size() >= MAX_HEAD_BYTES) return null;
                head.write(b);
                last = last << 8 | b;
            }
            String[] lines = head.toString(StandardCharsets.ISO_8859_1).split("\r\n");
            String[] first = lines[0].split(" ");
            if (first.length != 3) return null;
            Map<String, String> headers = new HashMap<>();
            for (int i = 1; i < lines.length; i++) {
                int colon = lines[i].indexOf(':');
                if (colon > 0) headers.put(lines[i].substring(0, colon).trim().toLowerCase(Locale.ROOT), lines[i].substring(colon + 1).trim());
            }
            String target = first[1];
            int question = target.indexOf('?');
            Map<String, String> query = new HashMap<>();
            if (question >= 0) {
                for (String pair : target.substring(question + 1).split("&")) {
                    int equals = pair.indexOf('=');
                    if (equals <= 0) continue;
                    query.put(URLDecoder.decode(pair.substring(0, equals), StandardCharsets.UTF_8), URLDecoder.decode(pair.substring(equals + 1), StandardCharsets.UTF_8));
                }
            }
            return new Request(first[0], question >= 0 ? target.substring(0, question) : target, query, headers);
        }
    }
}
