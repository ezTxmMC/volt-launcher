# Feature Port: old Java UI → new app

Goal: All features of the old Java/Vue version run in the new version (Novus backend
in `backend/`, Electron/React in `app/`). Afterwards the Java code (`volt-*`) and `ui/` are removed.
The look and feel is already carried over from `ui/` into `app/` (see Restyle).

The endpoints of the old API (97 in total, `volt-server/…/routes/*.java`) are distributed here
across the work packages. The new API uses **profiles** instead of "instances" and the path style from
`docs/ARCHITECTURE.md`.

## Rules for all agents

1. **Only create/change your own directories.** A package owns:
   - Backend: `backend/src/<module>/` and `backend/tests/<module>/`
   - Frontend: `app/src/renderer/src/pages/<area>/` and `app/src/renderer/src/components/<area>/`
2. **Shared files only with `Edit`** (never overwrite with `Write`), and re-read them right before the edit:
   - `backend/src/server/router.nv` (one dispatch branch per module)
   - `backend/src/core/*.nv` (minimal additions only; change the core only when necessary)
   - `docs/ARCHITECTURE.md` (own section at the end with the new endpoints)
   - `app/src/shared/models.ts`, `app/src/renderer/src/lib/api.ts`, `app/src/App.tsx` (routes)
   - `app/src/renderer/src/i18n/de.ts` and `en.ts` (keys in your own namespace, e.g. `saves.worlds.title`)
3. **Build only into the scratch directory**, never into `backend/dist/`. Example:
   `novusc build backend/src/main.nv -o <scratch>/<paket>/volt-backend`.
4. **No git commands that change anything.** No deletions outside your own package.
5. **Verify, don't just claim.** Check every feature with real data (curl against your own
   binary, browser check with `pnpm dev:web`). `pnpm typecheck`, `pnpm lint`, `pnpm build` in `app/`
   must be green, and `backend/scripts/smoke.sh` must still pass 42/42.
6. **Novus pitfalls:** no `null` literal (`core.none()`/`core.isNull()`), no `${m["k"]}`,
   no exceptions (`core.fail`/`core.runTrapped`), never wrap error-raising calls in `sync`,
   `std/http` only through a shared lock (the temp-file counter is not thread-safe).
7. **Report format:** What is implemented (verified), what is missing, Novus bugs found with repro,
   shared files changed, endpoints with example requests.

## Work packages

### P1 Profile management
Java: `volt-server/.../InstanceRoutes.java`, `SettingsRoutes.java`, `volt-game/.../instance/*`.
Extend backend `backend/src/core/profiles.nv` (own module `profilemgmt/` if it fits).
- Groups, favorites, icon (upload), rename, duplicate
- Profile settings: memory, Java path, JVM args, wrapper, environment variables, hooks
  (before/after launch), custom game directory, fullscreen, "hide launcher on start"
- Verify and repair (`verify`), playtime (`totalPlaytimeMs`), launch status
- Loader versions (`GET loader-versions`), Minecraft versions (`GET versions`), platforms
Frontend: profile grid with groups, favorites, sorting, search; complete profile settings; verify button.

### P2 Game data (worlds, servers, screenshots, logs, backups)
Java: `WorldRoutes.java`, `LogRoutes.java`, `BackupRoutes.java`, `volt-game/.../world/*`,
`log/GameLogService.java`, `media/ScreenshotService.java`, `backup/InstanceBackupService.java`.
New module `backend/src/gamedata/`. Needs an NBT reader in Novus (for `servers.dat`
and `level.dat`), gzip via `std/zlib` or external `gzip`.
- Worlds: list with metadata, rename, duplicate, copy, delete
- Server list: list, add, remove, edit
- Screenshots: list, delete, open folder (pass the folder path to Electron)
- Logs: list, read, latest crash report, delete
- Backups: list, create, restore, delete (ZIP)
Frontend: panels for worlds, servers, screenshots, logs, backups in the profile.

### P3 Accounts, skins, sign-in
Java: `AuthRoutes.java`, `SkinRoutes.java`, `volt-auth/*` (MicrosoftAuth, SessionManager,
MinecraftAuthClient, XboxAuthClient, EncryptedAccountStore, SkinStore).
New module `backend/src/accounts/`. Encrypted account storage via `std/crypto`
(AES-GCM or comparable; one key per installation). Switch the launch placeholders (`launch/command.nv`,
`auth_*`) to the selected account; change only one small, named function.
- Sign-in (Microsoft/Xbox/Minecraft, callback via the local server), status, sign-out
- Accounts: list, select, remove
- Skins: list, upload (PNG), rename, delete, select/apply to the account
- Offline mode
Frontend: account menu, sign-in, skin library with preview.

### P4 System, settings, integrations
Java: `SettingsRoutes.java`, `WindowRoutes.java` (Electron takes over the window functions),
`volt-core/.../discord/*`, `volt-core/.../update/LauncherUpdateService.java`,
`volt-game/.../java/*` (find and install Java runtimes).
New module `backend/src/system/`.
- Settings: show/open directories, reset
- Discord Rich Presence (IPC via Unix socket or named pipe; possibly a C block)
- Launcher update: check, download, open release
- Java runtimes: list, install (Temurin) — reuse the logic from `launch/java.nv`
Frontend: settings sections (General, Appearance, Java/Memory, Advanced, Updates, Providers).

### P5 Content and modpacks
Java: `ContentRoutes.java`, `ProviderRoutes.java`, `volt-providers/.../content/*`,
`volt-providers/.../modrinth/*`, `curseforge/*`, `technic/*`, `ftb/*`.
Builds on `backend/src/mods/` and `backend/src/providers/` (extend the module, don't duplicate).
- Content by type (mods, resource packs, shaders, data packs): list, on/off, all on/off, delete
- Version switch per file, dependencies, updates, identification
- Modpack: info, versions, update; export (`.mrpack`, CurseForge ZIP); import (ZIP, mrpack, Technic ZIP)
Frontend: content tabs in the profile, modpack panel, export/import dialogs.

### P6 Discover and UI
Java: `volt-server/.../ProviderRoutes.java`, Vue components in `ui/src/components/discover/*`,
`ui/src/components/TaskCenter.vue`, `ui/src/components/tabs/HomeTab.vue`.
- Discover: sorting, categories, release-type badges, reset filters, quick add,
  dependency option on install
- Activity center (jobs), notifications, accent color, UI scaling, animations, home page

## Status

Status after integration: backend tests green (Smoke 42/42, Providers 36/36, Mods 62/62, Accounts 56/56, Profile 27/27, Content 47/47, launch edge-case test 0 failures), `app/` typecheck/lint/build green, Electron starts and launches the backend. Not verified: real Microsoft sign-in, real Discord presence, Temurin download, CurseForge paths, Windows.

| Package | Status |
| --- | --- |
| P1 Profile management | implemented, tests green (details in the package's section) |
| P2 Game data | implemented, tests green (details in the package's section) |
| P3 Accounts and skins | implemented, tests green (details in the package's section) |
| P4 System and settings | implemented, tests green (details in the package's section) |
| P5 Content and modpacks | implemented, tests green (details in the package's section) |
| P6 Discover and UI | implemented, tests green (details in the package's section) |
