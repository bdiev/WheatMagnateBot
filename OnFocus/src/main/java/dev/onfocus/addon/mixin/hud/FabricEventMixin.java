package dev.onfocus.addon.mixin.hud;

import dev.onfocus.addon.hud.FabricHud;
import dev.onfocus.addon.hud.HudHiding;
import net.fabricmc.fabric.api.client.rendering.v1.HudRenderCallback;
import net.fabricmc.fabric.api.event.Event;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfoReturnable;

/**
 * Mods drawing through the Fabric API's HudRenderCallback (Jade, for one) all sit behind the
 * invoker of that one event, so while the HUD is hidden the game gets an empty one instead.
 */
@Mixin(value = Event.class, remap = false)
public abstract class FabricEventMixin {
    @Inject(method = "invoker", at = @At("HEAD"), cancellable = true)
    private void onfocus$emptyHudCallback(CallbackInfoReturnable<Object> cir) {
        if (HudHiding.hiding() && (Object) this == HudRenderCallback.EVENT) cir.setReturnValue(FabricHud.NO_CALLBACK);
    }
}
