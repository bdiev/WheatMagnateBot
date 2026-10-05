package dev.onfocus.addon.modules;

import dev.onfocus.addon.OnFocusAddon;
import meteordevelopment.meteorclient.events.game.ReceiveMessageEvent;
import meteordevelopment.meteorclient.settings.DoubleSetting;
import meteordevelopment.meteorclient.settings.Setting;
import meteordevelopment.meteorclient.settings.SettingGroup;
import meteordevelopment.meteorclient.settings.SoundEventListSetting;
import meteordevelopment.meteorclient.systems.modules.Module;
import meteordevelopment.orbit.EventHandler;
import net.minecraft.sound.SoundCategory;
import net.minecraft.sound.SoundEvent;
import net.minecraft.sound.SoundEvents;

import java.util.List;
import java.util.regex.Pattern;

/**
 * Plays a sound whenever a chat line matching "&lt;player&gt; whispers: &lt;message&gt;" comes in,
 * so a whisper isn't missed while alt-tabbed or looking away. Whispers sent by the local player
 * themselves (same format, their own name) are ignored.
 */
public class WhisperNotifier extends Module {
    // Vanilla usernames are 1-16 chars of [A-Za-z0-9_] - anchoring on that (rather than just
    // splitting on the first space) keeps a chat message that merely contains " whispers: "
    // somewhere in its body from being mistaken for one.
    private static final Pattern WHISPER_PATTERN = Pattern.compile("^([A-Za-z0-9_]{1,16}) whispers: .+$", Pattern.DOTALL);

    private final SettingGroup sgGeneral = settings.getDefaultGroup();

    private final Setting<List<SoundEvent>> sound = sgGeneral.add(new SoundEventListSetting.Builder()
        .name("sound")
        .description("The sound to play. If you add more than one, the first one is used.")
        .defaultValue(SoundEvents.UI_TOAST_IN)
        .onChanged(sounds -> playSound(sounds.isEmpty() ? null : sounds.get(0)))
        .build()
    );

    private final Setting<Double> volume = sgGeneral.add(new DoubleSetting.Builder()
        .name("volume")
        .description("Volume of the notification sound.")
        .defaultValue(1.0)
        .range(0, 2)
        .sliderRange(0, 2)
        .build()
    );

    private final Setting<Double> pitch = sgGeneral.add(new DoubleSetting.Builder()
        .name("pitch")
        .description("Pitch of the notification sound.")
        .defaultValue(1.0)
        .range(0.5, 2)
        .sliderRange(0.5, 2)
        .build()
    );

    public WhisperNotifier() {
        super(OnFocusAddon.CATEGORY, "whisper-notifier", "Plays a sound when someone whispers to you.");
    }

    @EventHandler
    private void onReceiveMessage(ReceiveMessageEvent event) {
        if (mc.player == null) return;

        String text = event.getMessage().getString();
        if (!WHISPER_PATTERN.matcher(text).matches()) return;

        String sender = text.substring(0, text.indexOf(' '));
        if (sender.equalsIgnoreCase(mc.player.getGameProfile().getName())) return;

        List<SoundEvent> sounds = sound.get();
        playSound(sounds.isEmpty() ? SoundEvents.UI_TOAST_IN : sounds.get(0));
    }

    // Also used as an onChanged callback so picking a sound in the settings screen previews it immediately.
    private void playSound(SoundEvent chosen) {
        if (mc.player == null || chosen == null) return;

        mc.world.playSoundFromEntity(mc.player, mc.player, chosen, SoundCategory.MASTER, volume.get().floatValue(), pitch.get().floatValue());
    }
}
