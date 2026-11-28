package dev.onfocus.addon.modules;

import dev.onfocus.addon.OnFocusAddon;
import it.unimi.dsi.fastutil.longs.Long2ObjectMap;
import it.unimi.dsi.fastutil.longs.Long2ObjectOpenHashMap;
import meteordevelopment.meteorclient.events.world.TickEvent;
import meteordevelopment.meteorclient.renderer.ShapeMode;
import meteordevelopment.meteorclient.settings.*;
import meteordevelopment.meteorclient.systems.modules.Module;
import meteordevelopment.meteorclient.utils.player.FindItemResult;
import meteordevelopment.meteorclient.utils.player.InvUtils;
import meteordevelopment.meteorclient.utils.render.RenderUtils;
import meteordevelopment.meteorclient.utils.render.color.SettingColor;
import meteordevelopment.meteorclient.utils.world.BlockUtils;
import meteordevelopment.orbit.EventHandler;
import net.minecraft.block.Block;
import net.minecraft.item.BlockItem;
import net.minecraft.util.math.BlockPos;
import net.minecraft.util.math.Direction;
import net.minecraft.util.math.Vec3d;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Random;

/**
 * Like a plain block-bridge, except every block it places is picked at random - weighted by how
 * much of each type you asked for - from your own chosen mix (only ones actually sitting in your
 * hotbar are eligible), weaving a mixed path as you walk instead of a single repeated block. Only
 * fills genuinely empty space under you - an existing floor is left untouched, nothing is ever
 * broken.
 * <p>
 * A place packet landing client-side isn't proof the server kept it - an anti-cheat can silently
 * deny it, and a low-TPS server can take a while to even tell you. So every spot placed is kept
 * until it has stayed solid a few ticks: one the server rolls back (the client showed the block, then
 * it went) is placed again at once, with the block picked first - a new random pick every time would
 * only show the client's guesses swapping. A spot that missed is remembered and filled as soon as
 * it's in reach again, before new ones; only walking well away from it forgets it. A spot out of
 * reach isn't placed at all: the server refuses it, and the client would show it placed until it does.
 * <p>
 * The picked block is switched to and kept selected (held switch-delay ticks before placing) rather
 * than swapped to and back in one instant: that let the server place from the slot you were already
 * holding, skewing the mix heavily towards it. A kept spot that turned out a different block than
 * the one picked is reported.
 */
public class RandomPath extends Module {
    private static final int ROTATION_PRIORITY = 50;
    /** A missed spot this far from you is forgotten: you've walked on. */
    private static final double FORGET_DISTANCE = 24;

    private final SettingGroup sgGeneral = settings.getDefaultGroup();
    private final SettingGroup sgVerify = settings.createGroup("Verification");
    private final SettingGroup sgRender = settings.createGroup("Render");

    private final Setting<Map<Block, PathBlockWeight>> blocks = sgGeneral.add(new BlockDataSetting.Builder<PathBlockWeight>()
        .name("blocks")
        .description("The mix to build the path from. Open a block and set its weight - how often it's used relative to the others (e.g. cobblestone=3, andesite=1, gravel=2 places roughly 3 cobblestone and 2 gravel for every 1 andesite). Weight 0 (the default) excludes a block. Only types you're actually carrying in your hotbar are eligible at placement time.")
        .defaultData(() -> new PathBlockWeight(0))
        .build()
    );

    private final Setting<Boolean> rotate = sgGeneral.add(new BoolSetting.Builder()
        .name("rotate")
        .description("Rotates towards the block being placed.")
        .defaultValue(true)
        .build()
    );

    private final Setting<Boolean> autoSwitch = sgGeneral.add(new BoolSetting.Builder()
        .name("auto-switch")
        .description("Automatically switches to the chosen block in your hotbar before placing. It stays selected afterwards, so the server always places from the same slot the client did.")
        .defaultValue(true)
        .build()
    );

    private final Setting<Integer> switchDelay = sgGeneral.add(new IntSetting.Builder()
        .name("switch-delay")
        .description("Ticks to hold a newly selected block before placing it. Switching and placing in the same instant can reach the server with the old slot still selected, so it places whatever you were holding instead of the picked block - skewing the mix towards it. 0 places right after switching.")
        .defaultValue(1)
        .range(0, 20)
        .sliderRange(0, 5)
        .visible(autoSwitch::get)
        .build()
    );

    private final Setting<Boolean> swing = sgGeneral.add(new BoolSetting.Builder()
        .name("swing")
        .description("Renders your arm swinging when placing.")
        .defaultValue(false)
        .build()
    );

    private final Setting<Double> radius = sgGeneral.add(new DoubleSetting.Builder()
        .name("radius")
        .description("Also fills empty space around your feet within this many blocks, not just directly beneath you - 0 places only the single spot you're standing over.")
        .defaultValue(0)
        .min(0)
        .max(8)
        .sliderRange(0, 6)
        .build()
    );

    private final Setting<Integer> blocksPerTick = sgGeneral.add(new IntSetting.Builder()
        .name("blocks-per-tick")
        .description("Caps how many blocks are placed in a single tick when radius is above 0, so a wide area doesn't get filled in one instant burst of packets.")
        .defaultValue(1)
        .min(1)
        .sliderRange(1, 9)
        .visible(() -> radius.get() > 0)
        .build()
    );

    private final Setting<Integer> verifyDelay = sgVerify.add(new IntSetting.Builder()
        .name("verify-delay")
        .description("Ticks a placed block has to stay before it counts as kept - and how long to wait for one that never showed up before placing it again. A rollback seen sooner is placed again at once. On a laggy server a rollback can take a moment to arrive.")
        .defaultValue(10)
        .range(1, 200)
        .sliderRange(1, 60)
        .build()
    );

    private final Setting<Integer> retryDelay = sgVerify.add(new IntSetting.Builder()
        .name("retry-delay")
        .description("Ticks to wait after max-attempts misses in a row at one spot before trying it again, so a struggling server (or a protected spot) isn't hammered with place packets.")
        .defaultValue(30)
        .range(0, 400)
        .sliderRange(0, 200)
        .build()
    );

    private final Setting<Integer> maxAttempts = sgVerify.add(new IntSetting.Builder()
        .name("max-attempts")
        .description("Misses in a row at one spot that are retried right away; after that it waits retry-delay before the next go. A spot is never given up on while it's near you.")
        .defaultValue(3)
        .min(1)
        .sliderRange(1, 10)
        .build()
    );

    private final Setting<Boolean> notify = sgVerify.add(new BoolSetting.Builder()
        .name("notify")
        .description("Sends a chat message when a spot keeps getting rolled back (every max-attempts misses in a row).")
        .defaultValue(true)
        .build()
    );

    private final Setting<Boolean> render = sgRender.add(new BoolSetting.Builder()
        .name("render")
        .description("Briefly highlights each block right after it's placed.")
        .defaultValue(true)
        .build()
    );

    private final Setting<ShapeMode> shapeMode = sgRender.add(new EnumSetting.Builder<ShapeMode>()
        .name("shape-mode")
        .description("How the highlight is rendered.")
        .defaultValue(ShapeMode.Both)
        .visible(render::get)
        .build()
    );

    private final Setting<SettingColor> sideColor = sgRender.add(new ColorSetting.Builder()
        .name("side-color")
        .description("Side color of the highlight.")
        .defaultValue(new SettingColor(120, 200, 255, 25))
        .visible(render::get)
        .build()
    );

    private final Setting<SettingColor> lineColor = sgRender.add(new ColorSetting.Builder()
        .name("line-color")
        .description("Line color of the highlight.")
        .defaultValue(new SettingColor(120, 200, 255))
        .visible(render::get)
        .build()
    );

    // Spots placed but not yet confirmed kept, and spots that missed - never trusted as "done" just
    // because a place packet was sent.
    private final Long2ObjectMap<Spot> spots = new Long2ObjectOpenHashMap<>();
    private final Random random = new Random();

    /** Ticks the current hotbar slot has been selected; whether a switch was already made this tick. */
    private int heldTicks, lastSlot = -1;
    private boolean switchedThisTick;
    /** Kept spots that ended up as a different block than the one picked - see tickSpots. */
    private int wrongBlocks;

    public RandomPath() {
        super(OnFocusAddon.CATEGORY, "random-path", "Places a weighted-random block from your mix under your feet wherever there's empty space, weaving a mixed-material path as you walk.");
    }

    private void report(String fmt, Object... args) {
        if (notify.get()) info(fmt, args);
    }

    @Override
    public void onActivate() {
        lastSlot = -1;
        wrongBlocks = 0;
    }

    @Override
    public void onDeactivate() {
        spots.clear();
    }

    @EventHandler
    private void onTick(TickEvent.Pre event) {
        if (mc.player == null || mc.world == null) return;

        int slot = mc.player.getInventory().selectedSlot;
        if (slot != lastSlot) {
            lastSlot = slot;
            heldTicks = 0;
        } else if (heldTicks < Integer.MAX_VALUE) {
            heldTicks++;
        }
        switchedThisTick = false;

        int cap = radius.get() > 0 ? blocksPerTick.get() : 1;
        boolean eligible = hasEligibleBlocks();
        int placed = 0;

        if (eligible) {
            Vec3d vec = mc.player.getPos().add(mc.player.getVelocity()).add(0, -0.75, 0);
            BlockPos center = BlockPos.ofFloored(vec.x, vec.y, vec.z);
            if (center.getY() >= mc.player.getBlockPos().getY()) center = center.down();

            for (BlockPos pos : collectTargets(center)) {
                if (placed >= cap) break;
                long key = pos.asLong();
                if (spots.containsKey(key)) continue; // tracked: tickSpots sees to it
                if (!BlockUtils.canPlace(pos) || !inReach(pos)) continue;

                Pick pick = place(pos, null);
                if (pick != null) {
                    // Not sent yet (still switching to it): tickSpots places it once it's held
                    spots.put(key, new Spot(pick.block, pick.sent, pick.sent ? verifyDelay.get() : 0));
                    placed++;
                }
            }
        }

        tickSpots(eligible ? cap - placed : 0);
    }

    /** The spot directly under your feet, plus (when radius > 0) nearby spots within it, closest first. */
    private List<BlockPos> collectTargets(BlockPos center) {
        double r = radius.get();
        if (r <= 0) return List.of(center);

        List<BlockPos> targets = new ArrayList<>();
        int ir = (int) Math.ceil(r);

        for (int x = -ir; x <= ir; x++) {
            for (int z = -ir; z <= ir; z++) {
                if (x == 0 && z == 0) {
                    targets.add(center);
                    continue;
                }

                BlockPos pos = center.add(x, 0, z);
                if (mc.player.getPos().distanceTo(Vec3d.ofCenter(pos)) <= r) targets.add(pos);
            }
        }

        targets.sort(Comparator.comparingDouble(pos -> Vec3d.ofCenter(pos).squaredDistanceTo(mc.player.getPos())));
        return targets;
    }

    /**
     * Every tracked spot: a placed block that stayed long enough is kept and let go; one rolled back,
     * or that never showed up, is a miss - placed again (up to {@code budget} this tick) as soon as it's
     * in reach, at once for the first max-attempts misses in a row, then after retry-delay.
     */
    private void tickSpots(int budget) {
        if (spots.isEmpty()) return;

        var it = spots.long2ObjectEntrySet().iterator();
        while (it.hasNext()) {
            var entry = it.next();
            long key = entry.getLongKey();
            Spot spot = entry.getValue();
            BlockPos pos = BlockPos.fromLong(key);

            if (!BlockUtils.canPlace(pos)) {
                // Solid: ours staying put, or someone else's
                if (!spot.sent) {
                    it.remove();
                    continue;
                }
                spot.shown = true;
                if (--spot.wait <= 0) {
                    // Stayed: the server kept it - but maybe as another block than the one picked
                    it.remove();
                    Block actual = mc.world.getBlockState(pos).getBlock();
                    if (actual != spot.block) {
                        wrongBlocks++;
                        report("(highlight)%d, %d, %d(default) became %s instead of %s (%d so far) - the server placed another hotbar block.",
                            pos.getX(), pos.getY(), pos.getZ(), actual.getName().getString(), spot.block.getName().getString(), wrongBlocks);
                    }
                }
                continue;
            }

            if (Vec3d.ofCenter(pos).squaredDistanceTo(mc.player.getPos()) > FORGET_DISTANCE * FORGET_DISTANCE) {
                it.remove();
                continue;
            }

            if (spot.sent && (spot.shown || --spot.wait <= 0)) {
                // Rolled back (shown, then gone), or never showed up: a miss
                spot.sent = false;
                spot.shown = false;
                spot.misses++;
                spot.wait = spot.misses % maxAttempts.get() == 0 ? retryDelay.get() : 0;
                if (spot.wait > 0) {
                    report("(highlight)%d, %d, %d(default) got rolled back %d time(s) in a row - trying again in %d ticks.",
                        pos.getX(), pos.getY(), pos.getZ(), spot.misses, spot.wait);
                }
            }
            if (spot.sent) continue;
            if (spot.wait > 0) {
                spot.wait--;
                continue;
            }

            if (budget <= 0 || !inReach(pos)) continue; // kept: placed once it's in reach
            Pick pick = place(pos, spot.block);
            if (pick == null) continue;
            spot.block = pick.block;
            if (!pick.sent) continue; // switched to it: placed once it's been held long enough
            spot.sent = true;
            spot.wait = verifyDelay.get();
            budget--;
        }
    }

    /**
     * Whether the face it'd be placed against is within reach of your eyes. The server refuses a
     * placement farther than that, and the client would show it placed until it does.
     */
    private boolean inReach(BlockPos pos) {
        Direction side = BlockUtils.getPlaceSide(pos);
        if (side == null) return false;
        Vec3d hit = Vec3d.ofCenter(pos).add(side.getOffsetX() * 0.5, side.getOffsetY() * 0.5, side.getOffsetZ() * 0.5);
        double reach = mc.player.getBlockInteractionRange();
        return mc.player.getEyePos().squaredDistanceTo(hit) <= reach * reach;
    }

    private boolean hasEligibleBlocks() {
        for (PathBlockWeight w : blocks.get().values()) {
            if (w.weight > 0) return true;
        }
        return false;
    }

    /**
     * Places {@code preferred} if it's still in the hotbar, else a weighted-random available block
     * from the mix; the block picked and whether its place packet went out (not yet while it's
     * still being switched to), or null. Doesn't imply the server kept it - see tickSpots.
     * <p>
     * Draws without replacement: if the weighted pick isn't actually in the hotbar, it's dropped
     * from the pool and another is drawn from what's left, still respecting everyone else's
     * relative weight, instead of always falling back to the same runner-up block.
     */
    private Pick place(BlockPos pos, Block preferred) {
        if (BlockUtils.getPlaceSide(pos) == null) return null;
        if (preferred != null) {
            Result result = placeWith(pos, preferred);
            if (result != Result.UNAVAILABLE) return new Pick(preferred, result == Result.PLACED);
        }

        List<Map.Entry<Block, PathBlockWeight>> pool = new ArrayList<>();
        int totalWeight = 0;
        for (Map.Entry<Block, PathBlockWeight> entry : blocks.get().entrySet()) {
            if (entry.getValue().weight <= 0) continue;
            pool.add(entry);
            totalWeight += entry.getValue().weight;
        }

        while (!pool.isEmpty()) {
            int roll = random.nextInt(totalWeight);
            int cumulative = 0;
            int index = pool.size() - 1;

            for (int i = 0; i < pool.size(); i++) {
                cumulative += pool.get(i).getValue().weight;
                if (roll < cumulative) {
                    index = i;
                    break;
                }
            }

            Block block = pool.get(index).getKey();
            if (block != preferred) {
                Result result = placeWith(pos, block);
                if (result != Result.UNAVAILABLE) return new Pick(block, result == Result.PLACED);
            }

            totalWeight -= pool.get(index).getValue().weight;
            pool.remove(index);
        }

        return null;
    }

    /**
     * Sends a place packet for this block if it's in hand. One elsewhere in the hotbar is switched to
     * first and stays selected - no swap back - so the server holds the same slot the client placed
     * from: a switch, place and switch back all in one instant can reach the server with the slot
     * change not applied, placing whatever you were holding instead. With switch-delay above 0 the
     * place waits that many ticks after the switch; only one switch is made per tick.
     */
    private Result placeWith(BlockPos pos, Block block) {
        FindItemResult item = InvUtils.findInHotbar(stack ->
            stack.getItem() instanceof BlockItem blockItem && blockItem.getBlock() == block);
        if (!item.found()) return Result.UNAVAILABLE;

        if (item.getHand() == null) {
            if (!autoSwitch.get()) return Result.UNAVAILABLE;
            if (switchedThisTick) return Result.WAITING;
            InvUtils.swap(item.slot(), false);
            switchedThisTick = true;
            lastSlot = item.slot();
            heldTicks = 0;
            if (switchDelay.get() > 0) return Result.WAITING;
        } else if (item.isMainHand() && heldTicks < switchDelay.get()) {
            return Result.WAITING;
        }

        if (!BlockUtils.place(pos, item, rotate.get(), ROTATION_PRIORITY, swing.get(), true, false)) return Result.UNAVAILABLE;
        if (render.get()) RenderUtils.renderTickingBlock(pos, sideColor.get(), lineColor.get(), shapeMode.get(), 0, 8, true, false);
        return Result.PLACED;
    }

    @Override
    public String getInfoString() {
        if (wrongBlocks > 0) return spots.size() + " unconfirmed, " + wrongBlocks + " wrong";
        return spots.isEmpty() ? null : spots.size() + " unconfirmed";
    }

    private enum Result { PLACED, WAITING, UNAVAILABLE }

    /** A block picked for a spot, and whether its place packet went out yet. */
    private record Pick(Block block, boolean sent) {}

    private static final class Spot {
        /** The block placed there: placed again, it's the same one. */
        Block block;
        /** Placed, and its outcome not known yet; shown: the client has had the block there since. */
        boolean sent, shown;
        /** Ticks: till it counts as kept (or as never shown), or before the next go after a miss. */
        int wait;
        int misses;

        Spot(Block block, boolean sent, int wait) {
            this.block = block;
            this.sent = sent;
            this.wait = wait;
        }
    }
}
