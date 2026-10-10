package app.voltlauncher.core.util.archive;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class ArchivesTest {

    private Path sampleTree(Path root) throws IOException {
        Files.createDirectories(root.resolve("mods"));
        Files.createDirectories(root.resolve("logs"));
        Files.writeString(root.resolve("mods/a.jar"), "alpha");
        Files.writeString(root.resolve("mods/b.jar"), "beta");
        Files.writeString(root.resolve("logs/latest.log"), "log line");
        Files.writeString(root.resolve("options.txt"), "fov:80");
        return root;
    }

    @Test
    @DisplayName("a directory zips and unzips back to identical contents")
    void roundTripsDirectory(@TempDir Path directory) throws Exception {
        Path source = sampleTree(directory.resolve("game"));
        Path archive = directory.resolve("backup.zip");

        int written = Archives.zipDirectory(source, archive, null, null);
        assertEquals(4, written);

        Path restored = directory.resolve("restored");
        int extracted = Archives.unzip(archive, restored, null);

        assertEquals(4, extracted);
        assertEquals("alpha", Files.readString(restored.resolve("mods/a.jar")));
        assertEquals("fov:80", Files.readString(restored.resolve("options.txt")));
    }

    @Test
    @DisplayName("skipped entries stay out of the archive")
    void honoursSkipPredicate(@TempDir Path directory) throws Exception {
        Path source = sampleTree(directory.resolve("game"));
        Path archive = directory.resolve("backup.zip");

        Archives.zipDirectory(source, archive,
                relative -> relative.getName(0).toString().equals("logs"), null);

        List<String> entries = Archives.listEntries(archive);
        assertTrue(entries.contains("mods/a.jar"));
        assertFalse(entries.stream().anyMatch(name -> name.startsWith("logs/")));
    }

    @Test
    @DisplayName("progress is reported once per archived file")
    void reportsProgress(@TempDir Path directory) throws Exception {
        Path source = sampleTree(directory.resolve("game"));
        int[] lastCompleted = {0};
        int[] lastTotal = {0};

        Archives.zipDirectory(source, directory.resolve("backup.zip"), null, (completed, total) -> {
            lastCompleted[0] = completed;
            lastTotal[0] = total;
        });

        assertEquals(4, lastCompleted[0]);
        assertEquals(4, lastTotal[0]);
    }

    @Test
    @DisplayName("an entry escaping the destination is refused")
    void refusesZipSlip(@TempDir Path directory) throws Exception {
        Path archive = directory.resolve("evil.zip");
        try (ZipOutputStream zip = new ZipOutputStream(Files.newOutputStream(archive))) {
            zip.putNextEntry(new ZipEntry("../escaped.txt"));
            zip.write("nope".getBytes(StandardCharsets.UTF_8));
            zip.closeEntry();
        }

        Path destination = directory.resolve("out");
        assertThrows(IOException.class, () -> Archives.unzip(archive, destination, null));
        assertFalse(Files.exists(directory.resolve("escaped.txt")));
    }

    @Test
    @DisplayName("a named entry can be read without extracting the archive")
    void readsSingleEntry(@TempDir Path directory) throws Exception {
        Path source = sampleTree(directory.resolve("game"));
        Path archive = directory.resolve("backup.zip");
        Archives.zipDirectory(source, archive, null, null);

        assertArrayEquals("alpha".getBytes(StandardCharsets.UTF_8),
                Archives.readEntry(archive, "mods/a.jar"));
        assertNull(Archives.readEntry(archive, "mods/missing.jar"));
        assertArrayEquals("beta".getBytes(StandardCharsets.UTF_8),
                Archives.readFirstMatching(archive, name -> name.endsWith("b.jar")));
    }

    @Test
    @DisplayName("copying a directory into itself is refused rather than looping")
    void refusesSelfCopy(@TempDir Path directory) throws Exception {
        Path source = sampleTree(directory.resolve("game"));
        assertThrows(IOException.class, () -> Archives.copyDirectory(source, source.resolve("inner")));
    }

    @Test
    @DisplayName("copying reproduces the whole tree")
    void copiesDirectory(@TempDir Path directory) throws Exception {
        Path source = sampleTree(directory.resolve("game"));
        Path target = directory.resolve("copy");
        Archives.copyDirectory(source, target);

        assertEquals("beta", Files.readString(target.resolve("mods/b.jar")));
        assertTrue(Files.isDirectory(target.resolve("logs")));
    }

    @Test
    @DisplayName("directory size adds up every file and ignores a missing directory")
    void measuresDirectorySize(@TempDir Path directory) throws Exception {
        Path source = sampleTree(directory.resolve("game"));
        long expected = "alpha".length() + "beta".length() + "log line".length() + "fov:80".length();

        assertEquals(expected, Archives.directorySize(source));
        assertEquals(0L, Archives.directorySize(directory.resolve("nope")));
    }

    @Test
    @DisplayName("deleting a tree removes it completely and tolerates a missing path")
    void deletesRecursively(@TempDir Path directory) throws Exception {
        Path source = sampleTree(directory.resolve("game"));
        Archives.deleteRecursively(source);
        assertFalse(Files.exists(source));
        Archives.deleteRecursively(source);
    }
}
