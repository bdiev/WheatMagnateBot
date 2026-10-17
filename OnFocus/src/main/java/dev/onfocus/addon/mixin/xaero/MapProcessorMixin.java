package dev.onfocus.addon.mixin.xaero;

import dev.onfocus.addon.modules.AreaExplorer;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfoReturnable;
import xaero.map.MapProcessor;

/**
 * While Area Explorer sends Xaero's map to the site, Xaero saves the regions it draws - and with
 * them the cache the site's pictures are made from - every 10 seconds instead of every minute, as
 * its own "force fast map writing" does. A World Map without the method is left as it is.
 */
@Mixin(value = MapProcessor.class, remap = false)
public abstract class MapProcessorMixin {
    private static final int FAST_SAVE_MS = 10_000;

    @Inject(method = "getSaveTime", at = @At("HEAD"), cancellable = true, require = 0)
    private void onfocus$saveSoonerForSite(CallbackInfoReturnable<Integer> cir) {
        if (AreaExplorer.sendingMap()) cir.setReturnValue(FAST_SAVE_MS);
    }
}
