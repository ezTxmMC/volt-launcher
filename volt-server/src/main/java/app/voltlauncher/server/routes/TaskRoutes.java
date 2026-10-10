package app.voltlauncher.server.routes;

import app.voltlauncher.core.task.TaskRegistry;
import app.voltlauncher.server.route.RouteModule;
import app.voltlauncher.server.route.RouteRegistry;
import io.javalin.http.Context;
import org.json.JSONArray;
import org.json.JSONObject;

import java.util.NoSuchElementException;

/**
 * The launcher's own activity: every install, download, backup and repair currently running, plus
 * the ones that finished recently enough to still be worth reporting.
 */
public final class TaskRoutes implements RouteModule {

    private final TaskRegistry tasks;

    public TaskRoutes(TaskRegistry tasks) {
        this.tasks = tasks;
    }

    @Override
    public void register(RouteRegistry routes) {
        routes.get("/api/tasks", this::listTasks);
        routes.get("/api/tasks/{taskId}", this::readTask);
        routes.post("/api/tasks/{taskId}/cancel", this::cancelTask);
        routes.delete("/api/tasks/{taskId}", this::clearTask);
        routes.delete("/api/tasks", this::clearFinished);
    }

    private JSONObject listTasks(Context ctx) {
        JSONArray array = new JSONArray();
        int running = 0;
        for (TaskRegistry.Task task : tasks.list()) {
            array.put(task.toJson());
            if (!task.isFinished()) running++;
        }
        return new JSONObject().put("tasks", array).put("running", running);
    }

    private JSONObject readTask(Context ctx) {
        TaskRegistry.Task task = tasks.get(ctx.pathParam("taskId"));
        if (task == null) throw new NoSuchElementException("Unknown task");
        return new JSONObject().put("task", task.toJson());
    }

    private JSONObject cancelTask(Context ctx) {
        boolean requested = tasks.requestCancel(ctx.pathParam("taskId"));
        return new JSONObject().put("cancelRequested", requested);
    }

    private JSONObject clearTask(Context ctx) {
        tasks.clear(ctx.pathParam("taskId"));
        return new JSONObject();
    }

    private JSONObject clearFinished(Context ctx) {
        tasks.clearFinished();
        return new JSONObject();
    }
}
