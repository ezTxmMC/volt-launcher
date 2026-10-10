package app.voltlauncher.game.media;

import app.voltlauncher.game.instance.InstanceManager;
import org.json.JSONObject;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.stream.Stream;

/** The screenshots a profile has taken, so they can be browsed without leaving the launcher. */
public final class ScreenshotService {

    private static final String SCREENSHOTS_FOLDER = "screenshots";
    private static final List<String> IMAGE_EXTENSIONS = List.of(".png", ".jpg", ".jpeg", ".webp");

    private final InstanceManager instanceManager;

    public ScreenshotService(InstanceManager instanceManager) {
        this.instanceManager = instanceManager;
    }

    public record Screenshot(String fileName, long takenAt, long sizeBytes) {

        public JSONObject toJson() {
            return new JSONObject()
                    .put("fileName", fileName)
                    .put("takenAt", takenAt)
                    .put("sizeBytes", sizeBytes);
        }
    }

    public List<Screenshot> list(String instanceName) throws Exception {
        Path directory = directory(instanceName);
        List<Screenshot> screenshots = new ArrayList<>();
        if (!Files.isDirectory(directory)) return screenshots;

        try (Stream<Path> stream = Files.list(directory)) {
            for (Path file : stream.filter(Files::isRegularFile).toList()) {
                String name = file.getFileName().toString();
                if (!isImage(name)) continue;
                long takenAt;
                long size;
                try {
                    takenAt = Files.getLastModifiedTime(file).toMillis();
                    size = Files.size(file);
                } catch (Exception e) {
                    continue;
                }
                screenshots.add(new Screenshot(name, takenAt, size));
            }
        }
        screenshots.sort(Comparator.comparingLong(Screenshot::takenAt).reversed());
        return screenshots;
    }

    /** Absolute path of one screenshot, validated to stay inside the profile's folder. */
    public Path resolve(String instanceName, String fileName) throws Exception {
        Path directory = directory(instanceName);
        Path file = directory.resolve(safeName(fileName)).normalize();
        if (!file.startsWith(directory)) {
            throw new IllegalArgumentException("Invalid screenshot name");
        }
        if (!Files.isRegularFile(file)) {
            throw new IllegalStateException("Screenshot not found: " + fileName);
        }
        return file;
    }

    public void delete(String instanceName, String fileName) throws Exception {
        Files.deleteIfExists(resolve(instanceName, fileName));
    }

    public Path directory(String instanceName) throws Exception {
        return instanceManager.findByName(instanceName).gameDirectory().resolve(SCREENSHOTS_FOLDER);
    }

    /** The MIME type for a screenshot, used when the API streams it back to the UI. */
    public static String contentType(String fileName) {
        String lower = fileName.toLowerCase(Locale.ROOT);
        if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
        if (lower.endsWith(".webp")) return "image/webp";
        return "image/png";
    }

    private static boolean isImage(String fileName) {
        String lower = fileName.toLowerCase(Locale.ROOT);
        return IMAGE_EXTENSIONS.stream().anyMatch(lower::endsWith);
    }

    private static String safeName(String fileName) {
        if (fileName == null || fileName.isBlank()) {
            throw new IllegalArgumentException("A screenshot name is required");
        }
        String cleaned = fileName.replace('\\', '/');
        if (cleaned.contains("/") || cleaned.contains("..")) {
            throw new IllegalArgumentException("Invalid screenshot name");
        }
        if (!isImage(cleaned)) {
            throw new IllegalArgumentException("Not an image file: " + fileName);
        }
        return cleaned;
    }
}
