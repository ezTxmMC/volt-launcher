# VoltLauncher — neue Architektur

Der Launcher besteht aus zwei getrennten Teilen, die über einen lokalen HTTP-Dienst reden.
Das alte Java-Backend (`volt-*`) und `ui/` bleiben vorerst unberührt; das Neue lebt in
`app/` und `backend/`.

```
┌──────────────────────── app/ (Electron) ────────────────────────┐
│  main process                    renderer (React)               │
│  ├─ wählt freien Port + Token    ├─ react-router Seiten         │
│  ├─ startet backend/ als         ├─ ruft window.volt.api(...)   │
│  │  Subprozess (spawn)           │   (preload → IPC → main)     │
│  ├─ proxied API-Aufrufe   ◄──────┘                              │
│  └─ beendet Backend beim Schließen                              │
└──────────────┬──────────────────────────────────────────────────┘
               │ HTTP 127.0.0.1:<port>, Header X-Volt-Token
┌──────────────▼─────────── backend/ (Novus) ─────────────────────┐
│  http-Server (net) → Router → Module                             │
│  ├─ settings, profiles, jobs      (core)                         │
│  ├─ mods        (Dateiscan, Metadaten, Update-Prüfung)           │
│  ├─ providers   (Modrinth, CurseForge-Bridge, Technic, FTB)      │
│  └─ launch      (Minecraft-Installation, Java, Start)            │
└─────────────────────────────────────────────────────────────────┘
```

## Prozess-Logik

1. Electron (main) sucht einen freien TCP-Port auf `127.0.0.1` und erzeugt ein zufälliges
   Token (32 Byte, hex).
2. Electron startet das Backend als Kindprozess:
   `volt-backend --port <port> --token <token> --data-dir <dir>`.
   Die Binary liegt in `backend/dist/` (Entwicklung) bzw. in `resources/backend/` (gepackt).
3. Electron pollt `GET /api/health`, bis das Backend antwortet (Timeout 15 s).
4. Die Renderer-Seite spricht **nie direkt** mit dem Backend. Sie ruft
   `window.volt.api(method, path, body?)` auf; der Preload schickt das per IPC an den
   main-Prozess, der die HTTP-Anfrage mit Token ausführt. Dadurch braucht das Backend kein CORS,
   und das Token verlässt den main-Prozess nie.
5. Beim Beenden von Electron wird der Kindprozess beendet.

Das Backend beendet sich nicht von selbst; es ist ein reiner Dienst.

## HTTP-Konventionen

- Alle Pfade beginnen mit `/api`. Jeder Request braucht `X-Volt-Token`; ohne gültiges Token
  antwortet das Backend mit `401`.
- Body und Antwort sind JSON (`Content-Type: application/json; charset=utf-8`).
- Fehler: HTTP-Status plus
  `{"error": {"code": "not_found" | "bad_request" | "conflict" | "upstream" | "internal", "message": "…"}}`.
- Zeitstempel: ISO-8601 in UTC (`2026-10-10T12:00:00Z`).
- IDs: Profile-IDs sind 12-stellige Hex-Strings. Job-IDs sind 12-stellige Hex-Strings.
- Lange Vorgänge laufen als **Job**: der Endpunkt antwortet sofort mit `202` und einem Job,
  der Fortschritt wird über `GET /api/jobs/:id` abgefragt (Polling, ca. alle 500 ms).

## Datenmodelle

**Settings**

```json
{
  "language": "de",
  "theme": "system",
  "memoryMb": 4096,
  "bridgeUrl": "https://bridge.volt-launcher.app",
  "javaPath": null,
  "closeOnLaunch": false,
  "downloadThreads": 6
}
```

**Profile**

```json
{
  "id": "a1b2c3d4e5f6",
  "name": "Survival",
  "minecraftVersion": "1.21.1",
  "loader": "fabric",
  "loaderVersion": "0.16.5",
  "memoryMb": null,
  "javaPath": null,
  "jvmArgs": "",
  "gameDir": "<dataDir>/profiles/a1b2c3d4e5f6",
  "createdAt": "2026-10-10T12:00:00Z",
  "lastPlayed": null,
  "source": null
}
```

`loader` ist einer von `vanilla | fabric | quilt | forge | neoforge`. `memoryMb: null` bedeutet
"globalen Wert aus den Settings verwenden". `source` ist `null` oder
`{"provider": "modrinth", "projectId": "…", "versionId": "…", "name": "…", "kind": "modpack"}`
und sagt, woher ein Modpack stammt (wichtig für spätere Pack-Updates).

**ModFile** (Eintrag aus `<gameDir>/mods`)

```json
{
  "fileName": "sodium-fabric-0.6.0.jar",
  "enabled": true,
  "size": 1234567,
  "sha1": "…",
  "metadata": {
    "loader": "fabric",
    "modId": "sodium",
    "name": "Sodium",
    "version": "0.6.0",
    "description": "…"
  },
  "source": {
    "provider": "modrinth",
    "projectId": "AANobbMI",
    "versionId": "…",
    "versionNumber": "0.6.0",
    "name": "Sodium"
  },
  "update": null
}
```

- `enabled` ist `false`, wenn die Datei auf `.jar.disabled` endet. Umschalten benennt nur um.
- `metadata` kommt aus dem Jar (fabric.mod.json, quilt.mod.json, META-INF/mods.toml,
  META-INF/neoforge.mods.toml, mcmod.info). Fehlt Metadaten, ist `loader` `"unknown"`.
- `source` ist `null`, wenn der Hash bei keinem Provider bekannt ist.
- `update` ist `null` oder `{"versionId", "versionNumber", "fileName", "sha1", "url", "gameVersions": [...], "loaders": [...]}`.

**Job**

```json
{
  "id": "0f1e2d3c4b5a",
  "kind": "pack-install",
  "title": "Installiere All the Mods 10",
  "state": "running",
  "progress": 0.42,
  "message": "Lade 12 / 30 Dateien",
  "error": null,
  "result": null,
  "createdAt": "2026-10-10T12:00:00Z",
  "finishedAt": null
}
```

`state` ist `running | done | failed | cancelled`. `progress` liegt in `0.0 … 1.0`.
`result` wird bei `done` gesetzt, z. B. `{"profileId": "…"}` nach einer Pack-Installation.

**ProjectSummary** (Discover)

```json
{
  "provider": "modrinth",
  "id": "AANobbMI",
  "slug": "sodium",
  "name": "Sodium",
  "summary": "…",
  "iconUrl": "https://…",
  "author": "jellysquid3",
  "downloads": 123456,
  "kind": "mod",
  "categories": ["optimization"]
}
```

`provider` ist `modrinth | curseforge | technic | ftb`. `kind` ist `mod | modpack | resourcepack | shader | datapack`.

## Endpunkte

### Allgemein

| Methode | Pfad | Beschreibung |
| --- | --- | --- |
| GET | `/api/health` | `{"status": "ok", "version": "…", "dataDir": "…"}`; ohne Token erreichbar |
| GET | `/api/settings` | Settings |
| PATCH | `/api/settings` | Teil-Update, gibt die vollständigen Settings zurück |
| GET | `/api/jobs` | alle Jobs, neueste zuerst |
| GET | `/api/jobs/:id` | ein Job |
| POST | `/api/jobs/:id/cancel` | Abbruch anfordern |

### Profile

| Methode | Pfad | Beschreibung |
| --- | --- | --- |
| GET | `/api/profiles` | Liste |
| POST | `/api/profiles` | `{name, minecraftVersion, loader, loaderVersion?}` → Profile (201) |
| GET | `/api/profiles/:id` | ein Profil |
| PATCH | `/api/profiles/:id` | Felder ändern |
| DELETE | `/api/profiles/:id` | löscht Profil und Dateien |

### Mods

| Methode | Pfad | Beschreibung |
| --- | --- | --- |
| GET | `/api/profiles/:id/mods` | scannt `mods/` und liefert `ModFile[]`; erkannte Quellen und Updates sind enthalten, sofern bereits geprüft |
| POST | `/api/profiles/:id/mods/identify` | Job: Hashes an Modrinth schicken, `source` setzen |
| POST | `/api/profiles/:id/mods/check-updates` | Job: `update` für alle identifizierten Mods setzen |
| POST | `/api/profiles/:id/mods/:fileName/update` | Job: Mod auf `update` aktualisieren (altes Jar wird nach `mods/.volt-backup/` verschoben) |
| POST | `/api/profiles/:id/mods/update-all` | Job: alle verfügbaren Updates einspielen |
| POST | `/api/profiles/:id/mods/:fileName/toggle` | aktiviert/deaktiviert den Mod |
| DELETE | `/api/profiles/:id/mods/:fileName` | löscht die Datei |

### Discover / Provider

| Methode | Pfad | Beschreibung |
| --- | --- | --- |
| GET | `/api/providers` | `[{id, name, kinds: [...], configured: bool, message}]` |
| GET | `/api/providers/:provider/search?q=&kind=&gameVersion=&loader=&categories=&sort=&offset=&limit=` | `{total, items: ProjectSummary[], hasMore, supports}`; `limit` 1–50 |
| GET | `/api/providers/:provider/filters?kind=` | `{kinds, sorts: [{id, label}], categories: [{id, label}], gameVersions, loaders, supports}`; leere Listen: der Anbieter kann sie nicht auflisten |
| GET | `/api/providers/:provider/projects/:id` | Detail: ProjectSummary + `description` (Markdown) + `gallery`. CurseForge liefert HTML: die Beschreibung wird in `providers/htmltext.nv` in Markdown umgewandelt (Überschriften, Listen, Links, Bilder; `/linkout`-Weiterleitungen werden aufgelöst, YouTube-iframes werden zu Links, Skripte, Stile und andere iframes entfernt). Modrinth bleibt unverändert. |
| GET | `/api/providers/:provider/projects/:id/versions?gameVersion=&loader=` | `[{id, name, versionNumber, gameVersions, loaders, fileName, downloadUrl, sha1, datePublished, dependencies}]` |
| POST | `/api/providers/packs/install` | `{provider, projectId, versionId, name?}` → Job; legt ein Profil mit `source` an. `name` (optional, getrimmt, 1–64 Zeichen, sonst 400) ist der Profilname; ohne `name` der Name des Packs. `source` nennt immer den Namen des Packs. |
| POST | `/api/profiles/:id/content/install` | `{provider, projectId, versionId, kind}` → Job; installiert eine Datei in das Profil |

### Launch

| Methode | Pfad | Beschreibung |
| --- | --- | --- |
| POST | `/api/profiles/:id/install-game` | Job: Minecraft, Loader und Libraries/Assets laden |
| POST | `/api/profiles/:id/launch` | Job: startet das Spiel (Prozess wird vom Backend überwacht); optionaler Body `quickPlay`, siehe unten |
| GET | `/api/profiles/:id/game` | `{running: bool, pid: int|null, startedAt: ISO|null}` |
| POST | `/api/profiles/:id/game/stop` | beendet den laufenden Prozess |
| GET | `/api/java` | erkannte Java-Installationen |

**Quick Play** (`launch/route.nv`, `launch/command.nv`): Der Body von `POST …/launch` darf
`{"quickPlay": {"mode": "multiplayer", "server": "host"}}` oder `{"quickPlay": {"mode": "multiplayer", "server": "host:port"}}`
oder `{"quickPlay": {"mode": "singleplayer", "world": "<Ordnername>"}}` enthalten. Ohne Body oder ohne `quickPlay`
läuft der Start unverändert.

- 400 `bad_request`: `mode` ist nicht `multiplayer` oder `singleplayer`; `server` fehlt, ist leer, länger als 255 Zeichen
  oder enthält Leerzeichen, `/` oder andere Zeichen als Buchstaben, Ziffern, `.`, `-`, `_` (IPv6 in Klammern, Port 1 bis 65535);
  `world` fehlt, ist leer, `.`, oder enthält `/`, `\` oder `..`.
- 404 `not_found`: der Weltordner fehlt in `saves/` des Profils.
- 422 `unsupported` („This Minecraft version cannot open a world from the command line.“): Singleplayer bei einer Version
  ohne Quick Play. Der Versionsname entscheidet vor dem Job (1.19 und älter, Snapshots vor 23w14a); sonst prüft der Job die Metadaten.
- Diese Antworten kommen synchron, vor dem Job. Ein gültiger Body ergibt 202 mit dem Job wie bisher.
- Versionen mit der Regel `has_quick_plays_support` (1.20 und neuer) bekommen `--quickPlayMultiplayer` bzw.
  `--quickPlaySingleplayer` über die Platzhalter; `${quickPlayPath}` zeigt auf `<Profilordner>/quickPlay/java/quickplay.json`.
- Ältere Versionen bekommen bei Multiplayer `--server <host> --port <port>` (Port 25565 ohne Angabe) nach den Spielargumenten.
- Das Launch-Log hat die Zeile `[VoltLauncher] quick play: multiplayer <server>` bzw. `singleplayer <Welt>`; die Kommandozeile
  enthält das Argument ebenfalls (Access-Token maskiert).

## Verantwortlichkeiten der Module (Novus)

- `main` — Argumente lesen, Verzeichnisse anlegen, Server starten.
- `server/` — TCP-Listener (`std/net`), HTTP/1.1-Parser, Router, JSON-Antworten, Token-Prüfung.
- `core/` — Settings-Datei, Profile-Store (`profiles.json` plus Ordner pro Profil), Job-Registry.
- `mods/` — Zip-Lesen (Zentralverzeichnis + Inflate), Jar-Metadaten, SHA-1, Modrinth-Update-Prüfung.
- `providers/` — Modrinth, CurseForge (über die Bridge), Technic, FTB. Pack-Installation.
- `launch/` — Versionsmanifest, Libraries, Assets, Natives, Java, Fabric/Quilt-Profile,
  Forge/NeoForge über den Installer, Prozessstart.

Jedes Feature-Modul exponiert genau eine Routing-Funktion:

```
method route(string verb, array<string> segments, map<string, string> query, object body): map<string, object>
```

Sie gibt `{"status": 200, "body": <JSON-fähiges Objekt>}` zurück oder wirft über
`core.fail(status, code, message)`, was der Server in die Fehler-Antwort übersetzt.
`core` ruft die Module anhand des ersten Pfadsegments nach `/api` auf (bzw. nach
`/api/profiles/:id/…` anhand des dritten Segments).

## Profilverwaltung (P1, `profilemgmt/`)

Zusätzliche Profilfelder (alle optional beim Anlegen; `null` = Standard):

| Feld | Typ | Bedeutung |
| --- | --- | --- |
| `gameDirectory` | `string \| null` | eigenes Spielverzeichnis (absolut); `null` = verwaltetes Verzeichnis |
| `gameDir` | string | wirksames Spielverzeichnis, nur lesend |
| `wrapperCommand` | `string \| null` | Befehl vor `java` (z. B. `gamemoderun`) |
| `preLaunchCommand` | `string \| null` | Shell-Befehl vor dem Start; Exit-Code ≠ 0 bricht den Start ab |
| `postExitCommand` | `string \| null` | Shell-Befehl nach dem Beenden des Spiels |
| `envVars` | `{NAME: "wert"}` | Umgebungsvariablen (Namen: Buchstaben, Ziffern, `_`) |
| `fullscreen` | bool | startet Minecraft mit `--fullscreen` |
| `hideLauncher` | `bool \| null` | Launcher beim Start ausblenden; `null` = globale Einstellung `closeOnLaunch` |
| `favourite` | bool | Favorit (sortiert nach vorn) |
| `group` | `string \| null` | Gruppe, unter der das Profil erscheint |
| `iconUrl` | `string \| null` | Data-URL (PNG, JPEG, GIF, WebP, höchstens 300 KB) |
| `totalPlaytimeMs` | int | Spielzeit über alle Sitzungen, nur lesend |

Alle änderbaren Felder gehen über `PATCH /api/profiles/:id`. `GET /api/profiles/:id/game` liefert
zusätzlich `phase` (`idle | running | stopping | install-game | launch | verify | duplicate`).

| Methode | Pfad | Beschreibung |
| --- | --- | --- |
| GET | `/api/profiles` | Liste; jedes Profil mit `running` und `phase` |
| GET | `/api/profiles/groups` | `["Modpacks", …]` |
| POST | `/api/profiles/:id/duplicate` | `{name?}` → Job; Ergebnis `{profileId, name}`; kopiert das Spielverzeichnis |
| POST | `/api/profiles/:id/icon` | `{dataUrl}` → Profil mit `iconUrl` |
| POST | `/api/profiles/:id/verify` | `{repair?}` → Job; Ergebnis ist der Bericht |
| GET | `/api/profiles/:id/verify` | `{report}` der letzten Prüfung, sonst `null` |
| GET | `/api/versions?includeSnapshots=&includeBetas=&includeAlphas=` | `[{id, type, releaseTime}]` aus dem Mojang-Manifest |
| GET | `/api/loader-versions?platformId=&minecraftVersionId=` | `[{id, stable}]`, neueste zuerst; leer bei `vanilla` |

Die Plattformliste (`GET /api/platforms`) liefert das Modul `system`.

Bericht der Prüfung: `{checkedAt, libraries: {checked, brokenBefore, brokenAfter, examples}, client: {okBefore, okAfter}, repaired, ok}`.

## Entdecken und Oberfläche (P6, `providers/`, `core/settings.nv`)

Erweiterungen, alle additiv; ohne die neuen Parameter verhält sich alles wie vorher.

**Settings** (neue Schlüssel, Standardwerte in Klammern):

| Schlüssel | Typ | Wirkung |
| --- | --- | --- |
| `accentColor` | `"#rrggbb"` (`#00b2ff`) | Akzentfarbe; der Standardwert nutzt die Farben des Designs |
| `uiScale` | `compact \| default \| comfortable` (`default`) | Oberflächengröße (0,9 / 1 / 1,12, per CSS-Zoom) |
| `animationsEnabled` | bool (`true`) | Übergänge und Animationen an oder aus |

**Discover**

| Methode | Pfad | Beschreibung |
| --- | --- | --- |
| GET | `/api/providers` | jeder Eintrag zusätzlich mit `sorts`: die Sortierwerte, die der Anbieter wirklich auswertet |
| GET | `/api/providers/:provider/search?…&categories=&sort=` | `categories`: Modrinth-Kategorien (UND-Verknüpfung) bzw. CurseForge-Kategorie-IDs (eine als `categoryId`, mehrere als `categoryIds`); `sort`: einer der `sorts` des Anbieters, sonst `relevance`. Jeder Anbieter nimmt alle Parameter an; `supports` zeigt, was er wirklich auswertet. |
| GET | `/api/providers/:provider/filters?kind=` | Filter der Oberfläche: `sorts` (mit Beschriftung), `categories` (`{id, label}`), `gameVersions`, `loaders` und `supports` (`search, kind, sort, categories, gameVersion, loader, paging`). Fehlt `kind`, gilt der Standard des Anbieters (`mod`, bei Technic und FTB `modpack`). |
| GET | `/api/providers/:provider/categories?kind=` | die IDs aus `/filters` (`["optimization", …]`); nur Modrinth und CurseForge haben Kategorien, sonst `[]` |

Sortierungen und Unterstützung je Anbieter (`filters.nv`, `supports` in der Antwort):

| Anbieter | `sort` | nicht unterstützt (`supports` = false) |
| --- | --- | --- |
| Modrinth | `relevance, downloads, follows, newest, updated` | nichts |
| CurseForge (Bridge) | `relevance` (Featured), `follows` (Popularity), `updated`, `name` (A–Z), `downloads`, `newest` (Release date) | alles, solange die Bridge nicht läuft (Antwort: leere Listen, Suche 502). Versionsliste: leer, da die Bridge sie nicht weiterleitet. Loader fest: `fabric, forge, neoforge, quilt` |
| Technic | `relevance`, `popular` (Reihenfolge von `/trending`), `downloads` (Installs), `follows` (Runs) | `categories`, `loader` (der Loader steht nur im Build-Archiv) |
| FTB | `relevance`, `downloads` (Installs), `follows` (Plays), `updated` | `categories` (FTB hat keine). Version und Loader kommen aus den `targets` der Packs. |

`hasMore` ist `offset + Anzahl < total`. Jede Sortierung außer `relevance` bei FTB liest die Dokumente der Kandidaten (aus dem Cache) und sortiert sie; FTB-Listen sind nur ungefähr geordnet.
| POST | `/api/profiles/:id/content/install` | `versionId` darf fehlen: dann wird die neueste passende Version gewählt (Schnell-Hinzufügen). `withDependencies` (bool, Standard `true`) schaltet die Abhängigkeiten ab (nur Mods). |

Versionen (`GET …/versions`) enthalten `releaseType` (`release | beta | alpha`); das war bereits vorhanden.

Beispiele:

```
GET  /api/providers/modrinth/search?kind=mod&categories=optimization,utility&sort=downloads&limit=20
GET  /api/providers/modrinth/categories?kind=mod
GET  /api/providers/modrinth/filters?kind=mod
GET  /api/providers/technic/search?q=tekkit&sort=popular
POST /api/profiles/a1b2c3d4e5f6/content/install  {"provider":"modrinth","projectId":"YL57xq9U","kind":"mod","withDependencies":false}
```

## Spieldaten (P2, `gamedata/`)

Welten, Serverliste, Screenshots, Logs und Backups eines Profils. Alle Pfade liegen unter `/api/profiles/:id/`.

- Welten liegen in `<gameDir>/saves/<Ordner>/`. Der Name steht in `level.dat` (gzip-NBT), nicht im Ordnernamen. Umbenennen schreibt `level.dat` neu; der Ordner bleibt.
- Serverliste: `<gameDir>/servers.dat` (unkomprimiertes NBT). Ein Eintrag wird über seinen Index angesprochen, wie im Spiel.
- Backups liegen außerhalb des Profils: `<dataDir>/backups/<profileId>/<Zeitstempel>.zip` mit Sidecar `<Zeitstempel>.json`. Die Anzahl richtet sich nach `backupsToKeep`.
- Lange Vorgänge (Welt duplizieren, Welt kopieren, Backup erstellen, Backup wiederherstellen) antworten mit `202` und einem Job. Das Ergebnis steht in `result`.
- Ein Profil ist während eines Vorgangs belegt: andere Änderungen daran antworten mit `409`. Läuft das Spiel des Profils, antworten Änderungen an Welten, Serverliste und Backups ebenfalls mit `409`.

| Methode | Pfad | Beschreibung |
| --- | --- | --- |
| GET | `/worlds` | `{"worlds": [World]}`, neueste zuerst |
| PATCH | `/worlds/:folder` | `{"name"}` benennt um → `{"world"}` |
| DELETE | `/worlds/:folder` | löscht den Ordner → `{"deleted"}` |
| GET | `/worlds/:folder/icon` | `{"dataUrl": "data:image/png;base64,…" \| null}` |
| POST | `/worlds/:folder/duplicate` | `{"name"?}` → Job (`result.world`) |
| POST | `/worlds/:folder/copy` | `{"targetProfileId"}` → Job (`result.world`, `result.profileId`) |
| GET | `/servers` | `{"servers": [Server]}` |
| POST | `/servers` | `{"name"?, "address"}` → 201 `{"server"}`; ohne Name gilt die Adresse |
| PATCH | `/servers/:index` | `{"name"?, "address"?}` → `{"server"}`; nicht gesendete Felder bleiben |
| DELETE | `/servers/:index` | → `{"deleted"}` |
| GET | `/screenshots` | `{"screenshots": [Screenshot]}` |
| GET | `/screenshots/:file/image` | `{"dataUrl", "contentType"}` (JSON, da die API nur JSON liefert) |
| DELETE | `/screenshots/:file` | → `{"deleted"}` |
| POST | `/screenshots/open-folder` | `{"path"}`; die App öffnet den Ordner (`openPath`) |
| GET | `/logs` | `{"logs": [LogSource]}`; ids: `launcher`, `game:<datei>`, `crash:<datei>` |
| GET | `/logs/latest-crash` | `{"log": LogSource \| null}` |
| GET | `/logs/:logId?offset=&maxBytes=` | `LogChunk`; `offset` negativ = Ende der Datei, Standard 128 KB, höchstens 512 KB |
| DELETE | `/logs/:logId` | leert nur die Launcher-Konsole (`launcher`) |
| POST | `/logs/:logId/open-folder` | `{"path"}` |
| GET | `/backups` | `{"backups": [Backup]}`, neueste zuerst |
| POST | `/backups` | `{"label"?}` → Job (`result.backupId`) |
| POST | `/backups/:backupId/restore` | → Job; der Spielordner wird zur Seite geschoben und erst nach Erfolg gelöscht |
| DELETE | `/backups/:backupId` | → `{"deleted"}` |
| POST | `/backups/open-folder` | `{"path"}` |

Datenmodelle (Auszug): **World** `{folderName, name, lastPlayed (ISO), sizeBytes, gameMode, hardcore, versionName, hasIcon, readable, problem}`; **Server** `{index, name, address, icon (data URL oder ""), acceptTextures}`; **LogSource** `{id, label, kind (launcher | game | crash), sizeBytes, modifiedAt, live, compressed}`; **LogChunk** `{id, offset, nextOffset, size, text, truncated}`; **Backup** `{id, label, createdAt, sizeBytes, minecraftVersion, loader, fileCount}`.

Beispiele:

```
GET    /api/profiles/a1b2c3d4e5f6/worlds
PATCH  /api/profiles/a1b2c3d4e5f6/worlds/New%20World          {"name": "Mein Bau"}
POST   /api/profiles/a1b2c3d4e5f6/worlds/New%20World/copy     {"targetProfileId": "0f1e2d3c4b5a"}
POST   /api/profiles/a1b2c3d4e5f6/servers                     {"name": "Freunde", "address": "play.example.org"}
GET    /api/profiles/a1b2c3d4e5f6/logs/game%3Alatest.log?offset=-1&maxBytes=65536
POST   /api/profiles/a1b2c3d4e5f6/backups                     {"label": "vor Modpack-Update"}
POST   /api/profiles/a1b2c3d4e5f6/backups/20261010-120000.zip/restore
```

Hinweise: Ein Backup ist ein ZIP (gespeichert oder deflate, UTF-8-Namen, ohne ZIP64), das das Backend selbst schreibt; das Wiederherstellen liest es über den Jar-Leser aus `mods/zip.nv`. Logs werden als ganze Datei gelesen (die Laufzeit hat kein Teil-Lesen); eine Anfrage pro Abruf kostet deshalb die Dateigröße.

## System, Einstellungen, Integrationen (P4, `system/`, `core/settings.nv`)

Einstellungen: `core/settings.nv` (Defaults und Regeln); Zurücksetzen über `POST /api/settings/reset`.
Die Schlüssel der alten Oberfläche sind auf das Modell abgebildet, außerdem neu: `minMemoryMb`, `defaultJvmArgs`,
`javaRuntimes` (`[{majorVersion, path}]`), `openLogsOnLaunch`, `offlineModeAllowed`, `backupsToKeep`,
`backupBeforePackUpdate`, `profileSort` (`lastPlayed | name | createdAt`), `favouritesFirst`, `showFps`,
`discordPresence`, `discordApplicationId`, `autoUpdate`, `betaUpdates`.
`bridgeUrl` und `discordApplicationId` sind fest (Standardwert des Launchers): `PATCH /api/settings` mit einem dieser Schlüssel
antwortet 400 `bad_request` („… is fixed by the launcher“) und ändert nichts; in `settings.json` gespeicherte Werte werden beim Laden
ignoriert. `GET /api/settings` zeigt beide. Der Schlüssel `updateRepository` ist entfallen; Updates kommen vom CDN (siehe unten).
Die alte Option „Beim Start ausblenden“ ist in `closeOnLaunch` zusammengeführt.

| Methode | Pfad | Beschreibung |
| --- | --- | --- |
| POST | `/api/settings/reset` | alle Einstellungen auf Standard; antwortet mit den Settings |
| GET | `/api/settings/directories` | `[{id, label, path}]` (`root, profiles, logs, exports, backups, updates, runtimes, cache`) |
| POST | `/api/settings/directories/:id/open` | legt den Ordner an und antwortet `{path}`; die Oberfläche öffnet ihn über Electron |
| GET | `/api/updates[?force=1]` | `UpdateInfo` (Cache 10 min); nicht erreichbares oder noch nicht veröffentlichtes Manifest (HTTP 404): `available: false` mit Grund in `reason` |
| POST | `/api/updates/download` | Job (202); Ergebnis `{path, fileName, directory, verified}`; Ziel `<dataDir>/updates/` |
| POST | `/api/updates/open-release` | `{url}` der Release-Seite (`https://cdn.volt-launcher.app/download/volt-launcher/version/latest/`) |
| GET | `/api/integrations/discord` | `{state, message, transport, configured, enabled}`; `state` = `disabled | not_configured | waiting_for_discord | rejected | connected` |
| GET | `/api/java/runtimes` | `{detected, managed, installable, configured, installing}` |
| POST | `/api/java/runtimes/:major/install` | Job (202); Ergebnis `{majorVersion, javaPath}`; eine Installation pro Version |
| GET | `/api/platforms` | `[{id, displayName}]` der Loader |

`UpdateInfo`: `{available, currentVersion, latestVersion, name, notes, publishedAt, releaseUrl, assetName, downloadable, assetSize, prerelease, reason, checksumSha512}`; `checksumSha512` ist der Hex-Wert.

Updates kommen aus dem CDN: `https://cdn.volt-launcher.app/download/volt-launcher/version/latest/latest.json` (fest, `system/updates.nv`),
im Format des Veröffentlichungsskripts von Lumen IDE: `product`, `version`, `releaseDate`, `notes`, `platforms.<plattform>` mit
`version`, `releaseDate`, `update: {name, size, sha512}` und `files: [{name, size, sha512}]`. Plattformen: `linux_amd64`, `linux_aarch64`,
`windows_x86_64`, `windows_arm64`, `macos_arm64`; die des Rechners kommt aus `os.platform()` und `uname -m` bzw. `PROCESSOR_ARCHITECTURE`.
Der Installer ist `update`, sonst die erste Datei von `files`, und liegt unter `<feed>/<plattform>/<name>`. Neuer ist eine größere
Version nach Lumens `compareVersions` (Vorabversionen nur mit `betaUpdates`). Geprüft werden Größe und SHA-512: der base64-Wert aus dem
Manifest wird zu Hex dekodiert und mit dem Hex-Digest der Datei verglichen (`sha512sum`, `shasum -a 512` oder `certutil`). Schlägt die
Prüfung fehl, wird die Datei gelöscht und der Job scheitert.

Discord: Rich Presence über den lokalen IPC-Socket (Unix-Socket mit `$XDG_RUNTIME_DIR`, `$TMPDIR`, `/tmp` sowie
Flatpak- und Snap-Unterordner; Windows-Named-Pipe `\\.\pipe\discord-ipc-N`). Die Socket-Aufrufe sind ein kleiner C-Block
in `system/discord.nv`. Läuft Discord nicht, bleibt der Zustand `waiting_for_discord`; es gibt keinen Fehler.
Andere Module setzen den angezeigten Status mit `systemDiscordSetActivity(details, state, startedAtMs)`.

Beispiele:

```
GET  /api/settings/directories
POST /api/settings/directories/logs/open
GET  /api/updates?force=1
POST /api/updates/download
GET  /api/integrations/discord
GET  /api/java/runtimes
POST /api/java/runtimes/21/install
PATCH /api/settings                       {"backupsToKeep": 3}
```

## Konten und Skins (P3, `accounts/`)

Das Modul `backend/src/accounts/` besitzt Konten (Microsoft und offline), die Anmeldung und die Skin-Bibliothek.
Der Launch übernimmt das ausgewählte Konto über `accountsLaunchSession()` (Name, UUID ohne Bindestriche,
Access-Token, Benutzertyp, XUID); ohne Anmeldung startet das Spiel mit dem offline Standardkonto „Player“.

**Kontospeicher.** `<dataDir>/accounts/accounts.enc` enthält alle Konten einschließlich Tokens, verschlüsselt.
`std/crypto` bietet nur AES-128 im CFB-8-Modus (kein GCM, kein AES-256, kein HMAC). Deshalb gilt
Encrypt-then-MAC: AES-128-CFB8 mit zufälligem 16-Byte-IV je Speichervorgang, HMAC-SHA256 über `iv || ciphertext`
(aus `crypto.sha256` gebaut). Beide Schlüssel werden per HMAC aus einem 32-Byte-Hauptschlüssel abgeleitet
(`<dataDir>/accounts/master.key`, base64, nur Eigentümer-Rechte; der Schlüssel wird beim ersten Speichern erzeugt).
Eine beschädigte Datei oder ein falscher Schlüssel führt zu einem Fehler und wird nie durch einen leeren Speicher ersetzt.
Tokens erscheinen nie in Logs, in Antworten oder auf der Kommandozeile: Der Authorization-Header wird aus einer
Datei unter `<dataDir>/accounts/tmp` (nur Eigentümer) an curl übergeben, und die Startzeile im Spiel-Log
ist maskiert (`launchMaskedCommand`).

**Anmeldung.** OAuth 2.0 Authorization Code mit PKCE (S256) über den öffentlichen Xbox-Client; die Weiterleitung geht an
`https://login.live.com/oauth20_desktop.srf`, die einzige für diesen Client erlaubte URI. Danach folgt die Kette
Microsoft-Token → Xbox Live → XSTS → Minecraft-Login → Profil (`api.minecraftservices.com/minecraft/profile`).
Der Browser endet auf `…/oauth20_desktop.srf?code=…&state=…`. Diese Adresse (vollständig) gibt die Oberfläche an
`POST /api/accounts/callback` weiter, wo der Tausch als Job läuft. Das Backend selbst nimmt keine Weiterleitung entgegen.
Offene Anmeldungen liegen nur im Speicher (10 Minuten, Einmalverwendung).

**Skins.** `<dataDir>/skins/skins.json` (Metadaten, nicht geheim) und `<dataDir>/skins/<id>.png`. Erlaubt sind PNG-Dateien
mit 64×64 oder 64×32 Pixeln bis 2 MB. Übernehmen lädt das PNG als multipart (`variant`, `file`) an
`api.minecraftservices.com/minecraft/profile/skins` hoch; erst danach gilt der Skin als ausgewählt. Auch das läuft als Job.

Endpunkte (Pfade mit Konten-IDs als Bindestrich-UUIDs):

| Methode | Pfad | Beschreibung |
| --- | --- | --- |
| GET | `/api/accounts` | `{accounts: [{id, name, type, selected, default, usable, skinDataUrl, skinError}], selectedId, offlineMode}`; das Standardkonto „Player“ steht immer vorn. `skinDataUrl` ist das PNG des aktuellen Skins (nur Microsoft, sonst `null`), `skinError` ist `null` oder ein kurzer Grund, wenn der Skin nicht geladen werden konnte |
| GET | `/api/accounts/session` | `{authenticated, id, name, type}` des ausgewählten Kontos (ohne Tokens) |
| POST | `/api/accounts/login` | `{state, url, expiresAt}`; die Oberfläche öffnet `url` im Browser |
| POST | `/api/accounts/callback` | `{state, code}` oder `{state, error, error_description}`; 202 mit Job (`kind: account-login`, Ergebnis `{id, name}`) |
| POST | `/api/accounts/logout` | entfernt alle Microsoft-Konten; Offline-Konten bleiben |
| POST | `/api/accounts/offline` | `{name}` (3–16 Zeichen, Buchstaben, Ziffern, `_`); 201 mit `{account, …}` |
| POST | `/api/accounts/offline-mode` | `{enabled}`; an: offline Konto, aus: letztes Microsoft-Konto (409 ohne Microsoft-Konto) |
| POST | `/api/accounts/:id/select` | Konto auswählen |
| DELETE | `/api/accounts/:id` | Konto entfernen (das Standardkonto nicht, 409) |
| GET | `/api/skins` | `{skins: [{id, name, slim, createdAt, selected, imageDataUrl}], selectedSkinId}` |
| POST | `/api/skins` | `{name, slim, imageBase64}` (data-URL-Präfix erlaubt); 201 mit `{skin}` |
| GET | `/api/skins/:id` | ein Skin mit Vorschau (`imageDataUrl`) |
| PATCH | `/api/skins/:id` | `{name}` |
| DELETE | `/api/skins/:id` | löscht Metadaten und PNG |
| POST | `/api/skins/:id/select` | 202 mit Job (`kind: skin-apply`, Ergebnis `{skin}`); 409, wenn kein Microsoft-Konto ausgewählt ist |

Beispiele:

```
POST /api/accounts/login                          -> {"state":"5c81…","url":"https://login.live.com/oauth20_authorize.srf?…","expiresAt":"…"}
POST /api/accounts/callback   {"state":"5c81…","code":"M.R3_BAY…"}   -> 202 Job (kind account-login)
POST /api/accounts/offline    {"name":"Tester_1"}                    -> 201 {"account":{…},"accounts":[…],"selectedId":"…","offlineMode":true}
POST /api/accounts/offline-mode {"enabled":false}                    -> 200 Kontenliste (Microsoft-Konto gewählt)
POST /api/skins               {"name":"Night Knight","slim":false,"imageBase64":"data:image/png;base64,…"} -> 201 {"skin":{…}}
POST /api/skins/2544…/select                                         -> 202 Job (kind skin-apply)
```

**Launch.** `launch/command.nv` setzt `auth_player_name`, `auth_uuid`, `auth_access_token`, `auth_session`,
`auth_xuid` und `user_type` aus der Session. `launch/jobs.nv` schreibt die Startzeile mit `launchMaskedCommand`
in das Spiel-Log.

**Anmeldung im Hauptprozess.** Die Weiterleitung nach `oauth20_desktop.srf` fängt `app/src/main/signin.ts` ab; Code und Status gehen an `/api/accounts/callback`. Die echte Microsoft-Anmeldung ist noch nicht durchgespielt (getestet mit gefälschten Weiterleitungen).

**Nur Microsoft-Konten.** Offline-Konten sind deaktiviert: `POST /api/accounts/offline` und `POST /api/accounts/offline-mode` mit `{enabled: true}` antworten 403 `sign_in_required`. Der Launch (`accountsLaunchSession()`) verlangt ein ausgewähltes Microsoft-Konto und scheitert sonst mit 403 `sign_in_required`; `install-game` braucht kein Konto. Die Kontenliste behält Offline-Einträge (auch „Player“) mit `usable: false`, und `offlineMode` ist `true`, solange kein Microsoft-Konto ausgewählt ist. Die Zeilen für `/api/accounts/offline` und `offline-mode` in der Tabelle oben beschreiben den früheren Stand.

**Aktueller Skin (Startseite).** `GET /api/accounts/skin` (`accounts/current.nv`) liefert den Skin, den das ausgewählte Microsoft-Konto gerade trägt: `{name, uuid (mit Bindestrichen), model: "classic" | "slim", skinUrl, dataUrl, capeDataUrl}`. Die Daten kommen aus dem Mojang-Profil (`api.minecraftservices.com/minecraft/profile`, mit dem Minecraft-Token aus `acSessionOf`, also derselben Kette und Auffrischung wie beim Start). Der Skin mit `state: ACTIVE` wird von `textures.minecraft.net` geladen und als Data-URL beantwortet; die Oberfläche braucht deshalb keinen Netzzugriff auf die Textur-Domain (CSP). Ein aktiver Umhang ist optional und fehlt, wenn er nicht geladen werden kann. Ohne gesetzten Skin sind `skinUrl`, `dataUrl` und `capeDataUrl` `null`, das Modell kommt aus dem ersten Eintrag des Profils. Ohne Microsoft-Konto: 403 `sign_in_required`; Fehler beim Abruf: 502 `upstream`. Die Antwort wird je Konto 5 Minuten im Speicher gehalten (nur Erfolge), und eine Skin-Übernahme leert den Speicher. Tokens und Profil-JSON werden nicht protokolliert. `GET /api/accounts` holt denselben Skin für jedes Microsoft-Konto nacheinander (außerhalb der Kontensperre, mit demselben Cache) und beantwortet ihn als `skinDataUrl`. Schlägt ein Konto fehl, bekommt nur dieses Konto `skinError`; die Liste bleibt erfolgreich.

## Inhalte und Modpacks (P5, `mods/`, `providers/`)

**Inhalte je Typ.** `mods/` verwaltet Mods, Resource-Packs, Shader-Packs und Datenpakete mit einer Implementierung
(`ContentLoc` in `mods/store.nv`). Die Mod-Endpunkte bleiben unverändert; die generischen liegen daneben:

| Methode | Pfad | Beschreibung |
| --- | --- | --- |
| GET | `/api/profiles/:id/content/:type` | `ModFile[]` (`type`: `mods`, `resourcepacks`, `shaderpacks`, `datapacks`); `metadata` ist nur bei Mods gesetzt |
| POST | `…/content/:type/identify`, `…/check-updates`, `…/update-all` | Job |
| POST | `…/content/:type/toggle-all` | `{enabled}` → `{changed, enabled, skipped}` |
| GET | `…/content/:type/dependencies` | `{warnings: [{fileName, projectName, dependencyProjectId, state}]}` (nur Mods, `state`: `missing \| disabled`) |
| GET | `…/content/:type/:file/versions` | `ProjectRelease[]` (Modrinth, nach Spielversion und Loader gefiltert) |
| POST | `…/content/:type/:file/version` | `{versionId}` → Job; ersetzt die Datei durch eine beliebige Version (sha1-geprüft, Alt-Datei nach `.volt-backup/`) |
| POST | `…/content/:type/:file/update` · `…/toggle` · DELETE `…/:file` | wie bei Mods |

- Speicher je Typ: `<gameDir>/.volt/mods.json` (Mods, unverändert), `resourcepacks.json`, `shaderpacks.json`.
- Datenpakete liegen in Minecraft **in einer Welt**: `<gameDir>/saves/<world>/datapacks/`. Alle Datenpaket-Anfragen
  brauchen `?world=<Ordner>`; `GET …/content/datapacks/worlds` listet die Welten mit Anzahl. Ihr Speicher heißt
  `.volt/datapacks-<sha1(world)[0:16]>.json`.
- Nicht-Mod-Inhalte sind `*.zip` (bzw. `*.zip.disabled`) und tragen keine Jar-Metadaten.
- Inhaltsinstallation (`POST …/content/install`) akzeptiert `world` (Pflicht für `kind: datapack`) und schreibt die
  Quelle sofort in den Speicher (kein Identify nötig). Modrinth-Suche filtert Packs nach ihrem Tag
  (`minecraft` bzw. `datapack`).

**Modpack.** `providers/modpack.nv`:

| Methode | Pfad | Beschreibung |
| --- | --- | --- |
| GET | `/api/profiles/:id/modpack` | `{modpack, updateAvailable, latestVersionId, latestVersionNumber, latestReleaseDate, reason}` |
| GET | `/api/profiles/:id/modpack/versions` | `{versions: [ProjectRelease]}`, neueste zuerst |
| POST | `/api/profiles/:id/modpack/update` | `{versionId?}` → Job; Ergebnis `{profileId, versionId, installed, removed}` |
| POST | `/api/modpacks/import` | `{path, name?}` → Job; Ergebnis `{profileId}`; Format wird aus dem Archiv gelesen (mrpack, CurseForge, Technic) |

Die Dateien, die ein Release installiert hat, stehen in `<gameDir>/.volt/pack-files.json` (`{versionId, files}`).
Ein Update löscht die Dateien des alten Releases, die das neue nicht mehr enthält; Welten, Konfigurationen und
eigene Mods bleiben. Profile ohne diese Liste (vor P5 erstellt) löschen beim ersten Update nichts.
Updates gibt es für Modrinth und CurseForge; Technic und FTB sowie importierte Packs sind nicht aktualisierbar.

**Export.** `POST /api/profiles/:id/export` `{format: "mrpack" | "curseforge", name?, version?}` → 201
`{path, fileName, referenced, bundled, notes}`. Die Datei landet in `<dataDir>/exports/`. Der mrpack referenziert
Modrinth-Dateien über Hash und Download-URL (Version aus dem Speicher); CurseForge-Dateien nur, wenn ihre Quelle eine
Projekt- und Datei-ID hat. Alles andere sowie `config/`, `defaultconfigs/`, `kubejs/`, `scripts/`, `options.txt` usw.
liegt in `overrides/`. Datenpakete (an Welten gebunden) werden nicht exportiert.

**Bekannte Lücken.** Keine Sicherung vor einem Pack-Update: weder Backend noch Oberfläche erstellen sie, obwohl
`backupBeforePackUpdate` gesetzt sein kann (offen; Oberfläche könnte `POST /api/profiles/:id/backups` vorher aufrufen). CurseForge-Pack-Dateien werden
noch nicht im Speicher erfasst, daher exportiert ein CurseForge-Zip sie in `overrides/`. Die Datei-Auswahl im Import
erfolgt über einen Pfad (die Oberfläche hat keinen Dateidialog; ein `pickFile`-IPC gehört in den Hauptprozess).

## Migration der alten Java-Daten (`migration/`)

Der alte Java-Launcher lag im selben Ordner (`~/.voltlauncher`, Standard von `--data-dir`); `--legacy-dir <pfad>`
zeigt auf ihn, sonst ist der Datenordner selbst gemeint. Beim Start (nach `core.init`, vor dem Server) läuft die
Migration, wenn `<legacy>/instances/instances.json` existiert und `<dataDir>/migration.json` fehlt oder
`"status": "partial"` hat. Bei `"done"` passiert nichts. Die Ergebnisse stehen in `migration.json`
(`status` done | partial, `profiles` mit `slug`, `profileId`, `status` migrated | failed, Zähler, `notes`);
`GET /api/migration` liefert den Inhalt (sonst `{"status": "none"}`).

- **Einstellungen:** `config/settings.json` wird auf die Schlüssel von `core/settings.nv` abgebildet (z. B.
  `defaultMaxMemoryMb` → `memoryMb`, `maxConcurrentDownloads` → `downloadThreads`,
  `hideLauncherOnLaunch` → `closeOnLaunch`). Ein Wert wird nur geschrieben, wenn die neue Datei dort den Standard hat
  oder den Schlüssel nicht kennt. Nicht übernommen: `offlineModeAllowed` (kein Gegenstück); `javaRuntimes`
  wird nur übernommen, wenn die Einträge das neue Format haben.
- **Profile:** je Eintrag in `instances.json` ein neues Profil über `core.createProfile`. `versionId`
  `fabric:<mc>:<loader>` (auch quilt, forge, neoforge) ergibt Loader und Version, sonst ist es Vanilla. Das
  Spielverzeichnis bleibt der alte Ordner `instances/<slug>/game` (`gameDirectory`); nichts wird kopiert.
  Modpack-Herkunft aus `content.json` wird als `source` (`kind: "modpack"`) übernommen.
  Ein fehlgeschlagener Eintrag wird als `failed` mit Meldung vermerkt, die anderen laufen weiter. Ein Neustart
  versucht nur die fehlgeschlagenen erneut und nutzt ein bereits angelegtes Profil wieder.
- **Mod-Herkunft:** Aus `instances/<slug>/content.json` wird je Datei `<gameDir>/.volt/<art>.json` über
  `mods.recordSource` geschrieben, aber nur wenn die sha1 der Datei auf der Platte der gespeicherten entspricht und
  der Provider Modrinth oder CurseForge ist. Datenpakete (an Welten gebunden) und handgelegte Dateien werden
  übersprungen und gezählt. Ein vorhandener `.volt`-Cache wird nicht überschrieben.
- **Backups und Laufzeiten:** nicht verschoben. Das neue Backend liest nur `<dataDir>/backups/<profileId>`; die
  alten Archive bleiben in `backups/<slug>` und stehen in `backupsLeftInPlace`. `runtimes/` wird nicht bewegt
  (das Backend nutzt `shared/runtimes`).
- **Konten:** nicht migriert. `auth/account-session.enc` ist AES-GCM verschlüsselt und vom neuen Backend nicht lesbar;
  die Anmeldung mit Microsoft muss einmal neu erfolgen.
- **Altordner:** Außer den `.volt/*.json`-Caches schreibt die Migration nichts in den alten Ordner. Ein
  `--migration-dry-run --data-dir <scratch> --legacy-dir <alt>` führt alles in einen Scratch-Ordner aus, ohne den
  alten Ordner zu schreiben. Tests: `backend/tests/migration/run.sh` (`--real-dry-run` gegen die echten Daten).

## Modpack verbinden (P5, `providers/connect.nv`)

Ein Profil lässt sich mit einer Release-Version eines Modpacks verbinden, ohne dass etwas installiert wird.

| Methode | Pfad | Beschreibung |
| --- | --- | --- |
| POST | `/api/profiles/:id/modpack/connect` | `{provider, projectId, versionId}` → 200 Modpack-Status; 409, wenn schon verbunden; 422 `unsupported`, wenn die Dateiliste nicht exakt lesbar ist |
| POST | `/api/profiles/:id/modpack/disconnect` | ohne Body → 200 Modpack-Status; entfernt Quelle und `.volt/pack-files.json`, die Dateien bleiben |

- Status (`GET …/modpack`): verbundene Profile liefern `linked: true`, `provider`, `projectId`, `name`, `versionId`,
  `versionNumber`, `updateAvailable`, `latestVersionId`; sonst `linked: false`.
- Dateiliste je Anbieter (nur Inhalte in `mods/`, `resourcepacks/`, `shaderpacks/`, `datapacks/`, so wie die Installation
  sie einträgt): Modrinth liest `modrinth.index.json` aus dem `.mrpack` (Archiv in ein Temp-Verzeichnis, danach gelöscht);
  CurseForge liest `manifest.json` des Pack-Zips, aufgelöst über die Bridge (ohne Bridge 502); Technic liest die Einträge
  eines Client-Zips; Solder-Packs werden mit 422 abgelehnt, weil ihre Build-Liste nur Mod-Archive nennt; FTB nimmt die
  `files` des Release-Dokuments.
- Eine leere oder geratene Liste wird nie geschrieben. Die Listenregeln spiegeln `install.nv`; bei Änderungen dort
  mitziehen.
- Ein Update nach dem Verbinden läuft wie nach einer Installation. Technic und FTB bleiben nicht aktualisierbar.

## Profil-Logo (`logo/`)

| Methode | Pfad | Beschreibung |
| --- | --- | --- |
| GET | `/api/profiles/:id/logo` | `{kind, loader, dataUrl}`; `kind` ist `custom`, `modpack`, `vanilla` oder `loader`; `dataUrl` ist eine `data:image/…;base64,…`-URL oder `null`. Unbekanntes Profil: 404. |

Die Quellen, in dieser Reihenfolge (die erste, die etwas liefert, gewinnt):

1. **custom**: das Profil hat ein eigenes Icon (`POST /api/profiles/:id/icon`); das Icon wird unverändert zurückgegeben.
2. **modpack**: das Profil ist mit einem Modpack verbunden (`source`). Das Icon kommt aus dem Cache `<dataDir>/cache/logos/<provider>-<projectId>.<ext>`, sonst vom Anbieter: Modrinth `icon_url`, CurseForge `logo.url` (über die Bridge), FTB das `art` vom Typ `square` oder `icon`, Technic `icon.url`. Der Download läuft über den curl-Helfer der Providers; akzeptiert werden PNG, JPEG und WEBP (Magic-Bytes geprüft), höchstens 2 MB. Die Datei landet erst nach vollständigem Download und Prüfung per Umbenennen im Cache. Fehlt das Icon oder schlägt der Abruf fehl, folgt die nächste Quelle; der Endpunkt scheitert nie an einem Logo.
3. **vanilla**: nur für Profile mit Loader `vanilla`. Die Blocktextur kommt aus dem Client-Jar, das der Launcher bereits geladen hat: `<dataDir>/shared/versions/<mc>/<mc>.jar`. Release (`^\d+\.\d+(\.\d+)?$`, auch `26.1`, `26.1.2`) nimmt `assets/minecraft/textures/block/grass_block_side.png`, jede andere Version (`26w14a`, `1.21.4-pre1`, `1.20-rc1`) `dirt.png`. Die Datei wird mit dem Zip-Leser der Providers gelesen, nicht kopiert und nicht ins Repository geschrieben. Ohne Jar (Spiel nie installiert) ist `dataUrl` `null`. Die Textur wird nach dem ersten Lesen als `<dataDir>/cache/logos/vanilla-grass.png` bzw. `vanilla-dirt.png` gespeichert.
4. **loader**: alle übrigen Profile; `dataUrl` ist `null`, die Oberfläche zeichnet das Loader-Abzeichen.

Hinweise:

- Die Vanilla-Textur wird nur nach Blocktyp (Gras oder Erde) gecacht, nicht nach Version: die zuerst gelesene Jar bestimmt die Textur für alle Versionen. Das folgt der vorgegebenen Cache-Datei; bei abweichenden Texturen zwischen Versionen müsste der Name die Version enthalten.
- Projekt-IDs aus anderen Zeichen als Buchstaben, Ziffern, `.`, `_` und `-` liefern kein Pack-Icon (sie werden weder geladen noch als Dateiname verwendet); das Profil fällt auf die nächste Quelle zurück.
- Keine Sperre wird während Netzwerk- oder Dateizugriffen gehalten; temporäre Dateien tragen eine zufällige ID.
- Tests: `backend/tests/logo/run.sh` (Klassifikation, Priorität mit Fixtures, Cache, 404; das Jar und die Pack-Fixtures entstehen mit Python im temporären Datenordner).

## Automatische Profile (`autoprofiles/`)

Ein Hintergrundprüfer legt für jede neue Minecraft-Version ein Profil `<Version> Performance` an, mit einer
voreingestellten Liste an Performance-Mods (Standard: Fabric). Einstellungen (`core/settings.nv`):

| Schlüssel | Standard | Regel |
| --- | --- | --- |
| `autoProfilesEnabled` | `false` | bool |
| `autoProfileLoader` | `fabric` | `fabric \| quilt \| forge \| neoforge` |
| `autoProfileVersions` | `release` | `release \| snapshots` (mit `snapshots` auch Snapshots) |
| `autoProfileMods` | Fabric-Voreinstellung, 7 Modrinth-Projekte | Liste aus `{provider: "modrinth", projectId, name}`, höchstens 32 Einträge; `projectId` aus Buchstaben, Ziffern, `-`, `_` und `.` (höchstens 64 Zeichen) |

Die Voreinstellung: Sodium `AANobbMI`, Lithium `gvQqBUqZ`, FerriteCore `uXXizFIs`, ImmediatelyFast `5ZwdcRci`,
Entity Culling `NNAgCjsB`, ModernFix `nmDcB62a`, Krypton `fQEb0iXm`. Iris ist nicht enthalten. Der Slug
`memory-leak-fix` existiert bei Modrinth nicht (404) und fehlt deshalb.

| Methode | Pfad | Beschreibung |
| --- | --- | --- |
| GET | `/api/autoprofiles` | `{enabled, loader, versions, mods, seen, lastCheck, lastError, results}`; `seen` ist die Anzahl der gesehenen Versionen, `lastCheck` und `lastError` sind ISO-Zeit bzw. Text oder `null`; `results` sind die letzten 50 Ergebnisse, neueste zuerst, je `{minecraftVersion, status, reason, profileId}` mit `status` = `created`, `skipped` oder `failed`. |
| POST | `/api/autoprofiles/create` | Body `{minecraftVersion}`; Job (202, Art `autoprofile`) für genau diese Version. 400 bei unbekannter Version, 409 wenn der Profilname schon existiert. |
| POST | `/api/autoprofiles/check` | Job (202): eine Prüfung wie beim Timer. Läuft auch bei ausgeschaltetem Feature. 409, solange eine Prüfung läuft. |

Ablauf:

- Ein Timer-Thread (`autoprofiles.startBackground()` in `main.nv`) prüft 30 s nach dem Start und 30 s nachdem das Feature
  eingeschaltet wurde, danach alle 60 Minuten, solange es an ist. Jede Prüfung läuft als Job.
- Die erste Prüfung (nach dem Einschalten oder nach dem ersten Start mit Feature an) erfasst nur: alle Versionen im Mojang-Manifest
  werden als gesehen eingetragen, es entsteht kein Profil.
- Spätere Prüfungen behandeln jede Version, die nicht gesehen ist. Passt ihr Typ zur Einstellung (`release`, bei `snapshots`
  auch `snapshot`), entsteht das Profil; andere Versionen werden nur als gesehen vermerkt. Ein Wechsel von `release` auf
  `snapshots` legt deshalb keine alten Snapshots nach.
- Name: `<Version> Performance`. Existiert der Name, endet die Version als `skipped` mit „already exists“.
- Loader: hat der Loader für die Version keinen Build (Fabric-Meta 400, Quilt-Meta 404, Forge/NeoForge: leere Liste), endet
  die Version als `skipped` mit dem Grund. Andere Fehler (nicht erreichbar) enden als `failed`; die Version bleibt ungesehen
  und wird bei der nächsten Prüfung erneut versucht.
- Mods: jeder Eintrag wird wie eine Inhalts-Installation behandelt (`providers.installContent`, neueste passende Version,
  Pflicht-Abhängigkeiten an). Ein Mod, der nicht installiert werden kann, steht im `reason` des Ergebnisses; das Profil
  bleibt `created`.
- Standard für Quilt, Forge und NeoForge: es gibt noch keine Voreinstellung. Die Liste ist ein einziger Schlüssel; solange
  sie unverändert der Fabric-Voreinstellung entspricht, bekommt ein anderer Loader keine Mods, und das Ergebnis nennt den Grund.
  Eigene Mods für diesen Loader setzt man in `autoProfileMods`.
- Fehler stoppen den Prüfer nicht: ein nicht erreichbares Manifest setzt `lastError`, die nächste Prüfung versucht es erneut.
- Zustand: `<dataDir>/autoprofiles.json` (`baselined`, `seen`, `lastCheck`, `lastError`, `results`; die letzten 200 Ergebnisse).
- Test-Schalter: nur mit `--enable-test-routes` liest der Prüfer `manifest.json` und `loaders.json` aus dem Ordner in
  `VOLT_AUTOPROFILES_FIXTURES` statt aus dem Netz. Die Tests verwenden das.
- Tests: `backend/tests/autoprofiles/run.sh` (Erfassung, neue Versionen, Filter Release/Snapshot, Namensregel, fehlender Loader,
  Quilt-Regel, Validierung der Mod-Liste, Endpunkte, Fehlerpfad, Timer; etwa 50 s, ohne Netz, im temporären Datenordner).


## Profil-Import (`imports/`)

Importiert Profile anderer Launcher als **Kopien**: die Quelle wird nur gelesen, nie verschoben oder gelöscht. Pfade und Felder stammen aus `docs/IMPORT-FORMATS.md`; abgebildet wird nur, was dort als verifiziert oder dokumentiert steht.

Endpunkte (`server/router.nv` leitet `/api/imports` hierher):

| Methode | Pfad | Antwort |
|---|---|---|
| GET | `/api/imports/scan` | `{"launchers": [...]}`. Je Launcher: `id`, `name`, `status` (`found`, `none`, `unavailable`), `reason`, `confidence` (`verified`, `documented`, `community`), `profiles`. Je Profil: `key` (stabil, aus Launcher und Pfad), `name`, `minecraftVersion`, `loader`, `loaderVersion`, `sizeBytes`, `sizeComplete`, `path`, `importable`, `reason`, `notes`. |
| POST | `/api/imports` | Body `{"items": [{"launcher", "key"}]}` (1 bis 200 Einträge), Antwort 202 mit einem Job (`kind: "import"`). Das Ergebnis hat `items` (je Eintrag `result` = `done`, `partial` oder `failed`, `profileId`, `copiedFiles`, `notCopied` mit Pfad und Grund, `notes`, `message`) sowie die Zähler `done`, `partial`, `failed`. |

Alle Prüfungen laufen vor dem ersten Kopieren, für die ganze Anfrage: 400 `bad_request` (Body ungültig, Eintrag nicht importierbar, Eintrag doppelt, Datenordner liegt im Spielordner), 404 `not_found` (Launcher oder Schlüssel unbekannt; dann den Scan wiederholen), 409 `conflict` (Spielordner größer als 40 GB; die Zählung bricht bei Überschreitung ab).

Zuordnung: `name`, `minecraftVersion`, `loader` (`vanilla`, `fabric`, `quilt`, `forge`, `neoforge`; andere werden übersprungen und begründet), `loaderVersion`, `javaPath`, `jvmArgs`. Arbeitsspeicher wird nicht übernommen, weil keine Quelle die Einheit verifiziert hat; einzige Ausnahme ist NoRisk, dessen Code `memory` in MB angibt (`memory.max`, mindestens 256). Gruppen, Icons, Spielzeit, Modpack-Herkunft und Konten werden nicht übernommen und in `notes` genannt.

Launcher und Konfidenz: Prism Launcher, FTB App (verifiziert); MultiMC (verifiziert, Pfade aus Fremdimporteuren); Modrinth App (dokumentiert, nur über SQLite); Vanilla-Launcher (dokumentiert); ATLauncher, GDLauncher, CurseForge, NoRisk, HMCL (community oder abgeleitete Pfade). SQLite-Launcher (Modrinth, NoRisk) brauchen `sqlite3` im PATH; fehlt es, ist der Launcher `unavailable` mit dem Grund `sqlite3 is not installed`.

Kopie: Der Spielordner wird rekursiv in den Profilordner `<dataDir>/profiles/<id>` kopiert. Links werden nie verfolgt; ein Link im Spielordner steht in `notCopied`, ein Spielordner, der selbst ein Link ist, macht das Profil nicht importierbar. Ein nicht kopierbarer Eintrag macht den Eintrag `partial`; ein Fehler vor oder während der Kopie macht ihn `failed`, das angelegte Profil bleibt. Namen: bei Kollision „Name (2)“, „Name (3)“ usw.

Scan und Lesen: Launcher-Ordner werden nie beschrieben. SQLite-Datenbanken werden in einen Arbeitsordner unter `<dataDir>/cache/imports/` kopiert und dort mit `sqlite3 -readonly` gelesen, weil ein Lesezugriff auf eine WAL-Datenbank im Launcher-Ordner `-wal`- und `-shm`-Dateien anlegen kann. Die Größe wird je Ordner bis 50 000 Einträge gezählt (`sizeComplete: false` bei Abbruch). Der Scan liest nur, Pfade von Links werden gemeldet, nicht verfolgt.

Bewusste Grenzen: HMCL-Profile werden gelistet, sind aber nicht importierbar, weil `versions/<id>/<id>.json` nicht gelesen wurde (ein Versionsordner zählt nur mit `.hmcl`). Bei Modrinth ist die Verknüpfung `instances.applied_content_set_id` zu `instance_content_sets` nicht dokumentiert und angenommen; `instance_launch_overrides` (Java, JVM-Argumente) wird nicht gelesen. Bei ATLauncher, GDLauncher, FTB und CurseForge werden Loader-Namen nur für die bekannten vier Loader abgebildet, alle anderen Werte werden übersprungen. Windows- und macOS-Pfade sind nur insoweit vorhanden, wie die Doku sie nennt. Abbrechen ist zwischen den Dateien möglich; bereits angelegte Profile bleiben bestehen.

Testoption: `VOLT_IMPORT_HOME=<Ordner>` ersetzt das Home-Verzeichnis und schaltet `APPDATA`, `XDG_DATA_HOME`, `PRISMLAUNCHER_DATA_DIR`, `THESEUS_CONFIG_DIR` ab. Sie wirkt nur zusammen mit `--enable-test-routes`. Tests: `backend/tests/imports/run.sh` (baut das Backend, erzeugt die Fixtures mit `fixtures.py`, prüft mit `check.py` Scan, Ablehnungen, Kopien, Namen und Prüfsummen der Quellen; danach ein zweiter Lauf ohne `sqlite3` im PATH).


## Synchronisierte Ordner (`core/synced.nv`)

Beim Anlegen eines Profils wird gewählt, welche Ordner und Dateien zwischen Profilen geteilt werden. Erlaubt sind die Ordner `shaderpacks`, `resourcepacks`, `saves`, `screenshots` und `config` sowie die Dateien `options` (`options.txt`) und `servers` (`servers.dat`). Mods nicht, sie unterscheiden sich je Version. Standard ist nichts; die automatisch angelegten Profile (`autoprofiles/create.nv`) bekommen `["options", "servers"]`, `POST /api/profiles` bleibt bei nichts.

- `POST /api/profiles` nimmt das optionale Feld `"synced": ["saves"]` (Array, ohne Doppelte; leer oder `null` heißt nichts geteilt). Unbekannter Schlüssel, doppelter Eintrag oder kein Array: 400 `bad_request`.
- Gespeichert wird es als `synced` (Array). Ältere Profile ohne das Feld lesen `[]`. `GET` liefert es.
- Ändern: `PATCH /api/profiles/:id` mit `{"synced": ["saves", ...]}` setzt die ganze Menge (Array, erlaubte Schlüssel, ohne Doppelte; sonst 400 `bad_request`, auch bei `null`). Zusammen mit `gameDirectory` in derselben Anfrage: 400. Die Antwort ist das Profil mit `syncReport`. Läuft das Spiel des Profils, antwortet PATCH mit 409 `conflict` („stop the game before changing shared folders“); das Startmodul meldet dies über `markGameRunning(id, true|false)` in `core/synced.nv` (Stand: noch nicht angebunden, siehe unten). Alle Prüfungen (Links, die nicht auf den geteilten Ordner zeigen: 409; Ordner an Stelle eines Links beim Deaktivieren: 409) laufen vor der ersten Änderung.
- Aktivieren (Schlüssel neu): `<dataDir>/synced/<key>/` wird bei Bedarf angelegt. Fehlt der Eintrag `<folder>` im Spielordner, wird nur der Link angelegt. Ist er ein Ordner, wird er zusammengeführt: Namen, die der geteilte Ordner nicht hat, werden dorthin verschoben (umbenennen; schlägt das fehl, kopieren und erst danach das Original löschen). Namen, die der geteilte Ordner schon hat, werden nach `<gameDir>/.volt-sync-conflicts/<key>/` verschoben (mit Zusatz „name (2)“, falls dort schon belegt); nichts geht verloren. Danach wird der leere Ordner entfernt und der Link angelegt. Ein Link, der schon auf den geteilten Ordner zeigt, bleibt unverändert. `syncReport`: `{"key": "saves", "action": "enable", "status": "ok", "moved": 1, "conflicts": 1}`.
- Deaktivieren (Schlüssel entfernt): der Link wird entfernt (nie verfolgt), ein leerer Ordner angelegt und der Inhalt des geteilten Ordners hineinkopiert (kopieren, nicht verschieben). Schlägt das Kopieren für einen Eintrag fehl (z. B. ein Link im geteilten Ordner, der nicht kopiert wird), bleibt der geteilte Ordner unverändert, die Kopie wird entfernt, der Link wiederhergestellt und der Schlüssel bleibt aktiv. Die Antwort ist dann 200 mit `syncReport`: `{"key": "saves", "action": "disable", "status": "failed", "copied": 0, "failed": [{"name": "…", "reason": "…"}]}`. Ohne Fehler: `{"key": …, "action": "disable", "status": "ok", "copied": n}`.
- Fehler: schlägt ein Link oder ein Verschieben fehl, antwortet PATCH mit 500 `internal`. Alle Schritte der Anfrage werden in einem Journal festgehalten und in umgekehrter Reihenfolge rückgängig gemacht; was nicht rückgängig gemacht werden kann, nennt die Meldung (`could not undo`). Die Anfrage wird als Ganzes gespeichert oder nicht.
- Anlegen: der geteilte Ordner ist `<dataDir>/synced/<key>/` (bei Bedarf angelegt). Im Spielordner des neuen Profils entsteht der Eintrag `<folder>` als Link darauf: `ln -s` unter Linux und macOS, eine Verzeichnis-Junction per `cmd /c mklink /J` unter Windows (ohne Adminrechte). Ist der Eintrag schon vorhanden (Ordner, Datei oder Link), wird nichts ersetzt: 409 `conflict` mit „the folder <name> already exists in the new profile“. Schlägt ein Link fehl, antwortet die Anlage mit 500 `internal`; das Profil wird zurückgerollt (Links und Profilordner werden entfernt).
- Dateien (`options` → `options.txt`, `servers` → `servers.dat`): der geteilte Eintrag ist `<dataDir>/synced/options.txt` bzw. `servers.dat` (mit dem Namen des Spiels). Link: `ln -s` unter Linux und macOS; unter Windows ein Hardlink per `cmd /c mklink /H <Profildatei> <geteilte Datei>` (ohne Adminrechte, nur auf demselben Laufwerk). Entfernt wird ein Hardlink mit `del`, das nur diesen Namen löscht; die Datei bleibt. Aktivieren: fehlt die geteilte Datei, wird die Datei des Profils dorthin verschoben; ist sie schon da, wird die Datei des Profils nach `<gameDir>/.volt-sync-conflicts/<name>` verschoben (nicht überschrieben, bei belegtem Namen mit Zusatz „(2)“). Hat das Profil keine Datei und fehlt die geteilte, wird eine leere angelegt (`"createdEmpty": true`). `syncReport`: `{"key": "options", "action": "enable", "status": "ok", "moved": 1, "conflicts": 0, "createdEmpty": false}`. Deaktivieren: der Link wird entfernt, die geteilte Datei in den Spielordner kopiert (das Profil behält eine Kopie, die geteilte bleibt); `{"key": "options", "action": "disable", "status": "ok", "copied": 1}`. Schlägt die Kopie fehl, wird wie bei Ordnern rückgängig gemacht (Status `failed`). Anlegen: existiert der Eintrag im Spielordner, 409 mit „the file options.txt already exists in the new profile“. Das 409 bei laufendem Spiel, das Journal und die Löschregeln gelten unverändert.
- Löschen: entfernt werden nur die Links des Profils, im verwalteten Ordner und im Spielordner (falls per `PATCH` geändert). Unter Linux entfernt `removeAll` einen Link selbst, ohne ihm zu folgen. Unter Windows wird eine Junction vor dem Löschen des Profilordners mit `cmd /c rmdir` entfernt, damit `removeAll` nicht in das Ziel läuft. Bleibt ein Link stehen, bleibt der Profilordner erhalten (Warnung im Log). Geteilte Inhalte löscht der Launcher nie.
- Tests: `backend/tests/synced/run.sh` (Link und Ziel, gemeinsame Dateien, Löschen mit erhaltenem Inhalt, 400/409/500, PATCH aktivieren mit Zusammenführen und Konflikten, PATCH deaktivieren mit Kopie, fehlgeschlagene Kopie, Undo nach fehlgeschlagenem Link, Neustart, Profil ohne Feld; Dateien: aktivieren mit Verschieben, zweites Profil über denselben Link, deaktivieren mit Kopie, Konflikt in `.volt-sync-conflicts`, leere Datei, fehlgeschlagene Kopie, Undo, Anlegen mit 409 und mit beiden Dateien; im temporären Datenordner). `backend/tests/autoprofiles/run.sh` prüft, dass automatisch angelegte Profile `["options", "servers"]` mit Links haben. Nicht getestet: das 409 bei laufendem Spiel (kein Laufzeit-Hook angebunden), die Junction und der Hardlink unter Windows und macOS zur Laufzeit.

## Forge bis 1.12.2 (`launch/legacyforge.nv`)

Forge-Installer für Minecraft unter 1.13 werden nicht ausgeführt, weil sie `--installClient` nicht kennen (ihr `SimpleInstaller` bricht mit `UnrecognizedOptionException` ab). Der Launcher liest das Installer-JAR stattdessen als ZIP, wie frühere Launcher es taten: `install_profile.json` nennt in `install.filePath` das Universal-JAR, das nach `libraries/<Maven-Pfad von install.path>` geschrieben wird (atomar, übersprungen bei gleicher Größe). `versionInfo` wird als `versions/<id>/<id>.json` geschrieben. Die `id` muss der Versions-Id des Profils entsprechen, sonst 500. Die Bibliotheken holt der normale Schritt (`launchPlanLibraries`), Prozessoren gibt es in diesen Installern keine. Fehlt `install_profile.json` oder das Universal-JAR, endet die Installation mit 500 `internal` und dem Namen des Installers. Ab 1.13 bleibt der Headless-Lauf unverändert (`launchRunInstaller`).

Grenze: Ein Installer ohne `version.json` und ohne `install_profile.json` scheitert schon bei der Auflösung (`versions.nv`, 422), vor diesem Schritt.

Tests: `backend/tests/launch/legacyforge-test.sh` (lädt den echten 1.12.2-14.23.5.2847-Installer, prüft die SHA-1 des Universal-JAR gegen den ZIP-Eintrag, die Versions-JSON und die Verzweigung, dazu zwei Fehlerfälle; braucht Netz).
