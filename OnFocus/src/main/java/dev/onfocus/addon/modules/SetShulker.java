package dev.onfocus.addon.modules;

import dev.onfocus.addon.OnFocusAddon;
import meteordevelopment.meteorclient.events.entity.player.InteractBlockEvent;
import meteordevelopment.meteorclient.events.world.TickEvent;
import meteordevelopment.meteorclient.settings.BoolSetting;
import meteordevelopment.meteorclient.settings.IntSetting;
import meteordevelopment.meteorclient.settings.Setting;
import meteordevelopment.meteorclient.settings.SettingGroup;
import meteordevelopment.meteorclient.settings.StringSetting;
import meteordevelopment.meteorclient.systems.modules.Module;
import meteordevelopment.meteorclient.systems.modules.Modules;
import meteordevelopment.orbit.EventHandler;
import net.minecraft.block.ShulkerBoxBlock;
import net.minecraft.client.gui.screen.ingame.ShulkerBoxScreen;
import net.minecraft.component.DataComponentTypes;
import net.minecraft.component.type.EquippableComponent;
import net.minecraft.entity.EquipmentSlot;
import net.minecraft.item.BlockItem;
import net.minecraft.item.ItemStack;
import net.minecraft.item.Items;
import net.minecraft.nbt.NbtCompound;
import net.minecraft.nbt.NbtElement;
import net.minecraft.nbt.NbtList;
import net.minecraft.registry.Registries;
import net.minecraft.screen.ScreenHandler;
import net.minecraft.screen.slot.Slot;
import net.minecraft.screen.slot.SlotActionType;
import net.minecraft.text.Text;
import net.minecraft.util.Hand;
import net.minecraft.util.hit.BlockHitResult;
import net.minecraft.util.math.BlockPos;
import net.minecraft.util.math.Direction;
import net.minecraft.util.math.Vec3d;

import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * A gear shulker: open an empty shulker whose name has the keyword ("Set") and everything you carry
 * goes in - the armor first, then the offhand, the hotbar and the inventory, as far as 27 slots go -
 * the place each came from remembered; open it again with things in it and everything goes back where
 * it was - armor worn, the offhand item in the offhand, the rest in its slot. Placing such a shulker
 * opens it by itself, so placing is all it takes.
 * <p>
 * Armor can't be clicked while a container is open, so it's taken off (or put on) with the shulker
 * closed, and the shulker is opened again for the rest.
 * <p>
 * Always on: it does nothing until a shulker with the keyword is opened, and turning it off is ignored.
 * <p>
 * Places are kept as player inventory indices: 0-35 inventory (0-8 hotbar), 36-39 armor (feet to
 * head), 40 the offhand. Layouts are kept per shulker name and saved with the module.
 */
public class SetShulker extends Module {
    private static final int ARMOR_FEET = 36, ARMOR_HEAD = 39, OFFHAND = 40;
    private static final int SHULKER_SLOTS = 27;
    /** Ticks a freshly opened shulker is left alone for its contents to arrive from the server. */
    private static final int SETTLE_TICKS = 3;
    /** Ticks to wait for the server to open a shulker we clicked. */
    private static final int OPEN_TIMEOUT_TICKS = 40;
    /** Ticks to wait for a shulker that was just placed to show up in the world. */
    private static final int PLACE_WATCH_TICKS = 20;

    private final SettingGroup sgGeneral = settings.getDefaultGroup();

    private final Setting<String> keyword = sgGeneral.add(new StringSetting.Builder()
        .name("name-keyword")
        .description("A shulker whose name has this in it (any case) is a gear shulker.")
        .defaultValue("Set")
        .build()
    );

    private final Setting<Boolean> wholeInventory = sgGeneral.add(new BoolSetting.Builder()
        .name("whole-inventory")
        .description("Packs everything you carry - armor, offhand, hotbar and inventory. Off: only the armor, totems and elytras.")
        .defaultValue(true)
        .build()
    );

    private final Setting<Boolean> autoOpen = sgGeneral.add(new BoolSetting.Builder()
        .name("open-on-place")
        .description("Opens a gear shulker as soon as you place it, so it packs or unpacks right away.")
        .defaultValue(true)
        .build()
    );

    private final Setting<Boolean> closeWhenDone = sgGeneral.add(new BoolSetting.Builder()
        .name("close-when-done")
        .description("Closes the shulker once everything is packed or unpacked.")
        .defaultValue(true)
        .build()
    );

    private final Setting<Integer> delay = sgGeneral.add(new IntSetting.Builder()
        .name("delay")
        .description("Ticks between moving two items. 0 moves everything at once.")
        .defaultValue(1)
        .range(0, 20)
        .sliderRange(0, 10)
        .build()
    );

    /** A packed item: which shulker slot it went into, what it is, and where it came from. */
    private record Entry(int shulkerSlot, String item, int origin) {}

    /** The last layout packed into each gear shulker, by its name. */
    private final Map<String, List<Entry>> layouts = new HashMap<>();

    private final Deque<Runnable> steps = new ArrayDeque<>();
    private Runnable onDone;
    private int stepCooldown;

    /** The gear shulker last clicked or placed: where packing opens it again after taking the armor off. */
    private BlockPos shulkerPos;
    private BlockPos placing;
    private int placeWatch;
    /** Ticks left waiting for the server to open a shulker we clicked; 0 when not waiting. */
    private int openWait;
    /** The shulker screen already dealt with, so it isn't packed or unpacked twice. */
    private int handledSyncId = -1;
    private int settle;
    /** Armor taken off for packing: inventory index it's in now -> armor index it came from. */
    private final Map<Integer, Integer> stripped = new LinkedHashMap<>();
    /** A packing or unpacking that closed the shulker to reach the armor, and goes on once it's open again. */
    private enum Resume { NONE, PACK, UNPACK }
    private Resume resume = Resume.NONE;
    /** The shulker being packed or unpacked, by name. */
    private String workingOn;
    /** What's been packed so far, across both openings. */
    private final List<Entry> packed = new ArrayList<>();
    /** Items unpacked / left in the shulker so far, across both openings. */
    private int unpacked, leftBehind;
    /** The player entity last ticked: a new one (rejoin, respawn) drops whatever was in progress. */
    private Object lastPlayer;

    public SetShulker() {
        super(OnFocusAddon.CATEGORY, "set-shulker", "Gear shulker: place (or open) a shulker named \"Set\" and everything you carry is packed into it, armor first; place it again and everything goes back where it was.");
    }

    /** Always on: a toggle only ever turns it on. */
    @Override
    public void toggle() {
        if (!isActive()) super.toggle();
    }

    @Override
    public void onActivate() {
        reset();
    }

    private void reset() {
        steps.clear();
        onDone = null;
        stepCooldown = 0;
        shulkerPos = null;
        placing = null;
        placeWatch = 0;
        openWait = 0;
        handledSyncId = -1;
        settle = 0;
        workingOn = null;
        endWork();
    }

    @EventHandler
    private void onInteractBlock(InteractBlockEvent event) {
        if (mc.player == null || mc.world == null) return;
        BlockPos pos = event.result.getBlockPos();
        ItemStack held = mc.player.getStackInHand(event.hand);
        boolean placesInstead = mc.player.isSneaking() && !held.isEmpty();

        if (mc.world.getBlockState(pos).getBlock() instanceof ShulkerBoxBlock && !placesInstead) {
            // Opening a shulker: remember where, in case packing has to close and reopen it
            shulkerPos = pos.toImmutable();
            return;
        }
        if (!autoOpen.get() || !isGearShulker(held)) return;
        placing = (mc.world.getBlockState(pos).isReplaceable() ? pos : pos.offset(event.result.getSide())).toImmutable();
        placeWatch = PLACE_WATCH_TICKS;
    }

    @EventHandler
    private void onTick(TickEvent.Post event) {
        if (mc.player == null || mc.world == null || mc.interactionManager == null) return;
        if (mc.player != lastPlayer) {
            reset();
            lastPlayer = mc.player;
        }

        if (!steps.isEmpty() || onDone != null) {
            runSteps();
            return;
        }

        tickPlacing();

        ShulkerBoxScreen screen = mc.currentScreen instanceof ShulkerBoxScreen s && matches(s.getTitle().getString()) ? s : null;
        if (screen == null) {
            handledSyncId = -1;
            settle = 0;
            if (openWait > 0 && --openWait == 0) openFailed();
            return;
        }

        ScreenHandler handler = screen.getScreenHandler();
        if (handler.syncId == handledSyncId) return;
        if (++settle < SETTLE_TICKS) return;
        handledSyncId = handler.syncId;
        settle = 0;
        openWait = 0;
        decide(handler, screen.getTitle().getString());
    }

    // ---- Opening ----

    private void tickPlacing() {
        if (placeWatch <= 0) return;
        placeWatch--;
        if (mc.currentScreen != null || !(mc.world.getBlockState(placing).getBlock() instanceof ShulkerBoxBlock)) return;
        placeWatch = 0;
        open(placing);
    }

    private boolean open(BlockPos pos) {
        if (!mc.player.canInteractWithBlockAt(pos, 0)) return false;
        shulkerPos = pos;
        mc.interactionManager.interactBlock(mc.player, Hand.MAIN_HAND, new BlockHitResult(Vec3d.ofCenter(pos), Direction.UP, pos, false));
        openWait = OPEN_TIMEOUT_TICKS;
        return true;
    }

    private void openFailed() {
        if (resume == Resume.NONE) return;
        if (resume == Resume.PACK) {
            savePacked();
            warning("Couldn't open the shulker again - the armor taken off is left in your inventory.");
        } else {
            warning("Couldn't open the shulker again - open it to unpack the rest.");
        }
        endWork();
    }

    // ---- Packing / unpacking ----

    private void decide(ScreenHandler handler, String name) {
        if (resume != Resume.NONE && !name.equals(workingOn)) {
            // A different shulker than the one being worked on: what was started there is dropped
            if (resume == Resume.PACK) savePacked();
            endWork();
        }
        if (resume == Resume.PACK) {
            pack(handler, name);
            return;
        }
        if (resume == Resume.UNPACK) {
            unpack(handler, name);
            return;
        }

        workingOn = name;
        boolean empty = true;
        for (int s = 0; s < SHULKER_SLOTS && empty; s++) empty = !handler.getSlot(s).hasStack();
        if (empty) pack(handler, name);
        else unpack(handler, name);
    }

    /**
     * Everything goes in, the armor first. With armor worn it takes two openings: first everything
     * else (the first slots left for the armor - this also frees inventory slots for it), then with
     * the shulker closed the armor comes off, and once it's open again the armor goes in.
     */
    private void pack(ScreenHandler handler, String name) {
        int sync = handler.syncId;
        if (resume == Resume.NONE) {
            List<Integer> worn = new ArrayList<>();
            for (int a = ARMOR_HEAD; a >= ARMOR_FEET; a--) if (!inv(a).isEmpty()) worn.add(a);
            // The gear's going away: a totem put back in the offhand meanwhile would only get in the way
            if (!worn.isEmpty() || !carried().isEmpty()) Modules.get().get(AutoTotem.class).followSetShulker(false);
            if (!worn.isEmpty() && canReopen()) {
                resume = Resume.PACK;
                for (int[] m : carried()) queue(sync, () -> packOne(handler, m[0], m[1], worn.size()));
                onDone = () -> {
                    BlockPos pos = shulkerPos;
                    mc.player.closeHandledScreen();
                    for (int a : worn) queue(0, () -> takeOff(a));
                    onDone = () -> {
                        if (!open(pos)) openFailed();
                    };
                };
                return;
            }
            if (!worn.isEmpty()) warning("Don't know where this shulker is, so the worn armor stays on - place it or open it by hand.");
        }

        // The armor taken off (head first) into the first slots, then whatever is still carried
        List<int[]> moves = new ArrayList<>();
        stripped.entrySet().stream()
            .sorted((x, y) -> y.getValue() - x.getValue())
            .forEach(e -> moves.add(new int[] {e.getKey(), e.getValue()}));
        moves.addAll(carried());
        stripped.clear();
        resume = Resume.NONE;
        for (int[] m : moves) queue(sync, () -> packOne(handler, m[0], m[1], 0));
        onDone = () -> finishPack(name);
    }

    /** What's carried to be packed, as {inventory index, place}: the offhand, then the hotbar and the inventory. */
    private List<int[]> carried() {
        List<int[]> moves = new ArrayList<>();
        ItemStack offhand = inv(OFFHAND);
        if (!offhand.isEmpty() && (wholeInventory.get() || offhand.isOf(Items.TOTEM_OF_UNDYING))) moves.add(new int[] {OFFHAND, OFFHAND});
        for (int i = 0; i < 36; i++) {
            ItemStack stack = inv(i);
            if (stack.isEmpty() || stripped.containsKey(i)) continue;
            if (wholeInventory.get() || stack.isOf(Items.TOTEM_OF_UNDYING) || stack.isOf(Items.ELYTRA)) moves.add(new int[] {i, i});
        }
        return moves;
    }

    private void finishPack(String name) {
        int left = carried().size();
        for (int a = ARMOR_FEET; a <= ARMOR_HEAD; a++) if (!inv(a).isEmpty()) left++;
        boolean any = !packed.isEmpty();
        if (any) info("Packed (highlight)%d(default) items into (highlight)%s(default).", packed.size(), name);
        if (left > 0) warning("%d items stayed with you: the shulker has 27 slots, and shulkers don't go in.", left);
        savePacked();
        endWork();
        if (any && closeWhenDone.get()) mc.player.closeHandledScreen();
    }

    private void savePacked() {
        if (packed.isEmpty() || workingOn == null) return;
        layouts.put(workingOn, new ArrayList<>(packed));
        Modules.get().save();
    }

    private void endWork() {
        resume = Resume.NONE;
        packed.clear();
        stripped.clear();
        unpacked = leftBehind = 0;
    }

    /** True while packing or unpacking is in progress, the shulker closed in between included. */
    public boolean busy() {
        return !steps.isEmpty() || onDone != null || resume != Resume.NONE || openWait > 0;
    }

    private boolean canReopen() {
        return shulkerPos != null && mc.player.canInteractWithBlockAt(shulkerPos, 0);
    }

    /** Takes one armor piece off into a free inventory slot (player screen, shulker closed). */
    private void takeOff(int armor) {
        if (inv(armor).isEmpty()) return;
        int free = freeSlot(Set.of());
        if (free < 0) return;
        ScreenHandler handler = mc.player.playerScreenHandler;
        click(handler, armorSlotId(armor), 0, SlotActionType.PICKUP);
        // Curse of Binding: the server won't let it come off
        if (handler.getCursorStack().isEmpty()) return;
        click(handler, playerSlotId(handler, free), 0, SlotActionType.PICKUP);
        stripped.put(free, armor);
    }

    /** Moves an item into the first free shulker slot from {@code start} on, remembering where it came from. */
    private void packOne(ScreenHandler handler, int from, int origin, int start) {
        ItemStack stack = inv(from);
        if (stack.isEmpty()) return;
        int target = -1;
        for (int s = start; s < SHULKER_SLOTS && target < 0; s++) {
            Slot slot = handler.getSlot(s);
            if (!slot.hasStack() && slot.canInsert(stack)) target = s;
        }
        if (target < 0) return;

        String item = itemId(stack);
        if (from == OFFHAND) click(handler, target, OFFHAND, SlotActionType.SWAP);
        else {
            click(handler, playerSlotId(handler, from), 0, SlotActionType.PICKUP);
            click(handler, target, 0, SlotActionType.PICKUP);
        }
        packed.add(new Entry(target, item, origin));
    }

    /**
     * Everything goes back to its remembered place; what has none goes to its natural place (armor
     * on, a totem in the offhand) or any free slot. The armor goes first: it's moved out, put on with
     * the shulker closed, and the rest unpacked once it's open again - so the slots it waits in are
     * free again for what was packed from there.
     */
    private void unpack(ScreenHandler handler, String name) {
        List<Entry> layout = layouts.getOrDefault(name, List.of());
        Set<Entry> used = new HashSet<>();
        List<int[]> toInventory = new ArrayList<>(), toOffhand = new ArrayList<>(), toArmor = new ArrayList<>(), anywhere = new ArrayList<>();
        Set<Integer> reserved = new HashSet<>();
        for (int s = 0; s < SHULKER_SLOTS; s++) {
            ItemStack stack = handler.getSlot(s).getStack();
            if (stack.isEmpty()) continue;
            Entry entry = find(layout, s, stack, used);
            if (entry != null) used.add(entry);
            int place = entry != null ? entry.origin() : fallbackPlace(stack);
            int[] move = {s, place};
            if (place < 0) anywhere.add(move);
            else if (place == OFFHAND) toOffhand.add(move);
            else if (place >= ARMOR_FEET) toArmor.add(move);
            else {
                toInventory.add(move);
                reserved.add(place);
            }
        }

        // Opened again after putting the armor on: what's left is counted afresh
        boolean again = resume == Resume.UNPACK;
        resume = Resume.NONE;
        if (again) leftBehind = 0;

        int sync = handler.syncId;
        Map<Integer, Integer> toEquip = new LinkedHashMap<>();
        for (int[] m : toArmor) queue(sync, () -> count(unpackArmor(handler, m[0], m[1], reserved, toEquip)));
        onDone = () -> {
            if (!toEquip.isEmpty() && !again && canReopen()) {
                BlockPos pos = shulkerPos;
                resume = Resume.UNPACK;
                mc.player.closeHandledScreen();
                queueEquip(toEquip);
                onDone = () -> {
                    if (!open(pos)) openFailed();
                };
                return;
            }
            for (int[] m : toInventory) queue(sync, () -> count(unpackToInventory(handler, m[0], m[1], reserved)));
            for (int[] m : toOffhand) queue(sync, () -> count(unpackToOffhand(handler, m[0], reserved)));
            for (int[] m : anywhere) queue(sync, () -> count(unpackToInventory(handler, m[0], -1, reserved)));
            onDone = () -> {
                if (toEquip.isEmpty()) {
                    finishUnpack(name);
                    return;
                }
                // Armor is put on from the player's own screen
                mc.player.closeHandledScreen();
                queueEquip(toEquip);
                onDone = () -> finishUnpack(name);
            };
        };
    }

    private void count(boolean moved) {
        if (moved) unpacked++;
        else leftBehind++;
    }

    private void queueEquip(Map<Integer, Integer> toEquip) {
        for (Map.Entry<Integer, Integer> e : toEquip.entrySet()) queue(0, () -> putOn(e.getKey(), e.getValue()));
    }

    private void finishUnpack(String name) {
        if (unpacked > 0) info("Unpacked (highlight)%d(default) items from (highlight)%s(default).", unpacked, name);
        if (leftBehind > 0) warning("%d items stayed in the shulker: no room for them.", leftBehind);
        if (unpacked > 0) Modules.get().get(AutoTotem.class).followSetShulker(true);
        endWork();
        if (closeWhenDone.get() && mc.currentScreen instanceof ShulkerBoxScreen) mc.player.closeHandledScreen();
    }

    /** Moves an item to its place in the inventory; a place of -1, or one that's taken, means any free slot. */
    private boolean unpackToInventory(ScreenHandler handler, int from, int place, Set<Integer> reserved) {
        if (!handler.getSlot(from).hasStack()) return false;
        int target = place >= 0 && inv(place).isEmpty() ? place : freeSlot(reserved);
        if (target < 0) target = freeSlot(Set.of());
        if (target < 0) return false;
        click(handler, from, 0, SlotActionType.PICKUP);
        click(handler, playerSlotId(handler, target), 0, SlotActionType.PICKUP);
        return true;
    }

    private boolean unpackToOffhand(ScreenHandler handler, int from, Set<Integer> reserved) {
        if (!handler.getSlot(from).hasStack()) return false;
        if (inv(OFFHAND).isEmpty()) {
            click(handler, from, OFFHAND, SlotActionType.SWAP);
            return true;
        }
        return unpackToInventory(handler, from, -1, reserved);
    }

    /** Moves an armor piece to a free inventory slot, to be put on once the shulker is closed. */
    private boolean unpackArmor(ScreenHandler handler, int from, int armor, Set<Integer> reserved, Map<Integer, Integer> toEquip) {
        // Already wearing something there: leave it in the shulker rather than swap gear around
        if (!handler.getSlot(from).hasStack() || !inv(armor).isEmpty() || toEquip.containsValue(armor)) return false;
        Set<Integer> taken = new HashSet<>(reserved);
        taken.addAll(toEquip.keySet());
        int free = freeSlot(taken);
        // Only remembered places are free: one can wait there, it's free again once the armor is on
        if (free < 0) free = freeSlot(toEquip.keySet());
        if (free < 0) return false;
        click(handler, from, 0, SlotActionType.PICKUP);
        click(handler, playerSlotId(handler, free), 0, SlotActionType.PICKUP);
        toEquip.put(free, armor);
        return true;
    }

    private void putOn(int from, int armor) {
        ScreenHandler handler = mc.player.playerScreenHandler;
        if (inv(from).isEmpty() || !inv(armor).isEmpty()) return;
        click(handler, playerSlotId(handler, from), 0, SlotActionType.PICKUP);
        click(handler, armorSlotId(armor), 0, SlotActionType.PICKUP);
        // Not wearable there after all: put it back
        if (!handler.getCursorStack().isEmpty()) click(handler, playerSlotId(handler, from), 0, SlotActionType.PICKUP);
    }

    // ---- Steps ----

    /** Queues a step that only runs while the screen with this sync id is open and the cursor is empty. */
    private void queue(int syncId, Runnable step) {
        steps.add(() -> {
            ScreenHandler handler = mc.player.currentScreenHandler;
            if (handler.syncId != syncId || !handler.getCursorStack().isEmpty()) {
                abort();
                return;
            }
            step.run();
        });
    }

    private void runSteps() {
        if (stepCooldown > 0) {
            stepCooldown--;
            return;
        }
        do {
            Runnable step = steps.poll();
            if (step != null) step.run();
        } while (delay.get() == 0 && !steps.isEmpty());
        stepCooldown = delay.get();
        if (steps.isEmpty() && onDone != null) {
            Runnable done = onDone;
            onDone = null;
            done.run();
        }
    }

    private void abort() {
        steps.clear();
        onDone = null;
        savePacked();
        warning(stripped.isEmpty() ? "Interrupted - the screen closed or an item is on the cursor." : "Interrupted - the armor taken off is left in your inventory.");
        endWork();
    }

    // ---- Helpers ----

    private boolean isGearShulker(ItemStack stack) {
        if (!(stack.getItem() instanceof BlockItem item) || !(item.getBlock() instanceof ShulkerBoxBlock)) return false;
        Text name = stack.get(DataComponentTypes.CUSTOM_NAME);
        return name != null && matches(name.getString());
    }

    private boolean matches(String name) {
        String key = keyword.get().trim();
        return !key.isEmpty() && name.toLowerCase().contains(key.toLowerCase());
    }

    /** The remembered entry for this item: the one packed into this very slot, else any other of the same item. */
    private static Entry find(List<Entry> layout, int slot, ItemStack stack, Set<Entry> used) {
        String item = itemId(stack);
        Entry other = null;
        for (Entry e : layout) {
            if (used.contains(e) || !e.item().equals(item)) continue;
            if (e.shulkerSlot() == slot) return e;
            if (other == null) other = e;
        }
        return other;
    }

    /** Where an item with nothing remembered goes: armor on, the totem in the offhand; -1 if it's not gear. */
    private static int fallbackPlace(ItemStack stack) {
        if (stack.isOf(Items.TOTEM_OF_UNDYING)) return OFFHAND;
        EquippableComponent equippable = stack.get(DataComponentTypes.EQUIPPABLE);
        if (equippable != null && equippable.slot().getType() == EquipmentSlot.Type.HUMANOID_ARMOR) return ARMOR_FEET + equippable.slot().getEntitySlotId();
        return -1;
    }

    private ItemStack inv(int index) {
        return mc.player.getInventory().getStack(index);
    }

    /** An empty inventory slot, the main inventory before the hotbar; -1 if there's none. */
    private int freeSlot(Set<Integer> excluded) {
        for (int i = 9; i < 36; i++) if (inv(i).isEmpty() && !excluded.contains(i)) return i;
        for (int i = 0; i < 9; i++) if (inv(i).isEmpty() && !excluded.contains(i)) return i;
        return -1;
    }

    /** The screen slot showing this player inventory index (0-35). */
    private int playerSlotId(ScreenHandler handler, int index) {
        for (Slot slot : handler.slots) if (slot.inventory == mc.player.getInventory() && slot.getIndex() == index) return slot.id;
        throw new IllegalStateException("No slot for inventory index " + index);
    }

    /** The player screen's slot for an armor index: 5 head, 6 chest, 7 legs, 8 feet. */
    private static int armorSlotId(int armor) {
        return 8 - (armor - ARMOR_FEET);
    }

    private void click(ScreenHandler handler, int slotId, int button, SlotActionType action) {
        mc.interactionManager.clickSlot(handler.syncId, slotId, button, action, mc.player);
    }

    private static String itemId(ItemStack stack) {
        return Registries.ITEM.getId(stack.getItem()).toString();
    }

    // ---- Saving ----

    @Override
    public NbtCompound toTag() {
        NbtCompound tag = super.toTag();
        if (tag == null) return null;
        NbtCompound all = new NbtCompound();
        for (Map.Entry<String, List<Entry>> e : layouts.entrySet()) {
            NbtList list = new NbtList();
            for (Entry entry : e.getValue()) {
                NbtCompound c = new NbtCompound();
                c.putInt("slot", entry.shulkerSlot());
                c.putString("item", entry.item());
                c.putInt("from", entry.origin());
                list.add(c);
            }
            all.put(e.getKey(), list);
        }
        tag.put("layouts", all);
        return tag;
    }

    @Override
    public SetShulker fromTag(NbtCompound tag) {
        layouts.clear();
        NbtCompound all = tag.getCompound("layouts");
        for (String name : all.getKeys()) {
            List<Entry> layout = new ArrayList<>();
            NbtList list = all.getList(name, NbtElement.COMPOUND_TYPE);
            for (int i = 0; i < list.size(); i++) {
                NbtCompound c = list.getCompound(i);
                layout.add(new Entry(c.getInt("slot"), c.getString("item"), c.getInt("from")));
            }
            layouts.put(name, layout);
        }
        super.fromTag(tag);
        return this;
    }
}
