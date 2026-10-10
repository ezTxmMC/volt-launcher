# volt-backend

The local HTTP service of VoltLauncher, written in [Novus](https://github.com/ezTxmMC/novus)
(tested with `novusc 0.1.0-pre.alpha.8`). The contract is `../docs/ARCHITECTURE.md`.

## Build, run, test

```sh
scripts/build.sh                 # -> dist/volt-backend (works from any directory; NOVUSC=... overrides the compiler)
dist/volt-backend --port 38911 --token <hex> --data-dir ~/.voltlauncher
scripts/smoke.sh [--build]       # starts the binary on a free port with a temp data dir, checks the core API with curl
```

- Listens on `127.0.0.1:<port>` only and prints `VOLT_BACKEND_READY port=<port>` to stdout once it accepts requests.
  Logs go to stderr with ISO timestamps.
- `--port` and `--token` are required (exit code 2 otherwise). `--data-dir` defaults to `~/.voltlauncher`.
- Every `/api/*` request needs `X-Volt-Token`; only `GET /api/health` works without it.
- `--enable-test-routes` mounts `POST /api/_test/jobs` (a counting job for the smoke test). Electron never passes it.

## Layout

```
src/main.nv            arguments, data dir, start
src/server/            listener.nv (poll loop), http.nv (parser/writer), router.nv (auth + dispatch)
src/core/              errors.nv (core.fail, null helpers, trapped execution), util.nv (ids, ISO time, JSON/file helpers),
                       state.nv (data dir, version, logging), settings.nv, profiles.nv, jobs.nv, testjobs.nv
src/mods/              route.nv, zip.nv (jar reader), metadata.nv (fabric/quilt/forge/neoforge/mcmod.info),
                       store.nv (identify cache in <gameDir>/.volt/mods.json), modrinth.nv, logic.nv
src/providers/         route.nv, net.nv, hashes.nv, zip.nv, jsonutil.nv, concurrency.nv, modrinth.nv,
                       curseforge.nv (bridge), technic.nv (Solder + client zips), ftb.nv, install.nv, content.nv
src/launch/            route.nv, paths.nv, download.nv, zip.nv, rules.nv, versions.nv, install.nv (installer loaders),
                       java.nv (detection + Temurin), process.nv (fork/exec/waitpid via C blocks), command.nv, jobs.nv
tests/                 smoke-level tests per module: tests/mods/test_mods.sh, tests/providers/run.sh,
                       tests/launch/launch-test.sh, tests/launch/edge-test.sh (these need network)
```

Build: `scripts/build.sh`. Smoke test (needs no network): `scripts/smoke.sh`.

Data: `<data-dir>/settings.json`, `<data-dir>/profiles.json`, `<data-dir>/profiles/<id>/` (game dir;
`core.profileModsDir(id)` creates `mods/` on demand).

### Writing a feature module

Implement `route(verb, segments, query, body)` in the module's `route.nv`; the router already sends it its paths
(`segments` are the path segments after `/api`, `body` is the parsed JSON or null). Return
`core.ok(value)` / `core.respond(status, value)`, abort with `core.fail(status, code, message)` (or
`core.badRequest`, `core.notFound`, `core.conflict`, `core.upstream`, `core.internal`). Long work goes through a job:
subclass `JobBody`, implement `execute(string jobId): object`, report with `core.jobProgress(jobId, 0.5, "...")`,
call `core.checkCancelled(jobId)` regularly and answer `core.respond(202, core.startJob(kind, title, body))`.
See the comment at the top of `src/core/jobs.nv`. Profiles and settings are read with `core.profile(id)`,
`core.profiles()`, `core.settings()`, `core.setting(key)`, and changed with `core.updateProfile(id, fields)`.

## Novus limitations hit (alpha.8)

- **No exceptions.** Errors use the runtime trap that `std/web` uses: `nv_try_run` / `nv_try_raise` bound as
  natives in `core/errors.nv`. `core.fail` encodes status, code and message into the raised text.
- **`sync (lock) { ... }` does not release its lock when an error raised inside it is trapped** by `tryRun`
  (longjmp skips the unlock), so the lock stays held forever. Repro:
  `sync (m) { raise("boom") }` inside a task run by `tryRun`, then `thread.tryLock(m)` from another thread is `false`.
  Workaround: nothing inside a `sync` block may raise; file writes inside locks go through `core.runTrapped`.
- **No `null` literal**; `core.none()` / `core.isNull()` use a C block. `typeOf(null)` is `"unknown"`.
- **A string literal inside `${...}` does not parse**: `"${m["a"]}"` fails with `unknown variable 'a'`.
  Use a local variable or concatenation.
- `m[key]` aborts on a missing key: use `has()` or `core.getOr`.
