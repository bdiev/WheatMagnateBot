package dev.onfocus.addon.explore;

/** Remove resource-pack decoration from find names, preserving ordinary readable text. */
public final class FindNames {
    private FindNames() {}

    public static String clean(String name) {
        if (name == null) return "";
        return name.replaceAll("§.?", "").replaceAll("\\p{Co}", "")
            .replaceAll("\\(\\s*\\)|\\[\\s*\\]", "").replaceAll("\\s+", " ").strip();
    }
}
