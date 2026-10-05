package dev.onfocus.addon.modules;

import com.google.gson.JsonObject;
import dev.onfocus.addon.ModuleLog;
import dev.onfocus.addon.OnFocusAddon;
import dev.onfocus.addon.explore.BaseClues;
import dev.onfocus.addon.explore.ChunkGrid;
import dev.onfocus.addon.explore.ContourPlanner;
import dev.onfocus.addon.explore.CoveragePlanner;
import dev.onfocus.addon.explore.CoveragePlanner.Area;
import dev.onfocus.addon.explore.CoveragePlanner.Segment;
import dev.onfocus.addon.explore.FindsArchive;
import dev.onfocus.addon.explore.MapSync;
import dev.onfocus.addon.explore.SiteSync;
import dev.onfocus.addon.explore.WaypointFollower;
import dev.onfocus.addon.explore.WaypointFollower.Point;
import dev.onfocus.addon.settings.OrderedItemListSetting;
import dev.onfocus.addon.xaero.XaeroMapFolders;
import dev.onfocus.addon.xaero.XaeroMappedChunkScan;
import dev.onfocus.addon.xaero.XaeroWaypoints;
import it.unimi.dsi.fastutil.ints.Int2IntOpenHashMap;
import it.unimi.dsi.fastutil.longs.Long2IntOpenHashMap;
import it.unimi.dsi.fastutil.ints.IntArrayList;
import it.unimi.dsi.fastutil.longs.Long2ObjectOpenHashMap;
import it.unimi.dsi.fastutil.longs.LongArrayList;
import it.unimi.dsi.fastutil.longs.LongOpenHashSet;
import it.unimi.dsi.fastutil.longs.LongSet;
import meteordevelopment.meteorclient.MeteorClient;
import meteordevelopment.meteorclient.events.game.GameLeftEvent;
import meteordevelopment.meteorclient.events.meteor.KeyEvent;
import meteordevelopment.meteorclient.events.packets.PacketEvent;
import meteordevelopment.meteorclient.gui.GuiTheme;
import meteordevelopment.meteorclient.gui.widgets.WWidget;
import meteordevelopment.meteorclient.gui.widgets.pressable.WButton;
import meteordevelopment.meteorclient.events.world.ChunkDataEvent;
import meteordevelopment.meteorclient.events.world.TickEvent;
import meteordevelopment.meteorclient.settings.*;
import meteordevelopment.meteorclient.systems.modules.Module;
import meteordevelopment.meteorclient.systems.modules.Modules;
import meteordevelopment.meteorclient.systems.waypoints.Waypoint;
import meteordevelopment.meteorclient.systems.waypoints.Waypoints;
import meteordevelopment.meteorclient.utils.misc.Keybind;
import meteordevelopment.meteorclient.utils.misc.input.KeyAction;
import meteordevelopment.meteorclient.utils.player.PlayerUtils;
import meteordevelopment.meteorclient.utils.render.color.SettingColor;
import meteordevelopment.meteorclient.utils.world.Dimension;
import meteordevelopment.orbit.EventHandler;
import net.fabricmc.loader.api.FabricLoader;
import net.minecraft.block.Block;
import net.minecraft.block.BlockState;
import net.minecraft.block.Blocks;
import net.minecraft.block.ChestBlock;
import net.minecraft.block.ShulkerBoxBlock;
import net.minecraft.block.entity.BlockEntity;
import net.minecraft.block.entity.SignBlockEntity;
import net.minecraft.block.entity.SignText;
import net.minecraft.client.gui.screen.DisconnectedScreen;
import net.minecraft.client.gui.screen.DownloadingTerrainScreen;
import net.minecraft.client.gui.screen.NoticeScreen;
import net.minecraft.client.gui.screen.Screen;
import net.minecraft.client.gui.screen.TitleScreen;
import net.minecraft.client.gui.screen.multiplayer.ConnectScreen;
import net.minecraft.client.gui.screen.multiplayer.MultiplayerScreen;
import net.minecraft.client.network.ServerAddress;
import net.minecraft.client.network.ServerInfo;
import net.minecraft.block.enums.ChestType;
import net.minecraft.component.DataComponentTypes;
import net.minecraft.entity.Entity;
import net.minecraft.entity.EntityStatuses;
import net.minecraft.network.packet.s2c.play.EntityStatusS2CPacket;
import net.minecraft.entity.ItemEntity;
import net.minecraft.item.Item;
import net.minecraft.item.ItemStack;
import net.minecraft.item.Items;
import net.minecraft.nbt.NbtCompound;
import net.minecraft.nbt.NbtElement;
import net.minecraft.nbt.NbtIo;
import net.minecraft.nbt.NbtList;
import net.minecraft.nbt.NbtSizeTracker;
import net.minecraft.nbt.NbtString;
import net.minecraft.registry.Registries;
import net.minecraft.registry.RegistryKey;
import net.minecraft.text.Text;
import net.minecraft.util.Formatting;
import net.minecraft.util.Identifier;
import net.minecraft.util.math.BlockPos;
import net.minecraft.util.math.ChunkPos;
import net.minecraft.util.math.ChunkSectionPos;
import net.minecraft.util.math.MathHelper;
import net.minecraft.world.World;
import net.minecraft.world.chunk.ChunkSection;
import net.minecraft.world.chunk.WorldChunk;

import java.io.IOException;
import java.lang.management.GarbageCollectorMXBean;
import java.lang.management.ManagementFactory;
import java.lang.reflect.Field;
import java.lang.reflect.Modifier;
import java.lang.reflect.RecordComponent;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.nio.file.StandardOpenOption;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.EnumMap;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Iterator;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.CancellationException;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CompletionException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.function.Predicate;

/**
 * Steers the player over a rectangular chunk area (picked with "Explore" in Xaero's World Map
 * right-click menu) so every chunk in it gets loaded, and therefore mapped.
 * <p>
 * This module only aims the camera and optionally holds the forward key; the actual flying is
 * left to another client's elytra module (e.g. RusherHack's ElytraFly in a look-direction mode)
 * that the player has already started at the altitude they want. Elytra upkeep - spares, reopening
 * after a stall - is {@link ElytraKeeper}'s job, turned on alongside.
 * <p>
 * The route is planned up front by {@link CoveragePlanner}, in two phases:
 * <ol>
 * <li>Sweep: parallel strips along the longer side of the area, each flown only where its share
 * of the area is still blank. The whole route is known, and so is the time it takes.</li>
 * <li>Cleanup: once the sweep is flown and the map has caught up, whatever is still blank is
 * picked up in one short tour - up to {@code cleanup-passes} times. What's left after that is
 * reported and given up on.</li>
 * </ol>
 * With Xaero's World Map installed, a chunk only counts as explored once it is drawn on the map:
 * Xaero skips the outer ring of loaded chunks and ones that stream in too late at speed. The map is
 * read in full before the sweep and before each cleanup; in between, chunks around the player are
 * picked up as they get drawn.
 * <p>
 * Strip spacing comes from how wide the map really gets drawn beside a strip. That's measured in
 * flight - from where the player actually flew, not the planned line - and remembered per server
 * and dimension. The width taken is the typical one, so each strip runs down the middle of the blank
 * rows beside it; spots where the map drew less at speed are left for the cleanup. Whenever it
 * changes, the rest of the sweep is re-planned at the new width right away.
 * <p>
 * Spiral mode needs no area and no map: it spirals outwards from wherever the module is turned
 * on, in square rings spaced like the strips, until stopped or a set radius.
 * <p>
 * Auto markers (either mode): every chunk loaded while exploring is checked for the picked blocks -
 * End Portal frames, spawners and so on - and a waypoint (Xaero's Minimap, or Meteor) is dropped on each find, enabled or
 * disabled (markers-enabled). One waypoint per name within {@code marker-spacing}. Markers come in groups -
 * Bases, Items on the ground, End Portals, Shulker Boxes... - each with a colour of its own and, with
 * {@code group-sets}, a Xaero waypoint set of its own (else they all go to {@code marker-list}).
 * Bases are scored on what players leave behind ({@link BaseClues}): blocks of the loaded chunks and
 * entities polled around the player, scored together within {@code base-radius}. With {@code mark-items},
 * items of the picked kinds lying on the ground nearby are marked too, one marker per pile.
 * <p>
 * With {@code all-finds-file}, everything found on every run is kept in one file per server and
 * dimension, with no find twice ({@link FindsArchive}).
 * <p>
 * Signs (either mode): with {@code save-signs}, the text of every sign in the chunks loaded while
 * exploring is written to a file per run under {@code .minecraft/onfocus/signs/<server>/}. With
 * {@code save-items}, items of the picked kinds lying on the ground nearby go into the same file.
 * <p>
 * The module's keybind pauses and resumes instead of turning it off (turning it off from the
 * GUI keeps the area, so enabling it again carries on where it stopped).
 * <p>
 * Kicked or dropped from a server, it reconnects ({@code auto-reconnect}) and, once back where it
 * stopped, carries on with the same route and the same sign file. It runs in the main menu for
 * that: Meteor would otherwise turn it off on leaving. With {@code leave-on-finish} it leaves the
 * server when done.
 */
public class AreaExplorer extends Module {
    private static final int MAX_MEASURED_RADIUS = 32;
    private static final int SCAN_TIMEOUT_TICKS = 600;
    /** Map regions (32 chunks) each side of where the sweep starts read before setting off; the rest is read in flight. */
    private static final int NEAR_REGIONS = 2;
    /** How often chunks around the player are checked against the map. */
    private static final int MAP_CHECK_INTERVAL_TICKS = 20;
    /** Chunks past the view distance checked too: the map draws with a delay, by then we've moved on. */
    private static final int MAP_CHECK_EXTRA = 8;
    /** Time the map gets to draw the last chunks after a pass, before gaps are looked for. */
    private static final int SETTLE_TICKS = 100;
    private static final int SETTLE_TICKS_NO_MAP = 20;
    /** How often the part of the current strip flown so far gets measured. */
    private static final int MEASURE_INTERVAL_TICKS = 100;
    /** Chunks behind the player left out of that, as the map may not have caught up there yet... */
    private static final int REACH_SAMPLE_BEHIND = 12;
    /** ...or more at speed: the seconds the map may take to draw the outer chunks. */
    private static final double MAP_LAG_SECONDS = 5;
    /** Rows of a strip measured before a width is trusted. */
    private static final int MIN_REACH_SAMPLES = 16;
    /** Seconds of flight looked ahead when deciding a point is reached. */
    private static final double TURN_LEAD_SECONDS = 0.4;
    private static final double SPEED_SMOOTHING = 0.05;
    private static final double MIN_KNOWN_SPEED = 3; // blocks/s
    /** Flight a run needs behind it before its average speed is trusted for estimates. */
    private static final int RUN_SPEED_MIN_TICKS = 20 * 20;
    /** Flights shorter than this don't update the remembered speed. */
    private static final int MIN_FLIGHT_SECONDS = 60;

    /**
     * Swath width (chunks each side) measured in flight, per server and dimension. The view
     * distance measured at start says little: servers send far more chunks to a player standing
     * still than to one flying past, so strips spaced by it leave wide gaps.
     */
    private final Map<String, Integer> learnedReach = new HashMap<>();
    /** Average speed of the last flight, for an estimate before we're moving. */
    private double lastFlightSpeed;

    private final SettingGroup sgGeneral = settings.getDefaultGroup();
    private final SettingGroup sgControl = settings.createGroup("Control");
    private final SettingGroup sgMarkers = settings.createGroup("Markers");
    private final SettingGroup sgSigns = settings.createGroup("Signs");
    private final SettingGroup sgReconnect = settings.createGroup("Reconnect");

    public enum Mode { Area, Spiral }

    /** How Area mode covers the blank ground. */
    public enum Pattern { Contour, Strips }

    private final Setting<Mode> mode = sgGeneral.add(new EnumSetting.Builder<Mode>()
        .name("mode")
        .description("Area: explore a rectangle picked on Xaero's World Map (right click > Explore). Spiral: spiral outwards from where you turn it on - no map needed.")
        .defaultValue(Mode.Area)
        .build()
    );

    private final Setting<Pattern> pattern = sgGeneral.add(new EnumSetting.Builder<Pattern>()
        .name("pattern")
        .description("Contour: loops along the edge of the blank ground, each inside the last, spiralling in to its middle - fitted to whatever shape it has. Strips: straight parallel strips across the area.")
        .defaultValue(Pattern.Contour)
        .visible(() -> mode.get() == Mode.Area)
        .build()
    );

    private final Setting<Integer> spiralMaxRadius = sgGeneral.add(new IntSetting.Builder()
        .name("spiral-max-radius")
        .description("Spiral mode stops once it reaches this many blocks from its centre. 0 = until you stop it.")
        .defaultValue(0)
        .range(0, 1_000_000)
        .sliderRange(0, 50_000)
        .visible(() -> mode.get() == Mode.Spiral)
        .build()
    );

    private final Setting<Integer> viewDistance = sgGeneral.add(new IntSetting.Builder()
        .name("view-distance")
        .description("Server view distance in chunks, used to space the sweep strips. 0 = measure it from the chunks currently loaded around you.")
        .defaultValue(0)
        .range(0, 32)
        .sliderRange(0, 16)
        .build()
    );

    private final Setting<Integer> overlap = sgGeneral.add(new IntSetting.Builder()
        .name("strip-overlap")
        .description("Chunks shared by neighbouring strips. Raise it if chunks at the strip edges keep being missed at high speed.")
        .defaultValue(2)
        .range(0, 16)
        .sliderRange(0, 8)
        .build()
    );

    private final Setting<Integer> arriveDistance = sgGeneral.add(new IntSetting.Builder()
        .name("arrive-distance")
        .description("How close (in blocks) counts as reaching a turn point. Grows automatically with speed.")
        .defaultValue(32)
        .range(4, 256)
        .sliderRange(8, 128)
        .build()
    );

    private final Setting<Boolean> useXaeroMap = sgGeneral.add(new BoolSetting.Builder()
        .name("use-xaero-map")
        .description("Before starting, treats chunks already drawn on Xaero's World Map as explored, so only the blank parts are flown.")
        .defaultValue(true)
        .visible(() -> mode.get() == Mode.Area)
        .build()
    );

    private final Setting<Integer> cleanupPasses = sgGeneral.add(new IntSetting.Builder()
        .name("cleanup-passes")
        .description("Tours over the chunks the sweep missed. Whatever is still blank after these is given up on.")
        .defaultValue(2)
        .range(0, 5)
        .sliderRange(0, 5)
        .visible(() -> mode.get() == Mode.Area)
        .build()
    );

    private final Setting<Integer> flightSpeed = sgGeneral.add(new IntSetting.Builder()
        .name("flight-speed")
        .description("Your elytra fly speed in blocks/s, for the time estimates. 0 = measure it in flight.")
        .defaultValue(64)
        .range(0, 1000)
        .sliderRange(0, 200)
        .build()
    );

    private final Setting<Boolean> useElytraKeeper = sgGeneral.add(new BoolSetting.Builder()
        .name("elytra-keeper")
        .description("Turns on Elytra Keeper while exploring (spare elytra swaps, reopening after a stall) and off again afterwards.")
        .defaultValue(true)
        .build()
    );

    private final Setting<Boolean> pauseOnBind = sgGeneral.add(new BoolSetting.Builder()
        .name("bind-pauses")
        .description("The module's keybind pauses / resumes exploring instead of turning the module off. Turn it off from the GUI.")
        .defaultValue(true)
        .build()
    );

    private final Setting<Keybind> pauseKey = sgGeneral.add(new KeybindSetting.Builder()
        .name("pause-keybind")
        .description("Separate key to pause / resume exploring.")
        .defaultValue(Keybind.none())
        .action(this::onPauseKey)
        .build()
    );

    private final Setting<Boolean> notify = sgGeneral.add(new BoolSetting.Builder()
        .name("notify")
        .description("Sends chat messages on start, phase changes and completion.")
        .defaultValue(true)
        .build()
    );

    private final Setting<Boolean> showOnMap = sgGeneral.add(new BoolSetting.Builder()
        .name("show-on-map")
        .description("Keeps the area being explored highlighted on Xaero's World Map while the module is on.")
        .defaultValue(true)
        .visible(() -> mode.get() == Mode.Area)
        .build()
    );

    private final Setting<SettingColor> mapColor = sgGeneral.add(new ColorSetting.Builder()
        .name("map-color")
        .description("Fill colour of the area on the World Map.")
        .defaultValue(new SettingColor(80, 200, 255, 60))
        .visible(() -> mode.get() == Mode.Area && showOnMap.get())
        .build()
    );

    private final Setting<Double> rotationSpeed = sgControl.add(new DoubleSetting.Builder()
        .name("rotation-speed")
        .description("Maximum yaw change per tick, in degrees.")
        .defaultValue(12)
        .range(1, 180)
        .sliderRange(1, 45)
        .build()
    );

    private final Setting<Boolean> holdForward = sgControl.add(new BoolSetting.Builder()
        .name("hold-forward")
        .description("Holds the forward key while exploring (needed by control-style elytra fly modes).")
        .defaultValue(true)
        .build()
    );

    private final Setting<Boolean> lockPitch = sgControl.add(new BoolSetting.Builder()
        .name("lock-pitch")
        .description("Also forces the camera pitch. Leave off if your elytra fly mode manages pitch itself.")
        .defaultValue(false)
        .build()
    );

    private final Setting<Double> pitch = sgControl.add(new DoubleSetting.Builder()
        .name("pitch")
        .description("Pitch to hold when lock-pitch is on.")
        .defaultValue(0)
        .range(-90, 90)
        .sliderRange(-90, 90)
        .visible(lockPitch::get)
        .build()
    );

    /**
     * What the auto markers look for: the waypoint name, the group it goes in, its look, and the blocks
     * that give it away. Default colours are Xaero's own, a different one per group: Xaero only has 16.
     */
    private enum Marker {
        END_PORTAL("End Portal", "End Portals", "diamond", new SettingColor(85, 255, 85), true, b -> b == Blocks.END_PORTAL_FRAME),
        NETHER_PORTAL("Nether Portal", "Nether Portals", "circle", new SettingColor(170, 0, 170), false, b -> b == Blocks.NETHER_PORTAL),
        SPAWNER("Spawner", "Spawners", "skull", new SettingColor(255, 0, 0), false, b -> b == Blocks.SPAWNER),
        TRIAL_CHAMBER("Trial Chamber", "Trial Chambers", "triangle", new SettingColor(255, 170, 0), false, b -> b == Blocks.TRIAL_SPAWNER || b == Blocks.VAULT),
        ANCIENT_CITY("Ancient City", "Ancient Cities", "skull", new SettingColor(0, 170, 170), false, b -> b == Blocks.REINFORCED_DEEPSLATE),
        END_CITY("End City", "End Cities", "star", new SettingColor(85, 85, 255), false, b -> b == Blocks.PURPUR_BLOCK || b == Blocks.PURPUR_PILLAR),
        END_GATEWAY("End Gateway", "End Gateways", "circle", new SettingColor(0, 170, 0), false, b -> b == Blocks.END_GATEWAY),
        SHULKER("Shulker Box", "Shulker Boxes", "square", new SettingColor(255, 85, 255), false, b -> b instanceof ShulkerBoxBlock);

        final String title, group, icon;
        final SettingColor color;
        final boolean enabledByDefault;
        final Predicate<Block> blocks;

        Marker(String title, String group, String icon, SettingColor color, boolean enabledByDefault, Predicate<Block> blocks) {
            this.title = title;
            this.group = group;
            this.icon = icon;
            this.color = color;
            this.enabledByDefault = enabledByDefault;
            this.blocks = blocks;
        }

        String settingName() {
            return "mark-" + name().toLowerCase(Locale.ROOT).replace('_', '-');
        }

        String colorSettingName() {
            return name().toLowerCase(Locale.ROOT).replace('_', '-') + "-color";
        }
    }

    private static final String BASES_GROUP = "Bases", ITEMS_GROUP = "Items on the ground", CUSTOM_GROUP = "Custom Blocks";

    private final Setting<Boolean> autoMarkers = sgMarkers.add(new BoolSetting.Builder()
        .name("auto-markers")
        .description("Scans every chunk loaded while exploring and drops a waypoint on the places picked below (End Portal, spawners...).")
        .defaultValue(false)
        .build()
    );

    /** Where the markers go. */
    public enum MarkerTarget { Xaero, Meteor }

    private final Setting<MarkerTarget> markerTarget = sgMarkers.add(new EnumSetting.Builder<MarkerTarget>()
        .name("marker-target")
        .description("Xaero: Xaero's Minimap waypoints, shown on Xaero's World Map (falls back to Meteor without the Minimap). Meteor: Meteor's waypoints.")
        .defaultValue(MarkerTarget.Xaero)
        .visible(autoMarkers::get)
        .build()
    );

    private final Setting<Boolean> groupSets = sgMarkers.add(new BoolSetting.Builder()
        .name("group-sets")
        .description("Puts each group in a Xaero waypoint set of its own: Bases, Items on the ground, End Portals, Shulker Boxes... Off: all in marker-list.")
        .defaultValue(true)
        .visible(() -> autoMarkers.get() && markerTarget.get() == MarkerTarget.Xaero)
        .build()
    );

    private final Setting<String> markerListName = sgMarkers.add(new StringSetting.Builder()
        .name("marker-list")
        .description("Xaero waypoint set the markers go into, kept apart from your own waypoints. Created if missing.")
        .defaultValue("Area Explorer")
        .visible(() -> autoMarkers.get() && markerTarget.get() == MarkerTarget.Xaero && !groupSets.get())
        .build()
    );

    private final Setting<Boolean> markersEnabled = sgMarkers.add(new BoolSetting.Builder()
        .name("markers-enabled")
        .description("Adds the markers as enabled waypoints (shown in the world and on the minimap). Off: added disabled, turned on by hand when one's needed.")
        .defaultValue(false)
        .visible(autoMarkers::get)
        .build()
    );

    private final Map<Marker, Setting<Boolean>> markerToggles = new EnumMap<>(Marker.class);
    private final Map<Marker, Setting<SettingColor>> markerColors = new EnumMap<>(Marker.class);

    {
        for (Marker marker : Marker.values()) {
            Setting<Boolean> toggle = sgMarkers.add(new BoolSetting.Builder()
                .name(marker.settingName())
                .description("Marks " + marker.title + " finds.")
                .defaultValue(marker.enabledByDefault)
                .visible(autoMarkers::get)
                .build()
            );
            markerToggles.put(marker, toggle);
            markerColors.put(marker, sgMarkers.add(colorSetting(marker.colorSettingName(), marker.group, marker.color, () -> autoMarkers.get() && toggle.get())));
        }
    }

    private final Setting<List<Block>> customMarkerBlocks = sgMarkers.add(new BlockListSetting.Builder()
        .name("custom-blocks")
        .description("Other blocks to mark; the waypoint is named after the block.")
        .visible(autoMarkers::get)
        .build()
    );

    private final Setting<SettingColor> customColor = sgMarkers.add(colorSetting("custom-blocks-color", CUSTOM_GROUP,
        new SettingColor(255, 255, 255), () -> autoMarkers.get() && !customMarkerBlocks.get().isEmpty()));

    private final Setting<Boolean> markItems = sgMarkers.add(new BoolSetting.Builder()
        .name("mark-items")
        .description("Marks the items picked in Signs > items lying on the ground near you. Items lying together get one marker, named after what's there: elytra first, then shulker boxes, netherite armour and the rest.")
        .defaultValue(false)
        .visible(autoMarkers::get)
        .build()
    );

    private final Setting<SettingColor> itemsColor = sgMarkers.add(colorSetting("items-color", ITEMS_GROUP,
        new SettingColor(85, 255, 255), () -> autoMarkers.get() && markItems.get()));

    private final Setting<Integer> markerSpacing = sgMarkers.add(new IntSetting.Builder()
        .name("marker-spacing")
        .description("A find within this many blocks of a waypoint with the same name doesn't get its own (one structure = one marker).")
        .defaultValue(128)
        .range(1, 4096)
        .sliderRange(16, 512)
        .visible(autoMarkers::get)
        .build()
    );

    private final Setting<Boolean> markBases = sgMarkers.add(new BoolSetting.Builder()
        .name("mark-bases")
        .description("Marks places players have left their mark on as Base #1, Base #2... Each is scored on what's there: ender chests, beacons, shulkers, map art, chest rooms, farms, tamed animals, stasis chambers...")
        .defaultValue(true)
        .visible(autoMarkers::get)
        .build()
    );

    private final Setting<SettingColor> basesColor = sgMarkers.add(colorSetting("bases-color", BASES_GROUP,
        new SettingColor(255, 255, 85), () -> autoMarkers.get() && markBases.get()));

    private final Setting<Integer> baseScore = sgMarkers.add(new IntSetting.Builder()
        .name("base-score")
        .description("Score a place needs to be marked as a base. An ender chest is 10, a beacon 15, a shulker box 8, a double chest 3, a framed map 4. Lower finds more, villages and dungeons included.")
        .defaultValue(20)
        .range(5, 500)
        .sliderRange(10, 100)
        .visible(() -> autoMarkers.get() && markBases.get())
        .build()
    );

    private final Setting<Boolean> basesToFile = sgMarkers.add(new BoolSetting.Builder()
        .name("bases-to-file")
        .description("Also writes each base, with what it was scored on, to the finds file (the one signs go to).")
        .defaultValue(true)
        .visible(() -> autoMarkers.get() && markBases.get())
        .build()
    );

    private final Setting<Integer> baseRadius = sgMarkers.add(new IntSetting.Builder()
        .name("base-radius")
        .description("How far, in blocks, the things that make up one base are scored together.")
        .defaultValue(32)
        .range(4, 256)
        .sliderRange(8, 128)
        .visible(() -> autoMarkers.get() && markBases.get())
        .build()
    );

    private final Setting<Boolean> saveSigns = sgSigns.add(new BoolSetting.Builder()
        .name("save-signs")
        .description("Writes the text of every sign (hanging ones too) in the chunks loaded while exploring to a text file: .minecraft/onfocus/signs/<server>/, one file per run.")
        .defaultValue(false)
        .build()
    );

    private final Setting<Boolean> signsInChat = sgSigns.add(new BoolSetting.Builder()
        .name("signs-in-chat")
        .description("Also shows each sign found in chat.")
        .defaultValue(false)
        .visible(saveSigns::get)
        .build()
    );

    private final Setting<Boolean> saveItems = sgSigns.add(new BoolSetting.Builder()
        .name("save-items")
        .description("Also writes the items picked below that lie on the ground near you while exploring to the same file as the signs.")
        .defaultValue(false)
        .build()
    );

    private final Setting<List<Item>> savedItemKinds = sgSigns.add(new OrderedItemListSetting.Builder()
        .name("items")
        .description("Items on the ground worth writing down (save-items) or marking (Markers > mark-items). The file lists them in this order: move them with the arrows.")
        .visible(() -> saveItems.get() || markingItems())
        .build()
    );

    private final Setting<Boolean> itemsInChat = sgSigns.add(new BoolSetting.Builder()
        .name("items-in-chat")
        .description("Also shows each item found in chat.")
        .defaultValue(false)
        .visible(saveItems::get)
        .build()
    );

    private final Setting<Boolean> allFinds = sgSigns.add(new BoolSetting.Builder()
        .name("all-finds-file")
        .description("Also keeps everything found on every run in one file per server and dimension, nothing twice: 'ALL FINDS - overworld.txt' to read and 'all-finds_overworld.csv' for a spreadsheet. The finds files of earlier runs are taken into it.")
        .defaultValue(true)
        .build()
    );

    private final SettingGroup sgSite = settings.createGroup("Site");

    private final Setting<Boolean> siteSync = sgSite.add(new BoolSetting.Builder()
        .name("site-sync")
        .description("Sends the finds (from the all-finds file, the earlier ones too) and how the run is going to the WheatMagnateBot site's Area Explorer section.")
        .defaultValue(false)
        .build()
    );

    private final Setting<String> siteUrl = sgSite.add(new StringSetting.Builder()
        .name("site-url")
        .description("The site's address, e.g. https://wheat.example.com")
        .defaultValue("")
        .visible(siteSync::get)
        .build()
    );

    private final Setting<String> siteToken = sgSite.add(new StringSetting.Builder()
        .name("site-token")
        .description("The token an admin made on the site (Area Explorer > Mod Tokens). It lets this PC upload; keep it to yourself.")
        .defaultValue("")
        .visible(siteSync::get)
        .build()
    );

    private final Setting<Boolean> mapSync = sgSite.add(new BoolSetting.Builder()
        .name("map-sync")
        .description("Also sends Xaero's World Map of this server to the site - every dimension, what was explored before too, then each region again as it gets drawn - so the site shows it. Needs Xaero's World Map.")
        .defaultValue(true)
        .visible(siteSync::get)
        .build()
    );

    private final Setting<Boolean> autoReconnect = sgReconnect.add(new BoolSetting.Builder()
        .name("auto-reconnect")
        .description("Kicked or dropped from the server while exploring: reconnects and carries on with the same area and the same sign file. Leaving by hand still stops it.")
        .defaultValue(true)
        .build()
    );

    private final Setting<Integer> reconnectDelay = sgReconnect.add(new IntSetting.Builder()
        .name("reconnect-delay")
        .description("Seconds to wait before each reconnect attempt.")
        .defaultValue(10)
        .range(1, 600)
        .sliderRange(1, 60)
        .visible(autoReconnect::get)
        .build()
    );

    private final Setting<Integer> reconnectAttempts = sgReconnect.add(new IntSetting.Builder()
        .name("reconnect-attempts")
        .description("Failed attempts in a row before giving up and stopping. 0 = keep trying.")
        .defaultValue(0)
        .range(0, 1000)
        .sliderRange(0, 50)
        .visible(autoReconnect::get)
        .build()
    );

    private final Setting<Boolean> leaveOnTotemPop = sgReconnect.add(new BoolSetting.Builder()
        .name("leave-on-totem-pop")
        .description("A totem of yours pops while exploring (paused too): leaves the server at once and doesn't reconnect. The run is saved, so turning the module on later carries on.")
        .defaultValue(true)
        .build()
    );

    private final Setting<Boolean> leaveOnFinish = sgReconnect.add(new BoolSetting.Builder()
        .name("leave-on-finish")
        .description("Leaves the server once the area is explored (or the spiral reaches its max radius).")
        .defaultValue(true)
        .build()
    );

    /** Back in the world, how far from where we were dropped still counts as the same spot (not a queue or a lobby). */
    private static final double MAX_REJOIN_DISTANCE = 1024;
    /** Ticks back in place before steering again: chunks arrive, the elytra module gets going. */
    private static final int REJOIN_SETTLE_TICKS = 60;

    /** Dropped from the server and waiting to get back; everything else is kept as it was. */
    private boolean reconnecting;
    private ServerInfo reconnectServer;
    private RegistryKey<World> leftDimension;
    private double leftX, leftZ;
    private int reconnectTicks, reconnectTries, rejoinTicks;
    /** The map read before the sweep was still going when we were dropped: it starts over on return. */
    private boolean rescanOnReturn;
    private boolean warnedElsewhere;
    /** What the last disconnect screen said, for ours. */
    private String reconnectReason = "";

    /**
     * The run stopped before it was done (paused and the game closed, turned off, dropped from the
     * server), saved per server: turning the module on again carries on with it, after a restart too.
     */
    private static final int SESSION_SAVE_INTERVAL_TICKS = 1200;
    /** Chunks per string in the saved file: NBT strings are limited to 64 KB. */
    private static final int SESSION_STRING_PART = 16_000;
    private int sessionSaveTicks;
    /** Turned on from the map's "Explore": starts afresh rather than carrying on with the saved run. */
    private boolean freshStart;
    /** Explored chunks of the saved run, for start() to take - only saved without Xaero's map. */
    private long[] restoredExplored;
    /** The saved run's flight so far, for resetFlightState to start from. */
    private int restoredActiveTicks;
    private double restoredFlightDistance;

    private static final DateTimeFormatter SIGN_FILE_TIME = DateTimeFormatter.ofPattern("yyyy-MM-dd_HH-mm-ss");
    private static final DateTimeFormatter SIGN_DATE_TIME = DateTimeFormatter.ofPattern("dd.MM.yyyy HH:mm");
    private static final DateTimeFormatter SIGN_TIME = DateTimeFormatter.ofPattern("HH:mm:ss");
    /** Lines the boxes up under the coordinates of their entry. */
    private static final String SIGN_INDENT = "      ";
    /** Signs already written this run, so a chunk loaded twice doesn't repeat them. */
    private final LongOpenHashSet savedSigns = new LongOpenHashSet();
    /** Item entities already written this run; the server keeps an entity's UUID across chunk reloads. */
    private final Set<UUID> savedItems = new HashSet<>();
    /** How many of each item were found (whole stacks counted), for the file name. */
    private final Map<Item, Integer> itemCounts = new HashMap<>();
    private static final int MAX_NAMED_ITEM_KINDS = 4;
    /** The file name without the item counts in front. */
    private String fileBaseName;
    /** How often the entities around the player are checked for items. */
    private static final int ITEM_CHECK_INTERVAL_TICKS = 20;
    private int itemCheckTicks;
    /** The file's signs so far. It's written whole each time, so the items stay in a section of their own under the signs. */
    private final StringBuilder signLog = new StringBuilder();
    /** Items found, in the order found; written sorted by {@link #itemRank}. */
    private final List<FoundItem> foundItems = new ArrayList<>();

    private record FoundItem(Item item, BlockPos pos, String what, LocalTime time) {}
    private String fileHeader;
    /** This run's file, made on the first sign or item found. */
    private Path signFile;
    private boolean signWriteFailed;
    /** Finds not in the run's file yet: it's written whole, so at most every {@link #FOUND_FILE_INTERVAL_TICKS}, not on each find. */
    private boolean foundFileDirty;
    private int foundFileTicks;
    private static final int FOUND_FILE_INTERVAL_TICKS = 20 * 20;

    /**
     * The all-finds archives, by table file: only ever touched on {@link #FILES}, so reading and
     * writing them never holds the game up.
     */
    private static final Map<Path, FindsArchive> ARCHIVES = new HashMap<>();
    private static final ExecutorService FILES = Executors.newSingleThreadExecutor(r -> {
        Thread thread = new Thread(r, "Area Explorer files");
        thread.setDaemon(true);
        return thread;
    });
    private static final int ARCHIVE_INTERVAL_TICKS = 30 * 20;
    /** Uploads to the site; only used on {@link #FILES}, like the archives. */
    private static final SiteSync SITE = new SiteSync();
    /** Sends Xaero's map to the site, on a thread of its own. */
    private static final MapSync MAP = new MapSync();
    /** Archives whose earlier finds were queued for the site this session, by archive and site. */
    private static final Set<String> SITE_BACKFILLED = new HashSet<>();
    private int archiveTicks;

    private static final String BASE_PREFIX = "Base #";
    private boolean warnedNoMinimap;
    /** Item entities already marked this run (or seen near a marker of their kind). */
    private final Set<UUID> markedItems = new HashSet<>();

    /** Base clues seen while exploring, by chunk: rescanning a chunk replaces its blocks, its entities stay. */
    private final Long2ObjectOpenHashMap<BaseClues.Chunk> baseChunks = new Long2ObjectOpenHashMap<>();
    /** Entities already scored; the server keeps an entity's UUID across chunk reloads. */
    private final Set<UUID> scoredEntities = new HashSet<>();
    /** How often the entities around the player are checked for base clues. */
    private static final int BASE_ENTITY_CHECK_INTERVAL_TICKS = 20;
    private int baseEntityCheckTicks;
    /** The file's bases section so far. */
    private final StringBuilder baseLog = new StringBuilder();
    private int basesFound;
    /** How much further than the base radius a structure (a village) is looked for. */
    private static final int STRUCTURE_REACH = 96;
    /** How long a place has to keep scoring before it's marked. */
    private static final int BASE_CONFIRM_TICKS = 10 * 20;
    /** Chunks around which a base scored, and the tick they first did. */
    private final Long2IntOpenHashMap baseCandidates = new Long2IntOpenHashMap();
    private int baseTicks;

    /**
     * SCAN: reading the map before the sweep. SETTLE: between passes, letting the map catch up and
     * reading it again. CLEANUP: touring the chunks the passes before missed.
     */
    private enum Phase { IDLE, SCAN, SWEEP, SETTLE, CLEANUP, SPIRAL }

    private Phase phase = Phase.IDLE;
    private int phaseTicks;

    // Selected area, and the chunks of it known to be explored: drawn on the map with Xaero, sent by the server without
    private Area area;
    private RegistryKey<World> areaDimension;
    private final LongSet explored = new LongOpenHashSet();
    /** Reused for every plan: see {@link #planGrid}. */
    private ChunkGrid planGrid;
    /** {@link #explored} as a grid over the area, kept up as chunks get explored; null until a plan needs it. */
    private ChunkGrid exploredGrid;
    /**
     * The re-plan after a strip, worked out on {@link #PLANNER} so the game doesn't stall at every
     * turn: ordering the strips takes up to 15 ms. Null with none under way.
     */
    private CompletableFuture<PlannedSweep> pendingSweep;
    /** Bumped by every plan: a background one finishing after another plan was made is dropped. */
    private int planGeneration;

    private record PlannedSweep(int generation, List<Segment> plan, ChunkGrid done, long prepareNanos, long planNanos) {}

    private static final ExecutorService PLANNER = Executors.newSingleThreadExecutor(r -> {
        Thread thread = new Thread(r, "Area Explorer planner");
        thread.setDaemon(true);
        return thread;
    });
    private boolean xaero;
    private XaeroMappedChunkScan scan;
    private int mapCheckTicks;
    private int cleanupPass;

    private int radius; // server view distance, in chunks
    private int reach;  // chunks to each side of a strip that actually get explored

    private final WaypointFollower follower = new WaypointFollower();
    /** Contour pattern: chunks within reach of where the player has flown this sweep - done even before the map draws them. */
    private final LongOpenHashSet flownOver = new LongOpenHashSet();
    private long lastFlownChunk = Long.MIN_VALUE;
    /** Contour pattern: blank chunks left when the current loop was planned, for the time estimate and to notice a loop that changed nothing. */
    private long contourOpen = -1;
    private int idleLoops;
    /** Strips flown this sweep, chunk coordinates {x1, z1, x2, z2}: a re-plan counts their swaths as done. */
    private final List<int[]> flownStrips = new ArrayList<>();

    // The strip being flown. u runs along it, v across; its width is measured on the side facing blank ground.
    private boolean onStrip;
    private boolean stripAlongX;
    private int stripV, stripStartU, stripEndU, stripSide;
    /** Chunks on that side explored before the strip: they say nothing about how wide it draws. */
    private final LongOpenHashSet stripPre = new LongOpenHashSet();
    /** Row the player was actually on at each u of the strip: the width is measured from there. */
    private final Int2IntOpenHashMap stripPath = new Int2IntOpenHashMap();
    private int measureTicks;
    // For the debug log: the strips flown, and how measuring the last one went
    private int stripNumber, stripStartTicks;
    private String stripMeasureNote = "", swathStats = "";
    /** Chunks around each cleanup spot that passing it loads. */
    private int cleanupRadius;
    private int spotCheckTicks;

    private boolean paused;
    private boolean forcingToggle, suppressToggleMsg;
    private boolean startedKeeper;

    // Spiral: square rings around a centre chunk. The extents are chunk offsets from the centre
    // reached so far on each side; each leg pushes the next side out by one spacing.
    private int spiralCX, spiralCZ;
    private int spiralMinX, spiralMaxX, spiralMinZ, spiralMaxZ;
    private int spiralDir; // 0 east (+X), 1 south (+Z), 2 west, 3 north
    private int legCX, legCZ;

    // Time estimate
    private double speed; // horizontal blocks per second, smoothed
    private double lastX, lastZ;
    private double flightDistance;
    private int activeTicks;
    private int nextProgressReport;

    public AreaExplorer() {
        super(OnFocusAddon.CATEGORY, "area-explorer", "Steers you over an area picked on Xaero's World Map (right click > Explore) until every chunk in it is loaded. Pair it with an elytra fly module.");
        // Stays on through a disconnect so it can reconnect and carry on: Meteor turns other modules off on leaving
        runInMainMenu = true;
        MeteorClient.EVENT_BUS.subscribe(new OffBindListener());
    }

    /** Meteor only runs the pause keybind's action while the module is on: this one carries on with a saved run when it's off. */
    private class OffBindListener {
        @EventHandler
        private void onKey(KeyEvent event) {
            if (event.action != KeyAction.Release || isActive() || mc.world == null || mc.currentScreen != null) return;
            if (!pauseKey.get().matches(true, event.key, event.modifiers) || !hasSession()) return;
            // The same key as the module's bind: Meteor turns it on already
            if (keybind.matches(true, event.key, event.modifiers)) return;
            toggle();
            sendToggledMsg();
        }
    }

    @Override
    public WWidget getWidget(GuiTheme theme) {
        WButton forget = theme.button("Forget saved run");
        forget.action = () -> {
            if (isActive()) {
                warning("Turn the module off first - it saves the run again when turned off.");
                return;
            }
            if (!hasSession()) {
                info("No saved run for this server.");
                return;
            }
            forgetSession();
            area = null;
            info("Saved run forgotten - it starts afresh next time.");
        };
        return forget;
    }

    /** Called from the world map's "Explore" option. Starts (or restarts) exploring the given chunk rectangle. */
    public void explore(int x1, int z1, int x2, int z2, RegistryKey<World> dimension) {
        if (mc.world != null && dimension != null && !dimension.equals(mc.world.getRegistryKey())) {
            error("The selection is in (highlight)%s(default), but you are in (highlight)%s(default).", dimension.getValue(), mc.world.getRegistryKey().getValue());
            return;
        }

        area = new Area(Math.min(x1, x2), Math.min(z1, z2), Math.max(x1, x2), Math.max(z1, z2));
        areaDimension = dimension;
        if (mode.get() != Mode.Area) mode.set(Mode.Area);

        // A new area: the saved run is done with
        forgetSession();
        if (isActive()) {
            paused = false;
            start();
        } else {
            freshStart = true;
            toggle();
        }
    }

    /** The area to highlight on the World Map while it shows the given dimension, or null. */
    public Area mapHighlight(RegistryKey<World> dimension) {
        if (!isActive() || !showOnMap.get() || mode.get() != Mode.Area || area == null) return null;
        if (areaDimension != null && dimension != null && !areaDimension.equals(dimension)) return null;
        return area;
    }

    public SettingColor mapColor() {
        return mapColor.get();
    }

    /** The keybind (pressed with no screen open) pauses / resumes; the GUI still turns it off. */
    @Override
    public void toggle() {
        if (!forcingToggle && pauseOnBind.get() && isActive() && phase != Phase.IDLE && mc.currentScreen == null) {
            setPaused(!paused);
            suppressToggleMsg = true;
            return;
        }
        super.toggle();
    }

    @Override
    public void sendToggledMsg() {
        if (suppressToggleMsg) {
            suppressToggleMsg = false;
            return;
        }
        super.sendToggledMsg();
    }

    /** Really turns the module off, bypassing the pause-on-bind behaviour. */
    private void turnOff() {
        if (!isActive()) return;
        forcingToggle = true;
        try {
            super.toggle();
        } finally {
            forcingToggle = false;
        }
    }

    private void onPauseKey() {
        if (isActive() && phase != Phase.IDLE) setPaused(!paused);
    }

    private void setPaused(boolean pause) {
        if (pause == paused) return;
        paused = pause;
        if (paused) {
            if (holdForward.get()) mc.options.forwardKey.setPressed(false);
            if (phase == Phase.SWEEP) endStrip(false); // what's flown of it so far counts
            if (phase == Phase.SPIRAL) info("Paused - press the bind again to continue the spiral.");
            else info("Paused at (highlight)%d%%(default) - press the bind again to continue.", percent());
            // Quitting the game now leaves it to carry on next time
            saveSession();
        } else {
            lastX = mc.player.getX();
            lastZ = mc.player.getZ();
            // We may be anywhere now: the sweep is planned again from here, other routes just carry on
            if (phase == Phase.SWEEP) planSweep();
            else follower.restartLeg(mc.player.getX(), mc.player.getZ());
            info("Resuming - %s", timeLeftText());
        }
    }

    /** The module's own log file, onfocus/logs/area-explorer.log; the game log gets the lines too. */
    public static final ModuleLog FILE_LOG = new ModuleLog("area-explorer", "AreaExplorer");

    private static void log(String fmt, Object... args) {
        FILE_LOG.info(fmt.formatted(args));
    }

    /** Chat with notify on, the log file either way. */
    private void report(String fmt, Object... args) {
        if (notify.get()) info(fmt, args);
        else log(fmt, args);
    }

    // Everything said in chat goes to the log file as well

    @Override
    public void info(String message, Object... args) {
        super.info(message, args);
        FILE_LOG.info(message.formatted(args));
    }

    @Override
    public void warning(String message, Object... args) {
        super.warning(message, args);
        FILE_LOG.warn(message.formatted(args));
    }

    @Override
    public void error(String message, Object... args) {
        super.error(message, args);
        FILE_LOG.warn(message.formatted(args));
    }

    @Override
    public void onActivate() {
        if (mc.player == null || mc.world == null) {
            turnOff();
            return;
        }
        paused = false;
        boolean fresh = freshStart;
        freshStart = false;
        if (!fresh && resumeSession()) {
            if (!isActive()) return;
        } else if (mode.get() == Mode.Spiral) {
            startSpiral();
        } else if (area == null) {
            error("Select an area on Xaero's World Map, right click it and choose (highlight)Explore(default).");
            turnOff();
            return;
        } else {
            start();
        }
        if (phase != Phase.IDLE) {
            scanLoadedChunksForMarkers();
            scanLoadedChunksForSigns();
            // Reads the all-finds file and takes the earlier runs' files in, before any find comes
            withArchive(archive -> {});
            importMarkerWaypoints();
            // Markers from before the groups: into their groups' sets, so the old and the new ones are together
            if (autoMarkers.get() && groupSets.get()) {
                int moved = regroupMarkers();
                if (moved > 0) report("Moved (highlight)%d(default) earlier markers into their groups' waypoint sets.", moved);
            }
        }
    }

    @Override
    public void onDeactivate() {
        // Stopped before done: turning it on again carries on, even after a restart. Done runs forget it right after.
        saveSession();
        if (phase != Phase.IDLE && activeTicks >= MIN_FLIGHT_SECONDS * 20) lastFlightSpeed = flightDistance * 20 / activeTicks;
        if (phase != Phase.IDLE && holdForward.get()) mc.options.forwardKey.setPressed(false);
        phase = Phase.IDLE;
        paused = false;
        if (scan != null) scan.cancel();
        scan = null;
        MAP.stop();
        explored.clear();
        exploredGrid = null;
        follower.clear();
        flownStrips.clear();
        stripPre.clear();
        stripPath.clear();
        onStrip = false;
        flownOver.clear();
        baseChunks.clear();
        baseCandidates.clear();
        scoredEntities.clear();
        markedItems.clear();
        if (mc.world != null) markLootPiles(true);
        lootPiles.clear();
        baseEntityCheckTicks = 0;
        reconnecting = false;
        reconnectServer = null;
        leftDimension = null;
        rescanOnReturn = false;

        // Finds not written yet make the file if there's none: its writes wait for a few to gather
        if (signFile != null || (foundFileDirty && mc.world != null)) {
            writeFoundFile("─".repeat(58) + "\n  Total: %s · finished %s\n".formatted(foundSummary(), LocalDateTime.now().format(SIGN_DATE_TIME)));
            report("Saved (highlight)%s(default) to (highlight)%s(default).", foundSummary(), signFile);
        }
        flushArchive();
        // The site hears the run stopped, and gets the finds still waiting
        syncSite();
        foundFileDirty = false;
        foundFileTicks = 0;
        archiveTicks = 0;
        pendingSweep = null;
        signFile = null;
        fileHeader = null;
        signLog.setLength(0);
        baseLog.setLength(0);
        basesFound = 0;
        foundItems.clear();
        savedSigns.clear();
        savedItems.clear();
        itemCounts.clear();
        fileBaseName = null;
        itemCheckTicks = 0;
        signWriteFailed = false;

        if (startedKeeper) {
            startedKeeper = false;
            ElytraKeeper keeper = Modules.get().get(ElytraKeeper.class);
            if (keeper.isActive()) keeper.toggle();
        }
    }

    @Override
    public String getInfoString() {
        if (phase == Phase.IDLE) return null;
        if (reconnecting) return "Reconnecting";
        if (phase == Phase.SPIRAL) {
            String info = "Spiral " + formatBlocks(spiralExtent() * 16);
            if (paused) return "Paused " + info;
            int eta = spiralEtaSeconds();
            return eta < 0 ? info : info + " ~" + formatDuration(eta);
        }
        if (area == null) return null;
        if (paused) return "Paused %d%%".formatted(percent());
        if (phase == Phase.SCAN) return "Reading map";
        if (phase == Phase.SETTLE) return "%d%% checking".formatted(percent());
        int eta = etaSeconds();
        return eta < 0 ? "%d%%".formatted(percent()) : "%d%% ~%s".formatted(percent(), formatDuration(eta));
    }

    private int percent() {
        return area == null ? 0 : (int) (explored.size() * 100L / area.total());
    }

    private void start() {
        if (areaDimension != null && !areaDimension.equals(mc.world.getRegistryKey())) {
            error("The selected area is in another dimension.");
            turnOff();
            return;
        }

        resetFlightState();
        cleanupPass = 0;
        flownStrips.clear();
        onStrip = false;
        explored.clear();
        exploredGrid = null;
        flownOver.clear();
        lastFlownChunk = Long.MIN_VALUE;
        contourOpen = -1;
        idleLoops = 0;

        if (!xaero) {
            // Without the map, what the server has sent around us is explored
            ChunkPos p = mc.player.getChunkPos();
            for (int cx = Math.max(area.minCX(), p.x - radius); cx <= Math.min(area.maxCX(), p.x + radius); cx++) {
                for (int cz = Math.max(area.minCZ(), p.z - radius); cz <= Math.min(area.maxCZ(), p.z + radius); cz++) {
                    if (mc.world.getChunkManager().isChunkLoaded(cx, cz)) addExplored(ChunkPos.toLong(cx, cz));
                }
            }
        }
        // A saved run carried on: what it had explored (with the map, reading it again tells that)
        if (restoredExplored != null) {
            for (long key : restoredExplored) addExplored(key);
            restoredExplored = null;
        }

        if (xaero && useXaeroMap.get()) {
            scan = newScan();
            phase = Phase.SCAN;
            phaseTicks = 0;
            log("Reading %d World Map regions", scan.pendingRegions());
        } else {
            beginSweep();
        }
    }

    /** State both modes start from: counters, view distance and swath width. */
    private void resetFlightState() {
        xaero = FabricLoader.getInstance().isModLoaded("xaeroworldmap");
        if (scan != null) scan.cancel();
        scan = null;
        follower.clear();
        speed = Math.hypot(mc.player.getVelocity().x, mc.player.getVelocity().z) * 20;
        lastX = mc.player.getX();
        lastZ = mc.player.getZ();
        flightDistance = restoredFlightDistance;
        activeTicks = restoredActiveTicks;
        restoredFlightDistance = 0;
        restoredActiveTicks = 0;
        mapCheckTicks = 0;
        nextProgressReport = 25;

        radius = viewDistance.get() > 0 ? viewDistance.get() : measureRadius();
        // Xaero leaves the outermost loaded ring undrawn; the real value gets measured in flight
        reach = xaero ? Math.max(1, radius - 1) : radius;
        Integer learned = learnedReach.get(reachKey());
        if (xaero && learned != null && learned != reach) {
            log("Using swath width %d learned in flight instead of %d from the view distance", learned, reach);
            reach = learned;
        }

        if (useElytraKeeper.get()) {
            ElytraKeeper keeper = Modules.get().get(ElytraKeeper.class);
            if (!keeper.isActive()) {
                keeper.toggle();
                startedKeeper = true;
            }
        }
        if (!mc.player.isGliding()) warning("You're not flying - take off and start your elytra fly module.");
    }

    private XaeroMappedChunkScan newScan() {
        return new XaeroMappedChunkScan(area.minCX(), area.minCZ(), area.maxCX(), area.maxCZ(), true);
    }

    /** Counts the chunk as explored, in the grid the planners use too. */
    private void addExplored(long key) {
        if (explored.add(key) && exploredGrid != null) exploredGrid.add(ChunkPos.getPackedX(key), ChunkPos.getPackedZ(key));
    }

    /** A map region got read (from memory or its file): its drawn chunks are explored. */
    private void onRegionRead(long region, LongArrayList mapped) {
        for (int i = 0; i < mapped.size(); i++) addExplored(mapped.getLong(i));
    }

    // Sweep

    private void tickScan() {
        // Xaero indexes its saved region files asynchronously. Waiting here is essential: before
        // the index is ready every distant region looks absent, which used to make a mostly mapped
        // large selection report 0% explored and plan a full-area sweep.
        if (!scan.regionIndexReady()) {
            phaseTicks = 0;
            return;
        }
        ChunkPos p = mc.player.getChunkPos();
        scan.focus(p.x, p.z);
        boolean done = scan.tick(this::onRegionRead);
        // Off as soon as the map around is read: the sweep starts there, and the rest is read in flight
        boolean aroundRead = scan.readAround(clampX(p.x), clampZ(p.z), NEAR_REGIONS);
        if (!done && !aroundRead && ++phaseTicks < SCAN_TIMEOUT_TICKS) return;

        if (done) {
            log("Map read: %s", scan.summary());
            scan = null;
        } else {
            // The sweep is re-planned at every strip (loop) with what's been read by then, and once more when it's all in
            log("Map read around you, %d regions to go, read in flight: %s", scan.pendingRegions(), scan.summary());
        }
        beginSweep();
    }

    /** The chunk column of the area nearest the given one: where the sweep starts from outside it. */
    private int clampX(int chunkX) {
        return MathHelper.clamp(chunkX, area.minCX(), area.maxCX());
    }

    private int clampZ(int chunkZ) {
        return MathHelper.clamp(chunkZ, area.minCZ(), area.maxCZ());
    }

    private void beginSweep() {
        phase = Phase.SWEEP;
        report("Exploring (highlight)%dx%d(default) chunks, view distance (highlight)%d(default), strip spacing (highlight)%d(default). (highlight)%d%%(default) %s.",
            area.width(), area.depth(), radius, spacing(), percent(),
            scan != null ? "explored so far - the rest of the World Map is read in flight, the route and time shrink as it comes in" : "already explored");
        planSweep();
        if (phase == Phase.SWEEP) reportEstimate();
    }

    /** Plans the sweep over everything still blank, from where the player is, counting flown strips as done. */
    private void planSweep() {
        if (pattern.get() == Pattern.Contour) {
            planLoop();
            return;
        }
        planGeneration++;
        pendingSweep = null;
        long started = System.nanoTime();
        ChunkGrid done = planGrid(true, false);
        long gridDone = System.nanoTime();
        List<Segment> plan = CoveragePlanner.sweep(area, reach, overlap.get(), done, playerChunkX(), playerChunkZ());
        if (plan.isEmpty()) {
            startSettle();
            return;
        }
        long sweepDone = System.nanoTime();
        setRoute(plan, done, CoveragePlanner.ORDERED_AHEAD);
        long took = System.nanoTime() - started;
        notePlan("planning the sweep", took);
        log("Sweep planned: %d strips, %.0f blocks, in %d ms (grid %d, strips %d, route %d)", plan.size(),
            follower.remainingDistance(mc.player.getX(), mc.player.getZ()), took / 1_000_000,
            (gridDone - started) / 1_000_000, (sweepDone - gridDone) / 1_000_000, (System.nanoTime() - sweepDone) / 1_000_000);
    }

    /**
     * {@link #planSweep} with the strips worked out in the background, for the re-plan after each
     * strip. The old route is followed meanwhile: the new one is in a tick or two later.
     */
    private void planSweepInBackground() {
        if (pattern.get() == Pattern.Contour) {
            planLoop();
            return;
        }
        long started = System.nanoTime();
        ChunkGrid done = planGrid(true, false).copy();
        int generation = ++planGeneration;
        Area planArea = area;
        int planReach = reach, planOverlap = overlap.get();
        double fromX = playerChunkX(), fromZ = playerChunkZ();
        long prepareNanos = System.nanoTime() - started;
        pendingSweep = CompletableFuture.supplyAsync(() -> {
            long planStarted = System.nanoTime();
            List<Segment> plan = CoveragePlanner.sweep(planArea, planReach, planOverlap, done, fromX, fromZ);
            return new PlannedSweep(generation, plan, done, prepareNanos, System.nanoTime() - planStarted);
        }, PLANNER);
    }

    /**
     * Takes the background plan once it's ready. True while one is still being worked out: the old
     * route's ends mean nothing then.
     */
    private boolean awaitPlannedSweep() {
        if (pendingSweep == null) return false;
        if (!pendingSweep.isDone()) return true;
        CompletableFuture<PlannedSweep> future = pendingSweep;
        pendingSweep = null;
        PlannedSweep planned;
        try {
            planned = future.join();
        } catch (CompletionException | CancellationException e) {
            FILE_LOG.error("Planning the sweep in the background failed", e);
            planSweep();
            return false;
        }
        if (planned.generation() != planGeneration) return false;
        if (planned.plan().isEmpty()) {
            startSettle();
            return false;
        }
        long started = System.nanoTime();
        setRoute(planned.plan(), planned.done(), CoveragePlanner.ORDERED_AHEAD);
        long onTick = planned.prepareNanos() + System.nanoTime() - started;
        notePlan("planning the sweep", onTick);
        log("Sweep planned: %d strips, %.0f blocks, in %d ms in the background, %d ms on the game thread", planned.plan().size(),
            follower.remainingDistance(mc.player.getX(), mc.player.getZ()), planned.planNanos() / 1_000_000, onTick / 1_000_000);
        return false;
    }

    /**
     * What the planners count as done, as a grid over the area: the explored chunks, with the swaths
     * of the strips flown this sweep and / or the ground flown over. Rebuilt for every plan from
     * {@link #exploredGrid}: copying its bits is quick, adding a big map's chunks one by one took 10 ms.
     */
    private ChunkGrid planGrid(boolean withFlownStrips, boolean withFlownOver) {
        if (planGrid == null || !planGrid.area().equals(area)) planGrid = new ChunkGrid(area);
        if (exploredGrid == null || !exploredGrid.area().equals(area)) {
            exploredGrid = new ChunkGrid(area);
            exploredGrid.addAll(explored);
        }
        planGrid.setTo(exploredGrid);
        if (withFlownStrips) {
            for (int[] s : flownStrips) planGrid.addRect(Math.min(s[0], s[2]) - reach, Math.min(s[1], s[3]) - reach, Math.max(s[0], s[2]) + reach, Math.max(s[1], s[3]) + reach);
        }
        if (withFlownOver) planGrid.addAll(flownOver);
        return planGrid;
    }

    private void tickSweep() {
        if (scan != null) {
            scan.focus(mc.player.getChunkPos().x, mc.player.getChunkPos().z);
            if (++phaseTicks % 200 == 0) log("Reading the World Map in flight: %d regions to go, %d%% explored so far", scan.pendingRegions(), percent());
        }
        if (scan != null && scan.tick(this::onRegionRead)) {
            // The map read at the start has finished: plan again without what turned out drawn
            log("Map read: %s", scan.summary());
            scan = null;
            endStrip(false);
            planSweep();
            if (phase == Phase.SWEEP) {
                int eta = etaSeconds();
                report("World Map read in full: (highlight)%d%%(default) explored%s.", percent(),
                    eta < 0 ? "" : ", about (highlight)%s(default) left plus a short cleanup".formatted(formatDuration(eta)));
            }
            return;
        }
        if (pattern.get() == Pattern.Contour) {
            tickLoop();
            return;
        }
        if (awaitPlannedSweep()) return;

        if (onStrip) {
            ChunkPos p = mc.player.getChunkPos();
            stripPath.put(stripAlongX ? p.x : p.z, stripAlongX ? p.z : p.x);
        }

        Point reached = follower.update(mc.player.getX(), mc.player.getZ(), arriveBlocks());
        if (reached != null) {
            if (reached.sweep()) {
                endStrip(true);
                // Re-plan after every strip. The just-flown swath is now covered, and starting
                // again from this endpoint keeps the explorer working through nearby blank ground
                // instead of following a stale global route and returning to this pocket later.
                planSweepInBackground();
                return;
            }
            if (follower.isDone()) {
                startSettle();
                return;
            }
            if (follower.current().sweep()) beginStrip();
        }

        if (onStrip && xaero && ++measureTicks >= MEASURE_INTERVAL_TICKS) {
            measureTicks = 0;
            measureStrip();
        }
    }

    // Contour pattern

    /** Plans the next loop round the blank ground nearest the player. Nothing left for a loop: on to the cleanup. */
    private void planLoop() {
        long started = System.nanoTime();
        ChunkGrid done = planGrid(false, true);
        long open = ContourPlanner.openCells(area, done);
        // A loop that left as much blank as before won't do better a second time
        if (contourOpen >= 0 && open >= contourOpen && ++idleLoops >= 2) {
            log("Loops stopped making progress, %d chunks left for the cleanup", open);
            startSettle();
            return;
        }
        if (open < contourOpen) idleLoops = 0;
        contourOpen = open;

        List<double[]> loop = ContourPlanner.nextLoop(area, reach, overlap.get(), done, playerChunkX(), playerChunkZ());
        if (loop.isEmpty()) {
            startSettle();
            return;
        }
        List<Point> points = new ArrayList<>(loop.size());
        for (int i = 0; i < loop.size(); i++) points.add(new Point(loop.get(i)[0] * 16 + 8, loop.get(i)[1] * 16 + 8, i > 0));
        follower.setRoute(points, mc.player.getX(), mc.player.getZ());
        onStrip = false;
        long took = System.nanoTime() - started;
        notePlan("planning a loop", took);
        log("Loop planned: %d points, %.0f blocks, %d chunks blank, in %d ms", points.size(), follower.remainingDistance(mc.player.getX(), mc.player.getZ()), open, took / 1_000_000);
    }

    private void tickLoop() {
        markFlownOver();
        follower.update(mc.player.getX(), mc.player.getZ(), arriveBlocks());
        // Once round, plan the next loop from what is explored now: it lands just inside this one
        if (follower.isDone()) planLoop();
    }

    /** Everything within reach of the player counts as done for the next loop, before the map has caught up. */
    private void markFlownOver() {
        ChunkPos p = mc.player.getChunkPos();
        if (p.toLong() == lastFlownChunk) return;
        lastFlownChunk = p.toLong();
        for (int cx = Math.max(area.minCX(), p.x - reach); cx <= Math.min(area.maxCX(), p.x + reach); cx++) {
            for (int cz = Math.max(area.minCZ(), p.z - reach); cz <= Math.min(area.maxCZ(), p.z + reach); cz++) flownOver.add(ChunkPos.toLong(cx, cz));
        }
    }

    /** Blocks still to fly in the sweep: the rest of the route, plus for loops a guess at the ones to come. */
    private double sweepBlocksLeft() {
        return sweepBlocksLeft(mc.player.getX(), mc.player.getZ());
    }

    /** The same from the given spot - where we were dropped, while off the server. */
    private double sweepBlocksLeft(double x, double z) {
        double blocks = follower.remainingDistance(x, z);
        if (phase == Phase.SWEEP && pattern.get() == Pattern.Contour && contourOpen > 0) {
            // Covering blank ground takes about its size over the strip spacing in flight
            blocks = Math.max(blocks, contourOpen / (double) spacing() * 16);
        }
        return blocks;
    }

    private void beginStrip() {
        Point from = follower.previous(), to = follower.current();
        int x1 = chunk(from.x()), z1 = chunk(from.z()), x2 = chunk(to.x()), z2 = chunk(to.z());
        stripAlongX = z1 == z2;
        stripV = stripAlongX ? z1 : x1;
        stripStartU = stripAlongX ? x1 : z1;
        stripEndU = stripAlongX ? x2 : z2;
        onStrip = true;
        measureTicks = 0;
        stripPath.clear();
        stripNumber++;
        stripStartTicks = activeTicks;
        stripMeasureNote = xaero ? "not measured" : "no map to measure on";

        // The side with more blank ground is the one this strip's width shows on
        stripSide = 0;
        stripPre.clear();
        if (!xaero) {
            logStripStart();
            return;
        }
        int lo = Math.min(stripStartU, stripEndU), hi = Math.max(stripStartU, stripEndU);
        int plus = 0, minus = 0;
        for (int u = lo; u <= hi; u++) {
            for (int k = 1; k <= 2 * reach; k++) {
                if (inArea(u, stripV + k) && !explored.contains(stripKey(u, stripV + k))) plus++;
                if (inArea(u, stripV - k) && !explored.contains(stripKey(u, stripV - k))) minus++;
            }
        }
        if (plus == 0 && minus == 0) {
            stripMeasureNote = "no blank ground beside it to measure on";
            logStripStart();
            return;
        }
        stripSide = plus >= minus ? 1 : -1;
        // From a bit behind the line too: the player may fly off it to the other side
        for (int u = lo; u <= hi; u++) {
            for (int k = -4; k <= MAX_MEASURED_RADIUS + 4 && inArea(u, stripV + stripSide * k); k++) {
                long key = stripKey(u, stripV + stripSide * k);
                if (explored.contains(key)) stripPre.add(key);
            }
        }
        logStripStart();
    }

    private void logStripStart() {
        log("Strip %d: %d chunks along %s at %s %d, swath %d, blank side %s", stripNumber, Math.abs(stripEndU - stripStartU) + 1,
            stripAlongX ? "X" : "Z", stripAlongX ? "chunk Z" : "chunk X", stripV, reach, stripSide == 0 ? "none" : stripSide > 0 ? "+" : "-");
    }

    /** Records the current strip as flown: all of it, or up to where the player is now. */
    private void endStrip(boolean complete) {
        if (!onStrip) return;
        onStrip = false;
        int to = stripEndU;
        if (!complete) {
            int dir = Integer.signum(stripEndU - stripStartU);
            int pu = stripAlongX ? mc.player.getChunkPos().x : mc.player.getChunkPos().z;
            if ((pu - stripStartU) * dir <= 0) {
                log("Strip %d left before getting onto it", stripNumber);
                return; // not started on it yet
            }
            if ((pu - stripEndU) * dir < 0) to = pu;
        }
        flownStrips.add(stripAlongX ? new int[]{stripStartU, stripV, to, stripV} : new int[]{stripV, stripStartU, stripV, to});
        double seconds = (activeTicks - stripStartTicks) / 20.0;
        int flown = Math.abs(to - stripStartU) + 1;
        log("Strip %d %s: %d of %d chunks in %.0f s (%.0f blocks/s), %s", stripNumber, complete ? "done" : "cut short", flown,
            Math.abs(stripEndU - stripStartU) + 1, seconds, seconds > 0 ? flown * 16 / seconds : 0, stripMeasureNote);
    }


    /**
     * Measures how wide the part of the current strip flown so far got drawn (the map has had a few
     * seconds to catch up on it), so a wrong width is caught on the very first strip.
     */
    private void measureStrip() {
        if (stripSide == 0) return;
        int dir = Integer.signum(stripEndU - stripStartU);
        if (dir == 0) return;
        int pu = stripAlongX ? mc.player.getChunkPos().x : mc.player.getChunkPos().z;
        int behind = Math.max(REACH_SAMPLE_BEHIND, (int) Math.ceil(speed * MAP_LAG_SECONDS / 16));
        int flownTo = pu - dir * behind;
        if ((flownTo - stripStartU) * dir < 16) {
            // Too little flown yet. Many such strips in a row mean the width never gets checked.
            stripMeasureNote = "too short to measure (needs %d chunks flown, the last %d don't count as the map lags)".formatted(16 + behind, behind);
            return;
        }
        int measured = measureSwath(Math.min(stripStartU, flownTo), Math.max(stripStartU, flownTo));
        stripMeasureNote = measured < 0 ? "width not measured: " + swathStats : "width measured %d (%s)".formatted(measured, swathStats);
        applyReach(measured);
    }

    /**
     * Width drawn beside the current strip between u = from and u = to: the median of how many
     * chunks in a row got drawn on its blank side, counted from the row the player was actually on,
     * or -1 without enough good samples. A low percentile would plan for the spots where the map
     * lagged, putting every strip only a couple of rows past the drawn edge while the far side drew
     * twice that.
     */
    private int measureSwath(int from, int to) {
        IntArrayList widths = new IntArrayList();
        int unknownSamples = 0, blankSamples = 0;
        for (int u = from; u <= to; u++) {
            if (!stripPath.containsKey(u)) continue;
            int base = stripPath.get(u);
            int k = 0;
            boolean unknown = false;
            while (k < MAX_MEASURED_RADIUS) {
                int v = base + stripSide * (k + 1);
                if (!inArea(u, v) || stripPre.contains(stripKey(u, v))) {
                    unknown = true; // hit the area edge or old ground: can't tell how far it would have reached
                    break;
                }
                int cx = stripAlongX ? u : v, cz = stripAlongX ? v : u;
                int state = XaeroMappedChunkScan.mapState(cx, cz);
                if (state == XaeroMappedChunkScan.UNKNOWN) {
                    unknown = true; // region not in memory right now, not the edge of the swath
                    break;
                }
                if (state != XaeroMappedChunkScan.MAPPED) break;
                k++;
            }
            // Zero means that spot didn't get drawn at all, not a narrow swath
            if (!unknown && k > 0) widths.add(k);
            else if (unknown) unknownSamples++;
            else blankSamples++;
        }
        if (widths.size() < MIN_REACH_SAMPLES) {
            swathStats = "only %d good samples of %d needed (%d at old ground / map not in memory, %d not drawn at all)"
                .formatted(widths.size(), MIN_REACH_SAMPLES, unknownSamples, blankSamples);
            return -1;
        }

        widths.sort(null);
        swathStats = "%d samples, lowest %d, 10%% %d, median %d, 90%% %d, highest %d; %d unknown, %d not drawn".formatted(widths.size(),
            widths.getInt(0), widths.getInt(widths.size() / 10), widths.getInt(widths.size() / 2), widths.getInt(widths.size() * 9 / 10),
            widths.getInt(widths.size() - 1), unknownSamples, blankSamples);
        // Can't draw further than the server sends; guards the spacing against any bad reading
        return Math.min(widths.getInt(widths.size() / 2), Math.max(1, radius));
    }

    /**
     * A narrower swath than planned leaves gaps, a wider one puts the strip off-centre, close to the
     * drawn edge: either way the rest of the sweep is re-planned right away.
     */
    private void applyReach(int measured) {
        if (measured < 1) return;
        learnedReach.put(reachKey(), measured);
        if (measured == reach) return;

        log("Swath width %d -> %d chunks, re-planning the rest of the sweep", reach, measured);
        reach = measured;
        endStrip(false);
        planSweep();
    }

    private boolean inArea(int u, int v) {
        return stripAlongX ? area.contains(u, v) : area.contains(v, u);
    }

    private long stripKey(int u, int v) {
        return stripAlongX ? ChunkPos.toLong(u, v) : ChunkPos.toLong(v, u);
    }

    /** Server (or singleplayer) plus dimension: what the learned swath width belongs to. */
    private String reachKey() {
        var server = mc.getCurrentServerEntry();
        String where = server != null ? server.address : "singleplayer";
        return where + "|" + mc.world.getRegistryKey().getValue();
    }

    // Cleanup

    /**
     * After a pass: head for the nearest chunk still blank - where the cleanup most likely starts -
     * while the map catches up, then read it again.
     */
    private void startSettle() {
        onStrip = false;
        if (scan != null) scan.cancel(); // a read still going from before; a fresh one comes after the wait
        scan = null;
        phase = Phase.SETTLE;
        phaseTicks = 0;

        ChunkPos p = mc.player.getChunkPos();
        int bestX = Math.floorDiv(area.minCX() + area.maxCX(), 2), bestZ = Math.floorDiv(area.minCZ() + area.maxCZ(), 2);
        long bestDist = Long.MAX_VALUE;
        for (int cx = area.minCX(); cx <= area.maxCX(); cx++) {
            for (int cz = area.minCZ(); cz <= area.maxCZ(); cz++) {
                if (explored.contains(ChunkPos.toLong(cx, cz))) continue;
                long d = (long) (cx - p.x) * (cx - p.x) + (long) (cz - p.z) * (cz - p.z);
                if (d < bestDist) {
                    bestDist = d;
                    bestX = cx;
                    bestZ = cz;
                }
            }
        }
        follower.setRoute(List.of(new Point(blockCentre(bestX), blockCentre(bestZ), false)), mc.player.getX(), mc.player.getZ());
    }

    private void tickSettle() {
        follower.update(mc.player.getX(), mc.player.getZ(), arriveBlocks());
        phaseTicks++;
        if (scan == null) {
            if (phaseTicks < (xaero ? SETTLE_TICKS : SETTLE_TICKS_NO_MAP)) return;
            if (!xaero) {
                planCleanup();
                return;
            }
            scan = newScan();
            return;
        }

        boolean done = scan.tick(this::onRegionRead);
        if (!done && phaseTicks < SETTLE_TICKS + SCAN_TIMEOUT_TICKS) return;
        scan.cancel();
        scan = null;
        planCleanup();
    }

    private void planCleanup() {
        long missing = area.total() - explored.size();
        if (missing <= 0 || cleanupPass >= cleanupPasses.get()) {
            finish();
            return;
        }
        cleanupPass++;

        // Spots are passed within the arrive distance, so each one covers that much less
        int slack = (int) Math.ceil(arriveBlocks() / 16);
        cleanupRadius = Math.max(0, reach - 1 - slack);
        spotCheckTicks = 0;
        long started = System.nanoTime();
        ChunkGrid done = planGrid(false, false);
        List<Segment> spots = CoveragePlanner.cleanup(area, cleanupRadius, done, playerChunkX(), playerChunkZ());
        phase = Phase.CLEANUP;
        setRoute(spots, done, Integer.MAX_VALUE);
        long took = System.nanoTime() - started;
        notePlan("planning the cleanup", took);
        log("Cleanup pass %d planned: %d spots, radius %d, %.0f blocks, in %d ms", cleanupPass, spots.size(), cleanupRadius,
            follower.remainingDistance(mc.player.getX(), mc.player.getZ()), took / 1_000_000);

        int eta = etaSeconds();
        report("%s: (highlight)%d(default) chunks still blank, picking them up at (highlight)%d(default) spots%s.",
            cleanupPass == 1 ? "Sweep done" : "Cleanup pass " + cleanupPass, missing, spots.size(),
            eta < 0 ? "" : ", about (highlight)%s(default)".formatted(formatDuration(eta)));
    }

    private void tickCleanup() {
        follower.update(mc.player.getX(), mc.player.getZ(), arriveBlocks());
        // Spots whose chunks got drawn on the way (flying past nearby) aren't worth the detour
        if (++spotCheckTicks >= MAP_CHECK_INTERVAL_TICKS) {
            spotCheckTicks = 0;
            while (!follower.isDone() && !spotHasOpen(follower.current())) follower.skip(mc.player.getX(), mc.player.getZ());
        }
        if (follower.isDone()) startSettle();
    }

    private boolean spotHasOpen(Point spot) {
        int x = chunk(spot.x()), z = chunk(spot.z());
        for (int cx = Math.max(area.minCX(), x - cleanupRadius); cx <= Math.min(area.maxCX(), x + cleanupRadius); cx++) {
            for (int cz = Math.max(area.minCZ(), z - cleanupRadius); cz <= Math.min(area.maxCZ(), z + cleanupRadius); cz++) {
                if (!explored.contains(ChunkPos.toLong(cx, cz))) return true;
            }
        }
        return false;
    }

    private void finish() {
        long missing = area.total() - explored.size();
        String took = formatDuration(activeTicks / 20);
        if (missing <= 0) report("Area fully explored in (highlight)%s(default).", took);
        else report("Done in (highlight)%s(default), (highlight)%d(default) chunks could not be loaded.", took, missing);
        area = null;
        turnOff();
        forgetSession();
        leaveServer();
    }

    /** The player's totem popping: something is attacking. Comes on the network thread. */
    @EventHandler
    private void onPacket(PacketEvent.Receive event) {
        if (!leaveOnTotemPop.get() || reconnecting || phase == Phase.IDLE) return;
        if (!(event.packet instanceof EntityStatusS2CPacket packet) || packet.getStatus() != EntityStatuses.USE_TOTEM_OF_UNDYING) return;
        if (mc.world == null || mc.player == null || packet.getEntity(mc.world) != mc.player) return;
        mc.execute(this::leaveAfterTotemPop);
    }

    /** Stops for good: off (the run is saved), off the server, and no reconnecting - ours is off with the module, and no disconnect screen for Meteor's to act on. */
    private void leaveAfterTotemPop() {
        if (!isActive() || mc.world == null || mc.player == null) return;
        BlockPos pos = mc.player.getBlockPos();
        String why = "Totem popped at %d, %d, %d with %.0f health left - left the server and won't reconnect."
            .formatted(pos.getX(), pos.getY(), pos.getZ(), mc.player.getHealth());
        FILE_LOG.warn(why);
        turnOff();
        if (mc.world == null) return;
        mc.world.disconnect();
        mc.disconnect(new NoticeScreen(() -> mc.setScreen(new MultiplayerScreen(new TitleScreen())),
            Text.literal("Area Explorer"), Text.literal(why)));
    }

    /** Leaves the server once done, with leave-on-finish. */
    private void leaveServer() {
        if (!leaveOnFinish.get() || mc.world == null || mc.isInSingleplayer()) return;
        log("Leaving the server");
        // After this tick: other listeners of it still expect a world
        mc.send(() -> {
            if (mc.world == null) return;
            mc.world.disconnect();
            mc.disconnect(new MultiplayerScreen(new TitleScreen()));
        });
    }

    // Shared

    /**
     * @param done what the plan was made with as done: transit legs keep off it where they can
     * @param bendAhead legs given a bend round mapped ground, from the start - a sweep is planned again after every strip, so only its first legs get flown
     */
    private void setRoute(List<Segment> plan, ChunkGrid done, int bendAhead) {
        List<Point> points = new ArrayList<>();
        ChunkPos playerChunk = mc.player.getChunkPos();
        int fromX = playerChunk.x, fromZ = playerChunk.z;
        // Outside the area counts as mapped: nothing to pick up there
        CoveragePlanner.ChunkTest mapped = (cx, cz) -> !area.contains(cx, cz) || done.test(cx, cz);
        for (int i = 0; i < plan.size(); i++) {
            Segment s = plan.get(i);
            if (i < bendAhead) addBlankTransitBend(points, fromX, fromZ, s.x1(), s.z1(), mapped);
            points.add(new Point(blockCentre(s.x1()), blockCentre(s.z1()), false));
            if (!s.isSpot()) points.add(new Point(blockCentre(s.x2()), blockCentre(s.z2()), true));
            fromX = s.x2();
            fromZ = s.z2();
        }
        follower.setRoute(points, mc.player.getX(), mc.player.getZ());
        onStrip = false;
    }

    /**
     * A direct diagonal between two useful pieces can cut across a large mapped island. Try both
     * axis-aligned alternatives and add their corner as a transit waypoint when either one is
     * cheaper after mapped chunks are penalised. This is intentionally only one bend: it keeps
     * steering smooth and cannot explode in memory even for very large selected areas.
     */
    private void addBlankTransitBend(List<Point> points, int fromX, int fromZ, int toX, int toZ, CoveragePlanner.ChunkTest mapped) {
        if (fromX == toX || fromZ == toZ) return;

        double direct = CoveragePlanner.transitCost(fromX, fromZ, toX, toZ, mapped);

        double xFirst = CoveragePlanner.transitCost(fromX, fromZ, toX, fromZ, mapped)
            + CoveragePlanner.transitCost(toX, fromZ, toX, toZ, mapped);
        double zFirst = CoveragePlanner.transitCost(fromX, fromZ, fromX, toZ, mapped)
            + CoveragePlanner.transitCost(fromX, toZ, toX, toZ, mapped);
        double best = Math.min(xFirst, zFirst);
        if (best + 1e-6 >= direct) return;

        int bendX = xFirst <= zFirst ? toX : fromX;
        int bendZ = xFirst <= zFirst ? fromZ : toZ;
        points.add(new Point(blockCentre(bendX), blockCentre(bendZ), false));
    }

    /** Picks up chunks around the player that the map has drawn by now. */
    private void checkMapAroundPlayer() {
        if (!xaero || ++mapCheckTicks < MAP_CHECK_INTERVAL_TICKS) return;
        mapCheckTicks = 0;
        ChunkPos p = mc.player.getChunkPos();
        int r = radius + MAP_CHECK_EXTRA;
        for (int cx = Math.max(area.minCX(), p.x - r); cx <= Math.min(area.maxCX(), p.x + r); cx++) {
            for (int cz = Math.max(area.minCZ(), p.z - r); cz <= Math.min(area.maxCZ(), p.z + r); cz++) {
                long key = ChunkPos.toLong(cx, cz);
                if (!explored.contains(key) && XaeroMappedChunkScan.mapState(cx, cz) == XaeroMappedChunkScan.MAPPED) addExplored(key);
            }
        }
    }

    // Auto markers

    /** Block -> waypoint name for everything the markers look for right now, or empty with them off. */
    private Map<Block, String> markerBlocks() {
        Map<Block, String> wanted = new HashMap<>();
        if (!autoMarkers.get()) return wanted;
        for (Block block : customMarkerBlocks.get()) wanted.put(block, block.getName().getString());
        for (Marker marker : Marker.values()) {
            if (!markerToggles.get(marker).get()) continue;
            for (Block block : Registries.BLOCK) {
                if (marker.blocks.test(block)) wanted.put(block, marker.title);
            }
        }
        return wanted;
    }

    /** Chunks already loaded around the player when exploring starts: the event won't come for them. */
    private void scanLoadedChunksForMarkers() {
        Map<Block, String> wanted = markerBlocks();
        if (wanted.isEmpty() && !markingBases()) return;
        ChunkPos p = mc.player.getChunkPos();
        int r = measureRadius() + 1;
        for (int cx = p.x - r; cx <= p.x + r; cx++) {
            for (int cz = p.z - r; cz <= p.z + r; cz++) {
                WorldChunk chunk = mc.world.getChunkManager().getWorldChunk(cx, cz);
                if (chunk != null) scanChunkForMarkers(chunk, wanted);
            }
        }
    }

    private boolean markingBases() {
        return autoMarkers.get() && markBases.get();
    }

    private boolean markingItems() {
        return autoMarkers.get() && markItems.get();
    }

    /** A group's waypoint colour. */
    private static ColorSetting colorSetting(String name, String group, SettingColor color, IVisible visible) {
        return new ColorSetting.Builder()
            .name(name)
            .description("Waypoint colour of the " + group + " group. Xaero rounds it to the nearest of its 16 colours.")
            .defaultValue(color)
            .visible(visible)
            .build();
    }

    /**
     * Drops a waypoint on the first block of each wanted kind in the chunk, unless one with that name
     * is already close, and records its base clues for the base check.
     */
    private void scanChunkForMarkers(WorldChunk chunk, Map<Block, String> wanted) {
        boolean bases = markingBases();
        Map<Block, BaseClues.Clue> clues = bases ? BaseClues.blockClues(mc.world.getRegistryKey()) : Map.of();
        BaseClues.Chunk baseChunk = new BaseClues.Chunk();
        Map<String, BlockPos> found = new HashMap<>();
        ChunkSection[] sections = chunk.getSectionArray();
        int baseX = chunk.getPos().getStartX(), baseZ = chunk.getPos().getStartZ();
        for (int i = 0; i < sections.length; i++) {
            ChunkSection section = sections[i];
            if (section.isEmpty()) continue;
            if (bases && section.hasAny(BaseClues::isStructureSign)) baseChunk.markStructure();
            // The palette says cheaply whether a section has any of the blocks at all
            if (!section.hasAny(state -> wanted.containsKey(state.getBlock())
                || (bases && (clues.containsKey(state.getBlock()) || state.getBlock() instanceof ChestBlock || BaseClues.isVillagePath(state))))) continue;
            int baseY = ChunkSectionPos.getBlockCoord(chunk.sectionIndexToCoord(i));
            for (int y = 0; y < 16; y++) {
                for (int z = 0; z < 16; z++) {
                    for (int x = 0; x < 16; x++) {
                        BlockState state = section.getBlockState(x, y, z);
                        String name = wanted.get(state.getBlock());
                        if (name != null) found.putIfAbsent(name, new BlockPos(baseX + x, baseY + y, baseZ + z));
                        if (!bases) continue;
                        BaseClues.Clue clue = clues.get(state.getBlock());
                        // One half of each pair, so a double chest counts once; single chests say nothing
                        if (clue == null && state.getBlock() instanceof ChestBlock && state.get(ChestBlock.CHEST_TYPE) == ChestType.LEFT) {
                            clue = BaseClues.Clue.DOUBLE_CHEST;
                        }
                        if (clue != null) baseChunk.addBlock(clue, baseX + x, baseY + y, baseZ + z);
                        else if (BaseClues.isVillagePath(state)) baseChunk.addVillagePath();
                    }
                }
            }
        }
        found.forEach(this::placeMarker);

        if (!bases) return;
        long key = chunk.getPos().toLong();
        BaseClues.Chunk old = baseChunks.get(key);
        if (old != null) baseChunk.keepEntitiesOf(old);
        if (baseChunk.isEmpty()) {
            baseChunks.remove(key);
            return;
        }
        baseChunks.put(key, baseChunk);
        checkBase(chunk.getPos());
    }

    /** Scores the entities around the player that aren't scored yet. Entities don't come with the chunk, so they're polled. */
    private void scanBaseEntities() {
        if (!markingBases() || ++baseEntityCheckTicks < BASE_ENTITY_CHECK_INTERVAL_TICKS) return;
        baseEntityCheckTicks = 0;
        RegistryKey<World> dimension = mc.world.getRegistryKey();
        LongOpenHashSet changed = new LongOpenHashSet();
        for (Entity entity : mc.world.getEntities()) {
            BaseClues.Clue clue = BaseClues.entityClue(entity, dimension);
            if (clue == null || !scoredEntities.add(entity.getUuid())) continue;
            long key = entity.getChunkPos().toLong();
            baseChunks.computeIfAbsent(key, k -> new BaseClues.Chunk()).addEntity(clue, entity.getBlockPos());
            changed.add(key);
        }
        changed.forEach(key -> checkBase(new ChunkPos(key)));
    }

    /** The known chunks with base clues whose centres are within the given distance of the chunk's (plus half a chunk's diagonal, so chunks partly inside count). */
    private List<BaseClues.Chunk> chunksAround(ChunkPos around, int blocks) {
        int chunkR = (blocks + 15) >> 4;
        long reach2 = (long) (blocks + 11) * (blocks + 11);
        List<BaseClues.Chunk> chunks = new ArrayList<>();
        for (int cx = around.x - chunkR; cx <= around.x + chunkR; cx++) {
            for (int cz = around.z - chunkR; cz <= around.z + chunkR; cz++) {
                long dx = (cx - around.x) * 16L, dz = (cz - around.z) * 16L;
                if (dx * dx + dz * dz > reach2) continue;
                BaseClues.Chunk chunk = baseChunks.get(ChunkPos.toLong(cx, cz));
                if (chunk != null) chunks.add(chunk);
            }
        }
        return chunks;
    }

    /** What's within the base radius of the chunk, scored, with structures looked for further out: a village spreads far past its bell. */
    private BaseClues.Score scoreAround(ChunkPos around) {
        boolean structure = BaseClues.nearStructure(chunksAround(around, baseRadius.get() + STRUCTURE_REACH));
        return BaseClues.score(chunksAround(around, baseRadius.get()), structure);
    }

    /**
     * A place around the chunk that scores enough becomes a candidate: it's marked only if it still
     * does a few seconds later, once the chunks and villagers around have come in - often the ones
     * that show it's a village.
     */
    private void checkBase(ChunkPos around) {
        BaseClues.Score score = scoreAround(around);
        if (score.total() < baseScore.get() || baseCandidates.containsKey(around.toLong())) return;
        baseCandidates.put(around.toLong(), baseTicks);
        log("Base candidate near %d, %d, score %.0f: %s", score.centre().getX(), score.centre().getZ(), score.total(), score.summary());
    }

    private void confirmBaseCandidates() {
        baseTicks++;
        if (baseCandidates.isEmpty() || baseTicks % 20 != 0) return;
        for (long key : new LongArrayList(baseCandidates.keySet())) {
            if (baseTicks - baseCandidates.get(key) < BASE_CONFIRM_TICKS) continue;
            baseCandidates.remove(key);
            BaseClues.Score score = scoreAround(new ChunkPos(key));
            if (score.total() >= baseScore.get()) markBase(score);
            else log("Base candidate near %d, %d dropped on the recheck, score %.0f now: %s", score.centre().getX(), score.centre().getZ(), score.total(), score.summary());
        }
    }

    /** Marks the base unless it has its marker already. */
    private void markBase(BaseClues.Score score) {
        int r = baseRadius.get();
        BlockPos centre = score.centre();
        long spacing = Math.max(markerSpacing.get(), r);
        List<XaeroWaypoints.Spot> existing = existingMarkers();
        int number = 0;
        for (XaeroWaypoints.Spot spot : existing) {
            if (!spot.name().startsWith(BASE_PREFIX)) continue;
            try {
                number = Math.max(number, Integer.parseInt(spot.name().substring(BASE_PREFIX.length()).trim()));
            } catch (NumberFormatException ignored) {
            }
            if (near(spot, centre, spacing)) return; // this base already has its marker
        }

        String name = BASE_PREFIX + (number + 1);
        addMarker(BASES_GROUP, name, "B" + (number + 1), "star", basesColor.get(), centre);
        int points = (int) Math.round(score.total());
        report("Marked (highlight)%s(default) at (highlight)%d, %d, %d(default), score (highlight)%d(default): %s.",
            name, centre.getX(), centre.getY(), centre.getZ(), points, score.summary());

        if (!basesToFile.get()) return;
        basesFound++;
        baseLog.append(entryLine(basesFound, centre, name)).append(SIGN_INDENT).append("score ").append(points).append(": ").append(score.summary()).append("\n\n");
        foundFileDirty = true;
        archiveFind(new FindsArchive.Find(FindsArchive.Kind.BASE, centre.getX(), centre.getY(), centre.getZ(), LocalDateTime.now(),
            name, 0, "", "score " + points + ": " + score.summary()));
    }

    private void placeMarker(String name, BlockPos pos) {
        for (XaeroWaypoints.Spot spot : existingMarkers()) {
            if (spot.name().equals(name) && near(spot, pos, markerSpacing.get())) return;
        }

        Marker kind = null;
        for (Marker marker : Marker.values()) {
            if (marker.title.equals(name)) kind = marker;
        }
        if (kind != null) addMarker(kind.group, name, initials(name), kind.icon, markerColors.get(kind).get(), pos);
        else addMarker(CUSTOM_GROUP, name, initials(name), "star", customColor.get(), pos);
        report("Marked (highlight)%s(default) at (highlight)%d, %d, %d(default).", name, pos.getX(), pos.getY(), pos.getZ());
        // Into the all-finds file too, and so to the site
        archiveFind(new FindsArchive.Find(FindsArchive.Kind.MARKER, pos.getX(), pos.getY(), pos.getZ(), LocalDateTime.now(), name, 0, "", ""));
    }

    /** Servers whose earlier markers were taken from Xaero's waypoints this session. */
    private static final Set<String> MARKERS_IMPORTED = new HashSet<>();

    /**
     * The markers dropped before they went into the all-finds file - End Portals, Shulker Boxes,
     * custom blocks... - taken from Xaero's waypoints of every dimension of this server, once a
     * session; what's in already is skipped. With site-sync they go to the site like any find.
     */
    private void importMarkerWaypoints() {
        if (!allFinds.get() || mc.world == null || !toXaero()) return;
        String server = archiveSpot().server();
        if (!MARKERS_IMPORTED.add(server)) return;
        Set<String> titles = new HashSet<>();
        for (Marker marker : Marker.values()) titles.add(marker.title);
        for (Block block : customMarkerBlocks.get()) titles.add(block.getName().getString());

        Map<String, List<FindsArchive.Find>> byDimension = new HashMap<>();
        for (XaeroWaypoints.Saved w : XaeroWaypoints.allOnServer()) {
            if (!titles.contains(w.name()) && !CUSTOM_GROUP.equals(w.set())) continue;
            LocalDateTime found = w.createdAt() > 0
                ? LocalDateTime.ofInstant(java.time.Instant.ofEpochMilli(w.createdAt()), java.time.ZoneId.systemDefault())
                : LocalDateTime.now();
            byDimension.computeIfAbsent(w.dimension(), d -> new ArrayList<>())
                .add(new FindsArchive.Find(FindsArchive.Kind.MARKER, w.x(), w.y(), w.z(), found, w.name(), 0, "", ""));
        }
        byDimension.forEach((dimension, finds) -> {
            ArchiveSpot spot = archiveSpot(dimension);
            withArchive(spot, archive -> {
                int added = 0;
                for (FindsArchive.Find find : finds) {
                    if (!archive.add(find)) continue;
                    added++;
                    if (spot.site() != null) SITE.add(spot.scope(), find);
                }
                if (added == 0) return;
                FILE_LOG.info("Markers: %d earlier ones of %s taken from Xaero's waypoints".formatted(added, spot.dimension()));
                int count = added;
                mc.execute(() -> report("Took (highlight)%d(default) earlier markers of %s from Xaero's waypoints into the all-finds file%s.",
                    count, FindsArchive.prettyName(spot.dimension()), spot.site() != null ? " and the site" : ""));
            });
        });
    }

    /**
     * Items lying close together: one marker for the lot, named after what's in it -
     * "Loot: Elytra, Shulker Box ×2, Netherite Helmet +3".
     */
    private static final class LootPile {
        final BlockPos first;
        final Map<Item, Integer> counts = new HashMap<>();
        /** Where the best item lies: the marker goes on it. */
        BlockPos best;
        int bestRank = Integer.MAX_VALUE;
        int quietScans;

        LootPile(BlockPos first) {
            this.first = first;
        }
    }

    /** Items closer than this to a pile's first one are part of it. */
    private static final int LOOT_RADIUS = 16;
    /** Item scans a pile has to go without a new item before it's marked: the entities around come in over a few seconds. */
    private static final int LOOT_SETTLE_SCANS = 5;
    private static final String LOOT_PREFIX = "Loot: ";
    /** Kinds named in a pile's marker; the rest are "+N". */
    private static final int LOOT_NAMED_KINDS = 3;
    private final List<LootPile> lootPiles = new ArrayList<>();

    /** Puts an item found on the ground into the pile it lies by, or starts one. */
    private void addToLoot(List<LootPile> piles, Item item, int count, BlockPos pos) {
        LootPile pile = null;
        for (LootPile p : piles) {
            if (p.first.isWithinDistance(pos, LOOT_RADIUS)) pile = p;
        }
        if (pile == null) piles.add(pile = new LootPile(pos));
        pile.counts.merge(item, count, Integer::sum);
        pile.quietScans = 0;
        int rank = lootRank(item);
        if (rank < pile.bestRank) {
            pile.bestRank = rank;
            pile.best = pos;
        }
    }

    /** Marks the piles nothing has been added to for a while; all of them with {@code all}. */
    private void markLootPiles(boolean all) {
        for (Iterator<LootPile> it = lootPiles.iterator(); it.hasNext(); ) {
            LootPile pile = it.next();
            if (!all && ++pile.quietScans < LOOT_SETTLE_SCANS) continue;
            it.remove();
            placeLootMarker(pile, true);
        }
    }

    /** The pile's marker, unless there's one for loot here already; true if it got one. */
    private boolean placeLootMarker(LootPile pile, boolean announce) {
        for (XaeroWaypoints.Spot spot : existingMarkers()) {
            if (spot.name().startsWith(LOOT_PREFIX) && near(spot, pile.best, 2L * LOOT_RADIUS)) return false;
        }
        List<Map.Entry<Item, Integer>> kinds = new ArrayList<>(pile.counts.entrySet());
        kinds.sort(Comparator.<Map.Entry<Item, Integer>>comparingInt(e -> lootRank(e.getKey()))
            .thenComparing(Map.Entry.<Item, Integer>comparingByValue().reversed()));
        StringBuilder name = new StringBuilder(LOOT_PREFIX);
        for (int i = 0; i < kinds.size() && i < LOOT_NAMED_KINDS; i++) {
            if (i > 0) name.append(", ");
            name.append(kinds.get(i).getKey().getName().getString());
            if (kinds.get(i).getValue() > 1) name.append(" ×").append(kinds.get(i).getValue());
        }
        if (kinds.size() > LOOT_NAMED_KINDS) name.append(" +").append(kinds.size() - LOOT_NAMED_KINDS);

        BlockPos pos = pile.best;
        addMarker(ITEMS_GROUP, name.toString(), initials(kinds.getFirst().getKey().getName().getString()), "square", itemsColor.get(), pos);
        if (announce) report("Marked (highlight)%s(default) on the ground at (highlight)%d, %d, %d(default).", name, pos.getX(), pos.getY(), pos.getZ());
        return true;
    }

    /** What {@link #lootMarkersFromFile} did: piles marked, piles marked already, items whose kind wasn't known. */
    public record LootImport(int marked, int known, int unknownItems) {}

    /**
     * Loot markers for the items in the all-finds file of this server and dimension, grouped into piles
     * like the ones found in flight. Piles with a loot marker close by already are skipped, so it can
     * be run again. The file is read on the files thread; {@code done} gets the result on the game thread.
     * False if there's no file to read: all-finds-file off, or no world.
     */
    public boolean lootMarkersFromFile(java.util.function.Consumer<LootImport> done) {
        // Names as the file has them: the client's names of the items
        Map<String, Item> byName = new HashMap<>();
        for (Item item : Registries.ITEM) byName.putIfAbsent(item.getName().getString(), item);
        return withArchive(archive -> {
            List<FindsArchive.Find> items = archive.finds(FindsArchive.Kind.ITEM);
            mc.execute(() -> {
                if (mc.world == null) return;
                List<LootPile> piles = new ArrayList<>();
                int unknown = 0;
                for (FindsArchive.Find f : items) {
                    Item item = byName.get(f.name());
                    if (item == null) {
                        unknown++;
                        continue;
                    }
                    addToLoot(piles, item, Math.max(1, f.count()), new BlockPos(f.x(), f.y(), f.z()));
                }
                int marked = 0;
                for (LootPile pile : piles) if (placeLootMarker(pile, false)) marked++;
                done.accept(new LootImport(marked, piles.size() - marked, unknown));
            });
        });
    }

    /** Elytra first, then shulker boxes, then netherite armour, then the rest in the items list's order. */
    private int lootRank(Item item) {
        if (item == Items.ELYTRA) return 0;
        if (Block.getBlockFromItem(item) instanceof ShulkerBoxBlock) return 1;
        if (item == Items.NETHERITE_HELMET || item == Items.NETHERITE_CHESTPLATE || item == Items.NETHERITE_LEGGINGS || item == Items.NETHERITE_BOOTS) return 2;
        int index = savedItemKinds.get().indexOf(item);
        return 3 + (index < 0 ? savedItemKinds.get().size() : index);
    }

    private static boolean near(XaeroWaypoints.Spot spot, BlockPos pos, long distance) {
        long dx = spot.x() - pos.getX(), dz = spot.z() - pos.getZ();
        return dx * dx + dz * dz <= distance * distance;
    }

    /** Xaero's Minimap waypoints when it's picked and running, Meteor's otherwise. */
    private boolean toXaero() {
        if (markerTarget.get() != MarkerTarget.Xaero) return false;
        FabricLoader loader = FabricLoader.getInstance();
        if (!loader.isModLoaded("xaerominimap") && !loader.isModLoaded("xaerobetterpvp")) {
            if (!warnedNoMinimap) warning("Xaero's Minimap isn't installed - markers go to Meteor waypoints.");
            warnedNoMinimap = true;
            return false;
        }
        return XaeroWaypoints.isReady();
    }

    /** The Xaero waypoint set a group's markers go into: its own with group-sets, marker-list otherwise. */
    private String markerList(String group) {
        if (groupSets.get()) return group;
        String name = markerListName.get().trim();
        return name.isEmpty() ? "Area Explorer" : name;
    }

    /**
     * Moves the markers made before groups (all in marker-list) to their groups' Xaero sets, in every
     * dimension of this server, coloured as their group. Told by the name: "Base #3", "Loot: ...", a
     * marker's ("End Portal"), a picked item's; anything else in the list was a custom block.
     * Returns how many moved, -1 if Xaero's Minimap isn't there to move them in.
     */
    public int regroupMarkers() {
        if (!toXaero()) return -1;
        String from = markerListName.get().trim().isEmpty() ? "Area Explorer" : markerListName.get().trim();
        Map<String, XaeroWaypoints.Target> byName = new HashMap<>();
        for (Item item : savedItemKinds.get()) byName.put(item.getName().getString(), new XaeroWaypoints.Target(ITEMS_GROUP, itemsColor.get().getPacked()));
        for (Block block : customMarkerBlocks.get()) byName.put(block.getName().getString(), new XaeroWaypoints.Target(CUSTOM_GROUP, customColor.get().getPacked()));
        for (Marker marker : Marker.values()) byName.put(marker.title, new XaeroWaypoints.Target(marker.group, markerColors.get(marker).get().getPacked()));
        XaeroWaypoints.Target bases = new XaeroWaypoints.Target(BASES_GROUP, basesColor.get().getPacked());
        XaeroWaypoints.Target loot = new XaeroWaypoints.Target(ITEMS_GROUP, itemsColor.get().getPacked());
        XaeroWaypoints.Target custom = new XaeroWaypoints.Target(CUSTOM_GROUP, customColor.get().getPacked());
        return XaeroWaypoints.regroup(from, name -> {
            if (name.startsWith(BASE_PREFIX)) return bases;
            if (name.startsWith(LOOT_PREFIX)) return loot;
            return byName.getOrDefault(name, custom);
        });
    }

    /** Markers already there in the current dimension, whichever list they go to. */
    private List<XaeroWaypoints.Spot> existingMarkers() {
        if (toXaero()) return XaeroWaypoints.current();
        List<XaeroWaypoints.Spot> spots = new ArrayList<>();
        Dimension dimension = PlayerUtils.getDimension();
        for (Waypoint w : Waypoints.get()) {
            if (w.dimension.get() == dimension) spots.add(new XaeroWaypoints.Spot(w.name.get(), w.pos.get().getX(), w.pos.get().getZ()));
        }
        return spots;
    }

    private void addMarker(String group, String name, String initials, String icon, SettingColor color, BlockPos pos) {
        if (toXaero() && XaeroWaypoints.add(markerList(group), name, initials, pos.getX(), pos.getY(), pos.getZ(), color.getPacked(), !markersEnabled.get())) return;

        Waypoint waypoint = new Waypoint.Builder()
            .name(name)
            .icon(icon)
            .pos(pos)
            .dimension(PlayerUtils.getDimension())
            .build();
        waypoint.color.set(new SettingColor(color));
        // Set before adding: adding saves the list
        waypoint.visible.set(markersEnabled.get());
        Waypoints.get().add(waypoint);
    }

    /** What Xaero shows inside the waypoint: the first letters of the first two words, "EP" for End Portal. */
    private static String initials(String name) {
        StringBuilder sb = new StringBuilder();
        for (String word : name.trim().split("\\s+")) {
            if (!word.isEmpty() && sb.length() < 2) sb.appendCodePoint(word.codePointAt(0));
        }
        return sb.toString().toUpperCase(Locale.ROOT);
    }

    // Signs

    private void scanLoadedChunksForSigns() {
        if (!saveSigns.get()) return;
        ChunkPos p = mc.player.getChunkPos();
        int r = measureRadius() + 1;
        for (int cx = p.x - r; cx <= p.x + r; cx++) {
            for (int cz = p.z - r; cz <= p.z + r; cz++) {
                WorldChunk chunk = mc.world.getChunkManager().getWorldChunk(cx, cz);
                if (chunk != null) scanChunkForSigns(chunk);
            }
        }
    }

    /** Writes every sign in the chunk with any text on it that isn't written yet. */
    private void scanChunkForSigns(WorldChunk chunk) {
        StringBuilder out = signLog;
        int before = out.length();
        for (BlockEntity be : chunk.getBlockEntities().values()) {
            if (!(be instanceof SignBlockEntity sign)) continue;
            BlockPos pos = sign.getPos();
            if (savedSigns.contains(pos.asLong())) continue;
            String front = signText(sign.getFrontText()), back = signText(sign.getBackText());
            if (front.isEmpty() && back.isEmpty()) continue;
            savedSigns.add(pos.asLong());

            String kind = sign.getCachedState().getBlock().getName().getString();
            out.append(entryLine(savedSigns.size(), pos, kind));
            if (back.isEmpty()) out.append(FindsArchive.signBox(front, null));
            else if (front.isEmpty()) out.append(FindsArchive.signBox(back, "back"));
            else out.append(FindsArchive.signBox(front, "front")).append(FindsArchive.signBox(back, "back"));
            out.append('\n');
            archiveFind(new FindsArchive.Find(FindsArchive.Kind.SIGN, pos.getX(), pos.getY(), pos.getZ(), LocalDateTime.now(), kind, 0, back, front));

            if (signsInChat.get()) info("Sign at (highlight)%d, %d, %d(default): %s", pos.getX(), pos.getY(), pos.getZ(),
                String.join(" | ", (front.isEmpty() ? back : front).lines().toList()));
        }
        if (out.length() > before) foundFileDirty = true;
    }

    /** "#12   X 1234      Y 64    Z -5678       Oak Sign · 18:31:05" */
    private static String entryLine(int number, BlockPos pos, String what) {
        return entryLine(number, pos, what, LocalTime.now());
    }

    private static String entryLine(int number, BlockPos pos, String what, LocalTime time) {
        return "#%-5d X %-9d Y %-5d Z %-9d %s · %s\n".formatted(number, pos.getX(), pos.getY(), pos.getZ(),
            what, time.format(SIGN_TIME));
    }

    /**
     * Items go in the order they're picked in the items list - in the items' section and in the file
     * name. One taken off the list since it was found goes last.
     */
    private int itemRank(Item item) {
        int rank = savedItemKinds.get().indexOf(item);
        return rank < 0 ? Integer.MAX_VALUE : rank;
    }

    /** The items' section, numbered in the order it's sorted in. */
    private String itemLog() {
        List<FoundItem> sorted = new ArrayList<>(foundItems);
        sorted.sort(Comparator.comparingInt(found -> itemRank(found.item())));
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < sorted.size(); i++) {
            FoundItem found = sorted.get(i);
            sb.append(entryLine(i + 1, found.pos(), found.what(), found.time()));
        }
        return sb.toString();
    }

    /** "2 bases, 3 signs, 1 item" - bases only once found, items only with item saving on. */
    private String foundSummary() {
        String signs = savedSigns.size() + (savedSigns.size() == 1 ? " sign" : " signs");
        if (basesFound > 0) signs = basesFound + (basesFound == 1 ? " base, " : " bases, ") + signs;
        if (!saveItems.get() && savedItems.isEmpty()) return signs;
        return signs + ", " + savedItems.size() + (savedItems.size() == 1 ? " item" : " items");
    }

    // Items on the ground

    /**
     * Writes and marks the picked items lying around the player that aren't written or marked yet.
     * Entities don't come with the chunk, so they're polled.
     */
    private void scanItems() {
        boolean save = saveItems.get(), mark = markingItems();
        if ((!save && !mark) || ++itemCheckTicks < ITEM_CHECK_INTERVAL_TICKS) return;
        itemCheckTicks = 0;
        List<Item> kinds = savedItemKinds.get();
        if (kinds.isEmpty()) return;

        int before = foundItems.size();
        for (Entity entity : mc.world.getEntities()) {
            if (!(entity instanceof ItemEntity itemEntity)) continue;
            ItemStack stack = itemEntity.getStack();
            if (stack.isEmpty() || !kinds.contains(stack.getItem())) continue;

            BlockPos pos = entity.getBlockPos();
            if (mark && markedItems.add(entity.getUuid())) addToLoot(lootPiles, stack.getItem(), stack.getCount(), pos);
            if (!save || !savedItems.add(entity.getUuid())) continue;

            // Diamond ×12 "Renamed one"
            String what = stack.getItem().getName().getString() + " ×" + stack.getCount();
            if (stack.contains(DataComponentTypes.CUSTOM_NAME)) what += " \"" + Formatting.strip(stack.getName().getString()) + "\"";
            foundItems.add(new FoundItem(stack.getItem(), pos, what, LocalTime.now()));
            itemCounts.merge(stack.getItem(), stack.getCount(), Integer::sum);
            String label = stack.contains(DataComponentTypes.CUSTOM_NAME) ? Formatting.strip(stack.getName().getString()) : "";
            archiveFind(new FindsArchive.Find(FindsArchive.Kind.ITEM, pos.getX(), pos.getY(), pos.getZ(), LocalDateTime.now(),
                stack.getItem().getName().getString(), stack.getCount(), label, ""));

            if (itemsInChat.get()) info("Item at (highlight)%d, %d, %d(default): %s", pos.getX(), pos.getY(), pos.getZ(), what);
        }
        if (foundItems.size() > before) foundFileDirty = true;
        if (mark) markLootPiles(false);
    }

    /** The sign's non-blank lines, one per line, or empty. */
    private static String signText(SignText text) {
        List<String> lines = new ArrayList<>(4);
        for (Text line : text.getMessages(false)) {
            String s = Formatting.strip(line.getString()); // legacy § colour codes some servers put in
            s = s == null ? "" : s.strip();
            if (!s.isEmpty()) lines.add(s);
        }
        return String.join("\n", lines);
    }

    /** The file's heading: what server and dimension it's from and when the run started. */
    private String signFileHeader(String server) {
        List<String> found = new ArrayList<>();
        if (markingBases() && basesToFile.get()) found.add("BASES");
        if (saveSigns.get()) found.add("SIGNS");
        if (saveItems.get()) found.add("ITEMS");
        String what = found.isEmpty() ? "FINDS" : found.size() == 1 ? found.getFirst()
            : String.join(", ", found.subList(0, found.size() - 1)) + " AND " + found.getLast();
        List<String> rows = List.of(
            what + " FOUND BY AREA EXPLORER",
            "",
            "Server:      " + server,
            "Dimension:   " + FindsArchive.prettyName(mc.world.getRegistryKey().getValue().getPath()),
            "Started:     " + LocalDateTime.now().format(SIGN_DATE_TIME)
        );
        int width = 50;
        for (String row : rows) width = Math.max(width, row.length());

        StringBuilder sb = new StringBuilder("╔").append("═".repeat(width + 4)).append("╗\n");
        for (String row : rows) sb.append("║  ").append(row).append(" ".repeat(width - row.length())).append("  ║\n");
        return sb.append("╚").append("═".repeat(width + 4)).append("╝\n\n").toString();
    }

    /**
     * "2 bases, 2 elytra, 1 shulker box, 12 diamond - " for the start of the file name: bases, then
     * the items in the items list's order; empty with nothing of that found.
     */
    private String itemCountPrefix() {
        if (itemCounts.isEmpty() && basesFound == 0) return "";
        List<Map.Entry<Item, Integer>> counts = new ArrayList<>(itemCounts.entrySet());
        counts.sort(Comparator.<Map.Entry<Item, Integer>>comparingInt(e -> itemRank(e.getKey()))
            .thenComparing(Map.Entry.<Item, Integer>comparingByValue().reversed()));
        StringBuilder sb = new StringBuilder();
        if (basesFound > 0) sb.append(basesFound).append(basesFound == 1 ? " base" : " bases").append(counts.isEmpty() ? "" : ", ");
        for (int i = 0; i < counts.size(); i++) {
            // Keeps the name short enough for Windows
            if (i == MAX_NAMED_ITEM_KINDS) {
                sb.append(", +").append(counts.size() - i).append(" more");
                break;
            }
            if (i > 0) sb.append(", ");
            // Item ids are safe in a file name already: "shulker_box" -> "shulker box"
            sb.append(counts.get(i).getValue()).append(' ').append(Registries.ITEM.getId(counts.get(i).getKey()).getPath().replace('_', ' '));
        }
        return sb.append(" - ").toString();
    }

    /** Writes the whole file again: heading, the bases, the signs, the items on the ground under them, and the footer if given. */
    private void writeFoundFile(String footer) {
        if (signWriteFailed) return;
        try {
            if (signFile == null) {
                var server = mc.getCurrentServerEntry();
                String where = server != null ? server.address : "singleplayer";
                String dimension = mc.world.getRegistryKey().getValue().getPath();
                Path dir = FabricLoader.getInstance().getGameDir().resolve("onfocus").resolve("signs").resolve(fileSafe(where));
                Files.createDirectories(dir);
                fileBaseName = LocalDateTime.now().format(SIGN_FILE_TIME) + "_" + fileSafe(dimension) + ".txt";
                signFile = dir.resolve(itemCountPrefix() + fileBaseName);
                fileHeader = signFileHeader(server != null ? server.address : "Singleplayer");
                report("Saving finds to (highlight)%s(default).", signFile);
            } else {
                // The name tells what items it holds, so it changes as they're found
                Path renamed = signFile.resolveSibling(itemCountPrefix() + fileBaseName);
                if (!renamed.equals(signFile)) {
                    if (Files.exists(signFile)) Files.move(signFile, renamed, StandardCopyOption.REPLACE_EXISTING);
                    signFile = renamed;
                }
            }
            StringBuilder text = new StringBuilder(fileHeader);
            if (basesFound > 0) text.append(FindsArchive.sectionTitle("BASES", basesFound)).append(baseLog);
            if (saveSigns.get() || !savedSigns.isEmpty()) text.append(FindsArchive.sectionTitle("SIGNS", savedSigns.size())).append(signLog);
            // Each sign ends with a blank line already, so the items' title sits apart from them
            if (saveItems.get() || !savedItems.isEmpty()) text.append(FindsArchive.sectionTitle("ITEMS ON THE GROUND", savedItems.size())).append(itemLog()).append('\n');
            if (footer != null) text.append(footer);
            Files.writeString(signFile, text, StandardCharsets.UTF_8, StandardOpenOption.CREATE,
                StandardOpenOption.TRUNCATE_EXISTING, StandardOpenOption.WRITE);
        } catch (IOException e) {
            signWriteFailed = true;
            error("Couldn't write the sign file: %s", e.getMessage());
            FILE_LOG.error("Writing signs failed", e);
        }
    }

    /** Writes the run's file if it has new finds, and the all-finds file every so often. */
    private void tickFindFiles() {
        if (foundFileDirty && ++foundFileTicks >= FOUND_FILE_INTERVAL_TICKS) flushFoundFile();
        if (++archiveTicks >= ARCHIVE_INTERVAL_TICKS) {
            archiveTicks = 0;
            // In case Xaero's waypoints weren't there yet when the run started
            importMarkerWaypoints();
            flushArchive();
            syncSite();
        }
    }

    private void flushFoundFile() {
        foundFileTicks = 0;
        if (!foundFileDirty) return;
        foundFileDirty = false;
        writeFoundFile(null);
    }

    /** The all-finds files of the server and dimension we're in: their folder, the server and the dimension. */
    /** {@code site}: the site to send finds to, or null with site-sync off. */
    private record ArchiveSpot(Path dir, String server, String dimension, String site) {
        Path key() {
            return dir.resolve(dimension);
        }

        SiteSync.Scope scope() {
            return new SiteSync.Scope(server.toLowerCase(Locale.ROOT), dimension);
        }
    }

    private ArchiveSpot archiveSpot() {
        return archiveSpot(mc.world.getRegistryKey().getValue().getPath());
    }

    /** The all-finds files of the server we're on, for a dimension by its name ("the_nether"). */
    private ArchiveSpot archiveSpot(String dimension) {
        var server = mc.getCurrentServerEntry();
        String where = server != null ? server.address : "singleplayer";
        Path dir = FabricLoader.getInstance().getGameDir().resolve("onfocus").resolve("signs").resolve(fileSafe(where));
        return new ArchiveSpot(dir, server != null ? server.address : "Singleplayer", fileSafe(dimension), siteTarget());
    }

    /** Runs the action on the files thread with the archive, loaded first - with the earlier runs' files taken in - if it isn't yet. */
    private boolean withArchive(java.util.function.Consumer<FindsArchive> action) {
        if (!allFinds.get() || mc.world == null) return false;
        return withArchive(archiveSpot(), action);
    }

    /** {@link #withArchive(java.util.function.Consumer)} for the archive of any dimension of this server. */
    private boolean withArchive(ArchiveSpot spot, java.util.function.Consumer<FindsArchive> action) {
        if (!allFinds.get()) return false;
        FILES.execute(() -> {
            try {
                FindsArchive archive = ARCHIVES.get(spot.key());
                if (archive == null) {
                    Files.createDirectories(spot.dir());
                    archive = FindsArchive.load(spot.dir(), spot.server(), spot.dimension());
                    int before = archive.size();
                    int imported = archive.importRunFiles(spot.dir(), spot.dimension());
                    ARCHIVES.put(spot.key(), archive);
                    FILE_LOG.info("All finds: %d in %s, %d new from the runs' files".formatted(before, archive.textFile(), imported));
                    if (imported > 0) {
                        Path file = archive.textFile();
                        mc.execute(() -> report("Took (highlight)%d(default) finds of earlier runs into (highlight)%s(default), no repeats.", imported, file));
                    }
                }
                // The site gets the finds from before it was set up too, once
                if (spot.site() != null && SITE_BACKFILLED.add(spot.key() + " " + spot.site())) {
                    int queued = SITE.backfill(spot.scope(), archive, spot.site());
                    if (queued > 0) FILE_LOG.info("Site: %d earlier finds of %s queued for %s".formatted(queued, spot.key(), spot.site()));
                }
                action.accept(archive);
            } catch (IOException | RuntimeException e) {
                FILE_LOG.error("All finds file failed", e);
            }
        });
        return true;
    }

    private void archiveFind(FindsArchive.Find find) {
        boolean toSite = siteTarget() != null;
        SiteSync.Scope scope = mc.world != null ? archiveSpot().scope() : null;
        withArchive(archive -> {
            // Only what's new: the site would skip the rest anyway
            if (archive.add(find) && toSite) SITE.add(scope, find);
        });
    }

    /** The site's address with site-sync on and set up, else null. */
    private String siteTarget() {
        if (!siteSync.get()) return null;
        String url = siteUrl.get().trim();
        return url.isEmpty() || siteToken.get().isBlank() ? null : url;
    }

    /**
     * Sends the run's status, and the finds waiting, to the site (on the files thread). Problems
     * reaching it are said in chat once each, not every time.
     */
    private void syncSite() {
        String site = siteTarget();
        if (site == null) return;
        String token = siteToken.get().trim();
        JsonObject status = mc.world != null && mc.player != null ? siteStatus() : null;
        SiteSync.Scope scope = mc.world != null ? archiveSpot().scope() : null;
        FILES.execute(() -> {
            if (status != null) SITE.setStatus(scope, status);
            SITE.flush(site, token, problem -> {
                FILE_LOG.warn("Site: " + problem);
                mc.execute(() -> warning("Site: %s", problem));
            });
        });
        syncMap(site, token, scope);
    }

    /** Keeps Xaero's map of this server going to the site: every dimension it has a map of. */
    private void syncMap(String site, String token, SiteSync.Scope scope) {
        if (!mapSync.get() || !xaero || scope == null) {
            MAP.stop();
            return;
        }
        List<MapSync.Target> targets = new ArrayList<>();
        for (XaeroMapFolders.CacheFolder folder : XaeroMapFolders.cacheFolders()) {
            targets.add(new MapSync.Target(scope.server(), folder.dimension(), folder.folder()));
        }
        if (targets.isEmpty()) return; // Xaero hasn't worked the world out yet: next time
        MAP.update(site, token, targets,
            problem -> {
                FILE_LOG.warn("Site map: " + problem);
                mc.execute(() -> warning("Site: %s", problem));
            },
            message -> {
                FILE_LOG.info(message);
                mc.execute(() -> report(message));
            });
    }

    /** How the run is going, for the site's live card. */
    private JsonObject siteStatus() {
        JsonObject status = new JsonObject();
        status.addProperty("player", mc.getSession().getUsername());
        status.addProperty("phase", phase.name());
        status.addProperty("mode", mode.get().name());
        status.addProperty("paused", paused);
        status.addProperty("x", (int) Math.floor(mc.player.getX()));
        status.addProperty("y", (int) Math.floor(mc.player.getY()));
        status.addProperty("z", (int) Math.floor(mc.player.getZ()));
        if (area != null && phase != Phase.SPIRAL && phase != Phase.IDLE) {
            status.addProperty("percent", explored.size() * 100.0 / area.total());
            JsonObject box = new JsonObject();
            box.addProperty("minX", area.minCX() * 16);
            box.addProperty("minZ", area.minCZ() * 16);
            box.addProperty("maxX", area.maxCX() * 16 + 15);
            box.addProperty("maxZ", area.maxCZ() * 16 + 15);
            status.add("area", box);
        }
        int eta = phase == Phase.IDLE ? -1 : etaSeconds();
        if (eta >= 0) status.addProperty("etaSeconds", eta);
        JsonObject found = new JsonObject();
        found.addProperty("bases", basesFound);
        found.addProperty("signs", savedSigns.size());
        found.addProperty("items", savedItems.size());
        status.add("runFinds", found);
        return status;
    }

    /** Writes every all-finds file with anything new (on the files thread): ones of other dimensions too, and with no world. */
    private void flushArchive() {
        List<String> order = new ArrayList<>();
        for (Item item : savedItemKinds.get()) order.add(item.getName().getString());
        FILES.execute(() -> {
            for (FindsArchive archive : ARCHIVES.values()) {
                archive.setItemOrder(order);
                if (!archive.isDirty()) continue;
                try {
                    archive.write();
                } catch (IOException e) {
                    FILE_LOG.error("Writing the all finds file failed", e);
                }
            }
        });
    }

    /** Server addresses have ':' in them, which Windows doesn't allow in a file name. */
    private static String fileSafe(String name) {
        return name.replaceAll("[^A-Za-z0-9._-]", "_");
    }

    @EventHandler
    private void onChunkData(ChunkDataEvent event) {
        // Possibly a queue or lobby: the chunks around the spot are scanned on getting back there
        if (reconnecting) return;
        long started = System.nanoTime();
        if (phase != Phase.IDLE && autoMarkers.get()) {
            Map<Block, String> wanted = markerBlocks();
            if (!wanted.isEmpty() || markingBases()) scanChunkForMarkers(event.chunk(), wanted);
        }
        if (phase != Phase.IDLE && saveSigns.get()) scanChunkForSigns(event.chunk());
        long took = System.nanoTime() - started;
        if (took >= SLOW_CHUNK_SCAN_NANOS) {
            log("Slow chunk scan: %d ms for chunk %d, %d (markers, bases, signs)", took / 1_000_000, event.chunk().getPos().x, event.chunk().getPos().z);
        }

        // Without the map, a chunk the server sent is explored
        if (xaero || area == null || phase == Phase.IDLE || phase == Phase.SPIRAL) return;
        ChunkPos pos = event.chunk().getPos();
        if (area.contains(pos.x, pos.z)) addExplored(pos.toLong());
    }

    @EventHandler
    private void onGameLeft(GameLeftEvent event) {
        if (phase == Phase.IDLE) return;
        if (reconnecting) {
            rejoinTicks = 0; // dropped again before getting back (a queue?): keep waiting
            return;
        }
        ServerInfo server = mc.getCurrentServerEntry();
        if (!autoReconnect.get() || server == null || mc.player == null) {
            // The area stays selected, so turning it back on after rejoining carries on
            turnOff();
            return;
        }

        // A kick and leaving by hand only tell apart by the next screen: tickReconnect sorts it out
        reconnecting = true;
        reconnectServer = server;
        leftDimension = mc.world.getRegistryKey();
        leftX = mc.player.getX();
        leftZ = mc.player.getZ();
        reconnectTicks = 0;
        reconnectTries = 0;
        rejoinTicks = 0;
        warnedElsewhere = false;
        if (holdForward.get()) mc.options.forwardKey.setPressed(false);
        if (phase == Phase.SWEEP) endStrip(false); // what's flown of it so far counts
        // Xaero's map closes with the connection: a read still going starts over on return
        rescanOnReturn = phase == Phase.SWEEP && scan != null;
        if (scan != null) scan.cancel();
        scan = null;
        // Should the game be closed now, it carries on next time
        saveSession();
        log("Disconnected from %s at %.0f, %.0f, waiting to reconnect", server.address, leftX, leftZ);
    }

    /** Off the server: reconnects after a kick, then waits to be back where we stopped before carrying on. */
    private void tickReconnect() {
        if (mc.world == null || mc.player == null) {
            rejoinTicks = 0;
            Screen screen = mc.currentScreen;
            // Left by hand, or backed out of the disconnect screen / a connect attempt
            if (screen instanceof TitleScreen || screen instanceof MultiplayerScreen) {
                log("Left the server - stopped exploring");
                turnOff();
                return;
            }
            // The game's disconnect screen (a kick, or an attempt that failed) makes way for ours, with
            // the countdown on it. Meteor's Auto Reconnect lives on the game's screen, so it stays out of it.
            if (screen instanceof DisconnectedScreen) {
                reconnectReason = disconnectReason(screen).replace('\n', ' ').strip();
                log("Disconnect screen: \"%s\"", reconnectReason);
                reconnectTicks = 0;
                if (reconnectAttempts.get() > 0 && reconnectTries >= reconnectAttempts.get()) {
                    String why = "Couldn't reconnect in %d attempts - stopped exploring. Last reason: %s".formatted(reconnectTries, reconnectReason);
                    log(why);
                    turnOff();
                    mc.setScreen(new NoticeScreen(() -> mc.setScreen(new MultiplayerScreen(new TitleScreen())),
                        Text.literal("Area Explorer"), Text.literal(why)));
                    return;
                }
                mc.setScreen(new ReconnectScreen(this::reconnectStatus,
                    () -> reconnectTicks = reconnectDelay.get() * 20, // connects on the next tick
                    () -> mc.setScreen(new MultiplayerScreen(new TitleScreen())))); // seen as leaving by hand below
                return;
            }
            // Anything else is a connection under way
            if (!(screen instanceof ReconnectScreen)) {
                reconnectTicks = 0;
                return;
            }
            if (++reconnectTicks < reconnectDelay.get() * 20) return;
            reconnectTicks = 0;
            reconnectTries++;
            ServerInfo server = reconnectServer;
            log("Reconnecting to %s, attempt %d", server.address, reconnectTries);
            mc.send(() -> ConnectScreen.connect(new MultiplayerScreen(new TitleScreen()), mc, ServerAddress.parse(server.address), server, false, null));
            return;
        }

        ServerInfo server = mc.getCurrentServerEntry();
        if (server == null || !server.address.equalsIgnoreCase(reconnectServer.address)) {
            warning("Joined another server - stopped exploring.");
            turnOff();
            return;
        }
        if (mc.currentScreen instanceof DownloadingTerrainScreen) return;
        if (!mc.world.getRegistryKey().equals(leftDimension)
            || Math.hypot(mc.player.getX() - leftX, mc.player.getZ() - leftZ) > MAX_REJOIN_DISTANCE) {
            rejoinTicks = 0;
            if (!warnedElsewhere) info("Back on the server, but not where exploring stopped (a queue?) - carrying on once you're back there.");
            warnedElsewhere = true;
            return;
        }
        if (++rejoinTicks >= REJOIN_SETTLE_TICKS) resumeAfterReconnect();
    }

    /** The reconnect screen's lines: when, why, and where the run stands. */
    private List<Text> reconnectStatus() {
        List<Text> lines = new ArrayList<>();
        if (!reconnecting || reconnectServer == null) {
            lines.add(Text.literal("Stopped exploring.").formatted(Formatting.GRAY));
            return lines;
        }
        int secondsLeft = Math.max(0, (reconnectDelay.get() * 20 - reconnectTicks + 19) / 20);
        lines.add(Text.literal("Reconnecting to ").append(Text.literal(reconnectServer.address).formatted(Formatting.YELLOW))
            .append(" in ").append(Text.literal(secondsLeft + " s").formatted(Formatting.YELLOW)));
        int limit = reconnectAttempts.get();
        lines.add(Text.literal("Attempt %d of %s".formatted(reconnectTries + 1, limit > 0 ? String.valueOf(limit) : "no limit")).formatted(Formatting.GRAY));
        lines.add(Text.empty());
        lines.add(Text.literal("Disconnected: ").formatted(Formatting.GRAY)
            .append(Text.literal(reconnectReason.isEmpty() ? "no reason given" : reconnectReason).formatted(Formatting.RED)));
        lines.add(Text.empty());
        lines.add(Text.literal(runProgressText()));
        lines.add(Text.literal("Carries on from %.0f, %.0f once you're back there - the run and the finds file are kept.".formatted(leftX, leftZ))
            .formatted(Formatting.GRAY));
        if (signFile != null) lines.add(Text.literal("Finds so far: " + foundSummary()).formatted(Formatting.GRAY));
        return lines;
    }

    /** "47% explored, about 9h 12m left" from where we were dropped, without the player. */
    private String runProgressText() {
        double speed = estimateSpeed();
        if (phase == Phase.SPIRAL) {
            int eta = spiralEtaSeconds(speed);
            return "Spiral %s out%s".formatted(formatBlocks(spiralExtent() * 16), eta < 0 ? "" : ", about %s left".formatted(formatDuration(eta)));
        }
        if (area == null) return "";
        String progress = "%d%% of the %dx%d chunk area explored".formatted(percent(), area.width(), area.depth());
        if ((phase != Phase.SWEEP && phase != Phase.CLEANUP) || speed < MIN_KNOWN_SPEED) return progress;
        return progress + ", about %s left%s".formatted(formatDuration((int) Math.ceil(sweepBlocksLeft(leftX, leftZ) / speed)),
            phase == Phase.SWEEP ? " plus a short cleanup" : "");
    }

    private void resumeAfterReconnect() {
        reconnecting = false;
        reconnectServer = null;
        lastX = mc.player.getX();
        lastZ = mc.player.getZ();
        lastFlownChunk = Long.MIN_VALUE;
        mapCheckTicks = 0;
        switch (phase) {
            case SCAN -> {
                scan = newScan();
                phaseTicks = 0;
            }
            case SWEEP -> {
                if (rescanOnReturn) scan = newScan();
                // Paused: it gets planned on resuming
                if (!paused) planSweep();
            }
            case SETTLE -> {
                phaseTicks = 0; // the map gets its time again, then is read afresh
                follower.restartLeg(mc.player.getX(), mc.player.getZ());
            }
            default -> follower.restartLeg(mc.player.getX(), mc.player.getZ());
        }
        rescanOnReturn = false;
        String back = "Back on the server after (highlight)%d(default) reconnect attempt%s - ".formatted(reconnectTries, reconnectTries == 1 ? "" : "s");
        // As an argument: the text has % in it
        info("%s", paused ? back + "still paused, press the bind to carry on." : back + timeLeftText());
        // Chunks that came in before we were back in place were skipped
        scanLoadedChunksForMarkers();
        scanLoadedChunksForSigns();
        if (!mc.player.isGliding()) warning("You're not flying - take off and start your elytra fly module.");
    }

    @EventHandler
    private void onTick(TickEvent.Pre event) {
        long start = System.nanoTime();
        boolean watching = phase != Phase.IDLE && !reconnecting && mc.world != null;
        if (watching) checkStall(start);
        tickWork = null;
        tickModule();

        long took = System.nanoTime() - start;
        if (watching && took >= SLOW_TICK_NANOS) {
            log("Slow tick: %d ms in %s%s", took / 1_000_000, phase, tickWork != null ? " - " + tickWork : "");
        }
        // Loading screens after a rejoin aren't stalls
        lastTickEnd = watching && phase != Phase.IDLE && !reconnecting ? System.nanoTime() : 0;
    }

    private void tickModule() {
        if (phase == Phase.IDLE) return;
        if (reconnecting) {
            tickReconnect();
            return;
        }
        if (mc.player == null || mc.world == null) return;

        tickStats();
        tickEstimate();
        scanItems();
        scanBaseEntities();
        confirmBaseCandidates();
        tickFindFiles();
        // In case the game goes down without turning the module off first
        if (!paused && ++sessionSaveTicks >= SESSION_SAVE_INTERVAL_TICKS) {
            sessionSaveTicks = 0;
            saveSession();
        }
        if (phase == Phase.SPIRAL) {
            if (paused) return;
            tickSpiral();
            if (phase != Phase.IDLE) steer();
            return;
        }

        checkMapAroundPlayer();
        if (explored.size() >= area.total()) {
            finish();
            return;
        }
        if (phase == Phase.SCAN) {
            tickScan();
            return;
        }
        if (paused) return;

        switch (phase) {
            case SWEEP -> tickSweep();
            case SETTLE -> tickSettle();
            case CLEANUP -> tickCleanup();
            default -> {}
        }
        if (phase != Phase.IDLE) steer();
    }

    // Debug log: what the module costs and how well it does, for tuning it

    /** A tick of ours taking this long shows in the game as a hitch. */
    private static final long SLOW_TICK_NANOS = 20_000_000L;
    /** Time between two ticks (50 ms normally, frames drawn in between) that is a freeze of the game. */
    private static final long STALL_NANOS = 300_000_000L;
    private static final int STATS_INTERVAL_TICKS = 60 * 20;
    /** One chunk's scan for markers, bases and signs taking this long: dozens of chunks come in a second at speed. */
    private static final long SLOW_CHUNK_SCAN_NANOS = 5_000_000L;
    private long lastTickEnd;
    /** What took time in the current tick, for the slow tick line. */
    private String tickWork;
    private long gcMillisAtLastTick = -1;
    // Counters of the last stats interval
    private int statTicks, statStripTicks, statPlans;
    private long statExplored, statPlanNanos, statPlanMaxNanos;
    private double statDistance, statLastX, statLastZ;

    /**
     * A long gap since our last tick ended: the game froze outside our tick (rendering, another
     * mod, garbage collection - the share of that is logged too). A freeze inside our tick is
     * logged as a slow tick instead.
     */
    private void checkStall(long now) {
        long gc = gcMillis();
        if (lastTickEnd != 0 && now - lastTickEnd >= STALL_NANOS) {
            log("Game froze for %d ms between ticks, %s spent in garbage collection, screen %s, phase %s",
                (now - lastTickEnd) / 1_000_000, gcMillisAtLastTick < 0 ? "?" : (gc - gcMillisAtLastTick) + " ms",
                mc.currentScreen == null ? "none" : mc.currentScreen.getClass().getSimpleName(), phase);
        }
        gcMillisAtLastTick = gc;
    }

    private static long gcMillis() {
        long total = 0;
        for (GarbageCollectorMXBean gc : ManagementFactory.getGarbageCollectorMXBeans()) total += Math.max(0, gc.getCollectionTime());
        return total;
    }

    /** Notes a plan's time for the slow tick line and the stats. */
    private void notePlan(String what, long nanos) {
        statPlans++;
        statPlanNanos += nanos;
        statPlanMaxNanos = Math.max(statPlanMaxNanos, nanos);
        tickWork = "%s %d ms".formatted(what, nanos / 1_000_000);
    }

    /** Once a minute: how fast it's going, how much of the flight does any good, what planning costs. */
    private void tickStats() {
        if (paused || phase == Phase.SCAN) return;
        double x = mc.player.getX(), z = mc.player.getZ();
        if (statTicks > 0) {
            double moved = Math.hypot(x - statLastX, z - statLastZ);
            if (moved < 50) statDistance += moved;
        } else {
            statExplored = explored.size();
        }
        statLastX = x;
        statLastZ = z;
        if (onStrip) statStripTicks++;
        if (++statTicks < STATS_INTERVAL_TICKS) return;

        String progress = phase == Phase.SPIRAL ? "spiral %s out".formatted(formatBlocks(spiralExtent() * 16))
            : "%d%% explored, +%d chunks".formatted(percent(), explored.size() - statExplored);
        log("Stats for the last minute: %s, %.0f blocks/s, %d%% of the time on strips, %d plans (average %d ms, longest %d ms), swath %d, spacing %d, phase %s%s",
            progress, statDistance * 20 / statTicks, statStripTicks * 100 / statTicks, statPlans,
            statPlans == 0 ? 0 : statPlanNanos / statPlans / 1_000_000, statPlanMaxNanos / 1_000_000, reach, spacing(), phase,
            scan != null ? ", %d map regions still to read".formatted(scan.pendingRegions()) : "");
        statTicks = statStripTicks = statPlans = 0;
        statPlanNanos = statPlanMaxNanos = 0;
        statDistance = 0;
    }

    /** The reason a disconnect screen shows ("Kicked for flying", "Timed out"...), found by type as its fields aren't ours to name. */
    private static String disconnectReason(Screen screen) {
        try {
            List<Object> values = new ArrayList<>();
            for (Class<?> c = screen.getClass(); c != null && c != Screen.class; c = c.getSuperclass()) {
                for (Field field : c.getDeclaredFields()) {
                    if (Modifier.isStatic(field.getModifiers())) continue;
                    field.setAccessible(true);
                    Object value = field.get(screen);
                    if (value != null) values.add(value);
                }
            }
            // The disconnection info is a record holding the reason; the button label is a bare text
            for (Object value : values) {
                if (!value.getClass().isRecord()) continue;
                for (RecordComponent component : value.getClass().getRecordComponents()) {
                    var accessor = component.getAccessor();
                    accessor.setAccessible(true);
                    if (accessor.invoke(value) instanceof Text text) return text.getString();
                }
            }
            for (Object value : values) {
                if (value instanceof Text text) return text.getString();
            }
        } catch (ReflectiveOperationException | RuntimeException ignored) {
        }
        return screen.getTitle().getString();
    }

    private void steer() {
        follower.steer(mc.player, rotationSpeed.get().floatValue());
        if (lockPitch.get()) mc.player.setPitch(pitch.get().floatValue());
        if (holdForward.get()) mc.options.forwardKey.setPressed(true);
    }

    /** Largest square ring of loaded chunks around the player, i.e. the effective server view distance. */
    private int measureRadius() {
        ChunkPos p = mc.player.getChunkPos();
        var cm = mc.world.getChunkManager();
        int r = 0;
        while (r < MAX_MEASURED_RADIUS) {
            int n = r + 1;
            if (!cm.isChunkLoaded(p.x + n, p.z) || !cm.isChunkLoaded(p.x - n, p.z)
                || !cm.isChunkLoaded(p.x, p.z + n) || !cm.isChunkLoaded(p.x, p.z - n)) break;
            r = n;
        }
        return Math.max(1, r);
    }

    private int spacing() {
        return CoveragePlanner.spacing(reach, overlap.get());
    }

    /** Distance at which a point counts as reached: faster flight turns wider, so it turns earlier. */
    private double arriveBlocks() {
        return Math.max(arriveDistance.get(), speed * TURN_LEAD_SECONDS);
    }

    private double playerChunkX() {
        return (mc.player.getX() - 8) / 16;
    }

    private double playerChunkZ() {
        return (mc.player.getZ() - 8) / 16;
    }

    private static double blockCentre(int chunk) {
        return (chunk << 4) + 8;
    }

    private static int chunk(double block) {
        return MathHelper.floor(block) >> 4;
    }

    // Spiral

    private void startSpiral() {
        resetFlightState();
        phase = Phase.SPIRAL;
        spiralCX = legCX = mc.player.getChunkPos().x;
        spiralCZ = legCZ = mc.player.getChunkPos().z;
        spiralMinX = spiralMaxX = spiralMinZ = spiralMaxZ = 0;
        spiralDir = 0;

        report("Spiralling out from (highlight)%d, %d(default), ring spacing (highlight)%d(default) chunks%s.",
            spiralCX << 4, spiralCZ << 4, spacing(),
            spiralMaxRadius.get() > 0 ? ", up to (highlight)%s(default)".formatted(formatBlocks(spiralMaxRadius.get())) : "");
        int eta = spiralEtaSeconds();
        if (eta >= 0) report("Estimated time: (highlight)~%s(default).", formatDuration(eta));

        nextSpiralLeg();
    }

    /** Pushes the side the spiral is heading to out by one spacing and flies to that corner. */
    private void nextSpiralLeg() {
        int step = spacing();
        int maxChunks = spiralMaxRadius.get() > 0 ? Math.max(1, spiralMaxRadius.get() >> 4) : Integer.MAX_VALUE;
        if (spiralExtent() + step > maxChunks) {
            report("Spiral reached (highlight)%s(default) in (highlight)%s(default).", formatBlocks(spiralMaxRadius.get()), formatDuration(activeTicks / 20));
            turnOff();
            forgetSession();
            leaveServer();
            return;
        }

        switch (spiralDir) {
            case 0 -> legCX = spiralCX + (spiralMaxX += step);
            case 1 -> legCZ = spiralCZ + (spiralMaxZ += step);
            case 2 -> legCX = spiralCX + (spiralMinX -= step);
            default -> legCZ = spiralCZ + (spiralMinZ -= step);
        }
        follower.setRoute(List.of(new Point(blockCentre(legCX), blockCentre(legCZ), true)), mc.player.getX(), mc.player.getZ());
    }

    private void tickSpiral() {
        if (follower.update(mc.player.getX(), mc.player.getZ(), arriveBlocks()) == null) return;
        if (viewDistance.get() == 0) radius = Math.max(radius, measureRadius());
        if (!xaero) reach = radius;
        spiralDir = (spiralDir + 1) & 3;
        nextSpiralLeg();
    }

    /** How far the spiral has got from its centre so far, in chunks. */
    private int spiralExtent() {
        return Math.max(Math.max(spiralMaxX, -spiralMinX), Math.max(spiralMaxZ, -spiralMinZ));
    }

    /** Seconds until the spiral reaches its max radius, or -1 without one (or without a speed yet). */
    private int spiralEtaSeconds() {
        return spiralEtaSeconds(expectedSpeed());
    }

    private int spiralEtaSeconds(double speed) {
        if (spiralMaxRadius.get() <= 0) return -1;
        if (speed < MIN_KNOWN_SPEED) return -1;

        double side = 2.0 * (spiralMaxRadius.get() >> 4), done = 2.0 * spiralExtent();
        double left = Math.max(0, side * side - done * done); // chunks still to cover
        return (int) Math.ceil(left / (spacing() * speed / 16));
    }

    // Estimate

    private void tickEstimate() {
        double x = mc.player.getX(), z = mc.player.getZ();
        double moved = Math.hypot(x - lastX, z - lastZ);
        lastX = x;
        lastZ = z;
        // Ignore teleports / rubberbands
        if (moved >= 50) return;
        speed += (moved * 20 - speed) * SPEED_SMOOTHING;

        if (phase == Phase.SCAN || paused) return;
        activeTicks++;
        flightDistance += moved;

        if (phase == Phase.SPIRAL || activeTicks % 20 != 0) return;
        int percent = percent();
        if (percent >= nextProgressReport && nextProgressReport < 100) {
            int eta = etaSeconds();
            report("(highlight)%d%%(default) explored%s.", percent, eta < 0 ? "" : ", about (highlight)%s(default) left in this pass".formatted(formatDuration(eta)));
            while (nextProgressReport <= percent) nextProgressReport += 25;
        }
    }

    /** The set flight speed; without one, the current speed, or the last flight's average while we aren't moving yet. */
    private double expectedSpeed() {
        if (flightSpeed.get() > 0) return flightSpeed.get();
        return speed >= MIN_KNOWN_SPEED ? speed : lastFlightSpeed;
    }

    /**
     * Speed for an estimate made before cruising (on starting, on resuming): the run's own average
     * once it has flown a while - right after a pause or a rejoin the current speed says nothing.
     */
    private double estimateSpeed() {
        if (flightSpeed.get() > 0) return flightSpeed.get();
        if (activeTicks >= RUN_SPEED_MIN_TICKS) {
            double average = flightDistance * 20 / activeTicks;
            if (average >= MIN_KNOWN_SPEED) return average;
        }
        return expectedSpeed();
    }

    /** Seconds until the current route is flown, or -1 if unknown. */
    private int etaSeconds() {
        return etaSeconds(expectedSpeed());
    }

    private int etaSeconds(double speed) {
        if (speed < MIN_KNOWN_SPEED || (phase != Phase.SWEEP && phase != Phase.CLEANUP)) return -1;
        return (int) Math.ceil(sweepBlocksLeft() / speed);
    }

    /** "about 1h 20m left, 64% explored" for the chat on resuming, or what's keeping the estimate back. */
    private String timeLeftText() {
        double speed = estimateSpeed();
        if (phase == Phase.SPIRAL) {
            if (spiralMaxRadius.get() <= 0) return "no spiral-max-radius set, so it goes on until you stop it.";
            int eta = spiralEtaSeconds(speed);
            if (eta < 0) return "time left shows once you're flying.";
            return "about (highlight)%s(default) left to (highlight)%s(default) out.".formatted(formatDuration(eta), formatBlocks(spiralMaxRadius.get()));
        }
        if (phase == Phase.SCAN) return "reading the World Map first - time left shows once the route is planned.";
        if (phase == Phase.SETTLE) return "(highlight)%d%%(default) explored, checking the map for gaps - the cleanup time shows next.".formatted(percent());
        int eta = etaSeconds(speed);
        if (eta < 0) return "(highlight)%d%%(default) explored - time left shows once you're flying.".formatted(percent());
        String rest = phase == Phase.SWEEP ? " plus a short cleanup"
            : cleanupPass < cleanupPasses.get() ? " for this cleanup pass" : "";
        return "about (highlight)%s(default) left%s, (highlight)%d%%(default) explored.".formatted(formatDuration(eta), rest, percent());
    }

    private void reportEstimate() {
        double blocks = sweepBlocksLeft();
        double speed = estimateSpeed();
        int eta = etaSeconds(speed);
        if (eta < 0) {
            report("Sweep route: (highlight)%s(default) - time estimate will show up once you're flying.", formatBlocks((int) blocks));
            return;
        }
        report("Sweep route: (highlight)%s(default), about (highlight)%s(default) at (highlight)%d(default) blocks/s, plus a short cleanup.",
            formatBlocks((int) blocks), formatDuration(eta), Math.round(speed));

        int elytraSeconds = Modules.get().get(ElytraKeeper.class).flightSecondsLeft();
        if (elytraSeconds >= 0 && elytraSeconds < eta && !Modules.get().get(ElytraControl.class).savesDurability()) {
            warning("Your elytras only last about (highlight)%s(default) - not enough for the whole area.", formatDuration(elytraSeconds));
        }
    }

    private static String formatBlocks(int blocks) {
        return blocks >= 10_000 ? "%.1fk".formatted(blocks / 1000.0) : blocks + "m";
    }

    private static String formatDuration(int seconds) {
        if (seconds >= 3600) return "%dh %02dm".formatted(seconds / 3600, seconds % 3600 / 60);
        if (seconds >= 60) return "%dm %02ds".formatted(seconds / 60, seconds % 60);
        return "%ds".formatted(seconds);
    }

    // Saved run

    /** The server (or singleplayer world) a run is saved for, or null. */
    private String sessionKey() {
        ServerInfo server = mc.getCurrentServerEntry();
        if (server == null) server = reconnectServer; // dropped and not back yet
        if (server != null) return server.address;
        if (mc.getServer() != null) return "singleplayer-" + mc.getServer().getSaveProperties().getLevelName();
        return null;
    }

    private Path sessionFile() {
        String key = sessionKey();
        if (key == null) return null;
        return FabricLoader.getInstance().getGameDir().resolve("onfocus").resolve("area-explorer").resolve(fileSafe(key) + ".nbt");
    }

    private boolean hasSession() {
        Path file = sessionFile();
        return file != null && Files.exists(file);
    }

    private void forgetSession() {
        Path file = sessionFile();
        if (file == null) return;
        try {
            Files.deleteIfExists(file);
        } catch (IOException e) {
            FILE_LOG.error("Deleting the saved run failed", e);
        }
    }

    /** Saves the run as it is now: the area or spiral, how far it got, and everything for the finds file. */
    private void saveSession() {
        if (phase == Phase.IDLE) return;
        boolean spiral = phase == Phase.SPIRAL;
        if (!spiral && area == null) return; // done
        // The finds file gets what's waiting for it too, so it matches what's saved
        if (mc.world != null) flushFoundFile();
        flushArchive();
        RegistryKey<World> dimension = mc.world != null ? mc.world.getRegistryKey() : leftDimension;
        Path file = sessionFile();
        if (dimension == null || file == null) return;

        NbtCompound tag = new NbtCompound();
        tag.putString("dimension", dimension.getValue().toString());
        tag.putString("mode", spiral ? "spiral" : "area");
        if (spiral) {
            NbtCompound s = new NbtCompound();
            s.putInt("centre-x", spiralCX);
            s.putInt("centre-z", spiralCZ);
            s.putInt("min-x", spiralMinX);
            s.putInt("max-x", spiralMaxX);
            s.putInt("min-z", spiralMinZ);
            s.putInt("max-z", spiralMaxZ);
            s.putInt("dir", spiralDir);
            s.putInt("leg-x", legCX);
            s.putInt("leg-z", legCZ);
            tag.put("spiral", s);
        } else {
            NbtCompound a = new NbtCompound();
            a.putInt("min-x", area.minCX());
            a.putInt("min-z", area.minCZ());
            a.putInt("max-x", area.maxCX());
            a.putInt("max-z", area.maxCZ());
            tag.put("area", a);
            // With the map, reading it again tells what's explored
            if (!xaero) tag.putLongArray("explored", explored.toLongArray());
        }
        tag.putInt("active-ticks", activeTicks);
        tag.putDouble("flight-distance", flightDistance);
        tag.put("finds", findsTag());

        try {
            Files.createDirectories(file.getParent());
            Path tmp = file.resolveSibling(file.getFileName() + ".tmp");
            NbtIo.writeCompressed(tag, tmp);
            Files.move(tmp, file, StandardCopyOption.REPLACE_EXISTING);
        } catch (IOException e) {
            FILE_LOG.error("Saving the run failed", e);
        }
    }

    /** Carries on with the run saved for this server, if there is one: true if it took over (turning the module off if it can't). */
    private boolean resumeSession() {
        Path file = sessionFile();
        if (file == null || !Files.exists(file)) return false;
        NbtCompound tag;
        try {
            tag = NbtIo.readCompressed(file, NbtSizeTracker.ofUnlimitedBytes());
        } catch (IOException e) {
            FILE_LOG.error("Reading the saved run failed", e);
            return false;
        }

        String dimension = tag.getString("dimension");
        if (!dimension.equals(mc.world.getRegistryKey().getValue().toString())) {
            error("The saved run is in (highlight)%s(default) - go there to carry on with it, or press (highlight)Forget saved run(default) in the module's settings.",
                FindsArchive.prettyName(Identifier.of(dimension).getPath()));
            turnOff();
            return true;
        }

        restoreFinds(tag.getCompound("finds"));
        // Taken by resetFlightState, so the run's average speed is there for the first estimate
        restoredActiveTicks = tag.getInt("active-ticks");
        restoredFlightDistance = tag.getDouble("flight-distance");
        if (tag.getString("mode").equals("spiral")) {
            if (mode.get() != Mode.Spiral) mode.set(Mode.Spiral);
            resetFlightState();
            phase = Phase.SPIRAL;
            NbtCompound s = tag.getCompound("spiral");
            spiralCX = s.getInt("centre-x");
            spiralCZ = s.getInt("centre-z");
            spiralMinX = s.getInt("min-x");
            spiralMaxX = s.getInt("max-x");
            spiralMinZ = s.getInt("min-z");
            spiralMaxZ = s.getInt("max-z");
            spiralDir = s.getInt("dir");
            legCX = s.getInt("leg-x");
            legCZ = s.getInt("leg-z");
            follower.setRoute(List.of(new Point(blockCentre(legCX), blockCentre(legCZ), true)), mc.player.getX(), mc.player.getZ());
            info("Carrying on with the saved spiral around (highlight)%d, %d(default), (highlight)%s(default) out so far - %s",
                spiralCX << 4, spiralCZ << 4, formatBlocks(spiralExtent() * 16), timeLeftText());
        } else {
            if (mode.get() != Mode.Area) mode.set(Mode.Area);
            NbtCompound a = tag.getCompound("area");
            area = new Area(a.getInt("min-x"), a.getInt("min-z"), a.getInt("max-x"), a.getInt("max-z"));
            areaDimension = mc.world.getRegistryKey();
            if (tag.contains("explored")) restoredExplored = tag.getLongArray("explored");
            info("Carrying on with the saved (highlight)%dx%d(default) chunk area.", area.width(), area.depth());
            start();
            // Without the map the sweep is planned right away, and its estimate shown; with it, once the map's read
            if (phase == Phase.SCAN) info("Reading the World Map first - time left shows once the route is planned.");
        }
        return true;
    }

    /** Everything the finds file is written from. */
    private NbtCompound findsTag() {
        NbtCompound tag = new NbtCompound();
        if (signFile != null) tag.putString("file", signFile.toString());
        if (fileBaseName != null) tag.putString("base-name", fileBaseName);
        if (fileHeader != null) putLongString(tag, "header", fileHeader);
        putLongString(tag, "signs", signLog.toString());
        putLongString(tag, "bases", baseLog.toString());
        tag.putInt("bases-found", basesFound);
        tag.putLongArray("saved-signs", savedSigns.toLongArray());

        NbtList items = new NbtList();
        for (UUID uuid : savedItems) items.add(NbtString.of(uuid.toString()));
        tag.put("saved-items", items);

        NbtCompound counts = new NbtCompound();
        itemCounts.forEach((item, n) -> counts.putInt(Registries.ITEM.getId(item).toString(), n));
        tag.put("item-counts", counts);

        NbtList found = new NbtList();
        for (FoundItem item : foundItems) {
            NbtCompound f = new NbtCompound();
            f.putString("item", Registries.ITEM.getId(item.item()).toString());
            f.putLong("pos", item.pos().asLong());
            f.putString("what", item.what());
            f.putString("time", item.time().toString());
            found.add(f);
        }
        tag.put("found-items", found);
        return tag;
    }

    private void restoreFinds(NbtCompound tag) {
        signFile = tag.contains("file") ? Path.of(tag.getString("file")) : null;
        fileBaseName = tag.contains("base-name") ? tag.getString("base-name") : null;
        fileHeader = tag.contains("header") ? getLongString(tag, "header") : null;
        signWriteFailed = false;
        signLog.setLength(0);
        signLog.append(getLongString(tag, "signs"));
        baseLog.setLength(0);
        baseLog.append(getLongString(tag, "bases"));
        basesFound = tag.getInt("bases-found");

        savedSigns.clear();
        for (long pos : tag.getLongArray("saved-signs")) savedSigns.add(pos);
        savedItems.clear();
        NbtList items = tag.getList("saved-items", NbtElement.STRING_TYPE);
        for (int i = 0; i < items.size(); i++) savedItems.add(UUID.fromString(items.getString(i)));

        itemCounts.clear();
        NbtCompound counts = tag.getCompound("item-counts");
        for (String id : counts.getKeys()) {
            Registries.ITEM.getOptionalValue(Identifier.of(id)).ifPresent(item -> itemCounts.put(item, counts.getInt(id)));
        }
        foundItems.clear();
        NbtList found = tag.getList("found-items", NbtElement.COMPOUND_TYPE);
        for (int i = 0; i < found.size(); i++) {
            NbtCompound f = found.getCompound(i);
            Registries.ITEM.getOptionalValue(Identifier.of(f.getString("item"))).ifPresent(item -> foundItems.add(
                new FoundItem(item, BlockPos.fromLong(f.getLong("pos")), f.getString("what"), LocalTime.parse(f.getString("time")))));
        }

        if (signFile != null) report("Writing on to (highlight)%s(default).", signFile);
    }

    private static void putLongString(NbtCompound tag, String key, String text) {
        NbtList parts = new NbtList();
        for (int i = 0; i < text.length(); i += SESSION_STRING_PART) {
            parts.add(NbtString.of(text.substring(i, Math.min(text.length(), i + SESSION_STRING_PART))));
        }
        tag.put(key, parts);
    }

    private static String getLongString(NbtCompound tag, String key) {
        NbtList parts = tag.getList(key, NbtElement.STRING_TYPE);
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < parts.size(); i++) sb.append(parts.getString(i));
        return sb.toString();
    }

    @Override
    public NbtCompound toTag() {
        NbtCompound tag = super.toTag();
        if (tag == null) return null;

        NbtCompound reaches = new NbtCompound();
        learnedReach.forEach(reaches::putInt);
        tag.put("learned-reach", reaches);
        tag.putDouble("last-flight-speed", lastFlightSpeed);
        return tag;
    }

    @Override
    public AreaExplorer fromTag(NbtCompound tag) {
        learnedReach.clear();
        NbtCompound reaches = tag.getCompound("learned-reach");
        for (String key : reaches.getKeys()) learnedReach.put(key, reaches.getInt(key));
        lastFlightSpeed = tag.getDouble("last-flight-speed");

        super.fromTag(tag);
        return this;
    }
}
