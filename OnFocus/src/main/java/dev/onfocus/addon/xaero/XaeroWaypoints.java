package dev.onfocus.addon.xaero;

import dev.onfocus.addon.modules.AreaExplorer;
import xaero.common.minimap.waypoints.Waypoint;
import xaero.hud.minimap.BuiltInHudModules;
import xaero.hud.minimap.module.MinimapSession;
import xaero.hud.minimap.waypoint.WaypointColor;
import xaero.hud.minimap.waypoint.WaypointPurpose;
import xaero.hud.minimap.waypoint.set.WaypointSet;
import xaero.hud.minimap.world.MinimapWorld;

import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import java.util.function.Function;

/**
 * Waypoints of Xaero's Minimap - the ones Xaero's World Map shows. They're kept per world and
 * dimension, so everything here is about the dimension the player is in now.
 * <p>
 * Only call into this class with Xaero's Minimap (or BetterPvP) installed: it links against it.
 * {@link Spot} is a class of its own and safe to use without.
 */
public final class XaeroWaypoints {
    /** A waypoint already there, in the current dimension. */
    public record Spot(String name, int x, int z) {}

    private XaeroWaypoints() {}

    /** Whether there's a world to put waypoints in right now. */
    public static boolean isReady() {
        return currentWorld() != null;
    }

    /** Waypoints of every set in the current dimension. */
    public static List<Spot> current() {
        List<Spot> spots = new ArrayList<>();
        MinimapWorld world = currentWorld();
        if (world == null) return spots;
        for (WaypointSet set : world.getIterableWaypointSets()) {
            for (Waypoint w : set.getWaypoints()) spots.add(new Spot(w.getName(), w.getX(), w.getZ()));
        }
        return spots;
    }

    /**
     * Adds a waypoint, disabled or not, to the set with the given name - created if missing, so the
     * markers keep to a list of their own - and saves it. False if there's no world to add to.
     */
    public static boolean add(String setName, String name, String initials, int x, int y, int z, int rgb, boolean disabled) {
        MinimapSession session = BuiltInHudModules.MINIMAP.getCurrentSession();
        MinimapWorld world = currentWorld();
        if (world == null) return false;
        WaypointSet set = world.getWaypointSet(setName);
        if (set == null) {
            world.addWaypointSet(setName);
            set = world.getWaypointSet(setName);
            if (set == null) return false;
        }

        Waypoint waypoint = new Waypoint(x, y, z, name, initials, nearestColor(rgb), WaypointPurpose.NORMAL);
        waypoint.setDisabled(disabled);
        set.add(waypoint);
        try {
            session.getWorldManagerIO().saveWorld(world);
        } catch (IOException e) {
            AreaExplorer.FILE_LOG.error("Couldn't save Xaero waypoints", e);
        }
        return true;
    }

    /** Where a waypoint moves to: a set and the colour it takes there. */
    public record Target(String set, int rgb) {}

    /**
     * Moves the waypoints of the set {@code from} - in every dimension of the server we're on - to the
     * set {@code target} gives for each name, recoloured; ones it gives null for stay. The set left
     * empty is removed, unless it's the one shown. Returns how many moved; -1 if there's no world.
     */
    public static int regroup(String from, Function<String, Target> target) {
        MinimapSession session = BuiltInHudModules.MINIMAP.getCurrentSession();
        if (session == null || session.getWorldManager().getCurrentRootContainer() == null) return -1;
        int moved = 0;
        for (MinimapWorld world : session.getWorldManager().getCurrentRootContainer().getAllWorldsIterable()) {
            WaypointSet source = world.getWaypointSet(from);
            if (source == null) continue;
            int movedHere = 0;
            List<Waypoint> waypoints = new ArrayList<>();
            for (Waypoint w : source.getWaypoints()) waypoints.add(w);
            for (Waypoint w : waypoints) {
                Target to = target.apply(w.getName());
                if (to == null || to.set().equals(from)) continue;
                WaypointSet dest = world.getWaypointSet(to.set());
                if (dest == null) {
                    world.addWaypointSet(to.set());
                    dest = world.getWaypointSet(to.set());
                    if (dest == null) continue;
                }
                source.remove(w);
                w.setWaypointColor(nearestColor(to.rgb()));
                dest.add(w);
                movedHere++;
            }
            if (movedHere == 0) continue;
            if (source.isEmpty() && !from.equals(world.getCurrentWaypointSetId())) world.removeWaypointSet(from);
            moved += movedHere;
            try {
                session.getWorldManagerIO().saveWorld(world);
            } catch (IOException e) {
                AreaExplorer.FILE_LOG.error("Couldn't save Xaero waypoints", e);
            }
        }
        return moved;
    }

    /** A waypoint of the server, in any dimension: the dimension as the game names it ("overworld", "the_nether"). */
    public record Saved(String dimension, String set, String name, int x, int y, int z, long createdAt) {}

    /**
     * Every waypoint of every set, in every dimension of the server we're on; empty with no world.
     * Waypoints of a dimension Xaero can't tell are left out.
     */
    public static List<Saved> allOnServer() {
        List<Saved> saved = new ArrayList<>();
        MinimapSession session = BuiltInHudModules.MINIMAP.getCurrentSession();
        if (session == null || session.getWorldManager().getCurrentRootContainer() == null) return saved;
        for (MinimapWorld world : session.getWorldManager().getCurrentRootContainer().getAllWorldsIterable()) {
            if (world.getDimId() == null) continue;
            String dimension = world.getDimId().getValue().getPath();
            for (WaypointSet set : world.getIterableWaypointSets()) {
                for (Waypoint w : set.getWaypoints()) {
                    saved.add(new Saved(dimension, set.getName(), w.getName(), w.getX(), w.getY(), w.getZ(), w.getCreatedAt()));
                }
            }
        }
        return saved;
    }

    /** A waypoint to add: {@link #addAll} takes many at once. */
    public record NewWaypoint(String name, String initials, int x, int y, int z, int rgb) {}

    /**
     * {@link #add} for many waypoints into one set, saved once at the end - adding hundreds one by one
     * would write Xaero's file each time. False if there's no world to add to.
     */
    public static boolean addAll(String setName, List<NewWaypoint> waypoints, boolean disabled) {
        MinimapSession session = BuiltInHudModules.MINIMAP.getCurrentSession();
        MinimapWorld world = currentWorld();
        if (world == null) return false;
        WaypointSet set = world.getWaypointSet(setName);
        if (set == null) {
            world.addWaypointSet(setName);
            set = world.getWaypointSet(setName);
            if (set == null) return false;
        }
        for (NewWaypoint w : waypoints) {
            Waypoint waypoint = new Waypoint(w.x(), w.y(), w.z(), w.name(), w.initials(), nearestColor(w.rgb()), WaypointPurpose.NORMAL);
            waypoint.setDisabled(disabled);
            set.add(waypoint);
        }
        try {
            session.getWorldManagerIO().saveWorld(world);
        } catch (IOException e) {
            AreaExplorer.FILE_LOG.error("Couldn't save Xaero waypoints", e);
        }
        return true;
    }

    private static MinimapWorld currentWorld() {
        MinimapSession session = BuiltInHudModules.MINIMAP.getCurrentSession();
        return session == null ? null : session.getWorldManager().getCurrentWorld();
    }

    /** Xaero waypoints only come in its 16 chat colours: the closest one. */
    private static WaypointColor nearestColor(int rgb) {
        WaypointColor best = WaypointColor.WHITE;
        long bestDist = Long.MAX_VALUE;
        for (WaypointColor color : WaypointColor.values()) {
            int hex = color.getHex();
            long dr = ((hex >> 16) & 0xFF) - ((rgb >> 16) & 0xFF);
            long dg = ((hex >> 8) & 0xFF) - ((rgb >> 8) & 0xFF);
            long db = (hex & 0xFF) - (rgb & 0xFF);
            long dist = dr * dr + dg * dg + db * db;
            if (dist < bestDist) {
                bestDist = dist;
                best = color;
            }
        }
        return best;
    }
}
