package dev.onfocus.addon.modules;

import dev.onfocus.addon.OnFocusAddon;
import meteordevelopment.meteorclient.events.world.TickEvent;
import meteordevelopment.meteorclient.settings.BoolSetting;
import meteordevelopment.meteorclient.settings.IntSetting;
import meteordevelopment.meteorclient.settings.Setting;
import meteordevelopment.meteorclient.settings.SettingGroup;
import meteordevelopment.meteorclient.systems.modules.Module;
import meteordevelopment.orbit.EventHandler;
import net.minecraft.component.DataComponentTypes;
import net.minecraft.component.type.BundleContentsComponent;
import net.minecraft.item.BundleItem;
import net.minecraft.item.ItemStack;
import net.minecraft.item.Items;
import net.minecraft.screen.CraftingScreenHandler;
import net.minecraft.screen.ScreenHandler;
import net.minecraft.screen.slot.Slot;
import net.minecraft.screen.slot.SlotActionType;

import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.List;
import java.util.function.Predicate;

/**
 * Copies a map art: every filled map in the inventory is cloned with empty maps in the crafting
 * grid (the inventory's 2x2 one, or a crafting table's 3x3 one if it's open - 8 copies per craft
 * instead of 3) as many times as the copies setting says. Then the original art and each copy
 * go into their own empty bundle: with 1 copy, the originals fill one bundle and the copies
 * another. An art of more than 64 maps doesn't fit one bundle and spans several. Sets without a
 * bundle stay loose, stacked on the original.
 * <p>
 * A bundle takes everything the cursor holds, so each map goes in one at a time: one copy is put
 * into the first grid slot, picked up alone and clicked onto the bundle. Crafting results come
 * from the server, so every craft waits for the result slot to fill before taking it.
 */
public class MapArtCopier extends Module {
    private final SettingGroup sgGeneral = settings.getDefaultGroup();

    private final Setting<Boolean> fillBundles = sgGeneral.add(new BoolSetting.Builder()
        .name("fill-bundles")
        .description("Puts the original art and each copy into their own empty bundle from your inventory.")
        .defaultValue(true)
        .build()
    );

    private final Setting<Integer> copies = sgGeneral.add(new IntSetting.Builder()
        .name("copies")
        .description("How many copies of each map to make, besides the original.")
        .defaultValue(1)
        .range(1, 63)
        .sliderRange(1, 16)
        .build()
    );

    private final Setting<Integer> clicksPerTick = sgGeneral.add(new IntSetting.Builder()
        .name("clicks-per-tick")
        .description("Inventory clicks sent per tick. Lower it if the server kicks or desyncs you.")
        .defaultValue(4)
        .range(1, 20)
        .sliderRange(1, 10)
        .build()
    );

    /** How long to wait for the server to show a crafting result (5 s). */
    private static final int RESULT_TIMEOUT = 100;
    private static final int BUNDLE_MAPS = 64;
    private static final int RESULT_SLOT = 0;

    private enum Phase { GRID, PICK, CRAFT, WAIT_RESULT, DISTRIBUTE }

    /** One map of the art: where it lies, how many there were, and the bundle each copy goes into. */
    private static final class Job {
        final ItemStack map;
        final int baseCount;
        final List<Integer> bundles = new ArrayList<>();
        int slot;
        int bundleIndex;

        Job(ItemStack map, int slot) {
            this.map = map.copyWithCount(1);
            this.baseCount = map.getCount();
            this.slot = slot;
        }
    }

    private ScreenHandler handler;
    /** Crafting grid slot ids: the first holds the map being cloned, the rest empty maps. */
    private int[] grid;
    /** Handler slot ids of the player's main inventory and hotbar. */
    private final List<Integer> invSlots = new ArrayList<>();

    private final Deque<Job> jobs = new ArrayDeque<>();
    private Job job;
    private Phase phase;
    private int step;
    private int expected;
    private int waitTicks;
    private int clicks;
    private boolean running;

    private int copyCount;
    private int mapCount;
    private int mapsDone;
    private int bundleSets;
    private long ticks;

    public MapArtCopier() {
        super(OnFocusAddon.CATEGORY, "map-art-copier", "Copies every map in your inventory with empty maps and puts the original and each copy of the art into its own bundle.");
    }

    @Override
    public void onActivate() {
        running = false;
        jobs.clear();
        job = null;
        invSlots.clear();
        if (mc.player == null) {
            toggle();
            return;
        }

        handler = mc.player.currentScreenHandler;
        int gridSize;
        if (handler instanceof CraftingScreenHandler) gridSize = 9;
        else if (handler == mc.player.playerScreenHandler) gridSize = 4;
        else {
            error("Close the container first - copying works in your inventory or at a crafting table.");
            toggle();
            return;
        }
        grid = new int[gridSize];
        for (int i = 0; i < gridSize; i++) grid[i] = i + 1;

        for (int index = 0; index < 36; index++) {
            for (Slot slot : handler.slots) {
                if (slot.inventory == mc.player.getInventory() && slot.getIndex() == index) {
                    invSlots.add(slot.id);
                    break;
                }
            }
        }

        if (!handler.getCursorStack().isEmpty()) {
            error("Put down the item on your cursor first.");
            toggle();
            return;
        }
        for (int id : grid) {
            if (!stack(id).isEmpty()) {
                error("Empty the crafting grid first.");
                toggle();
                return;
            }
        }

        List<Job> found = new ArrayList<>();
        List<Integer> bundles = new ArrayList<>();
        int emptyMaps = 0;
        for (int id : invSlots) {
            ItemStack stack = stack(id);
            if (stack.isOf(Items.MAP)) emptyMaps += stack.getCount();
            else if (isEmptyBundle(stack)) bundles.add(id);
            else if (stack.isOf(Items.FILLED_MAP) && found.stream().noneMatch(j -> ItemStack.areItemsAndComponentsEqual(j.map, stack))) {
                found.add(new Job(stack, id));
            }
        }

        if (found.isEmpty()) {
            error("No filled maps in your inventory.");
            toggle();
            return;
        }

        int maps = found.size();
        int bundlesPerSet = (maps + BUNDLE_MAPS - 1) / BUNDLE_MAPS;
        int sets = fillBundles.get() ? bundles.size() / bundlesPerSet : 0;
        int count = copies.get();

        // Copies stack on the original, so a stack can't grow past 64.
        for (Job j : found) count = Math.min(count, j.map.getMaxCount() - j.baseCount);
        if (emptyMaps < count * maps) count = emptyMaps / maps;
        if (count <= 0) {
            if (emptyMaps < maps) error("Not enough empty maps - one copy of %d map(s) needs %d, you have %d.", maps, maps, emptyMaps);
            else error("A map stack is already full (64) - there's no room for copies on it.");
            toggle();
            return;
        }

        // The original is a set too: 1 copy fills two bundles.
        bundleSets = Math.min(sets, count + 1);
        for (int j = 0; j < maps; j++) {
            Job next = found.get(j);
            for (int set = 0; set < bundleSets; set++) next.bundles.add(bundles.get(set * bundlesPerSet + j / BUNDLE_MAPS));
            jobs.add(next);
        }

        copyCount = count;
        mapCount = maps;
        mapsDone = 0;
        ticks = 0;
        running = true;

        String where = gridSize == 9 ? "crafting table" : "inventory grid";
        info("Making (highlight)%d(default) copy(s) of %d map(s) in the %s - uses %d empty maps.", count, maps, where, count * maps);
        if (count < copies.get()) warning("Only %d copy(s) fit - not enough empty maps or room on a map stack.", count);
        if (fillBundles.get() && bundleSets < count + 1) {
            warning("%d of %d set(s) get a bundle (this art needs %d per set) - the rest stay loose.", bundleSets, count + 1, bundlesPerSet);
        }
    }

    @Override
    public void onDeactivate() {
        if (!running) return;
        running = false;
        if (mc.player != null && mc.player.currentScreenHandler == handler) cleanup();
        warning("Stopped - %d of %d map(s) copied.", mapsDone, mapCount);
    }

    @EventHandler
    private void onTick(TickEvent.Pre event) {
        if (!running || mc.player == null || mc.interactionManager == null) return;
        ticks++;

        if (mc.player.currentScreenHandler != handler) {
            stop("The open screen changed - leave the inventory as it was while copying.");
            return;
        }

        clicks = 0;
        while (running && clicks < clicksPerTick.get()) {
            if (!step()) break;
        }
    }

    /** Does the next bit of work. Returns false when it has to wait for the server. */
    private boolean step() {
        if (job == null) {
            job = jobs.poll();
            if (job == null) {
                finish();
                return false;
            }
            phase = Phase.GRID;
        }

        ItemStack cursor = handler.getCursorStack();
        switch (phase) {
            case GRID -> {
                // Fill the empty-map slots of the grid with whole stacks, so most crafts need just two clicks.
                for (int i = 1; i < grid.length; i++) {
                    if (!stack(grid[i]).isEmpty()) continue;
                    int from = findInv(s -> s.isOf(Items.MAP));
                    if (from == -1) break;
                    click(from, 0, SlotActionType.PICKUP);
                    click(grid[i], 0, SlotActionType.PICKUP);
                    return true;
                }
                if (gridEmpties() == 0) {
                    stop("Ran out of empty maps.");
                    return false;
                }
                phase = Phase.PICK;
            }
            case PICK -> {
                if (!isJobMap(stack(job.slot))) {
                    stop("A map moved while copying.");
                    return false;
                }
                click(job.slot, 0, SlotActionType.PICKUP);
                phase = Phase.CRAFT;
            }
            case CRAFT -> {
                if (!isJobMap(cursor)) {
                    stop("The map left the cursor while copying.");
                    return false;
                }
                int need = job.baseCount + copyCount - cursor.getCount();
                if (need <= 0) {
                    phase = Phase.DISTRIBUTE;
                    step = 0;
                    return true;
                }

                int empties = gridEmpties();
                if (empties == 0) {
                    if (!putDown()) return false;
                    phase = Phase.GRID;
                    return true;
                }
                if (empties > need) {
                    // The last craft would make too many - move a spare stack of empty maps out of the grid.
                    for (int i = grid.length - 1; i > 0; i--) {
                        if (stack(grid[i]).isOf(Items.MAP)) {
                            click(grid[i], 0, SlotActionType.QUICK_MOVE);
                            return true;
                        }
                    }
                }

                click(grid[0], 1, SlotActionType.PICKUP);
                expected = 1 + empties;
                waitTicks = 0;
                phase = Phase.WAIT_RESULT;
            }
            case WAIT_RESULT -> {
                ItemStack result = stack(RESULT_SLOT);
                if (isJobMap(result) && result.getCount() == expected) {
                    click(RESULT_SLOT, 0, SlotActionType.PICKUP);
                    phase = Phase.CRAFT;
                    return true;
                }
                if (++waitTicks > RESULT_TIMEOUT) stop("The server didn't show the crafting result.");
                return false;
            }
            case DISTRIBUTE -> {
                if (job.bundleIndex >= job.bundles.size()) {
                    if (!cursor.isEmpty() && !putDown()) return false;
                    job = null;
                    mapsDone++;
                    return true;
                }

                int bundle = job.bundles.get(job.bundleIndex);
                switch (step) {
                    case 0 -> {
                        // The cursor holds the copies: leave one in the first grid slot...
                        if (!isJobMap(cursor)) {
                            stop("The map left the cursor while copying.");
                            return false;
                        }
                        if (cursor.getCount() == 1) {
                            // The last map - it goes in as it is.
                            step = 3;
                            return true;
                        }
                        click(grid[0], 1, SlotActionType.PICKUP);
                        step = 1;
                    }
                    case 1 -> {
                        // ...put the rest down...
                        if (!putDown()) return false;
                        step = 2;
                    }
                    case 2 -> {
                        // ...and pick that one up alone.
                        click(grid[0], 0, SlotActionType.PICKUP);
                        step = 3;
                    }
                    case 3 -> {
                        if (!(stack(bundle).getItem() instanceof BundleItem)) {
                            stop("A bundle moved while copying.");
                            return false;
                        }
                        click(bundle, 0, SlotActionType.PICKUP);
                        step = 4;
                    }
                    case 4 -> {
                        if (!cursor.isEmpty()) {
                            stop("A bundle didn't take the map - is it full?");
                            return false;
                        }
                        job.bundleIndex++;
                        step = 0;
                        if (job.bundleIndex < job.bundles.size()) click(job.slot, 0, SlotActionType.PICKUP);
                    }
                }
            }
        }
        return true;
    }

    private void finish() {
        cleanup();
        running = false;
        int loose = copyCount + 1 - bundleSets;
        String bundlesPart = bundleSets > 0 ? " - " + bundleSets + " set(s) in bundles" + (loose > 0 ? ", " + loose + " loose" : "") : "";
        info("Done in (highlight)%ds(default) - %d copy(s) of %d map(s)%s.", Math.round(ticks / 20.0), copyCount, mapCount, bundlesPart);
        toggle();
    }

    private void stop(String reason) {
        error("%s Stopped after %d of %d map(s).", reason, mapsDone, mapCount);
        cleanup();
        running = false;
        toggle();
    }

    /** Puts the cursor down and moves everything out of the crafting grid. */
    private void cleanup() {
        if (!handler.getCursorStack().isEmpty()) {
            int target = job != null && stack(job.slot).isEmpty() ? job.slot : findInv(ItemStack::isEmpty);
            if (target != -1) click(target, 0, SlotActionType.PICKUP);
            else warning("Your inventory is full - the maps are still on the cursor.");
        }
        for (int id : grid) {
            if (!stack(id).isEmpty()) click(id, 0, SlotActionType.QUICK_MOVE);
        }
        for (int id : grid) {
            if (!stack(id).isEmpty()) {
                warning("Your inventory is full - some items are left in the crafting grid.");
                break;
            }
        }
        jobs.clear();
        job = null;
    }

    /** Puts the cursor into the current map's slot, or the first empty slot if something else took it. */
    private boolean putDown() {
        int target = job != null && stack(job.slot).isEmpty() ? job.slot : findInv(ItemStack::isEmpty);
        if (target == -1) {
            stop("No free inventory slot to put the maps down.");
            return false;
        }
        click(target, 0, SlotActionType.PICKUP);
        if (job != null) job.slot = target;
        return true;
    }

    private void click(int slot, int button, SlotActionType action) {
        mc.interactionManager.clickSlot(handler.syncId, slot, button, action, mc.player);
        clicks++;
    }

    private ItemStack stack(int slot) {
        return handler.getSlot(slot).getStack();
    }

    private int gridEmpties() {
        int count = 0;
        for (int i = 1; i < grid.length; i++) {
            if (stack(grid[i]).isOf(Items.MAP)) count++;
        }
        return count;
    }

    private int findInv(Predicate<ItemStack> test) {
        for (int id : invSlots) {
            if (test.test(stack(id))) return id;
        }
        return -1;
    }

    private boolean isJobMap(ItemStack stack) {
        return !stack.isEmpty() && ItemStack.areItemsAndComponentsEqual(stack, job.map);
    }

    private static boolean isEmptyBundle(ItemStack stack) {
        if (!(stack.getItem() instanceof BundleItem)) return false;
        BundleContentsComponent contents = stack.get(DataComponentTypes.BUNDLE_CONTENTS);
        return contents != null && contents.isEmpty();
    }

    @Override
    public String getInfoString() {
        if (!running) return null;
        return Math.min(mapsDone + 1, mapCount) + "/" + mapCount;
    }
}
