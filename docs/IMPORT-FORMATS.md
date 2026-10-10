# Import formats of other Minecraft launchers

Status: research notes for importing profiles into VoltLauncher. Nothing in this document is implemented yet.

Snapshot: the public repositories were read on 2026-10-10 at their default branch HEAD. Line numbers refer to those snapshots. GitHub links use `blob/HEAD`, so they point at the current default branch and may drift. The repositories are listed with their last push date so that stale ones are visible.

Method: source files were read with `gh api repos/<owner>/<repo>/contents/<path>` and decoded with base64. Documentation pages were read with WebFetch. No launcher was installed or run, and no executables were downloaded. Community projects were used only where the launcher itself is closed source.

## Confidence legend

- **Verified (source)**: the claim was read in the cited source file for that launcher.
- **Verified (cross-check)**: an independent open-source project reads the same format and the cited code agrees with the launcher source.
- **Documented**: stated in an official doc or a wiki page that was read. Wiki pages can be outdated.
- **Community**: observed in code from a third-party project, not from the launcher vendor.
- **Inferred**: a reasonable conclusion that was not read directly. Every inferred item is marked with the word "inferred".
- **Not found**: no usable public source was located.

## Launcher overview

| # | Launcher | Source status | Profile storage | Section |
|---|---|---|---|---|
| 1 | Prism Launcher | Open source, read | one folder per instance (`instance.cfg` + `mmc-pack.json`) | 1 |
| 2 | MultiMC 5 | Open source, read (`develop` branch) | same format as Prism | 2 |
| 3 | ATLauncher | Open source, read | one folder per instance (`instance.json`) | 3 |
| 4 | GDLauncher | Open source, archived repo, read | one folder per instance (`config.json`) | 4 |
| 5 | Modrinth App | Open source, read | SQLite (`app.db`), instance folders under `profiles/` | 5 |
| 6 | CurseForge app | Closed source | one folder per instance (`minecraftinstance.json`) | 6 |
| 7 | NoRisk Client launcher | Open source (GPL-3.0), read | SQLite (`app.db`) | 7 |
| 8 | FTB App | Open source (LGPL-2.1), read | one folder per instance (`instance.json`) | 8 |
| 9 | HMCL | Open source (GPL-3.0), partly read | `versions/<id>/` plus `.hmcl/config` | 9 |
| 10 | Vanilla Minecraft Launcher (Mojang) | Closed source, documented | `launcher_profiles.json` in `.minecraft` | 10 |
| - | Technic Launcher | No public launcher source found | - | 11 |
| - | Lunar, TLauncher, SKLauncher | Closed or not located | - | 11 |

Cross-check sources that read other launchers' formats (not profile formats of their own):

- PandoraLauncher (`Moulberry/PandoraLauncher`, pushed 2026-10-07, MIT): importers for Prism/MultiMC, CurseForge, Modrinth and ATLauncher in `crates/backend/src/launcher_import/`.
- NoRisk Client launcher (`NoRiskClient/noriskclient-launcher`): importers for Modrinth App, CurseForge app, Prism/MultiMC and ATLauncher in `src-tauri/src/integrations/launcher_import/`.
- Axolotl (`Mystic-Stars/Axolotl`): CurseForge instance importer in `packages/app-lib/src/api/pack/import/curseforge.rs`.
- Voxelum x-minecraft-launcher (`Voxelum/x-minecraft-launcher`): parsers in `packages/instance/parsers/`.

---

## 1. Prism Launcher

Repository: https://github.com/PrismLauncher/PrismLauncher (read at the default branch HEAD; push date and branch name were not checked).

### 1.1 Locations

The data directory is computed in `launcher/Application.cpp:396-426`:

1. Command line `--dir`, then the environment variable `PRISMLAUNCHER_DATA_DIR` (`<LAUNCHER_NAME upper-cased>_DATA_DIR`).
2. Otherwise `QStandardPaths::AppDataLocation` with `..` applied. The organisation and application names are both `PrismLauncher` (`launcher/Application.cpp:312-314`; `program_info/CMakeLists.txt:11`). Applied to the Qt paths, this gives:
   - Windows: `%APPDATA%\PrismLauncher`
   - Linux: `~/.local/share/PrismLauncher`
   - macOS: `~/Library/Application Support/PrismLauncher`. Inferred: the macOS parent rule was not checked in code.
3. Snap: `$SNAP_USER_COMMON` (`launcher/Application.cpp:412-413`).
4. Portable mode: `UserData/` or `portable.txt` next to the executable (not on macOS, `launcher/Application.cpp:419-426`).

The instances folder is `InstanceDir`, default `instances` (`launcher/Application.cpp:705`), relative to the data directory. Discovery is in `launcher/InstanceList.cpp:476-520`: every subfolder of the instance root that contains `instance.cfg` is an instance. The instance ID is the folder name.

NoRisk's importer uses the same candidates: `%APPDATA%`/`dirs::data_dir()/PrismLauncher`, Flatpak `~/.var/app/org.prismlauncher.PrismLauncher/data/PrismLauncher`, and `~/.local/share/PrismLauncher` (`src-tauri/src/integrations/launcher_import/adapters/mmc.rs:51-67`). This agrees with the code above.

### 1.2 Profile file

- Path: `<data>/instances/<id>/instance.cfg`
- Format: INI (Qt settings, `key=value`), read by `INISettingsObject` (`launcher/InstanceList.cpp:706`).
- Component list: `<data>/instances/<id>/mmc-pack.json` (JSON, `formatVersion` plus `components`), `launcher/minecraft/PackProfile.cpp:274`.
- Groups: `<data>/instgroups.json` (JSON). The file is written to `QDir::current()`, which is the data directory (`launcher/InstanceList.cpp:756,803`). A legacy location in the instances root is still read (`launcher/InstanceList.cpp:813`). Format: `formatVersion`, `groups` (map of group name to `{hidden, instances[]}`), and an optional `ungrouped` object (`launcher/InstanceList.cpp:770-790`).

Keys in `instance.cfg` (names as registered in code):

| Field | Key | Where | Note |
|---|---|---|---|
| Display name | `name` | `launcher/BaseInstance.cpp:75` | default "Unnamed Instance" |
| Icon | `iconKey` | `launcher/BaseInstance.cpp:76` | name of an icon in the `icons` folder (`IconsDir`, `Application.cpp:709`); an `icon.png` is also written into the game root (`launcher/minecraft/MinecraftInstance.cpp:1162`) |
| Notes | `notes` | `BaseInstance.cpp:77` | |
| Last launch | `lastLaunchTime` | `BaseInstance.cpp:79` | unit not verified; inferred milliseconds |
| Play time | `totalTimePlayed` | `BaseInstance.cpp:80`, `:308-310` | seconds (the code adds `secondsPlayed`) |
| Last played session | `lastTimePlayed` | `BaseInstance.cpp:84` | seconds |
| Minecraft version | `net.minecraft` component `version` in `mmc-pack.json` | `launcher/minecraft/PackProfile.cpp:110-112, 142-144` | |
| Loader | component `uid` in `mmc-pack.json` | `launcher/minecraft/Component.cpp:53-56` | see UID table below |
| Loader version | component `version` for the loader UID | same | |
| Java path | `JavaPath` | `launcher/minecraft/MinecraftInstance.cpp:189-197`, `launcher/BaseInstance.cpp:204` | instance value applies only when `OverrideJavaLocation=true` |
| JVM arguments | `JvmArgs` | `launcher/BaseInstance.cpp:493`, `MinecraftInstance.cpp:190-197` | instance value applies only when `OverrideJavaArgs=true` |
| Min/max memory (MB) | `MinMemAlloc`, `MaxMemAlloc` | `MinecraftInstance.cpp:214-216`, `:640-641` | applies only when `OverrideMemory=true`; unit inferred as MB |
| Game directory | derived | `launcher/minecraft/MinecraftInstance.cpp:370-383` | `<instance>/minecraft` if present, else `<instance>/.minecraft` |
| Group | not in `instance.cfg` | `instgroups.json` | |
| Favourite | none found | | |
| Mods | `<game root>/mods` | `MinecraftInstance.cpp:414` | |
| Resource packs | `<game root>/resourcepacks` | `MinecraftInstance.cpp:444` | |
| Texture packs | `<game root>/texturepacks` | `MinecraftInstance.cpp:449` | |
| Shader packs | `<game root>/shaderpacks` | `MinecraftInstance.cpp:454` | |
| Saves | `<game root>/saves` | `MinecraftInstance.cpp:469` | |
| Config | `<game root>/config` | `MinecraftInstance.cpp:459` | |
| Screenshots | not checked | | inferred: `<game root>/screenshots` |
| Modpack link | `ManagedPack`, `ManagedPackType`, `ManagedPackID`, `ManagedPackVersionID`, etc. | `launcher/BaseInstance.cpp:127-133` | |

Loader component UIDs (`launcher/minecraft/Component.cpp:53-56`):

- `net.minecraft`: Minecraft (`PackProfile.cpp:87`, `:420`).
- `net.minecraftforge`: Forge.
- `net.neoforged`: NeoForge.
- `net.fabricmc.fabric-loader`: Fabric.
- `org.quiltmc.quilt-loader`: Quilt.
- `com.mumfrey.liteloader`: LiteLoader.

A profile with no loader UID is vanilla.

### 1.3 Mod records

Mods are jar files in `<game root>/mods`. Prism also keeps packwiz-style metadata in `<game root>/mods/.index/<slug>.pw.toml` (`launcher/modplatform/packwiz/Packwiz.cpp:68-71, 173-239, 279-365`; `launcher/minecraft/mod/tasks/LocalResourceUpdateTask.cpp:35`). Each file contains:

- `name`, `filename`, `side`
- `[download]`: `mode` (for example `metadata:curseforge`), `hash-format`, `hash`
- `[update.modrinth]`: `mod-id`, `version`, or `[update.curseforge]`: `file-id`, `project-id`

Hash types: Modrinth `sha512` or `sha1`; CurseForge `sha1`, `md5` or `murmur2` (`launcher/modplatform/ModIndex.cpp:69-76`).

Mods that have no `.index` record are only jar files.

### 1.4 Sources

- https://github.com/PrismLauncher/PrismLauncher/blob/HEAD/launcher/Application.cpp (lines 312-314, 396-426, 705, 709)
- https://github.com/PrismLauncher/PrismLauncher/blob/HEAD/launcher/InstanceList.cpp (lines 479-520, 706, 756, 770-813)
- https://github.com/PrismLauncher/PrismLauncher/blob/HEAD/launcher/BaseInstance.cpp (lines 75-135, 204, 308-310, 493)
- https://github.com/PrismLauncher/PrismLauncher/blob/HEAD/launcher/minecraft/MinecraftInstance.cpp (lines 189-216, 370-474, 640-641, 1162)
- https://github.com/PrismLauncher/PrismLauncher/blob/HEAD/launcher/minecraft/PackProfile.cpp (lines 110-112, 142-144, 274)
- https://github.com/PrismLauncher/PrismLauncher/blob/HEAD/launcher/minecraft/Component.cpp (lines 53-56)
- https://github.com/PrismLauncher/PrismLauncher/blob/HEAD/launcher/modplatform/packwiz/Packwiz.cpp
- https://github.com/PrismLauncher/PrismLauncher/blob/HEAD/launcher/modplatform/ModIndex.cpp (lines 69-83)
- Cross-check: https://github.com/NoRiskClient/noriskclient-launcher/blob/v3/src-tauri/src/integrations/launcher_import/adapters/mmc.rs (lines 51-67, 91-110, 145-150, 193-246)

### 1.5 Confidence

- Verified (source): data path logic, `instance.cfg` keys, `mmc-pack.json`, UID map, groups file, mod index.
- Verified (cross-check): the same instance and pack keys, and the default roots, in NoRisk's importer.
- Inferred: macOS and Windows concrete paths (the code derives them from Qt's `AppDataLocation`; the Qt rule was not read), the unit of `lastLaunchTime`, the unit of `MinMemAlloc`/`MaxMemAlloc`, and the screenshots folder.

---

## 2. MultiMC 5

Repository: https://github.com/MultiMC/Launcher (default branch `develop`, pushed 2026-09-26, not archived). The format is the same as Prism's, because Prism forked from MultiMC. Differences are listed below.

### 2.1 Locations

MultiMC's data directory logic is different from Prism's (`launcher/Application.cpp:315-325`):

1. Command line `--dir`.
2. Otherwise the directory that contains the executable (`applicationDirPath()`), which makes the install a portable folder. On macOS, `applicationDirPath()/../../Data` (`Application.cpp:317-321`).

Because of this, the default MultiMC data location is next to the binary or the `.app` bundle. NoRisk's importer lists the typical locations (`mmc.rs:69-81`): `%APPDATA%/multimc`, `%APPDATA%/MultiMC`, `~/MultiMC`, `~/Desktop/MultiMC`, `~/Downloads/MultiMC`, `~/Applications/MultiMC.app/Data`, `/Applications/MultiMC.app/Data`.

The launcher name is `MultiMC` (`CMakeLists.txt:126`). The configuration file is `MultiMC.cfg` (detected by Pandora: `crates/backend/src/launcher_import/mod.rs:21`).

The instances folder is `InstanceDir`, default `instances` (`launcher/Application.cpp:689`).

### 2.2 Profile file

- `<data>/instances/<id>/instance.cfg` (INI), read at `launcher/InstanceList.cpp:545`.
- `<data>/instances/<id>/mmc-pack.json`, `launcher/minecraft/PackProfile.cpp:251`.
- Groups: `<instances>/instgroups.json`, `launcher/InstanceList.cpp:577,637`.
- Keys in `instance.cfg`: `name`, `iconKey`, `notes`, `lastLaunchTime`, `totalTimePlayed`, `lastTimePlayed`, `ManagedPack*` (`launcher/BaseInstance.cpp:37-66`). Java and memory keys follow the same override pattern as Prism (the file was not read line by line, so confirm before use).
- Game directory: `<instance>/minecraft` if present, otherwise `<instance>/.minecraft` (`launcher/minecraft/MinecraftInstance.cpp:175-183`).
- Loader support: the `develop` snapshot contains the `net.minecraft` UID and `net.minecraftforge` (`PackProfile.cpp:559`, `MinecraftInstance.cpp:141`). No Fabric, Quilt or NeoForge UID handling was found in `launcher/minecraft/` in this snapshot. Inferred: the older MultiMC line predates Fabric support.

### 2.3 Mod records

Only jar files in `<game root>/mods` (`mod` index files were not found in this snapshot).

### 2.4 Sources

- https://github.com/MultiMC/Launcher/blob/HEAD/launcher/Application.cpp (lines 315-325, 689)
- https://github.com/MultiMC/Launcher/blob/HEAD/launcher/InstanceList.cpp (lines 336, 545, 577, 637)
- https://github.com/MultiMC/Launcher/blob/HEAD/launcher/BaseInstance.cpp (lines 37-66)
- https://github.com/MultiMC/Launcher/blob/HEAD/launcher/minecraft/MinecraftInstance.cpp (lines 141, 175-183)
- https://github.com/MultiMC/Launcher/blob/HEAD/launcher/minecraft/PackProfile.cpp (lines 127, 251, 559)
- https://github.com/MultiMC/Launcher/blob/HEAD/CMakeLists.txt (lines 126-132)

### 2.5 Confidence

- Verified (source): data path logic, instance folder, `instance.cfg` and `mmc-pack.json` file names, groups file, game root logic, loader UIDs present.
- Verified (cross-check): MultiMC candidate roots and the `MultiMC.cfg` marker in NoRisk's and Pandora's importers.
- Inferred: that the Java, memory and JVM override keys are identical to Prism's.

---

## 3. ATLauncher

Repository: https://github.com/ATLauncher/ATLauncher (default branch `master`, pushed 2026-09-19, not archived).

### 3.1 Locations

The base directory is resolved in `src/main/java/com/atlauncher/FileSystem.java:265-283` (`getCoreGracefully`):

1. `--working-dir` (`src/main/java/com/atlauncher/App.java:1143-1144`) sets `App.workingDir`.
2. Otherwise on Linux: the directory that contains the ATLauncher jar.
3. Otherwise on Windows and macOS: `user.dir` (the working directory of the process).

`OS.storagePath()` (`src/main/java/com/atlauncher/utils/OS.java:121-135`) would give `%APPDATA%/.atlauncher`, `~/Library/Application Support/.atlauncher` and `~/.atlauncher`, but it has no callers in this repository snapshot. The default location therefore depends on how the launcher is started. NoRisk's importer probes `dirs::data_dir()/ATLauncher`, `~/.local/share/ATLauncher` and `~/ATLauncher` (`atlauncher.rs:199-209`). These are NoRisk's candidates, not ATLauncher's code, so treat them as guesses.

The instances folder is `FileSystem.INSTANCES = BASE_DIR/instances` (`FileSystem.java:67`). Launcher settings are `configs/ATLauncher.json` (`FileSystem.java:48,73`; `Constants.LAUNCHER_NAME = "ATLauncher"`, `constants/Constants.java:57`). Pandora detects an ATLauncher root by `configs/ATLauncher.json` (`mod.rs:57`).

### 3.2 Profile file

- Path: `<base>/instances/<folder>/instance.json`.
- Format: JSON (Gson). `InstanceManager.java:80-91` reads it. The folder name is used as the instance name only if `launcher.name` is empty (inferred from NoRisk's reader, `atlauncher.rs:225-233`).

Top-level object `Instance extends MinecraftVersion` (`src/main/java/com/atlauncher/data/Instance.java:182-197`):

- `uuid`, `inheritsFrom`, `launcher` (the settings object below), plus the Minecraft version fields (`id` is the Minecraft version, `data/minecraft/MinecraftVersion.java:26`).

Field `launcher` is an `InstanceLauncher` (`src/main/java/com/atlauncher/data/InstanceLauncher.java`):

| Field | Line | Meaning |
|---|---|---|
| `name` | 42 | display name |
| `pack`, `packId`, `externalPackId` | 43-48 | modpack source |
| `version` | 50 | pack version |
| `loaderVersion` (object) | 59 | `LoaderVersion`: `version`, `rawVersion`, `recommended`, `type` (`data/minecraft/loaders/LoaderVersion.java:27-33`) |
| `requiredMemory`, `requiredPermGen` | 61-62 | minimum memory |
| `maximumMemory`, `permGen` | 64-65 | maximum memory; default 4096 in settings (`data/Settings.java:104`). Unit inferred as MB |
| `javaPath` | 66 | Java executable; `null` falls back to global settings (`Instance.java:2696`) |
| `javaArguments` | 67 | JVM arguments |
| `javaRuntimeOverride`, `useJavaProvidedByMinecraft` | 68, 71 | bundled runtime choice |
| `account` | 69 | account identifier |
| `quickPlay` | 70 | quick play settings |
| `mods` | 103 | list of `DisableableMod` (see 3.3) |
| `ignoredUpdates`, `ignoreAllUpdates` | 104-105 | update state |
| `lastPlayed` | 108 | `Instant` |
| `numPlays` | 109 | count |
| `curseForgeManifest`, `curseForgeProject`, `curseForgeFile`, `modrinthProject`, `modrinthVersion`, `modrinthManifest`, `ftbPackManifest`, `technicModpack`, `multiMCManifest` | 85-98 | origin data for modpacks |

Other fields:

- Icon: `instance.png` in the instance root (`Instance.java:290,296,1482,2408`).
- Game directory: the instance root itself. `getRootDirectory()` returns `getRoot()` (`Instance.java:2011-2013`).
- Mods: `<root>/mods` (`Instance.java:2773`). Also scanned: `resourcepacks`, `shaderpacks` (`Instance.java:2775-2776`).
- Saves: `<root>/saves` (`Instance.java:2757`).
- Config, screenshots: not checked. Inferred: `<root>/config` and `<root>/screenshots`.
- Group: none found in `Instance.java` or `InstanceLauncher.java`.
- Favourite: none found.
- Play time: `lastPlayed`, `numPlays`. Total play time: `addTimePlayed` (`Instance.java:1178`); field not located.

### 3.3 Mod records

`DisableableMod` (`src/main/java/com/atlauncher/data/DisableableMod.java:61-89`):

- `name`, `version`, `file`, `path`, `type`, `disabled`, `userAdded`, `wasSelected`, `skipped`, `optional`, `colour`, `description`.
- `curseForgeProjectId`, `curseForgeFileId`, `curseForgeProject`, `curseForgeFile`, `modrinthProject`, `modrinthVersion`.

No hash is stored at the top level of `DisableableMod`. Hashes may exist inside the nested CurseForge or Modrinth file objects, which were not read.

### 3.4 Sources

- https://github.com/ATLauncher/ATLauncher/blob/HEAD/src/main/java/com/atlauncher/FileSystem.java (lines 35-74, 265-283)
- https://github.com/ATLauncher/ATLauncher/blob/HEAD/src/main/java/com/atlauncher/App.java (lines 183, 1143-1144)
- https://github.com/ATLauncher/ATLauncher/blob/HEAD/src/main/java/com/atlauncher/utils/OS.java (lines 121-135)
- https://github.com/ATLauncher/ATLauncher/blob/HEAD/src/main/java/com/atlauncher/managers/InstanceManager.java (lines 80-91)
- https://github.com/ATLauncher/ATLauncher/blob/HEAD/src/main/java/com/atlauncher/data/Instance.java (lines 182-199, 290-296, 2011-2035, 2696-2735, 2757, 2773-2776)
- https://github.com/ATLauncher/ATLauncher/blob/HEAD/src/main/java/com/atlauncher/data/InstanceLauncher.java (lines 41-116)
- https://github.com/ATLauncher/ATLauncher/blob/HEAD/src/main/java/com/atlauncher/data/DisableableMod.java (lines 61-89)
- https://github.com/ATLauncher/ATLauncher/blob/HEAD/src/main/java/com/atlauncher/data/Settings.java (lines 53-111)
- Cross-check: https://github.com/NoRiskClient/noriskclient-launcher/blob/v3/src-tauri/src/integrations/launcher_import/adapters/atlauncher.rs (lines 199-237)
- Cross-check: https://github.com/Moulberry/PandoraLauncher/blob/HEAD/crates/backend/src/launcher_import/mod.rs

### 3.5 Confidence

- Verified (source): profile file, instance root, `launcher` keys, mod list fields, icon, mods/saves/resourcepacks/shaderpacks folders.
- Verified (cross-check): `configs/ATLauncher.json` marker and `instances/*/instance.json` layout in Pandora and NoRisk.
- Inferred: units of memory fields (MB); the default base directory on Windows and macOS (depends on how the process starts, see 3.1).

---

## 4. GDLauncher

Repository: https://github.com/gorilla-devs/GDLauncher. The repository is archived (`archived: true`, last push 2026-08-21). It is the Electron codebase; later versions were not checked. The format below is what that repository writes.

### 4.1 Locations

Electron's `userData` is set to `path.join(app.getPath('appData'), 'gdlauncher_next')` (`public/electron.js:171-177`). Electron's `appData` is `%APPDATA%` on Windows, `~/Library/Application Support` on macOS and `~/.config` on Linux (Electron convention, inferred: the Electron API documentation was not read). So the launcher data directories are:

- Windows: `%APPDATA%\gdlauncher_next`
- Linux: `~/.config/gdlauncher_next` (inferred)
- macOS: `~/Library/Application Support/gdlauncher_next` (inferred)

Portable Windows builds use `<exe dir>/data` (`public/electron.js:200`). An `override.data` file in `userData` redirects `userData` (`electron.js:203-209`).

The instances folder is `userData/instances` (`src/common/utils/selectors.js:84-86`). Launcher config is `userData/config.json` (`electron.js:215`; the `settings.java.args` key is read there at line 224).

### 4.2 Profile file

- Path: `<userData>/instances/<instance name>/config.json` (`src/app/desktop/utils/getInstances.js:8-104`).
- Format: JSON, pretty-written by `actions.js` (`src/common/reducers/actions.js:1005-1078`).
- The instance name is the folder name. `getInstances` returns `{...config, name: instance}` (`getInstances.js`).
- An old format stored `modloader` as an array `[loaderType, mcVersion, loaderVersion, projectID, fileID, source]`. The reader converts it to the `loader` object (`getInstances.js`, branch `Array.isArray(config.modloader)`).

Keys written in `config.json`:

| Field | Where | Meaning |
|---|---|---|
| `loader` | `actions.js:1101-1119` (`addToQueue`), `:1173-1183` | `{loaderType, mcVersion, loaderVersion, projectID, fileID, source, sourceName}` |
| `timePlayed` | `actions.js:1142`, `:2957-2958` | play time; incremented by 1 per tick; unit not verified |
| `lastPlayed` | `actions.js:2965-2966` | `Date.now()` (milliseconds) |
| `background` | `actions.js:1119` | background or icon image |
| `javaArgs` | `actions.js:2583`, `:2864` | JVM arguments; fallback to global `settings.java.args` |
| `javaMemory` | `actions.js:2584`, `:2865` | memory; fallback to global `settings.java.memory`. Unit not verified (inferred MB) |
| `customJavaPath` | `actions.js:2584` | Java executable |
| `resolution` | `actions.js:2586` | `{width, height}` or the global Minecraft resolution |
| `mods` | `actions.js:3100-3125` | list of mod records (see 4.3) |
| `overrides` | `actions.js:1725-1727` | modpack overrides list |
| Game directory | `actions.js:2041-2044`, `:3066`, `:3229` | the instance folder itself; `mods/` is directly inside it |
| Mod folder | `actions.js:1615` | `mods` or `resourcepacks` |
| Icon | not a file in the instance | `background` value |
| Group | none found | |
| Favourite | none found in `actions.js` (whole repository not searched) | |
| Saves, config, screenshots | not checked | |

Default memory is 4096 (`src/app/desktop/utils/constants.js`, `DEFAULT_MEMORY`).

### 4.3 Mod records

Each entry in `mods` is the normalised CurseForge file object (`src/app/desktop/utils/index.js:914-926`, `normalizeModData`): `projectID`, `fileID`, `fileName`, `name`, and when present `packageFingerprint` (CurseForge fingerprint). The jar sits at `<instance>/mods/<fileName>` (`actions.js:3066`).

### 4.4 Sources

- https://github.com/gorilla-devs/GDLauncher/blob/HEAD/src/app/desktop/utils/getInstances.js
- https://github.com/gorilla-devs/GDLauncher/blob/HEAD/public/electron.js (lines 171-215, 224)
- https://github.com/gorilla-devs/GDLauncher/blob/HEAD/src/common/utils/selectors.js (lines 84-86)
- https://github.com/gorilla-devs/GDLauncher/blob/HEAD/src/common/reducers/actions.js (lines 1005-1078, 1096-1150, 1173-1183, 1615, 2041-2044, 2583-2586, 2864-2865, 2957-2966, 3066, 3100-3125, 3229)
- https://github.com/gorilla-devs/GDLauncher/blob/HEAD/src/app/desktop/utils/index.js (lines 914-926)

### 4.5 Confidence

- Verified (source): instance folder, `config.json` name and location, `loader` object, `javaArgs`, `javaMemory`, `customJavaPath`, `mods` records, `lastPlayed` (ms), game directory is the instance folder.
- Inferred: `userData` on Linux and macOS (Electron convention), units of `javaMemory` and `timePlayed`.
- Note: the repository is archived. Users of the later GDLauncher versions may have a different layout that was not checked.

---

## 5. Modrinth App

Repository: https://github.com/modrinth/code (default branch `main`, pushed 2026-10-10). The launcher library is `packages/app-lib`.

### 5.1 Locations

Settings directory (`packages/app-lib/src/state/dirs.rs:35-37`): `THESEUS_CONFIG_DIR` if set, otherwise `dirs::data_dir()` joined with the app identifier `ModrinthApp` (`apps/app/tauri.conf.json`, productName "Modrinth App", identifier "ModrinthApp").

`dirs::data_dir()` (`dirs` crate, documented at docs.rs, read on 2026-10-10):

- Windows: `{FOLDERID_RoamingAppData}`, so `%APPDATA%\ModrinthApp`
- Linux: `$XDG_DATA_HOME` or `~/.local/share`, so `~/.local/share/ModrinthApp`
- macOS: `~/Library/Application Support/ModrinthApp`

The database is `<settings>/app.db` (`packages/app-lib/src/state/db.rs:19`).

The config directory (`config_dir`) defaults to the settings directory and can be changed by a setting (`dirs.rs:20,57-58`). Instances live in `<config_dir>/profiles` (`dirs.rs:12,169-171`; `INSTANCES_FOLDER_NAME = "profiles"`).

Legacy converter: before the SQLite format, the data was at `dirs::config_dir()/com.modrinth.theseus` (`packages/app-lib/src/state/legacy_converter.rs:698-700`), with per-instance `profiles/<path>/profile.json` (`legacy_converter.rs:172-199`).

NoRisk's importer reads the current database with `profiles` folder and `app.db` (`modrinth_app.rs:14-15`, candidates at `220-237`), and falls back to the legacy profile table when the current schema is missing.

### 5.2 Profile file

Storage is SQLite (`app.db`). Relevant tables, created in `packages/app-lib/migrations/`:

- `instances` (`20260611120000_instances-content-foundation.sql:1-26`): `id`, `path` (folder under `profiles/`, unique), `applied_content_set_id`, `install_stage`, `launcher_feature_version`, `update_channel`, `name`, `icon_path`, `created`, `modified`, `last_played`, `submitted_time_played`, `recent_time_played`.
- `instance_content_sets` (`:80-101`): `game_version`, `protocol_version`, `loader`, `loader_version`, `source_kind`, `status`. This is where the Minecraft version and loader are stored.
- `instance_launch_overrides` (`:72-78`): one row per instance, `overrides` JSON. Keys written by the migration (`:336-380`): `java_path`, `extra_launch_args`, `custom_env_vars`, `memory.maximum`, `force_fullscreen`, `game_resolution`, `hooks` (`pre_launch`, `wrapper`, `post_exit`).
- `instance_groups` (`:62-70`): `instance_id`, `group_name` (one row per group).
- `instance_links` (`:28-47`, columns in later migrations): links to Modrinth modpacks and servers.
- `instance_files` (`:138-160`) and `instance_content_entries` (`:162-200`): content files and their Modrinth IDs (see 5.3).
- `settings` (`20240711194701_init.sql:1-41`): global defaults, including `mc_memory_max` (default 2048 in the first migration; later migrations may have changed it), `extra_launch_args`, `custom_env_vars`, `custom_dir`, `mc_game_resolution_x/y`, `hook_pre_launch`, `hook_wrapper`, `hook_post_exit`.
- Icon editor tables `instance_icon_configs` and `recent_instance_icon_configs` (`20260805120000_instance-icon-editor.sql`): not read.

The `instances` table is the profile. The old `profiles` table (`init.sql:101-145`) was copied into `instances` and dropped in later migrations. Old `profile.json` is covered in 5.1.

Instance struct (`packages/app-lib/src/state/instances/model/instance.rs:84-99`): `id`, `path`, `name`, `icon_path`, `created`, `modified`, `last_played`, `submitted_time_played`, `recent_time_played`, `install_stage`, `update_channel`.

Other fields:

- Game directory: `<config_dir>/profiles/<path>` (`dirs.rs:169-171`). The folder is the instance root; mods are in `mods/` under it.
- Path naming: `sanitize_instance_name(name)`, with ` (n)` appended on collision (`packages/app-lib/src/state/instances/commands/create_instance.rs:156-170`).
- Favourite: none found in `packages/app-lib`.
- Group: `instance_groups`.
- Play time: `submitted_time_played`, `recent_time_played` (unit not verified).
- Last played: `last_played` (unit not verified).
- Memory: `overrides.memory.maximum` if set, otherwise `settings.mc_memory_max`.
- JVM arguments: `overrides.extra_launch_args` if set, otherwise `settings.extra_launch_args` (array of strings).
- Java path: `overrides.java_path`.
- Loader and versions: `instance_content_sets.loader`, `game_version`, `loader_version`.
- Screenshots: a `screenshots` table and groups exist (`20260819130000_screenshot-groups.sql`); the folder was not checked.

### 5.3 Mod records

The content table records each managed file (`packages/app-lib/src/state/content_store/domain/paths.rs:51-68`): `mods/*.jar`, `resourcepacks/*.zip|jar`, `shaderpacks/*.zip|jar`, `datapacks/*.zip|jar`.

- `instance_files`: `relative_path`, `file_name`, `enabled`, `sha1`, `size`, `missing`.
- `instance_content_entries`: `project_type`, `project_id`, `version_id`, `source_kind`, `file_id`, `enabled`, `client_requirement`, `server_requirement`.

Disabled mods have a `.disabled` suffix on the file name (`paths.rs:99-101`; `sync_content_files.rs:74`).

NoRisk's importer reads exactly these two tables for `mods/%` rows (`modrinth_app.rs:22-45`, `FILES_QUERY`), which confirms the column names.

### 5.4 Sources

- https://github.com/modrinth/code/blob/HEAD/packages/app-lib/src/state/dirs.rs (lines 12-37, 169-171)
- https://github.com/modrinth/code/blob/HEAD/packages/app-lib/src/state/db.rs (line 19)
- https://github.com/modrinth/code/blob/HEAD/packages/app-lib/src/state/legacy_converter.rs (lines 172-199, 698-700, 795-815)
- https://github.com/modrinth/code/blob/HEAD/packages/app-lib/src/state/instances/model/instance.rs (lines 84-99)
- https://github.com/modrinth/code/blob/HEAD/packages/app-lib/src/state/instances/commands/create_instance.rs (lines 156-170)
- https://github.com/modrinth/code/blob/HEAD/packages/app-lib/src/state/content_store/domain/paths.rs (lines 51-68, 95-101)
- https://github.com/modrinth/code/blob/HEAD/packages/app-lib/migrations/20240711194701_init.sql
- https://github.com/modrinth/code/blob/HEAD/packages/app-lib/migrations/20260611120000_instances-content-foundation.sql
- https://github.com/modrinth/code/blob/HEAD/packages/app-lib/migrations/20260619120000_finish-instance-profile-migration.sql
- https://github.com/modrinth/code/blob/HEAD/apps/app/tauri.conf.json (lines 58, 61)
- Documentation: https://docs.rs/dirs/latest/dirs/fn.data_dir.html
- Cross-check: https://github.com/NoRiskClient/noriskclient-launcher/blob/v3/src-tauri/src/integrations/launcher_import/adapters/modrinth_app.rs (lines 14-45, 220-237)

### 5.5 Confidence

- Verified (source): database file, instance table and content tables, overrides JSON keys, folder under `profiles/`, mod paths, legacy `profile.json`.
- Verified (cross-check): NoRisk's reader uses the same SQL against the same tables.
- Documented: `dirs::data_dir()` per OS.
- Inferred: the units of `last_played`, `submitted_time_played` and `recent_time_played`.

---

## 6. CurseForge app (Overwolf)

The CurseForge app is closed source. Everything below is from community code that reads the instance folder, not from CurseForge. Confidence is "Community" throughout.

### 6.1 Locations

Community code and the NoRisk importer use:

- `~/curseforge/minecraft` (NoRisk: `curseforge_app.rs:191-198`, plus `Documents/curseforge/minecraft`).
- Instances in `<root>/Instances` or `<root>/instances` (NoRisk: `curseforge_app.rs:202-205`, `first_existing`).
- A community script uses `Path.home() / "curseforge/minecraft/Instances/<name>/"` (Fabulously Optimized `CLI tools/CurseForge to MultiMC-Git.py:14`) and `~/curseforge/Instances/<name>` in another branch (line 11).
- Griefed's ServerPackCreator README describes a CurseForge (Overwolf) instance as the folder that holds `minecraftinstance.json` (`README.md:284`), and gives a Linux example `~/CurseForge/Instances/...` (line 240).

Windows and Linux paths are consistent across these sources. The macOS path was not found.

### 6.2 Profile file

- Path: `<instance folder>/minecraftinstance.json` (JSON).
- The instance folder is the game directory. Pandora copies its contents into `<pandora instance>/.minecraft` (`crates/backend/src/launcher_import/curseforge.rs`, `copy_content_recursive` call), and the community script reads `mods/`, `config/` and `resourcepacks/` directly from the instance folder.

Keys read by the community importers:

| Key | Source | Meaning |
|---|---|---|
| `name` | Axolotl `curseforge.rs`, NoRisk `curseforge_app.rs`, Voxelum `curseforge_parser.ts:9-31` | display name |
| `gameVersion` | Pandora, NoRisk, Voxelum | Minecraft version |
| `baseModLoader.type` (number) | Pandora | loader type ID; mapped by Pandora's `CurseforgeModLoaderType` enum |
| `baseModLoader.name` (string, e.g. `forge-47.2.0`, `fabric-0.15.7`) | Axolotl, NoRisk `loader_map.rs` (`loader_from_curseforge_name`) | loader and version combined |
| `baseModLoader.forgeVersion`, `latest`, `recommended` | Pandora | loader version; `latest` or `recommended` mean no pinned version |
| `baseModLoader.minecraftVersion` | NoRisk, Voxelum | Minecraft version |
| `isMemoryOverride`, `allocatedMemory` | Pandora, Voxelum | memory override and value (MB, inferred) |
| `javaArgsOverride` | Voxelum | JVM arguments |
| `lastPlayed` | Voxelum (`new Date(cf.lastPlayed)`) | ISO date string |
| `profileImagePath` | Axolotl, NoRisk, Pandora (uses `profileImage/` folder) | icon file |
| `installedModpack.addonID`, `thumbnailUrl`, `installedFile` | Axolotl, NoRisk | modpack origin and thumbnail |
| `projectID`, `fileID`, `customAuthor` | Voxelum | modpack origin |
| `installedAddons[]` | Voxelum, NoRisk | installed mods (see 6.3) |

Groups: none seen. Favourite: none seen.

### 6.3 Mod records

`installedAddons[]` (NoRisk `curseforge_app.rs:51-86`, Voxelum `curseforge_parser.ts:24-40`):

- `addonID` (CurseForge project ID)
- `installedFile`: `id` (file ID), `fileName`, `downloadUrl`, `fileFingerprint` / `packageFingerprint` (number), `displayName`, `hashes[]` (`{value, algo}`; the algorithm is a number, mapping not verified), `gameVersions[]`

Jars are in `<instance>/mods/`.

### 6.4 Sources

Community code:

- https://github.com/Moulberry/PandoraLauncher/blob/HEAD/crates/backend/src/launcher_import/curseforge.rs
- https://github.com/Moulberry/PandoraLauncher/blob/HEAD/crates/backend/src/launcher_import/mod.rs (lines 33-40)
- https://github.com/Mystic-Stars/Axolotl/blob/HEAD/packages/app-lib/src/api/pack/import/curseforge.rs (lines 1-40, 69-100)
- https://github.com/Voxelum/x-minecraft-launcher/blob/HEAD/packages/instance/parsers/curseforge_parser.ts (lines 9-40, 45-70)
- https://github.com/NoRiskClient/noriskclient-launcher/blob/v3/src-tauri/src/integrations/launcher_import/adapters/curseforge_app.rs (lines 15-86, 191-211)
- https://github.com/NoRiskClient/noriskclient-launcher/blob/v3/src-tauri/src/integrations/launcher_import/loader_map.rs (lines 66-76)
- https://github.com/Fabulously-Optimized/fabulously-optimized/blob/HEAD/CLI%20tools/CurseForge%20to%20MultiMC-Git.py (lines 11-15)
- https://github.com/Griefed/ServerPackCreator/blob/HEAD/README.md (lines 240, 284)

### 6.5 Confidence

- Community: file name, folder layout, the keys above (several independent projects agree on `baseModLoader`, `installedAddons`, `allocatedMemory`, `profileImagePath`).
- Inferred: the macOS root, the meaning of the hash `algo` numbers, and the unit of `allocatedMemory`.
- Note: the key names are taken from third-party code, which may lag behind CurseForge app changes.

---

## 7. NoRisk Client launcher

Repository: https://github.com/NoRiskClient/noriskclient-launcher (default branch `v3`, GPL-3.0, pushed 2026-10-09). Tauri (Rust backend, React frontend). This launcher also contains an importer for other launchers, which is a useful cross-check (see 7.6).

### 7.1 Locations

The app directories come from `ProjectDirs::from("gg", "norisk", "NoRiskClientV3")` (`src-tauri/src/config.rs:14-19`).

- Meta directory (`standard_meta_dir`, `config.rs:36-62`): Windows `data_dir().parent()/meta`, other systems `data_dir()/meta`.
- Profiles folder (`default_profile_path`, `src-tauri/src/state/profile_state.rs:3742-3755`): `data_dir()/profiles`, or `<custom dir>/profiles` when a custom directory is set.
- Database: `standard_meta_dir()/app.db` (`src-tauri/src/state/db.rs:14,30-31`).

Concrete paths (inferred from the `directories` crate's rules, which were not re-read for this project; the crate's data-dir rules were verified in section 5):

- Windows: `%APPDATA%\norisk\NoRiskClientV3\meta\app.db`; profiles in `%APPDATA%\norisk\NoRiskClientV3\data\profiles` (the code uses `data_dir()` for profiles and `data_dir().parent()` for meta on Windows).
- Linux: `~/.local/share/NoRiskClientV3/meta/app.db`; profiles in `~/.local/share/NoRiskClientV3/profiles`.
- macOS: `~/Library/Application Support/gg.norisk.NoRiskClientV3/meta/app.db`; profiles in `.../gg.norisk.NoRiskClientV3/profiles`.

### 7.2 Profile file

Storage is SQLite. Migration `src-tauri/migrations/0002_profiles.sql`:

- `profiles` (one row per profile):
  - `id` (UUID), `name`, `path` (folder under the profiles folder, may contain `/`), `game_version`, `loader` (`vanilla`, `forge`, `fabric`, `quilt`, `neoforge`; `ModLoader::as_str`, `profile_state.rs:249-257`), `loader_version`
  - `created` and `last_played`: nanoseconds since the Unix epoch (`profile_store.rs:62-64`, `DateTime::from_timestamp_nanos`)
  - `state`, `group_name` (group), `use_shared_minecraft_folder`, `is_standard_version`, `description`, `preferred_account_id`
  - `playtime_seconds`
  - `settings` (JSON, see below), `banner` and `background` (JSON), `norisk_information`, `modpack_info` (JSON), `extra` (JSON)
- `profile_mods`: `profile_id`, `id`, `ordinal`, `source` (for example `modrinth`, `curse_forge`), `source_type`, `project_id`, `version_id`, `file_name`, `enabled`, `display_name`, `version`, `game_versions`, `file_name_override`, `associated_loader`, `updates_enabled`, `force_include_versions`, `extra`.
- `profile_disabled_norisk_mods`, `app_meta`, `profiles_legacy_import` (import bookkeeping).

Field `settings` (`ProfileSettings`, `profile_state.rs:273-302`):

- `java_path` (string), `use_custom_java_path` (bool)
- `memory`: `{min, max}` in MB (comment at `profile_state.rs:306`)
- `custom_jvm_args` (string), `extra_game_args` (array)
- `resolution`: `{width, height}`; `fullscreen`
- `overwrite_loader_version` (legacy) and `overwrite_loader_versions` (map from loader to version)
- `quick_play_path`

Game directory (`calculate_instance_path_for_profile`, `profile_state.rs:2355-2380`): `<profiles>/<path>` for an isolated profile, or the group directory when the profile uses the shared Minecraft folder. Mods are in `<game dir>/mods` (`profile_state.rs:2389-2430`, `2771`).

Icon: no icon column seen. The UI has icon components (`src/components/profiles/ProfileIcon.tsx`); the storage was not traced. Group: `group_name`. Favourite: none found. Play time: `playtime_seconds`.

### 7.3 Mod records

`profile_mods` rows. `source` value `modrinth` stores `project_id` and `version_id`; `curse_forge` stores project and file IDs (`profile_store.rs:255-270`). Local and URL mods store `file_name`. Hashes are not stored in these columns.

### 7.4 Sources

- https://github.com/NoRiskClient/noriskclient-launcher/blob/v3/src-tauri/src/config.rs (lines 14-19, 36-62)
- https://github.com/NoRiskClient/noriskclient-launcher/blob/v3/src-tauri/src/state/db.rs (lines 14, 30-31)
- https://github.com/NoRiskClient/noriskclient-launcher/blob/v3/src-tauri/src/state/profile_state.rs (lines 241-257, 273-310, 2319-2380, 2389-2430, 3742-3755)
- https://github.com/NoRiskClient/noriskclient-launcher/blob/v3/src-tauri/src/state/profile_store.rs (lines 62-64, 126-182, 255-270)
- https://github.com/NoRiskClient/noriskclient-launcher/blob/v3/src-tauri/migrations/0002_profiles.sql

### 7.5 Confidence

- Verified (source): table and column names, ProfileSettings keys, loader names, nanosecond timestamps, game directory logic.
- Inferred: the three concrete path examples above (they follow the `directories` crate rules, which were not re-read for this project).

### 7.6 NoRisk's importer (cross-check of other formats)

`src-tauri/src/integrations/launcher_import/` (`detect.rs`, function `adapters()`) has adapters for Modrinth App, CurseForge app, Prism/MultiMC and ATLauncher. Its candidate roots and key readers agree with sections 1, 3, 5 and 6 of this document. This is useful as an independent reader when we write our own importers.

---

## 8. FTB App

Repository: https://github.com/FTBTeam/FTB-App (default branch `main`, LGPL-2.1, pushed 2026-10-05). Electron frontend with a Java subprocess (`subprocess/`).

### 8.1 Locations

The app home (`src/utils/nuturalHelpers.ts:47-55`, `getAppHome`):

- Windows: `%USERPROFILE%\AppData\Local\.ftba`
- macOS: `~/Library/Application Support/.ftba`
- Linux: `~/.ftba`

The Electron process starts the Java subprocess with `cwd: appHome` (`electron/subprocess.ts:112`, `electron/main.ts:28`). In the subprocess, `AppPaths` defines `workingDir = Path.of("")`, `instancesDir = workingDir/instances`, `storage/settings.json` (`subprocess/src/main/java/dev/ftb/app/AppPaths.java:36-52`).

The instances folder can be changed by the user: `Settings.getInstancesDir()` returns `instanceLocation` (`subprocess/.../storage/settings/Settings.java:132-134`), which defaults to `AppPaths.instancesDir()` (`Settings.java:48,61,187`).

### 8.2 Profile file

- Path: `<instances>/<folder>/instance.json` (JSON, Gson). `Instances.java:58-93` lists the instances folder and reads `instance.json` (or `instance.json.bak` as a backup).
- Categories: `<instances>/categories.json` (`Instances.java:143,165,282`). Each category has a `uuid` and `name` (`subprocess/.../instance/InstanceCategory.java`).

Fields of `InstanceJson` (`subprocess/src/main/java/dev/ftb/app/data/InstanceJson.java`):

| Field | Line | Meaning |
|---|---|---|
| `uuid` | 24 | instance UUID |
| `id`, `versionId` | 25-26 | modpack ID and version ID |
| `name` | 28 | display name |
| `version` | 29 | modpack version name |
| `mcVersion` | 30 | Minecraft version |
| `memory` | 36 | memory (unit not verified; inferred MB) |
| `jvmArgs` | 38 | JVM arguments (string) |
| `shellArgs`, `programArgs` | 39-41 | shell and game arguments |
| `embeddedJre`, `jrePath` | 42-44 | `embeddedJre=true` uses the bundled runtime; `jrePath` is a custom Java path |
| `width`, `height`, `fullscreen` | 45-47 | window size |
| `modLoader` | 51 | loader string; `Instance.resolveBasicModLoader()` maps it to `neoforge`, `forge` or `fabric` (`pack/Instance.java:818-832`). The field is set outside the code read here, so the source of its value is not traced |
| `categoryId` | 61 | UUID of an entry in `categories.json` |
| `locked`, `pinned` | 65-66 | UI state |
| `totalPlayTime` | 83 | play time in milliseconds (field comment) |
| `lastPlayed` | 84 | last played (unit not verified) |
| `art` | deprecated | artwork path |

Game directory: the instance folder itself. Mods are read from `<instance>/mods` (`pack/Instance.java:419,538`). Enabled and disabled mods use the `.disabled` suffix (`pack/Instance.java:710-714`).

Metadata folder: `<instance>/.ftbapp/` (`pack/Instance.java:52`) with `modifications.json`, `version.json` and `version_mods.json` (`pack/Instance.java:54-56`). The contents of these files were not read.

Group: `categoryId` and `categories.json`. Favourite: `pinned` (inferred: UI pin, not a favourite flag). Icon: artwork (`art`, deprecated) and `InstanceArtwork` (not read).

### 8.3 Mod records

Jars in `<instance>/mods`. Each file's status is encoded by the `.disabled` suffix. Mod metadata is in `.ftbapp/version_mods.json` (`ModpackVersionModsManifest`, not read).

### 8.4 Sources

- https://github.com/FTBTeam/FTB-App/blob/HEAD/src/utils/nuturalHelpers.ts (lines 47-55)
- https://github.com/FTBTeam/FTB-App/blob/HEAD/electron/main.ts (lines 28-52)
- https://github.com/FTBTeam/FTB-App/blob/HEAD/electron/subprocess.ts (line 112)
- https://github.com/FTBTeam/FTB-App/blob/HEAD/subprocess/src/main/java/dev/ftb/app/AppPaths.java (lines 36-52)
- https://github.com/FTBTeam/FTB-App/blob/HEAD/subprocess/src/main/java/dev/ftb/app/storage/settings/Settings.java (lines 48, 61, 132-134, 187)
- https://github.com/FTBTeam/FTB-App/blob/HEAD/subprocess/src/main/java/dev/ftb/app/Instances.java (lines 52-93, 143)
- https://github.com/FTBTeam/FTB-App/blob/HEAD/subprocess/src/main/java/dev/ftb/app/data/InstanceJson.java (lines 24-84)
- https://github.com/FTBTeam/FTB-App/blob/HEAD/subprocess/src/main/java/dev/ftb/app/pack/Instance.java (lines 52-56, 419, 538, 710-714, 818-832)

### 8.5 Confidence

- Verified (source): app home per OS, instances folder, `instance.json` keys, `categories.json`, mods folder, `.disabled` convention, `.ftbapp` metadata folder.
- Inferred: units of `memory` and `lastPlayed`, and where `modLoader` comes from.
- Not read: `modifications.json`, `version_mods.json`, `version.json` contents.

---

## 9. HMCL

Repository: https://github.com/HMCL-dev/HMCL (default branch `main`, GPL-3.0, pushed 2026-10-09). Java, Swing/JavaFX. HMCL's layout is `versions/<id>/` in a base directory. Only part of the layout was read.

### 9.1 Locations

The base directory is the `.minecraft` folder by default in most launchers, but HMCL's default base directory was not verified in this session. Inferred: HMCL uses a `.minecraft` folder by default and a separate directory per version if isolation is enabled. Documented default `.minecraft` paths (wiki, read 2026-10-10): Windows `%APPDATA%\.minecraft`, macOS `~/Library/Application Support/minecraft`, Linux `~/.minecraft`.

Instances: `<base>/versions/<id>/` (`HMCLCore/src/main/java/org/jackhuang/hmcl/game/DefaultGameRepositoryLayout.java:54`). The version JSON is `versions/<id>/<id>.json` (line 62). 
### 9.2 Profile file

HMCL has no single profile file. Each version is described by:

- `versions/<id>/<id>.json`: a vanilla-style version manifest that holds the loader libraries (not read in detail).
- `versions/<id>/.hmcl/config/instance-game-settings.json`: HMCL's per-instance settings (`HMCL/src/main/java/org/jackhuang/hmcl/game/HMCLGameRepositoryLayout.java:27-60`; read/write in `HMCLGameRepository.java:265-300`). Schema: `GameSettings.Instance` (`HMCL/src/main/java/org/jackhuang/hmcl/setting/GameSettings.java:82`).
- `.hmcl/` also has `state/`.

Keys in `instance-game-settings.json` (`GameSettings.java`, `PROPERTY_*` constants):

| Field | Key | Line | Meaning |
|---|---|---|---|
| Java type | `javaType` | 344 | auto or custom |
| Custom Java path | `customJavaPath` | 368 | executable path |
| JVM options | `jvmOptions` | 392 | string |
| Auto memory | `autoMemory` | 452 | bool |
| Min memory | `minMemory` | 464 | MB (inferred) |
| Max memory | `maxMemory` | 476 | MB (inferred) |
| Running directory | `runningDirectory` | 536 | empty means the default for the layout (isolated or shared) |
| Game arguments | `gameArguments` | 597 | string |
| Command wrapper | `commandWrapper` | 672 | string |
| Pre-launch / post-exit | `preLaunchCommand`, `postExitCommand` | 684, 696 | strings |
| Environment variables | `environmentVariables` | 660 | string |
| Window | `windowType`, `width`, `height` | 500-524 | |
| Icon | `icon` | 155 | `GameInstanceIconType` |
| Parent preset | `parent` | 146 | preset ID |

Name: the folder name under `versions/`. Group: none seen. Favourite: none seen. Play time: not found. Modpack configuration file: `HMCLGameInstance.java:133` (`getModpackConfigurationFile`, file name not read).

Game directory: `getRunDirectory()` (`HMCLGameInstance.java:161`). With isolation, this is `versions/<id>/`. Mods and saves are inside it (inferred, not read).

### 9.3 Mod records

Jars only, in the run directory's `mods/` folder (inferred). HMCL has a `ModManager` (`HMCLCore/src/main/java/org/jackhuang/hmcl/addon/mod/ModManager.java`) that was not read.

### 9.4 Sources

- https://github.com/HMCL-dev/HMCL/blob/HEAD/HMCLCore/src/main/java/org/jackhuang/hmcl/game/DefaultGameRepositoryLayout.java (lines 54, 62)
- https://github.com/HMCL-dev/HMCL/blob/HEAD/HMCL/src/main/java/org/jackhuang/hmcl/game/HMCLGameRepositoryLayout.java (lines 27-60)
- https://github.com/HMCL-dev/HMCL/blob/HEAD/HMCL/src/main/java/org/jackhuang/hmcl/game/HMCLGameRepository.java (lines 265-300)
- https://github.com/HMCL-dev/HMCL/blob/HEAD/HMCL/src/main/java/org/jackhuang/hmcl/game/HMCLGameInstance.java (lines 133, 161, 568)
- https://github.com/HMCL-dev/HMCL/blob/HEAD/HMCL/src/main/java/org/jackhuang/hmcl/setting/GameSettings.java (lines 82, 146, 155, 344-744)

### 9.5 Confidence

- Verified (source): `versions/<id>/` layout, `.hmcl/config/instance-game-settings.json` path and keys.
- Inferred: default base directory, isolation default, memory units, mod location.
- Not read: loader version (in `<id>.json`), `modpack` file, `ModManager`.

---

## 10. Vanilla Minecraft Launcher (Mojang)

Closed source. The format is documented on the Minecraft Wiki (https://minecraft.wiki/w/Launcher_profiles.json, read 2026-10-10). The wiki says its format information may be outdated for the latest launcher, so the keys should be checked against a real file before relying on them. Confidence: Documented.

### 10.1 Locations

`.minecraft` folder (documented, https://minecraft.wiki/w/.minecraft, read 2026-10-10):

- Windows: `%APPDATA%\.minecraft`
- macOS: `~/Library/Application Support/minecraft`
- Linux: `~/.minecraft`

### 10.2 Profile file

- `launcher_profiles.json` (JSON) in the `.minecraft` folder.
- Top level: `profiles`, `clientToken`, `authenticationDatabase` (cached accounts, sensitive), `launcherVersion`, `settings`, `analyticsToken`, `analyticsFailcount`, `selectedUser`.
- Each profile in `profiles` (documented): `name`, `type` (`custom`, `latest-release`, `latest-snapshot`), `created`, `lastUsed` (ISO 8601), `icon` (base64 image), `lastVersionId` (Minecraft version or version ID), `gameDir`, `javaDir`, `javaArgs`, `resolution` (`{width, height}`).

Group, favourite and loader version: not in the documented keys. The loader is part of `lastVersionId` (for example a Fabric or Forge version ID), inferred.

`authenticationDatabase` contains tokens; an importer must not copy it.

### 10.3 Mod records

Jars in `gameDir/mods` (or `.minecraft/mods` when `gameDir` is unset, inferred).

### 10.4 Sources

- https://minecraft.wiki/w/Launcher_profiles.json (documentation, read via WebFetch)
- https://minecraft.wiki/w/.minecraft (documentation, read via WebFetch)

### 10.5 Confidence

- Documented: profile keys and default folder.
- Inferred: loader version location, mod location when `gameDir` is unset.

---

## 11. Launchers without a usable public format

- **Technic Launcher**: no public launcher source was found. `gh api repos/TechnicPlatform/TechnicLauncher` returned 404. Prism's `launcher/modplatform/technic/TechnicPackProcessor.cpp` imports Technic modpack packages, not launcher profiles. Not found.
- **SKLauncher**: `skmedix/SKlauncher` contains translations only, and `sklauncher/docs` is the documentation site. The docs' file-location pages were not read. Not found.
- **Lunar Client**: closed source. Not searched in depth. Not found.
- **TLauncher**: closed source. Not searched in depth. Not found.

These can be re-checked later if the import list needs them.

---

## Summary table

Game directory "inside" means the launcher stores the game folder (mods, saves, config) inside the profile folder. "Shared" means one folder is shared across profiles.

Enough to import, in this document's terms, means the importer can build a VoltLauncher profile with name, Minecraft version, loader, loader version, memory, Java path, JVM arguments and game folder.

| Launcher | Profile file | Format | Game dir inside profile | Mod records | Confidence | Fields enough to import (name, version, loader, memory, JVM args, game folder) |
|---|---|---|---|---|---|---|
| Prism Launcher | `<data>/instances/<id>/instance.cfg` + `mmc-pack.json` | INI + JSON | yes: `minecraft/` or `.minecraft/` | jar files; `mods/.index/*.pw.toml` (Modrinth/CurseForge IDs, hashes) | Verified (source) | yes: `name`; `net.minecraft` and loader UIDs in `mmc-pack.json`; `OverrideMemory` + `MinMemAlloc`/`MaxMemAlloc`; `OverrideJavaArgs` + `JvmArgs`; game root logic. Java path only with `OverrideJavaLocation` |
| MultiMC 5 | `<data>/instances/<id>/instance.cfg` + `mmc-pack.json` | INI + JSON | yes: `minecraft/` or `.minecraft/` | jar files (no index found) | Verified (source, develop) | yes for vanilla and Forge; Fabric/Quilt/NeoForge not present in this snapshot |
| ATLauncher | `<base>/instances/<folder>/instance.json` | JSON | yes: instance root (`mods/`, `saves/`) | `mods[]` (CurseForge/Modrinth IDs, file names; no top-level hash) | Verified (source) | yes: `launcher.name`, `id` (MC version), `launcher.loaderVersion`, `maximumMemory`, `javaArguments`, `javaPath`, root folder |
| GDLauncher (archived) | `<userData>/instances/<name>/config.json` | JSON | yes: instance folder | `mods[]` (CurseForge `projectID`, `fileID`, `fileName`, `packageFingerprint`) | Verified (source) | yes: `name` (folder), `loader` (`mcVersion`, `loaderType`, `loaderVersion`), `javaMemory`, `javaArgs`, `customJavaPath`, folder |
| Modrinth App | `<config_dir>/app.db` table `instances` + `instance_content_sets` + `instance_launch_overrides`; folder `profiles/<path>` | SQLite + JSON overrides | yes: `profiles/<path>/` | `instance_files` (`sha1`) + `instance_content_entries` (Modrinth project/version IDs) | Verified (source, cross-checked by NoRisk) | yes: `instances.name`, `instance_content_sets.game_version/loader/loader_version`, `overrides.memory.maximum`, `overrides.extra_launch_args`, `overrides.java_path`, folder `path` |
| CurseForge app | `<CurseForge>/Instances/<name>/minecraftinstance.json` | JSON | yes: instance folder | `installedAddons[]` (addonID, file ID, hashes) | Community | yes (community): `name`, `gameVersion`, `baseModLoader.name` (loader+version), `allocatedMemory` (if `isMemoryOverride`), `javaArgsOverride`, folder |
| NoRisk Client launcher | `<meta>/app.db` table `profiles`; folder `<data>/profiles/<path>` | SQLite + JSON | yes: `profiles/<path>/` (or shared group folder) | `profile_mods` (Modrinth/CurseForge IDs, file names; no hashes) | Verified (source) | yes: `name`, `game_version`, `loader`, `loader_version`, `settings.memory`, `settings.custom_jvm_args`, `settings.java_path`, `path` |
| FTB App | `<home>/instances/<folder>/instance.json` | JSON | yes: instance folder | jar files; `.ftbapp/version_mods.json` (not read) | Verified (source) | yes: `name`, `mcVersion`, `modLoader` (source not traced), `memory`, `jvmArgs`, `jrePath`, folder |
| HMCL | `versions/<id>/<id>.json` + `versions/<id>/.hmcl/config/instance-game-settings.json` | JSON | yes when isolated (`versions/<id>/`), otherwise shared `.minecraft` | jar files | Partly verified | yes: id/name (folder), MC version and loader from `<id>.json` (not read), `maxMemory`, `customJavaPath`, `jvmOptions`, `runningDirectory` |
| Vanilla Minecraft Launcher | `.minecraft/launcher_profiles.json` | JSON | yes when `gameDir` is set (`gameDir`) | jar files | Documented (wiki) | yes: `name`, `lastVersionId` (MC or loader version ID), `javaDir`, `javaArgs`, `gameDir`, `resolution`; no memory field documented |
| Technic Launcher | not found | - | - | - | Not found | no |
| SKLauncher, Lunar, TLauncher | not found | - | - | - | Not found | no |

## Notes for the importer

- Prefer a launcher's own profile files over guessing. Read the default folder list in section 1 of each launcher, then the file list.
- Several launchers store the game folder inside the profile folder (Prism, MultiMC, ATLauncher, GDLauncher, FTB, CurseForge). For those, the instance folder is the game folder. Modrinth and NoRisk store profiles in SQLite; the game folder is `profiles/<path>` and the path is a column. HMCL and the vanilla launcher can point the game folder anywhere.
- Do not import credentials. The vanilla `authenticationDatabase` and the account stores of other launchers contain tokens.
- Memory units differ between launchers and several units are inferred. Verify with a real file before converting.
