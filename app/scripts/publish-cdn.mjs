#!/usr/bin/env node
// Publishes the packages in app/release/ to the CDN and updates latest.json, which the
// VoltLauncher updater reads. Adapted from the Lumen IDE publish script.
//
//   pnpm publish:cdn -- --dry-run                         show the manifest and the sftp batch, upload nothing
//   VOLT_CDN_CONFIRM=yes pnpm publish:cdn                 publish every platform found for the version in package.json
//   VOLT_CDN_CONFIRM=yes pnpm publish:cdn -- --only linux_amd64 --notes "Bug fixes"
//
// Without --dry-run the script refuses to run unless VOLT_CDN_CONFIRM=yes is set. It prints the
// target before anything else. A dry run contacts no host: the existing latest.json is read only
// when --previous <file> is given. A real run reads it from the public URL and refuses to continue
// if that fails, because overwriting it would drop the other platforms.
//
// The layout on the CDN (VOLT_CDN_ROOT):
//   version/latest/latest.json
//   version/latest/<platform>/<files>      <- the updater and the download links
//   version/<version>/<platform>/<files>   <- the archive (switch off with --no-archive)
//
// Platforms not uploaded keep their entry in latest.json. Old files in latest/ are removed only
// after the new manifest is in place, so updates under way always find their files.
//
// PROPOSED DEFAULTS, NOT YET CONFIRMED BY THE OPERATOR. Confirm them before any real upload:
//   VOLT_CDN_HOST   10.52.20.251
//   VOLT_CDN_ROOT   /var/www/cdn.volt-launcher.app/download/volt-launcher/version
//   VOLT_CDN_URL    https://cdn.volt-launcher.app/download/volt-launcher/version
//
// Other environment variables: VOLT_CDN_USER (default: the ssh default user), VOLT_CDN_PORT (22).
// The transfer runs over a single sftp session (key or password prompt).
//
// Each file gets a sha512 (base64) in latest.json, as in Lumen. The same values are written to
// release/cdn/checksums.txt as "<sha512 base64>  <file name>" lines. That file is local only.

import { spawn } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'))

const trimSlashes = (text) => text.replace(/\/+$/, '')

const PRODUCT = 'volt-launcher'
const HOST = process.env.VOLT_CDN_HOST || '10.52.20.251'
const USER = process.env.VOLT_CDN_USER || ''
const PORT = process.env.VOLT_CDN_PORT || '22'
const REMOTE_ROOT = trimSlashes(process.env.VOLT_CDN_ROOT || '/var/www/cdn.volt-launcher.app/download/volt-launcher/version')
const PUBLIC_URL = trimSlashes(process.env.VOLT_CDN_URL || 'https://cdn.volt-launcher.app/download/volt-launcher/version')

/**
 * The file names per platform, without the `VoltLauncher-<version>-` prefix (see `artifactName`
 * in electron-builder.yml). `update` is what the updater installs; `extra` is uploaded alongside.
 */
const PLATFORMS = {
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

const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/

const HELP = `Usage: node scripts/publish-cdn.mjs [options]     (or: pnpm publish:cdn -- [options])

  --dry-run          write latest.json and the sftp batch to release/cdn/ and print them; no upload, no host contacted
  --only a,b         only these platforms (default: all). Known: ${Object.keys(PLATFORMS).join(', ')}
  --notes "text"     release notes stored in latest.json
  --version x.y.z    version to publish (default: version in package.json)
  --dir <path>       directory with the packages, relative to app/ (default: release)
  --no-archive       do not also copy the files to version/<version>/
  --previous <file>  read the existing latest.json from a local file instead of the public URL
  --help, -h         show this help

Environment:
  VOLT_CDN_CONFIRM=yes   required for a real upload (without --dry-run)
  VOLT_CDN_HOST          default 10.52.20.251 (proposed)
  VOLT_CDN_USER          default: the ssh default user
  VOLT_CDN_PORT          default 22
  VOLT_CDN_ROOT          default /var/www/cdn.volt-launcher.app/download/volt-launcher/version (proposed)
  VOLT_CDN_URL           default https://cdn.volt-launcher.app/download/volt-launcher/version (proposed)
`

function parseArgs(argv) {
  const options = { dir: 'release', version: pkg.version, only: null, notes: '', dryRun: false, archive: true, previous: null, help: false }
  const valueOf = (index, flag) => {
    const value = argv[index + 1]
    if (value === undefined) {
      throw new Error(`${flag} needs a value (see --help)`)
    }
    return value
  }
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    switch (arg) {
      case '--dry-run':
        options.dryRun = true
        break
      case '--no-archive':
        options.archive = false
        break
      case '--help':
      case '-h':
        options.help = true
        break
      case '--dir':
        options.dir = valueOf(i, arg)
        i++
        break
      case '--version':
        options.version = valueOf(i, arg)
        i++
        break
      case '--only':
        options.only = valueOf(i, arg).split(',').map((s) => s.trim()).filter(Boolean)
        i++
        break
      case '--notes':
        options.notes = valueOf(i, arg)
        i++
        break
      case '--previous':
        options.previous = valueOf(i, arg)
        i++
        break
      default:
        throw new Error(`Unknown option: ${arg} (see --help)`)
    }
  }
  return options
}

/** Every file under `dir` (two levels: downloaded CI artefacts for instance), without unpacked builds. */
function listFiles(dir, depth = 2) {
  const out = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isFile()) {
      out.push(full)
      continue
    }
    if (!entry.isDirectory() || depth <= 1 || skipDirectory(entry.name)) {
      continue
    }
    out.push(...listFiles(full, depth - 1))
  }
  return out
}

const skipDirectory = (name) => name.endsWith('-unpacked') || name.endsWith('.app') || name === 'cdn' || /^mac(-\w+)?$/.test(name)

/** Name, size and sha512 (base64, as electron-builder writes it) of a local file. */
function describe(file) {
  const { size } = fs.statSync(file)
  const hash = crypto.createHash('sha512')
  const fd = fs.openSync(file, 'r')
  try {
    const buffer = Buffer.alloc(8 * 1024 * 1024)
    for (;;) {
      const read = fs.readSync(fd, buffer, 0, buffer.length, null)
      if (read === 0) {
        break
      }
      hash.update(buffer.subarray(0, read))
    }
  } finally {
    fs.closeSync(fd)
  }
  return { name: path.basename(file), size, sha512: hash.digest('base64') }
}

function findRelease(files, platform, version) {
  const spec = PLATFORMS[platform]
  const byName = (suffix) => files.find((file) => path.basename(file) === `VoltLauncher-${version}-${suffix}`)
  const update = byName(spec.update)
  if (!update) {
    return null
  }
  const extras = spec.extra.map((suffix) => ({ suffix, file: byName(suffix) }))
  return {
    platform,
    local: [update, ...extras.map((extra) => extra.file).filter(Boolean)],
    missing: extras.filter((extra) => !extra.file).map((extra) => `VoltLauncher-${version}-${extra.suffix}`),
  }
}

async function fetchPreviousManifest() {
  const response = await fetch(`${PUBLIC_URL}/latest/latest.json?t=${Date.now()}`, {
    headers: { 'Cache-Control': 'no-cache' },
    signal: AbortSignal.timeout(20_000),
  })
  if (response.status === 404) {
    return null
  }
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`)
  }
  return response.json()
}

async function readPrevious(options) {
  if (options.previous) {
    return JSON.parse(fs.readFileSync(path.resolve(ROOT, options.previous), 'utf8'))
  }
  if (options.dryRun) {
    console.log('- existing latest.json: not read (a dry run contacts no host; use --previous <file> to include it)')
    return null
  }
  try {
    return await fetchPreviousManifest()
  } catch (err) {
    throw new Error(`The existing latest.json cannot be read (${err.message}). It is not overwritten, because the other platforms would be lost. Fix the connection or pass --previous <file>.`)
  }
}

const quote = (text) => `"${text.replace(/(["\\])/g, '\\$1')}"`

function sftpBatch({ releases, version, manifestFile, previous, archive }) {
  // sftp's mkdir creates one level only, so every ancestor of the root is created first (existing ones
  // fail harmlessly: the leading "-" ignores the error).
  const lines = ['progress']
  const parts = REMOTE_ROOT.split('/').filter(Boolean)
  for (let i = 1; i <= parts.length; i++) {
    lines.push(`-mkdir ${quote(`/${parts.slice(0, i).join('/')}`)}`)
  }
  lines.push(`-mkdir ${quote(`${REMOTE_ROOT}/latest`)}`)
  if (archive) {
    lines.push(`-mkdir ${quote(`${REMOTE_ROOT}/${version}`)}`)
  }
  for (const release of releases) {
    const targets = [`${REMOTE_ROOT}/latest/${release.platform}`]
    if (archive) {
      targets.push(`${REMOTE_ROOT}/${version}/${release.platform}`)
    }
    for (const target of targets) {
      lines.push(`-mkdir ${quote(target)}`)
      for (const file of release.local) {
        lines.push(`put ${quote(file)} ${quote(`${target}/${path.basename(file)}`)}`)
      }
    }
  }
  // The manifest only once every file is in place; then clear the old files out of latest/.
  lines.push(`put ${quote(manifestFile)} ${quote(`${REMOTE_ROOT}/latest/latest.json.part`)}`)
  lines.push(`-rm ${quote(`${REMOTE_ROOT}/latest/latest.json`)}`)
  lines.push(`rename ${quote(`${REMOTE_ROOT}/latest/latest.json.part`)} ${quote(`${REMOTE_ROOT}/latest/latest.json`)}`)
  for (const release of releases) {
    const keep = new Set(release.local.map((file) => path.basename(file)))
    const old = previous?.platforms?.[release.platform]?.files ?? []
    for (const file of old) {
      if (keep.has(file.name)) {
        continue
      }
      lines.push(`-rm ${quote(`${REMOTE_ROOT}/latest/${release.platform}/${file.name}`)}`)
    }
  }
  return `${lines.join('\n')}\n`
}

function runSftp(batchFile) {
  const destination = USER ? `${USER}@${HOST}` : HOST
  // `-oBatchMode=no` before `-b`, so that sftp may still ask for a password despite the batch file.
  const args = ['-oBatchMode=no', '-P', PORT, '-b', batchFile, destination]
  return new Promise((resolve, reject) => {
    const child = spawn('sftp', args, { stdio: 'inherit' })
    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0) {
        resolve()
        return
      }
      reject(new Error(`sftp ended with code ${code}`))
    })
  })
}

/** Splits `1.3.0-beta.1` into core and prerelease, dropping a leading `v`. */
function splitVersion(version) {
  const clean = version.replace(/^v/, '')
  const cut = clean.indexOf('-')
  return cut < 0 ? [clean, ''] : [clean.slice(0, cut), clean.slice(cut + 1)]
}

/** `1.2.10` > `1.2.9`; a prerelease (`1.3.0-beta.1`) comes before its final version. */
function compareVersions(a, b) {
  const [coreA, preA] = splitVersion(a)
  const [coreB, preB] = splitVersion(b)
  const partsA = coreA.split('.').map((n) => Number.parseInt(n, 10) || 0)
  const partsB = coreB.split('.').map((n) => Number.parseInt(n, 10) || 0)
  for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
    const diff = (partsA[i] ?? 0) - (partsB[i] ?? 0)
    if (diff !== 0) {
      return Math.sign(diff)
    }
  }
  if (preA === preB) {
    return 0
  }
  if (!preA) {
    return 1
  }
  if (!preB) {
    return -1
  }
  return preA.localeCompare(preB, 'en', { numeric: true })
}

const relative = (file) => path.relative(ROOT, file)

async function main() {
  const options = parseArgs(process.argv.slice(2))
  if (options.help) {
    console.log(HELP)
    return
  }
  if (!SEMVER.test(options.version)) {
    throw new Error(`Not a version: ${options.version}`)
  }
  const unknown = (options.only ?? []).filter((platform) => !PLATFORMS[platform])
  if (unknown.length) {
    throw new Error(`Unknown platform: ${unknown.join(', ')} (known: ${Object.keys(PLATFORMS).join(', ')})`)
  }

  console.log(`Target:  ${USER ? `${USER}@` : ''}${HOST}:${PORT}`)
  console.log(`Root:    ${REMOTE_ROOT}`)
  console.log(`Public:  ${PUBLIC_URL}`)
  console.log(options.dryRun ? 'Mode:    dry run, nothing is uploaded and no host is contacted' : 'Mode:    LIVE upload over sftp')
  if (!options.dryRun && process.env.VOLT_CDN_CONFIRM !== 'yes') {
    throw new Error('Refusing to upload without VOLT_CDN_CONFIRM=yes. Use --dry-run to only look. Nothing was contacted or uploaded.')
  }

  const dir = path.resolve(ROOT, options.dir)
  if (!fs.existsSync(dir)) {
    throw new Error(`${dir} does not exist, build first (pnpm package)`)
  }

  const files = listFiles(dir)
  const releases = []
  for (const platform of options.only ?? Object.keys(PLATFORMS)) {
    const release = findRelease(files, platform, options.version)
    if (!release) {
      console.log(`- ${platform}: no update package for ${options.version} found, skipped`)
      continue
    }
    if (release.missing.length) {
      console.log(`- ${platform}: not found, not uploaded: ${release.missing.join(', ')}`)
    }
    releases.push(release)
  }
  if (!releases.length) {
    throw new Error(`No packages for version ${options.version} in ${dir}`)
  }

  const previous = await readPrevious(options)
  const releaseDate = new Date().toISOString()
  const manifest = {
    product: PRODUCT,
    version: options.version,
    releaseDate,
    notes: options.notes || undefined,
    platforms: { ...(previous?.platforms ?? {}) },
  }
  const checksums = []
  for (const release of releases) {
    console.log(`• ${release.platform}: checksums…`)
    const described = release.local.map(describe)
    manifest.platforms[release.platform] = { version: options.version, releaseDate, update: described[0], files: described }
    for (const file of described) {
      console.log(`    ${file.name}  ${(file.size / 1024 / 1024).toFixed(1)} MB`)
      console.log(`      sha512 ${file.sha512}`)
      checksums.push(`${file.sha512}  ${file.name}`)
    }
  }
  // The topmost version = the highest of all the platforms, so that `version` never jumps back.
  manifest.version = Object.values(manifest.platforms).map((entry) => entry.version).sort(compareVersions).pop() ?? options.version

  const staging = path.join(dir, 'cdn')
  fs.mkdirSync(staging, { recursive: true })
  const manifestFile = path.join(staging, 'latest.json')
  const batchFile = path.join(staging, 'upload.sftp')
  const checksumFile = path.join(staging, 'checksums.txt')
  const batch = sftpBatch({ releases, version: options.version, manifestFile, previous, archive: options.archive })
  fs.writeFileSync(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`)
  fs.writeFileSync(batchFile, batch)
  fs.writeFileSync(checksumFile, `${checksums.join('\n')}\n`)

  console.log(`\nManifest:  ${relative(manifestFile)}`)
  console.log(`Checksums: ${relative(checksumFile)} (local only, not uploaded)`)
  console.log(`Batch:     ${relative(batchFile)}`)

  if (options.dryRun) {
    console.log(`\nlatest.json:\n${JSON.stringify(manifest, null, 2)}`)
    console.log(`\nsftp batch (not run):\n${batch}`)
    console.log('--dry-run: nothing uploaded.')
    return
  }
  await runSftp(batchFile)
  console.log(`\nOK: VoltLauncher ${options.version} published: ${PUBLIC_URL}/latest/latest.json`)
}

main().catch((err) => {
  console.error(`ERROR: ${err.message}`)
  process.exitCode = 1
})
