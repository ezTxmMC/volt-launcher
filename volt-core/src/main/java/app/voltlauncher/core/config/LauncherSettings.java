package app.voltlauncher.core.config;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/**
 * Launcher-wide preferences. Every field has a usable default so a missing or partially written
 * settings file never leaves the launcher unusable.
 */
public record LauncherSettings(
        String language,
        String accentColor,
        String uiScale,
        boolean animationsEnabled,
        boolean showFps,
        boolean discordPresence,
        String discordApplicationId,
        boolean hideLauncherOnLaunch,
        boolean openLogsOnLaunch,
        boolean autoUpdate,
        boolean betaUpdates,
        String updateRepository,
        int defaultMaxMemoryMb,
        int defaultMinMemoryMb,
        String defaultJvmArgs,
        int maxConcurrentDownloads,
        int backupsToKeep,
        boolean backupBeforePackUpdate,
        String profileSort,
        boolean favouritesFirst,
        boolean offlineModeAllowed,
        String curseForgeBridgeUrl,
        List<JavaRuntimeEntry> javaRuntimes) {

    public static final String DEFAULT_LANGUAGE = "en";
    public static final String DEFAULT_ACCENT = "#00b2ff";
    public static final String DEFAULT_UI_SCALE = "default";
    public static final String DEFAULT_JVM_ARGS = "-XX:+UseG1GC -XX:+ParallelRefProcEnabled";
    public static final String DEFAULT_BRIDGE_URL = "http://localhost:8787";
    /** {@code owner/repo} the update check reads releases from. */
    public static final String DEFAULT_UPDATE_REPOSITORY = "ezTxmMC/Volt-Launcher";
    public static final String DEFAULT_PROFILE_SORT = "lastPlayed";
    /**
     * Rich presence needs an application registered by whoever ships the launcher — the id also
     * decides which artwork Discord shows — so there is no sensible built-in default. Blank means
     * the feature stays off and says why.
     */
    public static final String DEFAULT_DISCORD_APPLICATION_ID = "";

    private static final List<String> SUPPORTED_LANGUAGES = List.of("en", "de");
    private static final List<String> SUPPORTED_SCALES = List.of("compact", "default", "comfortable");
    private static final List<String> SUPPORTED_PROFILE_SORTS =
            List.of("lastplayed", "name", "playtime", "created");

    /** A user-supplied Java installation, pinned to the major version it provides. */
    public record JavaRuntimeEntry(int majorVersion, String path) {
        public JSONObject toJson() {
            return new JSONObject()
                    .put("majorVersion", majorVersion)
                    .put("path", path == null ? "" : path);
        }

        public static JavaRuntimeEntry fromJson(JSONObject json) {
            return new JavaRuntimeEntry(json.optInt("majorVersion", 0), json.optString("path", ""));
        }
    }

    /** Normalises out-of-range values rather than rejecting them, so a hand-edited file still loads. */
    public LauncherSettings {
        language = SUPPORTED_LANGUAGES.contains(lower(language)) ? lower(language) : DEFAULT_LANGUAGE;
        accentColor = isHexColor(accentColor) ? accentColor : DEFAULT_ACCENT;
        uiScale = SUPPORTED_SCALES.contains(lower(uiScale)) ? lower(uiScale) : DEFAULT_UI_SCALE;
        updateRepository = blankTo(updateRepository, DEFAULT_UPDATE_REPOSITORY);
        discordApplicationId = discordApplicationId == null ? "" : discordApplicationId.trim();
        defaultMaxMemoryMb = clamp(defaultMaxMemoryMb, 512, 65_536, 4096);
        defaultMinMemoryMb = clamp(defaultMinMemoryMb, 256, defaultMaxMemoryMb, Math.min(1024, defaultMaxMemoryMb));
        defaultJvmArgs = defaultJvmArgs == null ? DEFAULT_JVM_ARGS : defaultJvmArgs;
        maxConcurrentDownloads = clamp(maxConcurrentDownloads, 1, 32, 8);
        backupsToKeep = clamp(backupsToKeep, 0, 50, 5);
        profileSort = normalizeProfileSort(profileSort);
        curseForgeBridgeUrl = blankTo(curseForgeBridgeUrl, DEFAULT_BRIDGE_URL);
        javaRuntimes = javaRuntimes == null ? List.of() : List.copyOf(javaRuntimes);
    }

    public static LauncherSettings defaults() {
        return new LauncherSettings(
                DEFAULT_LANGUAGE, DEFAULT_ACCENT, DEFAULT_UI_SCALE,
                true, false, true, DEFAULT_DISCORD_APPLICATION_ID, false, false, true, false,
                DEFAULT_UPDATE_REPOSITORY,
                4096, 1024, DEFAULT_JVM_ARGS, 8,
                5, true, DEFAULT_PROFILE_SORT, true, true,
                DEFAULT_BRIDGE_URL, List.of());
    }

    public static LauncherSettings fromJson(JSONObject json) {
        if (json == null) return defaults();
        LauncherSettings fallback = defaults();

        List<JavaRuntimeEntry> runtimes = new ArrayList<>();
        JSONArray runtimeArray = json.optJSONArray("javaRuntimes");
        if (runtimeArray != null) {
            for (int i = 0; i < runtimeArray.length(); i++) {
                JSONObject entry = runtimeArray.optJSONObject(i);
                if (entry != null) runtimes.add(JavaRuntimeEntry.fromJson(entry));
            }
        }

        return new LauncherSettings(
                json.optString("language", fallback.language()),
                json.optString("accentColor", fallback.accentColor()),
                json.optString("uiScale", fallback.uiScale()),
                json.optBoolean("animationsEnabled", fallback.animationsEnabled()),
                json.optBoolean("showFps", fallback.showFps()),
                json.optBoolean("discordPresence", fallback.discordPresence()),
                json.optString("discordApplicationId", fallback.discordApplicationId()),
                json.optBoolean("hideLauncherOnLaunch", fallback.hideLauncherOnLaunch()),
                json.optBoolean("openLogsOnLaunch", fallback.openLogsOnLaunch()),
                json.optBoolean("autoUpdate", fallback.autoUpdate()),
                json.optBoolean("betaUpdates", fallback.betaUpdates()),
                json.optString("updateRepository", fallback.updateRepository()),
                json.optInt("defaultMaxMemoryMb", fallback.defaultMaxMemoryMb()),
                json.optInt("defaultMinMemoryMb", fallback.defaultMinMemoryMb()),
                json.optString("defaultJvmArgs", fallback.defaultJvmArgs()),
                json.optInt("maxConcurrentDownloads", fallback.maxConcurrentDownloads()),
                json.optInt("backupsToKeep", fallback.backupsToKeep()),
                json.optBoolean("backupBeforePackUpdate", fallback.backupBeforePackUpdate()),
                json.optString("profileSort", fallback.profileSort()),
                json.optBoolean("favouritesFirst", fallback.favouritesFirst()),
                json.optBoolean("offlineModeAllowed", fallback.offlineModeAllowed()),
                json.optString("curseForgeBridgeUrl", fallback.curseForgeBridgeUrl()),
                runtimes);
    }

    public JSONObject toJson() {
        JSONArray runtimeArray = new JSONArray();
        javaRuntimes.forEach(entry -> runtimeArray.put(entry.toJson()));

        return new JSONObject()
                .put("language", language)
                .put("accentColor", accentColor)
                .put("uiScale", uiScale)
                .put("animationsEnabled", animationsEnabled)
                .put("showFps", showFps)
                .put("discordPresence", discordPresence)
                .put("discordApplicationId", discordApplicationId)
                .put("hideLauncherOnLaunch", hideLauncherOnLaunch)
                .put("openLogsOnLaunch", openLogsOnLaunch)
                .put("autoUpdate", autoUpdate)
                .put("betaUpdates", betaUpdates)
                .put("updateRepository", updateRepository)
                .put("defaultMaxMemoryMb", defaultMaxMemoryMb)
                .put("defaultMinMemoryMb", defaultMinMemoryMb)
                .put("defaultJvmArgs", defaultJvmArgs)
                .put("maxConcurrentDownloads", maxConcurrentDownloads)
                .put("backupsToKeep", backupsToKeep)
                .put("backupBeforePackUpdate", backupBeforePackUpdate)
                .put("profileSort", profileSort)
                .put("favouritesFirst", favouritesFirst)
                .put("offlineModeAllowed", offlineModeAllowed)
                .put("curseForgeBridgeUrl", curseForgeBridgeUrl)
                .put("javaRuntimes", runtimeArray);
    }

    /** Whether rich presence is both switched on and configured with an application id. */
    public boolean discordPresenceUsable() {
        return discordPresence && !discordApplicationId.isBlank();
    }

    /** Returns the configured path for a Java major version, or {@code null} to auto-detect. */
    public String javaPathFor(int majorVersion) {
        return javaRuntimes.stream()
                .filter(entry -> entry.majorVersion() == majorVersion)
                .map(JavaRuntimeEntry::path)
                .filter(path -> path != null && !path.isBlank())
                .findFirst()
                .orElse(null);
    }

    private static String normalizeProfileSort(String value) {
        String normalized = lower(value);
        for (String supported : SUPPORTED_PROFILE_SORTS) {
            if (supported.equals(normalized)) {
                // Stored in the camelCase form the UI uses, whatever casing arrived.
                return switch (supported) {
                    case "lastplayed" -> "lastPlayed";
                    default -> supported;
                };
            }
        }
        return DEFAULT_PROFILE_SORT;
    }

    private static String lower(String value) {
        return value == null ? "" : value.trim().toLowerCase(Locale.ROOT);
    }

    private static String blankTo(String value, String fallback) {
        return value == null || value.isBlank() ? fallback : value.trim();
    }

    private static boolean isHexColor(String value) {
        return value != null && value.matches("#[0-9a-fA-F]{6}");
    }

    private static int clamp(int value, int min, int max, int fallback) {
        if (value < min || value > max) return Math.min(Math.max(fallback, min), max);
        return value;
    }
}
