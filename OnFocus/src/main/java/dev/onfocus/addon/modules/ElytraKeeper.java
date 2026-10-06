package dev.onfocus.addon.modules;

import dev.onfocus.addon.OnFocusAddon;
import meteordevelopment.meteorclient.events.world.TickEvent;
import meteordevelopment.meteorclient.settings.BoolSetting;
import meteordevelopment.meteorclient.settings.IntSetting;
import meteordevelopment.meteorclient.settings.Setting;
import meteordevelopment.meteorclient.settings.SettingGroup;
import meteordevelopment.meteorclient.systems.modules.Module;
import meteordevelopment.meteorclient.systems.modules.Modules;
import meteordevelopment.meteorclient.utils.Utils;
import meteordevelopment.meteorclient.utils.player.InvUtils;
import meteordevelopment.orbit.EventHandler;
import net.minecraft.enchantment.Enchantments;
import net.minecraft.entity.EquipmentSlot;
import net.minecraft.item.ItemStack;
import net.minecraft.item.Items;
import net.minecraft.nbt.NbtCompound;
import net.minecraft.network.packet.c2s.play.ClientCommandC2SPacket;
import net.minecraft.sound.SoundCategory;
import net.minecraft.sound.SoundEvents;

/**
 * Keeps you in the air on long elytra flights: a worn-out elytra is swapped for a spare from the
 * inventory, gliding that stops mid-air is reopened the way a jump press would, and you get warned
 * before the last elytra runs out. Area Explorer turns it on by itself while exploring.
 * <p>
 * How long the elytras last is learned in flight: the formula (a durability point a second, Unbreaking
 * stretching it) is checked against how fast they really wear - elytra fly modes, Mending in flight
 * and the like change that a lot - and its estimate corrected by what was measured.
 */
public class ElytraKeeper extends Module {
    private static final int SWAP_COOLDOWN_TICKS = 10;
    private static final int REDEPLOY_WINDOW_TICKS = 60;
    private static final int REDEPLOY_INTERVAL_TICKS = 4;

    private final SettingGroup sgGeneral = settings.getDefaultGroup();

    private final Setting<Boolean> autoSwap = sgGeneral.add(new BoolSetting.Builder()
        .name("auto-swap")
        .description("Swaps the worn elytra for the most durable one in your inventory when it's about to stop working.")
        .defaultValue(true)
        .build()
    );

    private final Setting<Integer> swapAt = sgGeneral.add(new IntSetting.Builder()
        .name("swap-at-durability")
        .description("Swap once the worn elytra has this much durability left. At 1 an elytra stops working, so 2 wears it down as far as possible.")
        .defaultValue(2)
        .range(2, 432)
        .sliderRange(2, 50)
        .visible(autoSwap::get)
        .build()
    );

    private final Setting<Boolean> redeploy = sgGeneral.add(new BoolSetting.Builder()
        .name("redeploy")
        .description("If gliding stops mid-air (after a swap, lag, a hiccup), reopens the elytra right away - same as pressing jump in the air.")
        .defaultValue(true)
        .build()
    );

    private final Setting<Integer> lowWarning = sgGeneral.add(new IntSetting.Builder()
        .name("last-elytra-warning")
        .description("Warns (chat + sound) when the last usable elytra has this many seconds of flight left. 0 = off.")
        .defaultValue(60)
        .range(0, 600)
        .sliderRange(0, 300)
        .build()
    );

    /** Flight measured before the wear is trusted, and kept at most: older flights count less after that. */
    private static final int WEAR_MIN_TICKS = 10 * 60 * 20;
    private static final long WEAR_MAX_TICKS = 4 * 60 * 60 * 20L;
    /** A change in durability bigger than this isn't wear: an elytra swapped in, picked up, repaired. */
    private static final int WEAR_MAX_STEP = 5;
    /** Below this many blocks a tick across the ground the player isn't flying (5 blocks/s). */
    private static final double FLYING_SPEED = 0.25;

    /** Ticks flown, and the seconds of flight the formula gives the durability used meanwhile. Saved with the module. */
    private long wearFlightTicks;
    private double wearFormulaSeconds;
    private int wearRemaining = -1;
    /** Where the player was last tick, for telling flying from standing. */
    private double prevX = Double.NaN, prevZ;
    private boolean announcedWear;

    private int swapCooldown;
    private int ticksSinceGlide = Integer.MAX_VALUE;
    private int redeployCooldown;
    private boolean warnedLow, warnedEmpty;

    public ElytraKeeper() {
        super(OnFocusAddon.CATEGORY, "elytra-keeper", "Keeps you gliding: swaps in spare elytras, reopens the elytra if gliding stops mid-air, warns before the last one runs out.");
    }

    @Override
    public void onActivate() {
        swapCooldown = 0;
        redeployCooldown = 0;
        ticksSinceGlide = mc.player != null && mc.player.isGliding() ? 0 : Integer.MAX_VALUE;
        warnedLow = warnedEmpty = false;
    }

    @EventHandler
    private void onTick(TickEvent.Pre event) {
        if (mc.player == null || mc.world == null) return;

        if (mc.player.isGliding()) ticksSinceGlide = 0;
        else if (ticksSinceGlide != Integer.MAX_VALUE) ticksSinceGlide++;

        ItemStack chest = mc.player.getEquippedStack(EquipmentSlot.CHEST);
        tickWear(chest);
        if (autoSwap.get() && chest.isOf(Items.ELYTRA)) {
            if (swapCooldown > 0) swapCooldown--;
            else if (remaining(chest) <= swapAt.get()) swapElytra();
        }

        warnIfLastElytra();
        // Elytra Control opens the elytra itself, and closes it on purpose to save durability - a reopen from here would undo that
        if (redeploy.get() && !Modules.get().get(ElytraControl.class).isActive()) tickRedeploy();
    }

    /**
     * The worn elytra's durability against time in the air: a point lost counts as the seconds the
     * formula gives it (Unbreaking N: N + 1), one regained by Mending takes them back.
     */
    private void tickWear(ItemStack chest) {
        if (!chest.isOf(Items.ELYTRA)) {
            wearRemaining = -1;
            prevX = Double.NaN;
            return;
        }
        int remaining = remaining(chest);
        int used = wearRemaining < 0 ? 0 : wearRemaining - remaining;
        if (Math.abs(used) <= WEAR_MAX_STEP) wearFormulaSeconds += used * (Utils.getEnchantmentLevel(chest, Enchantments.UNBREAKING) + 1);
        wearRemaining = remaining;

        double moved = Double.isNaN(prevX) ? 0 : Math.hypot(mc.player.getX() - prevX, mc.player.getZ() - prevZ);
        prevX = mc.player.getX();
        prevZ = mc.player.getZ();
        boolean flying = !mc.player.isOnGround() && !mc.player.isTouchingWater() && !mc.player.hasVehicle() && moved >= FLYING_SPEED && moved < 10;
        if (!flying) return;
        wearFlightTicks++;
        if (wearFlightTicks >= WEAR_MAX_TICKS) {
            // Halved: the last few hours of flight count, an old fly mode fades out
            wearFlightTicks /= 2;
            wearFormulaSeconds /= 2;
        }
        if (!announcedWear && wearLearned()) {
            announcedWear = true;
            OnFocusAddon.LOG.info("[ElytraKeeper] Elytra wear learned over {} min of flight: {}", wearFlightTicks / 1200, wearText());
        }
    }

    /** True once enough flight has been measured to trust it over the formula. */
    public boolean wearLearned() {
        return wearFlightTicks >= WEAR_MIN_TICKS;
    }

    /** Real flight time for each second the formula gives, or 0 with the elytras hardly wearing at all; 1 until learned. */
    private double wearFactor() {
        if (!wearLearned()) return 1;
        if (wearFormulaSeconds <= 1) return 0;
        return wearFlightTicks / 20.0 / wearFormulaSeconds;
    }

    /** "x2.3 the formula" for the log. */
    public String wearText() {
        double factor = wearFactor();
        return factor == 0 ? "they hardly wear at all" : "they last %.1fx what the formula says".formatted(factor);
    }

    /**
     * Rough flight time left across the worn elytra and all spares, corrected by the wear learned in
     * flight; -1 if none is worn, {@link Integer#MAX_VALUE} if they've hardly worn at all.
     */
    public int flightSecondsLeft() {
        if (mc.player == null) return -1;
        ItemStack chest = mc.player.getEquippedStack(EquipmentSlot.CHEST);
        if (!chest.isOf(Items.ELYTRA)) return -1;

        boolean swapping = isActive() && autoSwap.get();
        int seconds = elytraSeconds(chest, swapping ? swapAt.get() : 1);
        if (swapping) {
            for (int i = 0; i < 36; i++) {
                ItemStack stack = mc.player.getInventory().getStack(i);
                if (isSpare(stack)) seconds += elytraSeconds(stack, swapAt.get());
            }
        }
        double factor = wearFactor();
        if (factor == 0) return Integer.MAX_VALUE;
        return (int) Math.min(Integer.MAX_VALUE - 1, Math.round(seconds * factor));
    }

    @Override
    public NbtCompound toTag() {
        NbtCompound tag = super.toTag();
        if (tag == null) return null;
        tag.putLong("wear-flight-ticks", wearFlightTicks);
        tag.putDouble("wear-formula-seconds", wearFormulaSeconds);
        return tag;
    }

    @Override
    public ElytraKeeper fromTag(NbtCompound tag) {
        wearFlightTicks = tag.getLong("wear-flight-ticks");
        wearFormulaSeconds = tag.getDouble("wear-formula-seconds");
        super.fromTag(tag);
        return this;
    }

    /** 1 durability per second of gliding; Unbreaking N skips the loss with chance N/(N+1). */
    private static int elytraSeconds(ItemStack stack, int stopAt) {
        int unbreaking = Utils.getEnchantmentLevel(stack, Enchantments.UNBREAKING);
        return Math.max(0, remaining(stack) - stopAt) * (unbreaking + 1);
    }

    private static int remaining(ItemStack stack) {
        return stack.getMaxDamage() - stack.getDamage();
    }

    private boolean isSpare(ItemStack stack) {
        return stack.isOf(Items.ELYTRA) && remaining(stack) > swapAt.get();
    }

    private void swapElytra() {
        // Inventory slot ids only line up with the player's own screen handler
        if (mc.player.currentScreenHandler != mc.player.playerScreenHandler) return;

        int best = -1, spares = 0;
        for (int i = 0; i < 36; i++) {
            ItemStack stack = mc.player.getInventory().getStack(i);
            if (!isSpare(stack)) continue;
            spares++;
            if (best == -1 || remaining(stack) > remaining(mc.player.getInventory().getStack(best))) best = i;
        }
        if (best == -1) return;

        int durability = remaining(mc.player.getInventory().getStack(best));
        // pickup spare -> swap with chest -> put worn one back: the chest slot is never empty, so gliding isn't interrupted
        InvUtils.move().from(best).toArmor(2);
        swapCooldown = SWAP_COOLDOWN_TICKS;
        info("Swapped elytra (highlight)(%d durability)(default), (highlight)%d(default) spare left.", durability, spares - 1);
    }

    private void warnIfLastElytra() {
        ItemStack chest = mc.player.getEquippedStack(EquipmentSlot.CHEST);
        if (!chest.isOf(Items.ELYTRA)) return;

        boolean hasSpare = false;
        if (autoSwap.get()) {
            for (int i = 0; i < 36 && !hasSpare; i++) hasSpare = isSpare(mc.player.getInventory().getStack(i));
        }
        if (hasSpare) {
            warnedLow = warnedEmpty = false;
            return;
        }

        // Elytras lose 1 durability per second of gliding and stop working at 1
        int secondsLeft = remaining(chest) - 1;
        if (!warnedEmpty && secondsLeft <= 0) {
            warnedEmpty = true;
            error("Elytra is worn out and there's no spare - you're falling!");
            alarm();
        } else if (!warnedLow && lowWarning.get() > 0 && secondsLeft <= lowWarning.get()) {
            warnedLow = true;
            warning("Last elytra: about (highlight)%d(default) seconds of flight left. Time to land.", secondsLeft);
            alarm();
        }
    }

    private void alarm() {
        mc.world.playSoundFromEntity(mc.player, mc.player, SoundEvents.BLOCK_NOTE_BLOCK_PLING.value(), SoundCategory.MASTER, 1f, 0.5f);
    }

    /** Reopens the elytra if gliding stopped mid-air shortly after we were flying. */
    private void tickRedeploy() {
        if (redeployCooldown > 0) {
            redeployCooldown--;
            return;
        }
        if (mc.player.isGliding() || ticksSinceGlide == 0 || ticksSinceGlide > REDEPLOY_WINDOW_TICKS) return;
        if (mc.player.isOnGround() || mc.player.isTouchingWater() || mc.player.isInLava() || mc.player.hasVehicle()) return;

        ItemStack chest = mc.player.getEquippedStack(EquipmentSlot.CHEST);
        if (!chest.isOf(Items.ELYTRA) || remaining(chest) <= 1) return;

        // What the client does on a jump press in mid-air
        mc.player.networkHandler.sendPacket(new ClientCommandC2SPacket(mc.player, ClientCommandC2SPacket.Mode.START_FALL_FLYING));
        mc.player.startGliding();
        redeployCooldown = REDEPLOY_INTERVAL_TICKS;
        OnFocusAddon.LOG.info("[ElytraKeeper] Gliding stopped mid-air, reopening elytra");
    }
}
