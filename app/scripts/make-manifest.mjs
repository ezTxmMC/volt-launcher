#!/usr/bin/env node
// Writes the update manifest (latest.json, the format the launcher's updater reads) for the packages
// of one version found in a folder. Used by the release workflow (the manifest of a GitHub release)
// and by the beta workflow (the rolling "dev" release).
//
//   node scripts/make-manifest.mjs --dir ../assets --version 0.1.2-dev.abcdef1234 --out ../assets/latest.json
//
// The files are expected as VoltLauncher-<version>-<suffix> (see PLATFORMS in platforms.mjs).

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { PLATFORMS } from './platforms.mjs'

function parse(argv) {
  const options = { dir: '', version: '', out: '', notes: '' }
  for (let i = 0; i < argv.length; i += 2) {
    const flag = argv[i]
    const value = argv[i + 1]
    if (value === undefined || !['--dir', '--version', '--out', '--notes'].includes(flag)) {
      throw new Error(`Usage: make-manifest.mjs --dir <folder> --version <x.y.z[-pre]> --out <file> [--notes <text>] (got ${flag})`)
    }
    options[flag.slice(2)] = value
  }
  if (!options.dir || !options.version || !options.out) {
    throw new Error('--dir, --version and --out are required')
  }
  return options
}

function describe(file) {
  const hash = crypto.createHash('sha512').update(fs.readFileSync(file)).digest('base64')
  return { name: path.basename(file), size: fs.statSync(file).size, sha512: hash }
}

const options = parse(process.argv.slice(2))
const releaseDate = new Date().toISOString()
const platforms = {}
for (const [platform, spec] of Object.entries(PLATFORMS)) {
  const named = (suffix) => path.join(options.dir, `VoltLauncher-${options.version}-${suffix}`)
  if (!fs.existsSync(named(spec.update))) {
    console.log(`- ${platform}: no ${spec.update}, skipped`)
    continue
  }
  const local = [named(spec.update), ...spec.extra.map(named).filter((file) => fs.existsSync(file))]
  const described = local.map(describe)
  platforms[platform] = { version: options.version, releaseDate, update: described[0], files: described }
  console.log(`+ ${platform}: ${described.map((file) => file.name).join(', ')}`)
}
if (Object.keys(platforms).length === 0) {
  throw new Error(`No packages for ${options.version} in ${options.dir}`)
}
const manifest = {
  product: 'volt-launcher',
  version: options.version,
  releaseDate,
  notes: options.notes || undefined,
  platforms
}
fs.writeFileSync(options.out, `${JSON.stringify(manifest, null, 2)}\n`)
console.log(`wrote ${options.out}`)
