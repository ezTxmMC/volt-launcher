package app.voltlauncher.game.instance;

import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

class ContentSourceTest {

    private static ContentSource provider() {
        return new ContentSource("mods", "sodium.jar", "modrinth", "AANobbMI", "abc123",
                "Sodium", "0.5.8", "https://example.invalid/sodium.jar", "a".repeat(40), 1234L,
                ContentSource.ORIGIN_PROVIDER, "https://example.invalid/icon.png",
                List.of("P7dR8mSH", "P7dR8mSH", "other"));
    }

    @Test
    @DisplayName("a file installed from a provider can be looked up for updates")
    void tracksProviderInstalls() {
        ContentSource source = provider();
        assertTrue(source.isTracked());
        assertFalse(source.isFromModpack());
        assertEquals(List.of("P7dR8mSH", "P7dR8mSH", "other"), source.requiredDependencies());
    }

    @Test
    @DisplayName("a hand-added file is recorded but not trackable")
    void recordsManualFiles() {
        ContentSource manual = ContentSource.manual("mods", "mystery.jar", 99L);

        assertFalse(manual.isTracked());
        assertEquals(ContentSource.ORIGIN_MANUAL, manual.origin());
        assertTrue(manual.requiredDependencies().isEmpty());
        assertEquals("", manual.provider());
    }

    @Test
    @DisplayName("null and blank fields become empty strings, never null")
    void normalisesBlanks() {
        ContentSource source = new ContentSource("mods", "a.jar", null, null, null,
                null, null, null, null, 0L, "  ", null, null);

        assertEquals("", source.provider());
        assertEquals("", source.iconUrl());
        assertEquals(ContentSource.ORIGIN_MANUAL, source.origin());
        assertTrue(source.requiredDependencies().isEmpty());
    }

    @Test
    @DisplayName("every field survives a JSON round trip")
    void roundTripsThroughJson() {
        ContentSource source = provider();
        assertEquals(source, ContentSource.fromJson(source.toJson()));
    }

    @Test
    @DisplayName("a manifest written before dependencies were recorded still loads")
    void readsLegacyJson() {
        JSONObject legacy = new JSONObject()
                .put("contentType", "mods")
                .put("fileName", "old.jar")
                .put("origin", ContentSource.ORIGIN_MODPACK);

        ContentSource source = ContentSource.fromJson(legacy);
        assertEquals("old.jar", source.fileName());
        assertTrue(source.isFromModpack());
        assertTrue(source.requiredDependencies().isEmpty());
    }

    @Test
    @DisplayName("blank dependency ids are dropped on the way in")
    void dropsBlankDependencies() {
        ContentSource source = ContentSource.fromJson(new JSONObject()
                .put("contentType", "mods")
                .put("fileName", "a.jar")
                .put("requiredDependencies", new JSONArray(List.of("real", "", "  "))));

        assertEquals(List.of("real"), source.requiredDependencies());
    }

    @Test
    @DisplayName("withers change one field and keep the dependency list")
    void withersPreserveDependencies() {
        ContentSource renamed = provider().withFileName("sodium-0.6.jar");
        assertEquals("sodium-0.6.jar", renamed.fileName());
        assertEquals(provider().requiredDependencies(), renamed.requiredDependencies());

        ContentSource relabelled = provider().withProjectDetails("Sodium!", "https://example.invalid/new.png");
        assertEquals("Sodium!", relabelled.projectName());
        assertEquals(provider().requiredDependencies(), relabelled.requiredDependencies());

        ContentSource reorigined = provider().withOrigin(ContentSource.ORIGIN_MODPACK);
        assertTrue(reorigined.isFromModpack());
        assertEquals(provider().requiredDependencies(), reorigined.requiredDependencies());

        assertEquals(List.of("x"), provider().withRequiredDependencies(List.of("x")).requiredDependencies());
    }

    @Test
    @DisplayName("a modpack origin knows whether it can be checked for updates")
    void modpackOriginUpdatability() {
        ModpackOrigin fromProvider = new ModpackOrigin(
                "modrinth", "abc", "v1", "1.0.0", "Fabulously Optimized", "", "icon");
        ModpackOrigin imported = new ModpackOrigin(
                "modrinth", "", "", "1.0.0", "Imported", "pack.mrpack", "");

        assertTrue(fromProvider.isUpdatable());
        assertFalse(imported.isUpdatable());
        assertEquals(fromProvider, ModpackOrigin.fromJson(fromProvider.toJson()));
        assertNull(ModpackOrigin.fromJson(null));
    }

    @Test
    @DisplayName("moving a pack to a new release keeps everything else about its origin")
    void modpackOriginVersionChange() {
        ModpackOrigin origin = new ModpackOrigin(
                "modrinth", "abc", "v1", "1.0.0", "Pack", "", "icon").withVersion("v2", "2.0.0");

        assertEquals("v2", origin.versionId());
        assertEquals("2.0.0", origin.versionNumber());
        assertEquals("Pack", origin.name());
        assertEquals("icon", origin.iconUrl());
    }
}
