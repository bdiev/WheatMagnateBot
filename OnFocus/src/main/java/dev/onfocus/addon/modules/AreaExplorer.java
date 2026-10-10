package dev.onfocus.addon.modules;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import dev.onfocus.addon.ModuleLog;
import dev.onfocus.addon.OnFocusAddon;
import dev.onfocus.addon.explore.BaseClues;
import dev.onfocus.addon.explore.ChunkGrid;
import dev.onfocus.addon.explore.DeferredChunks;
import dev.onfocus.addon.explore.WithheldChunks;
import dev.onfocus.addon.explore.FreshChunks;
import dev.onfocus.addon.explore.PendingReach;
import dev.onfocus.addon.explore.ReachStability;
import dev.onfocus.addon.explore.ProgressEta;
import dev.onfocus.addon.explore.SteadyEta;
import dev.onfocus.addon.explore.FindNames;
import dev.onfocus.addon.explore.ContourPlanner;
import dev.onfocus.addon.explore.Coverage;
import dev.onfocus.addon.explore.CoveragePlanner;
import dev.onfocus.addon.explore.SectorEta;
import dev.onfocus.addon.explore.SectorReach;
import dev.onfocus.addon.explore.SectorTraversal;
import dev.onfocus.addon.explore.SectorPlanner;
import dev.onfocus.addon.explore.CoveragePlanner.Area;
import dev.onfocus.addon.explore.CoveragePlanner.Segment;
import dev.onfocus.addon.explore.FindsArchive;
import dev.onfocus.addon.explore.ItemDetails;
import dev.onfocus.addon.explore.ExplorerDiagnostics;
import dev.onfocus.addon.explore.MapSync;
import dev.onfocus.addon.explore.SiteSync;
import dev.onfocus.addon.explore.Territories;
import dev.onfocus.addon.explore.Territories.Territory;
import dev.onfocus.addon.explore.WaypointFollower;
import dev.onfocus.addon.explore.WaypointFollower.Point;
import dev.onfocus.addon.settings.OrderedItemListSetting;
import dev.onfocus.addon.xaero.XaeroMapFolders;
import dev.onfocus.addon.xaero.XaeroMappedChunkScan;
import dev.onfocus.addon.xaero.XaeroWaypoints;
import it.unimi.dsi.fastutil.ints.Int2IntOpenHashMap;
import it.unimi.dsi.fastutil.longs.Long2IntOpenHashMap;
import it.unimi.dsi.fastutil.longs.Long2LongOpenHashMap;
import it.unimi.dsi.fastutil.ints.IntArrayList;
import it.unimi.dsi.fastutil.longs.Long2ObjectOpenHashMap;
import it.unimi.dsi.fastutil.longs.LongArrayList;
import it.unimi.dsi.fastutil.longs.LongOpenHashSet;
import it.unimi.dsi.fastutil.longs.LongSet;
import meteordevelopment.meteorclient.MeteorClient;
import meteordevelopment.meteorclient.events.game.GameLeftEvent;
import meteordevelopment.meteorclient.events.meteor.KeyEvent;
import meteordevelopment.meteorclient.events.entity.EntityAddedEvent;
import meteordevelopment.meteorclient.events.entity.player.BreakBlockEvent;
import meteordevelopment.meteorclient.events.entity.player.PlaceBlockEvent;
import meteordevelopment.meteorclient.events.entity.player.PlayerMoveEvent;
import meteordevelopment.meteorclient.mixininterface.IVec3d;
import meteordevelopment.meteorclient.events.packets.PacketEvent;
import meteordevelopment.meteorclient.gui.GuiTheme;
import meteordevelopment.meteorclient.gui.widgets.WWidget;
import meteordevelopment.meteorclient.gui.widgets.containers.WTable;
import meteordevelopment.meteorclient.gui.widgets.containers.WVerticalList;
import meteordevelopment.meteorclient.gui.widgets.pressable.WButton;
import meteordevelopment.meteorclient.gui.widgets.pressable.WCheckbox;
import meteordevelopment.meteorclient.gui.widgets.pressable.WMinus;
import meteordevelopment.meteorclient.events.world.ChunkDataEvent;
import meteordevelopment.meteorclient.events.world.TickEvent;
import meteordevelopment.meteorclient.settings.*;
import meteordevelopment.meteorclient.systems.modules.Module;
import meteordevelopment.meteorclient.systems.modules.Modules;
import meteordevelopment.meteorclient.systems.waypoints.Waypoint;
import meteordevelopment.meteorclient.systems.waypoints.Waypoints;
import meteordevelopment.meteorclient.utils.misc.Keybind;
import meteordevelopment.meteorclient.utils.network.Http;
import meteordevelopment.meteorclient.utils.network.MeteorExecutor;
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
import net.minecraft.client.network.PlayerListEntry;
import net.minecraft.client.network.ServerAddress;
import net.minecraft.client.network.ServerInfo;
import net.minecraft.block.enums.ChestType;
import net.minecraft.component.DataComponentTypes;
import net.minecraft.entity.Entity;
import net.minecraft.entity.EntityStatuses;
import net.minecraft.network.packet.s2c.play.EntityStatusS2CPacket;
import net.minecraft.entity.ItemEntity;
import net.minecraft.entity.passive.CatEntity;
import net.minecraft.entity.passive.TameableEntity;
import net.minecraft.entity.passive.WolfEntity;
import net.minecraft.entity.player.PlayerEntity;
import net.minecraft.entity.projectile.thrown.EnderPearlEntity;
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
import net.minecraft.util.math.Vec3d;
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
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.CancellationException;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CompletionException;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
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
 * Rescan ("Rescan" in the map's right-click menu) flies the whole area again in strips, drawn on the
 * map or not, for what changed since: items on the ground, signs, markers and bases are looked for as
 * on any run, and Xaero redraws the chunks it passes. The map says nothing about what's been flown
 * then, so a chunk is done once it's been loaded within the swath width of the player; the cleanup
 * picks up the rest. The width is measured from the chunks loaded across the strip in flight.
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
 * items of the picked kinds lying on the ground nearby are marked too, one marker per pile. With
 * {@code mark-pets}, cats and dogs someone has named get a marker each, named after the pet and its owner;
 * with {@code mark-pearls}, thrown ender pearls lying still (a stasis chamber's) get one per bunch.
 * <p>
 * With {@code all-finds-file}, everything found on every run is kept in one file per server and
 * dimension, with no find twice ({@link FindsArchive}).
 * <p>
 * The player's own doing isn't a find: blocks they place during a run (their ender chest, a shulker
 * box) are never marked or scored for a base, and items that drop where they break something are
 * not loot.
 * <p>
 * Signs (either mode): with {@code save-signs}, the text of every sign in the chunks loaded while
 * exploring is written to a file per run under {@code .minecraft/onfocus/signs/<server>/}. With
 * {@code save-items}, items of the picked kinds lying on the ground nearby go into the same file.
 * <p>
 * The module's keybind pauses and resumes instead of turning it off (turning it off from the
 * GUI keeps the area, so enabling it again carries on where it stopped).
 * <p>
 * Flown ground ({@code show-flown}): the part of the area the explorer has flown over this run is
 * coloured on Xaero's World Map and, with {@code site-sync}, on the site's map, until the run ends.
 * <p>
 * Scanned territories: every Area run's ground flown over is kept per server ({@link Territories}),
 * and listed in the module's settings, each shown on Xaero's World Map or hidden. Runs from before
 * that are rebuilt, roughly, from the finds file: the ground around every find was loaded.
 * <p>
 * Site commands ({@code site-commands}): an administrator can pick an area on the site's map and
 * send the mod off to explore or rescan it - the same as Xaero's Explore / Rescan. The mod picks
 * them up with its status uploads, and checks in every few seconds while it's off too.
 * <p>
 * With {@code site-sync}, what happens to the run - started, paused, kicked and why, reconnect attempts,
 * back on the server, totem pops, cleanup passes, done, and every warning - goes to the site's run log.
 * <p>
 * Kicked or dropped from a server, it reconnects ({@code auto-reconnect}) and, once back where it
 * stopped, carries on with the same route and the same sign file. Back in the same dimension but far
 * from that spot (the server put it back where it last had it, or it respawned), it carries on from
 * there after a short wait - or at once with the bind. It runs in the main menu for
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
    /**
     * Ticks after starting (or getting back on the server) before checking the player is flying: by
     * their speed, not the gliding flag - some elytra fly modes keep that off while flying.
     */
    private static final int FLIGHT_CHECK_TICKS = 5 * 20;
    private int flightCheckTicks;
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

    private final Setting<Boolean> diagnosticLogging = sgGeneral.add(new BoolSetting.Builder()
        .name("diagnostic-logging")
        .description("Records flight, route decisions and loaded/map chunk snapshots in onfocus/logs/area-explorer-diagnostics.jsonl (up to 32 MiB).")
        .defaultValue(true)
        .build()
    );

    private final ExplorerDiagnostics diagnostics = new ExplorerDiagnostics(
        FabricLoader.getInstance().getGameDir().resolve("onfocus/logs/area-explorer-diagnostics.jsonl"), FILE_LOG::warn);
    private String diagnosticRun = UUID.randomUUID().toString();
    private int diagnosticTicks;
    private long diagnosticChunks, diagnosticProgress, diagnosticLastExplored;
    private long diagnosticSequence;
    private long diagnosticMapRegions, diagnosticMapAdded;

    public enum Mode { Area, Spiral, Sectors }

    /** How Area mode covers the blank ground. */
    public enum Pattern { Contour, Strips }

    /** Sectors mode: what to do with a sector still blank after the cleanup limit. */
    public enum UnfinishedSector { Defer, Pause }

    /** Sector commands from Xaero's World Map. */
    public enum SectorAction { Next, Skip, Rescan }

    private final Setting<Mode> mode = sgGeneral.add(new EnumSetting.Builder<Mode>()
        .name("mode")
        .description("Area: explore a selected rectangle. Sectors (experimental): finish each square, including cleanup, before moving on; works with Explore and Rescan. Spiral: spiral outwards without a selection.")
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

    private final Setting<Integer> sectorSize = sgGeneral.add(new IntSetting.Builder()
        .name("sector-size")
        .description("Experimental Sectors mode: square size in chunks, on a grid shared by every selection. Applied when starting a new selection; saved runs keep their size. A whole number of strips (2 x reach + 1 chunks each: 30 or 35 for reach 2) wastes no flight.")
        .defaultValue(30)
        .range(8, 256)
        .sliderRange(8, 100)
        .visible(() -> mode.get() == Mode.Sectors)
        .build()
    );

    private final Setting<Integer> sectorReachSetting = sgGeneral.add(new IntSetting.Builder()
        .name("sector-reach")
        .description("Sectors mode: chunks loaded to each side of a strip. 0 = auto: one chunk inside the view distance (or the width learned in flight), back to 2 after a sector whose route left gaps, one wider again after three clean sectors.")
        .defaultValue(0)
        .range(0, 12)
        .sliderRange(0, 8)
        .visible(() -> mode.get() == Mode.Sectors)
        .build()
    );

    private final Setting<UnfinishedSector> unfinishedSector = sgGeneral.add(new EnumSetting.Builder<UnfinishedSector>()
        .name("unfinished-sector")
        .description("Sectors mode, for a sector still blank after the cleanup passes. Defer: move on, retry it once after every other sector, then skip it and report it at the end. Pause: stop until you press the bind to retry.")
        .defaultValue(UnfinishedSector.Defer)
        .visible(() -> mode.get() == Mode.Sectors)
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
        .visible(() -> mode.get() != Mode.Sectors)
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
        .visible(() -> mode.get() != Mode.Spiral)
        .build()
    );

    private final Setting<Integer> cleanupPasses = sgGeneral.add(new IntSetting.Builder()
        .name("cleanup-passes")
        .description("Tours over chunks the sweep missed. Area gives up after this limit; Sectors defers the sector or pauses, as unfinished-sector says.")
        .defaultValue(2)
        .range(0, 5)
        .sliderRange(0, 5)
        .visible(() -> mode.get() != Mode.Spiral)
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
        .visible(() -> mode.get() != Mode.Spiral)
        .build()
    );

    private final Setting<SettingColor> mapColor = sgGeneral.add(new ColorSetting.Builder()
        .name("map-color")
        .description("Fill colour of the area on the World Map.")
        .defaultValue(new SettingColor(80, 200, 255, 60))
        .visible(() -> mode.get() != Mode.Spiral && showOnMap.get())
        .build()
    );

    private final Setting<Boolean> showSectorGrid = sgGeneral.add(new BoolSetting.Builder()
        .name("show-sector-grid")
        .description("Draws sectors on Xaero's World Map: the current one outlined in gold, the next dashed, finished ones tinted green, deferred ones orange and skipped ones red with their blank chunks. Right-click a sector to work it next, skip it or rescan it.")
        .defaultValue(true)
        .visible(() -> mode.get() == Mode.Sectors && showOnMap.get())
        .build()
    );

    private final Setting<Boolean> showFlown = sgGeneral.add(new BoolSetting.Builder()
        .name("show-flown")
        .description("Colours the part of the area already flown over this run on Xaero's World Map (and the site's map with site-sync). Gone once the run ends.")
        .defaultValue(true)
        .visible(() -> mode.get() != Mode.Spiral)
        .build()
    );

    private final Setting<SettingColor> flownColor = sgGeneral.add(new ColorSetting.Builder()
        .name("flown-color")
        .description("Colour of the ground already flown over on the World Map.")
        .defaultValue(new SettingColor(255, 170, 40, 70))
        .visible(() -> mode.get() != Mode.Spiral && showFlown.get())
        .build()
    );

    private final Setting<Boolean> showTerritories = sgGeneral.add(new BoolSetting.Builder()
        .name("show-territories")
        .description("Colours the ground scanned on earlier runs on Xaero's World Map - the territories ticked in the list below.")
        .defaultValue(true)
        .build()
    );

    private final Setting<SettingColor> territoryColor = sgGeneral.add(new ColorSetting.Builder()
        .name("territory-color")
        .description("Colour of the scanned territories on the World Map.")
        .defaultValue(new SettingColor(90, 220, 120, 55))
        .visible(showTerritories::get)
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
     * that give it away. An End Portal is its frame or the portal itself: some have had the frame broken off. Default colours are Xaero's own, a different one per group: Xaero only has 16.
     */
    private enum Marker {
        END_PORTAL("End Portal", "End Portals", "diamond", new SettingColor(85, 255, 85), true, b -> b == Blocks.END_PORTAL_FRAME || b == Blocks.END_PORTAL),
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

    private static final String BASES_GROUP = "Bases", ITEMS_GROUP = "Items on the ground", PETS_GROUP = "Named Pets", PEARLS_GROUP = "Thrown Pearls", CUSTOM_GROUP = "Custom Blocks";

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

    private final Setting<Boolean> markPets = sgMarkers.add(new BoolSetting.Builder()
        .name("mark-pets")
        .description("Marks cats and dogs someone has named, one marker per pet, with whose it is like Meteor's Entity Owner tells: \"Cat: Whiskers (Steve)\", \"Dog: Rex\".")
        .defaultValue(true)
        .visible(autoMarkers::get)
        .build()
    );

    private final Setting<SettingColor> petsColor = sgMarkers.add(colorSetting("pets-color", PETS_GROUP,
        new SettingColor(255, 85, 85), () -> autoMarkers.get() && markPets.get()));

    private final Setting<Boolean> markPearls = sgMarkers.add(new BoolSetting.Builder()
        .name("mark-pearls")
        .description("Marks thrown ender pearls lying still - a stasis chamber's - one marker per bunch, with who threw them when the game knows: \"Pearls ×3 (Steve)\". Pearls flying past aren't marked.")
        .defaultValue(true)
        .visible(autoMarkers::get)
        .build()
    );

    private final Setting<SettingColor> pearlsColor = sgMarkers.add(colorSetting("pearls-color", PEARLS_GROUP,
        new SettingColor(0, 170, 170), () -> autoMarkers.get() && markPearls.get()));

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

    private final Setting<Boolean> siteCommands = sgSite.add(new BoolSetting.Builder()
        .name("site-commands")
        .description("Lets an administrator on the site pick an area on its map and send you off to explore or rescan it. The mod checks in every few seconds for that, even while it's off.")
        .defaultValue(true)
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
    /** Back in the run's dimension but far from where we were dropped: carry on from there after this long. */
    private static final int REJOIN_ELSEWHERE_TICKS = 20 * 20;
    private int elsewhereTicks;

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
     * Failed attempts go to the site's events only now and then: a server restart fails a dozen or
     * more in a row, and each on its own says nothing new. The first is sent, then one every this long.
     */
    private static final long RECONNECT_REPORT_INTERVAL_MS = 10 * 60_000L;
    private long reconnectReportedAt;

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

    /** {@code details}: what's on it and in it (see {@link ItemDetails#of}), written on the line under it. */
    private record FoundItem(Item item, BlockPos pos, String what, LocalTime time, String details) {}
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
    /**
     * Writes and deletes of the saved run, in order: a run with a lot of finds is megabytes of
     * gzipped NBT, which held the game up for a second on every save. Its own thread, so a slow
     * upload on {@link #FILES} doesn't hold a save (or a read waiting for one) up.
     */
    private static final ExecutorService SESSION_FILES = Executors.newSingleThreadExecutor(r -> {
        Thread thread = new Thread(r, "Area Explorer saved run");
        thread.setDaemon(true);
        return thread;
    });
    /** The last write or delete queued on {@link #SESSION_FILES}: the ones before it are done when it is. */
    private static CompletableFuture<Void> sessionFileWork = CompletableFuture.completedFuture(null);
    static {
        // The files thread is a daemon: a save queued just before the game closes still gets written
        Runtime.getRuntime().addShutdownHook(new Thread(AreaExplorer::awaitSessionFiles, "Area Explorer saved run on exit"));
    }
    /** Sends Xaero's map to the site, on a thread of its own. */
    private static final MapSync MAP = new MapSync();
    /** Archives whose earlier finds were queued for the site this session, by archive and site. */
    private static final Set<String> SITE_BACKFILLED = new HashSet<>();
    private int archiveTicks;
    private long lastLiveSiteNanos;
    /** A find for the site is waiting: it goes this many ticks on, not with the half-minute sync - the page shows it in seconds. */
    private static final int SITE_FIND_DELAY_TICKS = 3 * 20;
    private int siteFindTicks;
    /** Where the site's run log goes while off the server: the scope last seen in a world. */
    private SiteSync.Scope lastSiteScope;
    /** How the run ended went to the site's log already (done, gave up...): turning off doesn't add "stopped". */
    private boolean stopLogged;
    /** A saved run is being carried on, for the start line of the log. */
    private boolean carryingOn;
    /** When we were dropped, for how long it took to get back. */
    private long leftAtMillis;

    private static final String BASE_PREFIX = "Base #";
    private boolean warnedNoMinimap;
    /** Item entities already marked this run (or seen near a marker of their kind). */
    private final Set<UUID> markedItems = new HashSet<>();
    /** Named pets already marked this run (or seen near their marker). */
    private final Set<UUID> markedPets = new HashSet<>();
    private int petCheckTicks;
    /** Thrown pearls already marked this run (or seen near their marker). */
    private final Set<UUID> markedPearls = new HashSet<>();
    /** Where each pearl not marked yet was on the last scan: one still there since is lying still, not flying. */
    private final Map<UUID, Vec3d> pearlsSeen = new HashMap<>();

    /**
     * Blocks the player placed during the run - their ender chest, a shulker box to sort loot into:
     * never marked, nor scored for a base, even when the chunk is scanned again later.
     */
    private final LongOpenHashSet playerPlaced = new LongOpenHashSet();
    /** Blocks the player broke lately, to when: what drops there is theirs, not loot. */
    private final Long2LongOpenHashMap playerBroken = new Long2LongOpenHashMap();
    /** Items that dropped where the player broke something. */
    private final Set<UUID> playerDrops = new HashSet<>();
    /** How long, and how near a block the player broke, a new item on the ground counts as its drop. */
    private static final long PLAYER_DROP_MILLIS = 60_000;
    private static final double PLAYER_DROP_RADIUS = 3;
    /** Where the player died this run: what lies around there was theirs, for the rest of the run. */
    private final List<BlockPos> deathSpots = new ArrayList<>();
    /** How far a death's drops scatter and roll. */
    private static final double DEATH_DROP_RADIUS = 8;
    private boolean wasDead;
    /** How near the player an item just thrown has to come in to be taken for one it threw. */
    private static final double TOSS_RADIUS = 4;

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
    /** Flying the whole area again (the map's "Rescan"): explored means loaded this run, not drawn on the map. */
    private boolean rescan;
    /** The area's ground flown over this run, for the map and the site; null with no area run going. */
    private Coverage coverage;
    /** The run's territory, kept as it goes: a new one for each area picked. */
    private String territoryId;
    /** Chunks around a find taken as scanned when rebuilding earlier runs from the finds: the player was that near at least. */
    private static final int FIND_SCANNED_REACH = 4;
    private long[] restoredCoverage;
    private long lastCoverageChunk = Long.MIN_VALUE;
    private int coverageCheckTicks;
    /** The coverage version last sent to the site, and when: sent on change, and again every so often in case one got lost. */
    private int coverageSentVersion = -1;
    private long coverageSentNanos;
    private static final long COVERAGE_SITE_MIN_NANOS = 5_000_000_000L, COVERAGE_SITE_RESEND_NANOS = 30_000_000_000L;
    private long lastRescannedChunk = Long.MIN_VALUE;
    private int rescanCheckTicks, lastRescanCheckTick;
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
    /** First task in the strip route, including its approach waypoint. */
    private Segment sweepHead;
    private CompletableFuture<PlannedCleanup> pendingCleanup;
    private List<Segment> cleanupPlan = List.of();
    private int cleanupIndex;
    private double cleanupTailBlocks;
    private static final int CLEANUP_BATCH_SIZE = 256;
    private record PlannedCleanup(int generation, List<Segment> spots, double tailBlocks, long nanos) {}
    /** Bumped by every plan: a background one finishing after another plan was made is dropped. */
    private int planGeneration;

    private record PlannedSweep(int generation, List<Segment> plan, long prepareNanos, long planNanos) {}

    private static final ExecutorService PLANNER = Executors.newSingleThreadExecutor(r -> {
        Thread thread = new Thread(r, "Area Explorer planner");
        thread.setDaemon(true);
        return thread;
    });
    private boolean xaero;
    private XaeroMappedChunkScan scan;
    private int mapCheckTicks;
    private int cleanupPass;
    private SectorTraversal sectors;
    private boolean sectorBlocked;
    private boolean sectorEarlyReadDone;
    private boolean sectorExitOnly;
    private final SectorReach sectorSwath = new SectorReach();
    private final SectorEta sectorEta = new SectorEta();
    /** The current sector's own route was flown: its result says whether the swath was right. */
    private boolean sectorWorked;
    private int sectorTimed = -1, sectorTicks;
    private long sectorStartMissing;
    private long[] sectorWork;
    private int sectorWorkTick;
    private List<int[]> sectorGaps = List.of();
    private long sectorGapsNanos;
    private int[] restoredSwath;

    private int radius; // server view distance, in chunks
    private int reach;  // chunks to each side of a strip that actually get explored
    /** Rescan: a swath width measured in the middle of a strip, taken on once it's flown to the end. */
    private final PendingReach pendingReach = new PendingReach();

    private final WaypointFollower follower = new WaypointFollower();
    /** Chunks actually loaded within reach along the flight path, pending the map drawing them. */
    private DeferredChunks flownOver;
    private long lastFlownChunk = Long.MIN_VALUE;
    /** Rescan: chunks the server won't send though we fly right by them, planned around. */
    private WithheldChunks withheld;
    /** Contour pattern: blank chunks left when the current loop was planned, for the time estimate and to notice a loop that changed nothing. */
    private long contourOpen = -1;
    private int idleLoops;

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
    private final ProgressEta coverageEta = new ProgressEta();
    /** What the HUD, the site and the chat show: the raw estimate, steadied. */
    private final SteadyEta shownEta = new SteadyEta();
    private int nextProgressReport;

    public AreaExplorer() {
        super(OnFocusAddon.CATEGORY, "area-explorer", "Steers you over an area picked on Xaero's World Map (right click > Explore) until every chunk in it is loaded. Pair it with an elytra fly module.");
        // Stays on through a disconnect so it can reconnect and carry on: Meteor turns other modules off on leaving
        runInMainMenu = true;
        MeteorClient.EVENT_BUS.subscribe(new OffBindListener());
    }

    /** How often the mod checks in with the site for commands while it's off. */
    private static final int OFF_CHECK_IN_TICKS = 3 * 20;
    private int offCheckInTicks;

    /** Meteor only runs the pause keybind's action while the module is on: this one carries on with a saved run when it's off. */
    private class OffBindListener {
        /** Off, on a server, with site commands on: an idle status every few seconds, so an area sent from the site reaches us. */
        @EventHandler
        private void onTick(TickEvent.Post event) {
            if (isActive() || mc.world == null || mc.player == null || mc.getCurrentServerEntry() == null) return;
            if (!siteCommands.get() || siteTarget() == null || ++offCheckInTicks < OFF_CHECK_IN_TICKS) return;
            offCheckInTicks = 0;
            syncLiveSite();
        }

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
        WVerticalList list = theme.verticalList();
        WButton forget = list.add(theme.button("Forget saved run")).widget();
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
            rescan = false;
            info("Saved run forgotten - it starts afresh next time.");
        };

        list.add(theme.horizontalSeparator("Scanned territories")).expandX();
        WTable table = list.add(theme.table()).expandX().widget();
        fillTerritories(theme, table);
        WButton rebuild = list.add(theme.button("Rebuild earlier runs from the finds file (this dimension)")).expandX().widget();
        rebuild.action = () -> {
            if (!rebuildFindsTerritory(() -> fillTerritories(theme, table))) warning("Join the server and turn on all-finds-file first.");
        };
        return list;
    }

    /** A row per territory of this server: shown on the map or not, what and where, and a button to delete it. */
    private void fillTerritories(GuiTheme theme, WTable table) {
        table.clear();
        Territories territories = territories();
        if (territories == null) {
            table.add(theme.label("Join a server to see its territories."));
            return;
        }
        List<Territory> all = territories.all();
        if (all.isEmpty()) {
            table.add(theme.label("None yet - every Area run is kept here."));
            return;
        }
        for (Territory t : all) {
            WCheckbox shown = table.add(theme.checkbox(t.visible)).widget();
            shown.action = () -> territories.setVisible(t, shown.checked);
            table.add(theme.label(t.title())).expandCellX();
            table.add(theme.label(FindsArchive.prettyName(t.dimension) + " · " + t.where()));
            WMinus delete = table.add(theme.minus()).widget();
            delete.action = () -> {
                territories.delete(t);
                fillTerritories(theme, table);
            };
            table.row();
        }
    }

    /** This server's territories, or null off any server. */
    private Territories territories() {
        String key = sessionKey();
        if (key == null) return null;
        Path dir = FabricLoader.getInstance().getGameDir().resolve("onfocus").resolve("area-explorer").resolve("territories").resolve(fileSafe(key));
        return Territories.of(dir, problem -> FILE_LOG.warn(problem));
    }

    /** The run's ground so far, as its territory: on every save of the run and when it's done. */
    private void saveRunTerritory() {
        if (coverage == null || area == null || territoryId == null) return;
        Territories territories = territories();
        RegistryKey<World> dimension = areaDimension != null ? areaDimension : mc.world != null ? mc.world.getRegistryKey() : leftDimension;
        if (territories == null || dimension == null) return;
        territories.put(territoryId, fileSafe(dimension.getValue().getPath()), rescan ? Territories.Kind.RESCAN : Territories.Kind.RUN, area, coverage);
    }

    /**
     * Earlier runs, from before territories were kept, rebuilt from the all-finds file of this
     * dimension: the chunks around every find were loaded, so scanned. Rough - ground with nothing on
     * it leaves no trace - but it shows where the runs went. Read on the files thread; false without
     * the file.
     */
    private boolean rebuildFindsTerritory(Runnable done) {
        if (mc.world == null) return false;
        String dimension = fileSafe(mc.world.getRegistryKey().getValue().getPath());
        return withArchive(archive -> {
            List<FindsArchive.Find> finds = archive.all();
            if (finds.isEmpty()) {
                mc.execute(() -> info("No finds in this dimension to rebuild from."));
                return;
            }
            int minX = Integer.MAX_VALUE, minZ = Integer.MAX_VALUE, maxX = Integer.MIN_VALUE, maxZ = Integer.MIN_VALUE;
            for (FindsArchive.Find f : finds) {
                minX = Math.min(minX, f.x() >> 4);
                minZ = Math.min(minZ, f.z() >> 4);
                maxX = Math.max(maxX, f.x() >> 4);
                maxZ = Math.max(maxZ, f.z() >> 4);
            }
            Area bounds = new Area(minX - FIND_SCANNED_REACH, minZ - FIND_SCANNED_REACH, maxX + FIND_SCANNED_REACH, maxZ + FIND_SCANNED_REACH);
            Coverage grid = new Coverage(bounds);
            for (FindsArchive.Find f : finds) {
                grid.markChunk(f.x() >> 4, f.z() >> 4);
                grid.markAround(f.x() >> 4, f.z() >> 4, FIND_SCANNED_REACH, (cx, cz) -> true);
            }
            mc.execute(() -> {
                Territories territories = territories();
                if (territories == null) return;
                territories.put("finds-" + dimension, dimension, Territories.Kind.FINDS, bounds, grid);
                info("Rebuilt the earlier runs of %s from (highlight)%d(default) finds: (highlight)%d%%(default) of %dx%d chunks.",
                    FindsArchive.prettyName(dimension), finds.size(), Math.round(grid.coveredShare() * 100), bounds.width(), bounds.depth());
                done.run();
            });
        });
    }

    /** The ticked territories to colour on the World Map while it shows the given dimension; the run going on is coloured as flown instead. */
    public List<Coverage> mapTerritories(RegistryKey<World> dimension) {
        if (!showTerritories.get() || dimension == null) return List.of();
        Territories territories = territories();
        if (territories == null) return List.of();
        String except = mapCoverage(dimension) != null && territoryId != null ? territoryId : "";
        List<Coverage> grids = new ArrayList<>();
        for (Territory t : territories.visible(fileSafe(dimension.getValue().getPath()), except)) grids.add(t.coverage);
        return grids;
    }

    /** What {@link #mapTerritoryRectangles} worked out last, and from which grids at which versions. */
    private List<int[]> territoryRects = List.of();
    private List<Object> territoryRectsKey = List.of();

    /**
     * The ground of the ticked territories as rectangles of chunks that don't overlap: territories
     * scanned over each other show in one even colour, not darker where they meet. Worked out again
     * only when the territories or their ground change.
     */
    public List<int[]> mapTerritoryRectangles(RegistryKey<World> dimension) {
        List<Coverage> grids = mapTerritories(dimension);
        List<Object> key = new ArrayList<>(grids.size() * 2);
        for (Coverage grid : grids) {
            key.add(grid);
            key.add(grid.version());
        }
        if (!key.equals(territoryRectsKey)) {
            List<int[]> rects = new ArrayList<>();
            for (Coverage grid : grids) rects.addAll(grid.rectangles());
            territoryRects = Coverage.union(rects);
            territoryRectsKey = key;
        }
        return territoryRects;
    }

    public SettingColor territoryColor() {
        return territoryColor.get();
    }

    /** Called from the world map's "Explore" option. Starts (or restarts) exploring the given chunk rectangle. */
    public void explore(int x1, int z1, int x2, int z2, RegistryKey<World> dimension) {
        select(x1, z1, x2, z2, dimension, false);
    }

    /** Called from the world map's "Rescan" option: flies the whole rectangle again, mapped or not. */
    public void rescan(int x1, int z1, int x2, int z2, RegistryKey<World> dimension) {
        select(x1, z1, x2, z2, dimension, true);
    }

    private void select(int x1, int z1, int x2, int z2, RegistryKey<World> dimension, boolean again) {
        if (mc.world != null && dimension != null && !dimension.equals(mc.world.getRegistryKey())) {
            error("The selection is in (highlight)%s(default), but you are in (highlight)%s(default).", dimension.getValue(), mc.world.getRegistryKey().getValue());
            return;
        }

        // Waiting to be back where we were dropped: a new area starts from here
        if (reconnecting) {
            reconnecting = false;
            reconnectServer = null;
            rescanOnReturn = false;
        }
        rescan = again;
        territoryId = null;
        area = new Area(Math.min(x1, x2), Math.min(z1, z2), Math.max(x1, x2), Math.max(z1, z2));
        areaDimension = dimension;
        sectors = null;
        sectorBlocked = false;
        if (mode.get() == Mode.Spiral) mode.set(Mode.Area);

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
        if (!isActive() || !showOnMap.get() || mode.get() == Mode.Spiral || area == null) return null;
        if (areaDimension != null && dimension != null && !areaDimension.equals(dimension)) return null;
        return area;
    }

    public SettingColor mapColor() {
        return mapColor.get();
    }

    /** The running sector grid to draw while the map shows its dimension, or null. */
    public SectorTraversal mapSectors(RegistryKey<World> dimension) {
        return showSectorGrid.get() && mapHighlight(dimension) != null ? sectors : null;
    }

    /**
     * Unconfirmed chunks of deferred and skipped sectors, as row runs {minCX, minCZ, maxCX, maxCZ}:
     * where the server never sent anything. Counted again every two seconds at most.
     */
    public List<int[]> mapSectorGaps() {
        if (sectors == null) return List.of();
        long now = System.nanoTime();
        if (sectorGapsNanos != 0 && now - sectorGapsNanos < 2_000_000_000L) return sectorGaps;
        sectorGapsNanos = now;
        List<int[]> gaps = new ArrayList<>();
        for (int i = 0, shown = 0; i < sectors.total() && shown < 64; i++) {
            SectorTraversal.State state = sectors.state(i);
            if (state != SectorTraversal.State.DEFERRED && state != SectorTraversal.State.SKIPPED) continue;
            shown++;
            Area sector = sectors.sector(i);
            for (int z = sector.minCZ(); z <= sector.maxCZ(); z++) {
                int start = Integer.MIN_VALUE;
                for (int x = sector.minCX(); x <= sector.maxCX() + 1; x++) {
                    boolean gap = x <= sector.maxCX() && !confirmedChunk(x, z);
                    if (gap && start == Integer.MIN_VALUE) start = x;
                    if (!gap && start != Integer.MIN_VALUE) {
                        gaps.add(new int[]{start, z, x - 1, z});
                        start = Integer.MIN_VALUE;
                    }
                }
            }
        }
        sectorGaps = gaps;
        return gaps;
    }

    /** The World Map commands for the sector under a right click at block (x, z), none outside the running grid. */
    public List<SectorAction> sectorActions(int blockX, int blockZ, RegistryKey<World> dimension) {
        if (sectors == null || mapHighlight(dimension) == null) return List.of();
        int index = sectors.indexOf(blockX >> 4, blockZ >> 4);
        if (index < 0) return List.of();
        List<SectorAction> actions = new ArrayList<>();
        SectorTraversal.State state = sectors.state(index);
        boolean current = index == sectors.currentIndex();
        if (!current && index != sectors.priority() && (state != SectorTraversal.State.COMPLETED || rescan)) actions.add(SectorAction.Next);
        if (state != SectorTraversal.State.SKIPPED && state != SectorTraversal.State.COMPLETED) actions.add(SectorAction.Skip);
        if (rescan && (state == SectorTraversal.State.COMPLETED || current)) actions.add(SectorAction.Rescan);
        return actions;
    }

    public void sectorAction(int blockX, int blockZ, SectorAction action) {
        if (sectors == null || area == null) return;
        int index = sectors.indexOf(blockX >> 4, blockZ >> 4);
        if (index < 0) return;
        Area sector = sectors.sector(index);
        String where = "X %d..%d, Z %d..%d".formatted(sector.minCX() * 16, sector.maxCX() * 16 + 15, sector.minCZ() * 16, sector.maxCZ() * 16 + 15);
        boolean current = index == sectors.currentIndex();
        switch (action) {
            case Next -> {
                sectors.prioritise(index);
                info("Sector at (highlight)%s(default) comes next, after the current one.", where);
            }
            case Skip -> {
                current = sectors.skip(index, this::confirmedChunk, playerChunkX(), playerChunkZ());
                info("Sector at (highlight)%s(default) skipped for this run.", where);
                if (current) {
                    sectorBlocked = false;
                    sectorTimed = -1;
                    if (sectors.current() == null) {
                        finish();
                        return;
                    }
                    enteredSector();
                    reportSector();
                }
            }
            case Rescan -> {
                for (int x = sector.minCX(); x <= sector.maxCX(); x++) {
                    for (int z = sector.minCZ(); z <= sector.maxCZ(); z++) explored.remove(ChunkPos.toLong(x, z));
                }
                exploredGrid = null;
                sectors.prioritise(index);
                info("Sector at (highlight)%s(default) is rescanned %s.", where, current ? "now" : "next");
            }
        }
        sectorWork = null;
        sectorGapsNanos = 0;
        // The current route ends at the old next sector's side, or belongs to a sector left behind
        // (planned again on resuming when paused)
        if (phase == Phase.SWEEP || phase == Phase.SETTLE || phase == Phase.CLEANUP) {
            if (scan != null && phase == Phase.SETTLE) scan.cancel();
            if (phase == Phase.SETTLE) scan = null;
            if (pendingCleanup != null) pendingCleanup.cancel(false);
            pendingCleanup = null;
            endStrip(false);
            phase = Phase.SWEEP;
            phaseTicks = 0;
            if (!paused) planSweep();
        }
        saveSession();
    }

    /** "Skipped sectors: X a..b, Z c..d (n blank), ..." for the end of a run. */
    private String skippedSectorsText() {
        List<String> listed = new ArrayList<>();
        for (int i = 0; i < sectors.total(); i++) {
            if (sectors.state(i) != SectorTraversal.State.SKIPPED) continue;
            if (listed.size() == 8) {
                listed.add("and %d more".formatted(sectors.skippedCount() - 8));
                break;
            }
            Area sector = sectors.sector(i);
            listed.add("X %d..%d, Z %d..%d (%d blank)".formatted(sector.minCX() * 16, sector.maxCX() * 16 + 15,
                sector.minCZ() * 16, sector.maxCZ() * 16 + 15, sectors.missing(i, this::confirmedChunk)));
        }
        return "Skipped sectors: " + String.join("; ", listed) + ".";
    }

    /** The ground flown over this run to colour on the World Map while it shows the given dimension, or null. */
    public Coverage mapCoverage(RegistryKey<World> dimension) {
        if (!isActive() || !showFlown.get() || coverage == null || phase == Phase.IDLE || phase == Phase.SPIRAL) return null;
        if (areaDimension != null && dimension != null && !areaDimension.equals(dimension)) return null;
        return coverage;
    }

    public SettingColor flownColor() {
        return flownColor.get();
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
        if (reconnecting) {
            carryOnHere();
            return;
        }
        if (pause == paused) return;
        paused = pause;
        diagnostic("pause-change", paused ? "paused" : "resumed");
        diagnosticSnapshot(paused ? "pause" : "resume", false);
        if (paused) {
            if (holdForward.get()) mc.options.forwardKey.setPressed(false);
            if (phase == Phase.SWEEP) endStrip(false); // what's flown of it so far counts
            if (phase == Phase.SPIRAL) info("Paused - press the bind again to continue the spiral.");
            else info("Paused at (highlight)%d%%(default) - press the bind again to continue.", percent());
            siteEvent("info", "pause", phase == Phase.SPIRAL ? "Paused the spiral" : "Paused at %d%%".formatted(percent()));
            // Quitting the game now leaves it to carry on next time
            saveSession();
        } else {
            lastX = mc.player.getX();
            lastZ = mc.player.getZ();
            if (sectorBlocked) {
                sectorBlocked = false;
                cleanupPass = 0;
                withheld = new WithheldChunks(area);
                flownOver = new DeferredChunks(area);
                phase = Phase.SWEEP;
            }
            // The chunks around came while paused, maybe long ago: they're in reach all the same
            seedFreshChunks();
            loadedSamples.clear();
            // We may be anywhere now: the sweep is planned again from here, other routes just carry on
            if (phase == Phase.SWEEP) planSweep();
            else follower.restartLeg(mc.player.getX(), mc.player.getZ());
            info("Resuming - %s", timeLeftText());
            siteEvent("info", "resume", "Resumed - " + timeLeftText());
        }
    }

    /** The module's own log file, onfocus/logs/area-explorer.log; the game log gets the lines too. */
    public static final ModuleLog FILE_LOG = new ModuleLog("area-explorer", "AreaExplorer");

    private static void log(String fmt, Object... args) {
        FILE_LOG.info(fmt.formatted(args));
    }

    private JsonObject diagnosticEvent(String event) {
        JsonObject data = new JsonObject();
        data.addProperty("event", event);
        data.addProperty("run", diagnosticRun);
        data.addProperty("sequence", ++diagnosticSequence);
        data.addProperty("tick", activeTicks);
        data.addProperty("phase", phase.name());
        data.addProperty("paused", paused);
        data.addProperty("reconnecting", reconnecting);
        data.addProperty("pattern", pattern.get().name());
        data.addProperty("mode", sectors != null ? "Sectors" : mode.get().name());
        if (sectors != null && sectors.current() != null) {
            Area sector = sectors.current();
            data.addProperty("pattern", "Strips");
            data.addProperty("sector", sectors.visited() + 1);
            data.addProperty("sectorCount", sectors.total());
            data.addProperty("sectorMinCX", sector.minCX());
            data.addProperty("sectorMinCZ", sector.minCZ());
            data.addProperty("sectorMaxCX", sector.maxCX());
            data.addProperty("sectorMaxCZ", sector.maxCZ());
            data.addProperty("sectorTransit", sectors.transit());
            Area next = sectors.plannedNext();
            if (next != null) {
                data.addProperty("nextSectorMinCX", next.minCX());
                data.addProperty("nextSectorMinCZ", next.minCZ());
                data.addProperty("nextSectorMaxCX", next.maxCX());
                data.addProperty("nextSectorMaxCZ", next.maxCZ());
            }
        }
        data.addProperty("rescan", rescan);
        data.addProperty("reach", reach);
        data.addProperty("radius", radius);
        data.addProperty("spacing", spacing());
        data.addProperty("cleanupPass", cleanupPass);
        data.addProperty("cleanupRadius", cleanupRadius);
        data.addProperty("explored", explored.size());
        double observedRate = coverageEta.chunksPerSecond();
        if (observedRate >= 0) data.addProperty("coverageChunksPerMinute", observedRate * 60);
        if (area != null) {
            data.addProperty("areaMinCX", area.minCX());
            data.addProperty("areaMinCZ", area.minCZ());
            data.addProperty("areaMaxCX", area.maxCX());
            data.addProperty("areaMaxCZ", area.maxCZ());
            data.addProperty("missing", area.total() - explored.size());
        }
        if (mc.player != null) {
            data.addProperty("x", mc.player.getX());
            data.addProperty("y", mc.player.getY());
            data.addProperty("z", mc.player.getZ());
            data.addProperty("yaw", mc.player.getYaw());
            data.addProperty("speed", speed);
            data.addProperty("velocityX", mc.player.getVelocity().x);
            data.addProperty("velocityZ", mc.player.getVelocity().z);
            data.addProperty("arriveBlocks", phase == Phase.CLEANUP ? cleanupArriveBlocks() : phase == Phase.SWEEP && contour() ? contourArriveBlocks() : arriveBlocks());
            data.addProperty("remainingBlocks", follower.remainingDistance(mc.player.getX(), mc.player.getZ()));
        }
        if (mc.world != null) data.addProperty("dimension", mc.world.getRegistryKey().getValue().toString());
        Point target = follower.current();
        if (target != null) data.add("target", diagnosticPoint(target));
        Point previous = follower.previous();
        if (previous != null) data.add("previousWaypoint", diagnosticPoint(previous));
        data.addProperty("waypointIndex", follower.pointIndex());
        data.addProperty("routePointCount", follower.pointCount());
        if (scan != null) data.addProperty("pendingMapRegions", scan.pendingRegions());
        return data;
    }

    private static JsonObject diagnosticPoint(Point point) {
        JsonObject data = new JsonObject();
        data.addProperty("x", point.x());
        data.addProperty("z", point.z());
        data.addProperty("sweep", point.sweep());
        return data;
    }

    private void diagnostic(String event, String reason) {
        if (!diagnosticLogging.get()) return;
        JsonObject data = diagnosticEvent(event);
        data.addProperty("reason", reason);
        diagnostics.log(data);
    }

    private void diagnosticRoute(List<Point> points, String reason) {
        if (!diagnosticLogging.get()) return;
        JsonObject data = diagnosticEvent("route");
        data.addProperty("reason", reason);
        data.addProperty("pointCount", points.size());
        data.addProperty("planGeneration", planGeneration);
        data.addProperty("contourOpen", contourOpen);
        data.addProperty("idleLoops", idleLoops);
        JsonArray head = new JsonArray();
        for (int i = 0; i < Math.min(128, points.size()); i++) head.add(diagnosticPoint(points.get(i)));
        data.add("firstPoints", head);
        if (!points.isEmpty()) data.add("lastPoint", diagnosticPoint(points.getLast()));
        diagnostics.log(data);
    }

    /** Compact bit masks preserve the exact distinction between unloaded, blank and unknown map. */
    private int diagnosticChunk(int cx, int cz) {
        int mask = mc.world.getChunkManager().isChunkLoaded(cx, cz) ? 1 : 0;
        if (xaero) {
            int state = XaeroMappedChunkScan.mapState(cx, cz);
            if (state == XaeroMappedChunkScan.MAPPED) mask |= 2;
            if (state == XaeroMappedChunkScan.UNKNOWN) mask |= 4;
        }
        if (explored.contains(ChunkPos.toLong(cx, cz))) mask |= 8;
        if (flownOver != null && flownOver.test(cx, cz)) mask |= 16;
        if (area.contains(cx, cz)) mask |= 32;
        return mask;
    }

    private void diagnosticSnapshot(String reason, boolean wholeArea) {
        if (!diagnosticLogging.get() || area == null || mc.world == null || mc.player == null) return;
        long started = System.nanoTime();
        JsonObject data = diagnosticEvent("snapshot");
        data.addProperty("reason", reason);
        data.addProperty("chunkEventsSinceSnapshot", diagnosticChunks);
        data.addProperty("newExploredSinceSnapshot", diagnosticProgress - diagnosticLastExplored);
        data.addProperty("mapRegionsReadSinceSnapshot", diagnosticMapRegions);
        data.addProperty("newExploredFromRegionReads", diagnosticMapAdded);
        data.addProperty("readsMap", readsMap());
        data.addProperty("coverageShare", coverage == null ? 0 : coverage.coveredShare());
        diagnosticChunks = 0;
        diagnosticMapRegions = diagnosticMapAdded = 0;
        diagnosticLastExplored = diagnosticProgress;
        ChunkPos player = mc.player.getChunkPos();
        int r = Math.min(20, Math.max(8, reach + 2));
        int minX = wholeArea ? area.minCX() : player.x - r;
        int minZ = wholeArea ? area.minCZ() : player.z - r;
        int maxX = wholeArea ? area.maxCX() : player.x + r;
        int maxZ = wholeArea ? area.maxCZ() : player.z + r;
        // Global snapshots are sampled, never an unbounded scan over the selected rectangle.
        int stepX = wholeArea ? Math.max(1, (int) Math.ceil(area.width() / 64.0)) : 1;
        int stepZ = wholeArea ? Math.max(1, (int) Math.ceil(area.depth() / 64.0)) : 1;
        data.addProperty("minCX", minX);
        data.addProperty("minCZ", minZ);
        data.addProperty("stepX", stepX);
        data.addProperty("stepZ", stepZ);
        data.addProperty("wholeArea", wholeArea);
        if (wholeArea && exploredGrid != null) {
            JsonArray gaps = new JsonArray();
            for (int[] gap : exploredGrid.uncoveredSamples(128)) {
                JsonArray coordinates = new JsonArray();
                coordinates.add(gap[0]);
                coordinates.add(gap[1]);
                coordinates.add(diagnosticChunk(gap[0], gap[1]));
                gaps.add(coordinates);
            }
            data.add("firstMissingChunks", gaps);
        }
        data.addProperty("maskLegend", "1=loaded,2=mapped,4=mapUnknown,8=explored,16=deferred,32=inArea; two hex digits per chunk, rows increase Z, columns increase X");
        JsonArray rows = new JsonArray();
        int sampled = 0, deferredBlank = 0, deferredUnknown = 0, loadedBlank = 0;
        final String hex = "0123456789abcdef";
        for (int cz = minZ; cz <= maxZ; cz += stepZ) {
            StringBuilder row = new StringBuilder();
            for (int cx = minX; cx <= maxX; cx += stepX) {
                int mask = diagnosticChunk(cx, cz);
                row.append(hex.charAt(mask >>> 4)).append(hex.charAt(mask & 15));
                sampled++;
                if ((mask & 32) == 0) continue;
                if ((mask & 22) == 16) deferredBlank++;
                if ((mask & 20) == 20) deferredUnknown++;
                if ((mask & 7) == 1) loadedBlank++;
            }
            rows.add(row.toString());
        }
        data.add("chunkRows", rows);
        data.addProperty("sampled", sampled);
        data.addProperty("deferredButBlank", deferredBlank);
        data.addProperty("deferredMapUnknown", deferredUnknown);
        data.addProperty("loadedButBlank", loadedBlank);
        data.addProperty("sampleMillis", (System.nanoTime() - started) / 1_000_000.0);
        diagnostics.log(data);
    }

    private Point updateFollower(double arrive) {
        Point reached = follower.update(mc.player.getX(), mc.player.getZ(), arrive);
        if (reached != null && diagnosticLogging.get()) {
            JsonObject data = diagnosticEvent("waypoint-reached");
            data.add("reached", diagnosticPoint(reached));
            double distance = Math.hypot(reached.x() - mc.player.getX(), reached.z() - mc.player.getZ());
            data.addProperty("distance", distance);
            data.addProperty("tolerance", arrive);
            data.addProperty("reason", distance <= arrive ? "proximity" : "passed-end-plane");
            diagnostics.log(data);
        }
        return reached;
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
        String text = message.formatted(args);
        FILE_LOG.warn(text);
        // Not the site's own problems: they'd go round in circles while it can't be reached
        if (!text.startsWith("Site:")) siteEvent("warn", "warning", text);
    }

    @Override
    public void error(String message, Object... args) {
        super.error(message, args);
        String text = message.formatted(args);
        FILE_LOG.warn(text);
        if (!text.startsWith("Site:")) siteEvent("error", "error", text);
    }

    @Override
    public void onActivate() {
        if (mc.player == null || mc.world == null) {
            turnOff();
            return;
        }
        paused = false;
        stopLogged = false;
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
        diagnosticSnapshot("deactivate", true);
        diagnostic("deactivate", "module disabled or run finished");
        if (phase != Phase.IDLE && !stopLogged) {
            siteEvent("info", "stop", phase == Phase.SPIRAL ? "Stopped the spiral %s out - turning it on carries on".formatted(formatBlocks(spiralExtent() * 16))
                : area == null ? "Stopped" : "Stopped at %d%% - the run is saved, turning it on carries on".formatted(percent()));
        }
        stopLogged = true;
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
        coverage = null;
        follower.clear();
        stripPre.clear();
        stripPath.clear();
        onStrip = false;
        flownOver = null;
        withheld = null;
        baseChunks.clear();
        baseCandidates.clear();
        scoredEntities.clear();
        markedItems.clear();
        markedPets.clear();
        petCheckTicks = 0;
        markedPearls.clear();
        pearlsSeen.clear();
        playerPlaced.clear();
        playerBroken.clear();
        playerDrops.clear();
        deathSpots.clear();
        wasDead = false;
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
        siteFindTicks = 0;
        pendingSweep = null;
        if (pendingCleanup != null) pendingCleanup.cancel(false);
        pendingCleanup = null;
        cleanupPlan = List.of();
        cleanupIndex = 0;
        cleanupTailBlocks = 0;
        planGeneration++;
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
        String info = infoText();
        if (sectors != null && sectors.current() != null) info = "%s %d/%d%s ".formatted(
            sectors.transit() ? "Transit" : "Sector", Math.min(sectors.visited() + 1, sectors.total()), sectors.total(),
            sectors.deferredCount() > 0 ? " (%d deferred)".formatted(sectors.deferredCount()) : "") + info;
        return rescan ? "Rescan " + info : info;
    }

    private String infoText() {
        if (paused) return "Paused %d%%".formatted(percent());
        if (phase == Phase.SCAN) return "Reading map";
        int eta = etaSeconds();
        if (phase == Phase.SETTLE) return "%d%% checking%s".formatted(percent(),
            sectors != null && eta >= 0 ? " ~" + formatDuration(eta) : "");
        return eta < 0 ? "%d%%".formatted(percent()) : "%d%% ~%s".formatted(percent(), formatDuration(eta));
    }

    /** Explored is what's drawn on Xaero's map: with it installed, and not on a rescan. */
    private boolean readsMap() {
        return xaero && !rescan;
    }

    /** A rescan always flies strips: the loops follow the edge of blank map, and there's none. */
    private boolean contour() {
        return sectors == null && mode.get() != Mode.Sectors && pattern.get() == Pattern.Contour && !rescan;
    }

    /** Coverage remains global; only route planning and cleanup are confined to the active sector. */
    private Area planningArea() {
        return sectors != null && sectors.current() != null ? sectors.current() : area;
    }

    /** Settings can change while an existing run is active; never keep its old global route. */
    private boolean syncAreaMode() {
        if (area == null || phase == Phase.IDLE || phase == Phase.SPIRAL || mode.get() == Mode.Spiral) return false;
        boolean useSectors = mode.get() == Mode.Sectors;
        if (useSectors == (sectors != null)) return false;

        endStrip(false);
        planGeneration++;
        if (pendingSweep != null) pendingSweep.cancel(false);
        pendingSweep = null;
        if (pendingCleanup != null) pendingCleanup.cancel(false);
        pendingCleanup = null;
        cleanupPlan = List.of();
        cleanupIndex = 0;
        cleanupTailBlocks = 0;
        cleanupPass = 0;
        sectorBlocked = false;
        follower.clear();
        sweepHead = null;
        shownEta.reset();
        sectors = useSectors ? newSectors() : null;
        if (useSectors) {
            startSectorSwath();
            enteredSector();
        } else if (sectorSwath.auto()) reach = sectorSwath.ceiling() + 1;
        report("Switched the current run to (highlight)%s(default); keeping %d confirmed chunks and rebuilding the route.",
            useSectors ? "Sectors" : "Area", explored.size());

        // Initial reads cover the whole selection and may continue. A settle read belongs to
        // the old planning area, so discard it before constructing the new sweep.
        if (phase != Phase.SCAN) {
            if (phase == Phase.SETTLE && scan != null) {
                scan.cancel();
                scan = null;
            }
            phase = Phase.SWEEP;
            phaseTicks = 0;
            if (sectors != null) reportSector();
            if (!paused) planSweep();
        }
        saveSession();
        return true;
    }

    private boolean confirmedChunk(int x, int z) {
        return explored.contains(ChunkPos.toLong(x, z));
    }

    private boolean prepareSector() {
        if (sectors == null) return true;
        int before = sectors.currentIndex();
        while (sectors.advance(this::confirmedChunk, playerChunkX(), playerChunkZ())) {
            sectorFinished();
            cleanupPass = 0;
        }
        if (sectors.current() == null) {
            finish();
            return false;
        }
        if (before != sectors.currentIndex()) {
            enteredSector();
            reportSector();
        }
        return true;
    }

    /** New runs use the world-aligned grid: the same sectors whatever rectangle is selected. */
    private SectorTraversal newSectors() {
        return new SectorTraversal(area, sectorSize.get(), true, playerChunkX(), playerChunkZ());
    }

    /** Called with {@link #reach} holding the swath expected from the view distance or learned before. */
    private void startSectorSwath() {
        if (restoredSwath != null) sectorSwath.restore(restoredSwath[0], restoredSwath[1], sectorReachSetting.get());
        else sectorSwath.start(reach, sectorReachSetting.get());
        restoredSwath = null;
        applySectorSwath();
        int fitted = SectorPlanner.fittedSize(sectors.size(), reach);
        log("Sectors: swath %d chunks to each side (%s), strips %d chunks apart%s", reach,
            sectorSwath.auto() ? "auto, at most " + sectorSwath.ceiling() : "fixed", SectorPlanner.spacing(reach),
            fitted == sectors.size() ? "" : "; sector-size %d would fit whole strips without overlap".formatted(fitted));
    }

    private void applySectorSwath() {
        reach = sectorSwath.current();
        pendingReach.clear();
        if (sectors != null) sectors.setReach(reach);
    }

    /** The sector just left was finished: learn from it for the swath and the estimate. */
    private void sectorFinished() {
        if (sectorWorked && cleanupPass == 0 && sectorSwath.swept(false)) {
            applySectorSwath();
            log("Sectors: %d sectors in a row without gaps, swath widened to %d chunks", SectorReach.CLEAN_TO_WIDEN, reach);
        }
        if (sectorTimed >= 0) sectorEta.finished(sectorTicks / 20.0, sectorStartMissing);
        sectorTimed = -1;
    }

    /** A new current sector: start timing it, and give a deferred one a fresh unavailable-chunk budget. */
    private void enteredSector() {
        sectorWorked = false;
        sectorWork = null;
        sectorGapsNanos = 0;
        if (sectors == null || sectors.current() == null) return;
        sectorTimed = sectors.currentIndex();
        sectorTicks = 0;
        sectorStartMissing = sectors.missing(this::confirmedChunk);
        if (sectors.state(sectors.currentIndex()) == SectorTraversal.State.DEFERRED) {
            withheld = new WithheldChunks(area);
            flownOver = new DeferredChunks(area);
        }
    }

    private void reportSector() {
        Area sector = sectors.current();
        boolean retry = sectors.state(sectors.currentIndex()) == SectorTraversal.State.DEFERRED;
        report("%s (highlight)%d/%d(default): %dx%d chunks at X %d..%d, Z %d..%d; %d unconfirmed.",
            sectors.transit() ? "Mapped transit sector" : retry ? "Retrying deferred sector" : "Sector",
            Math.min(sectors.visited() + 1, sectors.total()), sectors.total(), sector.width(), sector.depth(),
            sector.minCX() * 16, sector.maxCX() * 16 + 15, sector.minCZ() * 16, sector.maxCZ() * 16 + 15, sectors.missing(this::confirmedChunk));
    }

    /**
     * The sector is still blank after its cleanup passes: carry on elsewhere and come back to it
     * once, after every other sector; a second failure skips it. Pause mode waits for the bind instead.
     */
    private void deferSector() {
        int index = sectors.currentIndex();
        Area sector = sectors.current();
        long left = sectors.missing(this::confirmedChunk);
        if (pendingCleanup != null) pendingCleanup.cancel(false);
        pendingCleanup = null;
        if (scan != null) scan.cancel();
        scan = null;
        endStrip(false);
        boolean more = sectors.defer(this::confirmedChunk, playerChunkX(), playerChunkZ());
        boolean skipped = sectors.state(index) == SectorTraversal.State.SKIPPED;
        warning("Sector at X %d..%d, Z %d..%d %s: %d chunks never confirmed.",
            sector.minCX() * 16, sector.maxCX() * 16 + 15, sector.minCZ() * 16, sector.maxCZ() * 16 + 15,
            skipped ? "skipped after its retry" : "deferred - retried after every other sector", left);
        sectorTimed = -1;
        cleanupPass = 0;
        if (!more) {
            finish();
            return;
        }
        enteredSector();
        reportSector();
        phase = Phase.SWEEP;
        phaseTicks = 0;
        planSweep();
        saveSession();
    }

    /** Unconfirmed chunks of every sector still to work, re-counted every few seconds for the estimate. */
    private long[] sectorWork() {
        if (sectorWork == null || activeTicks - sectorWorkTick >= 100 || activeTicks < sectorWorkTick) {
            sectorWork = sectors.remainingWork(this::confirmedChunk);
            sectorWorkTick = activeTicks;
        }
        return sectorWork;
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

        if (mode.get() == Mode.Sectors) {
            if (sectors == null) sectors = newSectors();
        } else sectors = null;
        resetFlightState();
        cleanupPass = 0;
        sectorBlocked = false;
        onStrip = false;
        explored.clear();
        exploredGrid = null;
        flownOver = new DeferredChunks(area);
        lastFlownChunk = Long.MIN_VALUE;
        contourOpen = -1;
        idleLoops = 0;
        lastRescannedChunk = Long.MIN_VALUE;
        rescanCheckTicks = 0;
        withheld = new WithheldChunks(area);
        lastRescanCheckTick = activeTicks;
        coverage = new Coverage(area);
        if (restoredCoverage != null) coverage.restore(restoredCoverage);
        if (territoryId == null) territoryId = "run-" + System.currentTimeMillis();
        restoredCoverage = null;
        lastCoverageChunk = Long.MIN_VALUE;
        coverageSentVersion = -1;
        loadedSamples.clear();
        seedFreshChunks();

        if (rescan) {
            markRescanned();
        } else if (!xaero) {
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

        String verb = rescan ? (carryingOn ? "Carrying on rescanning" : "Started rescanning") : (carryingOn ? "Carrying on exploring" : "Started exploring");
        siteEvent("info", "start", "%s a %dx%d chunk area (X %d to %d, Z %d to %d)".formatted(verb, area.width(), area.depth(),
            area.minCX() * 16, area.maxCX() * 16 + 15, area.minCZ() * 16, area.maxCZ() * 16 + 15));

        if (readsMap() && useXaeroMap.get()) {
            phase = Phase.SCAN;
            scan = newScan();
            phaseTicks = 0;
            log("Reading %d World Map regions", scan.pendingRegions());
        } else {
            beginSweep();
        }
    }

    /** State both modes start from: counters, view distance and swath width. */
    private void resetFlightState() {
        diagnosticRun = UUID.randomUUID().toString();
        diagnosticSequence = diagnosticTicks = 0;
        diagnosticChunks = diagnosticProgress = diagnosticLastExplored = 0;
        diagnosticMapRegions = diagnosticMapAdded = 0;
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
        loadedSamples.clear();
        seedFreshChunks();
        loadedReachStability.reset();
        coverageEta.reset();
        shownEta.reset();
        sectorEta.reset();
        sectorTimed = -1;
        sectorWorked = false;
        sectorWork = null;
        if (pendingCleanup != null) pendingCleanup.cancel(false);
        pendingCleanup = null;
        cleanupPlan = List.of();
        cleanupIndex = 0;
        cleanupTailBlocks = 0;
        planGeneration++;
        nextProgressReport = 25;

        radius = viewDistance.get() > 0 ? viewDistance.get() : measureRadius();
        // Xaero leaves the outermost loaded ring undrawn; the real value gets measured in flight
        reach = xaero ? Math.max(1, radius - 1) : radius;
        pendingReach.clear();
        Integer learned = learnedReach.get(reachKey());
        if (xaero && learned != null && learned != reach) {
            log("Using swath width %d learned in flight instead of %d from the view distance", learned, reach);
            reach = learned;
        }
        if (sectors != null) startSectorSwath();

        if (useElytraKeeper.get()) {
            ElytraKeeper keeper = Modules.get().get(ElytraKeeper.class);
            if (!keeper.isActive()) {
                keeper.toggle();
                startedKeeper = true;
            }
        }
        flightCheckTicks = FLIGHT_CHECK_TICKS;
        if (diagnosticLogging.get()) {
            JsonObject data = diagnosticEvent("flight-start");
            data.addProperty("schema", 1);
            data.addProperty("server", mc.getCurrentServerEntry() == null ? "singleplayer" : mc.getCurrentServerEntry().address);
            data.addProperty("viewDistanceSetting", viewDistance.get());
            data.addProperty("clientViewDistance", mc.options.getViewDistance().getValue());
            data.addProperty("overlap", overlap.get());
            data.addProperty("rotationSpeed", rotationSpeed.get());
            data.addProperty("arriveDistanceSetting", arriveDistance.get());
            data.addProperty("cleanupPassLimit", cleanupPasses.get());
            data.addProperty("useXaeroMap", useXaeroMap.get());
            data.addProperty("xaeroInstalled", xaero);
            diagnostics.log(data);
        }
    }

    private XaeroMappedChunkScan newScan() {
        Area readArea = phase == Phase.SETTLE ? planningArea() : area;
        return new XaeroMappedChunkScan(readArea.minCX(), readArea.minCZ(), readArea.maxCX(), readArea.maxCZ(), true);
    }

    /** Counts the chunk as explored, in the grid the planners use too. */
    private void addExplored(long key) {
        if (explored.add(key)) {
            diagnosticProgress++;
            if (exploredGrid != null) exploredGrid.add(ChunkPos.getPackedX(key), ChunkPos.getPackedZ(key));
        }
    }

    /** A map region got read (from memory or its file): its drawn chunks are explored. */
    private void onRegionRead(long region, LongArrayList mapped) {
        int before = explored.size();
        for (int i = 0; i < mapped.size(); i++) addExplored(mapped.getLong(i));
        diagnosticMapRegions++;
        diagnosticMapAdded += explored.size() - before;
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
        if (sectors != null) {
            if (!prepareSector()) return;
            if (sectorTimed < 0) enteredSector();
            reportSector();
        }
        if (rescan) {
            report("Rescanning (highlight)%dx%d(default) chunks in strips, view distance (highlight)%d(default), strip spacing (highlight)%d(default): items, signs and markers are looked for again and the map is redrawn.",
                area.width(), area.depth(), radius, spacing());
        } else {
            report("Exploring (highlight)%dx%d(default) chunks, view distance (highlight)%d(default), strip spacing (highlight)%d(default). (highlight)%d%%(default) %s.",
                area.width(), area.depth(), radius, spacing(), percent(),
                scan != null ? "explored so far - the rest of the World Map is read in flight, the route and time shrink as it comes in" : "already explored");
        }
        planSweep();
        if (phase == Phase.SWEEP) reportEstimate();
    }

    /** Plans the sweep over blank ground, deferring chunks actually loaded along the flight path. */
    private void planSweep() {
        if (!prepareSector()) return;
        if (contour()) {
            planLoop();
            return;
        }
        takePendingReach();
        planGeneration++;
        pendingSweep = null;
        long started = System.nanoTime();
        ChunkGrid done = planGrid(true);
        long gridDone = System.nanoTime();
        Area nextSector = sectors != null ? sectors.next(this::confirmedChunk, playerChunkX(), playerChunkZ()) : null;
        sectorExitOnly = sectors != null && sectors.missing(this::confirmedChunk) == 0;
        List<Segment> plan = sectorExitOnly && nextSector != null
            ? List.of(SectorPlanner.exitPoint(planningArea(), reach, nextSector, playerChunkX(), playerChunkZ()))
            : sectors != null ? SectorPlanner.sweep(planningArea(), reach, done, playerChunkX(), playerChunkZ(), nextSector)
            : CoveragePlanner.sweep(area, reach, overlap.get(), done, playerChunkX(), playerChunkZ());
        if (sectors != null && !sectorExitOnly && !plan.isEmpty()) sectorWorked = true;
        if (plan.isEmpty()) {
            startSettle();
            return;
        }
        long sweepDone = System.nanoTime();
        setRoute(plan);
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
        if (sectors != null) {
            planSweep();
            return;
        }
        if (!prepareSector()) return;
        if (contour()) {
            planLoop();
            return;
        }
        takePendingReach();
        long started = System.nanoTime();
        ChunkGrid done = planGrid(true).copy();
        int generation = ++planGeneration;
        Area planArea = planningArea();
        int planReach = reach, planOverlap = overlap.get();
        double fromX = playerChunkX(), fromZ = playerChunkZ();
        long prepareNanos = System.nanoTime() - started;
        pendingSweep = CompletableFuture.supplyAsync(() -> {
            long planStarted = System.nanoTime();
            List<Segment> plan = CoveragePlanner.sweep(planArea, planReach, planOverlap, done, fromX, fromZ);
            return new PlannedSweep(generation, plan, prepareNanos, System.nanoTime() - planStarted);
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
        setRoute(planned.plan());
        long onTick = planned.prepareNanos() + System.nanoTime() - started;
        notePlan("planning the sweep", onTick);
        log("Sweep planned: %d strips, %.0f blocks, in %d ms in the background, %d ms on the game thread", planned.plan().size(),
            follower.remainingDistance(mc.player.getX(), mc.player.getZ()), planned.planNanos() / 1_000_000, onTick / 1_000_000);
        return false;
    }

    /**
     * What the planners count as done: explored chunks and optionally chunks loaded along the
     * actual flight path while the map catches up. Rebuilt for every plan from
     * {@link #exploredGrid}: copying its bits is quick, adding a big map's chunks one by one took 10 ms.
     */
    private ChunkGrid planGrid(boolean withFlownOver) {
        if (planGrid == null || !planGrid.area().equals(area)) planGrid = new ChunkGrid(area);
        if (exploredGrid == null || !exploredGrid.area().equals(area)) {
            exploredGrid = new ChunkGrid(area);
            exploredGrid.addAll(explored);
        }
        planGrid.setTo(exploredGrid);
        if (withheld != null) planGrid.addAll(withheld.grid());
        if (withFlownOver && flownOver != null) planGrid.addAll(flownOver.grid());
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
                    eta < 0 ? "" : ", about (highlight)%s(default) left plus cleanup".formatted(formatDuration(eta)));
            }
            return;
        }
        if (contour()) {
            tickLoop();
            return;
        }
        if (advanceConfirmedSector()) return;
        if (sectors != null && !sectorExitOnly && sectors.missing(this::confirmedChunk) == 0) {
            endStrip(false);
            planSweep();
            return;
        }
        markFlownOver();
        if (awaitPlannedSweep() || phase != Phase.SWEEP) return;

        if (sectors == null && rescan && sweepHead != null && activeTicks % MAP_CHECK_INTERVAL_TICKS == 0
            && !planGrid(false).hasOpenRect(Math.min(sweepHead.x1(), sweepHead.x2()) - reach,
                Math.min(sweepHead.z1(), sweepHead.z2()) - reach,
                Math.max(sweepHead.x1(), sweepHead.x2()) + reach,
                Math.max(sweepHead.z1(), sweepHead.z2()) + reach)) {
            // Approaching a strip or a leftover spot can load all of it before we arrive.
            // Re-plan from here instead of finishing its obsolete transit or sweep leg.
            diagnostic("covered-sweep-replan", "first strip task already confirmed covered");
            endStrip(false);
            planSweepInBackground();
            return;
        }

        if (onStrip) {
            ChunkPos p = mc.player.getChunkPos();
            stripPath.put(stripAlongX ? p.x : p.z, stripAlongX ? p.z : p.x);
        }

        Point reached = updateFollower(arriveBlocks());
        if (reached != null) {
            if (reached.sweep()) {
                endStrip(true);
                // Re-plan after every strip. The just-flown swath is now covered, and starting
                // again from this endpoint keeps the explorer working through nearby blank ground
                // instead of following a stale global route and returning to this pocket later.
                if (sectors == null) {
                    planSweepInBackground();
                    return;
                }
            }
            if (follower.isDone()) {
                startSettle();
                return;
            }
            if (follower.current().sweep()) beginStrip();
        }

        if (sectors != null) return; // fixed two-chunk footprint and a stable route for this sector
        if (onStrip && readsMap() && ++measureTicks >= MEASURE_INTERVAL_TICKS) {
            measureTicks = 0;
            measureStrip();
        } else if (onStrip && rescan && ++measureTicks >= LOADED_SAMPLE_TICKS) {
            measureTicks = 0;
            // Just turned onto the strip from one a spacing away: the far rows across it are still coming
            if (activeTicks - stripStartTicks >= LOADED_SETTLE_TICKS) sampleLoadedReach();
        }
    }

    // Contour pattern

    /** Plans a nearby contour or narrow corridor centre line. No route left: on to the cleanup. */
    private void planLoop() {
        long started = System.nanoTime();
        ChunkGrid done = planGrid(true);
        long open = ContourPlanner.openCells(area, done);
        // A loop that left as much blank as before won't do better a second time
        if (contourOpen >= 0 && open >= contourOpen && ++idleLoops >= 2) {
            diagnostic("contour-stop", "two loops without planned coverage progress");
            diagnosticSnapshot("contour-stalled", true);
            log("Loops stopped making progress, %d chunks left for the cleanup", open);
            startSettle();
            return;
        }
        if (open < contourOpen) idleLoops = 0;
        contourOpen = open;

        List<double[]> loop = ContourPlanner.nextLoop(area, reach, overlap.get(), done, playerChunkX(), playerChunkZ());
        if (loop.isEmpty()) {
            diagnostic("contour-stop", "planner returned no loop");
            diagnosticSnapshot("contour-empty", true);
            startSettle();
            return;
        }
        List<Point> points = new ArrayList<>(loop.size());
        for (int i = 0; i < loop.size(); i++) points.add(new Point(loop.get(i)[0] * 16 + 8, loop.get(i)[1] * 16 + 8, i > 0));
        follower.setRoute(points, mc.player.getX(), mc.player.getZ());
        boolean corridor = points.size() > 1 && (points.getFirst().x() != points.getLast().x()
            || points.getFirst().z() != points.getLast().z());
        diagnosticRoute(points, corridor ? "corridor-centre" : "contour-loop");
        onStrip = false;
        long took = System.nanoTime() - started;
        notePlan("planning a loop", took);
        log("%s planned: %d points, %.0f blocks, %d chunks blank, in %d ms", corridor ? "Corridor centre line" : "Loop",
            points.size(), follower.remainingDistance(mc.player.getX(), mc.player.getZ()), open, took / 1_000_000);
    }

    private void tickLoop() {
        if (++measureTicks >= LOADED_SAMPLE_TICKS) {
            measureTicks = 0;
            // Contours have no fixed strip axis; sample across the actual flight direction.
            var velocity = mc.player.getVelocity();
            sampleLoadedReach(Math.abs(velocity.x) >= Math.abs(velocity.z));
        }
        markFlownOver();
        updateFollower(contourArriveBlocks());
        if (activeTicks % MAP_CHECK_INTERVAL_TICKS == 0 && !follower.isDone()) {
            ChunkGrid confirmed = planGrid(false);
            long skipStarted = System.nanoTime();
            // Keep an extra chunk of clearance for small flight deviations. Only confirmed map
            // coverage can remove a leg; recently loaded or unknown chunks cannot.
            for (int skipped = 0; skipped < 32 && !follower.isDone()
                && System.nanoTime() - skipStarted < 2_000_000; skipped++) {
                Point target = follower.current();
                if (CoveragePlanner.hasOpenAlong(area, reach + 1, confirmed, playerChunkX(), playerChunkZ(),
                    (target.x() - 8) / 16, (target.z() - 8) / 16)) break;
                diagnostic("covered-leg-skip", "remaining leg swath already confirmed explored");
                follower.skip(mc.player.getX(), mc.player.getZ());
            }
        }
        // Once round, plan the next loop from what is explored now: it lands just inside this one
        if (follower.isDone()) planLoop();
    }

    /** Only loaded chunks along the actual path are deferred while the map catches up. */
    private void markFlownOver() {
        if (!readsMap()) return;
        ChunkPos p = mc.player.getChunkPos();
        if (p.toLong() == lastFlownChunk && activeTicks % MAP_CHECK_INTERVAL_TICKS != 0) return;
        lastFlownChunk = p.toLong();
        if (flownOver == null) flownOver = new DeferredChunks(area);
        var chunks = mc.world.getChunkManager();
        for (int cx = Math.max(area.minCX(), p.x - reach); cx <= Math.min(area.maxCX(), p.x + reach); cx++) {
            for (int cz = Math.max(area.minCZ(), p.z - reach); cz <= Math.min(area.maxCZ(), p.z + reach); cz++) {
                if (chunks.isChunkLoaded(cx, cz)) flownOver.add(cx, cz, activeTicks);
            }
        }
    }

    /** Blocks still to fly in the sweep: the rest of the route, plus for loops a guess at the ones to come. */
    private double sweepBlocksLeft() {
        return sweepBlocksLeft(mc.player.getX(), mc.player.getZ());
    }

    /** The same from the given spot - where we were dropped, while off the server. */
    private double sweepBlocksLeft(double x, double z) {
        double blocks = follower.remainingDistance(x, z) + (phase == Phase.CLEANUP ? cleanupTailBlocks : 0);
        if (phase == Phase.SWEEP && contour() && area != null) {
            // Use current missing coverage, not the count frozen when the loop was planned.
            blocks = Math.max(blocks, Math.max(0, area.total() - explored.size()) / (double) spacing() * 16);
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
        stripMeasureNote = readsMap() ? "not measured" : rescan ? "measured from the chunks loaded" : "no map to measure on";

        // The side with more blank ground is the one this strip's width shows on
        stripSide = 0;
        stripPre.clear();
        if (!readsMap()) {
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

    /** Logs the current strip's progress; coverage is recorded from actual loaded chunks. */
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
        double seconds = (activeTicks - stripStartTicks) / 20.0;
        int flown = Math.abs(to - stripStartU) + 1;
        log("Strip %d %s: %d of %d chunks in %.0f s (%.0f blocks/s), %s", stripNumber, complete ? "done" : "cut short", flown,
            Math.abs(stripEndU - stripStartU) + 1, seconds, seconds > 0 ? flown * 16 / seconds : 0, stripMeasureNote);
        if (complete) strikeUnsentAlongStrip();
    }

    /**
     * Rescan: the chunks the finished strip was planned to cover that still didn't come get a strike.
     * The planner counts a strip's ends as covering a swath further on, so those count too.
     */
    private void strikeUnsentAlongStrip() {
        if (!rescan || withheld == null || area == null) return;
        int lo = Math.min(stripStartU, stripEndU) - reach, hi = Math.max(stripStartU, stripEndU) + reach;
        int gaveUp = 0;
        var cm = mc.world.getChunkManager();
        for (int u = lo; u <= hi; u++) {
            for (int v = stripV - reach; v <= stripV + reach; v++) {
                int cx = stripAlongX ? u : v, cz = stripAlongX ? v : u;
                if (!area.contains(cx, cz) || explored.contains(ChunkPos.toLong(cx, cz))) continue;
                // Came in since the last check: counted as rescanned on the next one
                if (cm.isChunkLoaded(cx, cz)) continue;
                if (withheld.missedStrip(cx, cz)) gaveUp++;
            }
        }
        if (gaveUp > 0) logWithheld(gaveUp, "after %d strips over them".formatted(WithheldChunks.GIVE_UP_STRIPS));
    }

    private void logWithheld(int gaveUp, String how) {
        ChunkPos p = mc.player.getChunkPos();
        log("The server hasn't sent %d chunk%s near %d, %d %s - skipping %s (%d in all)", gaveUp, gaveUp == 1 ? "" : "s",
            p.x * 16 + 8, p.z * 16 + 8, how, gaveUp == 1 ? "it" : "them", withheld.size());
        diagnostic("withheld-skip", "gave up on " + gaveUp + " chunks the server doesn't send, " + how);
    }


    /** Rescan: how often the loaded width across the strip is sampled, and how many samples make a width. */
    private static final int LOADED_SAMPLE_TICKS = 20, LOADED_SAMPLES = 15;
    /** Rescan: not sampled for the first seconds of a strip, while the server still sends the rows across it. */
    private static final int LOADED_SETTLE_TICKS = 100;
    private final IntArrayList loadedSamples = new IntArrayList();
    private final ReachStability loadedReachStability = new ReachStability();
    /** When the chunks around came, so ones left from an earlier strip don't count as loaded across this one. */
    private final FreshChunks freshChunks = new FreshChunks();

    /**
     * Rescan and contours: without a measurable straight strip on blank map, the chunks
     * loaded across the strip are counted instead - on the side loading less - and the lower decile of
     * the last samples becomes the swath. Widening needs three stable windows. The server sends fewer chunks to a player flying past, and
     * may cut its view distance under load: a width learned on another day would leave gaps.
     */
    private void sampleLoadedReach() {
        sampleLoadedReach(stripAlongX);
    }

    private void sampleLoadedReach(boolean alongX) {
        ChunkPos p = mc.player.getChunkPos();
        var chunks = mc.world.getChunkManager();
        int plus = 0, minus = 0;
        while (plus < MAX_MEASURED_RADIUS && (alongX ? freshLoaded(p.x, p.z + plus + 1) : freshLoaded(p.x + plus + 1, p.z))) plus++;
        while (minus < MAX_MEASURED_RADIUS && (alongX ? freshLoaded(p.x, p.z - minus - 1) : freshLoaded(p.x - minus - 1, p.z))) minus++;
        loadedSamples.add(Math.min(plus, minus));
        if (loadedSamples.size() < LOADED_SAMPLES) return;
        IntArrayList sorted = new IntArrayList(loadedSamples);
        sorted.sort(null);
        // Use the lower decile: alternating loaded rings must not inflate coverage.
        int loaded = sorted.getInt(sorted.size() / 10);
        loadedSamples.clear();
        // Xaero leaves the outermost loaded ring undrawn: a strip redraws one less
        int measured = Math.max(1, xaero ? loaded - 1 : loaded);
        // Against the width already waiting for the next strip, so it isn't measured all over again
        int accepted = loadedReachStability.update(pendingReach.target(reach), measured);
        if (diagnosticLogging.get()) {
            JsonObject data = diagnosticEvent("loaded-width");
            data.addProperty("alongX", alongX);
            data.addProperty("currentPlus", plus);
            data.addProperty("currentMinus", minus);
            data.addProperty("measuredReach", measured);
            data.addProperty("acceptedReach", accepted);
            JsonArray samples = new JsonArray();
            for (int i = 0; i < sorted.size(); i++) samples.add(sorted.getInt(i));
            data.add("sortedSamples", samples);
            diagnostics.log(data);
        }
        stripMeasureNote = "loaded %d each side, swath %d".formatted(loaded, measured);
        if (onStrip && !contour()) {
            // Flown to its end first: re-planning now would turn back off it
            if (pendingReach.offer(reach, measured, accepted)) {
                log("Loaded width in flight: %d chunks each side, swath %d -> %d from the next strip, flying this one to its end",
                    loaded, reach, accepted);
                diagnostic("reach-pending", "old=" + reach + ", new=" + accepted + ", from the next strip");
            }
            learnedReach.put(reachKey(), pendingReach.target(reach));
            return;
        }
        if (accepted == reach) return;
        log("Loaded width in flight: %d chunks each side, swath %d -> %d", loaded, reach, accepted);
        applyReach(accepted);
    }

    /** Takes on the width measured in the middle of the strip just ended, before planning the next. */
    private void takePendingReach() {
        if (sectors != null) {
            applySectorSwath();
            return;
        }
        int measured = pendingReach.take(reach);
        if (measured == reach) return;
        diagnostic("reach-change", "old=" + reach + ", new=" + measured + ", measured on the strip before");
        log("Swath width %d -> %d chunks, planning the sweep for it", reach, measured);
        reach = measured;
    }

    /** Loaded and sent lately: one kept from a strip flown earlier says nothing of how far the server sends now. */
    private boolean freshLoaded(int cx, int cz) {
        return mc.world.getChunkManager().isChunkLoaded(cx, cz) && freshChunks.isFresh(ChunkPos.toLong(cx, cz));
    }

    /** Counts the chunks loaded around now as just sent: on starting or resuming, before any came while watching. */
    private void seedFreshChunks() {
        freshChunks.clear();
        if (mc.player == null || mc.world == null) return;
        ChunkPos p = mc.player.getChunkPos();
        var chunks = mc.world.getChunkManager();
        for (int dx = -MAX_MEASURED_RADIUS; dx <= MAX_MEASURED_RADIUS; dx++) {
            for (int dz = -MAX_MEASURED_RADIUS; dz <= MAX_MEASURED_RADIUS; dz++) {
                if (chunks.isChunkLoaded(p.x + dx, p.z + dz)) freshChunks.arrived(ChunkPos.toLong(p.x + dx, p.z + dz));
            }
        }
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
        diagnostic("mapped-width", stripMeasureNote);
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
        if (sectors != null) return;
        if (measured < 1) return;
        learnedReach.put(reachKey(), measured);
        if (measured == reach) return;

        diagnostic("reach-change", "old=" + reach + ", new=" + measured);
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
        if (advanceConfirmedSector()) return;
        if (sectors != null && sectors.missing(this::confirmedChunk) == 0) {
            phase = Phase.SWEEP;
            planSweep();
            return;
        }
        diagnosticSnapshot("before-settle", true);
        diagnostic("settle-start", "sweep or cleanup route exhausted");
        onStrip = false;
        if (scan != null) scan.cancel(); // a read still going from before; a fresh one comes after the wait
        scan = null;
        phase = Phase.SETTLE;
        phaseTicks = 0;
        sectorEarlyReadDone = false;

        ChunkPos p = mc.player.getChunkPos();
        Area settleArea = planningArea();
        int bestX = Math.floorDiv(settleArea.minCX() + settleArea.maxCX(), 2), bestZ = Math.floorDiv(settleArea.minCZ() + settleArea.maxCZ(), 2);
        long bestDist = Long.MAX_VALUE;
        for (int cx = settleArea.minCX(); cx <= settleArea.maxCX(); cx++) {
            for (int cz = settleArea.minCZ(); cz <= settleArea.maxCZ(); cz++) {
                if (explored.contains(ChunkPos.toLong(cx, cz)) || isWithheld(cx, cz)) continue;
                long d = (long) (cx - p.x) * (cx - p.x) + (long) (cz - p.z) * (cz - p.z);
                if (d < bestDist) {
                    bestDist = d;
                    bestX = cx;
                    bestZ = cz;
                }
            }
        }
        if (sectors != null) {
            Area inner = SectorPlanner.flightArea(settleArea, reach);
            bestX = MathHelper.clamp(bestX, inner.minCX(), inner.maxCX());
            bestZ = MathHelper.clamp(bestZ, inner.minCZ(), inner.maxCZ());
        }
        follower.setRoute(List.of(new Point(blockCentre(bestX), blockCentre(bestZ), false)), mc.player.getX(), mc.player.getZ());
        diagnostic("settle-target", "nearest unconfirmed chunk selected");
    }

    private void tickSettle() {
        if (sectors != null && sectors.missing(this::confirmedChunk) == 0) {
            startSettle();
            return;
        }
        if (pendingCleanup != null) {
            applyPlannedCleanup();
            return;
        }
        double arrive = arriveBlocks();
        updateFollower(arrive);
        holdAtSettlePoint(arrive);
        phaseTicks++;
        if (scan == null) {
            int wait = readsMap() ? SETTLE_TICKS : SETTLE_TICKS_NO_MAP;
            if (sectors != null && !sectorEarlyReadDone) wait = SETTLE_TICKS_NO_MAP;
            if (phaseTicks < wait) return;
            if (!readsMap()) {
                planCleanup();
                return;
            }
            scan = newScan();
            return;
        }

        boolean done = scan.tick(this::onRegionRead);
        if (!done && phaseTicks < SETTLE_TICKS + SCAN_TIMEOUT_TICKS) return;
        diagnostic("settle-map-read", done ? "complete" : "timed out; remaining regions=" + scan.pendingRegions());
        scan.cancel();
        scan = null;
        if (sectors != null) {
            if (sectors.missing(this::confirmedChunk) == 0) {
                startSettle();
                return;
            }
            sectorEarlyReadDone = true;
            // An early read can confirm completion after one second. Real gaps still get
            // the original settling time and a final fresh read before consuming cleanup.
            if (phaseTicks < SETTLE_TICKS) return;
        }
        planCleanup();
    }

    /** Confirmed coverage can arrive during settling; no fixed wait or cleanup is needed then. */
    private boolean advanceConfirmedSector() {
        if (sectors == null || !sectors.canAdvance(this::confirmedChunk, playerChunkX(), playerChunkZ())) return false;
        if (scan != null) scan.cancel();
        scan = null;
        if (pendingCleanup != null) pendingCleanup.cancel(false);
        pendingCleanup = null;
        if (!prepareSector()) return true;
        phase = Phase.SWEEP;
        phaseTicks = 0;
        planSweep();
        return true;
    }

    /**
     * The wait and the map read take seconds, and the elytra keeps flying the last heading: past the
     * settle point it once went some 600 blocks straight out of the area. Circle back to it instead,
     * once out of the arrive distance, so it isn't "reached" again on every tick.
     */
    private void holdAtSettlePoint(double arrive) {
        if (!follower.isDone()) return;
        Point hold = follower.previous();
        if (hold == null) {
            // Nothing flown to yet (a restored run): hold where we are, kept inside the area
            Area holdArea = sectors != null ? SectorPlanner.flightArea(planningArea(), reach) : area;
            hold = new Point(blockCentre(MathHelper.clamp(chunk(mc.player.getX()), holdArea.minCX(), holdArea.maxCX())),
                blockCentre(MathHelper.clamp(chunk(mc.player.getZ()), holdArea.minCZ(), holdArea.maxCZ())), false);
        } else if (Math.hypot(hold.x() - mc.player.getX(), hold.z() - mc.player.getZ()) <= arrive) {
            return;
        }
        follower.setRoute(List.of(hold), mc.player.getX(), mc.player.getZ());
    }

    private void planCleanup() {
        diagnosticSnapshot("before-cleanup", true);
        if (sectors != null) {
            if (sectors.missing(this::confirmedChunk) == 0) {
                startSettle();
                return;
            }
            int before = sectors.currentIndex();
            if (!prepareSector()) return;
            if (before != sectors.currentIndex()) {
                phase = Phase.SWEEP;
                planSweep();
                return;
            }
            Area sector = sectors.current();
            if (cleanupPass >= cleanupPasses.get()
                || !planGrid(false).hasOpenRect(sector.minCX(), sector.minCZ(), sector.maxCX(), sector.maxCZ())) {
                if (unfinishedSector.get() == UnfinishedSector.Defer) {
                    deferSector();
                    return;
                }
                sectorBlocked = true;
                warning("Sector %d/%d remains unfinished: %d chunks unconfirmed. Paused; press the bind to retry this sector.",
                    sectors.visited() + 1, sectors.total(), sectors.missing(this::confirmedChunk));
                setPaused(true);
                return;
            }
            // The sector's own route left gaps: the swath was wider than the server really loads
            if (cleanupPass == 0 && sectorWorked) {
                sectorWorked = false;
                int was = reach;
                if (sectorSwath.swept(true)) {
                    applySectorSwath();
                    log("Sectors: the route left %d chunks blank with a swath of %d, falling back to %d",
                        sectors.missing(this::confirmedChunk), was, reach);
                }
            }
        }
        long missing = area.total() - explored.size();
        // The ones the server won't send aren't worth another pass
        if (sectors == null && (missing - (withheld != null ? withheld.size() : 0) <= 0 || cleanupPass >= cleanupPasses.get())) {
            finish();
            return;
        }
        cleanupPass++;

        // Spots are passed within the arrive distance, so each one covers that much less
        cleanupRadius = sectors != null ? reach : CoveragePlanner.cleanupRadius(reach, cleanupArriveBlocks());
        long started = System.nanoTime();
        ChunkGrid done = planGrid(false).copy();
        int generation = ++planGeneration;
        Area planArea = planningArea();
        int planRadius = cleanupRadius;
        boolean sectorCleanup = sectors != null;
        Area nextSector = sectorCleanup ? sectors.next(this::confirmedChunk, playerChunkX(), playerChunkZ()) : null;
        double fromX = playerChunkX(), fromZ = playerChunkZ();
        pendingCleanup = CompletableFuture.supplyAsync(() -> {
            long planStarted = System.nanoTime();
            List<Segment> spots = sectorCleanup ? SectorPlanner.cleanup(planArea, planRadius, done, fromX, fromZ, nextSector)
                : CoveragePlanner.cleanup(planArea, planRadius, done, fromX, fromZ);
            double tail = 0;
            for (int i = 1; i < spots.size(); i++) tail += Math.hypot(
                spots.get(i).x1() - spots.get(i - 1).x1(), spots.get(i).z1() - spots.get(i - 1).z1()) * 16;
            return new PlannedCleanup(generation, spots, tail, System.nanoTime() - planStarted);
        }, PLANNER);
        phase = Phase.SETTLE;
        diagnostic("cleanup-plan-start", "background cleanup planning");
        notePlan("preparing cleanup snapshot", System.nanoTime() - started);
    }

    private void applyPlannedCleanup() {
        if (!pendingCleanup.isDone()) return;
        CompletableFuture<PlannedCleanup> future = pendingCleanup;
        pendingCleanup = null;
        PlannedCleanup planned;
        try {
            planned = future.join();
        } catch (CompletionException | CancellationException e) {
            FILE_LOG.error("Planning the cleanup in the background failed", e);
            cleanupPass--; // retry preparation without consuming a completed pass
            phaseTicks = 0;
            return;
        }
        if (planned.generation() != planGeneration) return;
        long started = System.nanoTime();
        cleanupPlan = planned.spots();
        cleanupIndex = 0;
        cleanupTailBlocks = planned.tailBlocks();
        if (cleanupPlan.isEmpty()) {
            startSettle();
            return;
        }
        phase = Phase.CLEANUP;
        installCleanupBatch();
        notePlan("installing cleanup batch", System.nanoTime() - started);
        long missing = sectors != null ? sectors.missing(this::confirmedChunk) : area.total() - explored.size();
        log("Cleanup pass %d planned: %d spots, radius %d, %.0f blocks, in %d ms in the background",
            cleanupPass, cleanupPlan.size(), cleanupRadius, sweepBlocksLeft(), planned.nanos() / 1_000_000);
        diagnostic("cleanup-plan-ready", "background plan ready; bounded waypoint batches");

        int eta = etaSeconds();
        String text = "%s: (highlight)%d(default) chunks still blank, picking them up at (highlight)%d(default) spots%s.".formatted(
            cleanupPass == 1 ? "Sweep done" : "Cleanup pass " + cleanupPass, missing, cleanupPlan.size(),
            eta < 0 ? "" : (sectors != null ? ", about (highlight)%s(default) left for the whole selection" : ", about (highlight)%s(default)").formatted(formatDuration(eta)));
        report("%s", text);
        siteEvent("info", "phase", text);
    }

    private void installCleanupBatch() {
        int end = Math.min(cleanupPlan.size(), cleanupIndex + CLEANUP_BATCH_SIZE);
        // The uninstalled tail starts at the final point of this batch. The joining leg is
        // transferred into follower.remainingDistance when the next batch is installed.
        for (int i = Math.max(1, cleanupIndex); i < end; i++) cleanupTailBlocks -= Math.hypot(
            cleanupPlan.get(i).x1() - cleanupPlan.get(i - 1).x1(),
            cleanupPlan.get(i).z1() - cleanupPlan.get(i - 1).z1()) * 16;
        cleanupTailBlocks = Math.max(0, cleanupTailBlocks);
        setRoute(cleanupPlan.subList(cleanupIndex, end));
        cleanupIndex = end;
    }

    private void tickCleanup() {
        if (sectors != null && sectors.missing(this::confirmedChunk) == 0) {
            startSettle();
            return;
        }
        updateFollower(cleanupArriveBlocks());
        // Check before steering on every tick: at 64 blocks/s a one-second delay can
        // send us several chunks back towards a spot that the map has already filled.
        // Bound both the number of skips and the work between checks on the game thread.
        long skipStarted = System.nanoTime();
        for (int skipped = 0; skipped < 32 && !follower.isDone()
            && System.nanoTime() - skipStarted < 2_000_000; skipped++) {
            if (spotHasOpen(follower.current())) break;
            diagnostic("cleanup-skip", "target footprint already explored");
            follower.skip(mc.player.getX(), mc.player.getZ());
        }
        if (follower.isDone()) {
            if (cleanupIndex < cleanupPlan.size()) installCleanupBatch();
            else {
                cleanupPlan = List.of();
                cleanupTailBlocks = 0;
                startSettle();
            }
        }
    }

    private boolean spotHasOpen(Point spot) {
        int x = chunk(spot.x()), z = chunk(spot.z());
        Area spotArea = planningArea();
        for (int cx = Math.max(spotArea.minCX(), x - cleanupRadius); cx <= Math.min(spotArea.maxCX(), x + cleanupRadius); cx++) {
            for (int cz = Math.max(spotArea.minCZ(), z - cleanupRadius); cz <= Math.min(spotArea.maxCZ(), z + cleanupRadius); cz++) {
                if (!explored.contains(ChunkPos.toLong(cx, cz)) && !isWithheld(cx, cz)) return true;
            }
        }
        return false;
    }

    private boolean isWithheld(int cx, int cz) {
        return withheld != null && withheld.test(cx, cz);
    }

    private void finish() {
        diagnosticSnapshot("finish", true);
        diagnostic("finish", explored.size() >= area.total() ? "fully explored" : "cleanup pass limit reached with gaps");
        long missing = area.total() - explored.size();
        String took = formatDuration(activeTicks / 20);
        String text = missing <= 0 ? "Area fully %s in (highlight)%s(default).".formatted(rescan ? "rescanned" : "explored", took)
            : "Done in (highlight)%s(default), (highlight)%d(default) chunks could not be loaded.".formatted(took, missing);
        if (sectors != null && sectors.skippedCount() > 0) text += " " + skippedSectorsText();
        report("%s", text);
        siteEvent("success", "finish", text + " Found: " + foundSummary() + ".");
        stopLogged = true;
        saveRunTerritory();
        territoryId = null;
        area = null;
        sectors = null;
        sectorBlocked = false;
        rescan = false;
        turnOff();
        forgetSession();
        leaveServer();
    }

    /** A block the player places during a run is theirs (Meteor's place event: by hand or a module of theirs). */
    @EventHandler
    private void onPlaceBlock(PlaceBlockEvent event) {
        if (phase == Phase.IDLE || event.blockPos == null) return;
        playerPlaced.add(event.blockPos.asLong());
    }

    /** What drops where the player breaks a block is theirs for a while. */
    @EventHandler
    private void onBreakBlock(BreakBlockEvent event) {
        if (phase == Phase.IDLE || event.blockPos == null) return;
        long key = event.blockPos.asLong();
        playerPlaced.remove(key);
        playerBroken.put(key, System.currentTimeMillis());
    }

    /**
     * An item coming in thrown (moving) right by the player is one it threw: by hand, or an inventory
     * cleaner of its. Items lying still come in moving not at all, and from far off, as their chunks load.
     */
    @EventHandler
    private void onEntityAdded(EntityAddedEvent event) {
        if (phase == Phase.IDLE || mc.player == null || !(event.entity instanceof ItemEntity item)) return;
        if (item.getVelocity().lengthSquared() > 1e-4 && item.squaredDistanceTo(mc.player) <= TOSS_RADIUS * TOSS_RADIUS) {
            playerDrops.add(item.getUuid());
        }
    }

    /** Notes where the player died, once per death. */
    private void noteDeath() {
        boolean dead = mc.player.isDead();
        if (dead && !wasDead) deathSpots.add(mc.player.getBlockPos());
        wasDead = dead;
    }

    /** True for an item the player threw, dropped dying, or that dropped where it broke something lately; remembered after. */
    private boolean isPlayerDrop(Entity item) {
        if (playerDrops.contains(item.getUuid())) return true;
        for (BlockPos death : deathSpots) {
            if (item.squaredDistanceTo(death.getX() + 0.5, death.getY() + 0.5, death.getZ() + 0.5) <= DEATH_DROP_RADIUS * DEATH_DROP_RADIUS) {
                playerDrops.add(item.getUuid());
                return true;
            }
        }
        if (playerBroken.isEmpty()) return false;
        long now = System.currentTimeMillis();
        playerBroken.values().removeIf(at -> now - at > PLAYER_DROP_MILLIS);
        for (long key : playerBroken.keySet()) {
            BlockPos broken = BlockPos.fromLong(key);
            if (item.squaredDistanceTo(broken.getX() + 0.5, broken.getY() + 0.5, broken.getZ() + 0.5) <= PLAYER_DROP_RADIUS * PLAYER_DROP_RADIUS) {
                playerDrops.add(item.getUuid());
                return true;
            }
        }
        return false;
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
        siteEvent("error", "totem", why);
        stopLogged = true;
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
        siteEvent("info", "leave", "Left the server (leave-on-finish)");
        // After this tick: other listeners of it still expect a world
        mc.send(() -> {
            if (mc.world == null) return;
            mc.world.disconnect();
            mc.disconnect(new MultiplayerScreen(new TitleScreen()));
        });
    }

    // Shared

    /** Installs direct legs to each task, without intermediate detours around covered ground. */
    private void setRoute(List<Segment> plan) {
        sweepHead = phase == Phase.SWEEP && !plan.isEmpty() ? plan.getFirst() : null;
        List<Point> points = new ArrayList<>();
        for (Segment s : plan) {
            if (sectors != null) s = SectorPlanner.project(planningArea(), reach, s);
            points.add(new Point(blockCentre(s.x1()), blockCentre(s.z1()), false));
            if (!s.isSpot()) points.add(new Point(blockCentre(s.x2()), blockCentre(s.z2()), true));
        }
        follower.setRoute(points, mc.player.getX(), mc.player.getZ());
        diagnosticRoute(points, "sweep-or-cleanup");
        onStrip = false;
    }

    /**
     * The ground loaded around the player counts as flown over: on entering each chunk, and every
     * second for chunks that came in late. As far as the server sends, not just the planned swath -
     * it often sends a little more, and that ground got seen too. The server unloads what falls out
     * of its range, so only what's around the player now is loaded.
     */
    private void markCoverage() {
        if (coverage == null) return;
        ChunkPos p = mc.player.getChunkPos();
        if (p.toLong() == lastCoverageChunk && ++coverageCheckTicks < 20) return;
        lastCoverageChunk = p.toLong();
        coverageCheckTicks = 0;
        var chunks = mc.world.getChunkManager();
        coverage.markAround(p.x, p.z, MAX_MEASURED_RADIUS, chunks::isChunkLoaded);
    }

    /** Picks up chunks around the player that the map has drawn by now. */
    private void checkMapAroundPlayer() {
        if (!readsMap() || ++mapCheckTicks < MAP_CHECK_INTERVAL_TICKS) return;
        mapCheckTicks = 0;
        if (flownOver != null) {
            int released = flownOver.reconcile(activeTicks, (cx, cz) -> {
                if (explored.contains(ChunkPos.toLong(cx, cz))) return DeferredChunks.State.MAPPED;
                return switch (XaeroMappedChunkScan.mapState(cx, cz)) {
                    case XaeroMappedChunkScan.MAPPED -> DeferredChunks.State.MAPPED;
                    case XaeroMappedChunkScan.NOT_MAPPED -> DeferredChunks.State.BLANK;
                    default -> DeferredChunks.State.UNKNOWN;
                };
            }, this::addExplored);
            if (released > 0) diagnostic("deferred-release", "returned " + released + " unconfirmed chunks to planning");
        }
        ChunkPos p = mc.player.getChunkPos();
        int r = radius + MAP_CHECK_EXTRA;
        for (int cx = Math.max(area.minCX(), p.x - r); cx <= Math.min(area.maxCX(), p.x + r); cx++) {
            for (int cz = Math.max(area.minCZ(), p.z - r); cz <= Math.min(area.maxCZ(), p.z + r); cz++) {
                long key = ChunkPos.toLong(cx, cz);
                if (!explored.contains(key) && XaeroMappedChunkScan.mapState(cx, cz) == XaeroMappedChunkScan.MAPPED) addExplored(key);
            }
        }
    }

    /**
     * Rescan: the loaded chunks within the swath width of the player are done - scanned on arrival,
     * and near enough for Xaero to redraw. Checked on entering a chunk, and every so often for ones
     * that came in late. One well inside the swath that the server keeps not sending while its
     * neighbours came is given up on: the sweep used to fly back at it strip after strip, for good.
     */
    private void markRescanned() {
        ChunkPos p = mc.player.getChunkPos();
        if (p.toLong() == lastRescannedChunk && ++rescanCheckTicks < MAP_CHECK_INTERVAL_TICKS) return;
        lastRescannedChunk = p.toLong();
        rescanCheckTicks = 0;
        // Paused or off the server in between doesn't count as waiting for the chunks
        int waited = MathHelper.clamp(activeTicks - lastRescanCheckTick, 0, MAP_CHECK_INTERVAL_TICKS);
        lastRescanCheckTick = activeTicks;
        boolean counting = withheld != null && !paused && (phase == Phase.SWEEP || phase == Phase.CLEANUP || phase == Phase.SETTLE);
        int gaveUp = 0;
        var cm = mc.world.getChunkManager();
        for (int cx = Math.max(area.minCX(), p.x - reach); cx <= Math.min(area.maxCX(), p.x + reach); cx++) {
            for (int cz = Math.max(area.minCZ(), p.z - reach); cz <= Math.min(area.maxCZ(), p.z + reach); cz++) {
                if (cm.isChunkLoaded(cx, cz)) {
                    addExplored(ChunkPos.toLong(cx, cz));
                    if (withheld != null) withheld.loaded(cx, cz);
                    continue;
                }
                // The swath's edge comes in last in flight; and with nothing around loaded either, it's lag
                if (!counting || Math.max(Math.abs(cx - p.x), Math.abs(cz - p.z)) >= reach) continue;
                if (!cm.isChunkLoaded(cx - 1, cz) && !cm.isChunkLoaded(cx + 1, cz)
                    && !cm.isChunkLoaded(cx, cz - 1) && !cm.isChunkLoaded(cx, cz + 1)) continue;
                if (withheld.missed(cx, cz, waited)) gaveUp++;
            }
        }
        if (gaveUp > 0) logWithheld(gaveUp, "in %d s in reach while sending the ones around".formatted(WithheldChunks.GIVE_UP_TICKS / 20));
    }

    // Auto markers

    /** Block -> waypoint name for everything the markers look for right now, or empty with them off. */
    private Map<Block, String> markerBlocks() {
        Map<Block, String> wanted = new HashMap<>();
        if (!autoMarkers.get()) return wanted;
        boolean end = mc.world != null && mc.world.getRegistryKey() == World.END;
        for (Block block : customMarkerBlocks.get()) wanted.put(block, block.getName().getString());
        for (Marker marker : Marker.values()) {
            if (!markerToggles.get(marker).get()) continue;
            for (Block block : Registries.BLOCK) {
                // The End's own exit portal is no stronghold
                if (block == Blocks.END_PORTAL && end) continue;
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
                        // The player's own blocks: their ender chest, their shulker box
                        if (!playerPlaced.isEmpty() && playerPlaced.contains(BlockPos.asLong(baseX + x, baseY + y, baseZ + z))) continue;
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
     * "Loot: Elytra, Shulker Box ×2 (Totem of Undying ×24, Elytra ×1 +3), Empty Shulker Box".
     */
    private static final class LootPile {
        final BlockPos first;
        final Map<LootKind, Integer> counts = new HashMap<>();
        /** What the shulker boxes and bundles in it hold, together. */
        final Map<Item, Integer> inside = new HashMap<>();
        /** Where the best item lies: the marker goes on it. */
        BlockPos best;
        int bestRank = Integer.MAX_VALUE;
        int quietScans;

        LootPile(BlockPos first) {
            this.first = first;
        }
    }

    /** A kind of item in a pile: an empty shulker box is told from one with something in. */
    private record LootKind(Item item, boolean empty) {
        String name() {
            return (empty ? "Empty " : "") + itemName(item);
        }
    }

    /** Items closer than this to a pile's first one are part of it. */
    private static final int LOOT_RADIUS = 16;
    /** Item scans a pile has to go without a new item before it's marked: the entities around come in over a few seconds. */
    private static final int LOOT_SETTLE_SCANS = 5;
    private static final String LOOT_PREFIX = "Loot: ";
    /** Kinds named in a pile's marker; the rest are "+N". */
    private static final int LOOT_NAMED_KINDS = 3;
    /** Kinds of what's inside named after the shulker boxes holding them; the rest are "+N". */
    private static final int LOOT_NAMED_INSIDE = 2;
    private final List<LootPile> lootPiles = new ArrayList<>();

    /**
     * Puts an item found on the ground into the pile it lies by, or starts one. {@code empty}: a
     * shulker box with nothing in; {@code inside}: what one holds, by kind.
     */
    private void addToLoot(List<LootPile> piles, Item item, int count, BlockPos pos, boolean empty, Map<Item, Integer> inside) {
        // The nearest one: piles a little over LOOT_RADIUS apart both reach items between them
        LootPile pile = null;
        double nearest = (double) LOOT_RADIUS * LOOT_RADIUS;
        for (LootPile p : piles) {
            double d = p.first.getSquaredDistance(pos);
            if (d < nearest) {
                nearest = d;
                pile = p;
            }
        }
        if (pile == null) piles.add(pile = new LootPile(pos));
        LootKind kind = new LootKind(item, empty);
        pile.counts.merge(kind, count, Integer::sum);
        LootPile into = pile;
        inside.forEach((i, n) -> into.inside.merge(i, n, Integer::sum));
        pile.quietScans = 0;
        // A box holding elytra puts the marker on it, as elytra lying there would
        int rank = lootRank(kind);
        for (Item i : inside.keySet()) rank = Math.min(rank, lootRank(i));
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
        List<Map.Entry<LootKind, Integer>> kinds = new ArrayList<>(pile.counts.entrySet());
        kinds.sort(Comparator.<Map.Entry<LootKind, Integer>>comparingInt(e -> lootRank(e.getKey()))
            .thenComparing(Map.Entry.<LootKind, Integer>comparingByValue().reversed()));
        StringBuilder name = new StringBuilder(LOOT_PREFIX);
        boolean insideNamed = false;
        for (int i = 0; i < kinds.size() && i < LOOT_NAMED_KINDS; i++) {
            LootKind kind = kinds.get(i).getKey();
            if (i > 0) name.append(", ");
            name.append(kind.name());
            if (kinds.get(i).getValue() > 1) name.append(" ×").append(kinds.get(i).getValue());
            // What the boxes hold, after the first of them: "Shulker Box ×2 (Totem of Undying ×24, Elytra ×1 +3)"
            if (!insideNamed && !kind.empty() && !pile.inside.isEmpty() && ItemDetails.holdsItems(kind.item())) {
                insideNamed = true;
                name.append(" (").append(insideSummary(pile.inside)).append(')');
            }
        }
        if (kinds.size() > LOOT_NAMED_KINDS) name.append(" +").append(kinds.size() - LOOT_NAMED_KINDS);

        BlockPos pos = pile.best;
        addMarker(ITEMS_GROUP, name.toString(), initials(kinds.getFirst().getKey().name()), "square", itemsColor.get(), pos);
        if (announce) report("Marked (highlight)%s(default) on the ground at (highlight)%d, %d, %d(default).", name, pos.getX(), pos.getY(), pos.getZ());
        return true;
    }

    /** "Totem of Undying ×24, Elytra ×1 +3": the best kinds inside first, by {@link #lootRank(Item)}, then the most. */
    private String insideSummary(Map<Item, Integer> inside) {
        List<Map.Entry<Item, Integer>> kinds = new ArrayList<>(inside.entrySet());
        kinds.sort(Comparator.<Map.Entry<Item, Integer>>comparingInt(e -> lootRank(e.getKey()))
            .thenComparing(Map.Entry.<Item, Integer>comparingByValue().reversed()));
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < kinds.size() && i < LOOT_NAMED_INSIDE; i++) {
            if (i > 0) sb.append(", ");
            sb.append(itemName(kinds.get(i).getKey())).append(" ×").append(kinds.get(i).getValue());
        }
        if (kinds.size() > LOOT_NAMED_INSIDE) sb.append(" +").append(kinds.size() - LOOT_NAMED_INSIDE);
        return sb.toString();
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
        for (Item item : Registries.ITEM) byName.putIfAbsent(itemName(item), item);
        return withArchive(archive -> {
            List<FindsArchive.Find> items = archive.finds(FindsArchive.Kind.ITEM);
            mc.execute(() -> {
                if (mc.world == null) return;
                List<LootPile> piles = new ArrayList<>();
                int unknown = 0;
                for (FindsArchive.Find f : items) {
                    // Older finds may still have the colour codes some packs put in names
                    Item item = byName.get(cleanName(f.name()));
                    if (item == null) {
                        unknown++;
                        continue;
                    }
                    // A box's details are what it holds; ones found before they were kept hold nothing known
                    boolean holds = ItemDetails.holdsItems(item);
                    Map<Item, Integer> inside = new HashMap<>();
                    if (holds) ItemDetails.parseContents(f.details()).forEach((n, c) -> {
                        Item i = byName.get(n);
                        if (i != null) inside.merge(i, c, Integer::sum);
                    });
                    addToLoot(piles, item, Math.max(1, f.count()), new BlockPos(f.x(), f.y(), f.z()),
                        holds && f.details().equals(ItemDetails.EMPTY), inside);
                }
                int marked = 0;
                for (LootPile pile : piles) if (placeLootMarker(pile, false)) marked++;
                done.accept(new LootImport(marked, piles.size() - marked, unknown));
            });
        });
    }

    /** As {@link #lootRank(Item)}, but an empty shulker box goes after everything. */
    private int lootRank(LootKind kind) {
        return kind.empty() ? 4 + savedItemKinds.get().size() : lootRank(kind.item());
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
        for (Item item : savedItemKinds.get()) byName.put(itemName(item), new XaeroWaypoints.Target(ITEMS_GROUP, itemsColor.get().getPacked()));
        for (Block block : customMarkerBlocks.get()) byName.put(block.getName().getString(), new XaeroWaypoints.Target(CUSTOM_GROUP, customColor.get().getPacked()));
        for (Marker marker : Marker.values()) byName.put(marker.title, new XaeroWaypoints.Target(marker.group, markerColors.get(marker).get().getPacked()));
        XaeroWaypoints.Target bases = new XaeroWaypoints.Target(BASES_GROUP, basesColor.get().getPacked());
        XaeroWaypoints.Target loot = new XaeroWaypoints.Target(ITEMS_GROUP, itemsColor.get().getPacked());
        XaeroWaypoints.Target custom = new XaeroWaypoints.Target(CUSTOM_GROUP, customColor.get().getPacked());
        XaeroWaypoints.Target pets = new XaeroWaypoints.Target(PETS_GROUP, petsColor.get().getPacked());
        XaeroWaypoints.Target pearls = new XaeroWaypoints.Target(PEARLS_GROUP, pearlsColor.get().getPacked());
        return XaeroWaypoints.regroup(from, name -> {
            if (name.startsWith(BASE_PREFIX)) return bases;
            if (name.startsWith(LOOT_PREFIX)) return loot;
            if (name.startsWith(CAT_PREFIX) || name.startsWith(DOG_PREFIX)) return pets;
            if (name.startsWith(PEARL_PREFIX)) return pearls;
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
            if (!found.details().isEmpty()) sb.append(SIGN_INDENT).append(found.details()).append('\n');
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
     * Writes and marks the picked items lying around the player that aren't written or marked yet,
     * and shulker boxes and bundles holding any. Entities don't come with the chunk, so they're polled.
     */
    private void scanItems() {
        boolean save = saveItems.get(), mark = markingItems();
        if ((!save && !mark) || ++itemCheckTicks < ITEM_CHECK_INTERVAL_TICKS) return;
        itemCheckTicks = 0;
        Set<Item> kinds = new HashSet<>(savedItemKinds.get());
        if (kinds.isEmpty()) return;

        int before = foundItems.size();
        for (Entity entity : mc.world.getEntities()) {
            if (!(entity instanceof ItemEntity itemEntity)) continue;
            ItemStack stack = itemEntity.getStack();
            if (stack.isEmpty()) continue;
            if (!kinds.contains(stack.getItem()) && ItemDetails.contents(stack).stream().noneMatch(s -> kinds.contains(s.getItem()))) continue;
            if (isPlayerDrop(entity)) continue;

            BlockPos pos = entity.getBlockPos();
            String details = ItemDetails.of(stack);
            if (mark && markedItems.add(entity.getUuid())) {
                Map<Item, Integer> inside = new HashMap<>();
                for (ItemStack s : ItemDetails.contents(stack)) inside.merge(s.getItem(), s.getCount(), Integer::sum);
                addToLoot(lootPiles, stack.getItem(), stack.getCount(), pos, details.equals(ItemDetails.EMPTY), inside);
            }
            if (!save || !savedItems.add(entity.getUuid())) continue;

            // Diamond ×12 "Renamed one"
            String what = itemName(stack.getItem()) + " ×" + stack.getCount();
            if (stack.contains(DataComponentTypes.CUSTOM_NAME)) what += " \"" + Formatting.strip(stack.getName().getString()) + "\"";
            foundItems.add(new FoundItem(stack.getItem(), pos, what, LocalTime.now(), details));
            itemCounts.merge(stack.getItem(), stack.getCount(), Integer::sum);
            String label = stack.contains(DataComponentTypes.CUSTOM_NAME) ? Formatting.strip(stack.getName().getString()) : "";
            archiveFind(new FindsArchive.Find(FindsArchive.Kind.ITEM, pos.getX(), pos.getY(), pos.getZ(), LocalDateTime.now(),
                itemName(stack.getItem()), stack.getCount(), label, details, entity.getUuid().toString()));

            if (itemsInChat.get()) info("Item at (highlight)%d, %d, %d(default): %s%s", pos.getX(), pos.getY(), pos.getZ(), what,
                details.isEmpty() ? "" : " (" + details + ")");
        }
        if (foundItems.size() > before) foundFileDirty = true;
        if (mark) markLootPiles(false);
    }

    // Named pets

    private static final String CAT_PREFIX = "Cat: ", DOG_PREFIX = "Dog: ";
    /** A pet within this many blocks of a marker with its name is the one marked: it walked a little since. */
    private static final int PET_SPACING = 48;

    private boolean markingPets() {
        return autoMarkers.get() && markPets.get();
    }

    /**
     * Marks the cats and dogs someone has named around the player, one marker per pet, named after it
     * and its owner. Entities don't come with the chunk, so they're polled, like the items. A pet whose
     * owner's name is still being looked up is marked on a later scan, once it's known.
     */
    private void scanPets() {
        if ((!markingPets() && !markingPearls()) || ++petCheckTicks < ITEM_CHECK_INTERVAL_TICKS) return;
        petCheckTicks = 0;
        if (markingPearls()) scanPearls();
        if (!markingPets()) return;
        for (Entity entity : mc.world.getEntities()) {
            String kind = entity instanceof CatEntity ? "Cat" : entity instanceof WolfEntity ? "Dog" : null;
            if (kind == null || !entity.hasCustomName() || markedPets.contains(entity.getUuid())) continue;
            TameableEntity pet = (TameableEntity) entity;
            UUID ownerId = pet.getOwnerUuid();
            String owner = ownerId == null ? "" : ownerName(ownerId);
            if (owner == null) continue;
            markedPets.add(entity.getUuid());
            String petName = cleanName(Formatting.strip(entity.getCustomName().getString())).trim();
            if (!petName.isEmpty()) placePetMarker(kind, petName, owner, pet);
        }
    }

    /** Owners' names by UUID; "" when Mojang doesn't know it (a cracked server's player). Kept for the session. */
    private static final Map<UUID, String> OWNER_NAMES = new ConcurrentHashMap<>();
    private static final Set<UUID> OWNER_LOOKUPS = ConcurrentHashMap.newKeySet();

    private static class ProfileResponse {
        public String name;
    }

    /**
     * The owner's nickname as Meteor's Entity Owner finds it: the player nearby or in the tab list,
     * else asked of Mojang by UUID, off the game thread. Null while that's under way, "" if unknown.
     */
    private String ownerName(UUID uuid) {
        PlayerEntity player = mc.world.getPlayerByUuid(uuid);
        if (player != null) return player.getName().getString();
        PlayerListEntry entry = mc.getNetworkHandler() == null ? null : mc.getNetworkHandler().getPlayerListEntry(uuid);
        if (entry != null) return entry.getProfile().getName();
        String known = OWNER_NAMES.get(uuid);
        if (known != null) return known;
        if (OWNER_LOOKUPS.add(uuid)) {
            MeteorExecutor.execute(() -> {
                String name = "";
                try {
                    ProfileResponse res = Http.get("https://sessionserver.mojang.com/session/minecraft/profile/" + uuid.toString().replace("-", ""))
                        .sendJson(ProfileResponse.class);
                    if (res != null && res.name != null) name = res.name;
                } catch (RuntimeException ignored) {
                }
                OWNER_NAMES.put(uuid, name);
                OWNER_LOOKUPS.remove(uuid);
            });
        }
        return null;
    }

    private void placePetMarker(String kind, String petName, String owner, TameableEntity pet) {
        String name = kind + ": " + petName + (owner.isEmpty() ? "" : " (" + owner + ")");
        BlockPos pos = pet.getBlockPos();
        for (XaeroWaypoints.Spot spot : existingMarkers()) {
            if (spot.name().equals(name) && near(spot, pos, PET_SPACING)) return;
        }
        addMarker(PETS_GROUP, name, kind.substring(0, 1), "circle", petsColor.get(), pos);
        String details = !pet.isTamed() ? "not tamed"
            : (owner.isEmpty() ? "tamed, owner unknown" : "tamed by " + owner) + (pet.isInSittingPose() ? ", sitting" : "");
        report("Marked (highlight)%s(default) (%s) at (highlight)%d, %d, %d(default).", name, details, pos.getX(), pos.getY(), pos.getZ());
        // Into the all-finds file too, and so to the site: "Named Cat", with the pet's name for its label
        archiveFind(new FindsArchive.Find(FindsArchive.Kind.MARKER, pos.getX(), pos.getY(), pos.getZ(), LocalDateTime.now(),
            "Named " + kind, 0, petName, details));
    }

    // Thrown pearls

    private static final String PEARL_PREFIX = "Pearl";
    /** Pearls this close together are one bunch, one marker: a stasis chamber's row. */
    private static final int PEARL_BUNCH_RADIUS = 16;
    /** A pearl moved less than this since the last scan is lying still. */
    private static final double PEARL_STILL_DISTANCE = 1;

    private boolean markingPearls() {
        return autoMarkers.get() && markPearls.get();
    }

    private record StillPearl(BlockPos pos, String thrower, boolean inWater) {}

    /**
     * Marks the thrown ender pearls around the player that lie still - a stasis chamber's - a marker per
     * bunch. One seen at about the same spot a scan ago is still; one flying past isn't marked. Who threw
     * it the game only knows when they were near as it was thrown, as for Meteor's own nametags.
     */
    private void scanPearls() {
        Map<UUID, Vec3d> seen = new HashMap<>();
        List<StillPearl> still = new ArrayList<>();
        for (Entity entity : mc.world.getEntities()) {
            if (!(entity instanceof EnderPearlEntity pearl) || markedPearls.contains(entity.getUuid())) continue;
            Vec3d at = entity.getPos(), before = pearlsSeen.get(entity.getUuid());
            if (before == null || before.squaredDistanceTo(at) > PEARL_STILL_DISTANCE * PEARL_STILL_DISTANCE) {
                seen.put(entity.getUuid(), at);
                continue;
            }
            markedPearls.add(entity.getUuid());
            String thrower = pearl.getOwner() instanceof PlayerEntity player ? player.getName().getString() : "";
            still.add(new StillPearl(entity.getBlockPos(), thrower, entity.isTouchingWater()));
        }
        // Pearls gone from view are forgotten: one back later is looked at afresh
        pearlsSeen.clear();
        pearlsSeen.putAll(seen);

        List<List<StillPearl>> bunches = new ArrayList<>();
        for (StillPearl pearl : still) {
            List<StillPearl> bunch = null;
            for (List<StillPearl> b : bunches) {
                if (b.getFirst().pos().isWithinDistance(pearl.pos(), PEARL_BUNCH_RADIUS)) bunch = b;
            }
            if (bunch == null) bunches.add(bunch = new ArrayList<>());
            bunch.add(pearl);
        }
        bunches.forEach(this::placePearlMarker);
    }

    private void placePearlMarker(List<StillPearl> bunch) {
        BlockPos pos = bunch.getFirst().pos();
        for (XaeroWaypoints.Spot spot : existingMarkers()) {
            if (spot.name().startsWith(PEARL_PREFIX) && near(spot, pos, 2L * PEARL_BUNCH_RADIUS)) return;
        }
        Set<String> throwers = new LinkedHashSet<>();
        boolean inWater = false;
        for (StillPearl pearl : bunch) {
            if (!pearl.thrower().isEmpty()) throwers.add(pearl.thrower());
            inWater |= pearl.inWater();
        }
        String who = String.join(", ", throwers);
        // Pearls ×3 (Steve)
        String name = (bunch.size() == 1 ? PEARL_PREFIX : PEARL_PREFIX + "s ×" + bunch.size()) + (who.isEmpty() ? "" : " (" + who + ")");
        addMarker(PEARLS_GROUP, name, "EP", "circle", pearlsColor.get(), pos);
        String details = (bunch.size() == 1 ? "1 pearl" : bunch.size() + " pearls")
            + (inWater ? ", in water - a stasis chamber" : "")
            + (who.isEmpty() ? ", thrower unknown" : ", thrown by " + who);
        report("Marked (highlight)%s(default) at (highlight)%d, %d, %d(default): %s.", name, pos.getX(), pos.getY(), pos.getZ(), details);
        // Into the all-finds file too, and so to the site
        archiveFind(new FindsArchive.Find(FindsArchive.Kind.MARKER, pos.getX(), pos.getY(), pos.getZ(), LocalDateTime.now(),
            "Thrown Pearl", 0, "", details));
    }

    /** An item's name as the game shows it, clean: see {@link #cleanName}. */
    private static String itemName(Item item) {
        return cleanName(item.getName().getString());
    }

    /**
     * A name without the § colour codes a resource pack or the server's translations may put in it
     * ("Golden Apple §f(§f§f)"), and without the empty brackets those leave: the site matches names
     * to item pictures and values, and the files stay readable.
     */
    static String cleanName(String name) {
        return FindNames.clean(name);
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
        Path renameFrom = null;
        if (signFile == null) {
            var server = mc.getCurrentServerEntry();
            String where = server != null ? server.address : "singleplayer";
            String dimension = mc.world.getRegistryKey().getValue().getPath();
            Path dir = FabricLoader.getInstance().getGameDir().resolve("onfocus").resolve("signs").resolve(fileSafe(where));
            fileBaseName = LocalDateTime.now().format(SIGN_FILE_TIME) + "_" + fileSafe(dimension) + ".txt";
            signFile = dir.resolve(itemCountPrefix() + fileBaseName);
            fileHeader = signFileHeader(server != null ? server.address : "Singleplayer");
            report("Saving finds to (highlight)%s(default).", signFile);
        } else {
            // The name tells what items it holds, so it changes as they're found
            Path renamed = signFile.resolveSibling(itemCountPrefix() + fileBaseName);
            if (!renamed.equals(signFile)) {
                renameFrom = signFile;
                signFile = renamed;
            }
        }
        StringBuilder text = new StringBuilder(fileHeader);
        if (basesFound > 0) text.append(FindsArchive.sectionTitle("BASES", basesFound)).append(baseLog);
        if (saveSigns.get() || !savedSigns.isEmpty()) text.append(FindsArchive.sectionTitle("SIGNS", savedSigns.size())).append(signLog);
        // Each sign ends with a blank line already, so the items' title sits apart from them
        if (saveItems.get() || !savedItems.isEmpty()) text.append(FindsArchive.sectionTitle("ITEMS ON THE GROUND", savedItems.size())).append(itemLog()).append('\n');
        if (footer != null) text.append(footer);
        // Megabytes with a lot of signs: written off the game thread, in order with the rest of the files
        Path file = signFile, from = renameFrom;
        String content = text.toString();
        FILES.execute(() -> {
            try {
                Files.createDirectories(file.getParent());
                if (from != null && Files.exists(from)) Files.move(from, file, StandardCopyOption.REPLACE_EXISTING);
                Files.writeString(file, content, StandardCharsets.UTF_8, StandardOpenOption.CREATE,
                    StandardOpenOption.TRUNCATE_EXISTING, StandardOpenOption.WRITE);
            } catch (IOException e) {
                FILE_LOG.error("Writing signs failed", e);
                mc.execute(() -> {
                    if (signWriteFailed) return;
                    signWriteFailed = true;
                    error("Couldn't write the sign file: %s", e.getMessage());
                });
            }
        });
    }

    /** Writes the run's file if it has new finds, and the all-finds file every so often. */
    private void tickFindFiles() {
        if (foundFileDirty && ++foundFileTicks >= FOUND_FILE_INTERVAL_TICKS) flushFoundFile();
        if (siteFindTicks > 0 && --siteFindTicks == 0) flushSiteFinds();
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
        // A few seconds' wait gathers the finds of the same chunks into one request
        if (toSite && siteFindTicks == 0) siteFindTicks = SITE_FIND_DELAY_TICKS;
    }

    /** Sends the finds waiting for the site (on the files thread, after the ones just archived). */
    private void flushSiteFinds() {
        String site = siteTarget();
        if (site == null) return;
        String token = siteToken.get().trim();
        FILES.execute(() -> SITE.flush(site, token, problem -> {
            FILE_LOG.warn("Site: " + problem);
            mc.execute(() -> warning("Site: %s", problem));
        }));
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
        syncLiveSite();
        SiteSync.Scope scope = mc.world != null ? archiveSpot().scope() : null;
        FILES.execute(() -> {
            SITE.flush(site, token, problem -> {
                FILE_LOG.warn("Site: " + problem);
                mc.execute(() -> warning("Site: %s", problem));
            });
        });
        syncMap(site, token, scope);
    }

    private void syncLiveSite() {
        String site = siteTarget();
        if (site == null || mc.world == null || mc.player == null) return;
        SITE.sendLiveStatus(site, siteToken.get().trim(), archiveSpot().scope(), siteStatus(), problem -> {
            FILE_LOG.warn("Site: " + problem);
            mc.execute(() -> warning("Site: %s", problem));
        }, commands -> mc.execute(() -> {
            for (JsonElement command : commands) {
                if (command.isJsonObject()) siteCommand(command.getAsJsonObject());
            }
        }));
    }

    /**
     * An area sent from the site's map: explored or rescanned as if picked on Xaero's World Map -
     * if it's this server and the dimension the player is in.
     */
    private void siteCommand(JsonObject command) {
        if (mc.world == null || mc.player == null) return;
        String kind = command.has("kind") ? command.get("kind").getAsString() : "";
        String by = command.has("by") ? command.get("by").getAsString() : "the site";
        String what = "RESCAN".equals(kind) ? "rescan" : "explore";
        if (!siteCommands.get()) {
            warning("%s asked from the site to %s an area, but site-commands is off.", by, what);
            return;
        }
        SiteSync.Scope here = archiveSpot().scope();
        String server = command.get("server").getAsString(), dimension = command.get("dimension").getAsString();
        if (!here.server().equalsIgnoreCase(server) || !here.dimension().equals(dimension)) {
            warning("%s asked from the site to %s an area in %s on %s - you're in %s on %s.", by, what,
                FindsArchive.prettyName(dimension), server, FindsArchive.prettyName(here.dimension()), here.server());
            return;
        }
        int x1 = command.get("minCX").getAsInt(), z1 = command.get("minCZ").getAsInt(), x2 = command.get("maxCX").getAsInt(), z2 = command.get("maxCZ").getAsInt();
        info("(highlight)%s(default) sent you from the site to %s (highlight)%dx%d(default) chunks at X %d..%d, Z %d..%d.", by, what,
            x2 - x1 + 1, z2 - z1 + 1, x1 * 16, x2 * 16 + 15, z1 * 16, z2 * 16 + 15);
        if ("RESCAN".equals(kind)) rescan(x1, z1, x2, z2, mc.world.getRegistryKey());
        else explore(x1, z1, x2, z2, mc.world.getRegistryKey());
    }

    /** The site scope of the server and dimension we're in, remembered for when we're off the server. */
    private SiteSync.Scope siteScope() {
        if (mc.world != null && (mc.getCurrentServerEntry() != null || mc.isInSingleplayer())) lastSiteScope = archiveSpot().scope();
        return lastSiteScope;
    }

    /**
     * A line in the site's run log (with site-sync on): level info / success / warn / error, a kind
     * (start, disconnect, rejoin...) and what happened, with where the player is - or was dropped.
     * Sent right away, on the files thread; kept for later if the site can't be reached.
     */
    private void siteEvent(String level, String type, String message) {
        String site = siteTarget();
        SiteSync.Scope scope = site == null ? null : siteScope();
        if (scope == null) return;
        Integer x = null, y = null, z = null;
        if (mc.player != null && mc.world != null) {
            x = (int) Math.floor(mc.player.getX());
            y = (int) Math.floor(mc.player.getY());
            z = (int) Math.floor(mc.player.getZ());
        } else if (reconnecting) {
            x = (int) Math.floor(leftX);
            z = (int) Math.floor(leftZ);
        }
        String text = message.replace("(highlight)", "").replace("(default)", "").strip();
        JsonObject event = SiteSync.event(System.currentTimeMillis(), level, type, text, mc.getSession().getUsername(), x, y, z);
        String token = siteToken.get().trim();
        FILES.execute(() -> {
            SITE.addEvent(scope, event);
            SITE.flushEvents(site, token, problem -> {
                FILE_LOG.warn("Site: " + problem);
                mc.execute(() -> warning("Site: %s", problem));
            });
        });
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
        status.addProperty("mode", rescan && phase != Phase.SPIRAL ? "Rescan" : mode.get().name());
        status.addProperty("paused", paused);
        status.addProperty("x", (int) Math.floor(mc.player.getX()));
        status.addProperty("y", (int) Math.floor(mc.player.getY()));
        status.addProperty("z", (int) Math.floor(mc.player.getZ()));
        status.addProperty("yaw", mc.player.getYaw());
        if (area != null && phase != Phase.SPIRAL && phase != Phase.IDLE) {
            status.addProperty("percent", explored.size() * 100.0 / area.total());
            JsonObject box = new JsonObject();
            box.addProperty("minX", area.minCX() * 16);
            box.addProperty("minZ", area.minCZ() * 16);
            box.addProperty("maxX", area.maxCX() * 16 + 15);
            box.addProperty("maxZ", area.maxCZ() * 16 + 15);
            if (sectors != null) box.add("sectors", siteSectors());
            status.add("area", box);
            if (coverage != null && showFlown.get()) addCoverage(status);
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

    /**
     * The sector grid for the site's run card: one letter per cell, row by row from the north-west:
     * a current, n next, c finished, d deferred, s skipped, o still to do. Large grids send the counts only.
     */
    private JsonObject siteSectors() {
        JsonObject grid = new JsonObject();
        grid.addProperty("size", sectors.size());
        grid.addProperty("cols", sectors.columns());
        grid.addProperty("rows", sectors.rows());
        grid.addProperty("originX", sectors.originX() * 16);
        grid.addProperty("originZ", sectors.originZ() * 16);
        grid.addProperty("done", sectors.visited());
        grid.addProperty("count", sectors.total());
        grid.addProperty("deferred", sectors.deferredCount());
        grid.addProperty("skipped", sectors.skippedCount());
        grid.addProperty("reach", reach);
        if (sectors.total() > 4096) return grid;
        StringBuilder cells = new StringBuilder(sectors.total());
        for (int row = 0; row < sectors.rows(); row++) {
            for (int column = 0; column < sectors.columns(); column++) {
                int index = sectors.indexAt(column, row);
                cells.append(index == sectors.currentIndex() ? 'a' : index == sectors.plannedNextIndex() ? 'n' : switch (sectors.state(index)) {
                    case COMPLETED -> 'c';
                    case DEFERRED -> 'd';
                    case SKIPPED -> 's';
                    case OPEN -> 'o';
                });
            }
        }
        grid.addProperty("cells", cells.toString());
        return grid;
    }

    /**
     * The flown cells for the site's map: when they've changed (at most every 5 s) and every half
     * minute anyway, as a live status can be dropped for a newer one before it goes. Its version alone otherwise.
     */
    private void addCoverage(JsonObject status) {
        long now = System.nanoTime();
        boolean changed = coverage.version() != coverageSentVersion && now - coverageSentNanos >= COVERAGE_SITE_MIN_NANOS;
        if (!changed && now - coverageSentNanos < COVERAGE_SITE_RESEND_NANOS) {
            status.addProperty("coverageVersion", coverageSentVersion);
            return;
        }
        coverageSentVersion = coverage.version();
        coverageSentNanos = now;
        JsonObject grid = new JsonObject();
        grid.addProperty("version", coverage.version());
        grid.addProperty("cell", coverage.cell());
        grid.addProperty("minCX", coverage.area().minCX());
        grid.addProperty("minCZ", coverage.area().minCZ());
        grid.addProperty("cols", coverage.cols());
        grid.addProperty("rows", coverage.rows());
        grid.addProperty("bits", coverage.encode());
        status.add("coverage", grid);
    }

    /** Writes every all-finds file with anything new (on the files thread): ones of other dimensions too, and with no world. */
    private void flushArchive() {
        List<String> order = new ArrayList<>();
        for (Item item : savedItemKinds.get()) order.add(itemName(item));
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
        freshChunks.arrived(event.chunk().getPos().toLong());
        if (phase != Phase.IDLE) diagnosticChunks++;
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
            rejoinTicks = elsewhereTicks = 0; // dropped again before getting back (a queue?): keep waiting
            return;
        }
        ServerInfo server = mc.getCurrentServerEntry();
        siteScope(); // remembered for the log while we're off
        if (!autoReconnect.get() || server == null || mc.player == null) {
            siteEvent("warn", "disconnect", "Left the server - auto-reconnect is off, stopped" + (area != null && phase != Phase.SPIRAL ? " at %d%%".formatted(percent()) : ""));
            stopLogged = true;
            // The area stays selected, so turning it back on after rejoining carries on
            turnOff();
            return;
        }
        leftAtMillis = System.currentTimeMillis();

        // A kick and leaving by hand only tell apart by the next screen: tickReconnect sorts it out
        reconnecting = true;
        reconnectServer = server;
        leftDimension = mc.world.getRegistryKey();
        leftX = mc.player.getX();
        leftZ = mc.player.getZ();
        reconnectTicks = 0;
        reconnectTries = 0;
        rejoinTicks = elsewhereTicks = 0;
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
            rejoinTicks = elsewhereTicks = 0;
            Screen screen = mc.currentScreen;
            // Left by hand, or backed out of the disconnect screen / a connect attempt
            if (screen instanceof TitleScreen || screen instanceof MultiplayerScreen) {
                log("Left the server - stopped exploring");
                siteEvent("info", "stop", "Left the server by hand while reconnecting - stopped exploring");
                stopLogged = true;
                turnOff();
                return;
            }
            // The game's disconnect screen (a kick, or an attempt that failed) makes way for ours, with
            // the countdown on it. Meteor's Auto Reconnect lives on the game's screen, so it stays out of it.
            if (screen instanceof DisconnectedScreen) {
                reconnectReason = disconnectReason(screen).replace('\n', ' ').strip();
                log("Disconnect screen: \"%s\"", reconnectReason);
                String reason = reconnectReason.isEmpty() ? "no reason given" : reconnectReason;
                if (reconnectTries == 0) siteEvent("error", "disconnect", "Disconnected from %s: %s - %s".formatted(reconnectServer.address, reason, runProgressText()));
                else if (reconnectTries == 1 || System.currentTimeMillis() - reconnectReportedAt >= RECONNECT_REPORT_INTERVAL_MS) {
                    reconnectReportedAt = System.currentTimeMillis();
                    siteEvent("warn", "reconnect", reconnectTries == 1
                        ? "Reconnect attempt 1 failed: %s - still trying, next update in %s".formatted(reason, formatDuration((int) (RECONNECT_REPORT_INTERVAL_MS / 1000)))
                        : "Still reconnecting: %d attempts failed, %s offline. Last reason: %s".formatted(reconnectTries,
                            formatDuration((int) ((System.currentTimeMillis() - leftAtMillis) / 1000)), reason));
                }
                reconnectTicks = 0;
                if (reconnectAttempts.get() > 0 && reconnectTries >= reconnectAttempts.get()) {
                    String why = "Couldn't reconnect in %d attempts - stopped exploring. Last reason: %s".formatted(reconnectTries, reconnectReason);
                    log(why);
                    siteEvent("error", "reconnect", why);
                    stopLogged = true;
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
            stopLogged = true; // the warning goes to the log
            warning("Joined another server - stopped exploring.");
            turnOff();
            return;
        }
        if (mc.currentScreen instanceof DownloadingTerrainScreen) return;
        boolean sameDimension = mc.world.getRegistryKey().equals(leftDimension);
        double away = Math.hypot(mc.player.getX() - leftX, mc.player.getZ() - leftZ);
        if (!sameDimension || away > MAX_REJOIN_DISTANCE) {
            rejoinTicks = 0;
            if (!warnedElsewhere) {
                String text = sameDimension
                    ? "Back on the server, but %.0f blocks from where exploring stopped - carrying on from here in %d s, or press the bind to now.".formatted(away, REJOIN_ELSEWHERE_TICKS / 20)
                    : "Back on the server in another dimension (a queue?) - carrying on once you're back in %s.".formatted(FindsArchive.prettyName(leftDimension.getValue().getPath()));
                info("%s", text);
                siteEvent("info", "rejoin", text);
            }
            warnedElsewhere = true;
            // Same dimension, far off: put back where the server last had us, or respawned. Waiting
            // for a spot we won't get back to by ourselves would wait for ever; the route is planned again from here.
            if (sameDimension && ++elsewhereTicks >= REJOIN_ELSEWHERE_TICKS) {
                log("Still %.0f blocks from where exploring stopped after %d s - carrying on from here", away, REJOIN_ELSEWHERE_TICKS / 20);
                resumeAfterReconnect();
            }
            return;
        }
        elsewhereTicks = 0;
        if (++rejoinTicks >= REJOIN_SETTLE_TICKS) resumeAfterReconnect();
    }

    /** The bind pressed while waiting to be back where we were dropped: carries on from here right away. */
    private void carryOnHere() {
        if (mc.world == null || mc.player == null) return;
        if (!mc.world.getRegistryKey().equals(leftDimension)) {
            warning("The run is in %s - go back there first.", FindsArchive.prettyName(leftDimension.getValue().getPath()));
            return;
        }
        log("Carrying on from %.0f, %.0f by hand, %.0f blocks from where exploring stopped", mc.player.getX(), mc.player.getZ(),
            Math.hypot(mc.player.getX() - leftX, mc.player.getZ() - leftZ));
        paused = false;
        resumeAfterReconnect();
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
        int eta = etaSeconds(speed, leftX, leftZ);
        if (eta < 0) return progress;
        return progress + ", about %s left%s".formatted(formatDuration(eta),
            phase == Phase.SWEEP ? " plus cleanup" : "");
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
        String offline = leftAtMillis > 0 ? formatDuration((int) ((System.currentTimeMillis() - leftAtMillis) / 1000)) : "?";
        siteEvent("success", "rejoin", "Back on the server after %d reconnect attempt%s, %s offline - %s".formatted(reconnectTries,
            reconnectTries == 1 ? "" : "s", offline, paused ? "still paused" : "carrying on"));
        // As an argument: the text has % in it
        info("%s", paused ? back + "still paused, press the bind to carry on." : back + timeLeftText());
        // Chunks that came in before we were back in place were skipped
        scanLoadedChunksForMarkers();
        scanLoadedChunksForSigns();
        flightCheckTicks = FLIGHT_CHECK_TICKS;
    }

    @EventHandler
    private void onTick(TickEvent.Pre event) {
        long start = System.nanoTime();
        Phase before = phase;
        boolean wasReconnecting = reconnecting, wasPaused = paused;
        boolean watching = phase != Phase.IDLE && !reconnecting && mc.world != null;
        if (watching) checkStall(start);
        tickWork = null;
        freshChunks.tick();
        tickModule();
        if (before != phase || wasReconnecting != reconnecting || wasPaused != paused) {
            diagnostic("state-change", "from=" + before + ", reconnecting=" + wasReconnecting + ", paused=" + wasPaused);
        }
        if (phase != Phase.IDLE && start - lastLiveSiteNanos >= 1_000_000_000L) {
            lastLiveSiteNanos = start;
            syncLiveSite();
        }

        long took = System.nanoTime() - start;
        if (watching && took >= SLOW_TICK_NANOS) {
            log("Slow tick: %d ms in %s%s", took / 1_000_000, phase, tickWork != null ? " - " + tickWork : "");
        }
        // Loading screens after a rejoin aren't stalls
        lastTickEnd = watching && phase != Phase.IDLE && !reconnecting ? System.nanoTime() : 0;
    }

    private void tickModule() {
        // A sector run is one continuous job: short sweeps must not restart the 30 s
        // throughput window every time they settle or clean up. Local reads confirm
        // this run's work; the initial bulk map import remains excluded.
        int etaStage = sectors != null ? Phase.SWEEP.ordinal() : phase.ordinal();
        boolean sectorWork = sectors != null && (phase == Phase.SWEEP || phase == Phase.SETTLE || phase == Phase.CLEANUP)
            && (scan == null || phase == Phase.SETTLE);
        coverageEta.observe(System.nanoTime(), explored.size(), !paused && !reconnecting
            && mc.player != null && mc.world != null
            && (sectorWork || scan == null && (phase == Phase.SWEEP || phase == Phase.CLEANUP)), phase.ordinal(), sectors != null);
        boolean flying = !paused && !reconnecting && mc.player != null && mc.world != null && (scan == null || sectorWork);
        if (sectors != null && flying && sectorTimed >= 0) sectorTicks++;
        shownEta.observe(System.nanoTime(), flying ? etaSeconds(estimateSpeed()) : -1, flying, etaStage);
        if (phase == Phase.IDLE) return;
        if (reconnecting) {
            tickReconnect();
            return;
        }
        if (mc.player == null || mc.world == null) return;

        if (syncAreaMode()) return;
        tickStats();
        tickEstimate();
        checkFlying();
        noteDeath();
        scanItems();
        scanPets();
        scanBaseEntities();
        confirmBaseCandidates();
        tickFindFiles();
        // In case the game goes down without turning the module off first; paused too, as the ground
        // flown by hand still counts
        if (++sessionSaveTicks >= SESSION_SAVE_INTERVAL_TICKS) {
            sessionSaveTicks = 0;
            saveSession();
        }
        if (phase == Phase.SPIRAL) {
            if (paused) return;
            tickSpiral();
            if (phase != Phase.IDLE) steer();
            return;
        }

        if (rescan) markRescanned();
        else checkMapAroundPlayer();
        if (diagnosticLogging.get()) {
            diagnosticTicks++;
            if (diagnosticTicks % 20 == 0) diagnostic("flight-position", "periodic");
            if (diagnosticTicks % 100 == 0) diagnosticSnapshot("flight-sample", false);
            if (diagnosticTicks >= 600) {
                diagnosticSnapshot("area-sample", true);
                diagnosticTicks = 0;
            }
        }
        if (explored.size() >= area.total()) {
            finish();
            return;
        }
        if (phase == Phase.SCAN) {
            tickScan();
            return;
        }
        // Paused and flying by hand, the ground flown is coloured too: it's rescanned (or drawn) as well
        markCoverage();
        if (paused) return;

        switch (phase) {
            case SWEEP -> tickSweep();
            case SETTLE -> tickSettle();
            case CLEANUP -> tickCleanup();
            default -> {}
        }
        if (phase != Phase.IDLE && !paused) steer();
    }

    /** A few seconds in: still standing about is worth a word - moving at flying speed isn't, gliding flag or not. */
    private void checkFlying() {
        if (flightCheckTicks <= 0 || paused || phase == Phase.SCAN) return;
        if (--flightCheckTicks > 0) return;
        if (!mc.player.isGliding() && speed < MIN_KNOWN_SPEED) warning("You're not flying - take off and start your elytra fly module.");
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

    /** Applied after flight modules choose movement; turns and settling cannot cross a sector edge. */
    @EventHandler(priority = -10000)
    private void onSectorMove(PlayerMoveEvent event) {
        if (sectors == null || sectors.current() == null || paused || reconnecting || mc.player == null
            || phase == Phase.IDLE || phase == Phase.SCAN || phase == Phase.SPIRAL) return;
        Area sector = sectors.current();
        // Leave room for the player's bounding box, not just its centre.
        double margin = mc.player.getWidth() / 2.0 + 0.05;
        double x = SectorPlanner.boundMovement(mc.player.getX(), event.movement.x,
            sector.minCX() * 16.0 + margin, (sector.maxCX() + 1) * 16.0 - margin);
        double z = SectorPlanner.boundMovement(mc.player.getZ(), event.movement.z,
            sector.minCZ() * 16.0 + margin, (sector.maxCZ() + 1) * 16.0 - margin);
        if (x == event.movement.x && z == event.movement.z) return;
        if (diagnosticLogging.get() && activeTicks % 20 == 0)
            diagnostic("sector-boundary-clamp", "limited horizontal movement at the current sector boundary");
        ((IVec3d) event.movement).meteor$set(x, event.movement.y, z);
        var velocity = mc.player.getVelocity();
        mc.player.setVelocity(x, velocity.y, z);
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
        if (sectors != null) return SectorPlanner.spacing(reach);
        return CoveragePlanner.spacing(reach, overlap.get());
    }

    /** Distance at which a point counts as reached: faster flight turns wider, so it turns earlier. */
    private double arriveBlocks() {
        if (sectors != null) return SectorPlanner.ARRIVAL_BLOCKS;
        return Math.max(arriveDistance.get(), speed * TURN_LEAD_SECONDS);
    }

    /** Keep contour turns inside the measured swath even at high speed. */
    private double contourArriveBlocks() {
        return WaypointFollower.contourArrivalDistance(arriveBlocks(), speed, rotationSpeed.get(), reach);
    }

    /** Cleanup must pass close enough to load its target even when turn lead grows at speed. */
    private double cleanupArriveBlocks() {
        return Math.min(arriveBlocks(), Math.max(4, reach * 8.0));
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
        rescan = false;
        sectors = null;
        sectorBlocked = false;
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
        siteEvent("info", "start", "Started a spiral from %d, %d%s".formatted(spiralCX << 4, spiralCZ << 4,
            spiralMaxRadius.get() > 0 ? ", up to " + formatBlocks(spiralMaxRadius.get()) : ""));

        nextSpiralLeg();
    }

    /** Pushes the side the spiral is heading to out by one spacing and flies to that corner. */
    private void nextSpiralLeg() {
        int step = spacing();
        int maxChunks = spiralMaxRadius.get() > 0 ? Math.max(1, spiralMaxRadius.get() >> 4) : Integer.MAX_VALUE;
        if (spiralExtent() + step > maxChunks) {
            report("Spiral reached (highlight)%s(default) in (highlight)%s(default).", formatBlocks(spiralMaxRadius.get()), formatDuration(activeTicks / 20));
            siteEvent("success", "finish", "Spiral reached %s in %s. Found: %s.".formatted(formatBlocks(spiralMaxRadius.get()), formatDuration(activeTicks / 20), foundSummary()));
            stopLogged = true;
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
        if (updateFollower(arriveBlocks()) == null) return;
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
            String text = "(highlight)%d%%(default) %s%s.".formatted(percent, rescan ? "rescanned" : "explored",
                eta < 0 ? "" : ", about (highlight)%s(default) left in this pass".formatted(formatDuration(eta)));
            report("%s", text);
            siteEvent("info", "progress", text);
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

    /** Remaining active work as shown: steadied so it counts down instead of jumping; -1 if unknown. */
    private int etaSeconds() {
        int steady = shownEta.secondsLeft();
        return steady >= 0 || mc.player == null ? steady : etaSeconds(estimateSpeed());
    }

    private int etaSeconds(double speed) {
        return etaSeconds(speed, mc.player == null ? leftX : mc.player.getX(),
            mc.player == null ? leftZ : mc.player.getZ());
    }

    private int etaSeconds(double speed, double x, double z) {
        if (phase == Phase.SPIRAL) return spiralEtaSeconds(speed);
        if (sectors != null && area != null && (phase == Phase.SWEEP || phase == Phase.SETTLE || phase == Phase.CLEANUP)) {
            // Fitted on whole sectors once a few are done; the rolling coverage rate until then
            double fitted = sectorEta.secondsLeft(sectorWork());
            if (fitted >= 0) return (int) Math.min(Integer.MAX_VALUE, Math.round(fitted));
            return coverageEta.secondsLeft(Math.max(0, area.total() - explored.size()));
        }
        if (area == null || scan != null || (phase != Phase.SWEEP && phase != Phase.CLEANUP)) return -1;
        long missing = Math.max(0, area.total() - explored.size());
        if (missing == 0) return 0;
        if (coverageEta.chunksPerSecond() == 0) return -1;
        int measured = coverageEta.secondsLeft(missing);
        // Loops are replanned as they go, so their route says little: go by coverage. A planned
        // sweep knows its route, and coverage per minute swings with every turn and covered leg.
        if (phase == Phase.SWEEP && contour() && measured >= 0) return measured;
        if (speed < MIN_KNOWN_SPEED) return measured;
        int route = (int) Math.min(Integer.MAX_VALUE, Math.ceil(sweepBlocksLeft(x, z) / speed));
        if (phase == Phase.SWEEP) return route;
        // Cleanup includes the actual spot route; its slower observed coverage can extend it.
        return measured >= 0 ? Math.max(route, measured) : route;
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
        if (sectors != null && phase != Phase.SCAN) {
            int eta = etaSeconds(speed);
            return eta < 0 ? "(highlight)%d%%(default) explored - estimating the whole selection after 30 seconds of sector work.".formatted(percent())
                : "about (highlight)%s(default) left for the whole selection, (highlight)%d%%(default) explored.".formatted(formatDuration(eta), percent());
        }
        if (phase == Phase.SCAN || scan != null) return "reading the World Map - time left shows once the map read finishes.";
        if (phase == Phase.SETTLE) return "(highlight)%d%%(default) explored, checking the map for gaps - the cleanup time shows next.".formatted(percent());
        int eta = etaSeconds(speed);
        if (eta < 0) return "(highlight)%d%%(default) explored - waiting for enough flight and coverage progress to estimate time left.".formatted(percent());
        String rest = phase == Phase.SWEEP ? " plus cleanup"
            : cleanupPass < cleanupPasses.get() ? " for this cleanup pass" : "";
        return "about (highlight)%s(default) left%s, (highlight)%d%%(default) explored.".formatted(formatDuration(eta), rest, percent());
    }

    private void reportEstimate() {
        if (scan != null) {
            report("Reading the World Map - time estimate will show once the map read finishes.");
            return;
        }
        double blocks = sweepBlocksLeft();
        double speed = estimateSpeed();
        int eta = etaSeconds(speed);
        if (eta < 0) {
            if (sectors != null) {
                report("Sectors: estimating time for the whole selection after 30 seconds of sector work, including checks and cleanup.");
                return;
            }
            report("Sweep route: (highlight)%s(default) - time estimate will show up once you're flying.", formatBlocks((int) blocks));
            return;
        }
        if (sectors != null) report("Sectors: about (highlight)%s(default) left for the whole selection, including checks and cleanup.", formatDuration(eta));
        else report("Sweep route: (highlight)%s(default), about (highlight)%s(default) at (highlight)%d(default) blocks/s, plus cleanup.",
            formatBlocks((int) blocks), formatDuration(eta), Math.round(speed));

        ElytraKeeper keeper = Modules.get().get(ElytraKeeper.class);
        int elytraSeconds = keeper.flightSecondsLeft();
        if (elytraSeconds >= 0 && elytraSeconds < eta && !Modules.get().get(ElytraControl.class).savesDurability()) {
            // Measured: how they've really worn in flight; otherwise the formula, which elytra fly modes can be far off
            if (keeper.wearLearned()) {
                warning("Your elytras last about (highlight)%s(default) by how they've worn in flight (%s) - not enough for the whole area.",
                    formatDuration(elytraSeconds), keeper.wearText());
            } else {
                warning("Your elytras last about (highlight)%s(default) by the formula (1 durability a second) - not enough for the whole area. The real figure is learned after 10 minutes of flight.",
                    formatDuration(elytraSeconds));
            }
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
        if (file == null) return false;
        awaitSessionFiles();
        return Files.exists(file);
    }

    private void forgetSession() {
        Path file = sessionFile();
        if (file == null) return;
        // After any save still being written, or that would bring it back
        onSessionFiles(() -> {
            try {
                Files.deleteIfExists(file);
            } catch (IOException e) {
                FILE_LOG.error("Deleting the saved run failed", e);
            }
        });
    }

    private static synchronized void onSessionFiles(Runnable task) {
        sessionFileWork = CompletableFuture.runAsync(task, SESSION_FILES);
    }

    /** Waits for the saved run's writes queued so far, before it's read. Only blocks right after a save. */
    private static void awaitSessionFiles() {
        CompletableFuture<Void> last;
        synchronized (AreaExplorer.class) {
            last = sessionFileWork;
        }
        try {
            last.get(30, TimeUnit.SECONDS);
        } catch (ExecutionException e) {
            FILE_LOG.error("Saving the run failed", e.getCause());
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        } catch (TimeoutException | CancellationException e) {
            FILE_LOG.warn("Gave up waiting for the run to be saved");
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
        tag.putString("mode", spiral ? "spiral" : sectors != null ? "sectors" : "area");
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
            tag.putBoolean("rescan", rescan);
            if (sectors != null) {
                tag.putInt("sector-size", sectors.size());
                tag.putInt("sector-first", sectors.first());
                tag.putInt("sector-visited", sectors.visited());
                tag.putInt("sector-current", sectors.currentIndex());
                tag.putLongArray("sector-completed", sectors.completed());
                tag.putBoolean("sector-world-grid", sectors.worldGrid());
                tag.putLongArray("sector-deferred", sectors.deferred());
                tag.putLongArray("sector-skipped", sectors.skipped());
                tag.putBoolean("sector-retrying", sectors.retrying());
                tag.putInt("sector-priority", sectors.priority());
                tag.putInt("sector-reach", sectorSwath.current());
                tag.putInt("sector-reach-ceiling", sectorSwath.ceiling());
            }
            // With the map, reading it again tells what's explored
            if (!readsMap() || sectors != null) tag.putLongArray("explored", explored.toLongArray());
            if (coverage != null) tag.putLongArray("coverage", coverage.toLongArray());
            if (territoryId != null) tag.putString("territory-id", territoryId);
            saveRunTerritory();
        }
        tag.putInt("active-ticks", activeTicks);
        tag.putDouble("flight-distance", flightDistance);
        tag.put("finds", findsTag());
        tag.putLongArray("player-placed", playerPlaced.toLongArray());
        // What the player threw or lost dying stays theirs: it lies there still after a restart
        tag.putLongArray("death-spots", deathSpots.stream().mapToLong(BlockPos::asLong).toArray());
        NbtList drops = new NbtList();
        for (UUID uuid : playerDrops) drops.add(NbtString.of(uuid.toString()));
        tag.put("player-drops", drops);

        // The tag holds copies only, so it's written off the game thread while the run goes on
        onSessionFiles(() -> {
            try {
                Files.createDirectories(file.getParent());
                Path tmp = file.resolveSibling(file.getFileName() + ".tmp");
                NbtIo.writeCompressed(tag, tmp);
                Files.move(tmp, file, StandardCopyOption.REPLACE_EXISTING);
            } catch (IOException e) {
                FILE_LOG.error("Saving the run failed", e);
            }
        });
    }

    /** Carries on with the run saved for this server, if there is one: true if it took over (turning the module off if it can't). */
    private boolean resumeSession() {
        if (!hasSession()) return false;
        Path file = sessionFile();
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
        playerPlaced.clear();
        for (long key : tag.getLongArray("player-placed")) playerPlaced.add(key);
        deathSpots.clear();
        for (long key : tag.getLongArray("death-spots")) deathSpots.add(BlockPos.fromLong(key));
        playerDrops.clear();
        NbtList drops = tag.getList("player-drops", NbtElement.STRING_TYPE);
        for (int i = 0; i < drops.size(); i++) playerDrops.add(UUID.fromString(drops.getString(i)));
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
            siteEvent("info", "start", "Carrying on with the spiral around %d, %d, %s out so far".formatted(spiralCX << 4, spiralCZ << 4, formatBlocks(spiralExtent() * 16)));
        } else {
            Mode savedMode = tag.getString("mode").equals("sectors") ? Mode.Sectors : Mode.Area;
            if (mode.get() != savedMode) mode.set(savedMode);
            NbtCompound a = tag.getCompound("area");
            area = new Area(a.getInt("min-x"), a.getInt("min-z"), a.getInt("max-x"), a.getInt("max-z"));
            sectors = savedMode == Mode.Sectors ? new SectorTraversal(area, Math.max(8, tag.getInt("sector-size")),
                tag.getInt("sector-first"), tag.getInt("sector-visited"), playerChunkX(), playerChunkZ()) : null;
            if (savedMode == Mode.Sectors && tag.contains("sector-current")) {
                sectors = new SectorTraversal(area, Math.max(8, tag.getInt("sector-size")), tag.getBoolean("sector-world-grid"),
                    playerChunkX(), playerChunkZ());
                sectors.restore(tag.getInt("sector-current"), tag.getLongArray("sector-completed"), tag.getLongArray("sector-deferred"),
                    tag.getLongArray("sector-skipped"), tag.getBoolean("sector-retrying"),
                    tag.contains("sector-priority") ? tag.getInt("sector-priority") : -1);
            }
            restoredSwath = sectors != null && tag.contains("sector-reach")
                ? new int[]{tag.getInt("sector-reach-ceiling"), tag.getInt("sector-reach")} : null;
            if (sectors != null && sectors.reanchorIfDistant(playerChunkX(), playerChunkZ())) {
                Area local = sectors.current();
                warning("The saved sector is far from your position. Resuming locally at chunk X %d..%d, Z %d..%d; confirmed coverage is kept.",
                    local.minCX(), local.maxCX(), local.minCZ(), local.maxCZ());
            }
            areaDimension = mc.world.getRegistryKey();
            rescan = tag.getBoolean("rescan");
            territoryId = tag.contains("territory-id") ? tag.getString("territory-id") : null;
            if (tag.contains("explored")) restoredExplored = tag.getLongArray("explored");
            restoredCoverage = tag.contains("coverage") ? tag.getLongArray("coverage") : null;
            info("Carrying on with the saved (highlight)%dx%d(default) chunk area%s.", area.width(), area.depth(), rescan ? " rescan" : "");
            carryingOn = true;
            try {
                start();
            } finally {
                carryingOn = false;
            }
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
            f.putString("details", item.details());
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
                new FoundItem(item, BlockPos.fromLong(f.getLong("pos")), f.getString("what"), LocalTime.parse(f.getString("time")), f.getString("details"))));
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
