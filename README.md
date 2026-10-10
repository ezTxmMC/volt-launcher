# VoltLauncher

A modern Minecraft launcher: multiple accounts, all common mod loaders, and content from Modrinth,
CurseForge, Technic and FTB.

The launcher consists of two parts that talk to each other over a local HTTP service. The architecture
and the API contract are described in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), and the state of the
feature set in [docs/FEATURE-PORT.md](docs/FEATURE-PORT.md).

| Part | Contents |
| --- | --- |
| `app/` | Electron app with React, TypeScript, react-router, Tailwind and Iconify. Starts the backend as a subprocess. |
| `backend/` | Backend written in [Novus](https://github.com/ezTxmMC/novus): profiles, mods, content, launch, accounts, game data, system. |
| `bridge/` | Node service that holds the CurseForge API key (see below). |
| `docs/` | Architecture, API contract, feature state. |

## Development

Requirements: Node with pnpm, and the Novus compiler `novusc` on the `PATH`.

```bash
# 1. Build the backend (creates backend/dist/volt-backend)
cd backend && scripts/build.sh && scripts/smoke.sh && cd ..

# 2. Start the app (it starts the backend itself)
cd app && pnpm install && pnpm dev

# UI in the browser with mock data, without a backend
cd app && pnpm dev:web
```

Tests for the individual modules are in `backend/tests/` (some need network access, see the script header).

## Packaging

One run builds all targets. The backend binaries are built beforehand for each target:

```bash
cd backend && scripts/build-release.sh     # all targets into backend/dist/<os>-<arch>/
cd app && pnpm package                     # all Linux, Windows and macOS targets into app/release/
cd app && node scripts/package.mjs win-x64 # a single target only
```

| Target | Formats | Built on |
| --- | --- | --- |
| `linux-x64`, `linux-arm64` | AppImage, deb, rpm, zip, tar.gz, flatpak | Linux (deb/rpm via Docker, see below) |
| `win-x64`, `win-arm64` | exe (NSIS), msi, zip | Linux with Wine, or Windows |
| `mac-arm64` | dmg, zip | macOS for the DMG (`app/scripts/package-mac.sh`); ZIP also on Linux |

Notes:
- **deb and rpm** need `dpkg-deb` and `rpmbuild`. On systems without these tools, the build runs in the
  container `electronuserland/builder` (start it with `docker run`, mounting the project and the Electron cache).
- **flatpak** needs `flatpak-builder` and the runtimes `org.freedesktop.Platform//24.08`,
  `org.freedesktop.Sdk//24.08` and `org.electronjs.Electron2.BaseApp//24.08` (per architecture).
- **macOS DMG** can only be created on macOS (`hdiutil`, `sips`). The builds are neither signed nor notarized.
- Checksums of all artifacts are in `app/release/SHA256SUMS.txt`.

## CurseForge

CurseForge requires a developer key, which does not belong in a client. The `bridge/` service
holds the key and forwards requests. Put the key in `bridge/.env` and start the service with `npm start`
in the `bridge/` folder. Default address: `http://localhost:8787` (can be changed in the settings).
Without the bridge, Modrinth, Technic and FTB remain fully usable, and CurseForge is shown as unavailable.

## Discord presence

This requires a Discord application ID, which is entered in the settings. Without it,
the launcher reports the status "not configured".

## Notes on the current state

The Java version (`volt-*`, `ui/`) has been replaced by this project. It is preserved in the Git history
at commit `03a34ad`.
