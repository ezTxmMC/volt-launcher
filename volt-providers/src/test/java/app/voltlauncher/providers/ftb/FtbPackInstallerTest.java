package app.voltlauncher.providers.ftb;

import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class FtbPackInstallerTest {

    private static JSONObject release(String minecraft, String loaderName, String loaderVersion) {
        JSONArray targets = new JSONArray()
                .put(new JSONObject().put("type", "game").put("name", "minecraft").put("version", minecraft));
        if (loaderName != null) {
            targets.put(new JSONObject()
                    .put("type", "modloader").put("name", loaderName).put("version", loaderVersion));
        }
        return new JSONObject().put("targets", targets);
    }

    @Test
    @DisplayName("a Forge pack resolves to a forge-qualified version id")
    void resolvesForgePacks() {
        assertEquals("forge:1.20.1:47.2.0",
                FtbPackInstaller.resolveVersionId(release("1.20.1", "forge", "47.2.0")));
    }

    @Test
    @DisplayName("every loader FTB ships is recognised")
    void resolvesEveryLoader() {
        assertEquals("neoforge:1.21.1:21.1.65",
                FtbPackInstaller.resolveVersionId(release("1.21.1", "neoforge", "21.1.65")));
        assertEquals("fabric:1.21.1:0.16.9",
                FtbPackInstaller.resolveVersionId(release("1.21.1", "fabric", "0.16.9")));
        assertEquals("quilt:1.20.1:0.21.0",
                FtbPackInstaller.resolveVersionId(release("1.20.1", "quilt", "0.21.0")));
    }

    @Test
    @DisplayName("a pack with no loader is a plain Minecraft version")
    void resolvesVanillaPacks() {
        assertEquals("1.20.1", FtbPackInstaller.resolveVersionId(release("1.20.1", null, null)));
    }

    @Test
    @DisplayName("an unknown loader falls back to vanilla rather than inventing a platform")
    void ignoresUnknownLoaders() {
        assertEquals("1.20.1", FtbPackInstaller.resolveVersionId(release("1.20.1", "rift", "1.0.0")));
    }

    @Test
    @DisplayName("a loader entry with no version is skipped")
    void ignoresVersionlessLoader() {
        assertEquals("1.20.1", FtbPackInstaller.resolveVersionId(release("1.20.1", "forge", "")));
    }

    @Test
    @DisplayName("a release without a Minecraft target is refused with a clear message")
    void refusesReleaseWithoutMinecraft() {
        JSONObject release = new JSONObject().put("targets", new JSONArray());
        assertThrows(IllegalStateException.class, () -> FtbPackInstaller.resolveVersionId(release));
    }

    @Test
    @DisplayName("FTB's ./mods/ paths are normalised into plain relative paths")
    void normalisesPaths() {
        assertEquals("mods/jei.jar", FtbPackInstaller.joinPath("./mods/", "jei.jar"));
        assertEquals("mods/jei.jar", FtbPackInstaller.joinPath("mods", "jei.jar"));
        assertEquals("mods/jei.jar", FtbPackInstaller.joinPath("/mods/", "jei.jar"));
        assertEquals("config/foo/bar.toml", FtbPackInstaller.joinPath("./config/foo", "bar.toml"));
        assertEquals("options.txt", FtbPackInstaller.joinPath("./", "options.txt"));
        assertEquals("options.txt", FtbPackInstaller.joinPath("", "options.txt"));
        assertEquals("options.txt", FtbPackInstaller.joinPath(null, "options.txt"));
    }

    @Test
    @DisplayName("a path trying to escape the profile is rejected outright")
    void rejectsEscapingPaths() {
        assertNull(FtbPackInstaller.joinPath("../../etc", "passwd"));
        assertNull(FtbPackInstaller.joinPath("./mods/..", "evil.jar"));
    }

    @Test
    @DisplayName("targets are split into game versions and loaders")
    void readsTargets() {
        List<String> gameVersions = new ArrayList<>();
        List<String> loaders = new ArrayList<>();
        FtbProvider.readTargets(release("1.20.1", "forge", "47.2.0"), gameVersions, loaders);

        assertEquals(List.of("1.20.1"), gameVersions);
        assertEquals(List.of("forge"), loaders);
    }

    @Test
    @DisplayName("a release with no targets block yields nothing rather than failing")
    void readsMissingTargets() {
        List<String> gameVersions = new ArrayList<>();
        List<String> loaders = new ArrayList<>();
        FtbProvider.readTargets(new JSONObject(), gameVersions, loaders);

        assertTrue(gameVersions.isEmpty());
        assertTrue(loaders.isEmpty());
    }

    @Test
    @DisplayName("epoch seconds become ISO timestamps, and zero becomes blank")
    void formatsDates() {
        assertEquals("2021-01-01T00:00:00Z", FtbProvider.isoDate(1609459200L));
        assertEquals("", FtbProvider.isoDate(0L));
        assertEquals("", FtbProvider.isoDate(-5L));
    }

    @Test
    @DisplayName("a release id splits into its pack and version halves")
    void parsesPackRefs() {
        FtbProvider.PackRef ref = FtbProvider.PackRef.parse("91:1234");
        assertEquals("91", ref.packId());
        assertEquals("1234", ref.versionId());

        assertThrows(IllegalArgumentException.class, () -> FtbProvider.PackRef.parse("91"));
        assertThrows(IllegalArgumentException.class, () -> FtbProvider.PackRef.parse(":1234"));
        assertThrows(IllegalArgumentException.class, () -> FtbProvider.PackRef.parse("91:"));
        assertThrows(IllegalArgumentException.class, () -> FtbProvider.PackRef.parse(null));
    }
}
