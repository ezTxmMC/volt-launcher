#!/usr/bin/env python3
"""Packs PNG files into a macOS .icns container.

ImageMagick has no ICNS write delegate on most Linux builds, and libicns
(png2icns) is not packaged everywhere, so the container is assembled by hand.
The format is a header plus a flat list of type-tagged elements, and every
element type used here accepts a plain PNG payload.

Usage: make-icns.py <out.icns> <size>:<file.png> [<size>:<file.png> ...]
"""

import struct
import sys

# OSType -> pixel size of the PNG it expects.
TYPES = [
    (b"icp4", 16), (b"icp5", 32), (b"ic11", 32), (b"ic12", 64),
    (b"ic07", 128), (b"ic13", 256), (b"ic08", 256), (b"ic14", 512),
    (b"ic09", 512), (b"ic10", 1024),
]


def main(argv):
    if len(argv) < 3:
        sys.exit(__doc__)

    out_path = argv[1]
    sources = {}
    for arg in argv[2:]:
        size, _, path = arg.partition(":")
        with open(path, "rb") as handle:
            sources[int(size)] = handle.read()

    elements = []
    for ostype, size in TYPES:
        payload = sources.get(size)
        if payload is None:
            continue
        elements.append(ostype + struct.pack(">I", len(payload) + 8) + payload)

    if not elements:
        sys.exit("make-icns.py: none of the given sizes map to an icns type")

    body = b"".join(elements)
    with open(out_path, "wb") as handle:
        handle.write(b"icns" + struct.pack(">I", len(body) + 8) + body)


if __name__ == "__main__":
    main(sys.argv)
