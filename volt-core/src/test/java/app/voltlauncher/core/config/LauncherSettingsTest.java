package app.voltlauncher.core.config;

import org.json.JSONObject;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class LauncherSettingsTest {

    @Test
    @DisplayName("defaults survive a JSON round trip unchanged")
    void roundTripsDefaults() {
        LauncherSettings defaults = LauncherSettings.defaults();
        assertEquals(defaults, LauncherSettings.fromJson(defaults.toJson()));
    }

    @Test
    @DisplayName("a settings file written by an older build still loads")
    void acceptsPartialJson() {
        LauncherSettings settings = LauncherSettings.fromJson(new JSONObject().put("language", "de"));

        assertEquals("de", settings.language());
        assertEquals(LauncherSettings.defaults().defaultMaxMemoryMb(), settings.defaultMaxMemoryMb());
        assertEquals(LauncherSettings.DEFAULT_UPDATE_REPOSITORY, settings.updateRepository());
        assertEquals(5, settings.backupsToKeep());
    }

    @Test
    @DisplayName("a hand-edited file with nonsense values is normalised, not rejected")
    void normalisesOutOfRangeValues() {
        LauncherSettings settings = new LauncherSettings(
                "klingon", "not-a-colour", "gigantic",
                true, false, true, "", false, false, true, false, "  ",
                -5, 999_999, null, 500,
                -3, true, "sideways", true, true,
                "  ", null);

        assertEquals(LauncherSettings.DEFAULT_LANGUAGE, settings.language());
        assertEquals(LauncherSettings.DEFAULT_ACCENT, settings.accentColor());
        assertEquals(LauncherSettings.DEFAULT_UI_SCALE, settings.uiScale());
        assertEquals(LauncherSettings.DEFAULT_UPDATE_REPOSITORY, settings.updateRepository());
        assertEquals(LauncherSettings.DEFAULT_JVM_ARGS, settings.defaultJvmArgs());
        assertEquals(LauncherSettings.DEFAULT_BRIDGE_URL, settings.curseForgeBridgeUrl());
        assertEquals(LauncherSettings.DEFAULT_PROFILE_SORT, settings.profileSort());
        assertEquals(4096, settings.defaultMaxMemoryMb());
        // An out-of-range value falls back to the default rather than being clamped to the bound:
        // 500 simultaneous downloads is a typo, not a request for 32.
        assertEquals(8, settings.maxConcurrentDownloads());
        assertEquals(5, settings.backupsToKeep());
        assertTrue(settings.javaRuntimes().isEmpty());
    }

    @Test
    @DisplayName("the minimum heap can never exceed the maximum")
    void clampsMinimumToMaximum() {
        LauncherSettings settings = LauncherSettings.fromJson(new JSONObject()
                .put("defaultMaxMemoryMb", 2048)
                .put("defaultMinMemoryMb", 8192));

        assertEquals(2048, settings.defaultMaxMemoryMb());
        assertTrue(settings.defaultMinMemoryMb() <= settings.defaultMaxMemoryMb());
    }

    @Test
    @DisplayName("profile sort accepts any casing and rejects unknown values")
    void normalisesProfileSort() {
        assertEquals("lastPlayed", LauncherSettings.fromJson(
                new JSONObject().put("profileSort", "LASTPLAYED")).profileSort());
        assertEquals("playtime", LauncherSettings.fromJson(
                new JSONObject().put("profileSort", "Playtime")).profileSort());
        assertEquals(LauncherSettings.DEFAULT_PROFILE_SORT, LauncherSettings.fromJson(
                new JSONObject().put("profileSort", "colour")).profileSort());
    }

    @Test
    @DisplayName("a pinned Java path is found by major version")
    void findsConfiguredJavaPath() {
        LauncherSettings settings = LauncherSettings.defaults();
        LauncherSettings withRuntimes = new LauncherSettings(
                settings.language(), settings.accentColor(), settings.uiScale(),
                settings.animationsEnabled(), settings.showFps(), settings.discordPresence(),
                settings.discordApplicationId(), settings.hideLauncherOnLaunch(), settings.openLogsOnLaunch(),
                settings.autoUpdate(), settings.betaUpdates(), settings.updateRepository(),
                settings.defaultMaxMemoryMb(), settings.defaultMinMemoryMb(), settings.defaultJvmArgs(),
                settings.maxConcurrentDownloads(), settings.backupsToKeep(),
                settings.backupBeforePackUpdate(), settings.profileSort(), settings.favouritesFirst(),
                settings.offlineModeAllowed(), settings.curseForgeBridgeUrl(),
                List.of(new LauncherSettings.JavaRuntimeEntry(21, "/opt/jdk21"),
                        new LauncherSettings.JavaRuntimeEntry(17, "  ")));

        assertEquals("/opt/jdk21", withRuntimes.javaPathFor(21));
        // A blank path is no configuration at all and must fall through to auto-detection.
        assertEquals(null, withRuntimes.javaPathFor(17));
        assertEquals(null, withRuntimes.javaPathFor(8));
    }

    @Test
    @DisplayName("rich presence stays off until an application id is configured")
    void requiresApplicationIdForPresence() {
        assertTrue(LauncherSettings.defaults().discordPresence());
        assertFalse(LauncherSettings.defaults().discordPresenceUsable());

        LauncherSettings configured = LauncherSettings.fromJson(
                new JSONObject().put("discordApplicationId", " 123456789 "));
        assertEquals("123456789", configured.discordApplicationId());
        assertTrue(configured.discordPresenceUsable());
    }
}
