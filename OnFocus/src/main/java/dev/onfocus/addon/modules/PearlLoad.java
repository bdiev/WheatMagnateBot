package dev.onfocus.addon.modules;

import dev.onfocus.addon.OnFocusAddon;
import meteordevelopment.meteorclient.MeteorClient;
import meteordevelopment.meteorclient.events.game.GameLeftEvent;
import meteordevelopment.meteorclient.events.game.ReceiveMessageEvent;
import meteordevelopment.meteorclient.events.world.TickEvent;
import meteordevelopment.meteorclient.settings.BoolSetting;
import meteordevelopment.meteorclient.settings.Setting;
import meteordevelopment.meteorclient.settings.SettingGroup;
import meteordevelopment.meteorclient.settings.StringSetting;
import meteordevelopment.meteorclient.systems.modules.Module;
import meteordevelopment.meteorclient.utils.player.ChatUtils;
import meteordevelopment.meteorclient.utils.player.InvUtils;
import meteordevelopment.meteorclient.utils.player.Rotations;
import meteordevelopment.orbit.EventHandler;
import net.minecraft.block.entity.BarrelBlockEntity;
import net.minecraft.block.entity.BlockEntity;
import net.minecraft.block.entity.ChestBlockEntity;
import net.minecraft.entity.player.PlayerInventory;
import net.minecraft.item.ItemStack;
import net.minecraft.item.Items;
import net.minecraft.screen.GenericContainerScreenHandler;
import net.minecraft.screen.ScreenHandler;
import net.minecraft.screen.slot.Slot;
import net.minecraft.screen.slot.SlotActionType;
import net.minecraft.sound.SoundCategory;
import net.minecraft.sound.SoundEvents;
import net.minecraft.util.Hand;
import net.minecraft.util.hit.BlockHitResult;
import net.minecraft.util.math.BlockPos;
import net.minecraft.util.math.Direction;
import net.minecraft.util.math.Vec3d;
import net.minecraft.world.World;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Pearl Loader request driven by one bind. The module follows the request's stage from the
 * whispers it gets, even while it is off, so a "/w WheatMagnate load" typed by hand counts too:
 * <ul>
 *   <li>No request: a press whispers "load" to the WheatMagnate bot and waits.</li>
 *   <li>Waiting (queued, or the loader is on its way): a press only turns waiting on or off;
 *       "load" is not sent again.</li>
 *   <li>Ready (the loader whispered one of its "/r ..." prompts; a sound plays): a press
 *       whispers "yes" to the loader, whether the module was on or off.</li>
 * </ul>
 * The stage is dropped when the loader or WheatMagnate reports that the request ended, on
 * leaving the server, or once the loader can no longer be waiting for the answer.
 * <p>
 * After the "yes", a listener that runs with the module off waits for the teleport, takes one
 * ender pearl from the nearest chest or barrel that has some, puts it in the hotbar and selects it.
 * Once that pearl is thrown, the hotbar item it pushed aside and the selected slot are put back.
 */
public class PearlLoad extends Module {
    private static final Pattern WHISPER_PATTERN = Pattern.compile("^([A-Za-z0-9_]{1,16}) whispers: (.+)$", Pattern.DOTALL);
    private static final Pattern READY_PROMPT = Pattern.compile("\"/r [a-z]+\"", Pattern.CASE_INSENSITIVE);

    /** How long the teleport may take after the "yes". */
    private static final int TELEPORT_TIMEOUT_TICKS = 60 * 20;
    /** A move this long within one tick is the pearl teleport, not walking or flying. */
    private static final double TELEPORT_JUMP_SQ = 6 * 6;
    /** Chunks and the chest's contents arrive after the teleport: a short wait before looking. */
    private static final int SETTLE_TICKS = 10;
    private static final int OPEN_TIMEOUT_TICKS = 40;
    /** The contents come in a packet right after the open one: a few ticks before reading them. */
    private static final int READ_DELAY_TICKS = 3;
    private static final int SEARCH_RADIUS = 5;

    private final SettingGroup sgGeneral = settings.getDefaultGroup();

    private final Setting<String> botName = sgGeneral.add(new StringSetting.Builder()
        .name("bot-name")
        .description("The bot that takes the \"load\" whisper.")
        .defaultValue("WheatMagnate")
        .build()
    );

    private final Setting<String> loaderName = sgGeneral.add(new StringSetting.Builder()
        .name("loader-name")
        .description("The bot account that goes to your pearl and asks whether you are ready.")
        .defaultValue("2kk4")
        .build()
    );

    private final Setting<Boolean> takePearl = sgGeneral.add(new BoolSetting.Builder()
        .name("take-pearl")
        .description("After the teleport, take one ender pearl from the nearest chest into the hotbar and select it; once it is thrown, put the hotbar back as it was.")
        .defaultValue(true)
        .build()
    );

    /** Where the current request is, followed from whispers whether the module is on or off. */
    private enum Request { NONE, WAITING, READY }

    /** The loader waits two minutes for the answer: past that a "yes" would reach no one. */
    private static final long READY_TTL_MS = 2 * 60_000L;
    /** A queue place is held for 15 minutes; the walk to the pearl comes on top. */
    private static final long WAITING_TTL_MS = 25 * 60_000L;

    private Request request = Request.NONE;
    private long requestAt;
    // Set when the module turns itself off, so that turning off sends nothing
    private boolean finished;

    private enum Phase { IDLE, AWAIT_TELEPORT, SETTLE, OPEN_CHEST, WAIT_SCREEN, AWAIT_THROW, RESTORE }

    private Phase phase = Phase.IDLE;
    private int phaseTicks;
    private Vec3d lastPos;
    private World lastWorld;
    private final Set<BlockPos> triedChests = new HashSet<>();
    private BlockPos openedChest;
    private int screenTicks;
    /** The selected hotbar slot when "yes" was sent. */
    private int prevSelected = -1;
    /** The hotbar slot the pearl was put in. */
    private int pearlSlot = -1;
    /** Where the item that was in {@link #pearlSlot} went (main inventory index), or -1 when the slot was empty. */
    private int displacedTo = -1;
    private ItemStack displaced = ItemStack.EMPTY;

    public PearlLoad() {
        super(OnFocusAddon.CATEGORY, "pearl-load", "First press whispers \"load\" to WheatMagnate; once the loader is ready, the second press whispers \"yes\" to the loader. After the teleport it hands you one pearl from the nearest chest.");
        MeteorClient.EVENT_BUS.subscribe(new AfterLoadListener());
    }

    @Override
    public void onActivate() {
        finished = false;
        if (mc.player == null || mc.getNetworkHandler() == null) {
            error("Not connected to a server.");
            finish();
            return;
        }
        expireStaleRequest();
        switch (request) {
            case READY -> {
                // The loader is already waiting for the answer (also for a "load" typed by hand)
                sendYes();
                finish();
            }
            case WAITING -> info("Already waiting for the Pearl Loader; press again once it is ready.");
            default -> {
                // A new request drops what was left of the last one
                setPhase(Phase.IDLE);
                ChatUtils.sendPlayerMsg("/w " + botName.get().trim() + " load");
                setRequest(Request.WAITING);
            }
        }
    }

    @Override
    public void onDeactivate() {
        if (finished) return;
        expireStaleRequest();
        if (request == Request.READY && mc.player != null && mc.getNetworkHandler() != null) sendYes();
        // Turned off while waiting: the request goes on, and a press once the loader is ready still answers it
    }

    /** Whispers "yes" to the loader and gets ready to hand out the pearl after the teleport. */
    private void sendYes() {
        // Whispered by name rather than /r, so a whisper from someone else in between can't take the "yes"
        ChatUtils.sendPlayerMsg("/w " + loaderName.get().trim() + " yes");
        setRequest(Request.NONE);
        if (takePearl.get()) {
            prevSelected = mc.player.getInventory().selectedSlot;
            lastPos = mc.player.getPos();
            lastWorld = mc.world;
            setPhase(Phase.AWAIT_TELEPORT);
        }
    }

    private void setRequest(Request next) {
        request = next;
        requestAt = System.currentTimeMillis();
    }

    private void expireStaleRequest() {
        long age = System.currentTimeMillis() - requestAt;
        if ((request == Request.READY && age > READY_TTL_MS) || (request == Request.WAITING && age > WAITING_TTL_MS)) {
            setRequest(Request.NONE);
        }
    }

    /** Follows the request from the bots' whispers; subscribed while the module is off too. */
    private void handleWhisper(String sender, String text) {
        String lower = text.toLowerCase(Locale.ROOT);
        if (sender.equalsIgnoreCase(loaderName.get().trim())) {
            if (READY_PROMPT.matcher(text).find()) {
                if (request != Request.READY) {
                    mc.world.playSoundFromEntity(mc.player, mc.player, SoundEvents.UI_TOAST_IN, SoundCategory.MASTER, 1f, 1f);
                    if (!isActive()) info("Pearl Loader is ready: press the Pearl Load bind to confirm.");
                }
                setRequest(Request.READY);
            } else if (lower.contains("not set") || lower.contains("leaving")) {
                endRequest();
            }
        } else if (sender.equalsIgnoreCase(botName.get().trim())) {
            if (lower.contains("not configured") || lower.contains("unavailable") || lower.contains("queue is full")
                || lower.contains("expired") || lower.contains("not set") || lower.contains("cancelled")
                || lower.contains("left the pearl loader queue")) {
                endRequest();
            } else if (request == Request.NONE && (lower.contains("in the pearl loader queue") || lower.contains("in the queue")
                || lower.contains("on its way to your pearl") || lower.contains("already in progress"))) {
                // A request made by hand: waiting from now on, so a press won't ask again
                setRequest(Request.WAITING);
            }
        }
    }

    private void endRequest() {
        setRequest(Request.NONE);
        finish();
    }

    private void finish() {
        finished = true;
        if (isActive()) toggle();
    }

    private void setPhase(Phase next) {
        phase = next;
        phaseTicks = 0;
        if (next == Phase.IDLE) {
            triedChests.clear();
            openedChest = null;
        }
    }

    /**
     * Runs with the module off too: it follows the request's whispers, and the pearl hand-out
     * happens after the "yes" turned the module off.
     */
    private class AfterLoadListener {
        @EventHandler
        private void onGameLeft(GameLeftEvent event) {
            setPhase(Phase.IDLE);
            setRequest(Request.NONE);
        }

        @EventHandler
        private void onReceiveMessage(ReceiveMessageEvent event) {
            if (mc.player == null || mc.world == null) return;
            Matcher whisper = WHISPER_PATTERN.matcher(event.getMessage().getString());
            if (!whisper.matches()) return;
            handleWhisper(whisper.group(1), whisper.group(2).trim());
        }

        @EventHandler
        private void onTick(TickEvent.Post event) {
            if (phase == Phase.IDLE) return;
            if (mc.player == null || mc.world == null || mc.interactionManager == null) {
                setPhase(Phase.IDLE);
                return;
            }
            phaseTicks++;
            switch (phase) {
                case AWAIT_TELEPORT -> awaitTeleport();
                case SETTLE -> { if (phaseTicks >= SETTLE_TICKS) setPhase(Phase.OPEN_CHEST); }
                case OPEN_CHEST -> openNearestChest();
                case WAIT_SCREEN -> takeFromChest();
                case AWAIT_THROW -> awaitThrow();
                case RESTORE -> restore();
                default -> { }
            }
        }
    }

    private void awaitTeleport() {
        Vec3d pos = mc.player.getPos();
        boolean jumped = mc.world != lastWorld || pos.squaredDistanceTo(lastPos) > TELEPORT_JUMP_SQ;
        lastPos = pos;
        lastWorld = mc.world;
        if (jumped) {
            setPhase(Phase.SETTLE);
            return;
        }
        if (phaseTicks > TELEPORT_TIMEOUT_TICKS) setPhase(Phase.IDLE);
    }

    private void openNearestChest() {
        // Something else is open (or the player is dragging an item): wait for it to be closed
        if (mc.player.currentScreenHandler != mc.player.playerScreenHandler) return;

        BlockPos chest = nearestChest();
        if (chest == null) {
            warning("No chest with ender pearls within reach.");
            setPhase(Phase.IDLE);
            return;
        }
        triedChests.add(chest);
        openedChest = chest;

        Vec3d center = Vec3d.ofCenter(chest);
        Vec3d eye = mc.player.getEyePos();
        Direction side = Direction.getFacing(eye.x - center.x, eye.y - center.y, eye.z - center.z);
        Vec3d at = center.add(side.getOffsetX() * 0.5, side.getOffsetY() * 0.5, side.getOffsetZ() * 0.5);
        BlockHitResult hit = new BlockHitResult(at, side, chest, false);
        Rotations.rotate(Rotations.getYaw(at), Rotations.getPitch(at), () -> mc.interactionManager.interactBlock(mc.player, Hand.MAIN_HAND, hit));
        screenTicks = 0;
        setPhase(Phase.WAIT_SCREEN);
    }

    private BlockPos nearestChest() {
        BlockPos origin = mc.player.getBlockPos();
        List<BlockPos> found = new ArrayList<>();
        for (BlockPos pos : BlockPos.iterate(origin.add(-SEARCH_RADIUS, -SEARCH_RADIUS, -SEARCH_RADIUS), origin.add(SEARCH_RADIUS, SEARCH_RADIUS, SEARCH_RADIUS))) {
            BlockEntity entity = mc.world.getBlockEntity(pos);
            if (!(entity instanceof ChestBlockEntity) && !(entity instanceof BarrelBlockEntity)) continue;
            if (triedChests.contains(pos) || !mc.player.canInteractWithBlockAt(pos, 0)) continue;
            found.add(pos.toImmutable());
        }
        Vec3d eye = mc.player.getEyePos();
        return found.stream().min(Comparator.comparingDouble(pos -> Vec3d.ofCenter(pos).squaredDistanceTo(eye))).orElse(null);
    }

    private void takeFromChest() {
        ScreenHandler handler = mc.player.currentScreenHandler;
        if (!(handler instanceof GenericContainerScreenHandler container)) {
            // Didn't open (blocked, out of reach): the next nearest one
            if (phaseTicks > OPEN_TIMEOUT_TICKS) setPhase(Phase.OPEN_CHEST);
            return;
        }
        if (++screenTicks < READ_DELAY_TICKS) return;
        if (!handler.getCursorStack().isEmpty()) return;

        int chestSize = container.getRows() * 9;
        int pearlId = -1;
        for (int i = 0; i < chestSize; i++) {
            if (handler.getSlot(i).getStack().isOf(Items.ENDER_PEARL)) {
                pearlId = i;
                break;
            }
        }
        if (pearlId == -1) {
            // A double chest's other half opens the same contents: it is skipped too
            if (openedChest != null) {
                for (Direction dir : Direction.Type.HORIZONTAL) {
                    BlockPos other = openedChest.offset(dir);
                    if (mc.world.getBlockEntity(other) instanceof ChestBlockEntity) triedChests.add(other);
                }
            }
            mc.player.closeHandledScreen();
            setPhase(Phase.OPEN_CHEST);
            return;
        }

        PlayerInventory inventory = mc.player.getInventory();
        int target = -1;
        if (inventory.getStack(prevSelected).isEmpty()) target = prevSelected;
        for (int i = 0; i < 9 && target == -1; i++) {
            if (inventory.getStack(i).isEmpty()) target = i;
        }
        displacedTo = -1;
        displaced = ItemStack.EMPTY;
        if (target == -1) {
            // A full hotbar: the selected slot's item moves to a free spot in the inventory until the pearl is thrown
            target = prevSelected;
            int free = -1;
            for (int i = 9; i < 36 && free == -1; i++) {
                if (inventory.getStack(i).isEmpty()) free = i;
            }
            if (free == -1) {
                warning("No free inventory slot for the ender pearl.");
                mc.player.closeHandledScreen();
                setPhase(Phase.IDLE);
                return;
            }
            displaced = inventory.getStack(target).copy();
            displacedTo = free;
            click(handler, playerSlotId(handler, target), 0);
            click(handler, playerSlotId(handler, free), 0);
        }

        int pearlCount = handler.getSlot(pearlId).getStack().getCount();
        int targetId = playerSlotId(handler, target);
        // Pick up the stack, drop exactly one into the hotbar slot, put the rest back
        click(handler, pearlId, 0);
        click(handler, targetId, 1);
        if (pearlCount > 1) click(handler, pearlId, 0);

        mc.player.closeHandledScreen();
        pearlSlot = target;
        InvUtils.swap(target, false);
        setPhase(Phase.AWAIT_THROW);
    }

    private void awaitThrow() {
        if (mc.player.getInventory().getStack(pearlSlot).isOf(Items.ENDER_PEARL)) return;
        setPhase(Phase.RESTORE);
    }

    private void restore() {
        // Moved only with the inventory closed and nothing on the cursor
        if (mc.player.currentScreenHandler != mc.player.playerScreenHandler) return;
        if (!mc.player.playerScreenHandler.getCursorStack().isEmpty()) return;

        PlayerInventory inventory = mc.player.getInventory();
        if (displacedTo != -1 && inventory.getStack(pearlSlot).isEmpty()
            && ItemStack.areItemsAndComponentsEqual(inventory.getStack(displacedTo), displaced)) {
            InvUtils.move().from(displacedTo).toHotbar(pearlSlot);
        }
        if (inventory.selectedSlot == pearlSlot && prevSelected != -1) InvUtils.swap(prevSelected, false);
        displacedTo = -1;
        displaced = ItemStack.EMPTY;
        setPhase(Phase.IDLE);
    }

    /** The handler's slot id of the player's inventory index (0-8 hotbar, 9-35 main). */
    private static int playerSlotId(ScreenHandler handler, int inventoryIndex) {
        for (Slot slot : handler.slots) {
            if (slot.inventory instanceof PlayerInventory && slot.getIndex() == inventoryIndex) return slot.id;
        }
        return -1;
    }

    private void click(ScreenHandler handler, int slotId, int button) {
        mc.interactionManager.clickSlot(handler.syncId, slotId, button, SlotActionType.PICKUP, mc.player);
    }
}
