package dev.onfocus.addon.modules;

import dev.onfocus.addon.OnFocusAddon;
import it.unimi.dsi.fastutil.ints.Int2LongMap;
import it.unimi.dsi.fastutil.ints.Int2LongOpenHashMap;
import it.unimi.dsi.fastutil.ints.IntOpenHashSet;
import it.unimi.dsi.fastutil.ints.IntSet;
import it.unimi.dsi.fastutil.longs.Long2IntMap;
import it.unimi.dsi.fastutil.longs.Long2IntOpenHashMap;
import it.unimi.dsi.fastutil.longs.LongIterator;
import it.unimi.dsi.fastutil.longs.LongOpenHashSet;
import it.unimi.dsi.fastutil.longs.LongSet;
import meteordevelopment.meteorclient.events.game.GameLeftEvent;
import meteordevelopment.meteorclient.events.render.Render2DEvent;
import meteordevelopment.meteorclient.events.render.Render3DEvent;
import meteordevelopment.meteorclient.events.world.TickEvent;
import meteordevelopment.meteorclient.settings.BoolSetting;
import meteordevelopment.meteorclient.settings.ColorSetting;
import meteordevelopment.meteorclient.settings.EnumSetting;
import meteordevelopment.meteorclient.settings.IntSetting;
import meteordevelopment.meteorclient.settings.Setting;
import meteordevelopment.meteorclient.settings.SettingGroup;
import meteordevelopment.meteorclient.systems.modules.Module;
import meteordevelopment.meteorclient.systems.modules.Modules;
import meteordevelopment.meteorclient.utils.render.RenderUtils;
import meteordevelopment.meteorclient.utils.render.color.Color;
import meteordevelopment.meteorclient.utils.render.color.SettingColor;
import meteordevelopment.orbit.EventHandler;
import net.fabricmc.loader.api.FabricLoader;
import net.minecraft.client.gui.DrawContext;
import net.minecraft.component.DataComponentTypes;
import net.minecraft.component.type.BundleContentsComponent;
import net.minecraft.component.type.MapIdComponent;
import net.minecraft.item.BundleItem;
import net.minecraft.item.ItemStack;
import net.minecraft.item.Items;
import net.minecraft.item.map.MapState;
import net.minecraft.screen.slot.SlotActionType;
import net.minecraft.util.Hand;
import net.minecraft.util.math.ChunkPos;
import net.minecraft.util.math.MathHelper;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.ArrayList;
import java.util.List;

/**
 * Draws new maps over an area: the area is split into map cells (128x128 blocks, the area of one
 * scale-0 map, aligned like the game aligns maps), and in every cell not drawn yet an empty map is
 * taken in hand and used near the cell's centre. The new map is held until the server has drawn
 * all of it (or, with "give-up-after", until it stops changing while you stand near the centre),
 * then it goes back where the hand's item came from and into a bundle with room, if there is one.
 * <p>
 * Flying is up to you: the HUD shows the area's cells (drawn, started, left) with you and the next
 * cell to fly to, and in the world the cells around you are coloured on a plane under you, with a
 * beam and a tracer to the next one. Drawn cells are kept on disk per server and dimension
 * (onfocus/map-painter), along with which map id belongs to which started cell, so a map left half
 * drawn is picked up again when you come back.
 * <p>
 * The client is never told a map's centre, so a new map's cell is the one you stood in when it was
 * made: a map is only made within "start-distance" of a cell's centre, far from its edges.
 */
public class MapPainter extends Module {
    public enum HandMode { MainHand, Offhand }
    public enum Order { Rows, Nearest }
    public enum Corner { TopLeft, TopRight, BottomLeft, BottomRight }

    private final SettingGroup sgArea = settings.createGroup("Area");
    private final SettingGroup sgMaps = settings.createGroup("Maps");
    private final SettingGroup sgHud = settings.createGroup("HUD");
    private final SettingGroup sgWorld = settings.createGroup("World");

    private final Setting<Integer> centerX = sgArea.add(new IntSetting.Builder()
        .name("center-x")
        .description("X (in blocks) of the area's centre.")
        .defaultValue(0)
        .range(-30_000_000, 30_000_000)
        .noSlider()
        .build()
    );

    private final Setting<Integer> centerZ = sgArea.add(new IntSetting.Builder()
        .name("center-z")
        .description("Z (in blocks) of the area's centre.")
        .defaultValue(0)
        .range(-30_000_000, 30_000_000)
        .noSlider()
        .build()
    );

    private final Setting<Integer> sizeChunks = sgArea.add(new IntSetting.Builder()
        .name("size-chunks")
        .description("Side of the square area in chunks. A map covers 8x8 chunks, so 128 is 16x16 = 256 maps. Rounded down to a multiple of 8.")
        .defaultValue(128)
        .range(8, 2048)
        .sliderRange(8, 512)
        .build()
    );

    private final Setting<Boolean> centerHere = sgArea.add(new BoolSetting.Builder()
        .name("center-here")
        .description("Turn on to move the area's centre to the map cell you are in.")
        .defaultValue(false)
        .onChanged(v -> { if (v) centerOnPlayer(); })
        .build()
    );

    private final Setting<Order> order = sgArea.add(new EnumSetting.Builder<Order>()
        .name("order")
        .description("Which cell is shown as next: Rows goes row by row, back and forth (north to south); Nearest is the closest one left.")
        .defaultValue(Order.Rows)
        .build()
    );

    private final Setting<Boolean> resetArea = sgArea.add(new BoolSetting.Builder()
        .name("reset-area")
        .description("Turn on to forget which cells of the area are drawn, so every cell is drawn again.")
        .defaultValue(false)
        .onChanged(v -> { if (v) resetArea(); })
        .build()
    );

    private final Setting<HandMode> hand = sgMaps.add(new EnumSetting.Builder<HandMode>()
        .name("hand")
        .description("The hand the map is held in. With the main hand, keep fireworks in the offhand: they still fire past a held map.")
        .defaultValue(HandMode.MainHand)
        .build()
    );

    private final Setting<Integer> startDistance = sgMaps.add(new IntSetting.Builder()
        .name("start-distance")
        .description("How close (in blocks, flat) to a cell's centre a new map is made. A map is drawn up to 128 blocks around you, so near the centre it covers the whole cell.")
        .defaultValue(24)
        .range(4, 60)
        .sliderRange(4, 60)
        .build()
    );

    private final Setting<Integer> giveUpAfter = sgMaps.add(new IntSetting.Builder()
        .name("give-up-after")
        .description("Seconds a map may stay unchanged, while you are within start-distance of the centre, before it counts as drawn with blanks left (void, unloaded chunks, the Nether's shorter range). 0 waits for every pixel.")
        .defaultValue(8)
        .range(0, 120)
        .sliderRange(0, 60)
        .build()
    );

    private final Setting<Boolean> useBundles = sgMaps.add(new BoolSetting.Builder()
        .name("bundles")
        .description("Put each drawn map into a bundle from your inventory that has room.")
        .defaultValue(true)
        .build()
    );

    private final Setting<Boolean> hud = sgHud.add(new BoolSetting.Builder()
        .name("hud")
        .description("Show the area's cells on screen.")
        .defaultValue(true)
        .build()
    );

    private final Setting<Corner> hudCorner = sgHud.add(new EnumSetting.Builder<Corner>()
        .name("corner")
        .description("Where on screen the area is shown.")
        .defaultValue(Corner.TopRight)
        .visible(hud::get)
        .build()
    );

    private final Setting<Integer> hudSize = sgHud.add(new IntSetting.Builder()
        .name("size")
        .description("Size of the shown area in pixels.")
        .defaultValue(128)
        .range(32, 512)
        .sliderRange(48, 256)
        .visible(hud::get)
        .build()
    );

    private final Setting<Integer> hudOffsetY = sgHud.add(new IntSetting.Builder()
        .name("offset-y")
        .description("Pixels from the top or bottom edge of the screen.")
        .defaultValue(4)
        .range(0, 1000)
        .sliderRange(0, 200)
        .visible(hud::get)
        .build()
    );

    private final Setting<Boolean> worldGrid = sgWorld.add(new BoolSetting.Builder()
        .name("grid")
        .description("Colour the cells around you on a plane under you.")
        .defaultValue(true)
        .build()
    );

    private final Setting<Integer> gridRadius = sgWorld.add(new IntSetting.Builder()
        .name("grid-radius")
        .description("How many cells around you are coloured.")
        .defaultValue(3)
        .range(0, 10)
        .sliderRange(0, 8)
        .visible(worldGrid::get)
        .build()
    );

    private final Setting<Integer> gridBelow = sgWorld.add(new IntSetting.Builder()
        .name("grid-below")
        .description("How far under you (in blocks) the plane is drawn.")
        .defaultValue(4)
        .range(0, 64)
        .sliderRange(0, 32)
        .visible(worldGrid::get)
        .build()
    );

    private final Setting<Boolean> beam = sgWorld.add(new BoolSetting.Builder()
        .name("beam")
        .description("Draw a beam at the next cell's centre and a tracer to it.")
        .defaultValue(true)
        .build()
    );

    private final Setting<SettingColor> doneColor = sgWorld.add(new ColorSetting.Builder()
        .name("drawn-color")
        .description("Colour of drawn cells.")
        .defaultValue(new SettingColor(60, 200, 80, 70))
        .build()
    );

    private final Setting<SettingColor> startedColor = sgWorld.add(new ColorSetting.Builder()
        .name("started-color")
        .description("Colour of cells with a half-drawn map.")
        .defaultValue(new SettingColor(240, 170, 40, 80))
        .build()
    );

    private final Setting<SettingColor> todoColor = sgWorld.add(new ColorSetting.Builder()
        .name("left-color")
        .description("Colour of cells left to draw.")
        .defaultValue(new SettingColor(200, 60, 60, 45))
        .build()
    );

    private final Setting<SettingColor> nextColor = sgWorld.add(new ColorSetting.Builder()
        .name("next-color")
        .description("Colour of the next cell, its beam and the tracer to it.")
        .defaultValue(new SettingColor(60, 200, 255, 200))
        .build()
    );

    /** Side of a scale-0 map in blocks; cells are aligned like the game aligns maps, centred on multiples of 128. */
    private static final int CELL = 128;
    private static final int PIXELS = 128 * 128;
    /** Ticks to wait for the server to put a just-made map into the inventory. */
    private static final int CREATE_TIMEOUT = 60;
    /** Ticks between inventory actions, so each is seen by the server before the next. */
    private static final int ACTION_GAP = 3;

    private enum Phase { IDLE, CREATING, HOLDING, BUNDLING }

    /** Cells drawn, as {@link ChunkPos#toLong} of the cell's indices. */
    private final LongSet done = new LongOpenHashSet();
    /** A half-drawn map's cell, by map id, and back. */
    private final Int2LongMap mapCell = new Int2LongOpenHashMap();
    private final Long2IntMap cellMap = new Long2IntOpenHashMap();
    private Path file;

    private Phase phase = Phase.IDLE;
    private long jobCell;
    private int jobMap = -1;
    /** Filled map ids in the inventory before the empty map was used. */
    private final IntSet before = new IntOpenHashSet();
    private int waitTicks;
    private int gap;
    /** Map pixels still blank, and the tick it last changed, to tell a map that stopped growing. */
    private int lastBlank = -1;
    private long lastChange;
    private long ticks;
    private int progress;
    private boolean warnedFull, warnedNoMaps;

    /** The hand holds the item of this handler slot, swapped in with this button; -1 when nothing is swapped. */
    private int swapSlot = -1, swapButton;

    // Worked out once a tick, read by the renderers
    private int minCellX, minCellZ, cells;
    private long nextCell;
    private boolean hasNext;

    private final Color color = new Color();

    public MapPainter() {
        super(OnFocusAddon.CATEGORY, "map-painter", "Draws new maps over an area: in every cell it takes an empty map in hand, holds it until fully drawn and puts it into a bundle. Shows what's drawn and where to fly next.");
    }

    @Override
    public void onActivate() {
        phase = Phase.IDLE;
        jobMap = -1;
        swapSlot = -1;
        warnedFull = warnedNoMaps = false;
        file = null;
        if (mc.player != null) {
            updateArea();
            info("Area %dx%d chunks = (highlight)%d maps(default) around X %d Z %d, %d drawn.", cells * 8, cells * 8, cells * cells, centerX.get(), centerZ.get(), doneInArea());
        }
    }

    @Override
    public void onDeactivate() {
        if (mc.player != null && mc.interactionManager != null) {
            if (!mc.player.currentScreenHandler.getCursorStack().isEmpty() && canClick()) putCursorDown();
            restoreSwap();
        }
        phase = Phase.IDLE;
    }

    @EventHandler
    private void onGameLeft(GameLeftEvent event) {
        phase = Phase.IDLE;
        swapSlot = -1;
        file = null;
    }

    @EventHandler
    private void onTick(TickEvent.Pre event) {
        if (mc.player == null || mc.world == null || mc.interactionManager == null) return;
        ticks++;
        loadFor(storageFile());
        updateArea();
        updateNext();

        if (gap > 0) {
            gap--;
            return;
        }
        // Inventory clicks need the player's own screen; something else moving items waits too
        if (!canClick() || mc.player.isUsingItem()) return;
        if (Modules.get().isActive(MapArtCopier.class) || Modules.get().isActive(MapArtSorter.class)) return;

        long cell = cellAt(mc.player.getX(), mc.player.getZ());
        boolean inArea = inArea(cell);

        switch (phase) {
            case IDLE -> {
                if (!inArea || done.contains(cell)) return;
                int map = cellMap.getOrDefault(cell, -1);
                if (map != -1 && findMap(map) != -1) {
                    startHolding(cell, map);
                    return;
                }
                if (map != -1) forgetMap(map);
                if (centerDistance(cell) <= startDistance.get()) create(cell);
            }
            case CREATING -> {
                int made = newMap();
                if (made != -1) {
                    mapCell.put(made, jobCell);
                    cellMap.put(jobCell, made);
                    save();
                    // The last empty map turns into the new one right in hand; otherwise the empty maps go back
                    if (findMap(made) != handIndex()) restoreSwap();
                    startHolding(jobCell, made);
                    return;
                }
                if (++waitTicks > CREATE_TIMEOUT) {
                    warning("No new map came in - trying again.");
                    restoreSwap();
                    phase = Phase.IDLE;
                }
            }
            case HOLDING -> hold(cell);
            case BUNDLING -> {
                // The map was clicked onto a bundle last time; if it's still on the cursor the bundle was full
                if (!mc.player.currentScreenHandler.getCursorStack().isEmpty()) {
                    putCursorDown();
                    warning("The bundle didn't take the map - it stays in your inventory.");
                }
                phase = Phase.IDLE;
            }
        }
    }

    // ---- making and holding maps ----

    private void create(long cell) {
        if (swapSlot != -1) {
            restoreSwap();
            return;
        }
        int empty = findInventory(s -> s.isOf(Items.MAP));
        if (empty == -1) {
            if (!warnedNoMaps) warning("No empty maps in your inventory.");
            warnedNoMaps = true;
            return;
        }
        warnedNoMaps = false;
        // With more than one empty map the new one goes into a free slot (or on the ground)
        if (mc.player.getInventory().getStack(empty).getCount() > 1 && mc.player.getInventory().getEmptySlot() == -1) {
            if (!warnedFull) warning("Your inventory is full - no room for a new map.");
            warnedFull = true;
            return;
        }
        warnedFull = false;

        before.clear();
        for (int i : inventoryIndices()) {
            int id = mapId(mc.player.getInventory().getStack(i));
            if (id != -1) before.add(id);
        }
        bringToHand(empty);
        mc.interactionManager.interactItem(mc.player, hand());
        jobCell = cell;
        waitTicks = 0;
        phase = Phase.CREATING;
        gap = ACTION_GAP;
    }

    /** The id of a filled map in the inventory that wasn't there before the empty map was used, or -1. */
    private int newMap() {
        for (int i : inventoryIndices()) {
            int id = mapId(mc.player.getInventory().getStack(i));
            if (id != -1 && !before.contains(id)) return id;
        }
        return -1;
    }

    private void startHolding(long cell, int map) {
        jobCell = cell;
        jobMap = map;
        lastBlank = -1;
        lastChange = ticks;
        phase = Phase.HOLDING;
    }

    private void hold(long cell) {
        int index = findMap(jobMap);
        if (index == -1) {
            // Thrown away or put somewhere else: a new one is made
            forgetMap(jobMap);
            swapSlot = -1;
            phase = Phase.IDLE;
            return;
        }
        if (cell != jobCell) {
            // Left the cell half drawn: the map stays assigned to it for when you come back
            restoreSwap();
            phase = Phase.IDLE;
            return;
        }
        if (index != handIndex()) {
            // A swap left from before (the empty maps' one) goes back first
            if (swapSlot != -1) restoreSwap();
            else bringToHand(index);
            return;
        }

        MapState state = mc.world.getMapState(new MapIdComponent(jobMap));
        if (state == null) return;
        int blank = 0;
        for (byte b : state.colors) if (b == 0) blank++;
        progress = (PIXELS - blank) * 100 / PIXELS;
        if (blank != lastBlank) {
            lastBlank = blank;
            lastChange = ticks;
        }

        boolean stuck = giveUpAfter.get() > 0 && ticks - lastChange >= giveUpAfter.get() * 20L
            && centerDistance(cell) <= startDistance.get();
        if (blank > 0 && !stuck) return;

        done.add(cell);
        forgetMap(jobMap);
        save();
        long left = cells * (long) cells - doneInArea();
        if (blank == 0) info("Map drawn (highlight)%d/%d(default), %d left.", doneInArea(), cells * cells, left);
        else warning("Map counted as drawn at %d%% - it stopped changing. %d/%d, %d left.", progress, doneInArea(), cells * cells, left);

        restoreSwap();
        int map = jobMap;
        jobMap = -1;
        phase = Phase.IDLE;
        if (useBundles.get()) putInBundle(map);
    }

    private void putInBundle(int map) {
        int index = findMap(map);
        if (index == -1) return;
        ItemStack stack = mc.player.getInventory().getStack(index);
        int bundle = findInventory(s -> hasRoom(s, stack));
        if (bundle == -1) return;
        click(slotId(index), 0, SlotActionType.PICKUP);
        click(slotId(bundle), 0, SlotActionType.PICKUP);
        phase = Phase.BUNDLING;
        gap = ACTION_GAP;
    }

    private static boolean hasRoom(ItemStack bundle, ItemStack map) {
        if (!(bundle.getItem() instanceof BundleItem)) return false;
        BundleContentsComponent contents = bundle.get(DataComponentTypes.BUNDLE_CONTENTS);
        // The builder only works on copies: nothing is changed, it just says how much would fit
        return contents != null && new BundleContentsComponent.Builder(contents).add(map.copy()) > 0;
    }

    // ---- inventory ----

    private Hand hand() {
        return hand.get() == HandMode.Offhand ? Hand.OFF_HAND : Hand.MAIN_HAND;
    }

    /** Inventory index of the hand the maps are held in: the selected hotbar slot or the offhand (40). */
    private int handIndex() {
        return hand.get() == HandMode.Offhand ? 40 : mc.player.getInventory().selectedSlot;
    }

    /** Swaps the item at inventory index {@code index} into the hand, unless it's there already. */
    private void bringToHand(int index) {
        int target = handIndex();
        if (index == target) return;
        restoreSwap();
        int button = hand.get() == HandMode.Offhand ? 40 : target;
        click(slotId(index), button, SlotActionType.SWAP);
        swapSlot = slotId(index);
        swapButton = button;
        gap = ACTION_GAP;
    }

    /** Puts the hand's item back where it came from and the item that was in hand back in hand. */
    private void restoreSwap() {
        if (swapSlot == -1 || mc.player == null || !canClick()) return;
        click(swapSlot, swapButton, SlotActionType.SWAP);
        swapSlot = -1;
        gap = ACTION_GAP;
    }

    private void putCursorDown() {
        int empty = mc.player.getInventory().getEmptySlot();
        if (empty != -1) click(slotId(empty), 0, SlotActionType.PICKUP);
    }

    private boolean canClick() {
        return mc.player.currentScreenHandler == mc.player.playerScreenHandler;
    }

    private void click(int slot, int button, SlotActionType action) {
        mc.interactionManager.clickSlot(mc.player.playerScreenHandler.syncId, slot, button, action, mc.player);
    }

    /** The player screen's slot id of inventory index {@code index}: hotbar 36-44, main 9-35, offhand 45. */
    private static int slotId(int index) {
        if (index < 9) return index + 36;
        if (index == 40) return 45;
        return index;
    }

    /** Main inventory, hotbar and offhand. */
    private static int[] inventoryIndices() {
        int[] out = new int[37];
        for (int i = 0; i < 36; i++) out[i] = i;
        out[36] = 40;
        return out;
    }

    private int findInventory(java.util.function.Predicate<ItemStack> test) {
        // The hand first, then the hotbar, then the rest: fewer items move around
        int h = handIndex();
        if (test.test(mc.player.getInventory().getStack(h))) return h;
        for (int i : inventoryIndices()) {
            if (test.test(mc.player.getInventory().getStack(i))) return i;
        }
        return -1;
    }

    private int findMap(int id) {
        return findInventory(s -> mapId(s) == id);
    }

    private static int mapId(ItemStack stack) {
        if (!stack.isOf(Items.FILLED_MAP)) return -1;
        MapIdComponent id = stack.get(DataComponentTypes.MAP_ID);
        return id == null ? -1 : id.id();
    }

    private void forgetMap(int map) {
        if (!mapCell.containsKey(map)) return;
        long cell = mapCell.remove(map);
        if (cellMap.containsKey(cell) && cellMap.get(cell) == map) cellMap.remove(cell);
        save();
    }

    // ---- the area ----

    private void updateArea() {
        cells = Math.max(1, sizeChunks.get() / 8);
        minCellX = cellIndex(centerX.get()) - cells / 2;
        minCellZ = cellIndex(centerZ.get()) - cells / 2;
    }

    /** The map cell a block coordinate falls in, as the game picks a map's centre. */
    private static int cellIndex(double coord) {
        return MathHelper.floor((coord + 64) / CELL);
    }

    private static long cellAt(double x, double z) {
        return ChunkPos.toLong(cellIndex(x), cellIndex(z));
    }

    private boolean inArea(long cell) {
        int x = ChunkPos.getPackedX(cell) - minCellX, z = ChunkPos.getPackedZ(cell) - minCellZ;
        return x >= 0 && z >= 0 && x < cells && z < cells;
    }

    private static double centerOf(int index) {
        return index * CELL;
    }

    private double centerDistance(long cell) {
        double dx = mc.player.getX() - centerOf(ChunkPos.getPackedX(cell));
        double dz = mc.player.getZ() - centerOf(ChunkPos.getPackedZ(cell));
        return Math.sqrt(dx * dx + dz * dz);
    }

    private int doneInArea() {
        int count = 0;
        for (long cell : done) if (inArea(cell)) count++;
        return count;
    }

    /** Picks the cell to show as next: not drawn, not the one being drawn now. */
    private void updateNext() {
        hasNext = false;
        long here = cellAt(mc.player.getX(), mc.player.getZ());
        long current = phase == Phase.HOLDING || phase == Phase.CREATING ? jobCell : (inArea(here) && !done.contains(here) ? here : Long.MIN_VALUE);
        double best = Double.MAX_VALUE;
        for (int row = 0; row < cells; row++) {
            for (int i = 0; i < cells; i++) {
                int col = order.get() == Order.Rows && (row & 1) == 1 ? cells - 1 - i : i;
                long cell = ChunkPos.toLong(minCellX + col, minCellZ + row);
                if (cell == current || done.contains(cell)) continue;
                if (order.get() == Order.Rows) {
                    nextCell = cell;
                    hasNext = true;
                    return;
                }
                double d = centerDistance(cell);
                if (d < best) {
                    best = d;
                    nextCell = cell;
                    hasNext = true;
                }
            }
        }
    }

    private void centerOnPlayer() {
        centerHere.set(false);
        if (mc.player == null) return;
        long cell = cellAt(mc.player.getX(), mc.player.getZ());
        centerX.set((int) centerOf(ChunkPos.getPackedX(cell)));
        centerZ.set((int) centerOf(ChunkPos.getPackedZ(cell)));
        info("Area centred on X %d Z %d.", centerX.get(), centerZ.get());
    }

    private void resetArea() {
        resetArea.set(false);
        if (mc.player == null) return;
        updateArea();
        int before = done.size();
        for (LongIterator it = done.iterator(); it.hasNext(); ) {
            if (inArea(it.nextLong())) it.remove();
        }
        save();
        info("Forgot %d drawn cell(s) of the area.", before - done.size());
    }

    // ---- storage: onfocus/map-painter/<server>/<dimension>.txt ----

    private Path storageFile() {
        String where;
        if (mc.getCurrentServerEntry() != null) where = mc.getCurrentServerEntry().address;
        else if (mc.getServer() != null) where = "singleplayer_" + mc.getServer().getSaveProperties().getLevelName();
        else return null;
        String dimension = mc.world.getRegistryKey().getValue().toString();
        return FabricLoader.getInstance().getGameDir().resolve("onfocus").resolve("map-painter")
            .resolve(where.replaceAll("[^A-Za-z0-9._-]", "_"))
            .resolve(dimension.replaceAll("[^A-Za-z0-9._-]", "_") + ".txt");
    }

    private void loadFor(Path path) {
        if (path == null || path.equals(file)) return;
        file = path;
        done.clear();
        mapCell.clear();
        cellMap.clear();
        phase = Phase.IDLE;
        if (!Files.exists(path)) return;
        try {
            for (String line : Files.readAllLines(path, StandardCharsets.UTF_8)) {
                String[] p = line.trim().split(" ");
                try {
                    if (p.length == 3 && p[0].equals("done")) done.add(ChunkPos.toLong(Integer.parseInt(p[1]), Integer.parseInt(p[2])));
                    else if (p.length == 4 && p[0].equals("map")) {
                        int id = Integer.parseInt(p[1]);
                        long cell = ChunkPos.toLong(Integer.parseInt(p[2]), Integer.parseInt(p[3]));
                        mapCell.put(id, cell);
                        cellMap.put(cell, id);
                    }
                } catch (NumberFormatException ignored) {
                    // A broken line is skipped
                }
            }
        } catch (IOException e) {
            OnFocusAddon.LOG.error("[MapPainter] Couldn't read {}", path, e);
        }
    }

    private void save() {
        if (file == null) return;
        List<String> lines = new ArrayList<>();
        for (long cell : done) lines.add("done " + ChunkPos.getPackedX(cell) + " " + ChunkPos.getPackedZ(cell));
        for (Int2LongMap.Entry e : mapCell.int2LongEntrySet()) {
            lines.add("map " + e.getIntKey() + " " + ChunkPos.getPackedX(e.getLongValue()) + " " + ChunkPos.getPackedZ(e.getLongValue()));
        }
        try {
            Files.createDirectories(file.getParent());
            Path temp = file.resolveSibling(file.getFileName() + ".tmp");
            Files.write(temp, lines, StandardCharsets.UTF_8);
            Files.move(temp, file, StandardCopyOption.REPLACE_EXISTING);
        } catch (IOException e) {
            OnFocusAddon.LOG.error("[MapPainter] Couldn't write {}", file, e);
        }
    }

    // ---- drawing ----

    private SettingColor colorOf(long cell) {
        if (hasNext && cell == nextCell) return nextColor.get();
        if (done.contains(cell)) return doneColor.get();
        if (cellMap.containsKey(cell) || (cell == jobCell && phase == Phase.HOLDING)) return startedColor.get();
        return todoColor.get();
    }

    @EventHandler
    private void onRender3D(Render3DEvent event) {
        if (mc.player == null || cells == 0) return;
        double y = mc.player.getY() - gridBelow.get();

        if (worldGrid.get()) {
            int r = gridRadius.get();
            int px = cellIndex(mc.player.getX()), pz = cellIndex(mc.player.getZ());
            for (int cx = px - r; cx <= px + r; cx++) {
                for (int cz = pz - r; cz <= pz + r; cz++) {
                    long cell = ChunkPos.toLong(cx, cz);
                    if (!inArea(cell)) continue;
                    double x1 = centerOf(cx) - 64, z1 = centerOf(cz) - 64;
                    color.set(colorOf(cell));
                    event.renderer.quadHorizontal(x1, y, z1, x1 + CELL, z1 + CELL, color);
                    color.a = Math.min(255, color.a * 3);
                    event.renderer.boxLines(x1, y, z1, x1 + CELL, y, z1 + CELL, color, 0);
                }
            }
        }

        if (beam.get() && hasNext) {
            double x = centerOf(ChunkPos.getPackedX(nextCell)), z = centerOf(ChunkPos.getPackedZ(nextCell));
            color.set(nextColor.get());
            event.renderer.line(x, mc.world.getBottomY(), z, x, mc.world.getBottomY() + mc.world.getHeight() + 64, z, color);
            event.renderer.line(RenderUtils.center.x, RenderUtils.center.y, RenderUtils.center.z, x, mc.player.getY(), z, color);
        }
    }

    @EventHandler
    private void onRender2D(Render2DEvent event) {
        if (!hud.get() || mc.player == null || mc.options.hudHidden || cells == 0) return;
        DrawContext context = event.drawContext;

        int px = Math.max(1, hudSize.get() / cells);
        int size = px * cells;
        int textHeight = 2 * (mc.textRenderer.fontHeight + 1) + 3;
        boolean right = hudCorner.get() == Corner.TopRight || hudCorner.get() == Corner.BottomRight;
        boolean top = hudCorner.get() == Corner.TopLeft || hudCorner.get() == Corner.TopRight;
        int x0 = right ? event.screenWidth - size - 4 : 4;
        int y0 = top ? hudOffsetY.get() : event.screenHeight - size - textHeight - hudOffsetY.get();

        context.fill(x0 - 1, y0 - 1, x0 + size + 1, y0 + size + 1, 0xA0000000);
        boolean blink = (ticks / 10) % 2 == 0;
        for (int row = 0; row < cells; row++) {
            for (int col = 0; col < cells; col++) {
                long cell = ChunkPos.toLong(minCellX + col, minCellZ + row);
                SettingColor c = colorOf(cell);
                int alpha = hasNext && cell == nextCell ? (blink ? 255 : 120) : Math.min(255, c.a * 3);
                int argb = alpha << 24 | c.r << 16 | c.g << 8 | c.b;
                int x = x0 + col * px, yy = y0 + row * px;
                // A pixel's gap between cells keeps them apart when they're big enough
                int pad = px >= 4 ? 1 : 0;
                context.fill(x, yy, x + px - pad, yy + px - pad, argb);
            }
        }

        // You, where you are in the area (clamped to its edge when outside)
        double fx = (mc.player.getX() + 64) / CELL - minCellX, fz = (mc.player.getZ() + 64) / CELL - minCellZ;
        int dx = x0 + (int) MathHelper.clamp(fx * px, 0, size - 1), dz = y0 + (int) MathHelper.clamp(fz * px, 0, size - 1);
        context.fill(dx - 1, dz - 1, dx + 2, dz + 2, 0xFFFFFFFF);

        int ty = y0 + size + 3;
        String status = "Drawn " + doneInArea() + "/" + cells * cells;
        if (phase == Phase.HOLDING) status += " | map " + progress + "%";
        else if (phase == Phase.CREATING) status += " | making a map";
        context.drawTextWithShadow(mc.textRenderer, status, textX(status, x0, size, right), ty, 0xFFFFFF);
        String next;
        if (!hasNext) next = phase == Phase.HOLDING ? "Last map" : "All drawn";
        else {
            int nx = (int) centerOf(ChunkPos.getPackedX(nextCell)), nz = (int) centerOf(ChunkPos.getPackedZ(nextCell));
            next = "Next X " + nx + " Z " + nz + " | " + Math.round(centerDistance(nextCell)) + " m";
        }
        context.drawTextWithShadow(mc.textRenderer, next, textX(next, x0, size, right), ty + mc.textRenderer.fontHeight + 1, 0x60C8FF);
    }

    /** Text under the area lines up with its left edge, or with its right one in a right corner. */
    private int textX(String text, int x0, int size, boolean right) {
        return right ? x0 + size - mc.textRenderer.getWidth(text) : x0;
    }

    @Override
    public String getInfoString() {
        if (cells == 0) return null;
        return doneInArea() + "/" + cells * cells;
    }
}
