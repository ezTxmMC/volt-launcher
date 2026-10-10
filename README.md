# VoltLauncher

Ein moderner Minecraft-Launcher: mehrere Konten, alle gängigen Mod-Loader und Inhalte von Modrinth,
CurseForge, Technic und FTB.

Der Launcher besteht aus zwei Teilen, die über einen lokalen HTTP-Dienst reden. Die Architektur und
der API-Vertrag stehen in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), der Stand des Funktionsumfangs
in [docs/FEATURE-PORT.md](docs/FEATURE-PORT.md).

| Teil | Inhalt |
| --- | --- |
| `app/` | Electron-App mit React, TypeScript, react-router, Tailwind und Iconify. Startet das Backend als Subprozess. |
| `backend/` | Backend in [Novus](https://github.com/ezTxmMC/novus): Profile, Mods, Inhalte, Launch, Konten, Spieldaten, System. |
| `bridge/` | Node-Dienst, der den CurseForge-API-Schlüssel hält (siehe unten). |
| `docs/` | Architektur, API-Vertrag, Feature-Stand. |

## Entwicklung

Voraussetzungen: Node mit pnpm, und der Novus-Compiler `novusc` im `PATH`.

```bash
# 1. Backend bauen (erzeugt backend/dist/volt-backend)
cd backend && scripts/build.sh && scripts/smoke.sh && cd ..

# 2. App starten (startet das Backend selbst)
cd app && pnpm install && pnpm dev

# Oberfläche im Browser mit Mock-Daten, ohne Backend
cd app && pnpm dev:web
```

Tests der einzelnen Module liegen in `backend/tests/` (zum Teil mit Netzwerkzugriff, siehe Skriptkopf).

## Paketieren

Ein Lauf erzeugt alle Ziele. Die Backend-Binaries werden vorher für jedes Ziel gebaut:

```bash
cd backend && scripts/build-release.sh     # alle Ziele nach backend/dist/<os>-<arch>/
cd app && pnpm package                     # alle Linux-, Windows- und macOS-Ziele nach app/release/
cd app && node scripts/package.mjs win-x64 # nur ein Ziel
```

| Ziel | Formate | Gebaut auf |
| --- | --- | --- |
| `linux-x64`, `linux-arm64` | AppImage, deb, rpm, zip, tar.gz, flatpak | Linux (deb/rpm über Docker, siehe unten) |
| `win-x64`, `win-arm64` | exe (NSIS), msi, zip | Linux mit Wine, oder Windows |
| `mac-arm64` | dmg, zip | macOS für das DMG (`app/scripts/package-mac.sh`), ZIP auch unter Linux |

Hinweise:
- **deb und rpm** brauchen `dpkg-deb` und `rpmbuild`. Auf Systemen ohne diese Werkzeuge läuft der Build im Container
  `electronuserland/builder` (mit `docker run`, Projekt und Electron-Cache einbinden).
- **flatpak** braucht `flatpak-builder` und die Laufzeiten `org.freedesktop.Platform//24.08`,
  `org.freedesktop.Sdk//24.08` und `org.electronjs.Electron2.BaseApp//24.08` (pro Architektur).
- **macOS-DMG** lässt sich nur auf macOS erstellen (`hdiutil`, `sips`). Die Builds sind nicht signiert und nicht notarisiert.
- Prüfsummen aller Artefakte stehen in `app/release/SHA256SUMS.txt`.

## CurseForge

CurseForge verlangt einen Entwicklerschlüssel, der nicht in einen Client gehört. Der `bridge/`-Dienst
hält den Schlüssel und leitet Anfragen weiter. Schlüssel in `bridge/.env` eintragen und mit `npm start`
im Ordner `bridge/` starten. Standardadresse: `http://localhost:8787` (unter den Einstellungen änderbar).
Ohne Bridge bleiben Modrinth, Technic und FTB voll nutzbar, CurseForge wird als nicht verfügbar angezeigt.

## Discord-Präsenz

Dafür braucht es eine Discord-Application-ID, die unter den Einstellungen eingetragen wird. Ohne sie
meldet der Launcher den Status „nicht konfiguriert“.

## Hinweise zum Stand

Die Java-Version (`volt-*`, `ui/`) wurde durch dieses Projekt ersetzt. Sie ist in der Git-Historie unter
Commit `03a34ad` erhalten.
