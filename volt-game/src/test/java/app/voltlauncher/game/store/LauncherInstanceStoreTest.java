package app.voltlauncher.game.store;

import app.voltlauncher.game.instance.Instance;
import app.voltlauncher.game.instance.InstanceSettings;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class LauncherInstanceStoreTest {

    private static Instance sample(String name, String slug, long lastPlayed) {
        return new Instance(name, slug, "fabric:1.21.1:0.16.9", "fabric",
                1_000L, lastPlayed, 60_000L, 21, "java-runtime-delta",
                true, "Modded", "https://example.invalid/icon.png",
                new InstanceSettings(4096, 1024, "-XX:+UseZGC", 1920, 1080, true, "/opt/jdk21",
                        Map.of("DRI_PRIME", "1"), "echo pre", "echo post", "gamemoderun",
                        "/games/mc", false));
    }

    @Test
    @DisplayName("a missing registry reads as an empty list")
    void readsEmptyWhenMissing(@TempDir Path directory) throws Exception {
        assertTrue(new LauncherInstanceStore(directory.resolve("instances.json"))
                .listInstances().isEmpty());
    }

    @Test
    @DisplayName("every field survives a save and reload")
    void roundTripsEveryField(@TempDir Path directory) throws Exception {
        LauncherInstanceStore store = new LauncherInstanceStore(directory.resolve("instances.json"));
        Instance original = sample("Survival", "survival", 5_000L);
        store.saveInstances(List.of(original));

        List<Instance> loaded = store.listInstances();
        assertEquals(1, loaded.size());
        assertEquals(original, loaded.getFirst());
    }

    @Test
    @DisplayName("profiles are listed most recently played first")
    void sortsByLastPlayed(@TempDir Path directory) throws Exception {
        LauncherInstanceStore store = new LauncherInstanceStore(directory.resolve("instances.json"));
        store.saveInstances(List.of(
                sample("Old", "old", 1_000L),
                sample("Newest", "newest", 9_000L),
                sample("Middle", "middle", 5_000L)));

        assertEquals(List.of("Newest", "Middle", "Old"),
                store.listInstances().stream().map(Instance::name).toList());
    }

    @Test
    @DisplayName("a registry written before the new fields existed still loads")
    void readsLegacyRegistry(@TempDir Path directory) throws Exception {
        Path file = directory.resolve("instances.json");
        Files.writeString(file, """
                {
                  "instances": [
                    {
                      "name": "Legacy",
                      "slug": "legacy",
                      "versionId": "1.16.5",
                      "createdAt": 42,
                      "settings": { "maxMemoryMb": 2048 }
                    }
                  ]
                }
                """, StandardCharsets.UTF_8);

        Instance instance = new LauncherInstanceStore(file).listInstances().getFirst();

        assertEquals("Legacy", instance.name());
        assertEquals("release", instance.versionType());
        assertEquals(0L, instance.totalPlaytimeMs());
        assertFalse(instance.favourite());
        assertEquals("", instance.groupName());
        assertEquals(2048, instance.settings().maxMemoryMb());
    }

    @Test
    @DisplayName("a lookup by name ignores case")
    void findsByNameIgnoringCase(@TempDir Path directory) throws Exception {
        LauncherInstanceStore store = new LauncherInstanceStore(directory.resolve("instances.json"));
        store.saveInstances(List.of(sample("Survival", "survival", 0L)));

        assertTrue(store.findByName("SURVIVAL").isPresent());
        assertTrue(store.findByName("nope").isEmpty());
    }

    @Test
    @DisplayName("saving leaves no temporary file behind")
    void writesAtomically(@TempDir Path directory) throws Exception {
        Path file = directory.resolve("instances.json");
        new LauncherInstanceStore(file).saveInstances(List.of(sample("A", "a", 0L)));

        try (var entries = Files.list(directory)) {
            assertEquals(List.of("instances.json"),
                    entries.map(path -> path.getFileName().toString()).sorted().toList());
        }
    }
}
