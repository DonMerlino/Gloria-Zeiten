# Minijob Zeiten – Anleitung

## 1. App auf GitHub Pages veröffentlichen (einmalig, ca. 10 Minuten, am PC)

1. Auf **github.com** ein kostenloses Konto anlegen und anmelden.
2. Oben rechts auf **+** und dann **New repository** klicken.
   - Name: z. B. `zeiten`
   - **Public** auswählen (für kostenloses GitHub Pages nötig; im Code stehen keine persönlichen Daten)
   - **Create repository** klicken.
3. Auf der neuen Seite den Link **uploading an existing file** anklicken.
4. Den **Inhalt** des Ordners `zeiterfassung` hineinziehen, also alle Dateien **und** den Ordner `icons`, nicht den Ordner `zeiterfassung` selbst.
   Danach unten **Commit changes** klicken.
5. Oben auf **Settings** und links auf **Pages** klicken.
   Unter „Branch“ **main** und **/ (root)** wählen, dann **Save**.
6. Nach 1–2 Minuten steht oben die Adresse, z. B. `https://DEINNAME.github.io/zeiten/`.

## 2. Claude API-Schlüssel besorgen (für die Foto-Erkennung)

1. **console.anthropic.com** öffnen und ein Konto anlegen.
2. Unter **Billing** ein kleines Guthaben aufladen, z. B. 5 $. Das reicht bei normaler Nutzung für viele Monate.
3. Unter **Limits** ein monatliches Ausgabenlimit setzen, z. B. 2 $. Mehr kann dann nie abgebucht werden.
4. Unter **API Keys** auf **Create Key** klicken und den Schlüssel (`sk-ant-…`) kopieren.
   Am besten schickst du ihn dir selbst, z. B. per Notiz in iCloud, damit du ihn auf dem iPhone einfügen kannst.

Kosten pro Foto: ca. 1–2 Cent mit „Opus 5.5“, unter 0,1 Cent mit „Haiku 5.5“. Bei 20 Arbeitstagen im Monat sind das höchstens etwa 40 Cent bzw. 2 Cent.

## 3. Auf dem iPhone installieren

1. Die Adresse aus Schritt 1 in **Safari** öffnen.
2. Unten auf **Teilen** (Quadrat mit Pfeil) und dann **Zum Home-Bildschirm** tippen.
3. Die App ab jetzt **immer über das Symbol auf dem Home-Bildschirm** öffnen, nicht über Safari.
   Nur so bleiben die Daten dauerhaft gespeichert.

## 4. Einrichten (in der App unter „Einstellungen“)

1. **API-Schlüssel** einfügen.
2. **Rechnen ab Datum**: 01.01.2026. **Stundenguthaben**: dein Überstunden-Stand zu diesem Datum, z. B. `3:30`.
3. Prüfen, ob Mindestlohn und Minijob-Grenze stimmen. Vorbelegt sind:
   2026 13,90 € / 603 €, 2027 14,60 € / 633 €.
4. **Einstellungen speichern**.
5. **Stelle auf der Checkliste festlegen**: Ein Foto einer Checkliste wählen und mit dem Finger ein Rechteck um die Stelle ziehen, an der du deine Zeiten einträgst.

## 5. Benutzung

- **Kamera-Knopf**: Foto aufnehmen oder aus der Mediathek wählen.
  Die App nimmt das Aufnahmedatum des Fotos, liest Beginn und Ende und zeigt sie dir zur Kontrolle.
  Orange markierte Felder waren schwer lesbar und sollten geprüft werden.
- **Korrektur**: Einen Eintrag antippen. Du kannst Beginn und Ende direkt ändern
  oder bei „Korrektur“ z. B. `-1:00` eintragen und eine Begründung notieren.
  Korrigierte Einträge sind mit „korrigiert“ markiert, die vom Foto erkannte Zeit bleibt sichtbar.
- **+ ohne Foto**: Eintrag von Hand, z. B. wenn du das Foto vergessen hast.
- **Alte Fotos ab Januar nachtragen**: Einfach nacheinander aus der Mediathek wählen.

## 6. Datensicherung

Alle Daten liegen nur auf deinem iPhone.
Unter **Einstellungen → Sicherung exportieren** speicherst du sie, z. B. in **Dateien → iCloud Drive**.
Das am besten einmal im Monat machen. Bei einem neuen iPhone: App installieren, dann **Sicherung wiederherstellen**.
Der API-Schlüssel steht aus Sicherheitsgründen nicht in der Sicherung und muss neu eingegeben werden.

## So rechnet die App

Gezahlt wird jeweils **am 15.** Mit der Zahlung am 15. November werden die Arbeitstage vom **16. Oktober bis 15. November** bezahlt.

Pro Zahlung: **Übertrag aus der letzten Zahlung + gearbeitete Stunden im Zeitraum**.
Davon wird höchstens bis zur Minijob-Grenze ausbezahlt (2026: 603 € = 43:23 Std.). Die ältesten Stunden kommen zuerst dran.
Was nicht mehr passt, fällt in die nächste Zahlung.

In der Ansicht „Monat“ siehst du pro Zahlung:
- **Bezahlt am 15.**: jeden Arbeitstag, der mit dieser Zahlung bezahlt wird. „Übertrag“ heißt, der Tag stammt aus einem früheren Zeitraum.
- **Fällt in die Zahlung am …**: die Tage bzw. Stunden, die erst mit der nächsten Zahlung kommen.
- Ein Tag, der die Grenze überschreitet, wird aufgeteilt, z. B. „3:19 von 4:30“ bezahlt und „1:11 von 4:30“ als Rest in der nächsten Zahlung.

Beispiel: Vom 16.10. bis 15.11. 50 Std. gearbeitet: Am 15.11. kommen 603 €, 6:37 Std. gehen in die nächste Zahlung.
Vom 16.11. bis 15.12. 35 Std. gearbeitet: 35 + 6:37 = 41:37 Std. Am 15.12. kommen also 578,50 €, danach ist das Konto wieder bei 0.

**Tipp:** Stelle in den Einstellungen „Rechnen ab Datum“ auf einen 16., z. B. 16.12.2025. Trage als Startguthaben die Stunden ein, die zu diesem Tag noch offen waren.

## Später etwas ändern

Geänderte Dateien wieder auf GitHub hochladen („Add file → Upload files“).
Die Versionsnummer in `sw.js` (`const VERSION = 'v2'`) ist bei jeder neuen Fassung schon erhöht. Danach die App auf dem iPhone einmal schließen und neu öffnen, ggf. zweimal.
