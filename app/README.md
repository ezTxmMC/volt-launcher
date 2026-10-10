# Volt Launcher - app (Electron frontend)

Electron + React 19 + TypeScript (strict) + react-router 7 + Tailwind CSS 4 + Iconify (offline Lucide icons).
The app starts the backend (`../backend`) as a child process and talks to it through the main process;
see `../docs/ARCHITECTURE.md` for the contract.

## Prerequisite: the backend binary

The backend binary must be built first with `backend/scripts/build.sh`. The app expects it at

- development: `../backend/dist/volt-backend` (`volt-backend.exe` on Windows)
- packaged: `<resources>/backend/volt-backend[.exe]` (copied by electron-builder `extraResources`)

If the binary is missing or does not answer `GET /api/health` within 15 s, the app shows an error screen
with the backend output.

## Commands

```sh
pnpm install        # install dependencies
pnpm dev            # Electron + Vite dev server with HMR (needs the backend binary)
pnpm dev:web        # renderer only in a plain browser, using the in-memory mock API (src/renderer/src/dev/mockApi.ts)
pnpm typecheck      # tsc for main/preload and renderer
pnpm lint           # ESLint
pnpm build          # typecheck + production build into out/
pnpm package        # build + electron-builder installer/AppImage into dist/
```

## Layout

- `src/main` - Electron main process: backend child process (`backend.ts`), IPC proxy (`volt:api`), window.
- `src/preload` - `contextBridge` exposing `window.volt`.
- `src/shared` - types shared by all processes (`bridge.ts` for the IPC contract, `models.ts` for API models).
- `src/renderer/src` - React app: `pages/`, `components/`, `state/` (backend status, settings, jobs, toasts),
  `i18n/` (German default + English), `lib/api.ts` (typed endpoint wrappers), `dev/mockApi.ts` (dev only).
- `plugins/lucideSubset.ts` - Vite plugin that bundles only the Lucide icons referenced as `lucide:<name>`
  string literals (so icons work offline). Restart the dev server after using a new icon name.

## Security model

The renderer never sees the backend port or token. It calls `window.volt.api(method, path, body)`; the main
process validates the request (`/api/...` paths only) and performs it with the `X-Volt-Token` header.
`contextIsolation` and `sandbox` are on, `nodeIntegration` is off, and the production build ships a strict CSP.
