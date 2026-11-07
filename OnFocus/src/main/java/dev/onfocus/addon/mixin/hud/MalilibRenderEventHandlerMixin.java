package dev.onfocus.addon.mixin.hud;

import dev.onfocus.addon.hud.HudHiding;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.Pseudo;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/** Litematica and the other malilib mods get their on-screen drawing from these two calls. */
@Pseudo
@Mixin(targets = "fi.dy.masa.malilib.event.RenderEventHandler", remap = false)
public abstract class MalilibRenderEventHandlerMixin {
    @Inject(method = {"onRenderGameOverlayPost", "onRenderGameOverlayLastDrawer"}, at = @At("HEAD"), cancellable = true, require = 0)
    private void onfocus$hide(CallbackInfo ci) {
        if (HudHiding.hiding()) ci.cancel();
    }
}
