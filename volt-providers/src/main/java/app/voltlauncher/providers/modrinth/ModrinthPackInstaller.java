package app.voltlauncher.providers.modrinth;

import app.voltlauncher.core.util.HttpFetcher;
import app.voltlauncher.game.instance.ContentSource;
import app.voltlauncher.game.instance.Instance;
import app.voltlauncher.providers.content.AbstractModpackInstaller;
import app.voltlauncher.providers.content.ProgressSink;
import app.voltlauncher.providers.model.ProviderId;
import org.json.JSONArray;
import org.json.JSONObject;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;

/** Installs Modrinth {@code .mrpack} archives. */
public final class ModrinthPackInstaller extends AbstractModpackInstaller {

    private static final String INDEX_ENTRY = "modrinth.index.json";
    private static final List<String> OVERRIDE_PREFIXES = List.of("overrides", "client-overrides");

    public ModrinthPackInstaller(HttpFetcher http) {
        super(http);
    }

    @Override
    public ProviderId provider() {
        return ProviderId.MODRINTH;
    }

    /** The entry every {@code .mrpack} must carry, used to recognise the format on import. */
    public static String indexEntry() {
        return INDEX_ENTRY;
    }

    @Override
    public PackInfo readPackInfo(Path archive) throws Exception {
        JSONObject index = readJsonEntry(archive, INDEX_ENTRY);
        return new PackInfo(
                resolveVersionId(index),
                index.optString("name", "Modpack"),
                index.optString("versionId", ""),
                archive);
    }

    @Override
    public PackInfo fetchPackInfo(String modrinthVersionId) throws Exception {
        JSONObject versionMeta = http.getJson(
                ModrinthProvider.API_BASE + "/version/" + modrinthVersionId, ModrinthProvider.HEADERS);

        JSONObject packFile = pickPackFile(versionMeta.optJSONArray("files"));
        if (packFile == null) {
            throw new IllegalStateException("No .mrpack file found for Modrinth version " + modrinthVersionId);
        }
        JSONObject hashes = packFile.optJSONObject("hashes");

        Path archive = Files.createTempFile("voltlauncher-pack-", ".mrpack");
        try {
            http.download(packFile.getString("url"), archive,
                    hashes == null ? "" : hashes.optString("sha1", ""));

            PackInfo info = readPackInfo(archive);
            // The provider's own version number beats the one written into the index, which pack
            // authors often forget to bump.
            String versionNumber = versionMeta.optString("version_number", info.packVersion());
            return new PackInfo(info.versionId(), info.packName(), versionNumber, archive, modrinthVersionId);
        } catch (Exception e) {
            Files.deleteIfExists(archive);
            throw e;
        }
    }

    @Override
    public List<ContentSource> applyPackContents(Instance instance, PackInfo info, ProgressSink progress)
            throws Exception {
        Path archive = info.archiveFile();
        JSONObject index = readJsonEntry(archive, INDEX_ENTRY);

        List<RemoteFile> files = collectFiles(index.optJSONArray("files"));
        downloadFiles(instance.gameDirectory(), files, progress);

        progress.stage(STAGE_OVERRIDES);
        List<String> overrides = applyOverrides(instance.gameDirectory(), archive, OVERRIDE_PREFIXES);

        List<ContentSource> sources = new ArrayList<>(toContentSources(files));
        sources.addAll(overrideContentSources(overrides));
        return sources;
    }

    // ── internals ─────────────────────────────────────────────────────────────

    private JSONObject pickPackFile(JSONArray files) {
        if (files == null) return null;
        JSONObject firstMrpack = null;
        for (int i = 0; i < files.length(); i++) {
            JSONObject file = files.getJSONObject(i);
            if (file.optBoolean("primary", false)) return file;
            if (firstMrpack == null && file.optString("filename", "").endsWith(".mrpack")) {
                firstMrpack = file;
            }
        }
        return firstMrpack;
    }

    /** Maps the pack's declared dependencies onto a launcher version id. */
    private String resolveVersionId(JSONObject index) {
        JSONObject dependencies = index.optJSONObject("dependencies");
        if (dependencies == null) {
            throw new IllegalStateException("The modpack does not declare any dependencies");
        }
        String minecraftVersion = dependencies.optString("minecraft", "");
        if (minecraftVersion.isBlank()) {
            throw new IllegalStateException("The modpack does not declare a Minecraft version");
        }

        if (dependencies.has("neoforge")) {
            return "neoforge:" + minecraftVersion + ":" + dependencies.getString("neoforge");
        }
        if (dependencies.has("fabric-loader")) {
            return "fabric:" + minecraftVersion + ":" + dependencies.getString("fabric-loader");
        }
        if (dependencies.has("forge")) {
            return "forge:" + minecraftVersion + ":" + dependencies.getString("forge");
        }
        if (dependencies.has("quilt-loader")) {
            return "quilt:" + minecraftVersion + ":" + dependencies.getString("quilt-loader");
        }
        return minecraftVersion;
    }

    private List<RemoteFile> collectFiles(JSONArray files) {
        List<RemoteFile> result = new ArrayList<>();
        if (files == null) return result;

        for (int i = 0; i < files.length(); i++) {
            JSONObject file = files.getJSONObject(i);
            String relativePath = file.optString("path", "");
            if (relativePath.isBlank()) continue;

            // Server-only files are declared as unsupported on the client and must be skipped,
            // otherwise the pack installs mods that crash a client launch.
            JSONObject env = file.optJSONObject("env");
            if (env != null && "unsupported".equals(env.optString("client", ""))) continue;

            JSONArray downloads = file.optJSONArray("downloads");
            if (downloads == null || downloads.isEmpty()) continue;

            JSONObject hashes = file.optJSONObject("hashes");
            String sha1 = hashes == null ? "" : hashes.optString("sha1", "");
            String hash = hashes == null ? ""
                    : hashes.has("sha512") ? hashes.getString("sha512") : sha1;

            String url = downloads.getString(0);
            String[] ids = idsFromCdnUrl(url);
            result.add(new RemoteFile(relativePath, url, hash, sha1, ids[0], ids[1], "", ""));
        }
        return result;
    }

    /**
     * A {@code .mrpack} index names its files only by download URL, but Modrinth's CDN encodes the
     * project and version in the path — {@code /data/{projectId}/versions/{versionId}/{file}} — so
     * pack-installed mods can still be tracked for updates. Anything served from elsewhere stays
     * untracked rather than being guessed at.
     */
    private String[] idsFromCdnUrl(String url) {
        try {
            String path = java.net.URI.create(url).getPath();
            String[] parts = path.split("/");
            for (int i = 0; i + 3 < parts.length; i++) {
                if ("data".equals(parts[i]) && "versions".equals(parts[i + 2])) {
                    return new String[] {parts[i + 1], parts[i + 3]};
                }
            }
        } catch (Exception ignored) {
            // A malformed URL simply means the file cannot be tracked.
        }
        return new String[] {"", ""};
    }
}
