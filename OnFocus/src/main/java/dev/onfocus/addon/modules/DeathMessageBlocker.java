package dev.onfocus.addon.modules;

import dev.onfocus.addon.OnFocusAddon;
import meteordevelopment.meteorclient.events.game.ReceiveMessageEvent;
import meteordevelopment.meteorclient.settings.BoolSetting;
import meteordevelopment.meteorclient.settings.GenericSetting;
import meteordevelopment.meteorclient.settings.Setting;
import meteordevelopment.meteorclient.settings.SettingGroup;
import meteordevelopment.meteorclient.systems.modules.Module;
import meteordevelopment.orbit.EventHandler;

import java.util.ArrayDeque;
import java.util.Deque;
import java.util.Locale;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * Hides death messages for chosen players from chat. Detection is text-based: a chat line counts
 * as a death message when it starts with "&lt;blocked name&gt; " (which rules out the "&lt;Name&gt; ..."
 * bracketed format normal chat uses) and the rest of the line contains one of the fixed phrases
 * vanilla's death messages are built from - this covers vanilla-style deaths but won't catch a
 * heavily custom death message format from a server plugin. Extra wordings can be added without
 * touching code via the "custom-phrases" editor in the module settings (matched case-insensitively), which also
 * offers recent unhidden lines from selected players to pick phrases from.
 */
public class DeathMessageBlocker extends Module {
    /** A chat line from a selected player that no phrase matched; {@code rest} is the text after the name. */
    public record UnmatchedLine(String text, String rest) {}

    private static final int RECENT_UNMATCHED_LIMIT = 20;

    /** Latest unmatched lines (oldest first), shown in {@link DeathPhrasesScreen} to pick phrases from. */
    public static final Deque<UnmatchedLine> RECENT_UNMATCHED = new ArrayDeque<>();

    private static final String[] DEATH_PHRASES = {
        "was slain by", "was shot by", "was fireballed by", "was pummeled by", "was impaled by",
        "was impaled on", "was smashed by", "was doomed to fall", "was killed", "died",
        "drowned", "blew up", "was blown up by", "hit the ground too hard", "fell from a high place",
        "fell off", "fell out of the world", "fell while climbing", "left the confines of this world",
        "went up in flames", "burned to death", "was burned to a crisp", "walked into fire",
        "walked into a cactus", "was pricked to death", "tried to swim in lava",
        "discovered floor was lava", "walked into the danger zone", "was struck by lightning",
        "starved to death", "suffocated in a wall", "was squashed", "was skewered by a falling stalactite",
        "was poked to death by a sweet berry bush", "was stung to death", "froze to death",
        "was frozen to death by", "withered away", "went off with a bang", "experienced kinetic energy",
        "was obliterated by a sonically-charged shriek", "didn't want to live in the same world",
        "was roasted in dragon breath", "died from dehydration",

        // Seen on this server's custom death-message plugin, not vanilla wording.
        "killed themselves", "was ganed up on by", "was ganged up on by",
        "tried climbing to greater heights", "tried playing with", "armor with thorns"
    };

    // Chat timestamp prefix like "[18:04] " (Meteor's BetterChat or the server) - stripped before
    // reading the player name, otherwise the first word is the timestamp and nothing matches.
    private static final Pattern TIMESTAMP_PREFIX = Pattern.compile("^\\s*[\\[<(]\\d{1,2}:\\d{2}(?::\\d{2})?[\\]>)]\\s*");

    private final SettingGroup sgGeneral = settings.getDefaultGroup();

    private final Setting<BlockedPlayers> blockedPlayers = sgGeneral.add(new GenericSetting.Builder<BlockedPlayers>()
        .name("blocked-players")
        .description("Death messages for these players won't show in chat.")
        .defaultValue(new BlockedPlayers())
        .build()
    );

    private final Setting<DeathPhrases> customPhrases = sgGeneral.add(new GenericSetting.Builder<DeathPhrases>()
        .name("custom-phrases")
        .description("Extra death-message phrases to hide. Case-insensitive, matched anywhere after the player name. The editor lists recent unhidden lines to pick phrases from.")
        .defaultValue(new DeathPhrases())
        .build()
    );

    private final Setting<Boolean> builtInPhrases = sgGeneral.add(new BoolSetting.Builder()
        .name("built-in-phrases")
        .description("Also use the built-in list of vanilla and known server death phrases.")
        .defaultValue(true)
        .build()
    );

    private final Setting<Boolean> showUnmatched = sgGeneral.add(new BoolSetting.Builder()
        .name("show-unmatched")
        .description("Prints a hint for lines that start with a selected player's name but matched no phrase - handy for finding wordings to add to custom-phrases.")
        .defaultValue(false)
        .build()
    );

    public DeathMessageBlocker() {
        super(OnFocusAddon.CATEGORY, "death-message-blocker", "Hides death messages for chosen players from chat.");
    }

    @EventHandler
    private void onReceiveMessage(ReceiveMessageEvent event) {
        Set<String> names = blockedPlayers.get().names;
        if (names.isEmpty()) return;

        String text = TIMESTAMP_PREFIX.matcher(event.getMessage().getString()).replaceFirst("");

        int spaceIndex = text.indexOf(' ');
        if (spaceIndex <= 0) return;

        String name = text.substring(0, spaceIndex);
        if (!names.contains(name)) return;

        String rest = text.substring(spaceIndex + 1).toLowerCase(Locale.ROOT);

        if (builtInPhrases.get()) {
            for (String phrase : DEATH_PHRASES) {
                if (rest.contains(phrase)) {
                    event.setCancelled(true);
                    return;
                }
            }
        }

        for (String phrase : customPhrases.get().phrases) {
            String needle = phrase.trim().toLowerCase(Locale.ROOT);
            if (!needle.isEmpty() && rest.contains(needle)) {
                event.setCancelled(true);
                return;
            }
        }

        rememberUnmatched(new UnmatchedLine(text, text.substring(spaceIndex + 1)));
        if (showUnmatched.get()) info("Not hidden (no phrase matched): %s", text);
    }

    private static void rememberUnmatched(UnmatchedLine line) {
        RECENT_UNMATCHED.removeIf(existing -> existing.text().equals(line.text()));
        RECENT_UNMATCHED.addLast(line);
        while (RECENT_UNMATCHED.size() > RECENT_UNMATCHED_LIMIT) RECENT_UNMATCHED.removeFirst();
    }

    /**
     * Guesses the fixed part of a death message: everything up to and including the first " by "
     * (the killer's name usually follows it), otherwise the whole text. The user can trim it further.
     */
    public static String suggestPhrase(String rest) {
        String trimmed = rest.trim();
        int by = trimmed.toLowerCase(Locale.ROOT).indexOf(" by ");
        return by >= 0 ? trimmed.substring(0, by + 3) : trimmed;
    }
}
