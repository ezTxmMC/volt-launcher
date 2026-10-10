package app.voltlauncher.game.instance;

import app.voltlauncher.core.AppPaths;
import org.json.JSONObject;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Path;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

class InstanceTest {

    private static Instance sample() {
        return Instance.create("Survival", "survival", "fabric:1.21.1:0.16.9", "fabric",
                1_000L, 21, "java-runtime-delta");
    }

    @Test
    @DisplayName("a fresh profile starts unplayed, unpinned and ungrouped")
    void createsWithDefaults() {
        Instance instance = sample();

        assertEquals(0L, instance.lastPlayedAt());
        assertEquals(0L, instance.totalPlaytimeMs());
        assertFalse(instance.favourite());
        assertEquals("", instance.groupName());
        assertEquals("", instance.iconUrl());
        assertTrue(instance.hasJavaRequirement());
        assertFalse(instance.hasCustomGameDirectory());
    }

    @Test
    @DisplayName("null and blank optional fields are normalised, never stored as null")
    void normalisesOptionalFields() {
        Instance instance = new Instance("A", "a", "1.21.1", "release", 0L, 0L, -50L,
                21, "", false, "  Modded  ", "  ", null);

        assertEquals("Modded", instance.groupName());
        assertEquals("", instance.iconUrl());
        assertEquals(0L, instance.totalPlaytimeMs());
        assertEquals(InstanceSettings.defaults(), instance.settings());
    }

    @Test
    @DisplayName("each wither changes one field and leaves the rest alone")
    void withersArePrecise() {
        Instance instance = sample()
                .withName("Renamed")
                .withFavourite(true)
                .withGroup("Modded")
                .withIconUrl("https://example.invalid/icon.png")
                .withLastPlayedAt(500L)
                .withAddedPlaytime(1_500L);

        assertEquals("Renamed", instance.name());
        assertEquals("survival", instance.slug());
        assertTrue(instance.favourite());
        assertEquals("Modded", instance.groupName());
        assertEquals("https://example.invalid/icon.png", instance.iconUrl());
        assertEquals(500L, instance.lastPlayedAt());
        assertEquals(1_500L, instance.totalPlaytimeMs());
        assertEquals("fabric:1.21.1:0.16.9", instance.versionId());
    }

    @Test
    @DisplayName("playtime accumulates and never goes backwards")
    void accumulatesPlaytime() {
        Instance instance = sample().withAddedPlaytime(1_000L).withAddedPlaytime(2_000L);
        assertEquals(3_000L, instance.totalPlaytimeMs());

        assertEquals(3_000L, instance.withAddedPlaytime(-5_000L).totalPlaytimeMs());
    }

    @Test
    @DisplayName("re-pointing a profile keeps its slug, group and playtime")
    void repointingKeepsIdentity() {
        Instance instance = sample().withGroup("Packs").withAddedPlaytime(42L)
                .withVersion("neoforge:1.21.1:21.1.0", "neoforge", 21, "java-runtime-delta");

        assertEquals("survival", instance.slug());
        assertEquals("Packs", instance.groupName());
        assertEquals(42L, instance.totalPlaytimeMs());
        assertEquals("neoforge:1.21.1:21.1.0", instance.versionId());
    }

    @Test
    @DisplayName("the managed game directory sits under the launcher home")
    void resolvesManagedGameDirectory(@TempDir Path home) {
        String previous = System.getProperty("voltlauncher.home");
        System.setProperty("voltlauncher.home", home.toString());
        try {
            Instance instance = sample();
            assertEquals(AppPaths.instanceGameDirectory("survival"), instance.gameDirectory());
            assertEquals(instance.managedGameDirectory(), instance.gameDirectory());
        } finally {
            if (previous == null) System.clearProperty("voltlauncher.home");
            else System.setProperty("voltlauncher.home", previous);
        }
    }

    @Test
    @DisplayName("a configured game directory overrides the managed one")
    void honoursGameDirectoryOverride(@TempDir Path home, @TempDir Path elsewhere) {
        String previous = System.getProperty("voltlauncher.home");
        System.setProperty("voltlauncher.home", home.toString());
        try {
            InstanceSettings settings = new InstanceSettings(null, null, null, null, null, null, null,
                    Map.of(), null, null, null, elsewhere.toString(), null);
            Instance instance = sample().withSettings(settings);

            assertTrue(instance.hasCustomGameDirectory());
            assertEquals(elsewhere.toAbsolutePath().normalize(), instance.gameDirectory());
            // The managed directory still points into the launcher home, which is what a
            // duplicate copies into and what deleting the profile removes.
            assertEquals(AppPaths.instanceGameDirectory("survival"), instance.managedGameDirectory());
        } finally {
            if (previous == null) System.clearProperty("voltlauncher.home");
            else System.setProperty("voltlauncher.home", previous);
        }
    }

    @Test
    @DisplayName("a profile with no recorded Java requirement is detectable")
    void reportsMissingJavaRequirement() {
        Instance instance = new Instance("A", "a", "1.7.10", "release", 0L, 0L, 0L,
                0, "", false, "", "", InstanceSettings.defaults());
        assertFalse(instance.hasJavaRequirement());
        assertTrue(instance.withJavaRequirement(8, "jre-legacy").hasJavaRequirement());
    }

    @Test
    @DisplayName("settings round-trip through JSON with every field preserved")
    void settingsRoundTrip() {
        InstanceSettings settings = new InstanceSettings(
                6144, 2048, "-XX:+UseZGC", 1920, 1080, true, "/opt/jdk21",
                Map.of("MESA_GL_VERSION_OVERRIDE", "4.6", "DRI_PRIME", "1"),
                "echo before", "echo after", "gamemoderun", "/games/mc", false);

        JSONObject json = settings.toJson();
        InstanceSettings restored = InstanceSettings.fromJson(json);

        assertEquals(settings, restored);
        assertEquals("4.6", restored.envVars().get("MESA_GL_VERSION_OVERRIDE"));
        assertTrue(restored.isFullscreen());
        assertTrue(restored.hasCustomMemory());
        assertTrue(restored.hasJavaOverride());
    }

    @Test
    @DisplayName("absent, null and blank settings all mean no override")
    void settingsTreatBlanksAsUnset() {
        InstanceSettings empty = InstanceSettings.fromJson(null);
        assertEquals(InstanceSettings.defaults(), empty);

        InstanceSettings explicitNulls = InstanceSettings.fromJson(new JSONObject()
                .put("maxMemoryMb", JSONObject.NULL)
                .put("jvmArgs", "")
                .put("javaPath", "   ")
                .put("fullscreen", JSONObject.NULL));

        assertNull(explicitNulls.maxMemoryMb());
        assertNull(explicitNulls.jvmArgs());
        assertNull(explicitNulls.javaPath());
        assertNull(explicitNulls.fullscreen());
        assertFalse(explicitNulls.isFullscreen());
        assertFalse(explicitNulls.hasJavaOverride());
    }

    @Test
    @DisplayName("non-string environment values are coerced rather than dropped")
    void settingsCoerceEnvValues() {
        InstanceSettings settings = InstanceSettings.fromJson(new JSONObject()
                .put("envVars", new JSONObject().put("PORT", 25565).put("DEBUG", true).put("EMPTY", JSONObject.NULL)));

        assertEquals("25565", settings.envVars().get("PORT"));
        assertEquals("true", settings.envVars().get("DEBUG"));
        assertFalse(settings.envVars().containsKey("EMPTY"));
    }
}
