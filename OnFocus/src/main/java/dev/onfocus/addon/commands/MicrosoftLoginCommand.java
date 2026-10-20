package dev.onfocus.addon.commands;

import com.mojang.brigadier.builder.LiteralArgumentBuilder;
import dev.onfocus.addon.auth.MicrosoftLogin;
import dev.onfocus.addon.explore.SessionRefresh;
import meteordevelopment.meteorclient.commands.Command;
import net.minecraft.command.CommandSource;
import net.minecraft.util.Util;

import java.io.IOException;
import java.net.URI;

/**
 * {@code .ms-login}: logs in to Microsoft by device code, so an expired session can be refreshed
 * without anyone at the game. {@code status} shows the login kept, {@code forget} deletes it.
 */
public class MicrosoftLoginCommand extends Command {
    public MicrosoftLoginCommand() {
        super("ms-login", "Logs in to Microsoft with a code typed in at microsoft.com/link, and keeps the login so an expired session (\"Invalid session\") is refreshed by itself.");
    }

    @Override
    public void build(LiteralArgumentBuilder<CommandSource> builder) {
        builder.executes(context -> {
            boolean started = SessionRefresh.login(code -> {
                String link = "https://www.microsoft.com/link?otc=" + code.userCode();
                mc.keyboard.setClipboard(code.userCode());
                info("Open (highlight)%s(default) and enter the code (highlight)%s(default) (copied), then approve the login. The code lasts %d minutes.",
                    code.verificationUri(), code.userCode(), code.expiresInSeconds() / 60);
                try {
                    Util.getOperatingSystem().open(URI.create(link));
                } catch (RuntimeException ignored) {
                    // No browser here: the code works from any device
                }
            }, result -> {
                if (result.refreshed()) info("%s.", result.message());
                else error("%s", result.message());
            });
            if (!started) error("A login is already under way.");
            return SINGLE_SUCCESS;
        });
        builder.then(literal("status").executes(context -> {
            MicrosoftLogin.Saved saved = MicrosoftLogin.load();
            if (saved == null) info("No login kept: run .ms-login to make one.");
            else info("Login kept for (highlight)%s(default): its session is refreshed when a server says it's invalid.", saved.username());
            return SINGLE_SUCCESS;
        }));
        builder.then(literal("forget").executes(context -> {
            try {
                if (MicrosoftLogin.forget()) info("The kept login is deleted.");
                else info("No login was kept.");
            } catch (IOException e) {
                error("Couldn't delete the kept login: %s", e.getMessage());
            }
            return SINGLE_SUCCESS;
        }));
    }
}
