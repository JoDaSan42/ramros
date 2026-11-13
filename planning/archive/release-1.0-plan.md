# Release 1.0 - Foundation & Discovery (MVP)

## Release-Ziel

Grundlegende ROS2-Workspace-Erkennung, Validierung und Multi-Workspace Management mit Caching-Strategie.

**Release-Version:** 1.0.0  
**Geplanter Zeitraum:** 4-6 Wochen  
**Status:** 📋 Planung

---

## Scope Übersicht

### In Scope (Release 1.0)
- ✅ ROS2-Installation Detection (Humble, Jazzy, Rolling, etc.)
- ✅ Multi-Workspace Support (beliebige Anzahl)
- ✅ Workspace Validierung (src Ordner, install/setup.bash)
- ✅ Duplicate Package Detection (im selben Workspace blockieren)
- ✅ Cross-Workspace Conflict Markierung
- ✅ Caching-System (In-Memory, TTL, Auto-Invalidation)
- ✅ Source Workspace Command
- ✅ Basis Tree View (Workspace Root Nodes)
- ✅ Unit + Integration Tests
- ✅ CI/CD Pipeline Grundgerüst

### Out of Scope (spätere Releases)
- ❌ Paket/Node Creation (Release 4.0)
- ❌ Node Execution (Release 3.0)
- ❌ Detailed Package Scanning (Release 2.0)
- ❌ Launch/Messages/Services (Release 5.0)

---

## Feature Specifications

### FR-1.0.1: ROS2 Installation Detection

**Beschreibung:**  
Erkennt installierte ROS2 Distributionen im System.

**Implementierung:**
```typescript
// src/core/ros-environment.ts

interface RosDistribution {
  name: 'humble' | 'jazzy' | 'rolling' | string;
  version: string;
  installPath: string;
  setupBash: string;
  isActive: boolean;
}

class RosEnvironmentService {
  detectInstallations(): Promise<RosDistribution[]>;
  getActiveDistribution(): Promise<RosDistribution | null>;
  validateInstallation(dist: RosDistribution): Promise<boolean>;
}
```

**Akzeptanzkriterien:**
- [ ] Alle gängigen Distributionen werden erkannt (Humble, Jazzy, Rolling)
- [ ] Installationspfade werden korrekt ausgelesen (`/opt/ros/<distro>`)
- [ ] `setup.bash` Existenz wird validiert
- [ ] Aktive Distribution (aus `ROS_DISTRO` env) wird identifiziert
- [ ] Fehlerhafte Installationen werden gemeldet

**Tests:**
- `ros-environment.test.ts`: 8 Test Cases
  - Detect single installation
  - Detect multiple installations
  - Handle missing installation
  - Parse ROS_DISTRO environment
  - Validate setup.bash existence

---

### FR-1.0.2: Multi-Workspace Detection

**Beschreibung:**  
Untersucht alle in VSCode geöffneten Ordner auf ROS2 Workspace-Struktur.

**Implementierung:**
```typescript
// src/core/workspace-detector.ts

interface WorkspaceInfo {
  id: string; // URI path als unique ID
  name: string;
  rootPath: vscode.Uri;
  srcPath: vscode.Uri | null;
  installPath: vscode.Uri | null;
  buildPath: vscode.Uri | null;
  rosDistribution: RosDistribution | null;
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

class WorkspaceDetector {
  detectWorkspaces(): Promise<WorkspaceInfo[]>;
  validateWorkspace(info: WorkspaceInfo): Promise<void>;
  isRosWorkspace(path: vscode.Uri): Promise<boolean>;
}
```

**Validierungslogik:**
```
Ein Ordner gilt als ROS2 Workspace wenn:
1. Es einen <src> Unterordner gibt ODER
2. Es einen <install/setup.bash> gibt ODER
3. Es eine <package.xml> im Root gibt

Fehler wenn:
- src Ordner existiert nicht UND
- install/setup.bash existiert nicht

Warnung wenn:
- Weder build noch install vorhanden (nicht gebaut)
```

**Akzeptanzkriterien:**
- [ ] Alle VSCode workspace folders werden gescannt
- [ ] Korrekte Klassifikation als ROS2 Workspace
- [ ] Pfade zu src/install/build werden gespeichert
- [ ] Jeder Workspace bekommt ROS Distribution zugewiesen
- [ ] Errors/Warnings werden gesammelt

**Tests:**
- `workspace-detector.test.ts`: 12 Test Cases
  - Detect single workspace
  - Detect multiple workspaces
  - Handle non-ROS folder
  - Validate src folder presence
  - Validate install folder presence

---

### FR-1.0.3: Duplicate Package Detection

**Beschreibung:**  
Verhindert gleiche Paketnamen im selben Workspace und warnt bei Cross-Workspace Konflikten.

**Implementierung:**
```typescript
// src/core/duplicate-package-detector.ts

interface PackageConflict {
  packageName: string;
  locations: {
    workspaceId: string;
    packagePath: string;
  }[];
  type: 'same-workspace' | 'cross-workspace';
}

class DuplicatePackageDetector {
  scanWorkspace(workspace: WorkspaceInfo): Promise<PackageInfo[]>;
  detectDuplicates(workspaces: WorkspaceInfo[]): Promise<PackageConflict[]>;
  isPackageNameUnique(name: string, workspaceId: string): Promise<boolean>;
}
```

**Logik:**
```typescript
// Same Workspace Check (BLOCKING)
if (packages.some(p => p.name === newName)) {
  throw new Error(`Package "${newName}" exists bereits in diesem Workspace`);
}

// Cross Workspace Check (WARNING)
const otherWorkspaces = workspaces.filter(w => w.id !== currentWorkspace.id);
for (const ws of otherWorkspaces) {
  if (await hasPackage(ws, packageName)) {
    warnings.push(`⚠️ Package "${packageName}" existiert in Workspace "${ws.name}"`);
  }
}
```

**Akzeptanzkriterien:**
- [ ] Package Names im selben Workspace werden eindeutig validiert
- [ ] Versuch ein Duplikat zu erstellen wird blockiert
- [ ] Cross-Workspace Duplikate werden erkannt
- [ ] UI zeigt Warning Icon bei Konflikten
- [ ] Tooltip erklärt den Konflikt

**Tests:**
- `duplicate-detector.test.ts`: 10 Test Cases
  - Detect duplicates in same workspace
  - Allow unique names
  - Detect cross-workspace conflicts
  - Handle empty workspaces

---

### FR-1.0.4: Caching System

**Beschreibung:**  
In-Memory Cache mit TTL, LRU Eviction und FileSystemWatcher-basierter Invalidation.

**Implementierung:**
```typescript
// src/cache/cache-manager.ts

type CacheKey = string;

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
  dependencies: vscode.Uri[];
}

class CacheManager {
  private readonly DEFAULT_TTL = 5 * 60 * 1000; // 5 min
  private readonly MAX_CACHE_SIZE = 1000;
  
  get<T>(key: CacheKey): Promise<T | null>;
  set<T>(key: CacheKey, data: T, deps?: vscode.Uri[]): Promise<void>;
  invalidate(path: vscode.Uri): void;
  clear(): void;
  getStats(): CacheStats;
}
```

**Invalidation Rules:**
| Datei geändert | Invalidiere |
|----------------|-------------|
| `*/package.xml` | Package Cache, Workspace Tree |
| `*/CMakeLists.txt` | Package Cache |
| `*/setup.py` | Python Package Cache |
| `install/setup.bash` | Workspace Validation Cache |

**Akzeptanzkriterien:**
- [ ] Cache Entries expiren nach 5 Minuten
- [ ] LRU Eviction bei >1000 Entries
- [ ] FileSystemWatcher triggeren Invalidation
- [ ] Manual Refresh Command leert Cache
- [ ] Stats verfügbar für Debugging

**Tests:**
- `cache-manager.test.ts`: 15 Test Cases
  - Set and get values
  - TTL expiration
  - LRU eviction
  - File-based invalidation
  - Clear all

---

### FR-1.0.5: Tree View Provider (Basis)

**Beschreibung:**  
Zeigt Workspaces im VSCode Explorer als Baumstruktur.

**Implementierung:**
```typescript
// src/treeview/tree-provider.ts

abstract class TreeItem extends vscode.TreeItem {
  abstract getChildren(): TreeItem[];
}

class WorkspaceRootItem extends TreeItem {
  constructor(workspace: WorkspaceInfo);
  getChildren(): Promise<PackageGroupItem[]>;
}

class PackageGroupItem extends TreeItem {
  // Placeholder für Release 2.0
  getChildren(): Promise<TreeItem[]>;
}
```

**UI Struktur:**
```
RAMROS Explorer
├── 📁 workspace-1 (ros2/jazzy)
│   ├── ⚠️ Warnings: 2
│   └── 📦 Packages: (wird in 2.0 gefüllt)
├── 📁 workspace-2 (ros2/humble)
│   └── 📦 Packages: (wird in 2.0 gefüllt)
└── 🔍 Commands
    ├── 🔄 Refresh All
    └── ⚡ Source Workspace
```

**Akzeptanzkriterien:**
- [ ] Tree View Panel "RAMROS Explorer" erscheint
- [ ] Alle validen Workspaces werden angezeigt
- [ ] ROS Distribution wird im Label gezeigt
- [ ] Warning Count wird angezeigt falls vorhanden
- [ ] Context Menu mit Refresh und Source Commands

**Tests:**
- `tree-provider.test.ts`: 6 Test Cases
  - Create tree from workspaces
  - Handle empty workspace list
  - Warning badge display

---

### FR-1.0.6: Source Workspace Command

**Beschreibung:**  
Führt `source install/setup.bash` im Terminal aus.

**Implementierung:**
```typescript
// src/executor/terminal-manager.ts

class TerminalManager {
  async sourceWorkspace(workspace: WorkspaceInfo): Promise<void>;
  async executeInTerminal(command: string, workspace: WorkspaceInfo): Promise<void>;
}
```

**Logik:**
```typescript
async sourceWorkspace(workspace: WorkspaceInfo) {
  const setupBash = path.join(workspace.installPath.fsPath, 'setup.bash');
  
  if (!await this.fs.exists(setupBash)) {
    vscode.window.showWarningMessage(
      `Workspace "${workspace.name}" wurde noch nicht gebaut. Bitte erst colcon build ausführen.`
    );
    return;
  }
  
  const terminal = vscode.window.createTerminal({
    name: `ROS: ${workspace.name}`,
    shellArgs: ['-c', `source ${setupBash} && exec bash`]
  });
  terminal.show();
}
```

**Akzeptanzkriterien:**
- [ ] Command "RAMROS: Source Workspace" verfügbar
- [ ] Neues Terminal wird geöffnet
- [ ] Setup.bash wird gesourced
- [ ] Fehlermeldung wenn install fehlt
- [ ] Pro Workspace separates Terminal

**Tests:**
- `terminal-manager.test.ts`: 5 Test Cases
  - Source existing workspace
  - Handle missing install folder
  - Terminal creation

---

## Technische Architektur

### Modul-Übersicht

```
┌─────────────────────────────────────────────────────┐
│                  extension.ts                       │
│  - Extension aktivieren                             │
│  - Services registrieren                            │
│  - Commands anmelden                                │
│  - Disposables verwalten                            │
└─────────────────────────────────────────────────────┘
            │
            ├─► RosEnvironmentService
            │   - ROS Distribution Detection
            │
            ├─► WorkspaceDetector
            │   - Multi-Workspace Scan
            │   - Validation Logic
            │
            ├─► DuplicatePackageDetector
            │   - Package Name Tracking
            │   - Conflict Detection
            │
            ├─► CacheManager
            │   - In-Memory Storage
            │   - TTL + LRU
            │   - FileSystemWatcher
            │
            ├─► TreeProvider
            │   - VSCode TreeView API
            │   - Item Rendering
            │
            └─► TerminalManager
                - Source Command
                - Terminal Lifecycle
```

### Dependencies

```json
{
  "dependencies": {},
  "devDependencies": {
    "@types/vscode": "^1.85.0",
    "@types/node": "^20.10.0",
    "typescript": "^5.3.0",
    "jest": "^29.7.0",
    "ts-jest": "^29.1.0",
    "@types/jest": "^29.5.0",
    "eslint": "^8.55.0",
    "@typescript-eslint/parser": "^6.13.0",
    "@typescript-eslint/eslint-plugin": "^6.13.0",
    "husky": "^8.0.0",
    "lint-staged": "^15.2.0"
  }
}
```

**Externe Libraries:** Keine (reine VSCode API + Node.js)

---

## Implementierungs-Phasen

### Woche 1: Foundation Setup

**Ziele:**
- [ ] Projekt-Initialisierung (npm, tsconfig, package.json)
- [ ] GitHub Repository Setup
- [ ] CI/CD Grundgerüst (GitHub Actions)
- [ ] RosEnvironmentService implementieren
- [ ] Unit Tests für RosEnvironmentService

**Deliverables:**
- `package.json` mit Scripts
- `tsconfig.json` konfiguriert
- `.github/workflows/ci.yml` (Lint + Unit Tests)
- `src/core/ros-environment.ts` + Tests
- Extension lädt ohne Errors

**Definition of Done:**
- npm run compile erfolgreich
- npm run test:unit grün (8 Tests)
- CI Pipeline läuft grün

---

### Woche 2: Workspace Detection + Caching

**Ziele:**
- [ ] WorkspaceDetector implementieren
- [ ] CacheManager mit TTL/LRU
- [ ] FileSystemWatcher Integration
- [ ] Integration Tests

**Deliverables:**
- `src/core/workspace-detector.ts`
- `src/cache/cache-manager.ts`
- `src/cache/invalidation-strategy.ts`
- Unit + Integration Tests (20+ Tests)

**Definition of Done:**
- Detection funktioniert mit Test-Fixtures
- Cache invalidiert bei Dateiänderungen
- Coverage > 85% für Core Modules

---

### Woche 3: Duplicate Detection + Tree View

**Ziele:**
- [ ] DuplicatePackageDetector
- [ ] TreeView Provider (Basis)
- [ ] UI Rendering mit Warnings
- [ ] E2E Tests Setup

**Deliverables:**
- `src/core/duplicate-package-detector.ts`
- `src/treeview/tree-provider.ts`
- `src/treeview/tree-items.ts`
- `e2e/workspace-loading.e2e.test.ts`

**Definition of Done:**
- Duplicate Detection getestet
- Tree View zeigt Workspaces
- E2E Test läuft lokal

---

### Woche 4: Terminal + Polish

**Ziele:**
- [ ] TerminalManager
- [ ] Source Command
- [ ] Error Handling verbessern
- [ ] Documentation
- [ ] Beta Release vorbereiten

**Deliverables:**
- `src/executor/terminal-manager.ts`
- Command Registration in `extension.ts`
- README.md mit Usage Guide
- CHANGELOG.md für v1.0.0

**Definition of Done:**
- Source Command funktioniert
- Alle Akzeptanzkriterien erfüllt
- Code Review abgeschlossen
- Beta Ready

---

### Woche 5-6: Buffer + Testing

**Puffer für:**
- Bug Fixes aus Testing
- Performance Optimierungen
- Cross-Platform Testing (Windows, macOS)
- Security Review
- Accessibility Check

**Falls Zeit übrig:**
- Additional Error Messages
- Better Logging
- Advanced Caching Stats
- More Test Coverage

---

## Test Plan

### Test-Fixtures Struktur

```
test-fixtures/
├── workspace-valid/
│   ├── src/
│   │   └── my_package/
│   │       ├── package.xml
│   │       └── CMakeLists.txt
│   └── install/
│       └── setup.bash
├── workspace-no-src/
│   └── install/
│       └── setup.bash
├── workspace-invalid/
│   └── random-folder/
├── workspace-duplicates/
│   ├── src/
│   │   ├── pkg_a/
│   │   └── pkg_a_copy/  # Gleicher Name
│   └── install/
└── multi-workspace/
    ├── ws1/src/pkg_a/
    └── ws2/src/pkg_a/   # Cross-Workspace Duplicate
```

### Test Matrix

| Test Typ | Framework | Location | Ziel |
|----------|-----------|----------|------|
| Unit | Jest | `src/__tests__/unit/` | Core Logic |
| Integration | Jest | `src/__tests__/integration/` | Service Interaction |
| E2E | VSCode Test Runner | `e2e/` | Full Extension |

### Test Commands

```bash
# Lokal entwickeln
npm run test:unit              # Unit Tests
npm run test:unit:watch        # Watch Mode
npm run test:integration       # Integration Tests
npm run test:e2e               # E2E Tests
npm run test:coverage          # Coverage Report

# CI Pipeline
npm run test:ci                # Alle Tests für CI
```

---

## CI/CD Setup

### Phase 1: Basic CI (Woche 1)

```yaml
# .github/workflows/ci-basic.yml
name: CI Basic

on: [push, pull_request]

jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm ci
      - run: npm run lint
  
  test-unit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm ci
      - run: npm run test:unit -- --coverage
```

### Phase 2: Full CI (Woche 3)

```yaml
# .github/workflows/ci-full.yml
name: CI Full

on: [push, pull_request]

jobs:
  test-matrix:
    strategy:
      matrix:
        os: [ubuntu-latest, windows-latest, macos-latest]
    runs-on: ${{ matrix.os }}
    steps:
      - run: npm run test:ci
```

### Phase 3: Beta Publish (Woche 4)

```yaml
# .github/workflows/publish-beta.yml
name: Publish Beta

on:
  push:
    branches: [develop]

jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - run: vsce publish --pre-release
```

---

## Risk Management

| Risiko | Wahrscheinlichkeit | Impact | Mitigation | Owner |
|--------|-------------------|--------|------------|-------|
| VSCode API Änderungen | Niedrig | Mittel | Mindestversion festlegen (1.85) | Tech Lead |
| ROS2 Pfad-Variationen | Mittel | Hoch | Flexible Detection Logic | Dev Team |
| Memory Leak im Cache | Niedrig | Mittel | Strict LRU + Max Size | Dev Team |
| CI/CD Flakiness | Mittel | Niedrig | Retry Logic + lokale Tests | DevOps |
| Zeitüberschreitung | Mittel | Mittel | Buffer Weeks eingeplant | PM |

---

## Erfolgsmetriken (KPIs)

| Metrik | Ziel | Messung |
|--------|------|---------|
| Unit Test Coverage | > 85% | Jest Coverage Report |
| E2E Test Pass Rate | 100% | CI Pipeline Stats |
| Extension Start Time | < 1s | Performance Profiling |
| Workspace Detection Time | < 2s | Benchmark Tests |
| Cache Hit Rate | > 90% | Cache Stats Command |
| Zero Critical Bugs | 0 | Issue Tracker |

---

## Release Checklist

### Pre-Release (Develop Branch)

- [ ] Alle Features implementiert
- [ ] Unit Tests > 85% Coverage
- [ ] Integration Tests bestanden
- [ ] E2E Tests bestanden
- [ ] ESLint sauber
- [ ] TypeScript keine Errors
- [ ] Code Review durch 2 Personen
- [ ] CHANGELOG.md aktuell
- [ ] README.md mit v1.0 Features
- [ ] Beta auf OpenVSX gepublished
- [ ] Beta auf VS Marketplace gepublished

### Release (Main Branch)

- [ ] Beta Testing Feedback eingearbeitet
- [ ] Version bump auf 1.0.0
- [ ] Git Tag v1.0.0 erstellt
- [ ] GitHub Release erstellt
- [ ] Stable auf OpenVSX
- [ ] Stable auf VS Marketplace
- [ ] Release Announcement (Docs/Forum)

---

## Offene Entscheidungen

| Entscheidung | Status | Fällig bis | Owner |
|--------------|--------|------------|-------|
| Min. VSCode Version | ✅ Festgelegt: 1.85 | - | Tech Lead |
| Cache TTL Default | ✅ Festgelegt: 5min | - | Architekt |
| Beta von develop Branch | ✅ Festgelegt | - | DevOps |
| Package.json Entry Point | 🟡 Diskussion | Ende Woche 1 | Tech Lead |
| Logging Framework (ja/nein) | 🟡 Diskussion | Ende Woche 1 | Tech Lead |

---

## Kommunikation

### Daily Standups
- Zeitpunkt: Täglich 09:30 Uhr
- Dauer: 15 Minuten
- Format: Was gestern / Was heute / Blockers

### Sprint Reviews
-频率:每周一
- Teilnehmer: Dev Team + Stakeholder
- Demo der neuen Features

### Reporting
- Weekly Status Email an Stakeholder
- Burndown Chart im Project Board
- CI/CD Badge im README

---

## Nächste Schritte

1. **Kickoff Meeting** ansetzen (alle Stakeholder)
2. **Repository erstellen** (GitHub/GitLab)
3. **Development Environment** aufsetzen
4. **Week 1 Tasks** im Project Board anlegen
5. **Test Fixtures** vorbereiten

---

**DokumentVersion:** 1.0  
**Erstellt:** 2026-03-23  
**Genehmigt durch:** _Open_

