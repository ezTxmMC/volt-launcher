import { ref } from "vue";
import { apiGet, apiSend, errorMessage } from "./api";
import { error, launcherMessage } from "./state";
import { t } from "@/i18n";
import { useTasks } from "./useTasks";
import type { ProfileBackup } from "./types";

/** Profile snapshots: taking one, restoring one and clearing them out. */

const backups = ref<ProfileBackup[]>([]);
const isLoadingBackups = ref(false);
const isBackingUp = ref(false);
const isRestoring = ref(false);
const backupProgress = ref<number>(-1);

const { trackTask } = useTasks();

const instancePath = (name: string) => `/api/instances/${encodeURIComponent(name)}`;

const loadBackups = async (name: string) => {
  try {
    isLoadingBackups.value = true;
    const response = await apiGet<{ success: boolean; backups: ProfileBackup[] }>(
      `${instancePath(name)}/backups`,
    );
    backups.value = response.backups;
  } catch (e) {
    backups.value = [];
    error.value = errorMessage(e, t("backups.loadFailed"));
  } finally {
    isLoadingBackups.value = false;
  }
};

/** Starts a snapshot and waits for the task to finish, reporting progress as it goes. */
const createBackup = async (name: string, label = ""): Promise<boolean> => {
  try {
    isBackingUp.value = true;
    backupProgress.value = -1;
    const response = await apiSend<{ success: boolean; taskId: string }>(
      "POST",
      `${instancePath(name)}/backups`,
      { label },
    );

    const finished = await trackTask(response.taskId, (task) => {
      backupProgress.value = task.percent;
    });
    if (finished?.state === "done") {
      launcherMessage.value = t("backups.created");
      await loadBackups(name);
      return true;
    }
    if (finished?.state === "cancelled") {
      launcherMessage.value = t("backups.cancelled");
      return false;
    }
    error.value = finished?.message ?? t("backups.createFailed");
    return false;
  } catch (e) {
    error.value = errorMessage(e, t("backups.createFailed"));
    return false;
  } finally {
    isBackingUp.value = false;
    backupProgress.value = -1;
  }
};

const restoreBackup = async (name: string, backupId: string): Promise<boolean> => {
  try {
    isRestoring.value = true;
    const response = await apiSend<{ success: boolean; taskId: string }>(
      "POST",
      `${instancePath(name)}/backups/${encodeURIComponent(backupId)}/restore`,
    );

    const finished = await trackTask(response.taskId);
    if (finished?.state === "done") {
      launcherMessage.value = t("backups.restored");
      return true;
    }
    error.value = finished?.message ?? t("backups.restoreFailed");
    return false;
  } catch (e) {
    error.value = errorMessage(e, t("backups.restoreFailed"));
    return false;
  } finally {
    isRestoring.value = false;
  }
};

const deleteBackup = async (name: string, backupId: string): Promise<boolean> => {
  try {
    await apiSend("DELETE", `${instancePath(name)}/backups/${encodeURIComponent(backupId)}`);
    backups.value = backups.value.filter((backup) => backup.id !== backupId);
    return true;
  } catch (e) {
    error.value = errorMessage(e, t("backups.deleteFailed"));
    return false;
  }
};

const openBackupFolder = async (name: string) => {
  try {
    await apiSend("POST", `${instancePath(name)}/backups/open-folder`);
  } catch (e) {
    error.value = errorMessage(e, t("backups.openFailed"));
  }
};

export function useBackups() {
  return {
    backups,
    isLoadingBackups,
    isBackingUp,
    isRestoring,
    backupProgress,

    loadBackups,
    createBackup,
    restoreBackup,
    deleteBackup,
    openBackupFolder,
  };
}
