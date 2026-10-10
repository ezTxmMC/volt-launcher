package app.voltlauncher.game.launch;

import org.json.JSONObject;

import java.util.Locale;

/**
 * What one particular launch should do differently from the profile's stored settings.
 *
 * <p>Quick play lets the game skip its menus and go straight into a world or onto a server, which
 * is how "join this server" and "open this world" work from the launcher. Minecraft 1.20 and newer
 * accept it natively; older builds only support the multiplayer half, through {@code --server}.
 *
 * @param quickPlayTarget the world folder, {@code host[:port]} or realm id, depending on the kind
 */
public record LaunchOptions(QuickPlay quickPlay, String quickPlayTarget, boolean demo, boolean offline) {

    public enum QuickPlay {
        NONE, SINGLEPLAYER, MULTIPLAYER, REALMS;

        public static QuickPlay fromId(String value) {
            if (value == null || value.isBlank()) return NONE;
            return switch (value.trim().toLowerCase(Locale.ROOT)) {
                case "singleplayer", "world" -> SINGLEPLAYER;
                case "multiplayer", "server" -> MULTIPLAYER;
                case "realms", "realm" -> REALMS;
                case "none", "" -> NONE;
                default -> throw new IllegalArgumentException("Unknown quick play kind: " + value);
            };
        }
    }

    public LaunchOptions {
        quickPlay = quickPlay == null ? QuickPlay.NONE : quickPlay;
        quickPlayTarget = quickPlayTarget == null ? "" : quickPlayTarget.trim();
        if (quickPlay != QuickPlay.NONE && quickPlayTarget.isEmpty()) {
            throw new IllegalArgumentException("Quick play needs a target");
        }
    }

    public static LaunchOptions none() {
        return new LaunchOptions(QuickPlay.NONE, "", false, false);
    }

    public static LaunchOptions fromJson(JSONObject json) {
        if (json == null) return none();
        return new LaunchOptions(
                QuickPlay.fromId(json.optString("quickPlay", "")),
                json.optString("quickPlayTarget", ""),
                json.optBoolean("demo", false),
                json.optBoolean("offline", false));
    }

    public boolean hasQuickPlay() {
        return quickPlay != QuickPlay.NONE;
    }

    /** The host part of a {@code host:port} target, for the legacy {@code --server} fallback. */
    public String serverHost() {
        int colon = quickPlayTarget.lastIndexOf(':');
        return colon > 0 ? quickPlayTarget.substring(0, colon) : quickPlayTarget;
    }

    /** The port of a {@code host:port} target, or the Minecraft default when none was given. */
    public String serverPort() {
        int colon = quickPlayTarget.lastIndexOf(':');
        if (colon <= 0 || colon == quickPlayTarget.length() - 1) return "25565";
        String port = quickPlayTarget.substring(colon + 1);
        return port.chars().allMatch(Character::isDigit) ? port : "25565";
    }
}
