package app.voltlauncher.providers.ftb;

import app.voltlauncher.core.util.HttpFetcher;
import app.voltlauncher.game.instance.ContentSource;
import app.voltlauncher.game.instance.Instance;
import app.voltlauncher.providers.content.AbstractModpackInstaller;
import app.voltlauncher.providers.content.ProgressSink;
import app.voltlauncher.providers.model.ProviderId;
import org.json.JSONArray;
import org.json.JSONObject;

import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/**
 * Installs an FTB modpack release.
 *
 * <p>FTB serves a release as a list of files with URLs and hashes rather than an archive, so there
 * is nothing to unpack: the launcher downloads straight into the profile. That also means an
 * imported {@code .zip} can never be an FTB pack, and updates are exact — the manifest of the new
 * release is directly comparable with the old one.
 */
public final class FtbPackInstaller extends AbstractModpackInstaller {

    private final FtbProvider provider;

    public FtbPackInstaller(HttpFetcher http, FtbProvider provider) {
        super(http);
        this.provider = provider;
    }

    @Override
    public ProviderId provider() {
        return ProviderId.FTB;
    }

    /** FTB publishes no pack archive, so there is nothing a user could import from disk. */
    @Override
    public boolean supportsImport() {
        return false;
    }

    @Override
    public PackInfo readPackInfo(Path archive) {
        throw new IllegalArgumentException(
                "FTB packs are installed from the FTB platform, not from a file. "
                        + "Find the pack under Discover → FTB.");
    }

    @Override
    public PackInfo fetchPackInfo(String versionId) throws Exception {
        JSONObject release = provider.releaseDocument(versionId);
        FtbProvider.PackRef ref = FtbProvider.PackRef.parse(versionId);

        String packName;
        try {
            packName = provider.pack(ref.packId()).optString("name", "FTB Modpack");
        } catch (Exception e) {
            // A pack lookup failure must not block an install whose release document already
            // loaded; the release's own name is a usable fallback.
            packName = release.optString("name", "FTB Modpack");
        }

        return new PackInfo(resolveVersionId(release), packName,
                release.optString("name", ""), null, versionId);
    }

    @Override
    public List<ContentSource> applyPackContents(Instance instance, PackInfo info, ProgressSink progress)
            throws Exception {
        progress.stage(STAGE_RESOLVING);
        JSONObject release = provider.releaseDocument(info.sourceRef());

        List<RemoteFile> files = collectFiles(release);
        downloadFiles(instance.gameDirectory(), files, progress);
        return toContentSources(files);
    }

    // ── internals ─────────────────────────────────────────────────────────────

    /** Turns the release's {@code targets} into the launcher's own version id. */
    static String resolveVersionId(JSONObject release) {
        List<String> gameVersions = new ArrayList<>();
        List<String> loaders = new ArrayList<>();
        FtbProvider.readTargets(release, gameVersions, loaders);

        if (gameVersions.isEmpty()) {
            throw new IllegalStateException("This FTB release does not declare a Minecraft version");
        }
        String minecraftVersion = gameVersions.getFirst();

        JSONArray targets = release.optJSONArray("targets");
        if (targets != null) {
            for (int i = 0; i < targets.length(); i++) {
                JSONObject target = targets.getJSONObject(i);
                if (!"modloader".equalsIgnoreCase(target.optString("type", ""))) continue;
                String loader = target.optString("name", "").toLowerCase(Locale.ROOT);
                String version = target.optString("version", "");
                if (version.isBlank()) continue;
                switch (loader) {
                    case "forge", "fabric", "neoforge", "quilt" -> {
                        return loader + ":" + minecraftVersion + ":" + version;
                    }
                    default -> { /* an unknown loader falls through to vanilla */ }
                }
            }
        }
        return minecraftVersion;
    }

    /**
     * The client-side files of a release.
     *
     * <p>Server-only entries are dropped — installing them gives a client that crashes on a mod
     * meant for the other side — and entries without a URL are directory placeholders FTB emits
     * for the pack layout.
     */
    private List<RemoteFile> collectFiles(JSONObject release) {
        JSONArray files = release.optJSONArray("files");
        List<RemoteFile> result = new ArrayList<>();
        if (files == null) return result;

        for (int i = 0; i < files.length(); i++) {
            JSONObject file = files.getJSONObject(i);
            if (file.optBoolean("serveronly", false)) continue;

            String url = file.optString("url", "");
            if (url.isBlank()) {
                JSONArray mirrors = file.optJSONArray("mirrors");
                if (mirrors != null && !mirrors.isEmpty()) url = mirrors.optString(0, "");
            }
            if (url.isBlank()) continue;

            String name = file.optString("name", "");
            if (name.isBlank()) continue;

            String relativePath = joinPath(file.optString("path", ""), name);
            if (relativePath == null) continue;

            String sha1 = file.optString("sha1", "");
            result.add(new RemoteFile(relativePath, url, sha1, sha1,
                    "", "", file.optString("name", ""), file.optString("version", "")));
        }
        return result;
    }

    /** FTB writes paths as {@code ./mods/}; normalised here into a plain relative path. */
    static String joinPath(String directory, String fileName) {
        String cleaned = directory == null ? "" : directory.trim().replace('\\', '/');
        if (cleaned.startsWith("./")) cleaned = cleaned.substring(2);
        if (cleaned.startsWith("/")) cleaned = cleaned.substring(1);
        if (!cleaned.isEmpty() && !cleaned.endsWith("/")) cleaned = cleaned + "/";

        String path = cleaned + fileName.trim();
        // The download step refuses anything escaping the game directory anyway; rejecting it
        // here keeps a malformed manifest out of the file list entirely.
        if (path.contains("..") || path.startsWith("/")) return null;
        return path;
    }
}
