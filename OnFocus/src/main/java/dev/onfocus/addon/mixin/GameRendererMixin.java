package dev.onfocus.addon.mixin;

import dev.onfocus.addon.hud.HudHiding;
import net.minecraft.client.gui.DrawContext;
import net.minecraft.client.render.GameRenderer;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/** The totem that flies up the screen when it saves you is drawn here, apart from the HUD layers. */
@Mixin(GameRenderer.class)
public abstract class GameRendererMixin {
    @Inject(method = "renderFloatingItem", at = @At("HEAD"), cancellable = true)
    private void onfocus$hideTotemAnimation(DrawContext context, float tickDelta, CallbackInfo ci) {
        if (HudHiding.hidingTotemAnimation()) ci.cancel();
    }
}
