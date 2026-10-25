# Bezier brand guidelines

Entwurf 2, 7. Oktober 2026. Ersetzt Entwurf 1. Widerspricht ein Screenshot dieser Anleitung, gilt die Anleitung.

Zwei Änderungen gegenüber Entwurf 1: Die Hauptaktion trägt die Akzentfarbe des Systems, und es gibt keine Versalien mehr, nirgends.

---

## Über Bezier

Parametrisches CAD im Browser und auf dem Mac. Lokal, schnell, ohne Konto. Die Oberfläche tritt zurück, das Modell steht in der Mitte.

Schreibweise: „Bezier“, immer klein im Logo, im Text normal geschrieben. Nie „open source“. Bezier ist source-available: „all code is public on GitHub“, „free for people, companies pay“.

## Tonalität

- Kurz, ruhig, konkret. Ein Satz, eine Idee.
- Sagen, was passiert, nicht wie toll es ist.
- Fehlermeldungen sind für Menschen geschrieben. Rohtext der Bibliothek steht nur im Detail.
- Keine Ausrufezeichen, keine Superlative, keine Pronomen für Personen, die niemand genannt hat.
- Satzbau wie im Satz: Großschreibung nur am Satzanfang und bei Eigennamen.

## Logo

**Schutzzone.** Um die Marke bleibt ringsum mindestens die halbe Höhe der Marke frei.

**Varianten.** Dunkle Marke auf dunklem Grund, helle Marke auf hellem Grund.

- Dunkel: `docs/brand/logo/bezier-app-icon-dark.png`
- Hell: `docs/brand/logo/bezier-app-icon-light.png`. Das ist die offizielle helle Marke und keine Übergangslösung mehr.

**Richtig**

- Marke unverändert, in der Originalfarbe, mit voller Schutzzone.
- Wortmarke in Archivo Bold, Breite 114 %.

**Falsch**

- Keine alte Kurvenmarke.
- Kein Verlauf über die Marke, kein Schatten, kein Lichtrand.
- Nicht drehen, nicht strecken, nicht umfärben.

## Icons und Elemente

Klein, gefüllt, rund. Raster 16 × 16, Hauptform in der Textfarbe, ein zweiter flacher Ton für Schatten (26 %), Linie 1,9. Gestrichelt heißt Konstruktion. Kein Verlauf auf Icons.

Zustände eines Icons: Ruhe, Hover (gefüllte Form, kein Rand), ausgewählt (Band).

## Flächen und Glas

**Fest.** Titelleiste, Rails, angedockte Panels und Icons sind immer deckend.

**Glas.** Nur Schwebendes wird Glas: Flyouts, Popover, Hinweise. Blur 24 px, Tönung 78 %, eine Kante mit 10 % Weiß. Kein Glas auf Glas, kein Lichtrand.

| Rolle | Wert |
| --- | --- |
| Panel, deckend | `surface-panel` #232323 |
| Glas | rgb(34 34 36 / 78 %) mit Kante 10 % |
| Hover | gefüllte Form, kein Rand |
| Auswahl | Band #575857, Text #F2F2F4 |
| Hauptaktion | Akzent, eine pro Ansicht (siehe unten) |
| Fokus | 2 px Ring #F4F4F5, 2 px Abstand |

Radien: 10 px Control, 14 px Band, 16 px Panel. Das Band ist immer runder als das Control darin.

## Farben

Schwarz, Graphit, Silber und Weiß bilden die Oberfläche. Monochrom und beleuchtet wie ein echtes Objekt. Farbe gibt es nur, wo sie eine Information trägt, die man sonst nicht bekommt, und für die eine Aktion, die zählt.

### Grundfarben

| Name | Wert |
| --- | --- |
| Silber-Verlauf | #FFFFFF · #C9C9CF · #8D8D95 |
| Ground | #09090A |
| Graphit | #232323 |
| Silber | #C9C9CF |
| Canvas | #1C1C1C |
| Weiß | #F2F2F4 |

### Akzentfarbe

Der Akzent ist die Akzentfarbe des Systems. Auf dem Mac ist das meist Blau, und wer sie in den Systemeinstellungen ändert, ändert sie auch in Bezier.

- **Wofür.** Nur für die entscheidende Aktion einer Ansicht: Solve, Done, Extrude bestätigen, Download. Eine pro Ansicht, nie zwei nebeneinander.
- **Wofür nicht.** Nicht für Navigation, Toggles, Rails, Karten, Fokusringe oder Hover. Die bleiben monochrom.
- **Umsetzung.** `--accent` in `packages/ui/src/tokens.css` liest `AccentColor` des Systems. Text darauf ist `AccentColorText` (`--text-on-accent`). Hover und ruhige Flächen entstehen per `color-mix` aus demselben Wert.
- **Rückfall**, wenn das System keine Akzentfarbe liefert: #0a84ff im dunklen Modus, #007aff im hellen.
- **Kontrast.** Der Akzent steht nie als Text auf Graphit, sondern als gefüllte Fläche mit `--text-on-accent`.

Im Viewport bleibt es bei Blau für Hover und Auswahl am Modell. Das ist Information und kein Akzent.

| Viewport | Wert |
| --- | --- |
| Hover | #73B8FF |
| Auswahl | #29A8CF |
| Auswahl-Kontur | #22B8E6 |

### Neutrale Skala

Jede Stufe hat genau eine Aufgabe. Auswahl und Fokus kommen ohne Farbton aus: hellere Fläche, heller Ring.

| Stufe | Wert | | Stufe | Wert |
| --- | --- | --- | --- | --- |
| Ground | #09090A | | Press | #3A3A3C |
| Sunken | #191919 | | Hover | #454547 |
| Canvas | #1C1C1C | | Line strong | #4A4A4A |
| Panel | #232323 | | Band | #575857 |
| Bar | #282828 | | Faint | #6A6C6E |
| Popover | #2D2D2F | | Dim | #909090 |
| Control | #303030 | | Text | #E0E0E0 |
| Line | #383838 | | Bright | #F2F2F4 |

### Informationsfarben

Nur für Achsen, Fehler und Grenzwerte. Immer zusammen mit Form oder Wort, nie als Farbton allein.

| Name | Wert | Einsatz |
| --- | --- | --- |
| Signal | #E5894A | über dem Limit, Warnung |
| Fehler | #E0554E | fehlgeschlagener Schritt |
| Achsen X · Y · Z | CAD-Konvention | nur am Würfel und in der Szene |

### Ergebnis-Skala

Helligkeit gleich Betrag. Neun gleiche Stufen, OKLCH L 0,30 bis 0,98. Funktioniert im Graustufendruck. Über dem Limit: Signal plus Schraffur.

## Typografie

Archivo ist die einzige Schrift der Marke: Wortmarke, Überschriften, Oberfläche, Einstellungen, Panels und Legenden. Variabel, Gewicht 100 bis 900, Breite 62 bis 125. Die Breite gehört zur Marke: breit für Überschriften (114 %), normal für Text. Zahlen, Koordinaten und Einheiten stehen in Tabellenziffern. Eine Monospace gibt es nur für Code und Dateinamen.

**Keine Versalien.** Weder in Überschriften noch in Etiketten, Panelnamen oder Legenden. Kein `text-transform: uppercase`, kein gesperrter Satz. Hierarchie entsteht über Größe, Gewicht und Helligkeit, nicht über Großbuchstaben.

### Rollen

| Rolle | Beispiel | Größe / Zeilenhöhe · Gewicht · Breite |
| --- | --- | --- |
| display | One model. | 118 / 0,92 · 600 · 114 % |
| headline | Nothing hidden. | 76 / 0,98 · 600 · 114 % |
| title | Every step stays editable. | 20 / 1,25 · 600 · 114 % |
| lede | No ribbon with two hundred icons. | 21 / 1,5 · 400 |
| body | Download it, open it, model. | 16 / 1,6 · 400 |
| eyebrow | All of it | 13 · 600 · 114 %, normale Schreibweise, kein Sperren |
| ui | Sketches and bodies | 12 / 1,33 · 500 |
| panel-label | Extrude | 11 · 600 · 114 %, normale Schreibweise, kein Sperren |
| numeric | 30.00 mm · 182.4 MPa | 12 · 500 · tabellarisch |

Gegenüber Entwurf 1 entfallen bei eyebrow und panel-label die Versalien und der Buchstabenabstand (+0,12 em und +0,08 em).

## Bildsprache

**Objekte auf Schwarz.** Zeig das echte Produkt: das Modell in der Mitte, grau, beleuchtet. Eine Idee pro Bild, nichts Dekoratives.

**Material und Licht.** Trocken, matt, feine Körnung, weiche Kontaktschatten. Licht immer von oben links. Kein glänzendes Plastik, keine Farbverläufe im Hintergrund.

## Anwendung

**App.** Auswahl als Band #575857, Hauptaktion in der Akzentfarbe des Systems, schwebende Panels als Glas, Ergebnisse in Graustufen, Zahlen in Archivo. Panelnamen in normaler Schreibweise: „Extrude“, „Von Mises stress, MPa“.

**Web und Social.** Kopf 64 px, Download als Hauptaktion in der Akzentfarbe, Fokus als heller Ring. Open-Graph-Karte 1200 × 630, Links ausgerichtet, Titel in normaler Schreibweise: „CAD you'll want to use.“

## Was wir vermeiden

Diese Fehler hat die App schon einmal gemacht. Sie stehen hier, damit kein Mensch und kein Agent sie wiederholt.

- Kein Akzent außer für die entscheidende Aktion. Kein Blau in Navigation, Toggles, Karten oder Fokus. Der Solve-Button im Simulationsbereich ist die Vorlage für die richtige Verwendung: eine gefüllte Akzentfläche, sonst nichts Farbiges.
- Keine feste Blaufarbe im Code, nur die Systemfarbe über `--accent`.
- Keine Versalien und kein gesperrter Satz.
- Kein Regenbogen, keine Ampel als Deko.
- Keine Systemschrift, nur Archivo.
- Keine Hex-Werte in Komponenten, nur Tokens.
- Kein Verlauf auf Icons, kein Glas auf Glas.
- Keine alte Kurvenmarke.
- Nie „open source“ schreiben.
