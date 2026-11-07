package dev.onfocus.addon.mixin;

import com.llamalad7.mixinextras.injector.v2.WrapWithCondition;
import dev.onfocus.addon.hud.HudHiding;
import net.minecraft.client.gui.DrawContext;
import net.minecraft.client.gui.LayeredDrawer;
import net.minecraft.client.render.RenderTickCounter;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;

/** Skips the HUD layers that {@link HudHiding} rules out. */
@Mixin(LayeredDrawer.class)
public abstract class LayeredDrawerMixin {
    @WrapWithCondition(
        method = "renderInternal",
        at = @At(value = "INVOKE", target = "Lnet/minecraft/client/gui/LayeredDrawer$Layer;render(Lnet/minecraft/client/gui/DrawContext;Lnet/minecraft/client/render/RenderTickCounter;)V")
    )
    private boolean onfocus$drawLayer(LayeredDrawer.Layer layer, DrawContext context, RenderTickCounter tickCounter) {
        return HudHiding.drawsLayer(layer);
    }
}
