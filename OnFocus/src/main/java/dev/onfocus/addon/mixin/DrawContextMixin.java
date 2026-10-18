package dev.onfocus.addon.mixin;

import dev.onfocus.addon.modules.MapPreview;
import meteordevelopment.meteorclient.systems.modules.Modules;
import net.minecraft.client.gui.DrawContext;
import net.minecraft.entity.LivingEntity;
import net.minecraft.item.ItemStack;
import net.minecraft.world.World;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/**
 * Every GUI item draw (screens, containers, hotbar) ends up in this private {@code drawItem}
 * overload. While {@link MapPreview} is active, filled maps are drawn as their picture instead.
 */
@Mixin(DrawContext.class)
public class DrawContextMixin {
    @Inject(
        method = "drawItem(Lnet/minecraft/entity/LivingEntity;Lnet/minecraft/world/World;Lnet/minecraft/item/ItemStack;IIII)V",
        at = @At("HEAD"),
        cancellable = true
    )
    private void onDrawItem(LivingEntity entity, World world, ItemStack stack, int x, int y, int seed, int z, CallbackInfo ci) {
        Modules modules = Modules.get();
        if (modules == null) return;
        MapPreview preview = modules.get(MapPreview.class);
        if (preview != null && preview.isActive() && preview.draw((DrawContext) (Object) this, stack, x, y, z)) {
            ci.cancel();
        }
    }
}
