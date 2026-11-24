package dev.onfocus.addon.modules;

import dev.onfocus.addon.OnFocusAddon;
import dev.onfocus.addon.xaero.XaeroWaypoints;
import meteordevelopment.meteorclient.MeteorClient;
import meteordevelopment.meteorclient.events.game.GameLeftEvent;
import meteordevelopment.meteorclient.events.game.ReceiveMessageEvent;
import meteordevelopment.meteorclient.events.render.Render2DEvent;
import meteordevelopment.meteorclient.events.world.TickEvent;
import meteordevelopment.meteorclient.systems.waypoints.Waypoint;
import meteordevelopment.meteorclient.systems.waypoints.Waypoints;
import meteordevelopment.meteorclient.utils.player.PlayerUtils;
import meteordevelopment.orbit.EventHandler;
import net.fabricmc.loader.api.FabricLoader;
import net.minecraft.util.Identifier;
import net.minecraft.util.math.BlockPos;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Properties;
import java.util.function.Supplier;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import static meteordevelopment.meteorclient.MeteorClient.mc;

final class PearlReloadReminder {
    private static final String WAYPOINT_NAME = "Pearl Hatch";
    private static final String WAYPOINT_SET = "Pearl Loader";
    private static final String CHECK_SUCCESS = "Your ender pearl is set. Whisper \"load\" when you need it.";
    private static final Pattern HATCH = Pattern.compile("([a-z0-9_.-]+:[a-z0-9_./-]+) (-?\\d{1,10}) (-?\\d{1,10}) (-?\\d{1,10})");
    private static final Pattern RELOAD = Pattern.compile(" \\[Pearl hatch: (" + HATCH.pattern() + ")\\]$");

    private record Hatch(Identifier dimension, BlockPos pos) {
        static Hatch parse(String value) {
            Matcher match = HATCH.matcher(value);
            if (!match.matches()) return null;
            try {
                return new Hatch(Identifier.of(match.group(1)), new BlockPos(
                    Integer.parseInt(match.group(2)), Integer.parseInt(match.group(3)), Integer.parseInt(match.group(4))));
            } catch (NumberFormatException e) {
                return null;
            }
        }
    }

    private final Supplier<String> botName;
    private final Supplier<String> loaderName;
    private final Path file = MeteorClient.FOLDER.toPath().resolve("onfocus-pearl-reminders.properties");
    private Properties saved;
    private String scope;
    private Hatch hatch;
    private boolean waypointReady;

    PearlReloadReminder(Supplier<String> botName, Supplier<String> loaderName) {
        this.botName = botName;
        this.loaderName = loaderName;
    }

    @EventHandler
    private void onReceiveMessage(ReceiveMessageEvent event) {
        Matcher whisper = PearlLoad.WHISPER_PATTERN.matcher(event.getMessage().getString());
        if (!whisper.matches() || !whisper.group(1).equalsIgnoreCase(loaderName.get().trim())) return;
        if (!loadScope()) return;

        String text = whisper.group(2).trim();
        Matcher reload = RELOAD.matcher(text);
        if (reload.find()) {
            String value = reload.group(1);
            Hatch next = Hatch.parse(value);
            if (next == null) return;
            hatch = next;
            waypointReady = false;
            saved.setProperty(scope, value);
        } else if (hatch != null && text.equals(CHECK_SUCCESS)) {
            hatch = null;
            saved.remove(scope);
        } else {
            return;
        }
        save();
    }

    @EventHandler
    private void onTick(TickEvent.Post event) {
        if (loadScope() && hatch != null && !waypointReady && mc.world != null) {
            waypointReady = ensureWaypoint(hatch);
        }
    }

    @EventHandler
    private void onGameLeft(GameLeftEvent event) {
        scope = null;
        hatch = null;
        waypointReady = false;
    }

    @EventHandler
    private void onRender(Render2DEvent event) {
        if (hatch == null || mc.player == null || mc.options.hudHidden) return;
        BlockPos pos = hatch.pos();
        String hint = "Replace pearl at " + pos.getX() + ", " + pos.getY() + ", " + pos.getZ();
        String check = "Verify: /w " + botName.get().trim() + " check";
        int y = event.screenHeight - 64;
        event.drawContext.drawCenteredTextWithShadow(mc.textRenderer, hint, event.screenWidth / 2, y, 0xFFFFD066);
        event.drawContext.drawCenteredTextWithShadow(mc.textRenderer, check, event.screenWidth / 2, y + 11, 0xFFFFFFFF);
    }

    private boolean loadScope() {
        if (scope != null) return true;
        if (mc.player == null || mc.getCurrentServerEntry() == null) return false;
        if (saved == null) {
            saved = new Properties();
            if (Files.exists(file)) {
                try (var input = Files.newInputStream(file)) {
                    saved.load(input);
                } catch (IOException | IllegalArgumentException e) {
                    OnFocusAddon.LOG.warn("Couldn't read Pearl Loader reminders", e);
                }
            }
        }
        scope = mc.getCurrentServerEntry().address.trim().toLowerCase(Locale.ROOT) + "|" + mc.player.getUuid();
        hatch = Hatch.parse(saved.getProperty(scope, ""));
        return true;
    }

    private void save() {
        Path temp = file.resolveSibling(file.getFileName() + ".tmp");
        try {
            Files.createDirectories(file.getParent());
            try (var output = Files.newOutputStream(temp)) {
                saved.store(output, null);
            }
            Files.move(temp, file, StandardCopyOption.REPLACE_EXISTING);
        } catch (IOException e) {
            OnFocusAddon.LOG.warn("Couldn't save Pearl Loader reminders", e);
        }
    }

    private boolean ensureWaypoint(Hatch hatch) {
        if (!hatch.dimension().equals(mc.world.getRegistryKey().getValue())) return false;
        BlockPos pos = hatch.pos();
        FabricLoader loader = FabricLoader.getInstance();
        if (loader.isModLoaded("xaerominimap") || loader.isModLoaded("xaerobetterpvp")) {
            if (!XaeroWaypoints.isReady()) return false;
            String dimension = hatch.dimension().getPath();
            boolean exists = XaeroWaypoints.allOnServer().stream().anyMatch(waypoint ->
                waypoint.dimension().equals(dimension) && waypoint.set().equals(WAYPOINT_SET)
                    && waypoint.name().equals(WAYPOINT_NAME)
                    && waypoint.x() == pos.getX() && waypoint.y() == pos.getY() && waypoint.z() == pos.getZ());
            return exists || XaeroWaypoints.addAllIn(dimension, Map.of(WAYPOINT_SET, List.of(
                new XaeroWaypoints.NewWaypoint(WAYPOINT_NAME, "P", pos.getX(), pos.getY(), pos.getZ(), 0x37DCC9))), false);
        }

        var dimension = PlayerUtils.getDimension();
        for (Waypoint waypoint : Waypoints.get()) {
            if (waypoint.name.get().equals(WAYPOINT_NAME) && waypoint.dimension.get() == dimension
                && waypoint.getPos().equals(pos)) return true;
        }
        Waypoints.get().add(new Waypoint.Builder().name(WAYPOINT_NAME).pos(pos).dimension(dimension).build());
        return true;
    }
}
