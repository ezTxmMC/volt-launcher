#!/usr/bin/env python3
"""Builds the fixture home of tests/imports/run.sh.

usage: fixtures.py <home> <outside>

<home> is used as VOLT_IMPORT_HOME: it holds one instance per launcher in the layout
docs/IMPORT-FORMATS.md gives for Linux. <outside> is a folder next to it that a symbolic
link in a game folder points to (the copy must never reach it).
"""
import json
import os
import sqlite3
import sys

HOME = os.path.abspath(sys.argv[1])
OUTSIDE = os.path.abspath(sys.argv[2])


def write(path, data):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    mode = "wb" if isinstance(data, bytes) else "w"
    with open(path, mode) as f:
        f.write(data)


def jar(path, tag):
    write(path, (tag + "\n").encode() * 200)


def j(obj):
    return json.dumps(obj, indent=2)


# --- outside the home: the link target that must never be copied
write(os.path.join(OUTSIDE, "secret.jar"), b"SECRET-OUTSIDE-FILE\n")

# --- Prism Launcher (verified): instance.cfg + mmc-pack.json, game folder minecraft/
prism = os.path.join(HOME, ".local", "share", "PrismLauncher", "instances")
fabric = os.path.join(prism, "Fabric Survival")
write(os.path.join(fabric, "instance.cfg"),
      "name=Fabric Survival\niconKey=default\nOverrideJavaArgs=true\nJvmArgs=-Xss1M\n"
      "OverrideJavaLocation=true\nJavaPath=/opt/java/bin/java\nOverrideMemory=true\n"
      "MinMemAlloc=512\nMaxMemAlloc=4096\n")
write(os.path.join(fabric, "mmc-pack.json"), j({
    "formatVersion": 1,
    "components": [
        {"uid": "net.minecraft", "version": "1.21.1", "important": True},
        {"uid": "net.fabricmc.intermediary", "version": "1.21.1"},
        {"uid": "net.fabricmc.fabric-loader", "version": "0.16.5"},
        {"uid": "org.lwjgl3", "version": "3.3.3"},
    ]}))
jar(os.path.join(fabric, "minecraft", "mods", "sodium.jar"), "sodium")
write(os.path.join(fabric, "minecraft", "config", "options.toml"), "fov = 90\n")
write(os.path.join(fabric, "minecraft", "saves", "World1", "level.dat"), b"\x00\x01level" * 50)
# A link out of the game folder: listed as not copied, never followed.
os.makedirs(os.path.join(fabric, "minecraft", "mods"), exist_ok=True)
os.symlink(os.path.join(OUTSIDE, "secret.jar"), os.path.join(fabric, "minecraft", "mods", "link.jar"))

# A Prism instance with the older .minecraft game folder and no loader component.
vanilla_copy = os.path.join(prism, "Vanilla Copy")
write(os.path.join(vanilla_copy, "instance.cfg"), "name=Vanilla Copy\n")
write(os.path.join(vanilla_copy, "mmc-pack.json"), j({
    "formatVersion": 1, "components": [{"uid": "net.minecraft", "version": "1.20.4"}]}))
write(os.path.join(vanilla_copy, ".minecraft", "options.txt"), "lang:en_us\n")

# --- ATLauncher (community paths, verified format): <base>/instances/<folder>/instance.json
atl = os.path.join(HOME, ".local", "share", "ATLauncher", "instances", "Atm")
write(os.path.join(atl, "instance.json"), j({
    "uuid": "atm-1", "id": "1.20.1",
    "launcher": {
        "name": "All The Mods",
        "loaderVersion": {"version": "47.3.0", "rawVersion": "forge-47.3.0", "recommended": True, "type": "forge"},
        "javaArguments": "-Xmx4G", "javaPath": None, "maximumMemory": 4096,
    }}))
jar(os.path.join(atl, "mods", "atm.jar"), "atm")

# --- GDLauncher (community paths): <userData>/instances/<name>/config.json
gd = os.path.join(HOME, ".config", "gdlauncher_next", "instances", "GD Test")
write(os.path.join(gd, "config.json"), j({
    "loader": {"loaderType": "fabric", "mcVersion": "1.19.4", "loaderVersion": "0.14.22"},
    "javaArgs": "-Xmx2G", "customJavaPath": "/opt/jdk/bin/java", "javaMemory": 2048, "mods": []}))
jar(os.path.join(gd, "mods", "gd.jar"), "gd")

# GDLauncher, the old format: modloader = [loaderType, mcVersion, loaderVersion, ...]
gd_old = os.path.join(HOME, ".config", "gdlauncher_next", "instances", "GD Old")
write(os.path.join(gd_old, "config.json"), j({"modloader": ["forge", "1.12.2", "14.23.5.2859", 0, 0, "curse"], "javaArgs": "-Xmx1G"}))

# --- FTB App (verified): <home>/.ftba/instances/<folder>/instance.json
ftb = os.path.join(HOME, ".ftba", "instances")
write(os.path.join(ftb, "ftb skies", "instance.json"), j({
    "uuid": "ftb-1", "name": "FTB Skies", "mcVersion": "1.21.1", "modLoader": "NeoForge",
    "jvmArgs": "-XX:+UseG1GC", "embeddedJre": False, "jrePath": "/usr/lib/jvm/java-21/bin/java",
    "memory": 6144}))
jar(os.path.join(ftb, "ftb skies", "mods", "ftb.jar"), "ftb")
write(os.path.join(ftb, "quilt pack", "instance.json"), j({
    "uuid": "ftb-2", "name": "Quilt Pack", "mcVersion": "1.20.1", "modLoader": "quilt"}))
# 41 GiB apparent size (a sparse file): the import must refuse it with 409.
write(os.path.join(ftb, "huge", "instance.json"), j({
    "uuid": "ftb-3", "name": "Huge", "mcVersion": "1.20.1", "modLoader": "fabric"}))
os.makedirs(os.path.join(ftb, "huge", "mods"), exist_ok=True)
with open(os.path.join(ftb, "huge", "mods", "huge.bin"), "wb") as f:
    f.truncate(41 * 1024 ** 3)

# --- HMCL: <base>/versions/<id>/<id>.json and .hmcl/config/instance-game-settings.json
mc = os.path.join(HOME, ".minecraft")
write(os.path.join(mc, "versions", "hmcl-1.21", "hmcl-1.21.json"), j({"id": "hmcl-1.21"}))
write(os.path.join(mc, "versions", "hmcl-1.21", ".hmcl", "config", "instance-game-settings.json"),
      j({"javaType": "custom", "customJavaPath": "/opt/java/bin/java", "jvmOptions": "-Xms1G"}))
# A vanilla version folder without .hmcl is not an HMCL profile.
write(os.path.join(mc, "versions", "1.21.1", "1.21.1.json"), j({"id": "1.21.1"}))

# --- Vanilla launcher (documented): .minecraft/launcher_profiles.json (holds a token)
vanilla_game = os.path.join(HOME, "vanilla-game")
write(os.path.join(vanilla_game, "options.txt"), "fov:70\n")
write(os.path.join(vanilla_game, "saves", "Survival", "level.dat"), b"vanilla" * 30)
write(os.path.join(mc, "launcher_profiles.json"), j({
    "profiles": {
        "vanilla-1": {"name": "Vanilla 1.20.6", "type": "custom", "lastVersionId": "1.20.6",
                      "gameDir": vanilla_game, "javaArgs": "-Xmx2G", "javaDir": "/usr/bin/java"},
        "shared": {"name": "Shared", "type": "custom", "lastVersionId": "1.20.6"},
        "fabric": {"name": "Fabric Loader", "type": "custom", "lastVersionId": "fabric-loader-0.16.5-1.20.6"},
    },
    "authenticationDatabase": {"account": {"accessToken": "SECRET-TOKEN-XYZ"}},
    "clientToken": "SECRET-CLIENT-TOKEN",
}))

# --- CurseForge app (community format): <root>/Instances/<name>/minecraftinstance.json
cf = os.path.join(HOME, "curseforge", "minecraft", "Instances", "CF Pack")
write(os.path.join(cf, "minecraftinstance.json"), j({
    "name": "CF Pack", "gameVersion": "1.20.1",
    "baseModLoader": {"name": "forge-47.2.0", "minecraftVersion": "1.20.1"},
    "javaArgsOverride": "-Xmx3G", "isMemoryOverride": True, "allocatedMemory": 3072}))
jar(os.path.join(cf, "mods", "cf.jar"), "cf")

# --- Modrinth App (documented; the join columns are not in the document, see sqlite.nv):
#     <settings>/app.db and <settings>/profiles/<path>
mr_root = os.path.join(HOME, ".local", "share", "ModrinthApp")
os.makedirs(mr_root, exist_ok=True)
con = sqlite3.connect(os.path.join(mr_root, "app.db"))
con.executescript("""
PRAGMA journal_mode=WAL;
CREATE TABLE instances (id INTEGER PRIMARY KEY, path TEXT UNIQUE, name TEXT, applied_content_set_id INTEGER);
CREATE TABLE instance_content_sets (id INTEGER PRIMARY KEY, game_version TEXT, loader TEXT, loader_version TEXT);
INSERT INTO instance_content_sets VALUES (1, '1.20.4', 'fabric', '0.15.11');
INSERT INTO instances VALUES (1, 'mr pack', 'Modrinth Pack', 1);
""")
con.commit()
con.close()
jar(os.path.join(mr_root, "profiles", "mr pack", "mods", "mr.jar"), "mr")

# --- NoRisk Client (community paths, verified table layout): meta/app.db, profiles/<path>
nr_root = os.path.join(HOME, ".local", "share", "NoRiskClientV3")
os.makedirs(os.path.join(nr_root, "meta"), exist_ok=True)
con = sqlite3.connect(os.path.join(nr_root, "meta", "app.db"))
con.executescript("""
PRAGMA journal_mode=WAL;
CREATE TABLE profiles (id TEXT PRIMARY KEY, name TEXT, path TEXT, game_version TEXT, loader TEXT,
    loader_version TEXT, settings TEXT, use_shared_minecraft_folder INTEGER);
""")
con.execute("INSERT INTO profiles VALUES (?, ?, ?, ?, ?, ?, ?, ?)", (
    "p1", "NoRisk One", "norisk-one", "1.21.4", "neoforge", "21.4.1",
    json.dumps({"java_path": "/opt/java/bin/java", "use_custom_java_path": True,
                "memory": {"min": 512, "max": 3072}, "custom_jvm_args": "-Dtest=1"}), 0))
con.commit()
con.close()
jar(os.path.join(nr_root, "profiles", "norisk-one", "mods", "nr.jar"), "nr")

print("fixtures written to " + HOME)
