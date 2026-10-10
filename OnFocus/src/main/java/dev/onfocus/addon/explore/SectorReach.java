package dev.onfocus.addon.explore;

/**
 * Swath for Sectors mode. Auto starts one chunk inside the width the server is known to load,
 * drops straight to the safe minimum when a sector's own route leaves gaps, and widens again one
 * chunk at a time after a few sectors swept without any, up to one chunk less than the width that
 * failed. The value only changes between routes.
 */
public final class SectorReach {
    public static final int MIN = SectorPlanner.REACH;
    /** Gap-free sectors in a row before trying one chunk wider. */
    public static final int CLEAN_TO_WIDEN = 3;

    private int ceiling = MIN, current = MIN, clean;
    private boolean auto = true;

    /** {@code estimate}: swath expected from the view distance or learned before; {@code fixed} > 0 disables learning. */
    public void start(int estimate, int fixed) {
        auto = fixed <= 0;
        ceiling = auto ? Math.max(MIN, estimate - 1) : Math.max(1, fixed);
        current = ceiling;
        clean = 0;
    }

    public void restore(int ceiling, int current, int fixed) {
        auto = fixed <= 0;
        this.ceiling = auto ? Math.max(MIN, ceiling) : Math.max(1, fixed);
        this.current = auto ? Math.max(MIN, Math.min(current, this.ceiling)) : this.ceiling;
        clean = 0;
    }

    public int current() { return current; }
    public int ceiling() { return ceiling; }
    public boolean auto() { return auto; }

    /** A sector's sweep finished; {@code gaps} if its own route left chunks for cleanup. Returns true when the swath changed. */
    public boolean swept(boolean gaps) {
        if (!auto) return false;
        if (gaps) {
            clean = 0;
            if (current == MIN) return false;
            // That width is past what the server loads: never try it again this run
            ceiling = Math.max(MIN, current - 1);
            current = MIN;
            return true;
        }
        if (current >= ceiling || ++clean < CLEAN_TO_WIDEN) return false;
        clean = 0;
        current++;
        return true;
    }
}
