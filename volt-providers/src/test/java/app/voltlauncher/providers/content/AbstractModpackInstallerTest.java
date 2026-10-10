package app.voltlauncher.providers.content;

import app.voltlauncher.core.util.HttpFetcher;
import app.voltlauncher.game.instance.ContentSource;
import app.voltlauncher.game.instance.Instance;
import app.voltlauncher.providers.model.ProviderId;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Exercises the archive mechanics every pack installer shares, through a minimal subclass — the
 * real installers all reach the network, and none of this behaviour depends on that.
 */
class AbstractModpackInstallerTest {

    /** A stand-in that exposes the protected helpers under test and nothing else. */
    private static final class TestInstaller extends AbstractModpackInstaller {
        TestInstaller() {
            super(new HttpFetcher());
        }

        @Override
        public ProviderId provider() {
            return ProviderId.TECHNIC;
        }

        @Override
        public PackInfo readPackInfo(Path archive) {
            throw new UnsupportedOperationException();
        }

        @Override
        public PackInfo fetchPackInfo(String versionId) {
            throw new UnsupportedOperationException();
        }

        @Override
        public List<ContentSource> applyPackContents(Instance instance, PackInfo info, ProgressSink progress) {
            throw new UnsupportedOperationException();
        }

        List<String> extract(Path gameDir, Path archive, java.util.function.Predicate<String> skip)
                throws Exception {
            return extractAll(gameDir, archive, skip);
        }

        String wrapper(Path archive) throws Exception {
            return detectWrapperFolder(archive);
        }

        List<ContentSource> sourcesFor(List<String> paths) {
            return overrideContentSources(paths);
        }
    }

    private static Path zip(Path file, Map<String, String> entries) throws Exception {
        try (ZipOutputStream out = new ZipOutputStream(Files.newOutputStream(file))) {
            for (Map.Entry<String, String> entry : entries.entrySet()) {
                out.putNextEntry(new ZipEntry(entry.getKey()));
                out.write(entry.getValue().getBytes(StandardCharsets.UTF_8));
                out.closeEntry();
            }
        }
        return file;
    }

    @Test
    @DisplayName("an archive with its contents at the root has no wrapper folder")
    void detectsNoWrapper(@TempDir Path directory) throws Exception {
        Path archive = zip(directory.resolve("pack.zip"), Map.of(
                "bin/version.json", "{}", "mods/a.jar", "alpha"));

        assertNull(new TestInstaller().wrapper(archive));
    }

    @Test
    @DisplayName("an archive nested inside one folder reports that folder")
    void detectsWrapper(@TempDir Path directory) throws Exception {
        Path archive = zip(directory.resolve("pack.zip"), Map.of(
                "MyPack/bin/version.json", "{}", "MyPack/mods/a.jar", "alpha"));

        assertEquals("MyPack/", new TestInstaller().wrapper(archive));
    }

    @Test
    @DisplayName("two top-level folders means neither is a wrapper")
    void detectsNoWrapperWithSiblings(@TempDir Path directory) throws Exception {
        Path archive = zip(directory.resolve("pack.zip"), Map.of(
                "mods/a.jar", "alpha", "config/b.toml", "beta"));

        assertNull(new TestInstaller().wrapper(archive));
    }

    @Test
    @DisplayName("extraction strips the wrapper folder so mods land where the game looks")
    void stripsWrapperOnExtract(@TempDir Path directory) throws Exception {
        Path archive = zip(directory.resolve("pack.zip"), Map.of(
                "MyPack/mods/a.jar", "alpha", "MyPack/config/b.toml", "beta"));
        Path game = directory.resolve("game");
        Files.createDirectories(game);

        List<String> written = new TestInstaller().extract(game, archive, null);

        assertEquals(2, written.size());
        assertEquals("alpha", Files.readString(game.resolve("mods/a.jar")));
        assertEquals("beta", Files.readString(game.resolve("config/b.toml")));
    }

    @Test
    @DisplayName("skipped entries are not written")
    void honoursSkipPredicate(@TempDir Path directory) throws Exception {
        Path archive = zip(directory.resolve("pack.zip"), Map.of(
                "bin/modpack.jar", "jar", "mods/a.jar", "alpha"));
        Path game = directory.resolve("game");
        Files.createDirectories(game);

        List<String> written = new TestInstaller().extract(game, archive, name -> name.startsWith("bin/"));

        assertEquals(List.of("mods/a.jar"), written);
        assertFalse(Files.exists(game.resolve("bin/modpack.jar")));
    }

    @Test
    @DisplayName("an entry escaping the game directory aborts the install")
    void refusesEscapingEntries(@TempDir Path directory) throws Exception {
        Path archive = zip(directory.resolve("evil.zip"), Map.of("../escaped.txt", "nope"));
        Path game = directory.resolve("game");
        Files.createDirectories(game);

        assertThrows(IllegalStateException.class, () -> new TestInstaller().extract(game, archive, null));
        assertFalse(Files.exists(directory.resolve("escaped.txt")));
    }

    @Test
    @DisplayName("a marker file is found whether or not it sits inside a wrapper folder")
    void findsMarkerEntries(@TempDir Path directory) throws Exception {
        Path flat = zip(directory.resolve("flat.zip"), Map.of("bin/version.json", "{}"));
        Path nested = zip(directory.resolve("nested.zip"), Map.of("MyPack/bin/version.json", "{}"));

        assertTrue(AbstractModpackInstaller.hasEntry(flat, "bin/version.json"));
        assertFalse(AbstractModpackInstaller.hasEntry(nested, "bin/version.json"));
        assertTrue(AbstractModpackInstaller.hasEntryEndingWith(flat, "bin/version.json"));
        assertTrue(AbstractModpackInstaller.hasEntryEndingWith(nested, "bin/version.json"));
        assertFalse(AbstractModpackInstaller.hasEntryEndingWith(flat, "manifest.json"));
    }

    @Test
    @DisplayName("only files inside a content folder become manageable entries")
    void recordsOnlyContentFolders() {
        List<ContentSource> sources = new TestInstaller().sourcesFor(List.of(
                "mods/a.jar",
                "resourcepacks/pack.zip",
                "config/foo.toml",
                "mods/nested/deep.jar",
                "loose.txt"));

        assertEquals(2, sources.size());
        assertEquals("mods", sources.get(0).contentType());
        assertEquals("a.jar", sources.get(0).fileName());
        assertEquals("resourcepacks", sources.get(1).contentType());
        assertTrue(sources.getFirst().isFromModpack());
    }

    @Test
    @DisplayName("pack info carries an archive only when the platform ships one")
    void describesPackInfo(@TempDir Path directory) {
        AbstractModpackInstaller.PackInfo withArchive = new AbstractModpackInstaller.PackInfo(
                "1.20.1", "Pack", "1.0", directory.resolve("pack.zip"));
        AbstractModpackInstaller.PackInfo withoutArchive = new AbstractModpackInstaller.PackInfo(
                "1.20.1", "Pack", "1.0", null, "91:1234");

        assertTrue(withArchive.hasArchive());
        assertEquals("", withArchive.sourceRef());
        assertFalse(withoutArchive.hasArchive());
        assertEquals("91:1234", withoutArchive.sourceRef());
        assertEquals("2.0", withoutArchive.withVersion("2.0").packVersion());
        assertEquals("x", withoutArchive.withSourceRef("x").sourceRef());
    }
}
