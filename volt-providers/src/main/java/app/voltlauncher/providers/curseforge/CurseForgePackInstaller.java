package app.voltlauncher.providers.curseforge;

import app.voltlauncher.core.config.SettingsStore;
import app.voltlauncher.core.util.HttpFetcher;
import app.voltlauncher.game.instance.ContentSource;
import app.voltlauncher.game.instance.Instance;
import app.voltlauncher.providers.content.AbstractModpackInstaller;
import app.voltlauncher.providers.content.ProgressSink;
import app.voltlauncher.providers.model.ProjectVersion;
import app.voltlauncher.providers.model.ProviderId;
import org.json.JSONArray;
import org.json.JSONObject;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * Installs CurseForge modpack archives.
 *
 * <p>Unlike Modrinth packs, a CurseForge manifest references its mods by numeric project and file
 * id rather than by URL, so the download links have to be resolved through the bridge in one bulk
 * request before anything can be fetched.
 */
public final class CurseForgePackInstaller extends AbstractModpackInstaller {

    private static final String MANIFEST_ENTRY = "manifest.json";
    private static final int BULK_BATCH_SIZE = 200;

    private final CurseForgeProvider provider;
    private final SettingsStore settings;

    public CurseForgePackInstaller(HttpFetcher http, CurseForgeProvider provider, SettingsStore settings) {
        super(http);
        this.provider = provider;
        this.settings = settings;
    }

    @Override
    public ProviderId provider() {
        return ProviderId.CURSEFORGE;
    }

    /** The entry every CurseForge pack zip must carry, used to recognise the format on import. */
    public static String manifestEntry() {
        return MANIFEST_ENTRY;
    }

    @Override
    public PackInfo readPackInfo(Path archive) throws Exception {
        JSONObject manifest = readJsonEntry(archive, MANIFEST_ENTRY);
        return new PackInfo(
                resolveVersionId(manifest),
                manifest.optString("name", "Modpack"),
                manifest.optString("version", ""),
                archive);
    }

    @Override
    public PackInfo fetchPackInfo(String fileId) throws Exception {
        ProjectVersion version = provider.version(fileId);
        if (!version.isDownloadable()) {
            throw new IllegalStateException(
                    "This modpack cannot be downloaded automatically because its author disabled "
                            + "third-party downloads on CurseForge.");
        }

        Path archive = Files.createTempFile("voltlauncher-pack-", ".zip");
        try {
            http.download(version.downloadUrl(), archive, version.sha1() == null ? "" : version.sha1());
            PackInfo info = readPackInfo(archive);
            String versionNumber = version.versionNumber() == null || version.versionNumber().isBlank()
                    ? info.packVersion()
                    : version.versionNumber();
            return new PackInfo(info.versionId(), info.packName(), versionNumber, archive, fileId);
        } catch (Exception e) {
            Files.deleteIfExists(archive);
            throw e;
        }
    }

    @Override
    public List<ContentSource> applyPackContents(Instance instance, PackInfo info, ProgressSink progress)
            throws Exception {
        Path archive = info.archiveFile();
        JSONObject manifest = readJsonEntry(archive, MANIFEST_ENTRY);

        List<RemoteFile> files = resolveManifestFiles(manifest.optJSONArray("files"), progress);
        downloadFiles(instance.gameDirectory(), files, progress);

        progress.stage(STAGE_OVERRIDES);
        String overrides = manifest.optString("overrides", "overrides");
        List<String> written = applyOverrides(instance.gameDirectory(), archive, List.of(overrides));

        List<ContentSource> sources = new ArrayList<>(toContentSources(files));
        sources.addAll(overrideContentSources(written));
        return sources;
    }

    // ── internals ─────────────────────────────────────────────────────────────

    /** Turns {@code {"version":"1.20.1","modLoaders":[{"id":"forge-47.2.0"}]}} into a launcher id. */
    private String resolveVersionId(JSONObject manifest) {
        JSONObject minecraft = manifest.optJSONObject("minecraft");
        if (minecraft == null) {
            throw new IllegalStateException("The modpack manifest does not declare a Minecraft version");
        }
        String minecraftVersion = minecraft.optString("version", "");
        if (minecraftVersion.isBlank()) {
            throw new IllegalStateException("The modpack manifest does not declare a Minecraft version");
        }

        JSONArray modLoaders = minecraft.optJSONArray("modLoaders");
        if (modLoaders == null || modLoaders.isEmpty()) return minecraftVersion;

        JSONObject chosen = modLoaders.getJSONObject(0);
        for (int i = 0; i < modLoaders.length(); i++) {
            if (modLoaders.getJSONObject(i).optBoolean("primary", false)) {
                chosen = modLoaders.getJSONObject(i);
                break;
            }
        }

        String loaderId = chosen.optString("id", "");
        int separator = loaderId.indexOf('-');
        if (separator <= 0) return minecraftVersion;

        String loader = loaderId.substring(0, separator).toLowerCase(Locale.ROOT);
        String loaderVersion = loaderId.substring(separator + 1);
        return switch (loader) {
            case "forge", "fabric", "neoforge", "quilt" -> loader + ":" + minecraftVersion + ":" + loaderVersion;
            default -> minecraftVersion;
        };
    }

    /**
     * Resolves every {@code (projectID, fileID)} pair into a concrete download. Requests go out in
     * batches because CurseForge caps the number of ids per bulk lookup.
     */
    private List<RemoteFile> resolveManifestFiles(JSONArray manifestFiles, ProgressSink progress) throws Exception {
        List<RemoteFile> result = new ArrayList<>();
        if (manifestFiles == null || manifestFiles.isEmpty()) return result;

        List<Integer> fileIds = new ArrayList<>();
        for (int i = 0; i < manifestFiles.length(); i++) {
            JSONObject file = manifestFiles.getJSONObject(i);
            if (!file.optBoolean("required", true)) continue;
            int fileId = file.optInt("fileID", 0);
            if (fileId > 0) fileIds.add(fileId);
        }

        Map<Integer, JSONObject> resolved = new LinkedHashMap<>();
        for (int start = 0; start < fileIds.size(); start += BULK_BATCH_SIZE) {
            List<Integer> batch = fileIds.subList(start, Math.min(start + BULK_BATCH_SIZE, fileIds.size()));
            progress.update(STAGE_RESOLVING, Math.min(start + batch.size(), fileIds.size()), fileIds.size());

            JSONObject body = new JSONObject().put("fileIds", new JSONArray(batch));
            JSONObject response = http.postJson(bridgeUrl() + "/v1/mods/files", body);
            JSONArray data = response.optJSONArray("data");
            if (data == null) continue;
            for (int i = 0; i < data.length(); i++) {
                JSONObject entry = data.getJSONObject(i);
                resolved.put(entry.optInt("id", 0), entry);
            }
        }

        List<String> undownloadable = new ArrayList<>();
        for (int fileId : fileIds) {
            JSONObject file = resolved.get(fileId);
            if (file == null) {
                undownloadable.add("file " + fileId);
                continue;
            }
            ProjectVersion version = provider.toVersion(file);
            String fileName = version.fileName();
            if (!version.isDownloadable()) {
                undownloadable.add(fileName.isBlank() ? "file " + fileId : fileName);
                continue;
            }
            String sha1 = version.sha1() == null ? "" : version.sha1();
            result.add(new RemoteFile(
                    targetFolder(file) + "/" + fileName, version.downloadUrl(), sha1, sha1,
                    version.projectId(), version.versionId(),
                    file.optString("displayName", ""), version.versionNumber()));
        }

        if (!undownloadable.isEmpty()) {
            throw new IllegalStateException(
                    "This pack contains " + undownloadable.size() + " file(s) that CurseForge does not allow "
                            + "third-party launchers to download: " + String.join(", ", undownloadable)
                            + ". They have to be installed manually.");
        }
        return result;
    }

    /**
     * Most manifest entries are mods, but packs also ship resource packs and shaders through the
     * same list; CurseForge's class id on the file tells them apart.
     */
    private String targetFolder(JSONObject file) {
        return switch (file.optInt("classId", 6)) {
            case 12 -> "resourcepacks";
            case 6552 -> "shaderpacks";
            case 6945 -> "datapacks";
            default -> "mods";
        };
    }

    private String bridgeUrl() {
        String url = settings.get().curseForgeBridgeUrl();
        return url.endsWith("/") ? url.substring(0, url.length() - 1) : url;
    }
}
