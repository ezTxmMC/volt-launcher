package app.voltlauncher.core.discord;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.nio.file.Path;
import java.util.List;
import java.util.Locale;

import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

class DiscordIpcClientTest {

    @Test
    @DisplayName("connecting without an application id is a no-op, not a failure")
    void refusesBlankApplicationId() {
        assertNull(DiscordIpcClient.connect(null));
        assertNull(DiscordIpcClient.connect("   "));
    }

    @Test
    @DisplayName("every socket index is probed, including the sandboxed install locations")
    void enumeratesSocketCandidates() {
        List<Path> sockets = DiscordIpcClient.candidateSockets();
        assertTrue(sockets.size() >= 10);

        boolean windows = System.getProperty("os.name", "").toLowerCase(Locale.ROOT).contains("win");
        if (windows) {
            assertTrue(sockets.stream().allMatch(path -> path.toString().contains("discord-ipc-")));
            return;
        }

        assertTrue(sockets.stream().anyMatch(path -> path.toString().endsWith("discord-ipc-0")));
        assertTrue(sockets.stream().anyMatch(path -> path.toString().endsWith("discord-ipc-9")));
        assertTrue(sockets.stream().anyMatch(path -> path.toString().contains("com.discordapp.Discord")));
        assertTrue(sockets.stream().anyMatch(path -> path.toString().contains("snap.discord")));
    }
}
