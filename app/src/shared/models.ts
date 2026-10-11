/** Data models of the backend HTTP API (see docs/ARCHITECTURE.md). */

export type Language = 'de' | 'en'
export type ThemeSetting = 'system' | 'dark' | 'light'

export type UiScale = 'compact' | 'default' | 'comfortable'

export type ProfileSort = 'lastPlayed' | 'name' | 'createdAt'

/** A per-version Java override from the settings ({majorVersion, path}). */
export interface JavaRuntimeOverride {
  majorVersion: number
  path: string
}

export interface Settings {
  language: Language
  theme: ThemeSetting
  /** Default maximum memory in MB; profiles with their own value ignore it. */
  memoryMb: number
  /** Default minimum memory in MB (the old "Minimum" slider). */
  minMemoryMb: number
  /** CurseForge bridge address. Fixed by the launcher: GET shows it, PATCH answers 400. */
  bridgeUrl: string
  javaPath: string | null
  /** JVM arguments added to every launch unless a profile sets its own. */
  defaultJvmArgs: string
  javaRuntimes: JavaRuntimeOverride[]
  closeOnLaunch: boolean
  openLogsOnLaunch: boolean
  downloadThreads: number
  backupsToKeep: number
  backupBeforePackUpdate: boolean
  profileSort: ProfileSort
  /** What a quick-join entry shows: the server name (falls back to the address) or the address. */
  quickJoinLabel: 'name' | 'address'
  favouritesFirst: boolean
  /** "#rrggbb"; the default blue means "use the theme's own accent". */
  accentColor: string
  uiScale: UiScale
  animationsEnabled: boolean
  showFps: boolean
  discordPresence: boolean
  /** Discord application id (digits); empty means rich presence is not configured. Fixed: GET shows it, PATCH answers 400. */
  discordApplicationId: string
  autoUpdate: boolean
  betaUpdates: boolean
  /** Synced packs: a new profile per new Minecraft version, with the selected packs (see SyncPackAuto). */
  syncPackAutoEnabled: boolean
  syncPackAutoLoader: SyncPackAutoLoader
  syncPackAutoVersions: SyncPackAutoVersions
  /** Ids of the packs installed into every new profile of the automatic creation. */
  syncPackAutoPacks: string[]
}

/** What a synced pack entry is. Data packs are not part of packs. */
export type SyncPackKind = 'mod' | 'resourcepack' | 'shader'
export const SYNC_PACK_KINDS: readonly SyncPackKind[] = ['mod', 'resourcepack', 'shader']

/** One content project of a synced pack. */
export interface SyncPackEntry {
  provider: 'modrinth' | 'curseforge'
  projectId: string
  kind: SyncPackKind
  name: string
  iconUrl: string | null
}

/** A named list of content projects. `profiles` holds the ids of the profiles the pack is linked to. */
export interface SyncPack {
  id: string
  name: string
  entries: SyncPackEntry[]
  profiles: string[]
  createdAt: string
}

export type SyncPackAutoLoader = 'fabric' | 'quilt' | 'forge' | 'neoforge'
export type SyncPackAutoVersions = 'release' | 'snapshots'

/** One outcome of the automatic creation, newest last. `profileId` is set when a profile was created. */
export interface SyncPackAutoResult {
  minecraftVersion: string
  status: 'created' | 'skipped' | 'failed'
  reason: string | null
  profileId: string | null
}

/** The automatic creation of profiles per new Minecraft version, with its progress and last outcomes. */
export interface SyncPackAuto {
  enabled: boolean
  loader: SyncPackAutoLoader
  versions: SyncPackAutoVersions
  /** Pack ids used for the new profiles. */
  packs: string[]
  seen: number
  lastCheck: string | null
  lastError: string | null
  results: SyncPackAutoResult[]
}

/** GET /api/syncpacks: every pack plus the automatic creation status. */
export interface SyncPacksView {
  packs: SyncPack[]
  auto: SyncPackAuto
}

/** A file a synced pack installed into a profile. `dependency` marks files pulled in as required dependencies. */
export interface ProfileSyncPackFile {
  projectId: string
  name: string
  kind: SyncPackKind
  fileName: string
  dependency: boolean
}

/** A pack entry by project, as the profile shows it. */
export interface ProfileSyncPackRef {
  projectId: string
  name: string
  kind: SyncPackKind
}

/** One pack linked to a profile. */
export interface ProfileSyncPack {
  packId: string
  name: string
  files: ProfileSyncPackFile[]
  /** In the profile already: the profile's own version wins over the pack's. */
  overridden: ProfileSyncPackRef[]
  /** Removed by the user from this profile; not installed again. */
  declined: ProfileSyncPackRef[]
  /** Pack entries that are not installed yet. */
  missing: SyncPackEntry[]
}

/** GET /api/profiles/:id/syncpacks. */
export interface ProfileSyncPacksView {
  packs: ProfileSyncPack[]
}

/** DELETE /api/profiles/:id/syncpacks/:packId: the files that were removed and the ones kept. */
export interface ProfileSyncPackRemoval {
  removed: string[]
  kept: string[]
}

export type DiscordState = 'disabled' | 'not_configured' | 'waiting_for_discord' | 'rejected' | 'connected'

export interface DiscordStatus {
  state: DiscordState
  message: string
  transport: 'unix socket' | 'named pipe'
  configured: boolean
  enabled: boolean
}

export interface LauncherDirectory {
  id: 'root' | 'profiles' | 'logs' | 'exports' | 'backups' | 'updates' | 'runtimes' | 'cache'
  label: string
  path: string
}

/** Launcher update check (GET /api/updates). */
export interface UpdateInfo {
  available: boolean
  currentVersion: string
  latestVersion: string
  name: string
  notes: string
  publishedAt: string
  releaseUrl: string
  assetName: string
  downloadable: boolean
  assetSize: number
  prerelease: boolean
  /** Why nothing is offered (empty when an update is available and downloadable). */
  reason: string
  /** SHA-512 of the installer from the release (hex), or "" when the release has none. */
  checksumSha512: string
  /** Release channel of the offered version; 'dev' builds are marked in the UI. */
  channel: 'stable' | 'dev'
}

export interface UpdateDownloadResult {
  path: string
  fileName: string
  directory: string
  verified: boolean
}

export interface JavaRuntimeEntry {
  majorVersion: number
  version: string
  path: string
  managed: boolean
}

export interface JavaRuntimes {
  detected: JavaRuntimeEntry[]
  managed: JavaRuntimeEntry[]
  installable: number[]
  configured: JavaRuntimeOverride[]
  installing: Array<{ majorVersion: number; jobId: string }>
}

export interface JavaInstallResult {
  majorVersion: number
  javaPath: string
}

export interface PlatformInfo {
  id: Loader
  displayName: string
}

export type Loader = 'vanilla' | 'fabric' | 'quilt' | 'forge' | 'neoforge'
export const LOADERS: readonly Loader[] = ['vanilla', 'fabric', 'quilt', 'forge', 'neoforge']

export type ProviderId = 'modrinth' | 'curseforge' | 'technic' | 'ftb'
export type ContentKind = 'mod' | 'modpack' | 'resourcepack' | 'shader' | 'datapack'
export const CONTENT_KINDS: readonly ContentKind[] = ['mod', 'modpack', 'resourcepack', 'shader', 'datapack']

export interface ProfileSource {
  provider: ProviderId
  projectId: string
  versionId: string
  name: string
  kind: ContentKind
}

/**
 * Folders and files a profile can share with the other profiles that chose them (one copy for all). `options` is
 * options.txt and `servers` is servers.dat. Mods are never shared.
 */
export type SyncedItem = 'shaderpacks' | 'resourcepacks' | 'saves' | 'screenshots' | 'config' | 'options' | 'servers'
/** The same type under its older name, still used by the API client and the create dialog. */
export type SyncedFolder = SyncedItem

export interface Profile {
  id: string
  name: string
  minecraftVersion: string
  loader: Loader
  loaderVersion: string | null
  memoryMb: number | null
  javaPath: string | null
  jvmArgs: string
  /** Where the game runs: the custom directory when set, else the managed one. Read-only. */
  gameDir: string
  /** Custom game directory (absolute), or null for the managed one. */
  gameDirectory: string | null
  /** Command line put in front of java, e.g. "gamemoderun". */
  wrapperCommand: string | null
  /** Shell command run before the game starts; a non-zero exit aborts the launch. */
  preLaunchCommand: string | null
  /** Shell command run after the game exits. */
  postExitCommand: string | null
  envVars: Record<string, string>
  fullscreen: boolean
  /** Per-profile "hide the launcher on launch"; null uses the global setting (closeOnLaunch). */
  hideLauncher: boolean | null
  favourite: boolean
  /** User-defined group name, or null when ungrouped. */
  group: string | null
  /** Data URL (PNG, JPEG, GIF or WebP) chosen for the card, or null for the initial. */
  iconUrl: string | null
  totalPlaytimeMs: number
  createdAt: string
  lastPlayed: string | null
  source: ProfileSource | null
  /** Folders shared with other profiles; absent or empty when nothing is shared. */
  synced?: SyncedFolder[]
}

/** What GET /api/profiles returns: the profile plus its launch state. */
export interface ProfileListItem extends Profile {
  running: boolean
  phase: GamePhase
}

/** One shared folder that changed in a PATCH with `synced`; `status` is the backend's word for the outcome. */
export interface SyncReportEntry {
  key: SyncedFolder
  moved: number
  conflicts: number
  status: string
}

/** What PATCH /api/profiles/:id answers for `synced`: the profile plus the report of the folders that changed. */
export type ProfileSyncResult = Profile & { syncReport?: SyncReportEntry[] }

/**
 * What GET /api/profiles/:id/logo returns. `kind` says where the logo comes from (custom icon, linked
 * modpack, vanilla block, or the loader); `loader` names the loader for the badge; `dataUrl` is the
 * picture, or null when the backend has none (the renderer then draws a loader badge).
 */
export interface ProfileLogo {
  kind: 'custom' | 'modpack' | 'vanilla' | 'loader'
  loader: Loader
  dataUrl: string | null
}

/** idle, running, stopping, or the marker of the job that holds the profile. */
export type GamePhase = 'idle' | 'running' | 'stopping' | 'install-game' | 'launch' | 'verify' | 'duplicate'

export interface CreateProfileRequest {
  name: string
  minecraftVersion: string
  loader: Loader
  loaderVersion?: string
}

export type UpdateProfileRequest = Partial<
  Pick<
    Profile,
    | 'name'
    | 'memoryMb'
    | 'javaPath'
    | 'jvmArgs'
    | 'minecraftVersion'
    | 'loader'
    | 'loaderVersion'
    | 'gameDirectory'
    | 'wrapperCommand'
    | 'preLaunchCommand'
    | 'postExitCommand'
    | 'envVars'
    | 'fullscreen'
    | 'hideLauncher'
    | 'favourite'
    | 'group'
    | 'iconUrl'
  >
>

export interface VerifyReport {
  checkedAt: string
  libraries: { checked: number; brokenBefore: number; brokenAfter: number; examples: string[] }
  client: { okBefore: boolean; okAfter: boolean }
  repaired: boolean
  ok: boolean
}

export interface GameVersion {
  id: string
  type: string
  releaseTime: string
}

export interface LoaderVersion {
  id: string
  stable: boolean
}

export interface ModMetadata {
  loader: Loader | 'unknown'
  modId: string
  name: string
  version: string
  description: string
}

export interface ModSource {
  provider: ProviderId
  projectId: string
  versionId: string
  versionNumber: string
  name: string
}

export interface ModUpdate {
  versionId: string
  versionNumber: string
  fileName: string
  sha1: string
  url: string
  gameVersions: string[]
  loaders: string[]
}

export interface ModFile {
  fileName: string
  enabled: boolean
  size: number
  sha1: string
  metadata: ModMetadata | null
  source: ModSource | null
  update: ModUpdate | null
}

/** The folders the content endpoints manage (`/api/profiles/:id/content/:type`). */
export type ContentType = 'mods' | 'resourcepacks' | 'shaderpacks' | 'datapacks'

/** A required dependency that the enabled mods need but do not have enabled. */
export interface DependencyWarning {
  fileName: string
  projectName: string
  dependencyProjectId: string
  state: 'missing' | 'disabled'
}

/** Result of `toggle-all`: skipped names are files whose target name was taken. */
export interface ToggleAllResult {
  changed: number
  enabled: boolean
  skipped: string[]
}

/** A world folder with the number of data packs it holds. */
export interface DataPackWorld {
  folder: string
  datapacks: number
}

/** One release of a project (installed-file versions, pack releases). */
export interface ProjectRelease {
  id: string
  name: string
  versionNumber: string
  gameVersions: string[]
  loaders: string[]
  releaseType: string
  fileName: string
  downloadUrl: string
  sha1: string
  datePublished: string
  dependencies: { projectId: string; versionId: string; fileName: string; dependencyType: string }[]
}

/**
 * `GET /api/profiles/:id/modpack`: the pack a profile came from and whether a newer release exists.
 * A linked profile carries `linked: true` and the flat pack fields; an unlinked one answers `{linked: false}`.
 * Older backends send only `modpack`, so a missing `linked` means "linked when `modpack` is set".
 */
export interface ModpackStatus {
  linked?: boolean
  provider?: ProviderId
  projectId?: string
  name?: string
  versionId?: string
  versionNumber?: string
  modpack?: ProfileSource | null
  updateAvailable?: boolean
  latestVersionId?: string
  latestVersionNumber?: string
  latestReleaseDate?: string
  reason?: string
}

export type ExportFormat = 'mrpack' | 'curseforge'

export interface ExportResult {
  path: string
  fileName: string
  referenced: number
  bundled: number
  notes: string[]
}

export type JobState = 'running' | 'done' | 'failed' | 'cancelled'

export interface Job {
  id: string
  kind: string
  title: string
  state: JobState
  progress: number
  message: string
  error: string | null
  result: Record<string, unknown> | null
  createdAt: string
  finishedAt: string | null
}

/**
 * A sort id of one provider. The ids differ per provider and come from the filters endpoint
 * (sorts: [{id, label}]); the renderer knows labels for some of them and shows the backend's label otherwise.
 */
export type SortOption = string

export interface ProviderInfo {
  id: ProviderId
  name: string
  kinds: ContentKind[]
  /** The sort values this provider honours (other values would fall back to relevance). */
  sorts: SortOption[]
  configured: boolean
  message: string
}

export interface ProjectSummary {
  provider: ProviderId
  id: string
  slug: string
  name: string
  summary: string
  iconUrl: string | null
  author: string
  downloads: number
  kind: ContentKind
  categories: string[]
  /** Loader ids of the project (Modrinth and CurseForge search hits); empty when the provider has none. */
  loaders?: string[]
  /** Game versions of the project, as the search hit lists them. */
  gameVersions?: string[]
  /** Followers or likes, when the provider counts them. */
  follows?: number
  /** Last update, ISO 8601, when the provider reports it. */
  updated?: string
}

export interface ProjectDetail extends ProjectSummary {
  /** Markdown source. Rendered without raw HTML. */
  description: string
  /** Image URLs; the contract does not fix the item shape, so the UI accepts strings or `{url}`. */
  gallery: Array<string | { url?: string }>
}

export interface SearchResult {
  total: number
  items: ProjectSummary[]
  /** Another page exists. Optional: an older backend omits it, and the renderer then derives it from total. */
  hasMore?: boolean
  /** Which filters the provider honoured for this search (optional, see FilterSupport). */
  supports?: FilterSupport
}

/** Which filter controls a provider can honour for one kind. A false flag hides the control. */
export interface FilterSupport {
  search: boolean
  kind: boolean
  sort: boolean
  categories: boolean
  gameVersion: boolean
  loader: boolean
  paging: boolean
  /** Modrinth only: client/server environment filter. Absent on older backends (read as false). */
  environment?: boolean
  /** Modrinth only: open-source filter. Absent on older backends (read as false). */
  openSource?: boolean
}

/** One choice of a filter list: `id` is sent to the backend, `label` is shown. */
export interface FilterOption {
  id: string
  label: string
}

/** GET /api/providers/:provider/filters?kind=. Empty lists mean the provider cannot list them. */
export interface ProviderFilters {
  kinds: ContentKind[]
  sorts: FilterOption[]
  categories: FilterOption[]
  gameVersions: string[]
  loaders: string[]
  supports: FilterSupport
}

export interface ProjectVersion {
  id: string
  name: string
  versionNumber: string
  gameVersions: string[]
  loaders: string[]
  fileName: string
  downloadUrl: string
  sha1: string
  datePublished: string
  dependencies: unknown[]
  /** "release" | "beta" | "alpha" (Modrinth version_type, CurseForge releaseType). */
  releaseType: string
}

export interface GameStatus {
  running: boolean
  pid: number | null
  startedAt: string | null
  stopping: boolean
  phase: GamePhase
  lastExit: { exitCode: number; crashed: boolean; endedAt: string; seconds: number } | null
}

/**
 * Starts a launch straight into a multiplayer server or a singleplayer world instead of the menu.
 * `server` is "host[:port]"; `world` is the folder name of the world under saves/.
 */
export type QuickPlay = { mode: 'multiplayer'; server: string } | { mode: 'singleplayer'; world: string }

export interface HealthInfo {
  status: string
  version: string
  dataDir: string
}

// Spieldaten (backend/src/gamedata): worlds, servers, screenshots, logs, backups.

export type GameMode = '' | 'survival' | 'creative' | 'adventure' | 'spectator'

export interface WorldInfo {
  folderName: string
  name: string
  /** ISO timestamp of the last time the world was played (or the folder's modification time). */
  lastPlayed: string
  sizeBytes: number
  gameMode: GameMode
  hardcore: boolean
  versionName: string
  hasIcon: boolean
  readable: boolean
  /** Why the world could not be read; empty when it could. */
  problem: string
}

export interface ServerInfo {
  index: number
  name: string
  address: string
  /** A data URL (PNG) or an empty string when the server never sent an icon. */
  icon: string
  acceptTextures: boolean
}

export interface ScreenshotInfo {
  fileName: string
  takenAt: string
  sizeBytes: number
}

export type LogKind = 'launcher' | 'game' | 'crash'

export interface LogInfo {
  /** "launcher", "game:<file>" or "crash:<file>". */
  id: string
  label: string
  kind: LogKind
  sizeBytes: number
  modifiedAt: string
  live: boolean
  compressed: boolean
}

export interface LogChunk {
  id: string
  offset: number
  nextOffset: number
  size: number
  text: string
  truncated: boolean
}

export interface BackupInfo {
  id: string
  label: string
  createdAt: string
  sizeBytes: number
  minecraftVersion: string
  loader: string
  fileCount: number
}

// --- Accounts and skins (docs/ARCHITECTURE.md, "Konten und Skins") ---

export type AccountType = 'microsoft' | 'offline'

/** One entry of GET /api/accounts. The default offline account "Player" is always listed first. */
export interface Account {
  id: string
  name: string
  type: AccountType
  selected: boolean
  default: boolean
  /** PNG data URL of the current skin; null for offline accounts or when it could not be loaded. */
  skinDataUrl?: string | null
  /** Why the skin could not be loaded, when it could not. */
  skinError?: string
}

export interface AccountsView {
  accounts: Account[]
  selectedId: string
  offlineMode: boolean
}

export interface AccountSession {
  authenticated: boolean
  id: string | null
  name: string | null
  type: AccountType | null
}

export interface LoginStart {
  state: string
  url: string
  expiresAt: string
}

export interface Skin {
  id: string
  name: string
  slim: boolean
  createdAt: string
  selected: boolean
  /** The PNG as a data URL; the preview is drawn from it. */
  imageDataUrl: string
}

export interface SkinLibrary {
  skins: Skin[]
  selectedSkinId: string | null
}

/** GET /api/accounts/skin: the skin the selected Microsoft account uses now (the home page's 3D figure). */
export interface CurrentSkin {
  name: string
  /** Dashed UUID of the account. */
  uuid: string
  model: 'classic' | 'slim'
  /** The texture URL on textures.minecraft.net; null when the account has no skin set. */
  skinUrl: string | null
  /** The skin PNG as a data URL; null when the account has no skin set. */
  dataUrl: string | null
  /** The active cape as a data URL; null when there is none. */
  capeDataUrl: string | null
}

/** Profile import from other launchers (GET /api/imports/scan, POST /api/imports). */
export type ImportLauncherStatus = 'found' | 'none' | 'unavailable'
/** How well the backend knows the launcher's folder layout. */
export type ImportConfidence = 'verified' | 'documented' | 'community'

export interface ImportCandidate {
  /** Unique within its launcher; sent back as `key` when importing. */
  key: string
  name: string
  minecraftVersion: string
  /** Loader id as the launcher names it; the renderer maps unknown ids to "unknown". */
  loader: string
  loaderVersion: string | null
  sizeBytes: number
  path: string
  importable: boolean
  reason: string | null
}

export interface ImportLauncher {
  id: string
  name: string
  status: ImportLauncherStatus
  reason: string | null
  confidence: ImportConfidence
  profiles: ImportCandidate[]
}

export interface ImportScan {
  launchers: ImportLauncher[]
}

export interface ImportItem {
  launcher: string
  key: string
}
