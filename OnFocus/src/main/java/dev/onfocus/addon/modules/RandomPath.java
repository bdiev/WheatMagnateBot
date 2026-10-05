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
 * deny it, and a low-TPS server can take a while to even tell you. So every placement gets
 * re-checked a few ticks later against the real world state, and re-placed (while still in reach)
 * if it turned out not to have stuck, instead of assuming the ground behind you is solid forever.
 */
public class RandomPath extends Module {
    private static final int ROTATION_PRIORITY = 50;

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
        .description("Automatically switches to the chosen block in your hotbar before placing.")
        .defaultValue(true)
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
        .description("Ticks to wait after placing before checking whether the block actually stuck. On a laggy server a rollback can take a moment to arrive, so too short a delay checks before the server's had a chance to respond.")
        .defaultValue(10)
        .range(1, 200)
        .sliderRange(1, 60)
        .build()
    );

    private final Setting<Integer> retryDelay = sgVerify.add(new IntSetting.Builder()
        .name("retry-delay")
        .description("Extra ticks to wait before trying again if a placement didn't stick, so a struggling server isn't hammered with repeated place packets.")
        .defaultValue(30)
        .range(0, 400)
        .sliderRange(0, 200)
        .build()
    );

    private final Setting<Integer> maxAttempts = sgVerify.add(new IntSetting.Builder()
        .name("max-attempts")
        .description("Gives up on a spot after this many failed placements in a row - by then it's more likely genuinely blocked (a protected region, etc) than just unlucky timing.")
        .defaultValue(3)
        .min(1)
        .sliderRange(1, 10)
        .build()
    );

    private final Setting<Boolean> notify = sgVerify.add(new BoolSetting.Builder()
        .name("notify")
        .description("Sends a chat message whenever a placement is found to have been rolled back, and when a spot is given up on entirely.")
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

    // Positions we've placed at but haven't yet confirmed the server kept - never trusted as
    // "done" just because a place packet was sent.
    private final Long2ObjectMap<Pending> pending = new Long2ObjectOpenHashMap<>();
    private final Random random = new Random();

    public RandomPath() {
        super(OnFocusAddon.CATEGORY, "random-path", "Places a weighted-random block from your mix under your feet wherever there's empty space, weaving a mixed-material path as you walk.");
    }

    private void report(String fmt, Object... args) {
        if (notify.get()) info(fmt, args);
    }

    @Override
    public void onDeactivate() {
        pending.clear();
    }

    @EventHandler
    private void onTick(TickEvent.Pre event) {
        if (mc.player == null || mc.world == null) return;

        tickPending();

        if (!hasEligibleBlocks()) return;

        Vec3d vec = mc.player.getPos().add(mc.player.getVelocity()).add(0, -0.75, 0);
        BlockPos center = BlockPos.ofFloored(vec.x, vec.y, vec.z);
        if (center.getY() >= mc.player.getBlockPos().getY()) center = center.down();

        int cap = radius.get() > 0 ? blocksPerTick.get() : 1;
        int placed = 0;

        for (BlockPos pos : collectTargets(center)) {
            if (placed >= cap) break;
            if (!BlockUtils.canPlace(pos)) continue;

            if (place(pos)) {
                pending.put(pos.asLong(), new Pending(verifyDelay.get()));
                placed++;
            }
        }
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

    /** Re-checks every placement still awaiting confirmation, retrying any that got rolled back. */
    private void tickPending() {
        if (pending.isEmpty()) return;

        var it = pending.long2ObjectEntrySet().iterator();
        while (it.hasNext()) {
            var entry = it.next();
            Pending p = entry.getValue();
            if (--p.ticksLeft > 0) continue;

            BlockPos pos = BlockPos.fromLong(entry.getLongKey());

            if (!BlockUtils.canPlace(pos)) {
                // Still solid - the placement stuck.
                it.remove();
                continue;
            }

            double reach = mc.player.getBlockInteractionRange();
            double dist = Vec3d.ofCenter(pos).distanceTo(mc.player.getEyePos());
            if (dist > reach) {
                // Out of reach now (already walked past) - can't safely fix it from here.
                it.remove();
                continue;
            }

            p.attempts++;
            if (p.attempts >= maxAttempts.get()) {
                it.remove();
                report("Gave up on (highlight)%d, %d, %d(default) after it got rolled back %d time(s) in a row.", pos.getX(), pos.getY(), pos.getZ(), p.attempts);
                continue;
            }

            report("Placement at (highlight)%d, %d, %d(default) didn't stick - retrying (attempt %d/%d).", pos.getX(), pos.getY(), pos.getZ(), p.attempts + 1, maxAttempts.get());

            p.ticksLeft = place(pos) ? verifyDelay.get() : retryDelay.get();
        }
    }

    private boolean hasEligibleBlocks() {
        for (PathBlockWeight w : blocks.get().values()) {
            if (w.weight > 0) return true;
        }
        return false;
    }

    /**
     * Sends a place packet for a weighted-random available block from the mix. Doesn't imply the
     * server kept it - see tickPending.
     * <p>
     * Draws without replacement: if the weighted pick isn't actually in the hotbar, it's dropped
     * from the pool and another is drawn from what's left, still respecting everyone else's
     * relative weight, instead of always falling back to the same runner-up block.
     */
    private boolean place(BlockPos pos) {
        if (BlockUtils.getPlaceSide(pos) == null) return false;

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
            FindItemResult item = InvUtils.findInHotbar(stack ->
                stack.getItem() instanceof BlockItem blockItem && blockItem.getBlock() == block);

            if (item.found() && (item.getHand() != null || autoSwitch.get())
                && BlockUtils.place(pos, item, rotate.get(), ROTATION_PRIORITY, swing.get(), true)) {
                if (render.get()) RenderUtils.renderTickingBlock(pos, sideColor.get(), lineColor.get(), shapeMode.get(), 0, 8, true, false);
                return true;
            }

            totalWeight -= pool.get(index).getValue().weight;
            pool.remove(index);
        }

        return false;
    }

    @Override
    public String getInfoString() {
        return pending.isEmpty() ? null : pending.size() + " unconfirmed";
    }

    private static final class Pending {
        int ticksLeft;
        int attempts;

        Pending(int ticksLeft) {
            this.ticksLeft = ticksLeft;
        }
    }
}
