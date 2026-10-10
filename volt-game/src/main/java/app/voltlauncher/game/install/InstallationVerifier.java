package app.voltlauncher.game.install;

import app.voltlauncher.core.AppPaths;
import app.voltlauncher.core.util.JsonUtil;
import app.voltlauncher.game.instance.Instance;
import app.voltlauncher.game.platform.version.resolver.VanillaVersionResolver;
import org.json.JSONArray;
import org.json.JSONObject;

import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.List;

/**
 * Checks that everything a profile needs to launch is actually on disk and intact, and deletes
 * whatever is not so the installer downloads it again.
 *
 * <p>A truncated library or a client jar cut short by a dropped connection produces a crash the
 * moment the game starts, with a stack trace that says nothing about the real cause. Re-installing
 * the whole profile fixes it but costs a gigabyte; this narrows that down to the files that are
 * genuinely wrong.
 */
public final class InstallationVerifier {

    /** Progress callback so a long verification can be followed from the UI. */
    @FunctionalInterface
    public interface Progress {
        void update(String stage, int completed, int total);

        Progress NONE = (stage, completed, total) -> {};
    }

    /**
     * @param problems human-readable descriptions of what was wrong, for the report shown after
     * @param repaired how many files were removed so they would be fetched again
     */
    public record Report(int checked, int missing, int corrupt, int repaired, List<String> problems) {

        public Report {
            problems = problems == null ? List.of() : List.copyOf(problems);
        }

        public boolean isHealthy() {
            return missing == 0 && corrupt == 0;
        }

        public JSONObject toJson() {
            return new JSONObject()
                    .put("checked", checked)
                    .put("missing", missing)
                    .put("corrupt", corrupt)
                    .put("repaired", repaired)
                    .put("healthy", isHealthy())
                    .put("problems", new JSONArray(problems));
        }
    }

    /** Problems past this many are summarised rather than listed, so the report stays readable. */
    private static final int MAX_REPORTED_PROBLEMS = 40;

    private final AssetInstaller assetInstaller;
    private final VanillaVersionResolver versionResolver;

    public InstallationVerifier(AssetInstaller assetInstaller, VanillaVersionResolver versionResolver) {
        this.assetInstaller = assetInstaller;
        this.versionResolver = versionResolver;
    }

    /**
     * Verifies an installation and optionally repairs it.
     *
     * @param deep   also hash every asset object; without it assets are checked for existence
     *               only, which is what makes a quick check finish in seconds rather than minutes
     * @param repair delete the damaged files and re-run the installer afterwards
     */
    public Report verify(Instance instance, JSONObject meta, boolean deep, boolean repair, Progress progress)
            throws Exception {
        Progress sink = progress == null ? Progress.NONE : progress;
        List<String> problems = new ArrayList<>();
        List<Path> damaged = new ArrayList<>();

        int checked = 0;
        int missing = 0;
        int corrupt = 0;

        String launchVersionId = meta.optString("id", instance.versionId());
        String clientVersionId = meta.optString("jar", launchVersionId);
        Path versionsDir = AppPaths.sharedVersionsDirectory();
        Path libsDir = AppPaths.sharedLibrariesDirectory();
        Path assetsDir = AppPaths.sharedAssetsDirectory();

        // ── client jar ────────────────────────────────────────────────────────
        // A loader profile points its "jar" field at the vanilla version, whose metadata carries
        // the hash — so that is resolved rather than skipped, or the one file whose corruption
        // breaks every launch would go unchecked.
        sink.update("client", 0, 1);
        JSONObject clientMeta = meta;
        if (!clientVersionId.equals(launchVersionId)) {
            try {
                clientMeta = versionResolver.resolveMetadata(clientVersionId);
            } catch (Exception e) {
                clientMeta = null;
                problems.add("Could not read the metadata for client " + clientVersionId);
            }
        }
        JSONObject clientDownloads = clientMeta == null ? null : clientMeta.optJSONObject("downloads");
        JSONObject clientDownload = clientDownloads == null ? null : clientDownloads.optJSONObject("client");
        if (clientDownload != null) {
            String folder = safeVersionFolderName(clientVersionId);
            Path clientJar = versionsDir.resolve(folder).resolve(folder + ".jar");
            checked++;
            Outcome outcome = check(clientJar, clientDownload.optString("sha1", ""), true);
            if (outcome != Outcome.OK) {
                if (outcome == Outcome.MISSING) missing++; else corrupt++;
                record(problems, damaged, clientJar, "client jar", outcome);
            }
        }

        // ── libraries ─────────────────────────────────────────────────────────
        JSONArray libraries = meta.optJSONArray("libraries");
        if (libraries != null) {
            for (int i = 0; i < libraries.length(); i++) {
                sink.update("libraries", i, libraries.length());
                JSONObject library = libraries.optJSONObject(i);
                if (library == null) continue;
                if (!OsRules.isAllowedByRules(library.optJSONArray("rules"))) continue;

                JSONObject artifact = library.optJSONObject("downloads") == null
                        ? null
                        : library.optJSONObject("downloads").optJSONObject("artifact");
                if (artifact == null) continue;
                // An artifact with no URL is produced locally by a loader's processors, so its
                // absence is a job for the installer, not a corrupt download.
                if (artifact.optString("url", "").isBlank()) continue;

                String relative = artifact.optString("path", "");
                if (relative.isBlank()) relative = LibraryInstaller.mavenRelativePath(library.optString("name", ""));
                if (relative == null || relative.isBlank()) continue;

                Path file = libsDir.resolve(relative);
                checked++;
                Outcome outcome = check(file, artifact.optString("sha1", ""), true);
                if (outcome != Outcome.OK) {
                    if (outcome == Outcome.MISSING) missing++; else corrupt++;
                    record(problems, damaged, file, "library " + library.optString("name", relative), outcome);
                }
            }
        }

        // ── assets ────────────────────────────────────────────────────────────
        JSONObject assetIndex = meta.optJSONObject("assetIndex");
        if (assetIndex != null) {
            String indexId = assetIndex.optString("id", meta.optString("assets", "legacy"));
            Path indexPath = assetsDir.resolve("indexes").resolve(indexId + ".json");
            checked++;
            Outcome indexOutcome = check(indexPath, assetIndex.optString("sha1", ""), true);
            if (indexOutcome != Outcome.OK) {
                if (indexOutcome == Outcome.MISSING) missing++; else corrupt++;
                record(problems, damaged, indexPath, "asset index " + indexId, indexOutcome);
            } else {
                JSONObject objects = JsonUtil.readFile(indexPath).optJSONObject("objects");
                if (objects != null) {
                    Path objectsDir = assetsDir.resolve("objects");
                    int index = 0;
                    for (String name : objects.keySet()) {
                        sink.update("assets", index++, objects.length());
                        String hash = objects.getJSONObject(name).optString("hash", "");
                        if (hash.length() < 2) continue;
                        Path object = objectsDir.resolve(hash.substring(0, 2)).resolve(hash);
                        checked++;
                        Outcome outcome = check(object, hash, deep);
                        if (outcome != Outcome.OK) {
                            if (outcome == Outcome.MISSING) missing++; else corrupt++;
                            record(problems, damaged, object, "asset " + name, outcome);
                        }
                    }
                }
            }
        }

        int repaired = 0;
        if (repair && !damaged.isEmpty()) {
            sink.update("repairing", 0, damaged.size());
            for (Path file : damaged) {
                if (Files.deleteIfExists(file)) repaired++;
                sink.update("repairing", repaired, damaged.size());
            }
        }
        if (repair) {
            // Re-running the installer is what actually puts the files back; it skips everything
            // still intact, so a repair costs only the damaged downloads.
            sink.update("reinstalling", 0, 0);
            assetInstaller.ensureInstallation(instance, meta);
        }

        return new Report(checked, missing, corrupt, repaired, problems);
    }

    // ── internals ─────────────────────────────────────────────────────────────

    private enum Outcome { OK, MISSING, CORRUPT }

    private Outcome check(Path file, String expectedSha1, boolean hash) {
        if (!Files.isRegularFile(file)) return Outcome.MISSING;
        try {
            if (Files.size(file) == 0) return Outcome.CORRUPT;
        } catch (Exception e) {
            return Outcome.CORRUPT;
        }
        if (!hash || expectedSha1 == null || expectedSha1.isBlank()) return Outcome.OK;
        try {
            return sha1(file).equalsIgnoreCase(expectedSha1) ? Outcome.OK : Outcome.CORRUPT;
        } catch (Exception e) {
            return Outcome.CORRUPT;
        }
    }

    private void record(List<String> problems, List<Path> damaged, Path file, String label, Outcome outcome) {
        // Missing files are queued for deletion too: deleteIfExists simply reports false, and
        // keeping one list means the repair step has a single thing to walk.
        damaged.add(file);
        if (problems.size() < MAX_REPORTED_PROBLEMS) {
            problems.add((outcome == Outcome.MISSING ? "Missing: " : "Damaged: ") + label);
        } else if (problems.size() == MAX_REPORTED_PROBLEMS) {
            problems.add("… and more");
        }
    }

    private static String sha1(Path file) throws Exception {
        MessageDigest digest = MessageDigest.getInstance("SHA-1");
        try (InputStream in = Files.newInputStream(file)) {
            byte[] buffer = new byte[65_536];
            int read;
            while ((read = in.read(buffer)) != -1) {
                digest.update(buffer, 0, read);
            }
        }
        StringBuilder hex = new StringBuilder(40);
        for (byte b : digest.digest()) {
            hex.append(Character.forDigit((b >> 4) & 0xF, 16)).append(Character.forDigit(b & 0xF, 16));
        }
        return hex.toString();
    }

    private static String safeVersionFolderName(String versionId) {
        if (versionId == null || versionId.isBlank()) return "unknown-version";
        return versionId.replace(':', '_').replace('/', '_').replace('\\', '_');
    }
}
