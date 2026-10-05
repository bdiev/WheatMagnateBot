package dev.onfocus.addon.commands;

import com.mojang.brigadier.builder.LiteralArgumentBuilder;
import dev.onfocus.addon.modules.AreaExplorer;
import meteordevelopment.meteorclient.commands.Command;
import meteordevelopment.meteorclient.systems.modules.Modules;
import net.minecraft.command.CommandSource;

/** {@code .loot-markers}: loot markers for the items in Area Explorer's all-finds file. */
public class LootMarkersCommand extends Command {
    public LootMarkersCommand() {
        super("loot-markers", "Puts Area Explorer's loot markers on the items in its all-finds file of this server and dimension, one per pile. Piles marked already are skipped.");
    }

    @Override
    public void build(LiteralArgumentBuilder<CommandSource> builder) {
        builder.executes(context -> {
            boolean started = Modules.get().get(AreaExplorer.class).lootMarkersFromFile(result -> {
                info("Marked (highlight)%d(default) loot piles from the file, (highlight)%d(default) had markers already.", result.marked(), result.known());
                if (result.unknownItems() > 0) warning("%d items in the file have names this game doesn't know (another language?): skipped.", result.unknownItems());
            });
            if (!started) error("Needs a world and Area Explorer's all-finds-file on.");
            return SINGLE_SUCCESS;
        });
    }
}
