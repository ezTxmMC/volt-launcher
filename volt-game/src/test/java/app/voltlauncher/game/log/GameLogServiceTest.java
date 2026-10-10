package app.voltlauncher.game.log;

import app.voltlauncher.core.AppPaths;
import app.voltlauncher.core.util.HttpFetcher;
import app.voltlauncher.game.instance.Instance;
import app.voltlauncher.game.instance.InstanceManager;
import app.voltlauncher.game.platform.PlatformRegistry;
import app.voltlauncher.game.platform.version.resolver.VanillaVersionResolver;
import app.voltlauncher.game.store.LauncherInstanceStore;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.zip.GZIPOutputStream;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class GameLogServiceTest {

    @TempDir
    Path home;

    private String previousHome;
    private GameLogService logs;

    @BeforeEach
    void setUp() throws Exception {
        previousHome = System.getProperty("voltlauncher.home");
        System.setProperty("voltlauncher.home", home.toString());

        HttpFetcher http = new HttpFetcher();
        VanillaVersionResolver resolver = new VanillaVersionResolver(http);
        InstanceManager manager = new InstanceManager(new LauncherInstanceStore(), resolver,
                PlatformRegistry.withDefaults(resolver, http));
        logs = new GameLogService(manager);

        new LauncherInstanceStore().saveInstances(List.of(
                Instance.create("Survival", "survival", "1.21.1", "release", 1L, 21, "java")));
        Files.createDirectories(AppPaths.instanceGameDirectory("survival"));
    }

    @AfterEach
    void tearDown() {
        if (previousHome == null) System.clearProperty("voltlauncher.home");
        else System.setProperty("voltlauncher.home", previousHome);
    }

    private void writeLauncherLog(String content) throws Exception {
        Path file = AppPaths.instanceLogPath("survival");
        Files.createDirectories(file.getParent());
        Files.writeString(file, content, StandardCharsets.UTF_8);
    }

    private void writeGameLog(String name, String content) throws Exception {
        Path directory = AppPaths.instanceGameDirectory("survival").resolve("logs");
        Files.createDirectories(directory);
        Files.writeString(directory.resolve(name), content, StandardCharsets.UTF_8);
    }

    @Test
    @DisplayName("a profile that has never run has no logs")
    void listsNothingInitially() throws Exception {
        assertTrue(logs.list("Survival").isEmpty());
    }

    @Test
    @DisplayName("the launcher console, the game logs and the crash reports are all listed")
    void listsEveryKind() throws Exception {
        writeLauncherLog("launcher output");
        writeGameLog("latest.log", "game output");

        Path crashes = AppPaths.instanceGameDirectory("survival").resolve("crash-reports");
        Files.createDirectories(crashes);
        Files.writeString(crashes.resolve("crash-2026-01-01.txt"), "boom");

        List<GameLogService.LogSource> sources = logs.list("Survival");
        assertEquals(3, sources.size());
        assertTrue(sources.stream().anyMatch(source -> "launcher".equals(source.kind())));
        assertTrue(sources.stream().anyMatch(source -> "game".equals(source.kind()) && source.live()));
        assertTrue(sources.stream().anyMatch(source -> "crash".equals(source.kind())));
    }

    @Test
    @DisplayName("reading with a negative offset returns the tail of the file")
    void readsTail() throws Exception {
        writeLauncherLog("A".repeat(1000) + "END");

        GameLogService.LogChunk chunk = logs.read("Survival", GameLogService.LAUNCHER_LOG_ID, -1, 16);
        assertEquals(16, chunk.text().length());
        assertTrue(chunk.text().endsWith("END"));
        assertTrue(chunk.truncated());
        assertEquals(1003, chunk.size());
        assertEquals(1003, chunk.nextOffset());
    }

    @Test
    @DisplayName("a follow-up read continues from where the previous one stopped")
    void readsIncrementally() throws Exception {
        writeLauncherLog("first line\n");

        GameLogService.LogChunk first = logs.read("Survival", GameLogService.LAUNCHER_LOG_ID, 0, 4096);
        assertEquals("first line\n", first.text());
        assertFalse(first.truncated());

        Files.writeString(AppPaths.instanceLogPath("survival"), "first line\nsecond line\n",
                StandardCharsets.UTF_8);

        GameLogService.LogChunk second = logs.read(
                "Survival", GameLogService.LAUNCHER_LOG_ID, first.nextOffset(), 4096);
        assertEquals("second line\n", second.text());
    }

    @Test
    @DisplayName("an offset past the end restarts rather than returning nonsense")
    void handlesShrunkFile() throws Exception {
        writeLauncherLog("short");

        GameLogService.LogChunk chunk = logs.read("Survival", GameLogService.LAUNCHER_LOG_ID, 9999, 4096);
        assertEquals("short", chunk.text());
        assertEquals(0L, chunk.offset());
    }

    @Test
    @DisplayName("a rotated .log.gz is decompressed and handed back whole")
    void readsCompressedLog() throws Exception {
        Path directory = AppPaths.instanceGameDirectory("survival").resolve("logs");
        Files.createDirectories(directory);
        try (GZIPOutputStream out = new GZIPOutputStream(
                Files.newOutputStream(directory.resolve("2026-01-01-1.log.gz")))) {
            out.write("archived output".getBytes(StandardCharsets.UTF_8));
        }

        GameLogService.LogSource source = logs.list("Survival").stream()
                .filter(GameLogService.LogSource::compressed).findFirst().orElseThrow();
        assertEquals("archived output", logs.read("Survival", source.id(), -1, 4096).text());
    }

    @Test
    @DisplayName("only the launcher's own log can be cleared")
    void clearsLauncherLogOnly() throws Exception {
        writeLauncherLog("noise");
        writeGameLog("latest.log", "game output");

        logs.clear("Survival", GameLogService.LAUNCHER_LOG_ID);
        assertEquals("", Files.readString(AppPaths.instanceLogPath("survival")));

        assertThrows(IllegalArgumentException.class, () -> logs.clear("Survival", "game:latest.log"));
    }

    @Test
    @DisplayName("the newest crash report is the one a failed launch should point at")
    void findsNewestCrashReport() throws Exception {
        Path crashes = AppPaths.instanceGameDirectory("survival").resolve("crash-reports");
        Files.createDirectories(crashes);
        Path older = crashes.resolve("crash-old.txt");
        Path newer = crashes.resolve("crash-new.txt");
        Files.writeString(older, "old");
        Files.writeString(newer, "new");
        Files.setLastModifiedTime(older, java.nio.file.attribute.FileTime.fromMillis(1_000L));
        Files.setLastModifiedTime(newer, java.nio.file.attribute.FileTime.fromMillis(9_000L));

        GameLogService.LogSource latest = logs.latestCrashReport("Survival");
        assertNotNull(latest);
        assertEquals("crash-new.txt", latest.label());
        assertEquals("crash", latest.kind());
    }

    @Test
    @DisplayName("a log id that walks out of the profile is refused")
    void refusesPathTraversal() {
        assertThrows(IllegalArgumentException.class, () -> logs.resolve("Survival", "game:../../secret"));
        assertThrows(IllegalArgumentException.class, () -> logs.resolve("Survival", "other:file.log"));
        assertThrows(IllegalArgumentException.class, () -> logs.resolve("Survival", "nocolon"));
        assertThrows(IllegalArgumentException.class, () -> logs.resolve("Survival", ""));
    }

    @Test
    @DisplayName("asking for the launcher log creates it, so a first read never fails")
    void createsLauncherLogOnDemand() throws Exception {
        Path file = logs.resolve("Survival", GameLogService.LAUNCHER_LOG_ID);
        assertTrue(Files.isRegularFile(file));
        assertEquals("", logs.read("Survival", GameLogService.LAUNCHER_LOG_ID, -1, 4096).text());
    }

    @Test
    @DisplayName("a read is capped so one request cannot pull in a whole huge log")
    void capsChunkSize() throws Exception {
        writeLauncherLog("x".repeat(GameLogService.MAX_CHUNK_BYTES * 2));

        GameLogService.LogChunk chunk = logs.read(
                "Survival", GameLogService.LAUNCHER_LOG_ID, 0, GameLogService.MAX_CHUNK_BYTES * 4);
        assertEquals(GameLogService.MAX_CHUNK_BYTES, chunk.text().length());
    }
}
