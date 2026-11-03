/**
 * Bridge configuration, read once at startup from the environment.
 *
 * The CurseForge API key lives here and nowhere else: shipping it inside the desktop client
 * would expose it to every user, which CurseForge's terms forbid.
 */

const DEFAULTS = {
  port: 8787,
  host: '127.0.0.1',
  upstream: 'https://api.curseforge.com',
  cacheTtlSeconds: 300,
  requestTimeoutMs: 20000,
  allowedOrigins: '*',
  userAgent: 'VoltLauncher-Bridge/0.2.0 (+https://volt-launcher.app)',
};

function intFromEnv(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') {
    return fallback;
  }
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export const config = {
  port: intFromEnv('PORT', DEFAULTS.port),
  host: process.env.HOST || DEFAULTS.host,
  apiKey: normaliseKey(process.env.CURSEFORGE_API_KEY),
  upstream: (process.env.CURSEFORGE_API_URL || DEFAULTS.upstream).replace(/\/$/, ''),
  cacheTtlMs: intFromEnv('CACHE_TTL_SECONDS', DEFAULTS.cacheTtlSeconds) * 1000,
  requestTimeoutMs: intFromEnv('REQUEST_TIMEOUT_MS', DEFAULTS.requestTimeoutMs),
  allowedOrigins: process.env.ALLOWED_ORIGINS || DEFAULTS.allowedOrigins,
  userAgent: process.env.BRIDGE_USER_AGENT || DEFAULTS.userAgent,
};

/**
 * Strips the quotes and stray whitespace that survive copy-pasting a key into a .env file.
 * A key with a trailing newline or wrapping quotes is sent verbatim and rejected with a 403,
 * which is indistinguishable from an invalid key at the call site.
 */
function normaliseKey(raw) {
  if (!raw) {
    return '';
  }
  return raw.trim().replace(/^['"]|['"]$/g, '').trim();
}

export const hasApiKey = () => config.apiKey.length > 0;

/** A safe fragment for logs, so a misread key is visible without exposing it. */
export const apiKeyFingerprint = () => {
  if (!hasApiKey()) {
    return 'none';
  }
  const key = config.apiKey;
  return `${key.slice(0, 4)}…${key.slice(-4)} (${key.length} chars)`;
};
