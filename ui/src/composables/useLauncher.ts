import { watch } from "vue";
import { error, launcherMessage } from "./state";
import { pushNotification, useNotifications } from "./useNotifications";
import { stopAuth, useAuth } from "./useAuth";
import { setupInstanceWatchers, teardownInstanceWatchers, useInstances } from "./useInstances";
import { stopLaunchPolling, useLaunch } from "./useLaunch";
import { useSettings } from "./useSettings";
import { useProviders } from "./useProviders";
import { useJava } from "./useJava";
import { useSkins } from "./useSkins";
import { startTaskPolling, stopTaskPolling, useTasks } from "./useTasks";
import { useWorlds } from "./useWorlds";
import { stopFollowingLog, useLogs } from "./useLogs";
import { useBackups } from "./useBackups";
import { useUpdates } from "./useUpdates";
import { useI18n } from "@/i18n";
import {
  formatBytes,
  formatLoaderId,
  formatPlaytime,
  formatRelativeDate,
  formatRelativeIso,
  formatReleaseTime,
  formatVersionType,
  handleImgError,
  loaderOf,
  minecraftVersionOf,
  versionEmoji,
  versionGradient,
} from "./helpers";

// Re-exported so components can import everything from one place.
export type * from "./types";
export type { PendingInstance } from "./useInstances";
export {
  versionEmoji,
  versionGradient,
  formatRelativeDate,
  formatRelativeIso,
  formatVersionType,
  formatReleaseTime,
  formatLoaderId,
  formatPlaytime,
  formatBytes,
  minecraftVersionOf,
  loaderOf,
  handleImgError,
};

/** How often the profile list is refreshed to pick up launch/exit state changes. */
const INSTANCE_POLL_MS = 3000;

let instancePollInterval: ReturnType<typeof window.setInterval> | null = null;
let notificationUnwatchers: Array<() => void> = [];

async function init() {
  const { loadSession } = useAuth();
  const { loadInstances, loadVersions, loadPlatforms, loadGroups, profileSort, favouritesFirst } =
    useInstances();
  const { loadSettings, settings } = useSettings();
  const { loadProviders } = useProviders();
  const { checkForUpdates } = useUpdates();

  // Settings first: they carry the language and accent colour the rest of the UI renders with.
  await loadSettings();

  // The grid's sort order is a preference, so it is restored from the stored settings rather
  // than resetting to "recently played" on every start.
  profileSort.value = settings.value.profileSort;
  favouritesFirst.value = settings.value.favouritesFirst;

  void loadSession();
  void loadPlatforms();
  void loadInstances();
  void loadGroups();
  void loadVersions();
  void loadProviders();
  // A background check so the Updates screen and the badge have an answer before it is opened.
  if (settings.value.autoUpdate) void checkForUpdates(false);

  instancePollInterval = window.setInterval(() => void loadInstances(), INSTANCE_POLL_MS);
  setupInstanceWatchers();
  startTaskPolling();

  notificationUnwatchers = [
    watch(error, (value) => {
      if (value) pushNotification("error", value);
    }),
    watch(launcherMessage, (value) => {
      if (value) pushNotification("info", value);
    }),
  ];
}

function cleanup() {
  stopAuth();
  stopLaunchPolling();
  stopTaskPolling();
  stopFollowingLog();
  useJava().stopAllPolling();

  if (instancePollInterval !== null) {
    window.clearInterval(instancePollInterval);
    instancePollInterval = null;
  }
  teardownInstanceWatchers();

  for (const stop of notificationUnwatchers) stop();
  notificationUnwatchers = [];
}

export function useLauncher() {
  return {
    ...useAuth(),
    ...useInstances(),
    ...useLaunch(),
    ...useNotifications(),
    ...useSettings(),
    ...useProviders(),
    ...useSkins(),
    ...useTasks(),
    ...useWorlds(),
    ...useLogs(),
    ...useBackups(),
    ...useUpdates(),
    ...useI18n(),
    java: useJava(),

    error,
    launcherMessage,

    versionEmoji,
    versionGradient,
    formatRelativeDate,
    formatRelativeIso,
    formatVersionType,
    formatReleaseTime,
    formatLoaderId,
    formatPlaytime,
    formatBytes,
    minecraftVersionOf,
    loaderOf,
    handleImgError,

    init,
    cleanup,
  };
}
