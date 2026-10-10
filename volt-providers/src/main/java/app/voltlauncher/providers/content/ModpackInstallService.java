package app.voltlauncher.providers.content;

import app.voltlauncher.core.config.SettingsStore;
import app.voltlauncher.core.util.HttpFetcher;
import app.voltlauncher.game.MinecraftLauncherService;
import app.voltlauncher.game.instance.ContentSource;
import app.voltlauncher.game.instance.Instance;
import app.voltlauncher.game.instance.ModpackOrigin;
import app.voltlauncher.game.store.ContentManifestStore;
import app.voltlauncher.providers.ProviderRegistry;
import app.voltlauncher.providers.curseforge.CurseForgePackInstaller;
import app.voltlauncher.providers.curseforge.CurseForgeProvider;
import app.voltlauncher.providers.ftb.FtbPackInstaller;
import app.voltlauncher.providers.ftb.FtbProvider;
import app.voltlauncher.providers.model.ProjectVersion;
import app.voltlauncher.providers.model.ProviderId;
import app.voltlauncher.providers.modrinth.ModrinthPackInstaller;
import app.voltlauncher.providers.technic.TechnicPackInstaller;
import app.voltlauncher.providers.technic.TechnicProvider;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.EnumMap;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Runs modpack installs, imports and updates in the background and exposes their progress, so the
 * UI can poll a job id instead of holding a request open for what can be several minutes.
 *
 * <p>The profile is created early — the loader has to be installed before its mods can land — so
 * it is registered as busy for the rest of the install. That is what stops the UI (and the API)
 * from launching or deleting a profile that is only half populated.
 */
public final class ModpackInstallService {

    public enum Phase { FETCHING, INSTALLING, DOWNLOADING_CONTENT, DONE, FAILED }

    /**
     * @param stage    identifier of the current step, for the UI to translate; may be null
     * @param completed units done, meaningful only when {@code total} is positive
     */
    public record Job(
            Phase phase,
            String stage,
            int completed,
            int total,
            String error,
            Instance instance) {

        public boolean hasProgress() {
            return total > 0;
        }

        public int percent() {
            if (!hasProgress()) return -1;
            return Math.min(100, Math.max(0, (int) Math.round((completed * 100.0) / total)));
        }
    }

    /** The result of asking whether a newer release of a profile's modpack exists. */
    public record UpdateCheck(
            ModpackOrigin origin,
            boolean updateAvailable,
            String latestVersionId,
            String latestVersionNumber,
            String latestReleaseDate,
            String reason) {}

    private final MinecraftLauncherService launcher;
    private final ProviderRegistry providers;
    private final SettingsStore settings;
    private final Map<ProviderId, AbstractModpackInstaller> installers = new EnumMap<>(ProviderId.class);
    private final ConcurrentHashMap<String, Job> jobs = new ConcurrentHashMap<>();

    public ModpackInstallService(MinecraftLauncherService launcher, ProviderRegistry providers, HttpFetcher http,
                                 CurseForgeProvider curseForge, SettingsStore settings) {
        this.launcher = launcher;
        this.providers = providers;
        this.settings = settings;
        register(new ModrinthPackInstaller(http));
        register(new CurseForgePackInstaller(http, curseForge, settings));
        register(new TechnicPackInstaller(http, (TechnicProvider) providers.require(ProviderId.TECHNIC),
                this::newestLoaderVersion));
        register(new FtbPackInstaller(http, (FtbProvider) providers.require(ProviderId.FTB)));
    }

    private void register(AbstractModpackInstaller installer) {
        installers.put(installer.provider(), installer);
    }

    /** The newest build of a loader for a Minecraft version, as a launcher version id. */
    private String newestLoaderVersion(String platformId, String minecraftVersion) throws Exception {
        return launcher.listLoaderVersions(platformId, minecraftVersion).stream()
                .findFirst()
                .map(app.voltlauncher.game.platform.version.AvailableVersion::id)
                .orElse("");
    }

    // ── install from a provider ───────────────────────────────────────────────

    /**
     * Starts an installation and returns its job id immediately.
     *
     * @param name blank to use the pack's own name
     */
    public String installAsync(ProviderId providerId, String versionId, String name) {
        AbstractModpackInstaller installer = require(providerId);
        String projectId = safeProjectId(providerId, versionId);
        String iconUrl = safeIconUrl(providerId, projectId);

        return startJob(jobId -> {
            AbstractModpackInstaller.PackInfo info = installer.fetchPackInfo(versionId);
            try {
                ModpackOrigin origin = new ModpackOrigin(
                        providerId.id(), projectId, versionId, info.packVersion(), info.packName(), "", iconUrl);
                createAndPopulate(jobId, installer, info, name, origin);
            } finally {
                deleteQuietly(info.archiveFile());
            }
        });
    }

    // ── import a local archive ────────────────────────────────────────────────

    /**
     * Installs a {@code .mrpack} or CurseForge {@code .zip} sitting on the user's disk. The archive
     * is copied first, so a file picked off a removable drive cannot vanish mid-install.
     */
    public String importAsync(Path archive, String name) {
        if (archive == null || !Files.isRegularFile(archive)) {
            throw new IllegalArgumentException("Pack file not found: " + archive);
        }
        AbstractModpackInstaller installer = installerFor(archive);
        if (!installer.supportsImport()) {
            throw new IllegalArgumentException(
                    installer.provider().displayName() + " packs cannot be imported from a file.");
        }
        String sourceFile = archive.getFileName().toString();

        return startJob(jobId -> {
            Path copy = Files.createTempFile("voltlauncher-import-", suffixOf(sourceFile));
            Files.copy(archive, copy, java.nio.file.StandardCopyOption.REPLACE_EXISTING);
            try {
                AbstractModpackInstaller.PackInfo info = installer.readPackInfo(copy);
                // An imported archive has no upstream release to compare against, so it is recorded
                // without a project id and the UI will not offer to update it.
                ModpackOrigin origin = new ModpackOrigin(
                        installer.provider().id(), "", "", info.packVersion(), info.packName(), sourceFile, "");
                createAndPopulate(jobId, installer, info, name, origin);
            } finally {
                deleteQuietly(copy);
            }
        });
    }

    /**
     * Picks the installer for an archive by the manifest it carries.
     *
     * <p>The format is read out of the file rather than taken from its extension, because all
     * three importable formats are zips and users regularly rename them.
     */
    public AbstractModpackInstaller installerFor(Path archive) {
        if (AbstractModpackInstaller.hasEntry(archive, ModrinthPackInstaller.indexEntry())) {
            return require(ProviderId.MODRINTH);
        }
        if (AbstractModpackInstaller.hasEntry(archive, CurseForgePackInstaller.manifestEntry())) {
            return require(ProviderId.CURSEFORGE);
        }
        if (AbstractModpackInstaller.hasEntryEndingWith(archive, TechnicPackInstaller.versionJsonEntry())) {
            return require(ProviderId.TECHNIC);
        }
        if (AbstractModpackInstaller.hasEntryEndingWith(archive, TechnicPackInstaller.modpackJarEntry())) {
            // A Technic zip whose bin/ holds only the merged jar cannot state its Forge build, and
            // guessing it would produce a profile that launches the wrong loader.
            throw new IllegalArgumentException(
                    "This looks like a Technic pack, but it carries no bin/version.json, so the "
                            + "launcher cannot tell which Forge build it needs. Install it from "
                            + "Discover \u2192 Technic instead.");
        }
        throw new IllegalArgumentException(
                "Not a supported modpack: " + archive.getFileName()
                        + ". Expected a Modrinth .mrpack, a CurseForge .zip export or a Technic client zip.");
    }

    // ── update an installed pack ──────────────────────────────────────────────

    /** Looks up whether the profile's modpack has a newer release than the one installed. */
    public UpdateCheck checkUpdate(String instanceName) throws Exception {
        Instance instance = launcher.findInstance(instanceName);
        ModpackOrigin origin = launcher.contentManifests().read(instance.slug()).modpack();

        if (origin == null) {
            return new UpdateCheck(null, false, "", "", "", "This profile was not created from a modpack.");
        }
        if (!origin.isUpdatable()) {
            return new UpdateCheck(origin, false, "", "", "",
                    "Imported packs have no upstream release to check against.");
        }

        // A delisted project, an offline provider or a bridge that is not running must not hide the
        // fact that this profile came from a pack — the banner still has to render, just without an
        // update offer.
        List<ProjectVersion> versions;
        try {
            ProviderId providerId = ProviderId.fromId(origin.provider());
            versions = providers.requireAvailable(providerId).versions(origin.projectId(), null, null);
        } catch (Exception e) {
            return new UpdateCheck(origin, false, "", "", "",
                    "Could not reach " + origin.provider() + " to check for updates: "
                            + (e.getMessage() == null ? e.getClass().getSimpleName() : e.getMessage()));
        }

        ProjectVersion latest = VersionOffer.pick(versions, origin.versionId());
        if (latest == null) {
            return new UpdateCheck(origin, false, "", "", "", "");
        }

        boolean available = !latest.versionId().equals(origin.versionId());
        return new UpdateCheck(origin, available, latest.versionId(),
                latest.versionNumber(), latest.datePublished(), "");
    }

    /**
     * Updates the profile to another release of its modpack.
     *
     * <p>Files the previous release brought in but the new one no longer lists are deleted, while
     * anything the user installed themselves is left alone — that distinction is exactly what the
     * content manifest records. The game directory keeps its worlds and configs.
     */
    public String updateAsync(String instanceName, String targetVersionId) {
        return startJob(jobId -> {
            Instance instance = launcher.findInstance(instanceName);
            ContentManifestStore manifests = launcher.contentManifests();
            ModpackOrigin origin = manifests.read(instance.slug()).modpack();
            if (origin == null || !origin.isUpdatable()) {
                throw new IllegalStateException("This profile has no updatable modpack.");
            }

            ProviderId providerId = ProviderId.fromId(origin.provider());
            AbstractModpackInstaller installer = require(providerId);
            String versionId = targetVersionId == null || targetVersionId.isBlank()
                    ? checkUpdate(instanceName).latestVersionId()
                    : targetVersionId;
            if (versionId == null || versionId.isBlank()) {
                throw new IllegalStateException("No target release to update to.");
            }

            AbstractModpackInstaller.PackInfo info = installer.fetchPackInfo(versionId);
            // Taken before anything is touched: an update deletes the files the new release no
            // longer ships, and that is exactly the change people want to be able to undo.
            backUpBeforeUpdate(instance.name());

            launcher.busyRegistry().begin(instance.name(), "updating modpack");
            try {
                jobs.put(jobId, new Job(Phase.INSTALLING, "installing", 0, 0, null, instance));

                // A pack that moved to a new Minecraft or loader build re-points the profile; the
                // next launch installs whatever that version needs.
                Instance target = instance;
                if (!info.versionId().equals(instance.versionId())) {
                    target = launcher.repointInstance(instance.name(), info.versionId());
                }

                List<ContentSource> previous = manifests.read(target.slug()).content().stream()
                        .filter(ContentSource::isFromModpack)
                        .toList();

                Instance populated = target;
                jobs.put(jobId, new Job(Phase.DOWNLOADING_CONTENT, "downloading", 0, 0, null, populated));
                List<ContentSource> installed = installer.applyPackContents(populated, info,
                        (stage, completed, total) -> {
                            jobs.put(jobId, new Job(Phase.DOWNLOADING_CONTENT, stage, completed, total, null, populated));
                            launcher.busyRegistry().progress(populated.name(), stage, completed, total);
                        });

                removeDroppedFiles(populated, previous, installed);

                ModpackOrigin updated = origin.withVersion(versionId, info.packVersion());
                manifests.replaceModpackContent(populated.slug(), updated, installed);

                jobs.put(jobId, new Job(Phase.DONE, "done", 0, 0, null, populated));
            } finally {
                launcher.busyRegistry().end(instance.name());
                deleteQuietly(info.archiveFile());
            }
        });
    }

    public Job job(String jobId) {
        return jobs.get(jobId);
    }

    public void clearJob(String jobId) {
        jobs.remove(jobId);
    }

    // ── internals ─────────────────────────────────────────────────────────────

    /** Runs {@code work} on a virtual thread under a fresh job id, mapping failures onto the job. */
    private String startJob(JobBody work) {
        String jobId = UUID.randomUUID().toString();
        jobs.put(jobId, new Job(Phase.FETCHING, "fetching", 0, 0, null, null));

        Thread.ofVirtual().name("modpack-job-" + jobId).start(() -> {
            try {
                work.run(jobId);
                // A body that finished without publishing a terminal state still counts as done.
                Job current = jobs.get(jobId);
                if (current != null && current.phase() != Phase.DONE && current.phase() != Phase.FAILED) {
                    jobs.put(jobId, new Job(Phase.DONE, "done", 0, 0, null, current.instance()));
                }
            } catch (Exception e) {
                jobs.put(jobId, new Job(Phase.FAILED, "failed", 0, 0,
                        e.getMessage() != null ? e.getMessage() : "Modpack operation failed", null));
            }
        });
        return jobId;
    }

    private interface JobBody {
        void run(String jobId) throws Exception;
    }

    /** Creates the profile and applies the pack, rolling the profile back if anything fails. */
    private void createAndPopulate(String jobId, AbstractModpackInstaller installer,
                                   AbstractModpackInstaller.PackInfo info, String name,
                                   ModpackOrigin origin) throws Exception {
        jobs.put(jobId, new Job(Phase.INSTALLING, "installing", 0, 0, null, null));
        String instanceName = name == null || name.isBlank() ? info.packName() : name;

        Instance instance = launcher.createInstance(instanceName, info.versionId());
        launcher.busyRegistry().begin(instance.name(), "installing modpack");
        try {
            jobs.put(jobId, new Job(Phase.DOWNLOADING_CONTENT, "downloading", 0, 0, null, instance));

            List<ContentSource> installed = installer.applyPackContents(instance, info,
                    (stage, completed, total) -> {
                        jobs.put(jobId, new Job(Phase.DOWNLOADING_CONTENT, stage, completed, total, null, instance));
                        launcher.busyRegistry().progress(instance.name(), stage, completed, total);
                    });

            launcher.contentManifests().replaceModpackContent(instance.slug(), origin, installed);
            launcher.busyRegistry().end(instance.name());
            jobs.put(jobId, new Job(Phase.DONE, "done", 0, 0, null, instance));
        } catch (Exception e) {
            // Roll back so a failed install never leaves a broken profile in the list. The busy
            // marker is cleared first, otherwise the delete would refuse itself.
            launcher.busyRegistry().end(instance.name());
            try { launcher.deleteInstance(instance.name()); } catch (Exception ignored) { /* best effort */ }
            throw e;
        }
    }

    /** Deletes files the old pack release installed that the new one no longer ships. */
    private void removeDroppedFiles(Instance instance, List<ContentSource> previous, List<ContentSource> current)
            throws Exception {
        Set<String> kept = new HashSet<>();
        current.forEach(source -> kept.add(key(source)));

        for (ContentSource stale : previous) {
            if (kept.contains(key(stale))) continue;
            Path file = instance.gameDirectory().resolve(stale.contentType()).resolve(stale.fileName());
            Files.deleteIfExists(file);
            Files.deleteIfExists(file.resolveSibling(stale.fileName() + ".disabled"));
        }
    }

    /**
     * Snapshots the profile before a pack update, when the user asked for that.
     *
     * <p>A failure here is reported but not fatal: refusing to update because the safety net
     * could not be built would be a worse outcome than updating without it, and the user is told
     * either way.
     */
    private void backUpBeforeUpdate(String instanceName) {
        try {
            if (!settings.get().backupBeforePackUpdate()) return;
            launcher.backups().create(instanceName, "Before a modpack update");
        } catch (Exception e) {
            System.err.println("[Modpack] Could not back up '" + instanceName + "' before the update: "
                    + e.getMessage());
        }
    }

    private String key(ContentSource source) {
        return source.contentType().toLowerCase(Locale.ROOT) + "/" + source.fileName().toLowerCase(Locale.ROOT);
    }

    private AbstractModpackInstaller require(ProviderId providerId) {
        AbstractModpackInstaller installer = installers.get(providerId);
        if (installer == null) {
            throw new IllegalArgumentException("No modpack support for provider " + providerId.id());
        }
        return installer;
    }

    /**
     * The project a version belongs to, for the update check later. A lookup failure is not fatal:
     * the pack still installs, it just cannot be offered updates.
     */
    private String safeProjectId(ProviderId providerId, String versionId) {
        try {
            return providers.requireAvailable(providerId).version(versionId).projectId();
        } catch (Exception e) {
            return "";
        }
    }

    /**
     * The pack's artwork, stored with the profile so its card can show the real icon instead of a
     * placeholder. Purely cosmetic, so a lookup failure is not worth failing the install over.
     */
    private String safeIconUrl(ProviderId providerId, String projectId) {
        if (projectId == null || projectId.isBlank()) return "";
        try {
            String icon = providers.requireAvailable(providerId).project(projectId).summary().iconUrl();
            return icon == null ? "" : icon;
        } catch (Exception e) {
            return "";
        }
    }

    private String suffixOf(String fileName) {
        int dot = fileName.lastIndexOf('.');
        return dot > 0 ? fileName.substring(dot) : ".zip";
    }

    private void deleteQuietly(Path path) {
        if (path == null) return;
        try {
            Files.deleteIfExists(path);
        } catch (Exception ignored) {
            // Temp file in the system temp directory; the OS will reclaim it.
        }
    }
}
