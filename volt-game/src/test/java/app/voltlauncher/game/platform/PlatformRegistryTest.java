package app.voltlauncher.game.platform;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;

class PlatformRegistryTest {

    @Test
    @DisplayName("a loader-qualified id yields its Minecraft version")
    void extractsMinecraftVersion() {
        assertEquals("1.21.1", PlatformRegistry.extractBaseMinecraftVersionId("fabric:1.21.1:0.16.9"));
        assertEquals("1.20.1", PlatformRegistry.extractBaseMinecraftVersionId("forge:1.20.1:47.2.0"));
        assertEquals("1.21.1", PlatformRegistry.extractBaseMinecraftVersionId("1.21.1"));
        assertEquals("1.21.1", PlatformRegistry.extractBaseMinecraftVersionId("  1.21.1  "));
    }

    @Test
    @DisplayName("an id with only a platform prefix still resolves")
    void extractsFromTwoPartId() {
        assertEquals("1.21.1", PlatformRegistry.extractBaseMinecraftVersionId("fabric:1.21.1"));
    }

    @Test
    @DisplayName("a loader version is only present on a fully qualified id")
    void extractsLoaderVersion() {
        assertEquals("0.16.9", PlatformRegistry.extractLoaderVersion("fabric:1.21.1:0.16.9"));
        assertEquals("", PlatformRegistry.extractLoaderVersion("fabric:1.21.1"));
        assertEquals("", PlatformRegistry.extractLoaderVersion("1.21.1"));
        assertEquals("", PlatformRegistry.extractLoaderVersion(""));
        assertEquals("", PlatformRegistry.extractLoaderVersion(null));
    }

    @Test
    @DisplayName("a NeoForge version string containing dashes is kept whole")
    void keepsComplexLoaderVersions() {
        assertEquals("21.1.0-beta", PlatformRegistry.extractLoaderVersion("neoforge:1.21.1:21.1.0-beta"));
    }

    @Test
    @DisplayName("null and blank ids pass through unchanged")
    void toleratesBlankIds() {
        assertEquals(null, PlatformRegistry.extractBaseMinecraftVersionId(null));
        assertEquals("", PlatformRegistry.extractBaseMinecraftVersionId(""));
    }
}
