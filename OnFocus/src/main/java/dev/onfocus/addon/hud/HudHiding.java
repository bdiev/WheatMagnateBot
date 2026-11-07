package dev.onfocus.addon.hud;

import dev.onfocus.addon.mixin.NametagsInvoker;
import dev.onfocus.addon.modules.HudHider;
import meteordevelopment.meteorclient.events.render.Render2DEvent;
import meteordevelopment.meteorclient.systems.hud.screens.HudEditorScreen;
import meteordevelopment.meteorclient.systems.modules.Modules;
import meteordevelopment.meteorclient.systems.modules.render.Nametags;
import net.minecraft.client.gui.LayeredDrawer;

/**
 * What the HUD mixins ask while {@link HudHider} is on. Until the module is switched on nothing
 * here touches Meteor, because {@link #hiding()} is also asked from Fabric's event code, which
 * runs before Meteor has started.
 */
public final class HudHiding {
    private static HudHider module;

    private HudHiding() {
    }

    public static void setModule(HudHider hider) {
        module = hider;
    }

    /** The HUD editor stays usable: it would show nothing to edit otherwise. */
    public static boolean hiding() {
        return module != null && !HudEditorScreen.isOpen();
    }

    /** Whether Meteor's nametags are hidden too. The game's own names are never hidden. */
    public static boolean hidingMeteorNametags() {
        return hiding() && !module.keepNametags();
    }

    public static boolean hidingHands() {
        return hiding() && module.hideHands();
    }

    public static boolean hidingTotemAnimation() {
        return hiding() && module.hideTotemAnimation();
    }

    /**
     * Mods add their own layers to the drawer the game's HUD is made of. Layers the game created
     * are lambdas of Minecraft's classes; Fabric wraps them, so its wrapper is judged by its id.
     */
    public static boolean drawsLayer(LayeredDrawer.Layer layer) {
        if (!hiding()) return true;
        if (module.hideVanillaHud()) return false;

        String owner = layer.getClass().getName();
        if (owner.startsWith("net.minecraft.")) return true;
        return owner.startsWith("net.fabricmc.") && FabricHud.isVanillaLayer(layer);
    }

    /**
     * Meteor's nametags are drawn from the same event as the rest of its HUD, so with that event
     * withheld they are the one listener still called.
     */
    public static void drawNametags(Render2DEvent event) {
        if (!module.keepNametags()) return;
        Nametags nametags = Modules.get().get(Nametags.class);
        if (nametags != null && nametags.isActive()) ((NametagsInvoker) nametags).onfocus$onRender2D(event);
    }
}
