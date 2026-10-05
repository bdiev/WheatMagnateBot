package dev.onfocus.addon.settings;

import meteordevelopment.meteorclient.gui.GuiTheme;
import meteordevelopment.meteorclient.gui.renderer.GuiRenderer;
import meteordevelopment.meteorclient.gui.screens.settings.ItemListSettingScreen;
import meteordevelopment.meteorclient.gui.utils.SettingsWidgetFactory;
import meteordevelopment.meteorclient.gui.widgets.containers.WHorizontalList;
import meteordevelopment.meteorclient.gui.widgets.containers.WTable;
import meteordevelopment.meteorclient.gui.widgets.pressable.WButton;
import meteordevelopment.meteorclient.gui.widgets.pressable.WMinus;
import meteordevelopment.meteorclient.gui.widgets.pressable.WTriangle;
import meteordevelopment.meteorclient.settings.IVisible;
import meteordevelopment.meteorclient.settings.ItemListSetting;
import meteordevelopment.meteorclient.settings.Setting;
import meteordevelopment.meteorclient.utils.misc.Names;
import net.minecraft.item.Item;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;
import java.util.function.Consumer;
import java.util.function.Predicate;

import static meteordevelopment.meteorclient.MeteorClient.mc;

/**
 * An item list whose order matters, shown right in the module's settings: each item with ▲ / ▼ to
 * move it and − to take it off, and Select for Meteor's usual picker. Saved like any item list.
 * <p>
 * Its widget has to be registered once ({@link #registerWidget}): Meteor knows only its own settings.
 */
public class OrderedItemListSetting extends ItemListSetting {
    public OrderedItemListSetting(String name, String description, List<Item> defaultValue, Consumer<List<Item>> onChanged,
                                  Consumer<Setting<List<Item>>> onModuleActivated, IVisible visible, Predicate<Item> filter) {
        super(name, description, defaultValue, onChanged, onModuleActivated, visible, filter, false);
    }

    public static void registerWidget() {
        SettingsWidgetFactory.registerCustomFactory(OrderedItemListSetting.class,
            theme -> (table, setting) -> widget(theme, table, (OrderedItemListSetting) setting));
    }

    private static void widget(GuiTheme theme, WTable table, OrderedItemListSetting setting) {
        WTable outer = table.add(theme.table()).expandX().widget();
        WTable items = outer.add(theme.table()).expandX().widget();
        outer.row();
        Runnable refill = () -> {
            items.clear();
            fill(theme, items, setting);
        };
        refill.run();

        WHorizontalList buttons = outer.add(theme.horizontalList()).expandX().widget();
        WButton select = buttons.add(theme.button("Select")).expandX().widget();
        select.action = () -> {
            ItemListSettingScreen screen = new ItemListSettingScreen(theme, setting);
            screen.onClosed(refill);
            mc.setScreen(screen);
        };
        WButton reset = buttons.add(theme.button(GuiRenderer.RESET)).widget();
        reset.action = () -> {
            setting.reset();
            refill.run();
        };
    }

    /** One row per item, in order: number, the item, ▲, ▼, −. */
    private static void fill(GuiTheme theme, WTable t, OrderedItemListSetting setting) {
        List<Item> list = setting.get();
        for (int i = 0; i < list.size(); i++) {
            int index = i;
            Item item = list.get(i);
            t.add(theme.label((i + 1) + ".")).widget();
            t.add(theme.itemWithLabel(item.getDefaultStack(), Names.get(item))).expandCellX().widget();

            // The triangle points down unturned, as on an open section
            WTriangle up = t.add(theme.triangle()).widget();
            up.rotation = 180;
            up.action = () -> move(theme, t, setting, index, -1);
            WTriangle down = t.add(theme.triangle()).widget();
            down.action = () -> move(theme, t, setting, index, 1);

            WMinus remove = t.add(theme.minus()).right().widget();
            remove.action = () -> {
                setting.get().remove(index);
                setting.onChanged();
                t.clear();
                fill(theme, t, setting);
            };
            t.row();
        }
    }

    private static void move(GuiTheme theme, WTable t, OrderedItemListSetting setting, int index, int by) {
        List<Item> list = setting.get();
        int to = index + by;
        if (to < 0 || to >= list.size()) return;
        Collections.swap(list, index, to);
        setting.onChanged();
        t.clear();
        fill(theme, t, setting);
    }

    public static class Builder extends SettingBuilder<Builder, List<Item>, OrderedItemListSetting> {
        private Predicate<Item> filter;

        public Builder() {
            super(new ArrayList<>(0));
        }

        public Builder defaultValue(Item... defaults) {
            return defaultValue(defaults != null ? Arrays.asList(defaults) : new ArrayList<>());
        }

        public Builder filter(Predicate<Item> filter) {
            this.filter = filter;
            return this;
        }

        @Override
        public OrderedItemListSetting build() {
            return new OrderedItemListSetting(name, description, defaultValue, onChanged, onModuleActivated, visible, filter);
        }
    }
}
