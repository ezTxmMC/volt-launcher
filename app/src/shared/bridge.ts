/** Contract between the Electron preload script (window.volt) and the renderer. */

import type { Job } from './models'

/** How this copy of the launcher was installed; decides how an update is applied. */
export type InstallKind = 'nsis' | 'appimage' | 'deb' | 'rpm' | 'flatpak' | 'mac-app' | 'manual'

/** Which backend download the install kind needs (`POST /api/updates/download` `kind`). */
export type UpdateAssetKind = 'installer' | 'deb' | 'rpm'

export interface UpdateKindInfo {
  kind: InstallKind
  asset: UpdateAssetKind
}

/** Outcome of applying a downloaded update. `manual` means the user has to install the file themselves. */
export interface UpdateApplyResult {
  ok: boolean
  manual?: boolean
  message?: string
}

export type BackendState = 'starting' | 'ready' | 'error'

export interface BackendStatus {
  state: BackendState
  /** Human-readable reason, set when `state` is `error`. */
  message: string | null
  /** Tail of the backend's stdout/stderr, set when `state` is `error`. */
  log: string | null
}

export type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'

export interface ApiResult<T = unknown> {
  status: number
  body: T
}

export interface VoltBridge {
  /** Proxies a request to the backend. Rejects with the server's error message. */
  api<T = unknown>(method: HttpMethod, path: string, body?: unknown): Promise<ApiResult<T>>
  backendStatus(): Promise<BackendStatus>
  /** Subscribes to backend status changes. Returns an unsubscribe function. */
  onBackendStatus(callback: (status: BackendStatus) => void): () => void
  /** Stops and starts the backend again (used by the error screen). */
  restartBackend(): Promise<void>
  platform: string
  /** Opens a file or folder in the system file manager. Resolves to an error message or ''. */
  openPath(path: string): Promise<string>
  pickDirectory(): Promise<string | null>
  /**
   * Microsoft sign-in in a sign-in window. The main process starts the login, catches the redirect
   * and forwards code and state to the backend (the token never leaves the main process). Resolves
   * to the account-login job, or to null when the window was closed first. Rejects with the reason.
   */
  signIn(): Promise<Job | null>
  /** Hides the main window, e.g. while a game runs. */
  hideWindow(): Promise<void>
  /** Shows and focuses the main window again. */
  showWindow(): Promise<void>
  /** Minimises the main window (the window has no OS frame; the top bar draws the buttons). */
  minimize(): Promise<void>
  /** Maximises the main window, or restores it when it is already maximised. */
  maximize(): Promise<void>
  /** Closes the main window, which quits the launcher. */
  close(): Promise<void>
  isMaximized(): Promise<boolean>
  /** Subscribes to maximise and restore changes. Returns an unsubscribe function. */
  onMaximizedChange(callback: (maximized: boolean) => void): () => void
  /** One-click updates. The main process decides how to install, the renderer only passes the file. */
  update: {
    /** Install kind of this copy and the backend asset it needs. */
    kind(): Promise<UpdateKindInfo>
    /** Installs a file downloaded into the updates folder and restarts the launcher (or explains why not). */
    apply(filePath: string): Promise<UpdateApplyResult>
  }
}

export const IPC = {
  api: 'volt:api',
  backendStatus: 'volt:backend-status',
  backendStatusEvent: 'volt:backend-status-event',
  restartBackend: 'volt:restart-backend',
  openPath: 'volt:open-path',
  pickDirectory: 'volt:pick-directory',
  signIn: 'volt:sign-in',
  hideWindow: 'volt:hide-window',
  showWindow: 'volt:show-window',
  minimize: 'volt:minimize',
  maximize: 'volt:maximize',
  close: 'volt:close',
  isMaximized: 'volt:is-maximized',
  maximizedChangedEvent: 'volt:maximized-changed-event',
  updateKind: 'volt:update-kind',
  updateApply: 'volt:update-apply'
} as const

/** What the main process returns for `volt:sign-in`; the preload turns failures into thrown errors. */
export type SignInEnvelope = { ok: true; job: Job | null } | { ok: false; message: string }

/** What the main process returns for `volt:api`; the preload turns failures into thrown errors. */
export type ApiEnvelope =
  | { ok: true; result: ApiResult }
  | { ok: false; status: number; message: string }

export const HTTP_METHODS: readonly HttpMethod[] = ['GET', 'POST', 'PATCH', 'PUT', 'DELETE']
