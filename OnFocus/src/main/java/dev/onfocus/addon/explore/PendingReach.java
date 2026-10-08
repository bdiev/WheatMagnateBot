package dev.onfocus.addon.explore;

/**
 * Rescan: a swath width measured in the middle of a strip waits for the strip's end. Re-planning
 * there and then turns back for a strip of the new spacing and leaves the rest of this one for a
 * later trip; coverage counts the chunks that came whatever the width, so nothing is lost by waiting.
 */
public final class PendingReach {
    private int width;

    /** The width waiting for the next strip, 0 for none. */
    public int width() { return width; }

    /** What the next window is measured against: the width waiting, else the current one. */
    public int target(int reach) { return width > 0 ? width : reach; }

    /**
     * A window measured on the strip: {@code measured} raw, {@code accepted} after the stability
     * check. Back at the current width drops what was waiting as a blip. True when a new width waits.
     */
    public boolean offer(int reach, int measured, int accepted) {
        int next = measured == reach || accepted == reach ? 0 : accepted;
        boolean changed = next != 0 && next != width;
        width = next;
        return changed;
    }

    /** The width to plan the next strip with; nothing waits after. */
    public int take(int reach) {
        int next = target(reach);
        width = 0;
        return next;
    }

    public void clear() { width = 0; }
}
