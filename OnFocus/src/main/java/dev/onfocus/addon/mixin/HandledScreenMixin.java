package dev.onfocus.addon.mixin;

import dev.onfocus.addon.modules.EzBundles;
import meteordevelopment.meteorclient.systems.modules.Modules;
import net.minecraft.client.gui.screen.Screen;
import net.minecraft.client.gui.screen.ingame.HandledScreen;
import net.minecraft.item.Item;
import net.minecraft.screen.ScreenHandler;
import net.minecraft.screen.slot.Slot;
import net.minecraft.screen.slot.SlotActionType;
import org.spongepowered.asm.mixin.Final;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.Shadow;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfoReturnable;

/**
 * {@link EzBundles}: with a bundle on the cursor, a left or right press, the sweep and letting go are
 * taken over from the screen, which would otherwise spread the cursor stack over the slots swept.
 * Other clicks on slots meanwhile - Mouse Tweaks' drag clicks the slot again - are dropped: one more
 * right click with the bundle on a stack it just took out swaps the bundle into the slot.
 */
@Mixin(HandledScreen.class)
public abstract class HandledScreenMixin {
    @Shadow @Final protected ScreenHandler handler;

    @Shadow
    private Slot getSlotAt(double x, double y) {
        throw new AssertionError();
    }

    @Shadow
    protected abstract void onMouseClick(Slot slot, int slotId, int button, SlotActionType actionType);

    /** Set while the click going through is one of ours. */
    private boolean onfocus$ownClick;

    private static EzBundles onfocus$ezBundles() {
        Modules modules = Modules.get();
        return modules == null ? null : modules.get(EzBundles.class);
    }

    @Inject(method = "mouseClicked", at = @At("HEAD"), cancellable = true)
    private void onfocus$pressed(double x, double y, int button, CallbackInfoReturnable<Boolean> cir) {
        EzBundles ez = onfocus$ezBundles();
        if ((button != 0 && button != 1) || ez == null || !ez.starts((Screen) (Object) this, handler)) return;
        Slot slot = getSlotAt(x, y);
        if (slot == null) return; // outside the slots: the game's own (dropping the bundle)
        if (button == 0 && Screen.hasControlDown() && slot.hasStack()) {
            ez.beginCollect();
            onfocus$collect(ez, slot);
        } else {
            ez.begin(slot, x, y, button == 1);
            onfocus$take(ez, slot);
        }
        cir.setReturnValue(true);
    }

    @Inject(method = "mouseDragged", at = @At("HEAD"), cancellable = true)
    private void onfocus$dragged(double x, double y, int button, double dx, double dy, CallbackInfoReturnable<Boolean> cir) {
        EzBundles ez = onfocus$ezBundles();
        if (ez == null || !ez.dragging()) return;
        // Every few pixels from where the mouse was: a quick sweep jumps over slots between two moves
        double fromX = ez.lastX(), fromY = ez.lastY();
        int steps = Math.max(1, (int) Math.ceil(Math.hypot(x - fromX, y - fromY) / EzBundles.STEP_PIXELS));
        for (int i = 1; i <= steps; i++) {
            Slot slot = getSlotAt(fromX + (x - fromX) * i / steps, fromY + (y - fromY) * i / steps);
            if (slot != null) onfocus$take(ez, slot);
        }
        ez.movedTo(x, y);
        cir.setReturnValue(true);
    }

    @Inject(method = "mouseReleased", at = @At("HEAD"), cancellable = true)
    private void onfocus$released(double x, double y, int button, CallbackInfoReturnable<Boolean> cir) {
        EzBundles ez = onfocus$ezBundles();
        if (ez == null || !ez.dragging() || button != ez.button()) return;
        Slot slot = getSlotAt(x, y);
        // Nothing moved and let go where pressed: the plain click it was (the bundle put down or swapped)
        if (ez.end(slot)) onfocus$click(slot, button);
        cir.setReturnValue(true);
    }

    /**
     * The game's click with the bundle on this slot: a left click puts its item in, as much as fits;
     * a right click on an empty slot takes a stack out.
     */
    private void onfocus$take(EzBundles ez, Slot slot) {
        if (ez.take(slot, handler)) onfocus$click(slot, ez.button());
    }

    /** Ctrl + click: the clicked stack, then every other stack of that item in the screen, until the bundle is full. */
    private void onfocus$collect(EzBundles ez, Slot clicked) {
        Item item = clicked.getStack().getItem();
        if (ez.collects(clicked, handler, item)) onfocus$click(clicked, 0);
        for (Slot slot : handler.slots) {
            if (slot != clicked && ez.collects(slot, handler, item)) onfocus$click(slot, 0);
        }
    }

    private void onfocus$click(Slot slot, int button) {
        onfocus$ownClick = true;
        try {
            onMouseClick(slot, slot.id, button, SlotActionType.PICKUP);
        } finally {
            onfocus$ownClick = false;
        }
    }

    @Inject(method = "onMouseClick(Lnet/minecraft/screen/slot/Slot;IILnet/minecraft/screen/slot/SlotActionType;)V", at = @At("HEAD"), cancellable = true)
    private void onfocus$otherClick(Slot slot, int slotId, int button, SlotActionType actionType, CallbackInfo ci) {
        if (onfocus$ownClick || slot == null || actionType != SlotActionType.PICKUP) return;
        EzBundles ez = onfocus$ezBundles();
        // A bundle on the cursor: Ez Bundles makes every slot click itself
        if (ez != null && ez.starts((Screen) (Object) this, handler)) ci.cancel();
    }
}
