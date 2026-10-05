package dev.onfocus.addon.mixin.baritone;

import baritone.process.elytra.ElytraBehavior;
import baritone.process.elytra.NetherPath;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.gen.Accessor;
import org.spongepowered.asm.mixin.gen.Invoker;

import java.util.OptionalInt;
import java.util.concurrent.CompletableFuture;

@Mixin(value = ElytraBehavior.PathManager.class, remap = false)
public interface ElytraPathManagerAccessor {
    @Accessor("b")
    boolean onfocus$isRecalculating();

    @Accessor("a")
    NetherPath onfocus$getPath();

    @Invoker("a")
    CompletableFuture<Void> onfocus$recalculate(OptionalInt upToInclusive);
}
