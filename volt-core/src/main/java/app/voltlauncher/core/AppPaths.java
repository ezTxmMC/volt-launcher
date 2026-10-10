package app.voltlauncher.core;

import java.nio.file.Path;

/**
 * Every on-disk location the launcher uses. Rooted at {@code ~/.voltlauncher} unless the
 * {@code voltlauncher.home} system property or {@code VOLTLAUNCHER_HOME} environment variable
 * points elsewhere, which lets the setup module install into a custom directory.
 */
public final class AppPaths {

    private static final String APP_DIRECTORY = ".voltlauncher";
    private static final String HOME_PROPERTY = "voltlauncher.home";
    private static final String HOME_ENV = "VOLTLAUNCHER_HOME";

    private AppPaths() {
    }

    public static Path baseDirectory() {
        String override = System.getProperty(HOME_PROPERTY, System.getenv(HOME_ENV));
        if (override != null && !override.isBlank()) {
            return Path.of(override.trim()).toAbsolutePath().normalize();
        }
        return Path.of(System.getProperty("user.home"), APP_DIRECTORY);
    }

    // ── security / accounts ───────────────────────────────────────────────────

    public static Path securityDirectory() {
        return baseDirectory().resolve("security");
    }

    public static Path authDirectory() {
        return baseDirectory().resolve("auth");
    }

    public static Path masterKeyPath() {
        return securityDirectory().resolve("master.key");
    }

    public static Path encryptedSessionPath() {
        return authDirectory().resolve("account-session.enc");
    }

    // ── launcher configuration ────────────────────────────────────────────────

    public static Path configDirectory() {
        return baseDirectory().resolve("config");
    }

    public static Path settingsPath() {
        return configDirectory().resolve("settings.json");
    }

    // ── instances ─────────────────────────────────────────────────────────────

    public static Path instancesDirectory() {
        return baseDirectory().resolve("instances");
    }

    public static Path instancesMetadataPath() {
        return instancesDirectory().resolve("instances.json");
    }

    /** Root of a single instance, holding both metadata and the game directory. */
    public static Path instanceDirectory(String slug) {
        return instancesDirectory().resolve(slug);
    }

    public static Path instanceGameDirectory(String slug) {
        return instanceDirectory(slug).resolve("game");
    }

    // ── shared game data ──────────────────────────────────────────────────────

    /**
     * Game data that is identical for every profile using the same Minecraft version: assets,
     * libraries, client jars and extracted natives.
     *
     * <p>These are content-addressed or version-scoped downloads that run to roughly a gigabyte
     * per Minecraft version, so they are stored once and reused. Only a profile's own files —
     * worlds, mods, configs, screenshots — live inside the instance directory.
     */
    public static Path sharedDirectory() {
        return baseDirectory().resolve("shared");
    }

    public static Path sharedAssetsDirectory() {
        return sharedDirectory().resolve("assets");
    }

    public static Path sharedLibrariesDirectory() {
        return sharedDirectory().resolve("libraries");
    }

    public static Path sharedVersionsDirectory() {
        return sharedDirectory().resolve("versions");
    }

    public static Path sharedNativesDirectory() {
        return sharedDirectory().resolve("natives");
    }

    // ── skins ─────────────────────────────────────────────────────────────────

    public static Path skinsDirectory() {
        return baseDirectory().resolve("skins");
    }

    public static Path skinsMetadataPath() {
        return skinsDirectory().resolve("skins.json");
    }

    /**
     * Location of a stored skin PNG. The id is expected to already be validated as a UUID by the
     * caller; it is joined into a path, so anything else must never reach here.
     */
    public static Path skinImagePath(String skinId) {
        return skinsDirectory().resolve(skinId + ".png");
    }

    // ── logs ──────────────────────────────────────────────────────────────────

    public static Path logsDirectory() {
        return baseDirectory().resolve("logs");
    }

    /** Per-profile game logs the launcher captured, one file per profile. */
    public static Path instanceLogPath(String slug) {
        return logsDirectory().resolve(slug + ".log");
    }

    // ── backups ───────────────────────────────────────────────────────────────

    /**
     * Snapshots of whole profiles. Kept outside the instance directory so deleting a profile
     * does not take its backups with it — restoring after an accidental delete is the point.
     */
    public static Path backupsDirectory() {
        return baseDirectory().resolve("backups");
    }

    public static Path instanceBackupsDirectory(String slug) {
        return backupsDirectory().resolve(slug);
    }

    // ── launcher updates ──────────────────────────────────────────────────────

    /** Where a downloaded launcher update is staged before the user runs it. */
    public static Path updatesDirectory() {
        return baseDirectory().resolve("updates");
    }

    // ── exports ───────────────────────────────────────────────────────────────

    /** Where exported modpack archives are written, so the user has one place to find them. */
    public static Path exportsDirectory() {
        return baseDirectory().resolve("exports");
    }

    // ── java runtimes ─────────────────────────────────────────────────────────

    public static Path runtimesDirectory() {
        return baseDirectory().resolve("runtimes");
    }

    public static Path temurinRuntimesDirectory() {
        return runtimesDirectory().resolve("temurin");
    }

    public static Path runtimeDownloadsDirectory() {
        return runtimesDirectory().resolve("downloads");
    }

    // ── caches ────────────────────────────────────────────────────────────────

    public static Path cacheDirectory() {
        return baseDirectory().resolve("cache");
    }

    /**
     * Mod-loader installer JARs. Cached under the launcher home rather than the system temp
     * directory: installers are immutable per release and run to tens of megabytes each.
     */
    public static Path installerCacheDirectory() {
        return cacheDirectory().resolve("installers");
    }

    /** Downloaded provider content awaiting installation into an instance. */
    public static Path downloadCacheDirectory() {
        return cacheDirectory().resolve("downloads");
    }
}
