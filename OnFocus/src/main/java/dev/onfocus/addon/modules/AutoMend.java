package dev.onfocus.addon.modules;

import dev.onfocus.addon.OnFocusAddon;
import meteordevelopment.meteorclient.events.world.PlaySoundEvent;
import meteordevelopment.meteorclient.events.world.TickEvent;
import meteordevelopment.meteorclient.gui.GuiTheme;
import meteordevelopment.meteorclient.gui.widgets.WWidget;
import meteordevelopment.meteorclient.gui.widgets.containers.WHorizontalList;
import meteordevelopment.meteorclient.gui.widgets.containers.WSection;
import meteordevelopment.meteorclient.gui.widgets.containers.WVerticalList;
import meteordevelopment.meteorclient.gui.widgets.pressable.WButton;
import meteordevelopment.meteorclient.settings.*;
import meteordevelopment.meteorclient.systems.modules.Module;
import meteordevelopment.meteorclient.systems.modules.Modules;
import meteordevelopment.meteorclient.utils.Utils;
import meteordevelopment.meteorclient.utils.player.InvUtils;
import meteordevelopment.orbit.EventHandler;
import net.minecraft.enchantment.Enchantments;
import net.minecraft.item.ItemStack;
import net.minecraft.nbt.NbtCompound;
import net.minecraft.nbt.NbtElement;
import net.minecraft.nbt.NbtList;
import net.minecraft.sound.SoundCategory;
import net.minecraft.sound.SoundEvent;
import net.minecraft.sound.SoundEvents;
import net.minecraft.util.math.BlockPos;
import net.minecraft.util.math.Vec3d;

import java.util.ArrayDeque;
import java.util.Deque;
import java.util.List;

/**
 * Feeds every damaged Mending item in the inventory through the currently selected hotbar slot
 * one at a time, so XP from a farm repairs them all without babysitting. Worn armor / elytra is
 * left where it is - it's already being mended in place. While it runs, the noisy farm sounds
 * (zombified piglin hurt/fall/death, XP orb pickup, level up) are muted. When nothing damaged is
 * left, every item is back in the slot it started in, and it tells you and turns itself off.
 * <p>
 * It also estimates how long the repair will take. Every run records how many durability points
 * were repaired and over how many ticks; the last {@value #HISTORY_SIZE} runs are saved with the
 * module config and pooled into an average repair rate, which is blended with the rate measured
 * in the current run (the longer the run, the more it trusts the current farm over history).
 * <p>
 * With a Gold Farm saved, the module stays on as a watcher: a repair run starts by itself on
 * arriving within 25 blocks of the saved spot, and stops on leaving. The sounds are then muted
 * within 5 blocks of the spot instead of during the run. The module only turns itself off when no
 * farm is saved.
 */
public class AutoMend extends Module {
    private final SettingGroup sgGeneral = settings.getDefaultGroup();
    private final SettingGroup sgSounds = settings.createGroup("Sounds");

    private final Setting<Integer> swapDelay = sgGeneral.add(new IntSetting.Builder()
        .name("swap-delay")
        .description("Ticks to wait after swapping an item into your hand before checking it again, so the server has time to sync.")
        .defaultValue(5)
        .range(1, 40)
        .sliderRange(1, 20)
        .build()
    );

    private final Setting<Boolean> muteSounds = sgSounds.add(new BoolSetting.Builder()
        .name("mute-sounds")
        .description("Mutes the sounds below within 5 blocks of the Gold Farm, or while mending if no farm is saved.")
        .defaultValue(true)
        .build()
    );

    private final Setting<List<SoundEvent>> mutedSounds = sgSounds.add(new SoundEventListSetting.Builder()
        .name("muted-sounds")
        .description("Sounds to mute.")
        .defaultValue(
            SoundEvents.ENTITY_ZOMBIFIED_PIGLIN_HURT,
            SoundEvents.ENTITY_ZOMBIFIED_PIGLIN_DEATH,
            SoundEvents.ENTITY_HOSTILE_SMALL_FALL,
            SoundEvents.ENTITY_HOSTILE_BIG_FALL,
            SoundEvents.BLOCK_SOUL_SAND_FALL,
            SoundEvents.ENTITY_EXPERIENCE_ORB_PICKUP,
            SoundEvents.ENTITY_PLAYER_LEVELUP
        )
        .visible(muteSounds::get)
        .build()
    );

    private final Setting<Boolean> doneSound = sgGeneral.add(new BoolSetting.Builder()
        .name("done-sound")
        .description("Plays a sound together with the chat message once everything is repaired.")
        .defaultValue(true)
        .build()
    );

    /** Past runs kept for the estimate. */
    private static final int HISTORY_SIZE = 20;
    /** Runs shorter than this (10 s) are too noisy to learn from or to estimate with on their own. */
    private static final int MIN_SESSION_TICKS = 200;
    /** How many ticks of the current run weigh as much as the whole history (1 min). */
    private static final double SESSION_TRUST_TICKS = 1200;

    /** A repair run starts this close to the saved Gold Farm. */
    private static final double FARM_RADIUS = 25;
    /** A run stops only this far away, so hovering around the edge doesn't keep swapping items. */
    private static final double FARM_EXIT_RADIUS = 28;
    /** Sounds are muted this close to the saved Gold Farm. */
    private static final double FARM_MUTE_RADIUS = 5;

    private record Run(long repaired, long ticks) {}

    private final Deque<Run> history = new ArrayDeque<>();

    // The current run: durability repaired, ticks spent with a damaged item in hand, total ticks.
    private long sessionRepaired;
    private long sessionTicks;
    private long elapsedTicks;
    private int lastDamage;

    private int cooldown;

    // The swap currently in progress: the hotbar slot we swapped into and the inventory slot the
    // damaged item came from. Undoing it (the same swap again) puts both items back exactly where
    // they were, so once everything is repaired the inventory layout is unchanged.
    private int swapHotbar = -1;
    private int swapSource = -1;

    private BlockPos farmPos;
    private String farmDimension;

    // Whether a repair run is in progress. Off while a saved Gold Farm is only being watched.
    private boolean running;
    // One run per visit: a sword used at the farm would otherwise restart a run with every swing.
    private boolean visitDone;
    // The done sound is a level-up, which is on the default mute list.
    private boolean playingDoneSound;

    public AutoMend() {
        super(OnFocusAddon.CATEGORY, "auto-mend", "Swaps every damaged Mending item into your hand one by one until all of them are repaired, then puts everything back where it was.");
    }

    @Override
    public void onActivate() {
        resetRun();
        visitDone = false;

        if (farmPos != null) {
            running = false;
            return;
        }

        running = true;
        if (mc.player == null) return;

        int total = countDamaged();
        if (total == 0) {
            info("Nothing to repair - no damaged Mending items in your inventory.");
            toggle();
            return;
        }

        announceRun(total);
    }

    private void resetRun() {
        cooldown = 0;
        swapHotbar = -1;
        swapSource = -1;
        sessionRepaired = 0;
        sessionTicks = 0;
        elapsedTicks = 0;
        lastDamage = -1;
    }

    private void announceRun(int total) {
        int damage = totalDamage();
        double rate = rate();
        if (rate > 0) {
            info("Repairing (highlight)%d(default) item(s), %d durability - about (highlight)%s(default) (learned from %d run(s)).", total, damage, formatTicks(damage / rate), history.size());
        } else {
            info("Repairing (highlight)%d(default) item(s), %d durability - no history yet, the estimate will show up once some XP comes in.", total, damage);
        }
    }

    @Override
    public void onDeactivate() {
        running = false;
        recordRun();

        // Turned off mid-repair - still restore the layout.
        if (swapSource == -1 || mc.player == null) return;

        if (mc.player.currentScreenHandler == mc.player.playerScreenHandler) {
            undoSwap();
        } else {
            warning("Couldn't put the last item back (a container is open) - it's in hotbar slot %d, your original item is in slot %d.", swapHotbar + 1, swapSource + 1);
            swapHotbar = -1;
            swapSource = -1;
        }
    }

    @EventHandler
    private void onTick(TickEvent.Pre event) {
        if (mc.player == null || mc.world == null) return;
        if (!running) {
            watchFarm();
            return;
        }
        sample();

        if (cooldown > 0) {
            cooldown--;
            return;
        }

        // Inventory clicks go through the player's own screen handler - don't touch anything
        // while a chest or other container is open.
        if (mc.player.currentScreenHandler != mc.player.playerScreenHandler) return;

        // Auto-eat is juggling the hotbar - food in hand isn't "nothing to repair", and swapping
        // now would scramble both modules' put-back swaps.
        AutoEat autoEat = Modules.get().get(AutoEat.class);
        if (autoEat.isActive() && autoEat.isBusy()) return;

        // Checked after the guards above, so the put-back swap can't collide with a container or Auto Eat.
        if (farmPos != null && !isNearFarm(FARM_EXIT_RADIUS)) {
            running = false;
            recordRun();
            if (swapSource != -1) undoSwap();
            info("Left the Gold Farm - repair paused, items are back in their slots.");
            return;
        }

        if (swapSource != -1) {
            // Mending only repairs what's actually held - if the player scrolled away, just wait.
            if (needsMending(mc.player.getInventory().getStack(swapHotbar))) return;

            undoSwap();
            cooldown = swapDelay.get();
            return;
        }

        if (needsMending(mc.player.getMainHandStack())) return; // the item held from the start is repairing in place

        int selected = mc.player.getInventory().selectedSlot;
        int next = findNext(selected);

        if (next == -1) {
            info("Done in (highlight)%s(default) - all Mending items are fully repaired.", formatTicks(elapsedTicks));
            running = false;
            recordRun();
            if (doneSound.get()) {
                playingDoneSound = true;
                mc.world.playSoundFromEntity(mc.player, mc.player, SoundEvents.ENTITY_PLAYER_LEVELUP, SoundCategory.MASTER, 1f, 1f);
                playingDoneSound = false;
            }
            if (farmPos != null) visitDone = true;
            else toggle();
            return;
        }

        InvUtils.quickSwap().fromId(selected).to(next);
        swapHotbar = selected;
        swapSource = next;
        cooldown = swapDelay.get();
    }

    /** Between runs: starts one on arriving at the Gold Farm with something to repair. */
    private void watchFarm() {
        if (farmPos == null) return;
        if (!isNearFarm(FARM_EXIT_RADIUS)) {
            visitDone = false;
            return;
        }
        if (visitDone || !isNearFarm(FARM_RADIUS)) return;

        int total = countDamaged();
        if (total == 0) return;

        resetRun();
        running = true;
        announceRun(total);
    }

    private boolean isNearFarm(double radius) {
        if (farmPos == null || !mc.world.getRegistryKey().getValue().toString().equals(farmDimension)) return false;
        return mc.player.squaredDistanceTo(Vec3d.ofCenter(farmPos)) <= radius * radius;
    }

    private boolean shouldMute() {
        if (!muteSounds.get() || playingDoneSound) return false;
        if (farmPos == null) return running;
        return mc.player != null && mc.world != null && isNearFarm(FARM_MUTE_RADIUS);
    }

    /** Measures how much durability was repaired since the last tick. */
    private void sample() {
        int damage = totalDamage();
        // Damage going up (an item was used or a new damaged one picked up) isn't repair - just rebase.
        if (lastDamage != -1 && damage < lastDamage) sessionRepaired += lastDamage - damage;
        lastDamage = damage;

        elapsedTicks++;
        // Only time with something mending in hand counts towards the rate, so swap gaps don't skew it.
        if (needsMending(mc.player.getMainHandStack())) sessionTicks++;
    }

    private void recordRun() {
        if (sessionTicks >= MIN_SESSION_TICKS && sessionRepaired > 0) {
            history.addLast(new Run(sessionRepaired, sessionTicks));
            while (history.size() > HISTORY_SIZE) history.removeFirst();
        }
        sessionRepaired = 0;
        sessionTicks = 0;
    }

    /** Durability points repaired per tick, or 0 if there's nothing to go on yet. */
    private double rate() {
        long repaired = 0, ticks = 0;
        for (Run run : history) {
            repaired += run.repaired();
            ticks += run.ticks();
        }
        double historyRate = ticks > 0 ? (double) repaired / ticks : 0;
        if (sessionTicks < MIN_SESSION_TICKS) return historyRate;

        double sessionRate = (double) sessionRepaired / sessionTicks;
        if (historyRate == 0) return sessionRate;

        double weight = sessionTicks / (sessionTicks + SESSION_TRUST_TICKS);
        return weight * sessionRate + (1 - weight) * historyRate;
    }

    private static String formatTicks(double ticks) {
        long seconds = Math.round(ticks / 20);
        if (seconds < 60) return seconds + "s";
        if (seconds < 3600) return seconds / 60 + "m " + seconds % 60 + "s";
        return seconds / 3600 + "h " + seconds % 3600 / 60 + "m";
    }

    private void undoSwap() {
        InvUtils.quickSwap().fromId(swapHotbar).to(swapSource);
        swapHotbar = -1;
        swapSource = -1;
    }

    @EventHandler
    private void onPlaySound(PlaySoundEvent event) {
        if (!shouldMute()) return;

        for (SoundEvent sound : mutedSounds.get()) {
            if (sound.id().equals(event.sound.getId())) {
                event.cancel();
                return;
            }
        }
    }

    /** Hotbar + main inventory (indices 0-35), skipping the selected slot. Armor and offhand are excluded. */
    private int findNext(int selected) {
        for (int i = 0; i < 36; i++) {
            if (i == selected) continue;
            if (needsMending(mc.player.getInventory().getStack(i))) return i;
        }
        return -1;
    }

    private int countDamaged() {
        int count = 0;
        for (int i = 0; i < 36; i++) {
            if (needsMending(mc.player.getInventory().getStack(i))) count++;
        }
        return count;
    }

    private int totalDamage() {
        int damage = 0;
        for (int i = 0; i < 36; i++) {
            ItemStack stack = mc.player.getInventory().getStack(i);
            if (needsMending(stack)) damage += stack.getDamage();
        }
        return damage;
    }

    private static boolean needsMending(ItemStack stack) {
        return !stack.isEmpty() && stack.isDamaged() && Utils.hasEnchantment(stack, Enchantments.MENDING);
    }

    @Override
    public String getInfoString() {
        if (mc.player == null || !isActive()) return null;
        if (!running) return "standby";
        int left = countDamaged();
        if (left == 0) return null;

        double rate = rate();
        return left + " left, " + (rate > 0 ? "~" + formatTicks(totalDamage() / rate) : "learning...");
    }

    @Override
    public WWidget getWidget(GuiTheme theme) {
        WSection section = theme.section("Gold Farm");
        WVerticalList list = section.add(theme.verticalList()).expandX().widget();
        fillFarmWidget(theme, list);
        return section;
    }

    private void fillFarmWidget(GuiTheme theme, WVerticalList list) {
        list.clear();
        list.add(theme.label(farmPos == null ? "Not set." : farmPos.toShortString() + " (" + farmDimension + ")"));

        WHorizontalList buttons = list.add(theme.horizontalList()).widget();
        WButton here = buttons.add(theme.button("Here")).widget();
        here.action = () -> {
            setFarmHere();
            fillFarmWidget(theme, list);
        };

        if (farmPos == null) return;
        WButton clear = buttons.add(theme.button("Clear")).widget();
        clear.action = () -> {
            clearFarm();
            fillFarmWidget(theme, list);
        };
    }

    private void setFarmHere() {
        if (mc.player == null || mc.world == null) {
            error("Join a world first - there's no position to save.");
            return;
        }

        farmPos = mc.player.getBlockPos();
        farmDimension = mc.world.getRegistryKey().getValue().toString();
        visitDone = false;
        Modules.get().save();

        // Turning on announces the watch; already on, it needs saying here.
        if (isActive()) info("Gold Farm saved at (highlight)%s(default).", farmPos.toShortString());
        else toggle();
    }

    private void clearFarm() {
        farmPos = null;
        farmDimension = null;
        Modules.get().save();
        info("Gold Farm forgotten.");

        // Nothing left to watch. A run already underway just finishes and turns the module off.
        if (isActive() && !running) toggle();
    }

    @Override
    public NbtCompound toTag() {
        NbtCompound tag = super.toTag();
        if (tag == null) return null;

        NbtList list = new NbtList();
        for (Run run : history) {
            NbtCompound runTag = new NbtCompound();
            runTag.putLong("repaired", run.repaired());
            runTag.putLong("ticks", run.ticks());
            list.add(runTag);
        }
        tag.put("history", list);

        if (farmPos != null) {
            NbtCompound farm = new NbtCompound();
            farm.putInt("x", farmPos.getX());
            farm.putInt("y", farmPos.getY());
            farm.putInt("z", farmPos.getZ());
            farm.putString("dimension", farmDimension);
            tag.put("goldFarm", farm);
        }

        return tag;
    }

    @Override
    public AutoMend fromTag(NbtCompound tag) {
        // Load everything before super, which may re-activate the module and print an estimate.
        farmPos = null;
        farmDimension = null;
        if (tag.contains("goldFarm", NbtElement.COMPOUND_TYPE)) {
            NbtCompound farm = tag.getCompound("goldFarm");
            farmPos = new BlockPos(farm.getInt("x"), farm.getInt("y"), farm.getInt("z"));
            farmDimension = farm.getString("dimension");
        }

        history.clear();
        NbtList list = tag.getList("history", NbtElement.COMPOUND_TYPE);
        for (int i = 0; i < list.size(); i++) {
            NbtCompound runTag = list.getCompound(i);
            history.addLast(new Run(runTag.getLong("repaired"), runTag.getLong("ticks")));
        }

        super.fromTag(tag);
        return this;
    }
}
