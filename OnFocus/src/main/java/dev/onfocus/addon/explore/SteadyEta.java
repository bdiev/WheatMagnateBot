package dev.onfocus.addon.explore;

/**
 * Keeps a shown time-left steady: it counts down with active time and drifts towards fresh
 * estimates over a couple of minutes, so one noisy reading can't swing it from 20 minutes to 2 hours.
 */
public final class SteadyEta {
    /** Time constant of the drift towards a new estimate, in active seconds. */
    static final double SETTLE_SECONDS = 120;

    private double shown = -1;
    private long lastNanos;
    private boolean active;
    private int stage = -1;

    public void reset() {
        shown = -1;
        lastNanos = 0;
        active = false;
        stage = -1;
    }

    /** Feeds a raw estimate in seconds (-1 if unknown); only time while enabled counts down. */
    public void observe(long now, int raw, boolean enabled, int phase) {
        if (phase != stage) {
            reset();
            stage = phase;
        }
        double dt = enabled && active && now >= lastNanos ? (now - lastNanos) / 1_000_000_000.0 : 0;
        lastNanos = now;
        active = enabled;
        if (raw == 0) {
            shown = 0;
            return;
        }
        if (shown >= 0) shown = Math.max(0, shown - dt);
        if (raw < 0) return;
        if (shown < 0) {
            shown = raw;
            return;
        }
        shown += (raw - shown) * (1 - Math.exp(-dt / SETTLE_SECONDS));
    }

    /** The steady estimate in seconds, or -1 before any estimate. */
    public int secondsLeft() {
        return shown < 0 ? -1 : (int) Math.ceil(shown);
    }
}
