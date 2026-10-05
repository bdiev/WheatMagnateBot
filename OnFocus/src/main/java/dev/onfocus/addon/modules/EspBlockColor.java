package dev.onfocus.addon.modules;

import meteordevelopment.meteorclient.gui.GuiTheme;
import meteordevelopment.meteorclient.gui.WidgetScreen;
import meteordevelopment.meteorclient.settings.BlockDataSetting;
import meteordevelopment.meteorclient.settings.IBlockData;
import meteordevelopment.meteorclient.utils.misc.IChangeable;
import meteordevelopment.meteorclient.utils.misc.ICopyable;
import meteordevelopment.meteorclient.utils.misc.ISerializable;
import meteordevelopment.meteorclient.utils.render.color.SettingColor;
import net.minecraft.block.Block;
import net.minecraft.nbt.NbtCompound;

/**
 * Per-block color override for {@link CustomBlockEsp}, configured from its "blocks" setting.
 */
public class EspBlockColor implements ICopyable<EspBlockColor>, ISerializable<EspBlockColor>, IChangeable, IBlockData<EspBlockColor> {
    public SettingColor sideColor;
    public SettingColor lineColor;
    public SettingColor tracerColor;

    private boolean changed;

    public EspBlockColor(SettingColor sideColor, SettingColor lineColor, SettingColor tracerColor) {
        this.sideColor = sideColor;
        this.lineColor = lineColor;
        this.tracerColor = tracerColor;
    }

    @Override
    public WidgetScreen createScreen(GuiTheme theme, Block block, BlockDataSetting<EspBlockColor> setting) {
        return new EspBlockColorScreen(theme, this, block, setting);
    }

    @Override
    public boolean isChanged() {
        return changed;
    }

    public void changed() {
        changed = true;
    }

    @Override
    public EspBlockColor set(EspBlockColor value) {
        sideColor.set(value.sideColor);
        lineColor.set(value.lineColor);
        tracerColor.set(value.tracerColor);

        changed = value.changed;

        return this;
    }

    @Override
    public EspBlockColor copy() {
        return new EspBlockColor(new SettingColor(sideColor), new SettingColor(lineColor), new SettingColor(tracerColor));
    }

    @Override
    public NbtCompound toTag() {
        NbtCompound tag = new NbtCompound();

        tag.put("sideColor", sideColor.toTag());
        tag.put("lineColor", lineColor.toTag());
        tag.put("tracerColor", tracerColor.toTag());
        tag.putBoolean("changed", changed);

        return tag;
    }

    @Override
    public EspBlockColor fromTag(NbtCompound tag) {
        sideColor.fromTag(tag.getCompound("sideColor"));
        lineColor.fromTag(tag.getCompound("lineColor"));
        tracerColor.fromTag(tag.getCompound("tracerColor"));

        changed = tag.getBoolean("changed");

        return this;
    }
}
