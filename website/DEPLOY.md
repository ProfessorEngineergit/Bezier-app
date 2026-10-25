# Website, Downloads und App auf bezier-cad.xyz (IONOS)

Was wohin kommt, wie man IONOS einmal einrichtet, und wie danach jede Version von selbst auf der
Website landet.

| Adresse | Inhalt | Ordner im Webspace | Kommt aus |
| --- | --- | --- | --- |
| `https://bezier-cad.xyz` | Website: Produkt, Download, Learn, Developers (mit Wiki) | `/bezier-site` | `website/` → `website/dist` |
| `https://bezier-cad.xyz/downloads/…` | Installer der neuesten stabilen und Beta-Version | `/bezier-site/downloads` | GitHub-Releases, gespiegelt |
| `https://app.bezier-cad.xyz` | Bezier im Browser | `/bezier-app` | `pnpm build` → `apps/studio/dist` |

Alles ist statisch. Der IONOS-Webspace (Apache) liefert es aus, es läuft kein Server-Code. Gebaut
und hochgeladen wird es von GitHub Actions: `.github/workflows/website.yml`.

## Kanäle und Branches

| Kanal | Repository und Branch | Tag | Auf der Website |
| --- | --- | --- | --- |
| dev | the private development repository · `dev` | keiner | nie (privat, darf rot sein) |
| alpha | `bezier` · `main` | keiner, Builds mit `channel: alpha` | nur mit Zugangscode |
| beta | `bezier` · `beta` | `v0.3.0-beta.1`, als Pre-Release | Download → Beta |
| stable | `bezier-app` · `main` | `v0.3.0`, als Latest | Download → Stable (Standard) |

Eine Version wandert so: `dev` → `pnpm promote:alpha` → `bezier` `main` → `pnpm promote:beta` →
`bezier` `beta` (Beta-Release) → hält sie, `pnpm promote:stable` → `bezier-app` `main` (stabiles
Release).

## 1. IONOS einmal einrichten

Die Bezeichnungen im Kundenbereich ändern sich von Zeit zu Zeit und je nach Paket; die Schritte
folgen der Hilfe von IONOS (Stand Oktober 2026). Weicht ein Menüpunkt ab, hilft die Suche in der
IONOS-Hilfe nach den fett gedruckten Begriffen.

**Voraussetzungen.** Ein Linux-Webhosting-Paket (Apache, mit `.htaccess`; `mod_rewrite` und
`mod_headers` stehen laut IONOS zur Verfügung), und die Domain `bezier-cad.xyz` im selben Kundenkonto
mit den IONOS-Nameservern. Ein Windows-Paket geht nicht: dort gilt kein `.htaccess`, und die
Anmeldung per SFTP gibt es nicht.

### 1.1 Zwei Ordner im Webspace

Entweder im Datei-Manager des Kundenbereichs oder später mit einem SFTP-Programm (Schritt 1.5):
im Hauptverzeichnis des Webspace die Ordner **`bezier-site`** und **`bezier-app`** anlegen. Nicht
in einen Unterordner wie `clickandbuilds` legen; die Pfade im Workflow gehen vom Hauptverzeichnis aus.

### 1.2 Die Hauptdomain auf `bezier-site` zeigen lassen

1. [Anmelden](https://login.ionos.de), oben im Menü **Domains & SSL**.
2. In der Liste `bezier-cad.xyz` auswählen, dann **Verwendungsart ändern** beziehungsweise
   **Domain verwenden** (die Hilfe nennt es „Use Domain“) und **Webspace** wählen.
3. Als Verzeichnis `bezier-site` wählen und speichern.

Steht dort der Hinweis, die Domain sei schon an eine Anwendung gebunden (Website-Baukasten,
WordPress), diese zuerst trennen: [Anleitung von IONOS](https://ionos.co.uk/help/domains/connecting-a-domain-to-your-webspace/connecting-a-domain-to-a-webspace-directory).

### 1.3 Subdomains `app` und `www`

1. **Domains & SSL**, bei `bezier-cad.xyz` im Bereich *Schnellzugriff* **Subdomain erstellen**
   ([Anleitung](https://www.ionos.com/help/domains/using-subdomains-with-your-website/creating-a-subdomain/)).
2. Name `app` eingeben, bestätigen.
3. Die neue Subdomain `app.bezier-cad.xyz` wie in 1.2 mit **Domain verwenden** an den Webspace binden,
   Verzeichnis **`bezier-app`**
   ([Anleitung](https://www.ionos.com/help/domains/using-subdomains-with-your-website/structuring-website-content-with-subdomains/)).
4. Dasselbe mit der Subdomain `www`, Verzeichnis **`bezier-site`** (dieselbe wie die Hauptdomain;
   die Website leitet `www` selbst auf `bezier-cad.xyz` um).

Die DNS-Einträge setzt IONOS dabei selbst, solange `bezier-cad.xyz` die IONOS-Nameserver nutzt. Bis
eine neue Adresse im Netz erreichbar ist, können einige Minuten bis wenige Stunden vergehen.

### 1.4 HTTPS

Ein Wildcard-Zertifikat von DigiCert (`*.bezier-cad.xyz`) ist laut IONOS in jedem Hosting-Paket
enthalten ([Hilfe](https://www.ionos.com/help/ssl-certificates/tips-for-setup-and-use/secure-your-website-with-ssl-encryption/)).

1. **Domains & SSL**, `bezier-cad.xyz` auswählen, im Bereich **SSL** das Zertifikat **aktivieren**
   (Status der Domain muss *Aktiv* sein).
2. Prüfen, dass es für `bezier-cad.xyz`, `www.bezier-cad.xyz` und `app.bezier-cad.xyz` gilt. Steht bei einer der
   Subdomains „kein SSL“, dort ebenfalls auf **SSL aktivieren** gehen.
3. Nach einigen Minuten `https://bezier-cad.xyz` und `https://app.bezier-cad.xyz` im Browser öffnen: ohne
   Warnung und mit Schloss ist es fertig. Die Weiterleitung von `http` auf `https` kommt aus der
   `.htaccess` der Website.

### 1.5 SFTP-Zugang für GitHub

Der Workflow meldet sich per SFTP an (Port 22). Ein eigener Benutzer nur für diesen Zweck ist besser
als das Hauptpasswort.

1. **Menü → Hosting**, das Paket auswählen, in der Kachel **SFTP & SSH** auf **Verwalten**
   ([Hilfe zu den Verbindungsdaten](https://www.ionos.com/help/hosting/setting-up-and-managing-ftp-access/connection-details-for-ftp/sftp-in-ionos-web-hosting/)).
2. **Benutzer hinzufügen** (bei Paketen ab August 2024 *SFTP/SSH-Konto erstellen*), einen
   Namen und ein langes zufälliges Passwort vergeben, den Zugriff auf das Hauptverzeichnis des
   Webspace beschränken.
3. Auf den Benutzer klicken. Dort stehen die drei Angaben, die GitHub braucht:
   - **Host**, die persönliche Adresse, etwa `access123456789.webspace-data.io`
   - **Benutzername**, etwa `u12345678`, beziehungsweise der vergebene Name
   - **Passwort**, das du gesetzt hast. IONOS zeigt es später nicht mehr an.
4. Zum Ausprobieren mit FileZilla: Protokoll **SFTP – SSH File Transfer Protocol**, Port 22,
   Anmeldetyp *Normal*, diese Angaben. Die Ordner aus 1.1 müssen sichtbar sein
   ([Hilfe](https://www.ionos.co.uk/help/hosting/setting-up-and-managing-ftp-access/saving-your-sftp-connection-data-in-filezilla/)).

### 1.6 Platz

Die App belegt etwa 290 MB in 225 Dateien, die Website mit Film etwa 22 MB, die Installer je Kanal
etwa 150–250 MB. Je Kanal liegt nur die neueste Version auf dem Webspace (alle bleiben auf
GitHub). Zusammen sind das gut 1 GB; im Kundenbereich unter dem Paket den freien Speicher prüfen.

## 2. GitHub einrichten

Im Repository **`bezier-app`** (dort läuft der Website-Workflow): *Settings* → *Secrets and
variables* → *Actions*.

| Art | Name | Wert |
| --- | --- | --- |
| Secret | `IONOS_SFTP_HOST` | der Host aus Schritt 6 |
| Secret | `IONOS_SFTP_USER` | der SFTP-Benutzer |
| Secret | `IONOS_SFTP_PASSWORD` | sein Passwort |
| Secret | `RELEASES_TOKEN` | Fine-grained Token, Zugriff auf `bezier-app` und `bezier`, Berechtigung *Contents: Read* |
| Variable | `IONOS_SITE_PATH` | `/bezier-site` (Standard, wenn leer) |
| Variable | `IONOS_APP_PATH` | `/bezier-app` (Standard, wenn leer) |

Im Repository **`bezier`** (Beta), optional:

| Art | Name | Wert |
| --- | --- | --- |
| Secret | `WEBSITE_DISPATCH_TOKEN` | Fine-grained Token für `bezier-app`, *Contents: Read and write*. Damit erscheint eine neue Beta sofort; ohne ihn beim nächsten Lauf (zweimal täglich). |

Den Token für `RELEASES_TOKEN` gibt es unter GitHub → *Settings* → *Developer settings* →
*Fine-grained tokens*: Ablaufdatum setzen und im Kalender vermerken.

Der Workflow muss auf `main` von `bezier-app` liegen. Er kommt mit dem nächsten
`pnpm promote:stable` dorthin, weil `.github/` und `website/` zum Baum gehören.

## 3. Eine Version veröffentlichen

**Beta** (im Repository `bezier`, Branch `beta`): *Actions* → *Release build* → *Run workflow*: Version
`0.3.0-beta.1`, publish `beta`. Der Workflow baut auf Mac, Windows und Linux, legt das
Pre-Release `v0.3.0-beta.1` mit allen Installern und Prüfsummen an und meldet es der Website.

**Stabil** (im Repository `bezier-app`, nach `pnpm promote:stable`): dasselbe mit Version `0.3.0` und
publish `stable`. Das Release wird *Latest*, und die Website zieht es sofort.

Der Workflow lehnt eine Beta in `bezier-app` und eine stabile Version in `bezier` ab. Eine Version
landet nur auf der Linie, die sie getestet hat.

## 4. Erster Lauf und Prüfung

1. In `bezier-app`: *Actions* → *Website* → *Run workflow*. Das baut die Website und die App,
   spiegelt die Releases und lädt beides hoch. Der erste Lauf überträgt etwa 300 MB und dauert
   je nach Verbindung zehn bis zwanzig Minuten; die späteren übertragen nur, was sich geändert hat.
   **Der Workflow löscht im Zielordner alles, was nicht in der Website beziehungsweise der App
   steht.** Darum nie `IONOS_SITE_PATH` oder `IONOS_APP_PATH` auf `/` setzen und keine
   fremden Dateien in diese beiden Ordner legen.
2. `https://bezier-cad.xyz` öffnen, dann *Download*. Ohne Release steht dort „The first release is on
   its way“, das ist richtig. Mit Release zeigt die Seite die Datei für den eigenen Rechner als
   Hauptknopf.
3. `https://app.bezier-cad.xyz` öffnen und ein Projekt anlegen. Lädt der Geometrie-Kern nicht, fehlt
   meist der WASM-Typ: Prüfen, ob `/bezier-app/.htaccess` hochgeladen ist (versteckte Dateien zeigt
   der IONOS-Dateimanager erst nach Umschalten).

Lokal ansehen, ohne etwas hochzuladen:

```bash
node website/build/build.mjs
npx serve website/dist        # oder ein beliebiger statischer Server
```

## 5. Vor dem öffentlichen Start

- **Impressum und Datenschutz** ausfüllen (`website/pages/8-imprint.html`, `9-privacy.html`).
  Dort stehen Platzhalter; Pflichtangaben nach § 5 DDG und DSGVO, IONOS als Auftragsverarbeiter
  (AV-Vertrag im Kundenbereich unter *Datenschutz* abschließen).
- **Repositories öffentlich machen**, oder sie privat lassen: Die Website spiegelt die Installer
  ohnehin auf den Webspace, Besucher brauchen also keinen Zugang zu GitHub. Die Links „Source on
  GitHub“ funktionieren aber erst, wenn `bezier` öffentlich ist.
- **Signieren.** Die Installer sind unsigniert; die Download-Seite sagt das. Mit den
  Apple-Secrets im Release-Workflow werden sie signiert und notarisiert.

## Was der Webspace nicht kann

Der Webspace führt keine dauerhaften Prozesse aus. Für die eigenen Server (Sync, Community-Store,
MCP über HTTPS) braucht es einen kleinen Linux-Server, zum Beispiel einen IONOS VPS (Linux, 1–2 GB
RAM reichen):

| Subdomain | Server | Anleitung |
| --- | --- | --- |
| `sync.bezier-cad.xyz` | Sync, geteilte Projekte | `apps/sync-server/README.md`, `apps/sync-server/deploy` (Docker + Caddy) |
| `store.bezier-cad.xyz` | Community: Lektionen und Plugins | `docs/servers.md` |
| `mcp.bezier-cad.xyz` | MCP über HTTPS | `docs/mcp/server.md` |

Dafür in IONOS bei *Domains & SSL* → *DNS* je einen A-Record (und AAAA) auf die IP des VPS setzen.
Caddy holt die Zertifikate dort selbst. Website und App bleiben auf dem Webspace.
