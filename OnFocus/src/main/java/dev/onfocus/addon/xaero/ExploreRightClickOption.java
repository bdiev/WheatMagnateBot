package dev.onfocus.addon.xaero;

import dev.onfocus.addon.modules.AreaExplorer;
import meteordevelopment.meteorclient.systems.modules.Modules;
import net.minecraft.client.MinecraftClient;
import net.minecraft.client.gui.screen.Screen;
import net.minecraft.registry.RegistryKey;
import net.minecraft.world.World;
import xaero.map.gui.IRightClickableElement;
import xaero.map.gui.dropdown.rightclick.RightClickOption;

/**
 * World map right-click option that hands the selected chunk area to {@link AreaExplorer}: "Explore"
 * flies the blank parts of it, "Rescan" all of it again, mapped or not.
 */
public class ExploreRightClickOption extends RightClickOption {
    private final int minChunkX, minChunkZ, maxChunkX, maxChunkZ;
    private final RegistryKey<World> dimension;
    private final boolean rescan;

    public ExploreRightClickOption(int index, IRightClickableElement target, int minChunkX, int minChunkZ, int maxChunkX, int maxChunkZ, RegistryKey<World> dimension, boolean rescan) {
        super(rescan ? "Rescan" : "Explore", index, target);
        this.minChunkX = minChunkX;
        this.minChunkZ = minChunkZ;
        this.maxChunkX = maxChunkX;
        this.maxChunkZ = maxChunkZ;
        this.dimension = dimension;
        this.rescan = rescan;
    }

    @Override
    public void onAction(Screen screen) {
        MinecraftClient.getInstance().setScreen(null);
        AreaExplorer explorer = Modules.get().get(AreaExplorer.class);
        if (rescan) explorer.rescan(minChunkX, minChunkZ, maxChunkX, maxChunkZ, dimension);
        else explorer.explore(minChunkX, minChunkZ, maxChunkX, maxChunkZ, dimension);
    }
}
