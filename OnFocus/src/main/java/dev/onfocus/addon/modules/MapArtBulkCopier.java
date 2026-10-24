package dev.onfocus.addon.modules;

import dev.onfocus.addon.OnFocusAddon;
import it.unimi.dsi.fastutil.ints.IntOpenHashSet;
import it.unimi.dsi.fastutil.ints.IntSet;
import meteordevelopment.meteorclient.events.packets.PacketEvent;
import meteordevelopment.meteorclient.events.world.TickEvent;
import meteordevelopment.meteorclient.settings.BlockPosSetting;
import meteordevelopment.meteorclient.settings.BoolSetting;
import meteordevelopment.meteorclient.settings.IntSetting;
import meteordevelopment.meteorclient.settings.Setting;
import meteordevelopment.meteorclient.settings.SettingGroup;
import meteordevelopment.meteorclient.systems.modules.Module;
import meteordevelopment.meteorclient.utils.player.Rotations;
import meteordevelopment.orbit.EventHandler;
import net.minecraft.client.network.PlayerListEntry;
import net.minecraft.component.DataComponentTypes;
import net.minecraft.component.type.BundleContentsComponent;
import net.minecraft.component.type.MapIdComponent;
import net.minecraft.item.BundleItem;
import net.minecraft.item.ItemStack;
import net.minecraft.item.Items;
import net.minecraft.nbt.NbtCompound;
import net.minecraft.nbt.NbtElement;
import net.minecraft.nbt.NbtList;
import net.minecraft.network.packet.s2c.play.InventoryS2CPacket;
import net.minecraft.network.packet.s2c.play.ScreenHandlerSlotUpdateS2CPacket;
import net.minecraft.network.packet.s2c.play.SetCursorItemS2CPacket;
import net.minecraft.network.packet.s2c.play.SetPlayerInventoryS2CPacket;
import net.minecraft.screen.ScreenHandler;
import net.minecraft.screen.slot.Slot;
import net.minecraft.screen.slot.SlotActionType;
import net.minecraft.util.Hand;
import net.minecraft.util.hit.BlockHitResult;
import net.minecraft.util.hit.HitResult;
import net.minecraft.util.math.BlockPos;
import net.minecraft.util.math.Direction;
import net.minecraft.util.math.Vec3d;

import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Deque;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Predicate;

/**
 * Copies a whole chest of map art bundles: one copy of every map (by map id, so a map met twice is
 * copied once) goes into empty bundles, which are put into an output storage. Empty maps and empty
 * bundles come from two storages of their own. The source chest is left as it was: each bundle
 * goes back into the slot it came from, with its maps in the same order.
 * <p>
 * The five containers are opened where the player stands, so all must be within reach. Their
 * positions are settings; left at 0 0 0, they're learnt when the module is turned on - it asks for
 * each container in turn to be opened.
 * <p>
 * A few source bundles are taken at a time and worked on one after the other. A bundle is emptied
 * into the work chest (what doesn't fit, into the inventory), its maps are brought into the
 * inventory a batch at a time, copied in the 2x2 crafting grid (a stack of empty maps stays in its
 * second slot) and the copies put into an output bundle. Maps come out of a bundle from the top and
 * go back in on top, so in the end they go back in reverse, straight from the work chest and the
 * inventory, which leaves the bundle as it was.
 * <p>
 * Items only ever move through the cursor into a slot picked here: a shift click lets the server
 * pick the slot, and one behind ViaVersion picks another than the client guesses, leaving items in
 * the client's inventory that aren't there. Every step is worked out from what the slots hold, so
 * when the server undoes clicks or the player leaves the game, it waits for the slots to settle and
 * goes on from what it finds; when that keeps happening it opens the work chest once, which makes
 * the server send the whole inventory again. The maps copied and the source bundles out of the
 * chest are kept in the config, so it carries on after a restart too. Running out of maps, bundles
 * or room only makes it wait and try again; a state it can't make sense of stops it until it's
 * turned on again.
 */
public class MapArtBulkCopier extends Module {
    private final SettingGroup sgGeneral = settings.getDefaultGroup();
    private final SettingGroup sgStorage = settings.createGroup("Storage");

    private final Setting<BlockPos> sourceChest = sgStorage.add(new BlockPosSetting.Builder()
        .name("source-chest")
        .description("The chest with the map art bundles to copy. At 0 0 0 it's learnt: open it when asked.")
        .defaultValue(BlockPos.ORIGIN)
        .build()
    );

    private final Setting<BlockPos> workChest = sgStorage.add(new BlockPosSetting.Builder()
        .name("work-chest")
        .description("An empty chest a bundle's maps are laid out in while they're copied - a double one takes a full bundle. At 0 0 0 it's learnt.")
        .defaultValue(BlockPos.ORIGIN)
        .build()
    );

    private final Setting<BlockPos> mapsStorage = sgStorage.add(new BlockPosSetting.Builder()
        .name("empty-maps-storage")
        .description("The container empty maps are taken from. At 0 0 0 it's learnt: open it when asked.")
        .defaultValue(BlockPos.ORIGIN)
        .build()
    );

    private final Setting<BlockPos> bundlesStorage = sgStorage.add(new BlockPosSetting.Builder()
        .name("empty-bundles-storage")
        .description("The container empty bundles for the copies are taken from. At 0 0 0 it's learnt: open it when asked.")
        .defaultValue(BlockPos.ORIGIN)
        .build()
    );

    private final Setting<BlockPos> outputStorage = sgStorage.add(new BlockPosSetting.Builder()
        .name("output-storage")
        .description("The container the bundles of copies go into. At 0 0 0 it's learnt: open it when asked.")
        .defaultValue(BlockPos.ORIGIN)
        .build()
    );

    private final Setting<Integer> mapStacks = sgGeneral.add(new IntSetting.Builder()
        .name("empty-map-stacks")
        .description("Stacks of empty maps kept in the inventory.")
        .defaultValue(4)
        .range(1, 16)
        .sliderRange(1, 8)
        .build()
    );

    private final Setting<Integer> spareBundles = sgGeneral.add(new IntSetting.Builder()
        .name("spare-bundles")
        .description("Empty bundles for the copies kept in the inventory.")
        .defaultValue(2)
        .range(1, 9)
        .sliderRange(1, 9)
        .build()
    );

    private final Setting<Integer> bundlesPerTrip = sgGeneral.add(new IntSetting.Builder()
        .name("bundles-per-trip")
        .description("Source bundles taken out of the chest at a time.")
        .defaultValue(4)
        .range(1, 16)
        .sliderRange(1, 8)
        .build()
    );

    private final Setting<Boolean> waitForServer = sgGeneral.add(new BoolSetting.Builder()
        .name("wait-for-server")
        .description("Each click waits for the server's answer (your ping) before the next. Slower, but the server's late answers can't undo the work.")
        .defaultValue(true)
        .build()
    );

    private final Setting<Integer> clicksPerTick = sgGeneral.add(new IntSetting.Builder()
        .name("clicks-per-tick")
        .description("Inventory clicks sent per tick without waiting for the server. Lower it if the server kicks or desyncs you.")
        .defaultValue(2)
        .range(1, 20)
        .sliderRange(1, 10)
        .visible(() -> !waitForServer.get())
        .build()
    );

    private final Setting<Boolean> forgetProgress = sgGeneral.add(new BoolSetting.Builder()
        .name("forget-progress")
        .description("Switch on to forget which maps were copied, so the next run copies everything again. Only while the module is off.")
        .defaultValue(false)
        .onChanged(value -> {
            if (value) forget();
        })
        .build()
    );

    /** Player screen handler slots: the crafting result and the 2x2 grid. */
    private static final int RESULT = 0;
    private static final int GRID_MAP = 1;
    private static final int GRID_EMPTIES = 2;
    private static final int GRID_LAST = 4;

    /** Ticks a container is given after it opens for the server to fill its slots. */
    private static final int OPEN_DELAY = 5;
    private static final int OPEN_TIMEOUT = 60;
    private static final int RESULT_TIMEOUT = 100;
    private static final int SETTLE_TICKS = 10;
    private static final int QUIET_TICKS = 2;
    /** Corrections in a row without anything done before it stops. */
    private static final int MAX_RECOVERIES = 8;
    /** Ticks before trying again after running out of something. */
    private static final int RETRY_TICKS = 200;
    /** Free slots kept for the work when taking source bundles. */
    private static final int WORK_SLOTS = 6;

    private enum Trip { OUTPUT, BUNDLES, MAPS, SOURCE, WORK, RESYNC }

    /** What the source bundle on the cursor is doing in the work chest. */
    private enum BundleOp { NONE, UNLOAD, RESTORE }

    private enum Result { NEXT, AGAIN, WAIT, FAIL }

    private interface Step {
        Result run();
    }

    /** A source bundle out of the chest: where it came from, its maps top first as they were, and where they are. */
    private static final class Job {
        final int chestSlot;
        final int[] ids;
        final int[] counts;
        /** The work chest slot each stack was put in, -1 if it went into the inventory. */
        final int[] workSlots;
        int slot;
        /** Its maps are on their way back into it. */
        boolean restoring;
        boolean done;

        Job(int chestSlot, int[] ids, int[] counts, int slot) {
            this.chestSlot = chestSlot;
            this.ids = ids;
            this.counts = counts;
            this.workSlots = new int[ids.length];
            Arrays.fill(workSlots, -1);
            this.slot = slot;
        }

        int indexOf(int id) {
            for (int i = 0; i < ids.length; i++) {
                if (ids[i] == id) return i;
            }
            return -1;
        }
    }

    /**
     * Where a job's maps are now: the bundle holds ids[t..], the stacks before it are in the work
     * chest or, these ones, loose in the inventory.
     */
    private record View(int t, Map<Integer, List<Integer>> loose) {}

    /** Map ids whose copy is in an output bundle; kept in the config. */
    private final IntSet copied = new IntOpenHashSet();
    private final List<Job> jobs = new ArrayList<>();

    private final Deque<Step> steps = new ArrayDeque<>();
    private boolean running;
    private boolean halted;
    private int learning = -1;
    private ScreenHandler learnt;

    private boolean recovering;
    private int settleTicks;
    private int recoveries;
    private String failReason;
    /** Open a container once, so the server sends the whole inventory again. */
    private boolean resync;

    private long retryAt;
    private String waitReason;

    /** Copies done, nothing left to take: the leftovers are put away. */
    private boolean finishing;
    private boolean mapsDry;
    private boolean bundlesDry;
    /** The bundles and output storages were looked into since it was turned on: maps in bundles there count as copied. */
    private boolean bundlesSeen;
    private boolean outputSeen;

    private ScreenHandler container;
    private long openedAt;
    private long interactAt;
    private int opens;
    private int tripClicks;
    private long resultDeadline;
    private BundleOp bundleOp = BundleOp.NONE;

    /** A move of one stack through the cursor in a container: the slot it goes to, and what's done after. */
    private int moveTo = -1;
    private Runnable afterMove;

    private int clicks;
    private volatile boolean slotsArrived;
    private long lastClick;
    private long lastSlots;
    private long ticks;
    private int copiesMade;

    public MapArtBulkCopier() {
        super(OnFocusAddon.CATEGORY, "map-art-bulk-copier", "Copies every map from a chest of map art bundles into bundles of copies, with a work chest and storages for empty maps, empty bundles and the copies.");
    }

    private List<Setting<BlockPos>> storages() {
        return List.of(sourceChest, workChest, mapsStorage, bundlesStorage, outputStorage);
    }

    private static String storageName(int i) {
        return switch (i) {
            case 0 -> "source chest with the map art bundles";
            case 1 -> "empty work chest";
            case 2 -> "storage with empty maps";
            case 3 -> "storage with empty bundles";
            default -> "output storage for the bundles of copies";
        };
    }

    @Override
    public void onActivate() {
        running = false;
        halted = false;
        steps.clear();
        container = null;
        moveTo = -1;
        afterMove = null;
        bundleOp = BundleOp.NONE;
        waitReason = null;
        retryAt = 0;
        if (mc.player == null) return;

        learning = -1;
        List<Setting<BlockPos>> storages = storages();
        for (int i = 0; i < storages.size(); i++) {
            if (storages.get(i).get().equals(BlockPos.ORIGIN)) {
                learning = i;
                break;
            }
        }
        if (learning != -1) {
            learnt = mc.player.currentScreenHandler;
            info("Open the (highlight)%s(default).", storageName(learning));
            return;
        }
        start();
    }

    private void start() {
        forgetMissingJobs();
        boolean fresh = copied.isEmpty() && jobs.isEmpty();
        if (fresh) {
            for (int i = 0; i < 36; i++) {
                ItemStack stack = inv(i);
                BundleContentsComponent contents = stack.get(DataComponentTypes.BUNDLE_CONTENTS);
                if (isMap(stack) || (contents != null && !contents.isEmpty())) {
                    error("Put away the filled maps and full bundles in your inventory first - they'd be taken for the copier's.");
                    toggle();
                    return;
                }
            }
            finishing = false;
            copiesMade = 0;
            info("Copying the map art in the source chest.");
        } else {
            info("Carrying on - %d map(s) copied so far, %d source bundle(s) out of the chest.", copied.size(), jobs.size());
        }
        mapsDry = false;
        bundlesDry = false;
        bundlesSeen = false;
        outputSeen = false;
        recoveries = 0;
        resync = false;
        ticks = 0;
        lastClick = Long.MIN_VALUE / 2;
        lastSlots = Long.MIN_VALUE / 2;
        running = true;
        // The server may still be sending the slots after joining
        recovering = true;
        settleTicks = 0;
    }

    /**
     * Source bundles kept in the config that aren't in the inventory any more - put back by hand
     * while the module was off - are forgotten. A bundle counts as there if its slot holds a bundle
     * with the end of its maps, or another slot one with some of them, or its maps lie loose.
     */
    private void forgetMissingJobs() {
        Map<Integer, List<Integer>> loose = looseMaps();
        List<Job> missing = new ArrayList<>();
        for (Job job : jobs) {
            BundleContentsComponent own = contents(inv(job.slot));
            if (own != null && own.size() <= job.ids.length && holdsSuffix(own, job)) continue;
            boolean found = false;
            for (int id : job.ids) found |= loose.containsKey(id);
            for (int i = 0; i < 36 && !found; i++) {
                BundleContentsComponent other = contents(inv(i));
                found = other != null && !other.isEmpty() && other.size() <= job.ids.length && holdsSuffix(other, job);
            }
            if (!found) missing.add(job);
        }
        if (missing.isEmpty()) return;
        for (Job job : missing) {
            OnFocusAddon.LOG.warn("[MapArtBulkCopier] Forgetting the source bundle from chest slot {}: not in the inventory ({})", job.chestSlot, describeInventory());
        }
        jobs.removeAll(missing);
        warning("%d source bundle(s) taken out earlier aren't in your inventory any more - forgot them. Make sure they're back in their source chest slots.", missing.size());
    }

    @Override
    public void onDeactivate() {
        learning = -1;
        if (!running) return;
        running = false;
        steps.clear();
        if (mc.player != null && mc.interactionManager != null && mc.getNetworkHandler() != null) {
            putCursorDownNow();
            if (mc.player.currentScreenHandler != mc.player.playerScreenHandler) mc.player.closeHandledScreen();
        }
        warning("Stopped - %d map(s) copied so far. Turn it on again to carry on.", copied.size());
    }

    private void forget() {
        if (isActive()) warning("Turn the module off first.");
        else if (!jobs.isEmpty()) warning("%d source bundle(s) are still out of the chest - let the copier put them back first.", jobs.size());
        else {
            copied.clear();
            finishing = false;
            info("Forgot the copied maps - the next run copies everything again.");
        }
        forgetProgress.set(false);
    }

    @EventHandler
    private void onTick(TickEvent.Pre event) {
        if (mc.player == null || mc.interactionManager == null) return;
        if (learning != -1) {
            learn();
            return;
        }
        if (!running) return;
        ticks++;
        if (slotsArrived) {
            slotsArrived = false;
            lastSlots = ticks;
        }
        if (ticks < retryAt) return;
        if (waitForServer.get() && (ticks - lastClick < roundTripTicks() || ticks - lastSlots < QUIET_TICKS)) return;

        if (recovering) {
            recoverTick();
            return;
        }

        clicks = 0;
        int budget = waitForServer.get() ? 1 : clicksPerTick.get();
        for (int guard = 0; running && !recovering && clicks < budget && guard < 64 && ticks >= retryAt; guard++) {
            // The player's own inventory, chat or menu is open: the inventory is theirs until it's closed
            if (mc.player.currentScreenHandler == mc.player.playerScreenHandler && mc.currentScreen != null) break;
            if (steps.isEmpty()) {
                plan();
                if (steps.isEmpty()) break;
            }
            Result result = steps.peek().run();
            if (result == Result.NEXT) steps.poll();
            else if (result == Result.WAIT) break;
            else if (result == Result.FAIL) recover(failReason);
        }
    }

    /** The server's slot updates: with wait-for-server, the next click waits until they stop coming. Comes on the network thread. */
    @EventHandler
    private void onPacket(PacketEvent.Receive event) {
        if (event.packet instanceof InventoryS2CPacket || event.packet instanceof ScreenHandlerSlotUpdateS2CPacket
            || event.packet instanceof SetCursorItemS2CPacket || event.packet instanceof SetPlayerInventoryS2CPacket) {
            slotsArrived = true;
        }
    }

    private int roundTripTicks() {
        PlayerListEntry entry = mc.getNetworkHandler() == null ? null : mc.getNetworkHandler().getPlayerListEntry(mc.player.getUuid());
        int latency = entry == null ? 150 : entry.getLatency();
        return Math.clamp((latency + 49) / 50 + 1, 2, 40);
    }

    /** Takes the position of each container the player opens for the storage asked for. */
    private void learn() {
        ScreenHandler open = mc.player.currentScreenHandler;
        if (open == mc.player.playerScreenHandler || open == learnt) return;
        learnt = open;
        if (!(mc.crosshairTarget instanceof BlockHitResult hit) || hit.getType() != HitResult.Type.BLOCK) {
            warning("Open it by looking at it - close this and try again.");
            return;
        }
        BlockPos pos = hit.getBlockPos();
        List<Setting<BlockPos>> storages = storages();
        for (int i = 0; i < storages.size(); i++) {
            if (i != learning && storages.get(i).get().equals(pos)) {
                warning("That's the %s already - open the (highlight)%s(default).", storageName(i), storageName(learning));
                return;
            }
        }
        storages.get(learning).set(pos);
        info("The %s is at %d %d %d.", storageName(learning), pos.getX(), pos.getY(), pos.getZ());
        mc.player.closeHandledScreen();

        int next = -1;
        for (int i = learning + 1; i < storages.size(); i++) {
            if (storages.get(i).get().equals(BlockPos.ORIGIN)) {
                next = i;
                break;
            }
        }
        learning = next;
        if (learning != -1) info("Open the (highlight)%s(default).", storageName(learning));
        else start();
    }

    // Planning

    /** Queues the next piece of work, worked out from what the slots hold now. */
    private void plan() {
        if (mc.player.currentScreenHandler != mc.player.playerScreenHandler) {
            steps.add(this::close);
            return;
        }
        // The player's own screen: the inventory, chat or a menu - wait until it's closed
        if (mc.currentScreen != null) return;
        if (!cursor().isEmpty()) {
            steps.add(putDown(-1));
            return;
        }
        for (int id = GRID_MAP; id <= GRID_LAST; id++) {
            ItemStack stack = slot(id);
            if (!stack.isEmpty() && !(id == GRID_EMPTIES && stack.isOf(Items.MAP))) {
                clearGrid(id);
                return;
            }
        }
        if (resync) {
            resync = false;
            trip(Trip.RESYNC);
            return;
        }
        // Copies made before - by hand or a run since forgotten - are looked for before anything is copied
        if (!bundlesSeen) {
            trip(Trip.BUNDLES);
            return;
        }
        if (!outputSeen) {
            trip(Trip.OUTPUT);
            return;
        }

        Job job = activeJob();
        if (job != null) planJob(job);
        else planTrips();
    }

    /** The inventory part of a job: the maps brought out of the work chest are copied, then it's back to the chest. */
    private void planJob(Job job) {
        View view = view(job);
        if (view == null) return;

        // Each stack brought out must lie as one stack of the originals and single copies
        for (Map.Entry<Integer, List<Integer>> entry : view.loose().entrySet()) {
            int count = job.counts[job.indexOf(entry.getKey())];
            if (total(entry.getValue()) < count) {
                recover("maps taken out of a bundle are missing");
                return;
            }
            if (!canonical(entry.getValue(), count)) {
                normalize(entry.getValue(), count);
                return;
            }
        }

        int toCopy = -1;
        boolean extras = false;
        for (Map.Entry<Integer, List<Integer>> entry : view.loose().entrySet()) {
            int idx = job.indexOf(entry.getKey());
            if (total(entry.getValue()) > job.counts[idx]) extras = true;
            else if (toCopy == -1 && !copied.contains(job.ids[idx])) toCopy = idx;
        }

        // Copies left loose by a correction go into a bundle before anything else is copied
        if (extras) {
            flush(job, view);
            return;
        }
        if (toCopy != -1) {
            if (!slot(GRID_EMPTIES).isOf(Items.MAP)) {
                int maps = findInv(-1, s -> s.isOf(Items.MAP));
                if (maps == -1) trip(Trip.MAPS);
                else stockGrid(maps);
                return;
            }
            int out = findOutput(false);
            if (out == -1) out = findSpare();
            if (out == -1) {
                trip(Trip.BUNDLES);
                return;
            }
            copy(original(view.loose().get(job.ids[toCopy]), job.counts[toCopy]), job.ids[toCopy], out);
            return;
        }
        if (freeSlots() < 2 && findOutput(true) != -1) {
            trip(Trip.OUTPUT);
            return;
        }
        trip(Trip.WORK);
    }

    private void planTrips() {
        if (findOutput(true) != -1 || (finishing && findAnyOutput() != -1)) {
            trip(Trip.OUTPUT);
            return;
        }
        if (!finishing) {
            if (spares() < spareBundles.get() && !bundlesDry) trip(Trip.BUNDLES);
            else if (emptyMaps() < mapStacks.get() * 64 && !mapsDry) trip(Trip.MAPS);
            else trip(Trip.SOURCE);
            return;
        }
        if (!jobs.isEmpty()) trip(Trip.SOURCE);
        else if (spares() > 0) trip(Trip.BUNDLES);
        else if (emptyMaps() > 0) trip(Trip.MAPS);
        else finish();
    }

    private Job activeJob() {
        for (Job job : jobs) {
            if (!job.done) return job;
        }
        return null;
    }

    /** Where the job's maps are, or null (after starting a recovery) if the bundle doesn't hold what it should. */
    private View view(Job job) {
        int m = job.ids.length;
        BundleContentsComponent source = contents(inv(job.slot));
        if (source == null) {
            // Moved, most likely off the cursor when the game was left: found by its maps, an empty one last
            int found = -1;
            for (int i = 0; i < 36; i++) {
                if (isJobSlot(i)) continue;
                BundleContentsComponent other = contents(inv(i));
                if (other == null || other.size() > m || !holdsSuffix(other, job)) continue;
                if (found == -1 || !other.isEmpty()) found = i;
                if (!other.isEmpty()) break;
            }
            if (found == -1) {
                recover("the source bundle from chest slot " + job.chestSlot + " isn't in the inventory");
                return null;
            }
            OnFocusAddon.LOG.warn("[MapArtBulkCopier] Source bundle from chest slot {} moved from slot {} to {}", job.chestSlot, job.slot, found);
            job.slot = found;
            source = contents(inv(found));
        }
        if (source.size() > m || !holdsSuffix(source, job)) {
            recover("the source bundle from chest slot " + job.chestSlot + " doesn't hold what it should");
            return null;
        }
        int t = m - source.size();

        Map<Integer, List<Integer>> loose = looseMaps();
        for (Map.Entry<Integer, List<Integer>> entry : loose.entrySet()) {
            int idx = job.indexOf(entry.getKey());
            if (idx == -1 || idx >= t) {
                halt("There's a filled map in inventory slot " + entry.getValue().getFirst() + " that doesn't belong to the bundle being copied - put it away and turn the module on again.");
                return null;
            }
        }
        return new View(t, loose);
    }

    /** Filled maps lying in the inventory, by map id. */
    private Map<Integer, List<Integer>> looseMaps() {
        Map<Integer, List<Integer>> loose = new HashMap<>();
        for (int i = 0; i < 36; i++) {
            if (isMap(inv(i))) loose.computeIfAbsent(mapId(inv(i)), k -> new ArrayList<>()).add(i);
        }
        return loose;
    }

    private static boolean holdsSuffix(BundleContentsComponent contents, Job job) {
        int t = job.ids.length - contents.size();
        for (int k = 0; k < contents.size(); k++) {
            if (!matches(contents.get(k), job.ids[t + k], job.counts[t + k])) return false;
        }
        return true;
    }

    private static boolean matches(ItemStack stack, int id, int count) {
        return isMap(stack) && mapId(stack) == id && stack.getCount() == count;
    }

    /** One stack of all the originals, and every other map a single copy. */
    private boolean canonical(List<Integer> slots, int count) {
        boolean original = false;
        for (int i : slots) {
            int c = inv(i).getCount();
            if (c == count && !original) original = true;
            else if (c != 1) return false;
        }
        return original;
    }

    /** The slot with the stack of originals. */
    private int original(List<Integer> slots, int count) {
        for (int i : slots) {
            if (inv(i).getCount() == count) return i;
        }
        return slots.getFirst();
    }

    private int total(List<Integer> slots) {
        int total = 0;
        if (slots != null) for (int i : slots) total += inv(i).getCount();
        return total;
    }

    // Work in the inventory

    private void stockGrid(int maps) {
        steps.add(pick(maps));
        steps.add(() -> {
            if (!cursor().isOf(Items.MAP) || !slot(GRID_EMPTIES).isEmpty()) return fail("the empty maps didn't get to the crafting grid");
            click(GRID_EMPTIES, 0, SlotActionType.PICKUP);
            return Result.NEXT;
        });
        steps.add(this::progress);
    }

    /**
     * Copies the stack in this slot once: it comes back as it was, and the copy goes straight off
     * the cursor into the output bundle, which takes what the cursor holds when clicked.
     */
    private void copy(int original, int id, int bundle) {
        steps.add(pick(original));
        steps.add(() -> {
            if (!isMap(cursor()) || !slot(GRID_MAP).isEmpty()) return fail("the map didn't get to the crafting grid");
            click(GRID_MAP, 0, SlotActionType.PICKUP);
            resultDeadline = ticks + RESULT_TIMEOUT;
            return Result.NEXT;
        });
        steps.add(() -> {
            ItemStack result = slot(RESULT);
            if (isMap(result) && mapId(result) == id && result.getCount() == 2) {
                click(RESULT, 0, SlotActionType.PICKUP);
                return Result.NEXT;
            }
            return ticks > resultDeadline ? fail("the server didn't show the crafting result") : Result.WAIT;
        });
        steps.add(() -> {
            if (!isMap(cursor()) || cursor().getCount() != 2 || !inv(original).isEmpty()) return fail("the copies aren't on the cursor");
            // A right click leaves one map: the original
            clickInv(original, 1, SlotActionType.PICKUP);
            return Result.NEXT;
        });
        steps.add(() -> {
            if (!isMap(cursor()) || cursor().getCount() != 1) return fail("the copy isn't on the cursor");
            if (contents(inv(bundle)) == null || !fits(inv(bundle), cursor())) return fail("the output bundle has no room for the copy");
            clickInv(bundle, 0, SlotActionType.PICKUP);
            if (!cursor().isEmpty()) return fail("the output bundle didn't take the copy");
            copied.add(id);
            copiesMade++;
            return Result.NEXT;
        });
        // The rest of a stack of originals stayed in the grid
        steps.add(() -> {
            if (!slot(GRID_MAP).isEmpty()) click(GRID_MAP, 0, SlotActionType.PICKUP);
            return Result.NEXT;
        });
        steps.add(() -> {
            if (cursor().isEmpty()) return Result.NEXT;
            clickInv(original, 0, SlotActionType.PICKUP);
            return cursor().isEmpty() ? Result.NEXT : fail("the originals didn't go back together");
        });
        steps.add(this::progress);
    }

    /**
     * Puts copies left lying loose (a correction put the cursor down) into an output bundle, which
     * takes a slot's stack on a left click.
     */
    private void flush(Job job, View view) {
        int out = findOutput(false);
        if (out == -1) out = findSpare();
        if (out == -1) {
            trip(Trip.BUNDLES);
            return;
        }
        int bundle = out;
        steps.add(pick(bundle));
        for (Map.Entry<Integer, List<Integer>> entry : view.loose().entrySet()) {
            int id = entry.getKey();
            int original = original(entry.getValue(), job.counts[job.indexOf(id)]);
            for (int i : entry.getValue()) {
                if (i == original) continue;
                steps.add(() -> {
                    ItemStack held = cursor();
                    if (contents(held) == null) return fail("the output bundle isn't on the cursor");
                    // A full bundle goes back as it is, the rest of the copies wait for the next one
                    if (!isMap(inv(i)) || !fits(held, inv(i))) return Result.NEXT;
                    clickInv(i, 0, SlotActionType.PICKUP);
                    if (inv(i).isEmpty()) {
                        copied.add(id);
                        copiesMade++;
                    }
                    return Result.NEXT;
                });
            }
        }
        steps.add(place(bundle));
        steps.add(this::progress);
    }

    /** Brings the maps of one map id lying loose back to one stack of the originals and single copies. */
    private void normalize(List<Integer> slots, int count) {
        int main = original(slots, count);
        for (int i : slots) {
            if (inv(main).getCount() != count && inv(i).getCount() > inv(main).getCount()) main = i;
        }
        int mainCount = inv(main).getCount();
        OnFocusAddon.LOG.warn("[MapArtBulkCopier] Tidying maps in slots {} ({} originals)", slots, count);

        int split = -1, extra = 0;
        if (mainCount > count) {
            split = main;
            extra = mainCount - count;
        } else if (mainCount == count) {
            for (int i : slots) {
                if (i != main && inv(i).getCount() > 1) {
                    split = i;
                    extra = inv(i).getCount() - 1;
                    break;
                }
            }
        }

        if (split != -1) {
            // Single maps off the stack with right clicks, the rest back into its slot
            int from = split;
            steps.add(pick(from));
            for (int j = 0; j < extra; j++) {
                steps.add(() -> {
                    int free = findFree(from);
                    if (free == -1) return fail("no free slot to split the maps into");
                    clickInv(free, 1, SlotActionType.PICKUP);
                    return Result.NEXT;
                });
            }
            steps.add(place(from));
        } else {
            int into = main;
            int from = slots.stream().filter(i -> i != into).findFirst().orElse(-1);
            if (from == -1) {
                recover("maps taken out of a bundle are missing");
                return;
            }
            steps.add(pick(from));
            steps.add(() -> {
                clickInv(into, 0, SlotActionType.PICKUP);
                return Result.NEXT;
            });
            steps.add(() -> {
                if (cursor().isEmpty()) return Result.NEXT;
                if (!inv(from).isEmpty()) return fail("the slot the maps came from isn't free");
                clickInv(from, 0, SlotActionType.PICKUP);
                return Result.NEXT;
            });
        }
    }

    private Step pick(int i) {
        return () -> {
            if (!cursor().isEmpty()) return fail("the cursor isn't empty");
            if (inv(i).isEmpty()) return fail("inventory slot " + i + " is empty");
            clickInv(i, 0, SlotActionType.PICKUP);
            return Result.NEXT;
        };
    }

    private Step place(int i) {
        return () -> {
            if (cursor().isEmpty()) return fail("the cursor is empty");
            if (!inv(i).isEmpty()) return fail("inventory slot " + i + " isn't free");
            clickInv(i, 0, SlotActionType.PICKUP);
            return Result.NEXT;
        };
    }

    /** Puts the cursor into a free inventory slot. */
    private Step putDown(int except) {
        return () -> {
            if (cursor().isEmpty()) return Result.NEXT;
            int free = findFree(except);
            if (free == -1) return fail("no free slot to put the cursor down");
            clickInv(free, 0, SlotActionType.PICKUP);
            return Result.NEXT;
        };
    }

    /** Takes a crafting grid slot into a free inventory slot - no shift click, see the class comment. */
    private void clearGrid(int id) {
        steps.add(() -> {
            if (slot(id).isEmpty()) return Result.NEXT;
            if (!cursor().isEmpty()) return fail("the cursor isn't empty");
            click(id, 0, SlotActionType.PICKUP);
            return Result.NEXT;
        });
        steps.add(putDown(-1));
    }

    private Result progress() {
        recoveries = 0;
        waitReason = null;
        return Result.NEXT;
    }

    private void needRoom() {
        if (findOutput(true) != -1) trip(Trip.OUTPUT);
        else waitFor("Your inventory is full - free up a few slots.");
    }

    // Trips to the containers

    private BlockPos storage(Trip trip) {
        return switch (trip) {
            case OUTPUT -> outputStorage.get();
            case BUNDLES -> bundlesStorage.get();
            case MAPS -> mapsStorage.get();
            case SOURCE -> sourceChest.get();
            case WORK, RESYNC -> workChest.get();
        };
    }

    private void trip(Trip trip) {
        container = null;
        interactAt = 0;
        opens = 0;
        tripClicks = 0;
        moveTo = -1;
        afterMove = null;
        bundleOp = BundleOp.NONE;
        // The grid is only reachable in the inventory: its empty maps go back first
        for (int id = GRID_MAP; id <= GRID_LAST; id++) clearGrid(id);
        steps.add(() -> open(storage(trip)));
        steps.add(() -> {
            if (mc.player.currentScreenHandler != container) return fail("the container closed");
            return work(trip);
        });
        steps.add(this::close);
        if (trip == Trip.SOURCE) {
            steps.add(() -> {
                mapsDry = false;
                bundlesDry = false;
                return Result.NEXT;
            });
        }
    }

    private Result open(BlockPos pos) {
        ScreenHandler open = mc.player.currentScreenHandler;
        if (open != mc.player.playerScreenHandler) {
            if (container == null) {
                container = open;
                openedAt = ticks;
                // Only the clicks in the container tell whether the trip did anything
                tripClicks = 0;
            }
            return ticks - openedAt >= OPEN_DELAY ? Result.NEXT : Result.WAIT;
        }
        if (mc.currentScreen != null) return Result.WAIT;
        if (interactAt != 0 && ticks - interactAt < OPEN_TIMEOUT) return Result.WAIT;
        if (mc.world.getBlockEntity(pos) == null) {
            waitFor(String.format("There's no container at %d %d %d (or it isn't loaded) - fix the storage positions.", pos.getX(), pos.getY(), pos.getZ()));
            return Result.WAIT;
        }
        if (!mc.player.canInteractWithBlockAt(pos, 0)) {
            waitFor(String.format("Stand within reach of the container at %d %d %d.", pos.getX(), pos.getY(), pos.getZ()));
            return Result.WAIT;
        }
        if (mc.player.isSneaking()) {
            waitFor("Stop sneaking - a container doesn't open while sneaking.");
            return Result.WAIT;
        }
        if (opens++ >= 3) {
            opens = 0;
            waitFor(String.format("The container at %d %d %d doesn't open.", pos.getX(), pos.getY(), pos.getZ()));
            return Result.WAIT;
        }

        Vec3d center = Vec3d.ofCenter(pos);
        Vec3d eye = mc.player.getEyePos();
        Direction side = Direction.getFacing(eye.x - center.x, eye.y - center.y, eye.z - center.z);
        Vec3d at = center.add(side.getOffsetX() * 0.5, side.getOffsetY() * 0.5, side.getOffsetZ() * 0.5);
        BlockHitResult hit = new BlockHitResult(at, side, pos, false);
        Rotations.rotate(Rotations.getYaw(at), Rotations.getPitch(at), () -> mc.interactionManager.interactBlock(mc.player, Hand.MAIN_HAND, hit));
        interactAt = ticks;
        lastClick = ticks;
        return Result.WAIT;
    }

    private Result close() {
        if (mc.player.currentScreenHandler != mc.player.playerScreenHandler) {
            if (!cursor().isEmpty()) {
                int free = findFree(-1);
                if (free == -1) return fail("no free slot to put the cursor down");
                clickInv(free, 0, SlotActionType.PICKUP);
                return Result.AGAIN;
            }
            mc.player.closeHandledScreen();
            lastClick = ticks;
        }
        container = null;
        return Result.NEXT;
    }

    /** One click of the work in an open container; NEXT when there's nothing more to do in it. */
    private Result work(Trip trip) {
        if (bundleOp != BundleOp.NONE) return bundleStep();
        if (!cursor().isEmpty()) {
            if (moveTo == -1) return fail("the cursor holds something");
            if (!slot(moveTo).isEmpty()) return fail("the slot to put the stack in isn't free");
            click(moveTo, 0, SlotActionType.PICKUP);
            moveTo = -1;
            return Result.AGAIN;
        }
        if (afterMove != null) {
            Runnable after = afterMove;
            afterMove = null;
            after.run();
            return Result.AGAIN;
        }

        switch (trip) {
            case OUTPUT -> {
                if (!outputSeen) {
                    outputSeen = true;
                    countCopiesHere("output storage");
                }
                int out = finishing ? findAnyOutput() : findOutput(true);
                if (out == -1) return Result.NEXT;
                return deposit(out, "The output storage is full - empty it or make room.");
            }
            case BUNDLES -> {
                if (!bundlesSeen) {
                    bundlesSeen = true;
                    countCopiesHere("bundles storage");
                }
                if (!finishing && findOutput(false) == -1) {
                    // A bundle of copies with room left is filled further before an empty one is started
                    int partial = findContainer(s -> isCopies(s) && fits(s, new ItemStack(Items.FILLED_MAP)));
                    if (partial != -1) return take(partial);
                }
                if (finishing) {
                    int spare = findSpare();
                    return spare == -1 ? Result.NEXT : deposit(spare, "The bundles storage is full.");
                }
                if (spares() >= spareBundles.get() || freeSlots() <= WORK_SLOTS / 2) return Result.NEXT;
                int from = findContainer(s -> {
                    BundleContentsComponent contents = contents(s);
                    return contents != null && contents.isEmpty();
                });
                if (from == -1) {
                    if (tripClicks == 0) bundlesDry = true;
                    if (spares() == 0) waitFor("There are no empty bundles in the bundles storage.");
                    return Result.NEXT;
                }
                return take(from);
            }
            case MAPS -> {
                if (finishing) {
                    int maps = findInv(-1, s -> s.isOf(Items.MAP));
                    return maps == -1 ? Result.NEXT : deposit(maps, "The empty maps storage is full.");
                }
                if (emptyMaps() >= mapStacks.get() * 64 || freeSlots() <= WORK_SLOTS / 2) return Result.NEXT;
                int from = findContainer(s -> s.isOf(Items.MAP));
                if (from == -1) {
                    if (tripClicks == 0) mapsDry = true;
                    if (emptyMaps() == 0) waitFor("There are no empty maps in the maps storage.");
                    return Result.NEXT;
                }
                return take(from);
            }
            case SOURCE -> {
                return workSource();
            }
            case WORK -> {
                return workChest();
            }
            case RESYNC -> {
                // Opening it was the point: the server sent every slot again
                OnFocusAddon.LOG.info("[MapArtBulkCopier] Slots sent again by the server: {}", describeInventory());
                return Result.NEXT;
            }
        }
        return Result.NEXT;
    }

    private Result workSource() {
        // The bundles done go back into the very slots they came from
        for (Job job : jobs) {
            if (!job.done) continue;
            if (!slot(job.chestSlot).isEmpty()) {
                waitFor("Slot " + job.chestSlot + " of the source chest, where a bundle goes back, isn't free.");
                return Result.NEXT;
            }
            if (contents(inv(job.slot)) == null) return fail("a copied bundle isn't in its slot");
            clickInv(job.slot, 0, SlotActionType.PICKUP);
            moveTo = job.chestSlot;
            afterMove = () -> {
                if (contents(slot(job.chestSlot)) != null) jobs.remove(job);
            };
            return Result.AGAIN;
        }

        if (finishing || jobs.size() >= bundlesPerTrip.get()) return Result.NEXT;
        if (freeSlots() <= WORK_SLOTS) {
            if (jobs.isEmpty()) waitFor("Your inventory is too full to take bundles - free up a few slots.");
            return Result.NEXT;
        }

        IntSet planned = new IntOpenHashSet(copied);
        int need = 0;
        for (Job job : jobs) {
            for (int id : job.ids) if (planned.add(id)) need++;
        }
        int maps = emptyMaps() - need;

        for (Slot chest : mc.player.currentScreenHandler.slots) {
            if (chest.inventory == mc.player.getInventory()) continue;
            BundleContentsComponent contents = contents(chest.getStack());
            if (contents == null || contents.isEmpty()) continue;
            int[] ids = new int[contents.size()];
            int[] counts = new int[contents.size()];
            IntSet own = new IntOpenHashSet();
            boolean onlyMaps = true;
            for (int k = 0; k < contents.size() && onlyMaps; k++) {
                ItemStack map = contents.get(k);
                onlyMaps = isMap(map) && own.add(mapId(map));
                if (onlyMaps) {
                    ids[k] = mapId(map);
                    counts[k] = map.getCount();
                }
            }
            // Anything but maps, or two stacks of one map, and the bundle is left alone
            if (!onlyMaps) continue;
            int uncopied = 0;
            for (int id : ids) if (!planned.contains(id)) uncopied++;
            if (uncopied == 0) continue;
            if (!jobs.isEmpty() && uncopied > maps) return Result.NEXT;

            int free = findFree(-1);
            Job job = new Job(chest.id, ids, counts, free);
            click(chest.id, 0, SlotActionType.PICKUP);
            moveTo = slotId(free);
            afterMove = () -> {
                if (contents(inv(free)) != null) jobs.add(job);
            };
            return Result.AGAIN;
        }

        if (jobs.isEmpty()) {
            finishing = true;
            info("Every map is copied (%d) - putting the rest away.", copied.size());
        }
        return Result.NEXT;
    }

    /**
     * The work chest part of a job: the bundle is emptied into it (the rest into the inventory),
     * the maps copied already go back into it and the next ones are brought out, and once all are
     * copied they go back into the bundle.
     */
    private Result workChest() {
        Job job = activeJob();
        if (job == null) return Result.NEXT;
        int m = job.ids.length;
        BundleContentsComponent source = contents(inv(job.slot));
        if (source == null || source.size() > m || !holdsSuffix(source, job)) return fail("the source bundle doesn't hold what it should");
        int t = m - source.size();

        Map<Integer, List<Integer>> loose = looseMaps();
        for (int idx = 0; idx < t; idx++) {
            if (loose.containsKey(job.ids[idx])) continue;
            int at = job.workSlots[idx];
            if (at < 0 || !matches(slot(at), job.ids[idx], job.counts[idx])) {
                OnFocusAddon.LOG.warn("[MapArtBulkCopier] Map {} ({}) not in work chest slot {}, which holds {}", job.ids[idx], job.counts[idx], at, at < 0 ? null : slot(at));
                return fail("a map isn't where it was put in the work chest");
            }
        }

        // With no room for more, the maps out are copied first: bringing them out frees work chest slots
        if (!job.restoring && t < m && (findWorkSlot() != -1 || freeSlots() >= 3)) {
            clickInv(job.slot, 0, SlotActionType.PICKUP);
            bundleOp = BundleOp.UNLOAD;
            return Result.AGAIN;
        }

        boolean allCopied = true;
        for (int id : job.ids) allCopied &= copied.contains(id);
        if (allCopied) {
            if (t == 0) {
                job.done = true;
                return Result.AGAIN;
            }
            job.restoring = true;
            clickInv(job.slot, 0, SlotActionType.PICKUP);
            bundleOp = BundleOp.RESTORE;
            return Result.AGAIN;
        }

        // Copied ones lying in the inventory go back into the chest, to make room for the next ones
        for (Map.Entry<Integer, List<Integer>> entry : loose.entrySet()) {
            int idx = job.indexOf(entry.getKey());
            if (!copied.contains(job.ids[idx])) continue;
            int to = job.workSlots[idx] >= 0 && slot(job.workSlots[idx]).isEmpty() ? job.workSlots[idx] : findWorkSlot();
            if (to == -1) break;
            clickInv(entry.getValue().getFirst(), 0, SlotActionType.PICKUP);
            moveTo = to;
            afterMove = () -> job.workSlots[idx] = to;
            return Result.AGAIN;
        }

        // A copy goes straight into a bundle, so a map needs just its slot; one is kept free for the cursor
        if (freeSlots() >= 2) {
            for (int idx = 0; idx < t; idx++) {
                if (loose.containsKey(job.ids[idx]) || copied.contains(job.ids[idx])) continue;
                click(job.workSlots[idx], 0, SlotActionType.PICKUP);
                moveTo = slotId(findFree(-1));
                return Result.AGAIN;
            }
        }
        if (tripClicks == 0) needRoom();
        return Result.NEXT;
    }

    /** One click of the source bundle on the cursor: a stack out of it into a free slot, or one back into it. */
    private Result bundleStep() {
        Job job = activeJob();
        BundleContentsComponent held = contents(cursor());
        if (job == null || held == null) return fail("the source bundle isn't on the cursor");
        int m = job.ids.length;
        int t = m - held.size();

        if (bundleOp == BundleOp.UNLOAD) {
            int to = held.isEmpty() ? -1 : findWorkSlot();
            // The last few into the inventory if the chest is full, one slot kept for a copy
            int free = held.isEmpty() || to != -1 ? -1 : findFree(job.slot);
            if (to == -1 && (free == -1 || freeSlots() < 3)) {
                if (!inv(job.slot).isEmpty()) return fail("the source bundle's slot isn't free");
                clickInv(job.slot, 0, SlotActionType.PICKUP);
                bundleOp = BundleOp.NONE;
                return Result.AGAIN;
            }
            if (to != -1) {
                click(to, 1, SlotActionType.PICKUP);
                if (!matches(slot(to), job.ids[t], job.counts[t])) return fail("the map out of the bundle isn't the one expected");
                job.workSlots[t] = to;
            } else {
                clickInv(free, 1, SlotActionType.PICKUP);
                job.workSlots[t] = -1;
            }
            return Result.AGAIN;
        }

        // RESTORE: the last stack first, so the first ends on top as it was
        if (t == 0) {
            if (!inv(job.slot).isEmpty()) return fail("the source bundle's slot isn't free");
            clickInv(job.slot, 0, SlotActionType.PICKUP);
            bundleOp = BundleOp.NONE;
            job.done = true;
            recoveries = 0;
            return Result.AGAIN;
        }
        int idx = t - 1;
        List<Integer> loose = looseMaps().get(job.ids[idx]);
        int from = loose != null ? slotId(original(loose, job.counts[idx])) : job.workSlots[idx];
        if (from < 0 || !matches(slot(from), job.ids[idx], job.counts[idx])) return fail("a map to put back isn't where it should be");
        click(from, 0, SlotActionType.PICKUP);
        if (!slot(from).isEmpty()) return fail("the bundle didn't take the maps back");
        job.workSlots[idx] = -1;
        return Result.AGAIN;
    }

    /** Maps in bundles in the open container count as copied, so they aren't copied again. */
    private void countCopiesHere(String where) {
        int before = copied.size();
        for (Slot slot : mc.player.currentScreenHandler.slots) {
            if (slot.inventory == mc.player.getInventory() || !isCopies(slot.getStack())) continue;
            for (ItemStack map : contents(slot.getStack()).iterate()) copied.add(mapId(map));
        }
        if (copied.size() > before) info("%d map(s) already in bundles in the %s count as copied.", copied.size() - before, where);
    }

    /** A bundle holding filled maps and nothing else. */
    private static boolean isCopies(ItemStack stack) {
        BundleContentsComponent contents = contents(stack);
        return contents != null && !contents.isEmpty() && contents.stream().allMatch(MapArtBulkCopier::isMap);
    }

    /** Moves an inventory stack into an empty slot of the open container. */
    private Result deposit(int i, String full) {
        int to = findContainer(ItemStack::isEmpty);
        if (to == -1) {
            waitFor(full);
            return Result.NEXT;
        }
        clickInv(i, 0, SlotActionType.PICKUP);
        moveTo = to;
        return Result.AGAIN;
    }

    /** Moves a container stack into a free inventory slot. */
    private Result take(int from) {
        int free = findFree(-1);
        if (free == -1) return Result.NEXT;
        click(from, 0, SlotActionType.PICKUP);
        moveTo = slotId(free);
        return Result.AGAIN;
    }

    private int findContainer(Predicate<ItemStack> test) {
        for (Slot slot : mc.player.currentScreenHandler.slots) {
            if (slot.inventory != mc.player.getInventory() && test.test(slot.getStack())) return slot.id;
        }
        return -1;
    }

    /** An empty slot of the open work chest. */
    private int findWorkSlot() {
        return findContainer(ItemStack::isEmpty);
    }

    // Stopping and recovering

    private Result fail(String reason) {
        failReason = reason;
        return Result.FAIL;
    }

    /** The slots aren't what a step expected: waits for the server to settle and plans again from what's there. */
    private void recover(String reason) {
        steps.clear();
        bundleOp = BundleOp.NONE;
        moveTo = -1;
        afterMove = null;
        if (++recoveries > MAX_RECOVERIES) {
            halt("The server keeps correcting the slots (" + reason + ") - check the inventory and turn the module on again.");
            return;
        }
        OnFocusAddon.LOG.warn("[MapArtBulkCopier] {} - cursor holds {}, waiting for the server. Inventory: {}", reason, cursor(), describeInventory());
        if (recoveries > 1) {
            warning("Slots not as expected (%s) - picking up from there.", reason);
            // Most likely the client sees items the server doesn't: a container sends every slot when opened
            resync = true;
        }
        recovering = true;
        settleTicks = 0;
    }

    private void recoverTick() {
        if (++settleTicks < SETTLE_TICKS) return;
        if (!cursor().isEmpty()) {
            if (!putCursorDownNow()) halt("No free slot to put the cursor down.");
            settleTicks = 0;
            return;
        }
        if (mc.player.currentScreenHandler != mc.player.playerScreenHandler) {
            mc.player.closeHandledScreen();
            lastClick = ticks;
            container = null;
            return;
        }
        recovering = false;
    }

    private boolean putCursorDownNow() {
        if (cursor().isEmpty()) return true;
        int free = findFree(-1);
        if (free == -1) return false;
        clickInv(free, 0, SlotActionType.PICKUP);
        return true;
    }

    /** Drops the work queued, waits a while and plans again, saying why once. */
    private void waitFor(String reason) {
        if (!reason.equals(waitReason)) warning(reason);
        waitReason = reason;
        retryAt = ticks + RETRY_TICKS;
        steps.clear();
        // Nothing is on the cursor between the clicks of a container's work
        if (mc.player.currentScreenHandler != mc.player.playerScreenHandler && cursor().isEmpty()) {
            mc.player.closeHandledScreen();
            container = null;
        }
    }

    /** Stops working but stays on: turning it on again carries on from what's there. */
    private void halt(String reason) {
        error(reason);
        OnFocusAddon.LOG.warn("[MapArtBulkCopier] Stopped: {} Inventory: {}", reason, describeInventory());
        steps.clear();
        running = false;
        halted = true;
        recovering = false;
        bundleOp = BundleOp.NONE;
        putCursorDownNow();
    }

    private void finish() {
        running = false;
        info("Done in (highlight)%s(default) - %d map(s) copied.", duration(), copiesMade);
        copied.clear();
        jobs.clear();
        finishing = false;
        toggle();
    }

    private String duration() {
        long seconds = ticks / 20;
        return seconds >= 3600 ? String.format("%dh %dm", seconds / 3600, seconds / 60 % 60) : String.format("%dm %ds", seconds / 60, seconds % 60);
    }

    /** The inventory as the client sees it, for the log. */
    private String describeInventory() {
        StringBuilder text = new StringBuilder();
        for (int i = 0; i < 36; i++) {
            ItemStack stack = inv(i);
            if (stack.isEmpty()) continue;
            text.append(i).append('=').append(stack.getCount()).append(' ').append(stack.getItem());
            if (isMap(stack)) text.append(" #").append(mapId(stack));
            BundleContentsComponent contents = contents(stack);
            if (contents != null) text.append(" (").append(contents.size()).append(" stacks)");
            text.append(", ");
        }
        return text.toString();
    }

    // Inventory

    private ItemStack cursor() {
        return mc.player.currentScreenHandler.getCursorStack();
    }

    private ItemStack slot(int id) {
        return mc.player.currentScreenHandler.getSlot(id).getStack();
    }

    private ItemStack inv(int i) {
        return mc.player.getInventory().getStack(i);
    }

    /** The open screen's slot id of an inventory index (0-35). */
    private int slotId(int i) {
        for (Slot slot : mc.player.currentScreenHandler.slots) {
            if (slot.inventory == mc.player.getInventory() && slot.getIndex() == i) return slot.id;
        }
        return -1;
    }

    private void clickInv(int i, int button, SlotActionType action) {
        click(slotId(i), button, action);
    }

    private void click(int id, int button, SlotActionType action) {
        mc.interactionManager.clickSlot(mc.player.currentScreenHandler.syncId, id, button, action, mc.player);
        clicks++;
        tripClicks++;
        lastClick = ticks;
    }

    private boolean isJobSlot(int i) {
        for (Job job : jobs) {
            if (job.slot == i) return true;
        }
        return false;
    }

    private int findInv(int except, Predicate<ItemStack> test) {
        for (int i = 0; i < 36; i++) {
            if (i != except && test.test(inv(i))) return i;
        }
        return -1;
    }

    private int findFree(int except) {
        return findInv(except, ItemStack::isEmpty);
    }

    private int freeSlots() {
        int free = 0;
        for (int i = 0; i < 36; i++) if (inv(i).isEmpty()) free++;
        return free;
    }

    /** An empty bundle that isn't a source bundle. */
    private int findSpare() {
        for (int i = 0; i < 36; i++) {
            BundleContentsComponent contents = contents(inv(i));
            if (contents != null && contents.isEmpty() && !isJobSlot(i)) return i;
        }
        return -1;
    }

    private int spares() {
        int spares = 0;
        for (int i = 0; i < 36; i++) {
            BundleContentsComponent contents = contents(inv(i));
            if (contents != null && contents.isEmpty() && !isJobSlot(i)) spares++;
        }
        return spares;
    }

    /** A bundle of copies: a full one, or one with room for more. */
    private int findOutput(boolean full) {
        ItemStack single = new ItemStack(Items.FILLED_MAP);
        for (int i = 0; i < 36; i++) {
            if (isOutput(i) && fits(inv(i), single) != full) return i;
        }
        return -1;
    }

    private int findAnyOutput() {
        for (int i = 0; i < 36; i++) {
            if (isOutput(i)) return i;
        }
        return -1;
    }

    /** A bundle holding maps that isn't a source bundle: one of copies. */
    private boolean isOutput(int i) {
        BundleContentsComponent contents = contents(inv(i));
        return contents != null && !contents.isEmpty() && !isJobSlot(i) && contents.stream().allMatch(MapArtBulkCopier::isMap);
    }

    private int emptyMaps() {
        int maps = 0;
        for (int i = 0; i < 36; i++) if (inv(i).isOf(Items.MAP)) maps += inv(i).getCount();
        if (mc.player.currentScreenHandler == mc.player.playerScreenHandler && slot(GRID_EMPTIES).isOf(Items.MAP)) maps += slot(GRID_EMPTIES).getCount();
        return maps;
    }

    private static BundleContentsComponent contents(ItemStack stack) {
        return stack.getItem() instanceof BundleItem ? stack.get(DataComponentTypes.BUNDLE_CONTENTS) : null;
    }

    private static boolean isMap(ItemStack stack) {
        return stack.isOf(Items.FILLED_MAP) && stack.contains(DataComponentTypes.MAP_ID);
    }

    private static int mapId(ItemStack stack) {
        MapIdComponent id = stack.get(DataComponentTypes.MAP_ID);
        return id == null ? -1 : id.id();
    }

    /** Whether at least one of these maps goes into the bundle. */
    private static boolean fits(ItemStack bundle, ItemStack maps) {
        BundleContentsComponent contents = bundle.get(DataComponentTypes.BUNDLE_CONTENTS);
        // The builder only works on copies: nothing is changed, it just says how much would fit
        return bundle.getItem() instanceof BundleItem && contents != null && new BundleContentsComponent.Builder(contents).add(maps.copyWithCount(1)) > 0;
    }

    @Override
    public String getInfoString() {
        if (learning != -1) return "setup";
        if (halted) return "stopped";
        if (!running) return null;
        if (ticks < retryAt) return "waiting";
        return copied.size() + " copied";
    }

    @Override
    public NbtCompound toTag() {
        NbtCompound tag = super.toTag();
        if (tag == null) return null;
        tag.putIntArray("copied", copied.toIntArray());
        NbtList list = new NbtList();
        for (Job job : jobs) {
            NbtCompound j = new NbtCompound();
            j.putInt("chestSlot", job.chestSlot);
            j.putInt("slot", job.slot);
            j.putIntArray("ids", job.ids);
            j.putIntArray("counts", job.counts);
            j.putIntArray("workSlots", job.workSlots);
            j.putBoolean("restoring", job.restoring);
            j.putBoolean("done", job.done);
            list.add(j);
        }
        tag.put("jobs", list);
        tag.putBoolean("finishing", finishing);
        tag.putInt("copiesMade", copiesMade);
        return tag;
    }

    @Override
    public MapArtBulkCopier fromTag(NbtCompound tag) {
        // Before super, which turns the module back on
        copied.clear();
        for (int id : tag.getIntArray("copied")) copied.add(id);
        jobs.clear();
        NbtList list = tag.getList("jobs", NbtElement.COMPOUND_TYPE);
        for (int i = 0; i < list.size(); i++) {
            NbtCompound j = list.getCompound(i);
            Job job = new Job(j.getInt("chestSlot"), j.getIntArray("ids"), j.getIntArray("counts"), j.getInt("slot"));
            int[] workSlots = j.getIntArray("workSlots");
            System.arraycopy(workSlots, 0, job.workSlots, 0, Math.min(workSlots.length, job.workSlots.length));
            job.restoring = j.getBoolean("restoring");
            job.done = j.getBoolean("done");
            jobs.add(job);
        }
        finishing = tag.getBoolean("finishing");
        copiesMade = tag.getInt("copiesMade");
        super.fromTag(tag);
        return this;
    }
}
