# Builds the fixtures for unit.nv and serves them over HTTP.
#   python3 -I fixtures.py <dir>          writes the fixture files, prints their hashes as JSON
#   python3 -I fixtures.py <dir> serve    serves <dir> on a free port (prints "PORT <n>"),
#                                         /redirect/<name> answers 302 -> /<name>
import hashlib
import http.server
import json
import os
import sys
import zipfile


def write_zip(path, entries):
    with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as z:
        for name, data in entries:
            z.writestr(name, data)


def build(d):
    os.makedirs(d, exist_ok=True)
    # A Technic client zip inside a wrapper folder named after the pack.
    write_zip(os.path.join(d, "wrapped.zip"), [
        ("MyPack/bin/version.json", json.dumps({"id": "1.7.10-Forge10.13.4.1558-1.7.10", "inheritsFrom": "1.7.10"})),
        ("MyPack/mods/a.jar", b"jar a" * 100),
        ("MyPack/config/a.cfg", "x=1"),
    ])
    # A Solder mod zip: rooted at the game directory, a single top folder "mods".
    write_zip(os.path.join(d, "solder.zip"), [("mods/x.jar", b"x" * 1000)])
    # A client zip whose only top folder is a game folder: must not be stripped.
    write_zip(os.path.join(d, "configonly.zip"), [("config/a.cfg", "a"), ("config/b/c.cfg", "c")])
    # A client zip at the root with only bin/modpack.jar (the real Technic layout).
    jar = os.path.join(d, "modpack.jar")
    write_zip(jar, [("version.json", json.dumps({"id": "1.7.10-Forge10.13.4.1558-1.7.10", "inheritsFrom": "1.7.10"}))])
    write_zip(os.path.join(d, "rootclient.zip"), [("bin/modpack.jar", open(jar, "rb").read()), ("mods/m.jar", b"m" * 10)])
    # A zip with a corrupted entry (CRC must catch it).
    good = os.path.join(d, "crc.zip")
    with zipfile.ZipFile(good, "w", zipfile.ZIP_STORED) as z:
        z.writestr("file.txt", b"A" * 64)
    raw = bytearray(open(good, "rb").read())
    at = raw.find(b"A" * 64)
    raw[at] = ord("B")
    open(good, "wb").write(bytes(raw))
    # A plain download.
    payload = os.urandom(5000) + b"volt"
    open(os.path.join(d, "payload.bin"), "wb").write(payload)
    print(json.dumps({
        "md5": hashlib.md5(payload).hexdigest(),
        "sha1": hashlib.sha1(payload).hexdigest(),
        "sha256": hashlib.sha256(payload).hexdigest(),
        "sha512": hashlib.sha512(payload).hexdigest(),
    }))


class Handler(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        if self.path.startswith("/redirect/"):
            self.send_response(302)
            self.send_header("Location", "/" + self.path[len("/redirect/"):])
            self.end_headers()
            return
        super().do_GET()

    def log_message(self, *args):
        pass


if __name__ == "__main__":
    directory = sys.argv[1]
    if len(sys.argv) > 2 and sys.argv[2] == "serve":
        os.chdir(directory)
        server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        print("PORT", server.server_address[1], flush=True)
        server.serve_forever()
    else:
        build(directory)
