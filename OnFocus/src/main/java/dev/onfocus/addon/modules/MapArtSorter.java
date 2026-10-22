package dev.onfocus.addon.modules;

import dev.onfocus.addon.OnFocusAddon;
import it.unimi.dsi.fastutil.ints.IntArrayList;
import it.unimi.dsi.fastutil.ints.IntList;
import it.unimi.dsi.fastutil.ints.IntOpenHashSet;
import it.unimi.dsi.fastutil.ints.IntSet;
import meteordevelopment.meteorclient.events.packets.PacketEvent;
import meteordevelopment.meteorclient.events.world.TickEvent;
import meteordevelopment.meteorclient.settings.BoolSetting;
import meteordevelopment.meteorclient.settings.IntSetting;
import meteordevelopment.meteorclient.settings.ItemSetting;
import meteordevelopment.meteorclient.settings.Setting;
import meteordevelopment.meteorclient.settings.SettingGroup;
import meteordevelopment.meteorclient.systems.modules.Module;
import meteordevelopment.orbit.EventHandler;
import net.minecraft.client.gui.screen.Screen;
import net.minecraft.client.gui.screen.ingame.GenericContainerScreen;
import net.minecraft.client.gui.screen.ingame.HandledScreen;
import net.minecraft.client.gui.screen.ingame.InventoryScreen;
import net.minecraft.client.gui.screen.ingame.ShulkerBoxScreen;
import net.minecraft.client.network.PlayerListEntry;
import net.minecraft.component.DataComponentTypes;
import net.minecraft.component.type.BundleContentsComponent;
import net.minecraft.component.type.MapIdComponent;
import net.minecraft.item.BundleItem;
import net.minecraft.item.Item;
import net.minecraft.item.ItemStack;
import net.minecraft.item.Items;
import net.minecraft.nbt.NbtCompound;
import net.minecraft.network.packet.s2c.play.InventoryS2CPacket;
import net.minecraft.network.packet.s2c.play.ScreenHandlerSlotUpdateS2CPacket;
import net.minecraft.network.packet.s2c.play.SetCursorItemS2CPacket;
import net.minecraft.network.packet.s2c.play.SetPlayerInventoryS2CPacket;
import net.minecraft.screen.ScreenHandler;
import net.minecraft.screen.slot.Slot;
import net.minecraft.screen.slot.SlotActionType;

import java.util.ArrayList;
import java.util.List;

/**
 * Sorts map art kept in bundles: one copy of every map (by map id) goes into the unique bundles,
 * every other copy into the duplicate bundles. Which bundles take which role is set by their
 * colour, so the two kinds can be told apart afterwards. Bundles of those colours already holding
 * maps are kept and filled further - a unique bundle's maps count as taken - unless one holds
 * something it shouldn't (a second copy of a map, or anything but maps): then it's taken apart
 * and sorted like the rest.
 * <p>
 * Turned on, it waits for a chest, a shulker box or the inventory to be opened (the module list is
 * a screen of its own, so nothing can be open while it's switched on there) and sorts in it - a
 * chest or shulker box together with the inventory. Each
 * bundle holding only filled maps (and bundles - those come out loose) is a source: its stacks come out one at a time into a free slot
 * (a right click with the bundle on the cursor), and from there go on into an output bundle. A
 * bundle emptied this way is free again and can become an output bundle itself. A stack of copies
 * of one map is split: one map for the unique bundle if that map wasn't met before, the rest for
 * the duplicates. Loose filled maps in the inventory are sorted the same way if the setting says so.
 * <p>
 * Every click is predicted on the client as the game does, but a server that sends its slots back
 * after clicks (one behind ViaVersion does, as bundle contents don't match its check) answers late,
 * and its answer to an old click undoes the clicks made since. So by default each click waits a
 * round trip and until no slot updates have come for a moment. If the slots still aren't what a
 * step expected, the sorter waits for the server to settle, puts the cursor down, rebuilds the
 * maps it counts as taken from what the unique bundles really hold and carries on.
 * <p>
 * Closing the screen, leaving the server or running out of room only pauses it: it stays on and
 * carries on when a screen is opened again, after a restart too (Meteor turns it back on). Most
 * of where it was is in the bundles themselves - what the unique ones hold is taken, whatever
 * else holds maps is still to sort - and the rest is kept in the module's config: the maps it took
 * out of a bundle and hadn't put away yet, which it picks up loose from the inventory, loose-maps
 * or not. A server hands an item left on the cursor back into the inventory on leaving.
 */
public class MapArtSorter extends Module {
    private final SettingGroup sgGeneral = settings.getDefaultGroup();

    private final Setting<Item> uniqueBundle = sgGeneral.add(new ItemSetting.Builder()
        .name("unique-bundle")
        .description("Empty bundles of this colour get one copy of every map.")
        .defaultValue(Items.BUNDLE)
        .filter(item -> item instanceof BundleItem)
        .build()
    );

    private final Setting<Item> duplicateBundle = sgGeneral.add(new ItemSetting.Builder()
        .name("duplicate-bundle")
        .description("Empty bundles of this colour get every other copy.")
        .defaultValue(Items.RED_BUNDLE)
        .filter(item -> item instanceof BundleItem)
        .build()
    );

    private final Setting<Boolean> looseMaps = sgGeneral.add(new BoolSetting.Builder()
        .name("loose-maps")
        .description("Sorts filled maps lying loose in your inventory too, not only the ones in bundles.")
        .defaultValue(true)
        .build()
    );

    private final Setting<Boolean> waitForServer = sgGeneral.add(new BoolSetting.Builder()
        .name("wait-for-server")
        .description("Each click waits for the server's answer (your ping) before the next. Slower, but the server's late answers can't undo the sorting.")
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

    /** Ticks a newly opened screen is given for the server to fill its slots before it's looked at. */
    private static final int OPEN_DELAY = 5;
    /** Ticks to let the server's corrections arrive after the slots weren't what a step expected. */
    private static final int SETTLE_TICKS = 10;
    /** Corrections in a row without a map put away before the sorter gives up. */
    private static final int MAX_RECOVERIES = 5;
    /** Ticks without a slot update from the server before the next click, with wait-for-server. */
    private static final int QUIET_TICKS = 2;

    private enum Phase { NEXT, TAKE_OUT, PUT_BACK, SORT, SPLIT, INTO_DUPLICATES, PICK_SINGLE, INTO_UNIQUE, RECOVER }

    private ScreenHandler handler;
    /** Slot ids the sorter works in: the player's main inventory and hotbar, then an open chest's or shulker's. */
    private final IntList slots = new IntArrayList();
    /** Bundles filled by the sorter, so they're never taken for sources. */
    private final IntList uniqueBundles = new IntArrayList();
    private final IntList duplicateBundles = new IntArrayList();
    /** Map ids already given to a unique bundle; rebuilt from the bundles after a correction. */
    private final IntSet seen = new IntOpenHashSet();
    /** Map ids taken out of a bundle and not put away yet; kept in the config so a restart picks them up loose. */
    private final IntSet pending = new IntOpenHashSet();
    /** The map id being put away now. */
    private int current;

    private Phase phase;
    private int source;
    private int work;
    /** The split stack still has its one map for the unique bundle waiting in the work slot. */
    private boolean singleLeft;
    private int clicks;
    private boolean running;
    /** Switched on and waiting for a screen to sort in. */
    private boolean waiting;
    /** The screen that was tried last and how long it's been open, so a screen with no maps is tried once. */
    private ScreenHandler tried;
    private int openTicks;
    private int settleTicks;
    private int recoveries;
    /** Set on the network thread when the server sends slots; taken on the next tick. */
    private volatile boolean slotsArrived;
    private long lastClick;
    private long lastSlots;

    private int duplicateCount;
    private long ticks;

    public MapArtSorter() {
        super(OnFocusAddon.CATEGORY, "map-art-sorter", "Sorts maps from bundles: one copy of every map into the unique bundles, every other copy into the duplicate bundles.");
    }

    @Override
    public void onActivate() {
        running = false;
        waiting = true;
        tried = null;
        openTicks = 0;
        if (pending.isEmpty()) info("Open the chest, shulker box or inventory with the map bundles.");
        else info("Open the chest with the map bundles to carry on - %d map(s) taken out earlier are picked up from your inventory.", pending.size());
    }

    /** Starts sorting in this screen; false if there's nothing to sort in it. */
    private boolean start(ScreenHandler screen) {
        handler = screen;
        slots.clear();
        uniqueBundles.clear();
        duplicateBundles.clear();
        seen.clear();

        boolean container = handler != mc.player.playerScreenHandler;
        for (Slot slot : handler.slots) {
            if (slot.inventory == mc.player.getInventory() && slot.getIndex() < 36) slots.add(slot.id);
        }
        if (container) {
            for (Slot slot : handler.slots) {
                if (slot.inventory != mc.player.getInventory()) slots.add(slot.id);
            }
        }

        if (!handler.getCursorStack().isEmpty()) {
            warning("Put down the item on your cursor and open it again.");
            return false;
        }
        // Same colour for both: there's no telling a unique bundle from a duplicate one, so only empty ones are taken
        if (uniqueBundle.get() != duplicateBundle.get()) keepSortedBundles();
        if (findSource() == -1 && findLoose() == -1) {
            warning("No bundles with maps here - open another chest, shulker box or the inventory.");
            return false;
        }
        if (uniqueBundle.get() == duplicateBundle.get()) {
            warning("Unique and duplicate bundles are the same colour - you won't tell them apart afterwards.");
        }

        phase = Phase.NEXT;
        work = -1;
        recoveries = 0;
        lastClick = Long.MIN_VALUE / 2;
        lastSlots = Long.MIN_VALUE / 2;
        duplicateCount = 0;
        ticks = 0;
        running = true;
        info("Sorting maps: one copy of each into (highlight)%s(default), the rest into (highlight)%s(default).",
            uniqueBundle.get().getName().getString(), duplicateBundle.get().getName().getString());
        return true;
    }

    @Override
    public void onDeactivate() {
        waiting = false;
        if (!running) return;
        running = false;
        if (mc.player != null && mc.player.currentScreenHandler == handler) putCursorDown();
        warning("Turned off - %d unique map(s) and %d duplicate(s) sorted so far. Turn it on again to carry on.", seen.size(), duplicateCount);
    }

    @EventHandler
    private void onTick(TickEvent.Pre event) {
        if (mc.player == null || mc.interactionManager == null) return;
        if (waiting) {
            waitForScreen();
            return;
        }
        if (!running) return;
        ticks++;
        if (slotsArrived) {
            slotsArrived = false;
            lastSlots = ticks;
        }

        if (mc.player.currentScreenHandler != handler) {
            pause("The screen was closed.");
            return;
        }

        if (waitForServer.get() && (ticks - lastClick < roundTripTicks() || ticks - lastSlots < QUIET_TICKS)) return;

        clicks = 0;
        int budget = waitForServer.get() ? 1 : clicksPerTick.get();
        while (running && clicks < budget) {
            if (!step()) break;
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

    /** Ticks for a click to reach the server and its answer to come back: the ping, plus one. */
    private int roundTripTicks() {
        PlayerListEntry entry = mc.getNetworkHandler() == null ? null : mc.getNetworkHandler().getPlayerListEntry(mc.player.getUuid());
        int latency = entry == null ? 150 : entry.getLatency();
        return Math.clamp((latency + 49) / 50 + 1, 2, 40);
    }

    /** Starts in the chest, shulker box or inventory once it's open and its slots have come from the server. */
    private void waitForScreen() {
        Screen screen = mc.currentScreen;
        boolean sortable = screen instanceof GenericContainerScreen || screen instanceof ShulkerBoxScreen || screen instanceof InventoryScreen;
        ScreenHandler open = mc.player.currentScreenHandler;
        if (!sortable || open != (screen instanceof InventoryScreen ? mc.player.playerScreenHandler : ((HandledScreen<?>) screen).getScreenHandler())) {
            tried = null;
            return;
        }
        if (open != tried) {
            tried = open;
            openTicks = 0;
        }
        // After a pause in this very screen openTicks is past the delay: it starts again only once reopened
        if (++openTicks != OPEN_DELAY) return;
        if (start(open)) waiting = false;
    }

    /** Does the next click. Returns false when there's nothing more to do this tick. */
    private boolean step() {
        ItemStack cursor = handler.getCursorStack();
        switch (phase) {
            case NEXT -> {
                // Maps left in the work slot by a correction are sorted first, loose-maps or not
                int loose = work != -1 && isMap(stack(work)) ? work : findLoose();
                if (loose != -1) {
                    work = loose;
                    phase = Phase.SORT;
                    return true;
                }
                source = findSource();
                if (source == -1) {
                    finish();
                    return false;
                }
                work = findEmpty();
                if (work == -1) {
                    pause("No free slot to take the maps out into - free one up.");
                    return false;
                }
                click(source, 0);
                phase = Phase.TAKE_OUT;
            }
            case TAKE_OUT -> {
                if (!isSource(cursor)) return recover("the bundle isn't on the cursor");
                // A right click on an empty slot takes one stack out into it
                click(work, 1);
                phase = Phase.PUT_BACK;
            }
            case PUT_BACK -> {
                if (!stack(source).isEmpty()) return recover("the bundle's slot isn't free");
                // From here the maps are out of their bundle: remembered until they're put away
                MapIdComponent out = stack(work).get(DataComponentTypes.MAP_ID);
                if (out != null) pending.add(out.id());
                click(source, 0);
                phase = Phase.SORT;
            }
            case SORT -> {
                ItemStack maps = stack(work);
                if (maps.getItem() instanceof BundleItem && cursor.isEmpty()) {
                    // A bundle that was in the bundle: it stays loose here, a source or a free bundle of its own
                    work = -1;
                    phase = Phase.NEXT;
                    return true;
                }
                if (!isMap(maps) || !cursor.isEmpty()) return recover("the maps taken out aren't in their slot");
                // Read before the click: picking the stack up empties this very ItemStack
                int count = maps.getCount();
                current = maps.get(DataComponentTypes.MAP_ID).id();
                pending.add(current);
                boolean first = seen.add(current);
                click(work, 0);
                if (first) {
                    phase = count > 1 ? Phase.SPLIT : Phase.INTO_UNIQUE;
                } else {
                    singleLeft = false;
                    phase = Phase.INTO_DUPLICATES;
                }
            }
            case SPLIT -> {
                if (!isMap(cursor) || !stack(work).isEmpty()) return recover("the maps to split aren't on the cursor");
                // One map back into the work slot for the unique bundle, the rest are duplicates
                click(work, 1);
                singleLeft = true;
                phase = Phase.INTO_DUPLICATES;
            }
            case INTO_DUPLICATES -> {
                if (cursor.isEmpty()) {
                    if (!singleLeft) putAway();
                    phase = singleLeft ? Phase.PICK_SINGLE : Phase.NEXT;
                    return true;
                }
                // Only maps ever go into a bundle - after a correction the cursor can hold anything
                if (!isMap(cursor)) return recover("the cursor doesn't hold maps");
                return putIn(cursor, duplicateBundles, duplicateBundle.get());
            }
            case PICK_SINGLE -> {
                if (!isMap(stack(work)) || !cursor.isEmpty()) return recover("the map for the unique bundle isn't in its slot");
                click(work, 0);
                phase = Phase.INTO_UNIQUE;
            }
            case INTO_UNIQUE -> {
                if (cursor.isEmpty()) {
                    putAway();
                    phase = Phase.NEXT;
                    return true;
                }
                if (!isMap(cursor)) return recover("the cursor doesn't hold maps");
                return putIn(cursor, uniqueBundles, uniqueBundle.get());
            }
            case RECOVER -> {
                if (++settleTicks < SETTLE_TICKS) return false;
                if (!cursor.isEmpty()) {
                    int target = findEmpty();
                    if (target == -1) {
                        pause("No free slot to put the cursor down after the server corrected the slots.");
                        return false;
                    }
                    click(target, 0);
                    if (isMap(stack(target))) work = target;
                    settleTicks = 0;
                    return false;
                }
                rebuildSeen();
                phase = Phase.NEXT;
            }
        }
        return true;
    }

    /** The current map is in its bundles: nothing of it is left loose to pick up after a restart. */
    private void putAway() {
        pending.remove(current);
    }

    /**
     * The slots aren't what this step expected - most likely the server undid a click and sent its
     * own slots back. Waits for that to settle, then starts the next map over.
     */
    private boolean recover(String what) {
        if (++recoveries > MAX_RECOVERIES) {
            pause("The server keeps correcting the slots (" + what + ").");
            return false;
        }
        OnFocusAddon.LOG.warn("[MapArtSorter] Slots not as expected in {} ({}), cursor holds {} - waiting for the server", phase, what, handler.getCursorStack());
        warning("The server corrected the slots (%s) - picking up from there.", what);
        phase = Phase.RECOVER;
        settleTicks = 0;
        return false;
    }

    /**
     * Bundles of the two colours that already hold sorted maps become outputs as they are. A unique
     * one must hold single maps no other unique bundle (or itself) holds yet; a duplicate one only maps.
     */
    private void keepSortedBundles() {
        for (int id : slots) {
            ItemStack stack = stack(id);
            BundleContentsComponent contents = stack.get(DataComponentTypes.BUNDLE_CONTENTS);
            if (contents == null) continue;
            if (stack.isOf(uniqueBundle.get())) {
                IntSet ids = new IntOpenHashSet();
                boolean clean = true;
                for (ItemStack map : contents.iterate()) {
                    if (!isMap(map) || map.getCount() != 1 || seen.contains(map.get(DataComponentTypes.MAP_ID).id())
                        || !ids.add(map.get(DataComponentTypes.MAP_ID).id())) {
                        clean = false;
                        break;
                    }
                }
                if (!clean) continue;
                seen.addAll(ids);
                uniqueBundles.add(id);
            } else if (stack.isOf(duplicateBundle.get())) {
                boolean clean = true;
                for (ItemStack map : contents.iterate()) clean &= isMap(map);
                if (clean) duplicateBundles.add(id);
            }
        }
    }

    /** The map ids the unique bundles really hold. */
    private void rebuildSeen() {
        seen.clear();
        for (int id : uniqueBundles) {
            BundleContentsComponent contents = stack(id).get(DataComponentTypes.BUNDLE_CONTENTS);
            if (contents == null) continue;
            for (ItemStack map : contents.iterate()) {
                MapIdComponent mapId = map.get(DataComponentTypes.MAP_ID);
                if (mapId != null) seen.add(mapId.id());
            }
        }
    }

    /**
     * Clicks the maps on the cursor into the first of these bundles with room, or a new empty bundle
     * of this colour. Whatever doesn't fit stays on the cursor for the next bundle.
     */
    private boolean putIn(ItemStack cursor, IntList bundles, Item colour) {
        int target = -1;
        for (int i = 0; i < bundles.size() && target == -1; i++) {
            if (fits(stack(bundles.getInt(i)), cursor)) target = bundles.getInt(i);
        }
        if (target == -1) {
            target = findEmptyBundle(colour);
            if (target == -1) {
                List<String> held = new ArrayList<>();
                for (int id : bundles) held.add("slot " + id + ": " + stack(id) + " " + stack(id).get(DataComponentTypes.BUNDLE_CONTENTS));
                OnFocusAddon.LOG.warn("[MapArtSorter] No {} takes {} - its bundles: {}", colour, cursor, held);
                pause("Out of room in " + colour.getName().getString() + "s (" + bundles.size() + " full) - add empty ones and open it again.");
                return false;
            }
            bundles.add(target);
        }
        int before = cursor.getCount();
        click(target, 0);
        int added = before - handler.getCursorStack().getCount();
        if (added <= 0) return recover("a bundle didn't take the maps");
        if (bundles == duplicateBundles) duplicateCount += added;
        recoveries = 0;
        return true;
    }

    private void finish() {
        running = false;
        pending.clear();
        info("Done in (highlight)%ds(default) - %d unique map(s) in %d bundle(s), %d duplicate(s) in %d bundle(s).",
            Math.round(ticks / 20.0), seen.size(), uniqueBundles.size(), duplicateCount, duplicateBundles.size());
        toggle();
    }

    /** Stops sorting but stays on: it carries on when a screen is opened again. */
    private void pause(String reason) {
        warning("%s Paused after %d unique map(s) and %d duplicate(s) - open the chest again to carry on.", reason, seen.size(), duplicateCount);
        running = false;
        waiting = true;
        if (mc.player.currentScreenHandler == handler) {
            putCursorDown();
            // Not in this same screen again: only once it's reopened
            tried = handler;
            openTicks = OPEN_DELAY;
        } else {
            tried = null;
        }
    }

    /** Puts whatever is on the cursor into a free slot, so a stop never leaves maps hanging on it. */
    private void putCursorDown() {
        if (handler.getCursorStack().isEmpty()) return;
        int target = findEmpty();
        if (target != -1) click(target, 0);
        else warning("No free slot - the items are still on the cursor.");
    }

    /** A bundle holding only filled maps and bundles that the sorter didn't fill itself. */
    private int findSource() {
        for (int id : slots) {
            if (!uniqueBundles.contains(id) && !duplicateBundles.contains(id) && isSource(stack(id))) return id;
        }
        return -1;
    }

    /** A loose stack of filled maps in the player's own inventory: any with loose-maps, else only ones it took out itself. */
    private int findLoose() {
        for (int id : slots) {
            Slot slot = handler.getSlot(id);
            if (slot.inventory != mc.player.getInventory() || !isMap(slot.getStack())) continue;
            if (looseMaps.get() || pending.contains(slot.getStack().get(DataComponentTypes.MAP_ID).id())) return id;
        }
        return -1;
    }

    /** An empty slot, the player's own inventory first. */
    private int findEmpty() {
        for (int id : slots) {
            if (stack(id).isEmpty()) return id;
        }
        return -1;
    }

    private int findEmptyBundle(Item colour) {
        for (int id : slots) {
            ItemStack stack = stack(id);
            BundleContentsComponent contents = stack.get(DataComponentTypes.BUNDLE_CONTENTS);
            if (stack.isOf(colour) && contents != null && contents.isEmpty()
                && !uniqueBundles.contains(id) && !duplicateBundles.contains(id)) return id;
        }
        return -1;
    }

    private static boolean isMap(ItemStack stack) {
        return stack.isOf(Items.FILLED_MAP) && stack.contains(DataComponentTypes.MAP_ID);
    }

    /** A bundle to take apart: it holds filled maps, and bundles put in it by mistake, and nothing else. */
    private static boolean isSource(ItemStack stack) {
        if (!(stack.getItem() instanceof BundleItem)) return false;
        BundleContentsComponent contents = stack.get(DataComponentTypes.BUNDLE_CONTENTS);
        if (contents == null || contents.isEmpty()) return false;
        List<ItemStack> items = new ArrayList<>();
        contents.iterate().forEach(items::add);
        return items.stream().allMatch(item -> isMap(item) || item.getItem() instanceof BundleItem);
    }

    /** Whether at least one of these maps goes into the bundle. */
    private static boolean fits(ItemStack bundle, ItemStack maps) {
        BundleContentsComponent contents = bundle.get(DataComponentTypes.BUNDLE_CONTENTS);
        // The builder only works on copies: nothing is changed, it just says how much would fit
        return bundle.getItem() instanceof BundleItem && contents != null && new BundleContentsComponent.Builder(contents).add(maps.copy()) > 0;
    }

    private void click(int slot, int button) {
        mc.interactionManager.clickSlot(handler.syncId, slot, button, SlotActionType.PICKUP, mc.player);
        clicks++;
        lastClick = ticks;
    }

    private ItemStack stack(int slot) {
        return handler.getSlot(slot).getStack();
    }

    @Override
    public String getInfoString() {
        if (waiting) return "waiting";
        if (!running) return null;
        return seen.size() + " / " + duplicateCount;
    }

    @Override
    public NbtCompound toTag() {
        NbtCompound tag = super.toTag();
        if (tag == null) return null;
        tag.putIntArray("pending", pending.toIntArray());
        return tag;
    }

    @Override
    public MapArtSorter fromTag(NbtCompound tag) {
        // Before super, which turns the module back on and says what's pending
        pending.clear();
        for (int id : tag.getIntArray("pending")) pending.add(id);
        super.fromTag(tag);
        return this;
    }
}
