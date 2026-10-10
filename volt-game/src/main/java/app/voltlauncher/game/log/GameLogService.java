package app.voltlauncher.game.log;

import app.voltlauncher.core.AppPaths;
import app.voltlauncher.game.instance.Instance;
import app.voltlauncher.game.instance.InstanceManager;
import org.json.JSONObject;

import java.io.IOException;
import java.io.InputStream;
import java.nio.channels.SeekableByteChannel;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.stream.Stream;
import java.util.zip.GZIPInputStream;

/**
 * Reads everything a crashed profile leaves behind: the console output the launcher captured, the
 * game's own {@code logs/} directory and its crash reports.
 *
 * <p>The console log is served incrementally — the caller passes back the offset it stopped at —
 * so a live console can follow a running game without re-sending megabytes on every poll, and a
 * log that has grown to hundreds of megabytes never has to be held in memory at once.
 */
public final class GameLogService {

    /** Largest slice returned in one read, so a huge log cannot exhaust the API's heap. */
    public static final int MAX_CHUNK_BYTES = 512 * 1024;
    private static final int DEFAULT_TAIL_BYTES = 128 * 1024;
    /** A compressed log is decompressed whole, so its expanded size is capped harder. */
    private static final int MAX_COMPRESSED_BYTES = 4 * 1024 * 1024;

    public static final String LAUNCHER_LOG_ID = "launcher";

    private final InstanceManager instanceManager;

    public GameLogService(InstanceManager instanceManager) {
        this.instanceManager = instanceManager;
    }

    /**
     * @param kind one of {@code launcher}, {@code game} or {@code crash}, so the UI can group them
     * @param live true for the file a running game is still writing to
     */
    public record LogSource(String id, String label, String kind, long sizeBytes, long modifiedAt,
                            boolean live, boolean compressed) {

        public JSONObject toJson() {
            return new JSONObject()
                    .put("id", id)
                    .put("label", label)
                    .put("kind", kind)
                    .put("sizeBytes", sizeBytes)
                    .put("modifiedAt", modifiedAt)
                    .put("live", live)
                    .put("compressed", compressed);
        }
    }

    /**
     * @param nextOffset where a follow-up read should continue from
     * @param truncated  true when the slice starts partway into the file
     */
    public record LogChunk(String id, long offset, long nextOffset, long size, String text, boolean truncated) {

        public JSONObject toJson() {
            return new JSONObject()
                    .put("id", id)
                    .put("offset", offset)
                    .put("nextOffset", nextOffset)
                    .put("size", size)
                    .put("text", text)
                    .put("truncated", truncated);
        }
    }

    /** Every log the profile has, newest first within each group. */
    public List<LogSource> list(String instanceName) throws Exception {
        Instance instance = instanceManager.findByName(instanceName);
        List<LogSource> sources = new ArrayList<>();

        Path launcherLog = AppPaths.instanceLogPath(instance.slug());
        if (Files.isRegularFile(launcherLog)) {
            sources.add(new LogSource(LAUNCHER_LOG_ID, "Launcher console", "launcher",
                    sizeOf(launcherLog), modifiedAt(launcherLog), true, false));
        }

        collect(sources, instance.gameDirectory().resolve("logs"), "game",
                name -> name.endsWith(".log") || name.endsWith(".log.gz"));
        collect(sources, instance.gameDirectory().resolve("crash-reports"), "crash",
                name -> name.endsWith(".txt") || name.endsWith(".log"));

        return sources;
    }

    /** The newest crash report, which is what a failed launch should point the user at. */
    public LogSource latestCrashReport(String instanceName) throws Exception {
        return list(instanceName).stream()
                .filter(source -> "crash".equals(source.kind()))
                .max(Comparator.comparingLong(LogSource::modifiedAt))
                .orElse(null);
    }

    /**
     * Reads a slice of a log.
     *
     * @param offset byte offset to continue from; a negative value means "the tail of the file"
     */
    public LogChunk read(String instanceName, String sourceId, long offset, int maxBytes) throws Exception {
        Path file = resolve(instanceName, sourceId);
        int limit = maxBytes <= 0 ? DEFAULT_TAIL_BYTES : Math.min(maxBytes, MAX_CHUNK_BYTES);

        if (isCompressed(file)) {
            // Rotated logs never change, so they are handed back whole rather than followed.
            String text = readCompressed(file);
            return new LogChunk(sourceId, 0L, text.length(), text.length(), text, false);
        }

        long size = sizeOf(file);
        long start = offset;
        boolean truncated = false;
        if (start < 0) {
            start = Math.max(0L, size - limit);
            truncated = start > 0;
        } else if (start > size) {
            // The file was replaced or cleared while the caller was following it.
            start = 0L;
            truncated = size > limit;
            if (truncated) start = size - limit;
        }

        int length = (int) Math.min(limit, Math.max(0L, size - start));
        byte[] bytes = new byte[length];
        if (length > 0) {
            try (SeekableByteChannel channel = Files.newByteChannel(file, StandardOpenOption.READ)) {
                channel.position(start);
                ByteBuffer buffer = ByteBuffer.wrap(bytes);
                while (buffer.hasRemaining() && channel.read(buffer) > 0) {
                    // Reading until the slice is full or the file ends.
                }
            }
        }
        return new LogChunk(sourceId, start, start + length, size,
                new String(bytes, StandardCharsets.UTF_8), truncated);
    }

    /** Empties the launcher's own console log; the game's files are left to the game. */
    public void clear(String instanceName, String sourceId) throws Exception {
        if (!LAUNCHER_LOG_ID.equals(sourceId)) {
            throw new IllegalArgumentException("Only the launcher console log can be cleared");
        }
        Path file = resolve(instanceName, sourceId);
        Files.writeString(file, "", StandardCharsets.UTF_8,
                StandardOpenOption.CREATE, StandardOpenOption.TRUNCATE_EXISTING);
    }

    /** Resolves a log id to a file, refusing anything outside the profile's own directories. */
    public Path resolve(String instanceName, String sourceId) throws Exception {
        Instance instance = instanceManager.findByName(instanceName);
        if (sourceId == null || sourceId.isBlank()) {
            throw new IllegalArgumentException("A log id is required");
        }
        if (LAUNCHER_LOG_ID.equals(sourceId)) {
            Path file = AppPaths.instanceLogPath(instance.slug());
            if (!Files.exists(file)) {
                Files.createDirectories(file.getParent());
                Files.createFile(file);
            }
            return file;
        }

        int separator = sourceId.indexOf(':');
        if (separator <= 0) throw new IllegalArgumentException("Unknown log: " + sourceId);
        String kind = sourceId.substring(0, separator);
        String fileName = sourceId.substring(separator + 1);

        Path directory = switch (kind) {
            case "game" -> instance.gameDirectory().resolve("logs");
            case "crash" -> instance.gameDirectory().resolve("crash-reports");
            default -> throw new IllegalArgumentException("Unknown log: " + sourceId);
        };
        Path file = directory.resolve(safeName(fileName)).normalize();
        if (!file.startsWith(directory.normalize())) {
            throw new IllegalArgumentException("Invalid log name");
        }
        if (!Files.isRegularFile(file)) {
            throw new IllegalStateException("Log not found: " + fileName);
        }
        return file;
    }

    // ── internals ─────────────────────────────────────────────────────────────

    private void collect(List<LogSource> target, Path directory, String kind,
                         java.util.function.Predicate<String> accepts) {
        if (!Files.isDirectory(directory)) return;
        List<LogSource> found = new ArrayList<>();
        try (Stream<Path> stream = Files.list(directory)) {
            for (Path file : stream.filter(Files::isRegularFile).toList()) {
                String name = file.getFileName().toString();
                if (!accepts.test(name.toLowerCase(Locale.ROOT))) continue;
                found.add(new LogSource(
                        kind + ":" + name, name, kind, sizeOf(file), modifiedAt(file),
                        "latest.log".equalsIgnoreCase(name), isCompressed(file)));
            }
        } catch (IOException e) {
            // A logs directory the game has not created yet is the normal case.
            return;
        }
        found.sort(Comparator.comparingLong(LogSource::modifiedAt).reversed());
        target.addAll(found);
    }

    private static String readCompressed(Path file) throws IOException {
        try (InputStream in = new GZIPInputStream(Files.newInputStream(file))) {
            byte[] bytes = in.readNBytes(MAX_COMPRESSED_BYTES);
            return new String(bytes, StandardCharsets.UTF_8);
        }
    }

    private static boolean isCompressed(Path file) {
        return file.getFileName().toString().toLowerCase(Locale.ROOT).endsWith(".gz");
    }

    private static String safeName(String fileName) {
        String cleaned = fileName.replace('\\', '/');
        if (cleaned.isBlank() || cleaned.contains("/") || cleaned.contains("..")) {
            throw new IllegalArgumentException("Invalid log name");
        }
        return cleaned;
    }

    private static long sizeOf(Path file) {
        try {
            return Files.size(file);
        } catch (IOException e) {
            return 0L;
        }
    }

    private static long modifiedAt(Path file) {
        try {
            return Files.getLastModifiedTime(file).toMillis();
        } catch (IOException e) {
            return 0L;
        }
    }
}
