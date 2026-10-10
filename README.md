# VoltLauncher

A modern Minecraft launcher: multiple accounts, every major mod loader, and content discovery
across Modrinth, CurseForge, Technic and FTB.

The launcher is a Java backend that exposes a local HTTP API on `127.0.0.1:45938`, driven by an
Electron + Vue front end.

## Modules

| Module | Contains |
| --- | --- |
| `volt-core` | Paths, HTTP, JSON, NBT, crypto, async utilities, tasks, updates, Discord IPC, launcher settings |
| `volt-auth` | Microsoft / Xbox Live / Minecraft authentication, encrypted account store |
| `volt-game` | Profiles, version resolution, mod loaders, asset installation, Java runtimes, launching, worlds, logs, backups |
| `volt-providers` | Modrinth, CurseForge, Technic and FTB clients, content and modpack installation |
| `volt-server` | The local HTTP API |
| `volt-app` | Executable entry point; boots the API and the Electron shell |
| `volt-setup` | Cross-platform installer that registers Start Menu / application entries |
| `ui/` | Vue 3 + Tailwind front end, packaged with Electron |
| `bridge/` | Express service holding the CurseForge API key (see below) |

Dependencies flow one way: `core → auth → game → providers → server → app`. `volt-game` knows
nothing about content providers, which is what keeps the graph acyclic.

## Building

```bash
mvn package                    # all modules; volt-app/target/volt-launcher.jar is runnable
mvn test                       # the test suite
./build.sh                     # full platform build (native image + Electron + packages)
```

`build.sh` delegates to `build-linux.sh`, `build-macos.sh` or `build-windows.bat`.

## Running in development

```bash
# 1. Front end
cd ui && pnpm install && pnpm dev

# 2. Backend
mvn -pl volt-app -am exec:java

# 3. CurseForge bridge (optional — only needed for CurseForge discovery)
cd bridge && npm install && cp .env.example .env   # paste your key, then:
npm start
```

## Content providers

Modrinth, Technic and FTB need no configuration. CurseForge needs the bridge described below.

Technic and FTB serve whole modpacks only, so the Discover tab collapses to that one kind while
either is selected. The two platforms distribute packs differently, and the launcher handles both:

* **FTB** publishes a release as a list of files with URLs and hashes, which the launcher
  downloads straight into the profile. Updates are exact.
* **Technic** either hosts builds on a *Solder* instance — a list of small archives applied in
  order — or ships one client zip. Solder frequently omits the Forge version even for packs that
  plainly need it, in which case the launcher installs the newest Forge build for that Minecraft
  version rather than silently producing a vanilla profile that ignores every mod.

## CurseForge

CurseForge's API requires a per-developer key, and their terms do not allow shipping it inside a
client that users can read it out of. The `bridge/` service holds the key and proxies requests, so
the launcher itself never sees it.

Get a key at <https://console.curseforge.com>, put it in `bridge/.env`, and start the bridge with
`npm start` — plain `node src/server.js` does not read `.env`. The bridge validates the key on
startup and says so. The
launcher points at `http://localhost:8787` by default; change it under **Settings → Content
providers**. Without a running bridge, Modrinth still works and CurseForge is shown as
unavailable with an explanation.

## Installing

```bash
java -jar volt-setup.jar                    # per-user install + application menu entry
java -jar volt-setup.jar --desktop-shortcut # also place a desktop shortcut
java -jar volt-setup.jar --help
```

The installer needs no administrator rights: it installs into `%LOCALAPPDATA%\Programs`,
`~/.local/share/volt-launcher` or `~/Applications` depending on the platform.

## Discord rich presence

Rich presence needs an application registered at <https://discord.com/developers/applications>,
because the application id is what decides the name and artwork Discord displays. Paste its id
under **Settings → General → Discord rich presence** and the feature switches itself on; until
then it says so rather than failing quietly. Upload an asset named `volt_logo` to that
application for the large icon.

The launcher talks to the desktop client over its local IPC socket, so no bot token or account
access is involved, and a Discord that is closed or restarted is simply reconnected to.

## Launcher updates

The Updates screen reads GitHub releases from the repository configured under
**Settings → Updates**, defaulting to `ezTxmMC/Volt-Launcher`. It downloads the installer for
your platform into `~/.voltlauncher/updates/` and leaves running it to you: replacing a running
launcher's own files is platform-specific, and a half-applied update leaves nothing that starts.

## Data layout

Everything lives under `~/.voltlauncher` (override with `VOLTLAUNCHER_HOME`):

```
config/settings.json     launcher preferences
auth/                    encrypted account store
instances/<slug>/game/   per-profile worlds, mods, configs
shared/                  assets, libraries, client jars and natives, shared across profiles
runtimes/temurin/        Java runtimes the launcher downloaded
cache/installers/        cached Forge/NeoForge installer JARs
backups/<slug>/          profile snapshots, kept outside the profile they protect
updates/                 downloaded launcher installers
logs/                    launcher and per-profile game logs
```

Assets and libraries are shared rather than copied per profile — a Minecraft version costs
roughly a gigabyte, and duplicating that for every profile added up quickly. Backups deliberately
live outside the instance directory: a snapshot that disappears along with the profile it was
protecting is no protection at all.

## A note on the local API

The API binds to loopback only, and rejects URLs that encode path separators or dot segments.
That last part is not cosmetic: a servlet container normalises a URI before routing it, so
`DELETE /api/instances/Foo/worlds/%2e%2e` would otherwise collapse onto the endpoint that deletes
the whole profile. See `PathGuard` in `volt-server`.
