package dev.onfocus.addon.modules;

import meteordevelopment.meteorclient.gui.GuiTheme;
import meteordevelopment.meteorclient.gui.WidgetScreen;
import meteordevelopment.meteorclient.settings.BlockDataSetting;
import meteordevelopment.meteorclient.settings.IBlockData;
import meteordevelopment.meteorclient.utils.misc.IChangeable;
import meteordevelopment.meteorclient.utils.misc.ICopyable;
import meteordevelopment.meteorclient.utils.misc.ISerializable;
import net.minecraft.block.Block;
import net.minecraft.nbt.NbtCompound;

/**
 * How often one block type is used relative to the others in {@link RandomPath}'s mix, configured
 * from its "blocks" setting. A weight of 0 (the default) excludes the block entirely - opening the
 * edit screen without touching the slider leaves it excluded rather than silently adding it.
 */
public class PathBlockWeight implements ICopyable<PathBlockWeight>, ISerializable<PathBlockWeight>, IChangeable, IBlockData<PathBlockWeight> {
    public int weight;

    private boolean changed;

    public PathBlockWeight(int weight) {
        this.weight = weight;
    }

    @Override
    public WidgetScreen createScreen(GuiTheme theme, Block block, BlockDataSetting<PathBlockWeight> setting) {
        return new PathBlockWeightScreen(theme, this, block, setting);
    }

    @Override
    public boolean isChanged() {
        return changed;
    }

    public void changed() {
        changed = true;
    }

    @Override
    public PathBlockWeight set(PathBlockWeight value) {
        weight = value.weight;
        changed = value.changed;

        return this;
    }

    @Override
    public PathBlockWeight copy() {
        return new PathBlockWeight(weight);
    }

    @Override
    public NbtCompound toTag() {
        NbtCompound tag = new NbtCompound();

        tag.putInt("weight", weight);
        tag.putBoolean("changed", changed);

        return tag;
    }

    @Override
    public PathBlockWeight fromTag(NbtCompound tag) {
        weight = tag.getInt("weight");
        changed = tag.getBoolean("changed");

        return this;
    }
}
