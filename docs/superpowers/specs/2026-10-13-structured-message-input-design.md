# RAMROS: Strukturierte Message-Eingabe (Webview-Formular) — Design

**Datum:** 2026-10-13
**Status:** Approved by user in conversation (2026-10-13)
**Ursprung:** Release-1.3.0-Smoke-Test-Findungen: JSON-Eingabe bei Publish Message / Call Service ist unintuitiv, weil die Message-Struktur den Nutzern unbekannt ist.

## Intent und Warum

RAMROS-Nutzer wollen Nachrichten auf Topics publizieren und Services aufrufen, ohne das
JSON/YAML-Format der Message zu kennen. Heute zeigen beide Commands eine nackte Input-Box
mit `'{}'` als Startwert — der Nutzer muss die Message-Definition selbst nachschlagen und
das korrekte Format von Hand tippen.

Die Extension kennt den Typ des Topics/Services bereits (Live View) und kann die
Message-Struktur via `ros2 interface show` auflösen. Daraus lässt sich eine Formular-
Eingabemaske generieren: pro Feld Name, Typ und ein passendes Eingabeelement.

## Goals

- Publish Message und Call Service öffnen ein Webview-Formular, das die Message-Struktur
  voll rekursiv auflöst (verschachtelte Messages als einklappbare Gruppen bis zur letzten Zahl).
- Pro Feld ein passendes Eingabeelement: Checkbox (`bool`), Zahlenfeld (`int`/`double`/`float`),
  Textfeld (`string`), Komma-separierte Liste für Arrays freier Länge (`type[]`),
  entsprechend viele Einzelfelder für Arrays fester Länge.
- Felder sind mit sinnvollen Defaults vorbelegt (0, `false`, `""`, leere Liste).
- Panel bleibt nach dem Absenden offen, damit kleine Änderungen direkt eingegeben und über
  einen Button erneut angewendet werden können (schnelles Iterieren beim Testen).
- Service-Responses erscheinen weiterhin im Read-only-Dokument (bestehendes Muster).

## Non-Goals

- Keine Sequenz-Editor-UI für Arrays (kein "Feld hinzufügen"-Button) — Arrays freier Länge
  sind Komma-separierte Texteingaben.
- Kein visuelles Feedback von `ros2 topic echo` im Formular — die Rückkontrolle bleibt im
  Terminal bzw. Read-only-Dokument.
- Kein Persistieren von Formularwerten über Fenster-Reloads hinweg.
- Keine Bearbeitung von Konstanten aus msg-Files — sie werden weggelassen oder als
  schreibgeschützt angezeigt.

## Anti-Goals (was ein Misserfolg wäre)

- Das Formular darf nicht langsamer oder umständlicher sein als die heutige JSON-Box für
  simple Messages (z.B. `std_msgs/msg/String` mit einem Feld).
- Es darf nichts kaputtgehen, wenn `ros2 interface show` fehlschlägt — Fallback ist die
  heutige Raw-Input-Box (nichts wird schlechter als jetzt).

## Verhalten im Detail

### Ablauf Publish Message

1. Nutzer klickt "Publish Message" auf einem Live-Topic (oder wählt Topic via QuickPick,
   wenn der Command ohne TreeItem aufgerufen wird).
2. Typ-Auflösung wie heute (TreeItem → `ros2 topic type` → manueller Fallback aus dem
   vorigen Fix).
3. Extension lädt die Message-Struktur: `ros2 interface show <type>` (mit dem
   Overlay-Sourcing aus `buildInterfaceShowCommand`) und parst den Output rekursiv.
4. Webview-Panel öffnet sich mit dem Formular.
5. Nutzer füllt Werte ein, klickt **Publish** (einmalig) oder **Publish @ Rate** (mit Hz-Angabe).
6. Panel bleibt offen; erneutes Klicken veröffentlicht erneut mit den aktuellen Werten.

### Ablauf Call Service

1. Nutzer klickt "Call Service" auf einem Live-Service.
2. Typ-Auflösung wie heute.
3. Struktur laden wie oben, Panel mit Request-Formular.
4. **Call**-Button führt den Service-Call aus; Response erscheint im Read-only-Dokument
   (bestehender Pfad). Panel bleibt offen für weitere Calls.

### Ausführungsart

- Einmalig-Publish: als versteckter `ros2 topic pub --once`-Aufruf (exec, kein Terminal-Spam
  beim wiederholten Klicken).
- Rate-Modus: öffnet weiterhin ein Terminal (muss ja manuell gestoppt werden).
- Service-Call: versteckter exec-Aufruf wie heute, Response ins Read-only-Dokument.

### Struktur-Loader (rekursiv, gecacht, graceful degradation)

- `ros2 interface show <type>` liefert nur die Top-Level-Definition; verschachtelte Typen
  (z.B. `std_msgs/Header header`) werden **rekursiv pro Typ nachgeladen** — ein Feldbaum-
  Loader mit Sub-Process pro unbekanntem Sub-Typ.
- Resolvierte Typ-Definitionen werden **pro Session gecacht** (In-Memory, Key: qualifizierter
  Typname), damit das erneute Öffnen des Formulars keine Sub-Process-Kaskade auslöst.
- **Partial Failure:** Löst sich ein Sub-Typ nicht auf (unbuilt workspace, unbekannter Typ),
  degradiert nur dieser Teilbaum zu einem Raw-Text-Feld (JSON/YAML-Freitext) — der Rest des
  Formulars rendert normal. Nur wenn schon der Top-Level-Typ fehlschlägt, fällt der gesamte
  Command auf die heutige Raw-Input-Box zurück.

### Arrays

- Arrays freier Länge von **Primitiven** (`float64[]`, `string[]` …): Komma-separierte
  Texteingabe. Strings, die Kommas enthalten, werden per Backslash escaped (`\,`).
- Arrays von **Nicht-Primitiven** (`Pose[]`, `Pose[3]`): ein JSON-Freitext-Feld für das
  ganze Array (z.B. `[{ "x": 1.0 }, { "x": 2.0 }]`) — kein Seq-Editor.
- Arrays **fester Länge** bis 16 Elemente: Einzelfelder pro Element. Darüber (z.B.
  `float64[720]`): ein Komma-separiertes Textfeld wie bei freier Länge (Anti-Goal: 720
  Eingabefelder).

### Environment und Ausführung

- Alle versteckten `ros2`-exec-Aufrufe (Struktur-Loader **und** `topic pub --once`)
  verwenden das Overlay-Sourcing-Muster aus `buildInterfaceShowCommand` (Workspace via
  `findWorkspaceForPath`, Fallback: ungesourct).
- Die Workspace-Auflösung passiert **vor** dem Struktur-Loading (Verschiebung gegenüber dem
  heutigen `publishToTopic`-Flow), damit das Sourcing beim `interface show` zur Verfügung steht.
- `topic pub --once` kann auf einen Subscriber warten: Timeout **10 s**; Fehler (Timeout,
  CLI-Fehler) erscheinen als Error-Notification; das Panel bleibt offen und die Werte bleiben
  erhalten.

### Panel-Semantik

- Ein Panel **pro Ziel** (Topic bzw. Service); erneutes Auslösen für dasselbe Ziel fokussiert
  das bestehende Panel und behält die Werte.
- Wird ein anderes Ziel ausgelöst, ersetzt das neue Formular den Inhalt des Panels.
- Rate-Publish snapshottet die Formularwerte beim Klick; spätere Änderungen beeinflussen das
  laufende Terminal nicht.

## Architektur / Umsetzungshinweise (Builder-Entscheidungen vorstrukturiert)

- Es gibt noch kein Webview im Codebase — das ist ein neues Muster. Panel als
  `vscode.window.createWebviewPanel`, Einzelfile-HTML mit Inline-JS/CSS (kein Framework,
  keine Bundling-Infrastruktur nötig; CSP mit Nonce beachten).
- Struktur-Loader/-Parser: neuer Core-Modul (pure, ohne vscode-Import) `src/core/interface-parser.ts`
  — parst `ros2 interface show`-Output in ein Feldbaum-Modell; der rekursive Loader mit
  Session-Cache lebt daneben (exec-Abhängigkeit wird injiziert, damit er unit-testbar bleibt).
- Formular → Message-Serialisierung: ebenfalls in `src/core/` (Werte-Objekt → YAML für
  `topic pub`, JSON für `service call`), inkl. Array-Parsing (Komma-Listen, Escaping,
  JSON-Freitext für Nicht-Primitive-Arrays).
- Der heutige Command-Flow in `publishToTopic` bzw. `ramros.live.callService` bleibt als
  Fallback-Pfad erhalten; Webview wird vorgeschaltet, wenn die Struktur erfolgreich geladen
  werden kann.
- Bestehende Interfaces (`NodeInfo`, `ServiceServerInfo` etc.) nur erweitern, nicht brechen.

## Constraints

- Keine neuen npm-Dependencies.
- `npm run lint`, `npm run typecheck`, `test:unit`, `test:integration` müssen grün bleiben.
- Unit-Tests dürfen `vscode` nicht importieren (Parser/Serialisierung landen in `src/core/`).
- Comments in English (README-Konvention).

## Was dem Builder überlassen bleibt

- Konkretes HTML/CSS-Layout des Formulars (VSCode-Theme-Variablen verwenden).
- Exakte Heuristik der Defaults pro Basistyp.
- Retry-/Error-Texte im Fallback-Pfad.
- Ob Konstanten weggelassen oder read-only angezeigt werden.
