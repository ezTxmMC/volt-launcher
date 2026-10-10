import { ref } from "vue";
import { APP_API_BASE, apiGet, apiSend, errorMessage } from "./api";
import { error, launcherMessage } from "./state";
import { t } from "@/i18n";
import type { GameWorld, Screenshot, ServerEntry } from "./types";

/**
 * The contents of a profile's game directory that belong to the player rather than to the
 * launcher: worlds, the multiplayer list and screenshots.
 */

const worlds = ref<GameWorld[]>([]);
const servers = ref<ServerEntry[]>([]);
const screenshots = ref<Screenshot[]>([]);

const isLoadingWorlds = ref(false);
const isLoadingServers = ref(false);
const isLoadingScreenshots = ref(false);

const instancePath = (name: string) => `/api/instances/${encodeURIComponent(name)}`;

// ── Worlds ────────────────────────────────────────────────────────────────────

const loadWorlds = async (name: string) => {
  try {
    isLoadingWorlds.value = true;
    const response = await apiGet<{ success: boolean; worlds: GameWorld[] }>(`${instancePath(name)}/worlds`);
    worlds.value = response.worlds;
  } catch (e) {
    worlds.value = [];
    error.value = errorMessage(e, t("worlds.loadFailed"));
  } finally {
    isLoadingWorlds.value = false;
  }
};

const deleteWorld = async (name: string, folderName: string): Promise<boolean> => {
  try {
    await apiSend("DELETE", `${instancePath(name)}/worlds/${encodeURIComponent(folderName)}`);
    launcherMessage.value = t("worlds.deleted");
    await loadWorlds(name);
    return true;
  } catch (e) {
    error.value = errorMessage(e, t("worlds.deleteFailed"));
    return false;
  }
};

const duplicateWorld = async (name: string, folderName: string, newName = ""): Promise<boolean> => {
  try {
    await apiSend("POST", `${instancePath(name)}/worlds/${encodeURIComponent(folderName)}/duplicate`, {
      name: newName,
    });
    launcherMessage.value = t("worlds.duplicated");
    await loadWorlds(name);
    return true;
  } catch (e) {
    error.value = errorMessage(e, t("worlds.duplicateFailed"));
    return false;
  }
};

const copyWorldToInstance = async (
  name: string,
  folderName: string,
  targetInstance: string,
): Promise<boolean> => {
  try {
    await apiSend("POST", `${instancePath(name)}/worlds/${encodeURIComponent(folderName)}/copy-to`, {
      instance: targetInstance,
    });
    launcherMessage.value = t("worlds.copied", { profile: targetInstance });
    return true;
  } catch (e) {
    error.value = errorMessage(e, t("worlds.copyFailed"));
    return false;
  }
};

const renameWorld = async (name: string, folderName: string, newName: string): Promise<boolean> => {
  try {
    await apiSend("PATCH", `${instancePath(name)}/worlds/${encodeURIComponent(folderName)}`, {
      name: newName,
    });
    await loadWorlds(name);
    return true;
  } catch (e) {
    error.value = errorMessage(e, t("worlds.renameFailed"));
    return false;
  }
};

/** Cache-busted so a freshly written icon replaces the one the browser already holds. */
const worldIconUrl = (name: string, world: GameWorld) =>
  `${APP_API_BASE}${instancePath(name)}/worlds/${encodeURIComponent(world.folderName)}/icon?v=${world.lastPlayed}`;

// ── Servers ───────────────────────────────────────────────────────────────────

const loadServers = async (name: string) => {
  try {
    isLoadingServers.value = true;
    const response = await apiGet<{ success: boolean; servers: ServerEntry[] }>(`${instancePath(name)}/servers`);
    servers.value = response.servers;
  } catch (e) {
    servers.value = [];
    error.value = errorMessage(e, t("servers.loadFailed"));
  } finally {
    isLoadingServers.value = false;
  }
};

const addServer = async (name: string, serverName: string, address: string): Promise<boolean> => {
  try {
    await apiSend("POST", `${instancePath(name)}/servers`, { name: serverName, address });
    await loadServers(name);
    return true;
  } catch (e) {
    error.value = errorMessage(e, t("servers.addFailed"));
    return false;
  }
};

const removeServer = async (name: string, index: number): Promise<boolean> => {
  try {
    await apiSend("DELETE", `${instancePath(name)}/servers/${index}`);
    await loadServers(name);
    return true;
  } catch (e) {
    error.value = errorMessage(e, t("servers.removeFailed"));
    return false;
  }
};

// ── Screenshots ───────────────────────────────────────────────────────────────

const loadScreenshots = async (name: string) => {
  try {
    isLoadingScreenshots.value = true;
    const response = await apiGet<{ success: boolean; screenshots: Screenshot[] }>(
      `${instancePath(name)}/screenshots`,
    );
    screenshots.value = response.screenshots;
  } catch (e) {
    screenshots.value = [];
    error.value = errorMessage(e, t("screenshots.loadFailed"));
  } finally {
    isLoadingScreenshots.value = false;
  }
};

const deleteScreenshot = async (name: string, fileName: string): Promise<boolean> => {
  try {
    await apiSend("DELETE", `${instancePath(name)}/screenshots/${encodeURIComponent(fileName)}`);
    screenshots.value = screenshots.value.filter((entry) => entry.fileName !== fileName);
    return true;
  } catch (e) {
    error.value = errorMessage(e, t("screenshots.deleteFailed"));
    return false;
  }
};

const openScreenshotFolder = async (name: string) => {
  try {
    await apiSend("POST", `${instancePath(name)}/screenshots/open-folder`);
  } catch (e) {
    error.value = errorMessage(e, t("screenshots.openFailed"));
  }
};

const screenshotUrl = (name: string, fileName: string) =>
  `${APP_API_BASE}${instancePath(name)}/screenshots/${encodeURIComponent(fileName)}/image`;

/**
 * Copies a screenshot to the clipboard as an image.
 *
 * The API serves the file rather than a data URL, so it is fetched here and handed to the
 * clipboard as a blob — which is the only form a paste target accepts as an actual image.
 */
const copyScreenshotToClipboard = async (name: string, fileName: string): Promise<boolean> => {
  try {
    const response = await fetch(screenshotUrl(name, fileName));
    const blob = await response.blob();
    const item = new ClipboardItem({ [blob.type || "image/png"]: blob });
    await navigator.clipboard.write([item]);
    launcherMessage.value = t("screenshots.copied");
    return true;
  } catch (e) {
    error.value = errorMessage(e, t("screenshots.copyFailed"));
    return false;
  }
};

export function useWorlds() {
  return {
    worlds,
    servers,
    screenshots,
    isLoadingWorlds,
    isLoadingServers,
    isLoadingScreenshots,

    loadWorlds,
    deleteWorld,
    duplicateWorld,
    copyWorldToInstance,
    renameWorld,
    worldIconUrl,

    loadServers,
    addServer,
    removeServer,

    loadScreenshots,
    deleteScreenshot,
    openScreenshotFolder,
    screenshotUrl,
    copyScreenshotToClipboard,
  };
}
