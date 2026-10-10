package app.voltlauncher.game.world;

import app.voltlauncher.core.AppPaths;
import app.voltlauncher.core.util.HttpFetcher;
import app.voltlauncher.game.instance.Instance;
import app.voltlauncher.game.instance.InstanceManager;
import app.voltlauncher.game.platform.PlatformRegistry;
import app.voltlauncher.game.platform.version.resolver.VanillaVersionResolver;
import app.voltlauncher.game.store.LauncherInstanceStore;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Base64;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class ServerListServiceTest {

    @TempDir
    Path home;

    private String previousHome;
    private ServerListService servers;

    @BeforeEach
    void setUp() throws Exception {
        previousHome = System.getProperty("voltlauncher.home");
        System.setProperty("voltlauncher.home", home.toString());

        HttpFetcher http = new HttpFetcher();
        VanillaVersionResolver resolver = new VanillaVersionResolver(http);
        InstanceManager manager = new InstanceManager(new LauncherInstanceStore(), resolver,
                PlatformRegistry.withDefaults(resolver, http));
        servers = new ServerListService(manager);

        new LauncherInstanceStore().saveInstances(List.of(
                Instance.create("Survival", "survival", "1.21.1", "release", 1L, 21, "java")));
        Files.createDirectories(AppPaths.instanceGameDirectory("survival"));
    }

    @AfterEach
    void tearDown() {
        if (previousHome == null) System.clearProperty("voltlauncher.home");
        else System.setProperty("voltlauncher.home", previousHome);
    }

    @Test
    @DisplayName("a profile that has never joined a server lists nothing")
    void listsNothingWithoutFile() throws Exception {
        assertTrue(servers.list("Survival").isEmpty());
    }

    @Test
    @DisplayName("adding a server creates servers.dat and stores it uncompressed")
    void createsUncompressedFile() throws Exception {
        servers.add("Survival", "Home", "play.example.net");

        Path file = AppPaths.instanceGameDirectory("survival").resolve("servers.dat");
        assertTrue(Files.isRegularFile(file));

        // The game reads servers.dat as plain NBT; writing it gzipped makes the list vanish.
        byte[] raw = Files.readAllBytes(file);
        assertTrue((raw[0] & 0xFF) != 0x1F || (raw[1] & 0xFF) != 0x8B);
    }

    @Test
    @DisplayName("servers keep the order they were added in")
    void keepsInsertionOrder() throws Exception {
        servers.add("Survival", "One", "one.example.net");
        servers.add("Survival", "Two", "two.example.net");

        List<ServerListService.ServerEntry> entries = servers.list("Survival");
        assertEquals(2, entries.size());
        assertEquals("One", entries.get(0).name());
        assertEquals(0, entries.get(0).index());
        assertEquals("two.example.net", entries.get(1).address());
        assertEquals(1, entries.get(1).index());
    }

    @Test
    @DisplayName("a blank name falls back to the address")
    void namesDefaultToAddress() throws Exception {
        ServerListService.ServerEntry entry = servers.add("Survival", "  ", "play.example.net");
        assertEquals("play.example.net", entry.name());
    }

    @Test
    @DisplayName("a server needs an address")
    void requiresAddress() {
        assertThrows(IllegalArgumentException.class, () -> servers.add("Survival", "Home", "  "));
        assertThrows(IllegalArgumentException.class, () -> servers.add("Survival", "Home", null));
    }

    @Test
    @DisplayName("removing an entry shifts the ones after it")
    void removesByIndex() throws Exception {
        servers.add("Survival", "One", "one.example.net");
        servers.add("Survival", "Two", "two.example.net");
        servers.add("Survival", "Three", "three.example.net");

        servers.remove("Survival", 1);

        List<ServerListService.ServerEntry> entries = servers.list("Survival");
        assertEquals(List.of("One", "Three"),
                entries.stream().map(ServerListService.ServerEntry::name).toList());
        assertEquals(1, entries.get(1).index());
    }

    @Test
    @DisplayName("removing a position that does not exist is refused")
    void rejectsBadIndex() throws Exception {
        servers.add("Survival", "One", "one.example.net");

        assertThrows(IllegalArgumentException.class, () -> servers.remove("Survival", 5));
        assertThrows(IllegalArgumentException.class, () -> servers.remove("Survival", -1));
    }

    @Test
    @DisplayName("removing from a profile with no list says so rather than failing obscurely")
    void rejectsRemovalWithoutFile() {
        assertThrows(IllegalStateException.class, () -> servers.remove("Survival", 0));
    }

    @Test
    @DisplayName("a server icon decodes from base64, with or without a data URL prefix")
    void decodesIcons() {
        byte[] png = {1, 2, 3, 4};
        String encoded = Base64.getEncoder().encodeToString(png);

        assertArrayEquals(png, ServerListService.decodeIcon(encoded));
        assertArrayEquals(png, ServerListService.decodeIcon("data:image/png;base64," + encoded));
        assertNull(ServerListService.decodeIcon(""));
        assertNull(ServerListService.decodeIcon(null));
        assertNull(ServerListService.decodeIcon("not base64 @@@"));
    }
}
