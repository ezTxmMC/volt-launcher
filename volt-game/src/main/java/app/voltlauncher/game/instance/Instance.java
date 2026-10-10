package app.voltlauncher.game.instance;

import app.voltlauncher.core.AppPaths;

import java.nio.file.Path;

/**
 * A launcher profile. The {@code slug} is the stable on-disk identity and never changes once
 * created, so renaming a profile leaves its game directory (and the user's worlds, mods and
 * configs) untouched.
 *
 * @param totalPlaytimeMs time spent in the game across every session, accumulated on exit
 * @param favourite       pinned by the user, sorted to the front of the grid
 * @param groupName       user-defined folder the profile appears under; blank means ungrouped
 * @param iconUrl         artwork the user picked for the card; blank falls back to the pack icon
 */
public record Instance(
        String name,
        String slug,
        String versionId,
        String versionType,
        long createdAt,
        long lastPlayedAt,
        long totalPlaytimeMs,
        int javaMajorVersion,
        String javaComponent,
        boolean favourite,
        String groupName,
        String iconUrl,
        InstanceSettings settings) {

    public Instance {
        if (settings == null) settings = InstanceSettings.defaults();
        groupName = groupName == null ? "" : groupName.trim();
        iconUrl = iconUrl == null ? "" : iconUrl.trim();
        totalPlaytimeMs = Math.max(0L, totalPlaytimeMs);
    }

    /** Creates a profile with only the fields a fresh instance needs, defaulting the rest. */
    public static Instance create(String name, String slug, String versionId, String versionType,
                                  long createdAt, int javaMajorVersion, String javaComponent) {
        return new Instance(name, slug, versionId, versionType, createdAt, 0L, 0L,
                javaMajorVersion, javaComponent, false, "", "", InstanceSettings.defaults());
    }

    public Path directory() {
        return AppPaths.instanceDirectory(slug);
    }

    /**
     * Where the game runs. A profile can point at a directory of its own — for a world collection
     * on another drive, or a shared directory across profiles — in which case that wins.
     */
    public Path gameDirectory() {
        String override = settings.gameDirectory();
        if (override != null && !override.isBlank()) {
            return Path.of(override.trim()).toAbsolutePath().normalize();
        }
        return AppPaths.instanceGameDirectory(slug);
    }

    /** The profile's own directory inside the launcher home, regardless of any override. */
    public Path managedGameDirectory() {
        return AppPaths.instanceGameDirectory(slug);
    }

    public boolean hasJavaRequirement() {
        return javaMajorVersion > 0;
    }

    public boolean hasCustomGameDirectory() {
        return settings.gameDirectory() != null && !settings.gameDirectory().isBlank();
    }

    public Instance withSettings(InstanceSettings newSettings) {
        return new Instance(name, slug, versionId, versionType, createdAt, lastPlayedAt, totalPlaytimeMs,
                javaMajorVersion, javaComponent, favourite, groupName, iconUrl, newSettings);
    }

    public Instance withName(String newName) {
        return new Instance(newName, slug, versionId, versionType, createdAt, lastPlayedAt, totalPlaytimeMs,
                javaMajorVersion, javaComponent, favourite, groupName, iconUrl, settings);
    }

    public Instance withLastPlayedAt(long timestamp) {
        return new Instance(name, slug, versionId, versionType, createdAt, timestamp, totalPlaytimeMs,
                javaMajorVersion, javaComponent, favourite, groupName, iconUrl, settings);
    }

    /** Adds one session's duration to the running total. */
    public Instance withAddedPlaytime(long sessionMs) {
        return new Instance(name, slug, versionId, versionType, createdAt, lastPlayedAt,
                totalPlaytimeMs + Math.max(0L, sessionMs),
                javaMajorVersion, javaComponent, favourite, groupName, iconUrl, settings);
    }

    public Instance withFavourite(boolean pinned) {
        return new Instance(name, slug, versionId, versionType, createdAt, lastPlayedAt, totalPlaytimeMs,
                javaMajorVersion, javaComponent, pinned, groupName, iconUrl, settings);
    }

    public Instance withGroup(String newGroup) {
        return new Instance(name, slug, versionId, versionType, createdAt, lastPlayedAt, totalPlaytimeMs,
                javaMajorVersion, javaComponent, favourite, newGroup, iconUrl, settings);
    }

    public Instance withIconUrl(String newIconUrl) {
        return new Instance(name, slug, versionId, versionType, createdAt, lastPlayedAt, totalPlaytimeMs,
                javaMajorVersion, javaComponent, favourite, groupName, newIconUrl, settings);
    }

    /** Re-points a profile at another game version, as a modpack update across versions does. */
    public Instance withVersion(String newVersionId, String newVersionType, int majorVersion, String component) {
        return new Instance(name, slug, newVersionId, newVersionType, createdAt, lastPlayedAt, totalPlaytimeMs,
                majorVersion, component, favourite, groupName, iconUrl, settings);
    }

    public Instance withJavaRequirement(int majorVersion, String component) {
        return new Instance(name, slug, versionId, versionType, createdAt, lastPlayedAt, totalPlaytimeMs,
                majorVersion, component, favourite, groupName, iconUrl, settings);
    }
}
