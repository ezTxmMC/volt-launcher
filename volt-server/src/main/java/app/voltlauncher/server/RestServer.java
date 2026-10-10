package app.voltlauncher.server;

import app.voltlauncher.auth.session.MicrosoftAuth;
import app.voltlauncher.auth.skin.SkinStore;
import app.voltlauncher.core.config.SettingsStore;
import app.voltlauncher.core.discord.DiscordPresenceService;
import app.voltlauncher.core.task.TaskRegistry;
import app.voltlauncher.core.update.LauncherUpdateService;
import app.voltlauncher.game.MinecraftLauncherService;
import app.voltlauncher.game.instance.Instance;
import app.voltlauncher.game.java.JavaInstallService;
import app.voltlauncher.game.launch.InstanceLauncher;
import app.voltlauncher.game.platform.PlatformRegistry;
import app.voltlauncher.providers.ProviderRegistry;
import app.voltlauncher.providers.content.ContentInstallService;
import app.voltlauncher.providers.content.ContentVersionService;
import app.voltlauncher.providers.content.ModpackInstallService;
import app.voltlauncher.providers.content.PackExportService;
import app.voltlauncher.providers.curseforge.CurseForgeProvider;
import app.voltlauncher.providers.model.ProviderId;
import app.voltlauncher.server.route.PathGuard;
import app.voltlauncher.server.route.RouteRegistry;
import app.voltlauncher.server.routes.AuthRoutes;
import app.voltlauncher.server.routes.BackupRoutes;
import app.voltlauncher.server.routes.ContentRoutes;
import app.voltlauncher.server.routes.InstanceRoutes;
import app.voltlauncher.server.routes.LogRoutes;
import app.voltlauncher.server.routes.ProviderRoutes;
import app.voltlauncher.server.routes.SettingsRoutes;
import app.voltlauncher.server.routes.SkinRoutes;
import app.voltlauncher.server.routes.TaskRoutes;
import app.voltlauncher.server.routes.WindowRoutes;
import app.voltlauncher.server.routes.WorldRoutes;
import io.javalin.Javalin;
import org.json.JSONObject;

import java.util.function.Consumer;

/**
 * The launcher's local HTTP API, consumed by the Electron front end.
 *
 * <p>It binds to loopback only, which is what keeps it private: the API can start Minecraft and
 * read account state, so it must not be reachable from other machines on the network.
 */
public final class RestServer {

    private static final String BIND_HOST = "127.0.0.1";
    private static final String LAUNCHER_VERSION = "0.2.0";

    private final int port;
    private final MicrosoftAuth auth;
    private final MinecraftLauncherService launcher;
    private final SettingsStore settings;
    private final ProviderRegistry providers;
    private final ContentInstallService contentInstaller;
    private final ContentVersionService contentVersions;
    private final PackExportService packExporter;
    private final ModpackInstallService modpackInstaller;
    private final JavaInstallService javaInstaller;
    private final SkinStore skinStore;
    private final TaskRegistry tasks;
    private final LauncherUpdateService updates;
    private final DiscordPresenceService presence;

    private final Runnable minimizeWindow;
    private final Runnable maximizeWindow;
    private final Runnable closeWindow;
    private final Consumer<String> openUrl;

    private Javalin app;

    public RestServer(int port) {
        this(port, () -> {}, () -> {}, () -> {}, url -> {});
    }

    public RestServer(int port, Runnable minimizeWindow, Runnable maximizeWindow,
                      Runnable closeWindow, Consumer<String> openUrl) {
        this.port = port;
        this.minimizeWindow = minimizeWindow;
        this.maximizeWindow = maximizeWindow;
        this.closeWindow = closeWindow;
        this.openUrl = openUrl;

        try {
            this.settings = new SettingsStore();
            this.tasks = new TaskRegistry();
            this.auth = new MicrosoftAuth();
            this.launcher = new MinecraftLauncherService(auth.getClientId(), settings, tasks);
            this.providers = new ProviderRegistry(launcher.http(), settings);
            this.contentInstaller = new ContentInstallService(launcher, providers, launcher.http());
            this.contentVersions = new ContentVersionService(launcher, providers, launcher.http());
            this.packExporter = new PackExportService(launcher);
            this.modpackInstaller = new ModpackInstallService(
                    launcher, providers, launcher.http(),
                    (CurseForgeProvider) providers.require(ProviderId.CURSEFORGE), settings);
            this.javaInstaller = new JavaInstallService(launcher.javaResolver());
            this.skinStore = new SkinStore();
            this.updates = new LauncherUpdateService(launcher.http(), settings, tasks, LAUNCHER_VERSION);
            this.presence = new DiscordPresenceService(settings);
        } catch (Exception e) {
            throw new IllegalStateException("Failed to initialise launcher services", e);
        }
    }

    public void start() {
        presence.start();
        launcher.setLaunchListener(new PresenceListener());

        app = Javalin.create(config -> {
            // The packaged UI is loaded from file://, whose Origin header is the literal "null",
            // so an origin allow-list cannot express it. Binding to loopback is what actually
            // keeps this API private; CORS only governs which pages a browser lets talk to it.
            config.bundledPlugins.enableCors(cors -> cors.addRule(rule -> rule.anyHost()));

            // Runs before anything is dispatched: the container normalises encoded dot segments
            // out of the path, which can silently turn one endpoint's URL into another's.
            PathGuard.install(config);

            new RouteRegistry(config, true)
                    .module(new AuthRoutes(auth, openUrl))
                    .module(new InstanceRoutes(launcher, auth, settings))
                    .module(new ContentRoutes(launcher, contentVersions))
                    .module(new WorldRoutes(launcher))
                    .module(new LogRoutes(launcher))
                    .module(new BackupRoutes(launcher))
                    .module(new TaskRoutes(tasks))
                    .module(new ProviderRoutes(providers, contentInstaller, modpackInstaller, packExporter))
                    .module(new SettingsRoutes(settings, launcher.javaResolver(), javaInstaller,
                            updates, presence, LAUNCHER_VERSION))
                    .module(new SkinRoutes(skinStore, auth))
                    .module(new WindowRoutes(minimizeWindow, maximizeWindow, closeWindow))
                    .get("/api/health", ctx -> new JSONObject()
                            .put("version", LAUNCHER_VERSION)
                            .put("status", "ok"));
        });

        app.start(BIND_HOST, port);
        System.out.println("[API] VoltLauncher API listening on http://" + BIND_HOST + ":" + port);
    }

    public void stop() {
        launcher.stopAllRunningInstances();
        presence.close();
        if (app != null) app.stop();
    }

    /**
     * Turns launch events into a Discord activity.
     *
     * <p>Lives here rather than in {@code volt-game} because rich presence is a launcher-level
     * integration, and wiring it in the composition root keeps the game module unaware of it.
     */
    private final class PresenceListener implements InstanceLauncher.LaunchListener {

        @Override
        public void onStarted(Instance instance, long startedAt) {
            String version = PlatformRegistry.extractBaseMinecraftVersionId(instance.versionId());
            String pack = packNameOf(instance);
            presence.update(new DiscordPresenceService.Presence(
                    "Playing " + instance.name(),
                    pack.isBlank()
                            ? "Minecraft " + version
                            : pack + " · Minecraft " + version,
                    startedAt,
                    "volt_logo",
                    "VoltLauncher"));
        }

        @Override
        public void onStopped(Instance instance, long sessionMs, boolean crashed) {
            presence.showIdle();
        }

        /** The modpack a profile came from, shown alongside the version when there is one. */
        private String packNameOf(Instance instance) {
            try {
                var pack = launcher.contentManifests().read(instance.slug()).modpack();
                return pack == null ? "" : pack.name();
            } catch (Exception e) {
                return "";
            }
        }
    }
}
