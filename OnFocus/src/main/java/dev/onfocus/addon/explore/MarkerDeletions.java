package dev.onfocus.addon.explore;

import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Collection;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Markers taken out on the PC that explores (share-mode Serve), on any of the three that share them:
 * here in Xaero, on the player's own PC (share-mode Take) or on the site. This PC's markers are the
 * ones the other two have; one gone from here is gone for them too.
 * <p>
 * {@link #look} compares Area Explorer's markers in Xaero with the ones there last time: one no longer
 * there was taken out. It's kept (a "removed" marker) - for the other PC, which takes it out too, for
 * the site, told once, and so exploring doesn't put it back. A marker is told by its block: renamed or
 * moved to another set it's the same one.
 * <p>
 * The other PC asks for markers to be taken out ({@link #request}): the game does that once it's on
 * their server, and {@link #look} sees them go. Kept in files per server under
 * {@code .minecraft/onfocus/shared}, so a restart forgets nothing. Every method is synchronized: the
 * game thread, the share server's and the files thread use it.
 */
public final class MarkerDeletions {
    /** Removed markers kept at most per server: the oldest are forgotten first. */
    private static final int KEEP = 20_000;
    /**
     * More than this many markers of a dimension gone at once, and more than half of them: Xaero lost
     * its waypoints (wiped, reinstalled) rather than they were taken out - they're let go, not removed
     * for the other two.
     */
    public static final int MASS_LOSS = 100;

    /** A marker's block, in a dimension as the game names it ("overworld"). */
    public record Spot(String dimension, int x, int y, int z) {
        String line() {
            return dimension + "\t" + x + "\t" + y + "\t" + z;
        }
    }

    /** A marker taken out: its block, its name then, when, and whether the site is still to hear of it. */
    public record Removed(Spot spot, String name, long at, boolean toSite) {}

    private static final class Server {
        /** The markers in Xaero last time, with their names; null until first looked at. */
        Map<Spot, String> known;
        final LinkedHashMap<Spot, Removed> removed = new LinkedHashMap<>();
        final Set<Spot> requests = new HashSet<>();
    }

    private final Path root;
    private final Map<String, Server> servers = new HashMap<>();
    private int lost;

    public MarkerDeletions(Path root) {
        this.root = root;
    }

    /**
     * The markers now, with their names, in the dimensions Xaero keeps waypoints for: the ones known
     * before and gone now are removed, and returned. One in {@code quiet} the site took out itself:
     * it isn't told of it again. The first look at a server only learns what's there; a look that
     * finds nothing at all (Xaero not loaded yet) changes nothing; a dimension that lost most of them
     * at once ({@link #MASS_LOSS}) only has them forgotten - {@link #lost} says how many.
     */
    public synchronized List<Removed> look(String server, Map<Spot, String> now, Set<String> dimensions, Set<Spot> quiet, long at) {
        lost = 0;
        Server state = load(server);
        List<Removed> gone = new ArrayList<>();
        if (state.known == null) {
            state.known = new LinkedHashMap<>(now);
            saveKnown(server, state);
            return gone;
        }
        if (now.isEmpty() && !state.known.isEmpty()) return gone;
        Map<Spot, String> next = new LinkedHashMap<>(now);
        boolean changed = !now.keySet().equals(state.known.keySet());
        Map<String, int[]> perDimension = new HashMap<>(); // known, gone
        for (Spot spot : state.known.keySet()) {
            int[] counts = perDimension.computeIfAbsent(spot.dimension(), d -> new int[2]);
            counts[0]++;
            if (!now.containsKey(spot)) counts[1]++;
        }
        Set<String> wiped = new HashSet<>();
        perDimension.forEach((dimension, counts) -> {
            if (counts[1] > MASS_LOSS && counts[1] * 2 > counts[0]) wiped.add(dimension);
        });
        for (Map.Entry<Spot, String> entry : state.known.entrySet()) {
            Spot spot = entry.getKey();
            if (now.containsKey(spot)) continue;
            // A dimension Xaero has nothing of now (not loaded): it's kept as it was
            if (!dimensions.contains(spot.dimension())) {
                next.put(spot, entry.getValue());
                continue;
            }
            if (wiped.contains(spot.dimension())) {
                lost++;
                continue;
            }
            Removed removed = new Removed(spot, entry.getValue(), at, !quiet.remove(spot));
            state.removed.remove(spot);
            state.removed.put(spot, removed);
            gone.add(removed);
        }
        state.requests.removeAll(state.removed.keySet());
        state.known = next;
        if (!gone.isEmpty()) {
            trim(state);
            saveRemoved(server, state);
            saveRequests(server, state);
        }
        if (changed) saveKnown(server, state);
        return gone;
    }

    /** How many markers the last {@link #look} let go as lost by Xaero, not taken out. */
    public synchronized int lost() {
        return lost;
    }

    /** What's in Xaero now becomes what's known, without anything counting as removed. */
    public synchronized void rebase(String server, Map<Spot, String> now) {
        Server state = load(server);
        state.known = new LinkedHashMap<>(now);
        saveKnown(server, state);
    }

    /** The markers removed on the server, oldest first: for the other PC. */
    public synchronized List<Removed> removed(String server) {
        return new ArrayList<>(load(server).removed.values());
    }

    /** The removed markers of a dimension: exploring doesn't put them back. */
    public synchronized List<Removed> removedIn(String server, String dimension) {
        List<Removed> list = new ArrayList<>();
        for (Removed removed : load(server).removed.values()) {
            if (removed.spot().dimension().equals(dimension)) list.add(removed);
        }
        return list;
    }

    /** The removed markers the site hasn't heard of yet. */
    public synchronized List<Removed> unreported(String server) {
        List<Removed> list = new ArrayList<>();
        for (Removed removed : load(server).removed.values()) {
            if (removed.toSite()) list.add(removed);
        }
        return list;
    }

    /** The site took these: not told again. */
    public synchronized void reported(String server, Collection<Removed> sent) {
        Server state = load(server);
        boolean changed = false;
        for (Removed removed : sent) {
            Removed now = state.removed.get(removed.spot());
            if (now == null || !now.toSite() || now.at() != removed.at()) continue;
            state.removed.put(removed.spot(), new Removed(now.spot(), now.name(), now.at(), false));
            changed = true;
        }
        if (changed) saveRemoved(server, state);
    }

    /** The other PC took these out: they go here too, once the game is on the server. */
    public synchronized void request(String server, Collection<Spot> spots) {
        Server state = load(server);
        boolean changed = false;
        for (Spot spot : spots) {
            if (!state.removed.containsKey(spot)) changed |= state.requests.add(spot);
        }
        if (changed) saveRequests(server, state);
    }

    /** What the other PC asked to take out and isn't yet. */
    public synchronized Set<Spot> requests(String server) {
        return new HashSet<>(load(server).requests);
    }

    /** Asked for and not here at all (gone already, or never was): the request is let go. */
    public synchronized void dropRequests(String server, Collection<Spot> spots) {
        Server state = load(server);
        if (state.requests.removeAll(spots)) saveRequests(server, state);
    }

    private static void trim(Server state) {
        var oldest = state.removed.keySet().iterator();
        while (state.removed.size() > KEEP && oldest.hasNext()) {
            oldest.next();
            oldest.remove();
        }
    }

    // The files, a folder per server: markers-known.tsv "dimension x y z name", markers-removed.tsv
    // "dimension x y z at toSite name", remove-requests.tsv "dimension x y z" - tab-separated

    private Server load(String server) {
        Server state = servers.get(server);
        if (state != null) return state;
        state = new Server();
        servers.put(server, state);
        Path folder = ShareFiles.serverFolder(root, server);
        Path knownFile = folder.resolve("markers-known.tsv");
        if (java.nio.file.Files.exists(knownFile)) {
            state.known = new LinkedHashMap<>();
            for (String line : ShareFiles.readLines(knownFile)) {
                String[] parts = line.split("\t", 5);
                Spot spot = parts.length == 5 ? spot(parts) : null;
                if (spot != null) state.known.put(spot, parts[4]);
            }
        }
        for (String line : ShareFiles.readLines(folder.resolve("markers-removed.tsv"))) {
            String[] parts = line.split("\t", 7);
            Spot spot = parts.length == 7 ? spot(parts) : null;
            if (spot == null) continue;
            try {
                state.removed.put(spot, new Removed(spot, parts[6], Long.parseLong(parts[4]), parts[5].equals("1")));
            } catch (NumberFormatException ignored) {
                // A line from something else: skipped
            }
        }
        for (String line : ShareFiles.readLines(folder.resolve("remove-requests.tsv"))) {
            String[] parts = line.split("\t", 4);
            Spot spot = parts.length == 4 ? spot(parts) : null;
            if (spot != null) state.requests.add(spot);
        }
        return state;
    }

    private static Spot spot(String[] parts) {
        try {
            return new Spot(parts[0], Integer.parseInt(parts[1]), Integer.parseInt(parts[2]), Integer.parseInt(parts[3]));
        } catch (NumberFormatException e) {
            return null;
        }
    }

    private static String clean(String name) {
        return name == null ? "" : name.replaceAll("[\\t\\r\\n]+", " ");
    }

    private void saveKnown(String server, Server state) {
        StringBuilder text = new StringBuilder();
        state.known.forEach((spot, name) -> text.append(spot.line()).append('\t').append(clean(name)).append('\n'));
        ShareFiles.writeText(ShareFiles.serverFolder(root, server).resolve("markers-known.tsv"), text.toString());
    }

    private void saveRemoved(String server, Server state) {
        StringBuilder text = new StringBuilder();
        for (Removed removed : state.removed.values()) {
            text.append(removed.spot().line()).append('\t').append(removed.at()).append('\t').append(removed.toSite() ? '1' : '0')
                .append('\t').append(clean(removed.name())).append('\n');
        }
        ShareFiles.writeText(ShareFiles.serverFolder(root, server).resolve("markers-removed.tsv"), text.toString());
    }

    private void saveRequests(String server, Server state) {
        StringBuilder text = new StringBuilder();
        for (Spot spot : state.requests) text.append(spot.line()).append('\n');
        ShareFiles.writeText(ShareFiles.serverFolder(root, server).resolve("remove-requests.tsv"), text.toString());
    }
}
