package dev.onfocus.addon.modules;

import dev.onfocus.addon.OnFocusAddon;
import dev.onfocus.addon.maps.MapMatcher;
import it.unimi.dsi.fastutil.ints.Int2LongMap;
import it.unimi.dsi.fastutil.ints.Int2LongOpenHashMap;
import it.unimi.dsi.fastutil.ints.Int2ObjectMap;
import it.unimi.dsi.fastutil.ints.Int2ObjectOpenHashMap;
import it.unimi.dsi.fastutil.ints.IntArrayList;
import it.unimi.dsi.fastutil.ints.IntList;
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
import meteordevelopment.meteorclient.settings.KeybindSetting;
import meteordevelopment.meteorclient.settings.Setting;
import meteordevelopment.meteorclient.settings.SettingGroup;
import meteordevelopment.meteorclient.systems.modules.Module;
import meteordevelopment.meteorclient.systems.modules.Modules;
import meteordevelopment.meteorclient.utils.misc.Keybind;
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
import net.minecraft.item.map.MapDecoration;
import net.minecraft.item.map.MapDecorationTypes;
import net.minecraft.item.map.MapState;
import net.minecraft.network.packet.c2s.play.BundleItemSelectedC2SPacket;
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
 * The area is picked by its corners: pos 1 where you are, then fly to the opposite corner and set
 * pos 2 (keys, the settings' switches or {@code .map-painter pos1|pos2}); it's widened to the whole
 * map cells that cover both. Between the two the area follows you and no maps are made.
 * <p>
 * Flying is up to you: the HUD shows the area's cells (drawn, started, left) with you and the next
 * cell to fly to, and in the world the cells around you are coloured on a plane under you, with a
 * beam and a tracer to the next one. Drawn cells are kept on disk per server and dimension
 * (onfocus/map-painter), along with which map id belongs to which started cell, so a map left half
 * drawn is picked up again when you come back.
 * <p>
 * The client is never told a map's centre, so a new map's cell is the one you stood in when it was
 * made: a map is only made within "start-distance" of a cell's centre, far from its edges. Every
 * map's cell is kept, so with mode Update the maps you carry (loose or in bundles) are taken out
 * one by one over their place and held there again, which brings in what was built since. A map
 * whose cell isn't known (made before cells were kept, or elsewhere) is recognised by the player
 * marker on it when it's loose and you're over it, or by {@link MapMatcher} comparing its picture
 * with the loaded world around you; bundled maps the client has no picture of are taken out a few
 * at a time for the server to send it.
 */
public class MapPainter extends Module {
    public enum Mode { Draw, Update }
    public enum HandMode { MainHand, Offhand }
    public enum Order { Rows, Nearest }
    public enum Corner { TopLeft, TopRight, BottomLeft, BottomRight }

    private final SettingGroup sgArea = settings.createGroup("Area");
    private final SettingGroup sgMaps = settings.createGroup("Maps");
    private final SettingGroup sgHud = settings.createGroup("HUD");
    private final SettingGroup sgWorld = settings.createGroup("World");

    private final Setting<Mode> mode = sgArea.add(new EnumSetting.Builder<Mode>()
        .name("mode")
        .description("Draw makes new maps over the area between the corners. Update takes the maps you carry (loose or in bundles), already drawn, and holds each over its place again so new buildings show up.")
        .defaultValue(Mode.Draw)
        .build()
    );

    private final Setting<Keybind> pos1Key = sgArea.add(new KeybindSetting.Builder()
        .name("pos1-key")
        .description("Key that sets the area's first corner where you are. Until the second one is set no maps are made, and the area follows you.")
        .defaultValue(Keybind.none())
        .action(this::setPos1)
        .build()
    );

    private final Setting<Keybind> pos2Key = sgArea.add(new KeybindSetting.Builder()
        .name("pos2-key")
        .description("Key that sets the area's second corner where you are.")
        .defaultValue(Keybind.none())
        .action(this::setPos2)
        .build()
    );

    private final Setting<Boolean> pos1Here = sgArea.add(new BoolSetting.Builder()
        .name("set-pos1")
        .description("Turn on to set the first corner where you are (the same as pos1-key or .map-painter pos1).")
        .defaultValue(false)
        .onChanged(v -> { if (v) setPos1(); })
        .build()
    );

    private final Setting<Boolean> pos2Here = sgArea.add(new BoolSetting.Builder()
        .name("set-pos2")
        .description("Turn on to set the second corner where you are (the same as pos2-key or .map-painter pos2).")
        .defaultValue(false)
        .onChanged(v -> { if (v) setPos2(); })
        .build()
    );

    private final Setting<Integer> pos1X = sgArea.add(corner("pos1-x", "X of the first corner, in blocks.", -1024));
    private final Setting<Integer> pos1Z = sgArea.add(corner("pos1-z", "Z of the first corner, in blocks.", -1024));
    private final Setting<Integer> pos2X = sgArea.add(corner("pos2-x", "X of the second corner, in blocks.", 1023));
    private final Setting<Integer> pos2Z = sgArea.add(corner("pos2-z", "Z of the second corner, in blocks.", 1023));

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

    private final Setting<Integer> updateSeconds = sgMaps.add(new IntSetting.Builder()
        .name("update-seconds")
        .description("Update: how long a map is held near its place's centre (and then unchanged for a second) before it counts as updated.")
        .defaultValue(3)
        .range(1, 30)
        .sliderRange(1, 10)
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

    private static IntSetting corner(String name, String description, int value) {
        return new IntSetting.Builder()
            .name(name)
            .description(description + " The area is widened to whole maps (8x8 chunks) that cover both corners.")
            .defaultValue(value)
            .range(-30_000_000, 30_000_000)
            .noSlider()
            .build();
    }

    /** Side of a scale-0 map in blocks; cells are aligned like the game aligns maps, centred on multiples of 128. */
    private static final int CELL = 128;
    private static final int PIXELS = 128 * 128;
    /** Ticks to wait for the server to put a just-made map into the inventory. */
    private static final int CREATE_TIMEOUT = 60;
    /** Ticks between inventory actions, so each is seen by the server before the next. */
    private static final int ACTION_GAP = 3;
    /** Ticks a map taken out of a bundle stays loose for the server to send its picture. */
    private static final int FETCH_TICKS = 15;
    /** At most this many maps are taken out of bundles at once to fetch their pictures. */
    private static final int FETCH_BATCH = 8;
    /** A map only counts as recognised by its player marker this far (in marker units, 2 per block) from its edge. */
    private static final int MARKER_MARGIN = 96;
    /** A picture is taken to show a cell when this share of it matches and no other cell comes close. */
    private static final double MATCH_SCORE = 0.85, MATCH_MARGIN = 0.15;
    /** Cells a picture must have been compared with before it's matched to the best one. */
    private static final int MATCH_CELLS = 3;

    private enum Phase { IDLE, CREATING, HOLDING, BUNDLING, FETCHING }

    /** Cells drawn, as {@link ChunkPos#toLong} of the cell's indices. */
    private final LongSet done = new LongOpenHashSet();
    /** A half-drawn map's cell, by map id, and back. */
    private final Int2LongMap mapCell = new Int2LongOpenHashMap();
    private final Long2IntMap cellMap = new Long2IntOpenHashMap();
    /** Every map whose cell is known, made here or recognised, by map id. Kept for good, for Update. */
    private final Int2LongMap known = new Int2LongOpenHashMap();
    private Path file;

    // Update: the cells of the known maps you carry (loose or in bundles), and those updated this round
    private final Long2IntMap carried = new Long2IntOpenHashMap();
    private final LongSet updated = new LongOpenHashSet();
    /** Carried maps whose cell isn't known yet. */
    private final IntSet unknown = new IntOpenHashSet();
    /** Maps already taken out of a bundle once for their picture: not again. */
    private final IntSet fetched = new IntOpenHashSet();
    /** Taken out for their picture now, to go back into bundles. */
    private final IntList fetching = new IntArrayList();
    /** For each unknown map with a picture: the best and second best match among the cells compared. */
    private final Int2ObjectMap<Match> matches = new Int2ObjectOpenHashMap<>();
    /** Which cell around you is compared next. */
    private int matchTurn;

    private static final class Match {
        long bestCell;
        double best = -1, second = -1;
        final LongSet cells = new LongOpenHashSet();
    }

    private Phase phase = Phase.IDLE;
    private long jobCell;
    private int jobMap = -1;
    /** Filled map ids in the inventory before the empty map was used. */
    private final IntSet before = new IntOpenHashSet();
    private int waitTicks;
    private int gap;
    /** Map pixels still blank (or the picture's hash in Update), and the tick it last changed. */
    private int lastBlank = -1;
    private long lastChange;
    /** Update: ticks the map has been held near its cell's centre. */
    private int heldNear;
    private long ticks;
    private int progress;
    private boolean warnedFull, warnedNoMaps, warnedNothing;

    /** The hand holds the item of this handler slot, swapped in with this button; -1 when nothing is swapped. */
    private int swapSlot = -1, swapButton;

    // Worked out once a tick, read by the renderers
    private int minCellX, minCellZ, cellsX, cellsZ;
    /** The first corner is set and the second not yet: the area runs from it to you, and no maps are made. */
    private boolean selecting;
    private long nextCell;
    private boolean hasNext;

    private final Color color = new Color();

    public MapPainter() {
        super(OnFocusAddon.CATEGORY, "map-painter", "Draws new maps over an area (or updates the maps you carry): in every cell it holds the map until drawn and puts it into a bundle. Shows what's done and where to fly next.");
    }

    private boolean updating() {
        return mode.get() == Mode.Update;
    }

    @Override
    public void onActivate() {
        phase = Phase.IDLE;
        jobMap = -1;
        swapSlot = -1;
        warnedFull = warnedNoMaps = warnedNothing = false;
        file = null;
        if (mc.player == null || mc.world == null) return;
        loadFor(storageFile());
        if (updating()) {
            scanCarried();
            updateArea();
            info("Updating (highlight)%d(default) known map(s) you carry, %d already done this round%s.", carried.size(), finishedCount(),
                unknown.isEmpty() ? "" : ", " + unknown.size() + " more not recognised yet");
        } else {
            updateArea();
            info("%s. Set the corners with pos1-key / pos2-key or .map-painter pos1 / pos2.", describeArea());
            hintDrawn();
        }
    }

    @Override
    public void onDeactivate() {
        if (mc.player != null && mc.interactionManager != null) {
            if (!mc.player.currentScreenHandler.getCursorStack().isEmpty() && canClick()) putCursorDown();
            restoreSwap();
            // Maps out for their pictures go back where they were
            if (canClick()) for (int map : fetching) putInBundle(map);
        }
        fetching.clear();
        phase = Phase.IDLE;
    }

    @EventHandler
    private void onGameLeft(GameLeftEvent event) {
        phase = Phase.IDLE;
        swapSlot = -1;
        file = null;
        fetching.clear();
        fetched.clear();
        matches.clear();
    }

    @EventHandler
    private void onTick(TickEvent.Pre event) {
        if (mc.player == null || mc.world == null || mc.interactionManager == null) return;
        ticks++;
        loadFor(storageFile());
        if (updating()) {
            scanCarried();
            if (ticks % 5 == 0) recogniseByMarker();
            matchNextCell();
        }
        updateArea();
        updateNext();

        if (gap > 0) {
            gap--;
            return;
        }
        // Every map is done and the last one put away: nothing left to do
        if (!selecting && phase == Phase.IDLE && total() > 0 && finishedCount() == total() && (!updating() || unknown.isEmpty())) {
            if (updating()) {
                info("All (highlight)%d map(s)(default) you carry are updated - turning off.", total());
                updated.clear();
            } else info("All (highlight)%d maps(default) of the area are drawn - turning off.", total());
            toggle();
            return;
        }
        if (updating() && total() == 0 && unknown.isEmpty() && phase == Phase.IDLE) {
            if (!warnedNothing) warning("No maps to update: carry maps drawn by Map Painter (loose or in bundles).");
            warnedNothing = true;
            return;
        }
        warnedNothing = false;
        // Inventory clicks need the player's own screen; something else moving items waits too
        if (!canClick() || mc.player.isUsingItem()) return;
        if (Modules.get().isActive(MapArtCopier.class) || Modules.get().isActive(MapArtSorter.class)) return;

        long cell = cellAt(mc.player.getX(), mc.player.getZ());

        switch (phase) {
            case IDLE -> {
                if (updating()) idleUpdate(cell);
                else idleDraw(cell);
            }
            case CREATING -> {
                int made = newMap();
                if (made != -1) {
                    mapCell.put(made, jobCell);
                    cellMap.put(jobCell, made);
                    known.put(made, jobCell);
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
            case FETCHING -> fetch();
        }
    }

    private void idleDraw(long cell) {
        if (selecting || !inArea(cell) || done.contains(cell)) return;
        int map = cellMap.getOrDefault(cell, -1);
        if (map != -1 && findMap(map) != -1) {
            startHolding(cell, map);
            return;
        }
        if (map != -1) forgetMap(map);
        if (centerDistance(cell) <= startDistance.get()) create(cell);
    }

    private void idleUpdate(long cell) {
        if (carried.containsKey(cell) && !updated.contains(cell)) {
            int map = carried.get(cell);
            if (findMap(map) != -1) startHolding(cell, map);
            else takeOutOfBundle(map);
            return;
        }
        startFetching();
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
        heldNear = 0;
        phase = Phase.HOLDING;
    }

    private void hold(long cell) {
        int index = findMap(jobMap);
        if (index == -1) {
            // Thrown away or put somewhere else: Draw makes a new one, Update takes it from the bundle again
            if (!updating()) forgetMap(jobMap);
            swapSlot = -1;
            phase = Phase.IDLE;
            return;
        }
        if (cell != jobCell) {
            // Left the cell before it was done: the map stays assigned to it for when you come back
            restoreSwap();
            phase = Phase.IDLE;
            if (updating() && useBundles.get()) putInBundle(jobMap);
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
        if (updating()) {
            holdUpdate(cell, state);
            return;
        }

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
        long left = total() - finishedCount();
        if (blank == 0) info("Map drawn (highlight)%d/%d(default), %d left.", finishedCount(), total(), left);
        else warning("Map counted as drawn at %d%% - it stopped changing. %d/%d, %d left.", progress, finishedCount(), total(), left);
        finishJob();
    }

    /**
     * Update: the map counts as updated once it's been held near the cell's centre for update-seconds
     * and hasn't changed for the last second of that - a held map is gone over in under a second.
     */
    private void holdUpdate(long cell, MapState state) {
        int hash = java.util.Arrays.hashCode(state.colors);
        if (hash != lastBlank) {
            lastBlank = hash;
            lastChange = ticks;
        }
        if (centerDistance(cell) <= startDistance.get()) heldNear++;
        progress = Math.min(100, heldNear * 100 / (updateSeconds.get() * 20));
        if (heldNear < updateSeconds.get() * 20 || ticks - lastChange < 20) return;

        updated.add(cell);
        info("Map updated (highlight)%d/%d(default), %d left.", finishedCount(), total(), total() - finishedCount());
        finishJob();
    }

    /** The job's map is done: the hand gets its item back and the map goes into a bundle. */
    private void finishJob() {
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
        if (phase == Phase.IDLE) phase = Phase.BUNDLING;
        gap = ACTION_GAP;
    }

    private static boolean hasRoom(ItemStack bundle, ItemStack map) {
        if (!(bundle.getItem() instanceof BundleItem)) return false;
        BundleContentsComponent contents = bundle.get(DataComponentTypes.BUNDLE_CONTENTS);
        // The builder only works on copies: nothing is changed, it just says how much would fit
        return contents != null && new BundleContentsComponent.Builder(contents).add(map.copy()) > 0;
    }

    /**
     * Takes a map out of the bundle it's in into a free slot: the bundle's selected stack is set to it
     * (here and on the server, as scrolling over a bundle does) and a right click takes that one out.
     */
    private boolean takeOutOfBundle(int map) {
        int empty = mc.player.getInventory().getEmptySlot();
        if (empty == -1) {
            if (!warnedFull) warning("Your inventory is full - no room to take a map out of its bundle.");
            warnedFull = true;
            return false;
        }
        warnedFull = false;
        for (int i : inventoryIndices()) {
            ItemStack bundle = mc.player.getInventory().getStack(i);
            BundleContentsComponent contents = bundle.get(DataComponentTypes.BUNDLE_CONTENTS);
            if (contents == null) continue;
            for (int k = 0; k < contents.size(); k++) {
                if (mapId(contents.get(k)) != map) continue;
                int slot = slotId(i);
                BundleItem.setSelectedStackIndex(bundle, k);
                mc.getNetworkHandler().sendPacket(new BundleItemSelectedC2SPacket(slot, k));
                click(slot, 1, SlotActionType.PICKUP);
                click(slotId(empty), 0, SlotActionType.PICKUP);
                gap = ACTION_GAP;
                return true;
            }
        }
        return false;
    }

    // ---- Update: which maps you carry and where they belong ----

    /** Rebuilds the carried cells (known maps, loose or in bundles) and the carried maps not known yet. */
    private void scanCarried() {
        carried.clear();
        unknown.clear();
        for (int i : inventoryIndices()) {
            ItemStack stack = mc.player.getInventory().getStack(i);
            carry(mapId(stack));
            BundleContentsComponent contents = stack.get(DataComponentTypes.BUNDLE_CONTENTS);
            if (contents == null) continue;
            for (int k = 0; k < contents.size(); k++) carry(mapId(contents.get(k)));
        }
    }

    private void carry(int map) {
        if (map == -1) return;
        if (known.containsKey(map)) carried.put(known.get(map), map);
        else unknown.add(map);
    }

    private void learn(int map, long cell, String how) {
        known.put(map, cell);
        matches.remove(map);
        save();
        info("Recognised map #%d (%s): X %d Z %d.", map, how, (int) centerOf(ChunkPos.getPackedX(cell)), (int) centerOf(ChunkPos.getPackedZ(cell)));
    }

    /**
     * A loose map shows you where you are on it with a player marker (two marker units a block from
     * its centre), so a scale-0 map with exactly one such marker well inside it has its centre on the
     * multiple of 128 nearest to you minus the marker's offset.
     */
    private void recogniseByMarker() {
        for (int i : inventoryIndices()) {
            int map = mapId(mc.player.getInventory().getStack(i));
            if (map == -1 || !unknown.contains(map)) continue;
            MapState state = mc.world.getMapState(new MapIdComponent(map));
            if (state == null || state.scale != 0 || state.dimension != mc.world.getRegistryKey()) continue;
            MapDecoration marker = null;
            int markers = 0;
            for (MapDecoration decoration : state.getDecorations()) {
                if (decoration.type().value() != MapDecorationTypes.PLAYER.value()) continue;
                marker = decoration;
                markers++;
            }
            if (markers != 1 || Math.abs(marker.x()) > MARKER_MARGIN || Math.abs(marker.z()) > MARKER_MARGIN) continue;
            int cx = (int) Math.round((mc.player.getX() - marker.x() / 2.0) / CELL);
            int cz = (int) Math.round((mc.player.getZ() - marker.z() / 2.0) / CELL);
            learn(map, ChunkPos.toLong(cx, cz), "by its marker");
            unknown.remove(map);
        }
    }

    /**
     * Compares the pictures of the unknown maps with one loaded cell around you (a cell a tick, taking
     * turns), and matches a map to its best cell once that's clearly better than every other compared.
     */
    private void matchNextCell() {
        if (unknown.isEmpty() || mc.world.getDimension().hasCeiling()) return;
        int turn = matchTurn++ % 9;
        int cx = cellIndex(mc.player.getX()) + turn % 3 - 1, cz = cellIndex(mc.player.getZ()) + turn / 3 - 1;
        long cell = ChunkPos.toLong(cx, cz);
        // A cell whose map you carry is taken; its picture would only confuse the rest
        if (carried.containsKey(cell)) return;

        byte[] sample = null;
        for (int map : unknown.toIntArray()) {
            MapState state = mc.world.getMapState(new MapIdComponent(map));
            if (state == null || state.scale != 0 || state.dimension != mc.world.getRegistryKey()) continue;
            Match match = matches.computeIfAbsent(map, k -> new Match());
            if (match.cells.contains(cell)) continue;
            if (sample == null) {
                sample = MapMatcher.sample(mc.world, cx, cz);
                // Not loaded enough, or all sea: no telling maps apart here
                if (sample == null || !MapMatcher.distinctive(sample)) return;
            }
            double score = MapMatcher.score(sample, state.colors);
            if (score < 0) continue;
            match.cells.add(cell);
            if (score > match.best) {
                match.second = match.best;
                match.best = score;
                match.bestCell = cell;
            } else if (score > match.second) match.second = score;

            if (match.best >= MATCH_SCORE && match.best - match.second >= MATCH_MARGIN && match.cells.size() >= MATCH_CELLS
                && !carried.containsKey(match.bestCell)) {
                learn(map, match.bestCell, "by its picture, %d%% alike".formatted(Math.round(match.best * 100)));
                unknown.remove(map);
                carried.put(match.bestCell, map);
            }
        }
    }

    /**
     * Maps in bundles that the client has no picture of are taken out a few at a time: a loose map's
     * picture comes from the server within a tick or two. They go back once it's in, and are
     * compared with the world from then on.
     */
    private void startFetching() {
        if (unknown.isEmpty()) return;
        int free = 0;
        for (int i = 0; i < 36; i++) if (mc.player.getInventory().getStack(i).isEmpty()) free++;
        // One slot stays free for the next map to update
        int room = Math.min(FETCH_BATCH, free - 1);
        if (room <= 0) return;
        fetching.clear();
        for (int map : unknown.toIntArray()) {
            if (fetching.size() >= room) break;
            if (fetched.contains(map) || findMap(map) != -1) continue;
            if (mc.world.getMapState(new MapIdComponent(map)) != null) continue;
            fetching.add(map);
        }
        if (fetching.isEmpty()) return;
        waitTicks = 0;
        phase = Phase.FETCHING;
    }

    private void fetch() {
        // First out of the bundles, one a tick...
        for (int map : fetching) {
            if (fetched.contains(map)) continue;
            fetched.add(map);
            if (takeOutOfBundle(map)) return;
        }
        // ...then wait for the pictures...
        if (++waitTicks < FETCH_TICKS) return;
        // ...and back in, one a tick
        for (int k = 0; k < fetching.size(); k++) {
            int map = fetching.getInt(k);
            if (findMap(map) == -1) continue;
            putInBundle(map);
            if (findMap(map) == -1) return;
            // No bundle has room: it stays loose
            fetching.removeInt(k--);
        }
        fetching.clear();
        phase = Phase.IDLE;
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

    /** Draw: the area between the corners. Update: the cells of the maps you carry. */
    private void updateArea() {
        if (updating()) {
            if (carried.isEmpty()) {
                cellsX = cellsZ = 0;
                return;
            }
            int x1 = Integer.MAX_VALUE, z1 = Integer.MAX_VALUE, x2 = Integer.MIN_VALUE, z2 = Integer.MIN_VALUE;
            for (long cell : carried.keySet()) {
                x1 = Math.min(x1, ChunkPos.getPackedX(cell));
                z1 = Math.min(z1, ChunkPos.getPackedZ(cell));
                x2 = Math.max(x2, ChunkPos.getPackedX(cell));
                z2 = Math.max(z2, ChunkPos.getPackedZ(cell));
            }
            minCellX = x1;
            minCellZ = z1;
            cellsX = x2 - x1 + 1;
            cellsZ = z2 - z1 + 1;
            return;
        }
        double x2 = pos2X.get(), z2 = pos2Z.get();
        if (selecting && mc.player != null) {
            x2 = mc.player.getX();
            z2 = mc.player.getZ();
        }
        int ax = cellIndex(pos1X.get()), az = cellIndex(pos1Z.get()), bx = cellIndex(x2), bz = cellIndex(z2);
        minCellX = Math.min(ax, bx);
        minCellZ = Math.min(az, bz);
        cellsX = Math.abs(ax - bx) + 1;
        cellsZ = Math.abs(az - bz) + 1;
    }

    /** Cells to do: the whole area in Draw, the carried maps' cells in Update. */
    private boolean isTarget(long cell) {
        return updating() ? carried.containsKey(cell) : inArea(cell);
    }

    private boolean isFinished(long cell) {
        return updating() ? updated.contains(cell) : done.contains(cell);
    }

    private int total() {
        return updating() ? carried.size() : cellsX * cellsZ;
    }

    private int finishedCount() {
        int count = 0;
        if (updating()) {
            for (long cell : updated) if (carried.containsKey(cell)) count++;
        } else {
            for (long cell : done) if (inArea(cell)) count++;
        }
        return count;
    }

    /** "Area 16x16 maps (128x128 chunks, 256 maps) from X -1088 Z -1088 to X 1087 Z 1087". */
    public String describeArea() {
        return "Area %dx%d maps (%dx%d chunks, (highlight)%d maps(default)) from X %d Z %d to X %d Z %d".formatted(
            cellsX, cellsZ, cellsX * 8, cellsZ * 8, cellsX * cellsZ,
            (int) centerOf(minCellX) - 64, (int) centerOf(minCellZ) - 64,
            (int) centerOf(minCellX + cellsX) - 65, (int) centerOf(minCellZ + cellsZ) - 65);
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
        return x >= 0 && z >= 0 && x < cellsX && z < cellsZ;
    }

    private static double centerOf(int index) {
        return index * CELL;
    }

    private double centerDistance(long cell) {
        double dx = mc.player.getX() - centerOf(ChunkPos.getPackedX(cell));
        double dz = mc.player.getZ() - centerOf(ChunkPos.getPackedZ(cell));
        return Math.sqrt(dx * dx + dz * dz);
    }

    /** Picks the cell to show as next: one to do, not the one being done now. */
    private void updateNext() {
        hasNext = false;
        if (selecting) return;
        long here = cellAt(mc.player.getX(), mc.player.getZ());
        long current = phase == Phase.HOLDING || phase == Phase.CREATING ? jobCell : (isTarget(here) && !isFinished(here) ? here : Long.MIN_VALUE);
        double best = Double.MAX_VALUE;
        for (int row = 0; row < cellsZ; row++) {
            for (int i = 0; i < cellsX; i++) {
                int col = order.get() == Order.Rows && (row & 1) == 1 ? cellsX - 1 - i : i;
                long cell = ChunkPos.toLong(minCellX + col, minCellZ + row);
                if (cell == current || !isTarget(cell) || isFinished(cell)) continue;
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

    /** Sets the first corner where you are; the area then follows you until the second one is set. */
    public void setPos1() {
        pos1Here.set(false);
        if (mc.player == null) return;
        pos1X.set(mc.player.getBlockX());
        pos1Z.set(mc.player.getBlockZ());
        selecting = true;
        if (phase != Phase.IDLE && phase != Phase.FETCHING) {
            restoreSwap();
            phase = Phase.IDLE;
        }
        if (updating()) warning("Corners pick the area to draw; set mode to Draw to use it.");
        info("Pos 1 set at X %d Z %d - fly to the opposite corner and set pos 2.", pos1X.get(), pos1Z.get());
    }

    /** Sets the second corner where you are and ends the selection. */
    public void setPos2() {
        pos2Here.set(false);
        if (mc.player == null) return;
        pos2X.set(mc.player.getBlockX());
        pos2Z.set(mc.player.getBlockZ());
        selecting = false;
        updateArea();
        info("Pos 2 set at X %d Z %d. %s.", pos2X.get(), pos2Z.get(), describeArea());
        if (mc.world != null) loadFor(storageFile());
        hintDrawn();
    }

    /**
     * Draw: forgets the area's drawn cells and half-drawn maps, so all of it is drawn again.
     * Update: starts the round over, so every carried map is updated again.
     */
    public void resetArea() {
        resetArea.set(false);
        if (mc.player == null || mc.world == null) return;
        if (updating()) {
            int count = updated.size();
            updated.clear();
            info("Started the update over - %d map(s) are updated again.", count);
            return;
        }
        // With the module off nothing's been read yet: read it first, or the next read would undo the reset
        loadFor(storageFile());
        updateArea();
        int before = done.size();
        for (LongIterator it = done.iterator(); it.hasNext(); ) {
            if (inArea(it.nextLong())) it.remove();
        }
        for (int map : mapCell.keySet().toIntArray()) {
            if (inArea(mapCell.get(map))) forgetMap(map);
        }
        if (phase != Phase.IDLE) {
            restoreSwap();
            phase = Phase.IDLE;
        }
        save();
        info("Forgot %d drawn map(s) of the area - it is drawn again from scratch.", before - done.size());
    }

    /** After the area changes: says if some of it is drawn already and how to draw it again. */
    private void hintDrawn() {
        int drawn = finishedCount();
        if (drawn == 0) return;
        if (drawn == total()) info("This area is already drawn. To draw it again: .map-painter reset (or the reset-area switch), then turn the module on. To refresh the maps you have, set mode to Update.");
        else info("%d of %d maps here are already drawn and are skipped. To start over: .map-painter reset.", drawn, total());
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
        known.clear();
        updated.clear();
        matches.clear();
        phase = Phase.IDLE;
        if (!Files.exists(path)) return;
        try {
            for (String line : Files.readAllLines(path, StandardCharsets.UTF_8)) {
                String[] p = line.trim().split(" ");
                try {
                    if (p.length == 3 && p[0].equals("done")) done.add(ChunkPos.toLong(Integer.parseInt(p[1]), Integer.parseInt(p[2])));
                    else if (p.length == 4 && (p[0].equals("map") || p[0].equals("known"))) {
                        int id = Integer.parseInt(p[1]);
                        long cell = ChunkPos.toLong(Integer.parseInt(p[2]), Integer.parseInt(p[3]));
                        known.put(id, cell);
                        if (p[0].equals("map")) {
                            mapCell.put(id, cell);
                            cellMap.put(cell, id);
                        }
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
        for (Int2LongMap.Entry e : known.int2LongEntrySet()) {
            String kind = mapCell.containsKey(e.getIntKey()) ? "map " : "known ";
            lines.add(kind + e.getIntKey() + " " + ChunkPos.getPackedX(e.getLongValue()) + " " + ChunkPos.getPackedZ(e.getLongValue()));
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

    /** A cell's colour, or null for a cell in Update's area whose map you don't carry. */
    private SettingColor colorOf(long cell) {
        if (hasNext && cell == nextCell) return nextColor.get();
        if (!isTarget(cell)) return null;
        if (isFinished(cell)) return doneColor.get();
        if (cell == jobCell && phase == Phase.HOLDING) return startedColor.get();
        if (!updating() && cellMap.containsKey(cell)) return startedColor.get();
        return todoColor.get();
    }

    @EventHandler
    private void onRender3D(Render3DEvent event) {
        if (mc.player == null || mc.world == null || cellsX * cellsZ == 0) return;
        double y = mc.player.getY() - gridBelow.get();

        if (worldGrid.get()) {
            int r = gridRadius.get();
            int px = cellIndex(mc.player.getX()), pz = cellIndex(mc.player.getZ());
            for (int cx = px - r; cx <= px + r; cx++) {
                for (int cz = pz - r; cz <= pz + r; cz++) {
                    long cell = ChunkPos.toLong(cx, cz);
                    if (!inArea(cell)) continue;
                    SettingColor c = colorOf(cell);
                    if (c == null) continue;
                    double x1 = centerOf(cx) - 64, z1 = centerOf(cz) - 64;
                    color.set(c);
                    event.renderer.quadHorizontal(x1, y, z1, x1 + CELL, z1 + CELL, color);
                    color.a = Math.min(255, color.a * 3);
                    event.renderer.boxLines(x1, y, z1, x1 + CELL, y, z1 + CELL, color, 0);
                }
            }
        }

        // The area's edge, and while selecting a beam at the first corner
        color.set(selecting ? nextColor.get() : doneColor.get());
        color.a = 255;
        double ax1 = centerOf(minCellX) - 64, az1 = centerOf(minCellZ) - 64;
        double ax2 = ax1 + cellsX * CELL, az2 = az1 + cellsZ * CELL;
        event.renderer.boxLines(ax1, y, az1, ax2, y + (selecting ? 2 : 0), az2, color, 0);
        if (selecting) {
            double bx = pos1X.get() + 0.5, bz = pos1Z.get() + 0.5;
            event.renderer.line(bx, mc.world.getBottomY(), bz, bx, mc.world.getBottomY() + mc.world.getHeight() + 64, bz, color);
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
        if (!hud.get() || mc.player == null || mc.options.hudHidden) return;
        DrawContext context = event.drawContext;
        boolean empty = cellsX * cellsZ == 0;

        int px = empty ? 1 : Math.max(1, hudSize.get() / Math.max(cellsX, cellsZ));
        int size = empty ? 0 : px * cellsX, height = empty ? 0 : px * cellsZ;
        int textHeight = 2 * (mc.textRenderer.fontHeight + 1) + 3;
        boolean right = hudCorner.get() == Corner.TopRight || hudCorner.get() == Corner.BottomRight;
        boolean top = hudCorner.get() == Corner.TopLeft || hudCorner.get() == Corner.TopRight;
        int x0 = right ? event.screenWidth - size - 4 : 4;
        int y0 = top ? hudOffsetY.get() : event.screenHeight - height - textHeight - hudOffsetY.get();

        if (!empty) {
            context.fill(x0 - 1, y0 - 1, x0 + size + 1, y0 + height + 1, selecting ? 0xA0204050 : 0xA0000000);
            boolean blink = (ticks / 10) % 2 == 0;
            for (int row = 0; row < cellsZ; row++) {
                for (int col = 0; col < cellsX; col++) {
                    long cell = ChunkPos.toLong(minCellX + col, minCellZ + row);
                    SettingColor c = colorOf(cell);
                    if (c == null) continue;
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
            int dx = x0 + (int) MathHelper.clamp(fx * px, 0, size - 1), dz = y0 + (int) MathHelper.clamp(fz * px, 0, height - 1);
            context.fill(dx - 1, dz - 1, dx + 2, dz + 2, 0xFFFFFFFF);
        }

        int ty = y0 + height + 3;
        if (selecting) {
            String sel = "Selecting " + cellsX + "x" + cellsZ + " maps (" + cellsX * 8 + "x" + cellsZ * 8 + " chunks)";
            context.drawTextWithShadow(mc.textRenderer, sel, textX(sel, x0, size, right), ty, 0xFFFFFF);
            String hint = "Fly to the opposite corner, set pos 2";
            context.drawTextWithShadow(mc.textRenderer, hint, textX(hint, x0, size, right), ty + mc.textRenderer.fontHeight + 1, 0x60C8FF);
            return;
        }
        String status = (updating() ? "Updated " : "Drawn ") + finishedCount() + "/" + total();
        if (phase == Phase.HOLDING) status += " | map " + progress + "%";
        else if (phase == Phase.CREATING) status += " | making a map";
        else if (phase == Phase.FETCHING) status += " | reading maps";
        if (updating() && !unknown.isEmpty()) status += " | " + unknown.size() + " unrecognised";
        context.drawTextWithShadow(mc.textRenderer, status, textX(status, x0, size, right), ty, 0xFFFFFF);
        String next;
        if (!hasNext) {
            if (phase == Phase.HOLDING) next = "Last map";
            else if (updating()) next = unknown.isEmpty() ? "All updated" : "Fly over the area to recognise the rest";
            else next = "All drawn - .map-painter reset to redo";
        } else {
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
        if (selecting) return "selecting";
        return finishedCount() + "/" + total();
    }
}
