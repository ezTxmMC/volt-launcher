package app.voltlauncher.game.instance;

import app.voltlauncher.game.store.ContentManifestStore;

import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.stream.Stream;

/**
 * Manages files inside an instance's game directory content folders
 * (mods, resourcepacks, shaderpacks, datapacks). A file is "disabled" by giving
 * it a trailing {@code .disabled} suffix, which Minecraft loaders ignore.
 */
public final class InstanceContentService {

    private static final String DISABLED_SUFFIX = ".disabled";

    public enum ContentType {
        MODS("mods"),
        RESOURCEPACKS("resourcepacks"),
        SHADERPACKS("shaderpacks"),
        DATAPACKS("datapacks");

        private final String folder;

        ContentType(String folder) {
            this.folder = folder;
        }

        public String folder() {
            return folder;
        }

        public static ContentType fromId(String id) {
            if (id == null) throw new IllegalArgumentException("Content type is required");
            for (ContentType t : values()) {
                if (t.folder.equalsIgnoreCase(id) || t.name().equalsIgnoreCase(id)) return t;
            }
            throw new IllegalArgumentException("Unknown content type: " + id);
        }
    }

    /**
     * @param source where the file came from, or {@code null} when nothing is recorded for it —
     *               files that predate the manifest, or that were dropped straight into the folder
     */
    public record ContentEntry(String fileName, long size, boolean enabled, ContentSource source) {}

    private final InstanceManager instanceManager;
    private final ContentManifestStore manifests;

    public InstanceContentService(InstanceManager instanceManager, ContentManifestStore manifests) {
        this.instanceManager = instanceManager;
        this.manifests = manifests;
    }

    public ContentManifestStore manifests() {
        return manifests;
    }

    public List<ContentEntry> list(String instanceName, ContentType type) throws Exception {
        Instance instance = instanceManager.findByName(instanceName);
        ContentManifestStore.Manifest manifest = manifests.read(instance.slug());

        Path dir = instance.gameDirectory().resolve(type.folder());
        List<ContentEntry> result = new ArrayList<>();
        if (!Files.isDirectory(dir)) return result;
        try (Stream<Path> stream = Files.list(dir)) {
            stream.filter(Files::isRegularFile).forEach(p -> {
                String name = p.getFileName().toString();
                boolean enabled = !name.endsWith(DISABLED_SUFFIX);
                String displayName = enabled ? name : name.substring(0, name.length() - DISABLED_SUFFIX.length());
                long size;
                try { size = Files.size(p); } catch (Exception e) { size = 0L; }
                result.add(new ContentEntry(displayName, size, enabled, manifest.find(type.folder(), displayName)));
            });
        }
        result.sort(Comparator.comparing(e -> e.fileName().toLowerCase(Locale.ROOT)));
        return result;
    }

    public ContentEntry add(String instanceName, ContentType type, Path source) throws Exception {
        if (source == null || !Files.isRegularFile(source)) {
            throw new IllegalArgumentException("Source file not found");
        }
        Instance instance = instanceManager.findByName(instanceName);
        Path dir = instance.gameDirectory().resolve(type.folder());
        Files.createDirectories(dir);
        String fileName = source.getFileName().toString();
        Path target = uniqueTarget(dir, fileName);
        Files.copy(source, target, StandardCopyOption.COPY_ATTRIBUTES);

        // Recorded even though nothing is known about it, so an export still carries the file.
        ContentSource recorded = ContentSource.manual(
                type.folder(), target.getFileName().toString(), Files.size(target));
        manifests.record(instance.slug(), List.of(recorded));
        return new ContentEntry(recorded.fileName(), recorded.fileSize(), true, recorded);
    }

    public void remove(String instanceName, ContentType type, String fileName) throws Exception {
        Path resolved = resolveExisting(instanceName, type, fileName);
        Files.deleteIfExists(resolved);
        manifests.forget(instanceManager.findByName(instanceName).slug(), type.folder(), fileName);
    }

    public ContentEntry toggle(String instanceName, ContentType type, String fileName) throws Exception {
        Path current = resolveExisting(instanceName, type, fileName);
        String name = current.getFileName().toString();
        Path target;
        boolean nowEnabled;
        if (name.endsWith(DISABLED_SUFFIX)) {
            target = current.resolveSibling(name.substring(0, name.length() - DISABLED_SUFFIX.length()));
            nowEnabled = true;
        } else {
            target = current.resolveSibling(name + DISABLED_SUFFIX);
            nowEnabled = false;
        }
        Files.move(current, target, StandardCopyOption.REPLACE_EXISTING);

        Instance instance = instanceManager.findByName(instanceName);
        ContentSource source = manifests.read(instance.slug()).find(type.folder(), fileName);
        return new ContentEntry(fileName, Files.size(target), nowEnabled, source);
    }

    /**
     * Enables or disables every file of one kind in a single pass.
     *
     * <p>Turning all mods off and the game on is the standard way to find out whether a crash
     * comes from the mods or the profile, and doing it one file at a time through the UI is
     * unusable once a pack has two hundred of them.
     *
     * @return how many files actually changed state
     */
    public int setAllEnabled(String instanceName, ContentType type, boolean enabled) throws Exception {
        Instance instance = instanceManager.findByName(instanceName);
        Path dir = instance.gameDirectory().resolve(type.folder());
        if (!Files.isDirectory(dir)) return 0;

        int changed = 0;
        List<Path> files;
        try (Stream<Path> stream = Files.list(dir)) {
            files = stream.filter(Files::isRegularFile).toList();
        }
        for (Path file : files) {
            String name = file.getFileName().toString();
            boolean currentlyEnabled = !name.endsWith(DISABLED_SUFFIX);
            if (currentlyEnabled == enabled) continue;

            Path target = enabled
                    ? file.resolveSibling(name.substring(0, name.length() - DISABLED_SUFFIX.length()))
                    : file.resolveSibling(name + DISABLED_SUFFIX);
            try {
                Files.move(file, target, StandardCopyOption.REPLACE_EXISTING);
                changed++;
            } catch (Exception e) {
                // One locked file must not stop the sweep; the rest still switch over.
                System.err.println("[Content] Could not toggle " + name + ": " + e.getMessage());
            }
        }
        return changed;
    }

    /**
     * Required dependencies that are missing or switched off.
     *
     * <p>Disabling a library mod that six other mods need produces a crash on the next launch with
     * no obvious cause, so the launcher points at it before the game does.
     */
    public List<DependencyWarning> checkDependencies(String instanceName, ContentType type) throws Exception {
        List<ContentEntry> entries = list(instanceName, type);

        // A dependency is satisfied by any installed file of the same kind belonging to that
        // project, regardless of which file name it happens to carry.
        Map<String, Boolean> enabledByProject = new HashMap<>();
        for (ContentEntry entry : entries) {
            ContentSource source = entry.source();
            if (source == null || source.projectId().isEmpty()) continue;
            enabledByProject.merge(source.projectId(), entry.enabled(), (a, b) -> a || b);
        }

        List<DependencyWarning> warnings = new ArrayList<>();
        for (ContentEntry entry : entries) {
            ContentSource source = entry.source();
            if (source == null || !entry.enabled()) continue;
            for (String dependency : source.requiredDependencies()) {
                if (dependency == null || dependency.isBlank()) continue;
                Boolean enabled = enabledByProject.get(dependency);
                if (Boolean.TRUE.equals(enabled)) continue;
                warnings.add(new DependencyWarning(
                        entry.fileName(),
                        source.projectName().isEmpty() ? entry.fileName() : source.projectName(),
                        dependency,
                        enabled == null ? "missing" : "disabled"));
            }
        }
        return warnings;
    }

    /**
     * @param state {@code missing} when nothing provides the dependency, {@code disabled} when it
     *              is installed but switched off
     */
    public record DependencyWarning(String fileName, String projectName, String dependencyProjectId, String state) {}

    /** Absolute path of a tracked file, whether it is currently enabled or disabled. */
    public Path resolve(String instanceName, ContentType type, String fileName) throws Exception {
        return resolveExisting(instanceName, type, fileName);
    }

    // ── internals ─────────────────────────────────────────────────────────────

    private Path contentDir(String instanceName, ContentType type) throws Exception {
        Instance instance = instanceManager.findByName(instanceName);
        return instance.gameDirectory().resolve(type.folder());
    }

    private Path resolveExisting(String instanceName, ContentType type, String fileName) throws Exception {
        String safe = sanitize(fileName);
        Path dir = contentDir(instanceName, type);
        Path enabled = dir.resolve(safe);
        if (Files.exists(enabled)) return enabled;
        Path disabled = dir.resolve(safe + DISABLED_SUFFIX);
        if (Files.exists(disabled)) return disabled;
        // fileName may already carry the .disabled suffix
        Path asGiven = dir.resolve(safe);
        if (Files.exists(asGiven)) return asGiven;
        throw new IllegalStateException("File not found: " + fileName);
    }

    private Path uniqueTarget(Path dir, String fileName) {
        Path target = dir.resolve(fileName);
        if (!Files.exists(target) && !Files.exists(dir.resolve(fileName + DISABLED_SUFFIX))) return target;
        String base = fileName;
        String ext = "";
        int dot = fileName.lastIndexOf('.');
        if (dot > 0) { base = fileName.substring(0, dot); ext = fileName.substring(dot); }
        for (int i = 1; i < 1000; i++) {
            Path candidate = dir.resolve(base + " (" + i + ")" + ext);
            if (!Files.exists(candidate)) return candidate;
        }
        return dir.resolve(base + "-" + System.currentTimeMillis() + ext);
    }

    private String sanitize(String fileName) {
        if (fileName == null || fileName.isBlank()) throw new IllegalArgumentException("File name is required");
        String name = fileName.replace("\\", "/");
        if (name.contains("/") || name.contains("..")) throw new IllegalArgumentException("Invalid file name");
        return name;
    }
}
