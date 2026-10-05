package dev.onfocus.addon.mixin.baritone;

import baritone.api.utils.BetterBlockPos;
import baritone.process.elytra.ElytraBehavior;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.Mutable;
import org.spongepowered.asm.mixin.gen.Accessor;

@Mixin(value = ElytraBehavior.class, remap = false)
public interface ElytraBehaviorAccessor {
    @Mutable
    @Accessor("b")
    void onfocus$setDestination(BetterBlockPos destination);

    @Accessor("a")
    ElytraBehavior.PathManager onfocus$getPathManager();
}
