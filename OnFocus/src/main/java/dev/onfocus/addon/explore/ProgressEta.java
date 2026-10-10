package dev.onfocus.addon.explore;

import java.util.ArrayDeque;

/** Recent confirmed coverage per active wall-clock second, excluding map imports and pauses. */
public final class ProgressEta {
    private record Sample(double seconds, long chunks) {}
    private final ArrayDeque<Sample> samples = new ArrayDeque<>();
    private long lastNanos, lastExplored, gained;
    private double seconds;
    private boolean active;
    private int stage = -1;

    public void reset() {
        samples.clear();
        lastNanos = lastExplored = gained = 0;
        seconds = 0;
        active = false;
        stage = -1;
    }

    public void observe(long now, long explored, boolean enabled, int phase) {
        if (phase != stage) {
            reset();
            stage = phase;
        }
        if (enabled && active && now >= lastNanos && explored >= lastExplored) {
            seconds += (now - lastNanos) / 1_000_000_000.0;
            gained += explored - lastExplored;
        }
        lastNanos = now;
        lastExplored = explored;
        active = enabled;
        if (!enabled) return;
        if (samples.isEmpty() || seconds - samples.getLast().seconds() >= 1) {
            samples.addLast(new Sample(seconds, gained));
            while (samples.size() > 1 && seconds - samples.getFirst().seconds() > 180) samples.removeFirst();
        }
    }

    /** A sector job includes sweep, settling and cleanup in one throughput window. */
    public void observe(long now, long explored, boolean enabled, int phase, boolean continuous) {
        observe(now, explored, enabled, continuous ? Integer.MIN_VALUE : phase);
    }

    public double chunksPerSecond() {
        if (samples.size() < 2) return -1;
        Sample first = samples.getFirst(), last = samples.getLast();
        double elapsed = last.seconds() - first.seconds();
        long covered = last.chunks() - first.chunks();
        return elapsed >= 30 ? covered / elapsed : -1;
    }

    public int secondsLeft(long missing) {
        if (missing <= 0) return 0;
        double rate = chunksPerSecond();
        return rate > 0 ? (int) Math.min(Integer.MAX_VALUE, Math.ceil(missing / rate)) : -1;
    }
}
