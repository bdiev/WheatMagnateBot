package dev.onfocus.addon.commands;

import com.mojang.brigadier.builder.LiteralArgumentBuilder;
import dev.onfocus.addon.modules.MapPainter;
import meteordevelopment.meteorclient.commands.Command;
import meteordevelopment.meteorclient.systems.modules.Modules;
import net.minecraft.command.CommandSource;

/** {@code .map-painter pos1|pos2|reset|area}: Map Painter's area corners where you are, drawing the area again, or what the area is now. */
public class MapPainterCommand extends Command {
    public MapPainterCommand() {
        super("map-painter", "Sets Map Painter's area corners where you are (pos1, then pos2 at the opposite corner), or shows the area.");
    }

    @Override
    public void build(LiteralArgumentBuilder<CommandSource> builder) {
        builder.then(literal("pos1").executes(context -> {
            Modules.get().get(MapPainter.class).setPos1();
            return SINGLE_SUCCESS;
        }));
        builder.then(literal("pos2").executes(context -> {
            Modules.get().get(MapPainter.class).setPos2();
            return SINGLE_SUCCESS;
        }));
        builder.then(literal("reset").executes(context -> {
            Modules.get().get(MapPainter.class).resetArea();
            return SINGLE_SUCCESS;
        }));
        builder.then(literal("area").executes(context -> {
            info(Modules.get().get(MapPainter.class).describeArea() + ".");
            return SINGLE_SUCCESS;
        }));
    }
}
