package dev.onfocus.addon;

import com.mojang.logging.LogUtils;
import dev.onfocus.addon.commands.LootMarkersCommand;
import dev.onfocus.addon.commands.RegroupMarkersCommand;
import dev.onfocus.addon.modules.AreaExplorer;
import dev.onfocus.addon.modules.AutoEat;
import dev.onfocus.addon.modules.AutoMend;
import dev.onfocus.addon.modules.AutoStripper;
import dev.onfocus.addon.modules.CustomBlockEsp;
import dev.onfocus.addon.modules.DeathMessageBlocker;
import dev.onfocus.addon.modules.ElytraControl;
import dev.onfocus.addon.modules.ElytraKeeper;
import dev.onfocus.addon.modules.JoinLeaveMessages;
import dev.onfocus.addon.modules.RandomPath;
import dev.onfocus.addon.modules.StayFocused;
import dev.onfocus.addon.modules.TrailExplorer;
import dev.onfocus.addon.modules.WhisperNotifier;
import dev.onfocus.addon.settings.OrderedItemListSetting;
import meteordevelopment.meteorclient.addons.MeteorAddon;
import meteordevelopment.meteorclient.commands.Commands;
import meteordevelopment.meteorclient.systems.modules.Category;
import meteordevelopment.meteorclient.systems.modules.Modules;
import org.slf4j.Logger;

public class OnFocusAddon extends MeteorAddon {
    public static final Logger LOG = LogUtils.getLogger();
    public static final Category CATEGORY = new Category("bdiev_");

    @Override
    public void onInitialize() {
        LOG.info("Initializing OnFocus addon");

        OrderedItemListSetting.registerWidget();

        Modules.get().add(new StayFocused());
        Modules.get().add(new AutoStripper());
        Modules.get().add(new CustomBlockEsp());
        Modules.get().add(new DeathMessageBlocker());
        Modules.get().add(new RandomPath());
        Modules.get().add(new TrailExplorer());
        Modules.get().add(new WhisperNotifier());
        Modules.get().add(new AutoMend());
        Modules.get().add(new AutoEat());
        Modules.get().add(new JoinLeaveMessages());
        Modules.get().add(new AreaExplorer());
        Modules.get().add(new ElytraKeeper());
        Modules.get().add(new ElytraControl());

        Commands.add(new RegroupMarkersCommand());
        Commands.add(new LootMarkersCommand());
    }

    @Override
    public void onRegisterCategories() {
        Modules.registerCategory(CATEGORY);
    }

    @Override
    public String getPackage() {
        return "dev.onfocus.addon";
    }
}
