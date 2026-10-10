<script setup lang="ts">
import { ref, reactive, computed, nextTick, watch } from "vue";
import { Icon } from "@iconify/vue";
import { useLauncher } from '@/composables/useLauncher';
import InstallProgress from '@/components/discover/InstallProgress.vue';
import ProfileCard from '@/components/profile/ProfileCard.vue';
import WorldsPanel from '@/components/profile/WorldsPanel.vue';
import ServersPanel from '@/components/profile/ServersPanel.vue';
import ScreenshotsPanel from '@/components/profile/ScreenshotsPanel.vue';
import LogsPanel from '@/components/profile/LogsPanel.vue';
import BackupsPanel from '@/components/profile/BackupsPanel.vue';
import { useShortcuts } from '@/composables/useShortcuts';
import type {
  LauncherInstance,
  ContentEntry,
  ContentType,
  ContentUpdate,
  DependencyWarning,
  ExportFormat,
  ExportResult,
  InstanceSettings,
  ModpackStatus,
  ProfileSort,
  ProjectVersion,
} from '@/composables/useLauncher';

const {
  t,
  authData,
  activeTab,
  showCreateModal,
  showEditModal,
  showDeleteModal,
  editTargetInstance,
  editNewName,
  deleteTargetInstance,
  profileFilter,
  profileSearch,
  profileSort,
  favouritesFirst,
  groupBy,
  instanceGroups,
  selectedInstanceName,
  instances,
  filteredInstances,
  groupedInstances,
  settings,
  patchSettings,
  pendingInstances,
  visiblePendingInstances,
  isLoadingInstances,
  isLaunching,
  versionEmoji,
  formatRelativeDate,
  formatRelativeIso,
  formatLoaderId,
  handleImgError,
  handleDeleteInstance,
  handleRenameInstance,
  handleDuplicateInstance,
  handleToggleFavourite,
  handleSetGroup,
  handleSetIcon,
  handleOpenInstanceFolder,
  handleLaunch,
  handleUpdateInstanceSettings,
  verifyInstance,
  isVerifying,
  verifyProgress,
  verifyReport,
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
  importModpack,
  trackModpackJob,
  loadInstances,
  loadGroups,
  openDirectory,
  launcherMessage,
  formatPlaytime,
  formatBytes,
  error,
} = useLauncher();

const filters = ['ALL', 'RELEASE', 'SNAPSHOT', 'NEOFORGE', 'FORGE', 'FABRIC', 'QUILT'];

const versionGradientClass = (type: string) => ({
  release: 'bg-[linear-gradient(135deg,#0d3a18,#184d22)]',
  snapshot: 'bg-[linear-gradient(135deg,#0a2040,#001535)]',
  old_beta: 'bg-[linear-gradient(135deg,#3a1a08,#5a2a10)]',
  old_alpha: 'bg-[linear-gradient(135deg,#4d0f0f,#7a1a1a)]',
}[type] ?? 'bg-[linear-gradient(135deg,#0a1535,#122050)]');

// ── Manage view ───────────────────────────────────────────────────────────────
// Only the name is held; the profile itself is looked up in the live list on every render. A
// snapshot would freeze at whatever the profile looked like when the view opened and would go
// stale the moment the three-second poll refreshed the list.
const managingInstanceName = ref<string | null>(null);
const managingInstance = computed(
  () => instances.value.find((inst) => inst.name === managingInstanceName.value) ?? null,
);

function openManage(inst: LauncherInstance) {
  // A profile mid-install has no stable content to manage yet.
  if (inst.busy) return;
  managingInstanceName.value = inst.name;
}

function closeManage() {
  managingInstanceName.value = null;
}

/** Keeps the manage view on the same profile after a rename, instead of dropping back to the grid. */
async function renameManaged(oldName: string, newName: string) {
  const trimmed = newName.trim();
  await handleRenameInstance(oldName, trimmed);
  if (managingInstanceName.value === oldName && instances.value.some((i) => i.name === trimmed)) {
    managingInstanceName.value = trimmed;
  }
}

// ── Play action ───────────────────────────────────────────────────────────────
function playInstance(inst: LauncherInstance) {
  // Belt and braces: the button is hidden while busy, but this is also reachable by keyboard.
  if (inst.busy) return;
  selectInstance(inst);

  // "Open logs on launch" means exactly that: the console is what someone wants in front of them
  // when they are watching a modded profile start.
  if (settings.value.openLogsOnLaunch) {
    managingInstanceName.value = inst.name;
    void nextTick(() => openPanel('logs'));
  }
  void handleLaunch(inst.name);
}

// ── Select action ───────────────────────────────────────────────────────────────
function selectInstance(inst: LauncherInstance) {
  selectedInstanceName.value = inst.name;
}

// ── Grid controls ─────────────────────────────────────────────────────────────
const searchInput = ref<HTMLInputElement | null>(null);

const SORT_OPTIONS: Array<{ id: ProfileSort; labelKey: string }> = [
  { id: 'lastPlayed', labelKey: 'profiles.sortLastPlayed' },
  { id: 'name', labelKey: 'profiles.sortName' },
  { id: 'playtime', labelKey: 'profiles.sortPlaytime' },
  { id: 'created', labelKey: 'profiles.sortCreated' },
];

/** Sort order and the favourites toggle are preferences, so they are persisted. */
function changeSort(next: ProfileSort) {
  profileSort.value = next;
  void patchSettings({ profileSort: next });
}

function toggleFavouritesFirst() {
  favouritesFirst.value = !favouritesFirst.value;
  void patchSettings({ favouritesFirst: favouritesFirst.value });
}

// Escape clears the search rather than closing the manage view, which is what a user pressing it
// with text in the box actually means.
useShortcuts([
  {
    key: 'f',
    ctrl: true,
    run: () => {
      if (activeTab.value !== 'profiles') return;
      managingInstanceName.value = null;
      void nextTick(() => searchInput.value?.focus());
    },
  },
  {
    key: 'Escape',
    allowInInput: true,
    run: () => {
      if (activeTab.value !== 'profiles') return;
      if (profileSearch.value) { profileSearch.value = ''; return; }
      if (activePanel.value) { activePanel.value = null; return; }
      if (managingInstanceName.value) closeManage();
    },
  },
]);

// ── Duplicate, folder and verify ──────────────────────────────────────────────
const duplicateTarget = ref<LauncherInstance | null>(null);
const duplicateName = ref('');
const isDuplicating = ref(false);

function startDuplicate(inst: LauncherInstance) {
  duplicateTarget.value = inst;
  duplicateName.value = `${inst.name} (copy)`;
  closeMenu();
}

async function confirmDuplicate() {
  const target = duplicateTarget.value;
  if (!target) return;
  isDuplicating.value = true;
  await handleDuplicateInstance(target.name, duplicateName.value.trim());
  isDuplicating.value = false;
  duplicateTarget.value = null;
}

const groupTarget = ref<LauncherInstance | null>(null);
const groupValue = ref('');

function startGroup(inst: LauncherInstance) {
  groupTarget.value = inst;
  groupValue.value = inst.groupName;
  closeMenu();
}

async function confirmGroup() {
  const target = groupTarget.value;
  if (!target) return;
  await handleSetGroup(target.name, groupValue.value.trim());
  groupTarget.value = null;
}

const showVerifyModal = ref(false);
const verifyDeep = ref(false);

function openVerify() {
  verifyReport.value = null;
  verifyDeep.value = false;
  showVerifyModal.value = true;
  closeMenu();
}

async function runVerify(repair: boolean) {
  if (!managingInstance.value) return;
  await verifyInstance(managingInstance.value.name, verifyDeep.value, repair);
}

// ── 3-dot menu ────────────────────────────────────────────────────────────────
const openMenuSlug = ref<string | null>(null);

function toggleMenu(slug: string) {
  openMenuSlug.value = openMenuSlug.value === slug ? null : slug;
}

function closeMenu() {
  openMenuSlug.value = null;
}

function startEdit(inst: LauncherInstance) {
  editTargetInstance.value = inst;
  editNewName.value = inst.name;
  showEditModal.value = true;
  closeMenu();
}

function startDelete(inst: LauncherInstance) {
  deleteTargetInstance.value = inst;
  showDeleteModal.value = true;
  closeMenu();
}

function openFolder(inst: LauncherInstance) {
  void handleOpenInstanceFolder(inst.name);
  closeMenu();
}

// ── Manage view panels (content + settings) ────────────────────────────────────
/** Everything the manage view can show on its right-hand side. */
type Panel = ContentType | 'settings' | 'worlds' | 'servers' | 'screenshots' | 'logs' | 'backups' | null;
const activePanel = ref<Panel>(null);
const contentItems = ref<ContentEntry[]>([]);
const isLoadingContent = ref(false);
const isDragging = ref(false);
const fileInput = ref<HTMLInputElement | null>(null);

const CONTENT_PANEL_IDS: ContentType[] = ['mods', 'resourcepacks', 'shaderpacks', 'datapacks'];

const CONTENT_LABELS: Record<ContentType, string> = {
  mods: 'Mods',
  resourcepacks: 'Resource Packs',
  shaderpacks: 'Shaders',
  datapacks: 'Data Packs',
};

const isLoaderInstance = computed(() => {
  const t = managingInstance.value?.versionType;
  return t === 'fabric' || t === 'forge' || t === 'neoforge' || t === 'quilt';
});

const isContentPanel = computed(
  () => activePanel.value !== null && CONTENT_PANEL_IDS.includes(activePanel.value as ContentType),
);
const activeContentType = computed(() => (isContentPanel.value ? (activePanel.value as ContentType) : null));

// Reset panels only when switching to a *different* profile, not on in-place updates.
watch(() => managingInstance.value?.name, () => {
  activePanel.value = null;
  contentItems.value = [];
  contentSearch.value = '';
  dependencyWarnings.value = [];
});

const CONTENT_PANELS: Panel[] = ['mods', 'resourcepacks', 'shaderpacks', 'datapacks'];

async function openPanel(panel: Panel) {
  activePanel.value = panel;
  if (panel === 'settings') { loadSettingsForm(); return; }
  // The dedicated panels load their own data through their own watchers.
  if (panel && CONTENT_PANELS.includes(panel)) await refreshContent(panel as ContentType);
}

async function refreshContent(type: ContentType) {
  if (!managingInstance.value) return;
  isLoadingContent.value = true;
  contentItems.value = await loadInstanceContent(managingInstance.value.name, type);
  isLoadingContent.value = false;
  // Update state belongs to the file list that produced it.
  contentUpdates.value = [];
  hasCheckedUpdates.value = false;
  await refreshDependencyWarnings();
}

// ── Content filtering and bulk actions ────────────────────────────────────────
const contentSearch = ref('');
const isTogglingAll = ref(false);
const dependencyWarnings = ref<DependencyWarning[]>([]);

const visibleContentItems = computed(() => {
  const needle = contentSearch.value.trim().toLowerCase();
  if (!needle) return contentItems.value;
  return contentItems.value.filter((item) =>
    item.fileName.toLowerCase().includes(needle)
    || (item.source?.projectName ?? '').toLowerCase().includes(needle),
  );
});

const enabledContentCount = computed(() => contentItems.value.filter((item) => item.enabled).length);

/** Warnings keyed by the file that declared the dependency, for the row-level badge. */
const warningsFor = (fileName: string) =>
  dependencyWarnings.value.filter((warning) => warning.fileName === fileName);

async function onToggleAll(enabled: boolean) {
  const type = activeContentType.value;
  if (!managingInstance.value || !type) return;
  isTogglingAll.value = true;
  const changed = await toggleAllContent(managingInstance.value.name, type, enabled);
  isTogglingAll.value = false;
  if (changed > 0) await refreshContent(type);
}

async function refreshDependencyWarnings() {
  const type = activeContentType.value;
  if (!managingInstance.value || !type) {
    dependencyWarnings.value = [];
    return;
  }
  dependencyWarnings.value = await loadDependencyWarnings(managingInstance.value.name, type);
}

// ── Content version management ────────────────────────────────────────────────
const contentUpdates = ref<ContentUpdate[]>([]);
const hasCheckedUpdates = ref(false);
const isCheckingUpdates = ref(false);
const updatingFiles = ref<string[]>([]);

/** The pending update for one file, or undefined when it is current. */
const updateFor = (fileName: string) => contentUpdates.value.find((u) => u.fileName === fileName);

/**
 * Identifying unknown files runs first: a jar the launcher did not install has no project behind
 * it, so it would be skipped by the update sweep entirely — which reads as "this mod never
 * updates" rather than "the launcher does not know what it is".
 */
async function onCheckUpdates() {
  const type = activeContentType.value;
  if (!managingInstance.value || !type) return;
  const name = managingInstance.value.name;

  isCheckingUpdates.value = true;
  const identified = await identifyContent(name, type);
  if (identified > 0) {
    contentItems.value = await loadInstanceContent(name, type);
    launcherMessage.value = t('content.identified', { n: identified });
  }
  contentUpdates.value = await checkContentUpdates(name, type);
  isCheckingUpdates.value = false;
  hasCheckedUpdates.value = true;
}

async function applyUpdate(update: ContentUpdate) {
  const type = activeContentType.value;
  if (!managingInstance.value || !type) return;
  updatingFiles.value = [...updatingFiles.value, update.fileName];
  const ok = await changeContentVersion(
    managingInstance.value.name, type, update.fileName, update.latestVersionId);
  updatingFiles.value = updatingFiles.value.filter((f) => f !== update.fileName);
  if (ok) {
    contentUpdates.value = contentUpdates.value.filter((u) => u.fileName !== update.fileName);
    await refreshContent(type);
    // refreshContent clears the list, so put back what is still pending.
    contentUpdates.value = contentUpdates.value.filter((u) => u.fileName !== update.fileName);
  }
}

/** Updates sequentially — the backend marks the profile busy for each one. */
async function applyAllUpdates() {
  const type = activeContentType.value;
  if (!managingInstance.value || !type) return;
  const pending = [...contentUpdates.value];
  for (const update of pending) {
    updatingFiles.value = [...updatingFiles.value, update.fileName];
    await changeContentVersion(managingInstance.value.name, type, update.fileName, update.latestVersionId);
    updatingFiles.value = updatingFiles.value.filter((f) => f !== update.fileName);
  }
  await refreshContent(type);
  await onCheckUpdates();
}

// ── Per-file version picker ───────────────────────────────────────────────────
const versionPickerFile = ref<ContentEntry | null>(null);
const versionPickerList = ref<ProjectVersion[]>([]);
const isLoadingVersionList = ref(false);

async function openVersionPicker(item: ContentEntry) {
  const type = activeContentType.value;
  if (!managingInstance.value || !type || !item.tracked) return;
  versionPickerFile.value = item;
  isLoadingVersionList.value = true;
  versionPickerList.value = await loadContentVersions(managingInstance.value.name, type, item.fileName);
  isLoadingVersionList.value = false;
}

function closeVersionPicker() {
  versionPickerFile.value = null;
  versionPickerList.value = [];
}

async function pickVersion(version: ProjectVersion) {
  const type = activeContentType.value;
  const item = versionPickerFile.value;
  if (!managingInstance.value || !type || !item) return;
  const ok = await changeContentVersion(managingInstance.value.name, type, item.fileName, version.versionId);
  closeVersionPicker();
  if (ok) await refreshContent(type);
}

// Electron 32+ removed File.path; the absolute path must be resolved via webUtils.
function resolveFilePath(file: File): string | null {
  const w = window as unknown as { require?: (m: string) => { webUtils?: { getPathForFile?: (f: File) => string } } };
  try {
    if (typeof w.require === 'function') {
      const electron = w.require('electron');
      const resolved = electron?.webUtils?.getPathForFile?.(file);
      if (resolved) return resolved;
    }
  } catch { /* fall through to legacy */ }
  const legacy = (file as unknown as { path?: string }).path;
  return legacy && legacy.length > 0 ? legacy : null;
}

function extractPaths(files: FileList | null): string[] {
  if (!files) return [];
  const paths: string[] = [];
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    if (!file) continue;
    const p = resolveFilePath(file);
    if (p) paths.push(p);
  }
  return paths;
}

async function applyAddedFiles(files: FileList | null) {
  const type = activeContentType.value;
  if (!managingInstance.value || !type) return;
  const hadFiles = !!files && files.length > 0;
  const paths = extractPaths(files);
  if (paths.length === 0) {
    if (hadFiles) error.value = t("content.addFailed");
    return;
  }
  const ok = await addInstanceContent(managingInstance.value.name, type, paths);
  if (ok) await refreshContent(type);
}

async function onDrop(e: DragEvent) {
  isDragging.value = false;
  await applyAddedFiles(e.dataTransfer?.files ?? null);
}

async function onBrowse(e: Event) {
  const target = e.target as HTMLInputElement;
  const files = target.files;
  await applyAddedFiles(files);
  target.value = '';
}

async function onToggleContent(item: ContentEntry) {
  const type = activeContentType.value;
  if (!managingInstance.value || !type) return;
  const updated = await toggleInstanceContent(managingInstance.value.name, type, item.fileName);
  if (updated) {
    const idx = contentItems.value.findIndex(c => c.fileName === item.fileName);
    if (idx !== -1) contentItems.value[idx] = updated;
  }
}

async function onDeleteContent(item: ContentEntry) {
  const type = activeContentType.value;
  if (!managingInstance.value || !type) return;
  const ok = await removeInstanceContent(managingInstance.value.name, type, item.fileName);
  if (ok) contentItems.value = contentItems.value.filter(c => c.fileName !== item.fileName);
}

// ── Modpack import ────────────────────────────────────────────────────────────
const packFileInput = ref<HTMLInputElement | null>(null);
const isImportingPack = ref(false);
const isDraggingPack = ref(false);

const PACK_EXTENSIONS = ['.mrpack', '.zip'];

async function importPackFrom(paths: string[]) {
  const pack = paths.find((p) => PACK_EXTENSIONS.some((ext) => p.toLowerCase().endsWith(ext)));
  if (!pack) {
    error.value = t('import.wrongType');
    return;
  }
  isImportingPack.value = true;
  const created = await importModpack(pack);
  isImportingPack.value = false;
  if (created) await loadInstances();
}

async function onPackBrowse(e: Event) {
  const target = e.target as HTMLInputElement;
  await importPackFrom(extractPaths(target.files));
  target.value = '';
}

async function onPackDrop(e: DragEvent) {
  isDraggingPack.value = false;
  await importPackFrom(extractPaths(e.dataTransfer?.files ?? null));
}

// ── Modpack updating ──────────────────────────────────────────────────────────
const modpackStatus = ref<ModpackStatus | null>(null);
const isUpdatingPack = ref(false);
const packReleases = ref<ProjectVersion[]>([]);
const showReleasePicker = ref(false);

/** Loaded whenever the manage view lands on another profile. */
watch(() => managingInstance.value?.name, async (name) => {
  modpackStatus.value = null;
  packReleases.value = [];
  showReleasePicker.value = false;
  if (name) modpackStatus.value = await loadModpackStatus(name);
}, { immediate: true });

async function runPackUpdate(versionId: string) {
  if (!managingInstance.value) return;
  const name = managingInstance.value.name;
  isUpdatingPack.value = true;
  showReleasePicker.value = false;
  const jobId = await startModpackUpdate(name, versionId);
  if (jobId) {
    const finished = await trackModpackJob(jobId, name);
    if (finished) launcherMessage.value = t('modpack.updated');
  }
  isUpdatingPack.value = false;
  await loadInstances();
  modpackStatus.value = await loadModpackStatus(name);
  if (activeContentType.value) await refreshContent(activeContentType.value);
}

async function openReleasePicker() {
  if (!managingInstance.value) return;
  showReleasePicker.value = true;
  packReleases.value = await loadModpackVersions(managingInstance.value.name);
}

// ── Export ────────────────────────────────────────────────────────────────────
// Reachable both from the manage view and from a card's menu, so the target is held explicitly
// rather than assumed to be whatever profile is being managed.
const exportTargetName = ref('');
const showExportModal = ref(false);
const exportFormat = ref<ExportFormat>('mrpack');
const exportVersion = ref('1.0.0');
const isExporting = ref(false);
const exportResult = ref<ExportResult | null>(null);

function openExportFor(inst: LauncherInstance) {
  exportTargetName.value = inst.name;
  exportResult.value = null;
  exportVersion.value = '1.0.0';
  showExportModal.value = true;
  closeMenu();
}

function openExport() {
  if (!managingInstance.value) return;
  exportTargetName.value = managingInstance.value.name;
  exportResult.value = null;
  exportVersion.value = modpackStatus.value?.modpack?.versionNumber || '1.0.0';
  showExportModal.value = true;
  closeMenu();
}

async function runExport() {
  if (!exportTargetName.value) return;
  isExporting.value = true;
  exportResult.value = await exportInstance(
    exportTargetName.value, exportFormat.value, exportVersion.value);
  isExporting.value = false;
}

// ── Settings form ───────────────────────────────────────────────────────────────
/**
 * The numeric fields are bound to `<input type="number">`, and Vue applies the `.number` modifier
 * to those implicitly — so they hold a number as soon as the user types one, and the empty string
 * only while the field is blank. Both shapes have to be accepted on the way back out.
 */
interface SettingsForm {
  maxMemoryMb: string | number;
  minMemoryMb: string | number;
  jvmArgs: string;
  resolutionWidth: string | number;
  resolutionHeight: string | number;
  fullscreen: boolean;
  javaPath: string;
  /** One `KEY=value` per line, which is how people are used to writing an environment. */
  envVars: string;
  preLaunchCommand: string;
  postExitCommand: string;
  wrapperCommand: string;
  gameDirectory: string;
  hideLauncher: boolean;
}

const settingsForm = reactive<SettingsForm>({
  maxMemoryMb: '',
  minMemoryMb: '',
  jvmArgs: '',
  resolutionWidth: '',
  resolutionHeight: '',
  fullscreen: false,
  javaPath: '',
  envVars: '',
  preLaunchCommand: '',
  postExitCommand: '',
  wrapperCommand: '',
  gameDirectory: '',
  hideLauncher: false,
});

/** Whether the advanced block is unfolded; it is noise for most profiles. */
const showAdvancedProfileSettings = ref(false);

/** `KEY=value` lines to a map, ignoring blanks and comments. */
function parseEnvVars(raw: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const separator = trimmed.indexOf('=');
    if (separator <= 0) continue;
    const key = trimmed.slice(0, separator).trim();
    if (key) result[key] = trimmed.slice(separator + 1).trim();
  }
  return result;
}

function formatEnvVars(values: Record<string, string> | null | undefined): string {
  if (!values) return '';
  return Object.entries(values).map(([key, value]) => `${key}=${value}`).join('\n');
}
const isSavingSettings = ref(false);
const settingsSaved = ref(false);
/**
 * The card image is stored on the profile itself, not in its launch settings, so it is edited
 * here but saved through its own endpoint.
 */
const iconForm = ref('');

/**
 * What an empty field falls back to at launch, so the placeholders tell the truth about what the
 * profile will actually use rather than showing a hardcoded number.
 */
const settingsPlaceholders = computed(() => ({
  maxMemoryMb: String(settings.value.defaultMaxMemoryMb),
  minMemoryMb: String(settings.value.defaultMinMemoryMb),
  jvmArgs: settings.value.defaultJvmArgs || '-XX:+UseG1GC',
  javaPath: t('profiles.settingsJavaAuto', { version: managingInstance.value?.javaMajorVersion ?? '' }),
}));

function loadSettingsForm() {
  settingsSaved.value = false;
  const s = managingInstance.value?.settings;
  settingsForm.maxMemoryMb = s?.maxMemoryMb != null ? String(s.maxMemoryMb) : '';
  settingsForm.minMemoryMb = s?.minMemoryMb != null ? String(s.minMemoryMb) : '';
  settingsForm.jvmArgs = s?.jvmArgs ?? '';
  settingsForm.resolutionWidth = s?.resolutionWidth != null ? String(s.resolutionWidth) : '';
  settingsForm.resolutionHeight = s?.resolutionHeight != null ? String(s.resolutionHeight) : '';
  settingsForm.fullscreen = s?.fullscreen === true;
  settingsForm.javaPath = s?.javaPath ?? '';
  settingsForm.envVars = formatEnvVars(s?.envVars);
  settingsForm.preLaunchCommand = s?.preLaunchCommand ?? '';
  settingsForm.postExitCommand = s?.postExitCommand ?? '';
  settingsForm.wrapperCommand = s?.wrapperCommand ?? '';
  settingsForm.gameDirectory = s?.gameDirectory ?? '';
  settingsForm.hideLauncher = s?.hideLauncher === true;
  iconForm.value = managingInstance.value?.iconUrl ?? '';

  // Unfold the advanced block when the profile already uses something from it, so a setting
  // that is in effect is never hidden behind a collapsed section.
  showAdvancedProfileSettings.value = Boolean(
    s?.envVars && Object.keys(s.envVars).length > 0
      || s?.preLaunchCommand || s?.postExitCommand || s?.wrapperCommand || s?.gameDirectory,
  );
}

/** An empty, blank or non-positive field means "no override" and is stored as null. */
function parseIntOrNull(value: string | number): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) && value > 0 ? Math.trunc(value) : null;
  }
  const trimmed = String(value ?? '').trim();
  if (trimmed === '') return null;
  const parsed = Number.parseInt(trimmed, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function blankToNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

async function saveSettings() {
  if (!managingInstance.value) return;
  const payload: InstanceSettings = {
    maxMemoryMb: parseIntOrNull(settingsForm.maxMemoryMb),
    minMemoryMb: parseIntOrNull(settingsForm.minMemoryMb),
    jvmArgs: blankToNull(settingsForm.jvmArgs),
    resolutionWidth: parseIntOrNull(settingsForm.resolutionWidth),
    resolutionHeight: parseIntOrNull(settingsForm.resolutionHeight),
    // Only stored when switched on: a stored `false` would override a future default.
    fullscreen: settingsForm.fullscreen ? true : null,
    javaPath: blankToNull(settingsForm.javaPath),
    envVars: parseEnvVars(settingsForm.envVars),
    preLaunchCommand: blankToNull(settingsForm.preLaunchCommand),
    postExitCommand: blankToNull(settingsForm.postExitCommand),
    wrapperCommand: blankToNull(settingsForm.wrapperCommand),
    gameDirectory: blankToNull(settingsForm.gameDirectory),
    hideLauncher: settingsForm.hideLauncher ? true : null,
  };
  isSavingSettings.value = true;
  const name = managingInstance.value.name;
  const ok = await handleUpdateInstanceSettings(name, payload);
  if (ok && iconForm.value.trim() !== (managingInstance.value?.iconUrl ?? '')) {
    await handleSetIcon(name, iconForm.value.trim());
  }
  isSavingSettings.value = false;
  if (ok) {
    // The saved profile is written back into the shared list, which `managingInstance` reads
    // from — so reloading the form now shows exactly what the backend stored.
    loadSettingsForm();
    settingsSaved.value = true;
    window.setTimeout(() => { settingsSaved.value = false; }, 2500);
  }
}
</script>

<template>
  <div class="flex-1 flex-col overflow-hidden" :class="activeTab === 'profiles' ? 'flex' : 'hidden'" @click="closeMenu">

    <!-- ── Grid view ─────────────────────────────────────────────────────────── -->
    <template v-if="!managingInstance">
      <div class="flex shrink-0 flex-col gap-3 px-4 pt-4 md:px-6">
        <div class="flex flex-wrap items-center gap-2">
          <div class="flex flex-wrap gap-[5px]">
            <button v-for="f in filters" :key="f" type="button"
              class="rounded-md border px-[13px] py-[5px] text-[length:var(--text-sm)] font-semibold tracking-[0.07em] transition-all duration-200"
              :class="profileFilter === f
                ? 'border-[var(--accent-border-active)] bg-[var(--accent-bg-strong)] text-[var(--primary)]'
                : 'border-white/10 bg-white/[0.03] text-white/40 hover:bg-white/[0.07] hover:text-white/70'"
              @click.stop="profileFilter = f">
              {{ f === 'ALL' ? 'ALLE' : f }}
            </button>
          </div>
          <div class="relative min-w-[180px] flex-1 md:max-w-[280px]">
            <Icon icon="lucide:search" class="pointer-events-none absolute left-2.5 top-1/2 size-3 -translate-y-1/2 text-white/30" />
            <input
              ref="searchInput"
              v-model="profileSearch"
              type="text"
              :placeholder="t('profiles.search')"
              class="w-full rounded-md border border-white/10 bg-[var(--surface-input)] py-[5px] pl-7 pr-7 text-[length:var(--text-sm)] text-white outline-none transition-colors focus:border-[var(--accent-border-focus)]"
              @click.stop
            />
            <button
              v-if="profileSearch"
              type="button"
              class="absolute right-1.5 top-1/2 flex size-4 -translate-y-1/2 items-center justify-center rounded text-white/30 hover:text-white/70"
              @click.stop="profileSearch = ''"
            >
              <Icon icon="lucide:x" class="size-3" />
            </button>
          </div>

          <select
            :value="profileSort"
            class="rounded-md border border-white/10 bg-[var(--surface-input)] px-2 py-[5px] text-[length:var(--text-sm)] text-white/70 outline-none focus:border-[var(--accent-border-focus)]"
            :title="t('profiles.sortBy')"
            @click.stop
            @change="changeSort(($event.target as HTMLSelectElement).value as ProfileSort)"
          >
            <option v-for="option in SORT_OPTIONS" :key="option.id" :value="option.id">
              {{ t(option.labelKey) }}
            </option>
          </select>

          <button
            type="button"
            class="flex size-[30px] items-center justify-center rounded-md border transition-all"
            :class="favouritesFirst
              ? 'border-[var(--accent-border-active)] bg-[var(--accent-bg-strong)] text-[var(--primary)]'
              : 'border-white/10 bg-white/[0.03] text-white/40 hover:bg-white/[0.07] hover:text-white/70'"
            :title="t('profiles.favouritesFirst')"
            @click.stop="toggleFavouritesFirst()"
          >
            <Icon icon="lucide:star" class="size-3.5" />
          </button>

          <button
            type="button"
            class="flex size-[30px] items-center justify-center rounded-md border transition-all"
            :class="groupBy
              ? 'border-[var(--accent-border-active)] bg-[var(--accent-bg-strong)] text-[var(--primary)]'
              : 'border-white/10 bg-white/[0.03] text-white/40 hover:bg-white/[0.07] hover:text-white/70'"
            :title="t('profiles.groupView')"
            @click.stop="groupBy = !groupBy"
          >
            <Icon icon="lucide:folder-tree" class="size-3.5" />
          </button>

          <div class="flex-1"></div>
          <button type="button" :disabled="isImportingPack" :title="t('import.hint')"
            class="inline-flex items-center gap-1.5 rounded-[7px] border border-white/10 bg-white/5 px-3.5 py-[7px] text-[length:var(--text-sm)] font-semibold tracking-[0.07em] text-white/45 transition-all duration-200 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
            @click.stop="packFileInput?.click()">
            <Icon :icon="isImportingPack ? 'lucide:loader-2' : 'lucide:download'" class="size-[11px]"
              :class="isImportingPack ? 'animate-spin' : ''" />IMPORT
          </button>
          <input ref="packFileInput" type="file" accept=".mrpack,.zip" class="hidden" @change="onPackBrowse" />
          <button type="button"
            class="inline-flex items-center gap-1.5 rounded-[7px] border border-[var(--accent-border-strong)] bg-[var(--accent-bg-strong)] px-3.5 py-[7px] text-[length:var(--text-sm)] font-semibold tracking-[0.07em] text-[var(--primary)] transition-all duration-200 hover:bg-[var(--accent-bg-hover)] hover:shadow-[var(--shadow-accent-md)]"
            @click.stop="showCreateModal = true">
            <Icon icon="lucide:plus" class="size-[11px]" />NEUES PROFIL
          </button>
        </div>
      </div>

      <div class="mt-4 shrink-0 px-4 text-[length:var(--text-2xs)] font-bold tracking-[0.12em] text-white/40 md:px-6">
        PROFILE ({{ filteredInstances.length }})
      </div>

      <div class="relative overflow-y-scroll grid grid-cols-[repeat(auto-fit,minmax(250px,1fr))] gap-3 px-4 py-3 md:px-6"
        @dragover.prevent="isDraggingPack = true" @dragleave.prevent="isDraggingPack = false"
        @drop.prevent="onPackDrop">

        <!-- Dropping a .mrpack or CurseForge .zip here imports it as a new profile. -->
        <div v-if="isDraggingPack"
          class="pointer-events-none absolute inset-2 z-20 flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-[var(--accent-border-strong)] bg-[var(--accent-bg-soft)] backdrop-blur-sm">
          <Icon icon="lucide:package-plus" class="size-8 text-[var(--primary)]" />
          <span class="text-[length:var(--text-base)] font-semibold text-[var(--primary)]">{{ t("import.title") }}</span>
          <span class="text-[length:var(--text-2xs)] text-white/50">{{ t("import.hint") }}</span>
        </div>

        <!-- New profile card -->
        <button type="button"
          class="flex h-48 flex-col items-center justify-center gap-2.5 rounded-xl border border-dashed border-white/15 bg-[var(--surface-panel-muted)] transition-all duration-200 hover:border-[var(--accent-border-emphasis)] hover:bg-[var(--accent-bg-soft)]"
          @click.stop="showCreateModal = true">
          <div
            class="flex size-[38px] items-center justify-center rounded-full border border-[var(--accent-border-strong)] bg-[var(--accent-bg-strong)] text-[var(--primary)]">
            <Icon icon="lucide:plus" class="size-4" />
          </div>
          <div class="text-center">
            <div class="text-[length:var(--text-base)] font-semibold text-white">{{ t("profiles.create") }}</div>
            <div class="text-[length:var(--text-2xs)] text-white/30">{{ t("profiles.emptyHint") }}</div>
          </div>
        </button>

        <!-- Pending (creating) cards -->
        <div v-for="pending in visiblePendingInstances" :key="pending.id"
          class="relative h-48 overflow-hidden rounded-xl border bg-[var(--surface-panel)]"
          :class="pending.failed ? 'border-red-500/40' : 'border-white/10'">
          <!-- Image area -->
          <div
            class="relative flex h-[100px] items-center justify-center overflow-hidden rounded-t-xl bg-[linear-gradient(135deg,#0a1535,#122050)]">
            <span class="text-[40px] opacity-40">{{ versionEmoji(pending.platformId) }}</span>
            <!-- Progress bar -->
            <div v-if="!pending.failed" class="absolute bottom-0 left-0 right-0 h-[3px] bg-white/10 overflow-hidden">
              <div class="h-full w-1/2 bg-[var(--primary)] rounded-full animate-[shimmer_1.6s_ease-in-out_infinite]" />
            </div>
            <div v-else class="absolute bottom-0 left-0 right-0 h-[3px] bg-red-500/60" />
          </div>
          <!-- Info -->
          <div class="px-3 py-2.5">
            <div class="mb-1 truncate text-[length:var(--text-md-plus)] font-semibold text-white">{{ pending.name }}
            </div>
            <div v-if="!pending.failed" class="flex items-center gap-1.5 text-[length:var(--text-2xs)] text-white/45">
              <span class="inline-block size-1.5 shrink-0 rounded-full bg-[var(--primary)] animate-pulse" />
              {{ pending.failed ? (pending.errorMessage ?? t("profiles.createFailed")) : t("profiles.installing") }}
            </div>
            <div v-else class="text-[length:var(--text-2xs)] text-red-400 leading-[1.4]">
              {{ pending.errorMessage }}
            </div>
          </div>
          <!-- Dismiss on error -->
          <button v-if="pending.failed" type="button"
            class="absolute right-2 top-2 flex size-5 items-center justify-center rounded bg-white/10 text-white/50 hover:bg-white/20 hover:text-white"
            @click.stop="pendingInstances.splice(pendingInstances.indexOf(pending), 1)">
            <Icon icon="lucide:x" class="size-3" />
          </button>
        </div>

        <!-- Instance cards, flat -->
        <template v-if="!groupBy">
          <ProfileCard
            v-for="inst in filteredInstances"
            :key="inst.slug"
            :inst="inst"
            :open-menu-slug="openMenuSlug"
            @manage="openManage"
            @play="playInstance"
            @select="selectInstance"
            @toggle-menu="toggleMenu"
            @rename="startEdit"
            @duplicate="startDuplicate"
            @group="startGroup"
            @open-folder="openFolder"
            @export="openExportFor"
            @favourite="handleToggleFavourite($event.name)"
            @delete="startDelete"
          />
        </template>

        <!-- Instance cards, grouped by folder. Each section spans the whole grid so its own
             cards flow underneath the heading rather than beside it. -->
        <template v-else>
          <div v-for="group in groupedInstances" :key="group.name || '__ungrouped'" class="col-[1/-1]">
            <div class="mb-2 flex items-center gap-2 text-[length:var(--text-2xs)] font-bold tracking-[0.12em] text-white/40">
              <Icon :icon="group.name ? 'lucide:folder' : 'lucide:folder-minus'" class="size-3" />
              {{ (group.name || t("profiles.ungrouped")).toUpperCase() }}
              <span class="text-white/25">({{ group.instances.length }})</span>
            </div>
            <div class="grid grid-cols-[repeat(auto-fit,minmax(250px,1fr))] gap-3">
              <ProfileCard
                v-for="inst in group.instances"
                :key="inst.slug"
                :inst="inst"
                :open-menu-slug="openMenuSlug"
                @manage="openManage"
                @play="playInstance"
                @select="selectInstance"
                @toggle-menu="toggleMenu"
                @rename="startEdit"
                @duplicate="startDuplicate"
                @group="startGroup"
                @open-folder="openFolder"
                @export="openExportFor"
                @favourite="handleToggleFavourite($event.name)"
                @delete="startDelete"
              />
            </div>
          </div>
        </template>

        <div v-if="filteredInstances.length === 0 && !isLoadingInstances"
          class="col-[1/-1] py-10 text-center text-[length:var(--text-md)] text-white/40">
          {{ profileSearch.trim() ? t("profiles.noMatches") : t("profiles.empty") }}
        </div>
      </div>
    </template>

    <!-- ── Manage / detail view ───────────────────────────────────────────────── -->
    <template v-else>
      <div class="flex flex-1 flex-col overflow-hidden px-4 pt-4 md:px-6" @click.stop>
        <!-- Header -->
        <div class="mb-5 flex items-center gap-3">
          <button type="button"
            class="flex size-8 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-white/50 transition-all hover:bg-white/10 hover:text-white"
            @click="closeManage">
            <Icon icon="lucide:arrow-left" class="size-4" />
          </button>
          <div class="text-[length:var(--text-lg)] font-bold tracking-[0.1em] text-white">{{
            managingInstance.name.toUpperCase() }}</div>
          <span v-if="managingInstance.running"
            class="rounded border border-[var(--success-border)] bg-[var(--success-bg)] px-2 py-0.5 text-[10px] font-bold tracking-[0.08em] text-[var(--accent)]">▶
            AKTIV</span>
        </div>

        <div class="flex flex-1 gap-5 overflow-hidden">
          <!-- Left: hero card -->
          <div
            class="relative flex w-56 h-fit shrink-0 flex-col gap-4 overflow-hidden rounded-xl border border-white/10 bg-(--surface-panel)">
            <div class="relative flex h-28 items-center justify-center overflow-hidden text-[60px]"
              :class="managingInstance.packIconUrl ? '' : versionGradientClass(managingInstance.versionType)">
              <img v-if="managingInstance.packIconUrl" :src="managingInstance.packIconUrl" alt=""
                class="size-full object-cover" loading="lazy" @error="handleImgError" />
              <template v-else>{{ versionEmoji(managingInstance.versionType) }}</template>
            </div>
            <div class="flex flex-col gap-1.5 p-3">
              <div class="truncate text-[length:var(--text-md)] font-semibold text-white">{{ managingInstance.name }}
              </div>
              <div class="text-[length:var(--text-xs)] text-white/50">{{ formatLoaderId(managingInstance.versionId) }}
              </div>
            </div>
            <!-- Play button + panel nav -->
            <div class="px-3 pb-3 flex flex-col gap-2">
              <button type="button"
                class="w-full inline-flex items-center justify-center gap-2 rounded-[7px] border border-(--accent-border-strong) bg-(--primary) py-2 text-[length:var(--text-sm)] font-bold tracking-[0.08em] text-white disabled:opacity-50 disabled:cursor-not-allowed"
                :disabled="!authData || isLaunching || managingInstance.running"
                @click="playInstance(managingInstance)">
                <Icon icon="lucide:play" class="size-[10px]" />PLAY
              </button>
              <button v-if="isLoaderInstance" type="button"
                class="w-full inline-flex items-center justify-center gap-2 rounded-[7px] border py-2 text-[length:var(--text-sm)] font-bold tracking-[0.08em] transition-all"
                :class="activePanel === 'mods' ? 'border-(--accent-border-strong) bg-(--accent-bg-strong) text-(--primary)' : 'border-(--surface-panel-strong) bg-(--surface-input) text-white hover:bg-white/10'"
                @click="openPanel('mods')">
                <Icon icon="lucide:puzzle" class="size-[10px]" />Mods
              </button>
              <button type="button"
                class="w-full inline-flex items-center justify-center gap-2 rounded-[7px] border py-2 text-[length:var(--text-sm)] font-bold tracking-[0.08em] transition-all"
                :class="activePanel === 'resourcepacks' ? 'border-(--accent-border-strong) bg-(--accent-bg-strong) text-(--primary)' : 'border-(--surface-panel-strong) bg-(--surface-input) text-white hover:bg-white/10'"
                @click="openPanel('resourcepacks')">
                <Icon icon="lucide:palette" class="size-[10px]" />Resource Packs
              </button>
              <button v-if="isLoaderInstance" type="button"
                class="w-full inline-flex items-center justify-center gap-2 rounded-[7px] border py-2 text-[length:var(--text-sm)] font-bold tracking-[0.08em] transition-all"
                :class="activePanel === 'shaderpacks' ? 'border-(--accent-border-strong) bg-(--accent-bg-strong) text-(--primary)' : 'border-(--surface-panel-strong) bg-(--surface-input) text-white hover:bg-white/10'"
                @click="openPanel('shaderpacks')">
                <Icon icon="lucide:sparkles" class="size-[10px]" />Shaders
              </button>
              <button type="button"
                class="w-full inline-flex items-center justify-center gap-2 rounded-[7px] border py-2 text-[length:var(--text-sm)] font-bold tracking-[0.08em] transition-all"
                :class="activePanel === 'datapacks' ? 'border-(--accent-border-strong) bg-(--accent-bg-strong) text-(--primary)' : 'border-(--surface-panel-strong) bg-(--surface-input) text-white hover:bg-white/10'"
                @click="openPanel('datapacks')">
                <Icon icon="lucide:database" class="size-[10px]" />Data Packs
              </button>

              <div class="my-0.5 h-px bg-white/7"></div>

              <button type="button"
                class="w-full inline-flex items-center justify-center gap-2 rounded-[7px] border py-2 text-[length:var(--text-sm)] font-bold tracking-[0.08em] transition-all"
                :class="activePanel === 'worlds' ? 'border-(--accent-border-strong) bg-(--accent-bg-strong) text-(--primary)' : 'border-(--surface-panel-strong) bg-(--surface-input) text-white hover:bg-white/10'"
                @click="openPanel('worlds')">
                <Icon icon="lucide:globe" class="size-[10px]" />{{ t("worlds.title") }}
              </button>
              <button type="button"
                class="w-full inline-flex items-center justify-center gap-2 rounded-[7px] border py-2 text-[length:var(--text-sm)] font-bold tracking-[0.08em] transition-all"
                :class="activePanel === 'servers' ? 'border-(--accent-border-strong) bg-(--accent-bg-strong) text-(--primary)' : 'border-(--surface-panel-strong) bg-(--surface-input) text-white hover:bg-white/10'"
                @click="openPanel('servers')">
                <Icon icon="lucide:server" class="size-[10px]" />{{ t("servers.title") }}
              </button>
              <button type="button"
                class="w-full inline-flex items-center justify-center gap-2 rounded-[7px] border py-2 text-[length:var(--text-sm)] font-bold tracking-[0.08em] transition-all"
                :class="activePanel === 'screenshots' ? 'border-(--accent-border-strong) bg-(--accent-bg-strong) text-(--primary)' : 'border-(--surface-panel-strong) bg-(--surface-input) text-white hover:bg-white/10'"
                @click="openPanel('screenshots')">
                <Icon icon="lucide:image" class="size-[10px]" />{{ t("screenshots.title") }}
              </button>
              <button type="button"
                class="w-full inline-flex items-center justify-center gap-2 rounded-[7px] border py-2 text-[length:var(--text-sm)] font-bold tracking-[0.08em] transition-all"
                :class="activePanel === 'logs' ? 'border-(--accent-border-strong) bg-(--accent-bg-strong) text-(--primary)' : 'border-(--surface-panel-strong) bg-(--surface-input) text-white hover:bg-white/10'"
                @click="openPanel('logs')">
                <Icon icon="lucide:terminal" class="size-[10px]" />{{ t("logs.title") }}
                <span v-if="managingInstance.launchPhase === 'failed'"
                  class="size-1.5 rounded-full bg-[var(--danger)]" />
              </button>
              <button type="button"
                class="w-full inline-flex items-center justify-center gap-2 rounded-[7px] border py-2 text-[length:var(--text-sm)] font-bold tracking-[0.08em] transition-all"
                :class="activePanel === 'backups' ? 'border-(--accent-border-strong) bg-(--accent-bg-strong) text-(--primary)' : 'border-(--surface-panel-strong) bg-(--surface-input) text-white hover:bg-white/10'"
                @click="openPanel('backups')">
                <Icon icon="lucide:archive" class="size-[10px]" />{{ t("backups.title") }}
              </button>

              <div class="my-0.5 h-px bg-white/7"></div>

              <button type="button"
                class="w-full inline-flex items-center justify-center gap-2 rounded-[7px] border py-2 text-[length:var(--text-sm)] font-bold tracking-[0.08em] transition-all"
                :class="activePanel === 'settings' ? 'border-(--accent-border-strong) bg-(--accent-bg-strong) text-(--primary)' : 'border-(--surface-panel-strong) bg-(--surface-input) text-white hover:bg-white/10'"
                @click="openPanel('settings')">
                <Icon icon="lucide:sliders-horizontal" class="size-[10px]" />Settings
              </button>
            </div>
          </div>

          <!-- Right: profile info (always on top) + active panel -->
          <div class="flex flex-1 flex-col gap-4 overflow-hidden">

            <!-- Profile info — always visible across all sub-tabs -->
            <div class="shrink-0 rounded-xl border border-white/8 bg-[var(--surface-panel)] p-4">
              <div class="mb-3 text-[length:var(--text-2xs)] font-bold tracking-[0.12em] text-white/40">INFO</div>
              <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div class="flex flex-col gap-0.5">
                  <div class="text-[length:var(--text-2xs)] text-white/35 tracking-[0.08em]">VERSION</div>
                  <div class="truncate text-[length:var(--text-sm)] font-medium text-white">{{ formatLoaderId(managingInstance.versionId) }}</div>
                </div>
                <div class="flex flex-col gap-0.5">
                  <div class="text-[length:var(--text-2xs)] text-white/35 tracking-[0.08em]">JAVA</div>
                  <div class="text-[length:var(--text-sm)] font-medium text-white">Java {{ managingInstance.javaMajorVersion }}</div>
                </div>
                <div class="flex flex-col gap-0.5">
                  <div class="text-[length:var(--text-2xs)] text-white/35 tracking-[0.08em]">ERSTELLT</div>
                  <div class="text-[length:var(--text-sm)] font-medium text-white">{{ formatRelativeDate(managingInstance.createdAt) }}</div>
                </div>
                <div class="flex flex-col gap-0.5">
                  <div class="text-[length:var(--text-2xs)] text-white/35 tracking-[0.08em]">ZULETZT GESPIELT</div>
                  <div class="text-[length:var(--text-sm)] font-medium text-white">{{ formatRelativeDate(managingInstance.lastPlayedAt) }}</div>
                </div>
                <div class="flex flex-col gap-0.5">
                  <div class="text-[length:var(--text-2xs)] text-white/35 tracking-[0.08em]">{{ t("profiles.playtime").toUpperCase() }}</div>
                  <div class="text-[length:var(--text-sm)] font-medium text-white">{{ formatPlaytime(managingInstance.totalPlaytimeMs) }}</div>
                </div>
                <div v-if="managingInstance.groupName" class="flex flex-col gap-0.5">
                  <div class="text-[length:var(--text-2xs)] text-white/35 tracking-[0.08em]">{{ t("profiles.group").toUpperCase() }}</div>
                  <div class="truncate text-[length:var(--text-sm)] font-medium text-white">{{ managingInstance.groupName }}</div>
                </div>
                <div v-if="managingInstance.customGameDirectory" class="flex flex-col gap-0.5 sm:col-span-2">
                  <div class="text-[length:var(--text-2xs)] text-white/35 tracking-[0.08em]">{{ t("profiles.customDirectory").toUpperCase() }}</div>
                  <div class="truncate font-mono text-[length:var(--text-2xs)] text-white/60" :title="managingInstance.gameDirectory">
                    {{ managingInstance.gameDirectory }}
                  </div>
                </div>
              </div>
            </div>

            <!-- Modpack banner — only for profiles that came from a pack -->
            <div v-if="modpackStatus?.modpack"
              class="shrink-0 rounded-xl border px-4 py-3"
              :class="modpackStatus.updateAvailable
                ? 'border-[var(--accent-border-strong)] bg-[var(--accent-bg-soft)]'
                : 'border-white/8 bg-[var(--surface-panel)]'">
              <div class="flex flex-wrap items-center gap-3">
                <Icon :icon="modpackStatus.updateAvailable ? 'lucide:arrow-up-circle' : 'lucide:package-check'"
                  class="size-4 shrink-0" :class="modpackStatus.updateAvailable ? 'text-[var(--primary)]' : 'text-white/35'" />
                <div class="min-w-0 flex-1">
                  <div class="truncate text-[length:var(--text-sm)] font-semibold text-white">
                    {{ modpackStatus.modpack.name || t("modpack.title") }}
                    <span v-if="modpackStatus.modpack.versionNumber" class="font-normal text-white/40">
                      · {{ modpackStatus.modpack.versionNumber }}
                    </span>
                  </div>
                  <div class="text-[length:var(--text-2xs)] text-white/40">
                    <template v-if="isUpdatingPack">{{ t("modpack.updating") }}</template>
                    <template v-else-if="modpackStatus.updateAvailable">
                      {{ t("modpack.updateAvailable", { version: modpackStatus.latestVersionNumber }) }}
                      · {{ t("modpack.keepsContent") }}
                    </template>
                    <template v-else-if="modpackStatus.modpack.sourceFile">
                      {{ t("modpack.imported", { file: modpackStatus.modpack.sourceFile }) }}
                    </template>
                    <template v-else-if="modpackStatus.reason">{{ modpackStatus.reason }}</template>
                    <template v-else>{{ t("modpack.upToDate") }}</template>
                  </div>
                </div>
                <div class="flex shrink-0 items-center gap-1.5">
                  <button v-if="modpackStatus.updateAvailable" type="button" :disabled="isUpdatingPack"
                    class="inline-flex items-center gap-1.5 rounded-[7px] border border-[var(--accent-border-strong)] bg-[var(--accent-bg-strong)] px-3 py-1.5 text-[length:var(--text-sm)] font-semibold text-[var(--primary)] transition-all hover:bg-[var(--accent-bg-hover)] disabled:cursor-not-allowed disabled:opacity-50"
                    @click="runPackUpdate(modpackStatus.latestVersionId)">
                    <Icon :icon="isUpdatingPack ? 'lucide:loader-2' : 'lucide:arrow-up'" class="size-3"
                      :class="isUpdatingPack ? 'animate-spin' : ''" />{{ t("modpack.update") }}
                  </button>
                  <button v-if="modpackStatus.modpack.updatable" type="button" :disabled="isUpdatingPack"
                    class="inline-flex items-center gap-1 rounded-[6px] border border-white/10 bg-white/5 px-2.5 py-1.5 text-[length:var(--text-2xs)] font-semibold text-white/50 transition-all hover:bg-white/10 hover:text-white disabled:opacity-50"
                    @click="openReleasePicker">
                    <Icon icon="lucide:history" class="size-3" />{{ t("modpack.chooseRelease") }}
                  </button>
                </div>
              </div>
            </div>

            <!-- Content panel (mods / resourcepacks / shaderpacks / datapacks) -->
            <div v-if="isContentPanel && activeContentType"
              class="flex flex-1 flex-col overflow-hidden rounded-xl border border-white/8 bg-[var(--surface-panel)]">
              <div class="flex items-center justify-between border-b border-white/7 px-4 py-3">
                <div class="flex items-center gap-2 text-[length:var(--text-sm)] font-bold tracking-[0.1em] text-white">
                  <Icon icon="lucide:package" class="size-3.5 text-white/40" />
                  {{ CONTENT_LABELS[activeContentType].toUpperCase() }}
                  <span class="text-white/35 font-medium">({{ contentItems.length }})</span>
                </div>
                <div class="flex flex-wrap items-center gap-1.5">
                  <div class="relative">
                    <Icon icon="lucide:search" class="pointer-events-none absolute left-2 top-1/2 size-3 -translate-y-1/2 text-white/30" />
                    <input v-model="contentSearch" type="text" :placeholder="t('common.search')"
                      class="w-[160px] rounded-md border border-white/10 bg-[var(--surface-input)] py-1 pl-7 pr-2 text-[length:var(--text-2xs)] text-white outline-none focus:border-[var(--accent-border-focus)]" />
                  </div>
                  <button type="button" :disabled="isTogglingAll || contentItems.length === 0"
                    class="inline-flex items-center gap-1.5 rounded-[6px] border border-white/10 bg-white/5 px-2.5 py-1.5 text-[length:var(--text-2xs)] font-semibold tracking-[0.06em] text-white/50 transition-all hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                    :title="enabledContentCount > 0 ? t('common.disable') : t('common.enable')"
                    @click="onToggleAll(enabledContentCount === 0)">
                    <Icon :icon="isTogglingAll ? 'lucide:loader-2' : (enabledContentCount > 0 ? 'lucide:toggle-right' : 'lucide:toggle-left')"
                      class="size-3" :class="isTogglingAll ? 'animate-spin' : ''" />
                    {{ enabledContentCount > 0 ? t("common.disable") : t("common.enable") }}
                  </button>
                  <button type="button" :disabled="isCheckingUpdates || contentItems.length === 0"
                    class="inline-flex items-center gap-1.5 rounded-[6px] border border-white/10 bg-white/5 px-2.5 py-1.5 text-[length:var(--text-2xs)] font-semibold tracking-[0.06em] text-white/50 transition-all hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                    @click="onCheckUpdates">
                    <Icon :icon="isCheckingUpdates ? 'lucide:loader-2' : 'lucide:refresh-ccw-dot'" class="size-3"
                      :class="isCheckingUpdates ? 'animate-spin' : ''" />
                    {{ isCheckingUpdates ? t("content.checking") : t("content.checkUpdates") }}
                  </button>
                  <button v-if="contentUpdates.length > 0" type="button" :disabled="updatingFiles.length > 0"
                    class="inline-flex items-center gap-1.5 rounded-[6px] border border-[var(--accent-border-strong)] bg-[var(--accent-bg-strong)] px-2.5 py-1.5 text-[length:var(--text-2xs)] font-semibold tracking-[0.06em] text-[var(--primary)] transition-all hover:bg-[var(--accent-bg-hover)] disabled:opacity-50"
                    @click="applyAllUpdates">
                    <Icon icon="lucide:arrow-up" class="size-3" />{{ t("content.updateAll") }} ({{ contentUpdates.length }})
                  </button>
                  <button type="button"
                    class="inline-flex items-center gap-1.5 rounded-[6px] border border-[var(--accent-border-strong)] bg-[var(--accent-bg-strong)] px-2.5 py-1.5 text-[length:var(--text-2xs)] font-semibold tracking-[0.06em] text-[var(--primary)] transition-all hover:bg-[var(--accent-bg-hover)]"
                    @click="fileInput?.click()">
                    <Icon icon="lucide:plus" class="size-3" />{{ t("content.addFiles") }}
                  </button>
                  <button type="button"
                    class="flex size-7 items-center justify-center rounded-md border border-white/10 bg-white/5 text-white/40 transition-all hover:bg-white/10 hover:text-white"
                    title="Aktualisieren" @click="refreshContent(activeContentType)">
                    <Icon icon="lucide:refresh-cw" class="size-3" />
                  </button>
                </div>
              </div>
              <div v-if="dependencyWarnings.length > 0"
                class="shrink-0 border-b border-amber-500/20 bg-amber-500/[0.06] px-4 py-2">
                <div class="flex items-start gap-2">
                  <Icon icon="lucide:alert-triangle" class="mt-px size-3.5 shrink-0 text-amber-400" />
                  <div class="min-w-0 text-[length:var(--text-2xs)] leading-[1.5] text-amber-200/80">
                    <div class="font-semibold text-amber-300">{{ t("content.dependencyWarning", { n: dependencyWarnings.length }) }}</div>
                    <div v-for="warning in dependencyWarnings.slice(0, 4)" :key="warning.fileName + warning.dependencyProjectId">
                      {{ warning.state === "disabled"
                        ? t("content.dependencyDisabled", { project: warning.projectName })
                        : t("content.dependencyMissing", { project: warning.projectName }) }}
                    </div>
                    <div v-if="dependencyWarnings.length > 4" class="text-amber-200/50">
                      {{ t("content.dependencyMore", { n: dependencyWarnings.length - 4 }) }}
                    </div>
                  </div>
                </div>
              </div>

              <div v-if="hasCheckedUpdates"
                class="shrink-0 border-b border-white/7 px-4 py-1.5 text-[length:var(--text-2xs)]"
                :class="contentUpdates.length > 0 ? 'text-[var(--primary)]' : 'text-white/35'">
                {{ contentUpdates.length > 0
                  ? t("content.updatesFound", { n: contentUpdates.length })
                  : t("content.upToDate") }}
              </div>
              <input ref="fileInput" type="file" multiple class="hidden" @change="onBrowse" />

              <!-- Dropzone + list -->
              <div class="relative flex flex-1 flex-col overflow-hidden"
                @dragover.prevent="isDragging = true" @dragleave.prevent="isDragging = false" @drop.prevent="onDrop">
                <div v-if="isDragging"
                  class="pointer-events-none absolute inset-2 z-10 flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-[var(--accent-border-strong)] bg-[var(--accent-bg-soft)] backdrop-blur-sm">
                  <Icon icon="lucide:download" class="size-7 text-[var(--primary)]" />
                  <span class="text-[length:var(--text-sm)] font-semibold text-[var(--primary)]">{{ t("content.addFiles") }}</span>
                </div>

                <div class="flex-1 overflow-y-auto p-2.5">
                  <div v-if="isLoadingContent" class="py-10 text-center text-[length:var(--text-sm)] text-white/40">Lädt…</div>
                  <div v-else-if="contentItems.length === 0"
                    class="flex h-full min-h-[160px] flex-col items-center justify-center gap-2 text-center">
                    <Icon icon="lucide:inbox" class="size-8 text-white/20" />
                    <div class="text-[length:var(--text-sm)] text-white/40">{{ t("content.empty") }}</div>
                    <div class="text-[length:var(--text-2xs)] text-white/25">{{ t("content.emptyHint") }}</div>
                  </div>
                  <div v-else-if="visibleContentItems.length === 0"
                    class="py-10 text-center text-[length:var(--text-sm)] text-white/40">
                    {{ t("content.noMatches") }}
                  </div>
                  <div v-else class="flex flex-col gap-1.5">
                    <div v-for="item in visibleContentItems" :key="item.fileName"
                      class="group flex items-center justify-between gap-3 rounded-lg border border-white/8 bg-white/[0.03] px-3 py-2.5"
                      :class="!item.enabled ? 'opacity-50' : ''">
                      <div class="flex min-w-0 items-center gap-2.5">
                        <!-- The project's own icon once it is known; a glyph until then. -->
                        <img v-if="item.source?.iconUrl" :src="item.source.iconUrl" alt=""
                          class="size-7 shrink-0 rounded-[6px] border border-white/10 bg-black/20 object-cover"
                          loading="lazy" @error="handleImgError" />
                        <div v-else
                          class="flex size-7 shrink-0 items-center justify-center rounded-[6px] border border-white/8 bg-white/5">
                          <Icon icon="lucide:file-archive" class="size-3.5 text-white/35" />
                        </div>
                        <div class="min-w-0">
                          <div class="truncate text-[length:var(--text-sm)] font-medium text-white">
                            {{ item.source?.projectName || item.fileName }}
                          </div>
                          <div class="flex flex-wrap items-center gap-x-1.5 text-[length:var(--text-2xs)] text-white/35">
                            <span v-if="item.source?.versionNumber"
                              class="rounded-[4px] bg-white/8 px-1.5 py-px font-mono text-white/55">
                              {{ item.source.versionNumber }}
                            </span>
                            <span v-else-if="!item.tracked" :title="t('content.untrackedHint')"
                              class="rounded-[4px] bg-white/5 px-1.5 py-px text-white/30">
                              {{ t("content.untracked") }}
                            </span>
                            <span>{{ formatBytes(item.size) }}</span>
                            <span v-if="!item.enabled">· deaktiviert</span>
                            <span v-if="updateFor(item.fileName)" class="text-[var(--primary)]">
                              → {{ updateFor(item.fileName)!.latestVersionNumber }}
                            </span>
                            <span v-if="warningsFor(item.fileName).length > 0"
                              class="inline-flex items-center gap-1 rounded-[4px] bg-amber-500/15 px-1.5 py-px text-amber-300"
                              :title="t('content.dependencyRowHint')">
                              <Icon icon="lucide:alert-triangle" class="size-[9px]" />
                              {{ warningsFor(item.fileName).length }}
                            </span>
                          </div>
                        </div>
                      </div>
                      <div class="flex shrink-0 items-center gap-1.5">
                        <button v-if="updateFor(item.fileName)" type="button"
                          :disabled="updatingFiles.includes(item.fileName)"
                          class="inline-flex items-center gap-1 rounded-[6px] border border-[var(--accent-border-strong)] bg-[var(--accent-bg-strong)] px-2 py-1 text-[length:var(--text-2xs)] font-semibold text-[var(--primary)] transition-all hover:bg-[var(--accent-bg-hover)] disabled:opacity-50"
                          @click="applyUpdate(updateFor(item.fileName)!)">
                          <Icon :icon="updatingFiles.includes(item.fileName) ? 'lucide:loader-2' : 'lucide:arrow-up'"
                            class="size-3" :class="updatingFiles.includes(item.fileName) ? 'animate-spin' : ''" />
                          {{ t("content.update") }}
                        </button>
                        <button v-if="item.tracked" type="button"
                          class="flex size-7 items-center justify-center rounded-md border border-white/8 bg-white/[0.03] text-white/35 transition-all hover:bg-white/10 hover:text-white"
                          :title="t('content.changeVersion')" @click="openVersionPicker(item)">
                          <Icon icon="lucide:history" class="size-3.5" />
                        </button>
                        <button type="button"
                          class="inline-flex items-center gap-1 rounded-[6px] border px-2 py-1 text-[length:var(--text-2xs)] font-semibold transition-all"
                          :class="item.enabled
                            ? 'border-[var(--success-border)] bg-[var(--success-bg)] text-[var(--accent)]'
                            : 'border-white/10 bg-white/5 text-white/40 hover:bg-white/10'"
                          @click="onToggleContent(item)">
                          <Icon :icon="item.enabled ? 'lucide:check' : 'lucide:x'" class="size-3" />
                          {{ item.enabled ? 'Aktiv' : 'Aus' }}
                        </button>
                        <button type="button"
                          class="flex size-7 items-center justify-center rounded-md border border-white/8 bg-white/[0.03] text-white/35 transition-all hover:border-red-500/30 hover:bg-red-500/10 hover:text-red-400"
                          :title="t('common.delete')" @click="onDeleteContent(item)">
                          <Icon icon="lucide:trash-2" class="size-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <!-- Worlds, servers, screenshots, logs and backups -->
            <WorldsPanel v-else-if="activePanel === 'worlds'" :instance="managingInstance" />
            <ServersPanel v-else-if="activePanel === 'servers'" :instance="managingInstance" />
            <ScreenshotsPanel v-else-if="activePanel === 'screenshots'" :instance="managingInstance" />
            <LogsPanel v-else-if="activePanel === 'logs'" :instance="managingInstance" />
            <BackupsPanel v-else-if="activePanel === 'backups'" :instance="managingInstance" />

            <!-- Settings panel -->
            <div v-else-if="activePanel === 'settings'"
              class="flex flex-1 flex-col overflow-hidden rounded-xl border border-white/8 bg-[var(--surface-panel)]">
              <div class="flex items-center justify-between border-b border-white/7 px-4 py-3">
                <div class="flex items-center gap-2 text-[length:var(--text-sm)] font-bold tracking-[0.1em] text-white">
                  <Icon icon="lucide:sliders-horizontal" class="size-3.5 text-white/40" />EINSTELLUNGEN
                </div>
                <span v-if="settingsSaved"
                  class="inline-flex items-center gap-1 rounded-[5px] border border-[var(--success-border)] bg-[var(--success-bg)] px-2 py-0.5 text-[length:var(--text-2xs)] font-bold tracking-[0.06em] text-[var(--accent)]">
                  <Icon icon="lucide:check" class="size-3" />Gespeichert
                </span>
              </div>
              <div class="flex-1 overflow-y-auto p-4">
                <div class="flex flex-col gap-5">
                  <!-- Memory -->
                  <div class="flex flex-col gap-2">
                    <label class="text-[length:var(--text-2xs)] font-bold tracking-[0.14em] text-white/40">ARBEITSSPEICHER (MB)</label>
                    <div class="flex gap-3">
                      <div class="flex flex-1 flex-col gap-1">
                        <span class="text-[length:var(--text-2xs)] text-white/35">Max (-Xmx)</span>
                        <input v-model="settingsForm.maxMemoryMb" type="number" min="512" step="256"
                          :placeholder="settingsPlaceholders.maxMemoryMb"
                          class="w-full rounded-lg border border-white/10 bg-[var(--surface-input)] px-3 py-2 text-[length:var(--text-sm)] text-white outline-none transition-colors focus:border-[var(--accent-border-focus)]" />
                      </div>
                      <div class="flex flex-1 flex-col gap-1">
                        <span class="text-[length:var(--text-2xs)] text-white/35">Min (-Xms)</span>
                        <input v-model="settingsForm.minMemoryMb" type="number" min="256" step="256"
                          :placeholder="settingsPlaceholders.minMemoryMb"
                          class="w-full rounded-lg border border-white/10 bg-[var(--surface-input)] px-3 py-2 text-[length:var(--text-sm)] text-white outline-none transition-colors focus:border-[var(--accent-border-focus)]" />
                      </div>
                    </div>
                  </div>
                  <!-- Resolution -->
                  <div class="flex flex-col gap-2">
                    <label class="text-[length:var(--text-2xs)] font-bold tracking-[0.14em] text-white/40">FENSTERGRÖSSE</label>
                    <div class="flex gap-3">
                      <div class="flex flex-1 flex-col gap-1">
                        <span class="text-[length:var(--text-2xs)] text-white/35">Breite</span>
                        <input v-model="settingsForm.resolutionWidth" type="number" min="640" step="1" placeholder="1280"
                          class="w-full rounded-lg border border-white/10 bg-[var(--surface-input)] px-3 py-2 text-[length:var(--text-sm)] text-white outline-none transition-colors focus:border-[var(--accent-border-focus)]" />
                      </div>
                      <div class="flex flex-1 flex-col gap-1">
                        <span class="text-[length:var(--text-2xs)] text-white/35">Höhe</span>
                        <input v-model="settingsForm.resolutionHeight" type="number" min="480" step="1" placeholder="720"
                          class="w-full rounded-lg border border-white/10 bg-[var(--surface-input)] px-3 py-2 text-[length:var(--text-sm)] text-white outline-none transition-colors focus:border-[var(--accent-border-focus)]" />
                      </div>
                    </div>
                  </div>
                  <!-- JVM args -->
                  <div class="flex flex-col gap-1.5">
                    <label class="text-[length:var(--text-2xs)] font-bold tracking-[0.14em] text-white/40">ZUSÄTZLICHE JVM-ARGUMENTE</label>
                    <input v-model="settingsForm.jvmArgs" type="text" :placeholder="settingsPlaceholders.jvmArgs"
                      class="w-full rounded-lg border border-white/10 bg-[var(--surface-input)] px-3 py-2 font-mono text-[length:var(--text-sm)] text-white outline-none transition-colors focus:border-[var(--accent-border-focus)]" />
                  </div>
                  <!-- Java override -->
                  <div class="flex flex-col gap-1.5">
                    <label class="text-[length:var(--text-2xs)] font-bold tracking-[0.14em] text-white/40">JAVA-PFAD (OPTIONAL)</label>
                    <input v-model="settingsForm.javaPath" type="text" :placeholder="settingsPlaceholders.javaPath"
                      class="w-full rounded-lg border border-white/10 bg-[var(--surface-input)] px-3 py-2 font-mono text-[length:var(--text-sm)] text-white outline-none transition-colors focus:border-[var(--accent-border-focus)]" />
                    <span class="text-[length:var(--text-2xs)] text-white/30">Pfad zur java-Executable oder zum JDK-Verzeichnis. Leer = automatisch.</span>
                  </div>

                  <!-- Card image -->
                  <div class="flex flex-col gap-1.5">
                    <label class="text-[length:var(--text-2xs)] font-bold tracking-[0.14em] text-white/40">{{ t("profiles.icon").toUpperCase() }}</label>
                    <div class="flex items-center gap-2.5">
                      <div class="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-[7px] border border-white/10 bg-white/5">
                        <img v-if="iconForm || managingInstance.packIconUrl" :src="iconForm || managingInstance.packIconUrl"
                          alt="" class="size-full object-cover" @error="handleImgError" />
                        <span v-else class="text-[18px]">{{ versionEmoji(managingInstance.versionType) }}</span>
                      </div>
                      <input v-model="iconForm" type="text" :placeholder="t('profiles.iconPlaceholder')"
                        class="w-full rounded-lg border border-white/10 bg-[var(--surface-input)] px-3 py-2 font-mono text-[length:var(--text-sm)] text-white outline-none transition-colors focus:border-[var(--accent-border-focus)]" />
                    </div>
                    <span class="text-[length:var(--text-2xs)] text-white/30">{{ t("profiles.iconHint") }}</span>
                  </div>

                  <!-- Window behaviour -->
                  <div class="flex flex-col gap-2">
                    <label class="text-[length:var(--text-2xs)] font-bold tracking-[0.14em] text-white/40">{{ t("settings.options").toUpperCase() }}</label>
                    <label class="flex cursor-pointer items-center gap-2.5 rounded-lg border border-white/8 bg-white/[0.03] px-3 py-2.5">
                      <input v-model="settingsForm.fullscreen" type="checkbox" class="size-3.5 accent-[var(--primary)]" />
                      <span class="text-[length:var(--text-sm)] text-white/80">{{ t("settings.fullscreen") }}</span>
                    </label>
                    <label class="flex cursor-pointer items-center gap-2.5 rounded-lg border border-white/8 bg-white/[0.03] px-3 py-2.5">
                      <input v-model="settingsForm.hideLauncher" type="checkbox" class="size-3.5 accent-[var(--primary)]" />
                      <span class="text-[length:var(--text-sm)] text-white/80">{{ t("settings.hideLauncher") }}</span>
                    </label>
                  </div>

                  <!-- Advanced: hooks, wrapper, environment and the directory override -->
                  <div class="flex flex-col gap-2">
                    <button type="button"
                      class="flex items-center gap-2 text-[length:var(--text-2xs)] font-bold tracking-[0.14em] text-white/40 transition-colors hover:text-white/70"
                      @click="showAdvancedProfileSettings = !showAdvancedProfileSettings">
                      <Icon :icon="showAdvancedProfileSettings ? 'lucide:chevron-down' : 'lucide:chevron-right'" class="size-3" />
                      {{ t("settings.sections.advanced").toUpperCase() }}
                    </button>

                    <div v-if="showAdvancedProfileSettings" class="flex flex-col gap-4 rounded-lg border border-white/8 bg-white/[0.02] p-3.5">
                      <div class="flex flex-col gap-1.5">
                        <label class="text-[length:var(--text-2xs)] font-bold tracking-[0.14em] text-white/40">{{ t("profileSettings.wrapper").toUpperCase() }}</label>
                        <input v-model="settingsForm.wrapperCommand" type="text" placeholder="gamemoderun"
                          class="w-full rounded-lg border border-white/10 bg-[var(--surface-input)] px-3 py-2 font-mono text-[length:var(--text-sm)] text-white outline-none transition-colors focus:border-[var(--accent-border-focus)]" />
                        <span class="text-[length:var(--text-2xs)] leading-[1.5] text-white/30">{{ t("profileSettings.wrapperHint") }}</span>
                      </div>

                      <div class="flex flex-col gap-1.5">
                        <label class="text-[length:var(--text-2xs)] font-bold tracking-[0.14em] text-white/40">{{ t("profileSettings.env").toUpperCase() }}</label>
                        <textarea v-model="settingsForm.envVars" rows="3" placeholder="MESA_GL_VERSION_OVERRIDE=4.6"
                          class="w-full resize-y rounded-lg border border-white/10 bg-[var(--surface-input)] px-3 py-2 font-mono text-[length:var(--text-sm)] text-white outline-none transition-colors focus:border-[var(--accent-border-focus)]"></textarea>
                        <span class="text-[length:var(--text-2xs)] leading-[1.5] text-white/30">{{ t("profileSettings.envHint") }}</span>
                      </div>

                      <div class="flex flex-col gap-1.5">
                        <label class="text-[length:var(--text-2xs)] font-bold tracking-[0.14em] text-white/40">{{ t("profileSettings.preLaunch").toUpperCase() }}</label>
                        <input v-model="settingsForm.preLaunchCommand" type="text"
                          class="w-full rounded-lg border border-white/10 bg-[var(--surface-input)] px-3 py-2 font-mono text-[length:var(--text-sm)] text-white outline-none transition-colors focus:border-[var(--accent-border-focus)]" />
                        <span class="text-[length:var(--text-2xs)] leading-[1.5] text-white/30">{{ t("profileSettings.preLaunchHint") }}</span>
                      </div>

                      <div class="flex flex-col gap-1.5">
                        <label class="text-[length:var(--text-2xs)] font-bold tracking-[0.14em] text-white/40">{{ t("profileSettings.postExit").toUpperCase() }}</label>
                        <input v-model="settingsForm.postExitCommand" type="text"
                          class="w-full rounded-lg border border-white/10 bg-[var(--surface-input)] px-3 py-2 font-mono text-[length:var(--text-sm)] text-white outline-none transition-colors focus:border-[var(--accent-border-focus)]" />
                      </div>

                      <div class="flex flex-col gap-1.5">
                        <label class="text-[length:var(--text-2xs)] font-bold tracking-[0.14em] text-white/40">{{ t("profileSettings.gameDirectory").toUpperCase() }}</label>
                        <input v-model="settingsForm.gameDirectory" type="text" :placeholder="managingInstance.gameDirectory"
                          class="w-full rounded-lg border border-white/10 bg-[var(--surface-input)] px-3 py-2 font-mono text-[length:var(--text-sm)] text-white outline-none transition-colors focus:border-[var(--accent-border-focus)]" />
                        <span class="text-[length:var(--text-2xs)] leading-[1.5] text-white/30">{{ t("profileSettings.gameDirectoryHint") }}</span>
                      </div>
                    </div>
                  </div>

                  <div class="flex justify-end gap-2 pt-1">
                    <button type="button"
                      class="inline-flex items-center gap-1.5 rounded-[7px] border border-white/10 bg-white/5 px-3.5 py-[7px] text-[length:var(--text-sm)] font-semibold tracking-[0.07em] text-white/45 transition-all hover:bg-white/10"
                      @click="activePanel = null">
                      {{ t("common.cancel") }}
                    </button>
                    <button type="button"
                      class="inline-flex items-center gap-1.5 rounded-[7px] border border-[var(--accent-border-strong)] bg-[var(--accent-bg-strong)] px-3.5 py-[7px] text-[length:var(--text-sm)] font-semibold tracking-[0.07em] text-[var(--primary)] transition-all hover:bg-[var(--accent-bg-hover)] disabled:cursor-not-allowed disabled:opacity-50"
                      :disabled="isSavingSettings" @click="saveSettings">
                      <Icon :icon="isSavingSettings ? 'lucide:loader-2' : 'lucide:save'" class="size-[12px]" :class="isSavingSettings ? 'animate-spin' : ''" />
                      {{ t("common.save") }}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <!-- Default: actions -->
            <div v-else class="flex flex-1 flex-col overflow-hidden rounded-xl border border-white/8 bg-[var(--surface-panel)]">
              <div class="border-b border-white/7 px-4 py-3 text-[length:var(--text-sm)] font-bold tracking-[0.1em] text-white">AKTIONEN</div>
              <div class="flex-1 overflow-y-auto p-4">
                <div class="flex flex-col gap-1.5">
                  <button type="button"
                    class="flex items-center gap-3 rounded-lg border border-white/8 bg-white/[0.03] px-3.5 py-2.5 text-[length:var(--text-sm)] text-white/70 transition-all hover:bg-white/8 hover:text-white"
                    @click="startEdit(managingInstance)">
                    <Icon icon="lucide:pencil" class="size-3.5 shrink-0 text-white/40" />
                    <span>{{ t("common.rename") }}</span>
                  </button>
                  <button type="button"
                    class="flex items-center gap-3 rounded-lg border border-white/8 bg-white/[0.03] px-3.5 py-2.5 text-[length:var(--text-sm)] text-white/70 transition-all hover:bg-white/8 hover:text-white"
                    @click="openFolder(managingInstance)">
                    <Icon icon="lucide:folder-open" class="size-3.5 shrink-0 text-white/40" />
                    <span>{{ t("profiles.openFolder") }}</span>
                  </button>
                  <button type="button"
                    class="flex items-center gap-3 rounded-lg border border-white/8 bg-white/[0.03] px-3.5 py-2.5 text-[length:var(--text-sm)] text-white/70 transition-all hover:bg-white/8 hover:text-white"
                    @click="startDuplicate(managingInstance)">
                    <Icon icon="lucide:copy" class="size-3.5 shrink-0 text-white/40" />
                    <span>{{ t("profiles.duplicate") }}</span>
                  </button>
                  <button type="button"
                    class="flex items-center gap-3 rounded-lg border border-white/8 bg-white/[0.03] px-3.5 py-2.5 text-[length:var(--text-sm)] text-white/70 transition-all hover:bg-white/8 hover:text-white"
                    @click="startGroup(managingInstance)">
                    <Icon icon="lucide:folder" class="size-3.5 shrink-0 text-white/40" />
                    <span>{{ t("profiles.group") }}</span>
                  </button>
                  <button type="button"
                    class="flex items-center gap-3 rounded-lg border border-white/8 bg-white/[0.03] px-3.5 py-2.5 text-[length:var(--text-sm)] text-white/70 transition-all hover:bg-white/8 hover:text-white"
                    @click="openVerify">
                    <Icon icon="lucide:shield-check" class="size-3.5 shrink-0 text-white/40" />
                    <span>{{ t("verify.title") }}</span>
                  </button>
                  <button type="button"
                    class="flex items-center gap-3 rounded-lg border border-white/8 bg-white/[0.03] px-3.5 py-2.5 text-[length:var(--text-sm)] text-white/70 transition-all hover:bg-white/8 hover:text-white"
                    @click="openExport">
                    <Icon icon="lucide:package-open" class="size-3.5 shrink-0 text-white/40" />
                    <span>{{ t("export.title") }}</span>
                  </button>
                  <button type="button"
                    class="flex items-center gap-3 rounded-lg border border-red-500/20 bg-red-500/[0.06] px-3.5 py-2.5 text-[length:var(--text-sm)] text-[var(--danger-text,#f87171)] transition-all hover:bg-red-500/15"
                    :disabled="managingInstance.running" @click="startDelete(managingInstance)">
                    <Icon icon="lucide:trash-2" class="size-3.5 shrink-0" />
                    <span>{{ t("common.delete") }}</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </template>
  </div>

  <!-- Version picker for one installed file -->
  <Teleport to="body">
    <div v-if="versionPickerFile"
      class="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 p-5 backdrop-blur-md"
      @click.self="closeVersionPicker">
      <div class="flex max-h-[70vh] w-full max-w-[520px] flex-col rounded-[14px] border border-[var(--accent-border)] bg-[var(--surface-panel-strong)] shadow-[var(--shadow-modal)]">
        <div class="flex items-center justify-between border-b border-white/7 px-5 py-4">
          <div class="min-w-0">
            <div class="truncate text-[length:var(--text-lg)] font-bold tracking-[0.1em] text-white">
              {{ t("content.chooseVersion").toUpperCase() }}
            </div>
            <div class="truncate text-[length:var(--text-2xs)] text-white/40">
              {{ versionPickerFile.source?.projectName || versionPickerFile.fileName }}
            </div>
          </div>
          <button type="button"
            class="flex size-7 shrink-0 items-center justify-center rounded-md border border-white/10 bg-white/5 text-white/40 transition-all hover:bg-white/10 hover:text-white"
            @click="closeVersionPicker">
            <Icon icon="lucide:x" class="size-[14px]" />
          </button>
        </div>
        <div class="flex-1 overflow-y-auto p-3">
          <div v-if="isLoadingVersionList" class="py-8 text-center text-[length:var(--text-sm)] text-white/40">
            {{ t("content.checking") }}
          </div>
          <div v-else-if="versionPickerList.length === 0"
            class="py-8 text-center text-[length:var(--text-sm)] text-white/40">
            {{ t("install.noCompatibleVersion") }}
          </div>
          <div v-else class="flex flex-col gap-1.5">
            <button v-for="version in versionPickerList" :key="version.versionId" type="button"
              :disabled="!version.downloadable"
              class="flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5 text-left transition-all disabled:cursor-not-allowed disabled:opacity-40"
              :class="version.versionId === versionPickerFile.source?.versionId
                ? 'border-[var(--accent-border-strong)] bg-[var(--accent-bg-soft)]'
                : 'border-white/8 bg-white/[0.03] hover:bg-white/8'"
              @click="pickVersion(version)">
              <div class="min-w-0">
                <div class="truncate text-[length:var(--text-sm)] font-medium text-white">
                  {{ version.versionNumber || version.name }}
                </div>
                <div class="truncate text-[length:var(--text-2xs)] text-white/35">
                  {{ version.releaseType }} · {{ version.gameVersions.slice(0, 3).join(", ") }}
                  <span v-if="version.datePublished"> · {{ formatRelativeIso(version.datePublished) }}</span>
                </div>
              </div>
              <span v-if="version.versionId === versionPickerFile.source?.versionId"
                class="shrink-0 rounded-[5px] border border-[var(--success-border)] bg-[var(--success-bg)] px-2 py-0.5 text-[length:var(--text-2xs)] font-bold text-[var(--accent)]">
                {{ t("content.currentVersion") }}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>

  <!-- Modpack release picker -->
  <Teleport to="body">
    <div v-if="showReleasePicker"
      class="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 p-5 backdrop-blur-md"
      @click.self="showReleasePicker = false">
      <div class="flex max-h-[70vh] w-full max-w-[520px] flex-col rounded-[14px] border border-[var(--accent-border)] bg-[var(--surface-panel-strong)] shadow-[var(--shadow-modal)]">
        <div class="flex items-center justify-between border-b border-white/7 px-5 py-4">
          <div class="text-[length:var(--text-lg)] font-bold tracking-[0.1em] text-white">
            {{ t("modpack.chooseRelease").toUpperCase() }}
          </div>
          <button type="button"
            class="flex size-7 items-center justify-center rounded-md border border-white/10 bg-white/5 text-white/40 transition-all hover:bg-white/10 hover:text-white"
            @click="showReleasePicker = false">
            <Icon icon="lucide:x" class="size-[14px]" />
          </button>
        </div>
        <div class="flex-1 overflow-y-auto p-3">
          <div v-if="packReleases.length === 0" class="py-8 text-center text-[length:var(--text-sm)] text-white/40">
            {{ t("content.checking") }}
          </div>
          <div v-else class="flex flex-col gap-1.5">
            <button v-for="release in packReleases" :key="release.versionId" type="button"
              :disabled="!release.downloadable"
              class="flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5 text-left transition-all disabled:cursor-not-allowed disabled:opacity-40"
              :class="release.versionId === modpackStatus?.modpack?.versionId
                ? 'border-[var(--accent-border-strong)] bg-[var(--accent-bg-soft)]'
                : 'border-white/8 bg-white/[0.03] hover:bg-white/8'"
              @click="runPackUpdate(release.versionId)">
              <div class="min-w-0">
                <div class="truncate text-[length:var(--text-sm)] font-medium text-white">
                  {{ release.versionNumber || release.name }}
                </div>
                <div class="truncate text-[length:var(--text-2xs)] text-white/35">
                  {{ release.releaseType }} · {{ release.gameVersions.slice(0, 3).join(", ") }}
                </div>
              </div>
              <span v-if="release.versionId === modpackStatus?.modpack?.versionId"
                class="shrink-0 rounded-[5px] border border-[var(--success-border)] bg-[var(--success-bg)] px-2 py-0.5 text-[length:var(--text-2xs)] font-bold text-[var(--accent)]">
                {{ t("content.currentVersion") }}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>

  <!-- Export modal -->
  <Teleport to="body">
    <div v-if="showExportModal"
      class="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 p-5 backdrop-blur-md"
      @click.self="showExportModal = false">
      <div class="w-full max-w-[460px] rounded-[14px] border border-[var(--accent-border)] bg-[var(--surface-panel-strong)] shadow-[var(--shadow-modal)]">
        <div class="flex items-center justify-between border-b border-white/7 px-5 py-4">
          <div class="text-[length:var(--text-lg)] font-bold tracking-[0.1em] text-white">
            {{ t("export.title").toUpperCase() }}
          </div>
          <button type="button"
            class="flex size-7 items-center justify-center rounded-md border border-white/10 bg-white/5 text-white/40 transition-all hover:bg-white/10 hover:text-white"
            @click="showExportModal = false">
            <Icon icon="lucide:x" class="size-[14px]" />
          </button>
        </div>

        <div class="flex flex-col gap-4 p-5">
          <div class="flex flex-col gap-1.5">
            <label class="text-[length:var(--text-2xs)] font-bold tracking-[0.14em] text-white/40">
              {{ t("export.format").toUpperCase() }}
            </label>
            <div class="flex gap-2">
              <button v-for="f in (['mrpack', 'curseforge'] as ExportFormat[])" :key="f" type="button"
                class="flex-1 rounded-lg border px-3 py-2 text-[length:var(--text-sm)] font-semibold transition-all"
                :class="exportFormat === f
                  ? 'border-[var(--accent-border-strong)] bg-[var(--accent-bg-strong)] text-[var(--primary)]'
                  : 'border-white/10 bg-white/[0.03] text-white/50 hover:bg-white/8'"
                @click="exportFormat = f; exportResult = null">
                {{ f === 'mrpack' ? t("export.mrpack") : t("export.curseforge") }}
              </button>
            </div>
          </div>

          <div class="flex flex-col gap-1.5">
            <label class="text-[length:var(--text-2xs)] font-bold tracking-[0.14em] text-white/40">
              {{ t("export.version").toUpperCase() }}
            </label>
            <input v-model="exportVersion" type="text" placeholder="1.0.0"
              class="w-full rounded-lg border border-white/10 bg-[var(--surface-input)] px-3 py-2 text-[length:var(--text-sm)] text-white outline-none transition-colors focus:border-[var(--accent-border-focus)]" />
            <span class="text-[length:var(--text-2xs)] text-white/30">{{ t("export.hint") }}</span>
          </div>

          <div v-if="exportResult"
            class="rounded-lg border border-[var(--success-border)] bg-[var(--success-bg)] px-3 py-2.5">
            <div class="text-[length:var(--text-sm)] font-semibold text-[var(--accent)]">
              {{ t("export.done", { file: exportResult.fileName }) }}
            </div>
            <div class="mt-0.5 text-[length:var(--text-2xs)] text-white/45">
              {{ t("export.summary", { referenced: exportResult.referenced, bundled: exportResult.bundled }) }}
            </div>
            <div v-for="note in exportResult.notes" :key="note" class="mt-0.5 text-[length:var(--text-2xs)] text-white/35">
              {{ note }}
            </div>
          </div>

          <div class="flex justify-end gap-2">
            <button v-if="exportResult" type="button"
              class="inline-flex items-center gap-1.5 rounded-[7px] border border-white/10 bg-white/5 px-3.5 py-[7px] text-[length:var(--text-sm)] font-semibold text-white/50 transition-all hover:bg-white/10"
              @click="openDirectory('exports')">
              <Icon icon="lucide:folder-open" class="size-[12px]" />{{ t("export.showFolder") }}
            </button>
            <button type="button" :disabled="isExporting"
              class="inline-flex items-center gap-1.5 rounded-[7px] border border-[var(--accent-border-strong)] bg-[var(--accent-bg-strong)] px-3.5 py-[7px] text-[length:var(--text-sm)] font-semibold text-[var(--primary)] transition-all hover:bg-[var(--accent-bg-hover)] disabled:cursor-not-allowed disabled:opacity-50"
              @click="runExport">
              <Icon :icon="isExporting ? 'lucide:loader-2' : 'lucide:package-open'" class="size-[12px]"
                :class="isExporting ? 'animate-spin' : ''" />
              {{ isExporting ? t("export.running") : t("export.action") }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>

  <!-- Duplicate modal -->
  <Teleport to="body">
    <div v-if="duplicateTarget"
      class="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 p-5 backdrop-blur-md"
      @click.self="duplicateTarget = null">
      <div class="w-full max-w-[440px] rounded-[14px] border border-[var(--accent-border)] bg-[var(--surface-panel-strong)] shadow-[var(--shadow-modal)]">
        <div class="flex items-center justify-between border-b border-white/7 px-5 py-4">
          <div class="text-[length:var(--text-lg)] font-bold tracking-[0.1em] text-white">
            {{ t("profiles.duplicateTitle").toUpperCase() }}
          </div>
          <button type="button"
            class="flex size-7 items-center justify-center rounded-md border border-white/10 bg-white/5 text-white/40 transition-all hover:bg-white/10 hover:text-white"
            @click="duplicateTarget = null">
            <Icon icon="lucide:x" class="size-[14px]" />
          </button>
        </div>
        <div class="flex flex-col gap-4 p-5">
          <div class="flex flex-col gap-1.5">
            <label class="text-[length:var(--text-2xs)] font-bold tracking-[0.14em] text-white/40">PROFILNAME</label>
            <input v-model="duplicateName" type="text"
              class="w-full rounded-lg border border-white/10 bg-[var(--surface-input)] px-[13px] py-2.5 text-[length:var(--text-md)] text-white outline-none transition-colors focus:border-[var(--accent-border-focus)]"
              @keyup.enter="confirmDuplicate" />
            <span class="text-[length:var(--text-2xs)] leading-[1.5] text-white/30">{{ t("profiles.duplicateHint") }}</span>
          </div>
          <div class="flex justify-end gap-2">
            <button type="button"
              class="rounded-[7px] border border-white/10 bg-white/5 px-3.5 py-[7px] text-[length:var(--text-sm)] font-semibold text-white/45 transition-all hover:bg-white/10"
              @click="duplicateTarget = null">
              {{ t("common.cancel") }}
            </button>
            <button type="button" :disabled="!duplicateName.trim() || isDuplicating"
              class="inline-flex items-center gap-1.5 rounded-[7px] border border-[var(--accent-border-strong)] bg-[var(--accent-bg-strong)] px-3.5 py-[7px] text-[length:var(--text-sm)] font-semibold text-[var(--primary)] transition-all hover:bg-[var(--accent-bg-hover)] disabled:cursor-not-allowed disabled:opacity-50"
              @click="confirmDuplicate">
              <Icon :icon="isDuplicating ? 'lucide:loader-2' : 'lucide:copy'" class="size-[12px]"
                :class="isDuplicating ? 'animate-spin' : ''" />
              {{ isDuplicating ? t("profiles.duplicating") : t("profiles.duplicate") }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>

  <!-- Folder modal -->
  <Teleport to="body">
    <div v-if="groupTarget"
      class="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 p-5 backdrop-blur-md"
      @click.self="groupTarget = null">
      <div class="w-full max-w-[430px] rounded-[14px] border border-[var(--accent-border)] bg-[var(--surface-panel-strong)] shadow-[var(--shadow-modal)]">
        <div class="border-b border-white/7 px-5 py-4 text-[length:var(--text-lg)] font-bold tracking-[0.1em] text-white">
          {{ t("profiles.groupTitle").toUpperCase() }}
        </div>
        <div class="flex flex-col gap-4 p-5">
          <div class="flex flex-col gap-1.5">
            <input v-model="groupValue" type="text" maxlength="48" list="profile-groups"
              :placeholder="t('profiles.groupPlaceholder')"
              class="w-full rounded-lg border border-white/10 bg-[var(--surface-input)] px-[13px] py-2.5 text-[length:var(--text-md)] text-white outline-none transition-colors focus:border-[var(--accent-border-focus)]"
              @keyup.enter="confirmGroup" />
            <datalist id="profile-groups">
              <option v-for="group in instanceGroups" :key="group" :value="group" />
            </datalist>
            <span class="text-[length:var(--text-2xs)] text-white/30">{{ t("profiles.groupHint") }}</span>
          </div>
          <div class="flex justify-end gap-2">
            <button type="button"
              class="rounded-[7px] border border-white/10 bg-white/5 px-3.5 py-[7px] text-[length:var(--text-sm)] font-semibold text-white/45 transition-all hover:bg-white/10"
              @click="groupTarget = null">
              {{ t("common.cancel") }}
            </button>
            <button type="button"
              class="rounded-[7px] border border-[var(--accent-border-strong)] bg-[var(--accent-bg-strong)] px-3.5 py-[7px] text-[length:var(--text-sm)] font-semibold text-[var(--primary)] transition-all hover:bg-[var(--accent-bg-hover)]"
              @click="confirmGroup">
              {{ t("common.save") }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>

  <!-- Verify and repair modal -->
  <Teleport to="body">
    <div v-if="showVerifyModal"
      class="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 p-5 backdrop-blur-md"
      @click.self="showVerifyModal = false">
      <div class="flex max-h-[80vh] w-full max-w-[520px] flex-col rounded-[14px] border border-[var(--accent-border)] bg-[var(--surface-panel-strong)] shadow-[var(--shadow-modal)]">
        <div class="flex items-center justify-between border-b border-white/7 px-5 py-4">
          <div class="text-[length:var(--text-lg)] font-bold tracking-[0.1em] text-white">
            {{ t("verify.title").toUpperCase() }}
          </div>
          <button type="button"
            class="flex size-7 items-center justify-center rounded-md border border-white/10 bg-white/5 text-white/40 transition-all hover:bg-white/10 hover:text-white"
            @click="showVerifyModal = false">
            <Icon icon="lucide:x" class="size-[14px]" />
          </button>
        </div>

        <div class="flex flex-1 flex-col gap-4 overflow-y-auto p-5">
          <label class="flex cursor-pointer items-start gap-2.5 rounded-lg border border-white/8 bg-white/[0.03] px-3 py-2.5">
            <input v-model="verifyDeep" type="checkbox" class="mt-0.5 size-3.5 accent-[var(--primary)]" />
            <span class="flex flex-col gap-0.5">
              <span class="text-[length:var(--text-sm)] text-white/80">{{ t("verify.deep") }}</span>
              <span class="text-[length:var(--text-2xs)] leading-[1.5] text-white/35">{{ t("verify.deepHint") }}</span>
            </span>
          </label>

          <div v-if="isVerifying" class="flex flex-col gap-2 rounded-lg border border-[var(--accent-border)] bg-[var(--accent-bg-soft)] px-3 py-3">
            <div class="flex items-center gap-2 text-[length:var(--text-sm)] text-[var(--primary)]">
              <Icon icon="lucide:loader-2" class="size-3.5 animate-spin" />{{ t("verify.running") }}
            </div>
            <div class="h-1 overflow-hidden rounded-full bg-white/10">
              <div class="h-full rounded-full bg-[var(--primary)] transition-[width] duration-200"
                :style="{ width: verifyProgress >= 0 ? `${verifyProgress}%` : '35%' }" />
            </div>
          </div>

          <div v-else-if="verifyReport" class="flex flex-col gap-2 rounded-lg border px-3 py-3"
            :class="verifyReport.healthy
              ? 'border-[var(--success-border)] bg-[var(--success-bg)]'
              : 'border-amber-500/25 bg-amber-500/[0.06]'">
            <div class="text-[length:var(--text-sm)] font-semibold"
              :class="verifyReport.healthy ? 'text-[var(--accent)]' : 'text-amber-300'">
              {{ verifyReport.healthy ? t("verify.healthy") : t("verify.problems") }}
            </div>
            <div class="text-[length:var(--text-2xs)] text-white/50">
              {{ t("verify.summary", {
                checked: verifyReport.checked,
                missing: verifyReport.missing,
                corrupt: verifyReport.corrupt,
              }) }}
            </div>
            <div v-if="verifyReport.problems.length > 0" class="max-h-[180px] overflow-y-auto rounded bg-black/25 p-2">
              <div v-for="problem in verifyReport.problems" :key="problem"
                class="font-mono text-[11px] leading-[1.5] text-white/50">{{ problem }}</div>
            </div>
          </div>

          <div class="flex flex-wrap justify-end gap-2">
            <button type="button" :disabled="isVerifying"
              class="inline-flex items-center gap-1.5 rounded-[7px] border border-white/10 bg-white/5 px-3.5 py-[7px] text-[length:var(--text-sm)] font-semibold text-white/60 transition-all hover:bg-white/10 disabled:opacity-50"
              @click="runVerify(false)">
              <Icon icon="lucide:shield-check" class="size-[12px]" />{{ t("verify.quick") }}
            </button>
            <button type="button" :disabled="isVerifying || managingInstance?.running"
              class="inline-flex items-center gap-1.5 rounded-[7px] border border-[var(--accent-border-strong)] bg-[var(--accent-bg-strong)] px-3.5 py-[7px] text-[length:var(--text-sm)] font-semibold text-[var(--primary)] transition-all hover:bg-[var(--accent-bg-hover)] disabled:cursor-not-allowed disabled:opacity-50"
              :title="t('verify.repairHint')"
              @click="runVerify(true)">
              <Icon icon="lucide:wrench" class="size-[12px]" />{{ t("verify.repair") }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>

  <!-- Edit / Rename modal -->
  <Teleport to="body">
    <div v-if="showEditModal && editTargetInstance"
      class="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 p-5 backdrop-blur-md"
      @click.self="showEditModal = false">
      <div
        class="w-full max-w-[420px] rounded-[14px] border border-[var(--accent-border)] bg-[var(--surface-panel-strong)] shadow-[var(--shadow-modal)]">
        <div class="flex items-center justify-between border-b border-white/7 px-5 py-4">
          <div class="text-[length:var(--text-lg)] font-bold tracking-[0.1em] text-white">PROFIL UMBENENNEN</div>
          <button type="button"
            class="flex size-7 items-center justify-center rounded-md border border-white/10 bg-white/5 text-white/40 transition-all duration-200 hover:bg-white/10 hover:text-white"
            @click="showEditModal = false">
            <Icon icon="lucide:x" class="size-[14px]" />
          </button>
        </div>
        <div class="flex flex-col gap-4 p-5">
          <div class="flex flex-col gap-1.5">
            <label class="text-[length:var(--text-2xs)] font-bold tracking-[0.14em] text-white/40">PROFILNAME</label>
            <input v-model="editNewName" type="text"
              class="w-full rounded-lg border border-white/10 bg-[var(--surface-input)] px-[13px] py-2.5 text-[length:var(--text-md)] text-white outline-none transition-colors focus:border-[var(--accent-border-focus)]"
              @keyup.enter="renameManaged(editTargetInstance!.name, editNewName)" />
          </div>
          <div class="flex justify-end gap-2">
            <button type="button"
              class="inline-flex items-center gap-1.5 rounded-[7px] border border-white/10 bg-white/5 px-3.5 py-[7px] text-[length:var(--text-sm)] font-semibold tracking-[0.07em] text-white/45 transition-all duration-200 hover:bg-white/10"
              @click="showEditModal = false">
              {{ t("common.cancel") }}
            </button>
            <button type="button"
              class="inline-flex items-center gap-1.5 rounded-[7px] border border-[var(--accent-border-strong)] bg-[var(--accent-bg-strong)] px-3.5 py-[7px] text-[length:var(--text-sm)] font-semibold tracking-[0.07em] text-[var(--primary)] transition-all duration-200 hover:bg-[var(--accent-bg-hover)] disabled:cursor-not-allowed disabled:opacity-50"
              :disabled="!editNewName.trim() || editNewName.trim() === editTargetInstance.name"
              @click="renameManaged(editTargetInstance!.name, editNewName)">
              {{ t("common.save") }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>

  <!-- Delete confirmation modal -->
  <Teleport to="body">
    <div v-if="showDeleteModal && deleteTargetInstance"
      class="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 p-5 backdrop-blur-md"
      @click.self="showDeleteModal = false">
      <div
        class="w-full max-w-[400px] rounded-[14px] border border-white/10 bg-[var(--surface-panel-strong)] shadow-[var(--shadow-modal)]">
        <div class="flex items-center justify-between border-b border-white/7 px-5 py-4">
          <div class="text-[length:var(--text-lg)] font-bold tracking-[0.1em] text-white">{{ t("profiles.deleteTitle") }}</div>
          <button type="button"
            class="flex size-7 items-center justify-center rounded-md border border-white/10 bg-white/5 text-white/40 transition-all duration-200 hover:bg-white/10 hover:text-white"
            @click="showDeleteModal = false">
            <Icon icon="lucide:x" class="size-[14px]" />
          </button>
        </div>
        <div class="flex flex-col gap-4 p-5">
          <p class="text-[length:var(--text-base)] text-white/70">
            {{ t("profiles.deleteConfirm", { name: deleteTargetInstance.name }) }}
          </p>
          <div class="flex justify-end gap-2">
            <button type="button"
              class="inline-flex items-center gap-1.5 rounded-[7px] border border-white/10 bg-white/5 px-3.5 py-[7px] text-[length:var(--text-sm)] font-semibold tracking-[0.07em] text-white/45 transition-all duration-200 hover:bg-white/10"
              @click="showDeleteModal = false">
              {{ t("common.cancel") }}
            </button>
            <button type="button"
              class="inline-flex items-center gap-1.5 rounded-[7px] border border-red-500/40 bg-red-500/20 px-3.5 py-[7px] text-[length:var(--text-sm)] font-semibold tracking-[0.07em] text-red-400 transition-all duration-200 hover:bg-red-500/30"
              @click="handleDeleteInstance(deleteTargetInstance!.name)">
              <Icon icon="lucide:trash-2" class="size-[11px]" />{{ t("common.delete") }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>
