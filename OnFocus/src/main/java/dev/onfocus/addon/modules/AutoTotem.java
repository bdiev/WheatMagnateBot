package dev.onfocus.addon.modules;

import dev.onfocus.addon.OnFocusAddon;
import meteordevelopment.meteorclient.events.packets.PacketEvent;
import meteordevelopment.meteorclient.events.world.TickEvent;
import meteordevelopment.meteorclient.settings.BoolSetting;
import meteordevelopment.meteorclient.settings.DoubleSetting;
import meteordevelopment.meteorclient.settings.EnumSetting;
import meteordevelopment.meteorclient.settings.IntSetting;
import meteordevelopment.meteorclient.settings.Setting;
import meteordevelopment.meteorclient.settings.SettingGroup;
import meteordevelopment.meteorclient.systems.friends.Friends;
import meteordevelopment.meteorclient.systems.modules.Module;
import meteordevelopment.meteorclient.systems.modules.Modules;
import meteordevelopment.orbit.EventHandler;
import net.minecraft.entity.Entity;
import net.minecraft.entity.EntityStatuses;
import net.minecraft.entity.decoration.EndCrystalEntity;
import net.minecraft.entity.player.PlayerEntity;
import net.minecraft.item.Item;
import net.minecraft.item.ItemStack;
import net.minecraft.item.Items;
import net.minecraft.nbt.NbtCompound;
import net.minecraft.network.packet.s2c.play.EntityStatusS2CPacket;
import net.minecraft.screen.ScreenHandler;
import net.minecraft.screen.slot.Slot;
import net.minecraft.screen.slot.SlotActionType;
import net.minecraft.sound.SoundCategory;
import net.minecraft.sound.SoundEvents;
import net.minecraft.util.Hand;

/**
 * Keeps a totem in the offhand. Strict: always. Smart: only while something's dangerous (low health,
 * a long fall, flying, burning, crystals or players nearby), the offhand's own item swapped back once
 * it's safe again. A totem is taken by one offhand swap click (button 40) from the main inventory or
 * the hotbar, in the order set, leaving the hotbar a reserve if wanted.
 * <p>
 * Never touches anything while {@link SetShulker} is moving things around; Set Shulker turns it off
 * when it packs your gear away and (as set) back on when it unpacks it. Named "auto-totem+" so it
 * doesn't replace Meteor's own Auto Totem.
 */
public class AutoTotem extends Module {
    public enum Mode { Strict, Smart }

    public enum Source { MainFirst, HotbarFirst, MainOnly, HotbarOnly }

    public enum ReEnable { Always, IfItTurnedItOff, Never }

    private final SettingGroup sgGeneral = settings.getDefaultGroup();
    private final SettingGroup sgSmart = settings.createGroup("Smart Mode");
    private final SettingGroup sgSource = settings.createGroup("Totem Source");
    private final SettingGroup sgPause = settings.createGroup("Pause");
    private final SettingGroup sgNotify = settings.createGroup("Notifications");
    private final SettingGroup sgSetShulker = settings.createGroup("Set Shulker");

    // ---- General ----

    private final Setting<Mode> mode = sgGeneral.add(new EnumSetting.Builder<Mode>()
        .name("mode")
        .description("Strict: always a totem in the offhand. Smart: only while something's dangerous, the offhand's item kept otherwise.")
        .defaultValue(Mode.Strict)
        .build()
    );

    private final Setting<Integer> delay = sgGeneral.add(new IntSetting.Builder()
        .name("delay")
        .description("Ticks to wait after a swap before the next one, for the server to answer.")
        .defaultValue(2)
        .range(0, 40)
        .sliderRange(0, 20)
        .build()
    );

    private final Setting<Boolean> instantOnPop = sgGeneral.add(new BoolSetting.Builder()
        .name("instant-on-pop")
        .description("Right after a totem pops the next one goes in at once, without waiting out the delay.")
        .defaultValue(true)
        .build()
    );

    private final Setting<Boolean> inContainers = sgGeneral.add(new BoolSetting.Builder()
        .name("in-containers")
        .description("Also swaps a totem in while a chest or other container is open (from your inventory part of it).")
        .defaultValue(false)
        .build()
    );

    // ---- Smart ----

    private final Setting<Boolean> smartHealth = sgSmart.add(new BoolSetting.Builder()
        .name("low-health")
        .description("Dangerous when health plus absorption is this low.")
        .defaultValue(true)
        .visible(this::smart)
        .build()
    );

    private final Setting<Double> health = sgSmart.add(new DoubleSetting.Builder()
        .name("health")
        .description("Health plus absorption (in half hearts) at or below which a totem goes in.")
        .defaultValue(10)
        .range(0, 40)
        .sliderRange(1, 36)
        .visible(() -> smart() && smartHealth.get())
        .build()
    );

    private final Setting<Boolean> smartFall = sgSmart.add(new BoolSetting.Builder()
        .name("falling")
        .description("Dangerous while falling further than the fall distance.")
        .defaultValue(true)
        .visible(this::smart)
        .build()
    );

    private final Setting<Double> fallDistance = sgSmart.add(new DoubleSetting.Builder()
        .name("fall-distance")
        .description("Blocks fallen after which a totem goes in.")
        .defaultValue(10)
        .range(3, 256)
        .sliderRange(3, 64)
        .visible(() -> smart() && smartFall.get())
        .build()
    );

    private final Setting<Boolean> smartElytra = sgSmart.add(new BoolSetting.Builder()
        .name("elytra")
        .description("Dangerous while flying with an elytra.")
        .defaultValue(true)
        .visible(this::smart)
        .build()
    );

    private final Setting<Boolean> smartFire = sgSmart.add(new BoolSetting.Builder()
        .name("fire-and-lava")
        .description("Dangerous while burning or in lava.")
        .defaultValue(true)
        .visible(this::smart)
        .build()
    );

    private final Setting<Boolean> smartCrystals = sgSmart.add(new BoolSetting.Builder()
        .name("end-crystals")
        .description("Dangerous with an end crystal nearby.")
        .defaultValue(true)
        .visible(this::smart)
        .build()
    );

    private final Setting<Double> crystalRange = sgSmart.add(new DoubleSetting.Builder()
        .name("crystal-range")
        .description("How near an end crystal has to be.")
        .defaultValue(8)
        .range(1, 32)
        .sliderRange(1, 16)
        .visible(() -> smart() && smartCrystals.get())
        .build()
    );

    private final Setting<Boolean> smartPlayers = sgSmart.add(new BoolSetting.Builder()
        .name("players")
        .description("Dangerous with another player (not a friend) nearby.")
        .defaultValue(false)
        .visible(this::smart)
        .build()
    );

    private final Setting<Double> playerRange = sgSmart.add(new DoubleSetting.Builder()
        .name("player-range")
        .description("How near another player has to be.")
        .defaultValue(12)
        .range(1, 64)
        .sliderRange(1, 32)
        .visible(() -> smart() && smartPlayers.get())
        .build()
    );

    private final Setting<Boolean> swapBack = sgSmart.add(new BoolSetting.Builder()
        .name("swap-back")
        .description("Once it's safe again, the item the totem replaced goes back in the offhand.")
        .defaultValue(true)
        .visible(this::smart)
        .build()
    );

    private final Setting<Integer> safeTicks = sgSmart.add(new IntSetting.Builder()
        .name("safe-ticks")
        .description("Ticks it has to stay safe before swapping back.")
        .defaultValue(40)
        .range(0, 400)
        .sliderRange(0, 200)
        .visible(() -> smart() && swapBack.get())
        .build()
    );

    // ---- Source ----

    private final Setting<Source> source = sgSource.add(new EnumSetting.Builder<Source>()
        .name("take-from")
        .description("Where totems are taken from, and in what order.")
        .defaultValue(Source.MainFirst)
        .build()
    );

    private final Setting<Integer> hotbarReserve = sgSource.add(new IntSetting.Builder()
        .name("hotbar-reserve")
        .description("Totems always left in the hotbar, for switching to by hand.")
        .defaultValue(0)
        .range(0, 9)
        .sliderRange(0, 9)
        .visible(() -> source.get() != Source.MainOnly)
        .build()
    );

    // ---- Pause ----

    private final Setting<Boolean> pauseUsingOffhand = sgPause.add(new BoolSetting.Builder()
        .name("while-using-offhand")
        .description("Waits while you're using the offhand's item (eating, drinking, blocking).")
        .defaultValue(true)
        .build()
    );

    private final Setting<Boolean> pauseInventory = sgPause.add(new BoolSetting.Builder()
        .name("while-inventory-open")
        .description("Waits while your own inventory screen is open.")
        .defaultValue(false)
        .build()
    );

    private final Setting<Boolean> pauseCreative = sgPause.add(new BoolSetting.Builder()
        .name("in-creative")
        .description("Does nothing in creative mode.")
        .defaultValue(true)
        .build()
    );

    // ---- Notifications ----

    private final Setting<Boolean> notifyPop = sgNotify.add(new BoolSetting.Builder()
        .name("pop-message")
        .description("Says in chat when a totem pops and how many are left.")
        .defaultValue(true)
        .build()
    );

    private final Setting<Boolean> popSound = sgNotify.add(new BoolSetting.Builder()
        .name("pop-sound")
        .description("Plays a sound when a totem pops.")
        .defaultValue(false)
        .build()
    );

    private final Setting<Integer> lowWarning = sgNotify.add(new IntSetting.Builder()
        .name("low-totems-warning")
        .description("Warns (chat + sound) once you have this many totems or fewer. 0 = off.")
        .defaultValue(2)
        .range(0, 36)
        .sliderRange(0, 10)
        .build()
    );

    private final Setting<Boolean> showCount = sgNotify.add(new BoolSetting.Builder()
        .name("show-count")
        .description("Shows how many totems you have next to the module's name in the module list.")
        .defaultValue(true)
        .build()
    );

    // ---- Set Shulker ----

    private final Setting<Boolean> offOnPack = sgSetShulker.add(new BoolSetting.Builder()
        .name("off-on-pack")
        .description("Turns off when Set Shulker packs your gear away.")
        .defaultValue(true)
        .build()
    );

    private final Setting<ReEnable> onOnUnpack = sgSetShulker.add(new EnumSetting.Builder<ReEnable>()
        .name("on-on-unpack")
        .description("Whether to turn back on when Set Shulker unpacks your gear: always, only if packing turned it off, or never.")
        .defaultValue(ReEnable.IfItTurnedItOff)
        .build()
    );

    private final Setting<Boolean> setShulkerMessages = sgSetShulker.add(new BoolSetting.Builder()
        .name("toggle-messages")
        .description("Says in chat when Set Shulker turns it off or on.")
        .defaultValue(true)
        .build()
    );

    private int cooldown;
    /** Set from the network thread when our totem pops; handled on the next tick. */
    private volatile boolean popped;
    private int pops;
    private boolean warnedLow;
    /** Smart mode: the inventory index the offhand's own item went to, and what it is; -1 if none. */
    private int returnSlot = -1;
    private Item returnItem;
    private int safeFor;
    /** Packing turned it off, so unpacking may turn it back on. Saved with the module. */
    private boolean offBySetShulker;

    public AutoTotem() {
        super(OnFocusAddon.CATEGORY, "auto-totem+", "Keeps a totem in your offhand, always or only when in danger. Follows Set Shulker: off when it packs your gear, back on when it unpacks it.");
    }

    private boolean smart() {
        return mode.get() == Mode.Smart;
    }

    @Override
    public void onActivate() {
        cooldown = 0;
        popped = false;
        pops = 0;
        warnedLow = false;
        returnSlot = -1;
        safeFor = 0;
    }

    @Override
    public String getInfoString() {
        if (!showCount.get() || mc.player == null) return null;
        return Integer.toString(countTotems());
    }

    // ---- Set Shulker ----

    /** Set Shulker packed (false) or unpacked (true) the gear: follows it as set. */
    public void followSetShulker(boolean on) {
        if (!on) {
            if (!offOnPack.get()) return;
            offBySetShulker = isActive();
            if (!isActive()) return;
            toggle();
            if (setShulkerMessages.get()) info("Off: Set Shulker packed your gear.");
            return;
        }

        boolean wanted = switch (onOnUnpack.get()) {
            case Always -> true;
            case IfItTurnedItOff -> offBySetShulker;
            case Never -> false;
        };
        offBySetShulker = false;
        if (!wanted || isActive()) return;
        toggle();
        if (setShulkerMessages.get()) info("Back on: Set Shulker unpacked your gear.");
    }

    @Override
    public NbtCompound toTag() {
        NbtCompound tag = super.toTag();
        if (tag != null) tag.putBoolean("off-by-set-shulker", offBySetShulker);
        return tag;
    }

    @Override
    public AutoTotem fromTag(NbtCompound tag) {
        offBySetShulker = tag.getBoolean("off-by-set-shulker");
        super.fromTag(tag);
        return this;
    }

    // ---- Ticking ----

    @EventHandler
    private void onPacket(PacketEvent.Receive event) {
        if (event.packet instanceof EntityStatusS2CPacket packet && packet.getStatus() == EntityStatuses.USE_TOTEM_OF_UNDYING
            && mc.world != null && mc.player != null && packet.getEntity(mc.world) == mc.player) popped = true;
    }

    @EventHandler
    private void onTick(TickEvent.Pre event) {
        if (mc.player == null || mc.world == null || mc.interactionManager == null) return;

        if (popped) {
            popped = false;
            onPop();
        }
        warnIfLow();

        if (cooldown > 0) {
            cooldown--;
            return;
        }
        if (paused()) return;

        boolean danger = !smart() || inDanger();
        if (danger) safeFor = 0;
        else safeFor++;

        ItemStack offhand = mc.player.getOffHandStack();
        if (danger) {
            if (!offhand.isOf(Items.TOTEM_OF_UNDYING)) equipTotem(offhand);
        } else if (swapBack.get() && returnSlot >= 0 && safeFor >= safeTicks.get() && offhand.isOf(Items.TOTEM_OF_UNDYING)) {
            swapBack();
        }
    }

    private void onPop() {
        pops++;
        returnSlot = -1;
        if (instantOnPop.get()) cooldown = 0;
        int left = countTotems();
        if (notifyPop.get()) {
            if (left > 0) warning("Totem popped (%d this session) - (highlight)%d(default) left.", pops, left);
            else error("Totem popped - that was the last one!");
        }
        if (popSound.get()) sound(1f);
    }

    private void warnIfLow() {
        int limit = lowWarning.get();
        if (limit <= 0) return;
        int count = countTotems();
        if (count > limit) {
            warnedLow = false;
            return;
        }
        if (warnedLow) return;
        warnedLow = true;
        if (count == 0) error("No totems left!");
        else warning("Only (highlight)%d(default) totems left.", count);
        sound(0.5f);
    }

    private boolean paused() {
        if (Modules.get().get(SetShulker.class).busy()) return true;
        if (pauseCreative.get() && mc.player.isCreative()) return true;
        if (pauseUsingOffhand.get() && mc.player.isUsingItem() && mc.player.getActiveHand() == Hand.OFF_HAND) return true;
        ScreenHandler handler = mc.player.currentScreenHandler;
        if (!handler.getCursorStack().isEmpty()) return true;
        if (handler == mc.player.playerScreenHandler) return pauseInventory.get() && mc.currentScreen != null;
        return !inContainers.get();
    }

    private boolean inDanger() {
        if (smartHealth.get() && mc.player.getHealth() + mc.player.getAbsorptionAmount() <= health.get()) return true;
        if (smartElytra.get() && mc.player.isGliding()) return true;
        if (smartFire.get() && (mc.player.isOnFire() || mc.player.isInLava())) return true;
        if (smartFall.get() && !mc.player.isOnGround() && !mc.player.isTouchingWater() && mc.player.fallDistance >= fallDistance.get()) return true;
        if (smartCrystals.get() || smartPlayers.get()) {
            for (Entity entity : mc.world.getEntities()) {
                if (smartCrystals.get() && entity instanceof EndCrystalEntity && mc.player.distanceTo(entity) <= crystalRange.get()) return true;
                if (smartPlayers.get() && entity instanceof PlayerEntity player && player != mc.player && !player.isSpectator()
                    && !Friends.get().isFriend(player) && mc.player.distanceTo(entity) <= playerRange.get()) return true;
            }
        }
        return false;
    }

    // ---- Swapping ----

    private void equipTotem(ItemStack offhand) {
        int index = findTotem();
        if (index < 0) return;
        int slotId = slotId(index);
        if (slotId < 0) return;
        // Smart: the offhand's own item lands where the totem was - remembered to swap back later
        if (smart() && !offhand.isEmpty()) {
            returnSlot = index;
            returnItem = offhand.getItem();
        } else returnSlot = -1;
        click(slotId);
    }

    private void swapBack() {
        int index = returnSlot;
        returnSlot = -1;
        if (!mc.player.getInventory().getStack(index).isOf(returnItem)) return;
        int slotId = slotId(index);
        if (slotId >= 0) click(slotId);
    }

    private void click(int slotId) {
        ScreenHandler handler = mc.player.currentScreenHandler;
        mc.interactionManager.clickSlot(handler.syncId, slotId, 40, SlotActionType.SWAP, mc.player);
        cooldown = delay.get();
    }

    /** A totem's inventory index, searched as set; -1 if there's none to take. */
    private int findTotem() {
        int main = -1, hotbar = -1, inHotbar = 0;
        for (int i = 0; i < 36; i++) {
            if (!mc.player.getInventory().getStack(i).isOf(Items.TOTEM_OF_UNDYING)) continue;
            if (i < 9) {
                inHotbar++;
                if (hotbar < 0) hotbar = i;
            } else if (main < 0) main = i;
        }
        if (inHotbar <= hotbarReserve.get()) hotbar = -1;
        return switch (source.get()) {
            case MainFirst -> main >= 0 ? main : hotbar;
            case HotbarFirst -> hotbar >= 0 ? hotbar : main;
            case MainOnly -> main;
            case HotbarOnly -> hotbar;
        };
    }

    /** The open screen's slot for a player inventory index (0-35); -1 if it doesn't show it. */
    private int slotId(int index) {
        for (Slot slot : mc.player.currentScreenHandler.slots) {
            if (slot.inventory == mc.player.getInventory() && slot.getIndex() == index) return slot.id;
        }
        return -1;
    }

    private int countTotems() {
        int count = mc.player.getOffHandStack().isOf(Items.TOTEM_OF_UNDYING) ? 1 : 0;
        for (int i = 0; i < 36; i++) if (mc.player.getInventory().getStack(i).isOf(Items.TOTEM_OF_UNDYING)) count++;
        return count;
    }

    private void sound(float pitch) {
        mc.world.playSoundFromEntity(mc.player, mc.player, SoundEvents.BLOCK_NOTE_BLOCK_PLING.value(), SoundCategory.MASTER, 1f, pitch);
    }
}
