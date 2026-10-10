package app.voltlauncher.providers.content;

import app.voltlauncher.core.util.HttpFetcher;
import app.voltlauncher.game.instance.ContentSource;
import app.voltlauncher.game.instance.Instance;
import app.voltlauncher.game.instance.InstanceContentService;
import app.voltlauncher.providers.model.ProviderId;
import org.json.JSONObject;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Semaphore;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

/**
 * Shared mechanics for installing a modpack archive: reading its manifest, downloading the files
 * it references and unpacking its override tree over the instance's game directory.
 */
public abstract class AbstractModpackInstaller {

    private static final int DOWNLOAD_CONCURRENCY = 8;

    /** Stage identifiers the UI maps onto localised text. */
    public static final String STAGE_RESOLVING = "resolving";
    public static final String STAGE_DOWNLOADING = "downloading";
    public static final String STAGE_OVERRIDES = "overrides";

    protected final HttpFetcher http;

    protected AbstractModpackInstaller(HttpFetcher http) {
        this.http = http;
    }

    /**
     * Metadata read from a pack, before an instance exists.
     *
     * @param packVersion the pack's own version string, shown when offering an update
     * @param archiveFile the downloaded archive, or {@code null} for a platform that serves a file
     *                    list rather than an archive
     * @param sourceRef   the provider's own version identifier, so an installer that has no
     *                    archive to re-read can resolve the file list again when it applies it
     */
    public record PackInfo(String versionId, String packName, String packVersion, Path archiveFile,
                           String sourceRef) {

        public PackInfo(String versionId, String packName, String packVersion, Path archiveFile) {
            this(versionId, packName, packVersion, archiveFile, "");
        }

        public PackInfo {
            sourceRef = sourceRef == null ? "" : sourceRef;
        }

        public boolean hasArchive() {
            return archiveFile != null;
        }

        public PackInfo withVersion(String newPackVersion) {
            return new PackInfo(versionId, packName, newPackVersion, archiveFile, sourceRef);
        }

        public PackInfo withSourceRef(String newSourceRef) {
            return new PackInfo(versionId, packName, packVersion, archiveFile, newSourceRef);
        }
    }

    /**
     * One file the pack pulls from the network. Public because Java only lets a subclass invoke a
     * protected constructor through {@code super()}, never with {@code new}.
     */
    public record RemoteFile(
            String relativePath,
            String url,
            String hash,
            String sha1,
            String projectId,
            String versionId,
            String projectName,
            String versionNumber) {

        /** A file the pack references without any resolvable project behind it. */
        public static RemoteFile untracked(String relativePath, String url, String hash, String sha1) {
            return new RemoteFile(relativePath, url, hash, sha1, "", "", "", "");
        }
    }

    public abstract ProviderId provider();

    /** Reads the launcher version id and display name out of an archive already on disk. */
    public abstract PackInfo readPackInfo(Path archive) throws Exception;

    /** Whether this platform distributes packs as an archive a user can import from disk. */
    public boolean supportsImport() {
        return true;
    }

    /** Downloads the pack archive for a provider version, then reads its metadata. */
    public abstract PackInfo fetchPackInfo(String versionId) throws Exception;

    /**
     * Installs the pack's contents into the instance and reports every file that landed in a
     * content folder, so the caller can record where each one came from.
     *
     * <p>The archive, when there is one, is left in place; the caller owns its lifetime, because
     * an update needs to read it again after the contents have been applied.
     *
     * @param progress receives stage changes and download counts
     */
    public abstract List<ContentSource> applyPackContents(
            Instance instance, PackInfo info, ProgressSink progress) throws Exception;

    // ── shared helpers ────────────────────────────────────────────────────────

    /** Reads a JSON document from inside the pack archive. */
    protected JSONObject readJsonEntry(Path archive, String entryName) throws Exception {
        try (ZipInputStream zip = new ZipInputStream(Files.newInputStream(archive))) {
            ZipEntry entry;
            while ((entry = zip.getNextEntry()) != null) {
                if (entryName.equals(entry.getName())) {
                    return new JSONObject(new String(zip.readAllBytes(), StandardCharsets.UTF_8));
                }
                zip.closeEntry();
            }
        }
        throw new IllegalStateException(entryName + " not found in the modpack archive");
    }

    /** Whether an archive carries the given entry, used to tell pack formats apart. */
    public static boolean hasEntry(Path archive, String entryName) {
        try (ZipInputStream zip = new ZipInputStream(Files.newInputStream(archive))) {
            ZipEntry entry;
            while ((entry = zip.getNextEntry()) != null) {
                if (entryName.equals(entry.getName())) return true;
                zip.closeEntry();
            }
        } catch (Exception e) {
            return false;
        }
        return false;
    }

    /**
     * Whether an archive carries an entry ending in the given path.
     *
     * <p>Used where the format's marker file may sit inside a wrapper folder — a plain client zip
     * has no manifest declaring its root, so {@code bin/version.json} and
     * {@code MyPack/bin/version.json} both have to count.
     */
    public static boolean hasEntryEndingWith(Path archive, String suffix) {
        try (ZipInputStream zip = new ZipInputStream(Files.newInputStream(archive))) {
            ZipEntry entry;
            while ((entry = zip.getNextEntry()) != null) {
                String name = entry.getName().replace('\\', '/');
                if (name.equals(suffix) || name.endsWith("/" + suffix)) return true;
                zip.closeEntry();
            }
        } catch (Exception e) {
            return false;
        }
        return false;
    }

    /**
     * Downloads every file in parallel. A failure is collected rather than thrown immediately so
     * the user gets one summary instead of whichever error happened to surface first.
     */
    protected void downloadFiles(Path gameDir, List<RemoteFile> files, ProgressSink progress) throws Exception {
        if (files.isEmpty()) return;

        Semaphore permits = new Semaphore(DOWNLOAD_CONCURRENCY);
        List<Exception> errors = new ArrayList<>();
        AtomicInteger completed = new AtomicInteger();
        int total = files.size();
        progress.update(STAGE_DOWNLOADING, 0, total);

        try (ExecutorService executor = Executors.newVirtualThreadPerTaskExecutor()) {
            List<CompletableFuture<Void>> tasks = new ArrayList<>(total);
            for (RemoteFile file : files) {
                Path destination = gameDir.resolve(file.relativePath()).normalize();
                if (!destination.startsWith(gameDir)) {
                    synchronized (errors) {
                        errors.add(new IllegalStateException(
                                "Modpack tried to write outside the instance: " + file.relativePath()));
                    }
                    continue;
                }

                tasks.add(CompletableFuture.runAsync(() -> {
                    try {
                        permits.acquire();
                        try {
                            http.download(file.url(), destination, file.hash());
                        } finally {
                            permits.release();
                        }
                        progress.update(STAGE_DOWNLOADING, completed.incrementAndGet(), total);
                    } catch (InterruptedException e) {
                        Thread.currentThread().interrupt();
                        synchronized (errors) { errors.add(e); }
                    } catch (Exception e) {
                        synchronized (errors) { errors.add(e); }
                    }
                }, executor));
            }
            CompletableFuture.allOf(tasks.toArray(CompletableFuture[]::new)).join();
        }

        synchronized (errors) {
            if (!errors.isEmpty()) {
                throw new IllegalStateException(
                        "Failed to download " + errors.size() + " of " + total + " pack files. First error: "
                                + errors.getFirst().getMessage(), errors.getFirst());
            }
        }
    }

    /**
     * Copies the pack's override trees over the game directory. Entries escaping the game
     * directory are refused rather than silently skipped.
     *
     * @return the game-relative paths that were written
     */
    protected List<String> applyOverrides(Path gameDir, Path archive, List<String> prefixes) throws Exception {
        List<String> written = new ArrayList<>();
        try (ZipInputStream zip = new ZipInputStream(Files.newInputStream(archive))) {
            ZipEntry entry;
            while ((entry = zip.getNextEntry()) != null) {
                String relative = stripPrefix(entry.getName(), prefixes);
                if (relative == null || relative.isBlank() || entry.isDirectory()) {
                    zip.closeEntry();
                    continue;
                }

                Path destination = gameDir.resolve(relative).normalize();
                if (!destination.startsWith(gameDir)) {
                    throw new IllegalStateException(
                            "Modpack override tried to write outside the instance: " + entry.getName());
                }
                Files.createDirectories(destination.getParent());
                Files.copy(zip, destination, StandardCopyOption.REPLACE_EXISTING);
                written.add(relative);
                zip.closeEntry();
            }
        }
        return written;
    }

    /**
     * Extracts a whole archive over the game directory, skipping the entries a caller rejects and
     * transparently stripping a single wrapper folder.
     *
     * <p>Packs distributed as a plain client zip — Technic's format — have no manifest saying
     * where their contents start, and authors zip them both ways: sometimes at the root,
     * sometimes inside a folder named after the pack. Guessing wrong installs a profile whose
     * mods folder is one level too deep and which therefore launches vanilla.
     *
     * @param skip tested against the archive-relative path, after any wrapper folder is removed
     * @return the game-relative paths that were written
     */
    protected List<String> extractAll(Path gameDir, Path archive, java.util.function.Predicate<String> skip)
            throws Exception {
        String wrapper = detectWrapperFolder(archive);
        List<String> written = new ArrayList<>();

        try (ZipInputStream zip = new ZipInputStream(Files.newInputStream(archive))) {
            ZipEntry entry;
            while ((entry = zip.getNextEntry()) != null) {
                String name = entry.getName().replace('\\', '/');
                if (wrapper != null && name.startsWith(wrapper)) {
                    name = name.substring(wrapper.length());
                }
                if (name.isBlank() || entry.isDirectory() || (skip != null && skip.test(name))) {
                    zip.closeEntry();
                    continue;
                }

                Path destination = gameDir.resolve(name).normalize();
                if (!destination.startsWith(gameDir)) {
                    throw new IllegalStateException(
                            "Modpack archive tried to write outside the instance: " + entry.getName());
                }
                Files.createDirectories(destination.getParent());
                Files.copy(zip, destination, StandardCopyOption.REPLACE_EXISTING);
                written.add(name);
                zip.closeEntry();
            }
        }
        return written;
    }

    /**
     * The single top-level folder every entry sits inside, or {@code null} when the archive's
     * contents are already at its root.
     */
    protected static String detectWrapperFolder(Path archive) throws Exception {
        String candidate = null;
        boolean sawEntry = false;

        try (ZipInputStream zip = new ZipInputStream(Files.newInputStream(archive))) {
            ZipEntry entry;
            while ((entry = zip.getNextEntry()) != null) {
                String name = entry.getName().replace('\\', '/');
                zip.closeEntry();
                if (name.isBlank()) continue;

                // A traversal entry must never be mistaken for a wrapper folder: stripping
                // "../" as a prefix would rewrite the path into something harmless-looking and
                // rob the extraction step of the check that would have refused it.
                if (name.startsWith("/") || name.contains("..")) return null;

                int slash = name.indexOf('/');
                if (slash <= 0) {
                    // A file at the root means there is no wrapper folder.
                    if (!entry.isDirectory()) return null;
                    continue;
                }
                String top = name.substring(0, slash + 1);
                if (!sawEntry) {
                    candidate = top;
                    sawEntry = true;
                } else if (!top.equals(candidate)) {
                    return null;
                }
            }
        }
        return candidate;
    }

    /**
     * Turns downloaded pack files into provenance records. Only files inside a content folder are
     * recorded — a pack also ships configs and scripts, which are not individually manageable.
     */
    protected List<ContentSource> toContentSources(List<RemoteFile> files) {
        List<ContentSource> sources = new ArrayList<>();
        for (RemoteFile file : files) {
            ContentSource source = toContentSource(
                    file.relativePath(), file.projectId(), file.versionId(),
                    file.projectName(), file.versionNumber(), file.url(), file.sha1());
            if (source != null) sources.add(source);
        }
        return sources;
    }

    /** Records override-shipped content, which has no project behind it but still belongs to the pack. */
    protected List<ContentSource> overrideContentSources(List<String> relativePaths) {
        List<ContentSource> sources = new ArrayList<>();
        for (String relative : relativePaths) {
            ContentSource source = toContentSource(relative, "", "", "", "", "", "");
            if (source != null) sources.add(source);
        }
        return sources;
    }

    private ContentSource toContentSource(String relativePath, String projectId, String versionId,
                                          String projectName, String versionNumber, String url, String hash) {
        String normalized = relativePath.replace('\\', '/');
        int slash = normalized.indexOf('/');
        if (slash <= 0) return null;

        String folder = normalized.substring(0, slash).toLowerCase(Locale.ROOT);
        String fileName = normalized.substring(slash + 1);
        // Only top-level files in a content folder; a pack nesting jars deeper is not manageable.
        if (fileName.isBlank() || fileName.contains("/")) return null;

        boolean known = false;
        for (InstanceContentService.ContentType type : InstanceContentService.ContentType.values()) {
            if (type.folder().equals(folder)) { known = true; break; }
        }
        if (!known) return null;

        return new ContentSource(folder, fileName, projectId.isEmpty() ? "" : provider().id(),
                projectId, versionId, projectName, versionNumber, url,
                hash != null && hash.length() == 40 ? hash : "", 0L, ContentSource.ORIGIN_MODPACK, "");
    }

    private String stripPrefix(String entryName, List<String> prefixes) {
        for (String prefix : prefixes) {
            String withSlash = prefix.endsWith("/") ? prefix : prefix + "/";
            if (entryName.startsWith(withSlash)) {
                return entryName.substring(withSlash.length());
            }
        }
        return null;
    }
}
