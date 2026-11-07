package dev.onfocus.addon.mixin;

import meteordevelopment.meteorclient.events.render.Render2DEvent;
import meteordevelopment.meteorclient.systems.modules.render.Nametags;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.gen.Invoker;

@Mixin(value = Nametags.class, remap = false)
public interface NametagsInvoker {
    @Invoker("onRender2D")
    void onfocus$onRender2D(Render2DEvent event);
}
