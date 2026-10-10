import { ref } from "vue";
import { apiGet, apiSend, errorMessage } from "./api";
import { error, launcherMessage } from "./state";
import { t } from "@/i18n";
import type { LaunchOptions, LaunchPhase } from "./types";
import { useInstances } from "./useInstances";
import { useSettings } from "./useSettings";

const { selectedInstance, instances, loadInstances } = useInstances();
const { settings } = useSettings();

const isLaunching = ref(false);
const launchPhase = ref<LaunchPhase>("idle");
const launchMessage = ref<string | null>(null);

let launchPollInterval: ReturnType<typeof window.setInterval> | null = null;

export const stopLaunchPolling = () => {
  if (launchPollInterval !== null) {
    window.clearInterval(launchPollInterval);
    launchPollInterval = null;
  }
};

interface LaunchStatus {
  success: boolean;
  phase: LaunchPhase;
  message: string | null;
  instanceName?: string;
  version?: string;
  pid?: number;
  javaMajorVersion?: number;
}

const pollLaunchStatus = async (instanceName: string) => {
  try {
    const status = await apiGet<LaunchStatus>(
      `/api/instances/${encodeURIComponent(instanceName)}/launch-status`,
    );

    launchPhase.value = status.phase;
    launchMessage.value = status.message;

    if (status.phase === "running") {
      isLaunching.value = false;
      launcherMessage.value = t("launch.started", { name: status.instanceName ?? instanceName });
      stopLaunchPolling();
      // Hiding is deferred until the game is actually up: minimising while the launcher is still
      // downloading would leave the user staring at a desktop with no idea what is happening.
      if (shouldHideLauncher(instanceName)) handleWindowMinimize();
      await loadInstances();
    } else if (status.phase === "failed") {
      isLaunching.value = false;
      error.value = status.message ?? t("launch.failed");
      stopLaunchPolling();
    }
  } catch (e) {
    error.value = errorMessage(e, t("launch.failed"));
    isLaunching.value = false;
    stopLaunchPolling();
  }
};

/**
 * Whether the launcher window should get out of the way. The profile's own preference wins over
 * the launcher-wide one, so a single profile can opt in or out.
 */
const shouldHideLauncher = (instanceName: string): boolean => {
  const instance = instances.value.find((entry) => entry.name === instanceName);
  const override = instance?.settings.hideLauncher;
  return override === null || override === undefined ? settings.value.hideLauncherOnLaunch : override;
};

/** Accepts an explicit profile name, or nothing when wired directly to a click handler. */
const resolveInstanceName = (candidate?: unknown): string | undefined =>
  typeof candidate === "string" && candidate ? candidate : selectedInstance.value?.name;

/**
 * Starts a profile.
 *
 * @param options quick play travels with the launch rather than being stored on the profile:
 *                joining one particular server is a property of this launch, not of the profile
 */
const handleLaunch = async (instanceName?: unknown, options?: LaunchOptions) => {
  const name = resolveInstanceName(instanceName);
  if (!name) return;

  try {
    isLaunching.value = true;
    launchPhase.value = "installing";
    launchMessage.value = t("launch.preparing");
    error.value = null;

    await apiSend("POST", `/api/instances/${encodeURIComponent(name)}/launch`, options ?? {});
    stopLaunchPolling();
    launchPollInterval = window.setInterval(() => void pollLaunchStatus(name), 1500);
  } catch (e) {
    error.value = errorMessage(e, t("launch.failed"));
    isLaunching.value = false;
    launchPhase.value = "idle";
    stopLaunchPolling();
  }
};

/** Launches straight into a world, skipping the main menu. */
const handleLaunchWorld = (instanceName: string, worldFolder: string) =>
  handleLaunch(instanceName, { quickPlay: "singleplayer", quickPlayTarget: worldFolder });

/** Launches straight onto a server. */
const handleLaunchServer = (instanceName: string, address: string) =>
  handleLaunch(instanceName, { quickPlay: "multiplayer", quickPlayTarget: address });

const handleStop = async (instanceName?: unknown) => {
  const name = resolveInstanceName(instanceName);
  if (!name) return;

  try {
    isLaunching.value = true;
    error.value = null;
    await apiSend("POST", `/api/instances/${encodeURIComponent(name)}/stop`);
    launcherMessage.value = t("launch.stopped", { name });
    launchPhase.value = "idle";
    stopLaunchPolling();
    await loadInstances();
  } catch (e) {
    error.value = errorMessage(e, t("launch.stopFailed"));
  } finally {
    isLaunching.value = false;
  }
};

// ── Window chrome ─────────────────────────────────────────────────────────────

// The renderer runs with nodeIntegration enabled, so `require` is available at runtime but not
// in the type system.
interface RendererIpc {
  send(channel: string): void;
}

const ipcRenderer = (
  window as unknown as { require?: (module: string) => { ipcRenderer?: RendererIpc } }
).require?.("electron")?.ipcRenderer;

const sendWindowCommand = async (channel: string, endpoint: string) => {
  if (ipcRenderer) {
    ipcRenderer.send(channel);
    return;
  }
  // Running outside Electron (e.g. the Vite dev server in a browser): fall back to the API.
  try {
    await apiSend("POST", endpoint);
  } catch {
    // Nothing to control — harmless in a plain browser.
  }
};

const handleWindowMinimize = () => void sendWindowCommand("window-minimize", "/api/window/minimize");
const handleWindowMaximize = () => void sendWindowCommand("window-maximize", "/api/window/maximize");
const handleWindowClose = () => void sendWindowCommand("window-close", "/api/window/close");

export function useLaunch() {
  return {
    isLaunching,
    launchPhase,
    launchMessage,
    handleLaunch,
    handleLaunchWorld,
    handleLaunchServer,
    handleStop,
    stopLaunchPolling,
    handleWindowMinimize,
    handleWindowMaximize,
    handleWindowClose,
  };
}
