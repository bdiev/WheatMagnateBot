package dev.onfocus.addon.mixin;

import dev.onfocus.addon.modules.EzBundles;
import meteordevelopment.meteorclient.systems.modules.Modules;
import net.minecraft.client.gui.screen.Screen;
import net.minecraft.client.gui.screen.ingame.HandledScreen;
import net.minecraft.screen.ScreenHandler;
import net.minecraft.screen.slot.Slot;
import net.minecraft.screen.slot.SlotActionType;
import org.spongepowered.asm.mixin.Final;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.Shadow;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfoReturnable;

/**
 * {@link EzBundles}: with a bundle on the cursor, a left press, the sweep and letting go are taken
 * over from the screen, which would otherwise spread the cursor stack over the slots swept.
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

    private static EzBundles onfocus$ezBundles() {
        Modules modules = Modules.get();
        return modules == null ? null : modules.get(EzBundles.class);
    }

    @Inject(method = "mouseClicked", at = @At("HEAD"), cancellable = true)
    private void onfocus$pressed(double x, double y, int button, CallbackInfoReturnable<Boolean> cir) {
        EzBundles ez = onfocus$ezBundles();
        if (button != 0 || ez == null || !ez.starts((Screen) (Object) this, handler)) return;
        Slot slot = getSlotAt(x, y);
        if (slot == null) return; // outside the slots: the game's own (dropping the bundle)
        ez.begin(slot, x, y);
        onfocus$take(ez, slot);
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
        if (button != 0 || ez == null || !ez.dragging()) return;
        Slot slot = getSlotAt(x, y);
        // Nothing put in and let go where pressed: the plain click it was (the bundle put down or swapped)
        if (ez.end(slot)) onMouseClick(slot, slot.id, 0, SlotActionType.PICKUP);
        cir.setReturnValue(true);
    }

    /** The game's left click with the bundle on this slot: its item goes in, as much as fits. */
    private void onfocus$take(EzBundles ez, Slot slot) {
        if (ez.take(slot, handler)) onMouseClick(slot, slot.id, 0, SlotActionType.PICKUP);
    }
}
