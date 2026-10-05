package dev.onfocus.addon.modules;

import meteordevelopment.meteorclient.gui.GuiTheme;
import meteordevelopment.meteorclient.gui.WindowScreen;
import meteordevelopment.meteorclient.settings.BlockDataSetting;
import meteordevelopment.meteorclient.settings.IntSetting;
import meteordevelopment.meteorclient.settings.Settings;
import meteordevelopment.meteorclient.settings.SettingGroup;
import net.minecraft.block.Block;

public class PathBlockWeightScreen extends WindowScreen {
    private final PathBlockWeight data;
    private final Block block;
    private final BlockDataSetting<PathBlockWeight> setting;

    public PathBlockWeightScreen(GuiTheme theme, PathBlockWeight data, Block block, BlockDataSetting<PathBlockWeight> setting) {
        super(theme, "Configure Block Weight");

        this.data = data;
        this.block = block;
        this.setting = setting;
    }

    @Override
    public void initWidgets() {
        Settings settings = new Settings();
        SettingGroup sgGeneral = settings.getDefaultGroup();

        sgGeneral.add(new IntSetting.Builder()
            .name("weight")
            .description("How often this block is used relative to the others in the mix - 0 excludes it entirely.")
            .defaultValue(0)
            .min(0)
            .sliderRange(0, 10)
            .onModuleActivated(weightSetting -> weightSetting.set(data.weight))
            .onChanged(weight -> {
                data.weight = weight;
                changed();
            })
            .build()
        );

        settings.onActivated();
        add(theme.settings(settings)).expandX();
    }

    private void changed() {
        if (!data.isChanged() && block != null && setting != null) {
            setting.get().put(block, data);
            setting.onChanged();
        }

        data.changed();
    }
}
