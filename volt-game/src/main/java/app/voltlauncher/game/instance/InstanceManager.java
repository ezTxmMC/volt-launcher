package app.voltlauncher.game.instance;

import app.voltlauncher.core.AppPaths;
import app.voltlauncher.core.util.archive.Archives;
import app.voltlauncher.core.util.async.NamedLock;
import app.voltlauncher.game.platform.IPlatform;
import app.voltlauncher.game.platform.PlatformRegistry;
import app.voltlauncher.game.platform.version.resolver.VanillaVersionResolver;
import app.voltlauncher.game.store.LauncherInstanceStore;
import org.json.JSONObject;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.function.UnaryOperator;

public final class InstanceManager {

    private static final String STORE_KEY = "instance-store";
    private static final String CONTENT_MANIFEST = "content.json";

    private final LauncherInstanceStore store;
    private final VanillaVersionResolver versionResolver;
    private final PlatformRegistry platformRegistry;
    private final NamedLock lock = new NamedLock();

    public InstanceManager(LauncherInstanceStore store, VanillaVersionResolver versionResolver,
                           PlatformRegistry platformRegistry) {
        this.store = store;
        this.versionResolver = versionResolver;
        this.platformRegistry = platformRegistry;
    }

    public List<Instance> listInstances() throws Exception {
        return upgradeJavaRequirements(store.listInstances());
    }

    /** Every group name in use, alphabetically, so the UI can offer them without inventing one. */
    public List<String> listGroups() throws Exception {
        Set<String> groups = new LinkedHashSet<>();
        for (Instance instance : listInstances()) {
            if (!instance.groupName().isBlank()) groups.add(instance.groupName());
        }
        List<String> sorted = new ArrayList<>(groups);
        sorted.sort(String.CASE_INSENSITIVE_ORDER);
        return sorted;
    }

    public Instance createInstance(String name, String versionId) throws Exception {
        String normalized = InstanceNamePolicy.normalize(name);
        InstanceNamePolicy.validate(normalized);
        VanillaVersionResolver.ManifestEntry entry = versionResolver.findEntry(versionId);
        JSONObject meta = versionResolver.resolveMetadata(entry.id());
        return createInstance(normalized, entry.id(), entry.type(), meta);
    }

    public Instance createInstance(String name, String versionId, String versionType, JSONObject meta) throws Exception {
        String normalized = InstanceNamePolicy.normalize(name);
        InstanceNamePolicy.validate(normalized);
        RequiredJava req = resolveRequiredJava(meta, versionId);

        return lock.withLock(STORE_KEY, () -> {
            List<Instance> instances = listInstances();
            if (instances.stream().anyMatch(i -> i.name().equalsIgnoreCase(normalized))) {
                throw new IllegalStateException("An instance with this name already exists");
            }
            String slug = InstanceNamePolicy.uniqueSlug(normalized, instances);
            Instance instance = Instance.create(normalized, slug, versionId, versionType,
                    System.currentTimeMillis(), req.majorVersion(), req.component());
            Files.createDirectories(instance.gameDirectory());
            instances.add(instance);
            store.saveInstances(instances);
            return instance;
        });
    }

    /** Removes the instance from the registry and deletes its files from disk. */
    public void removeInstance(String name) throws Exception {
        String normalized = InstanceNamePolicy.normalize(name);
        lock.withLock(STORE_KEY, () -> {
            List<Instance> instances = listInstances();
            Instance removed = instances.stream()
                    .filter(i -> i.name().equalsIgnoreCase(normalized))
                    .findFirst()
                    .orElse(null);
            if (removed == null) return null;

            instances.removeIf(i -> i.name().equalsIgnoreCase(normalized));
            store.saveInstances(instances);
            // Only the launcher's own directory is deleted. A profile pointed at a game directory
            // the user chose keeps that directory: the launcher did not create it and must not
            // take a world collection down with the profile.
            deleteRecursively(AppPaths.instanceDirectory(removed.slug()));
            return null;
        });
    }

    public Instance renameInstance(String name, String newName) throws Exception {
        String normalizedOld = InstanceNamePolicy.normalize(name);
        String normalizedNew = InstanceNamePolicy.normalize(newName);
        InstanceNamePolicy.validate(normalizedNew);
        return lock.withLock(STORE_KEY, () -> {
            List<Instance> instances = listInstances();
            if (instances.stream().noneMatch(i -> i.name().equalsIgnoreCase(normalizedOld))) {
                throw new IllegalStateException("Instance not found: " + normalizedOld);
            }
            if (instances.stream().anyMatch(i -> !i.name().equalsIgnoreCase(normalizedOld)
                    && i.name().equalsIgnoreCase(normalizedNew))) {
                throw new IllegalStateException("An instance with this name already exists");
            }

            // The slug is intentionally left alone so the game directory (and everything a user
            // has put into it) stays where it is.
            List<Instance> updated = new ArrayList<>(instances.size());
            Instance renamed = null;
            for (Instance i : instances) {
                if (i.name().equalsIgnoreCase(normalizedOld)) {
                    renamed = i.withName(normalizedNew);
                    updated.add(renamed);
                } else {
                    updated.add(i);
                }
            }
            store.saveInstances(updated);
            return renamed;
        });
    }

    /**
     * Copies a profile, its game directory and its content manifest under a new name.
     *
     * <p>The copy always gets its own managed directory, even when the original ran from a
     * directory the user chose — two profiles silently sharing one game directory would corrupt
     * each other's worlds, which is precisely what a duplicate is meant to avoid.
     *
     * @param progress receives copied-file counts; may be {@code null}
     */
    public Instance duplicateInstance(String name, String newName, Archives.Progress progress) throws Exception {
        String normalizedSource = InstanceNamePolicy.normalize(name);
        Instance source = findByName(normalizedSource);
        String normalizedNew = InstanceNamePolicy.normalize(
                newName == null || newName.isBlank() ? source.name() + " (copy)" : newName);
        InstanceNamePolicy.validate(normalizedNew);

        Instance created = lock.withLock(STORE_KEY, () -> {
            List<Instance> instances = listInstances();
            if (instances.stream().anyMatch(i -> i.name().equalsIgnoreCase(normalizedNew))) {
                throw new IllegalStateException("An instance with this name already exists");
            }
            String slug = InstanceNamePolicy.uniqueSlug(normalizedNew, instances);
            Instance copy = new Instance(
                    normalizedNew, slug, source.versionId(), source.versionType(),
                    System.currentTimeMillis(), 0L, 0L,
                    source.javaMajorVersion(), source.javaComponent(),
                    false, source.groupName(), source.iconUrl(),
                    // The directory override is dropped; everything else carries over.
                    withoutGameDirectory(source.settings()));
            Files.createDirectories(copy.managedGameDirectory());
            instances.add(copy);
            store.saveInstances(instances);
            return copy;
        });

        try {
            copyTree(source.gameDirectory(), created.managedGameDirectory(), progress);
            Path manifest = AppPaths.instanceDirectory(source.slug()).resolve(CONTENT_MANIFEST);
            if (Files.exists(manifest)) {
                Path target = AppPaths.instanceDirectory(created.slug()).resolve(CONTENT_MANIFEST);
                Files.createDirectories(target.getParent());
                Files.copy(manifest, target, StandardCopyOption.REPLACE_EXISTING);
            }
            return created;
        } catch (Exception e) {
            // A half-copied duplicate is worse than none: roll it back so the grid stays honest.
            try { removeInstance(created.name()); } catch (Exception ignored) { /* best effort */ }
            throw e;
        }
    }

    public Instance updateSettings(String name, InstanceSettings settings) throws Exception {
        return mutate(name, instance -> instance.withSettings(settings));
    }

    public Instance setFavourite(String name, boolean favourite) throws Exception {
        return mutate(name, instance -> instance.withFavourite(favourite));
    }

    public Instance setGroup(String name, String group) throws Exception {
        String normalized = group == null ? "" : group.trim();
        if (normalized.length() > 48) {
            throw new IllegalArgumentException("Group names must be 48 characters or shorter");
        }
        return mutate(name, instance -> instance.withGroup(normalized));
    }

    public Instance setIconUrl(String name, String iconUrl) throws Exception {
        String normalized = iconUrl == null ? "" : iconUrl.trim();
        return mutate(name, instance -> instance.withIconUrl(normalized));
    }

    /**
     * Re-points a profile at another game version. Used when a modpack update moves the pack to a
     * new Minecraft or loader release; the slug — and therefore the game directory with the user's
     * worlds in it — is deliberately untouched.
     */
    public Instance updateVersion(String name, String versionId, String versionType, JSONObject meta)
            throws Exception {
        RequiredJava req = resolveRequiredJava(meta, versionId);
        return mutate(name, instance ->
                instance.withVersion(versionId, versionType, req.majorVersion(), req.component()));
    }

    public void markPlayed(Instance launched, long startedAt) throws Exception {
        lock.withLock(STORE_KEY, () -> {
            List<Instance> instances = listInstances();
            List<Instance> updated = new ArrayList<>(instances.size());
            for (Instance i : instances) {
                updated.add(i.name().equalsIgnoreCase(launched.name()) ? i.withLastPlayedAt(startedAt) : i);
            }
            store.saveInstances(updated);
            return null;
        });
    }

    /** Adds a finished session's duration to the profile's running total. */
    public void recordSession(String name, long sessionMs) throws Exception {
        if (sessionMs <= 0) return;
        lock.withLock(STORE_KEY, () -> {
            List<Instance> instances = listInstances();
            List<Instance> updated = new ArrayList<>(instances.size());
            for (Instance i : instances) {
                updated.add(i.name().equalsIgnoreCase(name) ? i.withAddedPlaytime(sessionMs) : i);
            }
            store.saveInstances(updated);
            return null;
        });
    }

    public Instance findByName(String name) throws Exception {
        return listInstances().stream()
                .filter(i -> i.name().equalsIgnoreCase(name))
                .findFirst()
                .orElseThrow(() -> new IllegalStateException("Instance not found: " + name));
    }

    public RequiredJava resolveRequiredJava(JSONObject meta, String versionId) {
        JSONObject jv = meta.optJSONObject("javaVersion");
        if (jv != null) {
            int major = jv.optInt("majorVersion", 0);
            if (major > 0) return new RequiredJava(major, jv.optString("component", ""));
        }
        return new RequiredJava(guessLegacyJava(versionId), "legacy-runtime");
    }

    // ── internals ─────────────────────────────────────────────────────────────

    /** Applies a change to one profile under the store lock and persists the result. */
    private Instance mutate(String name, UnaryOperator<Instance> change) throws Exception {
        String normalized = InstanceNamePolicy.normalize(name);
        return lock.withLock(STORE_KEY, () -> {
            List<Instance> instances = listInstances();
            List<Instance> updated = new ArrayList<>(instances.size());
            Instance result = null;
            for (Instance i : instances) {
                if (i.name().equalsIgnoreCase(normalized)) {
                    result = change.apply(i);
                    updated.add(result);
                } else {
                    updated.add(i);
                }
            }
            if (result == null) throw new IllegalStateException("Instance not found: " + normalized);
            store.saveInstances(updated);
            return result;
        });
    }

    private static InstanceSettings withoutGameDirectory(InstanceSettings settings) {
        return new InstanceSettings(
                settings.maxMemoryMb(), settings.minMemoryMb(), settings.jvmArgs(),
                settings.resolutionWidth(), settings.resolutionHeight(), settings.fullscreen(),
                settings.javaPath(), settings.envVars(), settings.preLaunchCommand(),
                settings.postExitCommand(), settings.wrapperCommand(), null, settings.hideLauncher());
    }

    private void copyTree(Path source, Path target, Archives.Progress progress) throws IOException {
        if (!Files.isDirectory(source)) {
            Files.createDirectories(target);
            return;
        }
        List<Path> entries;
        try (var walk = Files.walk(source)) {
            entries = walk.toList();
        }
        // Only files are counted towards the total: including directories made the progress bar
        // stop short of the end, which reads as a stall rather than as a finished copy.
        int total = (int) entries.stream().filter(Files::isRegularFile).count();

        int completed = 0;
        for (Path path : entries) {
            Path destination = target.resolve(source.relativize(path).toString());
            if (Files.isDirectory(path)) {
                Files.createDirectories(destination);
                continue;
            }
            Files.createDirectories(destination.getParent());
            Files.copy(path, destination, StandardCopyOption.REPLACE_EXISTING);
            if (progress != null) progress.update(++completed, total);
        }
    }

    private List<Instance> upgradeJavaRequirements(List<Instance> instances) throws Exception {
        boolean changed = false;
        List<Instance> upgraded = new ArrayList<>(instances.size());
        for (Instance i : instances) {
            Instance up = ensureJavaReq(i);
            upgraded.add(up);
            if (!up.equals(i)) changed = true;
        }
        if (changed) store.saveInstances(upgraded);
        return upgraded;
    }

    /**
     * Backfills the Java requirement for instances stored before it was recorded. Resolution goes
     * through the instance's own platform, because a modded version id such as
     * {@code fabric:1.21.1:0.16.9} is meaningless to the vanilla manifest. Network failures fall
     * back to the version-name heuristic rather than making the whole instance list unreadable.
     */
    private Instance ensureJavaReq(Instance i) {
        if (i.hasJavaRequirement()) return i;
        RequiredJava req;
        try {
            IPlatform platform = platformRegistry.resolvePlatformForVersion(
                    i.versionId(), platformRegistry.requireDefault());
            JSONObject meta = platform.versionResolver().resolveMetadata(i.versionId());
            req = resolveRequiredJava(meta, i.versionId());
        } catch (Exception e) {
            req = new RequiredJava(guessLegacyJava(i.versionId()), "legacy-runtime");
        }
        return i.withJavaRequirement(req.majorVersion(), req.component());
    }

    private int guessLegacyJava(String id) {
        String base = PlatformRegistry.extractBaseMinecraftVersionId(id);
        if (base == null || base.isBlank()) return 8;
        if (base.startsWith("1.21") || base.startsWith("1.22") || base.startsWith("25w") || base.startsWith("26w")) return 21;
        if (base.startsWith("1.20") || base.startsWith("1.19") || base.startsWith("1.18")
                || base.startsWith("23w") || base.startsWith("24w") || base.startsWith("22w")) return 17;
        if (base.startsWith("1.17") || base.startsWith("21w")) return 16;
        return 8;
    }

    private void deleteRecursively(Path root) throws IOException {
        if (!Files.exists(root)) return;
        try (var walk = Files.walk(root)) {
            for (Path path : walk.sorted(Comparator.reverseOrder()).toList()) {
                Files.deleteIfExists(path);
            }
        }
    }

    public record RequiredJava(int majorVersion, String component) {}

    /** Exposed so the manager's own locale handling is testable without a live store. */
    static String key(String name) {
        return name == null ? "" : name.trim().toLowerCase(Locale.ROOT);
    }
}
