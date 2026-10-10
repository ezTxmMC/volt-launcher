package app.voltlauncher.server.routes;

import app.voltlauncher.auth.MinecraftAccountSession;
import app.voltlauncher.auth.session.MicrosoftAuth;
import app.voltlauncher.core.config.SettingsStore;
import app.voltlauncher.core.util.SystemOpener;
import app.voltlauncher.game.MinecraftLauncherService;
import app.voltlauncher.game.instance.Instance;
import app.voltlauncher.game.instance.InstanceBusyRegistry;
import app.voltlauncher.game.instance.InstanceSettings;
import app.voltlauncher.game.instance.ModpackOrigin;
import app.voltlauncher.game.instance.RunningInstanceStatus;
import app.voltlauncher.game.install.InstallationVerifier;
import app.voltlauncher.game.launch.InstanceLauncher;
import app.voltlauncher.game.launch.LaunchOptions;
import app.voltlauncher.game.platform.IPlatform;
import app.voltlauncher.game.platform.version.AvailableVersion;
import app.voltlauncher.server.route.RequestBody;
import app.voltlauncher.server.route.RouteModule;
import app.voltlauncher.server.route.RouteRegistry;
import io.javalin.http.Context;
import org.json.JSONArray;
import org.json.JSONObject;

import java.io.IOException;
import java.nio.file.Path;
import java.util.List;
import java.util.Locale;

/** Profile CRUD, version listings and the launch lifecycle. */
public final class InstanceRoutes implements RouteModule {

    private final MinecraftLauncherService launcher;
    private final MicrosoftAuth auth;
    private final SettingsStore settings;

    public InstanceRoutes(MinecraftLauncherService launcher, MicrosoftAuth auth, SettingsStore settings) {
        this.launcher = launcher;
        this.auth = auth;
        this.settings = settings;
    }

    @Override
    public void register(RouteRegistry routes) {
        routes.get("/api/platforms", this::listPlatforms);
        routes.get("/api/instances/versions", this::listVersions);
        routes.get("/api/instances/loader-versions", this::listLoaderVersions);

        routes.get("/api/instances", this::listInstances);
        routes.get("/api/instances/groups", this::listGroups);
        routes.post("/api/instances", this::createInstance);
        routes.patch("/api/instances/{name}", this::renameInstance);
        routes.delete("/api/instances/{name}", this::deleteInstance);
        routes.patch("/api/instances/{name}/settings", this::updateSettings);
        routes.post("/api/instances/{name}/duplicate", this::duplicateInstance);
        routes.post("/api/instances/{name}/favourite", this::setFavourite);
        routes.post("/api/instances/{name}/group", this::setGroup);
        routes.post("/api/instances/{name}/icon", this::setIcon);
        routes.post("/api/instances/{name}/open-folder", this::openFolder);

        routes.post("/api/instances/{name}/verify", this::verify);
        routes.get("/api/instances/{name}/verify", this::lastVerifyReport);

        routes.post("/api/instances/{name}/launch", this::launch);
        routes.get("/api/instances/{name}/launch-status", this::launchStatus);
        routes.post("/api/instances/{name}/stop", this::stop);
    }

    // ── versions ──────────────────────────────────────────────────────────────

    private JSONObject listPlatforms(Context ctx) {
        JSONArray platforms = new JSONArray();
        for (IPlatform platform : launcher.listPlatforms()) {
            platforms.put(new JSONObject()
                    .put("id", platform.id())
                    .put("displayName", platform.displayName()));
        }
        return new JSONObject().put("platforms", platforms);
    }

    private JSONObject listVersions(Context ctx) throws Exception {
        List<AvailableVersion> versions = launcher.listVersions(
                RequestBody.queryFlag(ctx, "includeSnapshots", false),
                RequestBody.queryFlag(ctx, "includeBetas", false),
                RequestBody.queryFlag(ctx, "includeAlphas", false));
        return new JSONObject().put("versions", toVersionArray(versions));
    }

    private JSONObject listLoaderVersions(Context ctx) throws Exception {
        List<AvailableVersion> versions = launcher.listLoaderVersions(
                RequestBody.requiredQuery(ctx, "platformId"),
                RequestBody.requiredQuery(ctx, "minecraftVersionId"));
        return new JSONObject().put("versions", toVersionArray(versions));
    }

    // ── instances ─────────────────────────────────────────────────────────────

    private JSONObject listInstances(Context ctx) throws Exception {
        JSONArray array = new JSONArray();
        for (Instance instance : launcher.listInstances()) {
            array.put(toJson(instance));
        }
        return new JSONObject().put("instances", array);
    }

    private JSONObject listGroups(Context ctx) throws Exception {
        return new JSONObject().put("groups", new JSONArray(launcher.listGroups()));
    }

    private JSONObject createInstance(Context ctx) throws Exception {
        JSONObject body = RequestBody.json(ctx);
        Instance instance = launcher.createInstance(
                RequestBody.requiredString(body, "name"),
                RequestBody.requiredString(body, "versionId"));
        return new JSONObject().put("instance", toJson(instance));
    }

    private JSONObject renameInstance(Context ctx) throws Exception {
        JSONObject body = RequestBody.json(ctx);
        Instance instance = launcher.renameInstance(
                ctx.pathParam("name"), RequestBody.requiredString(body, "name"));
        return new JSONObject().put("instance", toJson(instance));
    }

    private JSONObject deleteInstance(Context ctx) throws Exception {
        launcher.deleteInstance(ctx.pathParam("name"));
        return new JSONObject();
    }

    private JSONObject updateSettings(Context ctx) throws Exception {
        JSONObject body = RequestBody.json(ctx);
        Instance instance = launcher.updateInstanceSettings(
                ctx.pathParam("name"), InstanceSettings.fromJson(body));
        return new JSONObject().put("instance", toJson(instance));
    }

    /** Copying a profile can move gigabytes, so it runs as a task the UI follows. */
    private JSONObject duplicateInstance(Context ctx) throws Exception {
        JSONObject body = RequestBody.json(ctx);
        String taskId = launcher.duplicateInstanceAsync(ctx.pathParam("name"), body.optString("name", ""));
        return new JSONObject().put("taskId", taskId);
    }

    private JSONObject setFavourite(Context ctx) throws Exception {
        JSONObject body = RequestBody.json(ctx);
        Instance instance = launcher.setFavourite(ctx.pathParam("name"), body.optBoolean("favourite", true));
        return new JSONObject().put("instance", toJson(instance));
    }

    private JSONObject setGroup(Context ctx) throws Exception {
        JSONObject body = RequestBody.json(ctx);
        Instance instance = launcher.setGroup(ctx.pathParam("name"), body.optString("group", ""));
        return new JSONObject().put("instance", toJson(instance));
    }

    private JSONObject setIcon(Context ctx) throws Exception {
        JSONObject body = RequestBody.json(ctx);
        Instance instance = launcher.setIconUrl(ctx.pathParam("name"), body.optString("iconUrl", ""));
        return new JSONObject().put("instance", toJson(instance));
    }

    // ── verify and repair ─────────────────────────────────────────────────────

    private JSONObject verify(Context ctx) throws Exception {
        JSONObject body = RequestBody.json(ctx);
        String taskId = launcher.verifyInstanceAsync(
                ctx.pathParam("name"),
                body.optBoolean("deep", false),
                body.optBoolean("repair", false));
        return new JSONObject().put("taskId", taskId);
    }

    private JSONObject lastVerifyReport(Context ctx) {
        InstallationVerifier.Report report = launcher.lastVerifyReport(ctx.pathParam("name"));
        return new JSONObject().put("report", report == null ? JSONObject.NULL : report.toJson());
    }

    private JSONObject openFolder(Context ctx) throws Exception {
        Path folder = launcher.getInstanceFolder(ctx.pathParam("name"));
        openInFileManager(folder);
        return new JSONObject().put("path", folder.toString());
    }

    // ── launching ─────────────────────────────────────────────────────────────

    private JSONObject launch(Context ctx) throws Exception {
        String name = ctx.pathParam("name");
        // Profile-specific problems are reported before the account check: "this profile is still
        // installing" is more actionable than a generic sign-in error when both are true.
        launcher.findInstance(name);
        launcher.busyRegistry().requireIdle(name);

        // Quick play travels with the launch rather than being stored on the profile: joining a
        // particular server is a property of this launch, not of the profile.
        LaunchOptions options = LaunchOptions.fromJson(RequestBody.json(ctx));

        // With offline mode allowed, an unreachable Microsoft falls back to the cached session
        // rather than blocking the launch entirely.
        MinecraftAccountSession session = auth.getLaunchSession(settings.get().offlineModeAllowed());
        launcher.launchInstanceAsync(session, name, options);
        return new JSONObject().put("instanceName", name);
    }

    private JSONObject launchStatus(Context ctx) {
        String name = ctx.pathParam("name");
        InstanceLauncher.LaunchState state = launcher.getLaunchState(name);

        JSONObject json = new JSONObject()
                .put("phase", state.phase().name().toLowerCase(Locale.ROOT))
                .put("message", state.message() == null ? JSONObject.NULL : state.message());

        if (state.result() != null) {
            json.put("instanceName", state.result().instanceName())
                    .put("version", state.result().versionId())
                    .put("pid", state.result().pid())
                    .put("logFile", state.result().logFile())
                    .put("javaMajorVersion", state.result().javaMajorVersion())
                    .put("javaExecutable", state.result().javaExecutable());
        }
        return json;
    }

    private JSONObject stop(Context ctx) throws Exception {
        String name = ctx.pathParam("name");
        boolean stopped = launcher.stopInstance(name);
        return new JSONObject().put("instanceName", name).put("stopped", stopped);
    }

    // ── mapping ───────────────────────────────────────────────────────────────

    private JSONObject toJson(Instance instance) {
        RunningInstanceStatus running = launcher.getRunningInstanceStatus(instance.name());
        InstanceLauncher.LaunchState state = launcher.getLaunchState(instance.name());

        JSONObject json = new JSONObject()
                .put("name", instance.name())
                .put("slug", instance.slug())
                .put("versionId", instance.versionId())
                .put("versionType", instance.versionType())
                .put("createdAt", instance.createdAt())
                .put("lastPlayedAt", instance.lastPlayedAt())
                .put("totalPlaytimeMs", instance.totalPlaytimeMs())
                .put("favourite", instance.favourite())
                .put("groupName", instance.groupName())
                .put("iconUrl", instance.iconUrl())
                .put("gameDirectory", instance.gameDirectory().toString())
                .put("customGameDirectory", instance.hasCustomGameDirectory())
                .put("javaMajorVersion", instance.javaMajorVersion())
                .put("javaComponent", instance.javaComponent())
                .put("settings", instance.settings().toJson())
                .put("running", running != null)
                .put("launchPhase", state.phase().name().toLowerCase(Locale.ROOT));

        // Profiles built from a modpack carry its artwork, so the grid can show the real icon
        // instead of a version emoji. Hand-made profiles have none and keep the placeholder.
        ModpackOrigin pack = launcher.contentManifests().read(instance.slug()).modpack();
        json.put("packName", pack == null ? "" : pack.name())
                .put("packIconUrl", pack == null ? "" : pack.iconUrl());

        // A profile mid-install exists but is not yet playable; the UI disables its controls.
        InstanceBusyRegistry.Activity busy = launcher.busyRegistry().get(instance.name());
        json.put("busy", busy != null);
        if (busy != null) {
            json.put("busyStage", busy.reason())
                    .put("busyCompleted", busy.completed())
                    .put("busyTotal", busy.total())
                    .put("busyPercent", busy.percent());
        }

        if (running != null) {
            json.put("pid", running.pid())
                    .put("startedAt", running.startedAt())
                    .put("javaExecutable", running.javaExecutable())
                    .put("runningJavaMajorVersion", running.javaMajorVersion());
        }
        return json;
    }

    private JSONArray toVersionArray(List<AvailableVersion> versions) {
        JSONArray array = new JSONArray();
        for (AvailableVersion version : versions) {
            array.put(new JSONObject()
                    .put("id", version.id())
                    .put("type", version.type())
                    .put("releaseTime", version.releaseTime()));
        }
        return array;
    }

    /** Opens a directory in the desktop file manager. */
    static void openInFileManager(Path path) throws IOException {
        SystemOpener.openPath(path);
    }
}
