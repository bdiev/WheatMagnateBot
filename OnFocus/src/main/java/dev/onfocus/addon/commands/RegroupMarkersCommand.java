package dev.onfocus.addon.commands;

import com.mojang.brigadier.builder.LiteralArgumentBuilder;
import dev.onfocus.addon.modules.AreaExplorer;
import meteordevelopment.meteorclient.commands.Command;
import meteordevelopment.meteorclient.systems.modules.Modules;
import net.minecraft.command.CommandSource;

/** {@code .regroup-markers}: Area Explorer's markers from before the groups, into their groups' Xaero sets; old names made current. */
public class RegroupMarkersCommand extends Command {
    public RegroupMarkersCommand() {
        super("regroup-markers", "Moves Area Explorer's earlier markers into their groups' Xaero waypoint sets (Bases, End Portals...), in every dimension of this server, and renames old Shulker Box markers to Placed Shulker Box.");
    }

    @Override
    public void build(LiteralArgumentBuilder<CommandSource> builder) {
        builder.executes(context -> {
            int moved = Modules.get().get(AreaExplorer.class).regroupMarkers();
            if (moved < 0) error("Needs Xaero's Minimap, a world, and Area Explorer's marker-target on Xaero.");
            else if (moved == 0) info("Nothing to move or rename: the markers are in their groups already.");
            else info("Moved or renamed (highlight)%d(default) markers.", moved);
            return SINGLE_SUCCESS;
        });
    }
}
