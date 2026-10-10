# Feature-Port: alte Java-Oberfläche → neue App

Ziel: Alle Funktionen der alten Java/Vue-Version laufen in der neuen Version (Novus-Backend
in `backend/`, Electron/React in `app/`). Danach wird der Java-Code (`volt-*`) und `ui/` entfernt.
Das Aussehen übernimmt `app/` bereits aus `ui/` (siehe Restyle).

Die Endpunkte der alten API (97 Stück, `volt-server/…/routes/*.java`) sind hier auf die
Arbeitspakete verteilt. Die neue API nutzt **Profile** statt „Instanzen“ und den Pfad-Stil aus
`docs/ARCHITECTURE.md`.

## Regeln für alle Agenten

1. **Nur eigene Verzeichnisse anlegen/ändern.** Ein Paket besitzt:
   - Backend: `backend/src/<modul>/` und `backend/tests/<modul>/`
   - Frontend: `app/src/renderer/src/pages/<bereich>/` und `app/src/renderer/src/components/<bereich>/`
2. **Gemeinsame Dateien nur mit `Edit`** (nie mit `Write` überschreiben), und direkt vor dem Edit neu lesen:
   - `backend/src/server/router.nv` (je Modul ein Dispatch-Zweig)
   - `backend/src/core/*.nv` (nur minimale Ergänzungen; Änderungen am Kern nur, wenn sie nötig sind)
   - `docs/ARCHITECTURE.md` (eigener Abschnitt am Ende mit den neuen Endpunkten)
   - `app/src/shared/models.ts`, `app/src/renderer/src/lib/api.ts`, `app/src/App.tsx` (Routen)
   - `app/src/renderer/src/i18n/de.ts` und `en.ts` (Schlüssel im eigenen Namensraum, z. B. `saves.worlds.title`)
3. **Eigene Builds nur in das Scratch-Verzeichnis**, nie nach `backend/dist/`. Beispiel:
   `novusc build backend/src/main.nv -o <scratch>/<paket>/volt-backend`.
4. **Keine git-Befehle, die etwas ändern.** Keine Löschungen außerhalb des eigenen Pakets.
5. **Verifizieren, nicht behaupten.** Jede Funktion mit echten Daten prüfen (curl gegen das eigene
   Binary, Browser-Check mit `pnpm dev:web`). `pnpm typecheck`, `pnpm lint`, `pnpm build` in `app/`
   müssen grün sein, `backend/scripts/smoke.sh` muss weiter 42/42 bestehen.
6. **Novus-Fallen:** kein `null`-Literal (`core.none()`/`core.isNull()`), kein `${m["k"]}`,
   keine Exceptions (`core.fail`/`core.runTrapped`), `sync` nie um fehlerauslösende Aufrufe,
   `std/http` nur über einen gemeinsamen Lock (Temp-Datei-Zähler ist nicht threadsicher).
7. **Berichtsformat:** Was umgesetzt ist (verifiziert), was fehlt, gefundene Novus-Fehler mit Repro,
   geänderte gemeinsame Dateien, Endpunkte mit Beispiel-Requests.

## Arbeitspakete

### P1 Profilverwaltung
Java: `volt-server/.../InstanceRoutes.java`, `SettingsRoutes.java`, `volt-game/.../instance/*`.
Backend `backend/src/core/profiles.nv` erweitern (eigenes Modul `profilemgmt/` wenn es passt).
- Gruppen, Favoriten, Icon (Upload), Umbenennen, Duplizieren
- Profil-Einstellungen: Speicher, Java-Pfad, JVM-Args, Wrapper, Umgebungsvariablen, Hooks
  (vor/nach dem Start), eigenes Spielverzeichnis, Vollbild, „Launcher beim Start ausblenden“
- Prüfen und Reparieren (`verify`), Spielzeit (`totalPlaytimeMs`), Launch-Status
- Loader-Versionen (`GET loader-versions`), Minecraft-Versionen (`GET versions`), Plattformen
Frontend: Profil-Raster mit Gruppen, Favoriten, Sortierung, Suche; Profil-Einstellungen komplett; Prüfen-Button.

### P2 Spieldaten (Welten, Server, Screenshots, Logs, Backups)
Java: `WorldRoutes.java`, `LogRoutes.java`, `BackupRoutes.java`, `volt-game/.../world/*`,
`log/GameLogService.java`, `media/ScreenshotService.java`, `backup/InstanceBackupService.java`.
Neues Modul `backend/src/gamedata/`. Braucht einen NBT-Leser in Novus (für `servers.dat`
und `level.dat`), gzip über `std/zlib` bzw. externes `gzip`.
- Welten: Liste mit Metadaten, Umbenennen, Duplizieren, Kopieren, Löschen
- Serverliste: Liste, Hinzufügen, Entfernen, Bearbeiten
- Screenshots: Liste, Löschen, Ordner öffnen (Ordnerpfad an Electron geben)
- Logs: Liste, Lesen, letzter Crash-Report, Löschen
- Backups: Liste, Erstellen, Wiederherstellen, Löschen (ZIP)
Frontend: Panels für Welten, Server, Screenshots, Logs, Backups im Profil.

### P3 Konten, Skins, Anmeldung
Java: `AuthRoutes.java`, `SkinRoutes.java`, `volt-auth/*` (MicrosoftAuth, SessionManager,
MinecraftAuthClient, XboxAuthClient, EncryptedAccountStore, SkinStore).
Neues Modul `backend/src/accounts/`. Verschlüsselte Kontospeicherung über `std/crypto`
(AES-GCM oder vergleichbar; Schlüssel pro Installation). Launch-Platzhalter (`launch/command.nv`,
`auth_*`) auf das ausgewählte Konto umstellen; nur eine kleine, benannte Funktion ändern.
- Anmelden (Microsoft/Xbox/Minecraft, Callback über den lokalen Server), Status, Abmelden
- Konten: Liste, Auswahl, Entfernen
- Skins: Liste, Hochladen (PNG), Umbenennen, Löschen, Auswahl/Anwenden am Konto
- Offline-Modus
Frontend: Konto-Menü, Anmeldung, Skin-Bibliothek mit Vorschau.

### P4 System, Einstellungen, Integrationen
Java: `SettingsRoutes.java`, `WindowRoutes.java` (Fenster-Funktionen übernimmt Electron),
`volt-core/.../discord/*`, `volt-core/.../update/LauncherUpdateService.java`,
`volt-game/.../java/*` (Java-Laufzeiten finden und installieren).
Neues Modul `backend/src/system/`.
- Einstellungen: Verzeichnisse anzeigen/öffnen, Zurücksetzen
- Discord-Rich-Presence (IPC über Unix-Socket bzw. Named Pipe; ggf. C-Block)
- Launcher-Update: prüfen, herunterladen, Release öffnen
- Java-Laufzeiten: Liste, Installation (Temurin) — Logik aus `launch/java.nv` wiederverwenden
Frontend: Einstellungs-Bereiche (Allgemein, Darstellung, Java/Speicher, Erweitert, Updates, Anbieter).

### P5 Inhalte und Modpacks
Java: `ContentRoutes.java`, `ProviderRoutes.java`, `volt-providers/.../content/*`,
`volt-providers/.../modrinth/*`, `curseforge/*`, `technic/*`, `ftb/*`.
Baut auf `backend/src/mods/` und `backend/src/providers/` auf (Modul erweitern, nicht duplizieren).
- Inhalte je Typ (Mods, Resource-Packs, Shader, Datenpacks): Liste, Ein/Aus, alle Ein/Aus, Löschen
- Versionswechsel je Datei, Abhängigkeiten, Updates, Identifikation
- Modpack: Info, Versionen, Aktualisieren; Export (`.mrpack`, CurseForge-ZIP); Import (ZIP, mrpack, Technic-ZIP)
Frontend: Inhalts-Tabs im Profil, Modpack-Panel, Export/Import-Dialoge.

### P6 Entdecken und Oberfläche
Java: `volt-server/.../ProviderRoutes.java`, Vue-Komponenten in `ui/src/components/discover/*`,
`ui/src/components/TaskCenter.vue`, `ui/src/components/tabs/HomeTab.vue`.
- Entdecken: Sortierung, Kategorien, Release-Typ-Badges, Filter zurücksetzen, Schnell-Hinzufügen,
  Abhängigkeits-Option bei Installation
- Aktivitätszentrum (Jobs), Benachrichtigungen, Akzentfarbe, UI-Skalierung, Animationen, Startseite

## Status

Stand nach Integration: Backend-Tests grün (Smoke 42/42, Providers 36/36, Mods 62/62, Konten 56/56, Profil 27/27, Inhalte 47/47, Launch-Kanten-Test 0 Fehler), `app/` Typecheck/Lint/Build grün, Electron startet und startet das Backend. Nicht geprüft: echte Microsoft-Anmeldung, echte Discord-Präsenz, Temurin-Download, CurseForge-Pfade, Windows.

| Paket | Status |
| --- | --- |
| P1 Profilverwaltung | umgesetzt, Tests grün (Details im Abschnitt des Pakets) |
| P2 Spieldaten | umgesetzt, Tests grün (Details im Abschnitt des Pakets) |
| P3 Konten und Skins | umgesetzt, Tests grün (Details im Abschnitt des Pakets) |
| P4 System und Einstellungen | umgesetzt, Tests grün (Details im Abschnitt des Pakets) |
| P5 Inhalte und Modpacks | umgesetzt, Tests grün (Details im Abschnitt des Pakets) |
| P6 Entdecken und Oberfläche | umgesetzt, Tests grün (Details im Abschnitt des Pakets) |
