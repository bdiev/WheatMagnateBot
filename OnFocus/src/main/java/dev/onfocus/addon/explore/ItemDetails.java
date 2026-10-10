package dev.onfocus.addon.explore;

import it.unimi.dsi.fastutil.objects.Object2IntMap;
import net.minecraft.block.Block;
import net.minecraft.block.ShulkerBoxBlock;
import net.minecraft.component.DataComponentTypes;
import net.minecraft.component.type.BundleContentsComponent;
import net.minecraft.component.type.ContainerComponent;
import net.minecraft.component.type.ItemEnchantmentsComponent;
import net.minecraft.enchantment.Enchantment;
import net.minecraft.item.Item;
import net.minecraft.item.ItemStack;
import net.minecraft.registry.entry.RegistryEntry;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * What an item on the ground has on it and in it, which its name and count don't tell: a sword's
 * enchantments and wear, a shulker box's or a bundle's contents. The client gets an item entity's
 * stack whole, so all of it can be read from afar.
 */
public final class ItemDetails {
    /** Kinds of contents named; the rest are "+N". */
    private static final int NAMED_CONTENTS = 12;
    /** An empty shulker box's details. */
    public static final String EMPTY = "empty";
    private static final Pattern CONTENT = Pattern.compile("^(.+) ×(\\d+)$");

    private ItemDetails() {
    }

    /** A shulker box or a bundle: its details are what it holds, nothing on it. */
    public static boolean holdsItems(Item item) {
        return Block.getBlockFromItem(item) instanceof ShulkerBoxBlock || item.getComponents().contains(DataComponentTypes.BUNDLE_CONTENTS);
    }

    /** What a shulker box's or bundle's details say it holds, by name, as {@link #of} wrote them; the "+N" left over is skipped. */
    public static Map<String, Integer> parseContents(String details) {
        Map<String, Integer> inside = new LinkedHashMap<>();
        for (String part : details.split(", ")) {
            Matcher m = CONTENT.matcher(part);
            if (m.matches()) inside.merge(m.group(1), Integer.parseInt(m.group(2)), Integer::sum);
        }
        return inside;
    }

    /** What's inside a shulker box or a bundle; empty for anything else, or an empty one. */
    public static List<ItemStack> contents(ItemStack stack) {
        List<ItemStack> inside = new ArrayList<>();
        ContainerComponent container = stack.get(DataComponentTypes.CONTAINER);
        if (container != null) container.iterateNonEmpty().forEach(inside::add);
        BundleContentsComponent bundle = stack.get(DataComponentTypes.BUNDLE_CONTENTS);
        if (bundle != null) bundle.iterate().forEach(s -> {
            if (!s.isEmpty()) inside.add(s);
        });
        return inside;
    }

    /**
     * "Sharpness V, Mending, 87%" for what's on it, "Elytra ×1, Totem of Undying ×12" for what's in it,
     * the two joined with " · "; "empty" for an empty shulker box; nothing for a plain item.
     */
    public static String of(ItemStack stack) {
        List<String> on = new ArrayList<>();
        enchantments(stack.getOrDefault(DataComponentTypes.ENCHANTMENTS, ItemEnchantmentsComponent.DEFAULT), on);
        // An enchanted book's
        enchantments(stack.getOrDefault(DataComponentTypes.STORED_ENCHANTMENTS, ItemEnchantmentsComponent.DEFAULT), on);
        if (stack.isDamageable() && stack.getDamage() > 0) {
            int max = stack.getMaxDamage();
            on.add(Math.max(1, Math.round(100f * (max - stack.getDamage()) / max)) + "%");
        }

        // Kinds inside by name, in the order they come, counted together
        Map<String, Integer> inside = new LinkedHashMap<>();
        for (ItemStack s : contents(stack)) inside.merge(FindNames.clean(s.getItem().getName().getString()), s.getCount(), Integer::sum);
        StringBuilder in = new StringBuilder();
        int named = 0;
        for (Map.Entry<String, Integer> e : inside.entrySet()) {
            if (named++ == NAMED_CONTENTS) {
                in.append(", +").append(inside.size() - NAMED_CONTENTS);
                break;
            }
            if (!in.isEmpty()) in.append(", ");
            in.append(e.getKey()).append(" ×").append(e.getValue());
        }
        if (in.isEmpty() && Block.getBlockFromItem(stack.getItem()) instanceof ShulkerBoxBlock) in.append(EMPTY);

        String onText = String.join(", ", on);
        if (onText.isEmpty()) return in.toString();
        return in.isEmpty() ? onText : onText + " · " + in;
    }

    private static void enchantments(ItemEnchantmentsComponent enchantments, List<String> out) {
        for (Object2IntMap.Entry<RegistryEntry<Enchantment>> e : enchantments.getEnchantmentEntries()) {
            out.add(FindNames.clean(Enchantment.getName(e.getKey(), e.getIntValue()).getString()));
        }
    }
}
