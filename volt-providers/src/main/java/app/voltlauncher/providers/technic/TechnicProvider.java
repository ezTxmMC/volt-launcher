package app.voltlauncher.providers.technic;

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
 * The Technic Platform.
 *
 * <p>Technic is the oldest of the four and its API shows it. Results are not paginated, a pack is
 * addressed by slug rather than by id, and — the part that shapes this class most — a search hit
 * carries only a name, a slug and an icon. Everything a card needs beyond that (the Minecraft
 * version, the author, the description) lives in the pack document, so hits are enriched with one
 * lookup each, issued in parallel and cached.
 *
 * <p>Builds live in a third place again: a pack either hosts them on a <em>Solder</em> instance,
 * which lists them, or publishes exactly one client zip through its own {@code url}.
 */
public final class TechnicProvider implements ContentProvider {

    static final String API_BASE = "https://api.technicpack.net";
    /**
     * Technic requires the calling launcher's build number on every request and answers with an
     * error without it. The value only has to be a plausible current build; it does not gate
     * access to any pack.
     */
    static final String BUILD = "1177";

    private static final Map<String, String> HEADERS = Map.of(
            "Accept", "application/json",
            "User-Agent", "VoltLauncher");
    private static final long CACHE_MS = 5 * 60 * 1000L;
    private static final long HEALTH_CACHE_MS = 60_000L;
    private static final int MAX_PARALLEL_LOOKUPS = 8;

    private final HttpFetcher http;
    private final Map<String, CachedDocument> packCache = new ConcurrentHashMap<>();
    private final Map<String, CachedDocument> solderCache = new ConcurrentHashMap<>();

    private volatile long lastHealthCheckAt;
    private volatile boolean healthy = true;
    private volatile String unavailableReason = "";

    public TechnicProvider(HttpFetcher http) {
        this.http = http;
    }

    private record CachedDocument(JSONObject document, long fetchedAt) {}

    @Override
    public ProviderId id() {
        return ProviderId.TECHNIC;
    }

    /** Technic distributes whole modpacks; it has no concept of an individually installable mod. */
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
            http.getJson(API_BASE + "/trending?build=" + BUILD, HEADERS);
            healthy = true;
            unavailableReason = "";
        } catch (Exception e) {
            healthy = false;
            unavailableReason = "The Technic Platform is not reachable: "
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

        String url = query.hasQuery()
                ? API_BASE + "/search?build=" + BUILD + "&q=" + encode(query.query())
                : API_BASE + "/" + browseEndpoint(query.sort()) + "?build=" + BUILD;

        JSONObject response = http.getJson(url, HEADERS);
        JSONArray modpacks = response.optJSONArray("modpacks");
        if (modpacks == null) return new SearchResult(List.of(), 0, query.offset(), query.limit());

        // Technic answers with the whole result set at once, so the page is cut out here — and
        // only the packs on that page are looked up, rather than all forty.
        List<JSONObject> hits = new ArrayList<>(modpacks.length());
        for (int i = 0; i < modpacks.length(); i++) {
            hits.add(modpacks.getJSONObject(i));
        }
        int from = Math.min(query.offset(), hits.size());
        int to = Math.min(from + query.limit(), hits.size());

        List<ProjectSummary> page = enrich(hits.subList(from, to));
        page = filter(page, query);
        sort(page, query.sort());
        return new SearchResult(page, hits.size(), query.offset(), query.limit());
    }

    @Override
    public ProjectDetail project(String projectIdOrSlug) throws Exception {
        JSONObject document = pack(projectIdOrSlug);

        List<String> gallery = new ArrayList<>();
        addImage(gallery, document.optJSONObject("background"));
        addImage(gallery, document.optJSONObject("logo"));

        Map<String, String> links = new LinkedHashMap<>();
        putIfPresent(links, "technic", document.optString("platformUrl", ""));
        putIfPresent(links, "discord", discordInvite(document));

        return new ProjectDetail(fromDocument(document), document.optString("description", ""),
                gallery, "", links);
    }

    @Override
    public List<ProjectVersion> versions(String projectIdOrSlug, String gameVersion, String loader) throws Exception {
        JSONObject document = pack(projectIdOrSlug);
        String slug = document.optString("name", normalizeSlug(projectIdOrSlug));
        String title = document.optString("displayName", slug);
        String minecraft = document.optString("minecraft", "");

        // Technic pins a pack to one Minecraft version, so a filter that disagrees rules out
        // every build rather than some of them.
        if (gameVersion != null && !gameVersion.isBlank()
                && !minecraft.isBlank() && !gameVersion.equals(minecraft)) {
            return List.of();
        }

        String solder = document.optString("solder", "");
        if (solder.isBlank() || "null".equalsIgnoreCase(solder)) {
            return singleBuild(document, slug, title, minecraft);
        }
        return solderBuilds(solder, slug, title, minecraft);
    }

    @Override
    public ProjectVersion version(String versionId) throws Exception {
        PackRef ref = PackRef.parse(versionId);
        return versions(ref.slug(), null, null).stream()
                .filter(candidate -> candidate.versionId().equals(versionId))
                .findFirst()
                .orElseThrow(() -> new IllegalStateException("Unknown Technic build: " + versionId));
    }

    // ── used by the installer ─────────────────────────────────────────────────

    /** The pack document, which says whether the pack uses Solder and where its zip lives. */
    JSONObject pack(String slugOrUrl) throws Exception {
        String slug = normalizeSlug(slugOrUrl);
        CachedDocument cached = packCache.get(slug);
        if (cached != null && System.currentTimeMillis() - cached.fetchedAt() < CACHE_MS) {
            return cached.document();
        }
        JSONObject document = http.getJson(
                API_BASE + "/modpack/" + encode(slug) + "?build=" + BUILD, HEADERS);
        requireNoError(document, "Technic pack " + slug);
        packCache.put(slug, new CachedDocument(document, System.currentTimeMillis()));
        return document;
    }

    /** The Solder listing for a pack: its builds, plus which one the author recommends. */
    JSONObject solderPack(String solderUrl, String slug) throws Exception {
        String key = solderUrl + "|" + slug;
        CachedDocument cached = solderCache.get(key);
        if (cached != null && System.currentTimeMillis() - cached.fetchedAt() < CACHE_MS) {
            return cached.document();
        }
        JSONObject document = http.getJson(solderBase(solderUrl) + "modpack/" + encode(slug), HEADERS);
        requireNoError(document, "Technic Solder pack " + slug);
        solderCache.put(key, new CachedDocument(document, System.currentTimeMillis()));
        return document;
    }

    /**
     * One build's manifest, listing every mod archive in it. Only Solder-hosted packs have one;
     * the rest ship a single client zip instead.
     */
    JSONObject solderBuild(String solderUrl, String slug, String build) throws Exception {
        JSONObject document = http.getJson(
                solderBase(solderUrl) + "modpack/" + encode(slug) + "/" + encode(build), HEADERS);
        requireNoError(document, "Technic build " + slug + " " + build);
        return document;
    }

    /** Splits the {@code slug:build} form this provider uses for release ids. */
    record PackRef(String slug, String build) {
        static PackRef parse(String value) {
            if (value == null || !value.contains(":")) {
                throw new IllegalArgumentException("Not a Technic build id: " + value);
            }
            int separator = value.indexOf(':');
            String slug = value.substring(0, separator).trim();
            String build = value.substring(separator + 1).trim();
            if (slug.isEmpty() || build.isEmpty()) {
                throw new IllegalArgumentException("Not a Technic build id: " + value);
            }
            return new PackRef(slug, build);
        }
    }

    // ── versions ──────────────────────────────────────────────────────────────

    /** A pack without Solder publishes exactly one build, downloadable from its own URL. */
    private List<ProjectVersion> singleBuild(JSONObject document, String slug, String title, String minecraft) {
        String build = document.optString("version", "");
        String url = document.optString("url", "");
        if (build.isBlank() && url.isBlank()) return List.of();
        if (build.isBlank()) build = "latest";

        return List.of(toVersion(slug, build, title, minecraft, "release", url));
    }

    private List<ProjectVersion> solderBuilds(String solder, String slug, String title, String minecraft)
            throws Exception {
        JSONObject listing = solderPack(solder, slug);
        String recommended = listing.optString("recommended", "");

        JSONArray builds = listing.optJSONArray("builds");
        List<ProjectVersion> versions = new ArrayList<>();
        if (builds == null) return versions;

        for (int i = 0; i < builds.length(); i++) {
            String build = builds.optString(i, "");
            if (build.isBlank()) continue;
            // Solder tracks the whole build history and marks one as recommended; the rest are
            // offered as pre-releases so an update is never pushed onto an older stable build.
            versions.add(toVersion(slug, build, title, minecraft,
                    build.equals(recommended) ? "release" : "beta", solder));
        }
        // Solder lists builds oldest-first; the shared model expects the newest at the front.
        java.util.Collections.reverse(versions);
        return versions;
    }

    private ProjectVersion toVersion(String slug, String build, String title, String minecraft,
                                     String releaseType, String downloadUrl) {
        return new ProjectVersion(
                ProviderId.TECHNIC,
                slug + ":" + build,
                slug,
                title + " " + build,
                build,
                minecraft.isBlank() ? List.of() : List.of(minecraft),
                List.of(),
                releaseType,
                // Marks the build as installable. The installer resolves the real download itself,
                // because a Solder build is a list of archives rather than one file.
                downloadUrl.isBlank() ? API_BASE + "/modpack/" + slug : downloadUrl,
                "",
                "",
                0L,
                "",
                List.of());
    }

    // ── mapping ───────────────────────────────────────────────────────────────

    /**
     * Turns search hits into full summaries.
     *
     * <p>A hit carries only a slug, a display name and an icon, which would leave the card without
     * a Minecraft version or an author. Each is looked up once, concurrently — serially this would
     * be twenty round trips in a row — and a pack whose lookup fails still renders from the hit.
     */
    private List<ProjectSummary> enrich(List<JSONObject> hits) {
        if (hits.isEmpty()) return List.of();

        List<ProjectSummary> summaries = new ArrayList<>(hits.size());
        try (ExecutorService executor = Executors.newFixedThreadPool(
                Math.min(MAX_PARALLEL_LOOKUPS, hits.size()), Thread.ofVirtual().factory())) {

            List<CompletableFuture<ProjectSummary>> futures = new ArrayList<>(hits.size());
            for (JSONObject hit : hits) {
                futures.add(CompletableFuture.supplyAsync(() -> {
                    String slug = hit.optString("slug", "");
                    try {
                        return fromDocument(pack(slug));
                    } catch (Exception e) {
                        return fromHit(hit);
                    }
                }, executor));
            }
            for (CompletableFuture<ProjectSummary> future : futures) {
                ProjectSummary summary = future.join();
                if (summary != null) summaries.add(summary);
            }
        }
        return summaries;
    }

    /** The bare search hit: enough to render a card, but with no version or author. */
    private ProjectSummary fromHit(JSONObject hit) {
        String slug = hit.optString("slug", "");
        return new ProjectSummary(
                ProviderId.TECHNIC, slug, slug,
                hit.optString("name", slug), "", "",
                hit.optString("iconUrl", ""),
                0L, 0L, List.of(), List.of(), List.of(), ContentKind.MODPACK, "");
    }

    /** The full pack document. Note that {@code name} is the slug and {@code displayName} the title. */
    private ProjectSummary fromDocument(JSONObject document) {
        String slug = document.optString("name", "");
        String minecraft = document.optString("minecraft", "");

        List<String> tags = new ArrayList<>();
        JSONArray tagArray = document.optJSONArray("tags");
        if (tagArray != null) {
            for (int i = 0; i < tagArray.length(); i++) {
                String tag = tagArray.optString(i, "");
                if (!tag.isBlank()) tags.add(tag);
            }
        }

        return new ProjectSummary(
                ProviderId.TECHNIC,
                slug,
                slug,
                document.optString("displayName", slug),
                shortDescription(document),
                document.optString("user", ""),
                imageUrl(document),
                document.optLong("installs", 0L),
                document.optLong("runs", 0L),
                tags,
                // Technic packs are Forge-based or vanilla; the pack document never says which.
                List.of(),
                minecraft.isBlank() ? List.of() : List.of(minecraft),
                ContentKind.MODPACK,
                "");
    }

    /**
     * Technic's descriptions are long-form text meant for a pack page; a card needs a line, so
     * the first sentence stands in when nothing shorter is published.
     */
    private String shortDescription(JSONObject document) {
        String description = document.optString("description", "").replaceAll("<[^>]+>", " ").trim();
        if (description.length() <= 180) return description;
        int cut = description.indexOf(". ");
        return cut > 40 && cut < 180 ? description.substring(0, cut + 1) : description.substring(0, 177) + "…";
    }

    private String imageUrl(JSONObject document) {
        JSONObject icon = document.optJSONObject("icon");
        String iconUrl = icon == null ? "" : icon.optString("url", "");
        if (!iconUrl.isBlank()) return iconUrl;
        JSONObject logo = document.optJSONObject("logo");
        return logo == null ? "" : logo.optString("url", "");
    }

    private void addImage(List<String> target, JSONObject image) {
        if (image == null) return;
        String url = image.optString("url", "");
        if (!url.isBlank()) target.add(url);
    }

    private String discordInvite(JSONObject document) {
        String id = document.optString("discordServerId", "");
        return id.isBlank() || "null".equalsIgnoreCase(id) ? "" : "https://discord.gg/" + id;
    }

    /** Technic's search has no filters of its own, so the launcher's are applied to the results. */
    private List<ProjectSummary> filter(List<ProjectSummary> hits, SearchQuery query) {
        String gameVersion = query.gameVersion();
        String loader = query.loader();

        // Technic packs run on Forge or vanilla; a Fabric filter can never match one.
        boolean loaderExcludesEverything = loader != null && !loader.isBlank()
                && !loader.equalsIgnoreCase("forge") && !loader.equalsIgnoreCase("vanilla");
        if (loaderExcludesEverything) return List.of();

        if (gameVersion == null || gameVersion.isBlank()) return hits;
        return hits.stream()
                .filter(hit -> hit.gameVersions().isEmpty() || hit.gameVersions().contains(gameVersion))
                .toList();
    }

    private void sort(List<ProjectSummary> hits, String sort) {
        Comparator<ProjectSummary> comparator = switch (sort.toLowerCase(Locale.ROOT)) {
            case "downloads", "installs" -> Comparator.comparingLong(ProjectSummary::downloads).reversed();
            case "follows", "followers", "plays" -> Comparator.comparingLong(ProjectSummary::follows).reversed();
            // Relevance and the date sorts keep the order the platform returned.
            default -> null;
        };
        if (comparator != null) hits.sort(comparator);
    }

    private String browseEndpoint(String sort) {
        return switch (sort.toLowerCase(Locale.ROOT)) {
            case "newest", "updated" -> "discover";
            default -> "trending";
        };
    }

    /** Accepts a bare slug as well as a full {@code technicpack.net/modpack/...} URL. */
    static String normalizeSlug(String value) {
        String slug = value == null ? "" : value.trim();
        if (slug.isEmpty()) throw new IllegalArgumentException("A Technic pack slug is required");

        int marker = slug.indexOf("/modpack/");
        if (marker >= 0) slug = slug.substring(marker + "/modpack/".length());
        // Platform URLs append a numeric id: attack-of-the-bteam.90000
        int dot = slug.indexOf('.');
        if (dot > 0 && slug.substring(dot + 1).chars().allMatch(Character::isDigit)) {
            slug = slug.substring(0, dot);
        }
        int slash = slug.indexOf('/');
        if (slash >= 0) slug = slug.substring(0, slash);
        if (slug.isEmpty()) throw new IllegalArgumentException("A Technic pack slug is required");
        return slug;
    }

    static String solderBase(String solderUrl) {
        String base = solderUrl == null ? "" : solderUrl.trim();
        if (base.isEmpty()) throw new IllegalStateException("This pack has no Solder instance");
        return base.endsWith("/") ? base : base + "/";
    }

    private static void requireNoError(JSONObject document, String what) {
        String error = document.optString("error", "");
        if (!error.isBlank()) {
            throw new IllegalStateException(what + " is not available: " + error);
        }
    }

    private static void putIfPresent(Map<String, String> target, String key, String value) {
        if (value != null && !value.isBlank()) target.put(key, value);
    }

    private static String encode(String value) {
        return URLEncoder.encode(value, StandardCharsets.UTF_8);
    }
}
