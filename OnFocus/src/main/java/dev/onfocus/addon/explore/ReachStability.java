package dev.onfocus.addon.explore;

/** Reduce coverage immediately; widen only after three consecutive measurement windows agree. */
public final class ReachStability {
    private int candidate, windows;

    public void reset() { candidate = windows = 0; }

    public int update(int current, int measured) {
        if (measured <= current) {
            reset();
            return measured;
        }
        if (candidate != measured) {
            candidate = measured;
            windows = 0;
        }
        if (++windows < 3) return current;
        reset();
        return measured;
    }
}
