package dev.onfocus.addon.modules;

import meteordevelopment.meteorclient.gui.GuiTheme;
import meteordevelopment.meteorclient.gui.WidgetScreen;
import meteordevelopment.meteorclient.gui.utils.IScreenFactory;
import meteordevelopment.meteorclient.utils.misc.ICopyable;
import meteordevelopment.meteorclient.utils.misc.ISerializable;
import net.minecraft.nbt.NbtCompound;

import java.util.HashSet;
import java.util.Set;

/**
 * Backing value for the player-list settings of {@link DeathMessageBlocker} and
 * {@link JoinLeaveMessages} - a set of usernames. Stored as a single comma-joined string since usernames
 * can't contain commas, avoiding any dependency on NBT list APIs.
 */
public class BlockedPlayers implements ICopyable<BlockedPlayers>, ISerializable<BlockedPlayers>, IScreenFactory {
    public final Set<String> names = new HashSet<>();

    @Override
    public WidgetScreen createScreen(GuiTheme theme) {
        return new DeathMessageBlockerScreen(theme, this);
    }

    @Override
    public BlockedPlayers set(BlockedPlayers value) {
        names.clear();
        names.addAll(value.names);

        return this;
    }

    @Override
    public BlockedPlayers copy() {
        BlockedPlayers copy = new BlockedPlayers();
        copy.names.addAll(names);

        return copy;
    }

    @Override
    public NbtCompound toTag() {
        NbtCompound tag = new NbtCompound();
        tag.putString("names", String.join(",", names));

        return tag;
    }

    @Override
    public BlockedPlayers fromTag(NbtCompound tag) {
        names.clear();

        String joined = tag.getString("names");
        if (!joined.isEmpty()) {
            for (String name : joined.split(",")) {
                if (!name.isEmpty()) names.add(name);
            }
        }

        return this;
    }
}
