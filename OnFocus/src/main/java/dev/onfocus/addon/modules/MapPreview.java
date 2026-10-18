package dev.onfocus.addon.modules;

import dev.onfocus.addon.OnFocusAddon;
import meteordevelopment.meteorclient.events.game.GameLeftEvent;
import meteordevelopment.meteorclient.events.world.TickEvent;
import meteordevelopment.meteorclient.settings.BoolSetting;
import meteordevelopment.meteorclient.settings.IntSetting;
import meteordevelopment.meteorclient.settings.Setting;
import meteordevelopment.meteorclient.settings.SettingGroup;
import meteordevelopment.meteorclient.systems.modules.Module;
import meteordevelopment.meteorclient.systems.modules.Modules;
import meteordevelopment.meteorclient.utils.player.InvUtils;
import meteordevelopment.orbit.EventHandler;
import net.minecraft.client.gui.DrawContext;
import net.minecraft.client.gui.screen.ingame.CreativeInventoryScreen;
import net.minecraft.entity.player.PlayerInventory;
import net.minecraft.client.render.MapRenderState;
import net.minecraft.client.render.VertexConsumerProvider;
import net.minecraft.client.util.math.MatrixStack;
import net.minecraft.component.DataComponentTypes;
import net.minecraft.component.type.MapIdComponent;
import net.minecraft.item.FilledMapItem;
import net.minecraft.item.ItemStack;
import net.minecraft.item.Items;
import net.minecraft.item.map.MapState;
import net.minecraft.screen.ScreenHandler;
import net.minecraft.screen.slot.Slot;
import net.minecraft.screen.slot.SlotActionType;

import java.util.HashSet;
import java.util.Set;

/**
 * Draws a filled map's picture in place of the plain map icon wherever an item is drawn in the GUI
 * (inventories, containers, the hotbar), so map art looks like it does in hand. The hook lives in
 * {@link dev.onfocus.addon.mixin.DrawContextMixin}. A map whose contents the client has never
 * received keeps the vanilla icon until the server sends it, so with "auto-load" a new map in the
 * inventory or in an open chest is briefly taken in hand (which makes the server send it) and then put back.
 */
public class MapPreview extends Module {
    private final SettingGroup sgGeneral = settings.getDefaultGroup();

    private final Setting<Boolean> hotbar = sgGeneral.add(new BoolSetting.Builder()
        .name("hotbar")
        .description("Also show map pictures in the hotbar, not only in inventory screens.")
        .defaultValue(true)
        .build()
    );

    private final Setting<Boolean> markers = sgGeneral.add(new BoolSetting.Builder()
        .name("markers")
        .description("Draw map markers (players, banners, frames) like a map held in hand.")
        .defaultValue(false)
        .build()
    );

    private final Setting<Boolean> autoLoad = sgGeneral.add(new BoolSetting.Builder()
        .name("auto-load")
        .description("Briefly take a new map in hand so the server sends its picture, then put it back.")
        .defaultValue(true)
        .build()
    );

    private final Setting<Integer> holdTicks = sgGeneral.add(new IntSetting.Builder()
        .name("hold-ticks")
        .description("How long a new map is held at most (20 ticks = 1 second). It is put back as soon as its picture arrives.")
        .defaultValue(20)
        .range(2, 100)
        .sliderRange(2, 60)
        .visible(autoLoad::get)
        .build()
    );

    private final MapRenderState renderState = new MapRenderState();

    // Map ids already taken in hand once, so a map the server never sends isn't grabbed forever
    private final Set<Integer> tried = new HashSet<>();

    private boolean holding;
    private int holdMapId;
    // Screen handler the map was taken through (the player's own one or an open container)
    private int holdSyncId;
    // Handler slot the map was swapped out of into hotbar slot holdHotbar, or -1 when the map was
    // already in the hotbar and only the selected slot changed (from prevSelected)
    private int holdSlot;
    private int holdHotbar;
    private int prevSelected;
    private int heldTicks;

    public MapPreview() {
        super(OnFocusAddon.CATEGORY, "map-preview", "Shows the picture of filled maps in inventory slots instead of the plain map icon.");
    }

    @Override
    public void onDeactivate() {
        if (holding) release();
        tried.clear();
    }

    @EventHandler
    private void onGameLeft(GameLeftEvent event) {
        holding = false;
        tried.clear();
    }

    @EventHandler
    private void onTick(TickEvent.Pre event) {
        if (mc.player == null || mc.world == null || mc.interactionManager == null) return;

        if (holding) {
            heldTicks++;
            boolean loaded = FilledMapItem.getMapState(new MapIdComponent(holdMapId), mc.world) != null;
            if (loaded || heldTicks >= holdTicks.get()) release();
            return;
        }

        if (!autoLoad.get() || mc.player.isUsingItem()) return;
        // The creative inventory's slots don't map onto real server slots
        if (mc.currentScreen instanceof CreativeInventoryScreen) return;
        // Map Art Copier moves maps around itself; don't fight it over the slots
        if (Modules.get().isActive(MapArtCopier.class)) return;

        // The open screen's handler (a chest, shulker...) or the player's own one when nothing is open
        ScreenHandler handler = mc.player.currentScreenHandler;
        if (!handler.getCursorStack().isEmpty()) return;

        int selected = mc.player.getInventory().selectedSlot;
        ItemStack hand = mc.player.getInventory().getStack(selected);
        for (Slot slot : handler.slots) {
            ItemStack stack = slot.getStack();
            if (!stack.isOf(Items.FILLED_MAP)) continue;
            MapIdComponent id = stack.get(DataComponentTypes.MAP_ID);
            if (id == null || tried.contains(id.id())) continue;
            if (FilledMapItem.getMapState(id, mc.world) != null) continue;

            int hotbarIndex = -1;
            if (slot.inventory instanceof PlayerInventory) {
                // Armor and offhand slots aren't swapped; the offhand map is already held
                if (slot.getIndex() >= 36) continue;
                if (slot.getIndex() < 9) hotbarIndex = slot.getIndex();
            } else if (!slot.canTakeItems(mc.player) || !slot.canInsert(stack) || (!hand.isEmpty() && !slot.canInsert(hand))) {
                // Result slots and slots that won't take back the map (or the hand item while it's held) are left alone
                continue;
            }
            // Already in hand: the server is sending it anyway
            if (hotbarIndex == selected) continue;

            tried.add(id.id());
            holdMapId = id.id();
            holdSyncId = handler.syncId;
            prevSelected = selected;
            heldTicks = 0;
            if (hotbarIndex != -1) {
                holdSlot = -1;
                holdHotbar = hotbarIndex;
                InvUtils.swap(hotbarIndex, false);
            } else {
                holdSlot = slot.id;
                holdHotbar = selected;
                mc.interactionManager.clickSlot(handler.syncId, slot.id, selected, SlotActionType.SWAP, mc.player);
            }
            holding = true;
            return;
        }
    }

    private void release() {
        holding = false;
        if (mc.player == null || mc.interactionManager == null) return;

        if (holdSlot == -1) {
            // Only switch back if the player hasn't picked another slot in the meantime
            if (mc.player.getInventory().selectedSlot == holdHotbar) InvUtils.swap(prevSelected, false);
            return;
        }

        // Put the map back only if it is still where we left it
        ItemStack stack = mc.player.getInventory().getStack(holdHotbar);
        MapIdComponent id = stack.get(DataComponentTypes.MAP_ID);
        if (!stack.isOf(Items.FILLED_MAP) || id == null || id.id() != holdMapId) return;

        ScreenHandler handler = mc.player.currentScreenHandler;
        if (handler.syncId != holdSyncId) {
            // The chest was closed while the map was in hand: its slot can't be reached any more
            warning("The chest was closed while a map was in hand; it stays in your inventory.");
            return;
        }
        mc.interactionManager.clickSlot(handler.syncId, holdSlot, holdHotbar, SlotActionType.SWAP, mc.player);
    }

    /**
     * Draws {@code stack}'s map over the 16x16 slot at ({@code x}, {@code y}).
     *
     * @return true when the map was drawn and the vanilla icon should be skipped
     */
    public boolean draw(DrawContext context, ItemStack stack, int x, int y, int z) {
        if (!stack.isOf(Items.FILLED_MAP) || mc.world == null) return false;
        if (!hotbar.get() && mc.currentScreen == null) return false;

        MapIdComponent id = stack.get(DataComponentTypes.MAP_ID);
        if (id == null) return false;
        MapState state = FilledMapItem.getMapState(id, mc.world);
        if (state == null) return false;

        // Flush whatever the context has batched so far, so the map lands above it like a vanilla icon would
        context.draw();

        MatrixStack matrices = context.getMatrices();
        matrices.push();
        // Same depth vanilla gives slot items, so the stack count and hover highlight still draw on top
        matrices.translate(x, y, 150 + z);
        // 128x128 map pixels into a 16x16 slot; z is flattened so markers don't sink behind the map
        matrices.scale(16f / 128f, 16f / 128f, 0);

        VertexConsumerProvider.Immediate consumers = mc.getBufferBuilders().getEntityVertexConsumers();
        mc.getMapRenderer().update(id, state, renderState);
        mc.getMapRenderer().draw(renderState, matrices, consumers, !markers.get(), 0xF000F0);
        consumers.draw();

        matrices.pop();
        return true;
    }
}
