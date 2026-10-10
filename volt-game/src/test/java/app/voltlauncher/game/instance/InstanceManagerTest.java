package app.voltlauncher.game.instance;

import app.voltlauncher.core.AppPaths;
import app.voltlauncher.core.util.HttpFetcher;
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
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Covers the registry operations that do not need the network. Creating a profile from scratch
 * resolves version metadata online, so profiles are seeded straight into the store instead.
 */
class InstanceManagerTest {

    @TempDir
    Path home;

    private String previousHome;
    private LauncherInstanceStore store;
    private InstanceManager manager;

    @BeforeEach
    void setUp() throws Exception {
        previousHome = System.getProperty("voltlauncher.home");
        System.setProperty("voltlauncher.home", home.toString());

        HttpFetcher http = new HttpFetcher();
        VanillaVersionResolver resolver = new VanillaVersionResolver(http);
        store = new LauncherInstanceStore();
        manager = new InstanceManager(store, resolver, PlatformRegistry.withDefaults(resolver, http));
    }

    @AfterEach
    void tearDown() {
        if (previousHome == null) System.clearProperty("voltlauncher.home");
        else System.setProperty("voltlauncher.home", previousHome);
    }

    private Instance seed(String name, String slug) throws Exception {
        List<Instance> existing = new java.util.ArrayList<>(store.listInstances());
        Instance instance = Instance.create(name, slug, "1.21.1", "release",
                System.currentTimeMillis(), 21, "java-runtime-delta");
        existing.add(instance);
        store.saveInstances(existing);
        Files.createDirectories(instance.gameDirectory());
        return instance;
    }

    @Test
    @DisplayName("renaming keeps the slug, so the game directory stays where it is")
    void renameKeepsSlug() throws Exception {
        seed("Survival", "survival");

        Instance renamed = manager.renameInstance("Survival", "  Hardcore  ");
        assertEquals("Hardcore", renamed.name());
        assertEquals("survival", renamed.slug());
        assertTrue(Files.isDirectory(AppPaths.instanceGameDirectory("survival")));
    }

    @Test
    @DisplayName("a name already in use is refused")
    void rejectsDuplicateNames() throws Exception {
        seed("Survival", "survival");
        seed("Creative", "creative");

        assertThrows(IllegalStateException.class, () -> manager.renameInstance("Survival", "creative"));
    }

    @Test
    @DisplayName("renaming a profile that does not exist is refused")
    void rejectsUnknownRename() {
        assertThrows(IllegalStateException.class, () -> manager.renameInstance("Nope", "Something"));
    }

    @Test
    @DisplayName("favourite, group and icon are stored and normalised")
    void storesPresentationFields() throws Exception {
        seed("Survival", "survival");

        assertTrue(manager.setFavourite("Survival", true).favourite());
        assertEquals("Modded", manager.setGroup("Survival", "  Modded  ").groupName());
        assertEquals("", manager.setGroup("Survival", null).groupName());
        assertEquals("https://example.invalid/i.png",
                manager.setIconUrl("Survival", " https://example.invalid/i.png ").iconUrl());
    }

    @Test
    @DisplayName("an absurdly long group name is refused")
    void rejectsLongGroupName() throws Exception {
        seed("Survival", "survival");
        assertThrows(IllegalArgumentException.class, () -> manager.setGroup("Survival", "x".repeat(49)));
    }

    @Test
    @DisplayName("groups are listed once each, alphabetically, ignoring ungrouped profiles")
    void listsGroups() throws Exception {
        seed("A", "a");
        seed("B", "b");
        seed("C", "c");
        manager.setGroup("A", "Zeta");
        manager.setGroup("B", "alpha");

        assertEquals(List.of("alpha", "Zeta"), manager.listGroups());
    }

    @Test
    @DisplayName("playtime accumulates across sessions and ignores non-positive durations")
    void recordsPlaytime() throws Exception {
        seed("Survival", "survival");

        manager.recordSession("Survival", 1_000L);
        manager.recordSession("Survival", 2_500L);
        manager.recordSession("Survival", 0L);
        manager.recordSession("Survival", -50L);

        assertEquals(3_500L, manager.findByName("Survival").totalPlaytimeMs());
    }

    @Test
    @DisplayName("duplicating copies the files and gives the copy a fresh identity")
    void duplicatesProfile() throws Exception {
        Instance source = seed("Survival", "survival");
        manager.setGroup("Survival", "Packs");
        manager.recordSession("Survival", 10_000L);
        Files.createDirectories(source.gameDirectory().resolve("mods"));
        Files.writeString(source.gameDirectory().resolve("mods/a.jar"), "alpha");
        Files.writeString(AppPaths.instanceDirectory("survival").resolve("content.json"), "{}");

        Instance copy = manager.duplicateInstance("Survival", "Survival Copy", null);

        assertEquals("Survival Copy", copy.name());
        assertFalse(copy.slug().equals("survival"));
        assertEquals("Packs", copy.groupName());
        // A copy starts its own history rather than inheriting the original's.
        assertEquals(0L, copy.totalPlaytimeMs());
        assertEquals(0L, copy.lastPlayedAt());
        assertFalse(copy.favourite());
        assertEquals("alpha", Files.readString(copy.gameDirectory().resolve("mods/a.jar")));
        assertTrue(Files.exists(AppPaths.instanceDirectory(copy.slug()).resolve("content.json")));
    }

    @Test
    @DisplayName("copy progress counts files only, so the bar actually reaches the end")
    void duplicateProgressReachesCompletion() throws Exception {
        Instance source = seed("Survival", "survival");
        Files.createDirectories(source.gameDirectory().resolve("mods"));
        Files.createDirectories(source.gameDirectory().resolve("config/deep"));
        Files.writeString(source.gameDirectory().resolve("mods/a.jar"), "a");
        Files.writeString(source.gameDirectory().resolve("mods/b.jar"), "b");
        Files.writeString(source.gameDirectory().resolve("config/deep/c.toml"), "c");

        int[] last = {0, 0};
        manager.duplicateInstance("Survival", "Copy", (completed, total) -> {
            last[0] = completed;
            last[1] = total;
        });

        assertEquals(3, last[1]);
        assertEquals(last[1], last[0]);
    }

    @Test
    @DisplayName("duplicating without a name appends a copy marker")
    void duplicatesWithDefaultName() throws Exception {
        seed("Survival", "survival");
        assertEquals("Survival (copy)", manager.duplicateInstance("Survival", "", null).name());
    }

    @Test
    @DisplayName("a duplicate never inherits a custom game directory")
    void duplicateDropsDirectoryOverride(@TempDir Path elsewhere) throws Exception {
        Instance source = seed("Survival", "survival");
        Files.createDirectories(elsewhere.resolve("mods"));
        Files.writeString(elsewhere.resolve("mods/a.jar"), "external");
        manager.updateSettings("Survival", new InstanceSettings(null, null, null, null, null, null, null,
                Map.of(), null, null, null, elsewhere.toString(), null));

        Instance copy = manager.duplicateInstance("Survival", "Copy", null);

        assertNull(copy.settings().gameDirectory());
        assertFalse(copy.hasCustomGameDirectory());
        // The external directory's contents are copied into the duplicate's own managed folder,
        // so the two profiles cannot write over each other's worlds.
        assertEquals("external", Files.readString(copy.gameDirectory().resolve("mods/a.jar")));
        assertEquals(copy.managedGameDirectory(), copy.gameDirectory());
        assertTrue(Files.exists(source.gameDirectory()));
    }

    @Test
    @DisplayName("duplicating onto a name already in use is refused")
    void rejectsDuplicateIntoExistingName() throws Exception {
        seed("Survival", "survival");
        seed("Creative", "creative");

        assertThrows(IllegalStateException.class,
                () -> manager.duplicateInstance("Survival", "Creative", null));
    }

    @Test
    @DisplayName("deleting removes the registry entry and the launcher's own directory")
    void deletesProfile() throws Exception {
        Instance instance = seed("Survival", "survival");
        Files.writeString(instance.gameDirectory().resolve("options.txt"), "fov:80");

        manager.removeInstance("Survival");

        assertTrue(manager.listInstances().isEmpty());
        assertFalse(Files.exists(AppPaths.instanceDirectory("survival")));
    }

    @Test
    @DisplayName("deleting a profile with a custom game directory leaves that directory alone")
    void deleteSparesExternalDirectory(@TempDir Path elsewhere) throws Exception {
        seed("Survival", "survival");
        Files.writeString(elsewhere.resolve("options.txt"), "fov:80");
        manager.updateSettings("Survival", new InstanceSettings(null, null, null, null, null, null, null,
                Map.of(), null, null, null, elsewhere.toString(), null));

        manager.removeInstance("Survival");

        assertFalse(Files.exists(AppPaths.instanceDirectory("survival")));
        assertTrue(Files.exists(elsewhere.resolve("options.txt")));
    }

    @Test
    @DisplayName("deleting something that is not there is a no-op, not a failure")
    void toleratesDeletingUnknownProfile() throws Exception {
        manager.removeInstance("Nope");
    }

    @Test
    @DisplayName("the required Java version comes from the metadata when it states one")
    void readsJavaRequirementFromMetadata() {
        InstanceManager.RequiredJava required = manager.resolveRequiredJava(
                new org.json.JSONObject().put("javaVersion",
                        new org.json.JSONObject().put("majorVersion", 21).put("component", "java-runtime-delta")),
                "1.21.1");

        assertEquals(21, required.majorVersion());
        assertEquals("java-runtime-delta", required.component());
    }

    @Test
    @DisplayName("without metadata the Java version is guessed from the version name")
    void guessesJavaRequirement() {
        assertEquals(21, manager.resolveRequiredJava(new org.json.JSONObject(), "1.21.1").majorVersion());
        assertEquals(17, manager.resolveRequiredJava(new org.json.JSONObject(), "1.20.4").majorVersion());
        assertEquals(16, manager.resolveRequiredJava(new org.json.JSONObject(), "1.17.1").majorVersion());
        assertEquals(8, manager.resolveRequiredJava(new org.json.JSONObject(), "1.7.10").majorVersion());
        assertEquals(21, manager.resolveRequiredJava(
                new org.json.JSONObject(), "fabric:1.21.1:0.16.9").majorVersion());
    }
}
