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
2. Pro Zeile einen möglichst genauen Produktnamen eintragen. Optional nach einem
   Semikolon eine eigene Hex-Farbe angeben:
   ```text
   Bambu PLA Basic; #e87939
   Polymaker PolyLite PLA; #38bdf8
   eSUN PLA+; #84cc16
   ```
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

Die Anwendung durchsucht die öffentliche
[OrcaSlicer-Filamentbibliothek](https://github.com/SoftFever/OrcaSlicer/tree/main/resources/profiles/OrcaFilamentLibrary)
nach dem Produktnamen und löst die Vererbung der Profile auf. Bambu-Lab- und
Polymaker-Namenspräfixe werden normalisiert. Profile und Katalog werden für eine
Stunde im Arbeitsspeicher zwischengespeichert. Quellenlinks führen zum verwendeten
Profil, dessen `inherits`-Eintrag auf Basisprofile verweist.

**Dies sind Community-Slicerprofile, keine garantierten Herstellerdatenblätter.**
Düsentemperaturen sind bevorzugt der Profilbereich, alternativ der Sollwert;
die Betttemperatur stammt aus `hot_plate_temp` (beheizte Platte).
Durchmesser und Dichte können aus Basisprofilen geerbt sein. Die Werte hängen
unter anderem von Drucker, Druckplatte und Filamentvariante ab und müssen vor
Verwendung geprüft werden. Keine umfassende Suche über beliebige Internetseiten.

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
