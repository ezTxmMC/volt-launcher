package app.voltlauncher.server.route;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Guards the guard. The failure this prevents is not theoretical: with lenient routing,
 * {@code DELETE /api/instances/Foo/worlds/%2e%2e} normalised down onto the endpoint that deletes
 * a whole profile, and the request that did it looked like a world deletion.
 */
class PathGuardTest {

    @Test
    @DisplayName("an encoded path separator is refused, whatever its casing")
    void refusesEncodedSeparators() {
        assertTrue(PathGuard.isSuspicious("/api/instances/A/worlds/sub%2Fdir"));
        assertTrue(PathGuard.isSuspicious("/api/instances/A/worlds/sub%2fdir"));
        assertTrue(PathGuard.isSuspicious("/api/instances/A/worlds/sub%5Cdir"));
        assertTrue(PathGuard.isSuspicious("/api/instances/A/worlds/..%2F..%2Fetc"));
    }

    @Test
    @DisplayName("a null byte is refused")
    void refusesNullBytes() {
        assertTrue(PathGuard.isSuspicious("/api/instances/A/logs/game%00.log"));
    }

    @Test
    @DisplayName("literal dot segments are refused")
    void refusesDotSegments() {
        assertTrue(PathGuard.isSuspicious("/api/instances/A/worlds/.."));
        assertTrue(PathGuard.isSuspicious("/api/instances/../secrets"));
        assertTrue(PathGuard.isSuspicious("/api/instances/A/worlds/."));
    }

    @Test
    @DisplayName("a percent sign in a profile name is data, not structure, and stays allowed")
    void allowsPercentEncodedText() {
        assertFalse(PathGuard.isSuspicious("/api/instances/50%25%20Off/worlds"));
        assertFalse(PathGuard.isSuspicious("/api/instances/Test%20Profile/logs"));
    }

    @Test
    @DisplayName("ordinary paths pass, including file names full of dots")
    void allowsOrdinaryPaths() {
        assertFalse(PathGuard.isSuspicious("/api/instances"));
        assertFalse(PathGuard.isSuspicious("/api/instances/A/content/mods/sodium-0.5.8.jar/versions"));
        assertFalse(PathGuard.isSuspicious("/api/instances/A/logs/crash%3Acrash-2026-01-01_12.00.00-client.txt"));
        assertFalse(PathGuard.isSuspicious("/api/instances/A/screenshots/2026-01-01_12.00.00.png/image"));
        assertFalse(PathGuard.isSuspicious("/"));
        assertFalse(PathGuard.isSuspicious(""));
        assertFalse(PathGuard.isSuspicious(null));
    }
}
