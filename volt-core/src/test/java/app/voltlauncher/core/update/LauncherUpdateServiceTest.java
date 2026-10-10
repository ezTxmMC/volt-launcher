package app.voltlauncher.core.update;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class LauncherUpdateServiceTest {

    @Test
    @DisplayName("versions compare numerically, not as strings")
    void comparesNumerically() {
        assertTrue(LauncherUpdateService.isNewer("0.10.0", "0.9.0"));
        assertFalse(LauncherUpdateService.isNewer("0.9.0", "0.10.0"));
        assertTrue(LauncherUpdateService.isNewer("1.0.0", "0.99.99"));
        assertFalse(LauncherUpdateService.isNewer("0.2.0", "0.2.0"));
    }

    @Test
    @DisplayName("a leading v and missing segments are handled")
    void toleratesTagFormatting() {
        assertTrue(LauncherUpdateService.isNewer("v0.3.0", "0.2.9"));
        assertTrue(LauncherUpdateService.isNewer("1.1", "1.0.9"));
        assertFalse(LauncherUpdateService.isNewer("1.0", "1.0.0"));
    }

    @Test
    @DisplayName("a pre-release ranks below the release it leads up to")
    void ordersPreReleases() {
        assertTrue(LauncherUpdateService.isNewer("1.0.0", "1.0.0-beta.1"));
        assertFalse(LauncherUpdateService.isNewer("1.0.0-beta.1", "1.0.0"));
        assertTrue(LauncherUpdateService.isNewer("1.0.1-beta.1", "1.0.0"));
    }

    @Test
    @DisplayName("a repository is accepted as owner/repo or as a full URL")
    void normalisesRepository() {
        assertEquals("ezTxmMC/Volt-Launcher",
                LauncherUpdateService.normalizeRepository("ezTxmMC/Volt-Launcher"));
        assertEquals("ezTxmMC/Volt-Launcher",
                LauncherUpdateService.normalizeRepository("https://github.com/ezTxmMC/Volt-Launcher"));
        assertEquals("ezTxmMC/Volt-Launcher",
                LauncherUpdateService.normalizeRepository("https://github.com/ezTxmMC/Volt-Launcher.git"));
        assertEquals("ezTxmMC/Volt-Launcher",
                LauncherUpdateService.normalizeRepository("  github.com/ezTxmMC/Volt-Launcher/  "));
        assertEquals("ezTxmMC/Volt-Launcher",
                LauncherUpdateService.normalizeRepository("https://www.github.com/ezTxmMC/Volt-Launcher"));
    }

    @Test
    @DisplayName("nonsense in the repository field is rejected with a clear message")
    void rejectsBadRepository() {
        assertThrows(IllegalArgumentException.class, () -> LauncherUpdateService.normalizeRepository(""));
        assertThrows(IllegalArgumentException.class, () -> LauncherUpdateService.normalizeRepository(null));
        assertThrows(IllegalArgumentException.class,
                () -> LauncherUpdateService.normalizeRepository("not a repo at all"));
    }

    @Test
    @DisplayName("an unreachable feed reports the reason instead of claiming to be up to date")
    void upToDateCarriesReason() {
        LauncherUpdateService.UpdateInfo info =
                LauncherUpdateService.UpdateInfo.upToDate("0.2.0", "offline");

        assertFalse(info.available());
        assertEquals("0.2.0", info.currentVersion());
        assertEquals("offline", info.checkedReason());
        assertFalse(info.toJson().getBoolean("downloadable"));
    }
}
