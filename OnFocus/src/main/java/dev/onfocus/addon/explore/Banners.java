package dev.onfocus.addon.explore;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Set;

/**
 * Banners a player made, told from the ones generated structures put up. A banner is its base colour
 * and its layers, each a pattern and a colour by their ids ("creeper", "black"), in the order they
 * were put on. The generated ones are the designs in the game's own structure files.
 */
public final class Banners {
    private static final Set<String> GENERATED = Set.of(
        // End Cities
        key("magenta", List.of("triangle_top:black", "triangle_bottom:black")),
        // Woodland Mansions: banner rooms, altar rooms, master bedrooms
        key("gray", List.of()),
        key("black", List.of()),
        key("light_gray", List.of("flower:white")),
        // Savanna villages
        key("brown", List.of()),
        // The Ominous Banner: Pillager Outposts, raid and patrol captains
        key("white", List.of("rhombus:cyan", "stripe_bottom:light_gray", "stripe_center:gray", "border:light_gray",
            "stripe_middle:black", "half_horizontal:light_gray", "circle:light_gray", "border:black"))
    );

    private Banners() {
    }

    /** Whether the banner is one a structure generates with: not a player's. */
    public static boolean generated(String base, List<String> layers) {
        return GENERATED.contains(key(base, layers));
    }

    /** "Red Banner: black creeper, white border", "Lime Banner: plain" - in English whatever the game's language, for the site's search. */
    public static String describe(String base, List<String> layers) {
        List<String> parts = new ArrayList<>();
        for (String layer : layers) {
            int colon = layer.lastIndexOf(':');
            parts.add(words(layer.substring(colon + 1)) + " " + words(layer.substring(0, Math.max(colon, 0))));
        }
        String colour = words(base);
        String title = colour.isEmpty() ? "Banner" : Character.toUpperCase(colour.charAt(0)) + capitalizeRest(colour) + " Banner";
        return title + ": " + (parts.isEmpty() ? "plain" : String.join(", ", parts));
    }

    private static String key(String base, List<String> layers) {
        return base + "|" + String.join(",", layers);
    }

    private static String words(String id) {
        return id.replace('_', ' ').toLowerCase(Locale.ROOT).strip();
    }

    /** "light gray" -> "ight Gray": every later word capitalized too. */
    private static String capitalizeRest(String words) {
        StringBuilder sb = new StringBuilder();
        for (int i = 1; i < words.length(); i++) {
            char c = words.charAt(i);
            sb.append(words.charAt(i - 1) == ' ' ? Character.toUpperCase(c) : c);
        }
        return sb.toString();
    }
}
