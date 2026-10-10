import { computed, ref } from "vue";
import { apiGet, apiSend, buildQuery, errorMessage } from "./api";
import { error, launcherMessage } from "./state";
import { t } from "@/i18n";
import type { DiscordStatus, UpdateInfo } from "./types";

/**
 * Launcher self-update and the integration status shown beside it.
 *
 * The launcher deliberately does not overwrite its own files: it downloads the installer for the
 * new release and hands it to the user. Swapping a running application's binaries is
 * platform-specific and a half-applied update leaves nothing that starts.
 */

const updateInfo = ref<UpdateInfo | null>(null);
const isCheckingUpdate = ref(false);
const isDownloadingUpdate = ref(false);
const downloadedUpdatePath = ref("");
const discordStatus = ref<DiscordStatus | null>(null);

const updateAvailable = computed(() => updateInfo.value?.available === true);

const checkForUpdates = async (force = false): Promise<UpdateInfo | null> => {
  try {
    isCheckingUpdate.value = true;
    const response = await apiGet<{ success: boolean; update: UpdateInfo }>(
      `/api/updates${buildQuery({ force })}`,
    );
    updateInfo.value = response.update;
    return response.update;
  } catch (e) {
    error.value = errorMessage(e, t("updates.checkFailed"));
    return null;
  } finally {
    isCheckingUpdate.value = false;
  }
};

const downloadUpdate = async (): Promise<boolean> => {
  try {
    isDownloadingUpdate.value = true;
    const response = await apiSend<{ success: boolean; path: string; fileName: string }>(
      "POST",
      "/api/updates/download",
    );
    downloadedUpdatePath.value = response.path;
    launcherMessage.value = t("updates.downloaded", { file: response.fileName });
    return true;
  } catch (e) {
    error.value = errorMessage(e, t("updates.downloadFailed"));
    return false;
  } finally {
    isDownloadingUpdate.value = false;
  }
};

const openReleasePage = async () => {
  try {
    await apiSend("POST", "/api/updates/open-release");
  } catch (e) {
    error.value = errorMessage(e, t("updates.openFailed"));
  }
};

const loadDiscordStatus = async () => {
  try {
    discordStatus.value = await apiGet<DiscordStatus & { success: boolean }>("/api/integrations/discord");
  } catch {
    // Purely informational; the settings screen renders without it.
    discordStatus.value = null;
  }
};

export function useUpdates() {
  return {
    updateInfo,
    updateAvailable,
    isCheckingUpdate,
    isDownloadingUpdate,
    downloadedUpdatePath,
    discordStatus,

    checkForUpdates,
    downloadUpdate,
    openReleasePage,
    loadDiscordStatus,
  };
}
