package dev.onfocus.addon.modules;

import meteordevelopment.meteorclient.gui.GuiTheme;
import meteordevelopment.meteorclient.gui.WindowScreen;
import meteordevelopment.meteorclient.gui.widgets.containers.WHorizontalList;
import meteordevelopment.meteorclient.gui.widgets.containers.WTable;
import meteordevelopment.meteorclient.gui.widgets.containers.WVerticalList;
import meteordevelopment.meteorclient.gui.widgets.input.WTextBox;
import meteordevelopment.meteorclient.gui.widgets.pressable.WMinus;
import meteordevelopment.meteorclient.gui.widgets.pressable.WPlus;
import net.minecraft.client.network.PlayerListEntry;

import java.util.Comparator;
import java.util.TreeSet;
import java.util.regex.Pattern;

import static meteordevelopment.meteorclient.MeteorClient.mc;

/**
 * Two-column player picker: players currently on the server - plus anyone recently seen joining or
 * leaving - sit on the left, and clicking their "+" moves them to the "Selected" column on the right
 * (and back with "-"). Already-selected names who are no longer online stay listed in the Selected
 * column so they can still be removed. The "+" next to the search box adds whatever name is typed
 * there, for players who aren't listed at all.
 */
public class DeathMessageBlockerScreen extends WindowScreen {
    private static final Pattern USERNAME = Pattern.compile("[A-Za-z0-9_]{1,16}");

    private final BlockedPlayers data;

    private final WTextBox filter;
    private final WTable onlineTable;
    private final WTable blockedTable;

    private String filterText = "";

    public DeathMessageBlockerScreen(GuiTheme theme, BlockedPlayers data) {
        super(theme, "Select Players");

        this.data = data;

        WHorizontalList searchRow = add(theme.horizontalList()).expandX().widget();

        filter = searchRow.add(theme.textBox("")).minWidth(400).expandX().widget();
        filter.setFocused(true);
        filter.action = () -> {
            filterText = filter.get().trim();
            fill();
        };

        WPlus addTyped = searchRow.add(theme.plus()).widget();
        addTyped.action = () -> {
            String name = filter.get().trim();
            if (!USERNAME.matcher(name).matches()) return;

            data.names.add(name);
            filter.set("");
            filterText = "";
            fill();
        };

        WHorizontalList columns = add(theme.horizontalList()).expandX().widget();

        WVerticalList onlineColumn = columns.add(theme.verticalList()).expandCellX().top().widget();
        onlineColumn.add(theme.label("Online / recent"));
        onlineTable = onlineColumn.add(theme.table()).expandX().widget();

        WVerticalList blockedColumn = columns.add(theme.verticalList()).expandCellX().top().widget();
        blockedColumn.add(theme.label("Selected"));
        blockedTable = blockedColumn.add(theme.table()).expandX().widget();
    }

    @Override
    public void initWidgets() {
        fill();
    }

    private void fill() {
        onlineTable.clear();
        blockedTable.clear();

        TreeSet<String> names = new TreeSet<>(Comparator.comparing(String::toLowerCase));
        names.addAll(data.names);
        names.addAll(JoinLeaveMessages.RECENT);

        if (mc.getNetworkHandler() != null) {
            for (PlayerListEntry entry : mc.getNetworkHandler().getPlayerList()) {
                names.add(entry.getProfile().getName());
            }
        }

        String search = filterText.toLowerCase();

        for (String name : names) {
            if (!search.isEmpty() && !name.toLowerCase().contains(search)) continue;

            if (data.names.contains(name)) {
                blockedTable.add(theme.label(name)).expandCellX();

                WMinus remove = blockedTable.add(theme.minus()).widget();
                remove.action = () -> {
                    data.names.remove(name);
                    fill();
                };

                blockedTable.row();
            }
            else {
                onlineTable.add(theme.label(name)).expandCellX();

                WPlus add = onlineTable.add(theme.plus()).widget();
                add.action = () -> {
                    data.names.add(name);
                    fill();
                };

                onlineTable.row();
            }
        }

        if (onlineTable.cells.isEmpty()) {
            onlineTable.add(theme.label(mc.getNetworkHandler() == null ? "Not connected." : "No players."));
            onlineTable.row();
        }

        if (blockedTable.cells.isEmpty()) {
            blockedTable.add(theme.label("None"));
            blockedTable.row();
        }
    }
}
