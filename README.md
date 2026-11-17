# Filament Label Creator

Weboberfläche zum Erstellen einheitlicher Filament-Labels: mehrere Filamente in
einem Eingabefeld, automatische Online-Recherche, bearbeitbare Werte, PNG-Bilder
mit 300 dpi und ein druckbares A4-PDF. Keine Anmeldung oder API-Schlüssel nötig.

## Start mit Docker Compose

```sh
docker compose up --build -d
```

Anschließend **http://localhost:3000** öffnen. Stoppen: `docker compose down`.
Der Container läuft ohne Root-Rechte, mit schreibgeschütztem Dateisystem und
Healthcheck. Für die Recherche benötigt er ausgehenden HTTPS-Zugriff auf
`raw.githubusercontent.com`. Es werden keine Eingaben oder Exporte dauerhaft
gespeichert. Der Port kann in `compose.yaml` angepasst werden.

## Bedienung

1. Labelgröße in Millimetern und Standardfarbe festlegen.
2. Pro Zeile Hersteller, Filament und Farbe in Worten eintragen – Hex-Werte sind
   nicht nötig:
   ```text
   Prusament PETG schwarz
   Bambu Lab PLA Basic grau
   SainSmart TPU blau
   Elegoo PLA tri color blau/rot/grün
   ```
   Erkannt werden deutsche und englische Farbwörter (auch `dunkelblau`,
   `hell grün`, `rote`), mehrere Farben getrennt durch `/`, `,`, `&` oder `und`
   (bis zu 4 Farben, als Streifen auf dem Label) sowie exakte Farbnamen aus
   SpoolmanDB (z. B. `Bambu Lab PLA Basic Jade White`). Die Farbe wird vom
   Filamentnamen getrennt und als Farbbezeichnung aufs Label gedruckt. Weiterhin
   möglich: `Bambu PLA Basic; #e87939`. Zeilen ohne erkannte Farbe erhalten die
   Standardfarbe.
3. Recherche starten. Quellen und Warnungen beachten, Werte bei Bedarf korrigieren
   und die Vorschau aktualisieren.
4. Einzelne Labels als PNG herunterladen oder alle Labels als PDF exportieren.
   Das PDF enthält die PNG-Labels in der gewählten physischen Größe mit 10 mm
   Seitenrand und 3 mm Abstand; zusätzliche Seiten werden automatisch angelegt.
   Im Druckdialog **100 % / Tatsächliche Größe** wählen, nicht „An Seite anpassen“.

Bis zu 30 Filamente pro Durchlauf; Labelbreite 30–190 mm, Höhe 20–277 mm.
Sehr schmale oder hohe Formate erhalten weiße Freiflächen, damit die
Labelgestaltung unverzerrt bleibt. PNG-Abmessungen werden auf ganze Pixel gerundet.

## Online-Daten und Grenzen

Die Anwendung fragt feste, öffentliche Datenquellen in dieser Reihenfolge ab:

1. **[SpoolmanDB](https://github.com/Donkie/SpoolmanDB)** (MIT): Herstellerangaben
   (Temperaturbereiche, Dichte, Durchmesser) u. a. für Prusament/Prusa, Bambu Lab,
   Polymaker, eSUN, Sunlu, Elegoo, Creality, Anycubic, Overture, Hatchbox, Eryone,
   Geeetech, Flashforge, Jayo, Kingroon, Extrudr, Fillamentum, Fiberlogy,
   Formfutura, Das Filament, Devil Design, 3DJake, Proto-pasta, Inland,
   AmazonBasics, Qidi, Snapmaker, Spectrum, Verbatim, add:north, Zyltech, 3DXTech,
   AzureFilm, Artillery, BIQU, Kexcelled und Tinmorry.
2. **[OrcaSlicer-Filamentbibliothek](https://github.com/SoftFever/OrcaSlicer/tree/main/resources/profiles/OrcaFilamentLibrary)**:
   produktspezifisches Slicerprofil inklusive aufgelöster Profilvererbung.
3. **[SpoolmanDB-Community](https://github.com/Icezaza2543/SpoolmanDB-Community)**
   (MIT, junger, ungeprüfter Community-Fork): ergänzt u. a. **MakerBot**,
   **SainSmart**, ColorFabb, MatterHackers, UltiMaker, Raise3D, NinjaTek,
   Atomic Filament, Recreus, Sovol und Amolen. Treffer werden besonders gekennzeichnet.
4. Generisches OrcaSlicer-Materialprofil (siehe unten).

Für SpoolmanDB muss die Eingabe mit dem Markennamen beginnen (z. B.
`Prusament PETG`, `Bambu Lab PLA Matte`, `MakerBot Tough PLA`,
`SainSmart GT-3 Matte PLA`; die Schreibweise `Saintsmart` wird ebenfalls erkannt). Die Herstellerdatei wird ausschließlich über eine
feste Markentabelle ausgewählt. Produktwörter, Material und Effekte (z. B. Matte,
Silk, Glow) müssen zum Eintrag passen; zusätzlich sind Farbnamen aus der Datenbank
oder einfache Farbwörter (z. B. „Schwarz“, „dunkelblau“, „Red“) erlaubt. Unbekannte Produktwörter
führen nicht zu einem Ersatztreffer, sondern zur nächsten Quelle. Passen mehrere
Einträge mit abweichenden Werten, erscheint ein Hinweis. Für MakerBot und SainSmart
wurden keine anderen frei maschinenlesbaren Datenquellen gefunden (weder in
OrcaSlicer, PrusaSlicer noch Cura).

Alle Daten werden für eine Stunde im Arbeitsspeicher zwischengespeichert,
Fernwerte auf plausible Bereiche geprüft und Quellenlinks führen zur verwendeten
Datei bzw. zum verwendeten Profil (dessen `inherits`-Eintrag auf Basisprofile verweist).

**Dies sind Community-gepflegte Daten bzw. Slicerprofile, keine garantierten
Herstellerdatenblätter.** Düsen- und Betttemperaturen sind bevorzugt der
angegebene Bereich, alternativ der Sollwert; bei OrcaSlicer stammt die
Betttemperatur aus `hot_plate_temp` (beheizte Platte). Durchmesser und Dichte
können aus Basisprofilen geerbt sein. Die Werte hängen unter anderem von Drucker,
Druckplatte und Filamentvariante ab und müssen vor Verwendung geprüft werden.
Keine umfassende Suche über beliebige Internetseiten.

Ohne Produkttreffer wird, sofern vorhanden, ein **klar gekennzeichnetes generisches
Materialprofil** verwendet. Unbekannte Materialien, fehlende Werte und
Netzwerkfehler bleiben sichtbar; Werte werden nicht erfunden. Auch ohne Internet
können die Daten manuell ergänzt und Labels exportiert werden.

Die Anwendung ist für den lokalen bzw. vertrauenswürdigen Netzwerkbetrieb gedacht.
Für öffentlichen Zugriff einen Reverse Proxy mit TLS, Zugriffsschutz und
Ratenbegrenzung vorschalten. Externe Profil-URLs können nicht frei eingegeben werden.

## Lokale Entwicklung

Node.js ab 22.12:

```sh
npm ci
npm start
```

Optional `PORT=8080 npm start`. PNG-Text benötigt eine verfügbare Sans-Serif-Schrift
(z. B. DejaVu Sans; im Container enthalten).

```sh
npm run check
npm test
```

Die Tests nutzen den integrierten Node-Test-Runner, prüfen Recherche mit
deterministischen Online-Fixtures, Eingabevalidierung, PNG-Auflösung,
PDF-Seitenlayout und API-Endpunkte ohne externe Netzwerkabhängigkeit.
