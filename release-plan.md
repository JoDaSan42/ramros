# Feature Release Plan - RAMROS VSCode Extension

## Übersicht

| Release | Fokus | Geschätzter Umfang |
|---------|-------|-------------------|
| 1.0     | Foundation & Discovery  | MVP - Workspace-Erkennung |
| 2.0     | Core Navigation         | Paket-Struktur & Visualisierung |
| 3.0     | Node Execution          | Nodes starten & bauen |
| 4.0     | Code Creation           | Neue Pakete/Nodes erstellen |
| 5.0     | Advanced Features       | Launch, Messages, Services, Actions |

---

## Release 1.0: Foundation & Discovery (MVP)

### Ziel
Grundlegende ROS2-Workspace-Erkennung und Validierung

### Features
- [ ] **FR-1:** Erkennung des/der geöffneten VSCode-Ordner als ROS2 Workspace
  - **Multi-Workspace Support:** Beliebige Anzahl Workspaces gleichzeitig
  - **Duplicate Detection:** Gleiche Paketnamen im selben Workspace blockieren
  - **Cross-Workspace Warning:** Gleiche Paketnamen über Workspaces hinweg markieren
- [ ] **FR-2:** Überprüfung der ROS2-Installation (Humble, Jazzy, etc.)
  - Pro Workspace kann unterschiedliche ROS-Version verwendet werden
- [ ] **FR-6:** Source-Funktionalität für den Workspace (`source install/setup.bash`)
  - Hinweis anzeigen, wenn Build noch nicht erfolgt
  - Pro Workspace separates Sourcing
  - Warnung bei konfligierenden Paketnamen

### Non-Functional
- [ ] **NF-4:** Multi-Workspace Management
  - Jeder Workspace wird separat behandelt
  - UI zeigt alle Workspaces in der Baumstruktur
  - Konflikte visuell markieren (Warning-Icon)
- [ ] **NF-5:** Caching-Strategie
  - FileSystemWatcher für Change Detection
  - In-Memory Cache mit TTL (5 Minuten)
  - Manuelles Refresh per Command

### Akzeptanzkriterien
- Extension erkennt ROS2-Installation pro Workspace
- Beliebige Anzahl Workspaces parallel ladbar
- Duplicate Package Names im selben Workspace werden verhindert
- Cross-Workspace Duplikate werden markiert
- Workspace wird validiert
- User kann Workspace sourcen oder erhält Build-Hinweis

---

## Release 2.0: Core Navigation

### Ziel
Vollständige Visualisierung der Workspace-Struktur

### Features
- [ ] **FR-3:** Scan des `src`-Ordners nach ROS2-Paketen (pro Workspace)
- [ ] **FR-4:** Erkennung von Python- und C++-Paketen
- [ ] **FR-5:** Auflistung von Nodes, Messages, Launch Files pro Paket
- [ ] **FR-9:** Baumstruktur-Darstellung im Explorer
  - Workspace → Package → Nodes/Messages/Launch
  - Konflikt-Markierungen bei duplicate package names
- [ ] **FR-16:** Keine Duplikate bei vorhandenen build/install-Ordnern

### Abhängigkeiten
- Benötigt: Release 1.0 (Workspace-Erkennung, Caching)

### Akzeptanzkriterien
- Alle Pakete im src-Ordner werden erkannt
- Korrekte Klassifikation (Python/C++)
- Baumansicht zeigt alle Komponenten pro Workspace
- Cache wird bei Dateiänderungen invalisiert

---

## Release 3.0: Node Execution

### Ziel
Ausführung von Nodes direkt aus der Extension

### Features
- [ ] **FR-10:** Play-Button hinter jedem Node
- [ ] **FR-11:** Node starten (mit Parameter-Abfrage optional)
  - Neues Terminal mit gesourctem Workspace
  - Korrekter Workspace-Kontext bei Multi-Workspace
  - Warnung bei Package-Name-Konflikten
- [ ] **FR-17:** Erweiterte Node-Informationen beim Ausklappen
  - Subscribers
  - Publisher
  - Parameter
- [ ] **FR-12:** Direct Build des Projekts (`colcon build --symlink-install`)
- [ ] **FR-13:** Einzelne Pakete bauen (`colcon build --packages-select`)

### Abhängigkeiten
- Benötigt: Release 2.0 (Node-Erkennung)

### Akzeptanzkriterien
- Nodes sind mit einem Klick startbar
- Build-Befehle funktionieren aus der UI
- Node-Metadaten werden angezeigt
- Korrekter Workspace-Kontext wird verwendet
- Konflikt-Warnungen werden angezeigt

---

## Release 4.0: Code Creation

### Ziel
Erstellung neuer ROS2-Komponenten mit automatischer Konfiguration

### Features
- [ ] **FR-7:** Neue Pakete erstellen
  - Auswahl: C++ oder Python
  - Namensabfrage
  - Target-Workspace Auswahl (bei mehreren Workspaces)
  - **Namensvalidierung:** Prüft auf Duplikate im Workspace
  - **Cross-Workspace Warnung:** Hinweis bei Name existiert in anderem Workspace
- [ ] **FR-8:** Neue Nodes in Paketen erstellen
  - Namensabfrage
  - Dependencies-Abfrage
  - Sprache (wenn nicht vom Paket vorgegeben)
  - Template-Auswahl (leer oder Beispiel)
- [ ] **FR-14:** Automatische CMakeLists.txt / setup.py / package.xml Updates
  - Entry-Points für Python-Nodes
  - Dependencies in package.xml

### Abhängigkeiten
- Benötigt: Release 2.0 (Paket-Strukturverständnis)

### Akzeptanzkriterien
- Vollständig konfigurierte Pakete/Nodes entstehen
- Alle Metadateien werden korrekt aktualisiert
- Multi-Workspace: Richtiger Workspace wird modifiziert
- Package-Name-Kollisionen werden verhindert

---

## Release 5.0: Advanced Features

### Ziel
Umfassende Unterstützung für ROS2-Interfaces und Launch-Systeme

### Features
- [ ] **FR-15:** Launch-Files erstellen
  - Optional: Nodes per Klick auswählen
- [ ] **FR-16:** Messages / Services / Actions erstellen
  - Nur bei CMake-Paketen (nicht ament-python)
  - Automatische CMakeLists.txt-Integration
- [ ] **NF-1:** Optimierte Baumstruktur (übersichtlich)
- [ ] **NF-2/NF-3:** UI-Verbesserungen für Node-Details

### Abhängigkeiten
- Benötigt: Release 4.0 (Code-Creation-Framework)

### Akzeptanzkriterien
- Launch-Files sind erstellbar
- Custom Interfaces (msg/srv/action) funktionieren
- CMake-Integration läuft automatisch

---

## Test-Strategie (Automatisiert)

### Test-Ebenen

#### 1. Unit Tests (Jest + ts-jest)
```
Location: src/__tests__/unit/

Test-Suiten:
- workspace-detector.test.ts    # FR-1, FR-2
- package-scanner.test.ts       # FR-3, FR-4
- cmake-parser.test.ts          # FR-14, FR-16
- python-parser.test.ts         # FR-14
- node-inspector.test.ts        # FR-17
- template-generator.test.ts    # FR-7, FR-8, FR-15
- cache-manager.test.ts         # NF-5
- duplicate-detector.test.ts    # FR-1 Duplicate Detection
```

#### 2. Integration Tests
```
Location: src/__tests__/integration/

Test-Suiten:
- multi-workspace.test.ts       # NF-4
- colcon-build.test.ts          # FR-12, FR-13
- node-execution.test.ts        # FR-11
- package-creation.test.ts      # FR-7, FR-8
- interface-generation.test.ts  # FR-16
- cross-workspace-conflicts.test.ts  # Package Name Konflikte
```

#### 3. E2E Tests (VSCode Test Runner)
```
Location: e2e/

Test-Suiten:
- workspace-loading.e2e.test.ts
- tree-view-navigation.e2e.test.ts
- node-launch.e2e.test.ts
- package-scaffolding.e2e.test.ts
- multi-workspace-conflicts.e2e.test.ts
```

#### 4. Mock Fixture Tests
```
Location: test-fixtures/

Inhalt:
- mock-workspace-single/        # Single Workspace Tests
- mock-workspace-multi/         # Multi Workspace Tests
- mock-workspace-conflicting/   # Package Name Konflikte
- mock-packages/                # Verschiedene Paket-Typen
  - python-pkg/
  - cpp-pkg/
  - mixed-pkg/
  - interfaces-pkg/
  - duplicate-name-pkg/         # Für Konflikt-Tests
```

### Test-Automatisierung

```yaml
Test-Command Struktur:
- npm run test:unit             # Unit Tests lokal
- npm run test:integration      # Integration Tests
- npm run test:e2e              # E2E Tests
- npm run test:coverage         # Coverage Report
- npm run test:watch            # Watch Mode für Entwicklung
```

### Test-Abdeckung Ziele

| Komponente | Mindest-Coverage |
|------------|------------------|
| Core Logic | 90% |
| Parsers    | 85% |
| UI Provider| 75% |
| Templates  | 95% |
| Cache Layer| 90% |

---

## CI/CD Pipeline

### GitHub Actions Workflow

```yaml
# .github/workflows/ci.yml

name: CI/CD Pipeline

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  lint:
    name: Lint & Type Check
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      - run: npm ci
      - run: npm run lint
      - run: npm run typecheck

  test-unit:
    name: Unit Tests
    runs-on: ubuntu-latest
    needs: lint
    steps:
      - uses: actions/checkout@v4
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      - run: npm ci
      - run: npm run test:unit -- --coverage
      - name: Upload Coverage
        uses: codecov/codecov-action@v4
        with:
          files: ./coverage/unit/lcov.info

  test-integration:
    name: Integration Tests
    runs-on: ubuntu-latest
    needs: lint
    services:
      ros2:
        image: osrf/ros:jazzy-desktop
        options: --rm
    steps:
      - uses: actions/checkout@v4
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      - run: npm ci
      - run: npm run test:integration

  test-e2e:
    name: E2E Tests
    strategy:
      matrix:
        os: [ubuntu-latest, windows-latest, macos-latest]
    runs-on: ${{ matrix.os }}
    needs: [test-unit, test-integration]
    steps:
      - uses: actions/checkout@v4
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      - run: npm ci
      - run: npm run test:e2e

  build-extension:
    name: Build Extension
    runs-on: ubuntu-latest
    needs: [test-unit, test-integration, test-e2e]
    if: github.ref == 'refs/heads/main' || github.ref == 'refs/heads/develop'
    steps:
      - uses: actions/checkout@v4
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      - run: npm ci
      - run: npm run compile
      - run: vsce package --pre-release
        if: github.ref == 'refs/heads/develop'
      - run: vsce package
        if: github.ref == 'refs/heads/main'
      - name: Upload Artifact
        uses: actions/upload-artifact@v4
        with:
          name: ramros-extension-${{ github.ref_name }}
          path: *.vsix

  publish-beta:
    name: Publish Beta (Develop Branch)
    runs-on: ubuntu-latest
    needs: build-extension
    if: github.ref == 'refs/heads/develop'
    environment: beta
    steps:
      - uses: actions/checkout@v4
      - name: Download Artifact
        uses: actions/download-artifact@v4
        with:
          name: ramros-extension-develop
      - name: Publish Beta to OpenVSX
        run: npx ovsx publish -p ${{ secrets.OVSX_TOKEN }} --pre-release
      - name: Publish Beta to VS Marketplace
        run: npx vsce publish -p ${{ secrets.VSCE_PAT }} --pre-release

  publish-release:
    name: Publish to VSCE Marketplace
    runs-on: ubuntu-latest
    needs: build-extension
    if: startsWith(github.ref, 'refs/tags/v')
    environment: production
    steps:
      - uses: actions/checkout@v4
      - name: Download Artifact
        uses: actions/download-artifact@v4
        with:
          name: ramros-extension-main
      - name: Create GitHub Release
        uses: softprops/action-gh-release@v2
        with:
          generate_release_notes: true
          files: '*.vsix'
      - name: Publish to OpenVSX
        run: npx ovsx publish -p ${{ secrets.OVSX_TOKEN }}
      - name: Publish to VS Marketplace
        run: npx vsce publish -p ${{ secrets.VSCE_PAT }}
```

### Release Automation

```yaml
# .github/workflows/release.yml

name: Release Management

on:
  workflow_dispatch:
    inputs:
      version_type:
        description: 'Version Bump Type'
        required: true
        default: 'patch'
        type: choice
        options:
          - major
          - minor
          - patch
      create_beta:
        description: 'Create Beta Release'
        required: false
        default: false
        type: boolean

jobs:
  release:
    runs-on: ubuntu-latest
    outputs:
      new_version: ${{ steps.version.outputs.new_version }}
    steps:
      - name: Checkout
        uses: actions/checkout@v4
      
      - name: Bump Version
        id: version
        run: |
          npm version ${{ github.event.inputs.version_type }}
          echo "new_version=$(node -p "require('./package.json').version")" >> $GITHUB_OUTPUT
      
      - name: Generate Changelog
        run: npm run changelog
      
      - name: Commit Version Bump
        uses: stefanzweifel/git-auto-commit-action@v5
        with:
          commit_message: 'chore(release): v${{ steps.version.outputs.new_version }}'
          tag_name: 'v${{ steps.version.outputs.new_version }}'
      
      - name: Create Release Draft
        if: ${{ !github.event.inputs.create_beta }}
        uses: softprops/action-gh-release@v2
        with:
          tag_name: v${{ steps.version.outputs.new_version }}
          draft: true
          generate_release_notes: true

  trigger-beta:
    needs: release
    if: github.event.inputs.create_beta == 'true'
    runs-on: ubuntu-latest
    steps:
      - name: Trigger Beta Build
        run: echo "Beta build will be triggered on develop branch"
```

### Pre-Commit Hooks

```json
// package.json (scripts)
{
  "scripts": {
    "prepare": "husky install",
    "lint-staged": "lint-staged"
  }
}

// .husky/pre-commit
npx lint-staged

// .lintstagedrc.json
{
  "*.ts": ["eslint --fix", "jest --findRelatedTests --bail"],
  "*.tsx": ["eslint --fix"],
  "*.json": ["prettier --write"]
}
```

---

## Caching-Strategie (Best Practice)

### Architektur

```typescript
// src/core/cache/cache-manager.ts

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number; // Time-to-live in ms
  dependencies: string[]; // File dependencies
}

class CacheManager {
  private memoryCache = new Map<string, CacheEntry<any>>();
  private readonly DEFAULT_TTL = 5 * 60 * 1000; // 5 Minuten
  private readonly MAX_CACHE_SIZE = 1000; // Entries
  
  // FileSystemWatcher für自动atische Invalidation
  private watcher: vscode.FileSystemWatcher;
  
  async get<T>(key: string): Promise<T | null> {
    const entry = this.memoryCache.get(key);
    if (!entry) return null;
    
    // TTL Check
    if (Date.now() - entry.timestamp > entry.ttl) {
      this.memoryCache.delete(key);
      return null;
    }
    
    return entry.data as T;
  }
  
  async set<T>(key: string, data: T, dependencies: string[] = []): Promise<void> {
    // LRU: Älteste Entry entfernen wenn Cache voll
    if (this.memoryCache.size >= this.MAX_CACHE_SIZE) {
      const oldestKey = this.memoryCache.keys().next().value;
      this.memoryCache.delete(oldestKey);
    }
    
    this.memoryCache.set(key, {
      data,
      timestamp: Date.now(),
      ttl: this.DEFAULT_TTL,
      dependencies
    });
  }
  
  invalidate(path: string): void {
    // Invalidiere alle Entries die von dieser Datei abhängen
    for (const [key, entry] of this.memoryCache.entries()) {
      if (entry.dependencies.includes(path)) {
        this.memoryCache.delete(key);
      }
    }
  }
  
  clear(): void {
    this.memoryCache.clear();
  }
}
```

### Multi-Layer Caching

```
┌─────────────────────────────────────────┐
│         UI Layer (Tree View)            │
│         - Cached Tree Structure         │
├─────────────────────────────────────────┤
│      Service Layer (Workspace)          │
│      - Package List Cache               │
│      - Node Info Cache                  │
├─────────────────────────────────────────┤
│       Parser Layer (File System)        │
│       - package.xml Cache               │
│       - CMakeLists.txt Cache            │
│       - setup.py Cache                  │
├─────────────────────────────────────────┤
│         Disk Cache (Optional)           │
│         - Persisted State (.workspace)  │
└─────────────────────────────────────────┘
```

### Invalidation Strategy

```typescript
// src/core/cache/invalidation-strategy.ts

enum InvalidationTrigger {
  FILE_CREATED = 'fileCreated',
  FILE_CHANGED = 'fileChanged',
  FILE_DELETED = 'fileDeleted',
  WORKSPACE_ADDED = 'workspaceAdded',
  WORKSPACE_REMOVED = 'workspaceRemoved',
  MANUAL_REFRESH = 'manualRefresh'
}

class InvalidationStrategy {
  handle(trigger: InvalidationTrigger, path: string): void {
    switch (trigger) {
      case InvalidationTrigger.FILE_CHANGED:
        if (path.endsWith('package.xml')) {
          this.invalidatePackageCache(path);
        } else if (path.endsWith('CMakeLists.txt')) {
          this.invalidateCMakeCache(path);
        } else if (path.endsWith('setup.py')) {
          this.invalidatePythonCache(path);
        }
        break;
      
      case InvalidationTrigger.WORKSPACE_ADDED:
        this.clearWorkspaceSpecificCache(path);
        break;
      
      case InvalidationTrigger.MANUAL_REFRESH:
        this.cacheManager.clear();
        break;
    }
  }
}
```

### Performance Targets

| Operation | Ziel-Ladezeit | Cache-Hit-Rate |
|-----------|---------------|----------------|
| Initial Workspace Scan | < 2s | - |
| Follow-up Scan (cached) | < 200ms | > 90% |
| Package Creation | < 500ms | - |
| Tree View Expand | < 100ms | > 95% |

---

## Technischer Implementierungsplan

### Phase 1 (Release 1.0)
```
1. Environment Detection Module
   - ROS_DISTRO lesen
   - Installationspfade validieren
   - Multi-Workspace Context Manager
2. Cache Manager Implementation
   - In-Memory Cache mit TTL
   - FileSystemWatcher Integration
   - LRU Eviction Policy
3. Duplicate Detection Module
   - Package Name Tracking pro Workspace
   - Cross-Workspace Conflict Detection
4. Workspace Validator
   - Ordner-Struktur prüfen
   - Setup-Bash Existenz checken
5. Unit Tests für Detection Logic + Cache
```

### Phase 2 (Release 2.0)
```
1. Package Scanner
   - package.xml Parser
   - CMakeLists.txt Parser
   - setup.py Parser (Python)
   - Mit Cache-Integration
2. Tree View Provider
   - VSCode TreeView API
   - Icon-Set für Node-Typen
   - Multi-Workspace Root Nodes
   - Conflict Markierungen (Warning Icons)
3. Integration Tests für Scanner
```

### Phase 3 (Release 3.0)
```
1. Terminal Manager
   - VSCode Terminal API
   - Source-Command Injection
   - Workspace Context Tracking
2. Process Runner
   - colcon build wrapper
   - ros2 run wrapper
3. Node Inspector
   - ros2 node info Parser
   - Meta-Data Extraktion
4. E2E Tests für Execution
```

### Phase 4 (Release 4.0)
```
1. Template Engine
   - Python Node Templates
   - C++ Node Templates
   - Package Templates
2. File Generator
   - Scaffolding Logic
3. Manifest Editor
   - XML Manipulation (package.xml)
   - Python AST (setup.py)
   - CMake Parsing/Editing
4. Package Name Validator
   - Duplicate Prevention (same workspace)
   - Cross-Workspace Warning
5. Snapshot Tests für Templates
```

### Phase 5 (Release 5.0)
```
1. Interface Generator
   - .msg / .srv / .action Dateien
2. Launch File Builder
   - Python-based launch files
   - Node Selection UI
3. Full E2E Test Suite
```

---

## Projektstruktur

```
ramros/
├── src/
│   ├── core/
│   │   ├── workspace-detector.ts
│   │   ├── ros-environment.ts
│   │   ├── multi-workspace-manager.ts
│   │   └── duplicate-package-detector.ts
│   ├── cache/
│   │   ├── cache-manager.ts
│   │   ├── invalidation-strategy.ts
│   │   └── cache-types.ts
│   ├── scanner/
│   │   ├── package-scanner.ts
│   │   ├── cmake-parser.ts
│   │   ├── python-parser.ts
│   │   └── node-inspector.ts
│   ├── treeview/
│   │   ├── tree-provider.ts
│   │   ├── tree-items.ts
│   │   └── conflict-indicators.ts
│   ├── executor/
│   │   ├── terminal-manager.ts
│   │   ├── process-runner.ts
│   │   └── colcon-wrapper.ts
│   ├── generator/
│   │   ├── template-engine.ts
│   │   ├── file-generator.ts
│   │   ├── manifest-editor.ts
│   │   └── package-name-validator.ts
│   ├── __tests__/
│   │   ├── unit/
│   │   │   ├── cache-manager.test.ts
│   │   │   ├── duplicate-detector.test.ts
│   │   │   └── ...
│   │   └── integration/
│   │       └── cross-workspace-conflicts.test.ts
│   └── extension.ts
├── e2e/
│   └── *.e2e.test.ts
├── test-fixtures/
│   ├── mock-workspace-single/
│   ├── mock-workspace-multi/
│   ├── mock-workspace-conflicting/
│   └── mock-packages/
├── .github/
│   └── workflows/
│       ├── ci.yml
│       ├── release.yml
│       └── publish.yml
├── .husky/
├── package.json
├── tsconfig.json
├── jest.config.ts
└── vsc-extension-quickstart.md
```

---

## Risikoanalyse

| Risiko | Wahrscheinlichkeit | Impact | Mitigation |
|--------|-------------------|--------|------------|
| ROS2-Version-Inkompatibilität | Mittel | Hoch | Abstraktionsschicht für Versionen + Tests |
| CMake-Parsing komplex | Hoch | Mittel | Robuste Regex + Fallback-Logik + Parser-Tests |
| Memory Leak im Cache | Niedrig | Mittel | LRU Eviction + Max Size Limit + Monitoring |
| Cross-Workspace Conflicts | Mittel | Hoch | Clear UI Warnings + Validation vor Create |
| VSCode API-Limitationen | Niedrig | Mittel | Early Prototyping der UI-Komponenten |
| CI/CD Flakiness (E2E) | Mittel | Niedrig | Retry-Logic, isolierte Fixtures |

---

## Definition of Done (Pro Feature)

- [ ] Code implementiert
- [ ] Unit Tests geschrieben (>85% Coverage)
- [ ] Integration Tests bestanden
- [ ] E2E Test (wo anwendbar)
- [ ] TypeScript Typen definiert
- [ ] ESLint sauber
- [ ] Cache-Integration vorhanden (wo relevant)
- [ ] Duplicate Detection getestet (wo relevant)
- [ ] Documentation aktualisiert
- [ ] Code Review abgeschlossen

---

## Offene Punkte / Klärungsbedarf

1. **Testing:** 
   - Sollen Hardware-in-the-Loop Tests mit echtem ROS2?
   - Docker-Container für konsistente Test-Umgebung? ✅ (in CI integriert)

2. **Beta Releases:**
   - Beta von main oder separatem develop Branch? ✅ (develop Branch)
   - Automatische Beta bei Merge zu develop? ✅ (implementiert)

3. **Performance:**
   - Cache-TTL: 5 Minuten (configurable?) → Ja, über VSCode Settings
   - Soll persistenter Cache über Sessions? → Nein, nur In-Memory

4. **UI/UX:**
   - Wie sollen Konflikte visualisiert werden? → Warning-Icon + Tooltip
   - Kontextmenü für Conflict Resolution? → Später, erstmal nur Warnung

</content>