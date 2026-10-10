package app.voltlauncher.server.routes;

import app.voltlauncher.game.MinecraftLauncherService;
import app.voltlauncher.game.media.ScreenshotService;
import app.voltlauncher.game.world.ServerListService;
import app.voltlauncher.game.world.WorldService;
import app.voltlauncher.server.route.RequestBody;
import app.voltlauncher.server.route.RouteModule;
import app.voltlauncher.server.route.RouteRegistry;
import io.javalin.http.Context;
import org.json.JSONArray;
import org.json.JSONObject;

import java.nio.file.Files;
import java.nio.file.Path;

/**
 * Everything inside a profile's game directory that the user thinks of as theirs: worlds, the
 * multiplayer server list and screenshots.
 */
public final class WorldRoutes implements RouteModule {

    /** Cache headers for images, which never change once written. */
    private static final String IMMUTABLE_CACHE = "private, max-age=3600";

    private final MinecraftLauncherService launcher;

    public WorldRoutes(MinecraftLauncherService launcher) {
        this.launcher = launcher;
    }

    @Override
    public void register(RouteRegistry routes) {
        routes.get("/api/instances/{name}/worlds", this::listWorlds);
        routes.delete("/api/instances/{name}/worlds/{world}", this::deleteWorld);
        routes.post("/api/instances/{name}/worlds/{world}/duplicate", this::duplicateWorld);
        routes.post("/api/instances/{name}/worlds/{world}/copy-to", this::copyWorld);
        routes.patch("/api/instances/{name}/worlds/{world}", this::renameWorld);
        routes.raw("GET", "/api/instances/{name}/worlds/{world}/icon", this::worldIcon);

        routes.get("/api/instances/{name}/servers", this::listServers);
        routes.post("/api/instances/{name}/servers", this::addServer);
        routes.delete("/api/instances/{name}/servers/{index}", this::removeServer);

        routes.get("/api/instances/{name}/screenshots", this::listScreenshots);
        routes.delete("/api/instances/{name}/screenshots/{file}", this::deleteScreenshot);
        routes.post("/api/instances/{name}/screenshots/open-folder", this::openScreenshotFolder);
        routes.raw("GET", "/api/instances/{name}/screenshots/{file}/image", this::screenshotImage);
    }

    // ── worlds ────────────────────────────────────────────────────────────────

    private JSONObject listWorlds(Context ctx) throws Exception {
        JSONArray array = new JSONArray();
        for (WorldService.World world : launcher.worlds().list(ctx.pathParam("name"))) {
            array.put(world.toJson());
        }
        return new JSONObject().put("worlds", array);
    }

    private JSONObject deleteWorld(Context ctx) throws Exception {
        requireIdle(ctx);
        launcher.worlds().delete(ctx.pathParam("name"), ctx.pathParam("world"));
        return new JSONObject();
    }

    private JSONObject duplicateWorld(Context ctx) throws Exception {
        requireIdle(ctx);
        JSONObject body = RequestBody.json(ctx);
        WorldService.World copy = launcher.worlds().duplicate(
                ctx.pathParam("name"), ctx.pathParam("world"), body.optString("name", ""));
        return new JSONObject().put("world", copy.toJson());
    }

    private JSONObject copyWorld(Context ctx) throws Exception {
        requireIdle(ctx);
        JSONObject body = RequestBody.json(ctx);
        String target = RequestBody.requiredString(body, "instance");
        launcher.busyRegistry().requireIdle(target);

        WorldService.World copy = launcher.worlds().copyToInstance(
                ctx.pathParam("name"), ctx.pathParam("world"), target);
        return new JSONObject().put("world", copy.toJson()).put("instance", target);
    }

    private JSONObject renameWorld(Context ctx) throws Exception {
        requireIdle(ctx);
        JSONObject body = RequestBody.json(ctx);
        WorldService.World world = launcher.worlds().rename(
                ctx.pathParam("name"), ctx.pathParam("world"), RequestBody.requiredString(body, "name"));
        return new JSONObject().put("world", world.toJson());
    }

    private void worldIcon(Context ctx) throws Exception {
        Path icon = launcher.worlds().iconPath(ctx.pathParam("name"), ctx.pathParam("world"));
        if (icon == null) {
            ctx.status(404).result("");
            return;
        }
        ctx.contentType("image/png").header("Cache-Control", IMMUTABLE_CACHE);
        ctx.result(Files.readAllBytes(icon));
    }

    // ── servers ───────────────────────────────────────────────────────────────

    private JSONObject listServers(Context ctx) throws Exception {
        JSONArray array = new JSONArray();
        for (ServerListService.ServerEntry entry : launcher.servers().list(ctx.pathParam("name"))) {
            array.put(entry.toJson());
        }
        return new JSONObject().put("servers", array);
    }

    private JSONObject addServer(Context ctx) throws Exception {
        requireIdle(ctx);
        JSONObject body = RequestBody.json(ctx);
        ServerListService.ServerEntry entry = launcher.servers().add(
                ctx.pathParam("name"),
                body.optString("name", ""),
                RequestBody.requiredString(body, "address"));
        return new JSONObject().put("server", entry.toJson());
    }

    private JSONObject removeServer(Context ctx) throws Exception {
        requireIdle(ctx);
        int index;
        try {
            index = Integer.parseInt(ctx.pathParam("index"));
        } catch (NumberFormatException e) {
            throw new IllegalArgumentException("Server index must be a number");
        }
        launcher.servers().remove(ctx.pathParam("name"), index);
        return new JSONObject();
    }

    // ── screenshots ───────────────────────────────────────────────────────────

    private JSONObject listScreenshots(Context ctx) throws Exception {
        JSONArray array = new JSONArray();
        for (ScreenshotService.Screenshot screenshot : launcher.screenshots().list(ctx.pathParam("name"))) {
            array.put(screenshot.toJson());
        }
        return new JSONObject().put("screenshots", array);
    }

    private JSONObject deleteScreenshot(Context ctx) throws Exception {
        launcher.screenshots().delete(ctx.pathParam("name"), ctx.pathParam("file"));
        return new JSONObject();
    }

    private JSONObject openScreenshotFolder(Context ctx) throws Exception {
        Path directory = launcher.screenshots().directory(ctx.pathParam("name"));
        InstanceRoutes.openInFileManager(directory);
        return new JSONObject().put("path", directory.toString());
    }

    private void screenshotImage(Context ctx) throws Exception {
        String fileName = ctx.pathParam("file");
        Path file = launcher.screenshots().resolve(ctx.pathParam("name"), fileName);
        ctx.contentType(ScreenshotService.contentType(fileName))
                .header("Cache-Control", IMMUTABLE_CACHE)
                .result(Files.readAllBytes(file));
    }

    /**
     * Refuses changes while the profile is mid-install. A world copied into a directory a modpack
     * install is still populating can be half-overwritten by it.
     */
    private void requireIdle(Context ctx) {
        launcher.busyRegistry().requireIdle(ctx.pathParam("name"));
    }
}
