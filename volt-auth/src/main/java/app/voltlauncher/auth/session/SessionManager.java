package app.voltlauncher.auth.session;

import app.voltlauncher.auth.AuthResult;
import app.voltlauncher.auth.MinecraftAccountSession;
import app.voltlauncher.auth.client.MinecraftAuthClient;
import app.voltlauncher.auth.client.OAuthClient;
import app.voltlauncher.auth.client.XboxAuthClient;
import app.voltlauncher.auth.store.EncryptedAccountStore;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

public final class SessionManager {

    private static final long REFRESH_SAFETY_WINDOW_MS = 5 * 60 * 1_000L;
    private static final long MIN_USABLE_REMAINING_MS = 60_000L;

    private final OAuthClient oauth;
    private final XboxAuthClient xbox;
    private final MinecraftAuthClient minecraft;
    private final EncryptedAccountStore store;

    // In-memory cache of all sessions, keyed by UUID
    private Map<String, MinecraftAccountSession> sessionCache = null;
    private String selectedUuid = null;

    public SessionManager(OAuthClient oauth, XboxAuthClient xbox, MinecraftAuthClient minecraft,
            EncryptedAccountStore store) {
        this.oauth = oauth;
        this.xbox = xbox;
        this.minecraft = minecraft;
        this.store = store;
    }

    public synchronized MinecraftAccountSession createSession(OAuthClient.TokenResponse microsoftTokens) throws Exception {
        XboxAuthClient.XboxSession xboxSession = xbox.authenticate(microsoftTokens.accessToken());
        MinecraftAuthClient.MinecraftTokenResponse mc = minecraft.login(xboxSession.xstsToken(), xboxSession.userHash());
        MinecraftAuthClient.MinecraftProfile profile = minecraft.fetchProfile(mc.accessToken());

        MinecraftAccountSession session = new MinecraftAccountSession(
                profile.uuid(), profile.username(), mc.accessToken(), mc.expiresAt(),
                microsoftTokens.accessToken(), microsoftTokens.accessTokenExpiresAt(),
                microsoftTokens.refreshToken(), xboxSession.userHash(), xboxSession.xuid());

        persist(session);
        return session;
    }

    public synchronized MinecraftAccountSession getLaunchSession() throws Exception {
        return getLaunchSession(false);
    }

    /**
     * The session to launch with, refreshing an expired token first.
     *
     * @param allowOffline when the refresh fails because the network is unreachable, launch with
     *                     the cached session anyway. The stale token means servers will refuse the
     *                     account, but single-player works — which beats not starting at all when
     *                     Microsoft is down. A token the servers <em>rejected</em> is never
     *                     accepted this way: that needs a real sign-in, and saying so is the only
     *                     useful answer.
     */
    public synchronized MinecraftAccountSession getLaunchSession(boolean allowOffline) throws Exception {
        ensureLoaded();
        if (selectedUuid == null) throw new IllegalStateException("Not logged in");
        MinecraftAccountSession session = sessionCache.get(selectedUuid);
        if (session == null) throw new IllegalStateException("Not logged in");
        if (!needsRefresh(session)) return session;

        try {
            return refresh(session);
        } catch (Exception e) {
            if (!allowOffline || !isNetworkFailure(e)) throw e;
            System.err.println("[Auth] Could not reach Microsoft; launching offline with the cached session: "
                    + e.getMessage());
            return session;
        }
    }

    /**
     * Whether a failure was the network rather than the credentials. Walks the cause chain,
     * because the HTTP client wraps the real cause several layers deep.
     */
    static boolean isNetworkFailure(Throwable failure) {
        for (Throwable current = failure; current != null; current = current.getCause()) {
            if (current instanceof java.net.UnknownHostException
                    || current instanceof java.net.ConnectException
                    || current instanceof java.net.SocketTimeoutException
                    || current instanceof java.net.http.HttpTimeoutException
                    || current instanceof java.net.NoRouteToHostException) {
                return true;
            }
            if (current.getCause() == current) break;
        }
        return false;
    }

    public synchronized AuthResult getStoredSummary() throws Exception {
        ensureLoaded();
        if (selectedUuid == null) return null;
        MinecraftAccountSession session = sessionCache.get(selectedUuid);
        return session == null ? null : toAuthResult(session);
    }

    public synchronized List<AuthResult> listAllAccounts() throws Exception {
        ensureLoaded();
        return sessionCache.values().stream()
                .map(this::toAuthResult)
                .collect(Collectors.toList());
    }

    public synchronized String getSelectedUuid() throws Exception {
        ensureLoaded();
        return selectedUuid;
    }

    public synchronized void switchAccount(String uuid) throws Exception {
        ensureLoaded();
        if (!sessionCache.containsKey(uuid)) {
            throw new IllegalArgumentException("Account not found: " + uuid);
        }
        store.setSelected(uuid);
        selectedUuid = uuid;
    }

    public synchronized void removeAccount(String uuid) throws Exception {
        ensureLoaded();
        store.remove(uuid);
        sessionCache.remove(uuid);
        if (uuid.equals(selectedUuid)) {
            selectedUuid = sessionCache.isEmpty() ? null : sessionCache.keySet().iterator().next();
        }
    }

    public synchronized void logout() throws Exception {
        sessionCache = null;
        selectedUuid = null;
        store.clear();
    }

    // ── internals ─────────────────────────────────────────────────────────────

    private void ensureLoaded() throws Exception {
        if (sessionCache != null) return;
        EncryptedAccountStore.AccountData data = store.loadAll();
        sessionCache = new LinkedHashMap<>(data.accounts());
        selectedUuid = data.selectedUuid();
    }

    private void persist(MinecraftAccountSession session) throws Exception {
        ensureLoaded();
        store.save(session);
        sessionCache.put(session.uuid(), session);
        selectedUuid = session.uuid();
    }

    private MinecraftAccountSession refresh(MinecraftAccountSession session) throws Exception {
        if (!session.hasRefreshToken()) {
            if (isMinecraftTokenStillUsable(session)) return session;
            throw new IllegalStateException("Session expired and cannot be refreshed. Please log in again.");
        }
        try {
            return createSession(oauth.refresh(session.microsoftRefreshToken()));
        } catch (Exception e) {
            if (isInvalidGrant(e.getMessage())) {
                removeAccount(session.uuid());
                throw new IllegalStateException("Session revoked. Please log in again.", e);
            }
            if (isMinecraftTokenStillUsable(session)) return session;
            throw e;
        }
    }

    private boolean needsRefresh(MinecraftAccountSession session) {
        long now = System.currentTimeMillis();
        return session.minecraftAccessTokenExpiresAt() <= now + REFRESH_SAFETY_WINDOW_MS
                || session.microsoftAccessTokenExpiresAt() <= now + REFRESH_SAFETY_WINDOW_MS;
    }

    private boolean isMinecraftTokenStillUsable(MinecraftAccountSession session) {
        return session.minecraftAccessTokenExpiresAt() > System.currentTimeMillis() + MIN_USABLE_REMAINING_MS;
    }

    private boolean isInvalidGrant(String message) {
        return message != null && message.toLowerCase().contains("invalid_grant");
    }

    private AuthResult toAuthResult(MinecraftAccountSession session) {
        return new AuthResult(session.uuid(), session.username());
    }
}
