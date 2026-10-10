package app.voltlauncher.core.config;

import org.json.JSONObject;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class SettingsStoreTest {

    @Test
    @DisplayName("a missing settings file yields defaults instead of failing")
    void readsDefaultsWhenMissing(@TempDir Path directory) {
        SettingsStore store = new SettingsStore(directory.resolve("settings.json"));
        assertEquals(LauncherSettings.defaults(), store.get());
    }

    @Test
    @DisplayName("a partial patch leaves every other field alone")
    void patchesOnlyGivenKeys(@TempDir Path directory) throws Exception {
        SettingsStore store = new SettingsStore(directory.resolve("settings.json"));
        store.patch(new JSONObject().put("accentColor", "#ff0000"));
        LauncherSettings updated = store.patch(new JSONObject().put("language", "de"));

        assertEquals("#ff0000", updated.accentColor());
        assertEquals("de", updated.language());
        assertEquals(LauncherSettings.defaults().defaultMaxMemoryMb(), updated.defaultMaxMemoryMb());
    }

    @Test
    @DisplayName("saved settings are readable by a fresh store")
    void persistsAcrossInstances(@TempDir Path directory) throws Exception {
        Path file = directory.resolve("settings.json");
        new SettingsStore(file).patch(new JSONObject().put("backupsToKeep", 12));

        assertTrue(Files.exists(file));
        assertEquals(12, new SettingsStore(file).get().backupsToKeep());
    }

    @Test
    @DisplayName("a corrupt settings file degrades to defaults rather than breaking startup")
    void survivesCorruptFile(@TempDir Path directory) throws Exception {
        Path file = directory.resolve("settings.json");
        Files.writeString(file, "{ this is not json", StandardCharsets.UTF_8);

        assertEquals(LauncherSettings.defaults(), new SettingsStore(file).get());
    }
}
