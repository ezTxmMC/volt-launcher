package app.voltlauncher.core.discord;

import app.voltlauncher.core.config.LauncherSettings;
import app.voltlauncher.core.config.SettingsStore;
import org.json.JSONObject;

import java.io.IOException;
import java.util.Locale;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

/**
 * Keeps Discord showing what the user is doing.
 *
 * <p>Discord may be started, stopped or restarted at any point during a session, so the connection
 * is treated as unreliable by design: the wanted presence is held here and re-sent whenever a
 * connection comes back, instead of failing the caller when Discord happens to be closed.
 */
public final class DiscordPresenceService implements AutoCloseable {

    /** How often a lost or never-established connection is retried. */
    private static final long RECONNECT_SECONDS = 20;

    public enum Status { DISABLED, NOT_CONFIGURED, WAITING_FOR_DISCORD, CONNECTED }

    /**
     * @param startedAt epoch milliseconds the activity began, or 0 for no elapsed-time counter
     */
    public record Presence(String details, String state, long startedAt,
                           String largeImageKey, String largeImageText) {

        public static Presence idle() {
            return new Presence("In the launcher", "Browsing profiles", 0L, "volt_logo", "VoltLauncher");
        }
    }

    private final SettingsStore settings;
    private final AtomicReference<Presence> wanted = new AtomicReference<>(Presence.idle());
    private final AtomicReference<Status> status = new AtomicReference<>(Status.DISABLED);

    private ScheduledExecutorService scheduler;
    private volatile DiscordIpcClient client;
    private volatile String connectedApplicationId = "";
    private volatile boolean started;

    public DiscordPresenceService(SettingsStore settings) {
        this.settings = settings;
    }

    public synchronized void start() {
        if (started) return;
        started = true;
        scheduler = Executors.newSingleThreadScheduledExecutor(runnable -> {
            Thread thread = new Thread(runnable, "discord-presence");
            thread.setDaemon(true);
            return thread;
        });
        scheduler.scheduleWithFixedDelay(this::tick, 0, RECONNECT_SECONDS, TimeUnit.SECONDS);
    }

    /** Records what should be shown and pushes it immediately when a connection exists. */
    public void update(Presence presence) {
        wanted.set(presence == null ? Presence.idle() : presence);
        push();
    }

    public void showIdle() {
        update(Presence.idle());
    }

    public Status status() {
        return status.get();
    }

    /** A short explanation of the current status, for the settings screen. */
    public String statusMessage() {
        return switch (status.get()) {
            case DISABLED -> "Rich presence is switched off.";
            case NOT_CONFIGURED -> "No Discord application id configured.";
            case WAITING_FOR_DISCORD -> "Waiting for the Discord desktop client.";
            case CONNECTED -> "Connected to Discord.";
        };
    }

    @Override
    public synchronized void close() {
        started = false;
        if (scheduler != null) {
            scheduler.shutdownNow();
            scheduler = null;
        }
        disconnect();
        status.set(Status.DISABLED);
    }

    // ── internals ─────────────────────────────────────────────────────────────

    /** Reconnects, disconnects or re-pings depending on what the settings now say. */
    private void tick() {
        try {
            LauncherSettings current = settings.get();
            if (!current.discordPresence()) {
                disconnect();
                status.set(Status.DISABLED);
                return;
            }
            String applicationId = current.discordApplicationId();
            if (applicationId.isBlank()) {
                disconnect();
                status.set(Status.NOT_CONFIGURED);
                return;
            }
            // Changing the id mid-session has to rebuild the connection: Discord binds the
            // application to the handshake, not to individual updates.
            if (client != null && !applicationId.equals(connectedApplicationId)) {
                disconnect();
            }
            if (client == null) {
                DiscordIpcClient connected = DiscordIpcClient.connect(applicationId);
                if (connected == null) {
                    status.set(Status.WAITING_FOR_DISCORD);
                    return;
                }
                client = connected;
                connectedApplicationId = applicationId;
                status.set(Status.CONNECTED);
                push();
                return;
            }
            client.ping();
            push();
        } catch (Exception e) {
            disconnect();
            status.set(Status.WAITING_FOR_DISCORD);
        }
    }

    private void push() {
        DiscordIpcClient active = client;
        if (active == null) return;
        try {
            active.setActivity(toActivity(wanted.get()));
        } catch (IOException e) {
            // Discord went away between the check and the write; the next tick reconnects.
            disconnect();
            status.set(Status.WAITING_FOR_DISCORD);
        }
    }

    private synchronized void disconnect() {
        DiscordIpcClient active = client;
        client = null;
        connectedApplicationId = "";
        if (active != null) active.close();
    }

    private JSONObject toActivity(Presence presence) {
        JSONObject activity = new JSONObject()
                .put("details", trim(presence.details(), 128))
                .put("state", trim(presence.state(), 128));

        if (presence.startedAt() > 0) {
            activity.put("timestamps", new JSONObject().put("start", presence.startedAt()));
        }
        JSONObject assets = new JSONObject();
        if (notBlank(presence.largeImageKey())) assets.put("large_image", presence.largeImageKey());
        if (notBlank(presence.largeImageText())) assets.put("large_text", trim(presence.largeImageText(), 128));
        if (!assets.isEmpty()) activity.put("assets", assets);
        return activity;
    }

    private static boolean notBlank(String value) {
        return value != null && !value.isBlank();
    }

    /** Discord rejects strings past its limits outright, so they are cut rather than sent whole. */
    private static String trim(String value, int max) {
        String text = value == null ? "" : value.trim();
        if (text.length() <= max) return text;
        return text.substring(0, max - 1) + "…";
    }

    /** Exposed for diagnostics: which transport this platform would use. */
    public static String transportName() {
        return System.getProperty("os.name", "").toLowerCase(Locale.ROOT).contains("win")
                ? "named pipe" : "unix socket";
    }
}
