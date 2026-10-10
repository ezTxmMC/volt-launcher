package app.voltlauncher.game;

import app.voltlauncher.auth.MinecraftAccountSession;
import app.voltlauncher.core.config.SettingsStore;
import app.voltlauncher.core.task.TaskRegistry;
import app.voltlauncher.core.util.HttpFetcher;
import app.voltlauncher.game.backup.InstanceBackupService;
import app.voltlauncher.game.install.AssetInstaller;
import app.voltlauncher.game.install.InstallationVerifier;
import app.voltlauncher.game.instance.Instance;
import app.voltlauncher.game.instance.InstanceBusyRegistry;
import app.voltlauncher.game.instance.InstanceContentService;
import app.voltlauncher.game.instance.InstanceManager;
import app.voltlauncher.game.instance.InstanceSettings;
import app.voltlauncher.game.instance.RunningInstanceStatus;
import app.voltlauncher.game.java.JavaRuntimeResolver;
import app.voltlauncher.game.launch.InstanceLauncher;
import app.voltlauncher.game.launch.LaunchCommandBuilder;
import app.voltlauncher.game.launch.LaunchOptions;
import app.voltlauncher.game.log.GameLogService;
import app.voltlauncher.game.media.ScreenshotService;
import app.voltlauncher.game.platform.IPlatform;
import app.voltlauncher.game.platform.PlatformRegistry;
import app.voltlauncher.game.platform.version.AvailableVersion;
import app.voltlauncher.game.platform.version.VersionOrdering;
import app.voltlauncher.game.platform.version.resolver.VanillaVersionResolver;
import app.voltlauncher.game.store.ContentManifestStore;
import app.voltlauncher.game.store.LauncherInstanceStore;
import app.voltlauncher.game.world.ServerListService;
import app.voltlauncher.game.world.WorldService;
import org.json.JSONObject;

import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;

/**
 * Facade over instance management, version resolution and process launching.
 *
 * <p>Deliberately free of any content-provider knowledge (Modrinth, CurseForge); provider
 * integrations live in {@code volt-providers} and drive this service from the outside, which
 * keeps the module graph acyclic.
 */
public final class MinecraftLauncherService {

    private final HttpFetcher http;
    private final InstanceManager instanceManager;
    private final VanillaVersionResolver versionResolver;
    private final PlatformRegistry platformRegistry;
    private final IPlatform defaultPlatform;
    private final AssetInstaller assetInstaller;
    private final InstallationVerifier verifier;
    private final JavaRuntimeResolver javaResolver;
    private final InstanceLauncher instanceLauncher;
    private final InstanceContentService contentService;
    private final ContentManifestStore contentManifests;
    private final InstanceBusyRegistry busyRegistry = new InstanceBusyRegistry();
    private final TaskRegistry tasks;
    private final WorldService worldService;
    private final ServerListService serverListService;
    private final ScreenshotService screenshotService;
    private final GameLogService logService;
    private final InstanceBackupService backupService;

    public MinecraftLauncherService(String launcherClientId, SettingsStore launcherSettings) {
        this(launcherClientId, launcherSettings, new TaskRegistry());
    }

    /**
     * @param launcherSettings the launcher-wide preferences that supply the default heap size, JVM
     *                         arguments and pinned Java paths for profiles that do not override them
     * @param tasks            where long-running operations report, so one screen can show them all
     */
    public MinecraftLauncherService(String launcherClientId, SettingsStore launcherSettings, TaskRegistry tasks) {
        this.tasks = tasks;
        this.http = new HttpFetcher();
        this.versionResolver = new VanillaVersionResolver(http);
        this.platformRegistry = PlatformRegistry.withDefaults(versionResolver, http);
        this.defaultPlatform = platformRegistry.requireDefault();
        this.javaResolver = new JavaRuntimeResolver();
        this.assetInstaller = new AssetInstaller(http, versionResolver, javaResolver);
        this.verifier = new InstallationVerifier(assetInstaller, versionResolver);
        this.instanceManager = new InstanceManager(new LauncherInstanceStore(), versionResolver, platformRegistry);
        this.contentManifests = new ContentManifestStore();
        this.contentService = new InstanceContentService(instanceManager, contentManifests);
        this.instanceLauncher = new InstanceLauncher(
                instanceManager, platformRegistry, defaultPlatform, assetInstaller,
                new LaunchCommandBuilder(launcherClientId, launcherSettings), javaResolver, launcherSettings);
        this.worldService = new WorldService(instanceManager);
        this.serverListService = new ServerListService(instanceManager);
        this.screenshotService = new ScreenshotService(instanceManager);
        this.logService = new GameLogService(instanceManager);
        this.backupService = new InstanceBackupService(instanceManager, busyRegistry, tasks, launcherSettings);
    }

    // ── Collaborator access (used by provider integrations) ───────────────────

    public HttpFetcher http() {
        return http;
    }

    public InstanceManager instanceManager() {
        return instanceManager;
    }

    public JavaRuntimeResolver javaResolver() {
        return javaResolver;
    }

    public TaskRegistry tasks() {
        return tasks;
    }

    public WorldService worlds() {
        return worldService;
    }

    public ServerListService servers() {
        return serverListService;
    }

    public ScreenshotService screenshots() {
        return screenshotService;
    }

    public GameLogService logs() {
        return logService;
    }

    public InstanceBackupService backups() {
        return backupService;
    }

    /** Long-running operations register here so the rest of the app can refuse to interfere. */
    public InstanceBusyRegistry busyRegistry() {
        return busyRegistry;
    }

    /** Notified when a game starts and stops, which is what drives Discord rich presence. */
    public void setLaunchListener(InstanceLauncher.LaunchListener listener) {
        instanceLauncher.setListener(listener);
    }

    // ── Instance queries ──────────────────────────────────────────────────────

    public List<Instance> listInstances() throws Exception {
        return instanceManager.listInstances();
    }

    public List<String> listGroups() throws Exception {
        return instanceManager.listGroups();
    }

    public Instance findInstance(String name) throws Exception {
        return instanceManager.findByName(name);
    }

    /**
     * Creates an instance and installs everything needed to launch it. On failure the
     * partially created instance is removed again so no half-installed profile is left behind.
     */
    public Instance createInstance(String name, String versionId) throws Exception {
        IPlatform platform = platformRegistry.resolvePlatformForVersion(versionId, defaultPlatform);
        JSONObject meta = platform.versionResolver().resolveMetadata(versionId);
        String versionType = PlatformRegistry.VANILLA_ID.equals(platform.id())
                ? meta.optString("type", "release")
                : platform.id();

        // Store the fully resolved version id so a "latest loader" selection stays pinned.
        String resolvedVersionId = meta.optString("id", versionId);

        Instance instance = instanceManager.createInstance(name, resolvedVersionId, versionType, meta);

        // The profile is listed the moment its record is written, but downloading assets and
        // running the loader's processors takes minutes. It is marked busy for that whole window
        // so nothing can launch or delete a profile that is not installed yet.
        busyRegistry.begin(instance.name(), "installing");
        try {
            // A single pass suffices for every platform: loader metadata already carries the
            // merged vanilla libraries and points at the vanilla client jar via its "jar" field.
            assetInstaller.ensureInstallation(instance, meta);
            return instance;
        } catch (Exception e) {
            try {
                instanceManager.removeInstance(instance.name());
            } catch (Exception ignored) {
                // Best effort: the caller already has the real failure to report.
            }
            throw e;
        } finally {
            busyRegistry.end(instance.name());
        }
    }

    public void deleteInstance(String name) throws Exception {
        busyRegistry.requireIdle(name);
        if (instanceLauncher.isRunning(name)) {
            throw new IllegalStateException("Instance is currently running. Stop it before deleting.");
        }
        instanceManager.removeInstance(name);
        instanceLauncher.clearState(name);
    }

    public Instance renameInstance(String name, String newName) throws Exception {
        busyRegistry.requireIdle(name);
        if (instanceLauncher.isRunning(name)) {
            throw new IllegalStateException("Instance is currently running. Stop it before renaming.");
        }
        return instanceManager.renameInstance(name, newName);
    }

    /**
     * Copies a profile in the background and returns the task id to follow. Copying a modpack
     * profile means copying gigabytes, which is far too long to hold an HTTP request open for.
     */
    public String duplicateInstanceAsync(String name, String newName) throws Exception {
        Instance source = instanceManager.findByName(name);
        busyRegistry.requireIdle(source.name());
        if (instanceLauncher.isRunning(source.name())) {
            throw new IllegalStateException("Instance is currently running. Stop it before duplicating.");
        }

        String taskId = tasks.begin("duplicate", "Duplicating " + source.name(), source.name());
        Thread.ofVirtual().name("duplicate-" + source.slug()).start(() -> {
            busyRegistry.begin(source.name(), "duplicating");
            try {
                Instance copy = instanceManager.duplicateInstance(source.name(), newName,
                        (completed, total) -> tasks.progress(taskId, "copying", completed, total));
                tasks.succeed(taskId, copy.name());
            } catch (Exception e) {
                tasks.fail(taskId, e.getMessage() == null ? "Could not duplicate the profile" : e.getMessage());
            } finally {
                busyRegistry.end(source.name());
            }
        });
        return taskId;
    }

    public Path getInstanceFolder(String name) throws Exception {
        return instanceManager.findByName(name).gameDirectory();
    }

    public Instance updateInstanceSettings(String name, InstanceSettings settings) throws Exception {
        busyRegistry.requireIdle(name);
        return instanceManager.updateSettings(name, settings);
    }

    public Instance setFavourite(String name, boolean favourite) throws Exception {
        return instanceManager.setFavourite(name, favourite);
    }

    public Instance setGroup(String name, String group) throws Exception {
        return instanceManager.setGroup(name, group);
    }

    public Instance setIconUrl(String name, String iconUrl) throws Exception {
        return instanceManager.setIconUrl(name, iconUrl);
    }

    /**
     * Moves a profile onto another game version, keeping its directory and content. Used by a
     * modpack update whose new release targets a different Minecraft or loader build.
     */
    public Instance repointInstance(String name, String versionId) throws Exception {
        IPlatform platform = platformRegistry.resolvePlatformForVersion(versionId, defaultPlatform);
        JSONObject meta = platform.versionResolver().resolveMetadata(versionId);
        String versionType = PlatformRegistry.VANILLA_ID.equals(platform.id())
                ? meta.optString("type", "release")
                : platform.id();

        Instance updated = instanceManager.updateVersion(
                name, meta.optString("id", versionId), versionType, meta);
        assetInstaller.ensureInstallation(updated, meta);
        return updated;
    }

    // ── Verify and repair ─────────────────────────────────────────────────────

    /**
     * Checks a profile's game files and, when asked, re-downloads the damaged ones. Runs in the
     * background under a task, because a deep check hashes every asset object.
     */
    public String verifyInstanceAsync(String name, boolean deep, boolean repair) throws Exception {
        Instance instance = instanceManager.findByName(name);
        busyRegistry.requireIdle(instance.name());
        if (repair && instanceLauncher.isRunning(instance.name())) {
            throw new IllegalStateException("Instance is currently running. Stop it before repairing.");
        }

        String taskId = tasks.begin(repair ? "repair" : "verify",
                (repair ? "Repairing " : "Verifying ") + instance.name(), instance.name());
        Thread.ofVirtual().name("verify-" + instance.slug()).start(() -> {
            busyRegistry.begin(instance.name(), repair ? "repairing" : "verifying");
            try {
                IPlatform platform = platformRegistry.resolvePlatformForVersion(
                        instance.versionId(), defaultPlatform);
                JSONObject meta = platform.versionResolver().resolveMetadata(instance.versionId());
                InstallationVerifier.Report report = verifier.verify(instance, meta, deep, repair,
                        (stage, completed, total) -> {
                            tasks.progress(taskId, stage, completed, total);
                            busyRegistry.progress(instance.name(), stage, completed, total);
                        });
                lastVerifyReports.put(instance.name().toLowerCase(java.util.Locale.ROOT), report);
                tasks.succeed(taskId, report.isHealthy()
                        ? "Everything is intact"
                        : report.missing() + " missing, " + report.corrupt() + " damaged");
            } catch (Exception e) {
                tasks.fail(taskId, e.getMessage() == null ? "Verification failed" : e.getMessage());
            } finally {
                busyRegistry.end(instance.name());
            }
        });
        return taskId;
    }

    private final java.util.concurrent.ConcurrentHashMap<String, InstallationVerifier.Report> lastVerifyReports =
            new java.util.concurrent.ConcurrentHashMap<>();

    /** The most recent verification result for a profile, or {@code null} if it never ran. */
    public InstallationVerifier.Report lastVerifyReport(String name) {
        return name == null ? null : lastVerifyReports.get(name.toLowerCase(java.util.Locale.ROOT));
    }

    // ── Content (mods / resourcepacks / shaderpacks / datapacks) ───────────────

    public List<InstanceContentService.ContentEntry> listContent(
            String name, InstanceContentService.ContentType type) throws Exception {
        return contentService.list(name, type);
    }

    public InstanceContentService.ContentEntry addContent(
            String name, InstanceContentService.ContentType type, Path source) throws Exception {
        busyRegistry.requireIdle(name);
        return contentService.add(name, type, source);
    }

    public void removeContent(
            String name, InstanceContentService.ContentType type, String fileName) throws Exception {
        busyRegistry.requireIdle(name);
        contentService.remove(name, type, fileName);
    }

    public InstanceContentService.ContentEntry toggleContent(
            String name, InstanceContentService.ContentType type, String fileName) throws Exception {
        busyRegistry.requireIdle(name);
        return contentService.toggle(name, type, fileName);
    }

    /**
     * Enables or disables every file of one kind at once — the fastest way to find out whether a
     * crash comes from the mods or from the profile itself.
     *
     * @return how many files changed state
     */
    public int setAllContentEnabled(String name, InstanceContentService.ContentType type, boolean enabled)
            throws Exception {
        busyRegistry.requireIdle(name);
        return contentService.setAllEnabled(name, type, enabled);
    }

    public InstanceContentService contentService() {
        return contentService;
    }

    /** Provenance records for installed files, used by update, import and export. */
    public ContentManifestStore contentManifests() {
        return contentManifests;
    }

    // ── Version queries ───────────────────────────────────────────────────────

    public List<IPlatform> listPlatforms() {
        return platformRegistry.list();
    }

    public List<AvailableVersion> listVersions(
            boolean includeSnapshots, boolean includeBetas, boolean includeAlphas) throws Exception {
        List<AvailableVersion> result = defaultPlatform.listVersions(includeSnapshots, includeBetas, includeAlphas);
        VersionOrdering.sortNewestFirst(result);
        return result;
    }

    public List<AvailableVersion> listLoaderVersions(String platformId, String minecraftVersionId) throws Exception {
        IPlatform platform = platformRegistry.require(platformId);
        List<AvailableVersion> result = new ArrayList<>(platform.versionResolver().listLoaderVersions(minecraftVersionId));
        VersionOrdering.sortNewestFirst(result);
        return result;
    }

    // ── Launch delegation ─────────────────────────────────────────────────────

    public void launchInstanceAsync(MinecraftAccountSession session, String instanceName) {
        launchInstanceAsync(session, instanceName, LaunchOptions.none());
    }

    public void launchInstanceAsync(MinecraftAccountSession session, String instanceName, LaunchOptions options) {
        busyRegistry.requireIdle(instanceName);
        instanceLauncher.launchAsync(session, instanceName, options);
    }

    public InstanceLauncher.LaunchState getLaunchState(String instanceName) {
        return instanceLauncher.getLaunchState(instanceName);
    }

    public boolean stopInstance(String instanceName) throws Exception {
        return instanceLauncher.stopInstance(instanceName);
    }

    public void stopAllRunningInstances() {
        instanceLauncher.stopAll();
    }

    public RunningInstanceStatus getRunningInstanceStatus(String instanceName) {
        return instanceLauncher.getRunningStatus(instanceName);
    }

    public List<RunningInstanceStatus> listRunningInstances() {
        return instanceLauncher.listRunning();
    }
}
