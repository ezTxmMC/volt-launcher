#!/usr/bin/env python3
# Test driver of the legacy migration (src/migration). run.sh builds the backend and calls:
#
#   check.py <volt-backend binary> <work dir> <legacy source dir>
#   check.py --real-dry-run <volt-backend binary> <work dir> <legacy source dir>
#
# The legacy source dir is the real VoltLauncher folder (default ~/.voltlauncher). Only its
# config/settings.json and instances/instances.json are copied; everything else in the test
# fixtures is made up. --real-dry-run runs the migration in dry-run mode against the real folder
# and checks that the folder's sha256 manifest is identical before and after.
#
# Exit code 0 when every check passes, 1 otherwise.
import hashlib
import json
import os
import shutil
import socket
import subprocess
import sys
import time
import urllib.error
import urllib.request

TOKEN = "migration-test-token-0123456789abcdef"
FAILS = []
CHECKS = [0]


def check(condition, label):
    CHECKS[0] += 1
    print(("ok   " if condition else "FAIL ") + label)
    if not condition:
        FAILS.append(label)


def sha1_of(data):
    return hashlib.sha1(data).hexdigest()


def write(path, data):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "wb") as f:
        f.write(data)


def write_json(path, value):
    write(path, (json.dumps(value, indent=2) + "\n").encode("utf-8"))


def manifest(root):
    """Relative path -> sha256 of every file below root (what `find | sha256sum` would print)."""
    out = {}
    for directory, _, names in os.walk(root):
        for name in names:
            full = os.path.join(directory, name)
            digest = hashlib.sha256()
            with open(full, "rb") as f:
                for chunk in iter(lambda: f.read(1 << 20), b""):
                    digest.update(chunk)
            out[os.path.relpath(full, root)] = digest.hexdigest()
    return out


def compare_manifests(before, after):
    removed = sorted(k for k in before if k not in after)
    changed = sorted(k for k in before if k in after and before[k] != after[k])
    added = sorted(k for k in after if k not in before)
    return removed, changed, added


def free_port():
    s = socket.socket()
    s.bind(("127.0.0.1", 0))
    port = s.getsockname()[1]
    s.close()
    return port


class Backend:
    """One backend process with its own log file in the work dir."""

    def __init__(self, binary, work, name, data, legacy):
        self.port = free_port()
        self.log_path = os.path.join(work, name + ".log")
        self.log = open(self.log_path, "w")
        self.proc = subprocess.Popen(
            [binary, "--port", str(self.port), "--token", TOKEN, "--data-dir", data, "--legacy-dir", legacy],
            stdout=self.log, stderr=subprocess.STDOUT)
        deadline = time.time() + 15
        while time.time() < deadline:
            try:
                urllib.request.urlopen("http://127.0.0.1:%d/api/health" % self.port, timeout=1).read()
                return
            except (urllib.error.URLError, ConnectionError, OSError):
                if self.proc.poll() is not None:
                    break
                time.sleep(0.1)
        raise RuntimeError("backend %s did not start; see %s" % (name, self.log_path))

    def request(self, method, path, body=None):
        data = None if body is None else json.dumps(body).encode("utf-8")
        req = urllib.request.Request("http://127.0.0.1:%d%s" % (self.port, path), data=data, method=method)
        req.add_header("X-Volt-Token", TOKEN)
        if data is not None:
            req.add_header("Content-Type", "application/json")
        try:
            with urllib.request.urlopen(req, timeout=20) as resp:
                return resp.status, json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as err:
            return err.code, json.loads(err.read().decode("utf-8") or "null")

    def log_text(self):
        self.log.flush()
        with open(self.log_path) as f:
            return f.read()

    def stop(self):
        self.proc.terminate()
        try:
            self.proc.wait(timeout=10)
        except subprocess.TimeoutExpired:
            self.proc.kill()
            self.proc.wait()
        self.log.close()


def copy_legacy_files(source, root):
    """The two files the brief allows to copy from the real folder."""
    os.makedirs(os.path.join(root, "config"), exist_ok=True)
    os.makedirs(os.path.join(root, "instances"), exist_ok=True)
    shutil.copy(os.path.join(source, "config", "settings.json"), os.path.join(root, "config", "settings.json"))
    shutil.copy(os.path.join(source, "instances", "instances.json"), os.path.join(root, "instances", "instances.json"))


def build_main_fixture(source, root):
    """Copies of the real settings and instance list, a game folder for every instance,
    and one fake mod set with provenance for fabulously-optimized-2."""
    copy_legacy_files(source, root)
    with open(os.path.join(root, "instances", "instances.json")) as f:
        instances = json.load(f)["instances"]
    for entry in instances:
        os.makedirs(os.path.join(root, "instances", entry["slug"], "game"), exist_ok=True)
    game = os.path.join(root, "instances", "fabulously-optimized-2", "game")
    fake = b"fake mod jar bytes"
    write(os.path.join(game, "mods", "fake-mod-1.0.jar"), fake)
    write(os.path.join(game, "mods", "off-mod-2.0.jar.disabled"), b"off mod bytes")
    write(os.path.join(game, "mods", "changed-mod.jar"), b"edited after the old launcher saw it")
    write(os.path.join(game, "mods", "manual.jar"), b"copied by hand")
    provenance = {
        "modpack": {"versionId": "DDDDDDDD", "provider": "modrinth", "name": "Fake Pack", "updatable": True,
                    "iconUrl": "", "projectId": "CCCCCCCC", "sourceFile": "", "versionNumber": "1.0"},
        "content": [
            {"contentType": "mods", "fileName": "fake-mod-1.0.jar", "origin": "provider", "provider": "modrinth",
             "projectId": "AAAAAAAA", "versionId": "BBBBBBBB", "projectName": "Fake Mod", "versionNumber": "1.0.0",
             "sha1": sha1_of(fake), "fileSize": len(fake), "downloadUrl": "", "iconUrl": "", "requiredDependencies": []},
            {"contentType": "mods", "fileName": "off-mod-2.0.jar", "origin": "provider", "provider": "modrinth",
             "projectId": "EEEEEEEE", "versionId": "FFFFFFFF", "projectName": "", "versionNumber": "",
             "sha1": sha1_of(b"off mod bytes"), "fileSize": 13, "downloadUrl": "", "iconUrl": "",
             "requiredDependencies": []},
            {"contentType": "mods", "fileName": "changed-mod.jar", "origin": "provider", "provider": "modrinth",
             "projectId": "GGGGGGGG", "versionId": "HHHHHHHH", "projectName": "Changed", "versionNumber": "",
             "sha1": "0" * 40, "fileSize": 1, "downloadUrl": "", "iconUrl": "", "requiredDependencies": []},
            {"contentType": "mods", "fileName": "manual.jar", "origin": "manual", "provider": "", "projectId": "",
             "versionId": "", "projectName": "", "versionNumber": "", "sha1": "", "fileSize": 0, "downloadUrl": "",
             "iconUrl": "", "requiredDependencies": []},
        ],
    }
    write_json(os.path.join(root, "instances", "fabulously-optimized-2", "content.json"), provenance)


def edge_instances():
    """Edge cases for the mapping: loaders, limits, unusable entries and a missing game folder."""
    return [
        {"name": "Edge Fabric", "slug": "edge-fabric", "versionId": "fabric:1.21.1:0.16.0", "versionType": "fabric",
         "settings": {"maxMemoryMb": 6144, "minMemoryMb": 1024, "javaPath": "/usr/bin/java", "jvmArgs": "-Xss2M",
                      "wrapperCommand": "gamemoderun", "preLaunchCommand": "echo pre", "postExitCommand": None,
                      "envVars": {"MY_VAR": "1", "9BAD": "x", "OK_2": "yes"}, "fullscreen": True,
                      "hideLauncher": True, "resolutionWidth": 1280, "resolutionHeight": 720, "gameDirectory": None},
         "totalPlaytimeMs": 5000, "lastPlayedAt": 1700000000000, "createdAt": 1690000000000, "favourite": True,
         "groupName": "Edge group", "iconUrl": "", "javaMajorVersion": 21, "javaComponent": "java-runtime-delta"},
        {"name": "Edge Forge", "slug": "edge-forge", "versionId": "forge:1.20.1:47.2.0", "versionType": "forge",
         "settings": {"maxMemoryMb": 100}, "totalPlaytimeMs": 0, "lastPlayedAt": 0, "createdAt": 1690000000000,
         "favourite": False, "groupName": "", "iconUrl": "", "javaMajorVersion": 17, "javaComponent": "x"},
        {"name": "Edge Bad", "slug": "edge-bad", "versionId": "weirdloader:1.0:2", "versionType": "x",
         "settings": {}, "totalPlaytimeMs": 0, "lastPlayedAt": 0, "createdAt": 0, "favourite": False,
         "groupName": "", "iconUrl": "", "javaMajorVersion": 17, "javaComponent": "x"},
        {"name": "Unsafe", "slug": "../escape", "versionId": "1.21", "versionType": "release",
         "settings": {}, "totalPlaytimeMs": 0, "lastPlayedAt": 0, "createdAt": 0, "favourite": False,
         "groupName": "", "iconUrl": "", "javaMajorVersion": 17, "javaComponent": "x"},
        {"name": "No game folder", "slug": "edge-nogame", "versionId": "1.20.4", "versionType": "release",
         "settings": {}, "totalPlaytimeMs": 0, "lastPlayedAt": 0, "createdAt": 0, "favourite": False,
         "groupName": "", "iconUrl": "", "javaMajorVersion": 17, "javaComponent": "x"},
    ]


def build_edge_fixture(source, root):
    copy_legacy_files(source, root)
    write_json(os.path.join(root, "instances", "instances.json"), {"instances": edge_instances()})
    fabric = os.path.join(root, "instances", "edge-fabric", "game")
    cf = b"cf mod"
    pack = b"pack"
    write(os.path.join(fabric, "mods", "cf-mod-1.0.jar"), cf)
    write(os.path.join(fabric, "mods", "nosha.jar"), b"no sha recorded")
    write(os.path.join(fabric, "resourcepacks", "pack.zip"), pack)
    os.makedirs(os.path.join(root, "instances", "edge-forge", "game"), exist_ok=True)
    os.makedirs(os.path.join(root, "instances", "edge-bad", "game"), exist_ok=True)
    provenance = {
        "modpack": {"versionId": "456", "provider": "curseforge", "name": "CF Pack", "updatable": False,
                    "iconUrl": "", "projectId": "123", "sourceFile": "", "versionNumber": "2"},
        "content": [
            {"contentType": "mods", "fileName": "cf-mod-1.0.jar", "origin": "provider", "provider": "curseforge",
             "projectId": "1", "versionId": "2", "projectName": "CF Mod", "versionNumber": "1.0",
             "sha1": sha1_of(cf)},
            {"contentType": "resourcepacks", "fileName": "pack.zip", "origin": "provider", "provider": "modrinth",
             "projectId": "PPPPPPPP", "versionId": "VVVVVVVV", "projectName": "", "versionNumber": "",
             "sha1": sha1_of(pack)},
            {"contentType": "datapacks", "fileName": "dp.zip", "origin": "provider", "provider": "modrinth",
             "projectId": "D", "versionId": "E", "sha1": "1" * 40},
            {"contentType": "mods", "fileName": "../../escape.jar", "origin": "provider", "provider": "modrinth",
             "projectId": "F", "versionId": "G", "sha1": "2" * 40},
            {"contentType": "mods", "fileName": "gone.jar", "origin": "provider", "provider": "modrinth",
             "projectId": "H", "versionId": "I", "sha1": "3" * 40},
            {"contentType": "mods", "fileName": "nosha.jar", "origin": "provider", "provider": "modrinth",
             "projectId": "J", "versionId": "K", "sha1": ""},
        ],
    }
    write_json(os.path.join(root, "instances", "edge-fabric", "content.json"), provenance)


def find_profile(profiles, name):
    for p in profiles:
        if p["name"] == name:
            return p
    return None


def check_main(source, work, binary, legacy):
    data = os.path.join(work, "main-new")
    os.makedirs(data, exist_ok=True)

    # A dry run against a fresh legacy fixture must not write into the legacy folder.
    before = manifest(legacy)
    dry_dir = os.path.join(work, "main-dry")
    proc = subprocess.run([binary, "--migration-dry-run", "--data-dir", dry_dir, "--legacy-dir", legacy],
                          capture_output=True, text=True, timeout=300)
    check(proc.returncode == 0, "dry run exits 0")
    try:
        dry = json.loads(proc.stdout)
    except ValueError:
        dry = {}
        print(proc.stdout, proc.stderr)
    check(dry.get("status") == "done", "dry run status done")
    check(dry.get("dryRun") is True, "dry run is marked dryRun")
    check(len(dry.get("profiles", [])) == 7, "dry run maps 7 instances")
    check(dry.get("settingsMapped") == 19, "dry run maps 19 settings")
    check(dry.get("modSourcesMapped") == 2, "dry run would map 2 mod sources")
    removed, changed, added = compare_manifests(before, manifest(legacy))
    check(not removed and not changed and not added, "dry run leaves the legacy folder untouched (%d files)" % len(before))

    backend = Backend(binary, work, "main-run1", data, legacy)
    try:
        code, mig = backend.request("GET", "/api/migration")
        check(code == 200 and mig.get("status") == "done", "run 1: GET /api/migration status done")
        check(mig.get("legacyDir") == legacy, "run 1: migration.json records the legacy folder")
        check(sorted(mig.get("settingsSkipped", [])) == sorted([
                  "curseForgeBridgeUrl -> bridgeUrl: 'bridgeUrl' is fixed by the launcher",
                  "discordApplicationId -> discordApplicationId: 'discordApplicationId' is fixed by the launcher",
                  "updateRepository -> updateRepository: unknown setting 'updateRepository'",
                  "offlineModeAllowed: no equivalent in the new settings"]),
              "run 1: the two fixed settings, updateRepository and offlineModeAllowed are skipped")
        check(mig.get("modSourcesMapped") == 2 and mig.get("modSourcesSkipped") == 2,
              "run 1: 2 mod sources mapped, 2 skipped")
        check(mig.get("backupsMoved") == [], "run 1: no backups moved")
        check(any("accounts: sign in with Microsoft once" == n for n in mig.get("notes", [])),
              "run 1: notes say accounts need a new sign-in")

        code, profiles = backend.request("GET", "/api/profiles")
        check(code == 200 and len(profiles) == 7, "run 1: 7 profiles listed")
        expected = {
            "Fabulously Optimized - 26.2": ("26.2", "fabric", "0.19.3", "26.2", False),
            "26.4-snap2": ("26.4-snapshot-2", "vanilla", None, None, False),
            "26.4-snap1": ("26.4-snapshot-1", "vanilla", None, None, False),
            "Fabulously Optimized": ("26.3", "fabric", "0.19.5", None, False),
            "26.2 vanilla": ("26.2", "vanilla", None, "26.2", False),
            "Techit": ("26.1.2", "neoforge", "26.1.2.95", None, False),
            "Fabulously Optimized - 1.21.8": ("1.21.8", "fabric", "0.19.3", None, False),
        }
        for name, (mc, loader, loader_version, group, favourite) in expected.items():
            p = find_profile(profiles, name)
            check(p is not None, "run 1: profile '%s' exists" % name)
            if p is None:
                continue
            check(p["minecraftVersion"] == mc and p["loader"] == loader and p["loaderVersion"] == loader_version,
                  "run 1: '%s' has %s %s %s" % (name, mc, loader, loader_version))
            check(p.get("group") == group and p["favourite"] == favourite,
                  "run 1: '%s' has group %r and favourite %s" % (name, group, favourite))
        techit = find_profile(profiles, "Techit")
        check(techit is not None and techit["memoryMb"] == 8192, "run 1: Techit keeps its 8192 MB")
        fo2 = find_profile(profiles, "Fabulously Optimized - 26.2")
        check(fo2 is not None and fo2["totalPlaytimeMs"] == 138682508, "run 1: playtime is carried over")
        check(fo2 is not None and fo2["lastPlayed"] == "2026-10-03T18:33:52Z", "run 1: lastPlayed from lastPlayedAt (ms)")
        check(fo2 is not None and fo2["createdAt"] == "2026-08-06T11:20:27Z", "run 1: createdAt from createdAt (ms)")
        legacy_game = os.path.join(legacy, "instances", "fabulously-optimized-2", "game")
        check(fo2 is not None and fo2["gameDirectory"] == legacy_game, "run 1: profile uses the legacy game folder in place")
        check(fo2 is not None and fo2["source"] == {"kind": "modpack", "name": "Fake Pack", "projectId": "CCCCCCCC",
                                                    "provider": "modrinth", "versionId": "DDDDDDDD"},
              "run 1: modpack source is carried over")

        code, settings = backend.request("GET", "/api/settings")
        check(code == 200 and settings["memoryMb"] == 12288 and settings["minMemoryMb"] == 4096,
              "run 1: memory settings mapped")
        check(settings["language"] == "en" and settings["downloadThreads"] == 8,
              "run 1: language and download threads mapped")
        check(settings["closeOnLaunch"] is False and "updateRepository" not in settings,
              "run 1: hideLauncherOnLaunch -> closeOnLaunch mapped, updateRepository is no setting")
        check(settings["bridgeUrl"] == "https://bridge.volt-launcher.app",
              "run 1: bridgeUrl keeps its fixed value (curseForgeBridgeUrl is not written)")
        check(settings["discordApplicationId"] == "1490544471962685530",
              "run 1: discordApplicationId keeps its fixed value")

        cache_path = os.path.join(legacy, "instances", "fabulously-optimized-2", "game", ".volt", "mods.json")
        check(os.path.isfile(cache_path), "run 1: the mod cache was written in the legacy game folder")
        if os.path.isfile(cache_path):
            with open(cache_path) as f:
                mods = json.load(f)["mods"]
            names = sorted(e["fileName"] for e in mods.values())
            check(names == ["fake-mod-1.0.jar", "off-mod-2.0.jar.disabled"], "run 1: cache holds the two certain files")
            fake = mods.get(sha1_of(b"fake mod jar bytes"), {})
            check(fake.get("source", {}).get("provider") == "modrinth" and fake["source"]["projectId"] == "AAAAAAAA"
                  and fake["source"]["versionId"] == "BBBBBBBB", "run 1: fake mod keeps its Modrinth source")
    finally:
        backend.stop()

    after_run1 = manifest(legacy)
    removed, changed, added = compare_manifests(before, after_run1)
    check(not removed and not changed, "run 1: no legacy file removed or changed")
    check(added == ["instances/fabulously-optimized-2/game/.volt/mods.json"],
          "run 1: the only new legacy file is the mod cache %r" % added)

    with open(os.path.join(data, "migration.json"), "rb") as f:
        first_state = f.read()
    backend = Backend(binary, work, "main-run2", data, legacy)
    try:
        code, profiles = backend.request("GET", "/api/profiles")
        check(len(profiles) == 7, "run 2 (restart): still 7 profiles, no second migration")
        check("created" not in backend.log_text(), "run 2 (restart): no profile was created")
    finally:
        backend.stop()
    with open(os.path.join(data, "migration.json"), "rb") as f:
        check(f.read() == first_state, "run 2 (restart): migration.json is unchanged")
    removed, changed, added = compare_manifests(after_run1, manifest(legacy))
    check(not removed and not changed and not added, "run 2 (restart): legacy folder unchanged")

    # The user changed a setting in the new launcher: it must be kept.
    user_data = os.path.join(work, "main-user")
    os.makedirs(user_data, exist_ok=True)
    write_json(os.path.join(user_data, "settings.json"), {"memoryMb": 2048, "language": "de", "showFps": True})
    backend = Backend(binary, work, "main-user", user_data, legacy)
    try:
        code, settings = backend.request("GET", "/api/settings")
        check(settings["memoryMb"] == 2048, "user settings: a changed memoryMb is kept")
        check(settings["language"] == "en", "user settings: language still at its default is filled")
        check(settings["showFps"] is True, "user settings: a changed showFps is kept")
        code, mig = backend.request("GET", "/api/migration")
        check(any("defaultMaxMemoryMb -> memoryMb" in s for s in mig.get("settingsSkipped", [])),
              "user settings: the skipped memoryMb is listed")
        check(mig.get("modSourcesMapped") == 0 and any("already exists" in s for s in
              sum([p.get("skipped", []) for p in mig.get("profiles", [])], [])),
              "second data dir: existing mod caches are not overwritten")
    finally:
        backend.stop()

    # No legacy layout: nothing happens and the endpoint says so.
    empty_legacy = os.path.join(work, "empty-legacy")
    os.makedirs(empty_legacy, exist_ok=True)
    empty_data = os.path.join(work, "empty-new")
    os.makedirs(empty_data, exist_ok=True)
    backend = Backend(binary, work, "empty", empty_data, empty_legacy)
    try:
        code, mig = backend.request("GET", "/api/migration")
        check(code == 200 and mig == {"status": "none"}, "no legacy data: GET /api/migration answers none")
        code, _ = backend.request("POST", "/api/migration", {})
        check(code == 405, "POST /api/migration is refused")
    finally:
        backend.stop()
    check(not os.path.exists(os.path.join(empty_data, "migration.json")), "no legacy data: no migration.json written")

    # A dry run must refuse the legacy folder as its data dir.
    proc = subprocess.run([binary, "--migration-dry-run", "--data-dir", legacy, "--legacy-dir", legacy],
                          capture_output=True, text=True, timeout=60)
    check(proc.returncode == 2, "dry run refuses the legacy folder as --data-dir")


def check_edge(binary, work, legacy_root):
    legacy = os.path.join(legacy_root, "edge")
    data = os.path.join(work, "edge-new")
    os.makedirs(data, exist_ok=True)
    backend = Backend(binary, work, "edge-run1", data, legacy)
    try:
        code, mig = backend.request("GET", "/api/migration")
        check(mig.get("status") == "partial", "edge run 1: status partial")
        entries = {e["slug"]: e for e in mig.get("profiles", [])}
        check(len(entries) == 5, "edge run 1: five entries (one per instance)")
        check(entries["edge-bad"]["status"] == "failed" and "weirdloader" in entries["edge-bad"]["message"],
              "edge run 1: unknown loader fails only its instance")
        check(entries["../escape"]["status"] == "failed", "edge run 1: unsafe slug is refused")
        code, profiles = backend.request("GET", "/api/profiles")
        check(len(profiles) == 3, "edge run 1: three profiles (the failed two are not created)")
        fabric = find_profile(profiles, "Edge Fabric")
        check(fabric is not None, "edge run 1: Edge Fabric exists")
        if fabric is not None:
            check(fabric["loader"] == "fabric" and fabric["loaderVersion"] == "0.16.0" and fabric["minecraftVersion"] == "1.21.1",
                  "edge run 1: fabric version parsed")
            check(fabric["memoryMb"] == 6144 and fabric["javaPath"] == "/usr/bin/java" and fabric["jvmArgs"] == "-Xss2M",
                  "edge run 1: memory, java path and jvm args mapped")
            check(fabric["wrapperCommand"] == "gamemoderun" and fabric["preLaunchCommand"] == "echo pre",
                  "edge run 1: commands mapped")
            check(fabric["envVars"] == {"MY_VAR": "1", "OK_2": "yes"}, "edge run 1: invalid env var names dropped")
            check(fabric["fullscreen"] is True and fabric["hideLauncher"] is True and fabric["favourite"] is True,
                  "edge run 1: booleans mapped")
            check(fabric["group"] == "Edge group", "edge run 1: group mapped")
            check(fabric["lastPlayed"] == "2023-11-14T22:13:20Z" and fabric["createdAt"] == "2023-07-22T04:26:40Z",
                  "edge run 1: timestamps mapped")
            check(fabric["totalPlaytimeMs"] == 5000, "edge run 1: playtime mapped")
            check(fabric["source"] == {"kind": "modpack", "name": "CF Pack", "projectId": "123",
                                       "provider": "curseforge", "versionId": "456"},
                  "edge run 1: CurseForge modpack source mapped")
        forge = find_profile(profiles, "Edge Forge")
        check(forge is not None and forge["loader"] == "forge" and forge["loaderVersion"] == "47.2.0",
              "edge run 1: forge version parsed")
        check(forge is not None and forge["memoryMb"] is None, "edge run 1: a memory below 256 is not mapped")
        nogame = find_profile(profiles, "No game folder")
        check(nogame is not None and not nogame.get("gameDirectory"),
              "edge run 1: a missing game folder gives no custom game directory")
        check(nogame is not None and nogame["gameDir"].startswith(os.path.join(data, "profiles") + os.sep),
              "edge run 1: the managed directory is inside the data dir")
        check(any("does not exist" in n for n in entries["edge-nogame"]["notes"]), "edge run 1: missing game folder noted")
        reasons = entries["edge-fabric"]["skipped"]
        check(entries["edge-fabric"]["modSourcesMapped"] == 2 and entries["edge-fabric"]["modSourcesSkipped"] == 4,
              "edge run 1: 2 mapped, 4 skipped for fabric")
        check(any("datapack" in r for r in reasons) and any("is not usable" in r for r in reasons)
              and any("not in mods/" in r for r in reasons) and any("no recorded sha1" in r for r in reasons),
              "edge run 1: skip reasons cover datapack, unsafe name, missing file, no sha1")
        resourcepacks = os.path.join(legacy, "instances", "edge-fabric", "game", ".volt", "resourcepacks.json")
        check(os.path.isfile(resourcepacks), "edge run 1: resource pack cache written")
    finally:
        backend.stop()

    # A second start retries the failed instances without duplicating the migrated ones.
    backend = Backend(binary, work, "edge-run2", data, legacy)
    try:
        code, mig2 = backend.request("GET", "/api/migration")
        check(mig2.get("status") == "partial", "edge run 2: still partial")
        check(len(mig2.get("profiles", [])) == 5, "edge run 2: still five entries, none duplicated")
        check(len(backend.request("GET", "/api/profiles")[1]) == 3, "edge run 2: still three profiles")
        check([e["profileId"] for e in mig2["profiles"] if e["status"] == "migrated"]
              == [e["profileId"] for e in mig.get("profiles", []) if e["status"] == "migrated"],
              "edge run 2: migrated profile ids unchanged")
    finally:
        backend.stop()

    # Fix the unknown loader in the legacy list (a fixture edit) and start again.
    edge_list = os.path.join(legacy, "instances", "instances.json")
    with open(edge_list) as f:
        doc = json.load(f)
    for entry in doc["instances"]:
        if entry["slug"] == "edge-bad":
            entry["versionId"] = "1.20.1"
    write_json(edge_list, doc)
    backend = Backend(binary, work, "edge-run3", data, legacy)
    try:
        code, mig3 = backend.request("GET", "/api/migration")
        check(mig3.get("status") == "partial", "edge run 3: partial until the unsafe slug is fixed too")
        code, profiles = backend.request("GET", "/api/profiles")
        check(len(profiles) == 4 and find_profile(profiles, "Edge Bad") is not None,
              "edge run 3: the retried instance is migrated")
        check(len({p["name"] for p in profiles}) == len(profiles), "edge run 3: no duplicate profiles")
    finally:
        backend.stop()


def check_broken_state(binary, work, legacy_root):
    legacy = os.path.join(legacy_root, "edge")
    data = os.path.join(work, "broken-state")
    os.makedirs(data, exist_ok=True)
    write(os.path.join(data, "migration.json"), b"{ not json")
    backend = Backend(binary, work, "broken-state", data, legacy)
    try:
        code, mig = backend.request("GET", "/api/migration")
        check(mig == {"status": "unreadable"}, "unreadable migration.json: reported, nothing migrated")
        code, profiles = backend.request("GET", "/api/profiles")
        check(profiles == [], "unreadable migration.json: no profiles created")
    finally:
        backend.stop()


def check_broken_list(binary, work):
    legacy = os.path.join(work, "broken-list")
    write(os.path.join(legacy, "instances", "instances.json"), b"{ not json")
    data = os.path.join(work, "broken-list-new")
    os.makedirs(data, exist_ok=True)
    backend = Backend(binary, work, "broken-list", data, legacy)
    try:
        code, mig = backend.request("GET", "/api/migration")
        check(mig.get("status") == "partial" and any("cannot be read" in n for n in mig.get("notes", [])),
              "broken instances.json: partial, with a note")
        code, profiles = backend.request("GET", "/api/profiles")
        check(profiles == [], "broken instances.json: no profiles created")
    finally:
        backend.stop()


def real_dry_run(binary, work, source):
    """Dry run against the real legacy folder: checksums before and after must match."""
    if not os.path.isdir(source):
        print("real dry run: %s does not exist" % source)
        return 1
    print("hashing %s (this takes a while) ..." % source)
    before = manifest(source)
    data = os.path.join(work, "real-dry")
    proc = subprocess.run([binary, "--migration-dry-run", "--data-dir", data, "--legacy-dir", source],
                          capture_output=True, text=True, timeout=1800)
    after = manifest(source)
    removed, changed, added = compare_manifests(before, after)
    print("dry run exit code: %d" % proc.returncode)
    print("legacy files: %d; removed %d, changed %d, added %d" % (len(before), len(removed), len(changed), len(added)))
    for path in (removed + changed + added)[:20]:
        print("  differs: " + path)
    try:
        result = json.loads(proc.stdout)
    except ValueError:
        print(proc.stdout, proc.stderr)
        return 1
    print("status: %s" % result.get("status"))
    print("instances: %d" % len(result.get("profiles", [])))
    print("settings mapped: %d" % result.get("settingsMapped", 0))
    print("settings skipped: %s" % json.dumps(result.get("settingsSkipped", []), ensure_ascii=False))
    print("mod sources mapped: %d, skipped: %d" % (result.get("modSourcesMapped", 0), result.get("modSourcesSkipped", 0)))
    for entry in result.get("profiles", []):
        print("  %-28s %-9s mods %3d mapped, %3d skipped  %s" % (
            entry.get("slug"), entry.get("status"), entry.get("modSourcesMapped", 0),
            entry.get("modSourcesSkipped", 0), entry.get("message", "")))
    print("backups left in place: %s" % json.dumps(result.get("backupsLeftInPlace", []), ensure_ascii=False))
    return 0 if (proc.returncode == 0 and not (removed or changed or added)) else 1


def main(argv):
    if argv and argv[0] == "--real-dry-run":
        binary, work, source = argv[1], argv[2], argv[3]
        return real_dry_run(binary, work, source)
    binary, work, source = argv[0], argv[1], argv[2]
    main_legacy = os.path.join(work, "main-legacy")
    build_main_fixture(source, main_legacy)
    check_main(source, work, binary, main_legacy)

    edge_root = os.path.join(work, "edge-root")
    build_edge_fixture(source, os.path.join(edge_root, "edge"))
    check_edge(binary, work, edge_root)
    check_broken_state(binary, work, edge_root)
    check_broken_list(binary, work)

    print("%d checks, %d failed" % (CHECKS[0], len(FAILS)))
    for label in FAILS:
        print("  FAILED: " + label)
    return 1 if FAILS else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
