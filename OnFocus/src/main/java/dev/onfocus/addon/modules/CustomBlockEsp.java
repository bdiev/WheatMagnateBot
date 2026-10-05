package dev.onfocus.addon.modules;

import dev.onfocus.addon.OnFocusAddon;
import it.unimi.dsi.fastutil.longs.Long2ObjectMap;
import it.unimi.dsi.fastutil.longs.Long2ObjectOpenHashMap;
import it.unimi.dsi.fastutil.longs.LongArrayList;
import it.unimi.dsi.fastutil.longs.LongOpenHashSet;
import it.unimi.dsi.fastutil.longs.LongSet;
import it.unimi.dsi.fastutil.objects.Reference2ObjectOpenHashMap;
import it.unimi.dsi.fastutil.objects.ReferenceOpenHashSet;
import meteordevelopment.meteorclient.events.render.Render3DEvent;
import meteordevelopment.meteorclient.events.world.BlockUpdateEvent;
import meteordevelopment.meteorclient.events.world.ChunkDataEvent;
import meteordevelopment.meteorclient.events.world.TickEvent;
import meteordevelopment.meteorclient.renderer.ShapeMode;
import meteordevelopment.meteorclient.settings.*;
import meteordevelopment.meteorclient.systems.modules.Module;
import meteordevelopment.meteorclient.utils.Utils;
import meteordevelopment.meteorclient.utils.player.PlayerUtils;
import meteordevelopment.meteorclient.utils.render.RenderUtils;
import meteordevelopment.meteorclient.utils.render.color.Color;
import meteordevelopment.meteorclient.utils.render.color.SettingColor;
import meteordevelopment.meteorclient.utils.world.Dimension;
import meteordevelopment.orbit.EventHandler;
import net.minecraft.block.Block;
import net.minecraft.block.BlockState;
import net.minecraft.sound.SoundCategory;
import net.minecraft.sound.SoundEvent;
import net.minecraft.sound.SoundEvents;
import net.minecraft.util.math.BlockPos;
import net.minecraft.util.math.Box;
import net.minecraft.util.math.ChunkPos;
import net.minecraft.util.shape.VoxelShape;
import net.minecraft.world.chunk.Chunk;
import net.minecraft.world.chunk.ChunkSection;

import java.util.ArrayList;
import java.util.EnumMap;
import java.util.List;
import java.util.Map;
import java.util.Random;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Our own Block ESP: highlights and draws tracers to configured blocks, with a built-in sound
 * alert. Independent from the built-in Meteor Block ESP module.
 * <p>
 * Built to survive huge clusters (gold farms are walls of Nether Portal blocks):
 * <ul>
 *     <li>chunk sections are skipped outright unless their palette holds a searched block;</li>
 *     <li>found blocks are merged off-thread into as few boxes as possible - touching blocks of
 *     the same kind become one box, so a whole portal is a single panel - and the render pass
 *     only draws that prebuilt list, without touching the world;</li>
 *     <li>there is one tracer per merged box, not per block.</li>
 * </ul>
 */
public class CustomBlockEsp extends Module {
    /** Ticks between rebuilding the merged boxes after something changed. */
    private static final int REBUILD_DELAY_TICKS = 5;

    private final SettingGroup sgGeneral = settings.getDefaultGroup();
    private final SettingGroup sgRender = settings.createGroup("Render");
    private final SettingGroup sgTracers = settings.createGroup("Tracers");
    private final SettingGroup sgSound = settings.createGroup("Sound");

    // General

    private final Setting<List<Block>> blocks = sgGeneral.add(new BlockListSetting.Builder()
        .name("blocks")
        .description("Blocks to search for.")
        .onChanged(v -> {
            if (isActive() && Utils.canUpdate()) onActivate();
        })
        .build()
    );

    private final Setting<Map<Block, EspBlockColor>> blockColors = sgGeneral.add(new BlockDataSetting.Builder<EspBlockColor>()
        .name("block-colors")
        .description("Per-block color overrides. Takes priority over auto-color and the colors below.")
        .defaultData(() -> new EspBlockColor(
            new SettingColor(0, 255, 200, 25),
            new SettingColor(0, 255, 200),
            new SettingColor(0, 255, 200, 175)
        ))
        .build()
    );

    // Render

    private final Setting<Boolean> boxes = sgRender.add(new BoolSetting.Builder()
        .name("boxes")
        .description("Renders a box around found blocks.")
        .defaultValue(true)
        .build()
    );

    private final Setting<ShapeMode> shapeMode = sgRender.add(new EnumSetting.Builder<ShapeMode>()
        .name("shape-mode")
        .description("How the boxes are rendered.")
        .defaultValue(ShapeMode.Both)
        .visible(boxes::get)
        .build()
    );

    private final Setting<Boolean> accurateShape = sgRender.add(new BoolSetting.Builder()
        .name("accurate-shape")
        .description("Draws the box matching the block's actual shape (slabs, stairs, fences, etc) instead of a full cube.")
        .defaultValue(true)
        .visible(boxes::get)
        .onChanged(v -> markDirty())
        .build()
    );

    private final Setting<Boolean> merge = sgRender.add(new BoolSetting.Builder()
        .name("merge-blocks")
        .description("Merges touching blocks of the same kind into one box (a whole portal becomes one panel). Much faster with big clusters.")
        .defaultValue(true)
        .visible(boxes::get)
        .onChanged(v -> markDirty())
        .build()
    );

    private final Setting<Boolean> autoColor = sgRender.add(new BoolSetting.Builder()
        .name("auto-color")
        .description("Colors each box using its own block's map color instead of a single color for every block.")
        .defaultValue(true)
        .visible(boxes::get)
        .build()
    );

    private final Setting<SettingColor> sideColor = sgRender.add(new ColorSetting.Builder()
        .name("side-color")
        .description("Color of the sides of the box. Used as-is when auto-color is off, otherwise only its opacity is used.")
        .defaultValue(new SettingColor(0, 255, 200, 25))
        .visible(boxes::get)
        .build()
    );

    private final Setting<SettingColor> lineColor = sgRender.add(new ColorSetting.Builder()
        .name("line-color")
        .description("Color of the lines of the box. Used as-is when auto-color is off, otherwise only its opacity is used.")
        .defaultValue(new SettingColor(0, 255, 200))
        .visible(boxes::get)
        .build()
    );

    // Tracers

    private final Setting<Boolean> tracers = sgTracers.add(new BoolSetting.Builder()
        .name("tracers")
        .description("Renders tracer lines to found blocks (one per merged box).")
        .defaultValue(true)
        .build()
    );

    private final Setting<SettingColor> tracerColor = sgTracers.add(new ColorSetting.Builder()
        .name("tracer-color")
        .description("Color of the tracer lines.")
        .defaultValue(new SettingColor(0, 255, 200, 175))
        .visible(tracers::get)
        .build()
    );

    private final Setting<Integer> tracerMaxDistance = sgTracers.add(new IntSetting.Builder()
        .name("max-distance")
        .description("Tracers stop rendering to blocks further than this from you.")
        .defaultValue(500)
        .range(1, 5000)
        .sliderRange(1, 1000)
        .visible(tracers::get)
        .build()
    );

    // Sound

    private final Setting<Boolean> soundEnabled = sgSound.add(new BoolSetting.Builder()
        .name("sound")
        .description("Plays a sound when a new block is found.")
        .defaultValue(false)
        .build()
    );

    private final Setting<List<SoundEvent>> sounds = sgSound.add(new SoundEventListSetting.Builder()
        .name("sounds")
        .description("Sound(s) to play. If more than one is set, one is picked at random.")
        .defaultValue(List.of(SoundEvents.ENTITY_EXPERIENCE_ORB_PICKUP))
        .visible(soundEnabled::get)
        .build()
    );

    private final Setting<Double> volume = sgSound.add(new DoubleSetting.Builder()
        .name("volume")
        .description("Volume of the alert sound.")
        .defaultValue(1.0)
        .range(0, 2)
        .sliderRange(0, 2)
        .visible(soundEnabled::get)
        .build()
    );

    private final Setting<Double> pitch = sgSound.add(new DoubleSetting.Builder()
        .name("pitch")
        .description("Pitch of the alert sound.")
        .defaultValue(1.0)
        .range(0.5, 2)
        .sliderRange(0.5, 2)
        .visible(soundEnabled::get)
        .build()
    );

    private final Setting<Integer> cooldown = sgSound.add(new IntSetting.Builder()
        .name("cooldown")
        .description("Minimum ticks between alert sounds, so a big vein doesn't spam you.")
        .defaultValue(10)
        .range(0, 200)
        .sliderRange(0, 100)
        .visible(soundEnabled::get)
        .build()
    );

    /** A box to draw, in world coordinates, prebuilt off-thread. */
    private record RenderBox(Block block, int rgb, double minX, double minY, double minZ, double maxX, double maxY, double maxZ) {}

    // Found blocks per chunk, so a rescanned or unloaded chunk is replaced / dropped as a whole.
    // Guarded by itself.
    private final Long2ObjectMap<Long2ObjectMap<BlockState>> foundByChunk = new Long2ObjectOpenHashMap<>();
    private volatile List<RenderBox> renderBoxes = List.of();
    private volatile int foundCount;
    private volatile boolean dirty;
    private int rebuildTimer;

    // Positions we've already played the alert sound for, kept per-dimension so a portal doesn't
    // re-alert every time its chunk gets rescanned after a dimension switch (see onDimensionChange).
    private final Map<Dimension, LongSet> notifiedBlocks = new EnumMap<>(Dimension.class);
    private final ExecutorService workerThread = Executors.newSingleThreadExecutor();
    private final Random random = new Random();

    private Dimension lastDimension;
    private int cooldownTimer;
    private int pruneTimer;

    public CustomBlockEsp() {
        super(OnFocusAddon.CATEGORY, "custom-block-esp", "Highlights and tracers selected blocks through walls, with a built-in sound alert.");
    }

    @Override
    public void onActivate() {
        clearFound();
        notifiedBlocks.clear();
        cooldownTimer = 0;
        pruneTimer = 0;
        lastDimension = PlayerUtils.getDimension();

        for (Chunk chunk : Utils.chunks()) {
            searchChunk(chunk);
        }
    }

    @Override
    public void onDeactivate() {
        clearFound();
    }

    private void clearFound() {
        synchronized (foundByChunk) {
            foundByChunk.clear();
        }
        renderBoxes = List.of();
        foundCount = 0;
        dirty = false;
    }

    private void markDirty() {
        dirty = true;
    }

    // Blocks found before the switch belong to the dimension we just left, so re-scan from
    // scratch instead of letting onTick's loaded-chunk pruning race and drop them. notifiedBlocks
    // is untouched, so a portal already alerted on doesn't sound again just because we left and
    // came back through it.
    private void onDimensionChange() {
        clearFound();
        cooldownTimer = 0;
        pruneTimer = 0;

        for (Chunk chunk : Utils.chunks()) {
            searchChunk(chunk);
        }
    }

    private void searchChunk(Chunk chunk) {
        Set<Block> targets = new ReferenceOpenHashSet<>(blocks.get());
        if (targets.isEmpty()) return;
        ChunkPos pos = chunk.getPos();

        workerThread.submit(() -> {
            if (!isActive()) return;

            Long2ObjectMap<BlockState> matches = new Long2ObjectOpenHashMap<>();
            ChunkSection[] sections = chunk.getSectionArray();

            for (int i = 0; i < sections.length; i++) {
                ChunkSection section = sections[i];
                // The palette check rules out almost every section without looking at a single block
                if (section == null || section.isEmpty()) continue;
                if (!section.getBlockStateContainer().hasAny(state -> targets.contains(state.getBlock()))) continue;

                int baseY = chunk.sectionIndexToCoord(i) << 4;
                for (int y = 0; y < 16; y++) {
                    for (int z = 0; z < 16; z++) {
                        for (int x = 0; x < 16; x++) {
                            BlockState state = section.getBlockState(x, y, z);
                            if (targets.contains(state.getBlock())) {
                                matches.put(BlockPos.asLong(pos.getStartX() + x, baseY + y, pos.getStartZ() + z), state);
                            }
                        }
                    }
                }
            }

            boolean foundNew = false;
            synchronized (foundByChunk) {
                if (matches.isEmpty()) {
                    if (foundByChunk.remove(pos.toLong()) != null) markDirty();
                    return;
                }
                foundByChunk.put(pos.toLong(), matches);

                LongSet notified = notifiedBlocks.computeIfAbsent(lastDimension, d -> new LongOpenHashSet());
                for (long key : matches.keySet()) {
                    if (notified.add(key)) foundNew = true;
                }
            }
            markDirty();

            if (foundNew) notifyFound();
        });
    }

    @EventHandler
    private void onChunkData(ChunkDataEvent event) {
        searchChunk(event.chunk());
    }

    @EventHandler
    private void onBlockUpdate(BlockUpdateEvent event) {
        List<Block> targets = blocks.get();

        boolean matches = targets.contains(event.newState.getBlock());
        boolean wasMatch = targets.contains(event.oldState.getBlock());
        if (!matches && !wasMatch) return;

        long key = event.pos.asLong();
        long chunkKey = ChunkPos.toLong(event.pos.getX() >> 4, event.pos.getZ() >> 4);
        boolean foundNew = false;

        synchronized (foundByChunk) {
            if (matches) {
                foundByChunk.computeIfAbsent(chunkKey, k -> new Long2ObjectOpenHashMap<>()).put(key, event.newState);
                foundNew = notifiedBlocks.computeIfAbsent(lastDimension, d -> new LongOpenHashSet()).add(key);
            } else {
                Long2ObjectMap<BlockState> inChunk = foundByChunk.get(chunkKey);
                if (inChunk != null) {
                    inChunk.remove(key);
                    if (inChunk.isEmpty()) foundByChunk.remove(chunkKey);
                }
            }
        }
        markDirty();

        if (foundNew) notifyFound();
    }

    @EventHandler
    private void onTick(TickEvent.Post event) {
        if (cooldownTimer > 0) cooldownTimer--;

        Dimension dimension = PlayerUtils.getDimension();
        if (lastDimension != dimension) {
            lastDimension = dimension;
            onDimensionChange();
            return;
        }

        // Forget chunks that are no longer loaded, so they get rediscovered if they load again
        if (++pruneTimer >= 20) {
            pruneTimer = 0;

            synchronized (foundByChunk) {
                boolean removed = foundByChunk.long2ObjectEntrySet().removeIf(entry ->
                    !mc.world.isChunkLoaded(ChunkPos.getPackedX(entry.getLongKey()), ChunkPos.getPackedZ(entry.getLongKey())));
                if (removed) markDirty();
            }
        }

        // Rebuild the render list at most every few ticks, on the worker thread
        if (rebuildTimer > 0) rebuildTimer--;
        if (dirty && rebuildTimer == 0) {
            dirty = false;
            rebuildTimer = REBUILD_DELAY_TICKS;
            workerThread.submit(this::rebuild);
        }
    }

    /** Turns the found blocks into the list of boxes to draw. Runs on the worker thread. */
    private void rebuild() {
        if (!isActive() || mc.world == null) return;

        // Snapshot, grouped by block state (same state = same shape)
        Map<BlockState, LongArrayList> byState = new Reference2ObjectOpenHashMap<>();
        int count = 0;
        synchronized (foundByChunk) {
            for (Long2ObjectMap<BlockState> inChunk : foundByChunk.values()) {
                for (Long2ObjectMap.Entry<BlockState> entry : inChunk.long2ObjectEntrySet()) {
                    byState.computeIfAbsent(entry.getValue(), s -> new LongArrayList()).add(entry.getLongKey());
                    count++;
                }
            }
        }

        List<RenderBox> result = new ArrayList<>();
        boolean accurate = accurateShape.get();
        boolean merging = merge.get();

        for (Map.Entry<BlockState, LongArrayList> group : byState.entrySet()) {
            BlockState state = group.getKey();
            LongArrayList positions = group.getValue();
            Block block = state.getBlock();
            int rgb = block.getDefaultMapColor().color;

            List<Box> shape = List.of(new Box(0, 0, 0, 1, 1, 1));
            if (accurate) {
                VoxelShape voxels = state.getOutlineShape(mc.world, BlockPos.fromLong(positions.getLong(0)));
                if (!voxels.isEmpty()) shape = voxels.getBoundingBoxes();
            }

            // Multi-box shapes (stairs, fences) can't be stretched over several blocks
            if (!merging || shape.size() != 1) {
                for (int i = 0; i < positions.size(); i++) {
                    long key = positions.getLong(i);
                    int x = BlockPos.unpackLongX(key), y = BlockPos.unpackLongY(key), z = BlockPos.unpackLongZ(key);
                    for (Box b : shape) result.add(new RenderBox(block, rgb, x + b.minX, y + b.minY, z + b.minZ, x + b.maxX, y + b.maxY, z + b.maxZ));
                }
                continue;
            }

            mergeGroup(positions, shape.get(0), block, rgb, result);
        }

        renderBoxes = result;
        foundCount = count;
    }

    /**
     * Greedy box merging: grows each box along x, then z, then y while the whole face it would
     * add is filled. Only along axes where the block's shape spans the full block, so merged
     * boxes never cover gaps (a portal merges into a flat panel but never across its thickness).
     */
    private static void mergeGroup(LongArrayList positions, Box b, Block block, int rgb, List<RenderBox> out) {
        boolean mx = b.minX == 0 && b.maxX == 1;
        boolean my = b.minY == 0 && b.maxY == 1;
        boolean mz = b.minZ == 0 && b.maxZ == 1;

        LongOpenHashSet remaining = new LongOpenHashSet(positions);
        // Row by row, so boxes start at their lowest corner and grow in one direction
        positions.sort((p, q) -> {
            int c = Integer.compare(BlockPos.unpackLongY(p), BlockPos.unpackLongY(q));
            if (c != 0) return c;
            c = Integer.compare(BlockPos.unpackLongZ(p), BlockPos.unpackLongZ(q));
            return c != 0 ? c : Integer.compare(BlockPos.unpackLongX(p), BlockPos.unpackLongX(q));
        });

        for (int i = 0; i < positions.size(); i++) {
            long start = positions.getLong(i);
            if (!remaining.contains(start)) continue;
            int x0 = BlockPos.unpackLongX(start), y0 = BlockPos.unpackLongY(start), z0 = BlockPos.unpackLongZ(start);

            int x1 = x0;
            if (mx) while (remaining.contains(BlockPos.asLong(x1 + 1, y0, z0))) x1++;

            int z1 = z0;
            if (mz) while (rowFilled(remaining, x0, x1, y0, z1 + 1)) z1++;

            int y1 = y0;
            if (my) {
                grow:
                while (true) {
                    for (int z = z0; z <= z1; z++) {
                        if (!rowFilled(remaining, x0, x1, y1 + 1, z)) break grow;
                    }
                    y1++;
                }
            }

            for (int y = y0; y <= y1; y++) {
                for (int z = z0; z <= z1; z++) {
                    for (int x = x0; x <= x1; x++) remaining.remove(BlockPos.asLong(x, y, z));
                }
            }
            out.add(new RenderBox(block, rgb, x0 + b.minX, y0 + b.minY, z0 + b.minZ, x1 + b.maxX, y1 + b.maxY, z1 + b.maxZ));
        }
    }

    private static boolean rowFilled(LongSet set, int x0, int x1, int y, int z) {
        for (int x = x0; x <= x1; x++) {
            if (!set.contains(BlockPos.asLong(x, y, z))) return false;
        }
        return true;
    }

    private void notifyFound() {
        if (!soundEnabled.get() || cooldownTimer > 0) return;

        List<SoundEvent> soundList = sounds.get();
        if (soundList.isEmpty()) return;

        SoundEvent sound = soundList.get(random.nextInt(soundList.size()));
        cooldownTimer = cooldown.get();

        mc.execute(() -> mc.world.playSoundFromEntity(mc.player, mc.player, sound, SoundCategory.PLAYERS, volume.get().floatValue(), pitch.get().floatValue()));
    }

    @EventHandler
    private void onRender(Render3DEvent event) {
        List<RenderBox> list = renderBoxes;
        if (list.isEmpty()) return;

        Map<Block, EspBlockColor> custom = blockColors.get();
        boolean drawBoxes = boxes.get(), drawTracers = tracers.get(), auto = autoColor.get();
        ShapeMode mode = shapeMode.get();
        double maxDistSq = (double) tracerMaxDistance.get() * tracerMaxDistance.get();
        double px = mc.player.getX(), py = mc.player.getY(), pz = mc.player.getZ();

        // Reused instead of allocating per box per frame
        Color side = new Color(), line = new Color(), tracer = new Color();
        SettingColor sideBase = sideColor.get(), lineBase = lineColor.get(), tracerBase = tracerColor.get();

        for (RenderBox box : list) {
            EspBlockColor c = custom.get(box.block());
            if (c != null) {
                side.set(c.sideColor);
                line.set(c.lineColor);
                tracer.set(c.tracerColor);
            } else if (auto) {
                int r = (box.rgb() >> 16) & 0xFF, g = (box.rgb() >> 8) & 0xFF, b = box.rgb() & 0xFF;
                side.set(r, g, b, sideBase.a);
                line.set(r, g, b, lineBase.a);
                tracer.set(r, g, b, tracerBase.a);
            } else {
                side.set(sideBase);
                line.set(lineBase);
                tracer.set(tracerBase);
            }

            if (drawBoxes) {
                event.renderer.box(box.minX(), box.minY(), box.minZ(), box.maxX(), box.maxY(), box.maxZ(), side, line, mode, 0);
            }

            if (drawTracers) {
                double cx = (box.minX() + box.maxX()) / 2, cy = (box.minY() + box.maxY()) / 2, cz = (box.minZ() + box.maxZ()) / 2;
                double dx = cx - px, dy = cy - py, dz = cz - pz;
                if (dx * dx + dy * dy + dz * dz <= maxDistSq) {
                    event.renderer.line(RenderUtils.center.x, RenderUtils.center.y, RenderUtils.center.z, cx, cy, cz, tracer);
                }
            }
        }
    }

    @Override
    public String getInfoString() {
        return "%d blocks".formatted(foundCount);
    }

    /**
     * Nearest currently-found block of the given type to {@code from}, or null if none. Lets
     * other modules (e.g. TrailExplorer's "stop on Nether Portal") react to this module's finds
     * without duplicating its scanning - only works while this module is active and its
     * {@code blocks} setting includes the type being looked for.
     */
    public BlockPos getNearestFound(Block block, BlockPos from) {
        long nearest = 0;
        boolean any = false;
        long nearestDistSq = Long.MAX_VALUE;

        synchronized (foundByChunk) {
            for (Long2ObjectMap<BlockState> inChunk : foundByChunk.values()) {
                for (Long2ObjectMap.Entry<BlockState> entry : inChunk.long2ObjectEntrySet()) {
                    if (!entry.getValue().isOf(block)) continue;

                    long key = entry.getLongKey();
                    long dx = BlockPos.unpackLongX(key) - from.getX();
                    long dy = BlockPos.unpackLongY(key) - from.getY();
                    long dz = BlockPos.unpackLongZ(key) - from.getZ();
                    long distSq = dx * dx + dy * dy + dz * dz;

                    if (distSq < nearestDistSq) {
                        nearestDistSq = distSq;
                        nearest = key;
                        any = true;
                    }
                }
            }
        }

        return any ? BlockPos.fromLong(nearest) : null;
    }
}
