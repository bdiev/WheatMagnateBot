package dev.onfocus.addon.explore;

import dev.onfocus.addon.auth.MicrosoftLogin;
import meteordevelopment.meteorclient.systems.accounts.Account;
import meteordevelopment.meteorclient.systems.accounts.Accounts;
import meteordevelopment.meteorclient.systems.accounts.types.MicrosoftAccount;
import meteordevelopment.meteorclient.utils.network.MeteorExecutor;
import net.minecraft.client.session.Session;

import java.io.IOException;
import java.util.Locale;
import java.util.Optional;
import java.util.UUID;
import java.util.function.Consumer;

import static meteordevelopment.meteorclient.MeteorClient.mc;

/**
 * A fresh Microsoft session when a server turns the old one away. The game's access token lasts
 * about a day; past that every join fails with "Invalid session" however often it's retried. The
 * login made with {@code .ms-login} (kept in onfocus/microsoft-login.json) is renewed for it; with
 * none for the player in game, a Microsoft account of theirs on Meteor's Accounts screen is.
 */
public final class SessionRefresh {
    /** A failed refresh (or no login to refresh from) is tried again this much later. */
    public static final long RETRY_MS = 5 * 60_000L;

    public record Result(boolean refreshed, String message) {}

    private static volatile boolean running;
    private static long lastAttemptAt;

    private SessionRefresh() {}

    /** Whether a disconnect reason means the session is no good, rather than the server being down or full. */
    public static boolean isInvalidSession(String reason) {
        if (reason == null) return false;
        String text = reason.toLowerCase(Locale.ROOT);
        return text.contains("invalid session") || text.contains("failed to verify username")
            || text.contains("multiplayer.disconnect.unverified_username") || text.contains("disconnect.loginfailedinfo.invalidsession");
    }

    /** A refresh or login is under way: connecting now would use the old session. */
    public static boolean running() {
        return running;
    }

    /** Whether a refresh may start now: none running, and the last one long enough ago. */
    public static boolean due(long now) {
        return !running && (lastAttemptAt == 0 || now - lastAttemptAt >= RETRY_MS);
    }

    /**
     * Refreshes the session of the player in game in the background; done hears how it went, on the
     * game's thread. False if one couldn't be started (one is running, or the last was too recent).
     */
    public static boolean start(Consumer<Result> done) {
        long now = System.currentTimeMillis();
        if (!due(now)) return false;
        lastAttemptAt = now;
        String username = mc.getSession().getUsername();
        MicrosoftLogin.Saved saved = MicrosoftLogin.load();
        if (saved != null && saved.username().equalsIgnoreCase(username)) {
            run(done, () -> {
                MicrosoftLogin.Tokens tokens = MicrosoftLogin.refresh(saved.refreshToken());
                MicrosoftLogin.Profile profile = MicrosoftLogin.minecraftProfile(tokens.accessToken());
                // The refresh token is replaced on each use: the new one has to be kept
                MicrosoftLogin.save(new MicrosoftLogin.Saved(profile.username(), profile.uuid(), tokens.refreshToken()));
                return profile;
            }, "Refreshed the Microsoft session for %s");
            return true;
        }
        MicrosoftAccount account = meteorAccount(username);
        if (account == null) {
            done.accept(new Result(false, ("No saved login for %s, so the session can't be refreshed: run .ms-login in game once "
                + "and later refreshes are automatic").formatted(username)));
            return true;
        }
        running = true;
        MeteorExecutor.execute(() -> {
            Result result;
            try {
                if (!account.fetchInfo()) result = new Result(false, "Meteor's saved Microsoft login for %s was refused: run .ms-login in game instead".formatted(username));
                else if (!account.login()) result = new Result(false, "Got a new Microsoft token for %s, but the game didn't take it".formatted(username));
                else {
                    Accounts.get().save();
                    result = new Result(true, "Refreshed the Microsoft session for %s (Meteor's account)".formatted(account.getUsername()));
                }
            } catch (RuntimeException e) {
                result = new Result(false, "Refreshing the session for %s failed: %s".formatted(username, e.getMessage()));
            }
            finish(done, result);
        });
        return true;
    }

    /**
     * A new login by device code ({@code .ms-login}): code gets the code to show, done how it went.
     * The game switches to the account logged in, and the login is kept for refreshing it later.
     */
    public static boolean login(Consumer<MicrosoftLogin.DeviceCode> code, Consumer<Result> done) {
        if (running) return false;
        run(done, () -> {
            MicrosoftLogin.DeviceCode deviceCode = MicrosoftLogin.requestCode();
            mc.execute(() -> code.accept(deviceCode));
            MicrosoftLogin.Tokens tokens = MicrosoftLogin.awaitApproval(deviceCode);
            MicrosoftLogin.Profile profile = MicrosoftLogin.minecraftProfile(tokens.accessToken());
            MicrosoftLogin.save(new MicrosoftLogin.Saved(profile.username(), profile.uuid(), tokens.refreshToken()));
            return profile;
        }, "Logged in as %s: the session now refreshes by itself when it runs out");
        return true;
    }

    private interface Step {
        MicrosoftLogin.Profile get() throws IOException, InterruptedException, MicrosoftLogin.LoginException;
    }

    /** Runs a login off the game's thread, then puts its session in the game on it. */
    private static void run(Consumer<Result> done, Step step, String success) {
        running = true;
        Thread thread = new Thread(() -> {
            try {
                MicrosoftLogin.Profile profile = step.get();
                mc.execute(() -> {
                    try {
                        Account.setSession(new Session(profile.username(), UUID.fromString(dashed(profile.uuid())), profile.accessToken(),
                            Optional.empty(), Optional.empty(), Session.AccountType.MSA));
                        running = false;
                        done.accept(new Result(true, success.formatted(profile.username())));
                    } catch (RuntimeException e) {
                        running = false;
                        done.accept(new Result(false, "Got a new Microsoft token for %s, but the game didn't take it: %s".formatted(profile.username(), e.getMessage())));
                    }
                });
            } catch (MicrosoftLogin.LoginException e) {
                finish(done, new Result(false, e.getMessage()));
            } catch (IOException e) {
                finish(done, new Result(false, "Couldn't reach Microsoft: " + e.getMessage()));
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                finish(done, new Result(false, "The login was interrupted"));
            } catch (RuntimeException e) {
                finish(done, new Result(false, "The login failed: " + e));
            }
        }, "OnFocus Microsoft login");
        thread.setDaemon(true);
        thread.start();
    }

    private static void finish(Consumer<Result> done, Result result) {
        mc.execute(() -> {
            running = false;
            done.accept(result);
        });
    }

    private static MicrosoftAccount meteorAccount(String username) {
        for (Account<?> candidate : Accounts.get()) {
            if (candidate instanceof MicrosoftAccount microsoft && microsoft.getUsername().equalsIgnoreCase(username)) return microsoft;
        }
        return null;
    }

    /** Minecraft's profile id comes without dashes. */
    static String dashed(String uuid) {
        if (uuid.length() != 32) return uuid;
        return uuid.substring(0, 8) + "-" + uuid.substring(8, 12) + "-" + uuid.substring(12, 16) + "-" + uuid.substring(16, 20) + "-" + uuid.substring(20);
    }
}
