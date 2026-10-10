import { computed, ref, watch, type WatchStopHandle } from "vue";
import { apiGet, apiSend, buildQuery, errorMessage } from "./api";
import { error, launcherMessage } from "./state";
import { t } from "@/i18n";
import { useTasks } from "./useTasks";
import type {
  AvailableVersion,
  ContentEntry,
  ContentType,
  ContentUpdate,
  DependencyWarning,
  ExportFormat,
  ExportResult,
  InstanceSettings,
  LauncherInstance,
  ModpackStatus,
  Platform,
  ProfileSort,
  ProjectVersion,
  VerifyReport,
} from "./types";

/** A profile whose creation is still running, shown as a placeholder card. */
export interface PendingInstance {
  id: string;
  name: string;
  versionId: string;
  platformId: string;
  failed: boolean;
  errorMessage?: string;
}

// ── State ─────────────────────────────────────────────────────────────────────

const instances = ref<LauncherInstance[]>([]);
const platforms = ref<Platform[]>([]);
const availableMinecraftVersions = ref<AvailableVersion[]>([]);
const loaderVersions = ref<AvailableVersion[]>([]);

const selectedInstanceName = ref("");
const newInstanceName = ref("");
const selectedPlatformId = ref("vanilla");
const selectedMinecraftVersionId = ref("");
const selectedLoaderVersionId = ref("");

const includeSnapshots = ref(false);
const includeBetas = ref(false);
const includeAlphas = ref(false);

const isCreatingInstance = ref(false);
const isLoadingInstances = ref(false);
const isLoadingVersions = ref(false);
const isLoadingLoaderVersions = ref(false);

const profileFilter = ref("ALL");
const profileSearch = ref("");
const profileSort = ref<ProfileSort>("lastPlayed");
const favouritesFirst = ref(true);
const groupBy = ref(false);
const instanceGroups = ref<string[]>([]);
const pendingInstances = ref<PendingInstance[]>([]);

const showCreateModal = ref(false);
const showEditModal = ref(false);
const showDeleteModal = ref(false);
const editTargetInstance = ref<LauncherInstance | null>(null);
const editNewName = ref("");
const deleteTargetInstance = ref<LauncherInstance | null>(null);

// ── Computed ──────────────────────────────────────────────────────────────────

const selectedInstance = computed(
  () => instances.value.find((instance) => instance.name === selectedInstanceName.value) ?? null,
);
const runningInstancesCount = computed(() => instances.value.filter((instance) => instance.running).length);
const requiresLoaderSelection = computed(() => selectedPlatformId.value !== "vanilla");
const availableVersions = computed(() =>
  requiresLoaderSelection.value ? loaderVersions.value : availableMinecraftVersions.value,
);
const selectedVersionId = computed(() =>
  requiresLoaderSelection.value ? selectedLoaderVersionId.value : selectedMinecraftVersionId.value,
);
const selectedVersion = computed(
  () => availableVersions.value.find((version) => version.id === selectedVersionId.value) ?? null,
);

const SORTERS: Record<ProfileSort, (a: LauncherInstance, b: LauncherInstance) => number> = {
  // A profile that has never been played falls back to when it was created, so a fresh install
  // does not sink to the bottom of the grid.
  lastPlayed: (a, b) => (b.lastPlayedAt || b.createdAt) - (a.lastPlayedAt || a.createdAt),
  name: (a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
  playtime: (a, b) => b.totalPlaytimeMs - a.totalPlaytimeMs,
  created: (a, b) => b.createdAt - a.createdAt,
};

/** Matches a profile against the search box across the fields a user would type. */
const matchesSearch = (instance: LauncherInstance, term: string): boolean => {
  if (!term) return true;
  const needle = term.toLowerCase();
  return (
    instance.name.toLowerCase().includes(needle) ||
    instance.versionId.toLowerCase().includes(needle) ||
    instance.packName.toLowerCase().includes(needle) ||
    instance.groupName.toLowerCase().includes(needle)
  );
};

const filteredInstances = computed(() => {
  const term = profileSearch.value.trim();
  const filter = profileFilter.value;

  const visible = instances.value.filter((instance) => {
    if (filter !== "ALL" && !instance.versionType.toLowerCase().includes(filter.toLowerCase())) {
      return false;
    }
    return matchesSearch(instance, term);
  });

  const sorted = [...visible].sort(SORTERS[profileSort.value] ?? SORTERS.lastPlayed);
  if (!favouritesFirst.value) return sorted;
  // A stable partition rather than a compound comparator: the chosen sort still decides the
  // order inside each half.
  return [...sorted.filter((i) => i.favourite), ...sorted.filter((i) => !i.favourite)];
});

/**
 * The visible profiles bucketed by group, ungrouped last. Only used when grouping is switched
 * on; the flat list stays the default because most people have a handful of profiles.
 */
const groupedInstances = computed(() => {
  const buckets = new Map<string, LauncherInstance[]>();
  for (const instance of filteredInstances.value) {
    const key = instance.groupName || "";
    const bucket = buckets.get(key);
    if (bucket) bucket.push(instance);
    else buckets.set(key, [instance]);
  }

  return [...buckets.entries()]
    .sort(([a], [b]) => {
      if (a === b) return 0;
      if (a === "") return 1;
      if (b === "") return -1;
      return a.localeCompare(b, undefined, { sensitivity: "base" });
    })
    .map(([name, members]) => ({ name, instances: members }));
});

/**
 * Placeholder cards, shown only until the profile record exists. Once it does, the real card
 * takes over and reports actual install progress, so the two never appear at the same time.
 */
const visiblePendingInstances = computed(() => {
  const existing = new Set(instances.value.map((instance) => instance.name.toLowerCase()));
  return pendingInstances.value.filter(
    (pending) => pending.failed || !existing.has(pending.name.toLowerCase()),
  );
});

// ── Data loading ──────────────────────────────────────────────────────────────

const loadGroups = async () => {
  try {
    const response = await apiGet<{ success: boolean; groups: string[] }>("/api/instances/groups");
    instanceGroups.value = response.groups;
  } catch {
    // Groups are a convenience for the picker; failing to load them is not worth a toast.
  }
};

const loadPlatforms = async () => {
  try {
    const response = await apiGet<{ success: boolean; platforms: Platform[] }>("/api/platforms");
    platforms.value = response.platforms;
  } catch (e) {
    error.value = errorMessage(e, "Could not load the mod loaders");
  }
};

const loadInstances = async () => {
  try {
    isLoadingInstances.value = true;
    const response = await apiGet<{ success: boolean; instances: LauncherInstance[] }>("/api/instances");
    instances.value = response.instances;

    const stillExists = instances.value.some((instance) => instance.name === selectedInstanceName.value);
    if (!selectedInstanceName.value || !stillExists) {
      selectedInstanceName.value = instances.value[0]?.name ?? "";
    }
  } catch (e) {
    error.value = errorMessage(e, "Could not load your profiles");
  } finally {
    isLoadingInstances.value = false;
  }
};

const loadVersions = async () => {
  try {
    isLoadingVersions.value = true;
    const response = await apiGet<{ success: boolean; versions: AvailableVersion[] }>(
      `/api/instances/versions${buildQuery({
        includeSnapshots: includeSnapshots.value,
        includeBetas: includeBetas.value,
        includeAlphas: includeAlphas.value,
      })}`,
    );
    availableMinecraftVersions.value = response.versions;

    const stillListed = availableMinecraftVersions.value.some(
      (version) => version.id === selectedMinecraftVersionId.value,
    );
    if (!selectedMinecraftVersionId.value || !stillListed) {
      selectedMinecraftVersionId.value = availableMinecraftVersions.value[0]?.id ?? "";
    }
  } catch (e) {
    error.value = errorMessage(e, "Could not load the Minecraft versions");
  } finally {
    isLoadingVersions.value = false;
  }
};

const loadLoaderVersions = async () => {
  if (!requiresLoaderSelection.value || !selectedMinecraftVersionId.value) {
    loaderVersions.value = [];
    selectedLoaderVersionId.value = "";
    return;
  }
  try {
    isLoadingLoaderVersions.value = true;
    const response = await apiGet<{ success: boolean; versions: AvailableVersion[] }>(
      `/api/instances/loader-versions${buildQuery({
        platformId: selectedPlatformId.value,
        minecraftVersionId: selectedMinecraftVersionId.value,
      })}`,
    );
    loaderVersions.value = response.versions;

    const stillListed = loaderVersions.value.some((version) => version.id === selectedLoaderVersionId.value);
    if (!selectedLoaderVersionId.value || !stillListed) {
      selectedLoaderVersionId.value = loaderVersions.value[0]?.id ?? "";
    }
  } catch (e) {
    // A loader with no build for this Minecraft version is a normal outcome, not a launcher fault.
    loaderVersions.value = [];
    selectedLoaderVersionId.value = "";
    error.value = errorMessage(e, "Could not load the loader versions");
  } finally {
    isLoadingLoaderVersions.value = false;
  }
};

// ── Profile actions ───────────────────────────────────────────────────────────

const markPendingFailed = (pendingId: string, message: string) => {
  const pending = pendingInstances.value.find((entry) => entry.id === pendingId);
  if (pending) {
    pending.failed = true;
    pending.errorMessage = message;
  }
};

const dismissPending = (pendingId: string) => {
  pendingInstances.value = pendingInstances.value.filter((pending) => pending.id !== pendingId);
};

const handleCreateInstance = async () => {
  if (!newInstanceName.value.trim()) {
    error.value = t("profiles.nameRequired");
    return;
  }
  if (!selectedMinecraftVersionId.value) {
    error.value = t("profiles.versionRequired");
    return;
  }
  if (requiresLoaderSelection.value && !selectedLoaderVersionId.value) {
    error.value = t("profiles.loaderRequired");
    return;
  }

  const name = newInstanceName.value.trim();
  const versionId = selectedVersionId.value;
  const platformId = selectedPlatformId.value;

  // Close the dialog straight away — installing takes a while and the card shows progress.
  newInstanceName.value = "";
  showCreateModal.value = false;
  error.value = null;

  const pendingId = `${name}-${Date.now()}`;
  pendingInstances.value.push({ id: pendingId, name, versionId, platformId, failed: false });

  try {
    isCreatingInstance.value = true;
    const response = await apiSend<{ success: boolean; instance: LauncherInstance }>("POST", "/api/instances", {
      name,
      versionId,
    });
    launcherMessage.value = t("profiles.created_toast", { name: response.instance.name });
    dismissPending(pendingId);
    await loadInstances();
    selectedInstanceName.value = response.instance.name;
  } catch (e) {
    markPendingFailed(pendingId, errorMessage(e, t("profiles.createFailed")));
  } finally {
    isCreatingInstance.value = false;
  }
};

const handleDeleteInstance = async (name: string) => {
  try {
    await apiSend("DELETE", `/api/instances/${encodeURIComponent(name)}`);
    launcherMessage.value = t("profiles.deleted_toast", { name });
    if (selectedInstanceName.value === name) selectedInstanceName.value = "";
    showDeleteModal.value = false;
    deleteTargetInstance.value = null;
    await loadInstances();
  } catch (e) {
    error.value = errorMessage(e, t("profiles.deleteFailed"));
  }
};

const handleRenameInstance = async (name: string, newName: string) => {
  if (!newName.trim()) {
    error.value = t("profiles.nameRequired");
    return;
  }
  try {
    const response = await apiSend<{ success: boolean; instance: LauncherInstance }>(
      "PATCH",
      `/api/instances/${encodeURIComponent(name)}`,
      { name: newName.trim() },
    );
    launcherMessage.value = t("profiles.renamed_toast", { name: response.instance.name });
    if (selectedInstanceName.value === name) selectedInstanceName.value = response.instance.name;
    showEditModal.value = false;
    editTargetInstance.value = null;
    editNewName.value = "";
    await loadInstances();
  } catch (e) {
    error.value = errorMessage(e, t("profiles.renameFailed"));
  }
};

const handleUpdateInstanceSettings = async (
  name: string,
  settings: InstanceSettings,
): Promise<boolean> => {
  try {
    const response = await apiSend<{ success: boolean; instance: LauncherInstance }>(
      "PATCH",
      `/api/instances/${encodeURIComponent(name)}/settings`,
      settings,
    );
    const index = instances.value.findIndex((instance) => instance.name === name);
    if (index !== -1) instances.value[index] = response.instance;
    launcherMessage.value = t("common.saved");
    return true;
  } catch (e) {
    error.value = errorMessage(e, t("settings.saveFailed"));
    return false;
  }
};

/**
 * Copies a profile. Runs as a backend task because a modpack profile is gigabytes of files, far
 * more than an HTTP request should be held open for.
 */
const handleDuplicateInstance = async (name: string, newName = ""): Promise<boolean> => {
  const { trackTask } = useTasks();
  try {
    const response = await apiSend<{ success: boolean; taskId: string }>(
      "POST",
      `/api/instances/${encodeURIComponent(name)}/duplicate`,
      { name: newName },
    );

    const finished = await trackTask(response.taskId);
    await loadInstances();
    if (finished?.state === "done") {
      launcherMessage.value = t("profiles.duplicated_toast", { name: finished.message ?? newName });
      return true;
    }
    error.value = finished?.message ?? t("profiles.duplicateFailed");
    return false;
  } catch (e) {
    error.value = errorMessage(e, t("profiles.duplicateFailed"));
    return false;
  }
};

const handleToggleFavourite = async (name: string): Promise<boolean> => {
  const current = instances.value.find((instance) => instance.name === name);
  try {
    const response = await apiSend<{ success: boolean; instance: LauncherInstance }>(
      "POST",
      `/api/instances/${encodeURIComponent(name)}/favourite`,
      { favourite: !current?.favourite },
    );
    replaceInstance(response.instance);
    return true;
  } catch (e) {
    error.value = errorMessage(e, t("profiles.favouriteFailed"));
    return false;
  }
};

const handleSetGroup = async (name: string, group: string): Promise<boolean> => {
  try {
    const response = await apiSend<{ success: boolean; instance: LauncherInstance }>(
      "POST",
      `/api/instances/${encodeURIComponent(name)}/group`,
      { group },
    );
    replaceInstance(response.instance);
    await loadGroups();
    return true;
  } catch (e) {
    error.value = errorMessage(e, t("profiles.groupFailed"));
    return false;
  }
};

const handleSetIcon = async (name: string, iconUrl: string): Promise<boolean> => {
  try {
    const response = await apiSend<{ success: boolean; instance: LauncherInstance }>(
      "POST",
      `/api/instances/${encodeURIComponent(name)}/icon`,
      { iconUrl },
    );
    replaceInstance(response.instance);
    return true;
  } catch (e) {
    error.value = errorMessage(e, t("profiles.iconFailed"));
    return false;
  }
};

/** Writes an updated profile back into the shared list without a full reload. */
const replaceInstance = (updated: LauncherInstance) => {
  const index = instances.value.findIndex((instance) => instance.slug === updated.slug);
  if (index !== -1) instances.value[index] = updated;
};

// ── Verify and repair ─────────────────────────────────────────────────────────

const isVerifying = ref(false);
const verifyProgress = ref(-1);
const verifyReport = ref<VerifyReport | null>(null);

/**
 * Checks a profile's game files and optionally re-downloads the damaged ones.
 *
 * @param deep   also hash every asset object; slow, but the only way to catch silent corruption
 * @param repair delete what is wrong and let the installer fetch it again
 */
const verifyInstance = async (name: string, deep: boolean, repair: boolean): Promise<VerifyReport | null> => {
  const { trackTask } = useTasks();
  try {
    isVerifying.value = true;
    verifyProgress.value = -1;
    verifyReport.value = null;

    const response = await apiSend<{ success: boolean; taskId: string }>(
      "POST",
      `/api/instances/${encodeURIComponent(name)}/verify`,
      { deep, repair },
    );

    const finished = await trackTask(response.taskId, (task) => {
      verifyProgress.value = task.percent;
    });
    if (finished?.state !== "done") {
      error.value = finished?.message ?? t("verify.failed");
      return null;
    }

    const report = await apiGet<{ success: boolean; report: VerifyReport | null }>(
      `/api/instances/${encodeURIComponent(name)}/verify`,
    );
    verifyReport.value = report.report;
    launcherMessage.value = report.report?.healthy ? t("verify.healthy") : t("verify.repaired");
    await loadInstances();
    return report.report;
  } catch (e) {
    error.value = errorMessage(e, t("verify.failed"));
    return null;
  } finally {
    isVerifying.value = false;
    verifyProgress.value = -1;
  }
};

const handleOpenInstanceFolder = async (name: string) => {
  try {
    await apiSend("POST", `/api/instances/${encodeURIComponent(name)}/open-folder`);
  } catch (e) {
    error.value = errorMessage(e, "Could not open the folder");
  }
};

// ── Instance content ──────────────────────────────────────────────────────────

const loadInstanceContent = async (name: string, type: ContentType): Promise<ContentEntry[]> => {
  try {
    const response = await apiGet<{ success: boolean; items: ContentEntry[] }>(
      `/api/instances/${encodeURIComponent(name)}/content/${type}`,
    );
    return response.items;
  } catch (e) {
    error.value = errorMessage(e, t("content.loadFailed"));
    return [];
  }
};

const addInstanceContent = async (name: string, type: ContentType, paths: string[]): Promise<boolean> => {
  try {
    const response = await apiSend<{ success: boolean; added: ContentEntry[]; failures: string[] }>(
      "POST",
      `/api/instances/${encodeURIComponent(name)}/content/${type}`,
      { paths },
    );
    if (response.failures.length > 0) error.value = response.failures.join("; ");
    return response.added.length > 0;
  } catch (e) {
    error.value = errorMessage(e, t("content.addFailed"));
    return false;
  }
};

const removeInstanceContent = async (name: string, type: ContentType, fileName: string): Promise<boolean> => {
  try {
    await apiSend("DELETE", `/api/instances/${encodeURIComponent(name)}/content/${type}/${encodeURIComponent(fileName)}`);
    return true;
  } catch (e) {
    error.value = errorMessage(e, t("content.removeFailed"));
    return false;
  }
};

const toggleInstanceContent = async (
  name: string,
  type: ContentType,
  fileName: string,
): Promise<ContentEntry | null> => {
  try {
    const response = await apiSend<{ success: boolean; item: ContentEntry }>(
      "POST",
      `/api/instances/${encodeURIComponent(name)}/content/${type}/${encodeURIComponent(fileName)}/toggle`,
    );
    return response.item;
  } catch (e) {
    error.value = errorMessage(e, t("content.toggleFailed"));
    return null;
  }
};

/**
 * Switches every file of one kind on or off at once — the fastest way to find out whether a
 * crash comes from the mods or from the profile itself.
 */
const toggleAllContent = async (name: string, type: ContentType, enabled: boolean): Promise<number> => {
  try {
    const response = await apiSend<{ success: boolean; changed: number }>(
      "POST",
      `/api/instances/${encodeURIComponent(name)}/content/${type}/toggle-all`,
      { enabled },
    );
    return response.changed;
  } catch (e) {
    error.value = errorMessage(e, t("content.toggleFailed"));
    return 0;
  }
};

/** Required dependencies that are missing or switched off among the installed files. */
const loadDependencyWarnings = async (name: string, type: ContentType): Promise<DependencyWarning[]> => {
  try {
    const response = await apiGet<{ success: boolean; warnings: DependencyWarning[] }>(
      `/api/instances/${encodeURIComponent(name)}/content/${type}/dependencies`,
    );
    return response.warnings;
  } catch {
    // Dependency data only exists for files installed through a provider; its absence is normal.
    return [];
  }
};

// ── Content version management ────────────────────────────────────────────────

/**
 * Matches files with no known origin against the providers by their contents, so a hand-added or
 * pack-bundled jar becomes manageable. Returns how many were newly identified.
 */
const identifyContent = async (name: string, type: ContentType): Promise<number> => {
  try {
    const response = await apiSend<{ success: boolean; identified: number }>(
      "POST",
      `/api/instances/${encodeURIComponent(name)}/content/${type}/identify`,
    );
    return response.identified;
  } catch (e) {
    error.value = errorMessage(e, t("content.identifyFailed"));
    return 0;
  }
};

/** Newer releases for every tracked file of one kind. Empty when nothing is out of date. */
const checkContentUpdates = async (name: string, type: ContentType): Promise<ContentUpdate[]> => {
  try {
    const response = await apiGet<{ success: boolean; updates: ContentUpdate[] }>(
      `/api/instances/${encodeURIComponent(name)}/content/${type}/updates`,
    );
    return response.updates;
  } catch (e) {
    error.value = errorMessage(e, t("content.updateCheckFailed"));
    return [];
  }
};

/** Every release of the project behind one installed file, for rolling forward or back. */
const loadContentVersions = async (
  name: string,
  type: ContentType,
  fileName: string,
): Promise<ProjectVersion[]> => {
  try {
    const response = await apiGet<{ success: boolean; versions: ProjectVersion[] }>(
      `/api/instances/${encodeURIComponent(name)}/content/${type}/${encodeURIComponent(fileName)}/versions`,
    );
    return response.versions;
  } catch (e) {
    error.value = errorMessage(e, t("content.versionsFailed"));
    return [];
  }
};

const changeContentVersion = async (
  name: string,
  type: ContentType,
  fileName: string,
  versionId: string,
): Promise<boolean> => {
  try {
    await apiSend("POST", `/api/instances/${encodeURIComponent(name)}/content/${type}/${encodeURIComponent(fileName)}/version`, {
      versionId,
    });
    launcherMessage.value = t("content.versionChanged");
    return true;
  } catch (e) {
    error.value = errorMessage(e, t("content.versionChangeFailed"));
    return false;
  }
};

// ── Modpack lifecycle ─────────────────────────────────────────────────────────

const loadModpackStatus = async (name: string): Promise<ModpackStatus | null> => {
  try {
    return await apiGet<ModpackStatus & { success: boolean }>(
      `/api/instances/${encodeURIComponent(name)}/modpack`,
    );
  } catch {
    // A profile with no pack is the normal case, not an error worth a toast.
    return null;
  }
};

const loadModpackVersions = async (name: string): Promise<ProjectVersion[]> => {
  try {
    const response = await apiGet<{ success: boolean; versions: ProjectVersion[] }>(
      `/api/instances/${encodeURIComponent(name)}/modpack/versions`,
    );
    return response.versions;
  } catch (e) {
    error.value = errorMessage(e, t("content.versionsFailed"));
    return [];
  }
};

/** Starts a pack update and returns its job id, or null when it could not be started. */
const startModpackUpdate = async (name: string, versionId: string): Promise<string | null> => {
  try {
    const response = await apiSend<{ success: boolean; jobId: string }>(
      "POST",
      `/api/instances/${encodeURIComponent(name)}/modpack/update`,
      { versionId },
    );
    return response.jobId;
  } catch (e) {
    error.value = errorMessage(e, t("modpack.updateFailed"));
    return null;
  }
};

const exportInstance = async (
  name: string,
  format: ExportFormat,
  version: string,
): Promise<ExportResult | null> => {
  try {
    return await apiSend<ExportResult & { success: boolean }>(
      "POST",
      `/api/instances/${encodeURIComponent(name)}/export`,
      { format, version },
    );
  } catch (e) {
    error.value = errorMessage(e, t("export.failed"));
    return null;
  }
};

// ── Watchers ──────────────────────────────────────────────────────────────────

let versionsUnwatch: WatchStopHandle | null = null;
let platformUnwatch: WatchStopHandle | null = null;
let minecraftVersionUnwatch: WatchStopHandle | null = null;

export function setupInstanceWatchers() {
  teardownInstanceWatchers();

  versionsUnwatch = watch([includeSnapshots, includeBetas, includeAlphas], () => void loadVersions());

  platformUnwatch = watch(selectedPlatformId, () => {
    if (!requiresLoaderSelection.value) {
      loaderVersions.value = [];
      selectedLoaderVersionId.value = "";
      return;
    }
    void loadLoaderVersions();
  });

  minecraftVersionUnwatch = watch(selectedMinecraftVersionId, () => {
    if (requiresLoaderSelection.value) void loadLoaderVersions();
  });
}

export function teardownInstanceWatchers() {
  versionsUnwatch?.();
  platformUnwatch?.();
  minecraftVersionUnwatch?.();
  versionsUnwatch = null;
  platformUnwatch = null;
  minecraftVersionUnwatch = null;
}

export function useInstances() {
  return {
    instances,
    platforms,
    availableMinecraftVersions,
    loaderVersions,
    availableVersions,
    selectedInstanceName,
    newInstanceName,
    selectedVersionId,
    selectedPlatformId,
    selectedMinecraftVersionId,
    selectedLoaderVersionId,
    includeSnapshots,
    includeBetas,
    includeAlphas,
    isCreatingInstance,
    isLoadingInstances,
    isLoadingVersions,
    isLoadingLoaderVersions,
    profileFilter,
    profileSearch,
    profileSort,
    favouritesFirst,
    groupBy,
    instanceGroups,
    pendingInstances,
    visiblePendingInstances,
    showCreateModal,
    showEditModal,
    showDeleteModal,
    editTargetInstance,
    editNewName,
    deleteTargetInstance,
    selectedInstance,
    runningInstancesCount,
    requiresLoaderSelection,
    selectedVersion,
    filteredInstances,
    groupedInstances,

    isVerifying,
    verifyProgress,
    verifyReport,

    loadPlatforms,
    loadInstances,
    loadGroups,
    loadVersions,
    loadLoaderVersions,
    dismissPending,

    handleCreateInstance,
    handleDeleteInstance,
    handleRenameInstance,
    handleDuplicateInstance,
    handleToggleFavourite,
    handleSetGroup,
    handleSetIcon,
    handleOpenInstanceFolder,
    handleUpdateInstanceSettings,
    verifyInstance,

    loadInstanceContent,
    addInstanceContent,
    removeInstanceContent,
    toggleInstanceContent,
    toggleAllContent,
    loadDependencyWarnings,

    identifyContent,
    checkContentUpdates,
    loadContentVersions,
    changeContentVersion,

    loadModpackStatus,
    loadModpackVersions,
    startModpackUpdate,
    exportInstance,
  };
}
