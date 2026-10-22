package dev.onfocus.addon.mixin;

import com.llamalad7.mixinextras.injector.wrapoperation.Operation;
import com.llamalad7.mixinextras.injector.wrapoperation.WrapOperation;
import dev.onfocus.addon.OnFocusAddon;
import io.netty.buffer.ByteBuf;
import io.netty.channel.ChannelHandlerContext;
import io.netty.handler.codec.DecoderException;
import net.minecraft.network.handler.PacketInflater;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.Unique;
import org.spongepowered.asm.mixin.injection.At;

import java.util.List;
import java.util.zip.DataFormatException;

/**
 * Drops a compressed packet whose zlib data is corrupt instead of disconnecting. Some servers
 * (oldfrog.org during long elytra flights) now and then send one packet whose compressed body
 * is broken ("incorrect header check", "invalid distance too far back", "Badly compressed packet
 * - actual length ... does not match declared size"), and vanilla drops the whole connection for
 * it. The packet's frame length was already read by the splitter, so the bytes after it are
 * intact: losing one packet (almost always chunk data, which Area Explorer picks up again in its
 * sweep) is far cheaper than a kick and a reconnect.
 *
 * <p>Only the {@code inflate} call and the {@code add} of its result are wrapped, so the rest of
 * {@code decode} stays as it is: Meteor's own ASM transformer looks for the size checks in it and
 * fails the class load if they're gone. The inflater is still reset after a dropped packet, by
 * {@code decode} itself.
 *
 * <p>If packets keep failing back to back the stream itself is broken, so after
 * {@link #MAX_CONSECUTIVE_DROPS} in a row the error is let through and the client disconnects as before.
 */
@Mixin(PacketInflater.class)
public class PacketInflaterMixin {
    @Unique
    private static final int MAX_CONSECUTIVE_DROPS = 8;

    @Unique
    private int consecutiveDrops;

    @Unique
    private long totalDrops;

    /** The inflated packet, or null when its compressed data is corrupt and it's dropped. */
    @WrapOperation(method = "decode", at = @At(value = "INVOKE", target = "Lnet/minecraft/network/handler/PacketInflater;inflate(Lio/netty/channel/ChannelHandlerContext;I)Lio/netty/buffer/ByteBuf;"))
    private ByteBuf dropCorruptPacket(PacketInflater self, ChannelHandlerContext ctx, int expectedSize, Operation<ByteBuf> original) {
        try {
            ByteBuf inflated = original.call(self, ctx, expectedSize);
            consecutiveDrops = 0;
            return inflated;
        } catch (RuntimeException e) {
            if (!isCorruptPayload(e) || consecutiveDrops >= MAX_CONSECUTIVE_DROPS) throw e;
            drop(e);
            return null;
        } catch (Exception e) {
            // DataFormatException: inflate declares it, the wrapper's Operation hides it
            if (!isCorruptPayload(e) || consecutiveDrops >= MAX_CONSECUTIVE_DROPS) throw new DecoderException(e);
            drop(e);
            return null;
        }
    }

    @WrapOperation(method = "decode", at = @At(value = "INVOKE", target = "Ljava/util/List;add(Ljava/lang/Object;)Z", ordinal = 1))
    private boolean skipDroppedPacket(List<Object> out, Object packet, Operation<Boolean> original) {
        return packet != null && original.call(out, packet);
    }

    @Unique
    private void drop(Exception e) {
        consecutiveDrops++;
        totalDrops++;
        OnFocusAddon.LOG.warn("Dropped a corrupt compressed packet instead of disconnecting ({} in a row, {} this connection): {}",
            consecutiveDrops, totalDrops, e.toString());
    }

    @Unique
    private static boolean isCorruptPayload(Exception e) {
        if (e instanceof DataFormatException) return true;
        return e instanceof DecoderException && e.getMessage() != null && e.getMessage().startsWith("Badly compressed packet - actual length");
    }
}
