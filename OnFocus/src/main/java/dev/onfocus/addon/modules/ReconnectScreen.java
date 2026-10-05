package dev.onfocus.addon.modules;

import net.minecraft.client.gui.DrawContext;
import net.minecraft.client.gui.screen.Screen;
import net.minecraft.client.gui.widget.ButtonWidget;
import net.minecraft.text.OrderedText;
import net.minecraft.text.Text;

import java.util.List;
import java.util.function.Supplier;

/**
 * Shown instead of the game's disconnect screen while {@link AreaExplorer} waits to reconnect:
 * when it will, why it was dropped, and how far the run got. Its lines are asked for every frame,
 * so the countdown runs on it.
 */
public class ReconnectScreen extends Screen {
    private static final int LINE_HEIGHT = 11;

    private final Supplier<List<Text>> lines;
    private final Runnable reconnectNow, stop;

    public ReconnectScreen(Supplier<List<Text>> lines, Runnable reconnectNow, Runnable stop) {
        super(Text.literal("Area Explorer - reconnecting"));
        this.lines = lines;
        this.reconnectNow = reconnectNow;
        this.stop = stop;
    }

    @Override
    protected void init() {
        int y = Math.min(height - 30, height / 2 + 60);
        addDrawableChild(ButtonWidget.builder(Text.literal("Reconnect now"), button -> reconnectNow.run())
            .dimensions(width / 2 - 154, y, 150, 20).build());
        addDrawableChild(ButtonWidget.builder(Text.literal("Stop exploring"), button -> stop.run())
            .dimensions(width / 2 + 4, y, 150, 20).build());
    }

    @Override
    public void render(DrawContext context, int mouseX, int mouseY, float delta) {
        super.render(context, mouseX, mouseY, delta);
        int y = Math.max(10, height / 2 - 80);
        context.drawCenteredTextWithShadow(textRenderer, title, width / 2, y, 0xFFFFFF);
        y += 2 * LINE_HEIGHT;
        for (Text line : lines.get()) {
            if (line.getString().isEmpty()) {
                y += LINE_HEIGHT / 2;
                continue;
            }
            for (OrderedText part : textRenderer.wrapLines(line, width - 40)) {
                context.drawCenteredTextWithShadow(textRenderer, part, width / 2, y, 0xFFFFFF);
                y += LINE_HEIGHT;
            }
        }
    }

    /** Esc would leave no screen at all while the module waits; Stop exploring is the way out. */
    @Override
    public boolean shouldCloseOnEsc() {
        return false;
    }
}
