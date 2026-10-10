import { BrowserWindow } from 'electron'
import type { Job, LoginStart } from '@shared/models'
import type { SignInEnvelope } from '@shared/bridge'
import type { BackendManager } from './backend'

/** Same lifetime as the backend's pending logins (10 minutes, single use). */
const SIGN_IN_TIMEOUT_MS = 10 * 60_000
/** In-memory session: nothing from one sign-in is kept for the next one. */
const SESSION_PARTITION = 'volt-signin'
const REDIRECT_ORIGIN = 'https://login.live.com'
const REDIRECT_PATH = '/oauth20_desktop.srf'

interface Redirect {
  state: string
  code?: string
  error?: string
  error_description?: string
}

/**
 * The desktop redirect of the Microsoft login, or null for any other address. Only the exact
 * origin and path count, as in the old launcher; state, code, error and error_description are read.
 */
export function parseRedirect(raw: string): Redirect | null {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return null
  }
  if (url.origin !== REDIRECT_ORIGIN || url.pathname !== REDIRECT_PATH) return null
  return {
    state: url.searchParams.get('state') ?? '',
    code: url.searchParams.get('code') ?? undefined,
    error: url.searchParams.get('error') ?? undefined,
    error_description: url.searchParams.get('error_description') ?? undefined
  }
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function parseLogin(body: unknown): LoginStart {
  const login = body as Partial<LoginStart> | null
  if (typeof login?.state !== 'string' || typeof login.url !== 'string' || !login.url.startsWith('https://')) {
    throw new Error('The backend returned no usable sign-in address.')
  }
  return { state: login.state, url: login.url, expiresAt: String(login.expiresAt ?? '') }
}

function isJob(body: unknown): body is Job {
  return typeof body === 'object' && body !== null && typeof (body as { id?: unknown }).id === 'string'
}

/** Sends the redirect's code (or error) and state to the backend; the token never leaves the main process. */
async function completeLogin(backend: BackendManager, login: LoginStart, redirect: Redirect): Promise<SignInEnvelope> {
  if (redirect.state !== login.state) {
    return { ok: false, message: 'The sign-in response does not match this sign-in. Start the sign-in again.' }
  }
  if (!redirect.code && !redirect.error) {
    return { ok: false, message: 'The sign-in response contained neither a code nor an error.' }
  }
  const body = redirect.error
    ? { state: redirect.state, error: redirect.error, error_description: redirect.error_description }
    : { state: redirect.state, code: redirect.code }
  try {
    const response = await backend.request('POST', '/api/accounts/callback', body)
    if (!isJob(response.body)) return { ok: false, message: 'The backend returned no sign-in job.' }
    return { ok: true, job: response.body }
  } catch (error) {
    return { ok: false, message: messageOf(error) }
  }
}

let pending = false
let activeWindow: BrowserWindow | null = null

/**
 * Microsoft sign-in in its own window, the way the old launcher did it: the login page opens, the
 * window catches the redirect to login.live.com/oauth20_desktop.srf, forwards code and state to
 * the backend and closes. Resolves to the account-login job, or to job null when the user closed
 * the window first.
 */
export async function signInWithMicrosoft(backend: BackendManager, parent: BrowserWindow | null): Promise<SignInEnvelope> {
  if (pending) {
    if (activeWindow && !activeWindow.isDestroyed()) {
      if (activeWindow.isMinimized()) activeWindow.restore()
      activeWindow.focus()
    }
    return { ok: false, message: 'A sign-in is already running.' }
  }
  pending = true
  try {
    return await runSignIn(backend, parent)
  } finally {
    pending = false
  }
}

async function runSignIn(backend: BackendManager, parent: BrowserWindow | null): Promise<SignInEnvelope> {
  let login: LoginStart
  try {
    login = parseLogin((await backend.request('POST', '/api/accounts/login', undefined)).body)
  } catch (error) {
    return { ok: false, message: messageOf(error) }
  }

  return new Promise<SignInEnvelope>((resolve) => {
    const window = new BrowserWindow({
      width: 520,
      height: 760,
      minWidth: 420,
      minHeight: 560,
      parent: parent ?? undefined,
      autoHideMenuBar: true,
      show: false,
      title: 'Microsoft',
      backgroundColor: '#ffffff',
      webPreferences: {
        partition: SESSION_PARTITION,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true
      }
    })
    window.setMenu(null)
    activeWindow = window

    let settled = false
    let redirecting = false
    const settle = (value: SignInEnvelope): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      activeWindow = null
      resolve(value)
    }
    const closeWindow = (): void => {
      if (!window.isDestroyed()) window.close()
    }

    const timer = setTimeout(() => {
      settle({ ok: false, message: 'The sign-in window timed out. Start the sign-in again.' })
      closeWindow()
    }, SIGN_IN_TIMEOUT_MS)

    const onRedirect = (event: Electron.Event, url: string): void => {
      const redirect = parseRedirect(url)
      if (!redirect) return
      event.preventDefault()
      if (redirecting || settled) return
      redirecting = true
      void completeLogin(backend, login, redirect).then((result) => {
        settle(result)
        closeWindow()
      })
    }
    window.webContents.on('will-navigate', onRedirect)
    window.webContents.on('will-redirect', onRedirect)

    // Microsoft may open a popup; it is loaded into this window instead of a new one.
    window.webContents.setWindowOpenHandler(({ url }) => {
      if (url.startsWith('https://')) void window.loadURL(url)
      return { action: 'deny' }
    })

    window.once('ready-to-show', () => window.show())
    window.on('closed', () => settle({ ok: true, job: null }))

    // The redirect prevented in onRedirect aborts the page load; that is not a failure.
    window.loadURL(login.url).catch((error: unknown) => {
      if (!redirecting) settle({ ok: false, message: messageOf(error) })
    })
  })
}
