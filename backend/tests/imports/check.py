#!/usr/bin/env python3
"""Checks of the import endpoints against the fixtures of fixtures.py.

usage: check.py <port> <token> <home> <data-dir> main|nosqlite

main:     the scan, the refusals (400/404/409), the import jobs, the copies, the names and
          the source checksums (before and after).
nosqlite: run against a server whose PATH has no sqlite3: Modrinth and NoRisk unavailable.
Prints one line per check; exits 1 when a check fails.
"""
import hashlib
import json
import os
import sys
import time
import urllib.error
import urllib.request

PORT, TOKEN, HOME, DATA, MODE = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4], sys.argv[5]
BASE = "http://127.0.0.1:" + PORT
FAILS = []


def check(name, condition, detail=""):
    if condition:
        print("ok    " + name)
    else:
        FAILS.append(name)
        print("FAIL  " + name + ("  -- " + str(detail) if detail != "" else ""))


def api(method, path, body=None, raw=None):
    headers = {"X-Volt-Token": TOKEN}
    data = None
    if raw is not None:
        data = raw.encode()
        headers["Content-Type"] = "application/json"
    elif body is not None:
        data = json.dumps(body).encode()
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(BASE + path, data=data, method=method, headers=headers)
    try:
        with urllib.request.urlopen(req) as response:
            text = response.read().decode()
            status = response.status
    except urllib.error.HTTPError as error:
        text = error.read().decode()
        status = error.code
    try:
        parsed = json.loads(text)
    except ValueError:
        parsed = None
    return status, parsed, text


def error_code(parsed):
    return (parsed or {}).get("error", {}).get("code", "")


def error_message(parsed):
    return (parsed or {}).get("error", {}).get("message", "")


def wait_job(job_id):
    job = None
    for _ in range(200):
        status, job, _ = api("GET", "/api/jobs/" + job_id)
        if job and job.get("state") != "running":
            return job
        time.sleep(0.05)
    return job


def tree_hashes(root):
    """Relative path -> sha256 (files) or "link:<target>" (links). Links are not followed."""
    out = {}
    for dirpath, dirnames, filenames in os.walk(root):
        for name in dirnames + filenames:
            full = os.path.join(dirpath, name)
            rel = os.path.relpath(full, root)
            if os.path.islink(full):
                out[rel] = "link:" + os.readlink(full)
            elif os.path.isfile(full):
                with open(full, "rb") as f:
                    out[rel] = hashlib.sha256(f.read()).hexdigest()
    return out


def find_profile(scan, launcher, name):
    for entry in scan["launchers"]:
        if entry["id"] != launcher:
            continue
        for profile in entry["profiles"]:
            if profile["name"] == name:
                return profile
    return None


def launcher(scan, launcher_id):
    for entry in scan["launchers"]:
        if entry["id"] == launcher_id:
            return entry
    return None


def profile_dir_of(profile_id):
    return os.path.join(DATA, "profiles", profile_id)


def named_profile(name):
    status, profiles, _ = api("GET", "/api/profiles")
    for p in profiles or []:
        if p["name"] == name:
            return p
    return None


def scan_checks(scan, sqlite_present):
    ids = [l["id"] for l in scan["launchers"]]
    check("scan lists the ten launchers in order",
          ids == ["prism", "multimc", "atlauncher", "gdlauncher", "ftb", "hmcl", "vanilla",
                  "curseforge", "modrinth", "norisk"], ids)
    check("every launcher has a status",
          all(l["status"] in ("found", "none", "unavailable") for l in scan["launchers"]))
    check("multimc is none (no folder in the fixture)", launcher(scan, "multimc")["status"] == "none")

    prism = launcher(scan, "prism")
    check("prism found, confidence verified", prism["status"] == "found" and prism["confidence"] == "verified", prism)
    fab = find_profile(scan, "prism", "Fabric Survival")
    check("prism Fabric Survival maps to 1.21.1 / fabric 0.16.5",
          fab and fab["minecraftVersion"] == "1.21.1" and fab["loader"] == "fabric" and fab["loaderVersion"] == "0.16.5", fab)
    check("prism Fabric Survival is importable with a size", fab and fab["importable"] and fab["sizeBytes"] > 0 and fab["sizeComplete"], fab)
    check("prism notes say memory is not imported", fab and any("memory" in n for n in fab["notes"]), fab)
    vc = find_profile(scan, "prism", "Vanilla Copy")
    check("prism Vanilla Copy (no loader) maps to vanilla, game folder .minecraft",
          vc and vc["loader"] == "vanilla" and vc["minecraftVersion"] == "1.20.4" and vc["importable"], vc)

    atl = find_profile(scan, "atlauncher", "All The Mods")
    check("atlauncher maps name, 1.20.1, forge 47.3.0",
          atl and atl["minecraftVersion"] == "1.20.1" and atl["loader"] == "forge" and atl["loaderVersion"] == "47.3.0", atl)
    check("atlauncher confidence is community (paths from third-party code)", launcher(scan, "atlauncher")["confidence"] == "community")

    gd = find_profile(scan, "gdlauncher", "GD Test")
    check("gdlauncher maps 1.19.4 / fabric 0.14.22", gd and gd["minecraftVersion"] == "1.19.4" and gd["loader"] == "fabric" and gd["loaderVersion"] == "0.14.22", gd)

    gd_old = find_profile(scan, "gdlauncher", "GD Old")
    check("gdlauncher old modloader array maps forge 14.23.5.2859 / 1.12.2",
          gd_old and gd_old["loader"] == "forge" and gd_old["loaderVersion"] == "14.23.5.2859" and gd_old["minecraftVersion"] == "1.12.2", gd_old)
    ftb = find_profile(scan, "ftb", "FTB Skies")
    check("ftb FTB Skies maps modLoader NeoForge to neoforge", ftb and ftb["loader"] == "neoforge" and ftb["minecraftVersion"] == "1.21.1", ftb)
    quilt = find_profile(scan, "ftb", "Quilt Pack")
    check("ftb quilt modLoader is listed but not importable", quilt and not quilt["importable"] and "quilt" in quilt["reason"], quilt)
    huge = find_profile(scan, "ftb", "Huge")
    check("ftb Huge reports its 41 GiB size", huge and huge["sizeBytes"] >= 41 * 1024 ** 3, huge)

    hmcl = launcher(scan, "hmcl")
    names = sorted(p["name"] for p in hmcl["profiles"])
    check("hmcl lists only the .hmcl version folder", names == ["hmcl-1.21"], names)
    check("hmcl profile is refused (version and loader not read)",
          hmcl["profiles"] and not hmcl["profiles"][0]["importable"], hmcl["profiles"])

    van = launcher(scan, "vanilla")
    v1 = find_profile(scan, "vanilla", "Vanilla 1.20.6")
    check("vanilla 1.20.6 is importable (plain release id, own gameDir)",
          v1 and v1["importable"] and v1["minecraftVersion"] == "1.20.6" and v1["loader"] == "vanilla", v1)
    shared = find_profile(scan, "vanilla", "Shared")
    check("vanilla profile without gameDir (shared .minecraft) is refused",
          shared and not shared["importable"] and "shared" in shared["reason"], shared)
    fl = find_profile(scan, "vanilla", "Fabric Loader")
    check("vanilla loader id is refused, not parsed", fl and not fl["importable"], fl)
    check("vanilla confidence is documented", van["confidence"] == "documented")

    cf = find_profile(scan, "curseforge", "CF Pack")
    check("curseforge CF Pack maps forge-47.2.0", cf and cf["loader"] == "forge" and cf["loaderVersion"] == "47.2.0" and cf["minecraftVersion"] == "1.20.1", cf)

    mr = launcher(scan, "modrinth")
    nr = launcher(scan, "norisk")
    if sqlite_present:
        mp = find_profile(scan, "modrinth", "Modrinth Pack")
        check("modrinth found and maps 1.20.4 / fabric 0.15.11",
              mr["status"] == "found" and mp and mp["minecraftVersion"] == "1.20.4" and mp["loader"] == "fabric" and mp["loaderVersion"] == "0.15.11", mr)
        np = find_profile(scan, "norisk", "NoRisk One")
        check("norisk found and maps 1.21.4 / neoforge 21.4.1",
              nr["status"] == "found" and np and np["minecraftVersion"] == "1.21.4" and np["loader"] == "neoforge" and np["loaderVersion"] == "21.4.1", nr)
    else:
        check("modrinth is unavailable without sqlite3 (reason given)",
              mr["status"] == "unavailable" and mr["reason"] == "sqlite3 is not installed", mr)
        check("norisk is unavailable without sqlite3 (reason given)",
              nr["status"] == "unavailable" and nr["reason"] == "sqlite3 is not installed", nr)


def main_checks():
    # The launcher folders (databases included) must not change by a single byte or file.
    launcher_dirs = [os.path.join(HOME, ".local", "share", "ModrinthApp"),
                     os.path.join(HOME, ".local", "share", "NoRiskClientV3"),
                     os.path.join(HOME, ".local", "share", "PrismLauncher")]
    launcher_before = {d: tree_hashes(d) for d in launcher_dirs}
    status, scan, raw = api("GET", "/api/imports/scan")
    check("GET /api/imports/scan -> 200 with JSON", status == 200 and scan is not None, (status, raw[:200]))
    if scan is None:
        return
    scan_checks(scan, True)
    check("scan output has no token or secret text",
          "SECRET-TOKEN-XYZ" not in raw and "SECRET-CLIENT-TOKEN" not in raw)

    # --- route shape
    check("GET /api/imports -> 405", api("GET", "/api/imports")[0] == 405)
    check("POST /api/imports/scan -> 405", api("POST", "/api/imports/scan", {})[0] == 405)
    check("GET /api/imports/other -> 404", api("GET", "/api/imports/other")[0] == 404)

    # --- refusals: nothing is created
    before = len(api("GET", "/api/profiles")[1] or [])
    hmcl_key = find_profile(scan, "hmcl", "hmcl-1.21")["key"]
    shared_key = find_profile(scan, "vanilla", "Shared")["key"]
    quilt_key = find_profile(scan, "ftb", "Quilt Pack")["key"]
    huge_key = find_profile(scan, "ftb", "Huge")["key"]
    fab_key = find_profile(scan, "prism", "Fabric Survival")["key"]
    vanilla_key = find_profile(scan, "vanilla", "Vanilla 1.20.6")["key"]

    status, body, _ = api("POST", "/api/imports", {"items": [{"launcher": "hmcl", "key": hmcl_key}]})
    check("HMCL (not importable) -> 400 bad_request", status == 400 and error_code(body) == "bad_request", (status, body))
    status, body, _ = api("POST", "/api/imports", {"items": [{"launcher": "vanilla", "key": shared_key}]})
    check("vanilla shared .minecraft -> 400", status == 400, (status, body))
    status, body, _ = api("POST", "/api/imports", {"items": [{"launcher": "ftb", "key": quilt_key}]})
    check("unsupported loader -> 400", status == 400, (status, body))
    status, body, _ = api("POST", "/api/imports", {"items": [{"launcher": "ftb", "key": huge_key}]})
    check("game folder over 40 GB -> 409 conflict with the size",
          status == 409 and error_code(body) == "conflict" and "40 GB" in error_message(body) and "GB" in error_message(body),
          (status, body))
    status, body, _ = api("POST", "/api/imports", {"items": [{"launcher": "prism", "key": "0000000000000000"}]})
    check("unknown key -> 404", status == 404 and error_code(body) == "not_found", (status, body))
    status, body, _ = api("POST", "/api/imports", {"items": [{"launcher": "nope", "key": fab_key}]})
    check("unknown launcher -> 404", status == 404, (status, body))
    status, body, _ = api("POST", "/api/imports", {"items": [{"launcher": "prism", "key": fab_key}, {"launcher": "ftb", "key": quilt_key}]})
    check("mixed batch with one refusal -> 400 and nothing started", status == 400, (status, body))
    status, body, _ = api("POST", "/api/imports", {"items": [{"launcher": "prism", "key": fab_key}, {"launcher": "prism", "key": fab_key}]})
    check("the same item twice -> 400", status == 400, (status, body))
    status, body, _ = api("POST", "/api/imports", {})
    check("body without items -> 400", status == 400 and error_code(body) == "bad_request", (status, body))
    status, body, _ = api("POST", "/api/imports", {"items": []})
    check("empty items -> 400", status == 400, (status, body))
    status, body, _ = api("POST", "/api/imports", raw="not json")
    check("body that is not JSON -> 400", status == 400, (status, body))
    status, body, _ = api("POST", "/api/imports")
    check("no body -> 400", status == 400, (status, body))
    after_refusals = len(api("GET", "/api/profiles")[1] or [])
    check("refused requests created no profile", before == after_refusals, (before, after_refusals))

    # --- sources before the copies
    sources = {
        "prism": os.path.join(HOME, ".local", "share", "PrismLauncher", "instances", "Fabric Survival", "minecraft"),
        "atl": os.path.join(HOME, ".local", "share", "ATLauncher", "instances", "Atm"),
        "gd": os.path.join(HOME, ".config", "gdlauncher_next", "instances", "GD Test"),
        "ftb": os.path.join(HOME, ".ftba", "instances", "ftb skies"),
        "cf": os.path.join(HOME, "curseforge", "minecraft", "Instances", "CF Pack"),
        "mr": os.path.join(HOME, ".local", "share", "ModrinthApp", "profiles", "mr pack"),
        "nr": os.path.join(HOME, ".local", "share", "NoRiskClientV3", "profiles", "norisk-one"),
        "vanilla": os.path.join(HOME, "vanilla-game"),
        "vcopy": os.path.join(HOME, ".local", "share", "PrismLauncher", "instances", "Vanilla Copy", ".minecraft"),
    }
    before_hashes = {k: tree_hashes(v) for k, v in sources.items()}

    # --- the first import: a name clash with a profile created here ("Fabric Survival (2)")
    status, created, _ = api("POST", "/api/profiles", {"name": "Fabric Survival", "minecraftVersion": "1.21.1", "loader": "fabric", "loaderVersion": "0.16.5"})
    check("create the profile that forces the name suffix", status == 201, (status, created))
    status, job, raw = api("POST", "/api/imports", {"items": [{"launcher": "prism", "key": fab_key}]})
    check("import -> 202 with a job of kind import", status == 202 and job and job.get("kind") == "import" and job.get("state") == "running", (status, raw[:200]))
    job = wait_job(job["id"])
    check("import job done", job and job["state"] == "done", job)
    item = job["result"]["items"][0] if job and job.get("result") else {}
    check("symlink in the game folder -> partial, the link listed",
          item.get("result") == "partial" and any(n["path"] == "mods/link.jar" and "symbolic link" in n["reason"] for n in item.get("notCopied", [])), item)
    check("the copy counted the three regular files", item.get("copiedFiles") == 3, item)
    check("the imported name gets the suffix (2)", item.get("name") == "Fabric Survival (2)", item)
    p = named_profile("Fabric Survival (2)")
    check("imported profile keeps 1.21.1 / fabric 0.16.5 / java / JVM args",
          p and p["minecraftVersion"] == "1.21.1" and p["loader"] == "fabric" and p["loaderVersion"] == "0.16.5"
          and p["javaPath"] == "/opt/java/bin/java" and p["jvmArgs"] == "-Xss1M", p)
    pdir = profile_dir_of(p["id"]) if p else ""
    copied = tree_hashes(pdir) if pdir else {}
    src = before_hashes["prism"]
    check("copy has mods/sodium.jar, config and save, byte for byte",
          copied.get(os.path.join("mods", "sodium.jar")) == src.get(os.path.join("mods", "sodium.jar"))
          and copied.get(os.path.join("config", "options.toml")) == src.get(os.path.join("config", "options.toml"))
          and copied.get(os.path.join("saves", "World1", "level.dat")) == src.get(os.path.join("saves", "World1", "level.dat")),
          sorted(copied))
    check("the link was not copied", os.path.join("mods", "link.jar") not in copied, sorted(copied))
    leaked = False
    for dirpath, _, filenames in os.walk(pdir) if pdir else []:
        for name in filenames:
            with open(os.path.join(dirpath, name), "rb") as f:
                leaked = leaked or b"SECRET-OUTSIDE-FILE" in f.read()
    check("nothing outside the link target reached the profile", not leaked)

    # --- a batch of seven, then a second import of the same launcher folder (suffix (2))
    batch = [
        ("atlauncher", find_profile(scan, "atlauncher", "All The Mods")["key"], "All The Mods"),
        ("gdlauncher", find_profile(scan, "gdlauncher", "GD Test")["key"], "GD Test"),
        ("ftb", find_profile(scan, "ftb", "FTB Skies")["key"], "FTB Skies"),
        ("curseforge", find_profile(scan, "curseforge", "CF Pack")["key"], "CF Pack"),
        ("vanilla", vanilla_key, "Vanilla 1.20.6"),
        ("prism", find_profile(scan, "prism", "Vanilla Copy")["key"], "Vanilla Copy"),
    ]
    if MODE == "main":
        batch.append(("modrinth", find_profile(scan, "modrinth", "Modrinth Pack")["key"], "Modrinth Pack"))
        batch.append(("norisk", find_profile(scan, "norisk", "NoRisk One")["key"], "NoRisk One"))
    status, job, raw = api("POST", "/api/imports", {"items": [{"launcher": l, "key": k} for l, k, _ in batch]})
    check("batch import -> 202", status == 202, (status, raw[:200]))
    job = wait_job(job["id"])
    results = job["result"]["items"] if job and job.get("result") else []
    check("batch: every item done", len(results) == len(batch) and all(r["result"] == "done" for r in results), results)
    check("batch: job counts done/partial/failed",
          job["result"]["done"] == len(batch) and job["result"]["partial"] == 0 and job["result"]["failed"] == 0, job and job.get("result"))
    expected_files = {
        "All The Mods": [os.path.join("mods", "atm.jar")],
        "GD Test": [os.path.join("mods", "gd.jar")],
        "FTB Skies": [os.path.join("mods", "ftb.jar")],
        "CF Pack": [os.path.join("mods", "cf.jar")],
        "Vanilla 1.20.6": [os.path.join("options.txt"), os.path.join("saves", "Survival", "level.dat")],
        "Vanilla Copy": [os.path.join("options.txt")],
        "Modrinth Pack": [os.path.join("mods", "mr.jar")],
        "NoRisk One": [os.path.join("mods", "nr.jar")],
    }
    for _, _, name in batch:
        profile = named_profile(name)
        files = tree_hashes(profile_dir_of(profile["id"])) if profile else {}
        check("copied into the profile: " + name,
              profile is not None and all(f in files for f in expected_files[name]), (name, sorted(files)))
    vanilla_profile = named_profile("Vanilla 1.20.6")
    ftb_profile = named_profile("FTB Skies")
    check("FTB custom Java (embeddedJre false) and JVM args imported",
          ftb_profile and ftb_profile["javaPath"] == "/usr/lib/jvm/java-21/bin/java" and ftb_profile["jvmArgs"] == "-XX:+UseG1GC", ftb_profile)
    check("vanilla copy does not contain launcher_profiles.json",
          vanilla_profile is not None and "launcher_profiles.json" not in tree_hashes(profile_dir_of(vanilla_profile["id"])))
    nr = named_profile("NoRisk One")
    check("NoRisk memory (3072 MB) and custom JVM args mapped",
          nr and nr["memoryMb"] == 3072 and nr["jvmArgs"] == "-Dtest=1" and nr["javaPath"] == "/opt/java/bin/java", nr)

    status, job, _ = api("POST", "/api/imports", {"items": [{"launcher": "atlauncher", "key": find_profile(scan, "atlauncher", "All The Mods")["key"]}]})
    job = wait_job(job["id"])
    item = job["result"]["items"][0]
    check("second import of the same folder gets (2)", item["result"] == "done" and item["name"] == "All The Mods (2)", item)

    # --- the sources are read only
    after_hashes = {k: tree_hashes(v) for k, v in sources.items()}
    check("source folders unchanged after the imports (checksums)", before_hashes == after_hashes)
    check("the vanilla launcher_profiles.json is unchanged", os.path.isfile(os.path.join(HOME, ".minecraft", "launcher_profiles.json")))
    launcher_after = {d: tree_hashes(d) for d in launcher_dirs}
    check("launcher folders unchanged (no file added, changed or removed, no -wal or -shm)",
          launcher_before == launcher_after and not any(k.endswith(("-wal", "-shm")) for d in launcher_after.values() for k in d))


def nosqlite_checks():
    status, scan, raw = api("GET", "/api/imports/scan")
    check("scan without sqlite3 -> 200 with JSON", status == 200 and scan is not None, (status, raw[:200]))
    if scan is not None:
        scan_checks(scan, False)


if MODE == "main":
    main_checks()
elif MODE == "nosqlite":
    nosqlite_checks()
else:
    print("check.py: unknown mode " + MODE)
    sys.exit(2)

print("")
print("%d failed" % len(FAILS))
sys.exit(1 if FAILS else 0)
