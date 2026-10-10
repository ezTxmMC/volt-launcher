# TODO

## Done

- [x] Recode/Fix Microsoft Login
- [x] Fix using the correct Java Version for profiles
- [x] Add support for the Vanilla platform
- [x] Add support for the Fabric platform
- [x] Add support for the Quilt platform
- [x] Add support for the Forge platform
- [x] Add support for the NeoForge platform
- [x] Make the mod loaders actually launch (Forge/NeoForge install processors now run —
      Mojang client mappings are downloaded, processor-produced artifacts are no longer
      treated as failed downloads, and the vanilla client jar stays on the classpath)
- [x] Download Java Version (Temurin downloader, exposed in Settings)
- [x] Add support for custom Java installations (per-profile override and per-version paths)
- [x] Add support for Modrinth discovery
- [x] Add support for CurseForge discovery (through the bridge service in `bridge/`)
- [x] Add support for Technic discovery (Solder builds and plain client zips)
- [x] Add support for FTB discovery
- [x] Add Install from discovery (modpacks create a profile)
- [x] Add Install into profile from discovery (mods, shaders, resource packs, data packs,
      with required-dependency resolution)
- [x] Create universal setup (`volt-setup`, Windows Start Menu / Linux .desktop / macOS bundle)
- [x] Split into a multi-module project
- [x] Make settings persistent and functional
- [x] Localise the interface (English + German)
- [x] Share assets and libraries between profiles instead of duplicating ~1 GB per profile
- [x] Skin management (local library, upload, rename, delete, apply to the signed-in account)
- [x] Track where every installed file came from (`<instance>/content.json`)
- [x] Modpack updating (keeps worlds, configs and self-installed mods)
- [x] Version management for mods / shaders / resource packs / data packs
- [x] Import CurseForge `.zip`, Modrinth `.mrpack` and Technic client zips
- [x] Export a profile as `.mrpack` or CurseForge `.zip`
- [x] Log viewer — launcher console, the game's own logs and crash reports, followed live
- [x] Duplicate a profile, and back one up before a risky change
- [x] Verify and repair a profile's game files
- [x] Discord rich presence (needs an application id under Settings → General)
- [x] Launcher self-update — checks a GitHub release feed and stages the installer
- [x] Automated tests (218, covering the version, launch, world, log and pack-format logic)
- [x] Quick Play — start straight into a world or onto a server
- [x] Worlds, servers and screenshots per profile
- [x] Playtime tracking
- [x] Profile organisation: favourites, folders, search, sorting, custom card image
- [x] Pre-launch / post-exit hooks, wrapper command and environment variables
- [x] Per-profile fullscreen, game directory and hide-on-launch overrides
- [x] Activity centre — every install, backup, repair and download in one place
- [x] Offline launch when Microsoft is unreachable
- [x] Content tools: search, enable/disable all, dependency warnings
- [x] Keyboard shortcuts, window geometry is remembered, right-click menu on profile cards
- [x] Harden the API against URL normalisation reaching the wrong endpoint

## Open

- [ ] Fix scrolling
- [ ] Add GraalVM support for executables (the `native` profile builds, but the reflection
      config still needs regenerating after the routing rewrite)
