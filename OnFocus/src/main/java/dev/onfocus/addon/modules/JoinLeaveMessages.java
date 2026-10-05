package dev.onfocus.addon.modules;

import dev.onfocus.addon.OnFocusAddon;
import meteordevelopment.meteorclient.events.game.ReceiveMessageEvent;
import meteordevelopment.meteorclient.settings.BoolSetting;
import meteordevelopment.meteorclient.settings.EnumSetting;
import meteordevelopment.meteorclient.settings.GenericSetting;
import meteordevelopment.meteorclient.settings.Setting;
import meteordevelopment.meteorclient.settings.SettingGroup;
import meteordevelopment.meteorclient.systems.modules.Module;
import meteordevelopment.orbit.EventHandler;
import net.minecraft.text.Text;
import net.minecraft.text.TranslatableTextContent;

import java.util.Iterator;
import java.util.LinkedHashSet;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Hides (or shows exclusively) the "joined the game" / "left the game" chat lines for chosen
 * players. Vanilla sends these as translatable text, so they're recognised by translation key
 * first - that works whatever language the client is set to. Servers that send the line as plain
 * text are caught by an English "&lt;name&gt; joined/left" pattern instead.
 */
public class JoinLeaveMessages extends Module {
    public enum Mode {
        HideSelected,
        ShowOnlySelected
    }

    private static final String KEY_JOINED = "multiplayer.player.joined";
    private static final String KEY_JOINED_RENAMED = "multiplayer.player.joined.renamed";
    private static final String KEY_LEFT = "multiplayer.player.left";

    // Vanilla usernames are 1-16 chars of [A-Za-z0-9_]; anchoring on that keeps an ordinary chat
    // message like "<Name> I left the game" from matching.
    private static final Pattern TEXT_PATTERN = Pattern.compile("^([A-Za-z0-9_]{1,16})(?: \\(formerly known as [A-Za-z0-9_]{1,16}\\))? (joined|left)(?: the game)?\\.?$");

    private static final int RECENT_LIMIT = 50;

    /**
     * Names seen in join/leave messages while the module is on, oldest first. The player picker
     * lists these alongside online players, so someone who keeps rejoining can still be picked
     * while they happen to be offline.
     */
    public static final Set<String> RECENT = new LinkedHashSet<>();

    private final SettingGroup sgGeneral = settings.getDefaultGroup();

    private final Setting<Mode> mode = sgGeneral.add(new EnumSetting.Builder<Mode>()
        .name("mode")
        .description("Hide messages for the selected players, or hide everyone's except the selected players'.")
        .defaultValue(Mode.HideSelected)
        .build()
    );

    private final Setting<BlockedPlayers> players = sgGeneral.add(new GenericSetting.Builder<BlockedPlayers>()
        .name("players")
        .description("Players whose join/leave messages this applies to.")
        .defaultValue(new BlockedPlayers())
        .build()
    );

    private final Setting<Boolean> joins = sgGeneral.add(new BoolSetting.Builder()
        .name("joins")
        .description("Apply to join messages.")
        .defaultValue(true)
        .build()
    );

    private final Setting<Boolean> leaves = sgGeneral.add(new BoolSetting.Builder()
        .name("leaves")
        .description("Apply to leave messages.")
        .defaultValue(true)
        .build()
    );

    public JoinLeaveMessages() {
        super(OnFocusAddon.CATEGORY, "join-leave-messages", "Toggles join/leave chat messages for chosen players.");
    }

    @EventHandler
    private void onReceiveMessage(ReceiveMessageEvent event) {
        Text message = event.getMessage();

        String name;
        boolean joined;

        if (message.getContent() instanceof TranslatableTextContent translatable
            && (translatable.getKey().equals(KEY_JOINED) || translatable.getKey().equals(KEY_JOINED_RENAMED) || translatable.getKey().equals(KEY_LEFT))
            && translatable.getArgs().length > 0) {
            Object arg = translatable.getArgs()[0];
            name = arg instanceof Text text ? text.getString() : String.valueOf(arg);
            joined = !translatable.getKey().equals(KEY_LEFT);
        }
        else {
            Matcher matcher = TEXT_PATTERN.matcher(message.getString());
            if (!matcher.matches()) return;

            name = matcher.group(1);
            joined = matcher.group(2).equals("joined");
        }

        rememberRecent(name);

        if (joined ? !joins.get() : !leaves.get()) return;

        boolean selected = containsIgnoreCase(players.get().names, name);
        if (selected == (mode.get() == Mode.HideSelected)) event.setCancelled(true);
    }

    private static void rememberRecent(String name) {
        // Re-inserting moves the name to the end, so the cap drops whoever was seen longest ago.
        RECENT.remove(name);
        RECENT.add(name);

        Iterator<String> it = RECENT.iterator();
        while (RECENT.size() > RECENT_LIMIT) {
            it.next();
            it.remove();
        }
    }

    private static boolean containsIgnoreCase(Set<String> names, String name) {
        for (String n : names) {
            if (n.equalsIgnoreCase(name)) return true;
        }

        return false;
    }
}
