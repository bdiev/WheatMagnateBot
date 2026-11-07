package dev.onfocus.addon.hud;

import net.fabricmc.fabric.api.client.rendering.v1.HudRenderCallback;
import net.fabricmc.fabric.api.client.rendering.v1.IdentifiedLayer;
import net.minecraft.client.gui.LayeredDrawer;

/** The Fabric API's HUD types, kept apart so that nothing loads them when the API isn't installed. */
public final class FabricHud {
    public static final HudRenderCallback NO_CALLBACK = (context, tickCounter) -> {
    };

    private FabricHud() {
    }

    static boolean isVanillaLayer(LayeredDrawer.Layer layer) {
        return layer instanceof IdentifiedLayer identified && identified.id().getNamespace().equals("minecraft");
    }
}
