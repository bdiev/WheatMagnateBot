package dev.onfocus.addon.baritone;

import baritone.api.BaritoneAPI;
import baritone.api.utils.BetterBlockPos;
import baritone.api.process.IElytraProcess;
import baritone.process.ElytraProcess;
import baritone.process.elytra.ElytraBehavior;
import dev.onfocus.addon.OnFocusAddon;
import dev.onfocus.addon.mixin.baritone.ElytraBehaviorAccessor;
import dev.onfocus.addon.mixin.baritone.ElytraPathManagerAccessor;
import dev.onfocus.addon.mixin.baritone.ElytraProcessAccessor;
import net.minecraft.util.math.BlockPos;

import java.util.OptionalInt;

/**
 * The only place in this addon that references {@code baritone.api} types directly. Those
 * classes only exist on the classpath if the separate Baritone mod is actually installed, so
 * every call in here must be behind {@code BaritoneUtils.IS_AVAILABLE} - the JVM only resolves
 * this class's constant pool references lazily, the first time one of these methods actually
 * runs, so keeping that guard at the call site (never in here) is what keeps this safe to load
 * without Baritone present. Mirrors how Meteor's own BaritonePathManager is instantiated only
 * when Baritone is detected.
 */
public final class BaritoneElytraBridge {
    private static boolean retargetFailureLogged;

    private BaritoneElytraBridge() {
    }

    private static IElytraProcess process() {
        return BaritoneAPI.getProvider().getPrimaryBaritone().getElytraProcess();
    }

    /** Whether Baritone's native elytra pathfinding library loaded on this system. */
    public static boolean isSupported() {
        return process().isLoaded();
    }

    /**
     * elytraAutoJump defaults to false in Baritone, meaning the elytra process just sits idle
     * (state stuck at START_FLYING) if the player is on the ground instead of walking to a ledge
     * and jumping off for you. Without this, calling pathTo() while grounded does nothing visible.
     */
    public static void ensureAutoTakeoffEnabled() {
        BaritoneAPI.getSettings().elytraAutoJump.value = true;
    }

    /** Starts (or redirects) a real Baritone elytra flight towards the given destination. Nether-only; a no-op elsewhere. */
    public static void pathTo(BlockPos destination) {
        process().pathTo(destination);
    }

    /** Whether the elytra process currently has an active destination. */
    public static boolean isTraveling() {
        return process().currentDestination() != null;
    }

    /**
     * Baritone replaces the requested destination with its own landing spot when a partial
     * elytra path ends. This lets Trail Explorer notice that takeover before the player lands.
     */
    public static BlockPos currentDestination() {
        return process().currentDestination();
    }

    /**
     * Extends a live flight on its existing native context. Calling IElytraProcess.pathTo again
     * destroys that context asynchronously and can crash nether-pathfinder.dll when done often.
     */
    public static boolean retargetSafely(BlockPos destination) {
        try {
            IElytraProcess apiProcess = process();
            if (!(apiProcess instanceof ElytraProcess concrete)) return false;

            ElytraBehavior behavior = ((ElytraProcessAccessor) concrete).onfocus$getBehavior();
            if (behavior == null) return false;

            // These classes are final in Baritone's jar; the Object hop tells javac about the
            // interfaces which Mixin adds at runtime.
            ElytraBehaviorAccessor behaviorAccess = (ElytraBehaviorAccessor) (Object) behavior;
            ElytraBehavior.PathManager pathManager = behaviorAccess.onfocus$getPathManager();
            ElytraPathManagerAccessor pathAccess = (ElytraPathManagerAccessor) (Object) pathManager;
            if (pathAccess.onfocus$getPath().isEmpty() || pathAccess.onfocus$isRecalculating()) return false;

            behaviorAccess.onfocus$setDestination(new BetterBlockPos(destination));
            pathAccess.onfocus$recalculate(OptionalInt.empty());
            return true;
        } catch (RuntimeException | LinkageError error) {
            if (!retargetFailureLogged) {
                retargetFailureLogged = true;
                OnFocusAddon.LOG.error("Unable to extend Baritone's live elytra route; falling back to land-and-resume", error);
            }
            return false;
        }
    }

    /**
     * Baritone lands on its own (elytraAllowEmergencyLand, on by default) once you have fewer
     * than this many fireworks left, regardless of how far the destination is. Defaults to 5.
     */
    public static int getMinFireworksBeforeLanding() {
        return BaritoneAPI.getSettings().elytraMinFireworksBeforeLanding.value;
    }
}
