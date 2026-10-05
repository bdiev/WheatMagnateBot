package dev.onfocus.addon.mixin;

import dev.onfocus.addon.modules.StayFocused;
import meteordevelopment.meteorclient.systems.modules.Modules;
import net.minecraft.client.MinecraftClient;
import net.minecraft.client.Mouse;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.Shadow;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.ModifyVariable;

/**
 * Forces the {@code focused} argument of {@link MinecraftClient#onWindowFocusChanged(boolean)}
 * to always be {@code true} while {@link StayFocused} is active. That method is what GLFW calls
 * whenever the OS reports the window gained or lost focus (e.g. after alt-tabbing), and it's what
 * drives both the singleplayer auto-pause and the render/tick throttling that happens while the
 * game is in the background - so pinning it to "always focused" keeps the game running normally.
 */
@Mixin(MinecraftClient.class)
public class MinecraftClientMixin {
    @Shadow
    private Mouse mouse;

    @ModifyVariable(method = "onWindowFocusChanged", at = @At("HEAD"), argsOnly = true)
    private boolean onWindowFocusChanged(boolean focused) {
        // GLFW can report the initial window focus state while Minecraft's constructor is still
        // running, before Meteor has finished setting up Modules - guard against that null window.
        Modules modules = Modules.get();
        if (modules != null && modules.isActive(StayFocused.class)) {
            // The real focus-lost state is hidden from the rest of the game by returning true below,
            // but the mouse cursor must still be released here. Otherwise it stays "locked" (in-game
            // camera control) the whole time the window is in the background, and the click the user
            // makes on the taskbar/window to bring OS focus back is delivered straight to Minecraft's
            // mouse handler as a normal locked-cursor click - i.e. an attack/use action - instead of
            // being consumed as "re-grab the cursor", which is what happens on an ordinary unlock.
            if (!focused && mouse.isCursorLocked()) {
                mouse.unlockCursor();
            }

            return true;
        }

        return focused;
    }
}
