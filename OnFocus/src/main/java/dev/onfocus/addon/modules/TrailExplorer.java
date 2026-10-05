package dev.onfocus.addon.modules;

import dev.onfocus.addon.OnFocusAddon;
import dev.onfocus.addon.baritone.BaritoneElytraBridge;
import it.unimi.dsi.fastutil.longs.Long2ObjectMap;
import it.unimi.dsi.fastutil.longs.Long2ObjectOpenHashMap;
import it.unimi.dsi.fastutil.longs.LongOpenHashSet;
import it.unimi.dsi.fastutil.longs.LongSet;
import meteordevelopment.meteorclient.events.world.ChunkDataEvent;
import meteordevelopment.meteorclient.events.world.TickEvent;
import meteordevelopment.meteorclient.pathing.BaritoneUtils;
import meteordevelopment.meteorclient.pathing.NopPathManager;
import meteordevelopment.meteorclient.pathing.PathManagers;
import meteordevelopment.meteorclient.settings.*;
import meteordevelopment.meteorclient.systems.modules.Module;
import meteordevelopment.meteorclient.systems.modules.Modules;
import meteordevelopment.meteorclient.systems.waypoints.Waypoint;
import meteordevelopment.meteorclient.systems.waypoints.Waypoints;
import meteordevelopment.meteorclient.utils.Utils;
import meteordevelopment.meteorclient.utils.player.FindItemResult;
import meteordevelopment.meteorclient.utils.player.InvUtils;
import meteordevelopment.meteorclient.utils.player.PlayerUtils;
import meteordevelopment.meteorclient.utils.world.Dimension;
import meteordevelopment.orbit.EventHandler;
import net.minecraft.block.Block;
import net.minecraft.block.Blocks;
import net.minecraft.entity.EquipmentSlot;
import net.minecraft.item.ItemStack;
import net.minecraft.item.Items;
import net.minecraft.network.packet.c2s.play.ClientCommandC2SPacket;
import net.minecraft.util.math.BlockPos;
import net.minecraft.util.math.ChunkPos;
import net.minecraft.util.math.Direction;
import net.minecraft.util.math.MathHelper;
import net.minecraft.util.math.Vec3d;
import net.minecraft.world.chunk.Chunk;

import java.util.ArrayDeque;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Flies, walks (Baritone) or - in the Nether, with an elytra equipped - cruises via Baritone's
 * real elytra process to find the border between "old" chunks (generated before some past
 * version) and "new" ones (generated or upgraded since), then follows that border using a
 * right-hand wall-following rule, dropping waypoints along the way.
 * <p>
 * Chunks are told apart the same way XaeroPlus's OldChunks feature does: by scanning for blocks
 * that only exist in newer worldgen (Caves & Cliffs ore/stone types in the Overworld, Nether
 * Update blocks in the Nether). A chunk with several of those is "new"; one without is "old".
 * This works in any dimension, unlike a world-height check, which is Overworld-only and useless
 * on worlds whose height was never extended.
 */
public class TrailExplorer extends Module {
    private static final double ARRIVE_DIST = 3.0;
    private static final double PORTAL_ARRIVE_DIST = 5.0;
    private static final int SEARCH_HOP = 48;
    private static final int ELYTRA_SEARCH_HOP = 200;
    private static final int MODERN_BLOCK_THRESHOLD = 5;
    private static final int MIN_BORDER_REGION_CHUNKS = 12;
    private static final int ELYTRA_RETARGET_COOLDOWN_TICKS = 30;
    private static final int ELYTRA_STALL_CHECK_TICKS = 120;
    private static final double ELYTRA_STALL_MIN_MOVEMENT = 6.0;
    private static final int ELYTRA_NATIVE_SHUTDOWN_GRACE_TICKS = 60;
    private static final int ELYTRA_NAVIGATION_DISTANCE = 800;
    private static final int ELYTRA_TARGET_MAX_VERTICAL_ADJUSTMENT = 16;
    private static final int[][] ELYTRA_TARGET_OFFSETS = {
        {0, 0}, {-3, 0}, {3, 0}, {0, -3}, {0, 3},
        {-6, 0}, {6, 0}, {0, -6}, {0, 6},
        {-3, -3}, {-3, 3}, {3, -3}, {3, 3}
    };
    private static final Direction[] HORIZONTALS = {Direction.NORTH, Direction.SOUTH, Direction.WEST, Direction.EAST};

    private static final Set<Block> OVERWORLD_MODERN_BLOCKS = Set.of(
        Blocks.COPPER_ORE, Blocks.DEEPSLATE_COPPER_ORE, Blocks.AMETHYST_BLOCK, Blocks.SMOOTH_BASALT,
        Blocks.TUFF, Blocks.KELP, Blocks.KELP_PLANT, Blocks.POINTED_DRIPSTONE, Blocks.DRIPSTONE_BLOCK,
        Blocks.DEEPSLATE, Blocks.AZALEA, Blocks.BIG_DRIPLEAF, Blocks.BIG_DRIPLEAF_STEM, Blocks.SMALL_DRIPLEAF,
        Blocks.MOSS_BLOCK, Blocks.CAVE_VINES, Blocks.CAVE_VINES_PLANT
    );

    private static final Set<Block> NETHER_MODERN_BLOCKS = Set.of(
        Blocks.ANCIENT_DEBRIS, Blocks.BLACKSTONE, Blocks.BASALT, Blocks.CRIMSON_NYLIUM,
        Blocks.WARPED_NYLIUM, Blocks.NETHER_GOLD_ORE, Blocks.CHAIN
    );

    private final SettingGroup sgGeneral = settings.getDefaultGroup();
    private final SettingGroup sgWaypoints = settings.createGroup("Waypoints");

    private final Setting<Travel> mode = sgGeneral.add(new EnumSetting.Builder<Travel>()
        .name("mode")
        .description("How to move. Auto flies in Creative/Spectator, walks via Baritone otherwise, or cruises via Baritone's real elytra process if you're in the Nether with an elytra equipped.")
        .defaultValue(Travel.Auto)
        .build()
    );

    private final Setting<Boolean> elytraAutoTakeoff = sgGeneral.add(new BoolSetting.Builder()
        .name("elytra-auto-takeoff")
        .description("In Elytra mode, jumps, opens the elytra mid-air, and pops a firework to launch from flat ground - Baritone itself won't take off on its own unless you're already gliding or near a ledge.")
        .defaultValue(true)
        .build()
    );

    private final Setting<Double> flySpeed = sgGeneral.add(new DoubleSetting.Builder()
        .name("fly-speed")
        .description("Blocks per tick while flying.")
        .defaultValue(0.5)
        .range(0.05, 3)
        .sliderRange(0.05, 1.5)
        .build()
    );

    private final Setting<Integer> flyHeight = sgGeneral.add(new IntSetting.Builder()
        .name("fly-height")
        .description("The Y level to cruise at while flying or walking. In Elytra mode this is the climb target after takeoff (clamped below the world's roof) - without climbing there's often no room to glide, especially taking off low in the Nether.")
        .defaultValue(192)
        .range(-64, 320)
        .sliderRange(0, 320)
        .build()
    );

    private final Setting<Integer> searchExtendDistance = sgGeneral.add(new IntSetting.Builder()
        .name("search-lookahead")
        .description("Push the search target further out once you're within this many blocks of it, instead of waiting to actually arrive - keeps a real elytra glide from stalling out waiting to \"land\".")
        .defaultValue(25)
        .min(3)
        .sliderRange(3, 100)
        .build()
    );

    private final Setting<SearchDirection> searchDirection = sgGeneral.add(new EnumSetting.Builder<SearchDirection>()
        .name("search-direction")
        .description("Which way to head while looking for the border before one is found.")
        .defaultValue(SearchDirection.Current)
        .build()
    );

    private final Setting<Integer> elytraFollowLegChunks = sgGeneral.add(new IntSetting.Builder()
        .name("elytra-follow-leg-chunks")
        .description("In Elytra mode, the max border chunks to look ahead per flight leg (actual legs stop once search-lookahead blocks away, whichever comes first). Border chunks are only ~16 blocks apart - retargeting every single one makes Baritone think it arrived and land.")
        .defaultValue(8)
        .min(1)
        .sliderRange(1, 30)
        .build()
    );

    private final Setting<Integer> modernBlockThreshold = sgGeneral.add(new IntSetting.Builder()
        .name("modern-block-threshold")
        .description("How many newer-worldgen blocks a chunk needs to contain before it's classified as new.")
        .defaultValue(MODERN_BLOCK_THRESHOLD)
        .min(1)
        .sliderRange(1, 20)
        .build()
    );

    private final Setting<Integer> maxSteps = sgGeneral.add(new IntSetting.Builder()
        .name("max-steps")
        .description("Stop after following this many border chunks. 0 = unlimited.")
        .defaultValue(500)
        .range(0, 10000)
        .build()
    );

    private final Setting<Boolean> dropWaypoints = sgWaypoints.add(new BoolSetting.Builder()
        .name("drop-waypoints")
        .description("Drops a waypoint periodically while following the border.")
        .defaultValue(true)
        .build()
    );

    private final Setting<Integer> waypointEvery = sgWaypoints.add(new IntSetting.Builder()
        .name("waypoint-every")
        .description("Drop a waypoint every this many border chunks.")
        .defaultValue(5)
        .min(1)
        .sliderRange(1, 20)
        .visible(dropWaypoints::get)
        .build()
    );

    private final Setting<Boolean> notify = sgWaypoints.add(new BoolSetting.Builder()
        .name("notify")
        .description("Sends chat messages when the border is found, waypoints are dropped, and when stopping.")
        .defaultValue(true)
        .build()
    );

    private final Setting<Boolean> stopOnNetherPortal = sgWaypoints.add(new BoolSetting.Builder()
        .name("stop-on-nether-portal")
        .description("If Custom Block ESP (this addon's own module) is active and finds a Nether Portal block, immediately routes there instead and turns this module off on arrival. Add Nether Portal to Custom Block ESP's own block list for this to trigger.")
        .defaultValue(false)
        .build()
    );

    private final Long2ObjectMap<Boolean> chunkOld = new Long2ObjectOpenHashMap<>();
    private final ExecutorService worker = Executors.newSingleThreadExecutor();

    private Phase phase = Phase.IDLE;

    // Searching
    private Direction searchDir;
    private BlockPos searchTarget;
    private BlockPos searchRayTarget;

    // Following
    private ChunkPos current;
    private Direction dir;
    private ChunkPos loopStart;
    private Direction loopStartDir;
    private int stepsTaken;
    private int waypointCounter;

    // Chunks already walked as part of a border, so a closed loop isn't found and re-walked
    // forever once search resumes looking for another one.
    private final LongSet visitedBorderChunks = new LongOpenHashSet();
    private int waypointsDropped;

    private BlockPos travelTarget;
    private BlockPos lastBaritoneTarget;
    private BlockPos lastElytraTarget;
    private int elytraRetargetCooldown;
    private int elytraRecoveries;
    private Vec3d elytraWatchdogOrigin;
    private int elytraWatchdogTicks;
    private boolean elytraProcessWasActive;
    private boolean elytraLandingObserved;
    private int elytraNativeShutdownGrace;

    // Elytra takeoff
    private int takeoffTicks;
    private boolean elytraClimbing;
    private int elytraClimbFireworkCooldown;
    private int elytraClimbTicks;
    private double elytraClimbStartY;

    private Travel lastLoggedTravel;
    private volatile int classificationEpoch;

    public TrailExplorer() {
        super(OnFocusAddon.CATEGORY, "trail-explorer", "Flies, walks, or elytra-cruises along the border between old and new chunks, dropping waypoints as it goes.");
    }

    /** Plain-text line to OnFocus's log file (latest.log), regardless of the notify setting. */
    private static void log(String fmt, Object... args) {
        OnFocusAddon.LOG.info("[TrailExplorer] " + fmt.formatted(args));
    }

    /** Chat message gated by the notify setting, and always logged. */
    private void report(String fmt, Object... args) {
        if (notify.get()) info(fmt, args);
        log(fmt, args);
    }

    /** Chat message shown regardless of notify (these are refusal/error reasons), logged, and turns the module off. */
    private void refuse(String fmt, Object... args) {
        info(fmt, args);
        log(fmt, args);
        toggle();
    }

    @Override
    public void onActivate() {
        log("onActivate");

        if (mc.world == null || mc.player == null) {
            log("Refused: no world/player");
            toggle();
            return;
        }

        Dimension dimension = PlayerUtils.getDimension();
        if (dimension != Dimension.Overworld && dimension != Dimension.Nether) {
            refuse("This only works in the Overworld or the Nether.");
            return;
        }

        if (mode.get() == Travel.Elytra && !elytraModeUsable()) {
            if (!BaritoneUtils.IS_AVAILABLE) refuse("Elytra mode requires the Baritone mod to be installed alongside Meteor.");
            else if (dimension != Dimension.Nether) refuse("Elytra mode only works in the Nether (that's a Baritone limitation, not this module's).");
            else if (!BaritoneElytraBridge.isSupported()) refuse("Baritone's native elytra pathfinding library isn't supported on this system.");
            else refuse("Elytra mode requires an elytra equipped in your chestplate slot.");
            return;
        }

        Travel travel = resolveTravel();
        lastLoggedTravel = travel;
        log("dimension=%s mode-setting=%s resolved-travel=%s", dimension, mode.get(), travel);

        if (travel == Travel.Baritone && PathManagers.get() instanceof NopPathManager) {
            refuse("Baritone travel requires the Baritone mod to be installed alongside Meteor.");
            return;
        }
        if (mode.get() == Travel.Fly && !canFly()) {
            refuse("Fly mode requires Creative or Spectator mode.");
            return;
        }

        classificationEpoch++;
        synchronized (chunkOld) {
            chunkOld.clear();
        }
        visitedBorderChunks.clear();
        for (Chunk chunk : Utils.chunks()) classify(chunk);

        if (travel == Travel.Fly) {
            mc.player.getAbilities().flying = true;
            mc.player.sendAbilitiesUpdate();
        }

        phase = Phase.SEARCHING;
        stepsTaken = 0;
        waypointCounter = 0;
        waypointsDropped = 0;
        lastBaritoneTarget = null;
        lastElytraTarget = null;
        elytraRetargetCooldown = 0;
        elytraRecoveries = 0;
        searchTarget = null;
        searchRayTarget = null;
        elytraWatchdogOrigin = null;
        elytraWatchdogTicks = 0;
        elytraProcessWasActive = false;
        elytraLandingObserved = false;
        elytraNativeShutdownGrace = 0;

        searchDir = resolveSearchDirection();
        extendSearchTarget(travel);
        log("Search phase started: direction=%s initial-target=%s", searchDir, searchTarget);

        if (travel == Travel.Elytra) {
            takeoffTicks = 0;
            elytraClimbing = false;
            elytraClimbFireworkCooldown = 0;
            elytraClimbTicks = 0;
            if (!elytraAutoTakeoff.get()) BaritoneElytraBridge.ensureAutoTakeoffEnabled();
            report("Cruising via Baritone's elytra process, looking for the border.");

            int fireworks = countFireworks();
            int minFireworks = BaritoneElytraBridge.getMinFireworksBeforeLanding();
            log("Firework count: %d (Baritone lands early below %d)", fireworks, minFireworks);
            if (fireworks < minFireworks) {
                info("Only (highlight)%d(default) fireworks - Baritone lands for safety below (highlight)%d(default), regardless of distance to the target. Carry more for continuous flight.", fireworks, minFireworks);
            }
        }
    }

    private int countFireworks() {
        int count = 0;
        for (ItemStack stack : mc.player.getInventory().main) {
            if (stack.isOf(Items.FIREWORK_ROCKET)) count += stack.getCount();
        }
        if (mc.player.getOffHandStack().isOf(Items.FIREWORK_ROCKET)) count += mc.player.getOffHandStack().getCount();
        return count;
    }

    @Override
    public void onDeactivate() {
        log("onDeactivate from phase=%s", phase);
        classificationEpoch++;
        phase = Phase.IDLE;
        PathManagers.get().stop();
    }

    @EventHandler
    private void onChunkData(ChunkDataEvent event) {
        if (phase == Phase.IDLE) return;
        classify(event.chunk());
    }

    @EventHandler
    private void onTick(TickEvent.Pre event) {
        if (phase == Phase.IDLE || mc.player == null || mc.world == null) return;
        if (elytraRetargetCooldown > 0) elytraRetargetCooldown--;

        Travel travel = resolveTravel();
        if (travel != lastLoggedTravel) {
            log("Travel engine changed: %s -> %s", lastLoggedTravel, travel);
            lastLoggedTravel = travel;
        }

        if (travel == Travel.Elytra && tickElytraProcessLifecycle()) return;

        if (travel == Travel.Elytra && elytraAutoTakeoff.get() && !mc.player.isGliding()) {
            elytraClimbing = false; // if we fell out of a climb, redo it once re-launched
            tickElytraTakeoff();
            return;
        }

        if (travel == Travel.Elytra && elytraClimbing) {
            tickElytraClimb();
            return;
        }

        if (travel == Travel.Elytra) tickElytraWatchdog();
        else resetElytraWatchdog();

        if (stopOnNetherPortal.get() && phase != Phase.GOTO_PORTAL) {
            BlockPos portal = findNearbyPortal();
            if (portal != null) startGotoPortal(portal, travel);
        }

        switch (phase) {
            case SEARCHING -> tickSearching(travel);
            case FOLLOWING -> tickFollowing(travel);
            case GOTO_PORTAL -> tickGotoPortal(travel);
            default -> {}
        }
    }

    private BlockPos findNearbyPortal() {
        CustomBlockEsp esp = Modules.get().get(CustomBlockEsp.class);
        if (esp == null || !esp.isActive()) return null;

        return esp.getNearestFound(Blocks.NETHER_PORTAL, mc.player.getBlockPos());
    }

    private void startGotoPortal(BlockPos portal, Travel travel) {
        phase = Phase.GOTO_PORTAL;
        travelTarget = portal;
        lastBaritoneTarget = null;
        lastElytraTarget = null;

        report("Block ESP found a Nether Portal at (highlight)%d, %d, %d(default), heading there.", portal.getX(), portal.getY(), portal.getZ());
    }

    private void tickGotoPortal(Travel travel) {
        moveTowards(travel, travelTarget);

        double dx = travelTarget.getX() + 0.5 - mc.player.getX();
        double dy = travelTarget.getY() + 0.5 - mc.player.getY();
        double dz = travelTarget.getZ() + 0.5 - mc.player.getZ();
        boolean close = dx * dx + dy * dy + dz * dz < PORTAL_ARRIVE_DIST * PORTAL_ARRIVE_DIST;

        if (close || arrived(travel, travelTarget)) {
            log("Portal reached: close=%b arrived=%b", close, arrived(travel, travelTarget));
            report("Reached the Nether Portal, stopping.");
            toggle();
        }
    }

    // Baritone's elytra process won't take off from flat ground on its own (elytraAutoJump
    // defaults to false, and even enabled it needs Baritone to path-find a ledge to fall off).
    // We do it ourselves: jump, open the elytra the moment we leave the ground, then pop one
    // firework to get enough speed/altitude for Baritone to take over from there.
    // isOnGround() can flicker while settling after a Baritone landing (it holds sneak to kill
    // velocity), so this can't assume a clean one-shot "jump once, then stay airborne"
    // progression - it retries every tick against a single elapsed-attempt counter instead.
    private void tickElytraTakeoff() {
        takeoffTicks++;

        if (!mc.player.isOnGround()) {
            mc.player.networkHandler.sendPacket(new ClientCommandC2SPacket(mc.player, ClientCommandC2SPacket.Mode.START_FALL_FLYING));
            mc.player.startGliding();

            if (mc.player.isGliding()) {
                log("Takeoff: elytra open after %d ticks", takeoffTicks);
                useFirework();
                takeoffTicks = 0;
                elytraClimbing = true;
                elytraClimbFireworkCooldown = 20;
                return;
            }
        } else if (takeoffTicks % 5 == 1) {
            log("Takeoff: jumping (tick %d)", takeoffTicks);
            mc.player.jump();
        }

        if (takeoffTicks > 30) {
            refuse("Couldn't get the elytra open here after %d ticks, stopping.", takeoffTicks);
        }
    }

    // Elytra targets use the player's current Y (see extendSearchTarget/setTravelTarget), so
    // taking off low - very common in the Nether, e.g. right above the lava ocean - leaves no
    // room to glide anywhere: Baritone burns through what little altitude there is and lands
    // within seconds, regardless of how far the actual target is. Climb to a safe cruise height
    // first, under manual pitch+firework control, before handing off any real travel target.
    private void tickElytraClimb() {
        if (!mc.player.isGliding()) {
            elytraClimbing = false;
            return;
        }

        int targetY = Math.min(flyHeight.get(), mc.world.getTopYInclusive() - 20);

        if (mc.player.getY() >= targetY) {
            log("Climb finished at y=%.0f (target %d)", mc.player.getY(), targetY);
            elytraClimbing = false;
            elytraClimbTicks = 0;
            return;
        }

        elytraClimbTicks++;
        if (elytraClimbTicks == 1) elytraClimbStartY = mc.player.getY();

        if (elytraClimbTicks > 200) {
            double gained = mc.player.getY() - elytraClimbStartY;
            elytraClimbing = false;
            elytraClimbTicks = 0;
            if (gained < 5) {
                refuse("Climb stalled (only gained %.0f blocks in 10s) - something's fighting for control, stopping.", gained);
            } else {
                log("Climb timed out at y=%.0f (target %d), moving on anyway", mc.player.getY(), targetY);
            }
            return;
        }

        mc.player.setPitch(-55f);

        if (elytraClimbFireworkCooldown > 0) {
            elytraClimbFireworkCooldown--;
            return;
        }

        useFirework();
        elytraClimbFireworkCooldown = 20;
    }

    private void useFirework() {
        FindItemResult firework = InvUtils.find(Items.FIREWORK_ROCKET);
        if (!firework.found()) {
            report("No firework rockets found - gliding without a boost, might not gain much altitude.");
            return;
        }

        log("Takeoff: using firework from slot %d (offhand=%b, count=%d)", firework.slot(), firework.isOffhand(), firework.count());
        if (firework.isOffhand()) {
            Utils.rightClick();
        } else {
            InvUtils.swap(firework.slot(), false);
            Utils.rightClick();
            InvUtils.swapBack();
        }
    }

    private boolean withinLookahead(BlockPos target) {
        double dx = target.getX() + 0.5 - mc.player.getX();
        double dz = target.getZ() + 0.5 - mc.player.getZ();
        double lookahead = searchExtendDistance.get();
        return dx * dx + dz * dz < lookahead * lookahead;
    }

    private void tickSearching(Travel travel) {
        moveTowards(travel, searchTarget);

        if (withinLookahead(searchTarget)) {
            extendSearchTarget(travel);
            log("Search target extended to %s", searchTarget);
        }

        BorderHit hit = findBorder();
        if (hit != null) {
            current = hit.pos;
            dir = hit.oldDir.rotateYCounterclockwise();
            startFollowing(travel);
        }
    }

    private void tickFollowing(Travel travel) {
        moveTowards(travel, travelTarget);

        if (travel == Travel.Elytra) {
            // Border chunks are only ~16 blocks apart. Retargeting on every single one makes
            // Baritone's elytra process think it arrived and land - so batch steps into one
            // flight leg, redirecting well before actually reaching the target.
            if (withinLookahead(travelTarget)) batchAdvanceUntilFar(travel);
            return;
        }

        if (arrived(travel, travelTarget)) advanceStep(travel);
    }

    private void startFollowing(Travel travel) {
        phase = Phase.FOLLOWING;
        loopStart = current;
        loopStartDir = dir;
        stepsTaken = 0;
        waypointCounter = 0;
        visitedBorderChunks.add(current.toLong());

        report("Found the old/new chunk border at (highlight)%d, %d(default), following it.", current.x, current.z);

        setTravelTarget(current, travel);

        // The border can be found right where we already are (e.g. seeded from chunks that
        // were already loaded on activate), making the very first hop tiny - batch ahead here
        // too, not just on later tickFollowing() calls, or Baritone lands on that first hop
        // before batching ever gets a chance to kick in.
        if (travel == Travel.Elytra) batchAdvanceUntilFar(travel);
    }

    /**
     * Keeps calling advanceStep() until travelTarget is at least search-lookahead blocks from
     * the player, or it stops making progress (needed neighbour chunks aren't loaded yet - it'll
     * pick up again next tick once they are). Bounded so a pathological border can't hang a tick.
     */
    private void batchAdvanceUntilFar(Travel travel) {
        int cap = elytraFollowLegChunks.get();
        int minDist = Math.max(searchExtendDistance.get(), cap * 16);
        int i;

        for (i = 0; i < cap && phase == Phase.FOLLOWING; i++) {
            double dx = travelTarget.getX() - mc.player.getX();
            double dz = travelTarget.getZ() - mc.player.getZ();
            if (dx * dx + dz * dz > (double) minDist * minDist) break;

            BlockPos before = travelTarget;
            advanceStep(travel);
            if (travelTarget.equals(before)) break; // no progress (unloaded chunk) - stop for now
        }

        if (phase == Phase.FOLLOWING) {
            double dist = Math.sqrt(Math.pow(travelTarget.getX() - mc.player.getX(), 2) + Math.pow(travelTarget.getZ() - mc.player.getZ(), 2));
            log("Batch advanced %d chunk(s), target now %s (%.0f blocks away)", i, travelTarget, dist);
        }
    }

    // Right-hand wall follow: we stand on NEW chunks and keep an OLD chunk on our right.
    private void advanceStep(Travel travel) {
        if (maxSteps.get() > 0 && stepsTaken >= maxSteps.get()) {
            refuse("Reached the step limit (highlight)%d(default), stopping.", maxSteps.get());
            return;
        }

        for (int guard = 0; guard < 4; guard++) {
            Direction rightDir = dir.rotateYClockwise();
            ChunkPos rightChunk = neighbor(current, rightDir);
            Boolean rightOld = getClassification(rightChunk);
            if (rightOld == null) return; // not loaded yet, retry next tick

            if (rightOld) {
                ChunkPos ahead = neighbor(current, dir);
                Boolean aheadOld = getClassification(ahead);
                if (aheadOld == null) return; // not loaded yet, retry next tick

                if (!aheadOld) {
                    current = ahead;
                    stepsTaken++;
                    onArrivedAtBorderChunk(travel);
                    return;
                } else {
                    dir = dir.rotateYCounterclockwise();
                    // re-evaluate without moving
                }
            } else {
                dir = rightDir;
                current = rightChunk;
                stepsTaken++;
                onArrivedAtBorderChunk(travel);
                return;
            }
        }

        refuse("Fully enclosed pocket, nowhere left to follow. Stopping.");
    }

    private void onArrivedAtBorderChunk(Travel travel) {
        log("Border step %d: chunk (%d,%d) heading %s", stepsTaken, current.x, current.z, dir);
        visitedBorderChunks.add(current.toLong());

        if (stepsTaken > 3 && current.equals(loopStart) && dir == loopStartDir) {
            resumeSearchingAfterLoop(travel);
            return;
        }

        if (dropWaypoints.get() && ++waypointCounter >= waypointEvery.get()) {
            waypointCounter = 0;
            dropWaypoint();
        }

        setTravelTarget(current, travel);
    }

    // A closed loop is a fully-traced pocket of old (or new) chunks - stopping there for good
    // would mean giving up as soon as you land in a small isolated area. Keep exploring instead:
    // go back to searching in the same direction, with this loop's chunks marked off so
    // findBorder() won't just walk straight back into it.
    private void resumeSearchingAfterLoop(Travel travel) {
        report("Closed the loop after (highlight)%d(default) chunks, looking for another border.", stepsTaken);

        phase = Phase.SEARCHING;
        stepsTaken = 0;
        lastBaritoneTarget = null;
        lastElytraTarget = null;
        searchTarget = null;
        searchRayTarget = null;
        extendSearchTarget(travel);
        log("Resumed searching: direction=%s target=%s", searchDir, searchTarget);
    }

    private void dropWaypoint() {
        BlockPos pos = current.getCenterAtY(mc.player.getBlockY());
        waypointsDropped++;

        Waypoint waypoint = new Waypoint.Builder()
            .name("Trail " + waypointsDropped)
            .icon("star")
            .pos(pos)
            .dimension(PlayerUtils.getDimension())
            .build();
        Waypoints.get().add(waypoint);

        report("Dropped waypoint at (highlight)%d, %d(default).", pos.getX(), pos.getZ());
    }

    private void setTravelTarget(ChunkPos pos, Travel travel) {
        int y = travel == Travel.Elytra ? elytraCruiseY() : flyHeight.get();
        BlockPos requested = pos.getCenterAtY(y);
        travelTarget = travel == Travel.Elytra ? findOpenElytraTarget(requested) : requested;
        lastBaritoneTarget = null;
    }

    private void extendSearchTarget(Travel travel) {
        int hop = travel == Travel.Elytra ? ELYTRA_SEARCH_HOP : SEARCH_HOP;
        int y = travel == Travel.Elytra ? elytraCruiseY() : flyHeight.get();

        // Keep extending the same straight search ray. Rebuilding the target from the player's
        // drifting position made the ray wander sideways after every extension.
        BlockPos base = searchRayTarget == null ? mc.player.getBlockPos() : searchRayTarget;
        BlockPos requested = base.add(searchDir.getOffsetX() * hop, 0, searchDir.getOffsetZ() * hop).withY(y);
        searchRayTarget = requested;
        searchTarget = travel == Travel.Elytra ? findOpenElytraTarget(requested) : requested;
    }

    private int elytraCruiseY() {
        // IElytraProcess rejects goals outside the Nether's 0..127 range. More importantly,
        // using the player's current Y here made every new leg inherit altitude already lost
        // during the previous leg, producing the steady 100 -> 33 descent visible in the log.
        return MathHelper.clamp(flyHeight.get(), 1, Math.min(126, mc.world.getTopYInclusive() - 1));
    }

    /**
     * A chunk-center goal at a fixed Y can be solid netherrack. The native pathfinder then has
     * no valid final segment and eventually switches to landing. Prefer a nearby three-block-high
     * air column in an already-loaded chunk; unloaded search goals are left alone because asking
     * the world for their blocks would force a chunk load.
     */
    private BlockPos findOpenElytraTarget(BlockPos requested) {
        int chunkX = Math.floorDiv(requested.getX(), 16);
        int chunkZ = Math.floorDiv(requested.getZ(), 16);
        if (!mc.world.getChunkManager().isChunkLoaded(chunkX, chunkZ)) return requested;

        int preferredY = elytraCruiseY();
        int minY = Math.max(2, mc.world.getBottomY() + 2);
        int maxY = Math.min(125, mc.world.getTopYInclusive() - 2);

        for (int dy = 0; dy <= ELYTRA_TARGET_MAX_VERTICAL_ADJUSTMENT; dy++) {
            int above = preferredY + dy;
            if (above <= maxY) {
                BlockPos found = findOpenTargetAtY(requested, above);
                if (found != null) return logAdjustedTarget(requested, found);
            }

            if (dy == 0) continue;
            int below = preferredY - dy;
            if (below >= minY) {
                BlockPos found = findOpenTargetAtY(requested, below);
                if (found != null) return logAdjustedTarget(requested, found);
            }
        }

        log("No open-air elytra goal found near %s; keeping the requested target", requested);
        return requested;
    }

    private BlockPos findOpenTargetAtY(BlockPos requested, int y) {
        for (int[] offset : ELYTRA_TARGET_OFFSETS) {
            BlockPos candidate = new BlockPos(requested.getX() + offset[0], y, requested.getZ() + offset[1]);
            if (isOpenElytraTarget(candidate)) return candidate;
        }
        return null;
    }

    private boolean isOpenElytraTarget(BlockPos pos) {
        if (!mc.world.getBlockState(pos.down()).isAir()
            || !mc.world.getBlockState(pos).isAir()
            || !mc.world.getBlockState(pos.up()).isAir()) return false;

        // Avoid selecting the middle of a one-block-wide vertical crack.
        return mc.world.getBlockState(pos.north()).isAir()
            && mc.world.getBlockState(pos.south()).isAir()
            && mc.world.getBlockState(pos.east()).isAir()
            && mc.world.getBlockState(pos.west()).isAir();
    }

    private BlockPos logAdjustedTarget(BlockPos requested, BlockPos found) {
        if (!found.equals(requested)) log("Adjusted solid elytra target %s to open air at %s", requested, found);
        return found;
    }

    private void tickElytraWatchdog() {
        if (!mc.player.isGliding()) {
            resetElytraWatchdog();
            return;
        }

        if (elytraWatchdogOrigin == null) {
            elytraWatchdogOrigin = mc.player.getPos();
            elytraWatchdogTicks = 0;
            return;
        }

        if (++elytraWatchdogTicks < ELYTRA_STALL_CHECK_TICKS) return;

        double dx = mc.player.getX() - elytraWatchdogOrigin.x;
        double dz = mc.player.getZ() - elytraWatchdogOrigin.z;
        double moved = Math.sqrt(dx * dx + dz * dz);
        resetElytraWatchdog();

        if (moved < ELYTRA_STALL_MIN_MOVEMENT) {
            restartElytraNavigation("only moved %.1f blocks in %.1f seconds".formatted(
                moved, ELYTRA_STALL_CHECK_TICKS / 20.0));
        }
    }

    private void resetElytraWatchdog() {
        elytraWatchdogOrigin = null;
        elytraWatchdogTicks = 0;
    }

    private void restartElytraNavigation(String reason) {
        elytraRecoveries++;
        log("Watchdog recovery %d: %s; stopping once and waiting for native shutdown", elytraRecoveries, reason);
        PathManagers.get().stop();
        lastElytraTarget = null;
        elytraNativeShutdownGrace = ELYTRA_NATIVE_SHUTDOWN_GRACE_TICKS;
        elytraLandingObserved = false;
        resetElytraWatchdog();
    }

    /**
     * NetherPathfinder owns native memory and destroys it asynchronously. Replacing an active
     * destination over and over can leave a render-thread callback using a context which another
     * task has already freed. Let Baritone finish its landing, then leave a grace period before
     * starting the next process. Trail Explorer's logical border state remains untouched.
     */
    private boolean tickElytraProcessLifecycle() {
        BlockPos actual = BaritoneElytraBridge.currentDestination();
        boolean active = actual != null;

        if (active && lastElytraTarget != null && !actual.equals(lastElytraTarget)) {
            if (!elytraLandingObserved) {
                elytraRecoveries++;
                log("Recovery %d: Baritone is landing at %s; waiting for a clean shutdown before continuing", elytraRecoveries, actual);
                elytraLandingObserved = true;
            }
        }

        if (elytraProcessWasActive && !active) {
            elytraNativeShutdownGrace = ELYTRA_NATIVE_SHUTDOWN_GRACE_TICKS;
            lastElytraTarget = null;
            elytraLandingObserved = false;
            resetElytraWatchdog();
            log("Baritone elytra process ended; waiting %.1f seconds before automatic resume",
                ELYTRA_NATIVE_SHUTDOWN_GRACE_TICKS / 20.0);
        }
        elytraProcessWasActive = active;

        if (elytraLandingObserved && active) return true;
        if (elytraNativeShutdownGrace > 0) {
            elytraNativeShutdownGrace--;
            return true;
        }
        return false;
    }

    private BlockPos longRangeElytraTarget(BlockPos localTarget) {
        if (phase == Phase.GOTO_PORTAL) return localTarget;

        double dx = localTarget.getX() + 0.5 - mc.player.getX();
        double dz = localTarget.getZ() + 0.5 - mc.player.getZ();
        double distance = Math.sqrt(dx * dx + dz * dz);
        if (distance < 1) return localTarget;

        double scale = Math.max(1, ELYTRA_NAVIGATION_DISTANCE / distance);
        return BlockPos.ofFloored(
            mc.player.getX() + dx * scale,
            elytraCruiseY(),
            mc.player.getZ() + dz * scale
        );
    }

    private void moveTowards(Travel travel, BlockPos target) {
        if (travel == Travel.Fly) {
            Vec3d delta = Vec3d.ofCenter(target).subtract(mc.player.getPos());
            double horizDist = Math.sqrt(delta.x * delta.x + delta.z * delta.z);

            if (horizDist < 0.1 && Math.abs(delta.y) < 0.1) {
                mc.player.setVelocity(Vec3d.ZERO);
                return;
            }

            mc.player.setVelocity(delta.normalize().multiply(flySpeed.get()));

            float yaw = (float) (Math.atan2(-delta.x, delta.z) * (180 / Math.PI));
            mc.player.setYaw(yaw);
            if (horizDist > 0.001) {
                float pitch = (float) -(Math.atan2(delta.y, horizDist) * (180 / Math.PI));
                mc.player.setPitch(pitch);
            }
        } else if (travel == Travel.Elytra) {
            BlockPos navigationTarget = longRangeElytraTarget(target);
            BlockPos baritoneTarget = BaritoneElytraBridge.currentDestination();
            boolean processStopped = baritoneTarget == null;

            // Extend a live route on the same native context. This updates ElytraBehavior's goal
            // and recalculates its path; it deliberately does not call IElytraProcess.pathTo(),
            // which would destroy/recreate native memory and caused the earlier JVM crash.
            if (!processStopped && !navigationTarget.equals(lastElytraTarget) && elytraRetargetCooldown == 0) {
                if (BaritoneElytraBridge.retargetSafely(navigationTarget)) {
                    log("Extended live elytra route to %s (local trail target %s)", navigationTarget, target);
                    lastElytraTarget = navigationTarget;
                    elytraRetargetCooldown = ELYTRA_RETARGET_COOLDOWN_TICKS;
                }
                return;
            }

            // A genuinely ended process is started only after the lifecycle grace period.
            if (processStopped && elytraNativeShutdownGrace == 0 && elytraRetargetCooldown == 0) {
                log("Elytra pathTo %s (local trail target %s)", navigationTarget, target);
                BaritoneElytraBridge.pathTo(navigationTarget);
                lastElytraTarget = navigationTarget;
                elytraProcessWasActive = true;
                elytraRetargetCooldown = ELYTRA_RETARGET_COOLDOWN_TICKS;
            }
        } else {
            if (!target.equals(lastBaritoneTarget)) {
                log("Baritone moveTo %s", target);
                PathManagers.get().moveTo(target, false);
                lastBaritoneTarget = target;
            }
        }
    }

    private boolean arrived(Travel travel, BlockPos target) {
        if (travel == Travel.Fly) {
            double dx = target.getX() + 0.5 - mc.player.getX();
            double dz = target.getZ() + 0.5 - mc.player.getZ();
            return dx * dx + dz * dz < ARRIVE_DIST * ARRIVE_DIST;
        }

        if (travel == Travel.Elytra) return !BaritoneElytraBridge.isTraveling();

        return !PathManagers.get().isPathing();
    }

    private Boolean getClassification(ChunkPos pos) {
        synchronized (chunkOld) {
            return chunkOld.get(pos.toLong());
        }
    }

    /**
     * Same idea as XaeroPlus's OldChunks feature: a chunk containing several blocks that only
     * exist in newer worldgen is "new"; one without is "old". Works in any dimension, unlike a
     * world-height check.
     */
    private void classify(Chunk chunk) {
        ChunkPos pos = chunk.getPos();
        long key = pos.toLong();

        synchronized (chunkOld) {
            if (chunkOld.containsKey(key)) return;
        }

        Dimension dimension = PlayerUtils.getDimension();
        Set<Block> modernBlocks = dimension == Dimension.Nether ? NETHER_MODERN_BLOCKS : OVERWORLD_MODERN_BLOCKS;
        int threshold = modernBlockThreshold.get();
        int epoch = classificationEpoch;

        worker.submit(() -> {
            if (!isActive() || epoch != classificationEpoch) return;

            boolean modern = chunkContainsAny(chunk, modernBlocks, threshold);
            synchronized (chunkOld) {
                if (epoch == classificationEpoch) chunkOld.putIfAbsent(key, Boolean.valueOf(!modern));
            }
        });
    }

    private static boolean chunkContainsAny(Chunk chunk, Set<Block> blocks, int threshold) {
        ChunkPos pos = chunk.getPos();
        int startX = pos.getStartX();
        int startZ = pos.getStartZ();
        int bottomY = chunk.getBottomY();
        int topY = chunk.getTopYInclusive();

        int found = 0;
        BlockPos.Mutable m = new BlockPos.Mutable();
        for (int x = 0; x < 16; x++) {
            for (int z = 0; z < 16; z++) {
                for (int y = bottomY; y <= topY; y++) {
                    m.set(startX + x, y, startZ + z);
                    if (blocks.contains(chunk.getBlockState(m).getBlock())) {
                        if (++found >= threshold) return true;
                    }
                }
            }
        }
        return false;
    }

    private BorderHit findBorder() {
        BorderHit best = null;
        double bestDist = Double.MAX_VALUE;
        double px = mc.player.getX();
        double pz = mc.player.getZ();

        synchronized (chunkOld) {
            for (Long2ObjectMap.Entry<Boolean> e : chunkOld.long2ObjectEntrySet()) {
                if (e.getValue()) continue; // only stand on NEW chunks
                if (visitedBorderChunks.contains(e.getLongKey())) continue; // already walked this one (closed loop)

                ChunkPos pos = new ChunkPos(e.getLongKey());
                for (Direction d : HORIZONTALS) {
                    Boolean neighborOld = chunkOld.get(neighbor(pos, d).toLong());
                    if (neighborOld == null || !neighborOld) continue;

                    // Absence of a modern block is only a heuristic. A random Nether chunk can
                    // therefore look "old" and create a tiny fake island. Only accept a border
                    // when both sides belong to a reasonably-sized connected classified region.
                    if (!hasRegionSupport(pos, false) || !hasRegionSupport(neighbor(pos, d), true)) continue;

                    double dx = pos.getCenterX() - px;
                    double dz = pos.getCenterZ() - pz;
                    double dist = dx * dx + dz * dz;

                    if (dist < bestDist) {
                        bestDist = dist;
                        best = new BorderHit(pos, d);
                    }
                }
            }
        }

        return best;
    }

    /** Called while chunkOld is locked. Stops as soon as enough supporting chunks are found. */
    private boolean hasRegionSupport(ChunkPos start, boolean old) {
        ArrayDeque<ChunkPos> queue = new ArrayDeque<>();
        LongSet seen = new LongOpenHashSet();
        queue.add(start);
        seen.add(start.toLong());

        int matches = 0;
        while (!queue.isEmpty() && matches < MIN_BORDER_REGION_CHUNKS) {
            ChunkPos pos = queue.removeFirst();
            Boolean classification = chunkOld.get(pos.toLong());
            if (classification == null || classification != old) continue;
            matches++;

            for (Direction direction : HORIZONTALS) {
                ChunkPos next = neighbor(pos, direction);
                if (seen.add(next.toLong())) queue.addLast(next);
            }
        }

        return matches >= MIN_BORDER_REGION_CHUNKS;
    }

    private boolean canFly() {
        return mc.player.getAbilities().allowFlying;
    }

    private boolean elytraModeUsable() {
        return BaritoneUtils.IS_AVAILABLE
            && PlayerUtils.getDimension() == Dimension.Nether
            && BaritoneElytraBridge.isSupported()
            && mc.player.getEquippedStack(EquipmentSlot.CHEST).isOf(Items.ELYTRA);
    }

    private Travel resolveTravel() {
        if (mode.get() != Travel.Auto) return mode.get();
        if (elytraModeUsable()) return Travel.Elytra;
        return canFly() ? Travel.Fly : Travel.Baritone;
    }

    private Direction resolveSearchDirection() {
        return switch (searchDirection.get()) {
            case North -> Direction.NORTH;
            case South -> Direction.SOUTH;
            case East -> Direction.EAST;
            case West -> Direction.WEST;
            case Current -> yawToDirection(mc.player.getYaw());
        };
    }

    private static Direction yawToDirection(float yaw) {
        yaw = MathHelper.wrapDegrees(yaw);
        if (yaw >= -45 && yaw < 45) return Direction.SOUTH;
        if (yaw >= 45 && yaw < 135) return Direction.WEST;
        if (yaw >= -135 && yaw < -45) return Direction.EAST;
        return Direction.NORTH;
    }

    private static ChunkPos neighbor(ChunkPos pos, Direction d) {
        return new ChunkPos(pos.x + d.getOffsetX(), pos.z + d.getOffsetZ());
    }

    @Override
    public String getInfoString() {
        return switch (phase) {
            case IDLE -> null;
            case SEARCHING -> "searching";
            case FOLLOWING -> stepsTaken + " chunks";
            case GOTO_PORTAL -> "portal";
        };
    }

    private enum Phase {
        IDLE,
        SEARCHING,
        FOLLOWING,
        GOTO_PORTAL
    }

    public enum Travel {
        Auto,
        Fly,
        Baritone,
        Elytra
    }

    public enum SearchDirection {
        Current,
        North,
        South,
        East,
        West
    }

    private record BorderHit(ChunkPos pos, Direction oldDir) {}
}
