import { computed, ref } from "vue";
import { apiGet, apiSend, buildQuery, errorMessage } from "./api";
import { error, launcherMessage } from "./state";
import { t } from "@/i18n";
import type { LogChunk, LogSource } from "./types";

/**
 * The console panel.
 *
 * Following a running game is done by remembering the byte offset the last read stopped at and
 * asking for everything after it, so a log that has grown to hundreds of megabytes is never
 * re-sent and the panel stays responsive.
 */

const LIVE_POLL_MS = 1200;
/** Lines kept in the panel; a crash loop can produce far more than a browser can render. */
const MAX_LINES = 4000;

const logSources = ref<LogSource[]>([]);
const selectedLogId = ref<string>("");
const logText = ref("");
const isLoadingLogs = ref(false);
const isFollowing = ref(true);
const logTruncated = ref(false);

let nextOffset = 0;
let followTimer: ReturnType<typeof setInterval> | null = null;
let followingInstance = "";

const selectedLog = computed(
  () => logSources.value.find((source) => source.id === selectedLogId.value) ?? null,
);

const hasLogs = computed(() => logSources.value.length > 0);

const instancePath = (name: string) => `/api/instances/${encodeURIComponent(name)}`;

const loadLogSources = async (name: string) => {
  try {
    const response = await apiGet<{ success: boolean; logs: LogSource[] }>(`${instancePath(name)}/logs`);
    logSources.value = response.logs;

    // Default to the launcher console, which is the one that exists even before the game writes
    // anything of its own.
    const stillThere = logSources.value.some((source) => source.id === selectedLogId.value);
    if (!selectedLogId.value || !stillThere) {
      selectedLogId.value = logSources.value.find((source) => source.kind === "launcher")?.id
        ?? logSources.value[0]?.id
        ?? "";
    }
  } catch (e) {
    logSources.value = [];
    error.value = errorMessage(e, t("logs.loadFailed"));
  }
};

/** Reads the tail of a log and replaces what the panel is showing. */
const openLog = async (name: string, logId: string) => {
  selectedLogId.value = logId;
  logText.value = "";
  nextOffset = 0;
  isLoadingLogs.value = true;
  try {
    const chunk = await readChunk(name, logId, -1);
    if (!chunk) return;
    logText.value = chunk.text;
    logTruncated.value = chunk.truncated;
    nextOffset = chunk.nextOffset;
  } finally {
    isLoadingLogs.value = false;
  }
};

/** Appends whatever has been written since the last read. */
const pollLog = async (name: string) => {
  if (!selectedLogId.value) return;
  const chunk = await readChunk(name, selectedLogId.value, nextOffset);
  if (!chunk || chunk.text.length === 0) return;

  // The file was cleared or rotated under us: start the panel over rather than appending
  // new output onto stale lines.
  if (chunk.offset < nextOffset) {
    logText.value = chunk.text;
  } else {
    logText.value += chunk.text;
  }
  nextOffset = chunk.nextOffset;
  logTruncated.value = logTruncated.value || chunk.truncated;
  trimToMaxLines();
};

const trimToMaxLines = () => {
  const lines = logText.value.split("\n");
  if (lines.length <= MAX_LINES) return;
  logText.value = lines.slice(lines.length - MAX_LINES).join("\n");
  logTruncated.value = true;
};

const readChunk = async (name: string, logId: string, offset: number): Promise<LogChunk | null> => {
  try {
    return await apiGet<LogChunk & { success: boolean }>(
      `${instancePath(name)}/logs/${encodeURIComponent(logId)}${buildQuery({ offset })}`,
    );
  } catch (e) {
    stopFollowingLog();
    error.value = errorMessage(e, t("logs.readFailed"));
    return null;
  }
};

export const startFollowingLog = (name: string) => {
  stopFollowingLog();
  followingInstance = name;
  isFollowing.value = true;
  followTimer = setInterval(() => void pollLog(followingInstance), LIVE_POLL_MS);
};

export const stopFollowingLog = () => {
  if (followTimer !== null) {
    clearInterval(followTimer);
    followTimer = null;
  }
  isFollowing.value = false;
};

const toggleFollowing = (name: string) => {
  if (isFollowing.value) stopFollowingLog();
  else startFollowingLog(name);
};

const clearLog = async (name: string) => {
  if (!selectedLogId.value) return;
  try {
    await apiSend("DELETE", `${instancePath(name)}/logs/${encodeURIComponent(selectedLogId.value)}`);
    logText.value = "";
    logTruncated.value = false;
    nextOffset = 0;
  } catch (e) {
    error.value = errorMessage(e, t("logs.clearFailed"));
  }
};

const openLogFolder = async (name: string) => {
  if (!selectedLogId.value) return;
  try {
    await apiSend("POST", `${instancePath(name)}/logs/${encodeURIComponent(selectedLogId.value)}/open-folder`);
  } catch (e) {
    error.value = errorMessage(e, t("logs.openFailed"));
  }
};

const copyLogToClipboard = async () => {
  try {
    await navigator.clipboard.writeText(logText.value);
    launcherMessage.value = t("logs.copied");
  } catch (e) {
    error.value = errorMessage(e, t("logs.copyFailed"));
  }
};

/** The newest crash report, which is what a failed launch should send the user to. */
const loadLatestCrash = async (name: string): Promise<LogSource | null> => {
  try {
    const response = await apiGet<{ success: boolean; log: LogSource | null }>(
      `${instancePath(name)}/logs/latest-crash`,
    );
    return response.log;
  } catch {
    return null;
  }
};

export function useLogs() {
  return {
    logSources,
    selectedLogId,
    selectedLog,
    logText,
    logTruncated,
    hasLogs,
    isLoadingLogs,
    isFollowing,

    loadLogSources,
    openLog,
    pollLog,
    startFollowingLog,
    stopFollowingLog,
    toggleFollowing,
    clearLog,
    openLogFolder,
    copyLogToClipboard,
    loadLatestCrash,
  };
}
