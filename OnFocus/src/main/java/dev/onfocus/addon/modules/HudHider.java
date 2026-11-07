package dev.onfocus.addon.modules;

import dev.onfocus.addon.OnFocusAddon;
import dev.onfocus.addon.hud.HudHiding;
import meteordevelopment.meteorclient.settings.BoolSetting;
import meteordevelopment.meteorclient.settings.Setting;
import meteordevelopment.meteorclient.settings.SettingGroup;
import meteordevelopment.meteorclient.systems.modules.Module;

/**
 * Bind this module to a key to hide what cheats and mods draw on the screen. The hiding itself
 * lives in {@link HudHiding} and the mixins that call it.
 */
public class HudHider extends Module {
    private final SettingGroup sgGeneral = settings.getDefaultGroup();

    private final Setting<Boolean> keepNametags = sgGeneral.add(new BoolSetting.Builder()
        .name("keep-nametags")
        .description("Keeps Meteor's Nametags visible while the HUD is hidden. The game's own names always stay.")
        .defaultValue(true)
        .build()
    );

    private final Setting<Boolean> hideVanillaHud = sgGeneral.add(new BoolSetting.Builder()
        .name("hide-vanilla-hud")
        .description("Also hides the game's own HUD: hotbar, health, chat, crosshair and the rest.")
        .defaultValue(false)
        .build()
    );

    private final Setting<Boolean> hideHands = sgGeneral.add(new BoolSetting.Builder()
        .name("hide-hands")
        .description("Also hides your first-person hands and what they hold, including a totem in the off hand.")
        .defaultValue(true)
        .build()
    );

    private final Setting<Boolean> hideTotemAnimation = sgGeneral.add(new BoolSetting.Builder()
        .name("hide-totem-animation")
        .description("Also hides the totem that flies up the screen when it saves you.")
        .defaultValue(true)
        .build()
    );

    public HudHider() {
        super(OnFocusAddon.CATEGORY, "hud-hider", "Hides the HUD of all cheats and mods while active. Bind it to a key to switch the HUD on and off.");
        // A chat line on every press would put back on screen what the bind just hid.
        chatFeedback = false;
    }

    @Override
    public void onActivate() {
        HudHiding.setModule(this);
    }

    @Override
    public void onDeactivate() {
        HudHiding.setModule(null);
    }

    public boolean keepNametags() {
        return keepNametags.get();
    }

    public boolean hideVanillaHud() {
        return hideVanillaHud.get();
    }

    public boolean hideHands() {
        return hideHands.get();
    }

    public boolean hideTotemAnimation() {
        return hideTotemAnimation.get();
    }
}
