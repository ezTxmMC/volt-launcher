import { homedir } from 'node:os'
import { type ChildProcess, spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { existsSync, mkdirSync } from 'node:fs'
import { createServer } from 'node:net'
import { join } from 'node:path'
import { app } from 'electron'
import type { ApiResult, BackendStatus, HttpMethod } from '@shared/bridge'

const STARTUP_TIMEOUT_MS = 15_000
const REQUEST_TIMEOUT_MS = 120_000
const LOG_LIMIT = 8_000

function binaryName(): string {
  return process.platform === 'win32' ? 'volt-backend.exe' : 'volt-backend'
}

/** Development: `<app>/../backend/dist`; packaged: `<resources>/backend`. */
function binaryPath(): string {
  return app.isPackaged
    ? join(process.resourcesPath, 'backend', binaryName())
    : join(app.getAppPath(), '..', 'backend', 'dist', binaryName())
}

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer()
    server.unref()
    server.on('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (address === null || typeof address === 'string') {
        server.close()
        reject(new Error('Could not determine a free port'))
        return
      }
      server.close(() => resolve(address.port))
    })
  })
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

/** Same folder as the old Java launcher (~/.voltlauncher), so existing installs are picked up. */
export function launcherDataDir(): string {
  return join(homedir(), '.voltlauncher')
}

function errorMessageOf(body: unknown, fallback: string): string {
  if (typeof body === 'object' && body !== null && 'error' in body) {
    const error = (body as { error: unknown }).error
    if (typeof error === 'object' && error !== null && 'message' in error) {
      const message = (error as { message: unknown }).message
      if (typeof message === 'string' && message.length > 0) return message
    }
  }
  return fallback
}

export class ApiRequestError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message)
    this.name = 'ApiRequestError'
  }
}

/** Owns the backend child process and proxies HTTP calls to it. */
export class BackendManager {
  private child: ChildProcess | null = null
  private port = 0
  private token = ''
  private log = ''
  private stopping = false
  private generation = 0
  private status: BackendStatus = { state: 'starting', message: null, log: null }
  private readonly listeners = new Set<(status: BackendStatus) => void>()

  getStatus(): BackendStatus {
    return this.status
  }

  onChange(listener: (status: BackendStatus) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private setStatus(status: BackendStatus): void {
    this.status = status
    for (const listener of this.listeners) listener(status)
  }

  private fail(message: string): void {
    this.setStatus({ state: 'error', message, log: this.log.trim() || null })
  }

  private appendLog(chunk: Buffer): void {
    this.log = (this.log + chunk.toString('utf8')).slice(-LOG_LIMIT)
  }

  async start(): Promise<void> {
    const generation = ++this.generation
    this.stopping = false
    this.log = ''
    this.setStatus({ state: 'starting', message: null, log: null })

    const binary = binaryPath()
    if (!existsSync(binary)) {
      this.fail(`Backend binary not found: ${binary}\nBuild it first with backend/scripts/build.sh.`)
      return
    }

    try {
      this.port = await freePort()
      this.token = randomBytes(32).toString('hex')
      const dataDir = launcherDataDir()
      mkdirSync(dataDir, { recursive: true })

      const child = spawn(
        binary,
        ['--port', String(this.port), '--token', this.token, '--data-dir', dataDir, '--app-version', app.getVersion()],
        {
          stdio: ['ignore', 'pipe', 'pipe'],
          windowsHide: true
        }
      )
      this.child = child
      child.stdout?.on('data', (chunk: Buffer) => this.appendLog(chunk))
      child.stderr?.on('data', (chunk: Buffer) => this.appendLog(chunk))
      child.on('error', (error) => {
        if (generation === this.generation) this.fail(`Could not start the backend: ${error.message}`)
      })
      child.on('exit', (code, signal) => {
        if (this.child === child) this.child = null
        if (generation !== this.generation || this.stopping) return
        this.fail(`The backend exited unexpectedly (${signal ?? `exit code ${code ?? '?'}`}).`)
      })

      const healthy = await this.waitUntilHealthy(generation)
      if (generation !== this.generation) return
      if (healthy) {
        this.setStatus({ state: 'ready', message: null, log: null })
      } else if (this.status.state !== 'error') {
        this.killNow()
        this.fail(`The backend did not answer within ${STARTUP_TIMEOUT_MS / 1000} seconds.`)
      }
    } catch (error) {
      if (generation === this.generation) this.fail(error instanceof Error ? error.message : String(error))
    }
  }

  private async waitUntilHealthy(generation: number): Promise<boolean> {
    const deadline = Date.now() + STARTUP_TIMEOUT_MS
    while (Date.now() < deadline) {
      if (generation !== this.generation || this.child === null || this.status.state === 'error') return false
      try {
        const response = await fetch(`http://127.0.0.1:${this.port}/api/health`, {
          headers: { 'X-Volt-Token': this.token },
          signal: AbortSignal.timeout(1_000)
        })
        if (response.ok) return true
      } catch {
        // not listening yet
      }
      await sleep(150)
    }
    return false
  }

  /** Terminates the child without waiting; used on shutdown. */
  killNow(): void {
    this.stopping = true
    const child = this.child
    if (child === null || child.exitCode !== null) return
    child.kill('SIGTERM')
    // Last resort so a hung backend never outlives the launcher.
    process.once('exit', () => {
      if (child.exitCode === null) child.kill('SIGKILL')
    })
  }

  async restart(): Promise<void> {
    this.generation++
    this.killNow()
    await this.start()
  }

  async request(method: HttpMethod, path: string, body: unknown): Promise<ApiResult> {
    if (this.status.state !== 'ready') throw new ApiRequestError('The backend is not running.', 0)
    const hasBody = body !== undefined && body !== null && method !== 'GET'
    let response: Response
    try {
      response = await fetch(`http://127.0.0.1:${this.port}${path}`, {
        method,
        headers: {
          'X-Volt-Token': this.token,
          Accept: 'application/json',
          ...(hasBody ? { 'Content-Type': 'application/json; charset=utf-8' } : {})
        },
        body: hasBody ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
      })
    } catch (error) {
      throw new ApiRequestError(error instanceof Error ? error.message : String(error), 0)
    }
    const text = await response.text()
    let parsed: unknown = null
    if (text.length > 0) {
      try {
        parsed = JSON.parse(text)
      } catch {
        parsed = text
      }
    }
    if (!response.ok) {
      throw new ApiRequestError(errorMessageOf(parsed, `HTTP ${response.status}`), response.status)
    }
    return { status: response.status, body: parsed }
  }
}
