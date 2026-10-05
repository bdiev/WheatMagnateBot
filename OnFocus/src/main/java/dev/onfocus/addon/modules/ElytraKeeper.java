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
import net.minecraft.network.packet.c2s.play.ClientCommandC2SPacket;
import net.minecraft.sound.SoundCategory;
import net.minecraft.sound.SoundEvents;

/**
 * Keeps you in the air on long elytra flights: a worn-out elytra is swapped for a spare from the
 * inventory, gliding that stops mid-air is reopened the way a jump press would, and you get warned
 * before the last elytra runs out. Area Explorer turns it on by itself while exploring.
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
        if (autoSwap.get() && chest.isOf(Items.ELYTRA)) {
            if (swapCooldown > 0) swapCooldown--;
            else if (remaining(chest) <= swapAt.get()) swapElytra();
        }

        warnIfLastElytra();
        // Elytra Control opens the elytra itself, and closes it on purpose to save durability - a reopen from here would undo that
        if (redeploy.get() && !Modules.get().get(ElytraControl.class).isActive()) tickRedeploy();
    }

    /** Rough flight time left across the worn elytra and all spares, or -1 if none is worn. */
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
        return seconds;
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
