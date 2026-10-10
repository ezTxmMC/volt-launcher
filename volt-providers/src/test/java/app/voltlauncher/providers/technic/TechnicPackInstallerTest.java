package app.voltlauncher.providers.technic;

import org.json.JSONObject;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

class TechnicPackInstallerTest {

    @Test
    @DisplayName("a Solder build with Forge resolves to a forge-qualified version id")
    void resolvesSolderForgeBuilds() {
        JSONObject build = new JSONObject().put("minecraft", "1.7.10").put("forge", "10.13.4.1614");
        assertEquals("forge:1.7.10:10.13.4.1614", TechnicPackInstaller.versionIdFromSolder(build));
    }

    @Test
    @DisplayName("a Solder build without Forge is plain Minecraft")
    void resolvesSolderVanillaBuilds() {
        assertEquals("1.7.10", TechnicPackInstaller.versionIdFromSolder(
                new JSONObject().put("minecraft", "1.7.10")));
        assertEquals("1.7.10", TechnicPackInstaller.versionIdFromSolder(
                new JSONObject().put("minecraft", "1.7.10").put("forge", JSONObject.NULL)));
        assertEquals("1.7.10", TechnicPackInstaller.versionIdFromSolder(
                new JSONObject().put("minecraft", "1.7.10").put("forge", "")));
    }

    @Test
    @DisplayName("a Solder build with no Minecraft version is refused")
    void refusesSolderBuildWithoutMinecraft() {
        assertThrows(IllegalStateException.class,
                () -> TechnicPackInstaller.versionIdFromSolder(new JSONObject()));
    }

    @Test
    @DisplayName("Technic's merged version id yields the Minecraft and Forge halves")
    void resolvesMergedVersionIds() {
        assertEquals("forge:1.7.10:10.13.4.1614", TechnicPackInstaller.versionIdFromVersionJson(
                new JSONObject().put("id", "1.7.10-Forge10.13.4.1614-1.7.10")));
        assertEquals("forge:1.12.2:14.23.5.2859", TechnicPackInstaller.versionIdFromVersionJson(
                new JSONObject().put("id", "1.12.2-forge-14.23.5.2859")));
    }

    @Test
    @DisplayName("inheritsFrom names the Minecraft version when the id does not")
    void usesInheritsFrom() {
        assertEquals("forge:1.16.5:36.2.39", TechnicPackInstaller.versionIdFromVersionJson(
                new JSONObject().put("id", "forge-36.2.39").put("inheritsFrom", "1.16.5")));
    }

    @Test
    @DisplayName("a version.json with no Forge reference is a vanilla profile")
    void resolvesVanillaVersionJson() {
        assertEquals("1.7.10", TechnicPackInstaller.versionIdFromVersionJson(
                new JSONObject().put("id", "1.7.10")));
    }

    @Test
    @DisplayName("a version.json naming no Minecraft version at all is refused")
    void refusesUnusableVersionJson() {
        assertThrows(IllegalStateException.class, () -> TechnicPackInstaller.versionIdFromVersionJson(
                new JSONObject().put("id", "custom-build")));
    }

    @Test
    @DisplayName("the Minecraft version is read off the front of a merged id")
    void extractsMinecraftVersion() {
        assertEquals("1.7.10", TechnicPackInstaller.minecraftFromId("1.7.10-Forge10.13.4.1614"));
        assertEquals("1.12", TechnicPackInstaller.minecraftFromId("1.12-forge"));
        assertEquals("", TechnicPackInstaller.minecraftFromId("forge-only"));
        assertEquals("", TechnicPackInstaller.minecraftFromId(null));
    }

    @Test
    @DisplayName("a Forge version carrying the Minecraft prefix is trimmed back down")
    void normalisesForgeVersion() {
        assertEquals("47.2.0", TechnicPackInstaller.normalizeForgeVersion("1.20.1", "1.20.1-47.2.0"));
        assertEquals("47.2.0", TechnicPackInstaller.normalizeForgeVersion("1.20.1", "47.2.0"));
        assertEquals("47.2.0", TechnicPackInstaller.normalizeForgeVersion("1.20.1", "  47.2.0  "));
    }

    @Test
    @DisplayName("a pack slug is accepted bare or as a platform URL")
    void normalisesSlugs() {
        assertEquals("attack-of-the-bteam", TechnicProvider.normalizeSlug("attack-of-the-bteam"));
        assertEquals("attack-of-the-bteam", TechnicProvider.normalizeSlug(
                "https://www.technicpack.net/modpack/attack-of-the-bteam.90000"));
        assertEquals("tekkit", TechnicProvider.normalizeSlug(
                "https://www.technicpack.net/modpack/tekkit"));
        assertEquals("tekkit", TechnicProvider.normalizeSlug("  tekkit  "));
    }

    @Test
    @DisplayName("a blank slug is refused")
    void refusesBlankSlug() {
        assertThrows(IllegalArgumentException.class, () -> TechnicProvider.normalizeSlug(""));
        assertThrows(IllegalArgumentException.class, () -> TechnicProvider.normalizeSlug(null));
    }

    @Test
    @DisplayName("a build id splits into its slug and build halves")
    void parsesBuildIds() {
        TechnicProvider.PackRef ref = TechnicProvider.PackRef.parse("tekkit:1.2.9g");
        assertEquals("tekkit", ref.slug());
        assertEquals("1.2.9g", ref.build());

        assertThrows(IllegalArgumentException.class, () -> TechnicProvider.PackRef.parse("tekkit"));
        assertThrows(IllegalArgumentException.class, () -> TechnicProvider.PackRef.parse(":1.0"));
        assertThrows(IllegalArgumentException.class, () -> TechnicProvider.PackRef.parse("tekkit:"));
    }
}
