import { type ChildProcess, execFile, spawn } from 'node:child_process'
import { accessSync, chmodSync, constants, copyFileSync, mkdtempSync, readdirSync, realpathSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { promisify } from 'node:util'
import { app, shell } from 'electron'
import type { InstallKind, UpdateApplyResult, UpdateAssetKind, UpdateKindInfo } from '@shared/bridge'
import { launcherDataDir } from './backend'

const execFileAsync = promisify(execFile)

/**
 * Replaces the bundle after the launcher has exited: waits for the pid ($1), moves the installed
 * bundle ($3) aside, moves the new one ($2) in, restores the old one if that fails, opens the app and
 * removes the extraction folder ($4). Every path is passed as an argument, never interpolated.
 */
const MAC_REPLACE_SCRIPT = `#!/bin/sh
while kill -0 "$1" 2>/dev/null; do sleep 0.5; done
rm -rf "$3.old"
if mv "$3" "$3.old"; then
  if mv "$2" "$3"; then
    rm -rf "$3.old"
  else
    mv "$3.old" "$3"
  fi
fi
open "$3"
rm -rf "$4"
`

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function commandSucceeds(command: string, args: string[]): Promise<boolean> {
  return execFileAsync(command, args, { timeout: 10_000 }).then(
    () => true,
    () => false
  )
}

function isWritable(directory: string): boolean {
  try {
    accessSync(directory, constants.W_OK)
    return true
  } catch {
    return false
  }
}

/** The `.app` bundle that contains the running executable, or null when it is not inside one. */
function macBundlePath(): string | null {
  const match = /^(.*\.app)\/Contents\/MacOS\//.exec(process.execPath)
  return match?.[1] ?? null
}

/** The NSIS installer leaves an `Uninstall <name>.exe` next to the launcher. */
function hasNsisUninstaller(): boolean {
  try {
    return readdirSync(dirname(process.execPath)).some((name) => /^Uninstall .+\.exe$/i.test(name))
  } catch {
    return false
  }
}

/** How this copy of the launcher was installed. Anything not recognised is 'manual'. */
export async function detectInstallKind(): Promise<InstallKind> {
  if (process.platform === 'win32') return hasNsisUninstaller() ? 'nsis' : 'manual'
  if (process.platform === 'darwin') {
    const bundle = macBundlePath()
    return bundle && isWritable(dirname(bundle)) ? 'mac-app' : 'manual'
  }
  if (process.platform === 'linux') {
    if (process.env.APPIMAGE) return 'appimage'
    if (process.env.FLATPAK_ID) return 'flatpak'
    if (await commandSucceeds('dpkg-query', ['-S', process.execPath])) return 'deb'
    if (await commandSucceeds('rpm', ['-qf', process.execPath])) return 'rpm'
  }
  return 'manual'
}

/** Which backend download the install kind needs. Flatpak and manual installs only get the installer file. */
export function assetFor(kind: InstallKind): UpdateAssetKind {
  if (kind === 'deb') return 'deb'
  if (kind === 'rpm') return 'rpm'
  return 'installer'
}

export async function updateKind(): Promise<UpdateKindInfo> {
  const kind = await detectInstallKind()
  return { kind, asset: assetFor(kind) }
}

/** Resolves a path the renderer sent and makes sure it is a file inside `<dataDir>/updates`. */
function ownedUpdateFile(requested: string): string {
  const folder = realpathSync(join(launcherDataDir(), 'updates'))
  const file = realpathSync(resolve(requested))
  const rel = relative(folder, file)
  if (rel === '' || isAbsolute(rel) || rel.split(sep)[0] === '..') {
    throw new Error('The update file is not inside the updates folder.')
  }
  if (!statSync(file).isFile()) throw new Error('The update file does not exist.')
  return file
}

function spawnDetached(command: string, args: string[]): Promise<void> {
  return new Promise((resolvePromise, reject) => {
    const child: ChildProcess = spawn(command, args, { detached: true, stdio: 'ignore', windowsHide: true })
    child.once('error', reject)
    child.once('spawn', () => {
      child.unref()
      resolvePromise()
    })
  })
}

async function installNsis(file: string): Promise<UpdateApplyResult> {
  await spawnDetached(file, ['/S', '--updated', '--force-run'])
  app.quit()
  return { ok: true }
}

/** The AppImage is replaced in place: the running file keeps its inode, so the rename is safe. */
function replaceAppImage(file: string): UpdateApplyResult {
  const target = process.env.APPIMAGE
  if (!target) return { ok: false, manual: true }
  const staged = `${target}.new`
  try {
    copyFileSync(file, staged)
    chmodSync(staged, 0o755)
    renameSync(staged, target)
  } catch (error) {
    rmSync(staged, { force: true })
    throw error
  }
  app.relaunch({ execPath: target, args: [] })
  app.exit(0)
  return { ok: true }
}

async function replaceMacApp(zip: string): Promise<UpdateApplyResult> {
  const bundle = macBundlePath()
  if (!bundle) return { ok: false, manual: true }
  const work = mkdtempSync(join(tmpdir(), 'volt-update-'))
  const extracted = join(work, 'extracted')
  await execFileAsync('ditto', ['-x', '-k', zip, extracted])
  const newBundle = readdirSync(extracted).find((name) => name.endsWith('.app'))
  if (!newBundle) {
    rmSync(work, { recursive: true, force: true })
    return { ok: false, message: 'The downloaded archive contains no application bundle.' }
  }
  const script = join(work, 'replace.sh')
  writeFileSync(script, MAC_REPLACE_SCRIPT, { mode: 0o700 })
  await spawnDetached('/bin/sh', [script, String(process.pid), join(extracted, newBundle), bundle, work])
  app.quit()
  return { ok: true }
}

/** dpkg or rpm through polkit; the user may cancel the password dialog, which fails the call. */
async function installPackage(command: 'dpkg' | 'rpm', args: string[]): Promise<UpdateApplyResult> {
  try {
    await execFileAsync('pkexec', [command, ...args], { maxBuffer: 1024 * 1024 })
  } catch (error) {
    const detail = (error as { stderr?: unknown }).stderr
    const text = typeof detail === 'string' ? detail.trim() : ''
    return { ok: false, message: text || 'The installation was cancelled or failed.' }
  }
  app.relaunch()
  app.exit(0)
  return { ok: true }
}

/**
 * Installs a file from `<dataDir>/updates` and restarts the launcher. The install kind is detected
 * here, never taken from the renderer; only the file path comes from the renderer, and it is checked.
 */
export async function applyUpdate(requested: unknown): Promise<UpdateApplyResult> {
  if (typeof requested !== 'string' || requested.length === 0) return { ok: false, message: 'Invalid path.' }
  let file: string
  try {
    file = ownedUpdateFile(requested)
  } catch (error) {
    return { ok: false, message: messageOf(error) }
  }
  try {
    switch (await detectInstallKind()) {
      case 'nsis':
        return await installNsis(file)
      case 'appimage':
        return replaceAppImage(file)
      case 'mac-app':
        return await replaceMacApp(file)
      case 'deb':
        return await installPackage('dpkg', ['-i', file])
      case 'rpm':
        return await installPackage('rpm', ['-U', '--replacepkgs', file])
      default:
        shell.showItemInFolder(file)
        return { ok: false, manual: true }
    }
  } catch (error) {
    return { ok: false, message: messageOf(error) }
  }
}
