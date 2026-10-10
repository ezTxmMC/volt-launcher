# Fixtures of tests/logo/run.sh: profiles.json, a client jar with the two block textures,
# a cached modpack icon and the expected data URLs. Everything is written into the
# temporary data directory given as the first argument; the repository is not touched.
# The expected values come from base64 and zipfile here, not from the code under test.
import base64
import json
import os
import struct
import sys
import zipfile
import zlib

out = sys.argv[1]


def png(rgb):
    def chunk(kind, data):
        return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data) & 0xFFFFFFFF)
    raw = b"\x00" + bytes(rgb)
    return (b"\x89PNG\r\n\x1a\n"
            + chunk(b"IHDR", struct.pack(">IIBBBBB", 1, 1, 8, 2, 0, 0, 0))
            + chunk(b"IDAT", zlib.compress(raw))
            + chunk(b"IEND", b""))


def data_url(data):
    return "data:image/png;base64," + base64.b64encode(data).decode()


grass = png((95, 160, 60))
dirt = png((134, 96, 67))
pack = png((0, 128, 255))
custom = png((255, 0, 0))
marker = png((1, 2, 3))

ids = {
    "custom": "aaaaaaaaaaa1",
    "modpack": "aaaaaaaaaaa2",
    "vanillaRelease": "aaaaaaaaaaa3",
    "vanillaSnapshot": "aaaaaaaaaaa4",
    "vanillaNoJar": "aaaaaaaaaaa5",
    "loaderNoJar": "aaaaaaaaaaa6",
    "loaderWithJar": "aaaaaaaaaaa7",
    "deletedPack": "aaaaaaaaaaa8",
}


def profile(key, name, mc, loader, icon=None, source=None):
    return {
        "id": ids[key], "name": name, "minecraftVersion": mc, "loader": loader,
        "loaderVersion": None, "iconUrl": icon, "source": source,
        "createdAt": "2026-10-10T12:00:00Z",
    }


modpack_source = {"provider": "modrinth", "projectId": "fixturepack", "versionId": "v1",
                  "name": "Fixture Pack", "kind": "modpack"}
deleted_source = {"provider": "modrinth", "projectId": "deletedpack0000", "versionId": "v1",
                  "name": "Gone", "kind": "modpack"}

profiles = [
    profile("custom", "Custom", "1.21.1", "vanilla", icon=data_url(custom)),
    profile("modpack", "Linked", "1.21.1", "fabric", source=modpack_source),
    profile("vanillaRelease", "Vanilla release", "1.21.1", "vanilla"),
    profile("vanillaSnapshot", "Vanilla snapshot", "24w14a", "vanilla"),
    profile("vanillaNoJar", "Vanilla no jar", "1.20.4", "vanilla"),
    profile("loaderNoJar", "Fabric no jar", "1.20.4", "fabric"),
    profile("loaderWithJar", "Forge with jar", "1.21.1", "forge"),
    profile("deletedPack", "Deleted pack", "1.21.1", "fabric", source=deleted_source),
]
with open(os.path.join(out, "profiles.json"), "w") as f:
    json.dump(profiles, f, indent=2)

# The client jars: release 1.21.1 (also used by the forge profile) and snapshot 24w14a.
# 1.20.4 gets no jar at all (the game was never installed).
for mc in ["1.21.1", "24w14a"]:
    folder = os.path.join(out, "shared", "versions", mc)
    os.makedirs(folder)
    with zipfile.ZipFile(os.path.join(folder, mc + ".jar"), "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("META-INF/MANIFEST.MF", "Manifest-Version: 1.0\n")
        z.writestr("assets/minecraft/textures/block/grass_block_side.png", grass)
        z.writestr("assets/minecraft/textures/block/dirt.png", dirt)

# The pack icon the modpack profile finds in the cache (no network needed for it).
cache = os.path.join(out, "cache", "logos")
os.makedirs(cache)
with open(os.path.join(cache, "modrinth-fixturepack.png"), "wb") as f:
    f.write(pack)
# A cache file that is not a plain name is never read: no path can be built from a project id.

expect = {
    "custom": data_url(custom),
    "pack": data_url(pack),
    "grass": data_url(grass),
    "dirt": data_url(dirt),
    "marker": data_url(marker),
}
with open(os.path.join(out, "expect.json"), "w") as f:
    json.dump(expect, f, indent=2)
with open(os.path.join(out, "marker.png"), "wb") as f:
    f.write(marker)
print("fixtures written to " + out)
