package app.voltlauncher.server.routes;

import app.voltlauncher.core.AppPaths;
import app.voltlauncher.core.config.LauncherSettings;
import app.voltlauncher.core.config.SettingsStore;
import app.voltlauncher.core.discord.DiscordPresenceService;
import app.voltlauncher.core.update.LauncherUpdateService;
import app.voltlauncher.core.util.SystemOpener;
import app.voltlauncher.game.java.JavaInstallService;
import app.voltlauncher.game.java.JavaRuntimeResolver;
import app.voltlauncher.server.route.RequestBody;
import app.voltlauncher.server.route.RouteModule;
import app.voltlauncher.server.route.RouteRegistry;
import io.javalin.http.Context;
import org.json.JSONArray;
import org.json.JSONObject;

import java.nio.file.Path;
import java.util.Locale;

/** Launcher preferences, launcher directories and Java runtime management. */
public final class SettingsRoutes implements RouteModule {

    private final SettingsStore settings;
    private final JavaRuntimeResolver javaResolver;
    private final JavaInstallService javaInstaller;
    private final LauncherUpdateService updates;
    private final DiscordPresenceService presence;
    private final String launcherVersion;

    public SettingsRoutes(SettingsStore settings, JavaRuntimeResolver javaResolver,
                          JavaInstallService javaInstaller, LauncherUpdateService updates,
                          DiscordPresenceService presence, String launcherVersion) {
        this.settings = settings;
        this.javaResolver = javaResolver;
        this.javaInstaller = javaInstaller;
        this.updates = updates;
        this.presence = presence;
        this.launcherVersion = launcherVersion;
    }

    @Override
    public void register(RouteRegistry routes) {
        routes.get("/api/settings", this::read);
        routes.patch("/api/settings", this::patch);
        routes.post("/api/settings/reset", this::reset);

        routes.get("/api/settings/directories", this::directories);
        routes.post("/api/settings/directories/{id}/open", this::openDirectory);

        routes.get("/api/updates", this::checkUpdates);
        routes.post("/api/updates/download", this::downloadUpdate);
        routes.post("/api/updates/open-release", this::openRelease);

        routes.get("/api/integrations/discord", this::discordStatus);

        routes.get("/api/java/runtimes", this::listRuntimes);
        routes.post("/api/java/runtimes/{majorVersion}/install", this::installRuntime);
        routes.get("/api/java/runtimes/{majorVersion}/install", this::installStatus);
    }

    // ── preferences ───────────────────────────────────────────────────────────

    private JSONObject read(Context ctx) {
        return new JSONObject()
                .put("settings", settings.get().toJson())
                .put("launcherVersion", launcherVersion);
    }

    private JSONObject patch(Context ctx) throws Exception {
        LauncherSettings updated = settings.patch(RequestBody.json(ctx));
        return new JSONObject().put("settings", updated.toJson());
    }

    private JSONObject reset(Context ctx) throws Exception {
        return new JSONObject().put("settings", settings.save(LauncherSettings.defaults()).toJson());
    }

    // ── directories ───────────────────────────────────────────────────────────

    private JSONObject directories(Context ctx) {
        JSONArray array = new JSONArray();
        array.put(directory("root", "Launcher directory", AppPaths.baseDirectory()));
        array.put(directory("instances", "Profiles", AppPaths.instancesDirectory()));
        array.put(directory("logs", "Logs", AppPaths.logsDirectory()));
        array.put(directory("exports", "Exported packs", AppPaths.exportsDirectory()));
        array.put(directory("backups", "Profile backups", AppPaths.backupsDirectory()));
        array.put(directory("updates", "Downloaded updates", AppPaths.updatesDirectory()));
        array.put(directory("runtimes", "Java runtimes", AppPaths.runtimesDirectory()));
        array.put(directory("cache", "Cache", AppPaths.cacheDirectory()));
        return new JSONObject().put("directories", array);
    }

    private JSONObject openDirectory(Context ctx) throws Exception {
        Path path = directoryById(ctx.pathParam("id"));
        java.nio.file.Files.createDirectories(path);
        InstanceRoutes.openInFileManager(path);
        return new JSONObject().put("path", path.toString());
    }

    private Path directoryById(String id) {
        return switch (id.toLowerCase(Locale.ROOT)) {
            case "root" -> AppPaths.baseDirectory();
            case "instances" -> AppPaths.instancesDirectory();
            case "logs" -> AppPaths.logsDirectory();
            case "exports" -> AppPaths.exportsDirectory();
            case "backups" -> AppPaths.backupsDirectory();
            case "updates" -> AppPaths.updatesDirectory();
            case "runtimes" -> AppPaths.runtimesDirectory();
            case "cache" -> AppPaths.cacheDirectory();
            default -> throw new IllegalArgumentException("Unknown directory: " + id);
        };
    }

    private JSONObject directory(String id, String label, Path path) {
        return new JSONObject().put("id", id).put("label", label).put("path", path.toString());
    }

    // ── launcher updates ──────────────────────────────────────────────────────

    /**
     * Checks the release feed. Cached for a few minutes unless {@code force} is passed, so opening
     * the Updates screen repeatedly does not burn through GitHub's unauthenticated rate limit.
     */
    private JSONObject checkUpdates(Context ctx) {
        LauncherUpdateService.UpdateInfo info = updates.check(
                RequestBody.queryFlag(ctx, "force", false));
        return new JSONObject().put("update", info.toJson());
    }

    /**
     * Downloads the installer for the newest release and reports where it landed. Applying it is
     * left to the user: replacing a running launcher's own files is not something to do silently.
     */
    private JSONObject downloadUpdate(Context ctx) throws Exception {
        LauncherUpdateService.UpdateInfo info = updates.check(false);
        if (!info.available()) {
            throw new IllegalStateException("There is no newer release to download.");
        }
        Path file = updates.download(info);
        return new JSONObject()
                .put("path", file.toString())
                .put("fileName", file.getFileName().toString())
                .put("directory", file.getParent().toString());
    }

    private JSONObject openRelease(Context ctx) throws Exception {
        LauncherUpdateService.UpdateInfo info = updates.check(false);
        String url = info.releaseUrl();
        if (url == null || url.isBlank()) {
            throw new IllegalStateException("No release page is known yet.");
        }
        SystemOpener.openUrl(url);
        return new JSONObject().put("url", url);
    }

    // ── integrations ──────────────────────────────────────────────────────────

    /** Whether rich presence is connected, and if not, what is missing. */
    private JSONObject discordStatus(Context ctx) {
        return new JSONObject()
                .put("state", presence.status().name().toLowerCase(Locale.ROOT))
                .put("message", presence.statusMessage())
                .put("transport", DiscordPresenceService.transportName())
                .put("configured", !settings.get().discordApplicationId().isBlank());
    }

    // ── java runtimes ─────────────────────────────────────────────────────────

    private JSONObject listRuntimes(Context ctx) throws Exception {
        JSONArray detected = new JSONArray();
        for (JavaRuntimeResolver.JavaRuntime runtime : javaResolver.listDetectedRuntimes()) {
            detected.put(toJson(runtime));
        }

        JSONArray managed = new JSONArray();
        for (JavaRuntimeResolver.JavaRuntime runtime : javaResolver.listManagedRuntimes()) {
            managed.put(toJson(runtime));
        }

        return new JSONObject()
                .put("detected", detected)
                .put("managed", managed)
                .put("installable", new JSONArray(JavaInstallService.OFFERED_VERSIONS))
                .put("configured", configuredRuntimes());
    }

    private JSONArray configuredRuntimes() {
        JSONArray array = new JSONArray();
        for (LauncherSettings.JavaRuntimeEntry entry : settings.get().javaRuntimes()) {
            array.put(entry.toJson());
        }
        return array;
    }

    private JSONObject installRuntime(Context ctx) {
        return new JSONObject().put("job", toJson(javaInstaller.install(majorVersion(ctx))));
    }

    private JSONObject installStatus(Context ctx) {
        JavaInstallService.Job job = javaInstaller.job(majorVersion(ctx));
        if (job == null) {
            throw new java.util.NoSuchElementException("No installation running for that Java version");
        }
        return new JSONObject().put("job", toJson(job));
    }

    private int majorVersion(Context ctx) {
        try {
            return Integer.parseInt(ctx.pathParam("majorVersion"));
        } catch (NumberFormatException e) {
            throw new IllegalArgumentException("Java major version must be a number");
        }
    }

    private JSONObject toJson(JavaRuntimeResolver.JavaRuntime runtime) {
        return new JSONObject()
                .put("majorVersion", runtime.majorVersion())
                .put("path", runtime.javaExecutable().toString())
                .put("source", runtime.source());
    }

    private JSONObject toJson(JavaInstallService.Job job) {
        return new JSONObject()
                .put("majorVersion", job.majorVersion())
                .put("phase", job.phase().name().toLowerCase(Locale.ROOT))
                .put("message", job.message() == null ? JSONObject.NULL : job.message())
                .put("javaExecutable", job.javaExecutable() == null ? JSONObject.NULL : job.javaExecutable());
    }
}
