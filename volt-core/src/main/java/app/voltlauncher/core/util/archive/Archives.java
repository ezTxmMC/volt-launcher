package app.voltlauncher.core.util.archive;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.file.FileVisitResult;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.SimpleFileVisitor;
import java.nio.file.StandardCopyOption;
import java.nio.file.attribute.BasicFileAttributes;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.function.Predicate;
import java.util.stream.Stream;
import java.util.zip.Deflater;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;
import java.util.zip.ZipOutputStream;

/**
 * Zip helpers for whole-directory snapshots.
 *
 * <p>Extraction refuses entries that resolve outside the destination — a zip carrying
 * {@code ../../.bashrc} would otherwise write anywhere the launcher can reach.
 */
public final class Archives {

    private Archives() {}

    /** Progress callback, invoked with the number of files handled so far and the total. */
    @FunctionalInterface
    public interface Progress {
        void update(int completed, int total);

        Progress NONE = (completed, total) -> {};
    }

    /**
     * Zips a directory tree.
     *
     * @param skip   entries (relative to {@code source}) this returns {@code true} for are left out
     * @return the number of files written into the archive
     */
    public static int zipDirectory(Path source, Path target, Predicate<Path> skip, Progress progress)
            throws IOException {
        if (!Files.isDirectory(source)) {
            throw new IOException("Not a directory: " + source);
        }
        Predicate<Path> excluded = skip == null ? relative -> false : skip;
        Progress sink = progress == null ? Progress.NONE : progress;

        List<Path> files = new ArrayList<>();
        try (Stream<Path> walk = Files.walk(source)) {
            walk.filter(Files::isRegularFile)
                    .filter(path -> !excluded.test(source.relativize(path)))
                    .forEach(files::add);
        }

        Files.createDirectories(target.getParent());
        Path temp = Files.createTempFile(target.getParent(), "archive-", ".tmp");
        int written = 0;
        try {
            try (ZipOutputStream zip = new ZipOutputStream(Files.newOutputStream(temp))) {
                zip.setLevel(Deflater.BEST_SPEED);
                for (Path file : files) {
                    String name = source.relativize(file).toString().replace('\\', '/');
                    try {
                        zip.putNextEntry(new ZipEntry(name));
                        Files.copy(file, zip);
                        zip.closeEntry();
                    } catch (IOException e) {
                        // A file the game is holding open (or that vanished mid-walk) must not
                        // abort the whole snapshot; the rest of the profile is still worth saving.
                        System.err.println("[Archives] Skipped " + name + ": " + e.getMessage());
                        continue;
                    }
                    sink.update(++written, files.size());
                }
            }
            Files.move(temp, target, StandardCopyOption.REPLACE_EXISTING);
        } finally {
            Files.deleteIfExists(temp);
        }
        return written;
    }

    /** Extracts an archive into a directory, replacing files that already exist. */
    public static int unzip(Path archive, Path destination, Progress progress) throws IOException {
        Progress sink = progress == null ? Progress.NONE : progress;
        Path root = destination.toAbsolutePath().normalize();
        Files.createDirectories(root);

        int written = 0;
        try (ZipInputStream zip = new ZipInputStream(Files.newInputStream(archive))) {
            ZipEntry entry;
            while ((entry = zip.getNextEntry()) != null) {
                Path resolved = root.resolve(entry.getName()).normalize();
                if (!resolved.startsWith(root)) {
                    throw new IOException("Archive entry escapes the destination: " + entry.getName());
                }
                if (entry.isDirectory()) {
                    Files.createDirectories(resolved);
                    zip.closeEntry();
                    continue;
                }
                Files.createDirectories(resolved.getParent());
                try (OutputStream out = Files.newOutputStream(resolved)) {
                    zip.transferTo(out);
                }
                zip.closeEntry();
                sink.update(++written, 0);
            }
        }
        return written;
    }

    /** Reads one entry out of an archive, or {@code null} when it is not present. */
    public static byte[] readEntry(Path archive, String entryName) throws IOException {
        try (ZipInputStream zip = new ZipInputStream(Files.newInputStream(archive))) {
            ZipEntry entry;
            while ((entry = zip.getNextEntry()) != null) {
                if (entryName.equals(entry.getName())) {
                    return zip.readAllBytes();
                }
                zip.closeEntry();
            }
        }
        return null;
    }

    /**
     * Reads the first entry whose name matches, which is what lets a pack zip be inspected without
     * knowing whether its contents sit at the root or inside a single wrapper folder.
     */
    public static byte[] readFirstMatching(Path archive, Predicate<String> nameMatches) throws IOException {
        try (ZipInputStream zip = new ZipInputStream(Files.newInputStream(archive))) {
            ZipEntry entry;
            while ((entry = zip.getNextEntry()) != null) {
                if (!entry.isDirectory() && nameMatches.test(entry.getName())) {
                    return zip.readAllBytes();
                }
                zip.closeEntry();
            }
        }
        return null;
    }

    /** Every entry name in an archive, directories included. */
    public static List<String> listEntries(Path archive) throws IOException {
        List<String> names = new ArrayList<>();
        try (ZipInputStream zip = new ZipInputStream(Files.newInputStream(archive))) {
            ZipEntry entry;
            while ((entry = zip.getNextEntry()) != null) {
                names.add(entry.getName());
                zip.closeEntry();
            }
        }
        return names;
    }

    /** Total size of a directory tree in bytes; unreadable entries count as zero. */
    public static long directorySize(Path directory) {
        if (!Files.isDirectory(directory)) return 0L;
        final long[] total = {0L};
        try {
            Files.walkFileTree(directory, new SimpleFileVisitor<>() {
                @Override
                public FileVisitResult visitFile(Path file, BasicFileAttributes attrs) {
                    total[0] += attrs.size();
                    return FileVisitResult.CONTINUE;
                }

                @Override
                public FileVisitResult visitFileFailed(Path file, IOException exc) {
                    return FileVisitResult.CONTINUE;
                }
            });
        } catch (IOException ignored) {
            // Best effort: a size is informational, never worth failing a listing over.
        }
        return total[0];
    }

    /** Deletes a file or a whole directory tree; a missing path is not an error. */
    public static void deleteRecursively(Path root) throws IOException {
        if (!Files.exists(root)) return;
        try (Stream<Path> walk = Files.walk(root)) {
            for (Path path : walk.sorted(Comparator.reverseOrder()).toList()) {
                Files.deleteIfExists(path);
            }
        }
    }

    /** Copies a directory tree, creating {@code target} if needed. */
    public static void copyDirectory(Path source, Path target) throws IOException {
        Path from = source.toAbsolutePath().normalize();
        Path to = target.toAbsolutePath().normalize();
        if (to.startsWith(from)) {
            throw new IOException("Cannot copy a directory into itself: " + source);
        }
        Files.createDirectories(to);
        try (Stream<Path> walk = Files.walk(from)) {
            for (Path path : walk.toList()) {
                Path destination = to.resolve(from.relativize(path).toString());
                if (Files.isDirectory(path)) {
                    Files.createDirectories(destination);
                } else {
                    Files.createDirectories(destination.getParent());
                    Files.copy(path, destination, StandardCopyOption.REPLACE_EXISTING);
                }
            }
        }
    }

    /** Reads a stream fully; a small helper so callers do not repeat the buffer dance. */
    public static byte[] readAll(InputStream in) throws IOException {
        return in.readAllBytes();
    }
}
