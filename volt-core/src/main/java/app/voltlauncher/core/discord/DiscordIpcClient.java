package app.voltlauncher.core.discord;

import org.json.JSONObject;

import java.io.Closeable;
import java.io.IOException;
import java.io.RandomAccessFile;
import java.net.StandardProtocolFamily;
import java.net.UnixDomainSocketAddress;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.channels.SocketChannel;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/**
 * Speaks Discord's local IPC protocol.
 *
 * <p>Discord exposes rich presence through a socket the desktop client opens next to itself —
 * a Unix domain socket on Linux and macOS, a named pipe on Windows — rather than over the network,
 * so no library or account token is involved. Frames are
 * {@code [opcode:int32-le][length:int32-le][utf-8 json]}.
 */
public final class DiscordIpcClient implements Closeable {

    private static final int OP_HANDSHAKE = 0;
    private static final int OP_FRAME = 1;
    private static final int OP_CLOSE = 2;
    private static final int OP_PING = 3;
    private static final int OP_PONG = 4;

    /** Discord numbers its sockets, and which one is free depends on how many clients are open. */
    private static final int MAX_SOCKET_INDEX = 10;
    private static final int MAX_FRAME_BYTES = 64 * 1024;

    private final Connection connection;

    private DiscordIpcClient(Connection connection) {
        this.connection = connection;
    }

    /**
     * Connects to a running Discord client and completes the handshake.
     *
     * @return a connected client, or {@code null} when Discord is not running — which is the
     *         normal case, not an error worth surfacing
     */
    public static DiscordIpcClient connect(String applicationId) {
        if (applicationId == null || applicationId.isBlank()) return null;

        for (Path candidate : candidateSockets()) {
            Connection connection = open(candidate);
            if (connection == null) continue;
            DiscordIpcClient client = new DiscordIpcClient(connection);
            try {
                client.send(OP_HANDSHAKE, new JSONObject().put("v", 1).put("client_id", applicationId));
                JSONObject response = client.receive();
                // The handshake answers with a READY event; anything else means Discord refused
                // the application id and the connection is useless.
                if (response != null && !"ERROR".equals(response.optString("evt", ""))) {
                    return client;
                }
                client.close();
            } catch (IOException e) {
                client.close();
            }
        }
        return null;
    }

    /** Publishes an activity. A {@code null} activity clears whatever is currently shown. */
    public void setActivity(JSONObject activity) throws IOException {
        JSONObject args = new JSONObject()
                .put("pid", ProcessHandle.current().pid())
                .put("activity", activity == null ? JSONObject.NULL : activity);

        send(OP_FRAME, new JSONObject()
                .put("cmd", "SET_ACTIVITY")
                .put("args", args)
                .put("nonce", java.util.UUID.randomUUID().toString()));
        // The reply is drained so it cannot pile up in the socket buffer across updates.
        receive();
    }

    public void ping() throws IOException {
        send(OP_PING, new JSONObject());
        receive();
    }

    @Override
    public void close() {
        try {
            send(OP_CLOSE, new JSONObject());
        } catch (IOException ignored) {
            // Closing a socket Discord already dropped is the common path.
        }
        connection.close();
    }

    // ── framing ───────────────────────────────────────────────────────────────

    private void send(int opcode, JSONObject payload) throws IOException {
        byte[] body = payload.toString().getBytes(StandardCharsets.UTF_8);
        ByteBuffer buffer = ByteBuffer.allocate(8 + body.length).order(ByteOrder.LITTLE_ENDIAN);
        buffer.putInt(opcode).putInt(body.length).put(body).flip();
        connection.write(buffer);
    }

    /** Reads one frame, or {@code null} when the peer closed or sent something unusable. */
    private JSONObject receive() throws IOException {
        ByteBuffer header = ByteBuffer.allocate(8).order(ByteOrder.LITTLE_ENDIAN);
        if (!connection.readFully(header)) return null;
        header.flip();

        int opcode = header.getInt();
        int length = header.getInt();
        if (length < 0 || length > MAX_FRAME_BYTES) {
            throw new IOException("Discord sent an implausible frame length: " + length);
        }
        ByteBuffer body = ByteBuffer.allocate(length);
        if (!connection.readFully(body)) return null;

        String json = new String(body.array(), StandardCharsets.UTF_8);
        if (opcode == OP_CLOSE) throw new IOException("Discord closed the connection: " + json);
        if (opcode == OP_PONG) return new JSONObject();
        try {
            return new JSONObject(json);
        } catch (Exception e) {
            return null;
        }
    }

    // ── transport ─────────────────────────────────────────────────────────────

    private interface Connection {
        void write(ByteBuffer buffer) throws IOException;

        /** Fills the buffer completely; {@code false} means the stream ended first. */
        boolean readFully(ByteBuffer buffer) throws IOException;

        void close();
    }

    private static Connection open(Path socket) {
        if (isWindows()) {
            try {
                RandomAccessFile pipe = new RandomAccessFile(socket.toString(), "rw");
                return new PipeConnection(pipe);
            } catch (Exception e) {
                return null;
            }
        }
        try {
            if (!Files.exists(socket)) return null;
            SocketChannel channel = SocketChannel.open(StandardProtocolFamily.UNIX);
            channel.connect(UnixDomainSocketAddress.of(socket));
            return new ChannelConnection(channel);
        } catch (Exception e) {
            return null;
        }
    }

    private record ChannelConnection(SocketChannel channel) implements Connection {
        @Override
        public void write(ByteBuffer buffer) throws IOException {
            while (buffer.hasRemaining()) channel.write(buffer);
        }

        @Override
        public boolean readFully(ByteBuffer buffer) throws IOException {
            while (buffer.hasRemaining()) {
                if (channel.read(buffer) < 0) return false;
            }
            return true;
        }

        @Override
        public void close() {
            try {
                channel.close();
            } catch (IOException ignored) {
                // Nothing useful to do while tearing down.
            }
        }
    }

    private record PipeConnection(RandomAccessFile pipe) implements Connection {
        @Override
        public void write(ByteBuffer buffer) throws IOException {
            pipe.write(buffer.array(), buffer.position(), buffer.remaining());
            buffer.position(buffer.limit());
        }

        @Override
        public boolean readFully(ByteBuffer buffer) throws IOException {
            byte[] bytes = new byte[buffer.remaining()];
            int read = 0;
            while (read < bytes.length) {
                int count = pipe.read(bytes, read, bytes.length - read);
                if (count < 0) return false;
                read += count;
            }
            buffer.put(bytes);
            return true;
        }

        @Override
        public void close() {
            try {
                pipe.close();
            } catch (IOException ignored) {
                // Nothing useful to do while tearing down.
            }
        }
    }

    /**
     * Every place a Discord IPC socket can appear. Flatpak and Snap sandbox the client into their
     * own runtime sub-directories, which is why a plain {@code /tmp} scan misses those installs.
     */
    static List<Path> candidateSockets() {
        List<Path> sockets = new ArrayList<>();
        if (isWindows()) {
            for (int i = 0; i < MAX_SOCKET_INDEX; i++) {
                sockets.add(Path.of("\\\\.\\pipe\\discord-ipc-" + i));
            }
            return sockets;
        }

        List<Path> roots = new ArrayList<>();
        for (String variable : List.of("XDG_RUNTIME_DIR", "TMPDIR", "TMP", "TEMP")) {
            String value = System.getenv(variable);
            if (value != null && !value.isBlank()) roots.add(Path.of(value));
        }
        roots.add(Path.of("/tmp"));

        List<Path> directories = new ArrayList<>();
        for (Path root : roots) {
            directories.add(root);
            directories.add(root.resolve("app/com.discordapp.Discord"));
            directories.add(root.resolve("app/com.discordapp.DiscordCanary"));
            directories.add(root.resolve("snap.discord"));
            directories.add(root.resolve("snap.discord-canary"));
        }

        for (Path directory : directories) {
            for (int i = 0; i < MAX_SOCKET_INDEX; i++) {
                sockets.add(directory.resolve("discord-ipc-" + i));
            }
        }
        return sockets;
    }

    private static boolean isWindows() {
        return System.getProperty("os.name", "").toLowerCase(Locale.ROOT).contains("win");
    }
}
