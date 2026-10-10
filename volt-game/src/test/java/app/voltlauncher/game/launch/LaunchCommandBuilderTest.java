package app.voltlauncher.game.launch;

import app.voltlauncher.auth.MinecraftAccountSession;
import app.voltlauncher.core.config.SettingsStore;
import app.voltlauncher.game.install.AssetInstaller;
import app.voltlauncher.game.instance.Instance;
import app.voltlauncher.game.instance.InstanceSettings;
import app.voltlauncher.game.java.JavaRuntimeResolver;
import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Path;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class LaunchCommandBuilderTest {

    private static final MinecraftAccountSession SESSION = new MinecraftAccountSession(
            "uuid-1", "Steve", "token", 0L, "ms-token", 0L, "refresh", "hash", "xuid-1");

    /** Version metadata shaped like Mojang's, including the quick-play conditional block. */
    private static JSONObject modernMeta(boolean withQuickPlay) {
        JSONArray game = new JSONArray()
                .put("--username").put("${auth_player_name}")
                .put("--gameDir").put("${game_directory}")
                .put(new JSONObject()
                        .put("rules", new JSONArray().put(new JSONObject()
                                .put("action", "allow")
                                .put("features", new JSONObject().put("has_custom_resolution", true))))
                        .put("value", new JSONArray().put("--width").put("${resolution_width}")
                                .put("--height").put("${resolution_height}")));

        if (withQuickPlay) {
            game.put(new JSONObject()
                    .put("rules", new JSONArray().put(new JSONObject()
                            .put("action", "allow")
                            .put("features", new JSONObject().put("is_quick_play_multiplayer", true))))
                    .put("value", new JSONArray().put("--quickPlayMultiplayer")
                            .put("${quickPlayMultiplayer}")));
            game.put(new JSONObject()
                    .put("rules", new JSONArray().put(new JSONObject()
                            .put("action", "allow")
                            .put("features", new JSONObject().put("is_quick_play_singleplayer", true))))
                    .put("value", new JSONArray().put("--quickPlaySingleplayer")
                            .put("${quickPlaySingleplayer}")));
        }

        return new JSONObject()
                .put("id", "1.21.1")
                .put("mainClass", "net.minecraft.client.main.Main")
                .put("arguments", new JSONObject()
                        .put("jvm", new JSONArray().put("-Djava.library.path=${natives_directory}")
                                .put("-Xmx1G").put("-cp").put("${classpath}"))
                        .put("game", game));
    }

    private static AssetInstaller.Installation installation(Path root, InstanceSettings settings,
                                                            JSONObject meta) {
        Instance instance = Instance.create("Survival", "survival", "1.21.1", "release", 0L, 21, "")
                .withSettings(settings);
        return new AssetInstaller.Installation(
                instance, "1.21.1", meta,
                root.resolve("libraries"), root.resolve("assets"), root.resolve("natives"),
                "/tmp/client.jar", meta.getString("mainClass"), null, "17", "release");
    }

    private static JavaRuntimeResolver.JavaRuntime runtime() {
        return new JavaRuntimeResolver.JavaRuntime(21, Path.of("/usr/bin/java"), "test");
    }

    private static LaunchCommandBuilder builder(Path root) {
        return new LaunchCommandBuilder("client-id", "9.9.9",
                new SettingsStore(root.resolve("settings.json")));
    }

    @Test
    @DisplayName("the launcher owns heap sizing and drops any -Xmx the metadata carries")
    void heapIsOwnedByTheLauncher(@TempDir Path root) {
        InstanceSettings settings = new InstanceSettings(6144, 2048, "-Xmx99G -XX:+UseZGC",
                null, null, null, null, Map.of(), null, null, null, null, null);

        List<String> command = builder(root).build(
                SESSION, installation(root, settings, modernMeta(false)), runtime());

        assertEquals("/usr/bin/java", command.getFirst());
        assertTrue(command.contains("-Xmx6144M"));
        assertTrue(command.contains("-Xms2048M"));
        assertTrue(command.contains("-XX:+UseZGC"));
        assertFalse(command.contains("-Xmx99G"));
        assertFalse(command.contains("-Xmx1G"));
    }

    @Test
    @DisplayName("the minimum heap can never exceed the maximum on the command line")
    void clampsMinimumHeap(@TempDir Path root) {
        InstanceSettings settings = new InstanceSettings(1024, 4096, null,
                null, null, null, null, Map.of(), null, null, null, null, null);

        List<String> command = builder(root).build(
                SESSION, installation(root, settings, modernMeta(false)), runtime());

        assertTrue(command.contains("-Xmx1024M"));
        assertTrue(command.contains("-Xms1024M"));
    }

    @Test
    @DisplayName("placeholders are substituted and account details reach the game arguments")
    void substitutesPlaceholders(@TempDir Path root) {
        List<String> command = builder(root).build(
                SESSION, installation(root, InstanceSettings.defaults(), modernMeta(false)), runtime());

        assertTrue(command.contains("Steve"));
        assertTrue(command.contains("net.minecraft.client.main.Main"));
        assertTrue(command.stream().anyMatch(arg -> arg.startsWith("-Djava.library.path=")));
        assertFalse(command.stream().anyMatch(arg -> arg.contains("${")));
    }

    @Test
    @DisplayName("a custom resolution unlocks the width and height arguments")
    void emitsResolutionArguments(@TempDir Path root) {
        InstanceSettings settings = new InstanceSettings(null, null, null, 1920, 1080,
                null, null, Map.of(), null, null, null, null, null);

        List<String> command = builder(root).build(
                SESSION, installation(root, settings, modernMeta(false)), runtime());

        assertTrue(command.contains("--width"));
        assertTrue(command.contains("1920"));
        assertTrue(command.contains("--height"));
        assertTrue(command.contains("1080"));
    }

    @Test
    @DisplayName("without a custom resolution those arguments stay out")
    void omitsResolutionArguments(@TempDir Path root) {
        List<String> command = builder(root).build(
                SESSION, installation(root, InstanceSettings.defaults(), modernMeta(false)), runtime());

        assertFalse(command.contains("--width"));
        assertFalse(command.contains("--height"));
    }

    @Test
    @DisplayName("a wrapper command runs in front of the java binary")
    void prependsWrapperCommand(@TempDir Path root) {
        InstanceSettings settings = new InstanceSettings(null, null, null, null, null, null, null,
                Map.of(), null, null, "gamemoderun  prime-run", null, null);

        List<String> command = builder(root).build(
                SESSION, installation(root, settings, modernMeta(false)), runtime());

        assertEquals(List.of("gamemoderun", "prime-run", "/usr/bin/java"), command.subList(0, 3));
    }

    @Test
    @DisplayName("fullscreen is appended once, even if the metadata already asked for it")
    void appendsFullscreen(@TempDir Path root) {
        InstanceSettings settings = new InstanceSettings(null, null, null, null, null, true, null,
                Map.of(), null, null, null, null, null);

        List<String> command = builder(root).build(
                SESSION, installation(root, settings, modernMeta(false)), runtime());

        assertEquals(1, command.stream().filter("--fullscreen"::equals).count());
    }

    @Test
    @DisplayName("a modern version emits the native quick-play arguments")
    void usesNativeQuickPlay(@TempDir Path root) {
        LaunchOptions options = new LaunchOptions(
                LaunchOptions.QuickPlay.MULTIPLAYER, "play.example.net:25577", false, false);

        List<String> command = builder(root).build(
                SESSION, installation(root, InstanceSettings.defaults(), modernMeta(true)),
                runtime(), options);

        assertTrue(command.contains("--quickPlayMultiplayer"));
        assertTrue(command.contains("play.example.net:25577"));
        // The legacy fallback must not fire as well, or the game receives the target twice.
        assertFalse(command.contains("--server"));
    }

    @Test
    @DisplayName("a version without quick-play support falls back to --server and --port")
    void fallsBackToServerArguments(@TempDir Path root) {
        LaunchOptions options = new LaunchOptions(
                LaunchOptions.QuickPlay.MULTIPLAYER, "play.example.net:25577", false, false);

        List<String> command = builder(root).build(
                SESSION, installation(root, InstanceSettings.defaults(), modernMeta(false)),
                runtime(), options);

        assertTrue(command.contains("--server"));
        assertTrue(command.contains("play.example.net"));
        assertTrue(command.contains("--port"));
        assertTrue(command.contains("25577"));
    }

    @Test
    @DisplayName("a single-player quick play emits the world folder for a modern version")
    void quickPlaysWorld(@TempDir Path root) {
        LaunchOptions options = new LaunchOptions(
                LaunchOptions.QuickPlay.SINGLEPLAYER, "New World", false, false);

        List<String> command = builder(root).build(
                SESSION, installation(root, InstanceSettings.defaults(), modernMeta(true)),
                runtime(), options);

        assertTrue(command.contains("--quickPlaySingleplayer"));
        assertTrue(command.contains("New World"));
    }

    @Test
    @DisplayName("quick-play support is detected from the metadata, not assumed")
    void detectsQuickPlaySupport() {
        assertTrue(LaunchCommandBuilder.supportsQuickPlay(modernMeta(true)));
        assertFalse(LaunchCommandBuilder.supportsQuickPlay(modernMeta(false)));
        assertFalse(LaunchCommandBuilder.supportsQuickPlay(new JSONObject()));
        assertFalse(LaunchCommandBuilder.supportsQuickPlay(null));
    }

    @Test
    @DisplayName("demo mode adds its flag")
    void addsDemoFlag(@TempDir Path root) {
        LaunchOptions options = new LaunchOptions(LaunchOptions.QuickPlay.NONE, "", true, false);

        List<String> command = builder(root).build(
                SESSION, installation(root, InstanceSettings.defaults(), modernMeta(false)),
                runtime(), options);

        assertTrue(command.contains("--demo"));
    }

    @Test
    @DisplayName("a legacy version gets its classpath and library path built by hand")
    void handlesLegacyMetadata(@TempDir Path root) {
        JSONObject legacy = new JSONObject()
                .put("id", "1.7.10")
                .put("mainClass", "net.minecraft.client.Minecraft")
                .put("minecraftArguments", "--username ${auth_player_name} --version ${version_name}");

        List<String> command = builder(root).build(
                SESSION, installation(root, InstanceSettings.defaults(), legacy), runtime());

        assertTrue(command.contains("-cp"));
        assertTrue(command.contains("/tmp/client.jar"));
        assertTrue(command.contains("-Dminecraft.launcher.brand=VoltLauncher"));
        assertTrue(command.contains("-Dminecraft.launcher.version=9.9.9"));
        assertTrue(command.contains("Steve"));
        assertTrue(command.contains("net.minecraft.client.Minecraft"));
    }
}
