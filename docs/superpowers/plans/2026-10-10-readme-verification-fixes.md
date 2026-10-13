# RAMROS: Funde aus der README-Verifikation umsetzen — Implementierungsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Die in der README-Verifikation gefundenen Lücken und Bugs beheben: Services/Actions-Statikanalyse, `.launch.xml`-Generierung, Bag-Auswahl aus dem Workspace, Verdrahtung der `launchGenerator.*`-Einstellungen, Duplikat-Validierung im Wizard, plus die gefundenen Bag-Bugs.

**Architecture:** Alle Änderungen folgen den bestehenden Mustern: Kern-Logik in `src/core/` bzw. `src/wizard/` (pure, testbar ohne vscode-Mock), UI in `src/treeview/`, Verdrahtung in `src/extension.ts` und `package.json`. Regex-basierte Statikanalyse analog zu Publishern/Subscriptions in `package-discovery.ts`. Tests in `src/__tests__/unit/` (ohne vscode-Abhängigkeit) bzw. `src/__tests__/integration/` (mit vscode-Mock via `moduleNameMapper`).

**Tech Stack:** TypeScript (strict), VSCode Extension API ^1.85, Jest 29 + ts-jest.

**Spec:** Ergebnisse der README-Verifikation (Conversation vom 2026-10-10); `docs/superpowers/specs/` hat keine eigene Spec — dieser Plan ist die Spec.

## Global Constraints

- `npm run lint` (eslint, `src --ext ts`) und `npm run typecheck` müssen nach jedem Task grün sein.
- Unit-Tests: `npm run test:unit`; Integration: `npm run test:integration`. Beide müssen nach jedem Task grün bleiben.
- Keine neuen npm-Dependencies.
- Keine Kommentare in neuem Code außerhalb bestehender Konventionen (README sagt: Comments in English).
- Bestehende Interfaces (`NodeInfo`, `PackageInfo`, `LaunchFileConfig` etc.) nur erweitern, nicht brechen — alle Tests, die sie konsumieren, müssen weiterlaufen.
- Command-Registrierung folgt dem Muster: `package.json contributes.commands` + `registerCommand` in `src/extension.ts`.
- Unit-Tests dürfen `vscode` nicht importieren (jest.unit.config hat kein moduleNameMapper für `vscode`); alles mit vscode-Import gehört in `src/__tests__/integration/`.
- File paths in TreeItems: `contextValue`-Konvention kleinCamelCase.

## Review Focus

1. **Regex-False-Positives bei Service/Action-Erkennung:** Kommentar `// create_service<...>(...)` oder auskommentierter Code darf nicht als Service erkannt werden → Test: Zeile mit `//`-Präfix davor wird ignoriert (Aufgabe 1).
2. **C++-Templated Services:** `create_service<my_pkg::srv::MySrv>(this, "srv_name", ...)` und Member-Aufruf `this->create_service<...>` müssen beide matchen (Aufgabe 1).
3. **Ungültige launch.xml-Struktur:** Generierte XML-Datei muss wohlgeformtes XML sein (alle Tags geschlossen, Attribute gequoted) — der Wizard validiert vor dem Speichern nicht per XSD, aber ein fehlendes `<launch>`-Root-Tag wäre ein harter Fehler (Aufgabe 3).
4. **Bag-Workspace-Scan Performance:** Ein Riesig-Workspace mit tausenden Dateien darf den Tree nicht blockieren — Scan muss depth-limited und asynchron bleiben (Aufgabe 4).
5. **Loop-Toggle-Restart löscht Bag-Pfad:** `toggleLoop` nutzt `bagSession.selectedBagPath ?? BagPlayItem.getSelectedBag()` — nach dem Fix darf der Neustart ohne Loop den Pfad nicht verlieren (Aufgabe 6).
6. **settings-Änderung ohne Neustart:** `launchGenerator.defaultLocation` muss live gelesen werden (pro Wizard-Aufruf), nicht im Konstruktor gecacht (Aufgabe 5).
7. **Wizard-Abbruch bei Node-Name-Leerstring:** `showInputBox` liefert `''` beim sofortigen Enter — Validierung muss leer abweisen, sonst entsteht ein kaputtes Package (Aufgabe 2).

---

### Task 1: Services & Actions in der statischen Code-Analyse (C++ und Python)

**Files:**
- Modify: `src/core/package-discovery.ts` (`analyzeCppNode` ca. Zeile 679, `analyzePythonNode` ca. Zeile 793, Interfaces `ServiceInfo`/`ActionInfo` Zeilen 55–63 existieren bereits)
- Test: `src/__tests__/integration/core/package-discovery.test.ts` (erweitern)
- Fixture: `test-fixtures/mixed-package-example/src/cpp_node.cpp` und `test-fixtures/mixed-package-example/mixed_package_example/python_node.py` (erweitern)

**Interfaces:**
- Consumes: `ServiceInfo { name: string; serviceType: string }`, `ActionInfo { name: string; actionType: string }` aus `package-discovery.ts:55-63` (unverändert).
- Produces: `analyzeCppNode`/`analyzePythonNode` geben `Partial<NodeInfo>` zurück, das zusätzlich `serviceServers`, `serviceClients`, `actionServers`, `actionClients` befüllt (Felder existieren bereits in `NodeInfo`, `package-discovery.ts:35-38`).

- [ ] **Step 1: Failing tests schreiben** — in `src/__tests__/integration/core/package-discovery.test.ts` im `describe('discoverPackages')`-Block:

```typescript
it('should detect services and actions in C++ and Python nodes', async () => {
  const packages = await service.discoverPackages(path.join(testFixturesPath, 'mixed-package-example'));
  const pkg = packages.find((p: PackageInfo) => p.name === 'mixed_package_example');
  expect(pkg).toBeDefined();

  const cppNode = pkg?.nodes.find((n: NodeInfo) => n.language === 'cpp');
  expect(cppNode?.serviceServers).toBeDefined();
  expect(cppNode?.serviceServers?.map(s => s.name)).toContain('/my_service');
  expect(cppNode?.serviceClients?.map(s => s.name)).toContain('/other_service');
  expect(cppNode?.actionServers?.map(a => a.name)).toContain('/my_action');

  const pyNode = pkg?.nodes.find((n: NodeInfo) => n.language === 'python');
  expect(pyNode?.serviceServers?.map(s => s.name)).toContain('/py_service');
  expect(pyNode?.actionClients?.map(a => a.name)).toContain('/py_action');
});

it('should not detect services from commented-out code', async () => {
  const packages = await service.discoverPackages(path.join(testFixturesPath, 'mixed-package-example'));
  const cppNode = packages.find((p: PackageInfo) => p.name === 'mixed_package_example')
    ?.nodes.find((n: NodeInfo) => n.language === 'cpp');
  expect(cppNode?.serviceServers?.map(s => s.name)).not.toContain('/commented_service');
});
```

- [ ] **Step 2: Fixtures erweitern** — in `test-fixtures/mixed-package-example/src/cpp_node.cpp` ergänzen (Namen mit führendem `/`, passend zu den Test-Assertions):

```cpp
  // create_service<my_ns::srv::Commented>("/commented_service", ...)
  auto srv = create_service<my_ns::srv::MyService>(
      "/my_service", std::bind(&MyNode::handle, this, std::placeholders::_1, std::placeholders::_2));
  auto cli = this->create_client<my_ns::srv::OtherService>("/other_service");
  auto act_srv = rclcpp_action::create_server<my_ns::action::MyAction>(
      this, "/my_action", std::bind(&MyNode::goal, this, std::placeholders::_1));
  auto act_cli = rclcpp_action::create_client<my_ns::action::CliAction>(this, "/cli_action");
```

In `test-fixtures/mixed-package-example/mixed_package_example/python_node.py` ergänzen:

```python
    self.srv = self.create_service(MySrv, '/py_service', self.callback)
    self.cli = self.create_client(OtherSrv, '/py_other_service')
    self.act_srv = ActionServer(self, MyAction, '/py_action', self.execute_cb)
    self.act_cli = ActionClient(self, CliAction, '/py_cli_action')
```

- [ ] **Step 3: Testlauf — muss fehlschlagen**

Run: `npm run test:integration -- --testPathPattern package-discovery`
Expected: FAIL — `serviceServers` ist `undefined`

- [ ] **Step 4: Implementieren in `package-discovery.ts`** — in `analyzeCppNode` und `analyzePythonNode` je vier Regex-basierte Scanner analog zu `create_subscription` (Zeilen 699–705 bzw. 814–821):

C++ (in `analyzeCppNode`):
```typescript
const serviceServerPattern = /(?:this->)?create_service\s*<\s*([^>]+)>\s*\(\s*(?:this\s*,\s*)?["']([^"']+)["']/gs;
const serviceClientPattern = /(?:this->)?create_client\s*<\s*([^>]+)>\s*\(\s*(?:this\s*,\s*)?["']([^"']+)["']/gs;
const actionServerPattern = /rclcpp_action::create_server\s*<\s*([^>]+)>\s*\(\s*(?:this\s*,\s*)?["']([^"']+)["']/gs;
const actionClientPattern = /rclcpp_action::create_client\s*<\s*([^>]+)>\s*\(\s*(?:this\s*,\s*)?["']([^"']+)["']/gs;
```
Python (in `analyzePythonNode`):
```typescript
const serviceServerPattern = /create_service\s*\(\s*([\w.]+)\s*,\s*["']([^"']+)["']/gs;
const serviceClientPattern = /create_client\s*\(\s*([\w.]+)\s*,\s*["']([^"']+)["']/gs;
const actionServerPattern = /ActionServer\s*\(\s*self\s*,\s*([\w.]+)\s*,\s*["']([^"']+)["']/gs;
const actionClientPattern = /ActionClient\s*\(\s*self\s*,\s*([\w.]+)\s*,\s*["']([^"']+)["']/gs;
```
Kommentar-Zeilen filtern: Match verwerfen, wenn das letzte Nicht-Leerzeichen vor `match.index` in `content` der Zeichen davor ein `//`-Präfix auf derselben Zeile hat — implementiere einen Helfer `isCommentedLine(content: string, matchIndex: number): boolean` (sucht den Zeilenanfang via `content.lastIndexOf('\n', matchIndex)` und prüft, ob der Bereich dazwischen trim-leer ist oder mit `//` beginnt). Name = `match[2]`, Typ = `match[1].trim()`. Rückgabe-Objekt um die vier Felder ergänzen (leere Arrays → `undefined`, wie bei Publishern: `serviceServers: serviceServers.length > 0 ? serviceServers : undefined`).

- [ ] **Step 5: Testlauf — muss durchlaufen**

Run: `npm run test:integration -- --testPathPattern package-discovery`
Expected: PASS

- [ ] **Step 6: Lint + Typecheck**

Run: `npm run lint && npm run typecheck`
Expected: keine Fehler

- [ ] **Step 7: Commit**

```bash
git add src/core/package-discovery.ts test-fixtures/mixed-package-example src/__tests__/integration/core/package-discovery.test.ts
git commit -m "feat: detect services and actions in static node analysis"
```

---

### Task 2: Service/Action-Tree-Items im Workspace-Explorer

**Files:**
- Modify: `src/treeview/workspace-items.ts` (`NodeItem`, Zeilen 218–295)
- Test: `src/__tests__/integration/tree-provider.integration.test.ts` (erweitern)

**Interfaces:**
- Consumes: `ServiceInfo`, `ActionInfo` aus `package-discovery.ts:55-63`; `NodeMetadataFolderItem` (workspace-items.ts:297), Muster `PublisherItem`/`SubscriberItem` (workspace-items.ts:314–349).
- Produces: `ServiceItem implements TreeItemBase` mit `constructor(service: ServiceInfo, kind: 'server' | 'client')` und `getServiceInfo(): ServiceInfo`; `ActionItem implements TreeItemBase` mit `constructor(action: ActionInfo, kind: 'server' | 'client')` und `getActionInfo(): ActionInfo`; Kontext-Werte `serviceItem`/`actionItem`.

- [ ] **Step 1: Failing test** — in `tree-provider.integration.test.ts`:

```typescript
it('shows services and actions as node children', async () => {
  const pkg = makePackageWithServices(); // Helper: PackageInfo mit NodeInfo.serviceServers = [{name: '/my_service', serviceType: 'my_ns/srv/MyService'}], actionServers = [{name: '/my_action', actionType: 'my_ns/action/MyAction'}]
  const nodeItem = new NodeItem(pkg.nodes[0]);
  const children = await nodeItem.getChildren();
  const folderLabels = children.map(c => c.label);
  expect(folderLabels).toContain('Service Servers');
  expect(folderLabels).toContain('Action Servers');
  const srvFolder = children.find(c => c.label === 'Service Servers');
  const srvChildren = await srvFolder!.getChildren();
  expect(srvChildren.length).toBe(1);
  expect(srvChildren[0].description).toContain('my_ns/srv/MyService');
});
```

- [ ] **Step 2: Run — fail**

Run: `npm run test:integration -- --testPathPattern tree-provider`
Expected: FAIL — `'Service Servers'` fehlt in Labels

- [ ] **Step 3: Implementieren** — in `workspace-items.ts`: neue Klassen `ServiceItem` (contextValue `serviceItem`, Icon `circle-filled` mit `ThemeColor('charts.orange')` für server, `circle-outline` für client, Tooltip `**Service {server|client}**\n\nName: {name}\nType: {serviceType}`) und `ActionItem` (analog, contextValue `actionItem`, Icon `play-circle`/`debug-rerun`) nach dem Muster von `PublisherItem`. In `NodeItem.getChildren()` (Zeilen 275–294) nach Subscriptions und vor Parameters einfügen: Service Servers, Service Clients, Action Servers, Action Clients — je `NodeMetadataFolderItem('Service Servers', items, 'arrow-small-right')` wenn Array existiert und nicht leer. Im Tooltip `updateTooltip()` (Zeilen 234–273) Zählerzeilen `🛎 Services: ${n}` / `⚡ Actions: ${n}` ergänzen.

- [ ] **Step 4: Run — pass**

Run: `npm run test:integration -- --testPathPattern tree-provider`
Expected: PASS

- [ ] **Step 5: Lint + typecheck + beide Suiten**

Run: `npm run lint && npm run typecheck && npm run test:unit && npm run test:integration`
Expected: alles grün

- [ ] **Step 6: Commit**

```bash
git add src/treeview/workspace-items.ts src/__tests__/integration/tree-provider.integration.test.ts
git commit -m "feat: show services and actions in node tree view"
```

---

### Task 3: `.launch.xml`-Generierung im Launch-Wizard

**Files:**
- Modify: `src/wizard/launch-generator.ts` (neue Methode nach `generate`), `src/wizard/launch-wizard.ts` (`getFileName`/`generateAndSave`/`determineSaveLocation`)
- Test: `src/__tests__/unit/launch-generator.test.ts` (erweitern)

**Interfaces:**
- Consumes: `LaunchFileConfig`, `LaunchNodeConfig` aus `launch-generator.ts:9-31` (unverändert); `ParameterCoercer.formatPython` wird NICHT verwendet — XML braucht eigene Formatierung.
- Produces: `generateXml(config: LaunchFileConfig): string` in `LaunchGenerator`. Der Wizard fragt vor `getFileName()` das Zielformat ab: `LaunchFormat = '.launch.py' | '.launch.xml'`.

- [ ] **Step 1: Failing tests** — in `src/__tests__/unit/launch-generator.test.ts`:

```typescript
describe('generateXml', () => {
  const config: LaunchFileConfig = {
    fileName: 'demo',
    nodes: [{
      packageName: 'my_pkg', executableName: 'my_node', nodeName: 'my_node',
      parameters: [{ name: 'freq', value: 10.5 }, { name: 'use_sim_time', value: true }],
    }],
    launchArguments: [{ name: 'use_sim_time', defaultValue: 'false' }],
  };

  it('generates well-formed XML with launch root tag', () => {
    const xml = new LaunchGenerator().generateXml(config);
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(xml).toContain('<launch');
    expect(xml).toContain('</launch>');
    expect(xml).toMatch(/<node\s+pkg="my_pkg"\s+exec="my_node"\s+name="my_node"/);
    expect(xml).toContain('<param name="freq" value="10.5"/>');
    expect(xml).toContain('<param name="use_sim_time" value="true"/>');
    expect(xml).toContain('<arg name="use_sim_time" default_value="false"/>');
  });

  it('escapes XML special characters in values', () => {
    const xml = new LaunchGenerator().generateXml({
      fileName: 'x', nodes: [{ packageName: 'p', executableName: 'e',
        parameters: [{ name: 'text', value: 'a<b & c' }] },
      ],
    });
    expect(xml).toContain('value="a&lt;b &amp; c"');
  });

  it('XML-escapes then string-quotes string values', () => {
    const xml = new LaunchGenerator().generateXml({
      fileName: 'x', nodes: [{ packageName: 'p', executableName: 'e',
        parameters: [{ name: 'label', value: 'hello' }] }],
    });
    expect(xml).toContain('<param name="label" value="hello"/>');
  });
});
```

(Hinweis: der dritte Test stellt sicher, dass String-Parameter als `value="hello"` ohne Python-Quotes ausgegeben werden.)

- [ ] **Step 2: Run — fail**

Run: `npm run test:unit -- launch-generator`
Expected: FAIL — `generateXml is not a function`

- [ ] **Step 3: Implementieren** — in `LaunchGenerator`:

```typescript
generateXml(config: LaunchFileConfig): string
```
Aufbau: `<?xml version="1.0" encoding="UTF-8"?>` + `<launch>` … `</launch>`; je `launchArguments`-Eintrag `<arg name="…" default_value="…"/>` (+ `description="…"` falls vorhanden); je Node `<node pkg="…" exec="…" name="…" namespace="…">` mit `parameters=[…]`-Einträgen als `<param name="…" value="…"/>`-Kinder und `remappings` als `<remap from="…" to="…"/>`-Kinder, `output="…"` und `use_sim_time` als Attribut. Helfer: `private escapeXml(s: string): string` (ersetzt `&` → `&amp;` zuerst, dann `<`, `>`, `"`, `'`); `private formatXmlValue(value: ParameterValue): string` — booleans → `true`/`false`, Zahlen → `String(n)`, Strings unverändert (nur escapen), Arrays → JSON.stringify dann escapen. Closing `/>`-Attribute: `output` nur wenn gesetzt, analog zum Python-Generator.

- [ ] **Step 4: Run — pass**

Run: `npm run test:unit -- launch-generator`
Expected: PASS

- [ ] **Step 5: Wizard-Anbindung** — in `launch-wizard.ts`:
  - In `run()` (Zeile 60) nach Target-Package-Auswahl: Format-QuickPick `['Python (.launch.py)', 'XML (.launch.xml)']` → `private format: 'py' | 'xml' = 'py'` (Default `py`).
  - `determineSaveLocation(fileName: string)` (Zeile 410): Rückgabe `path.join(launchDir, `${fileName}${this.format === 'xml' ? '.launch.xml' : '.launch.py'}`)` (beide Vorkommen, Zeilen 434 und 450).
  - `generateAndSave` (Zeile 497): `const content = this.format === 'xml' ? generator.generateXml(config) : generator.generate(config);` — Erfolgsmeldung (Zeile 542) und Run-Befehl (Zeilen 564–566) nutzen `${fileName}${this.format === 'xml' ? '.launch.xml' : '.launch.py'}`.

- [ ] **Step 6: Run integration + lint + typecheck**

Run: `npm run test:unit && npm run test:integration && npm run lint && npm run typecheck`
Expected: alles grün

- [ ] **Step 7: Commit**

```bash
git add src/wizard/launch-generator.ts src/wizard/launch-wizard.ts src/__tests__/unit/launch-generator.test.ts
git commit -m "feat: generate .launch.xml files in launch wizard"
```

---

### Task 4: Bag-Dateien aus dem Workspace auswählbar machen

**Files:**
- Modify: `src/extension.ts` (`ramros.bag.selectFile`, Zeilen 778–810)
- Test: `src/__tests__/integration/tools-tree-provider.integration.test.ts` (erweitern)
- Modify: `package.json` (keine neuen Commands; Context-Menu-Einträge korrigieren — siehe Schritt 3)

**Interfaces:**
- Consumes: `vscode.window.showOpenDialog`, `bagSession.setSelectedBagPath`, `toolsTreeProvider.setBagInfo`, `execAsync`.
- Produces: `export async function findWorkspaceBags(): Promise<string[]>` in `extension.ts` — scannt die Workspace-Roots aller Workspaces (aus `treeProvider.getWorkspaces()`) nach `*.db3` und `*.mcap` mit `vscode.workspace.findFiles` (`exclude: '**/{node_modules,build,install,log}/**'`).

- [ ] **Step 1: Failing test** — in `tools-tree-provider.integration.test.ts`:

```typescript
it('finds bag files in workspace folders', async () => {
  const { findWorkspaceBags } = await import('../../extension');
  // vscode.workspace.findFiles mock liefert [Uri.file('/ws/my.db3')]
  const bags = await findWorkspaceBags();
  expect(bags).toContain('/ws/my.db3');
});
```
Der vscode-Mock muss dafür `workspace.findFiles` exponieren: in `src/__tests__/integration/__mocks__/vscode.js` ergänzen: `findFiles: jest.fn().mockResolvedValue([])` unter `workspace` (der Test mockt den Rückgabewert: `[Uri.file('/ws/my.db3')]` — der Mock braucht dazu `Uri.file`; falls nicht vorhanden, einfach `{ fsPath: '/ws/my.db3' }` als Objekt zurückgeben).

- [ ] **Step 2: Implementieren** — in `extension.ts`:

```typescript
export async function findWorkspaceBags(): Promise<string[]> {
  const workspaces = treeProvider.getWorkspaces();
  const uris = await vscode.workspace.findFiles('**/*.{db3,mcap}', '**/{node_modules,build,install,log}/**');
  return uris.map(u => u.fsPath).filter(p => workspaces.some(w => p.startsWith(w.rootPath.fsPath)));
}
```
In `ramros.bag.selectFile`: vor `showOpenDialog` QuickPick mit zwei Optionen `{ label: '$(file-directory) Browse files…', action: 'browse' }`, `{ label: '$(archive) Choose from workspace', action: 'workspace' }`. Bei `workspace`: Bags via `findWorkspaceBags()` sammeln, leer → Warning 'No bag files found in workspace' + Rückkehr zum Dialog; sonst QuickPick (Label = basename, Beschreibung = Pfad). Auswahl fortführen wie bisher (Bag-Info via `ros2 bag info`, `setSelectedBagPath`).

- [ ] **Step 3: package.json-Menü-Fix** — Context-Menu-Einträge `ramros.bag.startRecording` und `ramros.bag.selectFile` von `viewItem == tool` (Zeilen 360–366) auf `viewItem == bagFilesFolder` umziehen. `bagFilesFolder`-contextValue existiert (bag-items.ts:30).

- [ ] **Step 4: Run tests + lint**

Run: `npm run test:integration && npm run lint && npm run typecheck`
Expected: alles grün

- [ ] **Step 5: Commit**

```bash
git add src/extension.ts package.json src/__tests__/integration/tools-tree-provider.integration.test.ts src/__tests__/integration/__mocks__/vscode.js
git commit -m "feat: select bag files from workspace and fix bag context menus"
```

---

### Task 5: `launchGenerator.*`-Einstellungen verdrahten

**Files:**
- Modify: `src/wizard/launch-wizard.ts` (`determineSaveLocation`, Zeilen 410–451)
- Test: `src/__tests__/integration/wizard/launch-wizard-settings.test.ts` (neu)

**Interfaces:**
- Consumes: Settings `ramros.launchGenerator.defaultLocation` (enum `package_launch_folder | workspace_root | custom`, default `package_launch_folder`) und `ramros.launchGenerator.customPath` (default `''`) aus `package.json:427-441`.
- Produces: `private resolveDefaultSaveDir(): string | null` in `LaunchWizard` — liest Settings live pro Aufruf (nicht im Konstruktor). Bei `custom`: `customPath` mit `{workspace}` → `this.workspacePath`, `{package}` → `this.targetPackage?.name ?? '{package}'` ersetzen.

- [ ] **Step 1: Failing tests** — neue Datei `src/__tests__/integration/wizard/launch-wizard-settings.test.ts` mit vscode-Mock (Muster aus `package-wizard.test.ts`); `resolveDefaultSaveDir` wird public, damit es direkt testbar ist. `discovery` ist ein `PackageDiscoveryService`-Stub (`{ discoverPackages: async () => [] } as any`):

```typescript
it('returns null for package_launch_folder when no target package is set', () => {
  const wizard = new LaunchWizard('/tmp/ws', discovery);
  expect(wizard.resolveDefaultSaveDir()).toBeNull();
});

it('resolves workspace_root to the workspace root', () => {
  (vscode.workspace.getConfiguration as jest.Mock).mockReturnValue({
    get: (key: string, def: any) => key === 'defaultLocation' ? 'workspace_root' : def,
  });
  const wizard = new LaunchWizard('/tmp/ws', discovery);
  expect(wizard.resolveDefaultSaveDir()).toBe('/tmp/ws');
});

it('substitutes {workspace} and {package} in custom paths', () => {
  (vscode.workspace.getConfiguration as jest.Mock).mockReturnValue({
    get: (key: string, def: any) => key === 'defaultLocation' ? 'custom' : (key === 'customPath' ? '{workspace}/launches/{package}' : def),
  });
  const wizard = new LaunchWizard('/tmp/ws', discovery);
  expect(wizard.resolveDefaultSaveDir()).toBe('/tmp/ws/launches/{package}'); // targetPackage nicht gesetzt → {package} bleibt literal
});
```

- [ ] **Step 2: Run — fail**

Run: `npm run test:integration -- --testPathPattern launch-wizard-settings`
Expected: FAIL — Methode existiert nicht

- [ ] **Step 3: Implementieren** — in `launch-wizard.ts`:
  - Neue public Methode `resolveDefaultSaveDir(): string | null`: `vscode.workspace.getConfiguration('ramros.launchGenerator')` → `defaultLocation`. `package_launch_folder` → `null` wenn kein `targetPackage`, sonst `path.join(this.targetPackage.path, 'launch')`. `workspace_root` → `this.workspacePath`. `custom` → `customPath`-Ersetzung: `{workspace}` → `this.workspacePath`; `{package}` → `this.targetPackage?.name ?? '{package}'`; fehlende/leere customPath → Fallback `null` (Wizard fragt interaktiv).
  - `determineSaveLocation(fileName)` umbauen: zuerst `resolveDefaultSaveDir()`; wenn nicht-null: `.launch`-Ordner ggf. anlegen (bestehende Logik Zeilen 416–420), `.gitignore` anlegen (421–432), Pfad zurückgeben. Wenn `null`: bestehender interaktiver Fallback (folder-open dialog, Zeilen 437–450) — inkl. neuem Format-Suffix aus Task 3.

- [ ] **Step 4: Run — pass; danach alle Tests + lint + typecheck**

Run: `npm run test:integration -- --testPathPattern launch-wizard-settings && npm run test:unit && npm run test:integration && npm run lint && npm run typecheck`
Expected: alles grün

- [ ] **Step 5: Commit**

```bash
git add src/wizard/launch-wizard.ts src/__tests__/integration/wizard/launch-wizard-settings.test.ts
git commit -m "feat: honor launchGenerator defaultLocation and customPath settings"
```

---

### Task 6: Bag-Bugs — Loop-Neustart, Terminal-Close-Sync, resourceUri, dispose-Race

**Files:**
- Modify: `src/extension.ts` (`ramros.bag.toggleLoop` Zeilen 844–876, `stop` 878–894, `stopRecording` 726–747, `activate` onDidCloseTerminal-Registrierung)
- Modify: `src/treeview/bag-items.ts` (`BagInfoLineItem`, Zeile 410–418)
- Test: `src/__tests__/unit/bag-session-service.test.ts` (erweitern)

**Interfaces:**
- Consumes: `BagSessionService` (bag-session-service.ts) mit vorhandenen Setzern; `terminalManager.waitForRestart()`.
- Produces: `BagSessionService.handleTerminalClosed(terminal: vscode.Terminal): boolean` — wenn `terminal === this._recordingTerminal`: Recording-State resetten, `true` zurückgeben; analog Playback; sonst `false`. Neu: `stopRecordingAsync(): Promise<void>` und `stopPlaybackAsync(): Promise<void>` in `BagSessionService` — senden `\x03`, warten `delay(RESTART_SETTLE_MS)` (Konstante `SIGINT_SETTLE_MS = 200` in bag-session-service.ts), dann `dispose()` + State-Reset.

- [ ] **Step 1: Failing tests** — in `src/__tests__/unit/bag-session-service.test.ts`:

```typescript
it('handleTerminalClosed resets recording state when the recording terminal closes', () => {
  const mockTerminal = { dispose: jest.fn(), sendText: jest.fn() } as any;
  service.setRecordingTerminal(mockTerminal);
  const handled = service.handleTerminalClosed(mockTerminal);
  expect(handled).toBe(true);
  expect(service.isRecording).toBe(false);
});

it('handleTerminalClosed ignores unrelated terminals', () => {
  const other = { dispose: jest.fn() } as any;
  expect(service.handleTerminalClosed(other)).toBe(false);
  expect(service.isRecording).toBe(false);
});
```

- [ ] **Step 2: Run — fail**

Run: `npm run test:unit -- bag-session-service`
Expected: FAIL — Methode nicht definiert

- [ ] **Step 3: Implementieren**:
  - `handleTerminalClosed` + `SIGINT_SETTLE_MS`-basierte `stopRecordingAsync`/`stopPlaybackAsync` in `bag-session-service.ts` (Terminal-Dispose erst nach kurzer Wartezeit, damit SIGINT verarbeitet wird).
  - `extension.ts`: `context.subscriptions.push(vscode.window.onDidCloseTerminal(terminal => { if (bagSession.handleTerminalClosed(terminal)) { void toolsTreeProvider.refresh(); } }))` in `activate` registrieren. `ramros.bag.stopRecording`/`ramros.bag.stop`/`toggleLoop`-Stop-Zweig nutzen die neuen Async-Methoden statt sofortigem dispose.
  - `toggleLoop`-Fix (Zeilen 852–872): Neustart immer, wenn ein Bag-Pfad existiert — unabhängig von `isLooping`: `if (bagPath) { … playCommand mit loopArg = isLooping ? '--loop' : '' … }` (Neustart ohne Loop, statt Playback einfach zu beenden).
  - `BagInfoLineItem`-Fix (bag-items.ts:416): `this.resourceUri = vscode.Uri.file(text.replace(/^📦\s*/, ''))` — oder besser: Konstruktor der Header-Zeile den bereinigten Pfad übergeben und Emoji nur im Label führen; minimale Variante: Regex-Strip.
  - vscode-Mock erweitern: `window.onDidCloseTerminal: jest.fn().mockReturnValue({ dispose: jest.fn() })` in `src/__tests__/integration/__mocks__/vscode.js` (falls noch fehlt).

- [ ] **Step 4: Run — pass; alle Suiten**

Run: `npm run test:unit && npm run test:integration && npm run lint && npm run typecheck`
Expected: alles grün

- [ ] **Step 5: Commit**

```bash
git add src/executor/bag-session-service.ts src/extension.ts src/treeview/bag-items.ts src/__tests__/unit/bag-session-service.test.ts
git commit -m "fix: bag loop restart, terminal close sync, resourceUri and dispose race"
```

---

### Task 7: Duplikat-Validierung im Package-Wizard verdrahten

**Files:**
- Modify: `src/wizard/package-wizard.ts` (Zeilen 60–78), `src/extension.ts` (createPackage-Wizard-Aufruf, Zeilen 290–294)
- Test: `src/__tests__/integration/wizard/package-wizard.test.ts` (erweitern)

**Interfaces:**
- Consumes: `DuplicatePackageDetector.validateNewPackageName(name, workspaceId, allWorkspaces)` (duplicate-package-detector.ts:156–185); `CreatePackageWizardContext` (package-wizard.ts:10–14).
- Produces: `CreatePackageWizardContext` bekommt neues optionales Feld `validatePackageName?: (name: string) => Promise<{ isValid: boolean; error?: string; warning?: string }>`. `runCreatePackageWizard` nutzt es in `validateInput` (ersetzt `getWorkspaces().flatMap(w => w.name)`).

- [ ] **Step 1: Failing tests** — in `package-wizard.test.ts` (neues describe):

```typescript
describe('package name uniqueness validation', () => {
  it('uses the provided validator and blocks duplicate names', async () => {
    showInputBox.mockResolvedValueOnce(undefined); // Name-Abbruch nach Validierungs-Fehler
    const validatePackageName = jest.fn().mockResolvedValue({ isValid: false, error: 'Package "dup" already exists' });
    await runCreatePackageWizard({ packageCreator, getWorkspaces: () => [makeWorkspace()], refresh, validatePackageName });
    expect(showInputBox).toHaveBeenCalledWith(expect.objectContaining({
      validateInput: expect.any(Function),
    }));
  });

  it('blocks the wizard when the name is a duplicate in the same workspace', async () => {
    const validatePackageName = jest.fn().mockResolvedValue({ isValid: false, error: 'Package "dup" already exists in this workspace' });
    let captured: ((v: string) => Thenable<string | null | undefined>) | undefined;
    showInputBox.mockImplementationOnce((opts) => { captured = opts.validateInput; return Promise.resolve(undefined); });
    await runCreatePackageWizard({ packageCreator, getWorkspaces: () => [makeWorkspace()], refresh, validatePackageName });
    const result = await captured!('dup');
    expect(result).toBe('Package "dup" already exists in this workspace');
  });

  it('still applies naming rules and only warns on cross-workspace duplicates', async () => {
    const validatePackageName = jest.fn().mockResolvedValue({ isValid: true, warning: 'exists in another workspace' });
    let captured: ((v: string) => Thenable<string | null | undefined>) | undefined;
    showInputBox.mockImplementationOnce((opts) => { captured = opts.validateInput; return Promise.resolve(undefined); });
    await runCreatePackageWizard({ packageCreator, getWorkspaces: () => [makeWorkspace()], refresh, validatePackageName });
    expect(await captured!('UPPER')).toMatch(/lowercase/); // naming rule bleibt aktiv
    expect(await captured!('cross_ws_dup')).toBeNull(); // cross-workspace: nur Warnung → null (Input erlaubt)
  });
});
```

- [ ] **Step 2: Run — fail**

Run: `npm run test:integration -- --testPathPattern package-wizard`
Expected: FAIL — validateInput prüft noch Workspace-Namen

- [ ] **Step 3: Wizard implementieren** — in `package-wizard.ts` `runCreatePackageWizard` (Zeilen 70–78):

```typescript
const packageName = await vscode.window.showInputBox({
  prompt: 'Enter package name',
  placeHolder: 'my_package',
  validateInput: async (value) => {
    const namingResult = validator.validatePackageName(value || '', []);
    if (!namingResult.isValid) return namingResult.errors.join(', ');
    if (context.validatePackageName) {
      const dup = await context.validatePackageName(value);
      if (!dup.isValid) return dup.error ?? 'Package name is invalid';
      if (dup.warning) void vscode.window.showWarningMessage(dup.warning);
    }
    return null;
  }
});
```

- [ ] **Step 4: Verdrahten in `extension.ts`** — createPackage-Handler (Zeilen 290–294) ergänzt den Validator:

```typescript
await runCreatePackageWizard({
  packageCreator,
  getWorkspaces: () => treeProvider.getWorkspaces(),
  refresh: () => treeProvider.refresh(),
  validatePackageName: (name) => duplicateDetector.validateNewPackageName(
    name,
    treeProvider.getWorkspaces()[0].id,
    treeProvider.getWorkspaces()
  ),
});
```

- [ ] **Step 5: Run — pass; alle Suiten**

Run: `npm run test:integration -- --testPathPattern package-wizard && npm run test:unit && npm run test:integration && npm run lint && npm run typecheck`
Expected: alles grün

- [ ] **Step 6: Commit**

```bash
git add src/wizard/package-wizard.ts src/extension.ts src/__tests__/integration/wizard/package-wizard.test.ts
git commit -m "fix: validate package-name uniqueness against real packages in wizard"
```

---

### Task 8: createLaunchFile kontextsensitiv

**Files:**
- Modify: `src/extension.ts` (createLaunchFile-Handler, Zeilen 481–493)
- Test: `src/__tests__/integration/tree-provider.integration.test.ts` (erweitern)

**Interfaces:**
- Consumes: `TreeItemBase` mit `getPackageInfo()` oder `getWorkspace()` — `PackageItem.getPackageInfo()` (workspace-items.ts:153), `WorkspaceRootItem.getWorkspace()` (workspace-items.ts:21).
- Produces: Handler `ramros.createLaunchFile` akzeptiert `TreeItemBase`-Argument; Workspace-Auflösung: Package-Item → `findWorkspaceForPath(workspaces, pkg.path)`; WorkspaceRoot-Item → direkt; sonst `pickWorkspace()`.

- [ ] **Step 1: Failing test** — in `tree-provider.integration.test.ts`:

```typescript
it('resolves the workspace from a package tree item', async () => {
  const pkg = makePackage(); // Helper in dieser Datei anlegen (Muster package-wizard.test.ts makePackage)
  const fakeItem = { getPackageInfo: () => pkg, getChildren: async () => [] };
  const wsA = makeWorkspace('/tmp/ws-a'); // Helper analog makeWorkspace in package-wizard.test.ts
  const wsB = makeWorkspace('/tmp/ws-b');
  const workspaces = [wsA, wsB]; // wsA enthält pkg (pkg.path unter /tmp/ws-a)
  const { resolveWorkspaceForLaunch } = await import('../../extension');
  const ws = resolveWorkspaceForLaunch(fakeItem as any, workspaces);
  expect(ws?.id).toBe(wsA.id);
});
```

- [ ] **Step 2: Run — fail**

Run: `npm run test:integration -- --testPathPattern tree-provider`
Expected: FAIL — Export fehlt

- [ ] **Step 3: Implementieren** — in `extension.ts` eine exportierte Helferfunktion:

```typescript
export function resolveWorkspaceForLaunch(
  arg: TreeItemBase | undefined,
  workspaces: WorkspaceInfo[]
): WorkspaceInfo | undefined {
  if (arg && 'getPackageInfo' in arg && typeof (arg as any).getPackageInfo === 'function') {
    const pkg = (arg as any).getPackageInfo() as PackageInfo;
    return findWorkspaceForPath(workspaces, pkg.path) ?? undefined;
  }
  if (arg && 'getWorkspace' in arg && typeof (arg as any).getWorkspace === 'function') {
    const ws = (arg as any).getWorkspace() as WorkspaceInfo;
    return workspaces.find(w => w.id === ws.id) ?? undefined;
  }
  return undefined;
}
```
`ramros.createLaunchFile`-Handler: `const selectedWorkspace = resolveWorkspaceForLaunch(arg, workspaces) ?? await pickWorkspace();` — danach wie bisher Wizard starten. `pickWorkspace()`-Fallback bleibt für Command-Palette-Aufrufe.

- [ ] **Step 4: Run — pass; alle Suiten**

Run: `npm run test:integration -- --testPathPattern tree-provider && npm run test:unit && npm run lint && npm run typecheck`
Expected: alles grün

- [ ] **Step 5: Commit**

```bash
git add src/extension.ts src/__tests__/integration/tree-provider.integration.test.ts
git commit -m "fix: create launch file uses the clicked workspace/package context"
```

---

### Task 9: Cache-Manager-Konfiguration live neu laden

**Files:**
- Modify: `src/cache/cache-manager.ts` (Konstruktor Zeilen 40–54)
- Test: `src/__tests__/integration/cache-manager.integration.test.ts` (erweitern)

**Interfaces:**
- Consumes: Settings `ramros.cache.ttlSeconds`, `ramros.cache.maxEntries`; `vscode.workspace.onDidChangeConfiguration`.
- Produces: CacheManager liest TTL/maxEntries im Konstruktor und registriert `onDidChangeConfiguration`-Listener (Disposable registriert in `dispose`), der bei `affectsConfiguration('ramros.cache')` TTL/maxEntries neu liest. Neue getter `getTtlMs(): number`, `getMaxEntries(): number` (für Tests).

- [ ] **Step 1: Failing tests** — in `cache-manager.integration.test.ts`:

```typescript
it('reloads ttl and maxEntries when the configuration changes', () => {
  const manager = new CacheManager();
  expect(manager.getTtlMs()).toBe(300_000); // default 300s
  (vscode.workspace.onDidChangeConfiguration as jest.Mock).mock.calls.forEach(call => call[0]({ affectsConfiguration: (key: string) => key === 'ramros.cache' }));
  // Konfiguration mocken: ttlSeconds=60, maxEntries=5
  // → expect(manager.getTtlMs()).toBe(60_000); expect(manager.getMaxEntries()).toBe(5);
});
```

- [ ] **Step 2: Run — fail**

Run: npm run test:integration -- --testPathPattern cache-manager
Expected: FAIL — getter fehlen

- [ ] **Step 3: Implementieren** — CacheManager: private Felder `ttlMs`, `maxEntries` (aus Config gelesen), Konfigurations-Listener analog `LiveTreeProvider` (live-tree-provider.ts:24-35), der die Werte neu einliest; `dispose()` disposed den Listener. Bestehende `DEFAULT_TTL`/`MAX_CACHE_SIZE` als Fallbacks behalten.

- [ ] **Step 4: Run — pass; alle Suiten**

Run: `npm run test:unit && npm run test:integration && npm run lint && npm run typecheck`
Expected: alles grün

- [ ] **Step 5: Commit**

```bash
git add src/cache/cache-manager.ts src/__tests__/integration/cache-manager.integration.test.ts
git commit -m "feat: live-reload cache TTL and maxEntries configuration"
```

---

### Task 10: README + CHANGELOG aktualisieren

**Files:**
- Modify: `README.md`, `CHANGELOG.md`

**Interfaces:**
- Consumes: Alle bisherigen Tasks 1–9.

- [ ] **Step 1: README korrigieren** — Commands-Tabelle: `RAMROS: Refresh Installed ROS2 Packages` ergänzen; Konfigurations-Sektion: `ramros.installedPackages.maxAgeHours` ergänzen; Wizard-Schritt 4 (Build type) als „automatisch aus Package-Typ abgeleitet" beschreiben (kein separater Schritt), `empty`-Template-Hinweis (nur programmatisch erreichbar), Step „Include template node?" dokumentieren; neue Features: Services/Actions-Statikanalyse (unter Static Code Analysis — Text anpassen, jetzt implementiert), `.launch.xml`-Generierung (Launch File Wizard), Bag-Auswahl aus Workspace, launchGenerator-Settings (jetzt funktional).

- [ ] **Step 2: CHANGELOG-Eintrag** — unter `## [Unreleased]` (neu anlegen, falls fehlt):
```markdown
## [Unreleased]
### Added
- Static analysis of service servers/clients and action servers/clients (C++ and Python)
- Tree view items for services and actions
- Launch-file wizard: XML format (`.launch.xml`) generation
- Bag file selection from workspace
- launchGenerator settings (defaultLocation, customPath) are now honored
- Cache settings reload live without restart
### Fixed
- Bag recording/playback context menus now on Bag Files folder
- Toggling loop off during playback restarts playback without loop
- Bag state resets when the user closes the terminal manually
- Package wizard validates uniqueness against real packages (was: workspace names)
- createLaunchFile uses the clicked workspace/package context
- resourceUri in bag info header
```

- [ ] **Step 2b: Sanity-Check** — `npm run lint && npm run typecheck` weiterhin grün (README/CHANGELOG ändern keinen Code, nur Form-Check).

- [ ] **Step 3: Commit**

```bash
git add README.md CHANGELOG.md
git commit -m "docs: update README and CHANGELOG for verification findings"
```

---

## Task-Abhängigkeiten

- Task 2 (Tree-Items) hängt von Task 1 (NodeInfo-Felder befüllt) ab.
- Task 3 und Task 5 ändern beide `launch-wizard.ts` — Task 5 greift auf das Format-Suffix aus Task 3 zurück (determineSaveLocation). Task 3 vor Task 5 ausführen.
- Task 4, 6, 7, 8, 9 sind unabhängig voneinander.
- Task 10 (Docs) zuletzt.

Empfohlene Reihenfolge: 1 → 2 → 3 → 5 → 4 → 6 → 7 → 8 → 9 → 10.

## Bewusst ausgeklammert (Out of Scope)

Folgende Verifikationsfunde wurden nicht in Tasks umgesetzt (kosmetisch oder riskant ohne weiteren Beschluss):

- **Toter Code entfernen** (`BagPauseResumePlaybackItem`, `TopicFrequencyItem`, `ToolsTreeProvider.getBagRecordItem` + `bagRecordItem`-Cache, `src/wizard/templates/`, 4 ungenutzte Resource-Templates, `BagPlayControlItem.getIsPaused`): Entfernung berührt viele Tests; separater Cleanup-Aufwand, kein Nutzen für die README-Konformität. Empfehlung: separates Refactoring-Ticket.
- **Command-Palette-Präfix `RAMROS:`**: 25 von 26 Commands hätten `"category": "RAMROS"` bekommen müssen, um der README-Tabelle zu entsprechen. Statt Code anzupassen, dokumentiert Task 10 die Ist-Situation — Präfix-Änderung wäre eine User-sichtbare UX-Änderung, die der Owner entscheiden sollte.
- **`empty`-Template im Wizard interaktiv wählbar machen**: README beschreibt das Template als verfügbar; es ist programmatisch erreichbar. Wizard-Erweiterung wäre ein eigenes Feature.
- **`nodeNamespace`-Parsing in `parseTopicEndpoints`**: `ros2 topic info -v` liefert `Node namespace:`; aktuell hardcodiert `''`. Kleiner Anzeige-Bug, kein README-Bruch — niedrige Priorität.
- **`onDidCloseTerminal`-Handling** ist in Task 6 enthalten (nicht ausgeklammert) — aber `onDidExecuteTerminalCommand`/Exit-Status-Polling für natürliches Playback-Ende bewusst weggelassen.
