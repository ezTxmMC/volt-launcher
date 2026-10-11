import type {
  ContentKind,
  ContentType,
  CreateProfileRequest,
  DataPackWorld,
  DependencyWarning,
  ExportFormat,
  ExportResult,
  GameStatus,
  Job,
  ModFile,
  ModpackStatus,
  ProjectRelease,
  ToggleAllResult,
  ProjectDetail,
  ProjectVersion,
  ProviderId,
  ProviderInfo,
  ProviderFilters,
  QuickPlay,
  GameVersion,
  LoaderVersion,
  Profile,
  ProfileListItem,
  ProfileLogo,
  ProfileSyncResult,
  SearchResult,
  Settings,
  SyncedFolder,
  UpdateProfileRequest,
  VerifyReport,
  BackupInfo,
  LogChunk,
  LogInfo,
  ScreenshotInfo,
  ServerInfo,
  WorldInfo,
  AccountSession,
  AccountsView,
  LoginStart,
  Skin,
  SkinLibrary,
  CurrentSkin,
  ImportItem,
  ImportScan,
  SyncPack,
  SyncPackAuto,
  SyncPackEntry,
  SyncPacksView,
  ProfileSyncPackRemoval,
  ProfileSyncPacksView
} from '@shared/models'
import type {
  DiscordStatus,
  JavaRuntimes,
  LauncherDirectory,
  PlatformInfo,
  UpdateInfo
} from '@shared/models'
import type { HttpMethod } from '@shared/bridge'

function bridge() {
  if (!window.volt) throw new Error('The Electron bridge (window.volt) is not available.')
  return window.volt
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  return typeof error === 'string' ? error : 'Unknown error'
}

const signInListeners = new Set<() => void>()

/** Called when the backend reports `sign_in_required`; the auth state then reloads (state/auth.tsx). */
export function onSignInRequired(listener: () => void): () => void {
  signInListeners.add(listener)
  return () => {
    signInListeners.delete(listener)
  }
}

async function request<T>(method: HttpMethod, path: string, body?: unknown): Promise<T> {
  try {
    const result = await bridge().api<T>(method, path, body)
    return result.body
  } catch (error) {
    if (errorMessage(error).includes('sign_in_required')) {
      for (const listener of signInListeners) listener()
    }
    throw error
  }
}

function query(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') search.set(key, String(value))
  }
  const text = search.toString()
  return text ? `?${text}` : ''
}

const enc = encodeURIComponent
const profilePath = (id: string): string => `/api/profiles/${enc(id)}`
const modPath = (id: string, fileName: string): string => `${profilePath(id)}/mods/${enc(fileName)}`
const contentPath = (id: string, type: ContentType): string => `${profilePath(id)}/content/${type}`
const contentFilePath = (id: string, type: ContentType, fileName: string): string => `${contentPath(id, type)}/${enc(fileName)}`
const worldPath = (id: string, folder: string): string => `${profilePath(id)}/worlds/${enc(folder)}`
const shotPath = (id: string, fileName: string): string => `${profilePath(id)}/screenshots/${enc(fileName)}`
const logPath = (id: string, logId: string): string => `${profilePath(id)}/logs/${enc(logId)}`

export interface ContentInstallRequest {
  provider: ProviderId
  projectId: string
  /** Omitted: the newest version that fits the target profile is installed. */
  versionId?: string
  kind: ContentKind
  /** Defaults to true on the backend; false installs only the requested file. */
  withDependencies?: boolean
}

export interface SearchParams {
  q: string
  kind: ContentKind
  gameVersion?: string
  /** A loader id from the provider's filter list (the backend decides which ids exist). */
  loader?: string
  /** Comma separated category ids from the provider's filter list. */
  categories?: string
  sort?: string
  /** Modrinth only: "client", "server" or "client,server". */
  environment?: string
  /** Modrinth only: "true" keeps open-source projects. */
  openSource?: string
  offset: number
  limit: number
}

/** Typed wrappers around the backend endpoints from docs/ARCHITECTURE.md. */
export const api = {
  settings: {
    get: () => request<Settings>('GET', '/api/settings'),
    patch: (patch: Partial<Settings>) => request<Settings>('PATCH', '/api/settings', patch),
    /** Every setting back to its default; answers the new settings. */
    reset: () => request<Settings>('POST', '/api/settings/reset'),
    directories: () => request<LauncherDirectory[]>('GET', '/api/settings/directories'),
    /** Creates the folder if needed and answers its path; the renderer opens it. */
    openDirectory: (id: string) => request<{ path: string }>('POST', `/api/settings/directories/${enc(id)}/open`)
  },
  updates: {
    check: (force = false) => request<UpdateInfo>('GET', force ? '/api/updates?force=1' : '/api/updates'),
    /** Job; its result is an UpdateDownloadResult. */
    download: () => request<Job>('POST', '/api/updates/download'),
    /** Answers the release page address; the renderer opens it. */
    openRelease: () => request<{ url: string }>('POST', '/api/updates/open-release')
  },
  discord: {
    status: () => request<DiscordStatus>('GET', '/api/integrations/discord')
  },
  /** Synced packs: named content lists that profiles install. Jobs run the sync and the automatic creation. */
  syncpacks: {
    list: () => request<SyncPacksView>('GET', '/api/syncpacks'),
    /** 409 when the name is taken, 400 for an empty name. */
    create: (name: string, entries?: SyncPackEntry[]) =>
      request<SyncPack>('POST', '/api/syncpacks', entries ? { name, entries } : { name }),
    /** `entries` replaces the whole list. */
    update: (id: string, patch: { name?: string; entries?: SyncPackEntry[] }) =>
      request<SyncPack>('PATCH', `/api/syncpacks/${enc(id)}`, patch),
    /** The files stay in the profiles as ordinary content. */
    remove: (id: string) => request<unknown>('DELETE', `/api/syncpacks/${enc(id)}`),
    /** Job: brings every linked profile up to date with the pack. */
    sync: (id: string) => request<Job>('POST', `/api/syncpacks/${enc(id)}/sync`),
    fromProfile: (profileId: string, name: string) =>
      request<SyncPack>('POST', '/api/syncpacks/from-profile', { profileId, name }),
    auto: () => request<SyncPackAuto>('GET', '/api/syncpacks/auto'),
    /** Job: builds the profile for one version now. */
    autoCreate: (minecraftVersion: string) => request<Job>('POST', '/api/syncpacks/auto/create', { minecraftVersion }),
    /** Job: looks for new Minecraft versions now. */
    autoCheck: () => request<Job>('POST', '/api/syncpacks/auto/check')
  },
  java: {
    runtimes: () => request<JavaRuntimes>('GET', '/api/java/runtimes'),
    /** Job; its result is a JavaInstallResult. */
    install: (majorVersion: number) => request<Job>('POST', `/api/java/runtimes/${enc(String(majorVersion))}/install`)
  },
  platforms: {
    list: () => request<PlatformInfo[]>('GET', '/api/platforms')
  },
  imports: {
    /** Looks for profiles of other launchers; nothing is read into Volt yet. */
    scan: () => request<ImportScan>('GET', '/api/imports/scan'),
    /** Job: copies the picked profiles. 400 not importable, 404 unknown key, 409 folder too large (message has the size). */
    start: (items: ImportItem[]) => request<Job>('POST', '/api/imports', { items })
  },
  jobs: {
    list: () => request<Job[]>('GET', '/api/jobs'),
    cancel: (id: string) => request<unknown>('POST', `/api/jobs/${enc(id)}/cancel`)
  },
  profiles: {
    list: () => request<ProfileListItem[]>('GET', '/api/profiles'),
    groups: () => request<string[]>('GET', '/api/profiles/groups'),
    get: (id: string) => request<Profile>('GET', profilePath(id)),
    /** `synced` lists the folders shared with other profiles; omitted or empty shares nothing. */
    create: (profile: CreateProfileRequest & { synced?: SyncedFolder[] }) =>
      request<Profile>('POST', '/api/profiles', profile),
    update: (id: string, patch: UpdateProfileRequest) => request<Profile>('PATCH', profilePath(id), patch),
    /** Sends the full list of shared folders. 409 while the game of the profile runs, 400 for unknown keys. */
    setSynced: (id: string, synced: SyncedFolder[]) =>
      request<ProfileSyncResult>('PATCH', profilePath(id), { synced }),
    remove: (id: string) => request<unknown>('DELETE', profilePath(id)),
    duplicate: (id: string, name?: string) =>
      request<Job>('POST', `${profilePath(id)}/duplicate`, name ? { name } : {}),
    setIcon: (id: string, dataUrl: string) => request<Profile>('POST', `${profilePath(id)}/icon`, { dataUrl }),
    verify: (id: string, repair: boolean) => request<Job>('POST', `${profilePath(id)}/verify`, { repair }),
    verifyReport: (id: string) => request<{ report: VerifyReport | null }>('GET', `${profilePath(id)}/verify`),
    /** The profile's logo for the card and the header: custom icon, modpack icon, vanilla block or loader. */
    logo: (id: string) => request<ProfileLogo>('GET', `${profilePath(id)}/logo`),
    syncPacks: {
      list: (id: string) => request<ProfileSyncPacksView>('GET', `${profilePath(id)}/syncpacks`),
      /** Job: links the pack and installs it. 409 while the profile is busy. */
      link: (id: string, packId: string) => request<Job>('POST', `${profilePath(id)}/syncpacks`, { packId }),
      /** Keeps or removes the pack's files in the profile. */
      unlink: (id: string, packId: string, removeFiles: boolean) =>
        request<ProfileSyncPackRemoval>(
          'DELETE',
          `${profilePath(id)}/syncpacks/${enc(packId)}${query({ removeFiles: removeFiles ? 'true' : 'false' })}`
        )
    }
  },
  versions: {
    minecraft: (flags: { includeSnapshots?: boolean; includeBetas?: boolean; includeAlphas?: boolean }) =>
      request<GameVersion[]>(
        'GET',
        `/api/versions${query({
          includeSnapshots: flags.includeSnapshots ? 'true' : undefined,
          includeBetas: flags.includeBetas ? 'true' : undefined,
          includeAlphas: flags.includeAlphas ? 'true' : undefined
        })}`
      ),
    loader: (platformId: string, minecraftVersionId: string) =>
      request<LoaderVersion[]>(
        'GET',
        `/api/loader-versions${query({ platformId, minecraftVersionId })}`
      )
  },
  // Content of one kind (mods, resource packs, shader packs, data packs); data packs take the world folder.
  content: {
    list: (id: string, type: ContentType, world?: string) =>
      request<ModFile[]>('GET', `${contentPath(id, type)}${query({ world })}`),
    worlds: (id: string) => request<{ worlds: DataPackWorld[] }>('GET', `${profilePath(id)}/content/datapacks/worlds`),
    identify: (id: string, type: ContentType, world?: string) =>
      request<Job>('POST', `${contentPath(id, type)}/identify${query({ world })}`),
    checkUpdates: (id: string, type: ContentType, world?: string) =>
      request<Job>('POST', `${contentPath(id, type)}/check-updates${query({ world })}`),
    updateAll: (id: string, type: ContentType, world?: string) =>
      request<Job>('POST', `${contentPath(id, type)}/update-all${query({ world })}`),
    toggleAll: (id: string, type: ContentType, enabled: boolean, world?: string) =>
      request<ToggleAllResult>('POST', `${contentPath(id, type)}/toggle-all${query({ world })}`, { enabled }),
    dependencies: (id: string, type: ContentType) =>
      request<{ warnings: DependencyWarning[] }>('GET', `${contentPath(id, type)}/dependencies`),
    versions: (id: string, type: ContentType, fileName: string, world?: string) =>
      request<ProjectRelease[]>('GET', `${contentFilePath(id, type, fileName)}/versions${query({ world })}`),
    changeVersion: (id: string, type: ContentType, fileName: string, versionId: string, world?: string) =>
      request<Job>('POST', `${contentFilePath(id, type, fileName)}/version${query({ world })}`, { versionId }),
    update: (id: string, type: ContentType, fileName: string, world?: string) =>
      request<Job>('POST', `${contentFilePath(id, type, fileName)}/update${query({ world })}`),
    toggle: (id: string, type: ContentType, fileName: string, world?: string) =>
      request<ModFile>('POST', `${contentFilePath(id, type, fileName)}/toggle${query({ world })}`),
    remove: (id: string, type: ContentType, fileName: string, world?: string) =>
      request<unknown>('DELETE', `${contentFilePath(id, type, fileName)}${query({ world })}`)
  },
  // The modpack a profile came from; export writes a pack file; import creates a profile from a file.
  modpack: {
    status: (id: string) => request<ModpackStatus>('GET', `${profilePath(id)}/modpack`),
    versions: (id: string) => request<{ versions: ProjectRelease[] }>('GET', `${profilePath(id)}/modpack/versions`),
    /** Records which version the profile is at; installs nothing. 409 when already linked, 422 when the version's file list cannot be read. */
    connect: (id: string, pack: { provider: ProviderId; projectId: string; versionId: string }) =>
      request<ModpackStatus>('POST', `${profilePath(id)}/modpack/connect`, pack),
    /** Forgets the pack link; the mods and files stay in place. 409 when not linked. */
    disconnect: (id: string) => request<ModpackStatus>('POST', `${profilePath(id)}/modpack/disconnect`),
    update: (id: string, versionId?: string) =>
      request<Job>('POST', `${profilePath(id)}/modpack/update`, versionId ? { versionId } : {}),
    export: (id: string, format: ExportFormat, version?: string) =>
      request<ExportResult>('POST', `${profilePath(id)}/export`, { format, version: version || undefined }),
    importFile: (path: string, name?: string) =>
      request<Job>('POST', '/api/modpacks/import', { path, name: name || undefined })
  },
  mods: {
    list: (id: string) => request<ModFile[]>('GET', `${profilePath(id)}/mods`),
    identify: (id: string) => request<Job>('POST', `${profilePath(id)}/mods/identify`),
    checkUpdates: (id: string) => request<Job>('POST', `${profilePath(id)}/mods/check-updates`),
    updateAll: (id: string) => request<Job>('POST', `${profilePath(id)}/mods/update-all`),
    update: (id: string, fileName: string) => request<Job>('POST', `${modPath(id, fileName)}/update`),
    toggle: (id: string, fileName: string) => request<ModFile>('POST', `${modPath(id, fileName)}/toggle`),
    remove: (id: string, fileName: string) => request<unknown>('DELETE', modPath(id, fileName))
  },
  providers: {
    list: () => request<ProviderInfo[]>('GET', '/api/providers'),
    /** The filter lists and supported controls of one provider for one kind. */
    filters: (provider: ProviderId, kind: ContentKind) =>
      request<ProviderFilters>('GET', `/api/providers/${enc(provider)}/filters${query({ kind })}`),
    search: (provider: ProviderId, params: SearchParams) =>
      request<SearchResult>('GET', `/api/providers/${enc(provider)}/search${query({ ...params })}`),
    categories: (provider: ProviderId, kind: ContentKind) =>
      request<string[]>('GET', `/api/providers/${enc(provider)}/categories${query({ kind })}`),
    project: (provider: ProviderId, id: string) =>
      request<ProjectDetail>('GET', `/api/providers/${enc(provider)}/projects/${enc(id)}`),
    versions: (provider: ProviderId, id: string, filter: { gameVersion?: string; loader?: string }) =>
      request<ProjectVersion[]>(
        'GET',
        `/api/providers/${enc(provider)}/projects/${enc(id)}/versions${query(filter)}`
      ),
    /** `name` is the optional name of the new profile. */
    installPack: (provider: ProviderId, projectId: string, versionId: string, name?: string) =>
      request<Job>('POST', '/api/providers/packs/install', { provider, projectId, versionId, name }),
    installContent: (profileId: string, content: ContentInstallRequest) =>
      request<Job>('POST', `${profilePath(profileId)}/content/install`, content)
  },
  game: {
    status: (id: string) => request<GameStatus>('GET', `${profilePath(id)}/game`),
    install: (id: string) => request<Job>('POST', `${profilePath(id)}/install-game`),
    /** Without `quickPlay` the body is empty and the launch starts the profile's normal way. */
    launch: (id: string, quickPlay?: QuickPlay) =>
      request<Job>('POST', `${profilePath(id)}/launch`, quickPlay ? { quickPlay } : undefined),
    stop: (id: string) => request<unknown>('POST', `${profilePath(id)}/game/stop`)
  },
  accounts: {
    list: () => request<AccountsView>('GET', '/api/accounts'),
    session: () => request<AccountSession>('GET', '/api/accounts/session'),
    select: (id: string) => request<AccountsView>('POST', `/api/accounts/${enc(id)}/select`),
    remove: (id: string) => request<AccountsView>('DELETE', `/api/accounts/${enc(id)}`),
    logout: () => request<AccountsView>('POST', '/api/accounts/logout'),
    login: () => request<LoginStart>('POST', '/api/accounts/login'),
    skin: () => request<CurrentSkin>('GET', '/api/accounts/skin'),
    callback: (fields: { state: string; code?: string; error?: string; error_description?: string }) =>
      request<Job>('POST', '/api/accounts/callback', fields)
  },
  skins: {
    list: () => request<SkinLibrary>('GET', '/api/skins'),
    add: (name: string, slim: boolean, imageBase64: string) =>
      request<{ skin: Skin }>('POST', '/api/skins', { name, slim, imageBase64 }),
    rename: (id: string, name: string) => request<{ skin: Skin }>('PATCH', `/api/skins/${enc(id)}`, { name }),
    remove: (id: string) => request<unknown>('DELETE', `/api/skins/${enc(id)}`),
    apply: (id: string) => request<Job>('POST', `/api/skins/${enc(id)}/select`)
  },
  saves: {
    worlds: (id: string) => request<{ worlds: WorldInfo[] }>('GET', `${profilePath(id)}/worlds`),
    renameWorld: (id: string, folder: string, name: string) =>
      request<{ world: WorldInfo }>('PATCH', worldPath(id, folder), { name }),
    deleteWorld: (id: string, folder: string) => request<unknown>('DELETE', worldPath(id, folder)),
    worldIcon: (id: string, folder: string) =>
      request<{ dataUrl: string | null }>('GET', `${worldPath(id, folder)}/icon`),
    duplicateWorld: (id: string, folder: string, name: string) =>
      request<Job>('POST', `${worldPath(id, folder)}/duplicate`, { name }),
    copyWorld: (id: string, folder: string, targetProfileId: string) =>
      request<Job>('POST', `${worldPath(id, folder)}/copy`, { targetProfileId }),
    servers: (id: string) => request<{ servers: ServerInfo[] }>('GET', `${profilePath(id)}/servers`),
    addServer: (id: string, name: string, address: string) =>
      request<{ server: ServerInfo }>('POST', `${profilePath(id)}/servers`, { name, address }),
    editServer: (id: string, index: number, patch: { name?: string; address?: string }) =>
      request<{ server: ServerInfo }>('PATCH', `${profilePath(id)}/servers/${index}`, patch),
    removeServer: (id: string, index: number) =>
      request<unknown>('DELETE', `${profilePath(id)}/servers/${index}`),
    screenshots: (id: string) =>
      request<{ screenshots: ScreenshotInfo[] }>('GET', `${profilePath(id)}/screenshots`),
    screenshotImage: (id: string, fileName: string) =>
      request<{ dataUrl: string; contentType: string }>('GET', `${shotPath(id, fileName)}/image`),
    deleteScreenshot: (id: string, fileName: string) => request<unknown>('DELETE', shotPath(id, fileName)),
    openScreenshotFolder: (id: string) =>
      request<{ path: string }>('POST', `${profilePath(id)}/screenshots/open-folder`),
    logs: (id: string) => request<{ logs: LogInfo[] }>('GET', `${profilePath(id)}/logs`),
    latestCrash: (id: string) => request<{ log: LogInfo | null }>('GET', `${profilePath(id)}/logs/latest-crash`),
    readLog: (id: string, logId: string, offset: number, maxBytes?: number) =>
      request<LogChunk>('GET', `${logPath(id, logId)}${query({ offset, maxBytes })}`),
    clearLog: (id: string, logId: string) => request<unknown>('DELETE', logPath(id, logId)),
    openLogFolder: (id: string, logId: string) => request<{ path: string }>('POST', `${logPath(id, logId)}/open-folder`),
    backups: (id: string) => request<{ backups: BackupInfo[] }>('GET', `${profilePath(id)}/backups`),
    createBackup: (id: string, label: string) => request<Job>('POST', `${profilePath(id)}/backups`, { label }),
    restoreBackup: (id: string, backupId: string) =>
      request<Job>('POST', `${profilePath(id)}/backups/${enc(backupId)}/restore`),
    deleteBackup: (id: string, backupId: string) =>
      request<unknown>('DELETE', `${profilePath(id)}/backups/${enc(backupId)}`),
    openBackupsFolder: (id: string) => request<{ path: string }>('POST', `${profilePath(id)}/backups/open-folder`)
  }
}
