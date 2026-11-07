package dev.onfocus.addon.mixin;

import dev.onfocus.addon.hud.HudHiding;
import meteordevelopment.meteorclient.events.render.Render2DEvent;
import meteordevelopment.orbit.EventBus;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfoReturnable;

/**
 * Meteor's HUD, its modules and every addon draw on the screen from {@link Render2DEvent}. Withholding
 * the event here hides them all, including addons nobody listed, leaving only the nametags.
 */
@Mixin(value = EventBus.class, remap = false)
public abstract class EventBusMixin {
    @Inject(method = "post(Ljava/lang/Object;)Ljava/lang/Object;", at = @At("HEAD"), cancellable = true)
    private void onfocus$withholdHudEvent(Object event, CallbackInfoReturnable<Object> cir) {
        if (HudHiding.hiding() && event instanceof Render2DEvent render) {
            HudHiding.drawNametags(render);
            cir.setReturnValue(event);
        }
    }
}
