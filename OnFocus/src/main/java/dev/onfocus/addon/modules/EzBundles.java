package dev.onfocus.addon.modules;

import dev.onfocus.addon.OnFocusAddon;
import it.unimi.dsi.fastutil.ints.IntOpenHashSet;
import it.unimi.dsi.fastutil.ints.IntSet;
import meteordevelopment.meteorclient.settings.BoolSetting;
import meteordevelopment.meteorclient.settings.Setting;
import meteordevelopment.meteorclient.settings.SettingGroup;
import meteordevelopment.meteorclient.systems.modules.Module;
import net.minecraft.client.gui.screen.Screen;
import net.minecraft.client.gui.screen.ingame.CreativeInventoryScreen;
import net.minecraft.component.DataComponentTypes;
import net.minecraft.component.type.BundleContentsComponent;
import net.minecraft.item.BundleItem;
import net.minecraft.item.Item;
import net.minecraft.item.ItemStack;
import net.minecraft.screen.ScreenHandler;
import net.minecraft.screen.slot.Slot;

/**
 * With a bundle on the cursor, holding the left button and sweeping over items puts each into the
 * bundle - the game's own left click with a bundle, once per slot swept over. Without this the
 * game only clicks on letting go, and a sweep spreads the cursor stack instead. Holding the right
 * button and sweeping over empty slots takes the bundle's stacks out, one per slot. Ctrl + left
 * click on an item puts every stack of it in the screen into the bundle. The mouse is followed by
 * {@link dev.onfocus.addon.mixin.HandledScreenMixin}.
 */
public class EzBundles extends Module {
    /** Between two mouse moves, slots are looked for every this many pixels: a quick sweep skips none. */
    public static final double STEP_PIXELS = 4;

    private final SettingGroup sgGeneral = settings.getDefaultGroup();

    private final Setting<Boolean> sameItemOnly = sgGeneral.add(new BoolSetting.Builder()
        .name("same-item-only")
        .description("A sweep only puts in items of the same kind as the first one it put in.")
        .defaultValue(false)
        .build()
    );

    private boolean dragging;
    /** The sweep takes the bundle's stacks out into empty slots instead of putting items in. */
    private boolean unloading;
    /** A Ctrl + click: everything was done on the press, the rest of it only waits for the button to come up. */
    private boolean collecting;
    private final IntSet swept = new IntOpenHashSet();
    private int pressedSlot;
    private int moved;
    /** With same-item-only, the kind of the first item put in; null until then. */
    private Item filter;
    private double lastX, lastY;

    public EzBundles() {
        super(OnFocusAddon.CATEGORY, "ez-bundles", "Sweep over items with a bundle on the cursor to put them in (left button) or over empty slots to take them out (right button). Ctrl + click collects every stack of one item.");
    }

    @Override
    public void onDeactivate() {
        dragging = false;
        swept.clear();
    }

    /** Whether a press here is ours: a bundle on the cursor, in a screen whose slots are the server's. */
    public boolean starts(Screen screen, ScreenHandler handler) {
        return isActive() && !(screen instanceof CreativeInventoryScreen) && handler.getCursorStack().getItem() instanceof BundleItem;
    }

    public void begin(Slot slot, double x, double y, boolean unload) {
        dragging = true;
        unloading = unload;
        collecting = false;
        swept.clear();
        moved = 0;
        filter = null;
        pressedSlot = slot.id;
        lastX = x;
        lastY = y;
    }

    /** Starts a Ctrl + click: the press collects, the sweep and letting go do nothing. */
    public void beginCollect() {
        dragging = true;
        collecting = true;
        moved = 1;
    }

    public boolean dragging() {
        return dragging;
    }

    /** The mouse button the sweep's clicks use: 0 puts in, 1 takes out. */
    public int button() {
        return unloading ? 1 : 0;
    }

    /** The mouse's last position in the sweep; the next one is walked to from here. */
    public double lastX() { return lastX; }
    public double lastY() { return lastY; }

    public void movedTo(double x, double y) {
        lastX = x;
        lastY = y;
    }

    /** Whether the sweep should click this slot now: the first time it passes it, while the bundle's still on the cursor. */
    public boolean take(Slot slot, ScreenHandler handler) {
        if (!dragging || collecting || !swept.add(slot.id)) return false;
        ItemStack bundle = handler.getCursorStack();
        if (!(bundle.getItem() instanceof BundleItem)) return false;

        if (unloading) {
            ItemStack next = nextOut(bundle);
            if (next.isEmpty() || slot.hasStack() || !slot.canInsert(next)) return false;
        } else {
            ItemStack stack = slot.getStack();
            if (!canPutIn(slot, bundle)) return false;
            if (sameItemOnly.get()) {
                if (filter != null && !stack.isOf(filter)) return false;
                filter = stack.getItem();
            }
        }
        moved++;
        return true;
    }

    /** Ctrl + click: whether this slot's item is of that kind and goes in the bundle on the cursor. */
    public boolean collects(Slot slot, ScreenHandler handler, Item item) {
        return slot.getStack().isOf(item) && canPutIn(slot, handler.getCursorStack());
    }

    /**
     * Whether the slot's item goes in the bundle: some of it fits, it's an item bundles take, and it
     * comes from a slot an item could be put back in - a crafting or furnace result would be made or
     * taken instead.
     */
    private boolean canPutIn(Slot slot, ItemStack bundle) {
        ItemStack stack = slot.getStack();
        if (stack.isEmpty() || !slot.canInsert(stack) || !slot.canTakeItems(mc.player)) return false;
        if (!BundleContentsComponent.canBeBundled(stack)) return false;
        BundleContentsComponent contents = bundle.get(DataComponentTypes.BUNDLE_CONTENTS);
        // The builder only works on copies: nothing is changed, it just says how much would fit
        return contents != null && new BundleContentsComponent.Builder(contents).add(stack.copy()) > 0;
    }

    /** The stack a right click on an empty slot takes out: the selected one, or the first. */
    private static ItemStack nextOut(ItemStack bundle) {
        BundleContentsComponent contents = bundle.get(DataComponentTypes.BUNDLE_CONTENTS);
        if (contents == null || contents.isEmpty()) return ItemStack.EMPTY;
        return contents.get(contents.hasSelectedStack() ? contents.getSelectedStackIndex() : 0);
    }

    /** The sweep's over: true if it moved nothing and let go where it started, so it was a plain click. */
    public boolean end(Slot releasedOn) {
        dragging = false;
        swept.clear();
        return moved == 0 && releasedOn != null && releasedOn.id == pressedSlot;
    }
}
