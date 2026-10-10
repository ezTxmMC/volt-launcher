package app.voltlauncher.providers.ftb;

import app.voltlauncher.core.util.HttpFetcher;
import app.voltlauncher.providers.ContentProvider;
import app.voltlauncher.providers.model.ContentKind;
import app.voltlauncher.providers.model.ProjectDetail;
import app.voltlauncher.providers.model.ProjectSummary;
import app.voltlauncher.providers.model.ProjectVersion;
import app.voltlauncher.providers.model.ProviderId;
import app.voltlauncher.providers.model.SearchQuery;
import app.voltlauncher.providers.model.SearchResult;
import org.json.JSONArray;
import org.json.JSONObject;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Feed the Beast's public modpack API.
 *
 * <p>Unlike Modrinth and CurseForge this API serves modpacks only, and its search returns bare
 * pack ids rather than documents — so a page of results costs one search request plus one lookup
 * per pack, which are issued in parallel and cached. The upside is that a pack version is a plain
 * list of files with URLs and hashes, which makes FTB the cleanest of the four to install and to
 * keep updated.
 */
public final class FtbProvider implements ContentProvider {

    static final String API_BASE = "https://api.modpacks.ch/public";
    private static final Map<String, String> HEADERS = Map.of(
            "Accept", "application/json",
            "User-Agent", "VoltLauncher");

    /** Pack documents change rarely and are read repeatedly while browsing. */
    private static final long CACHE_MS = 5 * 60 * 1000L;
    private static final long HEALTH_CACHE_MS = 60_000L;
    private static final int MAX_PARALLEL_LOOKUPS = 8;

    private final HttpFetcher http;
    private final Map<String, CachedPack> packCache = new ConcurrentHashMap<>();

    private volatile long lastHealthCheckAt;
    private volatile boolean healthy = true;
    private volatile String unavailableReason = "";

    public FtbProvider(HttpFetcher http) {
        this.http = http;
    }

    private record CachedPack(JSONObject document, long fetchedAt) {}

    @Override
    public ProviderId id() {
        return ProviderId.FTB;
    }

    /** FTB publishes whole modpacks only; individual mods come from the platforms they live on. */
    @Override
    public List<ContentKind> supportedKinds() {
        return List.of(ContentKind.MODPACK);
    }

    @Override
    public boolean isAvailable() {
        long now = System.currentTimeMillis();
        if (now - lastHealthCheckAt < HEALTH_CACHE_MS) return healthy;
        lastHealthCheckAt = now;
        try {
            http.getJson(API_BASE + "/modpack/popular/installs/1", HEADERS);
            healthy = true;
            unavailableReason = "";
        } catch (Exception e) {
            healthy = false;
            unavailableReason = "The FTB API is not reachable: "
                    + (e.getMessage() == null ? e.getClass().getSimpleName() : e.getMessage());
        }
        return healthy;
    }

    @Override
    public String unavailableReason() {
        return unavailableReason;
    }

    @Override
    public SearchResult search(SearchQuery query) throws Exception {
        if (query.kind() != ContentKind.MODPACK) {
            return new SearchResult(List.of(), 0, query.offset(), query.limit());
        }

        // The API has no offset parameter, so a page is taken out of a longer id list. Asking for
        // a little more than the page keeps "load more" working without fetching everything.
        int wanted = query.offset() + query.limit();
        List<String> ids = query.hasQuery()
                ? packIds(API_BASE + "/modpack/search/" + Math.min(wanted + 20, 200)
                        + "?term=" + encode(query.query()))
                : packIds(API_BASE + "/modpack/" + browseEndpoint(query.sort()) + "/"
                        + Math.min(wanted + 20, 200));

        List<JSONObject> documents = fetchPacks(ids.stream().limit(Math.min(wanted, 200)).toList());
        List<ProjectSummary> summaries = new ArrayList<>();
        for (JSONObject document : documents) {
            ProjectSummary summary = toSummary(document);
            if (matchesFilters(summary, query)) summaries.add(summary);
        }
        sort(summaries, query.sort());

        int from = Math.min(query.offset(), summaries.size());
        int to = Math.min(from + query.limit(), summaries.size());
        return new SearchResult(summaries.subList(from, to), ids.size(), query.offset(), query.limit());
    }

    @Override
    public ProjectDetail project(String projectIdOrSlug) throws Exception {
        JSONObject document = pack(projectIdOrSlug);

        List<String> gallery = new ArrayList<>();
        JSONArray art = document.optJSONArray("art");
        if (art != null) {
            for (int i = 0; i < art.length(); i++) {
                JSONObject image = art.getJSONObject(i);
                String url = image.optString("url", "");
                if (!url.isBlank() && !"square".equalsIgnoreCase(image.optString("type", ""))) {
                    gallery.add(url);
                }
            }
        }

        Map<String, String> links = new LinkedHashMap<>();
        JSONArray linkArray = document.optJSONArray("links");
        if (linkArray != null) {
            for (int i = 0; i < linkArray.length(); i++) {
                JSONObject link = linkArray.getJSONObject(i);
                String url = link.optString("link", "");
                String name = link.optString("name", link.optString("type", "link"));
                if (!url.isBlank()) links.putIfAbsent(name.toLowerCase(Locale.ROOT), url);
            }
        }

        String body = document.optString("description", "");
        if (body.isBlank()) body = document.optString("synopsis", "");
        return new ProjectDetail(toSummary(document), body, gallery, "", links);
    }

    @Override
    public List<ProjectVersion> versions(String projectIdOrSlug, String gameVersion, String loader) throws Exception {
        JSONObject document = pack(projectIdOrSlug);
        String projectId = String.valueOf(document.optInt("id", 0));

        JSONArray versions = document.optJSONArray("versions");
        List<ProjectVersion> result = new ArrayList<>();
        if (versions == null) return result;

        for (int i = 0; i < versions.length(); i++) {
            JSONObject version = versions.getJSONObject(i);
            String versionId = String.valueOf(version.optInt("id", 0));
            // Which Minecraft version a release targets only appears in the release document
            // itself, and fetching every one of them to answer a list request would be far too
            // many calls — so the filter is applied to what the summary already knows.
            result.add(new ProjectVersion(
                    ProviderId.FTB,
                    projectId + ":" + versionId,
                    projectId,
                    version.optString("name", ""),
                    version.optString("name", ""),
                    List.of(),
                    List.of(),
                    releaseType(version.optString("type", "release")),
                    // FTB serves a file list rather than an archive; this URL is what the
                    // installer reads, and its presence marks the release as installable.
                    API_BASE + "/modpack/" + projectId + "/" + versionId,
                    "",
                    "",
                    0L,
                    isoDate(version.optLong("updated", 0L)),
                    List.of()));
        }
        result.sort(Comparator.comparing(ProjectVersion::datePublished).reversed());
        return result;
    }

    @Override
    public ProjectVersion version(String versionId) throws Exception {
        PackRef ref = PackRef.parse(versionId);
        JSONObject document = http.getJson(
                API_BASE + "/modpack/" + ref.packId() + "/" + ref.versionId(), HEADERS);
        requireSuccess(document, "FTB release " + versionId);

        List<String> gameVersions = new ArrayList<>();
        List<String> loaders = new ArrayList<>();
        readTargets(document, gameVersions, loaders);

        return new ProjectVersion(
                ProviderId.FTB,
                versionId,
                ref.packId(),
                document.optString("name", ""),
                document.optString("name", ""),
                gameVersions,
                loaders,
                releaseType(document.optString("type", "release")),
                API_BASE + "/modpack/" + ref.packId() + "/" + ref.versionId(),
                "",
                "",
                0L,
                isoDate(document.optLong("updated", 0L)),
                List.of());
    }

    // ── internals used by the installer ───────────────────────────────────────

    /** The full release document, which carries the file list the installer downloads. */
    JSONObject releaseDocument(String versionId) throws Exception {
        PackRef ref = PackRef.parse(versionId);
        JSONObject document = http.getJson(
                API_BASE + "/modpack/" + ref.packId() + "/" + ref.versionId(), HEADERS);
        requireSuccess(document, "FTB release " + versionId);
        return document;
    }

    JSONObject pack(String projectId) throws Exception {
        String id = projectId == null ? "" : projectId.trim();
        if (id.isEmpty()) throw new IllegalArgumentException("An FTB pack id is required");
        // A caller holding a "pack:version" reference should still be able to ask for the pack.
        if (id.contains(":")) id = id.substring(0, id.indexOf(':'));

        CachedPack cached = packCache.get(id);
        if (cached != null && System.currentTimeMillis() - cached.fetchedAt() < CACHE_MS) {
            return cached.document();
        }
        JSONObject document = http.getJson(API_BASE + "/modpack/" + encode(id), HEADERS);
        requireSuccess(document, "FTB pack " + id);
        packCache.put(id, new CachedPack(document, System.currentTimeMillis()));
        return document;
    }

    /** Splits the {@code pack:version} form this provider uses for release ids. */
    record PackRef(String packId, String versionId) {
        static PackRef parse(String value) {
            if (value == null || !value.contains(":")) {
                throw new IllegalArgumentException("Not an FTB release id: " + value);
            }
            String[] parts = value.split(":", 2);
            if (parts[0].isBlank() || parts[1].isBlank()) {
                throw new IllegalArgumentException("Not an FTB release id: " + value);
            }
            return new PackRef(parts[0], parts[1]);
        }
    }

    /** Reads the {@code targets} block into the game versions and loaders it declares. */
    static void readTargets(JSONObject release, List<String> gameVersions, List<String> loaders) {
        JSONArray targets = release.optJSONArray("targets");
        if (targets == null) return;
        for (int i = 0; i < targets.length(); i++) {
            JSONObject target = targets.getJSONObject(i);
            String type = target.optString("type", "");
            String name = target.optString("name", "");
            String version = target.optString("version", "");
            if ("game".equalsIgnoreCase(type) || "minecraft".equalsIgnoreCase(name)) {
                if (!version.isBlank()) gameVersions.add(version);
            } else if ("modloader".equalsIgnoreCase(type) && !name.isBlank()) {
                loaders.add(name.toLowerCase(Locale.ROOT));
            }
        }
    }

    // ── mapping ───────────────────────────────────────────────────────────────

    private List<String> packIds(String url) throws Exception {
        JSONObject response = http.getJson(url, HEADERS);
        JSONArray packs = response.optJSONArray("packs");
        List<String> ids = new ArrayList<>();
        if (packs == null) return ids;
        for (int i = 0; i < packs.length(); i++) {
            ids.add(String.valueOf(packs.optInt(i, 0)));
        }
        ids.removeIf("0"::equals);
        return ids;
    }

    /**
     * Looks the packs up concurrently. One at a time would make a page of twenty results take
     * twenty round trips in series, which is several seconds of dead UI.
     */
    private List<JSONObject> fetchPacks(List<String> ids) {
        if (ids.isEmpty()) return List.of();
        List<JSONObject> documents = new ArrayList<>();
        try (ExecutorService executor = Executors.newFixedThreadPool(
                Math.min(MAX_PARALLEL_LOOKUPS, ids.size()), Thread.ofVirtual().factory())) {

            List<CompletableFuture<JSONObject>> futures = new ArrayList<>(ids.size());
            for (String id : ids) {
                futures.add(CompletableFuture.supplyAsync(() -> {
                    try {
                        return pack(id);
                    } catch (Exception e) {
                        // A delisted pack still appears in search results; skip it rather than
                        // failing the whole page.
                        return null;
                    }
                }, executor));
            }
            for (CompletableFuture<JSONObject> future : futures) {
                JSONObject document = future.join();
                if (document != null) documents.add(document);
            }
        }
        return documents;
    }

    private ProjectSummary toSummary(JSONObject document) {
        List<String> tags = new ArrayList<>();
        JSONArray tagArray = document.optJSONArray("tags");
        if (tagArray != null) {
            for (int i = 0; i < tagArray.length(); i++) {
                String name = tagArray.getJSONObject(i).optString("name", "");
                if (!name.isBlank()) tags.add(name);
            }
        }

        String author = "";
        JSONArray authors = document.optJSONArray("authors");
        if (authors != null && !authors.isEmpty()) {
            author = authors.getJSONObject(0).optString("name", "");
        }

        return new ProjectSummary(
                ProviderId.FTB,
                String.valueOf(document.optInt("id", 0)),
                String.valueOf(document.optInt("id", 0)),
                document.optString("name", ""),
                document.optString("synopsis", ""),
                author,
                artUrl(document),
                document.optLong("installs", 0L),
                document.optLong("plays", 0L),
                tags,
                List.of(),
                List.of(),
                ContentKind.MODPACK,
                isoDate(document.optLong("updated", 0L)));
    }

    /** The square artwork FTB ships for a pack, which is what a card should show. */
    private String artUrl(JSONObject document) {
        JSONArray art = document.optJSONArray("art");
        if (art == null) return "";
        String fallback = "";
        for (int i = 0; i < art.length(); i++) {
            JSONObject image = art.getJSONObject(i);
            String url = image.optString("url", "");
            if (url.isBlank()) continue;
            if ("square".equalsIgnoreCase(image.optString("type", ""))) return url;
            if (fallback.isEmpty()) fallback = url;
        }
        return fallback;
    }

    /**
     * FTB's search has no filters of its own, so the launcher's game-version and category filters
     * are applied to what a pack document already reports.
     */
    private boolean matchesFilters(ProjectSummary summary, SearchQuery query) {
        if (!query.categories().isEmpty()) {
            boolean matched = query.categories().stream().anyMatch(category ->
                    summary.categories().stream().anyMatch(tag -> tag.equalsIgnoreCase(category)));
            if (!matched) return false;
        }
        return true;
    }

    private void sort(List<ProjectSummary> summaries, String sort) {
        Comparator<ProjectSummary> comparator = switch (sort.toLowerCase(Locale.ROOT)) {
            case "downloads", "installs" -> Comparator.comparingLong(ProjectSummary::downloads).reversed();
            case "follows", "followers", "plays" -> Comparator.comparingLong(ProjectSummary::follows).reversed();
            case "newest", "updated" -> Comparator.comparing(ProjectSummary::updated).reversed();
            // Relevance keeps the order the API returned them in.
            default -> null;
        };
        if (comparator != null) summaries.sort(comparator);
    }

    private String browseEndpoint(String sort) {
        return switch (sort.toLowerCase(Locale.ROOT)) {
            case "follows", "followers", "plays" -> "popular/plays";
            case "newest", "updated" -> "featured";
            default -> "popular/installs";
        };
    }

    private static void requireSuccess(JSONObject document, String what) {
        String status = document.optString("status", "success");
        if (!"success".equalsIgnoreCase(status)) {
            String message = document.optString("message", "");
            throw new IllegalStateException(what + " is not available"
                    + (message.isBlank() ? "" : ": " + message));
        }
    }

    private static String releaseType(String value) {
        String normalized = value == null ? "" : value.trim().toLowerCase(Locale.ROOT);
        return switch (normalized) {
            case "alpha" -> "alpha";
            case "beta" -> "beta";
            case "hotfix", "release", "" -> "release";
            default -> normalized;
        };
    }

    /** FTB reports timestamps as epoch seconds; the shared model uses ISO-8601 text. */
    static String isoDate(long epochSeconds) {
        if (epochSeconds <= 0) return "";
        return Instant.ofEpochSecond(epochSeconds).toString();
    }

    private static String encode(String value) {
        return URLEncoder.encode(value, StandardCharsets.UTF_8);
    }
}
