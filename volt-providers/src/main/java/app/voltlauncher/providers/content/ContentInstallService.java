package app.voltlauncher.providers.content;

import app.voltlauncher.core.util.HttpFetcher;
import app.voltlauncher.game.MinecraftLauncherService;
import app.voltlauncher.game.instance.ContentSource;
import app.voltlauncher.game.instance.Instance;
import app.voltlauncher.game.instance.InstanceContentService;
import app.voltlauncher.game.platform.PlatformRegistry;
import app.voltlauncher.providers.ContentProvider;
import app.voltlauncher.providers.ProviderRegistry;
import app.voltlauncher.providers.model.ContentKind;
import app.voltlauncher.providers.model.ProjectVersion;
import app.voltlauncher.providers.model.ProviderId;
import app.voltlauncher.providers.model.VersionDependency;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;

/**
 * Installs individual mods, resource packs, shaders and data packs from any provider into an
 * existing instance, pulling in required dependencies.
 */
public final class ContentInstallService {

    /** Guards against a pathological dependency graph pulling in the whole registry. */
    private static final int MAX_DEPENDENCY_DEPTH = 4;

    private final MinecraftLauncherService launcher;
    private final ProviderRegistry providers;
    private final HttpFetcher http;

    public ContentInstallService(MinecraftLauncherService launcher, ProviderRegistry providers, HttpFetcher http) {
        this.launcher = launcher;
        this.providers = providers;
        this.http = http;
    }

    /** The outcome of installing one file. */
    public record InstalledFile(String projectId, String versionId, String fileName, boolean dependency) {}

    public record InstallReport(List<InstalledFile> installed, List<String> skipped) {}

    /**
     * Installs a specific version into the instance. Required dependencies are resolved against
     * the instance's own Minecraft version and loader so a Fabric profile never pulls a Forge jar.
     *
     * @param withDependencies when false, only the requested file is installed
     */
    public InstallReport install(String instanceName, ProviderId providerId, String versionId,
                                 ContentKind kind, boolean withDependencies) throws Exception {
        // Refuses if the profile is still being set up, so a mod cannot land in a directory a
        // modpack install is concurrently populating.
        launcher.busyRegistry().requireIdle(instanceName);

        Instance instance = launcher.findInstance(instanceName);
        ContentProvider provider = providers.requireAvailable(providerId);

        InstanceContentService.ContentType target = kind.contentType();
        if (target == null) {
            throw new IllegalArgumentException("Modpacks create their own profile and cannot be added to one");
        }

        String gameVersion = PlatformRegistry.extractBaseMinecraftVersionId(instance.versionId());
        String loader = loaderOf(instance);

        List<InstalledFile> installed = new ArrayList<>();
        List<String> skipped = new ArrayList<>();
        Set<String> visitedProjects = new LinkedHashSet<>();

        List<ContentSource> recorded = new ArrayList<>();

        launcher.busyRegistry().begin(instance.name(), "installing content");
        try {
            ProjectVersion root = provider.version(versionId);
            installOne(instance, provider, root, target, installed, skipped, recorded, false,
                    projectLabel(provider, root));
            visitedProjects.add(root.projectId());

            if (withDependencies) {
                resolveDependencies(instance, provider, root, target, gameVersion, loader,
                        visitedProjects, installed, skipped, recorded, 1);
            }
            launcher.contentManifests().record(instance.slug(), recorded);
        } finally {
            launcher.busyRegistry().end(instance.name());
        }
        return new InstallReport(installed, skipped);
    }

    /** A project's display name and icon, shown next to the installed file. */
    private record ProjectLabel(String title, String iconUrl) {
        static final ProjectLabel NONE = new ProjectLabel("", "");
    }

    /**
     * The project's title and icon, so the UI can say "Sodium" with its logo instead of showing a
     * jar file name. One extra lookup on an explicit user action; a failure just leaves them blank.
     */
    private ProjectLabel projectLabel(ContentProvider provider, ProjectVersion version) {
        try {
            var summary = provider.project(version.projectId()).summary();
            return new ProjectLabel(summary.title(), summary.iconUrl() == null ? "" : summary.iconUrl());
        } catch (Exception e) {
            return ProjectLabel.NONE;
        }
    }

    // ── internals ─────────────────────────────────────────────────────────────

    private void resolveDependencies(Instance instance, ContentProvider provider, ProjectVersion parent,
                                     InstanceContentService.ContentType target, String gameVersion, String loader,
                                     Set<String> visitedProjects, List<InstalledFile> installed,
                                     List<String> skipped, List<ContentSource> recorded, int depth) {
        if (depth > MAX_DEPENDENCY_DEPTH) return;

        for (VersionDependency dependency : parent.dependencies()) {
            if (!dependency.isRequired()) continue;

            String projectId = dependency.projectId();
            if (projectId == null || projectId.isBlank() || !visitedProjects.add(projectId)) continue;

            try {
                ProjectVersion resolved = resolveDependencyVersion(provider, dependency, gameVersion, loader);
                if (resolved == null) {
                    skipped.add("No compatible build of dependency " + projectId
                            + " for Minecraft " + gameVersion + " / " + loader);
                    continue;
                }
                installOne(instance, provider, resolved, target, installed, skipped, recorded, true,
                        projectLabel(provider, resolved));
                resolveDependencies(instance, provider, resolved, target, gameVersion, loader,
                        visitedProjects, installed, skipped, recorded, depth + 1);
            } catch (Exception e) {
                // A dependency that cannot be fetched is reported, not fatal: the main mod is
                // already installed and the user can resolve the gap manually.
                skipped.add("Dependency " + projectId + " could not be installed: " + e.getMessage());
            }
        }
    }

    private ProjectVersion resolveDependencyVersion(ContentProvider provider, VersionDependency dependency,
                                                    String gameVersion, String loader) throws Exception {
        if (dependency.versionId() != null && !dependency.versionId().isBlank()) {
            return provider.version(dependency.versionId());
        }
        List<ProjectVersion> candidates = provider.versions(dependency.projectId(), gameVersion, loader);
        return candidates.stream().filter(ProjectVersion::isDownloadable).findFirst().orElse(null);
    }

    private void installOne(Instance instance, ContentProvider provider, ProjectVersion version,
                            InstanceContentService.ContentType target, List<InstalledFile> installed,
                            List<String> skipped, List<ContentSource> recorded,
                            boolean isDependency, ProjectLabel label) throws Exception {
        if (!version.isDownloadable()) {
            skipped.add(version.name() + " cannot be downloaded automatically; "
                    + "the author has disabled third-party downloads.");
            return;
        }

        String fileName = version.fileName() == null || version.fileName().isBlank()
                ? version.versionId() + ".jar"
                : version.fileName();
        Path destination = instance.gameDirectory().resolve(target.folder()).resolve(sanitize(fileName));
        Files.createDirectories(destination.getParent());

        http.download(version.downloadUrl(), destination, version.sha1() == null ? "" : version.sha1());
        String stored = destination.getFileName().toString();
        installed.add(new InstalledFile(version.projectId(), version.versionId(), stored, isDependency));
        recorded.add(new ContentSource(
                target.folder(), stored, provider.id().id(), version.projectId(), version.versionId(),
                label.title(), version.versionNumber(), version.downloadUrl(),
                version.sha1() == null ? "" : version.sha1(), Files.size(destination),
                ContentSource.ORIGIN_PROVIDER, label.iconUrl(), requiredProjectIds(version)));
    }

    /**
     * The projects this release declares as required, stored alongside the file.
     *
     * <p>Recording them at install time is what later lets the launcher point out that disabling
     * one mod has broken three others, without re-querying the provider for every installed file.
     */
    private static List<String> requiredProjectIds(ProjectVersion version) {
        List<String> projectIds = new ArrayList<>();
        for (VersionDependency dependency : version.dependencies()) {
            if (!dependency.isRequired()) continue;
            String projectId = dependency.projectId();
            if (projectId != null && !projectId.isBlank() && !projectIds.contains(projectId)) {
                projectIds.add(projectId);
            }
        }
        return projectIds;
    }

    /** The loader a profile runs, or {@code null} for vanilla profiles. */
    private String loaderOf(Instance instance) {
        String versionId = instance.versionId();
        if (versionId == null) return null;
        int separator = versionId.indexOf(':');
        if (separator <= 0) return null;
        String loader = versionId.substring(0, separator).toLowerCase(Locale.ROOT);
        return PlatformRegistry.VANILLA_ID.equals(loader) ? null : loader;
    }

    /** Provider file names are attacker-influenced; keep them to a single path segment. */
    private String sanitize(String fileName) {
        String name = fileName.replace('\\', '/');
        int slash = name.lastIndexOf('/');
        if (slash >= 0) name = name.substring(slash + 1);
        name = name.replaceAll("[\\p{Cntrl}]", "").trim();
        if (name.isBlank() || name.equals(".") || name.equals("..")) {
            throw new IllegalArgumentException("Refusing to install file with unusable name: " + fileName);
        }
        return name;
    }
}
