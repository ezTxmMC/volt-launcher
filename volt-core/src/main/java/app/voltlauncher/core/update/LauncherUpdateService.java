package app.voltlauncher.core.update;

import app.voltlauncher.core.AppPaths;
import app.voltlauncher.core.config.LauncherSettings;
import app.voltlauncher.core.config.SettingsStore;
import app.voltlauncher.core.task.TaskRegistry;
import app.voltlauncher.core.util.HttpFetcher;
import org.json.JSONArray;
import org.json.JSONObject;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * Checks GitHub releases for a newer launcher and stages the download.
 *
 * <p>Deliberately stops short of replacing the running installation: swapping a launcher's own
 * files while it is executing them is platform-specific and easy to get wrong, and a half-applied
 * update leaves the user with nothing that starts. The downloaded installer is handed to the
 * desktop instead, which is the same thing the user would do by hand — just without the hunt for
 * the right file.
 */
public final class LauncherUpdateService {

    private static final String API_BASE = "https://api.github.com/repos/";
    private static final Map<String, String> HEADERS = Map.of(
            "Accept", "application/vnd.github+json",
            "User-Agent", "VoltLauncher");
    /** A check is cheap but rate-limited; results are reused for this long. */
    private static final long CACHE_MS = 10 * 60 * 1000L;

    private final HttpFetcher http;
    private final SettingsStore settings;
    private final TaskRegistry tasks;
    private final String currentVersion;

    private volatile UpdateInfo cached;
    private volatile long cachedAt;

    public LauncherUpdateService(HttpFetcher http, SettingsStore settings, TaskRegistry tasks,
                                 String currentVersion) {
        this.http = http;
        this.settings = settings;
        this.tasks = tasks;
        this.currentVersion = currentVersion;
    }

    /**
     * @param downloadUrl the release asset that fits this platform, blank when the release ships
     *                    nothing installable here
     */
    public record UpdateInfo(
            boolean available,
            String currentVersion,
            String latestVersion,
            String name,
            String notes,
            String publishedAt,
            String releaseUrl,
            String assetName,
            String downloadUrl,
            long assetSize,
            boolean prerelease,
            String checkedReason) {

        public static UpdateInfo upToDate(String current, String reason) {
            return new UpdateInfo(false, current, current, "", "", "", "", "", "", 0L, false, reason);
        }

        public JSONObject toJson() {
            return new JSONObject()
                    .put("available", available)
                    .put("currentVersion", currentVersion)
                    .put("latestVersion", latestVersion)
                    .put("name", name == null ? "" : name)
                    .put("notes", notes == null ? "" : notes)
                    .put("publishedAt", publishedAt == null ? "" : publishedAt)
                    .put("releaseUrl", releaseUrl == null ? "" : releaseUrl)
                    .put("assetName", assetName == null ? "" : assetName)
                    .put("downloadable", downloadUrl != null && !downloadUrl.isBlank())
                    .put("assetSize", assetSize)
                    .put("prerelease", prerelease)
                    .put("reason", checkedReason == null ? "" : checkedReason);
        }
    }

    /** The last result, or {@code null} when nothing has been checked yet. */
    public UpdateInfo lastResult() {
        return cached;
    }

    public UpdateInfo check(boolean force) {
        UpdateInfo previous = cached;
        if (!force && previous != null && System.currentTimeMillis() - cachedAt < CACHE_MS) {
            return previous;
        }

        LauncherSettings current = settings.get();
        UpdateInfo result;
        try {
            result = fetch(current.updateRepository(), current.betaUpdates());
        } catch (Exception e) {
            // An unreachable or rate-limited GitHub is not a launcher fault; the screen has to say
            // so rather than claiming the launcher is up to date.
            result = UpdateInfo.upToDate(currentVersion,
                    "Could not reach the release feed: "
                            + (e.getMessage() == null ? e.getClass().getSimpleName() : e.getMessage()));
        }
        cached = result;
        cachedAt = System.currentTimeMillis();
        return result;
    }

    /**
     * Downloads the release asset into the launcher's update directory under a task the UI can
     * follow, then returns where it landed.
     */
    public Path download(UpdateInfo info) throws Exception {
        if (info == null || info.downloadUrl() == null || info.downloadUrl().isBlank()) {
            throw new IllegalStateException("This release has no download for your platform.");
        }
        Path target = AppPaths.updatesDirectory().resolve(safeFileName(info.assetName()));
        Files.createDirectories(target.getParent());

        String taskId = tasks.begin("update", "Downloading VoltLauncher " + info.latestVersion(), "");
        try {
            tasks.progress(taskId, "downloading", 0, 1);
            http.download(info.downloadUrl(), target, "");
            tasks.succeed(taskId, target.toString());
            return target;
        } catch (Exception e) {
            tasks.fail(taskId, e.getMessage() == null ? "Download failed" : e.getMessage());
            throw e;
        }
    }

    // ── internals ─────────────────────────────────────────────────────────────

    private UpdateInfo fetch(String repository, boolean includePrereleases) throws Exception {
        String repo = normalizeRepository(repository);
        JSONArray releases = http.getJsonArray(API_BASE + repo + "/releases?per_page=20");

        JSONObject best = null;
        for (int i = 0; i < releases.length(); i++) {
            JSONObject release = releases.optJSONObject(i);
            if (release == null || release.optBoolean("draft", false)) continue;
            if (release.optBoolean("prerelease", false) && !includePrereleases) continue;
            if (best == null || isNewer(versionOf(release), versionOf(best))) best = release;
        }

        if (best == null) {
            return UpdateInfo.upToDate(currentVersion,
                    includePrereleases ? "No releases published yet." : "No stable release published yet.");
        }

        String latest = versionOf(best);
        JSONObject asset = pickAsset(best.optJSONArray("assets"));
        return new UpdateInfo(
                isNewer(latest, currentVersion),
                currentVersion,
                latest,
                best.optString("name", latest),
                best.optString("body", ""),
                best.optString("published_at", ""),
                best.optString("html_url", ""),
                asset == null ? "" : asset.optString("name", ""),
                asset == null ? "" : asset.optString("browser_download_url", ""),
                asset == null ? 0L : asset.optLong("size", 0L),
                best.optBoolean("prerelease", false),
                asset == null ? "This release ships no installer for your platform." : "");
    }

    /**
     * Accepts a full GitHub URL as well as {@code owner/repo}, since users paste both — including
     * the scheme-less {@code github.com/owner/repo} form a browser address bar shows.
     */
    static String normalizeRepository(String value) {
        String repo = value == null ? "" : value.trim();
        repo = repo.replaceFirst("^https?://", "");
        repo = repo.replaceFirst("^(www\\.)?github\\.com/", "");
        repo = repo.replaceFirst("\\.git$", "");
        repo = repo.replaceFirst("^/+", "").replaceFirst("/+$", "");
        if (!repo.matches("[A-Za-z0-9._-]+/[A-Za-z0-9._-]+")) {
            throw new IllegalArgumentException("Not a valid GitHub repository: " + value);
        }
        return repo;
    }

    private String versionOf(JSONObject release) {
        String tag = release.optString("tag_name", "");
        return tag.isBlank() ? release.optString("name", "") : tag;
    }

    /**
     * Picks the asset for the current platform. Extensions are ranked rather than matched exactly,
     * because a release usually carries several installers and only one of them is runnable here.
     */
    private JSONObject pickAsset(JSONArray assets) {
        if (assets == null || assets.isEmpty()) return null;
        List<String> preferred = platformExtensions();

        JSONObject best = null;
        int bestRank = Integer.MAX_VALUE;
        for (int i = 0; i < assets.length(); i++) {
            JSONObject asset = assets.optJSONObject(i);
            if (asset == null) continue;
            String name = asset.optString("name", "").toLowerCase(Locale.ROOT);
            for (int rank = 0; rank < preferred.size(); rank++) {
                if (name.endsWith(preferred.get(rank)) && rank < bestRank) {
                    best = asset;
                    bestRank = rank;
                }
            }
        }
        return best;
    }

    private List<String> platformExtensions() {
        String os = System.getProperty("os.name", "").toLowerCase(Locale.ROOT);
        if (os.contains("win")) return List.of(".exe", ".msi", ".zip", ".jar");
        if (os.contains("mac") || os.contains("darwin")) return List.of(".dmg", ".pkg", ".zip", ".jar");
        return List.of(".appimage", ".deb", ".rpm", ".tar.gz", ".jar");
    }

    private String safeFileName(String name) {
        String cleaned = name == null ? "" : name.replaceAll("[^A-Za-z0-9._-]", "_");
        return cleaned.isBlank() ? "voltlauncher-update" : cleaned;
    }

    /**
     * Compares two version strings numerically segment by segment, so {@code 0.10.0} beats
     * {@code 0.9.0} — which a plain string comparison gets wrong. A pre-release suffix
     * ({@code 1.0.0-beta.1}) sorts below the release it leads up to.
     */
    static boolean isNewer(String candidate, String current) {
        int[] left = parseVersion(candidate);
        int[] right = parseVersion(current);
        for (int i = 0; i < Math.max(left.length, right.length); i++) {
            int a = i < left.length ? left[i] : 0;
            int b = i < right.length ? right[i] : 0;
            if (a != b) return a > b;
        }
        // Equal numerically: a build without a pre-release suffix outranks one with it.
        boolean candidatePre = hasPreReleaseSuffix(candidate);
        boolean currentPre = hasPreReleaseSuffix(current);
        return currentPre && !candidatePre;
    }

    private static int[] parseVersion(String value) {
        String cleaned = value == null ? "" : value.trim().toLowerCase(Locale.ROOT);
        if (cleaned.startsWith("v")) cleaned = cleaned.substring(1);
        int suffix = cleaned.indexOf('-');
        if (suffix >= 0) cleaned = cleaned.substring(0, suffix);

        String[] parts = cleaned.split("\\.");
        int[] numbers = new int[parts.length];
        for (int i = 0; i < parts.length; i++) {
            StringBuilder digits = new StringBuilder();
            for (char c : parts[i].toCharArray()) {
                if (Character.isDigit(c)) digits.append(c);
                else break;
            }
            try {
                numbers[i] = digits.isEmpty() ? 0 : Integer.parseInt(digits.toString());
            } catch (NumberFormatException e) {
                numbers[i] = 0;
            }
        }
        return numbers;
    }

    private static boolean hasPreReleaseSuffix(String value) {
        String cleaned = value == null ? "" : value.trim();
        return cleaned.indexOf('-') > 0;
    }
}
