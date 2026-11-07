package dev.onfocus.addon.mixin.hud;

import dev.onfocus.addon.hud.HudHiding;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.Pseudo;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/**
 * Xaero's Minimap hooks the game's HUD methods with its own mixins, which call these two: one draws
 * the waypoints in the world, the other the minimap and the rest of its HUD.
 */
@Pseudo
@Mixin(targets = "xaero.common.core.XaeroMinimapCore", remap = false)
public abstract class XaeroMinimapCoreMixin {
    @Inject(method = {"beforeIngameGuiRender", "handleRenderModOverlay"}, at = @At("HEAD"), cancellable = true, require = 0)
    private static void onfocus$hide(CallbackInfo ci) {
        if (HudHiding.hiding()) ci.cancel();
    }
}
