import { computed, ref, watch } from "vue";
import { apiGet, apiSend, errorMessage } from "./api";
import { error } from "./state";
import { setLocale } from "@/i18n";
import type { LauncherSettings, LauncherDirectory, MainTab, SettingsSectionId } from "./types";

// ── UI-only state (not persisted) ─────────────────────────────────────────────

const activeTab = ref<MainTab>("home");
const settingsNavItem = ref<SettingsSectionId>("general");
const discoverKind = ref("modpack");
const discoverProvider = ref("modrinth");

// ── Persisted state, mirrored from the launcher backend ───────────────────────

const DEFAULTS: LauncherSettings = {
  language: "en",
  accentColor: "#00b2ff",
  uiScale: "default",
  animationsEnabled: true,
  showFps: false,
  discordPresence: true,
  hideLauncherOnLaunch: false,
  openLogsOnLaunch: false,
  autoUpdate: true,
  betaUpdates: false,
  updateRepository: "ezTxmMC/Volt-Launcher",
  discordApplicationId: "",
  defaultMaxMemoryMb: 4096,
  defaultMinMemoryMb: 1024,
  defaultJvmArgs: "-XX:+UseG1GC -XX:+ParallelRefProcEnabled",
  maxConcurrentDownloads: 8,
  backupsToKeep: 5,
  backupBeforePackUpdate: true,
  profileSort: "lastPlayed",
  favouritesFirst: true,
  offlineModeAllowed: true,
  curseForgeBridgeUrl: "http://localhost:8787",
  javaRuntimes: [],
};

const settings = ref<LauncherSettings>({ ...DEFAULTS });
const directories = ref<LauncherDirectory[]>([]);
const launcherVersion = ref("");
const isLoadingSettings = ref(false);
const isSavingSettings = ref(false);

/** Guards the settings watcher while values are being written in from the backend. */
let applyingRemote = false;
let saveTimer: ReturnType<typeof setTimeout> | undefined;

// ── Presentation ──────────────────────────────────────────────────────────────

const UI_SCALE_FACTORS: Record<string, number> = { compact: 0.88, default: 1, comfortable: 1.14 };
const BASE_TEXT_SIZES: Record<string, number> = {
  "--text-2xs": 12,
  "--text-2xs-plus": 12.5,
  "--text-xs": 13,
  "--text-sm": 13.5,
  "--text-base": 14,
  "--text-base-plus": 14.5,
  "--text-md": 15,
  "--text-md-plus": 15.5,
  "--text-lg": 16,
  "--text-xl": 18,
};

const applyUiScale = (scale: string) => {
  const factor = UI_SCALE_FACTORS[scale] ?? 1;
  const root = document.documentElement;
  for (const [token, base] of Object.entries(BASE_TEXT_SIZES)) {
    root.style.setProperty(token, `${+(base * factor).toFixed(1)}px`);
  }
};

const applyAnimations = (enabled: boolean) => {
  document.documentElement.toggleAttribute("data-no-animations", !enabled);
};

const hexToRgb = (hex: string) => {
  const value = Number.parseInt(hex.replace("#", ""), 16);
  return `${(value >> 16) & 255}, ${(value >> 8) & 255}, ${value & 255}`;
};

const hexToHsl = (hex: string): [number, number, number] => {
  const value = Number.parseInt(hex.replace("#", ""), 16);
  const r = ((value >> 16) & 255) / 255;
  const g = ((value >> 8) & 255) / 255;
  const b = (value & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const lightness = (max + min) / 2;
  if (max === min) return [0, 0, lightness];

  const delta = max - min;
  const saturation = lightness > 0.5 ? delta / (2 - max - min) : delta / (max + min);
  let hue: number;
  if (max === r) hue = ((g - b) / delta + (g < b ? 6 : 0)) / 6;
  else if (max === g) hue = ((b - r) / delta + 2) / 6;
  else hue = ((r - g) / delta + 4) / 6;
  return [hue * 360, saturation, lightness];
};

const hslToHex = (h: number, s: number, l: number): string => {
  const hue = ((h % 360) + 360) % 360;
  const a = s * Math.min(l, 1 - l);
  const channel = (n: number) => {
    const k = (n + hue / 30) % 12;
    const value = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * value)
      .toString(16)
      .padStart(2, "0");
  };
  return `#${channel(0)}${channel(8)}${channel(4)}`;
};

/** Derives a complementary hue so the aurora background stays in step with the accent. */
const deriveSecondary = (hex: string): string => {
  const [h, s, l] = hexToHsl(hex);
  return hslToHex(h + 40, Math.min(s * 0.85, 1), Math.min(l * 1.05, 0.65));
};

const applyAccentColor = (hex: string) => {
  const root = document.documentElement;
  root.style.setProperty("--primary", hex);
  root.style.setProperty("--primary-rgb", hexToRgb(hex));
  root.style.setProperty("--secondary", deriveSecondary(hex));
};

/** Pushes every presentation-affecting setting into the document. */
const applyPresentation = (value: LauncherSettings) => {
  applyUiScale(value.uiScale);
  applyAnimations(value.animationsEnabled);
  applyAccentColor(value.accentColor);
  setLocale(value.language);
};

// ── Backend sync ──────────────────────────────────────────────────────────────

const applyRemote = (value: LauncherSettings) => {
  applyingRemote = true;
  settings.value = { ...DEFAULTS, ...value };
  applyPresentation(settings.value);
  // Release the guard after Vue has flushed this assignment to the watcher.
  queueMicrotask(() => {
    applyingRemote = false;
  });
};

const loadSettings = async () => {
  try {
    isLoadingSettings.value = true;
    const response = await apiGet<{ success: boolean; settings: LauncherSettings; launcherVersion: string }>(
      "/api/settings",
    );
    launcherVersion.value = response.launcherVersion;
    applyRemote(response.settings);
  } catch (e) {
    error.value = errorMessage(e, "Could not load your settings");
  } finally {
    isLoadingSettings.value = false;
  }
};

const loadDirectories = async () => {
  try {
    const response = await apiGet<{ success: boolean; directories: LauncherDirectory[] }>(
      "/api/settings/directories",
    );
    directories.value = response.directories;
  } catch {
    // Directory listing is informational; a failure must not block the settings screen.
  }
};

/** Persists a partial change immediately, bypassing the debounce. */
const patchSettings = async (partial: Partial<LauncherSettings>) => {
  try {
    isSavingSettings.value = true;
    const response = await apiSend<{ success: boolean; settings: LauncherSettings }>(
      "PATCH",
      "/api/settings",
      partial,
    );
    applyRemote(response.settings);
  } catch (e) {
    error.value = errorMessage(e, "Could not save your settings");
  } finally {
    isSavingSettings.value = false;
  }
};

const resetSettings = async () => {
  try {
    isSavingSettings.value = true;
    const response = await apiSend<{ success: boolean; settings: LauncherSettings }>(
      "POST",
      "/api/settings/reset",
    );
    applyRemote(response.settings);
  } catch (e) {
    error.value = errorMessage(e, "Could not save your settings");
  } finally {
    isSavingSettings.value = false;
  }
};

const openDirectory = async (id: string) => {
  try {
    await apiSend("POST", `/api/settings/directories/${encodeURIComponent(id)}/open`);
  } catch (e) {
    error.value = errorMessage(e, "Could not open the folder");
  }
};

/**
 * Saves edits made directly on the `settings` ref. Writes are debounced so dragging a slider
 * produces one request instead of one per pixel, while presentation updates apply instantly.
 */
watch(
  settings,
  (value) => {
    if (applyingRemote) return;
    applyPresentation(value);
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      void patchSettings(value);
    }, 400);
  },
  { deep: true },
);

// ── Convenience accessors used by components ──────────────────────────────────

const accentColor = computed({
  get: () => settings.value.accentColor,
  set: (value: string) => {
    settings.value.accentColor = value;
  },
});

const uiScale = computed({
  get: () => settings.value.uiScale,
  set: (value: LauncherSettings["uiScale"]) => {
    settings.value.uiScale = value;
  },
});

const animationsEnabled = computed({
  get: () => settings.value.animationsEnabled,
  set: (value: boolean) => {
    settings.value.animationsEnabled = value;
  },
});

const showFps = computed({
  get: () => settings.value.showFps,
  set: (value: boolean) => {
    settings.value.showFps = value;
  },
});

const language = computed({
  get: () => settings.value.language,
  set: (value: LauncherSettings["language"]) => {
    settings.value.language = value;
  },
});

export function useSettings() {
  return {
    activeTab,
    settingsNavItem,
    discoverKind,
    discoverProvider,

    settings,
    directories,
    launcherVersion,
    isLoadingSettings,
    isSavingSettings,

    accentColor,
    uiScale,
    animationsEnabled,
    showFps,
    language,

    loadSettings,
    loadDirectories,
    patchSettings,
    resetSettings,
    openDirectory,
  };
}
