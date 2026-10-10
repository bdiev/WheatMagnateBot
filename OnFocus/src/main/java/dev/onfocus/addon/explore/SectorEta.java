package dev.onfocus.addon.explore;

import java.util.ArrayDeque;
import java.util.Deque;

/**
 * Time left in Sectors mode from finished sectors: each took a fixed part (getting there, checks,
 * exits) plus a part per chunk it still had to cover. Fitted over the recent sectors and applied
 * to every sector left, it holds steadier over a large selection than a rolling coverage rate.
 */
public final class SectorEta {
    public static final int MIN_SECTORS = 3;
    private static final int WINDOW = 24;

    private record Job(double seconds, long chunks) {}

    private final Deque<Job> jobs = new ArrayDeque<>();

    public void reset() {
        jobs.clear();
    }

    /** One sector finished after {@code seconds} of flight, with {@code chunks} unconfirmed when it began. */
    public void finished(double seconds, long chunks) {
        if (chunks <= 0 || seconds <= 0) return; // crossed only: not a measure of work
        jobs.addLast(new Job(seconds, chunks));
        while (jobs.size() > WINDOW) jobs.removeFirst();
    }

    public int sectors() {
        return jobs.size();
    }

    /** Seconds for the remaining sectors' unconfirmed chunks, or -1 until enough sectors are finished. */
    public double secondsLeft(long[] remaining) {
        if (jobs.size() < MIN_SECTORS) return -1;
        double n = jobs.size(), sumX = 0, sumY = 0, sumXX = 0, sumXY = 0;
        for (Job job : jobs) {
            sumX += job.chunks();
            sumY += job.seconds();
            sumXX += (double) job.chunks() * job.chunks();
            sumXY += job.chunks() * job.seconds();
        }
        double variance = n * sumXX - sumX * sumX;
        double perChunk = sumY / sumX, fixed = 0;
        if (variance > 1e-9 * n * sumXX) {
            double slope = (n * sumXY - sumX * sumY) / variance;
            double intercept = (sumY - slope * sumX) / n;
            // A negative part would mean noise, not a cheaper sector: keep the plain ratio then
            if (slope > 0 && intercept >= 0) {
                perChunk = slope;
                fixed = intercept;
            }
        }
        double total = 0;
        for (long chunks : remaining) if (chunks > 0) total += fixed + perChunk * chunks;
        return total;
    }
}
