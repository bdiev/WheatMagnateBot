package dev.onfocus.addon.mixin;

import dev.onfocus.addon.hud.HudHiding;
import meteordevelopment.meteorclient.systems.modules.render.Nametags;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfoReturnable;

/**
 * Meteor removes the game's own names above players for as long as this says it draws its own.
 * With Meteor's nametags hidden it draws none, so the game's names come back.
 */
@Mixin(value = Nametags.class, remap = false)
public abstract class NametagsMixin {
    @Inject(method = "playerNametags", at = @At("HEAD"), cancellable = true)
    private void onfocus$leaveGameNames(CallbackInfoReturnable<Boolean> cir) {
        if (HudHiding.hidingMeteorNametags()) cir.setReturnValue(false);
    }
}
