package app.voltlauncher.game.world;

import app.voltlauncher.core.nbt.Nbt;
import app.voltlauncher.core.nbt.NbtCompound;
import app.voltlauncher.core.util.archive.Archives;
import app.voltlauncher.game.instance.Instance;
import app.voltlauncher.game.instance.InstanceManager;
import org.json.JSONObject;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.stream.Stream;

/**
 * The single-player worlds inside a profile.
 *
 * <p>A world's real name lives in its {@code level.dat}, not in its folder name, which is why this
 * reads NBT rather than listing directories: a folder called {@code New World (3)} can perfectly
 * well hold a world the user named "Survival". Anything unreadable still shows up, named after its
 * folder — a corrupt world the launcher hides is a world the user cannot delete.
 */
public final class WorldService {

    private static final String SAVES_FOLDER = "saves";
    private static final String LEVEL_DAT = "level.dat";

    private final InstanceManager instanceManager;

    public WorldService(InstanceManager instanceManager) {
        this.instanceManager = instanceManager;
    }

    /**
     * @param folderName the directory under {@code saves/}, which is also the quick-play target
     * @param readable   false when {@code level.dat} could not be parsed
     */
    public record World(
            String folderName,
            String name,
            long lastPlayed,
            long sizeBytes,
            String gameMode,
            boolean hardcore,
            String versionName,
            boolean hasIcon,
            boolean readable,
            String problem) {

        public JSONObject toJson() {
            return new JSONObject()
                    .put("folderName", folderName)
                    .put("name", name)
                    .put("lastPlayed", lastPlayed)
                    .put("sizeBytes", sizeBytes)
                    .put("gameMode", gameMode)
                    .put("hardcore", hardcore)
                    .put("versionName", versionName == null ? "" : versionName)
                    .put("hasIcon", hasIcon)
                    .put("readable", readable)
                    .put("problem", problem == null ? "" : problem);
        }
    }

    public List<World> list(String instanceName) throws Exception {
        Path saves = savesDirectory(instanceName);
        List<World> worlds = new ArrayList<>();
        if (!Files.isDirectory(saves)) return worlds;

        try (Stream<Path> stream = Files.list(saves)) {
            for (Path directory : stream.filter(Files::isDirectory).toList()) {
                worlds.add(read(directory));
            }
        }
        worlds.sort(Comparator.comparingLong(World::lastPlayed).reversed()
                .thenComparing(World::name, String.CASE_INSENSITIVE_ORDER));
        return worlds;
    }

    /** The world icon Minecraft renders in its own list, or {@code null} when there is none. */
    public Path iconPath(String instanceName, String folderName) throws Exception {
        Path icon = worldDirectory(instanceName, folderName).resolve("icon.png");
        return Files.isRegularFile(icon) ? icon : null;
    }

    public void delete(String instanceName, String folderName) throws Exception {
        Archives.deleteRecursively(worldDirectory(instanceName, folderName));
    }

    /** Copies a world inside the same profile, giving the copy a free folder name and title. */
    public World duplicate(String instanceName, String folderName, String newName) throws Exception {
        Path source = worldDirectory(instanceName, folderName);
        World original = read(source);
        String title = newName == null || newName.isBlank() ? original.name() + " (copy)" : newName.trim();

        Path target = freeDirectory(source.getParent(), title);
        Archives.copyDirectory(source, target);
        renameInLevelDat(target, title);
        return read(target);
    }

    /**
     * Copies a world into another profile. Worlds are version-sensitive, so the caller is expected
     * to warn about a target on an older Minecraft build; refusing outright would block the
     * legitimate case of moving a world onto a newer profile.
     */
    public World copyToInstance(String instanceName, String folderName, String targetInstanceName)
            throws Exception {
        Path source = worldDirectory(instanceName, folderName);
        Instance target = instanceManager.findByName(targetInstanceName);
        if (target.name().equalsIgnoreCase(instanceName)) {
            throw new IllegalArgumentException("Pick a different profile to copy the world into");
        }

        Path saves = target.gameDirectory().resolve(SAVES_FOLDER);
        Files.createDirectories(saves);
        World original = read(source);
        Path destination = freeDirectory(saves, original.name());
        Archives.copyDirectory(source, destination);
        return read(destination);
    }

    /** Renames a world by rewriting {@code level.dat}; the folder keeps its name, as the game does. */
    public World rename(String instanceName, String folderName, String newName) throws Exception {
        String title = newName == null ? "" : newName.trim();
        if (title.isEmpty()) throw new IllegalArgumentException("A world name is required");
        if (title.length() > 64) throw new IllegalArgumentException("World names must be 64 characters or shorter");

        Path directory = worldDirectory(instanceName, folderName);
        renameInLevelDat(directory, title);
        return read(directory);
    }

    // ── internals ─────────────────────────────────────────────────────────────

    private World read(Path directory) {
        String folderName = directory.getFileName().toString();
        long size = Archives.directorySize(directory);
        boolean hasIcon = Files.isRegularFile(directory.resolve("icon.png"));
        Path levelDat = directory.resolve(LEVEL_DAT);

        if (!Files.isRegularFile(levelDat)) {
            return new World(folderName, folderName, lastModified(directory), size, "",
                    false, "", hasIcon, false, "No level.dat — this folder is not a world");
        }
        try {
            NbtCompound data = Nbt.read(levelDat).root().getCompound("Data");
            if (data == null) {
                return new World(folderName, folderName, lastModified(directory), size, "",
                        false, "", hasIcon, false, "level.dat has no Data tag");
            }
            NbtCompound version = data.getCompound("Version");
            return new World(
                    folderName,
                    orFallback(data.getString("LevelName", ""), folderName),
                    data.getLong("LastPlayed", lastModified(directory)),
                    size,
                    gameModeName(data.getInt("GameType", -1)),
                    data.getBoolean("hardcore", false),
                    version == null ? "" : version.getString("Name", ""),
                    hasIcon,
                    true,
                    "");
        } catch (Exception e) {
            return new World(folderName, folderName, lastModified(directory), size, "",
                    false, "", hasIcon, false,
                    "level.dat could not be read: " + (e.getMessage() == null ? "unknown error" : e.getMessage()));
        }
    }

    private void renameInLevelDat(Path worldDirectory, String newName) throws IOException {
        Path levelDat = worldDirectory.resolve(LEVEL_DAT);
        if (!Files.isRegularFile(levelDat)) {
            throw new IllegalStateException("This world has no level.dat and cannot be renamed");
        }
        Nbt.Document document = Nbt.read(levelDat);
        NbtCompound data = document.root().getCompound("Data");
        if (data == null) throw new IllegalStateException("level.dat has no Data tag");
        data.put("LevelName", newName);
        Nbt.write(levelDat, document);
    }

    private Path savesDirectory(String instanceName) throws Exception {
        return instanceManager.findByName(instanceName).gameDirectory().resolve(SAVES_FOLDER);
    }

    private Path worldDirectory(String instanceName, String folderName) throws Exception {
        Path saves = savesDirectory(instanceName);
        Path directory = saves.resolve(safeFolderName(folderName)).normalize();
        if (!directory.startsWith(saves)) {
            throw new IllegalArgumentException("Invalid world name");
        }
        if (!Files.isDirectory(directory)) {
            throw new IllegalStateException("World not found: " + folderName);
        }
        return directory;
    }

    private static String safeFolderName(String name) {
        if (name == null || name.isBlank()) throw new IllegalArgumentException("A world name is required");
        String cleaned = name.replace('\\', '/');
        if (cleaned.contains("/") || cleaned.contains("..")) {
            throw new IllegalArgumentException("Invalid world name");
        }
        return cleaned;
    }

    /** Turns a title into a free folder name next to the others, the way the game does. */
    private static Path freeDirectory(Path parent, String title) {
        String base = title.replaceAll("[^A-Za-z0-9 _.-]", "_").trim();
        if (base.isEmpty()) base = "World";
        Path candidate = parent.resolve(base);
        for (int i = 1; Files.exists(candidate) && i < 1000; i++) {
            candidate = parent.resolve(base + " (" + i + ")");
        }
        return candidate;
    }

    private static String gameModeName(int gameType) {
        return switch (gameType) {
            case 0 -> "survival";
            case 1 -> "creative";
            case 2 -> "adventure";
            case 3 -> "spectator";
            default -> "";
        };
    }

    private static String orFallback(String value, String fallback) {
        return value == null || value.isBlank() ? fallback : value;
    }

    private static long lastModified(Path path) {
        try {
            return Files.getLastModifiedTime(path).toMillis();
        } catch (Exception e) {
            return 0L;
        }
    }

    /** Normalised for comparisons; kept here so callers do not repeat the locale handling. */
    static String key(String value) {
        return value == null ? "" : value.toLowerCase(Locale.ROOT);
    }
}
