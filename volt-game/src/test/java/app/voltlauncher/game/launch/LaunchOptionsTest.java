package app.voltlauncher.game.launch;

import org.json.JSONObject;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class LaunchOptionsTest {

    @Test
    @DisplayName("the default launch asks for nothing special")
    void defaultsToNothing() {
        LaunchOptions options = LaunchOptions.none();

        assertEquals(LaunchOptions.QuickPlay.NONE, options.quickPlay());
        assertFalse(options.hasQuickPlay());
        assertFalse(options.demo());
        assertEquals("", options.quickPlayTarget());
    }

    @Test
    @DisplayName("quick play kinds are parsed from the names the UI uses")
    void parsesQuickPlayKinds() {
        assertEquals(LaunchOptions.QuickPlay.SINGLEPLAYER, LaunchOptions.QuickPlay.fromId("world"));
        assertEquals(LaunchOptions.QuickPlay.SINGLEPLAYER, LaunchOptions.QuickPlay.fromId("SinglePlayer"));
        assertEquals(LaunchOptions.QuickPlay.MULTIPLAYER, LaunchOptions.QuickPlay.fromId("server"));
        assertEquals(LaunchOptions.QuickPlay.REALMS, LaunchOptions.QuickPlay.fromId("realm"));
        assertEquals(LaunchOptions.QuickPlay.NONE, LaunchOptions.QuickPlay.fromId(null));
        assertEquals(LaunchOptions.QuickPlay.NONE, LaunchOptions.QuickPlay.fromId("  "));
        assertThrows(IllegalArgumentException.class, () -> LaunchOptions.QuickPlay.fromId("teleport"));
    }

    @Test
    @DisplayName("quick play without a target is refused")
    void requiresTarget() {
        assertThrows(IllegalArgumentException.class,
                () -> new LaunchOptions(LaunchOptions.QuickPlay.MULTIPLAYER, "  ", false, false));
    }

    @Test
    @DisplayName("a server address splits into host and port, defaulting the port")
    void splitsServerAddress() {
        LaunchOptions withPort = new LaunchOptions(
                LaunchOptions.QuickPlay.MULTIPLAYER, "play.example.net:25577", false, false);
        assertEquals("play.example.net", withPort.serverHost());
        assertEquals("25577", withPort.serverPort());

        LaunchOptions withoutPort = new LaunchOptions(
                LaunchOptions.QuickPlay.MULTIPLAYER, "play.example.net", false, false);
        assertEquals("play.example.net", withoutPort.serverHost());
        assertEquals("25565", withoutPort.serverPort());
    }

    @Test
    @DisplayName("a non-numeric or missing port falls back to the Minecraft default")
    void rejectsUnusablePorts() {
        assertEquals("25565", new LaunchOptions(
                LaunchOptions.QuickPlay.MULTIPLAYER, "host:abc", false, false).serverPort());
        assertEquals("25565", new LaunchOptions(
                LaunchOptions.QuickPlay.MULTIPLAYER, "host:", false, false).serverPort());
    }

    @Test
    @DisplayName("options are read from the request body the UI sends")
    void readsJson() {
        LaunchOptions options = LaunchOptions.fromJson(new JSONObject()
                .put("quickPlay", "multiplayer")
                .put("quickPlayTarget", "mc.example.net")
                .put("demo", true));

        assertTrue(options.hasQuickPlay());
        assertEquals(LaunchOptions.QuickPlay.MULTIPLAYER, options.quickPlay());
        assertEquals("mc.example.net", options.quickPlayTarget());
        assertTrue(options.demo());

        assertEquals(LaunchOptions.none(), LaunchOptions.fromJson(null));
        assertEquals(LaunchOptions.none(), LaunchOptions.fromJson(new JSONObject()));
    }
}
