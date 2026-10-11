# Publishing the packages to the CDN

**Transition only.** From 0.1.2 on, the launcher updates from GitHub releases (`release.yml` uploads the
installers and `latest.json`). Launchers older than 0.1.2 still read this CDN, so 0.1.2 has to be published
here once, so that they can update to it. After that this script is no longer needed.

To publish the packages of a GitHub release instead of building locally:

```bash
gh release download 0.1.2 -R ezTxmMC/volt-launcher -D release-gh
node scripts/publish-cdn.mjs --dir release-gh --dry-run
VOLT_CDN_USER=<user> VOLT_CDN_CONFIRM=yes node scripts/publish-cdn.mjs --dir release-gh
```

`scripts/publish-cdn.mjs` uploads the packages from `app/release/` to the CDN and updates
`latest.json`, which the VoltLauncher updater reads. It is adapted from the Lumen IDE script.

```sh
pnpm publish:cdn -- --dry-run                                  # show manifest and sftp batch, upload nothing
VOLT_CDN_CONFIRM=yes pnpm publish:cdn                          # publish every platform found for package.json's version
VOLT_CDN_CONFIRM=yes pnpm publish:cdn -- --only linux_amd64 --notes "Bug fixes"
```

Build first with `pnpm package`. The script finds the files by name (see `artifactName` in
`electron-builder.yml`); the macOS `.dmg` exists only when packaged on a Mac.

## Safety

- Without `--dry-run` the script refuses to run unless `VOLT_CDN_CONFIRM=yes` is set. It prints the
  target first.
- A dry run contacts no host. The existing `latest.json` is read from the public URL only for a real run,
  or from a local file with `--previous <file>`.
- A real run aborts if the existing `latest.json` cannot be read, because writing a new one would drop
  the other platforms.

## Options

| Option | Meaning |
| --- | --- |
| `--dry-run` | Write `latest.json`, `checksums.txt` and `upload.sftp` to `release/cdn/`, print them, upload nothing |
| `--only a,b` | Only these platforms (`linux_amd64`, `linux_aarch64`, `windows_x86_64`, `windows_arm64`, `macos_arm64`) |
| `--notes "text"` | Release notes stored in `latest.json` |
| `--version x.y.z` | Version to publish (default: `package.json`) |
| `--dir <path>` | Directory with the packages, relative to `app/` (default `release`) |
| `--no-archive` | Do not also copy the files to `version/<version>/` |
| `--previous <file>` | Existing `latest.json` from a local file |
| `--help` | Show the help |

## Environment

| Variable | Default | Status |
| --- | --- | --- |
| `VOLT_CDN_CONFIRM` | unset | must be `yes` for a real upload |
| `VOLT_CDN_HOST` | `10.52.20.251` | proposed, to confirm |
| `VOLT_CDN_USER` | the ssh default user | |
| `VOLT_CDN_PORT` | `22` | |
| `VOLT_CDN_ROOT` | `/var/www/cdn.volt-launcher.app/download/volt-launcher/version` | proposed, to confirm |
| `VOLT_CDN_URL` | `https://cdn.volt-launcher.app/download/volt-launcher/version` | proposed, to confirm |

The defaults for host, root and URL are placeholders. Confirm them before any real upload.

## Layout on the CDN

```
version/latest/latest.json
version/latest/<platform>/<files>      updater and download links
version/<version>/<platform>/<files>   archive (off with --no-archive)
```

`latest.json` is written with `product: "volt-launcher"`, a top-level `version`, `releaseDate`, optional
`notes`, and per platform `version`, `releaseDate`, `update` (the file the updater installs) and `files`.
Each file has `name`, `size` and `sha512` (base64). The manifest is uploaded last, then the old files
are removed from `latest/`.

## Files per platform

| Platform | Update (installed by the updater) | Extra |
| --- | --- | --- |
| `linux_amd64` | `VoltLauncher-{v}-linux-x86_64.AppImage` | `…-linux-amd64.deb`, `…-linux-x86_64.rpm`, `…-linux-x86_64.flatpak` |
| `linux_aarch64` | `VoltLauncher-{v}-linux-arm64.AppImage` | `…-linux-arm64.deb`, `…-linux-aarch64.rpm`, `…-linux-aarch64.flatpak` |
| `windows_x86_64` | `VoltLauncher-{v}-win-x64.exe` | `…-win-x64.msi`, `…-win-x64.zip` |
| `windows_arm64` | `VoltLauncher-{v}-win-arm64.exe` | `…-win-arm64.msi`, `…-win-arm64.zip` |
| `macos_arm64` | `VoltLauncher-{v}-mac-arm64.zip` | `…-mac-arm64.dmg` (Mac only) |

`release/` is in `app/.gitignore`, so `release/cdn/` is ignored as well.
