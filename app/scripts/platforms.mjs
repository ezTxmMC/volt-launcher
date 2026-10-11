// The update packages of every platform, used by make-manifest.mjs.

/**
 * The file names per platform, without the `VoltLauncher-<version>-` prefix (see `artifactName`
 * in electron-builder.yml). `update` is what the updater installs; `extra` is uploaded alongside.
 */
export const PLATFORMS = {
  linux_amd64: {
    update: 'linux-x86_64.AppImage',
    extra: ['linux-amd64.deb', 'linux-x86_64.rpm', 'linux-x86_64.flatpak'],
  },
  linux_aarch64: {
    update: 'linux-arm64.AppImage',
    extra: ['linux-arm64.deb', 'linux-aarch64.rpm', 'linux-aarch64.flatpak'],
  },
  windows_x86_64: {
    update: 'win-x64.exe',
    extra: ['win-x64.msi', 'win-x64.zip'],
  },
  windows_arm64: {
    update: 'win-arm64.exe',
    extra: ['win-arm64.msi', 'win-arm64.zip'],
  },
  macos_arm64: {
    update: 'mac-arm64.zip',
    extra: ['mac-arm64.dmg'], // produced on a Mac only
  },
}
