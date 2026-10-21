package dev.onfocus.addon.mixin;

import com.llamalad7.mixinextras.injector.wrapmethod.WrapMethod;
import com.llamalad7.mixinextras.injector.wrapoperation.Operation;
import dev.onfocus.addon.OnFocusAddon;
import io.netty.buffer.ByteBuf;
import io.netty.channel.ChannelHandlerContext;
import io.netty.handler.codec.DecoderException;
import net.minecraft.network.handler.PacketInflater;
import org.spongepowered.asm.mixin.Final;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.Shadow;
import org.spongepowered.asm.mixin.Unique;

import java.util.List;
import java.util.zip.DataFormatException;
import java.util.zip.Inflater;

/**
 * Drops a compressed packet whose zlib data is corrupt instead of disconnecting. Some servers
 * (oldfrog.org during long elytra flights) now and then send one packet whose compressed body
 * is broken ("incorrect header check", "invalid distance too far back", "Badly compressed packet
 * - actual length ... does not match declared size"), and vanilla drops the whole connection for
 * it. The packet's frame length was already read by the splitter, so the bytes after it are
 * intact: losing one packet (almost always chunk data, which Area Explorer picks up again in its
 * sweep) is far cheaper than a kick and a reconnect.
 *
 * <p>If packets keep failing back to back the stream itself is broken, so after
 * {@link #MAX_CONSECUTIVE_DROPS} in a row the error is let through and the client disconnects as before.
 */
@Mixin(PacketInflater.class)
public class PacketInflaterMixin {
    @Unique
    private static final int MAX_CONSECUTIVE_DROPS = 8;

    @Shadow
    @Final
    private Inflater inflater;

    @Unique
    private int consecutiveDrops;

    @Unique
    private long totalDrops;

    @WrapMethod(method = "decode")
    private void dropCorruptPacket(ChannelHandlerContext ctx, ByteBuf buf, List<Object> out, Operation<Void> original) throws Exception {
        try {
            original.call(ctx, buf, out);
            consecutiveDrops = 0;
        } catch (Exception e) {
            if (!isCorruptPayload(e) || consecutiveDrops >= MAX_CONSECUTIVE_DROPS) throw e;

            // Vanilla only resets the inflater after a successful packet; a failed one leaves its state behind.
            inflater.reset();
            buf.skipBytes(buf.readableBytes());
            consecutiveDrops++;
            totalDrops++;
            OnFocusAddon.LOG.warn("Dropped a corrupt compressed packet instead of disconnecting ({} in a row, {} this connection): {}",
                consecutiveDrops, totalDrops, e.toString());
        }
    }

    @Unique
    private static boolean isCorruptPayload(Exception e) {
        if (e instanceof DataFormatException) return true;
        return e instanceof DecoderException && e.getMessage() != null && e.getMessage().startsWith("Badly compressed packet - actual length");
    }
}
