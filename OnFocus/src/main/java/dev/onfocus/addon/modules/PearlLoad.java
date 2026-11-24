package dev.onfocus.addon.modules;

import dev.onfocus.addon.OnFocusAddon;
import meteordevelopment.meteorclient.events.game.ReceiveMessageEvent;
import meteordevelopment.meteorclient.settings.Setting;
import meteordevelopment.meteorclient.settings.SettingGroup;
import meteordevelopment.meteorclient.settings.StringSetting;
import meteordevelopment.meteorclient.systems.modules.Module;
import meteordevelopment.meteorclient.utils.player.ChatUtils;
import meteordevelopment.orbit.EventHandler;
import net.minecraft.sound.SoundCategory;
import net.minecraft.sound.SoundEvents;

import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Two-press Pearl Loader request. The first press (turning the module on) whispers
 * "load" to the WheatMagnate bot and waits. When the loader account whispers that it
 * is at the pearl (its ready prompts all ask for a "/r ..." answer), a sound plays and
 * the second press (turning the module off) answers "/r yes". Pressing again before the
 * loader is ready only stops waiting. The module also turns itself off when the loader
 * or WheatMagnate reports that the request ended.
 */
public class PearlLoad extends Module {
    private static final Pattern WHISPER_PATTERN = Pattern.compile("^([A-Za-z0-9_]{1,16}) whispers: (.+)$", Pattern.DOTALL);
    private static final Pattern READY_PROMPT = Pattern.compile("\"/r [a-z]+\"", Pattern.CASE_INSENSITIVE);

    private final SettingGroup sgGeneral = settings.getDefaultGroup();

    private final Setting<String> botName = sgGeneral.add(new StringSetting.Builder()
        .name("bot-name")
        .description("The bot that takes the \"load\" whisper.")
        .defaultValue("WheatMagnate")
        .build()
    );

    private final Setting<String> loaderName = sgGeneral.add(new StringSetting.Builder()
        .name("loader-name")
        .description("The bot account that goes to your pearl and asks whether you are ready.")
        .defaultValue("2kk4")
        .build()
    );

    private boolean ready;
    // Set when the module turns itself off, so that turning off sends nothing
    private boolean finished;

    public PearlLoad() {
        super(OnFocusAddon.CATEGORY, "pearl-load", "First press whispers \"load\" to WheatMagnate; once the loader is ready, the second press answers \"/r yes\".");
    }

    @Override
    public void onActivate() {
        ready = false;
        finished = false;
        if (mc.player == null || mc.getNetworkHandler() == null) {
            error("Not connected to a server.");
            finish();
            return;
        }
        ChatUtils.sendPlayerMsg("/w " + botName.get().trim() + " load");
        info("Load requested. Waiting for %s to be ready...", loaderName.get().trim());
    }

    @Override
    public void onDeactivate() {
        if (finished) return;
        if (ready && mc.player != null && mc.getNetworkHandler() != null) {
            ChatUtils.sendPlayerMsg("/r yes");
            info("Confirmed: /r yes");
        } else {
            info("Stopped waiting for the loader.");
        }
        ready = false;
    }

    @EventHandler
    private void onReceiveMessage(ReceiveMessageEvent event) {
        if (mc.player == null) return;

        Matcher whisper = WHISPER_PATTERN.matcher(event.getMessage().getString());
        if (!whisper.matches()) return;
        String sender = whisper.group(1);
        String text = whisper.group(2).trim();
        String lower = text.toLowerCase(Locale.ROOT);

        if (sender.equalsIgnoreCase(loaderName.get().trim())) {
            if (!ready && READY_PROMPT.matcher(text).find()) {
                ready = true;
                info("%s is ready - press again to answer /r yes.", sender);
                mc.world.playSoundFromEntity(mc.player, mc.player, SoundEvents.UI_TOAST_IN, SoundCategory.MASTER, 1f, 1f);
            } else if (lower.contains("not set") || lower.contains("leaving")) {
                info("The loader ended the request.");
                finish();
            }
        } else if (sender.equalsIgnoreCase(botName.get().trim())) {
            if (lower.contains("not configured") || lower.contains("unavailable") || lower.contains("queue is full")
                || lower.contains("expired") || lower.contains("not set")) {
                info("The request ended.");
                finish();
            }
        }
    }

    private void finish() {
        finished = true;
        ready = false;
        if (isActive()) toggle();
    }
}
