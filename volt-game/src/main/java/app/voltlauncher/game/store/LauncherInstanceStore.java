package app.voltlauncher.game.store;

import app.voltlauncher.core.AppPaths;
import app.voltlauncher.game.instance.Instance;
import app.voltlauncher.game.instance.InstanceSettings;
import org.json.JSONArray;
import org.json.JSONObject;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Optional;

/**
 * The profile registry on disk. Fields added after a profile was written simply fall back to their
 * defaults, so an older {@code instances.json} keeps loading.
 */
public class LauncherInstanceStore {

    private final Path storagePath;

    public LauncherInstanceStore() {
        this(AppPaths.instancesMetadataPath());
    }

    public LauncherInstanceStore(Path storagePath) {
        this.storagePath = storagePath;
    }

    public synchronized List<Instance> listInstances() throws Exception {
        if (!Files.exists(storagePath)) {
            return new ArrayList<>();
        }

        JSONObject root = new JSONObject(Files.readString(storagePath, StandardCharsets.UTF_8));
        JSONArray instances = root.optJSONArray("instances");
        if (instances == null) {
            return new ArrayList<>();
        }

        List<Instance> result = new ArrayList<>();
        for (int i = 0; i < instances.length(); i++) {
            JSONObject instance = instances.getJSONObject(i);
            result.add(new Instance(
                    instance.getString("name"),
                    instance.getString("slug"),
                    instance.getString("versionId"),
                    instance.optString("versionType", "release"),
                    instance.getLong("createdAt"),
                    instance.optLong("lastPlayedAt", 0L),
                    instance.optLong("totalPlaytimeMs", 0L),
                    instance.optInt("javaMajorVersion", 0),
                    instance.optString("javaComponent", ""),
                    instance.optBoolean("favourite", false),
                    instance.optString("groupName", ""),
                    instance.optString("iconUrl", ""),
                    InstanceSettings.fromJson(instance.optJSONObject("settings"))));
        }

        result.sort(Comparator
                .comparingLong((Instance instance) ->
                        instance.lastPlayedAt() > 0 ? instance.lastPlayedAt() : instance.createdAt())
                .reversed()
                .thenComparing(Instance::name, String.CASE_INSENSITIVE_ORDER));
        return result;
    }

    public synchronized Optional<Instance> findByName(String name) throws Exception {
        return listInstances().stream()
                .filter(instance -> instance.name().equalsIgnoreCase(name))
                .findFirst();
    }

    public synchronized void saveInstances(List<Instance> instances) throws Exception {
        Files.createDirectories(storagePath.getParent());

        JSONArray array = new JSONArray();
        for (Instance instance : instances) {
            array.put(new JSONObject()
                    .put("name", instance.name())
                    .put("slug", instance.slug())
                    .put("versionId", instance.versionId())
                    .put("versionType", instance.versionType())
                    .put("createdAt", instance.createdAt())
                    .put("lastPlayedAt", instance.lastPlayedAt())
                    .put("totalPlaytimeMs", instance.totalPlaytimeMs())
                    .put("javaMajorVersion", instance.javaMajorVersion())
                    .put("javaComponent", instance.javaComponent())
                    .put("favourite", instance.favourite())
                    .put("groupName", instance.groupName())
                    .put("iconUrl", instance.iconUrl())
                    .put("settings", instance.settings().toJson()));
        }

        JSONObject root = new JSONObject().put("instances", array);

        // Written through a temporary file: a truncated registry would orphan every profile
        // directory on disk, which is a far worse outcome than a failed save.
        Path temp = Files.createTempFile(storagePath.getParent(), "instances-", ".tmp");
        try {
            Files.writeString(temp, root.toString(2), StandardCharsets.UTF_8);
            Files.move(temp, storagePath, StandardCopyOption.REPLACE_EXISTING);
        } finally {
            Files.deleteIfExists(temp);
        }
    }
}
