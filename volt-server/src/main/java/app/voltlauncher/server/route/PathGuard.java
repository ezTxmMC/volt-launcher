package app.voltlauncher.server.route;

import io.javalin.config.JavalinConfig;
import io.javalin.http.Context;
import io.javalin.http.HandlerType;
import org.eclipse.jetty.http.UriCompliance;
import org.json.JSONObject;

import java.util.EnumSet;
import java.util.Locale;

/**
 * Stops a URL from smuggling structure through a path parameter.
 *
 * <p>The problem this exists for: the servlet container decodes and normalises a URI <em>before</em>
 * routing, exactly as RFC 3986 requires. So {@code DELETE /api/instances/Foo/worlds/%2e%2e} arrives
 * at the application as {@code DELETE /api/instances/Foo/} — the {@code worlds} segment and the
 * parameter are simply gone — and with lenient trailing-slash matching that lands on the endpoint
 * which <em>deletes the entire profile</em>. No handler can defend against this, because by the
 * time one runs there is nothing left to notice.
 *
 * <p>Three measures, because no single one covers every shape:
 * <ol>
 *   <li>Trailing slashes are significant, so a path that collapsed can never alias a shorter
 *       route. This is the one that closes the case above.</li>
 *   <li>Jetty refuses encoded path separators outright, so {@code %2F} cannot fabricate a
 *       segment boundary.</li>
 *   <li>A pre-dispatch check on whatever the application can still see, for anything the
 *       container lets through now or after a future upgrade relaxes its defaults.</li>
 * </ol>
 *
 * <p>Percent-encoding itself stays allowed: a profile may legitimately be called {@code 50% Off}
 * and would arrive as {@code 50%25%20Off}.
 */
public final class PathGuard {

    /**
     * Encoded characters that would survive decoding as structure rather than as data. Encoded
     * dots are absent on purpose: the container resolves those before anything here can look,
     * which is what measure (1) is for.
     */
    private static final String[] FORBIDDEN_ENCODINGS = {"%2f", "%5c", "%00"};

    private static final UriCompliance COMPLIANCE = UriCompliance.from(
            EnumSet.of(UriCompliance.Violation.AMBIGUOUS_PATH_ENCODING));

    private PathGuard() {}

    public static void install(JavalinConfig config) {
        // Javalin defaults to matching "/a/b" and "/a/b/" as the same route, which is what lets a
        // collapsed path reach a shorter endpoint. Nothing this API serves relies on it.
        config.router.ignoreTrailingSlashes = false;
        config.jetty.modifyHttpConfiguration(http -> http.setUriCompliance(COMPLIANCE));
        config.routes.addHttpHandler(HandlerType.BEFORE, "/*", PathGuard::check);
    }

    static void check(Context ctx) {
        String raw = rawPath(ctx);
        if (!isSuspicious(raw)) return;

        ctx.skipRemainingHandlers();
        ctx.status(400).contentType("application/json").result(new JSONObject()
                .put("success", false)
                .put("error", "The request path contains encoded path separators, which are not allowed.")
                .toString());
        System.err.println("[API] Refused a request with an ambiguous path: " + raw);
    }

    /** Whether a request path tries to express structure through encoding or dot segments. */
    static boolean isSuspicious(String rawPath) {
        if (rawPath == null || rawPath.isEmpty()) return false;
        String lower = rawPath.toLowerCase(Locale.ROOT);

        for (String encoding : FORBIDDEN_ENCODINGS) {
            if (lower.contains(encoding)) return true;
        }
        for (String segment : lower.split("/")) {
            if (segment.equals("..") || segment.equals(".")) return true;
        }
        return false;
    }

    /** The URI as the application sees it, which the container may already have normalised. */
    private static String rawPath(Context ctx) {
        try {
            String uri = ctx.req().getRequestURI();
            return uri == null ? ctx.path() : uri;
        } catch (Exception e) {
            return ctx.path();
        }
    }
}
