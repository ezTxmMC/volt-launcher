package app.voltlauncher.game.launch;

import app.voltlauncher.auth.MinecraftAccountSession;
import app.voltlauncher.core.AppPaths;
import app.voltlauncher.core.config.SettingsStore;
import app.voltlauncher.core.util.async.NamedLock;
import app.voltlauncher.core.util.async.ProcessRegistry;
import app.voltlauncher.game.install.AssetInstaller;
import app.voltlauncher.game.instance.Instance;
import app.voltlauncher.game.instance.InstanceManager;
import app.voltlauncher.game.instance.InstanceSettings;
import app.voltlauncher.game.instance.LaunchResult;
import app.voltlauncher.game.instance.RunningInstanceStatus;
import app.voltlauncher.game.java.JavaRuntimeResolver;
import app.voltlauncher.game.platform.IPlatform;
import app.voltlauncher.game.platform.PlatformRegistry;
import org.json.JSONObject;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import java.time.Duration;
import java.time.ZonedDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.TimeUnit;

public final class InstanceLauncher {

    /** A game that dies sooner than this almost certainly crashed rather than being quit. */
    private static final long EARLY_CRASH_THRESHOLD_MS = 10_000L;
    private static final long STOP_GRACE_SECONDS = 5;
    /** A pre-launch hook that has not finished by then is treated as stuck rather than waited on. */
    private static final long HOOK_TIMEOUT_SECONDS = 120;

    /** Told when a game starts and stops, so rich presence and the UI can follow along. */
    public interface LaunchListener {
        void onStarted(Instance instance, long startedAt);

        void onStopped(Instance instance, long sessionMs, boolean crashed);
    }

    private final InstanceManager instanceManager;
    private final PlatformRegistry platformRegistry;
    private final IPlatform defaultPlatform;
    private final AssetInstaller assetInstaller;
    private final LaunchCommandBuilder commandBuilder;
    private final JavaRuntimeResolver javaResolver;
    private final SettingsStore launcherSettings;
    private final ProcessRegistry processRegistry;
    private final NamedLock launchLock = new NamedLock();
    private final ConcurrentHashMap<String, RunningInstance> runningMeta = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<String, LaunchState> launchStates = new ConcurrentHashMap<>();
    private volatile LaunchListener listener;

    public InstanceLauncher(
            InstanceManager instanceManager,
            PlatformRegistry platformRegistry,
            IPlatform defaultPlatform,
            AssetInstaller assetInstaller,
            LaunchCommandBuilder commandBuilder,
            JavaRuntimeResolver javaResolver,
            SettingsStore launcherSettings) {
        this.instanceManager = instanceManager;
        this.platformRegistry = platformRegistry;
        this.defaultPlatform = defaultPlatform;
        this.assetInstaller = assetInstaller;
        this.commandBuilder = commandBuilder;
        this.javaResolver = javaResolver;
        this.launcherSettings = launcherSettings;
        this.processRegistry = new ProcessRegistry((key, unused) -> onProcessExit(key));
    }

    public void setListener(LaunchListener listener) {
        this.listener = listener;
    }

    /** Starts the launch pipeline and returns immediately; progress is polled via {@link #getLaunchState}. */
    public void launchAsync(MinecraftAccountSession session, String instanceName) {
        launchAsync(session, instanceName, LaunchOptions.none());
    }

    public void launchAsync(MinecraftAccountSession session, String instanceName, LaunchOptions options) {
        String key = instanceKey(instanceName);
        LaunchState current = launchStates.get(key);
        if (current != null && current.phase() == LaunchPhase.INSTALLING) return;
        if (processRegistry.isAlive(key)) return;

        LaunchOptions launchOptions = options == null ? LaunchOptions.none() : options;
        launchStates.put(key, new LaunchState(LaunchPhase.INSTALLING, "Preparing installation…", null));

        Thread.ofVirtual().name("launch-" + key).start(() -> {
            try {
                launchLock.withLock(key, () -> doLaunch(session, instanceName, key, launchOptions));
            } catch (Exception e) {
                String message = e.getMessage() != null ? e.getMessage() : e.getClass().getSimpleName();
                launchStates.put(key, new LaunchState(LaunchPhase.FAILED, message, null));
                System.err.println("[Launcher] Launch of '" + instanceName + "' failed: " + message);
            }
        });
    }

    public LaunchState getLaunchState(String instanceName) {
        return launchStates.getOrDefault(instanceKey(instanceName), new LaunchState(LaunchPhase.IDLE, null, null));
    }

    public boolean stopInstance(String instanceName) throws Exception {
        String key = instanceKey(instanceName);
        return launchLock.withLock(key, () -> {
            ProcessHandle handle = processRegistry.get(key);
            if (handle == null) throw new IllegalStateException("This instance is not running");

            handle.destroy();
            awaitExit(handle, STOP_GRACE_SECONDS);
            if (handle.isAlive()) {
                handle.destroyForcibly();
                awaitExit(handle, STOP_GRACE_SECONDS);
            }
            // The exit callback normally does the bookkeeping, but a forcibly killed process can
            // be reaped before it fires, so the session is settled here as well. Both paths are
            // idempotent because the metadata is removed atomically.
            settleSession(key);
            processRegistry.remove(key);
            launchStates.remove(key);
            return !handle.isAlive();
        });
    }

    public void stopAll() {
        for (String key : processRegistry.liveKeys()) {
            RunningInstance running = runningMeta.get(key);
            if (running == null) continue;
            try {
                stopInstance(running.instance().name());
            } catch (Exception ignored) {
                // Shutdown path: a process that refuses to die must not block the others.
            }
        }
    }

    public boolean isRunning(String instanceName) {
        return processRegistry.isAlive(instanceKey(instanceName));
    }

    public RunningInstanceStatus getRunningStatus(String instanceName) {
        String key = instanceKey(instanceName);
        RunningInstance running = runningMeta.get(key);
        if (running == null || !processRegistry.isAlive(key)) return null;
        return toStatus(running);
    }

    public List<RunningInstanceStatus> listRunning() {
        List<RunningInstanceStatus> result = new ArrayList<>();
        for (String key : processRegistry.liveKeys()) {
            RunningInstance running = runningMeta.get(key);
            if (running != null) result.add(toStatus(running));
        }
        result.sort(Comparator.comparing(RunningInstanceStatus::instanceName, String.CASE_INSENSITIVE_ORDER));
        return result;
    }

    public void clearState(String instanceName) {
        String key = instanceKey(instanceName);
        launchStates.remove(key);
        runningMeta.remove(key);
    }

    // ── internals ─────────────────────────────────────────────────────────────

    private Void doLaunch(MinecraftAccountSession session, String instanceName, String key,
                          LaunchOptions options) throws Exception {
        Instance instance = instanceManager.findByName(instanceName);
        IPlatform platform = platformRegistry.resolvePlatformForVersion(instance.versionId(), defaultPlatform);
        JSONObject meta = platform.versionResolver().resolveMetadata(instance.versionId());

        launchStates.put(key, new LaunchState(LaunchPhase.INSTALLING, "Installing game files…", null));
        AssetInstaller.Installation install = assetInstaller.ensureInstallation(instance, meta);

        launchStates.put(key, new LaunchState(LaunchPhase.LAUNCHING, "Starting Minecraft…", null));
        InstanceManager.RequiredJava required = instanceManager.resolveRequiredJava(meta, install.launchVersionId());
        JavaRuntimeResolver.JavaRuntime runtime = resolveRuntimeFor(instance, required.majorVersion());
        List<String> command = commandBuilder.build(session, install, runtime, options);

        Path logFile = AppPaths.instanceLogPath(instance.slug());
        Files.createDirectories(logFile.getParent());
        Files.createDirectories(instance.gameDirectory());

        runPreLaunchHook(instance, key);
        appendSessionHeader(logFile, instance, command);

        ProcessBuilder builder = new ProcessBuilder(command);
        builder.directory(instance.gameDirectory().toFile());
        builder.redirectErrorStream(true);
        builder.redirectOutput(ProcessBuilder.Redirect.appendTo(logFile.toFile()));
        applyEnvironment(builder, instance.settings());

        ProcessHandle handle = builder.start().toHandle();
        long startedAt = System.currentTimeMillis();
        processRegistry.register(key, handle);
        runningMeta.put(key, new RunningInstance(instance, handle, startedAt, runtime));
        instanceManager.markPlayed(instance, startedAt);

        LaunchListener current = listener;
        if (current != null) {
            try {
                current.onStarted(instance, startedAt);
            } catch (Exception e) {
                System.err.println("[Launcher] Launch listener failed: " + e);
            }
        }

        LaunchResult result = new LaunchResult(
                instance.name(), install.launchVersionId(), handle.pid(),
                String.join(" ", command), logFile.toString(),
                runtime.majorVersion(), runtime.javaExecutable().toString());

        launchStates.put(key, new LaunchState(LaunchPhase.RUNNING, "Running", result));
        return null;
    }

    /**
     * Runs the profile's pre-launch command and refuses the launch if it fails.
     *
     * <p>A hook exists to prepare something the game needs — mounting a drive, syncing a world,
     * starting a proxy. Launching anyway after it failed would produce a confusing in-game error
     * instead of the real one, so a non-zero exit stops the launch here.
     */
    private void runPreLaunchHook(Instance instance, String key) throws Exception {
        String command = instance.settings().preLaunchCommand();
        if (command == null || command.isBlank()) return;

        launchStates.put(key, new LaunchState(LaunchPhase.LAUNCHING, "Running the pre-launch command…", null));
        int exitCode = runHook(instance, command, "pre-launch");
        if (exitCode != 0) {
            throw new IllegalStateException(
                    "The pre-launch command failed with exit code " + exitCode + ". The game was not started.");
        }
    }

    private void runPostExitHook(Instance instance) {
        String command = instance.settings().postExitCommand();
        if (command == null || command.isBlank()) return;
        try {
            runHook(instance, command, "post-exit");
        } catch (Exception e) {
            // The game has already exited; a failing cleanup hook is worth a log line, no more.
            System.err.println("[Launcher] The post-exit command for '" + instance.name() + "' failed: " + e);
        }
    }

    /** Runs a hook through the platform shell, in the game directory, with the profile's env. */
    private int runHook(Instance instance, String command, String label) throws Exception {
        List<String> shell = isWindows()
                ? List.of("cmd", "/c", command)
                : List.of("/bin/sh", "-c", command);

        ProcessBuilder builder = new ProcessBuilder(shell);
        builder.directory(instance.gameDirectory().toFile());
        builder.redirectErrorStream(true);
        builder.redirectOutput(ProcessBuilder.Redirect.appendTo(
                AppPaths.instanceLogPath(instance.slug()).toFile()));
        applyEnvironment(builder, instance.settings());

        Process process = builder.start();
        if (!process.waitFor(HOOK_TIMEOUT_SECONDS, TimeUnit.SECONDS)) {
            process.destroyForcibly();
            throw new IllegalStateException(
                    "The " + label + " command did not finish within "
                            + Duration.ofSeconds(HOOK_TIMEOUT_SECONDS).toMinutes() + " minutes.");
        }
        return process.exitValue();
    }

    /** Adds the profile's environment variables on top of the launcher's own environment. */
    private void applyEnvironment(ProcessBuilder builder, InstanceSettings settings) {
        Map<String, String> extra = settings.envVars();
        if (extra.isEmpty()) return;
        Map<String, String> environment = builder.environment();
        for (Map.Entry<String, String> entry : extra.entrySet()) {
            if (entry.getKey() == null || entry.getKey().isBlank()) continue;
            environment.put(entry.getKey(), entry.getValue() == null ? "" : entry.getValue());
        }
    }

    /**
     * Marks where one session's output begins. The log is appended to across launches so a crash
     * can still be read after a restart, which makes an unmarked file impossible to navigate.
     */
    private void appendSessionHeader(Path logFile, Instance instance, List<String> command) {
        String header = System.lineSeparator()
                + "──────────────────────────────────────────────────────────────" + System.lineSeparator()
                + "[VoltLauncher] " + ZonedDateTime.now().format(DateTimeFormatter.ISO_OFFSET_DATE_TIME)
                + " — launching " + instance.name() + " (" + instance.versionId() + ")" + System.lineSeparator()
                + "[VoltLauncher] " + String.join(" ", command) + System.lineSeparator()
                + "──────────────────────────────────────────────────────────────" + System.lineSeparator();
        try {
            Files.writeString(logFile, header, StandardCharsets.UTF_8,
                    StandardOpenOption.CREATE, StandardOpenOption.APPEND);
        } catch (IOException e) {
            System.err.println("[Launcher] Could not write the log header: " + e.getMessage());
        }
    }

    /**
     * Java is picked in order of how specific the choice is: the profile's own override first, then
     * the path the user pinned for this major version under Settings → Java & memory, and only then
     * auto-detection.
     */
    private JavaRuntimeResolver.JavaRuntime resolveRuntimeFor(Instance instance, int requiredMajor) throws Exception {
        String override = instance.settings().javaPath();
        String source = "user-override";
        if (isBlank(override)) {
            override = configuredJavaPath(requiredMajor);
            source = "settings-override";
        }
        if (isBlank(override)) {
            return javaResolver.resolveRuntime(requiredMajor);
        }

        Path candidate = Path.of(override.trim());
        if (Files.isDirectory(candidate)) {
            candidate = candidate.resolve("bin").resolve(isWindows() ? "java.exe" : "java");
        }
        if (!Files.isExecutable(candidate)) {
            throw new IllegalStateException("Configured Java path is not executable: " + override);
        }
        return new JavaRuntimeResolver.JavaRuntime(requiredMajor, candidate.toAbsolutePath().normalize(), source);
    }

    /** The launcher-wide Java path pinned for a major version, or {@code null} to auto-detect. */
    private String configuredJavaPath(int requiredMajor) {
        if (launcherSettings == null) return null;
        try {
            return launcherSettings.get().javaPathFor(requiredMajor);
        } catch (Exception e) {
            System.err.println("[Launcher] Could not read the configured Java runtimes: " + e);
            return null;
        }
    }

    private static boolean isBlank(String value) {
        return value == null || value.isBlank();
    }

    private static boolean isWindows() {
        return System.getProperty("os.name", "").toLowerCase(Locale.ROOT).contains("win");
    }

    private void onProcessExit(String key) {
        LaunchState previous = launchStates.get(key);
        boolean crashedEarly = settleSession(key);

        if (previous == null || previous.result() == null || previous.phase() != LaunchPhase.RUNNING) return;
        String message = crashedEarly
                ? "Minecraft closed right after starting. Check the log: " + previous.result().logFile()
                : "Minecraft closed";
        launchStates.put(key, new LaunchState(
                crashedEarly ? LaunchPhase.FAILED : LaunchPhase.IDLE, message, previous.result()));
    }

    /**
     * Records playtime, runs the post-exit hook and notifies the listener — exactly once per
     * session, because the metadata is removed atomically by whichever path gets there first.
     *
     * <p>The hook runs on its own thread: this is reached both from the process-exit callback and
     * from a stop request, and neither can afford to block for however long a user's cleanup
     * command takes.
     *
     * @return whether the session was short enough to count as an early crash
     */
    private boolean settleSession(String key) {
        RunningInstance ended = runningMeta.remove(key);
        if (ended == null) return false;

        long sessionMs = Math.max(0L, System.currentTimeMillis() - ended.startedAt());
        boolean crashedEarly = sessionMs < EARLY_CRASH_THRESHOLD_MS;

        try {
            instanceManager.recordSession(ended.instance().name(), sessionMs);
        } catch (Exception e) {
            System.err.println("[Launcher] Could not record playtime: " + e.getMessage());
        }

        LaunchListener current = listener;
        if (current != null) {
            try {
                current.onStopped(ended.instance(), sessionMs, crashedEarly);
            } catch (Exception e) {
                System.err.println("[Launcher] Launch listener failed: " + e);
            }
        }

        if (ended.instance().settings().postExitCommand() != null) {
            Thread.ofVirtual().name("post-exit-" + ended.instance().slug())
                    .start(() -> runPostExitHook(ended.instance()));
        }
        return crashedEarly;
    }

    private RunningInstanceStatus toStatus(RunningInstance running) {
        return new RunningInstanceStatus(
                running.instance().name(), running.instance().versionId(), running.handle().pid(),
                running.startedAt(), running.handle().isAlive(),
                running.runtime().majorVersion(), running.runtime().javaExecutable().toString());
    }

    private void awaitExit(ProcessHandle handle, long timeoutSeconds) {
        try {
            handle.onExit().get(timeoutSeconds, TimeUnit.SECONDS);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        } catch (Exception ignored) {
            // Timed out or already reaped — the caller re-checks isAlive().
        }
    }

    private String instanceKey(String name) {
        return name.toLowerCase(Locale.ROOT);
    }

    public enum LaunchPhase { IDLE, INSTALLING, LAUNCHING, RUNNING, FAILED }

    public record LaunchState(LaunchPhase phase, String message, LaunchResult result) {}

    private record RunningInstance(
            Instance instance, ProcessHandle handle, long startedAt, JavaRuntimeResolver.JavaRuntime runtime) {}
}
