package app.voltlauncher.server.route;

import io.javalin.config.JavalinConfig;
import io.javalin.http.Context;
import io.javalin.http.Handler;
import io.javalin.http.HandlerType;
import org.json.JSONObject;

import java.util.NoSuchElementException;

/**
 * Registers endpoints on Javalin and gives every one of them the same response envelope
 * ({@code success} plus either the payload or an {@code error} message) and the same mapping from
 * exception type to HTTP status. Handlers therefore only describe the happy path.
 */
public final class RouteRegistry {

    private static final String JSON = "application/json";

    private final JavalinConfig config;
    private final boolean logRoutes;

    public RouteRegistry(JavalinConfig config, boolean logRoutes) {
        this.config = config;
        this.logRoutes = logRoutes;
    }

    public RouteRegistry get(String path, JsonHandler handler) {
        return add(HandlerType.GET, path, handler);
    }

    public RouteRegistry post(String path, JsonHandler handler) {
        return add(HandlerType.POST, path, handler);
    }

    public RouteRegistry patch(String path, JsonHandler handler) {
        return add(HandlerType.PATCH, path, handler);
    }

    public RouteRegistry put(String path, JsonHandler handler) {
        return add(HandlerType.PUT, path, handler);
    }

    public RouteRegistry delete(String path, JsonHandler handler) {
        return add(HandlerType.DELETE, path, handler);
    }

    public RouteRegistry module(RouteModule module) {
        module.register(this);
        return this;
    }

    /**
     * Registers a handler that writes its own response, for endpoints that do not return the JSON
     * envelope — currently only binary payloads such as skin images. The handler owns its status
     * codes and error handling.
     */
    public RouteRegistry raw(String method, String path, Handler handler) {
        config.routes.addHttpHandler(HandlerType.findOrCreate(method), path, ctx -> {
            try {
                handler.handle(ctx);
            } catch (Exception e) {
                // Raw handlers own their success response, but not their failures: without this a
                // rejected file name surfaced as an opaque 500 instead of the 400 it is.
                respond(ctx, statusFor(e), error(e));
            }
        });
        if (logRoutes) {
            System.out.println("[API] " + method + " " + path + " (raw)");
        }
        return this;
    }

    private RouteRegistry add(HandlerType method, String path, JsonHandler handler) {
        config.routes.addHttpHandler(method, path, ctx -> dispatch(ctx, handler));
        if (logRoutes) {
            System.out.println("[API] " + method + " " + path);
        }
        return this;
    }

    private void dispatch(Context ctx, JsonHandler handler) {
        try {
            JSONObject payload = handler.handle(ctx);
            JSONObject body = payload == null ? new JSONObject() : payload;
            respond(ctx, 200, body.put("success", true));
        } catch (Throwable t) {
            int status = statusFor(t);
            if (status >= 500) {
                // Logged only for genuine faults: a refused file name is not worth a stack trace.
                System.err.println("[API] " + ctx.method() + " " + ctx.path() + " failed: " + t);
                t.printStackTrace(System.err);
            }
            respond(ctx, status, error(t));
        }
    }

    /**
     * Maps an exception onto a status.
     *
     * <p>{@code Throwable} rather than {@code Exception}: in the packaged native image a missing
     * JDK feature surfaces as a linkage {@link Error}, and letting it escape gave the UI an empty
     * 500 with no message at all.
     */
    private static int statusFor(Throwable t) {
        if (t instanceof IllegalArgumentException) return 400;
        if (t instanceof NoSuchElementException) return 404;
        // A well-formed request the launcher cannot satisfy right now, e.g. deleting a running
        // instance, or a provider whose bridge is offline.
        if (t instanceof IllegalStateException) return 409;
        return 500;
    }

    private static JSONObject error(Throwable t) {
        String message = t.getMessage();
        return new JSONObject()
                .put("success", false)
                .put("error", message == null || message.isBlank() ? t.getClass().getSimpleName() : message);
    }

    private static void respond(Context ctx, int status, JSONObject body) {
        ctx.status(status).contentType(JSON).result(body.toString());
    }
}
