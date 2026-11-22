package dev.onfocus.addon.modules;

import meteordevelopment.meteorclient.gui.GuiTheme;
import meteordevelopment.meteorclient.gui.WindowScreen;
import meteordevelopment.meteorclient.gui.widgets.containers.WHorizontalList;
import meteordevelopment.meteorclient.gui.widgets.containers.WTable;
import meteordevelopment.meteorclient.gui.widgets.input.WTextBox;
import meteordevelopment.meteorclient.gui.widgets.pressable.WButton;
import meteordevelopment.meteorclient.gui.widgets.pressable.WMinus;

import java.util.ArrayList;
import java.util.List;

/**
 * Editor for custom death phrases. The text box on top adds whatever is typed. Below it are the
 * latest chat lines from selected players that were NOT hidden (most likely death messages with
 * unknown wording) - "Use" copies a suggested phrase from such a line into the text box, where it
 * can be trimmed before adding. The bottom table lists saved phrases with "-" to remove them.
 */
public class DeathPhrasesScreen extends WindowScreen {
    private static final int MAX_LINE_LENGTH = 90;

    private final DeathPhrases data;

    private final WTextBox input;
    private final WTable recentTable;
    private final WTable phrasesTable;

    public DeathPhrasesScreen(GuiTheme theme, DeathPhrases data) {
        super(theme, "Death Phrases");

        this.data = data;

        add(theme.label("Phrase (case-insensitive, matched after the player name):"));

        WHorizontalList inputRow = add(theme.horizontalList()).expandX().widget();
        input = inputRow.add(theme.textBox("")).minWidth(400).expandX().widget();
        input.setFocused(true);

        WButton addButton = inputRow.add(theme.button("Add")).widget();
        addButton.action = this::addTyped;

        add(theme.horizontalSeparator("Recent unhidden lines from selected players")).expandX();
        recentTable = add(theme.table()).expandX().widget();

        add(theme.horizontalSeparator("Phrases")).expandX();
        phrasesTable = add(theme.table()).expandX().widget();
    }

    @Override
    public void initWidgets() {
        fill();
    }

    private void addTyped() {
        String phrase = input.get().trim();
        if (phrase.isEmpty()) return;

        data.phrases.add(phrase);
        input.set("");
        fill();
    }

    private void fill() {
        recentTable.clear();
        phrasesTable.clear();

        List<DeathMessageBlocker.UnmatchedLine> recent = new ArrayList<>(DeathMessageBlocker.RECENT_UNMATCHED);
        for (int i = recent.size() - 1; i >= 0; i--) {
            DeathMessageBlocker.UnmatchedLine line = recent.get(i);

            String shown = line.text();
            if (shown.length() > MAX_LINE_LENGTH) shown = shown.substring(0, MAX_LINE_LENGTH - 3) + "...";
            recentTable.add(theme.label(shown)).expandCellX();

            WButton use = recentTable.add(theme.button("Use")).widget();
            use.action = () -> {
                input.set(DeathMessageBlocker.suggestPhrase(line.rest()));
                input.setFocused(true);
            };

            recentTable.row();
        }

        if (recentTable.cells.isEmpty()) {
            recentTable.add(theme.label("None yet - they appear when a selected player's line isn't hidden."));
            recentTable.row();
        }

        for (String phrase : data.phrases) {
            phrasesTable.add(theme.label(phrase)).expandCellX();

            WMinus remove = phrasesTable.add(theme.minus()).widget();
            remove.action = () -> {
                data.phrases.remove(phrase);
                fill();
            };

            phrasesTable.row();
        }

        if (phrasesTable.cells.isEmpty()) {
            phrasesTable.add(theme.label("None"));
            phrasesTable.row();
        }
    }
}
