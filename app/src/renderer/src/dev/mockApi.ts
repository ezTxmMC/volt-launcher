/**
 * Development-only in-memory backend. It is installed by main.tsx when the renderer runs in a
 * plain browser (no Electron preload) and is never part of the production bundle.
 */
import type { ApiResult, BackendStatus, HttpMethod, VoltBridge } from '@shared/bridge'
import type {
  ContentKind,
  GameStatus,
  Job,
  Loader,
  ModFile,
  Profile,
  ProjectDetail,
  ProjectSummary,
  ProjectVersion,
  ProviderId,
  ProviderInfo,
  ProviderFilters,
  FilterSupport,
  DiscordStatus,
  JavaRuntimes,
  LauncherDirectory,
  PlatformInfo,
  Settings,
  SortOption,
  UpdateInfo,
  AccountSession,
  AccountType,
  AccountsView,
  AutoProfileResult,
  BackupInfo,
  CurrentSkin,
  LogChunk,
  LogInfo,
  LoginStart,
  ScreenshotInfo,
  ServerInfo,
  Skin,
  SyncedFolder,
  SyncReportEntry,
  WorldInfo,
  ImportItem,
  ImportScan
} from '@shared/models'
import { DEFAULT_SKIN_DATA_URL } from '@/components/home/defaultSkin'

const LATENCY_MS = 140

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))
const hex = (length: number): string =>
  Array.from({ length }, () => Math.floor(Math.random() * 16).toString(16)).join('')
const nowIso = (): string => new Date().toISOString()
const agoIso = (minutes: number): string => new Date(Date.now() - minutes * 60_000).toISOString()

class MockError extends Error {}

// ---------- State ----------

/** The backend's defaults (backend/src/core/settings.nv). */
const DEFAULT_SETTINGS: Settings = {
  language: 'de',
  theme: 'system',
  memoryMb: 4096,
  minMemoryMb: 1024,
  bridgeUrl: 'http://localhost:8787',
  javaPath: null,
  defaultJvmArgs: '-XX:+UseG1GC -XX:+ParallelRefProcEnabled',
  javaRuntimes: [],
  closeOnLaunch: false,
  openLogsOnLaunch: false,
  downloadThreads: 6,
  backupsToKeep: 5,
  backupBeforePackUpdate: true,
  profileSort: 'lastPlayed',
  quickJoinLabel: 'name',
  favouritesFirst: true,
  accentColor: '#00b2ff',
  uiScale: 'default',
  animationsEnabled: true,
  showFps: false,
  discordPresence: true,
  discordApplicationId: '',
  autoUpdate: true,
  betaUpdates: false,
  autoProfilesEnabled: false,
  autoProfileLoader: 'fabric',
  autoProfileVersions: 'release',
  autoProfileMods: []
}

let settings: Settings = { ...DEFAULT_SETTINGS }

/** Automatic profiles: what the mock backend has seen and built; the configuration lives in the settings. */
const autoProfileState: { seen: number; lastCheck: string | null; lastError: string | null; results: AutoProfileResult[] } = {
  seen: 14,
  lastCheck: agoIso(12),
  lastError: null,
  results: [
    { minecraftVersion: '1.20.4', status: 'created', reason: 'Profil mit Preset angelegt', profileId: 'a1b2c3d4e5f6' },
    { minecraftVersion: '1.20.6', status: 'failed', reason: 'Sodium hat keine Version für 1.20.6', profileId: null },
    { minecraftVersion: '1.21.1', status: 'skipped', reason: 'Vor der Aktivierung gemerkt', profileId: null }
  ]
}

/** Releases the mock create route accepts; the versions route above lists the same ones. */
const MOCK_RELEASES = ['1.21.1', '1.20.4']

/** Profile fields the mock does not vary (see docs/ARCHITECTURE.md, Profile). */
const PROFILE_EXTRAS = {
  gameDirectory: null,
  wrapperCommand: null,
  preLaunchCommand: null,
  postExitCommand: null,
  envVars: {},
  fullscreen: false,
  hideLauncher: null,
  favourite: false,
  group: null,
  iconUrl: null,
  totalPlaytimeMs: 0
}

const profiles: Profile[] = [
  {
    id: 'a1b2c3d4e5f6',
    name: 'Survival',
    minecraftVersion: '1.21.1',
    loader: 'fabric',
    loaderVersion: '0.16.5',
    memoryMb: null,
    javaPath: null,
    jvmArgs: '',
    ...PROFILE_EXTRAS,
    gameDir: '/home/demo/.volt/profiles/a1b2c3d4e5f6',
    favourite: true,
    totalPlaytimeMs: 5400000,
    createdAt: agoIso(60 * 24 * 12),
    lastPlayed: agoIso(130),
    source: null
  },
  {
    id: 'b2c3d4e5f6a1',
    name: 'All the Mods 10',
    minecraftVersion: '1.21.1',
    loader: 'neoforge',
    loaderVersion: '21.1.77',
    memoryMb: 8192,
    javaPath: null,
    jvmArgs: '-XX:+UseG1GC',
    ...PROFILE_EXTRAS,
    gameDir: '/home/demo/.volt/profiles/b2c3d4e5f6a1',
    group: 'Modpacks',
    createdAt: agoIso(60 * 24 * 3),
    lastPlayed: null,
    source: { provider: 'modrinth', projectId: 'atm10', versionId: 'v-atm10-1', name: 'All the Mods 10', kind: 'modpack' }
  },
  // One profile per logo case of GET /api/profiles/:id/logo (see logoAnswer).
  logoCaseProfile('c3d4e5f6a1b2', 'Custom Icon', '1.21.1', 'fabric', '0.16.5'),
  logoCaseProfile('d4e5f6a1b2c3', 'Vanilla', '1.21.1', 'vanilla', null),
  logoCaseProfile('e5f6a1b2c3d4', 'Vanilla Plain', '1.20.6', 'vanilla', null),
  logoCaseProfile('f6a1b2c3d4e5', 'Quilt Test', '1.21.1', 'quilt', '0.27.1'),
  logoCaseProfile('a1b2c3d4e5f8', 'Forge Test', '1.20.1', 'forge', '47.3.0'),
  logoCaseProfile('b2c3d4e5f6a9', 'NeoForge Test', '1.21.1', 'neoforge', '21.1.77')
]

/** A plain profile for the logo cases; the mock varies only what the logo needs. */
function logoCaseProfile(id: string, name: string, minecraftVersion: string, loader: Loader, loaderVersion: string | null): Profile {
  return {
    id,
    name,
    minecraftVersion,
    loader,
    loaderVersion,
    memoryMb: null,
    javaPath: null,
    jvmArgs: '',
    ...PROFILE_EXTRAS,
    gameDir: `/home/demo/.volt/profiles/${id}`,
    createdAt: agoIso(60 * 24 * 2),
    lastPlayed: null,
    source: null
  }
}

function mod(
  file: string,
  loader: Loader,
  modId: string,
  name: string,
  version: string,
  source: ModFile['source'],
  size: number
): ModFile {
  return {
    fileName: file,
    enabled: !file.endsWith('.disabled'),
    size,
    sha1: hex(40),
    metadata: { loader, modId, name, version, description: `${name} example mod` },
    source,
    update: null
  }
}

const modrinthSource = (projectId: string, versionNumber: string, name: string): ModFile['source'] => ({
  provider: 'modrinth',
  projectId,
  versionId: hex(8),
  versionNumber,
  name
})

const mods = new Map<string, ModFile[]>()
mods.set('a1b2c3d4e5f6', [
  {
    ...mod('sodium-fabric-0.6.0.jar', 'fabric', 'sodium', 'Sodium', '0.6.0', modrinthSource('AANobbMI', '0.6.0', 'Sodium'), 1_234_567),
    update: {
      versionId: 'sodium-061',
      versionNumber: '0.6.1',
      fileName: 'sodium-fabric-0.6.1.jar',
      sha1: hex(40),
      url: 'https://example.invalid/sodium-0.6.1.jar',
      gameVersions: ['1.21.1'],
      loaders: ['fabric']
    }
  },
  mod('lithium-fabric-0.13.0.jar', 'fabric', 'lithium', 'Lithium', '0.13.0', null, 612_000),
  mod('iris-1.8.0.jar.disabled', 'fabric', 'iris', 'Iris Shaders', '1.8.0', modrinthSource('YL57xq9U', '1.8.0', 'Iris Shaders'), 2_420_000),
  mod('fabric-api-0.102.0.jar', 'fabric', 'fabric-api', 'Fabric API', '0.102.0', modrinthSource('P7dR8mSH', '0.102.0', 'Fabric API'), 2_100_000),
  {
    fileName: 'custom-local-tweaks.jar',
    enabled: true,
    size: 48_200,
    sha1: hex(40),
    metadata: null,
    source: null,
    update: null
  }
])
mods.set('b2c3d4e5f6a1', [])

interface MockJob {
  job: Job
  startedAt: number
  durationMs: number
  onDone: () => Record<string, unknown> | void
  cancelled: boolean
}
const jobs = new Map<string, MockJob>()
const runningGames = new Map<string, GameStatus>()
const verifyReports = new Map<string, unknown>()

function startJob(
  kind: string,
  title: string,
  durationMs: number,
  onDone: () => Record<string, unknown> | void = () => undefined
): Job {
  const job: Job = {
    id: hex(12),
    kind,
    title,
    state: 'running',
    progress: 0,
    message: '',
    error: null,
    result: null,
    createdAt: nowIso(),
    finishedAt: null
  }
  jobs.set(job.id, { job, startedAt: Date.now(), durationMs, onDone, cancelled: false })
  return { ...job }
}

function evaluate(entry: MockJob): Job {
  const { job } = entry
  if (job.state === 'running') {
    const fraction = Math.min(1, (Date.now() - entry.startedAt) / entry.durationMs)
    job.progress = fraction
    job.message = `${Math.round(fraction * 30)} / 30`
    if (entry.cancelled) {
      job.state = 'cancelled'
      job.finishedAt = nowIso()
    } else if (fraction >= 1) {
      job.state = 'done'
      job.progress = 1
      job.finishedAt = nowIso()
      const outcome = entry.onDone()
      job.result = typeof outcome === 'object' && outcome !== null ? outcome : null
    }
  }
  return { ...job }
}

// ---------- Discover data ----------

const ALL_SORTS: SortOption[] = ['relevance', 'downloads', 'follows', 'newest', 'updated']
// Sort ids per provider, as the backend reports them.
const PROVIDERS: ProviderInfo[] = [
  {
    id: 'modrinth',
    name: 'Modrinth',
    kinds: ['mod', 'modpack', 'resourcepack', 'shader', 'datapack'],
    sorts: ALL_SORTS,
    configured: true,
    message: ''
  },
  {
    id: 'curseforge',
    name: 'CurseForge',
    kinds: ['mod', 'modpack', 'resourcepack', 'shader'],
    sorts: ['relevance', 'follows', 'updated', 'name', 'downloads', 'newest'],
    configured: false,
    message: 'Die CurseForge-Bridge ist nicht erreichbar. Starte die Bridge oder prüfe die Bridge-URL in den Einstellungen.'
  },
  { id: 'technic', name: 'Technic', kinds: ['modpack'], sorts: ['relevance', 'popular', 'downloads', 'follows'], configured: true, message: '' },
  { id: 'ftb', name: 'FTB', kinds: ['modpack'], sorts: ['relevance', 'downloads', 'follows', 'updated'], configured: true, message: '' }
]

/** Game versions each provider lists in its filter; FTB lists none and takes free text. */
const GAME_VERSIONS: Record<ProviderId, string[]> = {
  modrinth: ['1.21.1', '1.20.4', '1.20.1'],
  curseforge: ['1.21.1', '1.20.4', '1.20.1'],
  technic: ['1.12.2', '1.7.10', '1.16.5'],
  ftb: []
}

const ALL_GAME_VERSIONS = ['1.21.1', '1.20.4', '1.20.1', '1.19.2', '1.12.2']
const SORT_NAMES: Record<string, string> = {
  relevance: 'Relevanz',
  downloads: 'Downloads',
  follows: 'Follower',
  newest: 'Neueste',
  updated: 'Zuletzt aktualisiert',
  popular: 'Beliebt',
  name: 'Name'
}
const MOD_LOADERS = ['fabric', 'quilt', 'forge', 'neoforge']

/** What each provider can filter on for one kind; Technic and FTB have no categories, as in the backend. */
function supportsOf(provider: ProviderId, kind: ContentKind): FilterSupport {
  const loader = kind === 'mod' || kind === 'modpack'
  return {
    search: true,
    kind: true,
    sort: true,
    categories: provider === 'modrinth',
    gameVersion: true,
    loader: loader && (provider === 'modrinth' || provider === 'curseforge'),
    paging: true,
    environment: provider === 'modrinth',
    openSource: provider === 'modrinth'
  }
}

function providerFilters(provider: ProviderId, kind: ContentKind): ProviderFilters {
  const info = PROVIDERS.find((candidate) => candidate.id === provider)
  const supports = supportsOf(provider, kind)
  return {
    kinds: info?.kinds ?? [],
    sorts: (info?.sorts ?? []).map((id) => ({ id, label: SORT_NAMES[id] ?? id })),
    categories: supports.categories ? categoriesOf(kind).map((id) => ({ id, label: id })) : [],
    gameVersions: GAME_VERSIONS[provider],
    loaders: supports.loader ? MOD_LOADERS : [],
    supports
  }
}

function categoriesOf(kind: ContentKind): string[] {
  return kind === 'mod' ? ['adventure', 'optimization', 'utility'] : ['adventure', 'utility']
}

const seedOf = (text: string): number => [...text].reduce((sum, char) => sum + char.charCodeAt(0), 0)

/** Game versions and loaders of a mock project, derived from its id so the filters change the list. */
function projectGameVersions(project: ProjectSummary): string[] {
  const seed = seedOf(project.id)
  return ALL_GAME_VERSIONS.filter((_, index) => (seed + index) % 3 !== 0)
}

function projectLoaders(project: ProjectSummary): string[] {
  if (project.kind === 'modpack') return ['neoforge']
  if (project.kind !== 'mod') return []
  return seedOf(project.id) % 2 === 0 ? ['fabric', 'quilt'] : ['forge', 'neoforge']
}

function sortProjects(list: ProjectSummary[], sort: string): ProjectSummary[] {
  if (sort === 'updated') return [...list].sort((a, b) => a.name.localeCompare(b.name))
  if (sort === 'follows' || sort === 'newest') return [...list].reverse()
  return list
}

const icon = (hue: number, glyph: string): string =>
  `data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="hsl(${hue} 55% 38%)"/><text x="32" y="43" font-size="30" text-anchor="middle" fill="white" font-family="sans-serif">${glyph}</text></svg>`
  )}`

const NAMES: Record<ContentKind, string[]> = {
  mod: ['Sodium', 'Lithium', 'Iris Shaders', 'Fabric API', 'Create', 'JEI', 'Xaero\'s Minimap', 'Mod Menu', 'Appleskin', 'Jade'],
  modpack: ['All the Mods 10', 'Fabulously Optimized', 'Better MC', 'Prominence II', 'Cobblemon Official'],
  resourcepack: ['Faithful 32x', 'Fresh Animations', 'Stay True', 'Bare Bones'],
  shader: ['Complementary Reimagined', 'BSL Shaders', 'Photon'],
  datapack: ['Terralith', 'Incendium', 'Hardcore Questing']
}

const SUMMARIES = [
  'A modern rendering engine for Minecraft that improves frame rates and reduces stutter.',
  'Optimises the game server and client logic without changing gameplay.',
  'Adds a large amount of new content while staying true to the vanilla feel.',
  'Quality-of-life improvements, small tweaks and a few surprises.'
]

function buildProjects(provider: ProviderId): ProjectSummary[] {
  const out: ProjectSummary[] = []
  for (const kind of Object.keys(NAMES) as ContentKind[]) {
    const supported = PROVIDERS.find((candidate) => candidate.id === provider)?.kinds.includes(kind) ?? false
    if (!supported) continue
    const names = [...(NAMES[kind] ?? [])]
    if (kind === 'mod') for (let index = 1; index <= 40; index++) names.push(`Sample Mod ${String(index).padStart(2, '0')}`)
    names.forEach((name, index) => {
      const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-')
      out.push({
        provider,
        id: provider === 'modrinth' && kind === 'modpack' && name === 'All the Mods 10' ? 'atm10' : `${provider}-${slug}`,
        slug,
        name,
        summary: SUMMARIES[index % SUMMARIES.length] ?? '',
        iconUrl: index % 3 === 0 ? icon((index * 47) % 360, name.slice(0, 1)) : null,
        author: ['jellysquid3', 'CaffeineMC', 'Kir', 'Mojang Fans'][index % 4] ?? 'author',
        downloads: 1_000_000 - index * 13_337,
        follows: 90_000 - index * 911,
        updated: agoIso(60 * 24 * (index * 9 + 1)),
        kind,
        categories: index % 2 === 0 ? ['adventure', 'utility'] : ['optimization', 'utility']
      })
    })
  }
  return out
}

const PROJECTS: Record<ProviderId, ProjectSummary[]> = {
  modrinth: buildProjects('modrinth'),
  curseforge: buildProjects('curseforge'),
  technic: buildProjects('technic'),
  ftb: buildProjects('ftb')
}

function findProject(provider: ProviderId, id: string): ProjectSummary {
  const found = PROJECTS[provider]?.find((project) => project.id === id)
  if (!found) throw new MockError(`Projekt ${id} nicht gefunden`)
  return found
}

function projectDetail(project: ProjectSummary): ProjectDetail {
  return {
    ...project,
    description: `# ${project.name}\n\n${project.summary}\n\n## Features\n\n- Schnell und **stabil**\n- Kompatibel mit vielen anderen Mods\n- Aktiv gepflegt\n\n> Dies ist Beispielinhalt aus der Entwicklungs-Mock-API.\n\n<script>alert('raw html is not rendered')</script>\n\nMehr Infos: [Projektseite](https://modrinth.com)\n\n\`\`\`\nprofile.install("${project.slug}")\n\`\`\``,
    gallery: []
  }
}

function projectVersions(project: ProjectSummary, gameVersion: string | null, loader: string | null): ProjectVersion[] {
  const loaders = project.kind === 'mod' ? ['fabric', 'quilt'] : project.kind === 'modpack' ? ['neoforge'] : []
  const all: ProjectVersion[] = ['1.21.1', '1.20.4', '1.20.1'].flatMap((mc, index) => [
    {
      id: `${project.id}-v${index}a`,
      name: `${project.name} ${index + 1}.${index + 4}.0`,
      versionNumber: `${index + 1}.${index + 4}.0`,
      gameVersions: [mc, ...(index === 0 ? ['1.21'] : [])],
      loaders,
      fileName: `${project.slug}-${index + 1}.${index + 4}.0.jar`,
      downloadUrl: 'https://example.invalid/file.jar',
      sha1: hex(40),
      datePublished: agoIso(60 * 24 * (index * 40 + 3)),
      dependencies: [],
      releaseType: (['release', 'beta', 'alpha'] as const)[index] ?? 'release'
    }
  ])
  return all.filter(
    (version) =>
      (!gameVersion || version.gameVersions.includes(gameVersion)) &&
      (!loader || version.loaders.length === 0 || version.loaders.includes(loader))
  )
}

// ---------- Routing ----------

type Query = URLSearchParams
type Handler = (match: string[], body: Record<string, unknown>, query: Query) => unknown | Promise<unknown>

function profileById(id: string | undefined): Profile {
  const found = profiles.find((profile) => profile.id === id)
  if (!found) throw new MockError(`Profil ${id ?? ''} nicht gefunden`)
  return found
}

const SYNC_KEYS: readonly SyncedFolder[] = ['shaderpacks', 'resourcepacks', 'saves', 'screenshots', 'config', 'options', 'servers']

/** Like the backend: an unknown key is a 400; the answer keeps SYNC_KEYS order and has no duplicates. */
function checkSyncKeys(requested: unknown[]): SyncedFolder[] {
  if (requested.some((key) => !SYNC_KEYS.includes(key as SyncedFolder))) throw new MockError('HTTP 400: Unbekannter Ordner')
  return SYNC_KEYS.filter((key) => requested.includes(key))
}

/** Mirrors the backend contract: the full list in, the profile plus a syncReport for the changed folders out. */
function setSyncedFolders(profile: Profile, requested: unknown[]): Profile & { syncReport: SyncReportEntry[] } {
  const after = checkSyncKeys(requested)
  if (runningGames.get(profile.id)?.running) throw new MockError('HTTP 409: stop the game before changing shared folders')
  const before = profile.synced ?? []
  const syncReport: SyncReportEntry[] = SYNC_KEYS.filter((key) => before.includes(key) !== after.includes(key)).map((key) =>
    after.includes(key)
      ? { key, moved: 3, conflicts: 1, status: 'linked' }
      : { key, moved: 0, conflicts: 0, status: 'unlinked' }
  )
  profile.synced = after
  return { ...profile, syncReport }
}

function modsOf(id: string | undefined): ModFile[] {
  profileById(id)
  const list = mods.get(id ?? '')
  if (!list) throw new MockError('Mods nicht gefunden')
  return list
}

function modOf(id: string | undefined, fileName: string | undefined): ModFile {
  const found = modsOf(id).find((candidate) => candidate.fileName === decodeURIComponent(fileName ?? ''))
  if (!found) throw new MockError('Mod nicht gefunden')
  return found
}

function applyUpdate(file: ModFile): void {
  if (!file.update) return
  file.fileName = file.update.fileName
  if (file.metadata) file.metadata.version = file.update.versionNumber
  if (file.source) file.source.versionNumber = file.update.versionNumber
  file.update = null
}

// ---------- Helpers for the account, skin and game-data routes ----------

const uuid = (): string => {
  const h = hex(32)
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}

/** A PNG data URL painted on a canvas (the dev page always runs in a browser). */
function pixelPng(width: number, height: number, paint: (ctx: CanvasRenderingContext2D) => void): string {
  if (typeof document === 'undefined') return ''
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) return ''
  paint(ctx)
  return canvas.toDataURL('image/png')
}

// ---------- Accounts (docs/ARCHITECTURE.md, "Konten und Skins") ----------

interface AccountRow {
  id: string
  name: string
  type: AccountType
  isDefault: boolean
}

const DEFAULT_ACCOUNT_ID = uuid()
const accountRows: AccountRow[] = [
  { id: DEFAULT_ACCOUNT_ID, name: 'Player', type: 'offline', isDefault: true },
  { id: uuid(), name: 'SampleSteve', type: 'microsoft', isDefault: false }
]
// The dev page starts signed in with the sample Microsoft account, so the home page with the 3D skin shows.
let selectedAccountId = accountRows.find((row) => row.type === 'microsoft')?.id ?? DEFAULT_ACCOUNT_ID
let offlineMode = false

function accountRowOf(id: string | undefined): AccountRow {
  const found = accountRows.find((row) => row.id === decodeURIComponent(id ?? ''))
  if (!found) throw new MockError('Konto nicht gefunden')
  return found
}

function accountsView(): AccountsView {
  const ordered = [...accountRows].sort((a, b) => Number(b.isDefault) - Number(a.isDefault))
  return {
    accounts: ordered.map((row) => ({
      id: row.id,
      name: row.name,
      type: row.type,
      selected: row.id === selectedAccountId,
      default: row.isDefault,
      skinDataUrl: row.type === 'microsoft' ? DEFAULT_SKIN_DATA_URL : null
    })),
    selectedId: selectedAccountId,
    offlineMode
  }
}

/** Selects an account; the offline mode follows the account type, as in the backend. */
function selectAccount(row: AccountRow): void {
  selectedAccountId = row.id
  offlineMode = row.type === 'offline'
}

function microsoftAccounts(): AccountRow[] {
  return accountRows.filter((row) => row.type === 'microsoft')
}

function sessionView(): AccountSession {
  const row = accountRowOf(selectedAccountId)
  return { authenticated: row.type === 'microsoft', id: row.id, name: row.name, type: row.type }
}

/** The current skin of the selected Microsoft account: the standard skin texture for every sample account. */
function currentSkinView(): CurrentSkin {
  const row = accountRowOf(selectedAccountId)
  if (row.type !== 'microsoft') throw new MockError('sign_in_required: Sign in with a Microsoft account to show your skin.')
  return {
    name: row.name,
    uuid: row.id,
    model: 'classic',
    skinUrl: 'https://textures.minecraft.net/texture/mock-standard',
    dataUrl: DEFAULT_SKIN_DATA_URL,
    capeDataUrl: null
  }
}

// ---------- Skins ----------

interface SkinRow {
  id: string
  name: string
  slim: boolean
  createdAt: string
  /** Data URL of the PNG; generated on first use for the sample skins. */
  image: string | null
  hue: number
}

/** A 64x64 skin in the layout of Minecraft's skin texture (head, torso, arms, legs). */
function makeSkinPng(hue: number, slim: boolean): string {
  return pixelPng(64, 64, (ctx) => {
    ctx.fillStyle = `hsl(${hue} 40% 62%)`
    ctx.fillRect(8, 8, 8, 8)
    ctx.fillStyle = `hsl(${(hue + 150) % 360} 55% 45%)`
    ctx.fillRect(20, 20, 8, 12)
    const arm = slim ? 3 : 4
    ctx.fillRect(44, 20, arm, 12)
    ctx.fillRect(36, 52, arm, 12)
    ctx.fillStyle = `hsl(${(hue + 230) % 360} 35% 28%)`
    ctx.fillRect(4, 20, 4, 12)
    ctx.fillRect(20, 52, 4, 12)
  })
}

const skinRows: SkinRow[] = [
  { id: uuid(), name: 'Night Knight', slim: false, createdAt: agoIso(60 * 24 * 6), image: null, hue: 230 },
  { id: uuid(), name: 'Sunny Alex', slim: true, createdAt: agoIso(60 * 24 * 2), image: null, hue: 36 }
]
let selectedSkinId: string | null = null

function skinRowOf(id: string | undefined): SkinRow {
  const found = skinRows.find((row) => row.id === decodeURIComponent(id ?? ''))
  if (!found) throw new MockError('Skin nicht gefunden')
  return found
}

function skinView(row: SkinRow): Skin {
  if (row.image === null) row.image = makeSkinPng(row.hue, row.slim)
  return {
    id: row.id,
    name: row.name,
    slim: row.slim,
    createdAt: row.createdAt,
    selected: row.id === selectedSkinId,
    imageDataUrl: row.image
  }
}

// ---------- Game data (docs/ARCHITECTURE.md, "Spieldaten") ----------

const worldRows = new Map<string, WorldInfo[]>()
const serverRows = new Map<string, ServerInfo[]>()
const screenshotRows = new Map<string, ScreenshotInfo[]>()
const screenshotImages = new Map<string, string>()
const logRows = new Map<string, LogInfo[]>()
const logTexts = new Map<string, string>()
const backupRows = new Map<string, BackupInfo[]>()

/** The list of one table for a profile; created on first use. */
function rowsOf<T>(table: Map<string, T[]>, profileId: string): T[] {
  profileById(profileId)
  let list = table.get(profileId)
  if (!list) {
    list = []
    table.set(profileId, list)
  }
  return list
}

function worldOf(profileId: string | undefined, folder: string | undefined): WorldInfo {
  const name = decodeURIComponent(folder ?? '')
  const found = rowsOf(worldRows, profileId ?? '').find((world) => world.folderName === name)
  if (!found) throw new MockError(`Welt ${name} nicht gefunden`)
  return found
}

function serverAt(profileId: string | undefined, index: string | undefined): ServerInfo {
  const found = rowsOf(serverRows, profileId ?? '')[Number(index)]
  if (!found) throw new MockError('Server nicht gefunden')
  return found
}

function screenshotOf(profileId: string | undefined, fileName: string | undefined): ScreenshotInfo {
  const name = decodeURIComponent(fileName ?? '')
  const found = rowsOf(screenshotRows, profileId ?? '').find((shot) => shot.fileName === name)
  if (!found) throw new MockError('Screenshot nicht gefunden')
  return found
}

function logOf(profileId: string, logId: string): LogInfo {
  const found = rowsOf(logRows, profileId).find((log) => log.id === logId)
  if (!found) throw new MockError('Log nicht gefunden')
  return found
}

function backupOf(profileId: string | undefined, backupId: string | undefined): BackupInfo {
  const id = decodeURIComponent(backupId ?? '')
  const found = rowsOf(backupRows, profileId ?? '').find((backup) => backup.id === id)
  if (!found) throw new MockError('Backup nicht gefunden')
  return found
}

function addLog(profileId: string, info: LogInfo, text: string): void {
  rowsOf(logRows, profileId).push(info)
  logTexts.set(`${profileId}|${info.id}`, text)
}

/** Same slicing as the backend: a negative offset reads the end of the file, at most maxBytes. */
function readLogChunk(profileId: string, logId: string, offset: number, maxBytes: number): LogChunk {
  logOf(profileId, logId)
  const text = logTexts.get(`${profileId}|${logId}`) ?? ''
  const limit = Math.min(Math.max(maxBytes, 1), 512 * 1024)
  const size = text.length
  const start = offset < 0 ? Math.max(0, size - limit) : Math.min(offset, size)
  const end = Math.min(size, start + limit)
  return { id: logId, offset: start, nextOffset: end, size, text: text.slice(start, end), truncated: end < size }
}

const sampleGameLog = (lines: number): string =>
  Array.from({ length: lines }, (_, index) => {
    const minutes = String(index % 60).padStart(2, '0')
    return `[12:${minutes}:${String((index * 7) % 60).padStart(2, '0')}] [Server thread/INFO]: Beispielzeile ${index + 1}`
  }).join('\n')

const CRASH_TEXT = [
  '---- Minecraft Crash Report ----',
  '// Beispielbericht aus der Entwicklungs-Mock-API.',
  '',
  'Time: 2026-10-08 20:11:02',
  'Description: Mock crash',
  '',
  'java.lang.NullPointerException: Beispielfehler',
  '\tat net.minecraft.client.Minecraft.tick(Minecraft.java:1234)'
].join('\n')

function makeScreenshotPng(): string {
  return pixelPng(320, 180, (ctx) => {
    const gradient = ctx.createLinearGradient(0, 0, 320, 180)
    gradient.addColorStop(0, '#1e3a5f')
    gradient.addColorStop(1, '#7fb4d9')
    ctx.fillStyle = gradient
    ctx.fillRect(0, 0, 320, 180)
    ctx.fillStyle = 'rgba(255,255,255,0.85)'
    ctx.font = '600 20px sans-serif'
    ctx.fillText('Mock-Screenshot', 16, 170)
  })
}

function makeWorldIcon(): string {
  return pixelPng(64, 64, (ctx) => {
    ctx.fillStyle = '#4f8f3a'
    ctx.fillRect(0, 0, 64, 64)
    ctx.fillStyle = '#6b4b2a'
    ctx.fillRect(0, 40, 64, 24)
  })
}

const backupStamp = (): string =>
  `${new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15)}.zip`

const byNewest = <T>(key: (item: T) => string) => (a: T, b: T): number => (key(a) < key(b) ? 1 : key(a) > key(b) ? -1 : 0)

/** Sample game data for the two profiles of the mock; other profiles start empty. */
function seedGameData(): void {
  const survival = 'a1b2c3d4e5f6'
  const modpack = 'b2c3d4e5f6a1'

  rowsOf(worldRows, survival).push(
    { folderName: 'New World', name: 'Mein Bau', lastPlayed: agoIso(130), sizeBytes: 48_300_000, gameMode: 'survival', hardcore: false, versionName: '1.21.1', hasIcon: true, readable: true, problem: '' },
    { folderName: 'Hardcore Test', name: 'Hardcore Test', lastPlayed: agoIso(60 * 24 * 4), sizeBytes: 12_900_000, gameMode: 'survival', hardcore: true, versionName: '1.21.1', hasIcon: false, readable: true, problem: '' },
    { folderName: 'Creative Lab', name: 'Kreativ-Labor', lastPlayed: agoIso(60 * 24 * 19), sizeBytes: 3_100_000, gameMode: 'creative', hardcore: false, versionName: '1.20.4', hasIcon: false, readable: true, problem: '' },
    { folderName: 'old-copy', name: 'old-copy', lastPlayed: agoIso(60 * 24 * 40), sizeBytes: 900_000, gameMode: '', hardcore: false, versionName: '', hasIcon: false, readable: false, problem: 'level.dat fehlt oder ist beschädigt' }
  )
  rowsOf(worldRows, modpack).push({
    folderName: 'ATM10 Welt',
    name: 'ATM10 Welt',
    lastPlayed: agoIso(60 * 24 * 2),
    sizeBytes: 220_000_000,
    gameMode: 'survival',
    hardcore: false,
    versionName: '1.21.1',
    hasIcon: false,
    readable: true,
    problem: ''
  })

  rowsOf(serverRows, survival).push(
    { index: 0, name: 'Freunde', address: 'play.example.org', icon: '', acceptTextures: true },
    { index: 1, name: 'Testserver', address: 'localhost:25565', icon: '', acceptTextures: false }
  )

  rowsOf(screenshotRows, survival).push(
    { fileName: '2026-10-09_18.12.44.png', takenAt: agoIso(60 * 14), sizeBytes: 1_230_000 },
    { fileName: '2026-10-08_21.03.10.png', takenAt: agoIso(60 * 38), sizeBytes: 1_180_000 },
    { fileName: '2026-10-05_09.40.02.png', takenAt: agoIso(60 * 124), sizeBytes: 1_410_000 }
  )

  const launcherLines = '[VoltLauncher] Starte Survival mit Java 21\n[VoltLauncher] Spiel gestartet (pid 4242)'
  addLog(survival, { id: 'launcher', label: 'Launcher-Konsole', kind: 'launcher', sizeBytes: launcherLines.length, modifiedAt: agoIso(5), live: true, compressed: false }, launcherLines)
  addLog(survival, { id: 'game:latest.log', label: 'latest.log', kind: 'game', sizeBytes: 9_400, modifiedAt: agoIso(130), live: true, compressed: false }, sampleGameLog(160))
  addLog(survival, { id: 'game:2026-10-08-1.log.gz', label: '2026-10-08-1.log.gz', kind: 'game', sizeBytes: 3_100, modifiedAt: agoIso(60 * 38), live: false, compressed: true }, sampleGameLog(60))
  addLog(survival, { id: 'crash:crash-2026-10-08_20-11-02-client.txt', label: 'crash-2026-10-08_20-11-02-client.txt', kind: 'crash', sizeBytes: CRASH_TEXT.length, modifiedAt: agoIso(60 * 38), live: false, compressed: false }, CRASH_TEXT)
  addLog(modpack, { id: 'launcher', label: 'Launcher-Konsole', kind: 'launcher', sizeBytes: 0, modifiedAt: agoIso(60 * 2), live: true, compressed: false }, '')
  addLog(modpack, { id: 'game:latest.log', label: 'latest.log', kind: 'game', sizeBytes: 4_200, modifiedAt: agoIso(60 * 2), live: true, compressed: false }, sampleGameLog(40))

  rowsOf(backupRows, survival).push(
    { id: '20261008-203000.zip', label: 'vor Modpack-Update', createdAt: agoIso(60 * 48), sizeBytes: 84_000_000, minecraftVersion: '1.21.1', loader: 'fabric', fileCount: 412 },
    { id: '20261001-101500.zip', label: '', createdAt: agoIso(60 * 24 * 9), sizeBytes: 79_500_000, minecraftVersion: '1.21.1', loader: 'fabric', fileCount: 398 }
  )
}
seedGameData()

// ---------- Routes: accounts, skins and game data ----------

const accountRoutes: Array<[HttpMethod, RegExp, Handler]> = [
  ['GET', /^\/api\/accounts$/, () => accountsView()],
  ['GET', /^\/api\/accounts\/session$/, () => sessionView()],
  ['GET', /^\/api\/accounts\/skin$/, () => currentSkinView()],
  [
    'POST',
    /^\/api\/accounts\/login$/,
    () => {
      const state = hex(32)
      return {
        state,
        url: `https://login.live.com/oauth20_authorize.srf?client_id=mock&response_type=code&state=${state}`,
        expiresAt: new Date(Date.now() + 10 * 60_000).toISOString()
      }
    }
  ],
  [
    'POST',
    /^\/api\/accounts\/callback$/,
    (_m, body) => {
      if (typeof body['error'] === 'string') throw new MockError(String(body['error_description'] ?? body['error']))
      if (typeof body['code'] !== 'string') throw new MockError('Die Anmeldung enthält keinen Code.')
      return startJob('account-login', 'Anmeldung bei Microsoft', 1500, () => {
        const existing = accountRows.find((row) => row.type === 'microsoft' && row.name === 'Mock_Alex')
        const row = existing ?? { id: uuid(), name: 'Mock_Alex', type: 'microsoft' as const, isDefault: false }
        if (!existing) accountRows.push(row)
        selectAccount(row)
        return { id: row.id, name: row.name }
      })
    }
  ],
  [
    'POST',
    /^\/api\/accounts\/logout$/,
    () => {
      const kept = accountRows.filter((row) => row.type !== 'microsoft')
      accountRows.splice(0, accountRows.length, ...kept)
      selectAccount(accountRowOf(DEFAULT_ACCOUNT_ID))
      offlineMode = true
      return accountsView()
    }
  ],
  [
    'POST',
    /^\/api\/accounts\/offline$/,
    (_m, body) => {
      const name = typeof body['name'] === 'string' ? body['name'].trim() : ''
      if (!/^[A-Za-z0-9_]{3,16}$/.test(name)) {
        throw new MockError('Der Name braucht 3 bis 16 Zeichen: Buchstaben, Ziffern oder _.')
      }
      const row: AccountRow = { id: uuid(), name, type: 'offline', isDefault: false }
      accountRows.push(row)
      selectAccount(row)
      const view = accountsView()
      return { ...view, account: view.accounts.find((account) => account.id === row.id) }
    }
  ],
  [
    'POST',
    /^\/api\/accounts\/offline-mode$/,
    (_m, body) => {
      if (body['enabled'] === true) {
        selectAccount(accountRowOf(DEFAULT_ACCOUNT_ID))
        return accountsView()
      }
      const last = microsoftAccounts()[microsoftAccounts().length - 1]
      if (!last) throw new MockError('Ohne Microsoft-Konto gibt es keinen Online-Modus.')
      selectAccount(last)
      return accountsView()
    }
  ],
  [
    'POST',
    /^\/api\/accounts\/([^/]+)\/select$/,
    (m) => {
      selectAccount(accountRowOf(m[1]))
      return accountsView()
    }
  ],
  [
    'DELETE',
    /^\/api\/accounts\/([^/]+)$/,
    (m) => {
      const row = accountRowOf(m[1])
      if (row.isDefault) throw new MockError('Das Standardkonto kann nicht entfernt werden.')
      accountRows.splice(accountRows.indexOf(row), 1)
      if (selectedAccountId === row.id) selectAccount(accountRowOf(DEFAULT_ACCOUNT_ID))
      return accountsView()
    }
  ]
]

const skinRoutes: Array<[HttpMethod, RegExp, Handler]> = [
  ['GET', /^\/api\/skins$/, () => ({ skins: skinRows.map((row) => skinView(row)), selectedSkinId })],
  [
    'POST',
    /^\/api\/skins$/,
    (_m, body) => {
      const name = typeof body['name'] === 'string' ? body['name'].trim() : ''
      if (name === '') throw new MockError('Der Skin braucht einen Namen.')
      const raw = typeof body['imageBase64'] === 'string' ? body['imageBase64'] : ''
      const row: SkinRow = {
        id: uuid(),
        name,
        slim: body['slim'] === true,
        createdAt: nowIso(),
        image: raw.startsWith('data:') ? raw : `data:image/png;base64,${raw}`,
        hue: 0
      }
      skinRows.push(row)
      return { skin: skinView(row) }
    }
  ],
  ['GET', /^\/api\/skins\/([^/]+)$/, (m) => ({ skin: skinView(skinRowOf(m[1])) })],
  [
    'PATCH',
    /^\/api\/skins\/([^/]+)$/,
    (m, body) => {
      const row = skinRowOf(m[1])
      const name = typeof body['name'] === 'string' ? body['name'].trim() : ''
      if (name === '') throw new MockError('Der Skin braucht einen Namen.')
      row.name = name
      return { skin: skinView(row) }
    }
  ],
  [
    'DELETE',
    /^\/api\/skins\/([^/]+)$/,
    (m) => {
      const row = skinRowOf(m[1])
      skinRows.splice(skinRows.indexOf(row), 1)
      if (selectedSkinId === row.id) selectedSkinId = null
      return { deleted: row.id }
    }
  ],
  [
    'POST',
    /^\/api\/skins\/([^/]+)\/select$/,
    (m) => {
      const row = skinRowOf(m[1])
      if (accountRowOf(selectedAccountId).type !== 'microsoft') {
        throw new MockError('Skins gibt es nur mit einem Microsoft-Konto.')
      }
      return startJob('skin-apply', `Übernehme ${row.name}`, 2000, () => {
        selectedSkinId = row.id
        return { skin: skinView(row) }
      })
    }
  ]
]

const gameDataRoutes: Array<[HttpMethod, RegExp, Handler]> = [
  // Worlds
  ['GET', /^\/api\/profiles\/(\w+)\/worlds$/, (m) => ({ worlds: [...rowsOf(worldRows, m[1] ?? '')].sort(byNewest<WorldInfo>((world) => world.lastPlayed)) })],
  [
    'PATCH',
    /^\/api\/profiles\/(\w+)\/worlds\/([^/]+)$/,
    (m, body) => {
      const world = worldOf(m[1], m[2])
      const name = typeof body['name'] === 'string' ? body['name'].trim() : ''
      if (name !== '') world.name = name
      return { world: { ...world } }
    }
  ],
  [
    'DELETE',
    /^\/api\/profiles\/(\w+)\/worlds\/([^/]+)$/,
    (m) => {
      const world = worldOf(m[1], m[2])
      const list = rowsOf(worldRows, m[1] ?? '')
      list.splice(list.indexOf(world), 1)
      return { deleted: world.folderName }
    }
  ],
  [
    'GET',
    /^\/api\/profiles\/(\w+)\/worlds\/([^/]+)\/icon$/,
    (m) => ({ dataUrl: worldOf(m[1], m[2]).hasIcon ? makeWorldIcon() : null })
  ],
  [
    'POST',
    /^\/api\/profiles\/(\w+)\/worlds\/([^/]+)\/duplicate$/,
    (m, body) => {
      const source = worldOf(m[1], m[2])
      const profileId = m[1] ?? ''
      const name = typeof body['name'] === 'string' && body['name'] !== '' ? body['name'] : `${source.name} (Kopie)`
      return startJob('world-duplicate', `Dupliziere ${source.name}`, 1500, () => {
        const copy: WorldInfo = { ...source, folderName: `${source.folderName}-kopie-${hex(4)}`, name, lastPlayed: nowIso() }
        rowsOf(worldRows, profileId).push(copy)
        return { world: { ...copy } }
      })
    }
  ],
  [
    'POST',
    /^\/api\/profiles\/(\w+)\/worlds\/([^/]+)\/copy$/,
    (m, body) => {
      const source = worldOf(m[1], m[2])
      const target = profileById(String(body['targetProfileId'] ?? '')).id
      return startJob('world-copy', `Kopiere ${source.name}`, 2000, () => {
        const copy: WorldInfo = { ...source, folderName: `${source.folderName}-kopie-${hex(4)}`, lastPlayed: nowIso() }
        rowsOf(worldRows, target).push(copy)
        return { world: { ...copy }, profileId: target }
      })
    }
  ],
  // Servers
  ['GET', /^\/api\/profiles\/(\w+)\/servers$/, (m) => ({ servers: [...rowsOf(serverRows, m[1] ?? '')] })],
  [
    'POST',
    /^\/api\/profiles\/(\w+)\/servers$/,
    (m, body) => {
      const list = rowsOf(serverRows, m[1] ?? '')
      const address = typeof body['address'] === 'string' ? body['address'].trim() : ''
      if (address === '') throw new MockError('Die Adresse fehlt.')
      const name = typeof body['name'] === 'string' ? body['name'].trim() : ''
      const server: ServerInfo = { index: list.length, name: name || address, address, icon: '', acceptTextures: false }
      list.push(server)
      return { server: { ...server } }
    }
  ],
  [
    'PATCH',
    /^\/api\/profiles\/(\w+)\/servers\/(\d+)$/,
    (m, body) => {
      const server = serverAt(m[1], m[2])
      if (typeof body['name'] === 'string') server.name = body['name']
      if (typeof body['address'] === 'string') server.address = body['address']
      return { server: { ...server } }
    }
  ],
  [
    'DELETE',
    /^\/api\/profiles\/(\w+)\/servers\/(\d+)$/,
    (m) => {
      const server = serverAt(m[1], m[2])
      const list = rowsOf(serverRows, m[1] ?? '')
      list.splice(list.indexOf(server), 1)
      list.forEach((entry, index) => {
        entry.index = index
      })
      return { deleted: server.index }
    }
  ],
  // Screenshots
  [
    'GET',
    /^\/api\/profiles\/(\w+)\/screenshots$/,
    (m) => ({ screenshots: [...rowsOf(screenshotRows, m[1] ?? '')].sort(byNewest<ScreenshotInfo>((shot) => shot.takenAt)) })
  ],
  ['POST', /^\/api\/profiles\/(\w+)\/screenshots\/open-folder$/, (m) => ({ path: `/home/demo/.volt/profiles/${m[1] ?? ''}/screenshots` })],
  [
    'GET',
    /^\/api\/profiles\/(\w+)\/screenshots\/([^/]+)\/image$/,
    (m) => {
      const shot = screenshotOf(m[1], m[2])
      const key = `${m[1] ?? ''}|${shot.fileName}`
      let dataUrl = screenshotImages.get(key)
      if (!dataUrl) {
        dataUrl = makeScreenshotPng()
        screenshotImages.set(key, dataUrl)
      }
      return { dataUrl, contentType: 'image/png' }
    }
  ],
  [
    'DELETE',
    /^\/api\/profiles\/(\w+)\/screenshots\/([^/]+)$/,
    (m) => {
      const shot = screenshotOf(m[1], m[2])
      const list = rowsOf(screenshotRows, m[1] ?? '')
      list.splice(list.indexOf(shot), 1)
      return { deleted: shot.fileName }
    }
  ],
  // Logs (the latest-crash route comes before the generic log route)
  ['GET', /^\/api\/profiles\/(\w+)\/logs$/, (m) => ({ logs: [...rowsOf(logRows, m[1] ?? '')] })],
  [
    'GET',
    /^\/api\/profiles\/(\w+)\/logs\/latest-crash$/,
    (m) => {
      const crashes = rowsOf(logRows, m[1] ?? '').filter((log) => log.kind === 'crash')
      return { log: crashes[crashes.length - 1] ?? null }
    }
  ],
  [
    'GET',
    /^\/api\/profiles\/(\w+)\/logs\/([^/]+)$/,
    (m, _body, query) =>
      readLogChunk(
        m[1] ?? '',
        decodeURIComponent(m[2] ?? ''),
        Number(query.get('offset') ?? 0),
        Number(query.get('maxBytes') ?? 128 * 1024)
      )
  ],
  [
    'DELETE',
    /^\/api\/profiles\/(\w+)\/logs\/([^/]+)$/,
    (m) => {
      const profileId = m[1] ?? ''
      const logId = decodeURIComponent(m[2] ?? '')
      logOf(profileId, logId)
      if (logId !== 'launcher') throw new MockError('Nur die Launcher-Konsole kann geleert werden.')
      logTexts.set(`${profileId}|${logId}`, '')
      return { cleared: logId }
    }
  ],
  [
    'POST',
    /^\/api\/profiles\/(\w+)\/logs\/([^/]+)\/open-folder$/,
    (m) => ({ path: `/home/demo/.volt/profiles/${m[1] ?? ''}/logs` })
  ],
  // Backups
  [
    'GET',
    /^\/api\/profiles\/(\w+)\/backups$/,
    (m) => ({ backups: [...rowsOf(backupRows, m[1] ?? '')].sort(byNewest<BackupInfo>((backup) => backup.createdAt)) })
  ],
  [
    'POST',
    /^\/api\/profiles\/(\w+)\/backups$/,
    (m, body) => {
      const profileId = m[1] ?? ''
      const profile = profileById(profileId)
      const label = typeof body['label'] === 'string' ? body['label'].trim() : ''
      return startJob('backup-create', `Erstelle Backup von ${profile.name}`, 2000, () => {
        const backup: BackupInfo = {
          id: backupStamp(),
          label,
          createdAt: nowIso(),
          sizeBytes: 80_000_000,
          minecraftVersion: profile.minecraftVersion,
          loader: profile.loader,
          fileCount: 410
        }
        rowsOf(backupRows, profileId).unshift(backup)
        return { backupId: backup.id }
      })
    }
  ],
  [
    'POST',
    /^\/api\/profiles\/(\w+)\/backups\/open-folder$/,
    (m) => ({ path: `/home/demo/.volt/backups/${m[1] ?? ''}` })
  ],
  [
    'POST',
    /^\/api\/profiles\/(\w+)\/backups\/([^/]+)\/restore$/,
    (m) => {
      const backup = backupOf(m[1], m[2])
      return startJob('backup-restore', `Stelle ${backup.label || backup.id} wieder her`, 2500, () => ({ backupId: backup.id }))
    }
  ],
  [
    'DELETE',
    /^\/api\/profiles\/(\w+)\/backups\/([^/]+)$/,
    (m) => {
      const backup = backupOf(m[1], m[2])
      const list = rowsOf(backupRows, m[1] ?? '')
      list.splice(list.indexOf(backup), 1)
      return { deleted: backup.id }
    }
  ]
]

// --- content (mods, resource packs, shader packs, data packs), modpacks and export/import
const seg = (match: string[], index: number): string => match[index] ?? ''

const packFiles = new Map<string, ModFile[]>()

function packFilesOf(id: string | undefined, type: string, world: string | null): ModFile[] {
  profileById(id)
  if (type === 'mods') return modsOf(id)
  const key = `${id}|${type}|${type === 'datapacks' ? world ?? '' : ''}`
  if (!packFiles.has(key)) {
    const seed: ModFile[] = type === 'datapacks'
      ? []
      : [
          {
            fileName: type === 'shaderpacks' ? 'ComplementaryReimagined_r5.9.3.zip' : 'SodiumTranslations.zip',
            enabled: true,
            size: 286582,
            sha1: hex(40),
            metadata: null,
            source: modrinthSource('yfDziwn1', 'v8.19.0', 'Sodium Translations'),
            update: null
          }
        ]
    packFiles.set(key, seed)
  }
  return packFiles.get(key) ?? []
}

function packFileOf(id: string | undefined, type: string, fileName: string | undefined, world: string | null): ModFile {
  const found = packFilesOf(id, type, world).find((file) => file.fileName === decodeURIComponent(fileName ?? ''))
  if (!found) throw new MockError(`Datei ${fileName ?? ''} nicht gefunden`)
  return found
}

/** Modpack status in the contract's shapes: `{linked: false}` or the linked fields (plus the older `modpack`). */
function modpackStatusOf(profile: Profile) {
  const source = profile.source
  if (!source) return { linked: false }
  const project = (PROJECTS[source.provider] ?? []).find((entry) => entry.id === source.projectId)
  const listed = project ? projectVersions(project, null, null).find((version) => version.id === source.versionId) : undefined
  return {
    linked: true,
    provider: source.provider,
    projectId: source.projectId,
    name: source.name,
    versionId: source.versionId,
    versionNumber: source.versionId === 'v2' ? '2.0.0' : source.versionId === 'v1' ? '1.0.0' : (listed?.versionNumber ?? ''),
    modpack: source,
    updateAvailable: source.versionId !== 'v2',
    latestVersionId: 'v2',
    latestVersionNumber: '2.0.0',
    latestReleaseDate: '2026-09-01T00:00:00Z',
    reason: ''
  }
}

const contentRoutes: Array<[HttpMethod, RegExp, Handler]> = [
  [
    'GET',
    /^\/api\/profiles\/(\w+)\/content\/(\w+)$/,
    (m, _body, query) => packFilesOf(seg(m, 1), seg(m, 2), query.get('world')).map((file) => ({ ...file }))
  ],
  [
    'GET',
    /^\/api\/profiles\/(\w+)\/content\/datapacks\/worlds$/,
    () => ({ worlds: [{ folder: 'Survival', datapacks: 1 }, { folder: 'Creative', datapacks: 0 }] })
  ],
  [
    'GET',
    /^\/api\/profiles\/(\w+)\/content\/(\w+)\/dependencies$/,
    (m) =>
      seg(m, 2) === 'mods'
        ? { warnings: [{ fileName: 'iris-1.8.0.jar', projectName: 'Sodium', dependencyProjectId: 'AANobbMI', state: 'missing' }] }
        : { warnings: [] }
  ],
  [
    'POST',
    /^\/api\/profiles\/(\w+)\/content\/(\w+)\/(identify|check-updates|update-all)$/,
    (m) => startJob(`content-${seg(m, 3)}`, `Inhalte: ${seg(m, 3)}`, 1200)
  ],
  [
    'POST',
    /^\/api\/profiles\/(\w+)\/content\/(\w+)\/toggle-all$/,
    (m, body, query) => {
      const enabled = body.enabled === true
      const list = packFilesOf(seg(m, 1), seg(m, 2), query.get('world'))
      let changed = 0
      for (const file of list) {
        if (file.enabled !== enabled) changed += 1
        file.enabled = enabled
        file.fileName = enabled ? file.fileName.replace(/\.disabled$/, '') : `${file.fileName.replace(/\.disabled$/, '')}.disabled`
      }
      return { changed, enabled, skipped: [] }
    }
  ],
  [
    'GET',
    /^\/api\/profiles\/(\w+)\/content\/(\w+)\/([^/]+)\/versions$/,
    () => [
      { id: 'v2', name: 'v2', versionNumber: '2.0.0', gameVersions: ['1.21.1'], loaders: [], releaseType: 'release', fileName: 'pack-2.0.0.zip', downloadUrl: 'https://example.invalid/2.zip', sha1: hex(40), datePublished: '2026-09-01T00:00:00Z', dependencies: [] },
      { id: 'v1', name: 'v1', versionNumber: '1.0.0', gameVersions: ['1.21.1'], loaders: [], releaseType: 'beta', fileName: 'pack-1.0.0.zip', downloadUrl: 'https://example.invalid/1.zip', sha1: hex(40), datePublished: '2026-06-01T00:00:00Z', dependencies: [] }
    ]
  ],
  [
    'POST',
    /^\/api\/profiles\/(\w+)\/content\/(\w+)\/([^/]+)\/version$/,
    (m) => startJob('mods-version', `Wechsle Version von ${decodeURIComponent(seg(m, 3))}`, 1200)
  ],
  [
    'POST',
    /^\/api\/profiles\/(\w+)\/content\/(\w+)\/([^/]+)\/update$/,
    (m) => startJob('mods-update', `Aktualisiere ${decodeURIComponent(seg(m, 3))}`, 1200)
  ],
  [
    'POST',
    /^\/api\/profiles\/(\w+)\/content\/(\w+)\/([^/]+)\/toggle$/,
    (m, _body, query) => {
      const file = packFileOf(seg(m, 1), seg(m, 2), seg(m, 3), query.get('world'))
      file.enabled = !file.enabled
      file.fileName = file.enabled ? file.fileName.replace(/\.disabled$/, '') : `${file.fileName.replace(/\.disabled$/, '')}.disabled`
      return { ...file }
    }
  ],
  [
    'DELETE',
    /^\/api\/profiles\/(\w+)\/content\/(\w+)\/([^/]+)$/,
    (m, _body, query) => {
      const list = packFilesOf(seg(m, 1), seg(m, 2), query.get('world'))
      const file = packFileOf(seg(m, 1), seg(m, 2), seg(m, 3), query.get('world'))
      list.splice(list.indexOf(file), 1)
      return { deleted: file.fileName }
    }
  ],
  [
    'GET',
    /^\/api\/profiles\/(\w+)\/modpack$/,
    (m) => modpackStatusOf(profileById(seg(m, 1)))
  ],
  [
    'POST',
    /^\/api\/profiles\/(\w+)\/modpack\/connect$/,
    (m, body) => {
      const profile = profileById(seg(m, 1))
      if (profile.source) throw new MockError('Das Profil ist bereits mit einem Modpack verbunden.')
      const provider = String(body['provider'] ?? '') as ProviderId
      const project = findProject(provider, String(body['projectId'] ?? ''))
      // Records the version only; nothing is installed.
      profile.source = { provider, projectId: project.id, versionId: String(body['versionId'] ?? ''), name: project.name, kind: 'modpack' }
      return modpackStatusOf(profile)
    }
  ],
  [
    'POST',
    /^\/api\/profiles\/(\w+)\/modpack\/disconnect$/,
    (m) => {
      const profile = profileById(seg(m, 1))
      if (!profile.source) throw new MockError('Das Profil ist mit keinem Modpack verbunden.')
      profile.source = null
      return modpackStatusOf(profile)
    }
  ],
  [
    'GET',
    /^\/api\/profiles\/(\w+)\/modpack\/versions$/,
    () => ({
      versions: [
        { id: 'v2', name: 'v2', versionNumber: '2.0.0', gameVersions: ['1.21.1'], loaders: ['fabric'], releaseType: 'release', fileName: 'pack-2.0.0.mrpack', downloadUrl: '', sha1: '', datePublished: '2026-09-01T00:00:00Z', dependencies: [] },
        { id: 'v1', name: 'v1', versionNumber: '1.0.0', gameVersions: ['1.21.1'], loaders: ['fabric'], releaseType: 'release', fileName: 'pack-1.0.0.mrpack', downloadUrl: '', sha1: '', datePublished: '2026-06-01T00:00:00Z', dependencies: [] }
      ]
    })
  ],
  [
    'POST',
    /^\/api\/profiles\/(\w+)\/modpack\/update$/,
    () => startJob('pack-update', 'Aktualisiere Modpack', 1800)
  ],
  [
    'POST',
    /^\/api\/profiles\/(\w+)\/export$/,
    (m, body) => {
      const format = body.format === 'curseforge' ? 'curseforge' : 'mrpack'
      const fileName = `${profileById(seg(m, 1)).name.toLowerCase().replace(/\s+/g, '-')}-20261010-120000.${format === 'curseforge' ? 'zip' : 'mrpack'}`
      return {
        path: `/home/user/.volt-launcher-next/exports/${fileName}`,
        fileName,
        referenced: 12,
        bundled: 2,
        notes: ['2 Datei(en) sind nicht auf Modrinth und wurden als Overrides eingebettet.']
      }
    }
  ],
  [
    'POST',
    /^\/api\/modpacks\/import$/,
    (_m, body) => startJob('pack-import', `Importiere ${String(body.path ?? '').split('/').pop() ?? ''}`, 1600)
  ]
]

// ---------- Profile logos (GET /api/profiles/:id/logo) ----------

const logoImages = new Map<string, string>()

/** Small PNGs for the logo cases, painted once. */
function logoPng(name: 'custom' | 'modpack' | 'vanilla'): string {
  const cached = logoImages.get(name)
  if (cached !== undefined) return cached
  const png =
    name === 'vanilla'
      ? pixelPng(16, 16, (ctx) => {
          // Grass top, dirt below, like the vanilla block.
          ctx.fillStyle = '#7a5635'
          ctx.fillRect(0, 0, 16, 16)
          ctx.fillStyle = '#5ea83a'
          ctx.fillRect(0, 0, 16, 6)
          ctx.fillStyle = '#4b8a2b'
          for (let x = 0; x < 16; x += 3) ctx.fillRect(x, 3, 1, 2)
          ctx.fillStyle = '#5d4029'
          for (let y = 8; y < 16; y += 3) ctx.fillRect((y * 5) % 14, y, 2, 1)
        })
      : name === 'modpack'
        ? pixelPng(32, 32, (ctx) => {
            ctx.fillStyle = '#2f80ed'
            ctx.fillRect(0, 0, 32, 32)
            ctx.fillStyle = '#f2994a'
            ctx.fillRect(8, 8, 16, 16)
          })
        : pixelPng(32, 32, (ctx) => {
            ctx.fillStyle = '#e0557a'
            ctx.fillRect(0, 0, 32, 32)
            ctx.fillStyle = '#ffffff'
            ctx.fillRect(10, 10, 12, 12)
          })
  logoImages.set(name, png)
  return png
}

/** The answer the backend gives: custom icon, then the linked modpack, then vanilla, then the loader. */
function logoAnswer(profile: Profile): { kind: 'custom' | 'modpack' | 'vanilla' | 'loader'; loader: Loader; dataUrl: string | null } {
  if (profile.id === 'c3d4e5f6a1b2') return { kind: 'custom', loader: profile.loader, dataUrl: logoPng('custom') }
  if (profile.id === 'd4e5f6a1b2c3') return { kind: 'vanilla', loader: 'vanilla', dataUrl: logoPng('vanilla') }
  if (profile.source?.kind === 'modpack') return { kind: 'modpack', loader: profile.loader, dataUrl: logoPng('modpack') }
  return { kind: 'loader', loader: profile.loader, dataUrl: null }
}

const autoProfileRoutes: Array<[HttpMethod, RegExp, Handler]> = [
  [
    'GET',
    /^\/api\/autoprofiles$/,
    () => ({
      enabled: settings.autoProfilesEnabled,
      loader: settings.autoProfileLoader,
      versions: settings.autoProfileVersions,
      mods: settings.autoProfileMods,
      seen: autoProfileState.seen,
      lastCheck: autoProfileState.lastCheck,
      lastError: autoProfileState.lastError,
      results: autoProfileState.results
    })
  ],
  [
    'POST',
    /^\/api\/autoprofiles\/check$/,
    () =>
      startJob('autoprofiles-check', 'Automatische Profile prüfen', 1500, () => {
        autoProfileState.lastCheck = nowIso()
        // The mock sees one new version per check; the first check after activation builds its profile.
        const version = '1.21.2'
        if (!autoProfileState.results.some((result) => result.minecraftVersion === version)) {
          autoProfileState.seen += 1
          autoProfileState.results.push(
            settings.autoProfilesEnabled
              ? { minecraftVersion: version, status: 'created', reason: 'Profil mit Preset angelegt', profileId: hex(12) }
              : { minecraftVersion: version, status: 'skipped', reason: 'Automatik ist aus', profileId: null }
          )
        }
        return { checked: 1 }
      })
  ],
  [
    'POST',
    /^\/api\/autoprofiles\/create$/,
    (_m, body) => {
      const version = String(body['minecraftVersion'] ?? '')
      if (!MOCK_RELEASES.includes(version)) throw new MockError(`HTTP 400: Unbekannte Version ${version}`)
      if (autoProfileState.results.some((result) => result.minecraftVersion === version && result.status === 'created')) {
        throw new MockError(`HTTP 409: Ein Profil für ${version} existiert bereits`)
      }
      return startJob('autoprofiles-create', `Profil für ${version} erstellen`, 2000, () => {
        const profileId = hex(12)
        autoProfileState.results.push({ minecraftVersion: version, status: 'created', reason: 'Profil mit Preset angelegt', profileId })
        return { profileId, minecraftVersion: version }
      })
    }
  ]
]

/** Other launchers as the scan reports them: one found with three profiles, one not installed, one unreadable. */
const IMPORT_SCAN: ImportScan = {
  launchers: [
    {
      id: 'prism',
      name: 'Prism Launcher',
      status: 'found',
      reason: null,
      confidence: 'verified',
      profiles: [
        {
          key: 'survival-121',
          name: 'Survival 1.21',
          minecraftVersion: '1.21.1',
          loader: 'fabric',
          loaderVersion: '0.16.9',
          sizeBytes: 1_532_000_000,
          path: '/home/demo/.local/share/PrismLauncher/instances/survival-121',
          importable: true,
          reason: null
        },
        {
          key: 'skyblock-120',
          name: 'Skyblock',
          minecraftVersion: '1.20.1',
          loader: 'forge',
          loaderVersion: '47.3.0',
          sizeBytes: 812_400_000,
          path: '/home/demo/.local/share/PrismLauncher/instances/skyblock-120',
          importable: true,
          reason: null
        },
        {
          key: 'altes-testprofil',
          name: 'Altes Testprofil',
          minecraftVersion: '1.16.5',
          loader: 'vanilla',
          loaderVersion: null,
          sizeBytes: 9_600_000,
          path: '/home/demo/.local/share/PrismLauncher/instances/altes-testprofil',
          importable: false,
          reason: 'Die Datei instance.cfg fehlt.'
        }
      ]
    },
    { id: 'multimc', name: 'MultiMC', status: 'none', reason: null, confidence: 'documented', profiles: [] },
    {
      id: 'atlauncher',
      name: 'ATLauncher',
      status: 'unavailable',
      reason: 'Der Ordner des Launchers ist gesperrt.',
      confidence: 'community',
      profiles: []
    }
  ]
}

const routes: Array<[HttpMethod, RegExp, Handler]> = [
  ['GET', /^\/api\/health$/, () => ({ status: 'ok', version: '0.1.0', dataDir: '/home/user/.volt-launcher-next' })],
  ['GET', /^\/api\/profiles\/(\w+)\/logo$/, (m) => logoAnswer(profileById(m[1]))],
  ...accountRoutes,
  ...skinRoutes,
  ...contentRoutes,
  ...gameDataRoutes,
  ...autoProfileRoutes,
  ['GET', /^\/api\/settings$/, () => settings],
  [
    'PATCH',
    /^\/api\/settings$/,
    (_m, body) => {
      settings = { ...settings, ...(body as Partial<Settings>) }
      return settings
    }
  ],
  ['POST', /^\/api\/settings\/reset$/, () => (settings = { ...DEFAULT_SETTINGS })],
  [
    'GET',
    /^\/api\/settings\/directories$/,
    (): LauncherDirectory[] => [
      { id: 'root', label: 'Launcher directory', path: '/home/user/.volt-launcher-next' },
      { id: 'profiles', label: 'Profiles', path: '/home/user/.volt-launcher-next/profiles' },
      { id: 'logs', label: 'Logs', path: '/home/user/.volt-launcher-next/logs' },
      { id: 'exports', label: 'Exported packs', path: '/home/user/.volt-launcher-next/exports' },
      { id: 'backups', label: 'Profile backups', path: '/home/user/.volt-launcher-next/backups' },
      { id: 'updates', label: 'Downloaded updates', path: '/home/user/.volt-launcher-next/updates' },
      { id: 'runtimes', label: 'Java runtimes', path: '/home/user/.volt-launcher-next/shared/runtimes' },
      { id: 'cache', label: 'Cache', path: '/home/user/.volt-launcher-next/cache' }
    ]
  ],
  [
    'POST',
    /^\/api\/settings\/directories\/(\w+)\/open$/,
    (m) => ({ path: `/home/user/.volt-launcher-next/${m[1] ?? ''}` })
  ],
  [
    'GET',
    /^\/api\/updates$/,
    (): UpdateInfo => ({
      available: true,
      currentVersion: '0.1.0',
      latestVersion: '0.2.0',
      name: 'VoltLauncher 0.2.0',
      notes: 'Mock release notes.\n- Profile groups\n- Java runtime installer',
      publishedAt: agoIso(60 * 24 * 3),
      releaseUrl: 'https://github.com/ezTxmMC/Volt-Launcher/releases',
      assetName: 'VoltLauncher-0.2.0.AppImage',
      downloadable: true,
      assetSize: 98_000_000,
      prerelease: false,
      reason: '',
      checksumSha512: hex(128)
    })
  ],
  [
    'POST',
    /^\/api\/updates\/download$/,
    () =>
      startJob('update-download', 'Lade VoltLauncher 0.2.0', 2000, () => ({
        path: '/home/user/.volt-launcher-next/updates/VoltLauncher-0.2.0.AppImage',
        fileName: 'VoltLauncher-0.2.0.AppImage',
        directory: '/home/user/.volt-launcher-next/updates',
        verified: true
      }))
  ],
  ['POST', /^\/api\/updates\/open-release$/, () => ({ url: 'https://github.com/ezTxmMC/Volt-Launcher/releases' })],
  [
    'GET',
    /^\/api\/integrations\/discord$/,
    (): DiscordStatus => ({
      state: settings.discordApplicationId ? 'waiting_for_discord' : 'not_configured',
      message: settings.discordApplicationId ? 'Waiting for the Discord desktop client.' : 'No Discord application id configured.',
      transport: 'unix socket',
      configured: settings.discordApplicationId !== '',
      enabled: settings.discordPresence
    })
  ],
  [
    'GET',
    /^\/api\/java\/runtimes$/,
    (): JavaRuntimes => ({
      detected: [
        { majorVersion: 21, version: '21.0.5', path: '/usr/lib/jvm/java-21-openjdk/bin/java', managed: false },
        { majorVersion: 17, version: '17.0.13', path: '/usr/lib/jvm/java-17-openjdk/bin/java', managed: false }
      ],
      managed: [],
      installable: [8, 11, 16, 17, 21, 25],
      configured: settings.javaRuntimes,
      installing: []
    })
  ],
  [
    'POST',
    /^\/api\/java\/runtimes\/(\d+)\/install$/,
    (m) =>
      startJob('java-install', `Installiere Java ${m[1] ?? ''}`, 3000, () => ({
        majorVersion: Number(m[1]),
        javaPath: `/home/user/.volt-launcher-next/shared/runtimes/jdk-${m[1] ?? ''}/bin/java`
      }))
  ],
  ['GET', /^\/api\/platforms$/, (): PlatformInfo[] => [
    { id: 'vanilla', displayName: 'Vanilla' },
    { id: 'fabric', displayName: 'Fabric' },
    { id: 'quilt', displayName: 'Quilt' },
    { id: 'forge', displayName: 'Forge' },
    { id: 'neoforge', displayName: 'NeoForge' }
  ]],
  ['GET', /^\/api\/jobs$/, () => [...jobs.values()].reverse().map(evaluate)],
  ['GET', /^\/api\/imports\/scan$/, (): ImportScan => IMPORT_SCAN],
  [
    'POST',
    /^\/api\/imports$/,
    (_m, body) => {
      const items = Array.isArray(body['items']) ? (body['items'] as ImportItem[]) : []
      const picked = items.map((item) => {
        const launcher = IMPORT_SCAN.launchers.find((entry) => entry.id === item.launcher)
        const candidate = launcher?.profiles.find((entry) => entry.key === item.key)
        if (!candidate) throw new MockError(`Profil ${item.key} nicht gefunden`)
        if (!candidate.importable) throw new MockError(`Profil „${candidate.name}“ kann nicht importiert werden.`)
        return candidate
      })
      return startJob('import', `Importiere ${picked.length} Profile`, 4000, () => {
        for (const candidate of picked) {
          const profile: Profile = {
            id: hex(12),
            name: candidate.name,
            minecraftVersion: candidate.minecraftVersion,
            loader: candidate.loader as Loader,
            loaderVersion: candidate.loaderVersion,
            memoryMb: null,
            javaPath: null,
            jvmArgs: '',
            ...PROFILE_EXTRAS,
            gameDir: `/home/demo/.volt/profiles/${hex(12)}`,
            createdAt: nowIso(),
            lastPlayed: null,
            source: null
          }
          profiles.push(profile)
          mods.set(profile.id, [])
        }
        return { imported: picked.length }
      })
    }
  ],
  [
    'POST',
    /^\/api\/jobs\/(\w+)\/cancel$/,
    (m) => {
      const entry = jobs.get(m[1] ?? '')
      if (!entry) throw new MockError('Job nicht gefunden')
      entry.cancelled = true
      return evaluate(entry)
    }
  ],
  ['GET', /^\/api\/profiles$/, () => profiles],
  [
    'POST',
    /^\/api\/profiles$/,
    (_m, body) => {
      const profile: Profile = {
        id: hex(12),
        name: String(body['name'] ?? 'Profile'),
        minecraftVersion: String(body['minecraftVersion'] ?? '1.21.1'),
        loader: (body['loader'] as Loader | undefined) ?? 'vanilla',
        loaderVersion: typeof body['loaderVersion'] === 'string' ? body['loaderVersion'] : null,
        memoryMb: null,
        javaPath: null,
        jvmArgs: '',
        ...PROFILE_EXTRAS,
        gameDir: `/home/demo/.volt/profiles/${hex(12)}`,
        createdAt: nowIso(),
        lastPlayed: null,
        source: null,
        synced: Array.isArray(body['synced']) ? checkSyncKeys(body['synced']) : []
      }
      profiles.push(profile)
      mods.set(profile.id, [])
      return profile
    }
  ],
  ['GET', /^\/api\/profiles\/groups$/, () => [...new Set(profiles.map((p) => p.group).filter((g): g is string => !!g))]],
  ['GET', /^\/api\/profiles\/(\w+)$/, (m) => profileById(m[1])],
  [
    'POST',
    /^\/api\/profiles\/(\w+)\/duplicate$/,
    (m, body) => {
      const source = profileById(m[1])
      const name = typeof body['name'] === 'string' && body['name'] !== '' ? body['name'] : `${source.name} (Kopie)`
      return startJob('profile-duplicate', `Dupliziere ${source.name}`, 1200, () => {
        const copy: Profile = {
          ...source,
          id: hex(12),
          name,
          gameDirectory: null,
          gameDir: `/home/demo/.volt/profiles/${hex(12)}`,
          favourite: false,
          lastPlayed: null,
          totalPlaytimeMs: 0,
          createdAt: nowIso()
        }
        profiles.push(copy)
        mods.set(copy.id, [])
        return { profileId: copy.id, name }
      })
    }
  ],
  [
    'POST',
    /^\/api\/profiles\/(\w+)\/verify$/,
    (m) => {
      const profile = profileById(m[1])
      return startJob('profile-verify', `Prüfe ${profile.name}`, 1500, () => {
        verifyReports.set(profile.id, {
          checkedAt: nowIso(),
          libraries: { checked: 42, brokenBefore: 0, brokenAfter: 0, examples: [] },
          client: { okBefore: true, okAfter: true },
          repaired: false,
          ok: true
        })
        return undefined
      })
    }
  ],
  ['GET', /^\/api\/profiles\/(\w+)\/verify$/, (m) => ({ report: verifyReports.get(m[1] ?? '') ?? null })],
  [
    'GET',
    /^\/api\/versions$/,
    (_m, _body, params) => [
      { id: '1.21.1', type: 'release', releaseTime: '2024-08-08T00:00:00+00:00' },
      { id: '1.20.4', type: 'release', releaseTime: '2023-12-07T00:00:00+00:00' },
      ...(params.get('includeSnapshots') === 'true'
        ? [{ id: '24w14a', type: 'snapshot', releaseTime: '2024-04-03T00:00:00+00:00' }]
        : [])
    ]
  ],
  [
    'GET',
    /^\/api\/loader-versions$/,
    (_m, _body, params) =>
      params.get('platformId') === 'vanilla'
        ? []
        : [
            { id: '0.16.5', stable: true },
            { id: '0.16.4', stable: true }
          ]
  ],
  [
    'PATCH',
    /^\/api\/profiles\/(\w+)$/,
    (m, body) => (Array.isArray(body['synced']) ? setSyncedFolders(profileById(m[1]), body['synced']) : Object.assign(profileById(m[1]), body))
  ],
  [
    'DELETE',
    /^\/api\/profiles\/(\w+)$/,
    (m) => {
      const index = profiles.indexOf(profileById(m[1]))
      profiles.splice(index, 1)
      return {}
    }
  ],
  ['GET', /^\/api\/profiles\/(\w+)\/mods$/, (m) => modsOf(m[1]).map((file) => ({ ...file }))],
  [
    'POST',
    /^\/api\/profiles\/(\w+)\/mods\/identify$/,
    (m) => {
      const list = modsOf(m[1])
      return startJob('mods-identify', 'Mods werden erkannt', 2200, () => {
        for (const file of list) {
          if (!file.source && file.metadata?.modId === 'lithium') file.source = modrinthSource('gvQqBUqZ', '0.13.0', 'Lithium')
        }
      })
    }
  ],
  [
    'POST',
    /^\/api\/profiles\/(\w+)\/mods\/check-updates$/,
    (m) => {
      const list = modsOf(m[1])
      return startJob('mods-check-updates', 'Prüfe auf Updates', 2200, () => {
        const api = list.find((file) => file.metadata?.modId === 'fabric-api')
        if (api && !api.update) {
          api.update = {
            versionId: 'fapi-1',
            versionNumber: '0.105.0',
            fileName: 'fabric-api-0.105.0.jar',
            sha1: hex(40),
            url: 'https://example.invalid/fabric-api.jar',
            gameVersions: ['1.21.1'],
            loaders: ['fabric']
          }
        }
      })
    }
  ],
  [
    'POST',
    /^\/api\/profiles\/(\w+)\/mods\/update-all$/,
    (m) => {
      const list = modsOf(m[1])
      return startJob('mods-update-all', 'Alle Mods werden aktualisiert', 3500, () => list.forEach(applyUpdate))
    }
  ],
  [
    'POST',
    /^\/api\/profiles\/(\w+)\/mods\/([^/]+)\/update$/,
    (m) => {
      const file = modOf(m[1], m[2])
      return startJob('mod-update', `Aktualisiere ${file.metadata?.name ?? file.fileName}`, 2500, () => applyUpdate(file))
    }
  ],
  [
    'POST',
    /^\/api\/profiles\/(\w+)\/mods\/([^/]+)\/toggle$/,
    (m) => {
      const file = modOf(m[1], m[2])
      file.enabled = !file.enabled
      file.fileName = file.enabled ? file.fileName.replace(/\.disabled$/, '') : `${file.fileName}.disabled`
      return { ...file }
    }
  ],
  [
    'DELETE',
    /^\/api\/profiles\/(\w+)\/mods\/([^/]+)$/,
    (m) => {
      const list = modsOf(m[1])
      list.splice(list.indexOf(modOf(m[1], m[2])), 1)
      return {}
    }
  ],
  ['GET', /^\/api\/providers$/, () => PROVIDERS],
  [
    'GET',
    /^\/api\/providers\/(\w+)\/filters$/,
    (m, _b, query) => providerFilters(m[1] as ProviderId, (query.get('kind') ?? 'mod') as ContentKind)
  ],
  [
    'GET',
    /^\/api\/providers\/(\w+)\/search$/,
    (m, _b, query) => {
      const provider = m[1] as ProviderId
      const kind = (query.get('kind') ?? '') as ContentKind
      const supports = supportsOf(provider, kind)
      const q = (query.get('q') ?? '').toLowerCase()
      // Only the filters the provider honours are applied, as the backend does.
      const categories = supports.categories ? (query.get('categories') ?? '').split(',').filter(Boolean) : []
      const gameVersion = supports.gameVersion ? query.get('gameVersion') : null
      const loader = supports.loader ? query.get('loader') : null
      const sort = query.get('sort') ?? 'relevance'
      const offset = Number(query.get('offset') ?? 0)
      const limit = Number(query.get('limit') ?? 20)
      const matching = (PROJECTS[provider] ?? []).filter((project) => {
        const loaders = projectLoaders(project)
        return (
          (!kind || project.kind === kind) &&
          categories.every((category) => project.categories.includes(category)) &&
          (!gameVersion || projectGameVersions(project).includes(gameVersion)) &&
          (!loader || loaders.length === 0 || loaders.includes(loader)) &&
          `${project.name} ${project.summary}`.toLowerCase().includes(q)
        )
      })
      const ordered = sortProjects(matching, sort)
      return {
        total: ordered.length,
        items: ordered.slice(offset, offset + limit),
        hasMore: offset + limit < ordered.length,
        supports
      }
    }
  ],
  [
    'GET',
    /^\/api\/providers\/(\w+)\/categories$/,
    (m, _b, query) => {
      // Only Modrinth publishes categories, as in the backend.
      if (m[1] !== 'modrinth' || query.get('kind') !== 'mod') return []
      return ['adventure', 'optimization', 'utility']
    }
  ],
  ['GET', /^\/api\/providers\/(\w+)\/projects\/([^/]+)$/, (m) => projectDetail(findProject(m[1] as ProviderId, decodeURIComponent(m[2] ?? '')))],
  [
    'GET',
    /^\/api\/providers\/(\w+)\/projects\/([^/]+)\/versions$/,
    (m, _b, query) =>
      projectVersions(findProject(m[1] as ProviderId, decodeURIComponent(m[2] ?? '')), query.get('gameVersion'), query.get('loader'))
  ],
  [
    'POST',
    /^\/api\/providers\/packs\/install$/,
    (_m, body) => {
      const project = findProject(body['provider'] as ProviderId, String(body['projectId']))
      return startJob('pack-install', `Installiere ${project.name}`, 6000, () => {
        const profile: Profile = {
          id: hex(12),
          name: project.name,
          minecraftVersion: '1.21.1',
          loader: 'neoforge',
          loaderVersion: '21.1.77',
          memoryMb: null,
          javaPath: null,
          jvmArgs: '',
          ...PROFILE_EXTRAS,
          gameDir: `/home/demo/.volt/profiles/${hex(12)}`,
          createdAt: nowIso(),
          lastPlayed: null,
          source: {
            provider: project.provider,
            projectId: project.id,
            versionId: String(body['versionId']),
            name: project.name,
            kind: 'modpack'
          }
        }
        profiles.push(profile)
        mods.set(profile.id, [])
      })
    }
  ],
  [
    'POST',
    /^\/api\/profiles\/(\w+)\/content\/install$/,
    (m, body) => {
      const profile = profileById(m[1])
      const project = findProject(body['provider'] as ProviderId, String(body['projectId']))
      return startJob('content-install', `Installiere ${project.name} in ${profile.name}`, 3000, () => {
        if (project.kind === 'mod') {
          modsOf(profile.id).push(
            mod(`${project.slug}-1.0.0.jar`, profile.loader, project.slug, project.name, '1.0.0', modrinthSource(project.id, '1.0.0', project.name), 900_000)
          )
        }
      })
    }
  ],
  [
    'GET',
    /^\/api\/profiles\/(\w+)\/game$/,
    (m) => {
      profileById(m[1])
      return runningGames.get(m[1] ?? '') ?? { running: false, pid: null, startedAt: null, stopping: false, phase: 'idle', lastExit: null }
    }
  ],
  [
    'POST',
    /^\/api\/profiles\/(\w+)\/install-game$/,
    (m) => {
      const profile = profileById(m[1])
      return startJob('game-install', `Installiere Minecraft ${profile.minecraftVersion}`, 5000)
    }
  ],
  [
    'POST',
    /^\/api\/profiles\/(\w+)\/launch$/,
    (m) => {
      const profile = profileById(m[1])
      return startJob('launch', `Starte ${profile.name}`, 2500, () => {
        profile.lastPlayed = nowIso()
        runningGames.set(profile.id, { running: true, pid: 4242, startedAt: nowIso(), stopping: false, phase: 'running', lastExit: null })
      })
    }
  ],
  [
    'POST',
    /^\/api\/profiles\/(\w+)\/game\/stop$/,
    (m) => {
      runningGames.delete(m[1] ?? '')
      return {}
    }
  ]
]

async function handle<T>(method: HttpMethod, rawPath: string, body: unknown): Promise<ApiResult<T>> {
  await sleep(LATENCY_MS)
  const url = new URL(rawPath, 'http://mock.invalid')
  for (const [routeMethod, pattern, handler] of routes) {
    if (routeMethod !== method) continue
    const match = pattern.exec(url.pathname)
    if (!match) continue
    const result = await handler(match, (body ?? {}) as Record<string, unknown>, url.searchParams)
    const status = method === 'POST' && result !== null && typeof result === 'object' && 'state' in result ? 202 : 200
    return { status, body: structuredClone(result) as T }
  }
  throw new MockError(`Mock: ${method} ${url.pathname} ist nicht implementiert`)
}

export function installMockBridge(): void {
  let status: BackendStatus = { state: 'starting', message: null, log: null }
  const listeners = new Set<(status: BackendStatus) => void>()
  const setStatus = (next: BackendStatus): void => {
    status = next
    listeners.forEach((listener) => listener(next))
  }
  // Mimic the backend start-up so the splash screen can be seen in the browser.
  setTimeout(() => setStatus({ state: 'ready', message: null, log: null }), 600)

  const bridge: VoltBridge = {
    api: handle,
    backendStatus: () => Promise.resolve(status),
    onBackendStatus(callback) {
      listeners.add(callback)
      return () => listeners.delete(callback)
    },
    restartBackend: () => {
      setStatus({ state: 'ready', message: null, log: null })
      return Promise.resolve()
    },
    platform: 'linux',
    openPath: () => Promise.resolve(''),
    pickDirectory: () => Promise.resolve(null),
    // Same steps as the Electron sign-in: login start, the redirect, then the callback job.
    signIn: async (): Promise<Job | null> => {
      const login = (await handle<LoginStart>('POST', '/api/accounts/login', undefined)).body
      await sleep(1200)
      return (await handle<Job>('POST', '/api/accounts/callback', { state: login.state, code: 'MOCK-CODE' })).body
    },
    hideWindow: () => {
      console.info('[mock] hideWindow')
      return Promise.resolve()
    },
    showWindow: () => {
      console.info('[mock] showWindow')
      return Promise.resolve()
    },
    // The browser has no window frame; the window buttons only log.
    minimize: () => {
      console.info('[mock] minimize')
      return Promise.resolve()
    },
    maximize: () => {
      console.info('[mock] maximize')
      return Promise.resolve()
    },
    close: () => {
      console.info('[mock] close')
      return Promise.resolve()
    },
    isMaximized: () => Promise.resolve(false),
    onMaximizedChange: () => () => undefined
  }
  window.volt = bridge
}
