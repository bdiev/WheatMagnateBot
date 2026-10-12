package dev.onfocus.addon.explore;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.HashSet;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * The site's commands (explore / rescan an area) as this mod handled them, by id: what became of each
 * - accepted, running, stopped, completed, rejected and why. Each change goes to the site with the
 * status uploads until the site says it has it. A command the site sends again (the answer that
 * carried it got lost) is never run twice: the site just hears again how it went.
 * <p>
 * Kept in a file, so a restart neither runs a command again nor forgets to tell the site about it.
 * Used from the game thread and the HTTP thread: every method is synchronized.
 */
public final class SiteCommands {
    public enum State { ACCEPTED, RUNNING, STOPPED, COMPLETED, REJECTED }

    /** Commands remembered at most: the oldest are forgotten first. */
    private static final int KEEP = 500;
    private static final int MAX_REASON = 300;

    /** {@code at}: when it changed, which also tells a report from an older one of the same command. */
    private record Entry(State state, String reason, long at, boolean reported) {}

    private final Path file;
    /** By site and id ("https://site 42"), oldest first. */
    private final LinkedHashMap<String, Entry> entries = new LinkedHashMap<>();
    /** The command whose run is going (or saved, to carry on), or null. */
    private String current;
    private boolean loaded;

    public SiteCommands(Path file) {
        this.file = file;
    }

    private static String key(String site, String id) {
        return site + " " + id;
    }

    public synchronized boolean known(String site, String id) {
        load();
        return entries.containsKey(key(site, id));
    }

    /** What became of a command now: told to the site with the next uploads. */
    public synchronized void set(String site, String id, State state, String reason) {
        load();
        String k = key(site, id);
        entries.remove(k); // to the end: the newest
        String clean = reason == null ? "" : reason.replaceAll("[\\t\\r\\n]+", " ").strip();
        if (clean.length() > MAX_REASON) clean = clean.substring(0, MAX_REASON - 1) + "…";
        entries.put(k, new Entry(state, clean, System.currentTimeMillis(), false));
        Iterator<String> oldest = entries.keySet().iterator();
        while (entries.size() > KEEP && oldest.hasNext()) {
            String gone = oldest.next();
            if (gone.equals(current) || gone.equals(k)) continue;
            oldest.remove();
        }
        save();
    }

    /** Sent again: the site lost the last answer, or asked again. */
    public synchronized void resend(String site, String id) {
        load();
        String k = key(site, id);
        Entry entry = entries.get(k);
        if (entry != null && entry.reported()) {
            entries.put(k, new Entry(entry.state(), entry.reason(), entry.at(), false));
            save();
        }
    }

    public synchronized State state(String site, String id) {
        load();
        Entry entry = entries.get(key(site, id));
        return entry == null ? null : entry.state();
    }

    /** The command whose run this is, or null for a run picked in game. */
    public synchronized void setCurrent(String site, String id) {
        load();
        String next = site == null || id == null ? null : key(site, id);
        if (java.util.Objects.equals(next, current)) return;
        current = next;
        save();
    }

    /** The id of the command whose run is going, if it came from this site. */
    public synchronized String current(String site) {
        load();
        if (current == null || !current.startsWith(site + " ")) return null;
        return current.substring(site.length() + 1);
    }

    public synchronized boolean hasPending(String site) {
        load();
        for (Map.Entry<String, Entry> e : entries.entrySet()) {
            if (!e.getValue().reported() && e.getKey().startsWith(site + " ")) return true;
        }
        return false;
    }

    /** What the site hasn't confirmed yet: {id, state, reason, at} each. */
    public synchronized JsonArray pending(String site) {
        load();
        JsonArray list = new JsonArray();
        for (Map.Entry<String, Entry> e : entries.entrySet()) {
            Entry entry = e.getValue();
            if (entry.reported() || !e.getKey().startsWith(site + " ")) continue;
            JsonObject json = new JsonObject();
            json.addProperty("id", e.getKey().substring(site.length() + 1));
            json.addProperty("state", entry.state().name().toLowerCase(java.util.Locale.ROOT));
            if (!entry.reason().isEmpty()) json.addProperty("reason", entry.reason());
            json.addProperty("at", entry.at());
            list.add(json);
        }
        return list;
    }

    /**
     * The site took these ({@code sent}, as {@link #pending} made them) - those of their ids it
     * listed in {@code acks}. One changed since is still to be told.
     */
    public synchronized void acknowledged(String site, JsonArray sent, JsonArray acks) {
        load();
        Set<String> ids = new HashSet<>();
        for (JsonElement ack : acks) {
            if (ack.isJsonPrimitive()) ids.add(ack.getAsString());
        }
        boolean changed = false;
        for (JsonElement element : sent) {
            JsonObject json = element.getAsJsonObject();
            String id = json.get("id").getAsString();
            if (!ids.contains(id)) continue;
            String k = key(site, id);
            Entry entry = entries.get(k);
            if (entry == null || entry.reported() || entry.at() != json.get("at").getAsLong()) continue;
            entries.put(k, new Entry(entry.state(), entry.reason(), entry.at(), true));
            changed = true;
        }
        if (changed) save();
    }

    // The file: "current<TAB>key" first, then "key<TAB>STATE<TAB>at<TAB>reported<TAB>reason" a command

    private void load() {
        if (loaded) return;
        loaded = true;
        try {
            if (!Files.exists(file)) return;
            List<String> lines = Files.readAllLines(file, StandardCharsets.UTF_8);
            for (String line : lines) {
                String[] parts = line.split("\t", -1);
                if (parts.length == 2 && parts[0].equals("current")) {
                    current = parts[1].isEmpty() ? null : parts[1];
                } else if (parts.length == 5) {
                    try {
                        entries.put(parts[0], new Entry(State.valueOf(parts[1]), parts[4], Long.parseLong(parts[2]), parts[3].equals("1")));
                    } catch (IllegalArgumentException ignored) {
                        // A line from something else: skipped
                    }
                }
            }
        } catch (IOException ignored) {
            // Nothing remembered: a command sent again would run again, as before
        }
    }

    private void save() {
        StringBuilder text = new StringBuilder("current\t").append(current == null ? "" : current).append('\n');
        for (Map.Entry<String, Entry> e : entries.entrySet()) {
            Entry entry = e.getValue();
            text.append(e.getKey()).append('\t').append(entry.state().name()).append('\t').append(entry.at()).append('\t')
                .append(entry.reported() ? '1' : '0').append('\t').append(entry.reason()).append('\n');
        }
        try {
            Files.createDirectories(file.getParent());
            Path tmp = file.resolveSibling(file.getFileName() + ".tmp");
            Files.writeString(tmp, text.toString(), StandardCharsets.UTF_8);
            Files.move(tmp, file, StandardCopyOption.REPLACE_EXISTING);
        } catch (IOException ignored) {
            // Kept in memory still; the next change writes it again
        }
    }
}
