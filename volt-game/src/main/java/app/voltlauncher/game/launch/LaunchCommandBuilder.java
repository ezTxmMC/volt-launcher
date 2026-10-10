package app.voltlauncher.game.launch;

import app.voltlauncher.auth.MinecraftAccountSession;
import app.voltlauncher.core.AppPaths;
import app.voltlauncher.core.config.LauncherSettings;
import app.voltlauncher.core.config.SettingsStore;
import app.voltlauncher.game.install.AssetInstaller;
import app.voltlauncher.game.install.OsRules;
import app.voltlauncher.game.instance.InstanceSettings;
import app.voltlauncher.game.java.JavaRuntimeResolver;
import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

public final class LaunchCommandBuilder {

    private static final int DEFAULT_MAX_MEMORY_MB = 2048;
    private static final int DEFAULT_MIN_MEMORY_MB = 512;
    private static final int DEFAULT_WIDTH = 1280;
    private static final int DEFAULT_HEIGHT = 720;
    private static final String LAUNCHER_NAME = "VoltLauncher";

    private final String launcherClientId;
    private final String launcherVersion;
    private final SettingsStore launcherSettings;

    public LaunchCommandBuilder(String launcherClientId, SettingsStore launcherSettings) {
        this(launcherClientId, defaultVersion(), launcherSettings);
    }

    public LaunchCommandBuilder(String launcherClientId, String launcherVersion, SettingsStore launcherSettings) {
        this.launcherClientId = launcherClientId;
        this.launcherVersion = launcherVersion;
        this.launcherSettings = launcherSettings;
    }

    public List<String> build(MinecraftAccountSession session, AssetInstaller.Installation install,
                              JavaRuntimeResolver.JavaRuntime runtime) {
        return build(session, install, runtime, LaunchOptions.none());
    }

    public List<String> build(MinecraftAccountSession session, AssetInstaller.Installation install,
                              JavaRuntimeResolver.JavaRuntime runtime, LaunchOptions options) {

        LaunchOptions launchOptions = options == null ? LaunchOptions.none() : options;
        InstanceSettings settings = install.instance().settings();
        LauncherSettings global = globalSettings();
        Map<String, String> vars = buildVars(session, install, settings, launchOptions);
        Map<String, Boolean> features = buildFeatures(settings, launchOptions, install.launchMetadata());
        JSONObject meta = install.launchMetadata();
        boolean legacy = !meta.has("arguments") && meta.has("minecraftArguments");

        // Per-profile overrides win; anything the profile leaves unset falls back to the
        // launcher-wide default the user configured under Settings → Java & memory.
        int maxMemoryMb = firstPositive(
                settings.maxMemoryMb(), global == null ? null : global.defaultMaxMemoryMb(), DEFAULT_MAX_MEMORY_MB);
        int minMemoryMb = firstPositive(
                settings.minMemoryMb(), global == null ? null : global.defaultMinMemoryMb(), DEFAULT_MIN_MEMORY_MB);

        List<String> command = new ArrayList<>();
        // A wrapper such as `gamemoderun` or `prime-run` has to sit in front of the java binary,
        // because it execs what follows rather than being read as an argument.
        command.addAll(wrapperPrefix(settings));
        command.add(runtime.javaExecutable().toString());

        // Heap sizing is owned by the launcher, so any -Xmx/-Xms coming from version metadata
        // or the user's extra arguments is dropped in favour of the instance settings.
        command.add("-Xmx" + maxMemoryMb + "M");
        command.add("-Xms" + Math.min(minMemoryMb, maxMemoryMb) + "M");

        if (legacy) {
            command.add("-Djava.library.path=" + install.nativesDirectory().toAbsolutePath());
            command.add("-Dminecraft.launcher.brand=" + LAUNCHER_NAME);
            command.add("-Dminecraft.launcher.version=" + launcherVersion);
            command.add("-cp");
            command.add(install.classpath());
        } else {
            for (String arg : collectArgs(meta, "jvm", features)) {
                if (isHeapArgument(arg)) continue;
                command.add(apply(arg, vars));
            }
        }

        for (String arg : extraJvmArgs(settings, global)) {
            if (isHeapArgument(arg)) continue;
            command.add(apply(arg, vars));
        }

        command.add(install.mainClass());

        List<String> gameArgs = new ArrayList<>();
        for (String arg : collectArgs(meta, "game", features)) {
            gameArgs.add(apply(arg, vars));
        }
        appendExtraGameArgs(gameArgs, settings, launchOptions);
        command.addAll(gameArgs);

        return List.copyOf(command);
    }

    private static boolean isHeapArgument(String arg) {
        return arg.startsWith("-Xmx") || arg.startsWith("-Xms");
    }

    /**
     * Adds the flags the version metadata did not emit itself.
     *
     * <p>Fullscreen has no rule block in any version's metadata, and quick play only exists from
     * 1.20 onwards — so for older builds the multiplayer case falls back to {@code --server} and
     * {@code --port}, which every version since 1.6 understands. Anything the metadata already
     * produced is left alone rather than passed twice.
     */
    private void appendExtraGameArgs(List<String> gameArgs, InstanceSettings settings, LaunchOptions options) {
        if (settings.isFullscreen() && !gameArgs.contains("--fullscreen")) {
            gameArgs.add("--fullscreen");
        }
        if (options.demo() && !gameArgs.contains("--demo")) {
            gameArgs.add("--demo");
        }
        if (!options.hasQuickPlay()) return;

        switch (options.quickPlay()) {
            case SINGLEPLAYER -> {
                if (!gameArgs.contains("--quickPlaySingleplayer")) {
                    gameArgs.add("--quickPlaySingleplayer");
                    gameArgs.add(options.quickPlayTarget());
                }
            }
            case MULTIPLAYER -> {
                if (!gameArgs.contains("--quickPlayMultiplayer") && !gameArgs.contains("--server")) {
                    gameArgs.add("--server");
                    gameArgs.add(options.serverHost());
                    gameArgs.add("--port");
                    gameArgs.add(options.serverPort());
                }
            }
            case REALMS -> {
                if (!gameArgs.contains("--quickPlayRealms")) {
                    gameArgs.add("--quickPlayRealms");
                    gameArgs.add(options.quickPlayTarget());
                }
            }
            case NONE -> { /* nothing to add */ }
        }
    }

    /** Splits a wrapper command into its own argument list; blank means no wrapper. */
    private List<String> wrapperPrefix(InstanceSettings settings) {
        String wrapper = settings.wrapperCommand();
        if (wrapper == null || wrapper.isBlank()) return List.of();
        List<String> parts = new ArrayList<>();
        for (String part : wrapper.trim().split("\\s+")) {
            if (!part.isBlank()) parts.add(part);
        }
        return parts;
    }

    /**
     * Launcher features the version metadata can gate arguments on. Declaring a custom
     * resolution is what makes Mojang's metadata emit {@code --width}/{@code --height}, and the
     * quick-play flags are what make it emit the corresponding {@code --quickPlay*} arguments.
     */
    private Map<String, Boolean> buildFeatures(InstanceSettings settings, LaunchOptions options,
                                               JSONObject meta) {
        boolean customResolution = settings.resolutionWidth() != null && settings.resolutionHeight() != null;
        boolean quickPlaySupported = supportsQuickPlay(meta);
        return Map.of(
                "has_custom_resolution", customResolution,
                "is_demo_user", options.demo(),
                "has_quick_plays_support", quickPlaySupported && options.hasQuickPlay(),
                "is_quick_play_singleplayer",
                quickPlaySupported && options.quickPlay() == LaunchOptions.QuickPlay.SINGLEPLAYER,
                "is_quick_play_multiplayer",
                quickPlaySupported && options.quickPlay() == LaunchOptions.QuickPlay.MULTIPLAYER,
                "is_quick_play_realms",
                quickPlaySupported && options.quickPlay() == LaunchOptions.QuickPlay.REALMS);
    }

    /**
     * Whether this version's metadata knows about quick play at all. Claiming the feature on a
     * version that does not declare it changes nothing — the arguments simply never appear — so
     * this is checked to decide whether the legacy {@code --server} fallback is needed.
     */
    static boolean supportsQuickPlay(JSONObject meta) {
        JSONObject arguments = meta == null ? null : meta.optJSONObject("arguments");
        JSONArray game = arguments == null ? null : arguments.optJSONArray("game");
        if (game == null) return false;
        return game.toString().contains("quickPlay");
    }

    /**
     * The launcher-wide arguments form the baseline and the profile's own arguments are appended,
     * so a profile can add to — or, for a repeated flag, override — the global set. Exact
     * duplicates are collapsed to keep the command line readable.
     */
    private List<String> extraJvmArgs(InstanceSettings settings, LauncherSettings global) {
        Set<String> args = new LinkedHashSet<>();
        if (global != null) splitArgs(global.defaultJvmArgs(), args);
        splitArgs(settings.jvmArgs(), args);
        return new ArrayList<>(args);
    }

    private static void splitArgs(String raw, Set<String> target) {
        if (raw == null || raw.isBlank()) return;
        for (String part : raw.trim().split("\\s+")) {
            if (!part.isBlank()) target.add(part);
        }
    }

    /** Reads the launcher settings, treating an unreadable store as "no configured defaults". */
    private LauncherSettings globalSettings() {
        if (launcherSettings == null) return null;
        try {
            return launcherSettings.get();
        } catch (Exception e) {
            System.err.println("[Launcher] Could not read launcher settings, using built-in defaults: " + e);
            return null;
        }
    }

    private static int firstPositive(Integer override, Integer configured, int fallback) {
        if (override != null && override > 0) return override;
        if (configured != null && configured > 0) return configured;
        return fallback;
    }

    private Map<String, String> buildVars(MinecraftAccountSession session, AssetInstaller.Installation install,
                                          InstanceSettings settings, LaunchOptions options) {
        Map<String, String> vars = new HashMap<>();
        vars.put("auth_player_name", session.username());
        vars.put("version_name", install.launchVersionId());
        vars.put("game_directory", install.instance().gameDirectory().toString());
        vars.put("assets_root", install.assetsDirectory().toString());
        vars.put("assets_index_name", install.assetIndexId());
        vars.put("auth_uuid", session.uuid());
        vars.put("auth_access_token", session.minecraftAccessToken());
        vars.put("auth_session", "token:" + session.minecraftAccessToken() + ":" + session.uuid());
        vars.put("clientid", launcherClientId);
        vars.put("auth_xuid", session.xuid() == null ? "" : session.xuid());
        vars.put("user_type", "msa");
        vars.put("version_type", install.versionType());
        vars.put("user_properties", "{}");
        vars.put("natives_directory", install.nativesDirectory().toString());
        vars.put("launcher_name", LAUNCHER_NAME);
        vars.put("launcher_version", launcherVersion);
        vars.put("classpath", install.classpath());
        vars.put("classpath_separator", File.pathSeparator);
        vars.put("library_directory", install.librariesDirectory().toString());
        vars.put("resolution_width", String.valueOf(
                settings.resolutionWidth() != null ? settings.resolutionWidth() : DEFAULT_WIDTH));
        vars.put("resolution_height", String.valueOf(
                settings.resolutionHeight() != null ? settings.resolutionHeight() : DEFAULT_HEIGHT));
        vars.put("game_assets", install.assetsDirectory().resolve("virtual")
                .resolve(install.assetIndexId()).toString());

        // Quick play: the game writes a log of what it joined to quickPlayPath, and reads the
        // target from whichever of the three placeholders its feature rule enabled.
        vars.put("quickPlayPath", AppPaths.logsDirectory()
                .resolve(install.instance().slug() + "-quickplay.json").toString());
        vars.put("quickPlaySingleplayer",
                options.quickPlay() == LaunchOptions.QuickPlay.SINGLEPLAYER ? options.quickPlayTarget() : "");
        vars.put("quickPlayMultiplayer",
                options.quickPlay() == LaunchOptions.QuickPlay.MULTIPLAYER ? options.quickPlayTarget() : "");
        vars.put("quickPlayRealms",
                options.quickPlay() == LaunchOptions.QuickPlay.REALMS ? options.quickPlayTarget() : "");

        if (install.loggingConfigPath() != null) {
            vars.put("path", install.loggingConfigPath().toString());
        }
        return Map.copyOf(vars);
    }

    private List<String> collectArgs(JSONObject meta, String type, Map<String, Boolean> features) {
        List<String> args = new ArrayList<>();
        if (meta.has("arguments")) {
            JSONArray arr = meta.getJSONObject("arguments").optJSONArray(type);
            if (arr == null) return args;
            for (int i = 0; i < arr.length(); i++) {
                Object entry = arr.get(i);
                if (entry instanceof String value) {
                    args.add(value);
                    continue;
                }
                if (!(entry instanceof JSONObject conditional)) continue;
                if (!OsRules.isAllowedByRules(conditional.optJSONArray("rules"), features)) continue;

                Object value = conditional.opt("value");
                if (value instanceof String single) {
                    args.add(single);
                } else if (value instanceof JSONArray multiple) {
                    for (int j = 0; j < multiple.length(); j++) {
                        args.add(multiple.getString(j));
                    }
                }
            }
            return args;
        }

        if ("game".equals(type)) {
            for (String part : meta.optString("minecraftArguments", "").split(" ")) {
                if (!part.isBlank()) args.add(part.trim());
            }
        }
        return args;
    }

    /** Substitutes {@code ${placeholder}} tokens in a single pass so values cannot re-expand. */
    private String apply(String input, Map<String, String> vars) {
        if (input.indexOf('$') < 0) return input;

        StringBuilder out = new StringBuilder(input.length());
        int index = 0;
        while (index < input.length()) {
            int start = input.indexOf("${", index);
            if (start < 0) {
                out.append(input, index, input.length());
                break;
            }
            int end = input.indexOf('}', start + 2);
            if (end < 0) {
                out.append(input, index, input.length());
                break;
            }
            out.append(input, index, start);
            String key = input.substring(start + 2, end);
            String replacement = vars.get(key);
            out.append(replacement != null ? replacement : input.substring(start, end + 1));
            index = end + 1;
        }
        return out.toString();
    }

    private static String defaultVersion() {
        String implementation = LaunchCommandBuilder.class.getPackage().getImplementationVersion();
        return implementation != null ? implementation : "0.2.0";
    }
}
