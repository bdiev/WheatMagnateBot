package dev.onfocus.addon.modules;

import dev.onfocus.addon.ModuleLog;
import dev.onfocus.addon.OnFocusAddon;
import dev.onfocus.addon.maps.MapCache;
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
import net.fabricmc.loader.api.FabricLoader;
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
import net.minecraft.registry.RegistryKey;
import net.minecraft.registry.RegistryKeys;
import net.minecraft.util.Identifier;
import net.minecraft.world.World;
import net.minecraft.screen.ScreenHandler;
import net.minecraft.screen.slot.Slot;
import net.minecraft.screen.slot.SlotActionType;

import java.nio.file.Path;
import java.util.HashSet;
import java.util.Set;

/**
 * Draws a filled map's picture in place of the plain map icon wherever an item is drawn in the GUI
 * (inventories, containers, the hotbar), so map art looks like it does in hand. The hook lives in
 * {@link dev.onfocus.addon.mixin.DrawContextMixin}. A map whose contents the client has never
 * received keeps the vanilla icon until the server sends it, so with "auto-load" a new map in the
 * inventory or in an open chest is briefly taken in hand (which makes the server send it) and then put back.
 * With "remember" every picture seen is kept on disk (onfocus/map-cache, a folder per server), so a map
 * shows again after leaving the server or restarting the game without being taken in hand.
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

    private final Setting<Boolean> remember = sgGeneral.add(new BoolSetting.Builder()
        .name("remember")
        .description("Keep every map picture seen on disk, per server, so it shows again after rejoining or restarting the game without taking the map in hand.")
        .defaultValue(true)
        .build()
    );

    /** How often the maps in view are checked for a picture to keep, in ticks. */
    private static final int SAVE_CHECK_TICKS = 20;

    private final MapRenderState renderState = new MapRenderState();
    private static final ModuleLog FILE_LOG = new ModuleLog("map-preview", "MapPreview");
    private final MapCache cache = new MapCache(FILE_LOG::info);
    private int saveCheckTicks;

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
        cache.open(null);
    }

    @EventHandler
    private void onTick(TickEvent.Pre event) {
        if (mc.player == null || mc.world == null || mc.interactionManager == null) return;
        if (remember.get()) rememberMaps();

        if (holding) {
            heldTicks++;
            boolean loaded = FilledMapItem.getMapState(new MapIdComponent(holdMapId), mc.world) != null;
            if (loaded || heldTicks >= holdTicks.get()) release();
            return;
        }

        if (!autoLoad.get() || mc.player.isUsingItem()) return;
        // Until the kept pictures are listed, any map might be one of them
        if (remember.get() && !cache.ready()) return;
        // The creative inventory's slots don't map onto real server slots
        if (mc.currentScreen instanceof CreativeInventoryScreen) return;
        // Map Art Copier and Map Art Sorter move maps around themselves; don't fight them over the slots
        if (Modules.get().isActive(MapArtCopier.class) || Modules.get().isActive(MapArtSorter.class)) return;

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
            // Kept on disk: it's being read, no need to ask the server
            if (remember.get() && cache.has(id.id())) continue;

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

    /**
     * Puts the pictures read from disk into the world (for maps the server hasn't sent), asks for the
     * kept ones of the maps in view, and keeps the pictures of the maps in view that are new or changed.
     */
    private void rememberMaps() {
        cache.open(cacheFolder());
        MapCache.Picture picture;
        while ((picture = cache.poll()) != null) putPicture(picture);
        if (!cache.ready()) return;

        boolean check = ++saveCheckTicks >= SAVE_CHECK_TICKS;
        if (check) saveCheckTicks = 0;
        for (Slot slot : mc.player.currentScreenHandler.slots) {
            ItemStack stack = slot.getStack();
            if (!stack.isOf(Items.FILLED_MAP)) continue;
            MapIdComponent id = stack.get(DataComponentTypes.MAP_ID);
            if (id == null) continue;
            MapState state = FilledMapItem.getMapState(id, mc.world);
            if (state == null) cache.request(id.id());
            else if (check) cache.save(id.id(), state.scale, state.locked, state.dimension.getValue().toString(), state.colors);
        }
    }

    /** A kept picture as the map's state, unless the server has sent the real one meanwhile. */
    private void putPicture(MapCache.Picture picture) {
        MapIdComponent id = new MapIdComponent(picture.id());
        if (mc.world.getMapState(id) != null) return;
        Identifier dimension = Identifier.tryParse(picture.dimension());
        RegistryKey<World> key = dimension != null ? RegistryKey.of(RegistryKeys.WORLD, dimension) : mc.world.getRegistryKey();
        MapState state = MapState.of(picture.scale(), picture.locked(), key);
        System.arraycopy(picture.colors(), 0, state.colors, 0, MapCache.SIZE);
        mc.world.putClientsideMapState(id, state);
        FILE_LOG.info("Showing the kept picture of map %d".formatted(picture.id()));
        // A texture of this id from before (another server, an older picture) is drawn again from it
        mc.getMapTextureManager().setNeedsUpdate(id, state);
    }

    /** onfocus/map-cache/<server>: map ids belong to a server (a singleplayer world has its own). */
    private Path cacheFolder() {
        String where;
        if (mc.getCurrentServerEntry() != null) where = mc.getCurrentServerEntry().address;
        else if (mc.getServer() != null) where = "singleplayer_" + mc.getServer().getSaveProperties().getLevelName();
        else return null;
        return FabricLoader.getInstance().getGameDir().resolve("onfocus").resolve("map-cache").resolve(where.replaceAll("[^A-Za-z0-9._-]", "_"));
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
        if (state == null) {
            // Wherever it's drawn - a slot, a shulker box's tooltip, a list - a kept picture is fetched for it
            if (remember.get()) cache.request(id.id());
            return false;
        }

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
