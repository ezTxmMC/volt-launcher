import { execFile } from 'node:child_process'
import { basename } from 'node:path'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

/** A backend process of an earlier run: its id and the command line it was started with. */
interface BackendProcess {
  pid: number
  commandLine: string
}

const BINARY = /^volt-backend(\.exe)?$/i

/** Splits a command line into its first token (the executable) and the rest; the first token may be quoted. */
function executableOf(commandLine: string): string {
  const trimmed = commandLine.trimStart()
  if (trimmed.startsWith('"')) return trimmed.slice(1, Math.max(1, trimmed.indexOf('"', 1)))
  // Unix paths may contain spaces: the executable is everything before the first " --" option.
  const cut = trimmed.indexOf(' --')
  return cut < 0 ? trimmed : trimmed.slice(0, cut)
}

/** Whether the command line is a volt-backend started with exactly this data directory. */
export function isBackendOfDataDir(commandLine: string, dataDir: string): boolean {
  if (!BINARY.test(basename(executableOf(commandLine)))) return false
  const option = `--data-dir ${dataDir}`
  const at = commandLine.indexOf(option)
  if (at < 0) return false
  const next = commandLine.charAt(at + option.length)
  return next === '' || next === ' ' || next === '"'
}

async function listBackends(): Promise<BackendProcess[]> {
  if (process.platform === 'win32') {
    const script =
      "Get-CimInstance Win32_Process -Filter \"Name='volt-backend.exe'\" | ForEach-Object { \"$($_.ProcessId)`t$($_.CommandLine)\" }"
    const { stdout } = await execFileAsync('powershell', ['-NoProfile', '-NonInteractive', '-Command', script], {
      timeout: 15_000,
      windowsHide: true
    })
    return parseLines(stdout, '\t')
  }
  const { stdout } = await execFileAsync('ps', ['-eo', 'pid=,args='], { timeout: 10_000, maxBuffer: 16 * 1024 * 1024 })
  return parseLines(stdout, ' ')
}

function parseLines(output: string, separator: string): BackendProcess[] {
  const out: BackendProcess[] = []
  for (const raw of output.split(/\r?\n/)) {
    const line = raw.trim()
    if (line === '') continue
    const cut = line.indexOf(separator)
    if (cut < 0) continue
    const pid = Number.parseInt(line.slice(0, cut), 10)
    if (Number.isInteger(pid) && pid > 0) out.push({ pid, commandLine: line.slice(cut + 1).trim() })
  }
  return out
}

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM'
  }
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Ends backends of earlier runs that use this data directory (an orphan of a crashed launcher or of an
 * update): two backends on one data directory would both write the settings and profiles. Only
 * processes whose executable is volt-backend and whose --data-dir is exactly `dataDir` are touched;
 * `keep` ids (this app and its own child) are skipped. SIGTERM first, SIGKILL after `graceMs`.
 * Returns how many were ended; a failed lookup is not an error (nothing is killed then).
 */
export async function killStaleBackends(dataDir: string, keep: ReadonlyArray<number | undefined>): Promise<number> {
  let found: BackendProcess[]
  try {
    found = await listBackends()
  } catch {
    return 0
  }
  const own = new Set(keep.filter((pid): pid is number => typeof pid === 'number'))
  own.add(process.pid)
  const stale = found.filter((entry) => !own.has(entry.pid) && isBackendOfDataDir(entry.commandLine, dataDir))
  for (const entry of stale) {
    try {
      process.kill(entry.pid, 'SIGTERM')
    } catch {
      // already gone
    }
  }
  const deadline = Date.now() + 3000
  while (stale.some((entry) => alive(entry.pid)) && Date.now() < deadline) await sleep(100)
  for (const entry of stale) {
    if (!alive(entry.pid)) continue
    try {
      process.kill(entry.pid, 'SIGKILL')
    } catch {
      // gone in the meantime
    }
  }
  if (stale.length > 0) await sleep(150)
  return stale.length
}
