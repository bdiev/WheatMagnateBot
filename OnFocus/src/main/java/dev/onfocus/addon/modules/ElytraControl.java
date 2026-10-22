package dev.onfocus.addon.modules;

import dev.onfocus.addon.OnFocusAddon;
import meteordevelopment.meteorclient.events.entity.player.PlayerMoveEvent;
import meteordevelopment.meteorclient.events.packets.PacketEvent;
import meteordevelopment.meteorclient.events.world.TickEvent;
import meteordevelopment.meteorclient.mixininterface.IVec3d;
import meteordevelopment.meteorclient.settings.*;
import meteordevelopment.meteorclient.systems.modules.Module;
import meteordevelopment.orbit.EventHandler;
import net.minecraft.client.network.PlayerListEntry;
import net.minecraft.component.DataComponentTypes;
import net.minecraft.entity.EquipmentSlot;
import net.minecraft.entity.LivingEntity;
import net.minecraft.entity.effect.StatusEffects;
import net.minecraft.item.ItemStack;
import net.minecraft.network.packet.c2s.play.ClientCommandC2SPacket;
import net.minecraft.network.packet.s2c.play.PlayerPositionLookS2CPacket;
import net.minecraft.util.math.MathHelper;
import net.minecraft.util.math.Vec3d;

/**
 * Elytra flight in the style of RusherHack's Control mode: no fireworks, no gliding physics - the
 * player moves at a set speed where the movement keys point, climbs on jump, sinks on sneak and
 * hovers otherwise. Steering by yaw plus the forward key is all it needs, so Area Explorer can
 * drive it.
 * <p>
 * Durability saver: the server takes 1 durability on every 20th tick of an unbroken glide
 * ({@code LivingEntity.tickGliding}), and the tick count starts over whenever the player isn't
 * gliding for a tick. A START_FALL_FLYING sent while already gliding makes the server stop the
 * glide ({@code checkGliding} fails, so it calls {@code stopGliding}); the next one starts it again.
 * Closing and reopening like that every few ticks keeps the count from ever reaching 20, so the
 * elytra isn't worn at all. Movement is set by this module either way, so the client keeps flying
 * through the gap.
 * <p>
 * Auto speed: anticheats cap elytra speed, and the cap isn't always one number - plugins like
 * AnarchyExploitFixes allow more in old chunks than in new ones, and some scale it with TPS. Instead
 * of a fixed speed the module speeds up while the server takes the movement, and when it answers
 * with a setback (a position packet pulling the player back) it slows down a step, holds there and
 * later tries again. So it flies at whatever the server allows right now.
 */
public class ElytraControl extends Module {
    /** Ticks of the client showing no glide, past the expected round trip, before the server is taken to have stopped it. */
    private static final int LOST_GRACE_TICKS = 10;
    /** Ticks in the air before auto-open fires, so a jump off the ground isn't caught. */
    private static final int AUTO_OPEN_AIR_TICKS = 3;
    private static final int REOPEN_COOLDOWN_TICKS = 10;

    private final SettingGroup sgGeneral = settings.getDefaultGroup();
    private final SettingGroup sgAutoSpeed = settings.createGroup("Auto Speed");
    private final SettingGroup sgDurability = settings.createGroup("Durability");

    private final Setting<Double> horizontalSpeed = sgGeneral.add(new DoubleSetting.Builder()
        .name("speed")
        .description("Blocks per second when moving. Servers with movement checks may set you back if it's too high.")
        .defaultValue(40)
        .range(1, 200)
        .sliderRange(1, 100)
        .build()
    );

    private final Setting<Double> verticalSpeed = sgGeneral.add(new DoubleSetting.Builder()
        .name("climb-speed")
        .description("Blocks per second up (jump) and down (sneak).")
        .defaultValue(20)
        .range(1, 100)
        .sliderRange(1, 60)
        .build()
    );

    private final Setting<Double> fallSpeed = sgGeneral.add(new DoubleSetting.Builder()
        .name("idle-sink")
        .description("Blocks per second to sink while neither jump nor sneak is held. 0 = hover.")
        .defaultValue(0)
        .range(0, 20)
        .sliderRange(0, 4)
        .build()
    );

    private final Setting<Double> acceleration = sgGeneral.add(new DoubleSetting.Builder()
        .name("acceleration-time")
        .description("Seconds to get from standing still to full speed. 0 = instant.")
        .defaultValue(0.4)
        .range(0, 5)
        .sliderRange(0, 2)
        .build()
    );

    private final Setting<Boolean> pitchControl = sgGeneral.add(new BoolSetting.Builder()
        .name("pitch-control")
        .description("Looking up or down while moving forward climbs or sinks too. Leave off for Area Explorer, which only steers the yaw.")
        .defaultValue(false)
        .build()
    );

    private final Setting<Boolean> autoOpen = sgGeneral.add(new BoolSetting.Builder()
        .name("auto-open")
        .description("Opens the elytra by itself when you're falling - jump off something and it takes over.")
        .defaultValue(true)
        .build()
    );

    private final Setting<Boolean> autoSpeed = sgAutoSpeed.add(new BoolSetting.Builder()
        .name("auto-speed")
        .description("Starts at speed and keeps speeding up while the server accepts it; a setback slows it down a step. Finds the anticheat's limit by itself.")
        .defaultValue(false)
        .build()
    );

    private final Setting<Double> maxSpeed = sgAutoSpeed.add(new DoubleSetting.Builder()
        .name("max-speed")
        .description("Blocks per second auto speed never goes above.")
        .defaultValue(150)
        .range(1, 300)
        .sliderRange(20, 200)
        .visible(autoSpeed::get)
        .build()
    );

    private final Setting<Double> rampRate = sgAutoSpeed.add(new DoubleSetting.Builder()
        .name("ramp")
        .description("Blocks per second added every second of flight without a setback.")
        .defaultValue(2)
        .range(0.1, 20)
        .sliderRange(0.5, 10)
        .visible(autoSpeed::get)
        .build()
    );

    private final Setting<Double> backOff = sgAutoSpeed.add(new DoubleSetting.Builder()
        .name("back-off")
        .description("Blocks per second taken off the speed at each setback.")
        .defaultValue(4)
        .range(0.5, 50)
        .sliderRange(1, 20)
        .visible(autoSpeed::get)
        .build()
    );

    private final Setting<Integer> probeDelay = sgAutoSpeed.add(new IntSetting.Builder()
        .name("probe-delay")
        .description("Seconds to hold below the last setback speed before trying faster again - the limit may be higher further on (old chunks, better TPS). Doubles, up to 16 times, while setbacks keep coming at the same speed.")
        .defaultValue(20)
        .range(1, 600)
        .sliderRange(5, 120)
        .visible(autoSpeed::get)
        .build()
    );

    private final Setting<Boolean> durabilitySaver = sgDurability.add(new BoolSetting.Builder()
        .name("durability-saver")
        .description("Closes and reopens the elytra on the server every few ticks, before it counts a full second of gliding - which is when it takes durability. Works on vanilla/Paper servers; strict anticheats may not like it.")
        .defaultValue(true)
        .build()
    );

    private final Setting<Integer> resetInterval = sgDurability.add(new IntSetting.Builder()
        .name("reset-interval")
        .description("Ticks of gliding between resets. Durability is taken at 20, so lower leaves more room for lag.")
        .defaultValue(10)
        .range(2, 18)
        .sliderRange(2, 18)
        .visible(durabilitySaver::get)
        .build()
    );

    private final Setting<Integer> closedTicks = sgDurability.add(new IntSetting.Builder()
        .name("closed-ticks")
        .description("Ticks the elytra stays closed on the server. Raise it if durability still drops - packets sent in a lag burst land in the same server tick and the reset doesn't count.")
        .defaultValue(2)
        .range(1, 6)
        .sliderRange(1, 6)
        .visible(durabilitySaver::get)
        .build()
    );

    private final Setting<Boolean> report = sgDurability.add(new BoolSetting.Builder()
        .name("report")
        .description("When turned off, says how long you flew and how much durability that took.")
        .defaultValue(true)
        .build()
    );

    /** Whether the server has the player gliding, as far as the packets we sent say. */
    private boolean serverGliding;
    /** Ticks since the glide was (re)opened: our copy of the server's count. */
    private int glideTicks;
    /** Ticks the elytra has been closed for a reset, 0 when not resetting. */
    private int closedFor;
    private int noGlideTicks, airTicks, reopenCooldown;
    private double velX, velZ;
    /** Auto speed: the speed now, the last speed that drew a setback (0 = none yet), and ticks left holding below it. */
    private double autoSpeedNow, ceiling;
    private int holdTicks, setbacks;
    /** Setbacks in a row at the same limit; each one doubles the hold, so a known limit isn't hit every probe-delay. */
    private int sameCeiling;
    /** Vertical speed set last tick, blocks per tick. */
    private double velY;

    // Report
    private int flightTicks, durabilityLost, lastDamage = -1;

    public ElytraControl() {
        super(OnFocusAddon.CATEGORY, "elytra-control", "Elytra flight like RusherHack's Control mode - set speed, no fireworks - that can avoid wearing the elytra down.");
    }

    /** Whether flying with this module costs no elytra durability. */
    public boolean savesDurability() {
        return isActive() && durabilitySaver.get();
    }

    @Override
    public void onActivate() {
        serverGliding = mc.player != null && mc.player.isGliding();
        glideTicks = closedFor = noGlideTicks = airTicks = reopenCooldown = 0;
        velX = velZ = 0;
        if (mc.player != null) {
            Vec3d v = mc.player.getVelocity();
            velX = v.x;
            velZ = v.z;
        }
        flightTicks = durabilityLost = 0;
        lastDamage = -1;
        autoSpeedNow = horizontalSpeed.get();
        ceiling = 0;
        holdTicks = setbacks = sameCeiling = 0;
        velY = 0;
    }

    @Override
    public void onDeactivate() {
        if (!report.get() || flightTicks < 20) return;
        int seconds = flightTicks / 20;
        info("Flew (highlight)%dm %02ds(default), elytra lost (highlight)%d(default) durability (without the saver: about %d).",
            seconds / 60, seconds % 60, durabilityLost, seconds);
        if (autoSpeed.get()) info("Setbacks: (highlight)%d(default), last one at (highlight)%.0f(default) b/s.", setbacks, ceiling);
    }

    @Override
    public String getInfoString() {
        if (mc.player == null || !flying()) return null;
        String speed = "%.0f b/s".formatted(Math.hypot(velX, velZ) * 20);
        return autoSpeed.get() && ceiling > 0 ? speed + " (limit ~%.0f)".formatted(ceiling) : speed;
    }

    /** Whether this module is moving the player: gliding, or in the gap of a durability reset. */
    private boolean flying() {
        return serverGliding || closedFor > 0;
    }

    @EventHandler
    private void onTick(TickEvent.Pre event) {
        if (mc.player == null || mc.world == null) return;
        trackDurability();

        ItemStack chest = mc.player.getEquippedStack(EquipmentSlot.CHEST);
        if (!LivingEntity.canGlideWith(chest, EquipmentSlot.CHEST) || !canGlideHere()) {
            // Landed, in water, elytra gone or broken: the server stops the glide itself
            serverGliding = false;
            closedFor = 0;
            airTicks = 0;
            return;
        }
        airTicks++;
        if (reopenCooldown > 0) reopenCooldown--;

        if (closedFor > 0) {
            if (++closedFor > closedTicks.get()) open();
            return;
        }

        if (!serverGliding) {
            if (mc.player.isGliding()) {
                // Opened some other way - the vanilla jump press, Elytra Keeper
                serverGliding = true;
                glideTicks = 0;
            } else if (autoOpen.get() && reopenCooldown == 0 && airTicks >= AUTO_OPEN_AIR_TICKS && mc.player.getVelocity().y < 0) {
                open();
            }
            return;
        }

        flightTicks++;
        // The server's glide flag comes back to the client; if it says "not gliding" well after any reset of ours, it stopped us
        if (mc.player.isGliding()) noGlideTicks = 0;
        else if (++noGlideTicks > LOST_GRACE_TICKS + roundTripTicks()) {
            serverGliding = false;
            OnFocusAddon.LOG.info("[ElytraControl] Server stopped the glide");
            return;
        }

        if (durabilitySaver.get() && ++glideTicks >= resetInterval.get()) close();
        tickAutoSpeed();
    }

    /** Speeds up a little each tick of flying at full speed, unless holding after a setback. */
    private void tickAutoSpeed() {
        if (!autoSpeed.get()) return;
        if (holdTicks > 0) {
            holdTicks--;
            return;
        }
        // Only while actually going that fast, or standing still would wind it up with nothing tested
        if (Math.hypot(velX, velZ) * 20 < autoSpeedNow - 1) return;
        autoSpeedNow = Math.min(maxSpeed.get(), autoSpeedNow + rampRate.get() / 20);
    }

    /** Blocks per second this module flies at. */
    private double speed() {
        return autoSpeed.get() ? autoSpeedNow : horizontalSpeed.get();
    }

    /** A position packet while flying is the anticheat pulling us back. Comes on the network thread. */
    @EventHandler
    private void onPacket(PacketEvent.Receive event) {
        if (event.packet instanceof PlayerPositionLookS2CPacket) mc.execute(this::onSetback);
    }

    private void onSetback() {
        if (mc.player == null || !flying()) return;
        setbacks++;
        double was = Math.hypot(velX, velZ) * 20;
        // Below full speed the horizontal speed isn't what was refused: climbing or sinking too fast is checked on its own
        boolean horizontal = was >= speed() - 1;
        OnFocusAddon.LOG.info("[ElytraControl] Setback at {} b/s (target {}), vertical {} b/s, y {}{}", "%.1f".formatted(was), "%.1f".formatted(speed()),
            "%.1f".formatted(velY * 20), "%.1f".formatted(mc.player.getY()), horizontal ? "" : " - not at full speed, kept");
        if (!autoSpeed.get() || !horizontal) return;
        sameCeiling = ceiling > 0 && Math.abs(autoSpeedNow - ceiling) < backOff.get() ? Math.min(sameCeiling + 1, 4) : 0;
        ceiling = autoSpeedNow;
        autoSpeedNow = Math.max(1, autoSpeedNow - backOff.get());
        holdTicks = probeDelay.get() * 20 << sameCeiling;
        // Carry on from the new speed rather than the one that was refused
        if (was > autoSpeedNow) {
            velX *= autoSpeedNow / was;
            velZ *= autoSpeedNow / was;
        }
    }

    /** Asks the server to stop the glide: START_FALL_FLYING while gliding does that. */
    private void close() {
        sendFallFlying();
        serverGliding = false;
        closedFor = 1;
    }

    private void open() {
        sendFallFlying();
        mc.player.startGliding();
        serverGliding = true;
        closedFor = 0;
        glideTicks = 0;
        reopenCooldown = REOPEN_COOLDOWN_TICKS;
    }

    private void sendFallFlying() {
        mc.player.networkHandler.sendPacket(new ClientCommandC2SPacket(mc.player, ClientCommandC2SPacket.Mode.START_FALL_FLYING));
    }

    /** What the server's canGlide / checkGliding need besides the elytra. */
    private boolean canGlideHere() {
        return !mc.player.isOnGround() && !mc.player.hasVehicle() && !mc.player.isTouchingWater()
            && !mc.player.hasStatusEffect(StatusEffects.LEVITATION) && !mc.player.getAbilities().flying;
    }

    /** Ticks for the glide flag to get to the server and back. */
    private int roundTripTicks() {
        PlayerListEntry entry = mc.getNetworkHandler() != null ? mc.getNetworkHandler().getPlayerListEntry(mc.player.getUuid()) : null;
        return entry == null ? 0 : MathHelper.ceil(entry.getLatency() / 50.0) + closedTicks.get();
    }

    private void trackDurability() {
        ItemStack chest = mc.player.getEquippedStack(EquipmentSlot.CHEST);
        int damage = chest.contains(DataComponentTypes.GLIDER) ? chest.getDamage() : -1;
        // A small rise on the same elytra is wear; anything else is a swap
        if (lastDamage >= 0 && damage > lastDamage && damage - lastDamage <= 3) durabilityLost += damage - lastDamage;
        lastDamage = damage;
    }

    @EventHandler
    private void onPlayerMove(PlayerMoveEvent event) {
        if (mc.player == null || !flying()) return;

        double yaw = Math.toRadians(mc.player.getYaw());
        // Minecraft's yaw: 0 faces +Z, 90 faces -X
        double fx = -Math.sin(yaw), fz = Math.cos(yaw);
        double forward = key(mc.options.forwardKey.isPressed()) - key(mc.options.backKey.isPressed());
        double strafe = key(mc.options.leftKey.isPressed()) - key(mc.options.rightKey.isPressed());
        double dx = fx * forward + fz * strafe, dz = fz * forward - fx * strafe;
        double len = Math.hypot(dx, dz);

        // Settings are in blocks per second, movement is per tick
        double speed = speed() / 20, sink = fallSpeed.get() / 20;
        double y;
        if (mc.options.jumpKey.isPressed()) y = verticalSpeed.get() / 20;
        else if (mc.options.sneakKey.isPressed()) y = -verticalSpeed.get() / 20;
        else y = -sink;

        if (pitchControl.get() && forward > 0 && y == -sink) {
            double pitch = Math.toRadians(mc.player.getPitch());
            y = -Math.sin(pitch) * speed;
            speed *= Math.cos(pitch);
        }

        double targetX = len > 0 ? dx / len * speed : 0, targetZ = len > 0 ? dz / len * speed : 0;
        // Full speed reached in acceleration-time seconds
        double step = acceleration.get() > 0 ? speed() / 20 / (acceleration.get() * 20) : 0;
        if (step <= 0) {
            velX = targetX;
            velZ = targetZ;
        } else {
            double ex = targetX - velX, ez = targetZ - velZ, e = Math.hypot(ex, ez);
            if (e <= step) {
                velX = targetX;
                velZ = targetZ;
            } else {
                velX += ex / e * step;
                velZ += ez / e * step;
            }
        }

        ((IVec3d) event.movement).meteor$set(velX, y, velZ);
        mc.player.setVelocity(velX, y, velZ);
        velY = y;
    }

    private static double key(boolean pressed) {
        return pressed ? 1 : 0;
    }
}
