package app.voltlauncher.game.instance;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;

/**
 * Where one installed file came from.
 *
 * <p>Recording this is what makes version management, modpack updates and export possible: without
 * it a jar in {@code mods/} is just bytes, and the launcher cannot tell which project it belongs
 * to, whether a newer build exists, or how to reference it in an exported pack.
 *
 * <p>{@code provider}, {@code projectId} and {@code versionId} are blank for files the user added
 * by hand — those are still tracked, so export knows to carry them as overrides.
 *
 * @param origin               one of {@link #ORIGIN_PROVIDER}, {@link #ORIGIN_MODPACK} or
 *                             {@link #ORIGIN_MANUAL}
 * @param requiredDependencies project ids this file needs to work, recorded at install time so
 *                             the launcher can warn when one of them is removed or switched off
 */
public record ContentSource(
        String contentType,
        String fileName,
        String provider,
        String projectId,
        String versionId,
        String projectName,
        String versionNumber,
        String downloadUrl,
        String sha1,
        long fileSize,
        String origin,
        String iconUrl,
        List<String> requiredDependencies) {

    /** Installed from a provider by explicit user choice. */
    public static final String ORIGIN_PROVIDER = "provider";
    /** Installed as part of a modpack; removed again when the pack drops the file. */
    public static final String ORIGIN_MODPACK = "modpack";
    /** Copied in from disk by the user. */
    public static final String ORIGIN_MANUAL = "manual";

    public ContentSource {
        provider = blankToEmpty(provider);
        projectId = blankToEmpty(projectId);
        versionId = blankToEmpty(versionId);
        projectName = blankToEmpty(projectName);
        versionNumber = blankToEmpty(versionNumber);
        downloadUrl = blankToEmpty(downloadUrl);
        sha1 = blankToEmpty(sha1);
        origin = blankToEmpty(origin).isEmpty() ? ORIGIN_MANUAL : origin;
        iconUrl = blankToEmpty(iconUrl);
        requiredDependencies = requiredDependencies == null ? List.of() : List.copyOf(requiredDependencies);
    }

    /** Convenience for the many call sites that record no dependency information. */
    public ContentSource(String contentType, String fileName, String provider, String projectId,
                         String versionId, String projectName, String versionNumber, String downloadUrl,
                         String sha1, long fileSize, String origin, String iconUrl) {
        this(contentType, fileName, provider, projectId, versionId, projectName, versionNumber,
                downloadUrl, sha1, fileSize, origin, iconUrl, List.of());
    }

    public static ContentSource manual(String contentType, String fileName, long fileSize) {
        return new ContentSource(contentType, fileName, "", "", "", "", "", "", "", fileSize, ORIGIN_MANUAL, "");
    }

    /** Whether this file can be looked up against its provider for newer versions. */
    public boolean isTracked() {
        return !provider.isEmpty() && !projectId.isEmpty();
    }

    public boolean isFromModpack() {
        return ORIGIN_MODPACK.equals(origin);
    }

    public ContentSource withFileName(String newFileName) {
        return new ContentSource(contentType, newFileName, provider, projectId, versionId,
                projectName, versionNumber, downloadUrl, sha1, fileSize, origin, iconUrl, requiredDependencies);
    }

    public ContentSource withOrigin(String newOrigin) {
        return new ContentSource(contentType, fileName, provider, projectId, versionId,
                projectName, versionNumber, downloadUrl, sha1, fileSize, newOrigin, iconUrl, requiredDependencies);
    }

    /** Fills in the display details a later project lookup discovered. */
    public ContentSource withProjectDetails(String newProjectName, String newIconUrl) {
        return new ContentSource(contentType, fileName, provider, projectId, versionId,
                newProjectName, versionNumber, downloadUrl, sha1, fileSize, origin, newIconUrl,
                requiredDependencies);
    }

    /** Records the projects this release declares as required. */
    public ContentSource withRequiredDependencies(List<String> dependencies) {
        return new ContentSource(contentType, fileName, provider, projectId, versionId,
                projectName, versionNumber, downloadUrl, sha1, fileSize, origin, iconUrl, dependencies);
    }

    public JSONObject toJson() {
        return new JSONObject()
                .put("contentType", contentType)
                .put("fileName", fileName)
                .put("provider", provider)
                .put("projectId", projectId)
                .put("versionId", versionId)
                .put("projectName", projectName)
                .put("versionNumber", versionNumber)
                .put("downloadUrl", downloadUrl)
                .put("sha1", sha1)
                .put("fileSize", fileSize)
                .put("origin", origin)
                .put("iconUrl", iconUrl)
                .put("requiredDependencies", new JSONArray(requiredDependencies));
    }

    public static ContentSource fromJson(JSONObject json) {
        return new ContentSource(
                json.optString("contentType", ""),
                json.optString("fileName", ""),
                json.optString("provider", ""),
                json.optString("projectId", ""),
                json.optString("versionId", ""),
                json.optString("projectName", ""),
                json.optString("versionNumber", ""),
                json.optString("downloadUrl", ""),
                json.optString("sha1", ""),
                json.optLong("fileSize", 0L),
                json.optString("origin", ORIGIN_MANUAL),
                json.optString("iconUrl", ""),
                readStrings(json.optJSONArray("requiredDependencies")));
    }

    private static List<String> readStrings(JSONArray array) {
        if (array == null) return List.of();
        List<String> values = new ArrayList<>(array.length());
        for (int i = 0; i < array.length(); i++) {
            String value = array.optString(i, "");
            if (!value.isBlank()) values.add(value);
        }
        return values;
    }

    private static String blankToEmpty(String value) {
        return value == null ? "" : value.trim();
    }
}
