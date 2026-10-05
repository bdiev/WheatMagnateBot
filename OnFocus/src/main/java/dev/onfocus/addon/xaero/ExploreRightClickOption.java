package dev.onfocus.addon.xaero;

import dev.onfocus.addon.modules.AreaExplorer;
import meteordevelopment.meteorclient.systems.modules.Modules;
import net.minecraft.client.MinecraftClient;
import net.minecraft.client.gui.screen.Screen;
import net.minecraft.registry.RegistryKey;
import net.minecraft.world.World;
import xaero.map.gui.IRightClickableElement;
import xaero.map.gui.dropdown.rightclick.RightClickOption;

/** World map right-click option that hands the selected chunk area to {@link AreaExplorer}. */
public class ExploreRightClickOption extends RightClickOption {
    private final int minChunkX, minChunkZ, maxChunkX, maxChunkZ;
    private final RegistryKey<World> dimension;

    public ExploreRightClickOption(int index, IRightClickableElement target, int minChunkX, int minChunkZ, int maxChunkX, int maxChunkZ, RegistryKey<World> dimension) {
        super("Explore", index, target);
        this.minChunkX = minChunkX;
        this.minChunkZ = minChunkZ;
        this.maxChunkX = maxChunkX;
        this.maxChunkZ = maxChunkZ;
        this.dimension = dimension;
    }

    @Override
    public void onAction(Screen screen) {
        MinecraftClient.getInstance().setScreen(null);
        Modules.get().get(AreaExplorer.class).explore(minChunkX, minChunkZ, maxChunkX, maxChunkZ, dimension);
    }
}
