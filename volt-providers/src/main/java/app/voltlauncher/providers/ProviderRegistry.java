package app.voltlauncher.providers;

import app.voltlauncher.core.config.SettingsStore;
import app.voltlauncher.core.util.HttpFetcher;
import app.voltlauncher.providers.curseforge.CurseForgeProvider;
import app.voltlauncher.providers.ftb.FtbProvider;
import app.voltlauncher.providers.model.ProviderId;
import app.voltlauncher.providers.modrinth.ModrinthProvider;
import app.voltlauncher.providers.technic.TechnicProvider;

import java.util.Collection;
import java.util.EnumMap;
import java.util.List;
import java.util.Map;

public final class ProviderRegistry {

    private final Map<ProviderId, ContentProvider> providers = new EnumMap<>(ProviderId.class);

    public ProviderRegistry(HttpFetcher http, SettingsStore settings) {
        register(new ModrinthProvider(http));
        register(new CurseForgeProvider(http, settings));
        register(new TechnicProvider(http));
        register(new FtbProvider(http));
    }

    public void register(ContentProvider provider) {
        providers.put(provider.id(), provider);
    }

    public ContentProvider require(ProviderId id) {
        ContentProvider provider = providers.get(id);
        if (provider == null) {
            throw new IllegalArgumentException("Unknown content provider: " + id.id());
        }
        return provider;
    }

    public ContentProvider require(String id) {
        return require(ProviderId.fromId(id));
    }

    /**
     * Like {@link #require(ProviderId)} but refuses providers that cannot currently serve
     * requests, so callers surface a clear reason instead of an opaque network error.
     */
    public ContentProvider requireAvailable(ProviderId id) {
        ContentProvider provider = require(id);
        if (!provider.isAvailable()) {
            throw new IllegalStateException(provider.unavailableReason());
        }
        return provider;
    }

    public Collection<ContentProvider> all() {
        return List.copyOf(providers.values());
    }
}
