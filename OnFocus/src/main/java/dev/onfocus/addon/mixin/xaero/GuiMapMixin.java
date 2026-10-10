package dev.onfocus.addon.mixin.xaero;

import com.llamalad7.mixinextras.injector.wrapoperation.Operation;
import com.llamalad7.mixinextras.injector.wrapoperation.WrapOperation;
import dev.onfocus.addon.explore.Coverage;
import dev.onfocus.addon.explore.CoveragePlanner.Area;
import dev.onfocus.addon.explore.SectorTraversal;
import dev.onfocus.addon.modules.AreaExplorer;
import dev.onfocus.addon.xaero.ExploreRightClickOption;
import dev.onfocus.addon.xaero.SectorRightClickOption;
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
 * Adds "Explore" and "Rescan" to the world map's right-click menu while a chunk area is selected, and the
 * sector commands over a running Sectors grid. Keeps the area {@link AreaExplorer} is working on
 * highlighted on the map, with the ground it has flown over this run in a colour of its own.
 */
@Mixin(value = GuiMap.class, remap = false)
public abstract class GuiMapMixin {
    @Shadow private MapTileSelection mapTileSelection;
    @Shadow private RegistryKey<World> rightClickDim;
    @Shadow private MapProcessor mapProcessor;
    @Shadow private int rightClickX;
    @Shadow private int rightClickZ;

    @Inject(method = "getRightClickOptions", at = @At("RETURN"))
    private void onfocus$addExploreOption(CallbackInfoReturnable<ArrayList<RightClickOption>> cir) {
        ArrayList<RightClickOption> options = cir.getReturnValue();
        AreaExplorer explorer = Modules.get().get(AreaExplorer.class);
        for (AreaExplorer.SectorAction action : explorer.sectorActions(rightClickX, rightClickZ, rightClickDim)) {
            options.add(new SectorRightClickOption(options.size(), (IRightClickableElement) this, rightClickX, rightClickZ, action));
        }

        MapTileSelection selection = mapTileSelection;
        if (selection == null) return;
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
        SectorTraversal sectors = explorer.mapSectors(shown);
        if (area != null && sectors != null) {
            drawSectors(matrix, buffer, cameraX, cameraZ, area, sectors, explorer.mapColor(), explorer.mapSectorGaps());
        }
        original.call(matrices, buffer, cameraX, cameraZ, left, right, top, bottom, r1, g1, b1, a1, r2, g2, b2, a2);
    }

    /**
     * Above the coverage fills: finished sectors tinted green, deferred ones outlined orange and skipped
     * ones tinted red, each with its blank chunks; then the grid lines, the next sector dashed and the
     * current one in gold.
     */
    private static void drawSectors(Matrix4f matrix, VertexConsumer buffer, int cameraX, int cameraZ,
                                    Area area, SectorTraversal sectors, SettingColor color, List<int[]> gaps) {
        int minX = (area.minCX() << 4) - cameraX, maxX = ((area.maxCX() + 1) << 4) - cameraX;
        int minZ = (area.minCZ() << 4) - cameraZ, maxZ = ((area.maxCZ() + 1) << 4) - cameraZ;
        // Keep roughly one GUI pixel at different map zoom levels, capped for very distant views.
        double scale = Math.hypot(matrix.m00(), matrix.m01());
        int width = (int) Math.max(1, Math.min(sectors.size() * 2, Math.ceil(1 / Math.max(0.000001, scale))));
        for (int i = 0; i < sectors.total(); i++) {
            SectorTraversal.State state = sectors.state(i);
            if (state == SectorTraversal.State.OPEN || i == sectors.currentIndex()) continue;
            Area sector = sectors.sector(i);
            int x1 = (sector.minCX() << 4) - cameraX, x2 = ((sector.maxCX() + 1) << 4) - cameraX;
            int z1 = (sector.minCZ() << 4) - cameraZ, z2 = ((sector.maxCZ() + 1) << 4) - cameraZ;
            switch (state) {
                case COMPLETED -> MapRenderHelper.fillIntoExistingBuffer(matrix, buffer, x1, z1, x2, z2, 0.3f, 0.85f, 0.4f, 0.12f);
                case SKIPPED -> MapRenderHelper.fillIntoExistingBuffer(matrix, buffer, x1, z1, x2, z2, 1f, 0.25f, 0.2f, 0.18f);
                case DEFERRED -> outline(matrix, buffer, x1, z1, x2, z2, width * 2, 1f, 0.55f, 0.1f, 0.9f, false);
                default -> {}
            }
        }
        for (int[] r : gaps) {
            int index = sectors.indexOf(r[0], r[1]);
            float green = index >= 0 && sectors.state(index) == SectorTraversal.State.SKIPPED ? 0.2f : 0.5f;
            MapRenderHelper.fillIntoExistingBuffer(matrix, buffer,
                (r[0] << 4) - cameraX, (r[1] << 4) - cameraZ, ((r[2] + 1) << 4) - cameraX, ((r[3] + 1) << 4) - cameraZ,
                1f, green, 0.15f, 0.55f);
        }

        float red = color.r / 255f, green = color.g / 255f, blue = color.b / 255f;
        float alpha = Math.max(0.65f, color.a / 255f);
        // Grid lines on the grid's own origin (world-aligned for new runs), then the selection's edges
        for (int column = 1; column < sectors.columns(); column++) {
            int line = ((sectors.originX() + column * sectors.size()) << 4) - cameraX;
            MapRenderHelper.fillIntoExistingBuffer(matrix, buffer, line, minZ, Math.min(maxX, line + width), maxZ, red, green, blue, alpha);
        }
        for (int row = 1; row < sectors.rows(); row++) {
            int line = ((sectors.originZ() + row * sectors.size()) << 4) - cameraZ;
            MapRenderHelper.fillIntoExistingBuffer(matrix, buffer, minX, line, maxX, Math.min(maxZ, line + width), red, green, blue, alpha);
        }
        outline(matrix, buffer, minX, minZ, maxX, maxZ, width, red, green, blue, alpha, false);

        Area next = sectors.plannedNext();
        if (next != null) outline(matrix, buffer, (next.minCX() << 4) - cameraX, (next.minCZ() << 4) - cameraZ,
            ((next.maxCX() + 1) << 4) - cameraX, ((next.maxCZ() + 1) << 4) - cameraZ, width * 2, 0.4f, 0.9f, 1f, 0.95f, true);
        Area current = sectors.current();
        if (current != null) outline(matrix, buffer, (current.minCX() << 4) - cameraX, (current.minCZ() << 4) - cameraZ,
            ((current.maxCX() + 1) << 4) - cameraX, ((current.maxCZ() + 1) << 4) - cameraZ, width * 2, 1f, 0.8f, 0.2f, 0.95f, false);
    }

    /** A rectangle's border, inside it; dashed in eight dashes a side. */
    private static void outline(Matrix4f matrix, VertexConsumer buffer, int x1, int z1, int x2, int z2, int border,
                                float r, float g, float b, float a, boolean dashed) {
        border = Math.max(1, Math.min(border, Math.min(x2 - x1, z2 - z1) / 2));
        int stepX = dashed ? Math.max(2, (x2 - x1) / 8) : Math.max(1, x2 - x1);
        int stepZ = dashed ? Math.max(2, (z2 - z1) / 8) : Math.max(1, z2 - z1);
        int dashX = dashed ? stepX / 2 : stepX, dashZ = dashed ? stepZ / 2 : stepZ;
        for (int x = x1; x < x2; x += stepX) {
            int end = Math.min(x2, x + dashX);
            MapRenderHelper.fillIntoExistingBuffer(matrix, buffer, x, z1, end, z1 + border, r, g, b, a);
            MapRenderHelper.fillIntoExistingBuffer(matrix, buffer, x, z2 - border, end, z2, r, g, b, a);
        }
        for (int z = z1 + border; z < z2 - border; z += stepZ) {
            int end = Math.min(z2 - border, z + dashZ);
            MapRenderHelper.fillIntoExistingBuffer(matrix, buffer, x1, z, x1 + border, end, r, g, b, a);
            MapRenderHelper.fillIntoExistingBuffer(matrix, buffer, x2 - border, z, x2, end, r, g, b, a);
        }
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
