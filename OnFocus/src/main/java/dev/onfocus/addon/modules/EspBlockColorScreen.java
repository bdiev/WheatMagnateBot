package dev.onfocus.addon.modules;

import meteordevelopment.meteorclient.gui.GuiTheme;
import meteordevelopment.meteorclient.gui.WindowScreen;
import meteordevelopment.meteorclient.settings.BlockDataSetting;
import meteordevelopment.meteorclient.settings.ColorSetting;
import meteordevelopment.meteorclient.settings.Settings;
import meteordevelopment.meteorclient.settings.SettingGroup;
import meteordevelopment.meteorclient.utils.render.color.SettingColor;
import net.minecraft.block.Block;

public class EspBlockColorScreen extends WindowScreen {
    private final EspBlockColor blockColor;
    private final Block block;
    private final BlockDataSetting<EspBlockColor> setting;

    public EspBlockColorScreen(GuiTheme theme, EspBlockColor blockColor, Block block, BlockDataSetting<EspBlockColor> setting) {
        super(theme, "Configure Block Color");

        this.blockColor = blockColor;
        this.block = block;
        this.setting = setting;
    }

    @Override
    public void initWidgets() {
        Settings settings = new Settings();
        SettingGroup sgGeneral = settings.getDefaultGroup();

        sgGeneral.add(new ColorSetting.Builder()
            .name("side-color")
            .description("Color of the sides of the box for this block.")
            .defaultValue(new SettingColor(0, 255, 200, 25))
            .onModuleActivated(settingColorSetting -> settingColorSetting.set(blockColor.sideColor))
            .onChanged(settingColor -> {
                blockColor.sideColor.set(settingColor);
                changed();
            })
            .build()
        );

        sgGeneral.add(new ColorSetting.Builder()
            .name("line-color")
            .description("Color of the lines of the box for this block.")
            .defaultValue(new SettingColor(0, 255, 200))
            .onModuleActivated(settingColorSetting -> settingColorSetting.set(blockColor.lineColor))
            .onChanged(settingColor -> {
                blockColor.lineColor.set(settingColor);
                changed();
            })
            .build()
        );

        sgGeneral.add(new ColorSetting.Builder()
            .name("tracer-color")
            .description("Color of the tracer line for this block.")
            .defaultValue(new SettingColor(0, 255, 200, 175))
            .onModuleActivated(settingColorSetting -> settingColorSetting.set(blockColor.tracerColor))
            .onChanged(settingColor -> {
                blockColor.tracerColor.set(settingColor);
                changed();
            })
            .build()
        );

        settings.onActivated();
        add(theme.settings(settings)).expandX();
    }

    private void changed() {
        if (!blockColor.isChanged() && block != null && setting != null) {
            setting.get().put(block, blockColor);
            setting.onChanged();
        }

        blockColor.changed();
    }
}
