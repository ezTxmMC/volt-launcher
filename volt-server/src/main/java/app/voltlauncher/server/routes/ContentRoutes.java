package app.voltlauncher.server.routes;

import app.voltlauncher.game.MinecraftLauncherService;
import app.voltlauncher.game.instance.ContentSource;
import app.voltlauncher.game.instance.InstanceContentService;
import app.voltlauncher.providers.content.ContentVersionService;
import app.voltlauncher.providers.model.ProjectVersion;
import app.voltlauncher.server.route.RequestBody;
import app.voltlauncher.server.route.RouteModule;
import app.voltlauncher.server.route.RouteRegistry;
import io.javalin.http.Context;
import org.json.JSONArray;
import org.json.JSONObject;

import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;

/** Managing the files already installed in a profile: mods, resource packs, shaders, data packs. */
public final class ContentRoutes implements RouteModule {

    private final MinecraftLauncherService launcher;
    private final ContentVersionService versions;

    public ContentRoutes(MinecraftLauncherService launcher, ContentVersionService versions) {
        this.launcher = launcher;
        this.versions = versions;
    }

    @Override
    public void register(RouteRegistry routes) {
        routes.get("/api/instances/{name}/content/{type}", this::list);
        routes.post("/api/instances/{name}/content/{type}", this::addFromDisk);
        routes.delete("/api/instances/{name}/content/{type}/{file}", this::remove);
        routes.post("/api/instances/{name}/content/{type}/{file}/toggle", this::toggle);
        routes.post("/api/instances/{name}/content/{type}/toggle-all", this::toggleAll);
        routes.get("/api/instances/{name}/content/{type}/dependencies", this::dependencyWarnings);

        // Version management for individual installed files.
        routes.post("/api/instances/{name}/content/{type}/identify", this::identify);
        routes.get("/api/instances/{name}/content/{type}/updates", this::checkUpdates);
        routes.get("/api/instances/{name}/content/{type}/{file}/versions", this::fileVersions);
        routes.post("/api/instances/{name}/content/{type}/{file}/version", this::changeVersion);
    }

    /**
     * Switches every file of one kind on or off in a single call — the bisecting move when a
     * modded profile crashes and the question is whether the mods are to blame.
     */
    private JSONObject toggleAll(Context ctx) throws Exception {
        JSONObject body = RequestBody.json(ctx);
        boolean enabled = body.optBoolean("enabled", false);
        int changed = launcher.setAllContentEnabled(ctx.pathParam("name"), type(ctx), enabled);
        return new JSONObject().put("changed", changed).put("enabled", enabled);
    }

    /** Required dependencies that are missing or switched off among the installed files. */
    private JSONObject dependencyWarnings(Context ctx) throws Exception {
        JSONArray array = new JSONArray();
        for (InstanceContentService.DependencyWarning warning
                : launcher.contentService().checkDependencies(ctx.pathParam("name"), type(ctx))) {
            array.put(new JSONObject()
                    .put("fileName", warning.fileName())
                    .put("projectName", warning.projectName())
                    .put("dependencyProjectId", warning.dependencyProjectId())
                    .put("state", warning.state()));
        }
        return new JSONObject().put("warnings", array);
    }

    private JSONObject list(Context ctx) throws Exception {
        List<InstanceContentService.ContentEntry> items =
                launcher.listContent(ctx.pathParam("name"), type(ctx));

        JSONArray array = new JSONArray();
        items.forEach(item -> array.put(toJson(item)));
        return new JSONObject().put("items", array);
    }

    /**
     * Installs local files that the user dropped onto the window or picked from disk. Failures are
     * reported per file so one unreadable path does not discard the rest of a multi-file drop.
     */
    private JSONObject addFromDisk(Context ctx) throws Exception {
        JSONObject body = RequestBody.json(ctx);
        JSONArray paths = body.optJSONArray("paths");
        if (paths == null || paths.isEmpty()) {
            throw new IllegalArgumentException("Provide at least one file path in 'paths'");
        }

        String name = ctx.pathParam("name");
        InstanceContentService.ContentType type = type(ctx);

        JSONArray added = new JSONArray();
        List<String> failures = new ArrayList<>();
        for (int i = 0; i < paths.length(); i++) {
            String raw = paths.optString(i, "").trim();
            if (raw.isEmpty()) continue;
            try {
                added.put(toJson(launcher.addContent(name, type, Path.of(raw))));
            } catch (Exception e) {
                failures.add(raw + ": " + (e.getMessage() == null ? "could not be added" : e.getMessage()));
            }
        }

        return new JSONObject()
                .put("added", added)
                .put("failures", new JSONArray(failures));
    }

    private JSONObject remove(Context ctx) throws Exception {
        launcher.removeContent(ctx.pathParam("name"), type(ctx), ctx.pathParam("file"));
        return new JSONObject();
    }

    private JSONObject toggle(Context ctx) throws Exception {
        InstanceContentService.ContentEntry entry =
                launcher.toggleContent(ctx.pathParam("name"), type(ctx), ctx.pathParam("file"));
        return new JSONObject().put("item", toJson(entry));
    }

    // ── version management ────────────────────────────────────────────────────

    /** Matches files with no known origin against the providers by their contents. */
    private JSONObject identify(Context ctx) throws Exception {
        int matched = versions.identifyUntracked(ctx.pathParam("name"), type(ctx));
        return new JSONObject().put("identified", matched);
    }

    private JSONObject checkUpdates(Context ctx) throws Exception {
        List<ContentVersionService.UpdateCandidate> candidates =
                versions.checkUpdates(ctx.pathParam("name"), type(ctx));

        JSONArray array = new JSONArray();
        candidates.forEach(candidate -> array.put(new JSONObject()
                .put("contentType", candidate.contentType())
                .put("fileName", candidate.fileName())
                .put("projectId", candidate.projectId())
                .put("projectName", candidate.projectName())
                .put("currentVersionId", candidate.currentVersionId())
                .put("currentVersionNumber", candidate.currentVersionNumber())
                .put("latestVersionId", candidate.latestVersionId())
                .put("latestVersionNumber", candidate.latestVersionNumber())
                .put("latestFileName", candidate.latestFileName())
                .put("releaseDate", candidate.releaseDate())));
        return new JSONObject().put("updates", array);
    }

    private JSONObject fileVersions(Context ctx) throws Exception {
        List<ProjectVersion> available =
                versions.versionsFor(ctx.pathParam("name"), type(ctx), ctx.pathParam("file"));

        JSONArray array = new JSONArray();
        available.forEach(version -> array.put(version.toJson()));
        return new JSONObject().put("versions", array);
    }

    private JSONObject changeVersion(Context ctx) throws Exception {
        JSONObject body = RequestBody.json(ctx);
        ContentSource updated = versions.changeVersion(
                ctx.pathParam("name"), type(ctx), ctx.pathParam("file"),
                RequestBody.requiredString(body, "versionId"));
        return new JSONObject().put("source", updated.toJson());
    }

    // ── mapping ───────────────────────────────────────────────────────────────

    private InstanceContentService.ContentType type(Context ctx) {
        return InstanceContentService.ContentType.fromId(ctx.pathParam("type"));
    }

    private JSONObject toJson(InstanceContentService.ContentEntry entry) {
        JSONObject json = new JSONObject()
                .put("fileName", entry.fileName())
                .put("size", entry.size())
                .put("enabled", entry.enabled());

        ContentSource source = entry.source();
        json.put("source", source == null ? JSONObject.NULL : source.toJson());
        json.put("tracked", source != null && source.isTracked());
        return json;
    }
}
