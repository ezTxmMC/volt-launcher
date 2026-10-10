package app.voltlauncher.providers.model;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class ProviderModelTest {

    @Test
    @DisplayName("every provider is addressable by its id")
    void resolvesEveryProvider() {
        assertEquals(ProviderId.MODRINTH, ProviderId.fromId("modrinth"));
        assertEquals(ProviderId.CURSEFORGE, ProviderId.fromId("CurseForge"));
        assertEquals(ProviderId.TECHNIC, ProviderId.fromId(" technic "));
        assertEquals(ProviderId.FTB, ProviderId.fromId("FTB"));
    }

    @Test
    @DisplayName("the long-form names people write are accepted too")
    void acceptsAlternateNames() {
        assertEquals(ProviderId.TECHNIC, ProviderId.fromId("technicpack"));
        assertEquals(ProviderId.FTB, ProviderId.fromId("feed-the-beast"));
        assertEquals(ProviderId.FTB, ProviderId.fromId("modpacks.ch"));
    }

    @Test
    @DisplayName("an unknown or missing provider is refused")
    void refusesUnknownProviders() {
        assertThrows(IllegalArgumentException.class, () -> ProviderId.fromId("curse"));
        assertThrows(IllegalArgumentException.class, () -> ProviderId.fromId(""));
        assertThrows(IllegalArgumentException.class, () -> ProviderId.fromId(null));
    }

    @Test
    @DisplayName("content kinds map onto the folder they install into")
    void mapsKindsToFolders() {
        assertEquals("mods", ContentKind.MOD.contentType().folder());
        assertEquals("resourcepacks", ContentKind.RESOURCEPACK.contentType().folder());
        assertEquals("shaderpacks", ContentKind.SHADER.contentType().folder());
        assertEquals("datapacks", ContentKind.DATAPACK.contentType().folder());
        assertNull(ContentKind.MODPACK.contentType());
        assertFalse(ContentKind.MODPACK.installsIntoInstance());
        assertTrue(ContentKind.MOD.installsIntoInstance());
    }

    @Test
    @DisplayName("the plural names the UI tabs use resolve to a kind")
    void acceptsPluralKindNames() {
        assertEquals(ContentKind.MOD, ContentKind.fromId("mods"));
        assertEquals(ContentKind.MODPACK, ContentKind.fromId("modpacks"));
        assertEquals(ContentKind.SHADER, ContentKind.fromId("shaderpacks"));
        assertEquals(ContentKind.DATAPACK, ContentKind.fromId("datapacks"));
        assertThrows(IllegalArgumentException.class, () -> ContentKind.fromId("plugins"));
    }

    @Test
    @DisplayName("a search query normalises its own paging and defaults")
    void normalisesSearchQuery() {
        SearchQuery query = new SearchQuery("  sodium  ", null, "  ", null, null, null, -5, 0);

        assertEquals("sodium", query.query());
        assertTrue(query.hasQuery());
        assertEquals(ContentKind.MOD, query.kind());
        assertNull(query.gameVersion());
        assertEquals("relevance", query.sort());
        assertEquals(0, query.offset());
        assertEquals(SearchQuery.DEFAULT_LIMIT, query.limit());

        assertEquals(SearchQuery.MAX_LIMIT, new SearchQuery("", null, null, null, null, null, 0, 999).limit());
    }

    @Test
    @DisplayName("a version with no download URL is not installable")
    void reportsDownloadability() {
        ProjectVersion undownloadable = new ProjectVersion(ProviderId.CURSEFORGE, "1", "p", "n", "1.0",
                null, null, "release", "", "a.jar", "", 0L, "", null);
        assertFalse(undownloadable.isDownloadable());
        assertFalse(undownloadable.toJson().getBoolean("downloadable"));

        ProjectVersion downloadable = new ProjectVersion(ProviderId.MODRINTH, "1", "p", "n", "1.0",
                null, null, "release", "https://example.invalid/a.jar", "a.jar", "", 0L, "", null);
        assertTrue(downloadable.isDownloadable());
    }

    @Test
    @DisplayName("only a required dependency counts as one")
    void classifiesDependencies() {
        assertTrue(new VersionDependency("p", "", "required").isRequired());
        assertTrue(new VersionDependency("p", "", "REQUIRED").isRequired());
        assertFalse(new VersionDependency("p", "", "optional").isRequired());
        assertFalse(new VersionDependency("p", "", null).isRequired());
    }
}
