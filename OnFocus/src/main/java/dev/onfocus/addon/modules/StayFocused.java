package dev.onfocus.addon.modules;

import dev.onfocus.addon.OnFocusAddon;
import meteordevelopment.meteorclient.systems.modules.Module;

/**
 * Makes the game think the window is always focused, so alt-tabbing away doesn't
 * pause singleplayer worlds or throttle rendering/input like an unfocused window does.
 * The actual spoofing happens in {@link dev.onfocus.addon.mixin.WindowMixin}, which
 * only takes effect while this module is active.
 */
public class StayFocused extends Module {
    public StayFocused() {
        super(OnFocusAddon.CATEGORY, "stay-focused", "Makes Minecraft act as if the window is always focused, even after alt-tabbing away.");
    }
}
