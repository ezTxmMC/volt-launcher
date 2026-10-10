package app.voltlauncher.server.routes;

import app.voltlauncher.game.MinecraftLauncherService;
import app.voltlauncher.game.backup.InstanceBackupService;
import app.voltlauncher.server.route.RequestBody;
import app.voltlauncher.server.route.RouteModule;
import app.voltlauncher.server.route.RouteRegistry;
import io.javalin.http.Context;
import org.json.JSONArray;
import org.json.JSONObject;

import java.nio.file.Path;

/** Profile snapshots: taking one, listing them, putting one back and throwing one away. */
public final class BackupRoutes implements RouteModule {

    private final MinecraftLauncherService launcher;

    public BackupRoutes(MinecraftLauncherService launcher) {
        this.launcher = launcher;
    }

    @Override
    public void register(RouteRegistry routes) {
        routes.get("/api/instances/{name}/backups", this::listBackups);
        routes.post("/api/instances/{name}/backups", this::createBackup);
        routes.post("/api/instances/{name}/backups/open-folder", this::openFolder);
        routes.post("/api/instances/{name}/backups/{backupId}/restore", this::restoreBackup);
        routes.delete("/api/instances/{name}/backups/{backupId}", this::deleteBackup);
    }

    private JSONObject listBackups(Context ctx) throws Exception {
        JSONArray array = new JSONArray();
        for (InstanceBackupService.Backup backup : launcher.backups().list(ctx.pathParam("name"))) {
            array.put(backup.toJson());
        }
        return new JSONObject().put("backups", array);
    }

    /** Zipping a profile takes minutes for a large pack, so it answers with a task id. */
    private JSONObject createBackup(Context ctx) throws Exception {
        JSONObject body = RequestBody.json(ctx);
        String taskId = launcher.backups().createAsync(ctx.pathParam("name"), body.optString("label", ""));
        return new JSONObject().put("taskId", taskId);
    }

    private JSONObject restoreBackup(Context ctx) throws Exception {
        String taskId = launcher.backups().restoreAsync(ctx.pathParam("name"), ctx.pathParam("backupId"));
        return new JSONObject().put("taskId", taskId);
    }

    private JSONObject deleteBackup(Context ctx) throws Exception {
        launcher.backups().delete(ctx.pathParam("name"), ctx.pathParam("backupId"));
        return new JSONObject();
    }

    private JSONObject openFolder(Context ctx) throws Exception {
        Path directory = launcher.backups().directory(ctx.pathParam("name"));
        InstanceRoutes.openInFileManager(directory);
        return new JSONObject().put("path", directory.toString());
    }
}
