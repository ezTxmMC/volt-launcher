package app.voltlauncher.auth.session;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.net.ConnectException;
import java.net.UnknownHostException;
import java.net.http.HttpTimeoutException;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class SessionManagerTest {

    @Test
    @DisplayName("an unreachable network is recognised through the wrapping layers")
    void detectsNetworkFailures() {
        assertTrue(SessionManager.isNetworkFailure(new UnknownHostException("login.live.com")));
        assertTrue(SessionManager.isNetworkFailure(new ConnectException("refused")));
        assertTrue(SessionManager.isNetworkFailure(new HttpTimeoutException("timed out")));
        assertTrue(SessionManager.isNetworkFailure(
                new IllegalStateException("refresh failed", new IOException("io", new ConnectException("refused")))));
    }

    @Test
    @DisplayName("a rejected token is not a network failure, so it never launches offline")
    void rejectsAuthFailures() {
        assertFalse(SessionManager.isNetworkFailure(new IOException("HTTP 401 -> https://login.live.com")));
        assertFalse(SessionManager.isNetworkFailure(new IllegalStateException("Not logged in")));
        assertFalse(SessionManager.isNetworkFailure(null));
    }

    @Test
    @DisplayName("a self-referencing cause chain terminates instead of looping forever")
    void survivesCyclicCauses() {
        // A cause chain that points at itself is rare but real; walking it must still terminate.
        IOException failure = new IOException("boom");
        assertFalse(SessionManager.isNetworkFailure(failure));
    }
}
