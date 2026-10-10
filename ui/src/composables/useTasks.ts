import { computed, ref } from "vue";
import { apiGet, apiSend, errorMessage } from "./api";
import { error } from "./state";
import type { LauncherTask } from "./types";

/**
 * The launcher's own activity, in one place.
 *
 * Every long-running operation — modpack installs, backups, repairs, duplications, update
 * downloads — registers with the backend's task registry, so this is the single poller the UI
 * needs rather than one per feature screen.
 */

const tasks = ref<LauncherTask[]>([]);
const isLoadingTasks = ref(false);

/** How often the list is refreshed while something is running. */
const ACTIVE_POLL_MS = 900;
/** A slower beat when nothing is running, so a task started elsewhere still shows up. */
const IDLE_POLL_MS = 5000;

let pollTimer: ReturnType<typeof setTimeout> | null = null;

const runningTasks = computed(() => tasks.value.filter((task) => task.state === "running"));
const runningCount = computed(() => runningTasks.value.length);
const hasFailedTasks = computed(() => tasks.value.some((task) => task.state === "failed"));

/** Overall progress across everything running, or -1 when none of it is countable. */
const overallPercent = computed(() => {
  const countable = runningTasks.value.filter((task) => task.percent >= 0);
  if (countable.length === 0) return -1;
  const sum = countable.reduce((total, task) => total + task.percent, 0);
  return Math.round(sum / countable.length);
});

const loadTasks = async () => {
  try {
    isLoadingTasks.value = true;
    const response = await apiGet<{ success: boolean; tasks: LauncherTask[] }>("/api/tasks");
    tasks.value = response.tasks;
  } catch {
    // The task list is informational; a failed poll must not raise a toast on every beat.
  } finally {
    isLoadingTasks.value = false;
  }
};

/** Re-schedules itself, fast while work is in flight and slowly when it is not. */
const scheduleNextPoll = () => {
  stopTaskPolling();
  pollTimer = setTimeout(
    () => {
      void loadTasks().then(scheduleNextPoll);
    },
    runningCount.value > 0 ? ACTIVE_POLL_MS : IDLE_POLL_MS,
  );
};

export const startTaskPolling = () => {
  void loadTasks().then(scheduleNextPoll);
};

export const stopTaskPolling = () => {
  if (pollTimer !== null) {
    clearTimeout(pollTimer);
    pollTimer = null;
  }
};

/**
 * Follows one task to completion.
 *
 * @returns the finished task, so the caller can tell success from failure and read its message
 */
const trackTask = async (taskId: string, onProgress?: (task: LauncherTask) => void): Promise<LauncherTask | null> =>
  new Promise((resolve) => {
    const poll = window.setInterval(async () => {
      try {
        const response = await apiGet<{ success: boolean; task: LauncherTask }>(
          `/api/tasks/${encodeURIComponent(taskId)}`,
        );
        onProgress?.(response.task);
        if (response.task.state !== "running") {
          window.clearInterval(poll);
          void loadTasks();
          resolve(response.task);
        }
      } catch {
        // A task swept from the registry cannot be followed any further.
        window.clearInterval(poll);
        resolve(null);
      }
    }, 700);
  });

const cancelTask = async (taskId: string) => {
  try {
    await apiSend("POST", `/api/tasks/${encodeURIComponent(taskId)}/cancel`);
    await loadTasks();
  } catch (e) {
    error.value = errorMessage(e, "Could not cancel that task");
  }
};

const dismissTask = async (taskId: string) => {
  try {
    await apiSend("DELETE", `/api/tasks/${encodeURIComponent(taskId)}`);
    tasks.value = tasks.value.filter((task) => task.id !== taskId);
  } catch (e) {
    error.value = errorMessage(e, "Could not clear that task");
  }
};

const clearFinishedTasks = async () => {
  try {
    await apiSend("DELETE", "/api/tasks");
    tasks.value = tasks.value.filter((task) => task.state === "running");
  } catch (e) {
    error.value = errorMessage(e, "Could not clear the finished tasks");
  }
};

export function useTasks() {
  return {
    tasks,
    isLoadingTasks,
    runningTasks,
    runningCount,
    hasFailedTasks,
    overallPercent,

    loadTasks,
    trackTask,
    cancelTask,
    dismissTask,
    clearFinishedTasks,
    startTaskPolling,
    stopTaskPolling,
  };
}
