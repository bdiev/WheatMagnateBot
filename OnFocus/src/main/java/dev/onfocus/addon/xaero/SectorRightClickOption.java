package dev.onfocus.addon.xaero;

import dev.onfocus.addon.modules.AreaExplorer;
import dev.onfocus.addon.modules.AreaExplorer.SectorAction;
import meteordevelopment.meteorclient.systems.modules.Modules;
import net.minecraft.client.MinecraftClient;
import net.minecraft.client.gui.screen.Screen;
import xaero.map.gui.IRightClickableElement;
import xaero.map.gui.dropdown.rightclick.RightClickOption;

/** World map right-click option for the Sectors run sector under the cursor: work it next, skip it or rescan it. */
public class SectorRightClickOption extends RightClickOption {
    private final int blockX, blockZ;
    private final SectorAction action;

    public SectorRightClickOption(int index, IRightClickableElement target, int blockX, int blockZ, SectorAction action) {
        super(switch (action) {
            case Next -> "Sector: work next";
            case Skip -> "Sector: skip";
            case Rescan -> "Sector: rescan";
        }, index, target);
        this.blockX = blockX;
        this.blockZ = blockZ;
        this.action = action;
    }

    @Override
    public void onAction(Screen screen) {
        MinecraftClient.getInstance().setScreen(null);
        Modules.get().get(AreaExplorer.class).sectorAction(blockX, blockZ, action);
    }
}
