package dev.onfocus.addon.explore;

import net.minecraft.client.network.ClientPlayerEntity;
import net.minecraft.util.math.MathHelper;

import java.util.ArrayList;
import java.util.List;

/**
 * Flies through a list of points in order by turning the camera towards the next one. The flying
 * itself is left to whatever elytra fly module is running in a look-direction mode.
 */
public class WaypointFollower {
    /** A point to fly through, in block coordinates. {@code sweep}: the leg ending here runs along a strip. */
    public record Point(double x, double z, boolean sweep) {}

    private final List<Point> route = new ArrayList<>();
    private int index;
    // Where the current leg started, to tell when the point has been flown past
    private double fromX, fromZ;
    /** Length of the legs after the current one. */
    private double tail;

    public void setRoute(List<Point> points, double x, double z) {
        route.clear();
        route.addAll(points);
        index = 0;
        fromX = x;
        fromZ = z;
        tail = 0;
        for (int i = 1; i < route.size(); i++) tail += distance(route.get(i - 1), route.get(i));
    }

    public void clear() {
        route.clear();
        index = 0;
        tail = 0;
    }

    public boolean isDone() {
        return index >= route.size();
    }

    public int pointIndex() {
        return index;
    }

    public int pointCount() {
        return route.size();
    }

    public Point current() {
        return isDone() ? null : route.get(index);
    }

    /** The point the current leg comes from, or null on the first leg. */
    public Point previous() {
        return index > 0 && index <= route.size() ? route.get(index - 1) : null;
    }

    /** Starts the current leg over from (x, z): after a pause the player may be anywhere. */
    public void restartLeg(double x, double z) {
        fromX = x;
        fromZ = z;
    }

    /**
     * Moves on to the next point once the current one is close enough, or already behind along
     * the leg's direction. Returns the point just reached, or null.
     */
    public Point update(double x, double z, double arriveDistance) {
        if (isDone()) return null;
        Point target = route.get(index);
        double rx = target.x() - x, rz = target.z() - z;
        boolean close = rx * rx + rz * rz <= arriveDistance * arriveDistance;
        double dx = target.x() - fromX, dz = target.z() - fromZ;
        double legSquared = dx * dx + dz * dz;
        double cross = dx * rz - dz * rx;
        // Crossing the endpoint's plane far off to the side does not cover the waypoint.
        // A zero-length leg has no direction: it must be reached by distance alone.
        boolean passed = legSquared > 0 && dx * rx + dz * rz <= 0
            && cross * cross <= arriveDistance * arriveDistance * legSquared;
        if (!close && !passed) return null;

        skip(x, z);
        return target;
    }

    /** Moves on to the next point as if the current one was reached at (x, z). */
    public void skip(double x, double z) {
        if (isDone()) return;
        Point target = route.get(index++);
        if (!isDone()) tail -= distance(target, route.get(index));
        fromX = x;
        fromZ = z;
    }

    /** Blocks left to fly from (x, z) to the end of the route. */
    public double remainingDistance(double x, double z) {
        if (isDone()) return 0;
        Point target = route.get(index);
        return Math.hypot(target.x() - x, target.z() - z) + Math.max(0, tail);
    }

    /** Turns the player's yaw towards the current point by at most {@code maxStep} degrees. */
    public void steer(ClientPlayerEntity player, float maxStep) {
        Point target = current();
        if (target == null) return;
        double dx = target.x() - player.getX(), dz = target.z() - player.getZ();
        float desired = (float) (MathHelper.atan2(dz, dx) * MathHelper.DEGREES_PER_RADIAN) - 90f;
        float yaw = player.getYaw();
        player.setYaw(yaw + MathHelper.clamp(MathHelper.wrapDegrees(desired - yaw), -maxStep, maxStep));
    }

    private static double distance(Point a, Point b) {
        return Math.hypot(b.x() - a.x(), b.z() - a.z());
    }
}
