package app.voltlauncher.server.routes;

import app.voltlauncher.core.AppPaths;
import app.voltlauncher.game.MinecraftLauncherService;
import app.voltlauncher.game.log.GameLogService;
import app.voltlauncher.server.route.RequestBody;
import app.voltlauncher.server.route.RouteModule;
import app.voltlauncher.server.route.RouteRegistry;
import io.javalin.http.Context;
import org.json.JSONArray;
import org.json.JSONObject;

import java.nio.file.Path;

/**
 * Game logs and crash reports.
 *
 * <p>Reading a log is a plain polled GET rather than a stream: the console panel wants a snapshot
 * it can page through, and the offset the previous read returned is enough to follow a running
 * game without a persistent connection to keep alive.
 */
public final class LogRoutes implements RouteModule {

    private final MinecraftLauncherService launcher;

    public LogRoutes(MinecraftLauncherService launcher) {
        this.launcher = launcher;
    }

    @Override
    public void register(RouteRegistry routes) {
        routes.get("/api/instances/{name}/logs", this::listLogs);
        routes.get("/api/instances/{name}/logs/latest-crash", this::latestCrash);
        routes.get("/api/instances/{name}/logs/{logId}", this::readLog);
        routes.delete("/api/instances/{name}/logs/{logId}", this::clearLog);
        routes.post("/api/instances/{name}/logs/{logId}/open-folder", this::openFolder);
    }

    private JSONObject listLogs(Context ctx) throws Exception {
        JSONArray array = new JSONArray();
        for (GameLogService.LogSource source : launcher.logs().list(ctx.pathParam("name"))) {
            array.put(source.toJson());
        }
        return new JSONObject().put("logs", array);
    }

    /** The crash report a failed launch should point at, or nothing when there is none. */
    private JSONObject latestCrash(Context ctx) throws Exception {
        GameLogService.LogSource crash = launcher.logs().latestCrashReport(ctx.pathParam("name"));
        return new JSONObject().put("log", crash == null ? JSONObject.NULL : crash.toJson());
    }

    private JSONObject readLog(Context ctx) throws Exception {
        // A negative offset means "give me the tail", which is what a freshly opened console wants.
        long offset = Long.parseLong(orDefault(ctx.queryParam("offset"), "-1"));
        int maxBytes = RequestBody.queryInt(ctx, "maxBytes", 0);
        GameLogService.LogChunk chunk = launcher.logs().read(
                ctx.pathParam("name"), ctx.pathParam("logId"), offset, maxBytes);
        return chunk.toJson();
    }

    private JSONObject clearLog(Context ctx) throws Exception {
        launcher.logs().clear(ctx.pathParam("name"), ctx.pathParam("logId"));
        return new JSONObject();
    }

    private JSONObject openFolder(Context ctx) throws Exception {
        Path file = launcher.logs().resolve(ctx.pathParam("name"), ctx.pathParam("logId"));
        Path folder = file.getParent() == null ? AppPaths.logsDirectory() : file.getParent();
        InstanceRoutes.openInFileManager(folder);
        return new JSONObject().put("path", folder.toString());
    }

    private static String orDefault(String value, String fallback) {
        return value == null || value.isBlank() ? fallback : value.trim();
    }
}
