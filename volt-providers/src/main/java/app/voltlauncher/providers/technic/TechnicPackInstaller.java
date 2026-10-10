package app.voltlauncher.providers.technic;

import app.voltlauncher.core.util.HttpFetcher;
import app.voltlauncher.core.util.JsonUtil;
import app.voltlauncher.core.util.archive.Archives;
import app.voltlauncher.game.instance.ContentSource;
import app.voltlauncher.game.instance.Instance;
import app.voltlauncher.providers.content.AbstractModpackInstaller;
import app.voltlauncher.providers.content.ProgressSink;
import app.voltlauncher.providers.model.ProviderId;
import org.json.JSONArray;
import org.json.JSONObject;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Installs Technic modpacks, in both of the shapes the platform uses.
 *
 * <p>A pack either lives on a <em>Solder</em> instance, which serves a build as a list of small
 * zips to extract in order, or it is a single client zip the author uploaded. Both carry their own
 * {@code bin/} directory holding the launcher-specific jars Technic's own client needs; those are
 * deliberately dropped, because VoltLauncher installs the loader from its metadata instead of
 * running a pre-merged jar it cannot verify.
 */
public final class TechnicPackInstaller extends AbstractModpackInstaller {

    /** Technic's own launcher files, replaced by the launcher's normal loader installation. */
    private static final String BIN_PREFIX = "bin/";
    private static final String VERSION_JSON = "bin/version.json";
    private static final String MODPACK_JAR = "bin/modpack.jar";

    /** {@code 1.7.10-Forge10.13.4.1614-1.7.10} → the Forge version in the middle. */
    private static final Pattern FORGE_IN_VERSION_ID =
            Pattern.compile("(?i)forge[-_]?([0-9][0-9.]*)");

    /**
     * Resolves the newest build of a mod loader for a Minecraft version.
     *
     * <p>Needed because Solder frequently omits the Forge version from a build even when the pack
     * is unmistakably a Forge pack — installing it as vanilla would produce a profile whose mods
     * folder is simply ignored. Injected rather than reached for directly so this class keeps
     * knowing nothing about the launcher's version resolvers.
     */
    @FunctionalInterface
    public interface LoaderVersionLookup {
        /** @return a fully qualified launcher version id, or blank when no build exists */
        String newestLoaderVersion(String platformId, String minecraftVersion) throws Exception;
    }

    private final TechnicProvider provider;
    private final LoaderVersionLookup loaderVersions;

    public TechnicPackInstaller(HttpFetcher http, TechnicProvider provider, LoaderVersionLookup loaderVersions) {
        super(http);
        this.provider = provider;
        this.loaderVersions = loaderVersions;
    }

    @Override
    public ProviderId provider() {
        return ProviderId.TECHNIC;
    }

    /** The entry a Technic client zip is recognised by when a user imports one from disk. */
    public static String versionJsonEntry() {
        return VERSION_JSON;
    }

    public static String modpackJarEntry() {
        return MODPACK_JAR;
    }

    @Override
    public PackInfo readPackInfo(Path archive) throws Exception {
        String wrapper = detectWrapperFolder(archive);
        byte[] versionJson = readEntry(archive, wrapper, VERSION_JSON);
        if (versionJson == null) {
            throw new IllegalArgumentException(
                    "This zip has no bin/version.json, so the launcher cannot tell which Minecraft "
                            + "and Forge version it needs. Install the pack from Discover → Technic instead.");
        }
        JSONObject version = new JSONObject(new String(versionJson, StandardCharsets.UTF_8));
        String name = archive.getFileName().toString().replaceFirst("\\.zip$", "");
        return new PackInfo(versionIdFromVersionJson(version), name, "", archive);
    }

    @Override
    public PackInfo fetchPackInfo(String versionId) throws Exception {
        TechnicProvider.PackRef ref = TechnicProvider.PackRef.parse(versionId);
        JSONObject pack = provider.pack(ref.slug());
        String displayName = pack.optString("displayName", ref.slug());
        String solder = pack.optString("solder", "");

        if (!solder.isBlank() && !"null".equalsIgnoreCase(solder)) {
            // Solder states the Minecraft version outright, so nothing has to be downloaded
            // before the profile can be created.
            JSONObject build = provider.solderBuild(solder, ref.slug(), ref.build());
            return new PackInfo(resolveSolderVersionId(build), displayName, ref.build(), null, versionId);
        }

        String url = pack.optString("url", "");
        if (url.isBlank()) {
            throw new IllegalStateException(
                    "This Technic pack publishes no download. Its author may have restricted it "
                            + "to the Technic launcher.");
        }

        Path archive = Files.createTempFile("voltlauncher-technic-", ".zip");
        try {
            http.download(url, archive, "");
            PackInfo info = readPackInfo(archive);
            return new PackInfo(info.versionId(), displayName, ref.build(), archive, versionId);
        } catch (Exception e) {
            Files.deleteIfExists(archive);
            throw e;
        }
    }

    @Override
    public List<ContentSource> applyPackContents(Instance instance, PackInfo info, ProgressSink progress)
            throws Exception {
        if (info.hasArchive()) {
            progress.stage(STAGE_OVERRIDES);
            List<String> written = extractAll(instance.gameDirectory(), info.archiveFile(),
                    name -> name.startsWith(BIN_PREFIX));
            return overrideContentSources(written);
        }
        return applySolderBuild(instance, info, progress);
    }

    // ── Solder ────────────────────────────────────────────────────────────────

    /**
     * Downloads and unpacks every mod archive in a Solder build, in the order Solder lists them.
     *
     * <p>Order matters: Solder packs routinely ship two archives that write the same config file,
     * and the later one is meant to win — so these are applied sequentially rather than in
     * parallel, unlike every other pack format the launcher installs.
     */
    private List<ContentSource> applySolderBuild(Instance instance, PackInfo info, ProgressSink progress)
            throws Exception {
        TechnicProvider.PackRef ref = TechnicProvider.PackRef.parse(info.sourceRef());
        JSONObject pack = provider.pack(ref.slug());
        JSONObject build = provider.solderBuild(pack.getString("solder"), ref.slug(), ref.build());

        JSONArray mods = build.optJSONArray("mods");
        if (mods == null || mods.isEmpty()) {
            throw new IllegalStateException("This Technic build lists no files");
        }

        progress.update(STAGE_DOWNLOADING, 0, mods.length());
        Path staging = Files.createTempDirectory("voltlauncher-technic-build-");
        List<String> written = new ArrayList<>();
        try {
            for (int i = 0; i < mods.length(); i++) {
                JSONObject mod = mods.getJSONObject(i);
                String url = mod.optString("url", "");
                if (url.isBlank()) continue;

                Path archive = staging.resolve(i + "-" + safeName(mod.optString("name", "mod")) + ".zip");
                // Solder publishes MD5 sums, which the downloader does not verify; the archive is
                // still checked structurally by the extraction step that follows.
                http.download(url, archive, "");
                written.addAll(extractAll(instance.gameDirectory(), archive,
                        name -> name.startsWith(BIN_PREFIX)));
                Files.deleteIfExists(archive);
                progress.update(STAGE_DOWNLOADING, i + 1, mods.length());
            }
        } finally {
            Archives.deleteRecursively(staging);
        }
        return overrideContentSources(written);
    }

    // ── version resolution ────────────────────────────────────────────────────

    /**
     * The launcher version id for a Solder build.
     *
     * <p>When the build declares its Forge version, that is used verbatim. When it does not —
     * which is the common case, even for packs that are plainly Forge-based — the newest Forge
     * build for that Minecraft version stands in, because a Technic pack installed as vanilla
     * loads none of its mods. Only a build that also has no mods is treated as genuinely vanilla.
     */
    private String resolveSolderVersionId(JSONObject build) {
        String declared = versionIdFromSolder(build);
        if (declared.contains(":")) return declared;

        JSONArray mods = build.optJSONArray("mods");
        if (mods == null || mods.isEmpty()) return declared;

        try {
            String resolved = loaderVersions.newestLoaderVersion("forge", declared);
            if (resolved != null && !resolved.isBlank()) return resolved;
        } catch (Exception e) {
            System.err.println("[Technic] Could not resolve a Forge build for Minecraft " + declared
                    + "; installing as vanilla: " + e.getMessage());
        }
        return declared;
    }

    /** Builds a launcher version id from a Solder build's {@code minecraft} and {@code forge}. */
    static String versionIdFromSolder(JSONObject build) {
        String minecraft = build.optString("minecraft", "");
        if (minecraft.isBlank()) {
            throw new IllegalStateException("This Technic build does not declare a Minecraft version");
        }
        String forge = build.optString("forge", "");
        if (forge == null || forge.isBlank() || "null".equalsIgnoreCase(forge)) {
            return minecraft;
        }
        return "forge:" + minecraft + ":" + normalizeForgeVersion(minecraft, forge);
    }

    /**
     * Builds a launcher version id from a client zip's {@code bin/version.json}.
     *
     * <p>Technic writes the merged id there — {@code 1.7.10-Forge10.13.4.1614} — which is the only
     * place a non-Solder pack states which Forge build it was made against.
     */
    static String versionIdFromVersionJson(JSONObject version) {
        String id = version.optString("id", "");
        String inherits = version.optString("inheritsFrom", "");
        String minecraft = !inherits.isBlank() ? inherits : minecraftFromId(id);
        if (minecraft.isBlank()) {
            throw new IllegalStateException("bin/version.json does not name a Minecraft version");
        }

        Matcher matcher = FORGE_IN_VERSION_ID.matcher(id);
        if (matcher.find()) {
            return "forge:" + minecraft + ":" + normalizeForgeVersion(minecraft, matcher.group(1));
        }
        return minecraft;
    }

    /** The leading {@code 1.7.10} of a merged version id. */
    static String minecraftFromId(String id) {
        if (id == null || id.isBlank()) return "";
        Matcher matcher = Pattern.compile("^(\\d+\\.\\d+(?:\\.\\d+)?)").matcher(id.trim());
        return matcher.find() ? matcher.group(1) : "";
    }

    /**
     * Forge's own version ids are {@code <minecraft>-<forge>}, but Technic stores only the second
     * half; the launcher's Forge resolver expects the loader version alone, so a value that
     * already carries the prefix is trimmed back down rather than doubled.
     */
    static String normalizeForgeVersion(String minecraft, String forge) {
        String value = forge.trim();
        String prefix = minecraft + "-";
        if (value.startsWith(prefix)) value = value.substring(prefix.length());
        return value;
    }

    private static byte[] readEntry(Path archive, String wrapper, String entryName) throws Exception {
        byte[] direct = Archives.readEntry(archive, entryName);
        if (direct != null) return direct;
        return wrapper == null ? null : Archives.readEntry(archive, wrapper + entryName);
    }

    private static String safeName(String value) {
        String cleaned = value == null ? "" : value.replaceAll("[^A-Za-z0-9._-]", "_");
        return cleaned.isBlank() ? "mod" : cleaned.toLowerCase(Locale.ROOT);
    }

    /** Kept so a future caller can read a version document without re-deriving the parsing. */
    static JSONObject parseVersionJson(Path file) throws Exception {
        return JsonUtil.readFile(file);
    }
}
