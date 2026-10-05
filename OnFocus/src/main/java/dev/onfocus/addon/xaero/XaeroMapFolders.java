package dev.onfocus.addon.xaero;

import xaero.map.MapProcessor;
import xaero.map.WorldMapSession;

import java.io.File;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/**
 * Where Xaero's World Map keeps the texture caches ({@code cache_<version>/x_z.xwmc}) of the world
 * the player is in, for every dimension it has a map of. Touches Xaero's classes: only call it
 * with the mod installed, on the client thread.
 */
public final class XaeroMapFolders {
    private XaeroMapFolders() {}

    /** A dimension's cache folder, and the dimension's name as the game has it ("overworld", "the_nether"). */
    public record CacheFolder(String dimension, Path folder) {}

    /** Empty while the map isn't known yet, or for a singleplayer map drawn from the world save. */
    public static List<CacheFolder> cacheFolders() {
        List<CacheFolder> folders = new ArrayList<>();
        try {
            WorldMapSession session = WorldMapSession.getCurrentSession();
            MapProcessor processor = session == null ? null : session.getMapProcessor();
            if (processor == null || processor.getMapWorld() == null) return folders;
            if (processor.getMapWorld().getCurrentDimension().isUsingWorldSave()) return folders;
            String worldId = processor.getCurrentWorldId(), dimId = processor.getCurrentDimId(), mwId = processor.getCurrentMWId();
            if (worldId == null || dimId == null || mwId == null) return folders;
            // <world-map>/<world>/<dimension>/<mw>: the other dimensions are this one's siblings
            Path worldFolder = processor.getMapSaveLoad().getMWSubFolder(worldId, dimId, mwId).getParent().getParent();
            String cacheName = "cache_" + processor.getGlobalVersion();
            File[] dimensions = worldFolder.toFile().listFiles(File::isDirectory);
            if (dimensions == null) return folders;
            for (File dimensionFolder : dimensions) {
                String dimension = dimensionName(dimensionFolder.getName());
                if (dimension == null) continue;
                Path cache = dimensionFolder.toPath().resolve(mwId).resolve(cacheName);
                if (Files.isDirectory(cache)) folders.add(new CacheFolder(dimension, cache));
            }
        } catch (RuntimeException e) {
            // Mid world change: next time
        }
        return folders;
    }

    /** Xaero's folder name of a dimension as the game names it; null for a folder that isn't one. */
    public static String dimensionName(String folder) {
        return switch (folder) {
            case "null" -> "overworld";
            case "DIM-1" -> "the_nether";
            case "DIM1" -> "the_end";
            // Other dimensions are "namespace$path"
            default -> folder.contains("$") ? folder.substring(folder.indexOf('$') + 1).toLowerCase(Locale.ROOT) : null;
        };
    }
}
