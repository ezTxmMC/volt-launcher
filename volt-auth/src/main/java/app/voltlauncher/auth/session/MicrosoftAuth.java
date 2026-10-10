package app.voltlauncher.auth.session;

import app.voltlauncher.auth.AuthResult;
import app.voltlauncher.auth.MinecraftAccountSession;
import app.voltlauncher.auth.PendingAuth;
import app.voltlauncher.auth.client.MinecraftAuthClient;
import app.voltlauncher.auth.client.OAuthClient;
import app.voltlauncher.auth.client.XboxAuthClient;
import app.voltlauncher.auth.store.EncryptedAccountStore;
import app.voltlauncher.core.util.HttpFetcher;

import java.util.List;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

public class MicrosoftAuth {

    private static final String CLIENT_ID = "00000000402b5328";
    private final OAuthClient oauthClient;
    private final MinecraftAuthClient minecraftAuthClient;
    private final SessionManager sessionManager;
    private final ConcurrentHashMap<String, PendingAuth> pendingStates = new ConcurrentHashMap<>();

    public MicrosoftAuth() throws Exception {
        HttpFetcher http = new HttpFetcher();
        this.oauthClient = new OAuthClient(CLIENT_ID, http);
        this.minecraftAuthClient = new MinecraftAuthClient(http);
        this.sessionManager = new SessionManager(
                oauthClient, new XboxAuthClient(http), minecraftAuthClient,
                new EncryptedAccountStore());
    }

    public String getClientId() {
        return CLIENT_ID;
    }

    public StartAuthResult startAuthFlow() {
        String state = UUID.randomUUID().toString();
        String codeVerifier = OAuthClient.generateCodeVerifier();
        pendingStates.put(state, new PendingAuth(codeVerifier));
        return new StartAuthResult(state, oauthClient.buildAuthUrl(state, codeVerifier));
    }

    public PendingAuth checkAuthStatus(String state) {
        return pendingStates.get(state);
    }

    public void clearAuthState(String state) {
        pendingStates.remove(state);
    }

    public void failAuthFlow(String state, String message) {
        PendingAuth pending = pendingStates.get(state);
        if (pending == null) { throw new IllegalStateException("Invalid state: " + state); }
        pending.fail(message);
    }

    public AuthResult handleAuthCode(String code, String state) throws Exception {
        PendingAuth pending = pendingStates.get(state);
        if (pending == null) { throw new IllegalStateException("Invalid state: " + state); }
        synchronized (pending) {
            if (pending.isCompleted()) return pending.result();
            if (pending.hasFailed()) { throw new IllegalStateException(pending.errorMessage()); }
            try {
                OAuthClient.TokenResponse tokens = oauthClient.exchangeCode(code, pending.codeVerifier());
                MinecraftAccountSession session = sessionManager.createSession(tokens);
                AuthResult result = new AuthResult(session.uuid(), session.username());
                pending.complete(result);
                return result;
            } catch (Exception e) {
                pending.fail(e.getMessage() != null ? e.getMessage() : "Authentication failed");
                throw e;
            }
        }
    }

    public AuthResult getStoredSessionSummary() throws Exception {
        return sessionManager.getStoredSummary();
    }

    public List<AuthResult> listAllAccounts() throws Exception {
        return sessionManager.listAllAccounts();
    }

    public String getSelectedUuid() throws Exception {
        return sessionManager.getSelectedUuid();
    }

    public void switchAccount(String uuid) throws Exception {
        sessionManager.switchAccount(uuid);
    }

    public void removeAccount(String uuid) throws Exception {
        sessionManager.removeAccount(uuid);
    }

    public MinecraftAccountSession getLaunchSession() throws Exception {
        return sessionManager.getLaunchSession(false);
    }

    /** @see app.voltlauncher.auth.session.SessionManager#getLaunchSession(boolean) */
    public MinecraftAccountSession getLaunchSession(boolean allowOffline) throws Exception {
        return sessionManager.getLaunchSession(allowOffline);
    }

    public void logout() throws Exception {
        sessionManager.logout();
    }

    /**
     * Applies a skin to the currently selected account. Goes through the launch session so an
     * expired access token is refreshed first.
     */
    public void changeSkin(byte[] pngBytes, boolean slim) throws Exception {
        MinecraftAccountSession session = sessionManager.getLaunchSession();
        minecraftAuthClient.changeSkin(session.minecraftAccessToken(), pngBytes, slim);
    }

    public record StartAuthResult(String state, String url) {}
}
