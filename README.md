# Pilates-Studio Website

Eine schlanke Website für ein Reformer-Pilates-Studio mit integriertem **Adminbereich**, in dem alle Überschriften, Texte, Bilder, Seiten und Termine ohne Code geändert werden können.

Gebaut **ohne externe Abhängigkeiten** – nur mit Node.js-Boardmitteln (`http`, `crypto`, eingebautes `node:sqlite`). Benötigt **Node 22+**.

## Features

- Öffentliche Seiten: Home, Termine, Über mich, Kontakt (frei erweiterbar)
- Adminbereich unter `/admin`
  - Seiten anlegen / bearbeiten / löschen, Reihenfolge & Sichtbarkeit
  - Abschnitte pro Seite (Hero, Text + Bild, Feature-Karten, Termine, Kontakt)
  - Bilder hochladen (in DB gespeichert) oder per Bild-URL
  - Termine/Kurse verwalten
  - Globale Einstellungen (Name, Farben, Kontaktdaten, Footer)
- Responsives, elegantes Design

## Lokal starten

```bash
node server.js
# -> http://localhost:3000  (Admin: /admin)
```

## Konfiguration (Umgebungsvariablen)

| Variable | Beschreibung | Default |
|---|---|---|
| `PORT` | Port | `3000` |
| `ADMIN_PASSWORD` | Passwort für `/admin` | `admin` (unbedingt ändern!) |
| `SESSION_SECRET` | Secret für Login-Cookies | zufällig pro Start |
| `DATA_DIR` | Ordner der SQLite-Datei | `./data` |

## Deployment auf Railway

1. Repo mit Railway verbinden (Deploy from GitHub).
2. Variablen setzen: `ADMIN_PASSWORD`, `SESSION_SECRET`.
3. **Volume** anlegen und unter `/data` mounten, dann `DATA_DIR=/data` setzen,
   damit Inhalte ein Deployment überleben.
4. Railway erkennt Node automatisch und startet `npm start`.

## Hinweis zur Erstellung

Bei der Erstellung dieser Website wurden teilweise KI-gestützte Werkzeuge eingesetzt. Alle Inhalte wurden redaktionell geprüft.
