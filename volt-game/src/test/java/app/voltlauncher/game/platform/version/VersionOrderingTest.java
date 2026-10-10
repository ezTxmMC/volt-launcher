package app.voltlauncher.game.platform.version;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class VersionOrderingTest {

    private static AvailableVersion version(String id, String time) {
        return new AvailableVersion(id, "release", time);
    }

    @Test
    @DisplayName("release time decides the order when both versions have one")
    void sortsByReleaseTimeDescending() {
        List<AvailableVersion> versions = new ArrayList<>(List.of(
                version("1.20.1", "2023-06-12T10:00:00Z"),
                version("1.21.1", "2024-08-08T10:00:00Z"),
                version("1.19.4", "2023-03-14T10:00:00Z")));

        VersionOrdering.sortNewestFirst(versions);

        assertEquals(List.of("1.21.1", "1.20.1", "1.19.4"),
                versions.stream().map(AvailableVersion::id).toList());
    }

    @Test
    @DisplayName("versions with a release time come before those without one")
    void datedVersionsSortFirst() {
        List<AvailableVersion> versions = new ArrayList<>(List.of(
                version("undated", ""),
                version("1.20.1", "2023-06-12T10:00:00Z")));

        VersionOrdering.sortNewestFirst(versions);
        assertEquals("1.20.1", versions.getFirst().id());
    }

    @Test
    @DisplayName("numeric segments compare as numbers, so 0.10 beats 0.9")
    void comparesSegmentsNumerically() {
        assertTrue(VersionOrdering.compareVersionIdAsc("0.9.0", "0.10.0") < 0);
        assertTrue(VersionOrdering.compareVersionIdAsc("1.20.10", "1.20.9") > 0);
        assertEquals(0, VersionOrdering.compareVersionIdAsc("1.21.1", "1.21.1"));
    }

    @Test
    @DisplayName("leading zeroes do not change a segment's value")
    void ignoresLeadingZeroes() {
        assertEquals(0, VersionOrdering.compareVersionIdAsc("1.007.0", "1.7.0"));
        assertTrue(VersionOrdering.compareVersionIdAsc("1.007.0", "1.8.0") < 0);
    }

    @Test
    @DisplayName("a numeric segment outranks a text one")
    void numbersBeatText() {
        assertTrue(VersionOrdering.compareVersionIdAsc("1.2.0", "1.rc.0") > 0);
    }

    @Test
    @DisplayName("a longer id sorts after an otherwise identical shorter one")
    void longerIdSortsLater() {
        assertTrue(VersionOrdering.compareVersionIdAsc("1.21", "1.21.1") < 0);
    }

    @Test
    @DisplayName("loader-qualified ids are tokenised on their separators too")
    void handlesLoaderQualifiedIds() {
        assertTrue(VersionOrdering.compareVersionIdAsc(
                "fabric:1.21.1:0.16.9", "fabric:1.21.1:0.16.10") < 0);
    }

    @Test
    @DisplayName("descending is exactly the inverse of ascending")
    void descendingMirrorsAscending() {
        assertEquals(-VersionOrdering.compareVersionIdAsc("1.20", "1.21"),
                VersionOrdering.compareVersionIdDesc("1.20", "1.21"));
    }

    @Test
    @DisplayName("blank and null ids do not blow up the comparator")
    void toleratesEmptyIds() {
        assertEquals(0, VersionOrdering.compareVersionIdAsc(null, ""));
        assertTrue(VersionOrdering.compareVersionIdAsc("", "1.0") < 0);
    }
}
