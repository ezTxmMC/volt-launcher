// ── Accounts ──────────────────────────────────────────────────────────────────

export interface AuthData {
  uuid: string;
  username: string;
}

export interface AccountEntry {
  uuid: string;
  username: string;
  selected: boolean;
}

// ── Profiles ──────────────────────────────────────────────────────────────────

export interface InstanceSettings {
  maxMemoryMb: number | null;
  minMemoryMb: number | null;
  jvmArgs: string | null;
  resolutionWidth: number | null;
  resolutionHeight: number | null;
  fullscreen: boolean | null;
  javaPath: string | null;
  /** Extra environment variables for the game process. */
  envVars: Record<string, string>;
  preLaunchCommand: string | null;
  postExitCommand: string | null;
  /** Command the java invocation is passed to, e.g. `gamemoderun`. */
  wrapperCommand: string | null;
  /** Absolute path to run the game in instead of the managed directory. */
  gameDirectory: string | null;
  /** Per-profile override of the launcher-wide "hide on launch" preference. */
  hideLauncher: boolean | null;
}

export type LaunchPhase = "idle" | "installing" | "launching" | "running" | "failed";

export interface LauncherInstance {
  name: string;
  slug: string;
  versionId: string;
  versionType: string;
  createdAt: number;
  lastPlayedAt: number;
  /** Time spent in the game across every session. */
  totalPlaytimeMs: number;
  favourite: boolean;
  /** User-defined folder; blank means ungrouped. */
  groupName: string;
  /** Artwork the user picked; blank falls back to the pack icon or the version emoji. */
  iconUrl: string;
  /** Where the game actually runs, override included. */
  gameDirectory: string;
  customGameDirectory: boolean;
  javaMajorVersion: number;
  javaComponent: string;
  settings: InstanceSettings;
  running: boolean;
  launchPhase: LaunchPhase;
  /** True while a long-running operation owns this profile; its controls must stay disabled. */
  busy: boolean;
  busyStage?: string;
  busyCompleted?: number;
  busyTotal?: number;
  /** Completion percentage, or -1 when the work cannot be counted. */
  busyPercent?: number;
  pid?: number;
  startedAt?: number;
  javaExecutable?: string;
  runningJavaMajorVersion?: number;
  /** Name of the modpack this profile came from; blank for hand-made profiles. */
  packName: string;
  /** Modpack artwork, used instead of the version emoji when present. */
  packIconUrl: string;
}

export interface AvailableVersion {
  id: string;
  type: string;
  releaseTime: string;
}

export interface Platform {
  id: string;
  displayName: string;
}

// ── Instance content ──────────────────────────────────────────────────────────

export type ContentType = "mods" | "resourcepacks" | "shaderpacks" | "datapacks";

/** Where an installed file came from, recorded so its versions can be managed. */
export interface ContentSource {
  contentType: ContentType;
  fileName: string;
  provider: ProviderId | "";
  projectId: string;
  versionId: string;
  projectName: string;
  versionNumber: string;
  downloadUrl: string;
  sha1: string;
  fileSize: number;
  origin: "provider" | "modpack" | "manual";
  /** Project artwork, blank until the project behind the file is known. */
  iconUrl: string;
}

export interface ContentEntry {
  fileName: string;
  size: number;
  enabled: boolean;
  /** Null for files the launcher has no provenance for. */
  source: ContentSource | null;
  /** True when the file has a known project and can be updated or rolled back. */
  tracked: boolean;
}

/** An installed file with a newer compatible release available. */
export interface ContentUpdate {
  contentType: ContentType;
  fileName: string;
  projectId: string;
  projectName: string;
  currentVersionId: string;
  currentVersionNumber: string;
  latestVersionId: string;
  latestVersionNumber: string;
  latestFileName: string;
  releaseDate: string;
}

// ── Modpacks ──────────────────────────────────────────────────────────────────

export interface ModpackOrigin {
  provider: ProviderId | "";
  projectId: string;
  versionId: string;
  versionNumber: string;
  name: string;
  /** Set for locally imported archives, which have no upstream to check. */
  sourceFile: string;
  iconUrl: string;
  updatable: boolean;
}

export interface ModpackStatus {
  modpack: ModpackOrigin | null;
  updateAvailable: boolean;
  latestVersionId: string;
  latestVersionNumber: string;
  latestReleaseDate: string;
  reason: string;
}

export type ExportFormat = "mrpack" | "curseforge";

export interface ExportResult {
  path: string;
  fileName: string;
  /** Files the target platform can reference by id. */
  referenced: number;
  /** Files carried inside overrides/ because they could not be referenced. */
  bundled: number;
  notes: string[];
}

// ── Skins ─────────────────────────────────────────────────────────────────────

export interface SavedSkin {
  id: string;
  name: string;
  /** True for the 3px-arm ("Alex") model. */
  slim: boolean;
  createdAt: number;
}

// ── Content providers ─────────────────────────────────────────────────────────

export type ProviderId = "modrinth" | "curseforge" | "technic" | "ftb";

export type ContentKind = "mod" | "modpack" | "resourcepack" | "shader" | "datapack";

export interface ProviderInfo {
  id: ProviderId;
  displayName: string;
  available: boolean;
  unavailableReason: string;
  kinds: ContentKind[];
}

export interface ProjectSummary {
  provider: ProviderId;
  projectId: string;
  slug: string;
  title: string;
  description: string;
  author: string;
  iconUrl: string;
  downloads: number;
  follows: number;
  categories: string[];
  loaders: string[];
  gameVersions: string[];
  kind: ContentKind;
  updated: string;
}

export interface ProjectDetail extends ProjectSummary {
  body: string;
  gallery: string[];
  license: string;
  links: Record<string, string>;
}

export interface VersionDependency {
  projectId: string;
  versionId: string;
  relation: "required" | "optional" | "incompatible" | "embedded" | string;
}

export interface ProjectVersion {
  provider: ProviderId;
  versionId: string;
  projectId: string;
  name: string;
  versionNumber: string;
  gameVersions: string[];
  loaders: string[];
  releaseType: "release" | "beta" | "alpha" | string;
  fileName: string;
  fileSize: number;
  datePublished: string;
  downloadable: boolean;
  dependencies: VersionDependency[];
}

export interface SearchResult {
  hits: ProjectSummary[];
  total: number;
  offset: number;
  limit: number;
}

export type SortIndex = "relevance" | "downloads" | "follows" | "newest" | "updated";

// ── Java ──────────────────────────────────────────────────────────────────────

export interface JavaRuntime {
  majorVersion: number;
  path: string;
  source: string;
}

export interface JavaRuntimeEntry {
  majorVersion: number;
  path: string;
}

export type JavaInstallPhase = "downloading" | "done" | "failed";

export interface JavaInstallJob {
  majorVersion: number;
  phase: JavaInstallPhase;
  message: string | null;
  javaExecutable: string | null;
}

// ── Launcher settings ─────────────────────────────────────────────────────────

export interface LauncherSettings {
  language: "en" | "de";
  accentColor: string;
  uiScale: "compact" | "default" | "comfortable";
  animationsEnabled: boolean;
  showFps: boolean;
  discordPresence: boolean;
  hideLauncherOnLaunch: boolean;
  openLogsOnLaunch: boolean;
  autoUpdate: boolean;
  betaUpdates: boolean;
  /** `owner/repo` the update check reads releases from. */
  updateRepository: string;
  /** Blank until the user registers a Discord application; presence stays off until then. */
  discordApplicationId: string;
  defaultMaxMemoryMb: number;
  defaultMinMemoryMb: number;
  defaultJvmArgs: string;
  maxConcurrentDownloads: number;
  /** How many snapshots to keep per profile; 0 keeps every one. */
  backupsToKeep: number;
  backupBeforePackUpdate: boolean;
  profileSort: ProfileSort;
  favouritesFirst: boolean;
  offlineModeAllowed: boolean;
  curseForgeBridgeUrl: string;
  javaRuntimes: JavaRuntimeEntry[];
}

export interface LauncherDirectory {
  id: string;
  label: string;
  path: string;
}

export type SettingsSectionId =
  | "general"
  | "appearance"
  | "java"
  | "providers"
  | "updates"
  | "account"
  | "advanced";

export type MainTab = "home" | "profiles" | "skins" | "discover" | "settings";

export type ProfileSort = "lastPlayed" | "name" | "playtime" | "created";

// ── Worlds, servers and screenshots ───────────────────────────────────────────

export interface GameWorld {
  /** The directory under `saves/`, which is also the quick-play target. */
  folderName: string;
  name: string;
  lastPlayed: number;
  sizeBytes: number;
  gameMode: string;
  hardcore: boolean;
  versionName: string;
  hasIcon: boolean;
  /** False when level.dat could not be parsed; the world is still listed. */
  readable: boolean;
  problem: string;
}

export interface ServerEntry {
  index: number;
  name: string;
  address: string;
  /** Base64 PNG the server sent, empty until it has been pinged in-game. */
  icon: string;
  acceptTextures: boolean;
}

export interface Screenshot {
  fileName: string;
  takenAt: number;
  sizeBytes: number;
}

// ── Logs ──────────────────────────────────────────────────────────────────────

export type LogKind = "launcher" | "game" | "crash";

export interface LogSource {
  id: string;
  label: string;
  kind: LogKind;
  sizeBytes: number;
  modifiedAt: number;
  /** True for the file a running game is still writing to. */
  live: boolean;
  compressed: boolean;
}

export interface LogChunk {
  id: string;
  offset: number;
  /** Where a follow-up read should continue from. */
  nextOffset: number;
  size: number;
  text: string;
  truncated: boolean;
}

// ── Backups ───────────────────────────────────────────────────────────────────

export interface ProfileBackup {
  /** The archive's file name, which is how it is addressed. */
  id: string;
  label: string;
  createdAt: number;
  sizeBytes: number;
  versionId: string;
  fileCount: number;
}

// ── Verification ──────────────────────────────────────────────────────────────

export interface VerifyReport {
  checked: number;
  missing: number;
  corrupt: number;
  repaired: number;
  healthy: boolean;
  problems: string[];
}

// ── Tasks ─────────────────────────────────────────────────────────────────────

export type TaskState = "running" | "done" | "failed" | "cancelled";

export interface LauncherTask {
  id: string;
  /** Stable identifier of the operation type, used to pick an icon. */
  kind: string;
  title: string;
  subject: string;
  stage: string | null;
  completed: number;
  total: number;
  /** Completion percentage, or -1 when the work cannot be counted. */
  percent: number;
  state: TaskState;
  message: string | null;
  startedAt: number;
  finishedAt: number;
  cancellable: boolean;
}

// ── Launcher updates ──────────────────────────────────────────────────────────

export interface UpdateInfo {
  available: boolean;
  currentVersion: string;
  latestVersion: string;
  name: string;
  notes: string;
  publishedAt: string;
  releaseUrl: string;
  assetName: string;
  downloadable: boolean;
  assetSize: number;
  prerelease: boolean;
  /** Why no update is on offer, when that needs explaining. */
  reason: string;
}

export type DiscordState = "disabled" | "not_configured" | "waiting_for_discord" | "connected";

export interface DiscordStatus {
  state: DiscordState;
  message: string;
  transport: string;
  configured: boolean;
}

// ── Quick play ────────────────────────────────────────────────────────────────

export type QuickPlayKind = "singleplayer" | "multiplayer" | "realms";

export interface LaunchOptions {
  quickPlay?: QuickPlayKind;
  quickPlayTarget?: string;
  demo?: boolean;
}

/** A required dependency that is missing or switched off. */
export interface DependencyWarning {
  fileName: string;
  projectName: string;
  dependencyProjectId: string;
  state: "missing" | "disabled";
}

// ── Notifications ─────────────────────────────────────────────────────────────

export interface LauncherNotification {
  id: number;
  type: "error" | "info";
  message: string;
  timestamp: number;
}
