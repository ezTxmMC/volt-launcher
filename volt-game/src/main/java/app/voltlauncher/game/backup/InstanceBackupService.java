package app.voltlauncher.game.backup;

import app.voltlauncher.core.AppPaths;
import app.voltlauncher.core.config.SettingsStore;
import app.voltlauncher.core.task.TaskRegistry;
import app.voltlauncher.core.util.archive.Archives;
import app.voltlauncher.game.instance.Instance;
import app.voltlauncher.game.instance.InstanceBusyRegistry;
import app.voltlauncher.game.instance.InstanceManager;
import org.json.JSONObject;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.time.Instant;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.stream.Stream;

/**
 * Snapshots a whole profile into a zip, and puts one back.
 *
 * <p>Modpack updates delete the files the new release no longer ships and JVM experiments break
 * launches, so the operations most worth undoing are exactly the ones that touch a profile's game
 * directory. Backups live outside the instance directory on purpose: a snapshot that disappears
 * along with the profile it was protecting is no protection at all.
 */
public final class InstanceBackupService {

    private static final String ARCHIVE_SUFFIX = ".zip";
    private static final String METADATA_SUFFIX = ".json";
    private static final DateTimeFormatter STAMP =
            DateTimeFormatter.ofPattern("yyyyMMdd-HHmmss").withZone(ZoneId.systemDefault());

    private final InstanceManager instanceManager;
    private final InstanceBusyRegistry busyRegistry;
    private final TaskRegistry tasks;
    private final SettingsStore settings;

    public InstanceBackupService(InstanceManager instanceManager, InstanceBusyRegistry busyRegistry,
                                 TaskRegistry tasks, SettingsStore settings) {
        this.instanceManager = instanceManager;
        this.busyRegistry = busyRegistry;
        this.tasks = tasks;
        this.settings = settings;
    }

    /**
     * @param id the archive's file name, which is also how it is addressed by the API
     */
    public record Backup(String id, String label, long createdAt, long sizeBytes,
                         String versionId, int fileCount) {

        public JSONObject toJson() {
            return new JSONObject()
                    .put("id", id)
                    .put("label", label == null ? "" : label)
                    .put("createdAt", createdAt)
                    .put("sizeBytes", sizeBytes)
                    .put("versionId", versionId == null ? "" : versionId)
                    .put("fileCount", fileCount);
        }
    }

    public List<Backup> list(String instanceName) throws Exception {
        Instance instance = instanceManager.findByName(instanceName);
        Path directory = AppPaths.instanceBackupsDirectory(instance.slug());
        List<Backup> backups = new ArrayList<>();
        if (!Files.isDirectory(directory)) return backups;

        try (Stream<Path> stream = Files.list(directory)) {
            for (Path archive : stream.filter(Files::isRegularFile).toList()) {
                String name = archive.getFileName().toString();
                if (!name.endsWith(ARCHIVE_SUFFIX)) continue;
                backups.add(readMetadata(archive));
            }
        }
        backups.sort(Comparator.comparingLong(Backup::createdAt).reversed());
        return backups;
    }

    /** Starts a snapshot in the background and returns the task id to follow. */
    public String createAsync(String instanceName, String label) throws Exception {
        Instance instance = instanceManager.findByName(instanceName);
        busyRegistry.requireIdle(instance.name());

        String taskId = tasks.begin("backup", "Backing up " + instance.name(), instance.name(), true);
        Thread.ofVirtual().name("backup-" + instance.slug()).start(() -> {
            busyRegistry.begin(instance.name(), "backing up");
            try {
                Backup backup = create(instance, label, taskId);
                tasks.succeed(taskId, backup.id());
            } catch (TaskRegistry.CancelledException e) {
                tasks.markCancelled(taskId, "Backup cancelled");
            } catch (Exception e) {
                tasks.fail(taskId, message(e, "Backup failed"));
            } finally {
                busyRegistry.end(instance.name());
            }
        });
        return taskId;
    }

    /** Runs a snapshot synchronously, for callers that must not proceed until it exists. */
    public Backup create(String instanceName, String label) throws Exception {
        return create(instanceManager.findByName(instanceName), label, null);
    }

    public String restoreAsync(String instanceName, String backupId) throws Exception {
        Instance instance = instanceManager.findByName(instanceName);
        busyRegistry.requireIdle(instance.name());
        Path archive = resolve(instance, backupId);

        String taskId = tasks.begin("restore", "Restoring " + instance.name(), instance.name());
        Thread.ofVirtual().name("restore-" + instance.slug()).start(() -> {
            busyRegistry.begin(instance.name(), "restoring backup");
            try {
                restore(instance, archive, taskId);
                tasks.succeed(taskId, "Restored " + archive.getFileName());
            } catch (Exception e) {
                tasks.fail(taskId, message(e, "Restore failed"));
            } finally {
                busyRegistry.end(instance.name());
            }
        });
        return taskId;
    }

    public void delete(String instanceName, String backupId) throws Exception {
        Instance instance = instanceManager.findByName(instanceName);
        Path archive = resolve(instance, backupId);
        Files.deleteIfExists(archive);
        Files.deleteIfExists(metadataPathFor(archive));
    }

    public Path directory(String instanceName) throws Exception {
        Path directory = AppPaths.instanceBackupsDirectory(instanceManager.findByName(instanceName).slug());
        Files.createDirectories(directory);
        return directory;
    }

    // ── internals ─────────────────────────────────────────────────────────────

    private Backup create(Instance instance, String label, String taskId) throws Exception {
        Path source = instance.gameDirectory();
        if (!Files.isDirectory(source)) {
            throw new IllegalStateException("This profile has no game directory to back up yet");
        }
        Path directory = AppPaths.instanceBackupsDirectory(instance.slug());
        Files.createDirectories(directory);

        String stamp = STAMP.format(Instant.now());
        Path archive = directory.resolve(stamp + ARCHIVE_SUFFIX);
        for (int i = 1; Files.exists(archive) && i < 100; i++) {
            archive = directory.resolve(stamp + "-" + i + ARCHIVE_SUFFIX);
        }

        int written = Archives.zipDirectory(source, archive, this::isExcluded, (completed, total) -> {
            if (taskId != null) {
                tasks.checkCancelled(taskId);
                tasks.progress(taskId, "archiving", completed, total);
            }
        });

        Backup backup = new Backup(
                archive.getFileName().toString(),
                label == null || label.isBlank() ? "Manual backup" : label.trim(),
                System.currentTimeMillis(),
                Files.size(archive),
                instance.versionId(),
                written);
        writeMetadata(archive, backup);
        prune(instance);
        return backup;
    }

    /**
     * Replaces the game directory with the archive's contents.
     *
     * <p>The current directory is moved aside rather than deleted, so a restore that fails
     * halfway leaves the profile exactly as it was instead of half-overwritten.
     */
    private void restore(Instance instance, Path archive, String taskId) throws Exception {
        Path game = instance.gameDirectory();
        Path staging = game.resolveSibling(game.getFileName() + ".restoring");
        Path previous = game.resolveSibling(game.getFileName() + ".previous");

        Archives.deleteRecursively(staging);
        Archives.deleteRecursively(previous);
        Files.createDirectories(staging);

        tasks.progress(taskId, "extracting", 0, 0);
        Archives.unzip(archive, staging, (completed, total) -> tasks.progress(taskId, "extracting", completed, 0));

        boolean movedAside = false;
        try {
            if (Files.exists(game)) {
                Files.move(game, previous, StandardCopyOption.ATOMIC_MOVE);
                movedAside = true;
            }
            Files.move(staging, game, StandardCopyOption.ATOMIC_MOVE);
            Archives.deleteRecursively(previous);
        } catch (IOException e) {
            if (movedAside && !Files.exists(game)) {
                Files.move(previous, game, StandardCopyOption.ATOMIC_MOVE);
            }
            Archives.deleteRecursively(staging);
            throw e;
        }
    }

    /** Keeps only the newest {@code backupsToKeep} snapshots; 0 means keep everything. */
    private void prune(Instance instance) {
        int keep;
        try {
            keep = settings.get().backupsToKeep();
        } catch (Exception e) {
            return;
        }
        if (keep <= 0) return;

        try {
            List<Backup> existing = list(instance.name());
            for (int i = keep; i < existing.size(); i++) {
                delete(instance.name(), existing.get(i).id());
            }
        } catch (Exception e) {
            // Pruning is housekeeping; a failure must not invalidate the backup just taken.
            System.err.println("[Backup] Could not prune old backups: " + e.getMessage());
        }
    }

    /**
     * Files left out of a snapshot. Only the launcher's own working files are skipped — the game's
     * logs and crash reports are kept, because a backup taken to investigate a crash without them
     * would be useless.
     */
    private boolean isExcluded(Path relative) {
        String first = relative.getNameCount() == 0 ? "" : relative.getName(0).toString();
        String name = relative.getFileName() == null ? "" : relative.getFileName().toString();
        return first.endsWith(".restoring") || first.endsWith(".previous")
                || name.endsWith(".tmp") || name.endsWith(".lock") || "session.lock".equals(name);
    }

    private Path resolve(Instance instance, String backupId) {
        if (backupId == null || backupId.isBlank()) {
            throw new IllegalArgumentException("A backup id is required");
        }
        String cleaned = backupId.replace('\\', '/');
        if (cleaned.contains("/") || cleaned.contains("..") || !cleaned.endsWith(ARCHIVE_SUFFIX)) {
            throw new IllegalArgumentException("Invalid backup id");
        }
        Path directory = AppPaths.instanceBackupsDirectory(instance.slug());
        Path archive = directory.resolve(cleaned).normalize();
        if (!archive.startsWith(directory)) {
            throw new IllegalArgumentException("Invalid backup id");
        }
        if (!Files.isRegularFile(archive)) {
            throw new IllegalStateException("Backup not found: " + backupId);
        }
        return archive;
    }

    private Path metadataPathFor(Path archive) {
        String name = archive.getFileName().toString();
        return archive.resolveSibling(name.substring(0, name.length() - ARCHIVE_SUFFIX.length()) + METADATA_SUFFIX);
    }

    private void writeMetadata(Path archive, Backup backup) {
        try {
            Files.writeString(metadataPathFor(archive), backup.toJson().toString(2), StandardCharsets.UTF_8);
        } catch (IOException e) {
            // The archive is what matters; without the sidecar the listing falls back to the file.
            System.err.println("[Backup] Could not write backup metadata: " + e.getMessage());
        }
    }

    /** Reads a snapshot's sidecar, falling back to what the file itself can tell us. */
    private Backup readMetadata(Path archive) {
        String id = archive.getFileName().toString();
        long size;
        long created;
        try {
            size = Files.size(archive);
            created = Files.getLastModifiedTime(archive).toMillis();
        } catch (IOException e) {
            size = 0L;
            created = 0L;
        }

        Path metadata = metadataPathFor(archive);
        if (Files.isRegularFile(metadata)) {
            try {
                JSONObject json = new JSONObject(Files.readString(metadata, StandardCharsets.UTF_8));
                return new Backup(id,
                        json.optString("label", "Backup"),
                        json.optLong("createdAt", created),
                        size,
                        json.optString("versionId", ""),
                        json.optInt("fileCount", 0));
            } catch (Exception e) {
                // Fall through to the file-derived values below.
                System.err.println("[Backup] Unreadable metadata for " + id + ": " + e.getMessage());
            }
        }
        return new Backup(id, "Backup", created, size, "", 0);
    }

    private static String message(Exception e, String fallback) {
        return e.getMessage() == null || e.getMessage().isBlank() ? fallback : e.getMessage();
    }
}
