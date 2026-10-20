package dev.onfocus.addon.modules;

import dev.onfocus.addon.OnFocusAddon;
import it.unimi.dsi.fastutil.ints.IntOpenHashSet;
import it.unimi.dsi.fastutil.ints.IntSet;
import meteordevelopment.meteorclient.systems.modules.Module;
import net.minecraft.client.gui.screen.Screen;
import net.minecraft.client.gui.screen.ingame.CreativeInventoryScreen;
import net.minecraft.item.BundleItem;
import net.minecraft.item.ItemStack;
import net.minecraft.screen.ScreenHandler;
import net.minecraft.screen.slot.Slot;

/**
 * With a bundle on the cursor, holding the left button and sweeping over items puts each into the
 * bundle - the game's own left click with a bundle, once per slot swept over. Without this the
 * game only clicks on letting go, and a sweep spreads the cursor stack instead. The mouse is
 * followed by {@link dev.onfocus.addon.mixin.HandledScreenMixin}.
 */
public class EzBundles extends Module {
    /** Between two mouse moves, slots are looked for every this many pixels: a quick sweep skips none. */
    public static final double STEP_PIXELS = 4;

    private boolean dragging;
    private final IntSet swept = new IntOpenHashSet();
    private int pressedSlot;
    private int inserted;
    private double lastX, lastY;

    public EzBundles() {
        super(OnFocusAddon.CATEGORY, "ez-bundles", "Hold left click with a bundle on the cursor and sweep over items to put them all in it.");
    }

    @Override
    public void onDeactivate() {
        dragging = false;
        swept.clear();
    }

    /** Whether a left press here starts a sweep: a bundle on the cursor, in a screen whose slots are the server's. */
    public boolean starts(Screen screen, ScreenHandler handler) {
        return isActive() && !(screen instanceof CreativeInventoryScreen) && handler.getCursorStack().getItem() instanceof BundleItem;
    }

    public void begin(Slot slot, double x, double y) {
        dragging = true;
        swept.clear();
        inserted = 0;
        pressedSlot = slot.id;
        lastX = x;
        lastY = y;
    }

    public boolean dragging() {
        return dragging;
    }

    /** The mouse's last position in the sweep; the next one is walked to from here. */
    public double lastX() { return lastX; }
    public double lastY() { return lastY; }

    public void movedTo(double x, double y) {
        lastX = x;
        lastY = y;
    }

    /**
     * Whether the slot's item should go in the bundle now: the first time the sweep passes it, while
     * the bundle's still on the cursor, and only from a slot an item could be put back in - a
     * crafting or furnace result would be made or taken instead.
     */
    public boolean take(Slot slot, ScreenHandler handler) {
        if (!dragging || !swept.add(slot.id)) return false;
        if (!(handler.getCursorStack().getItem() instanceof BundleItem)) return false;
        ItemStack stack = slot.getStack();
        if (stack.isEmpty() || !slot.canInsert(stack) || !slot.canTakeItems(mc.player)) return false;
        inserted++;
        return true;
    }

    /** The sweep's over: true if it put nothing in and let go where it started, so it was a plain click. */
    public boolean end(Slot releasedOn) {
        dragging = false;
        swept.clear();
        return inserted == 0 && releasedOn != null && releasedOn.id == pressedSlot;
    }
}
