package app.voltlauncher.game.instance;

import org.json.JSONObject;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Per-instance launch overrides. Any {@code null} field means "use the launcher default".
 *
 * @param envVars            extra environment variables for the game process
 * @param preLaunchCommand   shell command run before the game starts; a non-zero exit aborts the launch
 * @param postExitCommand    shell command run after the game exits
 * @param wrapperCommand     command the java invocation is passed to, e.g. {@code gamemoderun}
 * @param gameDirectory      absolute path to run the game in instead of the managed directory
 * @param hideLauncher       per-profile override of the launcher-wide "hide on launch" preference
 */
public record InstanceSettings(
        Integer maxMemoryMb,
        Integer minMemoryMb,
        String jvmArgs,
        Integer resolutionWidth,
        Integer resolutionHeight,
        Boolean fullscreen,
        String javaPath,
        Map<String, String> envVars,
        String preLaunchCommand,
        String postExitCommand,
        String wrapperCommand,
        String gameDirectory,
        Boolean hideLauncher) {

    public InstanceSettings {
        envVars = envVars == null ? Map.of() : Map.copyOf(envVars);
    }

    public static InstanceSettings defaults() {
        return new InstanceSettings(null, null, null, null, null, null, null,
                Map.of(), null, null, null, null, null);
    }

    public static InstanceSettings fromJson(JSONObject json) {
        if (json == null) return defaults();
        return new InstanceSettings(
                optInt(json, "maxMemoryMb"),
                optInt(json, "minMemoryMb"),
                optText(json, "jvmArgs"),
                optInt(json, "resolutionWidth"),
                optInt(json, "resolutionHeight"),
                optBool(json, "fullscreen"),
                optText(json, "javaPath"),
                readEnvVars(json.optJSONObject("envVars")),
                optText(json, "preLaunchCommand"),
                optText(json, "postExitCommand"),
                optText(json, "wrapperCommand"),
                optText(json, "gameDirectory"),
                optBool(json, "hideLauncher"));
    }

    public JSONObject toJson() {
        JSONObject json = new JSONObject();
        json.put("maxMemoryMb", maxMemoryMb == null ? JSONObject.NULL : maxMemoryMb);
        json.put("minMemoryMb", minMemoryMb == null ? JSONObject.NULL : minMemoryMb);
        json.put("jvmArgs", jvmArgs == null ? JSONObject.NULL : jvmArgs);
        json.put("resolutionWidth", resolutionWidth == null ? JSONObject.NULL : resolutionWidth);
        json.put("resolutionHeight", resolutionHeight == null ? JSONObject.NULL : resolutionHeight);
        json.put("fullscreen", fullscreen == null ? JSONObject.NULL : fullscreen);
        json.put("javaPath", javaPath == null ? JSONObject.NULL : javaPath);
        json.put("envVars", new JSONObject(envVars));
        json.put("preLaunchCommand", preLaunchCommand == null ? JSONObject.NULL : preLaunchCommand);
        json.put("postExitCommand", postExitCommand == null ? JSONObject.NULL : postExitCommand);
        json.put("wrapperCommand", wrapperCommand == null ? JSONObject.NULL : wrapperCommand);
        json.put("gameDirectory", gameDirectory == null ? JSONObject.NULL : gameDirectory);
        json.put("hideLauncher", hideLauncher == null ? JSONObject.NULL : hideLauncher);
        return json;
    }

    public boolean hasCustomMemory() {
        return maxMemoryMb != null || minMemoryMb != null;
    }

    public boolean hasJavaOverride() {
        return javaPath != null && !javaPath.isBlank();
    }

    public boolean isFullscreen() {
        return Boolean.TRUE.equals(fullscreen);
    }

    // ── json helpers ──────────────────────────────────────────────────────────

    private static Integer optInt(JSONObject json, String key) {
        return json.has(key) && !json.isNull(key) ? json.optInt(key) : null;
    }

    private static Boolean optBool(JSONObject json, String key) {
        return json.has(key) && !json.isNull(key) ? json.optBoolean(key) : null;
    }

    private static String optText(JSONObject json, String key) {
        if (!json.has(key) || json.isNull(key)) return null;
        String value = json.optString(key, "");
        return value.isBlank() ? null : value;
    }

    /** Only string values are kept: an environment variable has no other representation. */
    private static Map<String, String> readEnvVars(JSONObject json) {
        if (json == null) return Map.of();
        Map<String, String> values = new LinkedHashMap<>();
        for (String key : json.keySet()) {
            if (key == null || key.isBlank() || json.isNull(key)) continue;
            values.put(key.trim(), String.valueOf(json.get(key)));
        }
        return values;
    }
}
