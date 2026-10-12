package dev.onfocus.addon.modules;

import dev.onfocus.addon.OnFocusAddon;
import meteordevelopment.meteorclient.events.game.OpenScreenEvent;
import meteordevelopment.meteorclient.events.packets.PacketEvent;
import meteordevelopment.meteorclient.gui.GuiTheme;
import meteordevelopment.meteorclient.gui.widgets.WWidget;
import meteordevelopment.meteorclient.gui.widgets.containers.WVerticalList;
import meteordevelopment.meteorclient.gui.widgets.pressable.WButton;
import meteordevelopment.meteorclient.mixin.AbstractSignEditScreenAccessor;
import meteordevelopment.meteorclient.systems.modules.Module;
import meteordevelopment.meteorclient.systems.modules.Modules;
import meteordevelopment.orbit.EventHandler;
import meteordevelopment.orbit.EventPriority;
import net.minecraft.client.gui.screen.ingame.AbstractSignEditScreen;
import net.minecraft.client.util.InputUtil;
import net.minecraft.item.HangingSignItem;
import net.minecraft.item.Item;
import net.minecraft.item.SignItem;
import net.minecraft.nbt.NbtCompound;
import net.minecraft.nbt.NbtElement;
import net.minecraft.nbt.NbtList;
import net.minecraft.nbt.NbtString;
import net.minecraft.network.packet.c2s.play.PlayerInteractBlockC2SPacket;
import net.minecraft.network.packet.c2s.play.UpdateSignC2SPacket;
import net.minecraft.util.math.BlockPos;
import org.lwjgl.glfw.GLFW;

import java.time.LocalDate;
import java.time.format.DateTimeFormatter;

/**
 * Writes every sign the player places: lines 1-3 are the text of the first sign written with the
 * module on, line 4 is today's date (dd/MM/yyyy). The text is kept until the Reset button.
 * Placing a sign with Shift held opens the normal editor, and that sign is not remembered.
 * Editing an existing sign (not just placed) is left alone.
 */
public class AutoSignDate extends Module {
    private static final DateTimeFormatter DATE = DateTimeFormatter.ofPattern("dd/MM/yyyy");
    /** How long after a placement click the server's sign editor still counts as that sign's. */
    private static final long PLACE_WINDOW_MS = 5_000;

    /** Lines 1-3, or null until the first sign is written. */
    private String[] text;

    private long placedAtMs;
    private boolean placedManual;
    /** The sign whose editor is open to learn the text from. */
    private BlockPos learningPos;
    private boolean sendingOwn;

    public AutoSignDate() {
        super(OnFocusAddon.CATEGORY, "auto-sign-date",
            "Writes placed signs with remembered text and today's date on line 4. Hold Shift while placing to write one by hand.");
    }

    @Override
    public void onDeactivate() {
        placedAtMs = 0;
        learningPos = null;
    }

    @EventHandler(priority = EventPriority.HIGH)
    private void onSendPacket(PacketEvent.Send event) {
        if (sendingOwn || mc.player == null) return;

        if (event.packet instanceof PlayerInteractBlockC2SPacket interact) {
            Item item = mc.player.getStackInHand(interact.getHand()).getItem();
            if (item instanceof SignItem || item instanceof HangingSignItem) {
                placedAtMs = System.currentTimeMillis();
                placedManual = isShiftHeld();
            }
            return;
        }

        if (!(event.packet instanceof UpdateSignC2SPacket update) || learningPos == null) return;
        if (!update.getPos().equals(learningPos)) return;
        learningPos = null;

        String[] lines = update.getText();
        String[] learned = { lines[0], lines[1], lines[2] };
        // Closing the editor empty (Esc) teaches nothing.
        if (String.join("", learned).isBlank()) return;

        text = learned;
        Modules.get().save();
        info("Remembered the sign text. Reset it in the module settings.");

        event.cancel();
        send(update.getPos(), update.isFront());
    }

    @EventHandler
    private void onOpenScreen(OpenScreenEvent event) {
        if (!(event.screen instanceof AbstractSignEditScreen screen) || mc.player == null) return;

        boolean justPlaced = System.currentTimeMillis() - placedAtMs <= PLACE_WINDOW_MS;
        boolean manual = placedManual;
        placedAtMs = 0;
        // An existing sign being edited, or a Shift placement: the normal editor, nothing remembered.
        if (!justPlaced || manual) return;

        BlockPos pos = ((AbstractSignEditScreenAccessor) screen).getSign().getPos();
        if (text == null) {
            learningPos = pos;
            info("Write the sign once: lines 1-3 are remembered, line 4 becomes the date.");
            return;
        }

        send(pos, true);
        event.cancel();
    }

    private void send(BlockPos pos, boolean front) {
        sendingOwn = true;
        try {
            mc.player.networkHandler.sendPacket(new UpdateSignC2SPacket(pos, front, text[0], text[1], text[2], LocalDate.now().format(DATE)));
        } finally {
            sendingOwn = false;
        }
    }

    private boolean isShiftHeld() {
        long window = mc.getWindow().getHandle();
        return InputUtil.isKeyPressed(window, GLFW.GLFW_KEY_LEFT_SHIFT)
            || InputUtil.isKeyPressed(window, GLFW.GLFW_KEY_RIGHT_SHIFT)
            || mc.options.sneakKey.isPressed();
    }

    @Override
    public WWidget getWidget(GuiTheme theme) {
        WVerticalList list = theme.verticalList();
        fillWidget(theme, list);
        return list;
    }

    private void fillWidget(GuiTheme theme, WVerticalList list) {
        list.clear();
        if (text == null) {
            list.add(theme.label("No text yet - the next sign you write is remembered."));
            return;
        }
        for (int i = 0; i < 3; i++) list.add(theme.label((i + 1) + ": " + text[i]));
        list.add(theme.label("4: " + LocalDate.now().format(DATE) + " (today's date)"));

        WButton reset = list.add(theme.button("Reset text")).widget();
        reset.action = () -> {
            text = null;
            learningPos = null;
            Modules.get().save();
            info("Sign text forgotten - the next sign you write is remembered.");
            fillWidget(theme, list);
        };
    }

    @Override
    public NbtCompound toTag() {
        NbtCompound tag = super.toTag();
        if (tag == null) return null;

        if (text != null) {
            NbtList lines = new NbtList();
            for (String line : text) lines.add(NbtString.of(line));
            tag.put("text", lines);
        }
        return tag;
    }

    @Override
    public AutoSignDate fromTag(NbtCompound tag) {
        text = null;
        NbtList lines = tag.getList("text", NbtElement.STRING_TYPE);
        if (lines.size() == 3) text = new String[] { lines.getString(0), lines.getString(1), lines.getString(2) };

        super.fromTag(tag);
        return this;
    }
}
