# VoltLauncher — new architecture

The launcher consists of two separate parts that talk to each other over a local HTTP service.
The old Java backend (`volt-*`) and `ui/` remain untouched for now; the new code lives in
`app/` and `backend/`.

```
┌──────────────────────── app/ (Electron) ────────────────────────┐
│  main process                    renderer (React)               │
│  ├─ picks free port + token      ├─ react-router pages          │
│  ├─ starts backend/ as           ├─ calls window.volt.api(...)  │
│  │  subprocess (spawn)           │   (preload → IPC → main)     │
│  ├─ proxies API calls     ◄──────┘                              │
│  └─ stops backend on close                                      │
└──────────────┬──────────────────────────────────────────────────┘
               │ HTTP 127.0.0.1:<port>, header X-Volt-Token
┌──────────────▼─────────── backend/ (Novus) ─────────────────────┐
│  http server (net) → router → modules                            │
│  ├─ settings, profiles, jobs      (core)                         │
│  ├─ mods        (file scan, metadata, update check)              │
│  ├─ providers   (Modrinth, CurseForge bridge, Technic, FTB)      │
│  └─ launch      (Minecraft installation, Java, launch)           │
└─────────────────────────────────────────────────────────────────┘
```

## Process logic

1. Electron (main) looks for a free TCP port on `127.0.0.1` and generates a random
   token (32 bytes, hex).
2. Electron starts the backend as a child process:
   `volt-backend --port <port> --token <token> --data-dir <dir>`.
   The binary is located in `backend/dist/` (development) or in `resources/backend/` (packaged).
3. Electron polls `GET /api/health` until the backend responds (timeout 15 s).
4. The renderer side **never** talks directly to the backend. It calls
   `window.volt.api(method, path, body?)`; the preload sends this over IPC to the
   main process, which executes the HTTP request with the token. As a result, the backend needs no CORS,
   and the token never leaves the main process.
5. When Electron exits, the child process is terminated.

The backend does not exit on its own; it is a pure service.

## HTTP conventions

- All paths begin with `/api`. Every request needs `X-Volt-Token`; without a valid token
  the backend responds with `401`.
- Request and response bodies are JSON (`Content-Type: application/json; charset=utf-8`).
- Errors: HTTP status plus
  `{"error": {"code": "not_found" | "bad_request" | "conflict" | "upstream" | "internal", "message": "…"}}`.
- Timestamps: ISO-8601 in UTC (`2026-10-10T12:00:00Z`).
- IDs: Profile IDs are 12-character hex strings. Job IDs are 12-character hex strings.
- Long-running operations run as a **job**: the endpoint responds immediately with `202` and a job;
  progress is queried via `GET /api/jobs/:id` (polling, roughly every 500 ms).

## Data models

**Settings**

```json
{
  "language": "de",
  "theme": "system",
  "memoryMb": 4096,
  "bridgeUrl": "https://bridge.volt-launcher.app",
  "javaPath": null,
  "closeOnLaunch": false,
  "downloadThreads": 6
}
```

**Profile**

```json
{
  "id": "a1b2c3d4e5f6",
  "name": "Survival",
  "minecraftVersion": "1.21.1",
  "loader": "fabric",
  "loaderVersion": "0.16.5",
  "memoryMb": null,
  "javaPath": null,
  "jvmArgs": "",
  "gameDir": "<dataDir>/profiles/a1b2c3d4e5f6",
  "createdAt": "2026-10-10T12:00:00Z",
  "lastPlayed": null,
  "source": null
}
```

`loader` is one of `vanilla | fabric | quilt | forge | neoforge`. `memoryMb: null` means
"use the global value from the settings". `source` is `null` or
`{"provider": "modrinth", "projectId": "…", "versionId": "…", "name": "…", "kind": "modpack"}`
and states where a modpack came from (important for later pack updates).

**ModFile** (entry from `<gameDir>/mods`)

```json
{
  "fileName": "sodium-fabric-0.6.0.jar",
  "enabled": true,
  "size": 1234567,
  "sha1": "…",
  "metadata": {
    "loader": "fabric",
    "modId": "sodium",
    "name": "Sodium",
    "version": "0.6.0",
    "description": "…"
  },
  "source": {
    "provider": "modrinth",
    "projectId": "AANobbMI",
    "versionId": "…",
    "versionNumber": "0.6.0",
    "name": "Sodium"
  },
  "update": null
}
```

- `enabled` is `false` if the file ends in `.jar.disabled`. Toggling only renames the file.
- `metadata` comes from the jar (fabric.mod.json, quilt.mod.json, META-INF/mods.toml,
  META-INF/neoforge.mods.toml, mcmod.info). If metadata is missing, `loader` is `"unknown"`.
- `source` is `null` if the hash is not known to any provider.
- `update` is `null` or `{"versionId", "versionNumber", "fileName", "sha1", "url", "gameVersions": [...], "loaders": [...]}`.

**Job**

```json
{
  "id": "0f1e2d3c4b5a",
  "kind": "pack-install",
  "title": "Installing All the Mods 10",
  "state": "running",
  "progress": 0.42,
  "message": "Downloading 12 / 30 files",
  "error": null,
  "result": null,
  "createdAt": "2026-10-10T12:00:00Z",
  "finishedAt": null
}
```

`state` is `running | done | failed | cancelled`. `progress` is in the range `0.0 … 1.0`.
`result` is set when `state` is `done`, e.g. `{"profileId": "…"}` after a pack installation.

**ProjectSummary** (Discover)

```json
{
  "provider": "modrinth",
  "id": "AANobbMI",
  "slug": "sodium",
  "name": "Sodium",
  "summary": "…",
  "iconUrl": "https://…",
  "author": "jellysquid3",
  "downloads": 123456,
  "kind": "mod",
  "categories": ["optimization"]
}
```

`provider` is `modrinth | curseforge | technic | ftb`. `kind` is `mod | modpack | resourcepack | shader | datapack`.

## Endpoints

### General

| Method | Path | Description |
| --- | --- | --- |
| GET | `/api/health` | `{"status": "ok", "version": "…", "dataDir": "…"}`; reachable without a token |
| GET | `/api/settings` | Settings |
| PATCH | `/api/settings` | Partial update, returns the complete settings |
| GET | `/api/jobs` | All jobs, newest first |
| GET | `/api/jobs/:id` | One job |
| POST | `/api/jobs/:id/cancel` | Request cancellation |

### Profiles

| Method | Path | Description |
| --- | --- | --- |
| GET | `/api/profiles` | List |
| POST | `/api/profiles` | `{name, minecraftVersion, loader, loaderVersion?}` → Profile (201) |
| GET | `/api/profiles/:id` | One profile |
| PATCH | `/api/profiles/:id` | Change fields |
| DELETE | `/api/profiles/:id` | Deletes the profile and its files |

### Mods

| Method | Path | Description |
| --- | --- | --- |
| GET | `/api/profiles/:id/mods` | Scans `mods/` and returns `ModFile[]`; detected sources and updates are included if they have already been checked |
| POST | `/api/profiles/:id/mods/identify` | Job: send hashes to Modrinth, set `source` |
| POST | `/api/profiles/:id/mods/check-updates` | Job: set `update` for all identified mods |
| POST | `/api/profiles/:id/mods/:fileName/update` | Job: update the mod to `update` (the old jar is moved to `mods/.volt-backup/`) |
| POST | `/api/profiles/:id/mods/update-all` | Job: apply all available updates |
| POST | `/api/profiles/:id/mods/:fileName/toggle` | Enables/disables the mod |
| DELETE | `/api/profiles/:id/mods/:fileName` | Deletes the file |

### Discover / Providers

| Method | Path | Description |
| --- | --- | --- |
| GET | `/api/providers` | `[{id, name, kinds: [...], configured: bool, message}]` |
| GET | `/api/providers/:provider/search?q=&kind=&gameVersion=&loader=&categories=&sort=&offset=&limit=` | `{total, items: ProjectSummary[], hasMore, supports}`; `limit` 1–50 |
| GET | `/api/providers/:provider/filters?kind=` | `{kinds, sorts: [{id, label}], categories: [{id, label}], gameVersions, loaders, supports}`; empty lists: the provider cannot list them |
| GET | `/api/providers/:provider/projects/:id` | Detail: ProjectSummary + `description` (Markdown) + `gallery`. CurseForge returns HTML: the description is converted to Markdown in `providers/htmltext.nv` (headings, lists, links, images; `/linkout` redirects are resolved, YouTube iframes become links, scripts, styles, and other iframes are removed). Modrinth stays unchanged. |
| GET | `/api/providers/:provider/projects/:id/versions?gameVersion=&loader=` | `[{id, name, versionNumber, gameVersions, loaders, fileName, downloadUrl, sha1, datePublished, dependencies}]` |
| POST | `/api/providers/packs/install` | `{provider, projectId, versionId, name?}` → Job; creates a profile with `source`. `name` (optional, trimmed, 1–64 characters, otherwise 400) is the profile name; without `name`, the name of the pack is used. `source` always names the pack. |
| POST | `/api/profiles/:id/content/install` | `{provider, projectId, versionId, kind}` → Job; installs a file into the profile |

### Launch

| Method | Path | Description |
| --- | --- | --- |
| POST | `/api/profiles/:id/install-game` | Job: download Minecraft, loader, and libraries/assets |
| POST | `/api/profiles/:id/launch` | Job: launches the game (the process is monitored by the backend); optional `quickPlay` body, see below |
| GET | `/api/profiles/:id/game` | `{running: bool, pid: int|null, startedAt: ISO|null}` |
| POST | `/api/profiles/:id/game/stop` | Terminates the running process |
| GET | `/api/java` | Detected Java installations |

**Quick Play** (`launch/route.nv`, `launch/command.nv`): The body of `POST …/launch` may contain
`{"quickPlay": {"mode": "multiplayer", "server": "host"}}` or `{"quickPlay": {"mode": "multiplayer", "server": "host:port"}}`
or `{"quickPlay": {"mode": "singleplayer", "world": "<folder name>"}}`. Without a body or without `quickPlay`,
the launch runs unchanged.

- 400 `bad_request`: `mode` is not `multiplayer` or `singleplayer`; `server` is missing, empty, longer than 255 characters,
  or contains spaces, `/`, or characters other than letters, digits, `.`, `-`, `_` (IPv6 in brackets, port 1 to 65535);
  `world` is missing, empty, `.`, or contains `/`, `\` or `..`.
- 404 `not_found`: the world folder is missing from the profile's `saves/`.
- 422 `unsupported` ("This Minecraft version cannot open a world from the command line."): singleplayer on a version
  without Quick Play. The version name decides before the job (1.19 and older, snapshots before 23w14a); otherwise the job checks the metadata.
- These responses are returned synchronously, before the job. A valid body yields 202 with the job as before.
- Versions with the rule `has_quick_plays_support` (1.20 and newer) get `--quickPlayMultiplayer` or
  `--quickPlaySingleplayer` via the placeholders; `${quickPlayPath}` points to `<profile folder>/quickPlay/java/quickplay.json`.
- Older versions get `--server <host> --port <port>` for multiplayer (port 25565 if none is given) after the game arguments.
- The launch log contains the line `[VoltLauncher] quick play: multiplayer <server>` or `singleplayer <world>`; the command line
  also contains the argument (access token masked).

## Module responsibilities (Novus)

- `main` — read arguments, create directories, start the server.
- `server/` — TCP listener (`std/net`), HTTP/1.1 parser, router, JSON responses, token check.
- `core/` — settings file, profile store (`profiles.json` plus one folder per profile), job registry.
- `mods/` — zip reading (central directory + inflate), jar metadata, SHA-1, Modrinth update check.
- `providers/` — Modrinth, CurseForge (via the bridge), Technic, FTB. Pack installation.
- `launch/` — version manifest, libraries, assets, natives, Java, Fabric/Quilt profiles,
  Forge/NeoForge via the installer, process launch.

Each feature module exposes exactly one routing function:

```
method route(string verb, array<string> segments, map<string, string> query, object body): map<string, object>
```

It returns `{"status": 200, "body": <JSON-serializable object>}` or throws via
`core.fail(status, code, message)`, which the server translates into the error response.
`core` calls the modules based on the first path segment after `/api` (or, for
`/api/profiles/:id/…`, based on the third segment).

## Profile management (P1, `profilemgmt/`)

Additional profile fields (all optional on creation; `null` = default):

| Field | Type | Meaning |
| --- | --- | --- |
| `gameDirectory` | `string \| null` | Custom game directory (absolute); `null` = managed directory |
| `gameDir` | string | Effective game directory, read-only |
| `wrapperCommand` | `string \| null` | Command placed before `java` (e.g. `gamemoderun`) |
| `preLaunchCommand` | `string \| null` | Shell command before launch; an exit code ≠ 0 aborts the launch |
| `postExitCommand` | `string \| null` | Shell command after the game exits |
| `envVars` | `{NAME: "value"}` | Environment variables (names: letters, digits, `_`) |
| `fullscreen` | bool | Starts Minecraft with `--fullscreen` |
| `hideLauncher` | `bool \| null` | Hide the launcher on launch; `null` = global setting `closeOnLaunch` |
| `favourite` | bool | Favourite (sorted to the front) |
| `group` | `string \| null` | Group under which the profile appears |
| `iconUrl` | `string \| null` | Data URL (PNG, JPEG, GIF, WebP, at most 300 KB) |
| `totalPlaytimeMs` | int | Playtime across all sessions, read-only |

All modifiable fields go through `PATCH /api/profiles/:id`. `GET /api/profiles/:id/game` additionally
returns `phase` (`idle | running | stopping | install-game | launch | verify | duplicate`).

| Method | Path | Description |
| --- | --- | --- |
| GET | `/api/profiles` | List; each profile with `running` and `phase` |
| GET | `/api/profiles/groups` | `["Modpacks", …]` |
| POST | `/api/profiles/:id/duplicate` | `{name?}` → Job; result `{profileId, name}`; copies the game directory |
| POST | `/api/profiles/:id/icon` | `{dataUrl}` → Profile with `iconUrl` |
| POST | `/api/profiles/:id/verify` | `{repair?}` → Job; the result is the report |
| GET | `/api/profiles/:id/verify` | `{report}` of the last check, otherwise `null` |
| GET | `/api/versions?includeSnapshots=&includeBetas=&includeAlphas=` | `[{id, type, releaseTime}]` from the Mojang manifest |
| GET | `/api/loader-versions?platformId=&minecraftVersionId=` | `[{id, stable}]`, newest first; empty for `vanilla` |

The platform list (`GET /api/platforms`) is provided by the `system` module.

Verification report: `{checkedAt, libraries: {checked, brokenBefore, brokenAfter, examples}, client: {okBefore, okAfter}, repaired, ok}`.

## Discover and UI (P6, `providers/`, `core/settings.nv`)

Extensions, all additive; without the new parameters everything behaves as before.

**Settings** (new keys, defaults in parentheses):

| Key | Type | Effect |
| --- | --- | --- |
| `accentColor` | `"#rrggbb"` (`#00b2ff`) | Accent colour; the default value uses the colours of the theme |
| `uiScale` | `compact \| default \| comfortable` (`default`) | UI size (0.9 / 1 / 1.12, via CSS zoom) |
| `animationsEnabled` | bool (`true`) | Turns transitions and animations on or off |

**Discover**

| Method | Path | Description |
| --- | --- | --- |
| GET | `/api/providers` | Each entry additionally has `sorts`: the sort values the provider actually evaluates |
| GET | `/api/providers/:provider/search?…&categories=&sort=` | `categories`: Modrinth categories (AND combination) or CurseForge category IDs (one as `categoryId`, several as `categoryIds`); `sort`: one of the provider's `sorts`, otherwise `relevance`. Every provider accepts all parameters; `supports` shows what it actually evaluates. |
| GET | `/api/providers/:provider/filters?kind=` | UI filters: `sorts` (with labels), `categories` (`{id, label}`), `gameVersions`, `loaders`, and `supports` (`search, kind, sort, categories, gameVersion, loader, paging`). If `kind` is missing, the provider's default applies (`mod`, for Technic and FTB `modpack`). |
| GET | `/api/providers/:provider/categories?kind=` | The IDs from `/filters` (`["optimization", …]`); only Modrinth and CurseForge have categories, otherwise `[]` |

Sorting and support per provider (`filters.nv`, `supports` in the response):

| Provider | `sort` | Not supported (`supports` = false) |
| --- | --- | --- |
| Modrinth | `relevance, downloads, follows, newest, updated` | nothing |
| CurseForge (bridge) | `relevance` (Featured), `follows` (Popularity), `updated`, `name` (A–Z), `downloads`, `newest` (Release date) | everything, as long as the bridge is not running (response: empty lists, search 502). Version list: empty, because the bridge does not forward it. Loaders fixed: `fabric, forge, neoforge, quilt` |
| Technic | `relevance`, `popular` (order of `/trending`), `downloads` (installs), `follows` (runs) | `categories`, `loader` (the loader is only in the build archive) |
| FTB | `relevance`, `downloads` (installs), `follows` (plays), `updated` | `categories` (FTB has none). Version and loader come from the packs' `targets`. |

`hasMore` is `offset + count < total`. Every sort except `relevance` on FTB reads the candidates' documents (from the cache) and sorts them; FTB lists are only roughly ordered.
| POST | `/api/profiles/:id/content/install` | `versionId` may be omitted: then the newest matching version is chosen (quick add). `withDependencies` (bool, default `true`) turns off dependencies (mods only). |

Versions (`GET …/versions`) contain `releaseType` (`release | beta | alpha`); this already existed.

Examples:

```
GET  /api/providers/modrinth/search?kind=mod&categories=optimization,utility&sort=downloads&limit=20
GET  /api/providers/modrinth/categories?kind=mod
GET  /api/providers/modrinth/filters?kind=mod
GET  /api/providers/technic/search?q=tekkit&sort=popular
POST /api/profiles/a1b2c3d4e5f6/content/install  {"provider":"modrinth","projectId":"YL57xq9U","kind":"mod","withDependencies":false}
```

## Game data (P2, `gamedata/`)

Worlds, server list, screenshots, logs, and backups of a profile. All paths are under `/api/profiles/:id/`.

- Worlds are located in `<gameDir>/saves/<folder>/`. The name is stored in `level.dat` (gzip NBT), not in the folder name. Renaming rewrites `level.dat`; the folder stays.
- Server list: `<gameDir>/servers.dat` (uncompressed NBT). An entry is addressed by its index, as in the game.
- Backups are located outside the profile: `<dataDir>/backups/<profileId>/<timestamp>.zip` with sidecar `<timestamp>.json`. The number kept is governed by `backupsToKeep`.
- Long-running operations (duplicate world, copy world, create backup, restore backup) respond with `202` and a job. The result is in `result`.
- A profile is locked during an operation: other changes to it respond with `409`. If the profile's game is running, changes to worlds, the server list, and backups also respond with `409`.

| Method | Path | Description |
| --- | --- | --- |
| GET | `/worlds` | `{"worlds": [World]}`, newest first |
| PATCH | `/worlds/:folder` | `{"name"}` renames → `{"world"}` |
| DELETE | `/worlds/:folder` | Deletes the folder → `{"deleted"}` |
| GET | `/worlds/:folder/icon` | `{"dataUrl": "data:image/png;base64,…" \| null}` |
| POST | `/worlds/:folder/duplicate` | `{"name"?}` → Job (`result.world`) |
| POST | `/worlds/:folder/copy` | `{"targetProfileId"}` → Job (`result.world`, `result.profileId`) |
| GET | `/servers` | `{"servers": [Server]}` |
| POST | `/servers` | `{"name"?, "address"}` → 201 `{"server"}`; without a name, the address is used |
| PATCH | `/servers/:index` | `{"name"?, "address"?}` → `{"server"}`; fields not sent are kept |
| DELETE | `/servers/:index` | → `{"deleted"}` |
| GET | `/screenshots` | `{"screenshots": [Screenshot]}` |
| GET | `/screenshots/:file/image` | `{"dataUrl", "contentType"}` (JSON, since the API only serves JSON) |
| DELETE | `/screenshots/:file` | → `{"deleted"}` |
| POST | `/screenshots/open-folder` | `{"path"}`; the app opens the folder (`openPath`) |
| GET | `/logs` | `{"logs": [LogSource]}`; ids: `launcher`, `game:<file>`, `crash:<file>` |
| GET | `/logs/latest-crash` | `{"log": LogSource \| null}` |
| GET | `/logs/:logId?offset=&maxBytes=` | `LogChunk`; negative `offset` = end of file, default 128 KB, at most 512 KB |
| DELETE | `/logs/:logId` | Clears only the launcher console (`launcher`) |
| POST | `/logs/:logId/open-folder` | `{"path"}` |
| GET | `/backups` | `{"backups": [Backup]}`, newest first |
| POST | `/backups` | `{"label"?}` → Job (`result.backupId`) |
| POST | `/backups/:backupId/restore` | → Job; the game folder is set aside and only deleted after success |
| DELETE | `/backups/:backupId` | → `{"deleted"}` |
| POST | `/backups/open-folder` | `{"path"}` |

Data models (excerpt): **World** `{folderName, name, lastPlayed (ISO), sizeBytes, gameMode, hardcore, versionName, hasIcon, readable, problem}`; **Server** `{index, name, address, icon (data URL or ""), acceptTextures}`; **LogSource** `{id, label, kind (launcher | game | crash), sizeBytes, modifiedAt, live, compressed}`; **LogChunk** `{id, offset, nextOffset, size, text, truncated}`; **Backup** `{id, label, createdAt, sizeBytes, minecraftVersion, loader, fileCount}`.

Examples:

```
GET    /api/profiles/a1b2c3d4e5f6/worlds
PATCH  /api/profiles/a1b2c3d4e5f6/worlds/New%20World          {"name": "My Build"}
POST   /api/profiles/a1b2c3d4e5f6/worlds/New%20World/copy     {"targetProfileId": "0f1e2d3c4b5a"}
POST   /api/profiles/a1b2c3d4e5f6/servers                     {"name": "Friends", "address": "play.example.org"}
GET    /api/profiles/a1b2c3d4e5f6/logs/game%3Alatest.log?offset=-1&maxBytes=65536
POST   /api/profiles/a1b2c3d4e5f6/backups                     {"label": "before modpack update"}
POST   /api/profiles/a1b2c3d4e5f6/backups/20261010-120000.zip/restore
```

Notes: A backup is a ZIP (stored or deflate, UTF-8 names, no ZIP64) that the backend writes itself; restoring reads it via the jar reader from `mods/zip.nv`. Logs are read as a whole file (the runtime has no partial reads); each request therefore costs the file size.

## System, settings, integrations (P4, `system/`, `core/settings.nv`)

Settings: `core/settings.nv` (defaults and rules); reset via `POST /api/settings/reset`.
The keys of the old UI are mapped onto the model; new additions are: `minMemoryMb`, `defaultJvmArgs`,
`javaRuntimes` (`[{majorVersion, path}]`), `openLogsOnLaunch`, `offlineModeAllowed`, `backupsToKeep`,
`backupBeforePackUpdate`, `profileSort` (`lastPlayed | name | createdAt`), `favouritesFirst`, `showFps`,
`discordPresence`, `discordApplicationId`, `autoUpdate`, `betaUpdates`.
`bridgeUrl` and `discordApplicationId` are fixed (launcher default value): `PATCH /api/settings` with either of these keys
responds with 400 `bad_request` ("… is fixed by the launcher") and changes nothing; values stored in `settings.json` are
ignored on load. `GET /api/settings` shows both. The key `updateRepository` has been removed; updates come from the CDN (see below).
The old option "Hide on launch" has been merged into `closeOnLaunch`.

| Method | Path | Description |
| --- | --- | --- |
| POST | `/api/settings/reset` | Resets all settings to defaults; responds with the settings |
| GET | `/api/settings/directories` | `[{id, label, path}]` (`root, profiles, logs, exports, backups, updates, runtimes, cache`) |
| POST | `/api/settings/directories/:id/open` | Creates the folder and responds with `{path}`; the UI opens it via Electron |
| GET | `/api/updates[?force=1]` | `UpdateInfo` (cache 10 min); manifest unreachable or not yet published (HTTP 404): `available: false` with the reason in `reason` |
| POST | `/api/updates/download` | Job (202); result `{path, fileName, directory, verified}`; target `<dataDir>/updates/` |
| POST | `/api/updates/open-release` | `{url}` of the release page (`https://cdn.volt-launcher.app/download/volt-launcher/version/latest/`) |
| GET | `/api/integrations/discord` | `{state, message, transport, configured, enabled}`; `state` = `disabled | not_configured | waiting_for_discord | rejected | connected` |
| GET | `/api/java/runtimes` | `{detected, managed, installable, configured, installing}` |
| POST | `/api/java/runtimes/:major/install` | Job (202); result `{majorVersion, javaPath}`; one installation per version |
| GET | `/api/platforms` | `[{id, displayName}]` of the loaders |

`UpdateInfo`: `{available, currentVersion, latestVersion, name, notes, publishedAt, releaseUrl, assetName, downloadable, assetSize, prerelease, reason, checksumSha512}`; `checksumSha512` is the hex value.

Updates come from the CDN: `https://cdn.volt-launcher.app/download/volt-launcher/version/latest/latest.json` (fixed, `system/updates.nv`),
in the format of Lumen IDE's publishing script: `product`, `version`, `releaseDate`, `notes`, `platforms.<platform>` with
`version`, `releaseDate`, `update: {name, size, sha512}` and `files: [{name, size, sha512}]`. Platforms: `linux_amd64`, `linux_aarch64`,
`windows_x86_64`, `windows_arm64`, `macos_arm64`; the machine's platform is derived from `os.platform()` and `uname -m` or `PROCESSOR_ARCHITECTURE`.
The installer is `update`, otherwise the first entry of `files`, and is located at `<feed>/<platform>/<name>`. A version is newer if it is greater
according to Lumen's `compareVersions` (prereleases only with `betaUpdates`). Size and SHA-512 are verified: the base64 value from the
manifest is decoded to hex and compared with the file's hex digest (`sha512sum`, `shasum -a 512`, or `certutil`). If the
check fails, the file is deleted and the job fails.

Discord: Rich Presence over the local IPC socket (Unix socket using `$XDG_RUNTIME_DIR`, `$TMPDIR`, `/tmp`, as well as
Flatpak and Snap subfolders; Windows named pipe `\\.\pipe\discord-ipc-N`). The socket calls are a small C block
in `system/discord.nv`. If Discord is not running, the state stays `waiting_for_discord`; there is no error.
Other modules set the displayed status with `systemDiscordSetActivity(details, state, startedAtMs)`.

Examples:

```
GET  /api/settings/directories
POST /api/settings/directories/logs/open
GET  /api/updates?force=1
POST /api/updates/download
GET  /api/integrations/discord
GET  /api/java/runtimes
POST /api/java/runtimes/21/install
PATCH /api/settings                       {"backupsToKeep": 3}
```

## Accounts and skins (P3, `accounts/`)

The module `backend/src/accounts/` owns accounts (Microsoft and offline), sign-in, and the skin library.
Launch takes the selected account via `accountsLaunchSession()` (name, UUID without hyphens,
access token, user type, XUID); without sign-in, the game starts with the offline default account "Player".

**Account store.** `<dataDir>/accounts/accounts.enc` contains all accounts including tokens, encrypted.
`std/crypto` offers only AES-128 in CFB-8 mode (no GCM, no AES-256, no HMAC). Therefore
encrypt-then-MAC applies: AES-128-CFB8 with a random 16-byte IV per save operation, HMAC-SHA256 over `iv || ciphertext`
(built from `crypto.sha256`). Both keys are derived via HMAC from a 32-byte master key
(`<dataDir>/accounts/master.key`, base64, owner-only permissions; the key is generated on first save).
A corrupted file or a wrong key results in an error and is never replaced by an empty store.
Tokens never appear in logs, in responses, or on the command line: the Authorization header is passed to curl from a
file under `<dataDir>/accounts/tmp` (owner only), and the launch line in the game log
is masked (`launchMaskedCommand`).

**Sign-in.** OAuth 2.0 Authorization Code with PKCE (S256) via the public Xbox client; the redirect goes to
`https://login.live.com/oauth20_desktop.srf`, the only URI allowed for this client. The chain follows:
Microsoft token → Xbox Live → XSTS → Minecraft login → profile (`api.minecraftservices.com/minecraft/profile`).
The browser ends up at `…/oauth20_desktop.srf?code=…&state=…`. The UI passes this address (in full) on to
`POST /api/accounts/callback`, where the exchange runs as a job. The backend itself does not accept a redirect.
Pending sign-ins are kept in memory only (10 minutes, single use).

**Skins.** `<dataDir>/skins/skins.json` (metadata, not secret) and `<dataDir>/skins/<id>.png`. PNG files
of 64×64 or 64×32 pixels up to 2 MB are allowed. Applying uploads the PNG as multipart (`variant`, `file`) to
`api.minecraftservices.com/minecraft/profile/skins`; only after that is the skin considered selected. This also runs as a job.

Endpoints (paths with account IDs as hyphenated UUIDs):

| Method | Path | Description |
| --- | --- | --- |
| GET | `/api/accounts` | `{accounts: [{id, name, type, selected, default, usable, skinDataUrl, skinError}], selectedId, offlineMode}`; the default account "Player" always comes first. `skinDataUrl` is the PNG of the current skin (Microsoft only, otherwise `null`), `skinError` is `null` or a short reason if the skin could not be loaded |
| GET | `/api/accounts/session` | `{authenticated, id, name, type}` of the selected account (without tokens) |
| POST | `/api/accounts/login` | `{state, url, expiresAt}`; the UI opens `url` in the browser |
| POST | `/api/accounts/callback` | `{state, code}` or `{state, error, error_description}`; 202 with job (`kind: account-login`, result `{id, name}`) |
| POST | `/api/accounts/logout` | Removes all Microsoft accounts; offline accounts remain |
| POST | `/api/accounts/offline` | `{name}` (3–16 characters, letters, digits, `_`); 201 with `{account, …}` |
| POST | `/api/accounts/offline-mode` | `{enabled}`; on: offline account, off: last Microsoft account (409 without a Microsoft account) |
| POST | `/api/accounts/:id/select` | Select account |
| DELETE | `/api/accounts/:id` | Remove account (not the default account, 409) |
| GET | `/api/skins` | `{skins: [{id, name, slim, createdAt, selected, imageDataUrl}], selectedSkinId}` |
| POST | `/api/skins` | `{name, slim, imageBase64}` (data URL prefix allowed); 201 with `{skin}` |
| GET | `/api/skins/:id` | One skin with preview (`imageDataUrl`) |
| PATCH | `/api/skins/:id` | `{name}` |
| DELETE | `/api/skins/:id` | Deletes metadata and PNG |
| POST | `/api/skins/:id/select` | 202 with job (`kind: skin-apply`, result `{skin}`); 409 if no Microsoft account is selected |

Examples:

```
POST /api/accounts/login                          -> {"state":"5c81…","url":"https://login.live.com/oauth20_authorize.srf?…","expiresAt":"…"}
POST /api/accounts/callback   {"state":"5c81…","code":"M.R3_BAY…"}   -> 202 Job (kind account-login)
POST /api/accounts/offline    {"name":"Tester_1"}                    -> 201 {"account":{…},"accounts":[…],"selectedId":"…","offlineMode":true}
POST /api/accounts/offline-mode {"enabled":false}                    -> 200 Account list (Microsoft account selected)
POST /api/skins               {"name":"Night Knight","slim":false,"imageBase64":"data:image/png;base64,…"} -> 201 {"skin":{…}}
POST /api/skins/2544…/select                                         -> 202 Job (kind skin-apply)
```

**Launch.** `launch/command.nv` sets `auth_player_name`, `auth_uuid`, `auth_access_token`, `auth_session`,
`auth_xuid`, and `user_type` from the session. `launch/jobs.nv` writes the launch line with `launchMaskedCommand`
to the game log.

**Sign-in in the main process.** `app/src/main/signin.ts` intercepts the redirect to `oauth20_desktop.srf`; code and state are sent to `/api/accounts/callback`. The real Microsoft sign-in has not yet been exercised end to end (tested with forged redirects).

**Microsoft accounts only.** Offline accounts are disabled: `POST /api/accounts/offline` and `POST /api/accounts/offline-mode` with `{enabled: true}` respond with 403 `sign_in_required`. Launch (`accountsLaunchSession()`) requires a selected Microsoft account and otherwise fails with 403 `sign_in_required`; `install-game` needs no account. The account list keeps offline entries (including "Player") with `usable: false`, and `offlineMode` is `true` as long as no Microsoft account is selected. The rows for `/api/accounts/offline` and `offline-mode` in the table above describe the earlier state.

**Current skin (home page).** `GET /api/accounts/skin` (`accounts/current.nv`) returns the skin the selected Microsoft account is currently wearing: `{name, uuid (with hyphens), model: "classic" | "slim", skinUrl, dataUrl, capeDataUrl}`. The data comes from the Mojang profile (`api.minecraftservices.com/minecraft/profile`, using the Minecraft token from `acSessionOf`, i.e. the same chain and refresh as on launch). The skin with `state: ACTIVE` is loaded from `textures.minecraft.net` and returned as a data URL; the UI therefore needs no network access to the texture domain (CSP). An active cape is optional and is absent if it cannot be loaded. If no skin is set, `skinUrl`, `dataUrl`, and `capeDataUrl` are `null`, and the model comes from the first entry of the profile. Without a Microsoft account: 403 `sign_in_required`; fetch error: 502 `upstream`. The response is kept in memory for 5 minutes per account (successes only), and applying a skin clears that cache. Tokens and profile JSON are not logged. `GET /api/accounts` fetches the same skin for each Microsoft account one after another (outside the account lock, using the same cache) and returns it as `skinDataUrl`. If an account fails, only that account gets `skinError`; the list still succeeds.

## Content and modpacks (P5, `mods/`, `providers/`)

**Content by type.** `mods/` manages mods, resource packs, shader packs, and data packs with a single implementation
(`ContentLoc` in `mods/store.nv`). The mod endpoints remain unchanged; the generic ones sit alongside them:

| Method | Path | Description |
| --- | --- | --- |
| GET | `/api/profiles/:id/content/:type` | `ModFile[]` (`type`: `mods`, `resourcepacks`, `shaderpacks`, `datapacks`); `metadata` is only set for mods |
| POST | `…/content/:type/identify`, `…/check-updates`, `…/update-all` | Job |
| POST | `…/content/:type/toggle-all` | `{enabled}` → `{changed, enabled, skipped}` |
| GET | `…/content/:type/dependencies` | `{warnings: [{fileName, projectName, dependencyProjectId, state}]}` (mods only, `state`: `missing \| disabled`) |
| GET | `…/content/:type/:file/versions` | `ProjectRelease[]` (Modrinth, filtered by game version and loader) |
| POST | `…/content/:type/:file/version` | `{versionId}` → Job; replaces the file with any version (sha1-verified, old file to `.volt-backup/`) |
| POST | `…/content/:type/:file/update` · `…/toggle` · DELETE `…/:file` | as for mods |

- Storage per type: `<gameDir>/.volt/mods.json` (mods, unchanged), `resourcepacks.json`, `shaderpacks.json`.
- In Minecraft, data packs live **in a world**: `<gameDir>/saves/<world>/datapacks/`. All data pack requests
  need `?world=<folder>`; `GET …/content/datapacks/worlds` lists the worlds with counts. Their storage is named
  `.volt/datapacks-<sha1(world)[0:16]>.json`.
- Non-mod content is `*.zip` (or `*.zip.disabled`) and carries no jar metadata.
- Content installation (`POST …/content/install`) accepts `world` (required for `kind: datapack`) and writes the
  source into the storage immediately (no identify needed). Modrinth search filters packs by their tag
  (`minecraft` or `datapack`).

**Modpack.** `providers/modpack.nv`:

| Method | Path | Description |
| --- | --- | --- |
| GET | `/api/profiles/:id/modpack` | `{modpack, updateAvailable, latestVersionId, latestVersionNumber, latestReleaseDate, reason}` |
| GET | `/api/profiles/:id/modpack/versions` | `{versions: [ProjectRelease]}`, newest first |
| POST | `/api/profiles/:id/modpack/update` | `{versionId?}` → Job; result `{profileId, versionId, installed, removed}` |
| POST | `/api/modpacks/import` | `{path, name?}` → Job; result `{profileId}`; the format is read from the archive (mrpack, CurseForge, Technic) |

The files a release installed are recorded in `<gameDir>/.volt/pack-files.json` (`{versionId, files}`).
An update deletes the files of the old release that the new one no longer contains; worlds, configurations, and
custom mods are kept. Profiles without this list (created before P5) delete nothing on the first update.
Updates are available for Modrinth and CurseForge; Technic and FTB as well as imported packs cannot be updated.

**Export.** `POST /api/profiles/:id/export` `{format: "mrpack" | "curseforge", name?, version?}` → 201
`{path, fileName, referenced, bundled, notes}`. The file ends up in `<dataDir>/exports/`. The mrpack references
Modrinth files by hash and download URL (version from the storage); CurseForge files only if their source has a
project and file ID. Everything else as well as `config/`, `defaultconfigs/`, `kubejs/`, `scripts/`, `options.txt`, etc.
goes into `overrides/`. Data packs (tied to worlds) are not exported.

**Known gaps.** No backup before a pack update: neither the backend nor the UI creates one, even though
`backupBeforePackUpdate` may be set (open; the UI could call `POST /api/profiles/:id/backups` beforehand). CurseForge pack files are
not yet recorded in the storage, so a CurseForge zip exports them into `overrides/`. File selection in the import
is done via a path (the UI has no file dialog; a `pickFile` IPC belongs in the main process).

## Migration of the old Java data (`migration/`)

The old Java launcher lived in the same folder (`~/.voltlauncher`, the default of `--data-dir`); `--legacy-dir <path>`
points to it, otherwise the data folder itself is meant. At startup (after `core.init`, before the server) the
migration runs if `<legacy>/instances/instances.json` exists and `<dataDir>/migration.json` is missing or has
`"status": "partial"`. With `"done"`, nothing happens. The results are stored in `migration.json`
(`status` done | partial, `profiles` with `slug`, `profileId`, `status` migrated | failed, counters, `notes`);
`GET /api/migration` returns the contents (otherwise `{"status": "none"}`).

- **Settings:** `config/settings.json` is mapped onto the keys of `core/settings.nv` (e.g.
  `defaultMaxMemoryMb` → `memoryMb`, `maxConcurrentDownloads` → `downloadThreads`,
  `hideLauncherOnLaunch` → `closeOnLaunch`). A value is only written if the new file has the default there
  or does not know the key. Not carried over: `offlineModeAllowed` (no counterpart); `javaRuntimes`
  is only carried over if the entries have the new format.
- **Profiles:** for each entry in `instances.json`, a new profile via `core.createProfile`. A `versionId`
  of `fabric:<mc>:<loader>` (also quilt, forge, neoforge) yields loader and version, otherwise it is vanilla. The
  game directory remains the old folder `instances/<slug>/game` (`gameDirectory`); nothing is copied.
  Modpack origin from `content.json` is carried over as `source` (`kind: "modpack"`).
  A failed entry is recorded as `failed` with a message; the others continue. A restart
  retries only the failed ones and reuses an already created profile.
- **Mod origin:** From `instances/<slug>/content.json`, `<gameDir>/.volt/<kind>.json` is written for each file via
  `mods.recordSource`, but only if the sha1 of the file on disk matches the stored one and
  the provider is Modrinth or CurseForge. Data packs (tied to worlds) and hand-placed files are
  skipped and counted. An existing `.volt` cache is not overwritten.
- **Backups and runtimes:** not moved. The new backend only reads `<dataDir>/backups/<profileId>`; the
  old archives stay in `backups/<slug>` and are listed in `backupsLeftInPlace`. `runtimes/` is not moved
  (the backend uses `shared/runtimes`).
- **Accounts:** not migrated. `auth/account-session.enc` is AES-GCM encrypted and cannot be read by the new backend;
  Microsoft sign-in has to be done again once.
- **Old folder:** Apart from the `.volt/*.json` caches, the migration writes nothing into the old folder. A
  `--migration-dry-run --data-dir <scratch> --legacy-dir <old>` runs everything into a scratch folder without writing to the
  old folder. Tests: `backend/tests/migration/run.sh` (`--real-dry-run` against the real data).

## Connecting a modpack (P5, `providers/connect.nv`)

A profile can be linked to a release version of a modpack without anything being installed.

| Method | Path | Description |
| --- | --- | --- |
| POST | `/api/profiles/:id/modpack/connect` | `{provider, projectId, versionId}` → 200 modpack status; 409 if already connected; 422 `unsupported` if the file list cannot be read exactly |
| POST | `/api/profiles/:id/modpack/disconnect` | No body → 200 modpack status; removes the source and `.volt/pack-files.json`, the files remain |

- Status (`GET …/modpack`): connected profiles return `linked: true`, `provider`, `projectId`, `name`, `versionId`,
  `versionNumber`, `updateAvailable`, `latestVersionId`; otherwise `linked: false`.
- File list per provider (only contents of `mods/`, `resourcepacks/`, `shaderpacks/`, `datapacks/`, as the installation
  records them): Modrinth reads `modrinth.index.json` from the `.mrpack` (archive into a temp directory, deleted afterwards);
  CurseForge reads `manifest.json` of the pack zip, resolved via the bridge (502 without the bridge); Technic reads the entries
  of a client zip; Solder packs are rejected with 422 because their build list only names mod archives; FTB takes the
  `files` of the release document.
- An empty or guessed list is never written. The list rules mirror `install.nv`; keep them in sync when
  changing it.
- An update after connecting works as it does after an installation. Technic and FTB remain non-updatable.

## Profile logo (`logo/`)

| Method | Path | Description |
| --- | --- | --- |
| GET | `/api/profiles/:id/logo` | `{kind, loader, dataUrl}`; `kind` is `custom`, `modpack`, `vanilla`, or `loader`; `dataUrl` is a `data:image/…;base64,…` URL or `null`. Unknown profile: 404. |

The sources, in this order (the first one that yields something wins):

1. **custom**: the profile has its own icon (`POST /api/profiles/:id/icon`); the icon is returned unchanged.
2. **modpack**: the profile is connected to a modpack (`source`). The icon comes from the cache `<dataDir>/cache/logos/<provider>-<projectId>.<ext>`, otherwise from the provider: Modrinth `icon_url`, CurseForge `logo.url` (via the bridge), FTB the `art` of type `square` or `icon`, Technic `icon.url`. The download goes through the providers' curl helper; PNG, JPEG, and WEBP are accepted (magic bytes checked), at most 2 MB. The file only lands in the cache by renaming, after the download is complete and verified. If the icon is missing or the fetch fails, the next source follows; the endpoint never fails because of a logo.
3. **vanilla**: only for profiles with loader `vanilla`. The block texture comes from the client jar the launcher has already downloaded: `<dataDir>/shared/versions/<mc>/<mc>.jar`. A release (`^\d+\.\d+(\.\d+)?$`, also `26.1`, `26.1.2`) uses `assets/minecraft/textures/block/grass_block_side.png`, any other version (`26w14a`, `1.21.4-pre1`, `1.20-rc1`) uses `dirt.png`. The file is read with the providers' zip reader, not copied, and not written into the repository. Without a jar (game never installed), `dataUrl` is `null`. After the first read, the texture is stored as `<dataDir>/cache/logos/vanilla-grass.png` or `vanilla-dirt.png`.
4. **loader**: all other profiles; `dataUrl` is `null`, the UI draws the loader badge.

Notes:

- The vanilla texture is cached only by block type (grass or dirt), not by version: the first jar read determines the texture for all versions. This follows the prescribed cache file; if textures differ between versions, the name would have to include the version.
- Project IDs containing characters other than letters, digits, `.`, `_`, and `-` yield no pack icon (they are neither loaded nor used as a file name); the profile falls back to the next source.
- No lock is held during network or file access; temporary files carry a random ID.
- Tests: `backend/tests/logo/run.sh` (classification, priority with fixtures, cache, 404; the jar and the pack fixtures are created with Python in the temporary data folder).

## Automatic profiles (`autoprofiles/`)

A background checker creates a profile `<version> Performance` for every new Minecraft version, with a
preset list of performance mods (default: Fabric). Settings (`core/settings.nv`):

| Key | Default | Rule |
| --- | --- | --- |
| `autoProfilesEnabled` | `false` | bool |
| `autoProfileLoader` | `fabric` | `fabric \| quilt \| forge \| neoforge` |
| `autoProfileVersions` | `release` | `release \| snapshots` (with `snapshots`, snapshots are included too) |
| `autoProfileMods` | Fabric preset, 7 Modrinth projects | List of `{provider: "modrinth", projectId, name}`, at most 32 entries; `projectId` made of letters, digits, `-`, `_`, and `.` (at most 64 characters) |

The preset: Sodium `AANobbMI`, Lithium `gvQqBUqZ`, FerriteCore `uXXizFIs`, ImmediatelyFast `5ZwdcRci`,
Entity Culling `NNAgCjsB`, ModernFix `nmDcB62a`, Krypton `fQEb0iXm`. Iris is not included. The slug
`memory-leak-fix` does not exist on Modrinth (404) and is therefore omitted.

| Method | Path | Description |
| --- | --- | --- |
| GET | `/api/autoprofiles` | `{enabled, loader, versions, mods, seen, lastCheck, lastError, results}`; `seen` is the number of versions seen, `lastCheck` and `lastError` are an ISO time or text, respectively, or `null`; `results` are the last 50 results, newest first, each `{minecraftVersion, status, reason, profileId}` with `status` = `created`, `skipped`, or `failed`. |
| POST | `/api/autoprofiles/create` | Body `{minecraftVersion}`; Job (202, kind `autoprofile`) for exactly this version. 400 for an unknown version, 409 if the profile name already exists. |
| POST | `/api/autoprofiles/check` | Job (202): one check, as with the timer. Also runs when the feature is switched off. 409 while a check is running. |

Flow:

- A timer thread (`autoprofiles.startBackground()` in `main.nv`) checks 30 s after startup and 30 s after the feature
  was switched on, then every 60 minutes as long as it is on. Each check runs as a job.
- The first check (after switching on, or after the first start with the feature on) only records: all versions in the Mojang manifest
  are entered as seen, and no profile is created.
- Later checks handle every version that has not been seen. If its type matches the setting (`release`, with `snapshots`
  also `snapshot`), the profile is created; other versions are only noted as seen. Switching from `release` to
  `snapshots` therefore does not backfill old snapshots.
- Name: `<version> Performance`. If the name exists, the version ends as `skipped` with "already exists".
- Loader: if the loader has no build for the version (Fabric meta 400, Quilt meta 404, Forge/NeoForge: empty list), the
  version ends as `skipped` with the reason. Other errors (unreachable) end as `failed`; the version stays unseen
  and is retried on the next check.
- Mods: each entry is handled like a content installation (`providers.installContent`, newest matching version,
  required dependencies on). A mod that cannot be installed is listed in the result's `reason`; the profile
  remains `created`.
- Default for Quilt, Forge, and NeoForge: there is no preset yet. The list is a single key; as long as
  it is unchanged from the Fabric preset, another loader gets no mods, and the result states the reason.
  Custom mods for that loader are set in `autoProfileMods`.
- Errors do not stop the checker: an unreachable manifest sets `lastError`, and the next check tries again.
- State: `<dataDir>/autoprofiles.json` (`baselined`, `seen`, `lastCheck`, `lastError`, `results`; the last 200 results).
- Test switch: only with `--enable-test-routes` does the checker read `manifest.json` and `loaders.json` from the folder in
  `VOLT_AUTOPROFILES_FIXTURES` instead of from the network. The tests use this.
- Tests: `backend/tests/autoprofiles/run.sh` (baseline recording, new versions, release/snapshot filter, naming rule, missing loader,
  Quilt rule, mod list validation, endpoints, error path, timer; about 50 s, no network, in the temporary data folder).


## Profile import (`imports/`)

Imports profiles from other launchers as **copies**: the source is only read, never moved or deleted. Paths and fields come from `docs/IMPORT-FORMATS.md`; only what is listed there as verified or documented is mapped.

Endpoints (`server/router.nv` routes `/api/imports` here):

| Method | Path | Response |
|---|---|---|
| GET | `/api/imports/scan` | `{"launchers": [...]}`. Per launcher: `id`, `name`, `status` (`found`, `none`, `unavailable`), `reason`, `confidence` (`verified`, `documented`, `community`), `profiles`. Per profile: `key` (stable, derived from launcher and path), `name`, `minecraftVersion`, `loader`, `loaderVersion`, `sizeBytes`, `sizeComplete`, `path`, `importable`, `reason`, `notes`. |
| POST | `/api/imports` | Body `{"items": [{"launcher", "key"}]}` (1 to 200 entries), responds 202 with a job (`kind: "import"`). The result has `items` (per entry `result` = `done`, `partial`, or `failed`, `profileId`, `copiedFiles`, `notCopied` with path and reason, `notes`, `message`) as well as the counters `done`, `partial`, `failed`. |

All checks run before the first copy, for the whole request: 400 `bad_request` (invalid body, entry not importable, duplicate entry, data folder lies inside the game folder), 404 `not_found` (launcher or key unknown; then repeat the scan), 409 `conflict` (game folder larger than 40 GB; counting stops when the limit is exceeded).

Mapping: `name`, `minecraftVersion`, `loader` (`vanilla`, `fabric`, `quilt`, `forge`, `neoforge`; others are skipped and the reason is given), `loaderVersion`, `javaPath`, `jvmArgs`. Memory is not carried over because no source has verified the unit; the only exception is NoRisk, whose code specifies `memory` in MB (`memory.max`, at least 256). Groups, icons, playtime, modpack origin, and accounts are not carried over and are mentioned in `notes`.

Launchers and confidence: Prism Launcher, FTB App (verified); MultiMC (verified, paths from third-party importers); Modrinth App (documented, via SQLite only); Vanilla launcher (documented); ATLauncher, GDLauncher, CurseForge, NoRisk, HMCL (community or derived paths). SQLite launchers (Modrinth, NoRisk) need `sqlite3` in the PATH; if it is missing, the launcher is `unavailable` with the reason `sqlite3 is not installed`.

Copy: The game folder is copied recursively into the profile folder `<dataDir>/profiles/<id>`. Links are never followed; a link in the game folder is listed in `notCopied`, and a game folder that is itself a link makes the profile not importable. An entry that cannot be copied makes the item `partial`; an error before or during the copy makes it `failed`, and the profile that was created remains. Names: on collision "Name (2)", "Name (3)", etc.

Scan and reading: Launcher folders are never written to. SQLite databases are copied into a working folder under `<dataDir>/cache/imports/` and read there with `sqlite3 -readonly`, because a read access to a WAL database in the launcher folder can create `-wal` and `-shm` files. The size is counted per folder up to 50,000 entries (`sizeComplete: false` if it stops early). The scan only reads; paths of links are reported, not followed.

Deliberate limits: HMCL profiles are listed but not importable, because `versions/<id>/<id>.json` has not been read (a version folder only counts with `.hmcl`). For Modrinth, the link `instances.applied_content_set_id` to `instance_content_sets` is undocumented and assumed; `instance_launch_overrides` (Java, JVM arguments) is not read. For ATLauncher, GDLauncher, FTB, and CurseForge, loader names are only mapped for the four known loaders; all other values are skipped. Windows and macOS paths are only present to the extent the documentation lists them. Cancelling is possible between files; profiles already created remain.

Test option: `VOLT_IMPORT_HOME=<folder>` replaces the home directory and disables `APPDATA`, `XDG_DATA_HOME`, `PRISMLAUNCHER_DATA_DIR`, `THESEUS_CONFIG_DIR`. It only takes effect together with `--enable-test-routes`. Tests: `backend/tests/imports/run.sh` (builds the backend, creates the fixtures with `fixtures.py`, uses `check.py` to verify scan, rejections, copies, names, and checksums of the sources; then a second run without `sqlite3` in the PATH).


## Synced folders (`core/synced.nv`)

When a profile is created, you choose which folders and files are shared between profiles. The allowed folders are `shaderpacks`, `resourcepacks`, `saves`, `screenshots`, and `config`, and the allowed files are `options` (`options.txt`) and `servers` (`servers.dat`). Mods are not allowed, because they differ per version. The default is nothing; the automatically created profiles (`autoprofiles/create.nv`) get `["options", "servers"]`, while `POST /api/profiles` stays at nothing.

- `POST /api/profiles` accepts the optional field `"synced": ["saves"]` (array, no duplicates; empty or `null` means nothing is shared). Unknown key, duplicate entry, or not an array: 400 `bad_request`.
- It is stored as `synced` (array). Older profiles without the field read `[]`. `GET` returns it.
- Changing: `PATCH /api/profiles/:id` with `{"synced": ["saves", ...]}` sets the whole set (array, allowed keys, no duplicates; otherwise 400 `bad_request`, also for `null`). Together with `gameDirectory` in the same request: 400. The response is the profile with `syncReport`. If the profile's game is running, PATCH responds with 409 `conflict` ("stop the game before changing shared folders"); the launch module reports this via `markGameRunning(id, true|false)` in `core/synced.nv` (status: not yet wired up, see below). All checks (links that do not point to the shared folder: 409; a folder in place of a link on deactivation: 409) run before the first change.
- Enabling (key is new): `<dataDir>/synced/<key>/` is created if needed. If the entry `<folder>` is missing from the game folder, only the link is created. If it is a folder, it is merged: names the shared folder does not have are moved there (rename; if that fails, copy and only then delete the original). Names the shared folder already has are moved to `<gameDir>/.volt-sync-conflicts/<key>/` (with the suffix "name (2)" if already taken there); nothing is lost. Afterwards the empty folder is removed and the link is created. A link that already points to the shared folder stays unchanged. `syncReport`: `{"key": "saves", "action": "enable", "status": "ok", "moved": 1, "conflicts": 1}`.
- Disabling (key removed): the link is removed (never followed), an empty folder is created, and the contents of the shared folder are copied into it (copied, not moved). If copying fails for an entry (e.g. a link in the shared folder, which is not copied), the shared folder stays unchanged, the copy is removed, the link is restored, and the key stays active. The response is then 200 with `syncReport`: `{"key": "saves", "action": "disable", "status": "failed", "copied": 0, "failed": [{"name": "…", "reason": "…"}]}`. Without errors: `{"key": …, "action": "disable", "status": "ok", "copied": n}`.
- Errors: if a link or a move fails, PATCH responds with 500 `internal`. All steps of the request are recorded in a journal and undone in reverse order; whatever cannot be undone is named in the message (`could not undo`). The request is saved as a whole or not at all.
- Creating: the shared folder is `<dataDir>/synced/<key>/` (created if needed). In the new profile's game folder, the entry `<folder>` is created as a link to it: `ln -s` on Linux and macOS, a directory junction via `cmd /c mklink /J` on Windows (without admin rights). If the entry already exists (folder, file, or link), nothing is replaced: 409 `conflict` with "the folder <name> already exists in the new profile". If a link fails, creation responds with 500 `internal`; the profile is rolled back (links and profile folder are removed).
- Files (`options` → `options.txt`, `servers` → `servers.dat`): the shared entry is `<dataDir>/synced/options.txt` or `servers.dat` (with the game's name). Link: `ln -s` on Linux and macOS; on Windows a hard link via `cmd /c mklink /H <profile file> <shared file>` (without admin rights, only on the same drive). A hard link is removed with `del`, which deletes only that name; the file remains. Enabling: if the shared file is missing, the profile's file is moved there; if it is already there, the profile's file is moved to `<gameDir>/.volt-sync-conflicts/<name>` (not overwritten, with the suffix "(2)" if the name is taken). If the profile has no file and the shared one is missing, an empty one is created (`"createdEmpty": true`). `syncReport`: `{"key": "options", "action": "enable", "status": "ok", "moved": 1, "conflicts": 0, "createdEmpty": false}`. Disabling: the link is removed and the shared file is copied into the game folder (the profile keeps a copy, the shared one remains); `{"key": "options", "action": "disable", "status": "ok", "copied": 1}`. If the copy fails, it is undone as with folders (status `failed`). Creating: if the entry exists in the game folder, 409 with "the file options.txt already exists in the new profile". The 409 when the game is running, the journal, and the deletion rules apply unchanged.
- Deleting: only the profile's links are removed, in the managed folder and in the game folder (if changed via `PATCH`). On Linux, `removeAll` removes a link itself without following it. On Windows, a junction is removed with `cmd /c rmdir` before the profile folder is deleted, so that `removeAll` does not descend into the target. If a link remains, the profile folder is kept (warning in the log). The launcher never deletes shared content.
- Tests: `backend/tests/synced/run.sh` (link and target, shared files, deletion with content preserved, 400/409/500, PATCH enable with merging and conflicts, PATCH disable with copy, failed copy, undo after a failed link, restart, profile without the field; files: enable with move, second profile via the same link, disable with copy, conflict in `.volt-sync-conflicts`, empty file, failed copy, undo, creation with 409 and with both files; in the temporary data folder). `backend/tests/autoprofiles/run.sh` verifies that automatically created profiles have `["options", "servers"]` with links. Not tested: the 409 when the game is running (no runtime hook wired up), the junction and the hard link on Windows and macOS at runtime.

## Forge up to 1.12.2 (`launch/legacyforge.nv`)

Forge installers for Minecraft below 1.13 are not executed, because they do not know `--installClient` (their `SimpleInstaller` aborts with `UnrecognizedOptionException`). Instead, the launcher reads the installer JAR as a ZIP, as earlier launchers did: `install_profile.json` names the universal JAR in `install.filePath`, which is written to `libraries/<Maven path from install.path>` (atomically, skipped if the size is the same). `versionInfo` is written as `versions/<id>/<id>.json`. The `id` must match the profile's version ID, otherwise 500. The libraries are fetched by the normal step (`launchPlanLibraries`); there are no processors in these installers. If `install_profile.json` or the universal JAR is missing, the installation ends with 500 `internal` and the name of the installer. From 1.13 on, the headless run remains unchanged (`launchRunInstaller`).

Limit: An installer without `version.json` and without `install_profile.json` already fails during resolution (`versions.nv`, 422), before this step.

Tests: `backend/tests/launch/legacyforge-test.sh` (downloads the real 1.12.2-14.23.5.2847 installer, checks the SHA-1 of the universal JAR against the ZIP entry, the version JSON, and the branching, plus two error cases; needs network).
