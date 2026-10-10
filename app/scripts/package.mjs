#!/usr/bin/env node
// Packages the app for each release target.
//
//   node scripts/package.mjs                  every target
//   node scripts/package.mjs linux-x64 win-x64
//
// Per target: the matching backend binary (backend/dist/<target>/) is copied to .stage/backend/,
// then electron-builder runs with that target's platform, architecture and formats.
// Run backend/scripts/build-release.sh first. Output goes to app/release/.

import { spawnSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const appDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const backendDist = resolve(appDir, '..', 'backend', 'dist')
const stageDir = join(appDir, '.stage', 'backend')

const TARGETS = {
  'linux-x64': ['--linux', 'AppImage', 'deb', 'rpm', 'zip', 'tar.gz', 'flatpak', '--x64'],
  'linux-arm64': ['--linux', 'AppImage', 'deb', 'rpm', 'zip', 'tar.gz', 'flatpak', '--arm64'],
  'win-x64': ['--win', 'nsis', 'msi', 'zip', '--x64'],
  'win-arm64': ['--win', 'nsis', 'msi', 'zip', '--arm64'],
  'mac-arm64': ['--mac', 'dmg', 'zip', '--arm64'],
}

const requested = process.argv.slice(2)
const selected = requested.length ? requested : Object.keys(TARGETS)
const unknown = selected.filter((t) => !(t in TARGETS))
if (unknown.length) {
  console.error(`unknown target(s): ${unknown.join(', ')}. Known: ${Object.keys(TARGETS).join(', ')}`)
  process.exit(2)
}

// Copies the backend binary for one target into the staging folder and returns true on success.
function stageBackend(target) {
  const source = join(backendDist, target)
  if (!existsSync(source)) {
    console.error(`[${target}] missing ${source}; run backend/scripts/build-release.sh ${target}`)
    return false
  }
  rmSync(stageDir, { recursive: true, force: true })
  mkdirSync(stageDir, { recursive: true })
  const binaries = readdirSync(source).filter((f) => f.startsWith('volt-backend') && !f.endsWith('.pdb'))
  if (binaries.length === 0) {
    console.error(`[${target}] no volt-backend binary in ${source}`)
    return false
  }
  for (const file of binaries) {
    copyFileSync(join(source, file), join(stageDir, file))
  }
  return true
}

const failures = []
for (const target of selected) {
  console.log(`\n== ${target}`)
  if (!stageBackend(target)) {
    failures.push(target)
    continue
  }
  const args = ['exec', 'electron-builder', ...TARGETS[target]]
  // On Windows pnpm is a .cmd shim, which spawnSync only starts through a shell.
  const result = spawnSync('pnpm', args, { cwd: appDir, stdio: 'inherit', shell: process.platform === 'win32' })
  if (result.status !== 0) {
    failures.push(target)
  }
}

rmSync(join(appDir, '.stage'), { recursive: true, force: true })
if (failures.length) {
  console.error(`\nfailed: ${failures.join(', ')}`)
  process.exit(1)
}
console.log('\nall targets packaged into app/release/')
