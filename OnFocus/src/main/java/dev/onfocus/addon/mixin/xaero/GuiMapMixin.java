package dev.onfocus.addon.mixin.xaero;

import com.llamalad7.mixinextras.injector.wrapoperation.Operation;
import com.llamalad7.mixinextras.injector.wrapoperation.WrapOperation;
import dev.onfocus.addon.explore.Coverage;
import dev.onfocus.addon.explore.CoveragePlanner.Area;
import dev.onfocus.addon.modules.AreaExplorer;
import dev.onfocus.addon.xaero.ExploreRightClickOption;
import meteordevelopment.meteorclient.systems.modules.Modules;
import meteordevelopment.meteorclient.utils.render.color.SettingColor;
import net.minecraft.client.render.VertexConsumer;
import net.minecraft.client.util.math.MatrixStack;
import net.minecraft.registry.RegistryKey;
import net.minecraft.world.World;
import org.joml.Matrix4f;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.Shadow;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfoReturnable;
import xaero.map.MapProcessor;
import xaero.map.graphics.MapRenderHelper;
import xaero.map.gui.GuiMap;
import xaero.map.gui.IRightClickableElement;
import xaero.map.gui.MapTileSelection;
import xaero.map.gui.dropdown.rightclick.RightClickOption;

import java.util.ArrayList;
import java.util.List;

/**
 * Adds "Explore" and "Rescan" to the world map's right-click menu while a chunk area is selected, and keeps the
 * area {@link AreaExplorer} is working on highlighted on the map, with the ground it has flown over
 * this run in a colour of its own.
 */
@Mixin(value = GuiMap.class, remap = false)
public abstract class GuiMapMixin {
    @Shadow private MapTileSelection mapTileSelection;
    @Shadow private RegistryKey<World> rightClickDim;
    @Shadow private MapProcessor mapProcessor;

    @Inject(method = "getRightClickOptions", at = @At("RETURN"))
    private void onfocus$addExploreOption(CallbackInfoReturnable<ArrayList<RightClickOption>> cir) {
        MapTileSelection selection = mapTileSelection;
        if (selection == null) return;

        ArrayList<RightClickOption> options = cir.getReturnValue();
        for (boolean rescan : new boolean[]{false, true}) {
            options.add(new ExploreRightClickOption(
                options.size(), (IRightClickableElement) this,
                selection.getLeft(), selection.getTop(), selection.getRight(), selection.getBottom(),
                rightClickDim, rescan
            ));
        }
    }

    /** Drawn just before the hovered-chunk highlight (the first one), in the same map space, so the hover stays on top. */
    @WrapOperation(method = "render", at = @At(value = "INVOKE", target = "Lxaero/map/graphics/MapRenderHelper;renderDynamicHighlight(Lnet/minecraft/client/util/math/MatrixStack;Lnet/minecraft/client/render/VertexConsumer;IIIIIIFFFFFFFF)V", ordinal = 0))
    private void onfocus$highlightExploreArea(MatrixStack matrices, VertexConsumer buffer, int cameraX, int cameraZ,
                                              int left, int right, int top, int bottom,
                                              float r1, float g1, float b1, float a1, float r2, float g2, float b2, float a2,
                                              Operation<Void> original) {
        RegistryKey<World> shown = mapProcessor.getMapWorld() == null ? null : mapProcessor.getMapWorld().getCurrentDimensionId();
        AreaExplorer explorer = Modules.get().get(AreaExplorer.class);
        Area area = explorer.mapHighlight(shown);
        if (area != null) {
            SettingColor c = explorer.mapColor();
            MapRenderHelper.renderDynamicHighlight(matrices, buffer, cameraX, cameraZ,
                area.minCX() << 4, (area.maxCX() + 1) << 4, area.minCZ() << 4, (area.maxCZ() + 1) << 4,
                c.r / 255f, c.g / 255f, c.b / 255f, Math.min(1f, c.a / 255f * 2.5f),
                c.r / 255f, c.g / 255f, c.b / 255f, c.a / 255f);
        }
        var matrix = matrices.peek().getPositionMatrix();
        // Ground scanned on earlier runs, under this run's: all of it at once, so overlaps aren't darker
        fill(matrix, buffer, cameraX, cameraZ, explorer.mapTerritoryRectangles(shown), explorer.territoryColor());
        Coverage flown = explorer.mapCoverage(shown);
        if (flown != null) fill(matrix, buffer, cameraX, cameraZ, flown.rectangles(), explorer.flownColor());
        original.call(matrices, buffer, cameraX, cameraZ, left, right, top, bottom, r1, g1, b1, a1, r2, g2, b2, a2);
    }

    /** Rectangles of chunks, filled without borders: strips side by side read as one patch. */
    private static void fill(Matrix4f matrix, VertexConsumer buffer, int cameraX, int cameraZ, List<int[]> rectangles, SettingColor c) {
        for (int[] r : rectangles) {
            MapRenderHelper.fillIntoExistingBuffer(matrix, buffer,
                (r[0] << 4) - cameraX, (r[1] << 4) - cameraZ, ((r[2] + 1) << 4) - cameraX, ((r[3] + 1) << 4) - cameraZ,
                c.r / 255f, c.g / 255f, c.b / 255f, c.a / 255f);
        }
    }
}
