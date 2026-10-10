package app.voltlauncher.game.world;

import app.voltlauncher.core.AppPaths;
import app.voltlauncher.core.nbt.Nbt;
import app.voltlauncher.core.nbt.NbtCompound;
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
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Exercises world discovery against real NBT on disk. The launcher home is redirected into a
 * temporary directory so nothing touches the developer's own profiles.
 */
class WorldServiceTest {

    @TempDir
    Path home;

    private String previousHome;
    private InstanceManager instanceManager;
    private WorldService worlds;

    @BeforeEach
    void setUp() throws Exception {
        previousHome = System.getProperty("voltlauncher.home");
        System.setProperty("voltlauncher.home", home.toString());

        HttpFetcher http = new HttpFetcher();
        VanillaVersionResolver resolver = new VanillaVersionResolver(http);
        instanceManager = new InstanceManager(new LauncherInstanceStore(), resolver,
                PlatformRegistry.withDefaults(resolver, http));
        worlds = new WorldService(instanceManager);

        // Written directly rather than through createInstance, which would need the network.
        new LauncherInstanceStore().saveInstances(List.of(
                Instance.create("Survival", "survival", "1.21.1", "release", 1L, 21, "java"),
                Instance.create("Creative", "creative", "1.21.1", "release", 1L, 21, "java")));
    }

    @AfterEach
    void tearDown() {
        if (previousHome == null) System.clearProperty("voltlauncher.home");
        else System.setProperty("voltlauncher.home", previousHome);
    }

    private Path world(String slug, String folder, String levelName, long lastPlayed, int gameType)
            throws Exception {
        Path directory = AppPaths.instanceGameDirectory(slug).resolve("saves").resolve(folder);
        Files.createDirectories(directory);
        Files.writeString(directory.resolve("region-placeholder.mca"), "x".repeat(100));

        NbtCompound data = new NbtCompound()
                .put("LevelName", levelName)
                .put("LastPlayed", lastPlayed)
                .put("GameType", gameType)
                .put("hardcore", (byte) 0)
                .put("Version", new NbtCompound().put("Name", "1.21.1"));
        Nbt.write(directory.resolve("level.dat"),
                new Nbt.Document("", new NbtCompound().put("Data", data), true));
        return directory;
    }

    @Test
    @DisplayName("a profile with no saves folder lists nothing")
    void listsNothingWithoutSaves() throws Exception {
        assertTrue(worlds.list("Survival").isEmpty());
    }

    @Test
    @DisplayName("the display name comes from level.dat, not from the folder")
    void readsNameFromLevelDat() throws Exception {
        world("survival", "New World (3)", "Hardcore Run", 5_000L, 0);

        List<WorldService.World> found = worlds.list("Survival");
        assertEquals(1, found.size());

        WorldService.World world = found.getFirst();
        assertEquals("New World (3)", world.folderName());
        assertEquals("Hardcore Run", world.name());
        assertEquals(5_000L, world.lastPlayed());
        assertEquals("survival", world.gameMode());
        assertEquals("1.21.1", world.versionName());
        assertTrue(world.readable());
        assertTrue(world.sizeBytes() > 0);
    }

    @Test
    @DisplayName("worlds are listed most recently played first")
    void sortsByLastPlayed() throws Exception {
        world("survival", "a", "Older", 1_000L, 0);
        world("survival", "b", "Newer", 9_000L, 1);

        assertEquals(List.of("Newer", "Older"),
                worlds.list("Survival").stream().map(WorldService.World::name).toList());
    }

    @Test
    @DisplayName("a folder without level.dat is still listed, flagged as unreadable")
    void surfacesBrokenWorlds() throws Exception {
        Files.createDirectories(AppPaths.instanceGameDirectory("survival").resolve("saves/broken"));

        WorldService.World world = worlds.list("Survival").getFirst();
        assertEquals("broken", world.name());
        assertFalse(world.readable());
        assertFalse(world.problem().isBlank());
    }

    @Test
    @DisplayName("a corrupt level.dat does not hide the world")
    void surfacesCorruptLevelDat() throws Exception {
        Path directory = AppPaths.instanceGameDirectory("survival").resolve("saves/corrupt");
        Files.createDirectories(directory);
        Files.writeString(directory.resolve("level.dat"), "not nbt at all");

        WorldService.World world = worlds.list("Survival").getFirst();
        assertFalse(world.readable());
        assertTrue(world.problem().contains("level.dat"));
    }

    @Test
    @DisplayName("renaming rewrites level.dat and leaves the folder in place")
    void renamesInLevelDat() throws Exception {
        world("survival", "world1", "Old Name", 1_000L, 0);

        WorldService.World renamed = worlds.rename("Survival", "world1", "New Name");
        assertEquals("New Name", renamed.name());
        assertEquals("world1", renamed.folderName());
        assertTrue(Files.isDirectory(AppPaths.instanceGameDirectory("survival").resolve("saves/world1")));
    }

    @Test
    @DisplayName("an empty or over-long world name is refused")
    void rejectsBadRename() throws Exception {
        world("survival", "world1", "Old Name", 1_000L, 0);

        assertThrows(IllegalArgumentException.class, () -> worlds.rename("Survival", "world1", "  "));
        assertThrows(IllegalArgumentException.class,
                () -> worlds.rename("Survival", "world1", "x".repeat(65)));
    }

    @Test
    @DisplayName("duplicating copies the files and gives the copy its own folder")
    void duplicatesWorld() throws Exception {
        world("survival", "world1", "Base", 1_000L, 0);

        WorldService.World copy = worlds.duplicate("Survival", "world1", "Base Copy");
        assertEquals("Base Copy", copy.name());
        assertFalse(copy.folderName().equals("world1"));
        assertTrue(Files.isRegularFile(AppPaths.instanceGameDirectory("survival")
                .resolve("saves").resolve(copy.folderName()).resolve("region-placeholder.mca")));
        assertEquals(2, worlds.list("Survival").size());
    }

    @Test
    @DisplayName("duplicating without a name appends a copy marker")
    void duplicatesWithDefaultName() throws Exception {
        world("survival", "world1", "Base", 1_000L, 0);

        assertEquals("Base (copy)", worlds.duplicate("Survival", "world1", "").name());
    }

    @Test
    @DisplayName("a world can be copied into another profile")
    void copiesToAnotherInstance() throws Exception {
        world("survival", "world1", "Shared", 1_000L, 0);

        WorldService.World copy = worlds.copyToInstance("Survival", "world1", "Creative");
        assertEquals("Shared", copy.name());
        assertEquals(1, worlds.list("Creative").size());
        assertEquals(1, worlds.list("Survival").size());
    }

    @Test
    @DisplayName("copying a world onto its own profile is refused")
    void refusesCopyToSelf() throws Exception {
        world("survival", "world1", "Shared", 1_000L, 0);
        assertThrows(IllegalArgumentException.class,
                () -> worlds.copyToInstance("Survival", "world1", "Survival"));
    }

    @Test
    @DisplayName("deleting removes the whole world directory")
    void deletesWorld() throws Exception {
        Path directory = world("survival", "world1", "Doomed", 1_000L, 0);

        worlds.delete("Survival", "world1");
        assertFalse(Files.exists(directory));
        assertTrue(worlds.list("Survival").isEmpty());
    }

    @Test
    @DisplayName("a world name that walks out of the saves folder is refused")
    void refusesPathTraversal() {
        assertThrows(IllegalArgumentException.class, () -> worlds.delete("Survival", "../../etc"));
        assertThrows(IllegalArgumentException.class, () -> worlds.delete("Survival", "sub/dir"));
        assertThrows(IllegalArgumentException.class, () -> worlds.delete("Survival", " "));
    }

    @Test
    @DisplayName("a world icon is reported only when the file exists")
    void findsWorldIcon() throws Exception {
        Path directory = world("survival", "world1", "Base", 1_000L, 0);
        assertNull(worlds.iconPath("Survival", "world1"));

        Files.writeString(directory.resolve("icon.png"), "png");
        assertNotNull(worlds.iconPath("Survival", "world1"));
        assertTrue(worlds.list("Survival").getFirst().hasIcon());
    }
}
