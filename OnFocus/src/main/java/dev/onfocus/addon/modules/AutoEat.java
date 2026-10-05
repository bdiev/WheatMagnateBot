package dev.onfocus.addon.modules;

import dev.onfocus.addon.OnFocusAddon;
import meteordevelopment.meteorclient.events.entity.player.ItemUseCrosshairTargetEvent;
import meteordevelopment.meteorclient.events.game.GameLeftEvent;
import meteordevelopment.meteorclient.events.world.TickEvent;
import meteordevelopment.meteorclient.pathing.PathManagers;
import meteordevelopment.meteorclient.settings.*;
import meteordevelopment.meteorclient.systems.modules.Module;
import meteordevelopment.meteorclient.systems.modules.Modules;
import meteordevelopment.meteorclient.systems.modules.combat.AnchorAura;
import meteordevelopment.meteorclient.systems.modules.combat.BedAura;
import meteordevelopment.meteorclient.systems.modules.combat.CrystalAura;
import meteordevelopment.meteorclient.systems.modules.combat.KillAura;
import meteordevelopment.meteorclient.systems.modules.player.AutoGap;
import meteordevelopment.meteorclient.utils.misc.input.Input;
import meteordevelopment.meteorclient.utils.player.InvUtils;
import meteordevelopment.orbit.EventHandler;
import meteordevelopment.orbit.EventPriority;
import net.minecraft.component.DataComponentTypes;
import net.minecraft.component.type.FoodComponent;
import net.minecraft.item.Item;
import net.minecraft.item.ItemStack;
import net.minecraft.item.Items;
import net.minecraft.util.Hand;

import java.util.ArrayList;
import java.util.List;
import java.util.function.BiPredicate;

/**
 * Eats food from a user-picked list when health or hunger drops below a threshold, then puts
 * everything back the way it was: the previously held hotbar slot is re-selected, and food pulled
 * from the main inventory is swapped back to where it came from (together with whatever was in the
 * hotbar slot it borrowed).
 * <p>
 * Unlike Meteor's built-in auto-eat it can pull food out of the main inventory, eats from the
 * offhand without touching the hotbar, never starts a bite it can't finish (full hunger and the
 * food isn't always-edible), doesn't interrupt a bite halfway, and gives up the moment you scroll
 * to another slot yourself.
 */
public class AutoEat extends Module {
    @SuppressWarnings("unchecked")
    private static final Class<? extends Module>[] AURAS = new Class[]{KillAura.class, CrystalAura.class, AnchorAura.class, BedAura.class};

    private final SettingGroup sgGeneral = settings.getDefaultGroup();
    private final SettingGroup sgThreshold = settings.createGroup("Threshold");
    private final SettingGroup sgInventory = settings.createGroup("Inventory");
    private final SettingGroup sgPause = settings.createGroup("Pause");

    // General

    private final Setting<List<Item>> foods = sgGeneral.add(new ItemListSetting.Builder()
        .name("foods")
        .description("Food it is allowed to eat. Nothing outside this list is ever touched.")
        .defaultValue(Items.GOLDEN_CARROT, Items.COOKED_BEEF, Items.COOKED_PORKCHOP, Items.COOKED_MUTTON, Items.BREAD, Items.BAKED_POTATO)
        .filter(item -> item.getComponents().get(DataComponentTypes.FOOD) != null)
        .build()
    );

    private final Setting<Priority> priority = sgGeneral.add(new EnumSetting.Builder<Priority>()
        .name("priority")
        .description("Which food to pick when several from the list are available.")
        .defaultValue(Priority.Saturation)
        .build()
    );

    private final Setting<Boolean> notifyNoFood = sgGeneral.add(new BoolSetting.Builder()
        .name("notify-no-food")
        .description("Warns in chat (once per hungry spell) when it needs to eat but has nothing from the list.")
        .defaultValue(true)
        .build()
    );

    // Threshold

    private final Setting<ThresholdMode> thresholdMode = sgThreshold.add(new EnumSetting.Builder<ThresholdMode>()
        .name("threshold-mode")
        .description("What triggers eating.")
        .defaultValue(ThresholdMode.Any)
        .build()
    );

    private final Setting<Double> healthThreshold = sgThreshold.add(new DoubleSetting.Builder()
        .name("health-threshold")
        .description("Eats when health is at or below this (20 = 10 hearts).")
        .defaultValue(10)
        .range(1, 19)
        .sliderRange(1, 19)
        .visible(() -> thresholdMode.get() != ThresholdMode.Hunger)
        .build()
    );

    private final Setting<Boolean> countAbsorption = sgThreshold.add(new BoolSetting.Builder()
        .name("count-absorption")
        .description("Counts absorption (golden hearts) as health.")
        .defaultValue(false)
        .visible(() -> thresholdMode.get() != ThresholdMode.Hunger)
        .build()
    );

    private final Setting<Integer> hungerThreshold = sgThreshold.add(new IntSetting.Builder()
        .name("hunger-threshold")
        .description("Eats when the hunger bar is at or below this (20 = full).")
        .defaultValue(14)
        .range(1, 19)
        .sliderRange(1, 19)
        .visible(() -> thresholdMode.get() != ThresholdMode.Health)
        .build()
    );

    // Inventory

    private final Setting<Boolean> pullFromInventory = sgInventory.add(new BoolSetting.Builder()
        .name("pull-from-inventory")
        .description("Takes food from the main inventory when there's none in the hotbar or offhand.")
        .defaultValue(true)
        .build()
    );

    private final Setting<Integer> pullSlot = sgInventory.add(new IntSetting.Builder()
        .name("pull-slot")
        .description("Hotbar slot that pulled food is swapped into. Whatever is there goes back once you're done eating.")
        .defaultValue(9)
        .range(1, 9)
        .sliderRange(1, 9)
        .visible(pullFromInventory::get)
        .build()
    );

    private final Setting<Boolean> preferHotbar = sgInventory.add(new BoolSetting.Builder()
        .name("prefer-hotbar")
        .description("Only pulls from the inventory when the hotbar and offhand have no listed food at all, even if the inventory has better food.")
        .defaultValue(true)
        .visible(pullFromInventory::get)
        .build()
    );

    // Pause

    private final Setting<Boolean> pauseAuras = sgPause.add(new BoolSetting.Builder()
        .name("pause-auras")
        .description("Turns off Kill/Crystal/Anchor/Bed Aura while eating and turns them back on after.")
        .defaultValue(true)
        .build()
    );

    private final Setting<Boolean> pauseBaritone = sgPause.add(new BoolSetting.Builder()
        .name("pause-baritone")
        .description("Pauses Baritone pathing while eating.")
        .defaultValue(true)
        .build()
    );

    /** Ticks to wait after a session before another one may start, so inventory swaps sync. */
    private static final int SESSION_COOLDOWN = 4;
    /** Ticks a bite may fail to start (server lag, item cooldown) before the session gives up. */
    private static final int MAX_START_ATTEMPTS = 10;

    private boolean eating;
    private Hand hand;
    /** Hotbar slot selected before the session started. */
    private int prevSlot = -1;
    /** Hotbar slot we're eating from (main hand only). */
    private int foodSlot = -1;
    // The pull in progress: the hotbar slot and the inventory slot the food came from. Doing the
    // same swap again puts both items back exactly where they were.
    private int swapHotbar = -1;
    private int swapSource = -1;

    private int cooldown;
    private int failedStarts;
    private boolean warnedNoFood;

    private final List<Class<? extends Module>> pausedAuras = new ArrayList<>();
    private boolean pausedBaritone;

    public AutoEat() {
        super(OnFocusAddon.CATEGORY, "auto-eat-plus", "Eats food from your list when health or hunger is low, pulling it from the inventory if needed, then switches back to what you were holding.");
    }

    @Override
    public void onActivate() {
        cooldown = 0;
        warnedNoFood = false;
    }

    @Override
    public void onDeactivate() {
        if (mc.player == null) {
            reset();
            return;
        }

        if (eating) stop(true, true);
        if (swapSource == -1) return;

        // Nothing runs after this, so the pull can't wait for the container to close.
        if (canClickInventory()) {
            undoPull();
        } else {
            warning("Couldn't put the food back (a container is open) - it's in hotbar slot %d, your original item is in slot %d.", swapHotbar + 1, swapSource + 1);
            swapHotbar = -1;
            swapSource = -1;
        }
    }

    @EventHandler
    private void onGameLeft(GameLeftEvent event) {
        // The pending pull points at slots of an inventory that's gone - replaying it on the next
        // server would shuffle unrelated items.
        reset();
    }

    private void reset() {
        if (eating) resumeOthers();
        eating = false;
        hand = null;
        foodSlot = -1;
        prevSlot = -1;
        swapHotbar = -1;
        swapSource = -1;
        cooldown = 0;
    }

    public boolean isEating() {
        return eating;
    }

    /** Eating, or still holding pulled food that has to go back - other modules shouldn't move items now. */
    public boolean isBusy() {
        return eating || swapSource != -1;
    }

    @EventHandler(priority = EventPriority.LOW)
    private void onTick(TickEvent.Pre event) {
        if (mc.player == null || mc.world == null) return;

        if (eating) {
            tickEating();
            return;
        }

        // Pull swap left over from a session that ended while a container was open.
        if (swapSource != -1) {
            if (canClickInventory()) undoPull();
            return;
        }

        if (cooldown > 0) {
            cooldown--;
            return;
        }

        if (!shouldEat()) {
            warnedNoFood = false;
            return;
        }

        // Don't start in a GUI, or over a bow / shield / manual bite, or while another module eats.
        if (mc.currentScreen != null || mc.player.isUsingItem() || otherModuleEating()) return;

        int slot = findFood();
        if (slot == -1) {
            if (notifyNoFood.get() && !warnedNoFood) warning("Need to eat, but there's no edible food from your list%s.", pullFromInventory.get() ? " in the inventory" : " in the hotbar");
            warnedNoFood = true;
            return;
        }

        prevSlot = mc.player.getInventory().selectedSlot;
        failedStarts = 0;
        eating = true;
        pauseOthers();
        take(slot);
    }

    private void tickEating() {
        // Scrolled to another slot yourself - you want your hands back, so drop out without
        // yanking the selection back to where it was before.
        if (hand == Hand.MAIN_HAND && mc.player.getInventory().selectedSlot != foodSlot) {
            stop(false, true);
            return;
        }

        if (mc.player.isUsingItem()) {
            if (mc.player.getActiveHand() == hand && isListedFood(mc.player.getStackInHand(hand))) {
                failedStarts = 0;
                setPressed(true);
                return;
            }
            // Using something else (e.g. the other hand) - not ours to finish.
            stop(true, true);
            return;
        }

        // Not mid-bite: the last item was finished (or never started). Eat another if still needed.
        if (!shouldEat()) {
            stop(true, false);
            return;
        }

        if (!canEat(mc.player.getStackInHand(hand))) {
            // Stack ran out, or the food can't be eaten right now - put the pull back and look again.
            if (swapSource != -1) {
                if (!canClickInventory()) return;
                undoPull();
            }

            int slot = findFood();
            if (slot == -1) {
                stop(true, false);
                return;
            }
            take(slot);
            return;
        }

        if (++failedStarts > MAX_START_ATTEMPTS) {
            warning("Couldn't start eating - giving up for now.");
            stop(true, false);
            return;
        }
        startBite();
    }

    /** Gets the food at inventory index {@code slot} into a hand and starts eating it. */
    private void take(int slot) {
        if (slot == OFFHAND) {
            hand = Hand.OFF_HAND;
            foodSlot = -1;
        } else {
            hand = Hand.MAIN_HAND;

            if (slot > 8) {
                // Main inventory: swap it into the pull slot. Inventory clicks need the player's own
                // screen handler - if a container is somehow open, try again next tick.
                if (!canClickInventory()) return;
                int hotbar = pullSlot.get() - 1;
                InvUtils.quickSwap().fromId(hotbar).to(slot);
                swapHotbar = hotbar;
                swapSource = slot;
                slot = hotbar;
            }

            foodSlot = slot;
            InvUtils.swap(slot, false);
        }

        startBite();
    }

    private void startBite() {
        mc.interactionManager.interactItem(mc.player, hand);
        // Holding use keeps vanilla from cancelling the bite on the next input tick.
        setPressed(true);
    }

    /**
     * Ends the session.
     *
     * @param reselect switch back to the hotbar slot held before eating
     * @param cancel   also stop a bite that's still in progress
     */
    private void stop(boolean reselect, boolean cancel) {
        if (cancel && mc.player.isUsingItem() && mc.player.getActiveHand() == hand && isListedFood(mc.player.getActiveItem())) {
            mc.interactionManager.stopUsingItem(mc.player);
        }
        setPressed(Input.isPressed(mc.options.useKey));

        // If a container is open the pull is undone on a later tick, once it's closed.
        if (swapSource != -1 && canClickInventory()) undoPull();
        if (reselect && prevSlot != -1 && hand == Hand.MAIN_HAND) InvUtils.swap(prevSlot, false);

        eating = false;
        hand = null;
        foodSlot = -1;
        prevSlot = -1;
        cooldown = SESSION_COOLDOWN;
        resumeOthers();
    }

    private void undoPull() {
        InvUtils.quickSwap().fromId(swapHotbar).to(swapSource);
        swapHotbar = -1;
        swapSource = -1;
    }

    private boolean canClickInventory() {
        return mc.player.currentScreenHandler == mc.player.playerScreenHandler;
    }

    // Food selection

    /** Pseudo-index for the offhand. */
    private static final int OFFHAND = 40;

    /** Best edible listed food: hotbar and offhand first, then (if allowed) the main inventory. -1 if none. */
    private int findFood() {
        int best = -1;
        ItemStack bestStack = ItemStack.EMPTY;

        // Offhand first, then hotbar - on equal food the one that needs no switching wins.
        int[] nearby = {OFFHAND, 0, 1, 2, 3, 4, 5, 6, 7, 8};
        for (int i : nearby) {
            ItemStack stack = mc.player.getInventory().getStack(i);
            if (canEat(stack) && better(stack, bestStack)) {
                best = i;
                bestStack = stack;
            }
        }

        if (!pullFromInventory.get() || (best != -1 && preferHotbar.get())) return best;

        for (int i = 9; i < 36; i++) {
            ItemStack stack = mc.player.getInventory().getStack(i);
            if (canEat(stack) && better(stack, bestStack)) {
                best = i;
                bestStack = stack;
            }
        }
        return best;
    }

    private boolean better(ItemStack stack, ItemStack current) {
        if (current.isEmpty()) return true;
        return priority.get().compare(this, stack, current) > 0;
    }

    private boolean isListedFood(ItemStack stack) {
        return !stack.isEmpty() && foods.get().contains(stack.getItem()) && food(stack) != null;
    }

    /** Listed food that can actually be eaten right now (full hunger only allows always-edible food). */
    private boolean canEat(ItemStack stack) {
        if (!isListedFood(stack)) return false;
        return mc.player.canConsume(food(stack).canAlwaysEat());
    }

    private static FoodComponent food(ItemStack stack) {
        return stack.get(DataComponentTypes.FOOD);
    }

    // Threshold

    private boolean shouldEat() {
        float health = mc.player.getHealth();
        if (countAbsorption.get()) health += mc.player.getAbsorptionAmount();

        boolean lowHealth = health <= healthThreshold.get();
        boolean lowHunger = mc.player.getHungerManager().getFoodLevel() <= hungerThreshold.get();
        return thresholdMode.get().test(lowHealth, lowHunger);
    }

    // Other modules

    private boolean otherModuleEating() {
        if (Modules.get().get(AutoGap.class).isEating()) return true;
        return Modules.get().get(meteordevelopment.meteorclient.systems.modules.player.AutoEat.class).eating;
    }

    private void pauseOthers() {
        pausedAuras.clear();
        if (pauseAuras.get()) {
            for (Class<? extends Module> klass : AURAS) {
                Module module = Modules.get().get(klass);
                if (module.isActive()) {
                    pausedAuras.add(klass);
                    module.toggle();
                }
            }
        }

        if (pauseBaritone.get() && PathManagers.get().isPathing()) {
            pausedBaritone = true;
            PathManagers.get().pause();
        }
    }

    private void resumeOthers() {
        for (Class<? extends Module> klass : pausedAuras) {
            Module module = Modules.get().get(klass);
            if (!module.isActive()) module.toggle();
        }
        pausedAuras.clear();

        if (pausedBaritone) {
            pausedBaritone = false;
            PathManagers.get().resume();
        }
    }

    private void setPressed(boolean pressed) {
        mc.options.useKey.setPressed(pressed);
    }

    @EventHandler
    private void onItemUseCrosshairTarget(ItemUseCrosshairTargetEvent event) {
        // Never let the held use key click the block / entity we're looking at.
        if (eating) event.target = null;
    }

    @Override
    public String getInfoString() {
        if (mc.player == null) return null;
        int count = 0;
        for (int i = 0; i < mc.player.getInventory().size(); i++) {
            ItemStack stack = mc.player.getInventory().getStack(i);
            if (isListedFood(stack)) count += stack.getCount();
        }
        return eating ? "eating" : String.valueOf(count);
    }

    public enum Priority {
        /** Most saturation first - lasts longest. */
        Saturation((m, a, b) -> Float.compare(food(a).saturation(), food(b).saturation())),
        /** Most hunger points first. */
        Hunger((m, a, b) -> Integer.compare(food(a).nutrition(), food(b).nutrition())),
        /** Earliest in the foods list first. */
        ListOrder((m, a, b) -> Integer.compare(m.foods.get().indexOf(b.getItem()), m.foods.get().indexOf(a.getItem()))),
        /** Least hunger points first - spends cheap food, keeps the good stuff. */
        Cheapest((m, a, b) -> Integer.compare(food(b).nutrition(), food(a).nutrition()));

        private final Comparator comparator;

        Priority(Comparator comparator) {
            this.comparator = comparator;
        }

        int compare(AutoEat module, ItemStack a, ItemStack b) {
            return comparator.compare(module, a, b);
        }

        @FunctionalInterface
        private interface Comparator {
            int compare(AutoEat module, ItemStack a, ItemStack b);
        }
    }

    public enum ThresholdMode {
        Health((health, hunger) -> health),
        Hunger((health, hunger) -> hunger),
        Any((health, hunger) -> health || hunger),
        Both((health, hunger) -> health && hunger);

        private final BiPredicate<Boolean, Boolean> predicate;

        ThresholdMode(BiPredicate<Boolean, Boolean> predicate) {
            this.predicate = predicate;
        }

        public boolean test(boolean health, boolean hunger) {
            return predicate.test(health, hunger);
        }
    }
}
