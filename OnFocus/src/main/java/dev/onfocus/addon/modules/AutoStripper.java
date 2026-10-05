package dev.onfocus.addon.modules;

import dev.onfocus.addon.OnFocusAddon;
import it.unimi.dsi.fastutil.longs.Long2IntMap;
import it.unimi.dsi.fastutil.longs.Long2IntOpenHashMap;
import it.unimi.dsi.fastutil.longs.Long2ObjectMap;
import it.unimi.dsi.fastutil.longs.Long2ObjectOpenHashMap;
import meteordevelopment.meteorclient.events.entity.player.InteractBlockEvent;
import meteordevelopment.meteorclient.events.world.TickEvent;
import meteordevelopment.meteorclient.pathing.NopPathManager;
import meteordevelopment.meteorclient.pathing.PathManagers;
import meteordevelopment.meteorclient.settings.*;
import meteordevelopment.meteorclient.systems.modules.Module;
import meteordevelopment.meteorclient.utils.player.FindItemResult;
import meteordevelopment.meteorclient.utils.player.InvUtils;
import meteordevelopment.meteorclient.utils.player.Rotations;
import meteordevelopment.meteorclient.utils.world.BlockUtils;
import meteordevelopment.orbit.EventHandler;
import net.minecraft.block.Block;
import net.minecraft.util.hit.BlockHitResult;
import net.minecraft.item.AxeItem;
import net.minecraft.registry.Registries;
import net.minecraft.util.Hand;
import net.minecraft.util.Identifier;
import net.minecraft.util.math.BlockPos;
import net.minecraft.util.math.Vec3d;

import java.util.ArrayDeque;

/**
 * Toggle this on, then right-click any log on the tree you want stripped - that click is
 * swallowed and used to flood-fill the connected tree instead of going through as a normal
 * interaction. From there it works through every log in that tree on its own: swapping to an axe
 * from the hotbar, rotating to face each one, and right-clicking it to strip it - the same
 * interaction a vanilla axe stripping does by hand. Right-clicking a different tree at any point,
 * including mid-job, retargets it. Every strip is verified: after clicking a log it waits, checks
 * whether that block's id actually turned into its "stripped_" counterpart, and if not, retries
 * later instead of assuming the click landed.
 */
public class AutoStripper extends Module {
    private static final int STUCK_TICKS = 200;

    private final SettingGroup sgGeneral = settings.getDefaultGroup();

    private final Setting<Boolean> matchExactType = sgGeneral.add(new BoolSetting.Builder()
        .name("match-exact-type")
        .description("Only follows logs of the exact same wood type you targeted, so it won't spill into a neighbouring tree of a different species.")
        .defaultValue(true)
        .build()
    );

    private final Setting<Boolean> diagonalSearch = sgGeneral.add(new BoolSetting.Builder()
        .name("diagonal-search")
        .description("Also connects logs that only touch at an edge or corner, not just a face - needed for trees whose branches angle off the trunk.")
        .defaultValue(true)
        .build()
    );

    private final Setting<Integer> maxBlocks = sgGeneral.add(new IntSetting.Builder()
        .name("max-blocks")
        .description("The most logs a single tree selection can contain.")
        .defaultValue(512)
        .min(1)
        .sliderRange(16, 2048)
        .build()
    );

    private final Setting<Boolean> autoWalk = sgGeneral.add(new BoolSetting.Builder()
        .name("auto-walk")
        .description("Uses Baritone to walk towards logs that are out of reach instead of skipping them.")
        .defaultValue(true)
        .build()
    );

    private final Setting<Boolean> rotate = sgGeneral.add(new BoolSetting.Builder()
        .name("rotate")
        .description("Automatically faces towards the log being stripped.")
        .defaultValue(true)
        .build()
    );

    private final Setting<Boolean> antiBreak = sgGeneral.add(new BoolSetting.Builder()
        .name("anti-break")
        .description("Won't select an axe that's about to break.")
        .defaultValue(true)
        .build()
    );

    private final Setting<Integer> verifyDelay = sgGeneral.add(new IntSetting.Builder()
        .name("verify-delay")
        .description("Ticks to wait after right-clicking a log before checking whether the server actually turned it into its stripped form.")
        .defaultValue(10)
        .range(1, 100)
        .sliderRange(1, 60)
        .build()
    );

    private final Setting<Integer> retryDelay = sgGeneral.add(new IntSetting.Builder()
        .name("retry-delay")
        .description("Extra ticks to wait before trying a log again if it didn't turn out stripped the first time.")
        .defaultValue(40)
        .range(0, 400)
        .sliderRange(0, 200)
        .build()
    );

    private final Setting<Integer> maxAttempts = sgGeneral.add(new IntSetting.Builder()
        .name("max-attempts")
        .description("Gives up on a log and moves on after this many failed strip attempts.")
        .defaultValue(3)
        .min(1)
        .sliderRange(1, 10)
        .build()
    );

    private final Setting<Boolean> notify = sgGeneral.add(new BoolSetting.Builder()
        .name("notify")
        .description("Sends a chat message with the tree size when starting, and a summary when done.")
        .defaultValue(true)
        .build()
    );

    private final Long2ObjectMap<Block> remaining = new Long2ObjectOpenHashMap<>();
    private final Long2IntMap attempts = new Long2IntOpenHashMap();
    private final Long2IntMap retryCooldown = new Long2IntOpenHashMap();

    private Phase phase = Phase.IDLE;
    private BlockPos pendingPos;
    private BlockPos pendingStripPos;
    private Hand pendingHand;
    private BlockPos lastBaritoneTarget;
    private int ticksOnTarget;
    private int strippedCount;
    private int skippedCount;
    private boolean selfInteracting;

    // Verification: after a strip attempt, wait for the server's response before trusting it
    // actually worked, instead of assuming the click landed.
    private BlockPos verifyPos;
    private Block verifyOriginalBlock;
    private int verifyTicksLeft;

    public AutoStripper() {
        super(OnFocusAddon.CATEGORY, "auto-stripper", "Right-click a tree to automatically strip every log in it with an axe from your hotbar.");
    }

    private void report(String fmt, Object... args) {
        if (notify.get()) info(fmt, args);
    }

    private void refuse(String fmt, Object... args) {
        info(fmt, args);
        toggle();
    }

    @Override
    public void onActivate() {
        phase = Phase.SELECTING;
        remaining.clear();
        attempts.clear();
        retryCooldown.clear();
        pendingPos = null;
        lastBaritoneTarget = null;
        verifyPos = null;
        ticksOnTarget = 0;
        strippedCount = 0;
        skippedCount = 0;

        report("Right-click a log to pick the tree to strip.");
    }

    @Override
    public void onDeactivate() {
        phase = Phase.IDLE;
        remaining.clear();
        attempts.clear();
        retryCooldown.clear();
        pendingPos = null;
        lastBaritoneTarget = null;
        verifyPos = null;
        PathManagers.get().stop();
    }

    // Fires for the player's own right-clicks (real mouse input), not for this module's own
    // automated strips - those are wrapped in selfInteracting so they don't loop back here.
    @EventHandler
    private void onInteractBlock(InteractBlockEvent event) {
        if (selfInteracting || mc.player == null || mc.world == null) return;

        BlockPos pos = event.result.getBlockPos();
        Block block = mc.world.getBlockState(pos).getBlock();
        if (!isStrippable(block)) return;

        event.setCancelled(true);
        selectTree(pos, block);
    }

    private void selectTree(BlockPos originPos, Block originBlock) {
        PathManagers.get().stop();

        boolean diagonal = diagonalSearch.get();
        boolean exactType = matchExactType.get();
        int cap = maxBlocks.get();

        remaining.clear();
        remaining.put(originPos.asLong(), originBlock);

        ArrayDeque<BlockPos> queue = new ArrayDeque<>();
        queue.add(originPos);

        outer:
        while (!queue.isEmpty()) {
            BlockPos pos = queue.poll();

            for (int dx = -1; dx <= 1; dx++) {
                for (int dy = -1; dy <= 1; dy++) {
                    for (int dz = -1; dz <= 1; dz++) {
                        if (dx == 0 && dy == 0 && dz == 0) continue;
                        if (!diagonal && Math.abs(dx) + Math.abs(dy) + Math.abs(dz) > 1) continue;

                        BlockPos neighbor = pos.add(dx, dy, dz);
                        long key = neighbor.asLong();
                        if (remaining.containsKey(key)) continue;

                        Block neighborBlock = mc.world.getBlockState(neighbor).getBlock();
                        if (!isStrippable(neighborBlock)) continue;
                        if (exactType && neighborBlock != originBlock) continue;

                        remaining.put(key, neighborBlock);
                        queue.add(neighbor);

                        if (remaining.size() >= cap) break outer;
                    }
                }
            }
        }

        attempts.clear();
        retryCooldown.clear();
        verifyPos = null;

        phase = Phase.WORKING;
        pendingPos = null;
        lastBaritoneTarget = null;
        ticksOnTarget = 0;
        strippedCount = 0;
        skippedCount = 0;

        report("Selected a tree - (highlight)%d(default) log(s) to strip.", remaining.size());
    }

    @EventHandler
    private void onTick(TickEvent.Pre event) {
        if (phase != Phase.WORKING || mc.player == null || mc.world == null) return;

        tickRetryCooldowns();

        // Drop anything that clearly changed to something other than what we expect - broken or
        // griefed by someone else. The block currently being verified is exempt: its own change
        // (hopefully to the stripped form) is handled explicitly below, not treated as grief.
        remaining.long2ObjectEntrySet().removeIf(e -> {
            if (verifyPos != null && e.getLongKey() == verifyPos.asLong()) return false;
            return mc.world.getBlockState(BlockPos.fromLong(e.getLongKey())).getBlock() != e.getValue();
        });

        if (verifyPos != null) {
            if (--verifyTicksLeft > 0) return;

            checkVerification();
            return;
        }

        if (remaining.isEmpty()) {
            PathManagers.get().stop();
            report("Finished - stripped (highlight)%d(default) log(s)%s.", strippedCount,
                skippedCount > 0 ? (", skipped " + skippedCount) : "");
            toggle();
            return;
        }

        BlockPos target = nearestTarget();
        if (target == null) return; // everything left is cooling down for a retry

        if (!target.equals(pendingPos)) {
            pendingPos = target;
            ticksOnTarget = 0;
            lastBaritoneTarget = null;
        }

        double reach = mc.player.getBlockInteractionRange();
        double dist = Vec3d.ofCenter(target).distanceTo(mc.player.getEyePos());

        if (dist <= reach) {
            PathManagers.get().stop();
            Block original = remaining.get(target.asLong());
            strip(target);
            if (phase != Phase.WORKING) return; // refuse() (e.g. no axe) deactivated us

            verifyPos = target;
            verifyOriginalBlock = original;
            verifyTicksLeft = verifyDelay.get();
            pendingPos = null;
            return;
        }

        boolean canWalk = autoWalk.get() && !(PathManagers.get() instanceof NopPathManager);
        if (!canWalk) {
            remaining.remove(target.asLong());
            skippedCount++;
            pendingPos = null;
            return;
        }

        if (++ticksOnTarget > STUCK_TICKS) {
            PathManagers.get().stop();
            remaining.remove(target.asLong());
            skippedCount++;
            pendingPos = null;
            lastBaritoneTarget = null;
            return;
        }

        if (!target.equals(lastBaritoneTarget)) {
            PathManagers.get().moveTo(target, false);
            lastBaritoneTarget = target;
        }
    }

    private void tickRetryCooldowns() {
        if (retryCooldown.isEmpty()) return;

        var it = retryCooldown.long2IntEntrySet().iterator();
        while (it.hasNext()) {
            var e = it.next();
            int left = e.getIntValue() - 1;
            if (left <= 0) it.remove();
            else e.setValue(left);
        }
    }

    /** Checks whether the log we clicked verify-delay ticks ago actually turned into its stripped form. */
    private void checkVerification() {
        long key = verifyPos.asLong();

        if (hasBeenStripped(verifyPos, verifyOriginalBlock)) {
            strippedCount++;
            remaining.remove(key);
            attempts.remove(key);
        } else {
            int tries = attempts.get(key) + 1;

            if (tries >= maxAttempts.get()) {
                remaining.remove(key);
                attempts.remove(key);
                skippedCount++;
            } else {
                attempts.put(key, tries);
                retryCooldown.put(key, (int) retryDelay.get());
            }
        }

        verifyPos = null;
    }

    private boolean hasBeenStripped(BlockPos pos, Block originalBlock) {
        Block current = mc.world.getBlockState(pos).getBlock();
        if (current == originalBlock) return false;

        String originalPath = Registries.BLOCK.getId(originalBlock).getPath();
        String currentPath = Registries.BLOCK.getId(current).getPath();
        return currentPath.equals("stripped_" + originalPath);
    }

    private BlockPos nearestTarget() {
        Vec3d eyes = mc.player.getEyePos();
        BlockPos best = null;
        double bestDist = Double.MAX_VALUE;

        for (long key : remaining.keySet()) {
            if (retryCooldown.containsKey(key)) continue;

            BlockPos pos = BlockPos.fromLong(key);
            double dist = Vec3d.ofCenter(pos).squaredDistanceTo(eyes);
            if (dist < bestDist) {
                bestDist = dist;
                best = pos;
            }
        }

        return best;
    }

    private void strip(BlockPos pos) {
        FindItemResult axe = InvUtils.findInHotbar(stack ->
            stack.getItem() instanceof AxeItem && (!antiBreak.get() || stack.getDamage() < stack.getMaxDamage() - 1));

        if (!axe.found()) {
            refuse("No axe found in your hotbar.");
            return;
        }

        if (!InvUtils.swap(axe.slot(), true)) return;

        pendingStripPos = pos;
        pendingHand = axe.getHand();

        if (rotate.get()) Rotations.rotate(Rotations.getYaw(pos), Rotations.getPitch(pos), -100, this::doInteract);
        else doInteract();
    }

    private void doInteract() {
        BlockHitResult hitResult = new BlockHitResult(Vec3d.ofCenter(pendingStripPos), BlockUtils.getDirection(pendingStripPos), pendingStripPos, false);

        selfInteracting = true;
        BlockUtils.interact(hitResult, pendingHand, true);
        selfInteracting = false;

        InvUtils.swapBack();
    }

    // Deliberately not gated on BlockTags.LOGS - vanilla's axe-stripping map (AxeItem.STRIPPED_BLOCKS)
    // includes bamboo_block, but the "logs" tag doesn't, so a tag check silently ignores bamboo.
    // Checking for a registered "stripped_" counterpart mirrors what the axe actually does.
    private static boolean isStrippable(Block block) {
        Identifier id = Registries.BLOCK.getId(block);
        String path = id.getPath();
        if (path.startsWith("stripped_")) return false;

        return Registries.BLOCK.containsId(Identifier.of(id.getNamespace(), "stripped_" + path));
    }

    @Override
    public String getInfoString() {
        return switch (phase) {
            case IDLE -> null;
            case SELECTING -> "select a tree";
            case WORKING -> remaining.size() + " left";
        };
    }

    private enum Phase {
        IDLE,
        SELECTING,
        WORKING
    }
}
