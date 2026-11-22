package dev.onfocus.addon.modules;

import meteordevelopment.meteorclient.gui.GuiTheme;
import meteordevelopment.meteorclient.gui.WidgetScreen;
import meteordevelopment.meteorclient.gui.utils.IScreenFactory;
import meteordevelopment.meteorclient.utils.misc.ICopyable;
import meteordevelopment.meteorclient.utils.misc.ISerializable;
import net.minecraft.nbt.NbtCompound;

import java.util.LinkedHashSet;
import java.util.Set;

/**
 * Backing value for {@link DeathMessageBlocker}'s custom death phrases, edited through
 * {@link DeathPhrasesScreen}. Stored as one newline-joined string: the GUI text box can't produce
 * newlines, and this avoids any dependency on NBT list APIs (same approach as {@link BlockedPlayers}).
 */
public class DeathPhrases implements ICopyable<DeathPhrases>, ISerializable<DeathPhrases>, IScreenFactory {
    public final Set<String> phrases = new LinkedHashSet<>();

    @Override
    public WidgetScreen createScreen(GuiTheme theme) {
        return new DeathPhrasesScreen(theme, this);
    }

    @Override
    public DeathPhrases set(DeathPhrases value) {
        phrases.clear();
        phrases.addAll(value.phrases);

        return this;
    }

    @Override
    public DeathPhrases copy() {
        DeathPhrases copy = new DeathPhrases();
        copy.phrases.addAll(phrases);

        return copy;
    }

    @Override
    public NbtCompound toTag() {
        NbtCompound tag = new NbtCompound();
        tag.putString("phrases", String.join("\n", phrases));

        return tag;
    }

    @Override
    public DeathPhrases fromTag(NbtCompound tag) {
        phrases.clear();

        String joined = tag.getString("phrases");
        if (!joined.isEmpty()) {
            for (String phrase : joined.split("\n")) {
                if (!phrase.isBlank()) phrases.add(phrase.trim());
            }
        }

        return this;
    }
}
