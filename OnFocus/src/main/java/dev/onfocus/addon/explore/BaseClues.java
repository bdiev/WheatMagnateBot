package dev.onfocus.addon.explore;

import net.minecraft.block.AnvilBlock;
import net.minecraft.block.BedBlock;
import net.minecraft.block.Block;
import net.minecraft.block.BlockState;
import net.minecraft.block.Blocks;
import net.minecraft.block.ShulkerBoxBlock;
import net.minecraft.entity.Entity;
import net.minecraft.entity.decoration.ArmorStandEntity;
import net.minecraft.entity.decoration.EndCrystalEntity;
import net.minecraft.entity.decoration.ItemFrameEntity;
import net.minecraft.entity.mob.MobEntity;
import net.minecraft.entity.passive.AbstractHorseEntity;
import net.minecraft.entity.passive.TameableEntity;
import net.minecraft.entity.passive.VillagerEntity;
import net.minecraft.entity.projectile.thrown.EnderPearlEntity;
import net.minecraft.item.Items;
import net.minecraft.registry.Registries;
import net.minecraft.registry.RegistryKey;
import net.minecraft.registry.tag.BlockTags;
import net.minecraft.util.math.BlockPos;
import net.minecraft.world.World;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.EnumMap;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * What gives a player base away, and how much: the score behind Area Explorer's base markers.
 * <p>
 * Each clue gives points per find, up to a cap, so a hundred blocks of one kind can't make a base on
 * their own. Clues that generated structures have too (furnaces, beds, farmland...) only count a
 * quarter near a structure: a tell-tale block (a village bell, a spawner, purpur...), or for a
 * village its paths or villagers. That's looked for wider around than the score is summed over -
 * a village spreads far past its bell.
 */
public final class BaseClues {
    /** Score left to the clues structures share, in a cluster with a structure in it. */
    private static final double STRUCTURE_FACTOR = 0.25;
    /** Path blocks around that make a village: its streets. Players lay a few, rarely this many. */
    private static final int VILLAGE_PATHS = 24;
    /** Villagers around that make a village (overworld): any village has a handful wandering about. */
    private static final int VILLAGE_VILLAGERS = 3;

    public enum Clue {
        // Never generated: players put these there
        ENDER_CHEST("ender chest", 10, 30, false),
        BEACON("beacon", 15, 30, false),
        ENCHANTING_TABLE("enchanting table", 6, 12, false),
        SHULKER_BOX("shulker box", 8, 40, false),
        VALUABLE_BLOCK("diamond/emerald/netherite block", 5, 20, false),
        CONCRETE("concrete", 0.5, 15, false),
        BED_AWAY("bed", 4, 16, false),
        OVERWORLD_BLOCK("overworld block", 0.2, 15, false),
        MAP_ART("map art", 4, 40, false),
        ARMOR_STAND("armor stand", 3, 15, false),
        END_CRYSTAL("end crystal", 5, 15, false),
        TAMED("tamed animal", 3, 15, false),
        NAMED_MOB("named mob", 3, 15, false),
        VILLAGER_AWAY("villager", 5, 20, false),
        STASIS_PEARL("stasis pearl", 8, 16, false),
        // Generated structures have some of these too
        DOUBLE_CHEST("double chest", 3, 30, true),
        BARREL("barrel", 1, 15, true),
        HOPPER("hopper", 1, 15, true),
        FURNACE("furnace", 1, 10, true),
        BREWING_STAND("brewing stand", 3, 9, true),
        ANVIL("anvil", 3, 9, true),
        BED("bed", 1, 4, true),
        REDSTONE("redstone part", 1, 15, true),
        LIGHT("glowstone/sea lantern", 0.5, 10, true),
        OBSIDIAN("obsidian", 0.1, 10, true),
        CRAFTING_TABLE("crafting table", 0.5, 3, true),
        FARMLAND("farmland", 0.05, 5, true),
        GLASS_PANE("glass pane", 0.2, 3, true),
        ITEM_FRAME("item frame", 2, 20, true),
        VILLAGER("villager", 0.25, 5, true);

        public final String label;
        final double points, cap;
        final boolean structuresToo;

        Clue(String label, double points, double cap, boolean structuresToo) {
            this.label = label;
            this.points = points;
            this.cap = cap;
            this.structuresToo = structuresToo;
        }
    }

    /** Blocks only generated structures have, or near enough: a village's bell, a dungeon's spawner, an End city's purpur... */
    private static final Set<Block> STRUCTURE_SIGNS = Set.of(
        Blocks.BELL, Blocks.SPAWNER, Blocks.COBWEB, Blocks.MOSSY_COBBLESTONE,
        Blocks.PURPUR_BLOCK, Blocks.PURPUR_PILLAR, Blocks.REINFORCED_DEEPSLATE, Blocks.SCULK_SHRIEKER,
        Blocks.TRIAL_SPAWNER, Blocks.VAULT, Blocks.GILDED_BLACKSTONE, Blocks.END_PORTAL_FRAME,
        Blocks.PRISMARINE_BRICKS, Blocks.DARK_PRISMARINE, Blocks.SUSPICIOUS_SAND, Blocks.SUSPICIOUS_GRAVEL,
        Blocks.CRYING_OBSIDIAN, Blocks.NETHER_BRICK_FENCE, Blocks.INFESTED_STONE_BRICKS
    );

    private static final Map<RegistryKey<World>, Map<Block, Clue>> BLOCK_CLUES = new HashMap<>();

    private BaseClues() {
    }

    public static boolean isStructureSign(BlockState state) {
        return STRUCTURE_SIGNS.contains(state.getBlock());
    }

    /** A village street block. */
    public static boolean isVillagePath(BlockState state) {
        return state.isOf(Blocks.DIRT_PATH);
    }

    /**
     * Blocks that are clues in the given dimension, but for double chests: only a pair counts, so
     * those are told by their state. Built on first use, once block tags are loaded.
     */
    public static Map<Block, Clue> blockClues(RegistryKey<World> dimension) {
        return BLOCK_CLUES.computeIfAbsent(dimension, BaseClues::buildBlockClues);
    }

    private static Map<Block, Clue> buildBlockClues(RegistryKey<World> dimension) {
        boolean nether = dimension.equals(World.NETHER), end = dimension.equals(World.END);
        boolean overworld = !nether && !end; // modded dimensions too
        Map<Block, Clue> clues = new HashMap<>();
        clues.put(Blocks.ENDER_CHEST, Clue.ENDER_CHEST);
        clues.put(Blocks.BEACON, Clue.BEACON);
        clues.put(Blocks.ENCHANTING_TABLE, Clue.ENCHANTING_TABLE);
        for (Block b : List.of(Blocks.DIAMOND_BLOCK, Blocks.EMERALD_BLOCK, Blocks.NETHERITE_BLOCK)) clues.put(b, Clue.VALUABLE_BLOCK);
        clues.put(Blocks.BARREL, Clue.BARREL);
        clues.put(Blocks.HOPPER, Clue.HOPPER);
        for (Block b : List.of(Blocks.FURNACE, Blocks.BLAST_FURNACE, Blocks.SMOKER)) clues.put(b, Clue.FURNACE);
        clues.put(Blocks.BREWING_STAND, Clue.BREWING_STAND);
        for (Block b : List.of(Blocks.REPEATER, Blocks.COMPARATOR, Blocks.PISTON, Blocks.STICKY_PISTON, Blocks.OBSERVER,
            Blocks.DISPENSER, Blocks.DROPPER, Blocks.DAYLIGHT_DETECTOR, Blocks.CRAFTER)) clues.put(b, Clue.REDSTONE);
        clues.put(Blocks.CRAFTING_TABLE, Clue.CRAFTING_TABLE);
        clues.put(Blocks.FARMLAND, Clue.FARMLAND);
        if (overworld) {
            for (Block b : List.of(Blocks.GLOWSTONE, Blocks.SEA_LANTERN, Blocks.SHROOMLIGHT)) clues.put(b, Clue.LIGHT);
            // Not in the End: its pillars are obsidian. Not in the Nether: highways are.
            clues.put(Blocks.OBSIDIAN, Clue.OBSIDIAN);
        }
        if (nether) {
            for (Block b : List.of(Blocks.GLASS, Blocks.COBBLESTONE, Blocks.STONE, Blocks.DIRT, Blocks.GRASS_BLOCK)) clues.put(b, Clue.OVERWORLD_BLOCK);
        }

        for (Block b : Registries.BLOCK) {
            String id = Registries.BLOCK.getId(b).getPath();
            BlockState state = b.getDefaultState();
            if (b instanceof ShulkerBoxBlock) clues.put(b, Clue.SHULKER_BOX);
            else if (b instanceof AnvilBlock) clues.put(b, Clue.ANVIL);
            // Beds blow up outside the overworld: one standing there was put there to stay
            else if (b instanceof BedBlock) clues.put(b, overworld ? Clue.BED : Clue.BED_AWAY);
            else if (id.endsWith("_concrete")) clues.put(b, Clue.CONCRETE);
            else if (nether && (id.endsWith("glass") || id.endsWith("glass_pane") || state.isIn(BlockTags.PLANKS) || state.isIn(BlockTags.WOOL))) {
                clues.put(b, Clue.OVERWORLD_BLOCK);
            } else if (id.endsWith("glass_pane")) clues.put(b, Clue.GLASS_PANE);
        }
        return clues;
    }

    /** The clue the entity is, or null. */
    public static Clue entityClue(Entity entity, RegistryKey<World> dimension) {
        boolean overworld = !dimension.equals(World.NETHER) && !dimension.equals(World.END);
        if (entity instanceof ItemFrameEntity frame) return frame.getHeldItemStack().isOf(Items.FILLED_MAP) ? Clue.MAP_ART : Clue.ITEM_FRAME;
        if (entity instanceof ArmorStandEntity) return Clue.ARMOR_STAND;
        // The End's pillars have them
        if (entity instanceof EndCrystalEntity) return dimension.equals(World.END) ? null : Clue.END_CRYSTAL;
        // A pearl sitting in water: a stasis chamber
        if (entity instanceof EnderPearlEntity && entity.isTouchingWater()) return Clue.STASIS_PEARL;
        if (entity instanceof TameableEntity tameable && tameable.isTamed()) return Clue.TAMED;
        if (entity instanceof AbstractHorseEntity horse && horse.isTame()) return Clue.TAMED;
        if (entity instanceof VillagerEntity) return overworld ? Clue.VILLAGER : Clue.VILLAGER_AWAY;
        if (entity instanceof MobEntity && entity.hasCustomName()) return Clue.NAMED_MOB;
        return null;
    }

    /** The clues found in one chunk. Its blocks are counted again whenever it loads; entities stay counted once. */
    public static final class Chunk {
        private final EnumMap<Clue, Integer> blocks = new EnumMap<>(Clue.class), entities = new EnumMap<>(Clue.class);
        private boolean structure;
        private int villagePaths;
        // Positions of the clues, weighted by their points: where the marker goes
        private double blockX, blockY, blockZ, blockWeight;
        private double entityX, entityY, entityZ, entityWeight;

        public void addBlock(Clue clue, int x, int y, int z) {
            blocks.merge(clue, 1, Integer::sum);
            blockX += x * clue.points;
            blockY += y * clue.points;
            blockZ += z * clue.points;
            blockWeight += clue.points;
        }

        public void addEntity(Clue clue, BlockPos pos) {
            entities.merge(clue, 1, Integer::sum);
            entityX += pos.getX() * clue.points;
            entityY += pos.getY() * clue.points;
            entityZ += pos.getZ() * clue.points;
            entityWeight += clue.points;
        }

        public void markStructure() {
            structure = true;
        }

        public void addVillagePath() {
            villagePaths++;
        }

        /** Carries the entities counted in the chunk's last scan over to this one. */
        public void keepEntitiesOf(Chunk old) {
            entities.putAll(old.entities);
            entityX = old.entityX;
            entityY = old.entityY;
            entityZ = old.entityZ;
            entityWeight = old.entityWeight;
        }

        public boolean isEmpty() {
            return blocks.isEmpty() && entities.isEmpty() && !structure && villagePaths == 0;
        }
    }

    /** A cluster's score, where its clues are centred, and what they were - "ender chest ×3, beacon, double chest ×6". */
    public record Score(double total, BlockPos centre, String summary) {}

    /** Whether the chunks around hold a structure: a tell-tale block, or a village's streets or villagers. */
    public static boolean nearStructure(Iterable<Chunk> around) {
        int paths = 0, villagers = 0;
        for (Chunk chunk : around) {
            if (chunk.structure) return true;
            paths += chunk.villagePaths;
            villagers += chunk.entities.getOrDefault(Clue.VILLAGER, 0);
        }
        return paths >= VILLAGE_PATHS || villagers >= VILLAGE_VILLAGERS;
    }

    /** Scores the chunks together, as one place; near a structure (see {@link #nearStructure}) the clues structures share count less. */
    public static Score score(Iterable<Chunk> chunks, boolean structure) {
        EnumMap<Clue, Integer> counts = new EnumMap<>(Clue.class);
        double x = 0, y = 0, z = 0, weight = 0;
        for (Chunk chunk : chunks) {
            chunk.blocks.forEach((clue, n) -> counts.merge(clue, n, Integer::sum));
            chunk.entities.forEach((clue, n) -> counts.merge(clue, n, Integer::sum));
            x += chunk.blockX + chunk.entityX;
            y += chunk.blockY + chunk.entityY;
            z += chunk.blockZ + chunk.entityZ;
            weight += chunk.blockWeight + chunk.entityWeight;
        }
        if (weight == 0) return new Score(0, BlockPos.ORIGIN, "");

        double total = 0;
        List<Map.Entry<Clue, Double>> parts = new ArrayList<>();
        for (Map.Entry<Clue, Integer> e : counts.entrySet()) {
            Clue clue = e.getKey();
            double points = Math.min(clue.cap, clue.points * e.getValue());
            if (structure && clue.structuresToo) points *= STRUCTURE_FACTOR;
            total += points;
            parts.add(Map.entry(clue, points));
        }
        parts.sort(Map.Entry.<Clue, Double>comparingByValue(Comparator.reverseOrder()));

        StringBuilder summary = new StringBuilder();
        for (Map.Entry<Clue, Double> part : parts) {
            if (!summary.isEmpty()) summary.append(", ");
            int n = counts.get(part.getKey());
            summary.append(part.getKey().label);
            if (n > 1) summary.append(" ×").append(n);
        }
        if (structure) summary.append(" (village or structure nearby)");
        return new Score(total, BlockPos.ofFloored(x / weight, y / weight, z / weight), summary.toString());
    }
}
