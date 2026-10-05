package dev.onfocus.addon.mixin.baritone;

import baritone.process.ElytraProcess;
import baritone.process.elytra.ElytraBehavior;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.gen.Accessor;

@Mixin(value = ElytraProcess.class, remap = false)
public interface ElytraProcessAccessor {
    // Meteor's distributed Baritone jar is internally obfuscated; the ElytraBehavior field is
    // named "a" there. Its descriptor disambiguates it from the other same-named fields.
    @Accessor("a")
    ElytraBehavior onfocus$getBehavior();
}
