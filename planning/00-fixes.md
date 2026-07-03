# RAMROS — Necessary Changes

Senior architect review of the RAMROS VSCode ROS2 extension. Each item is
classified by **severity** (Critical / High / Medium / Low), tagged with a
**category** (Correctness, Architecture, Dead Code, Performance, Maintainability,
Consistency, Docs), and includes the affected files, evidence, and a concrete
fix proposal.

Priority order is roughly: correctness bugs → dead/duplicated code → god-module
splits → performance → consistency → docs.

---

## 1. Phantom abstraction: `CacheManager` is never used

- **Severity**: High
- **Category**: Dead Code, Architecture
- **Files**: `src/cache/cache-manager.ts`, `src/extension.ts:75`, README

### Evidence
- `CacheManager` is instantiated and added to disposables in `extension.ts:75`,
  but **no service ever calls `cacheManager.get` / `cacheManager.set`**.
- `PackageDiscoveryService`, `DuplicatePackageDetector`, and `WorkspaceDetector`
  each keep their own private `Map` caches, fully bypassing `CacheManager`.
- README §"Smart Caching" advertises "TTL + LRU + FS-watcher invalidation",
  which is **not realized** in the data flow.
- `CacheManager` eviction picks `memoryCache.keys().next().value` (oldest
  *inserted*) and never reorders on `get` → it is **FIFO**, not LRU as advertised.
- `invalidate` uses `normalizedPath.includes(dep)` (substring match) → can
  over-invalidate unrelated keys.
- `MAX_CACHE_SIZE` / `DEFAULT_TTL` are private constants with no config hook,
  despite README claiming "Configurable cache duration".

### Fix
- **Option A (recommended)**: Route all service caches through `CacheManager`:
  - `PackageDiscoveryService`, `DuplicatePackageDetector`, `WorkspaceDetector`
    call `cacheManager.set(key, value, [deps])` and `cacheManager.get(key)`.
  - Add a `touch(key)` on `get` to make eviction real LRU.
  - Replace `normalizedPath.includes(dep)` with exact or normalized-prefix match.
  - Expose `ramros.cache.ttlSeconds` / `ramros.cache.maxEntries` in
    `package.json` `contributes.configuration`.
- **Option B**: Delete `cache-manager.ts`, drop the README section, and keep the
  ad-hoc `Map` caches.

---

## 2. Phantom module: `node-analyzer.ts` is orphaned

- **Severity**: High
- **Category**: Dead Code, Duplication
- **Files**: `src/core/node-analyzer.ts` (186 LOC), `src/core/package-discovery.ts:543,657`

### Evidence
- No file in `src/` imports `node-analyzer`. Its `analyzeCppNode` /
  `analyzePythonNode` are duplicated nearly regex-for-regex as private methods
  inside `package-discovery.ts`.
- `node-analyzer` cannot infer parameter `type` (only `package-discovery` does)
  → it is the older, superseded version.
- Not covered by any unit test.

### Fix
- Delete `src/core/node-analyzer.ts`, **or** refactor `package-discovery.ts` to
  delegate to the standalone module (preferred: removes duplication and gives
  the analyzer a unit-testable seam).

---

## 3. God module: `extension.ts` (1400 LOC, 17 commands, 6 globals)

- **Severity**: High
- **Category**: Architecture, Maintainability, Testability
- **Files**: `src/extension.ts`

### Evidence
- 1400 LOC, ~17 command handlers, 6 module-level mutable globals:
  `activeRecordingTerminal`, `isRecordingPaused`, `activePlaybackTerminal`,
  `isPlaybackPaused`, `isPlaybackLooping`, plus service singletons.
- `createPackage` command is ~365 LOC (lines 216–580) and contains a full inline
  wizard with `collectFields` / `buildDefinition` / validation helpers —
  duplicating logic that belongs in `wizard/`.
- The **same interface-collection logic is duplicated verbatim** inside
  `addNodeToPackage` (lines 869–1019).
- Hardcoded test values shipped to production: `authorName = 'ramros'`,
  `authorEmail = 'ramros@test.com'` (lines 302–303).
- `openPackageTerminal` (line 753) calls `vscode.window.createTerminal` directly,
  bypassing `TerminalManager`.
- `setTimeout` + magic 500 ms / 100 ms delays for terminal focus/restart
  (lines 1210, 1305, 1341, 1349) — fragile timing coupling.
- Module globals make command handlers essentially un-unit-testable.

### Fix
- Extract `createPackage` / `addNodeToPackage` inline wizards into
  `wizard/package-wizard.ts` (UI flow) + reuse `package-creator.ts` (logic).
- Introduce a `BagSessionService` class holding recording/playback state
  (terminal ref, paused/looping flags) — single source of truth, replacing both
  the module globals here **and** the static fields on `tree-items` classes.
- Route `openPackageTerminal` through `TerminalManager`.
- Replace `setTimeout(...)` magic delays with `TerminalManager`-managed focus
  helpers or VSCode's `onDidChangeTerminalState`.

---

## 4. God module: `tree-items.ts` (1503 LOC, ~40 classes)

- **Severity**: High
- **Category**: Architecture, Layering Violation, Duplication
- **Files**: `src/treeview/tree-items.ts`

### Evidence
- ~40 `TreeItem` subclasses for all three views in a single file.
- **Layering violation**: `TopicPublishersItem.getChildren` (line 632) and
  `TopicSubscribersItem.getChildren` (line 679) call
  `execSync('ros2 topic info ... --verbose')` directly inside UI item classes
  → UI items executing synchronous subprocesses on expand, blocking the host.
- The `ros2 topic info --verbose` parser is **triplicated**: twice in
  `tree-items.ts` and once in `live-tree-provider.ts`.
- Static mutable state used as global singleton state:
  `BagRecordItem.isRecording`, `BagPlayItem.selectedBagFile`,
  `BagPlayControlItem.isPlaying/isPaused`, `BagLoopItem.isLooping`,
  `BagFilesFolderItem.*Instance` — hidden global state duplicated with
  `extension.ts` globals (see item 3).
- Near-duplicate item pairs: `InterfaceFileItem` vs `CategoryInterfaceFileItem`,
  `LaunchFileItem` vs `CategoryLaunchFileItem`, `NodeItem` vs `CategoryNodeItem`
  — copy-paste with minor differences.

### Fix
- Split into `bag-items.ts`, `live-items.ts`, `workspace-items.ts`,
  `interface-items.ts`, `launch-items.ts`, `base-tree-item.ts`.
- Move `ros2 topic info` / `ros2 node info` parsing into a `Ros2CliService`
  (async) and call it from the providers, not from `getChildren()`.
- Move bag static state into `BagSessionService` (item 3).
- Collapse near-duplicate item pairs via a shared base class + a `category`
  discriminator.

---

## 5. Bug: `launch-generator` emits duplicate `parameters=[...]` keys

- **Severity**: Critical
- **Category**: Correctness
- **Files**: `src/wizard/launch-generator.ts:87-96,110-112`

### Evidence
When a node has both `parameters` and `useSimTime`, two separate
`parameters=[...]` keyword arguments are emitted:
- `parameters=[{'use_sim_time': ...}]` (lines 87–96)
- `parameters=[{<user params>}]` (lines 110–112)

Result: invalid Python (`SyntaxError`: keyword argument repeated) or silent
override of the user parameters.

### Fix
Merge into a single `parameters=[{...}]` dict that includes `use_sim_time`
alongside the user parameters.

---

## 6. Bug: `launch-generator` trailing-comma stripping can corrupt unrelated lines

- **Severity**: Critical
- **Category**: Correctness
- **Files**: `src/wizard/launch-generator.ts:115`

### Evidence
`lines[lines.length-1] = lines[lines.length-1].replace(/,$/, '')` operates on
the *last line pushed*, which may be an unrelated line (e.g. a
`parameters=[{` line) when `output` / `useSimTime` are absent.

### Fix
Track the index of the line that opened the list/dict and strip the comma from
that exact line, or build the node dict via a small templating helper that
doesn't rely on post-hoc regex surgery.

---

## 7. Bug: hardcoded `/opt/ros/humble` breaks multi-distro support

- **Severity**: Critical
- **Category**: Correctness
- **Files**: `src/wizard/package-creator.ts:100`

### Evidence
`source /opt/ros/humble/setup.bash` is hardcoded, but the README claims support
for Humble, Jazzy, Rolling, Iron, Galactic, and Foxy. On any non-Humble distro
the `ros2 pkg create` step will fail or source the wrong environment.

### Fix
Inject `RosEnvironmentService` into `PackageCreator` and source
`/opt/ros/<active-distro>/setup.bash` from `getActiveDistribution()`.

---

## 8. Bug: `duplicate-package-detector.validateNewPackageName` cold-cache false negative

- **Severity**: Critical
- **Category**: Correctness
- **Files**: `src/core/duplicate-package-detector.ts`

### Evidence
`packageCache` is only populated by `scanWorkspace`, which the wizard never
calls before validation. On the **first** `validateNewPackageName` call the
cache is empty → returns `true` (unique) → a duplicate name can slip through.

### Fix
Ensure `scanWorkspace` is invoked (or `detectWorkspaces` is consulted) before
the first validation, or have `validateNewPackageName` trigger a scan on cache
miss.

---

## 9. Bug: `tree-provider` file-watcher leak + no debouncing

- **Severity**: High
- **Category**: Correctness, Performance
- **Files**: `src/treeview/tree-provider.ts`

### Evidence
- `setupFileWatcher` creates one watcher per workspace folder, pushes all to a
  local `watchers[]`, but assigns only `this.fileWatcher = watchers[0]` (line
  112). All but the first watcher are **never disposed**; `stopAutoRefresh`
  only disposes `watchers[0]`.
- No debouncing: 3 rapid saves → 3 full refreshes.
- `AUTO_REFRESH_MS = 3000` calls `loadWorkspacesSilent` every 3 s, which calls
  `packageDiscovery.clearCache()` → `detectWorkspaces(true)` →
  `validateWorkspace` → `detectDuplicates` → `JSON.stringify` deep comparison
  — expensive recurring work on the extension host.
- `loadWorkspacesSilent` re-validates workspaces that `detectWorkspaces`
  already validated → double validation.

### Fix
- Store the full `watchers[]` on the instance and dispose all of them.
- Debounce file-watcher events (e.g. 300 ms trailing).
- Replace 3 s polling with FS-event-driven refresh; keep polling as a fallback
  only.
- Skip re-validation in `loadWorkspacesSilent` when `detectWorkspaces` already
  returned validated workspaces.

---

## 10. Bug: `package-discovery.findLaunchFiles` ignores `.launch.xml`

- **Severity**: High
- **Category**: Correctness, Docs mismatch
- **Files**: `src/core/package-discovery.ts:851`

### Evidence
`findLaunchFiles` only matches `.py` launch files, but README §"Launch File
Support" claims "Automatic detection of `.launch.py` and `.launch.xml` files".

### Fix
Extend the matcher to include `.launch.xml` (and consider `.launch.yaml`).

---

## 11. Bug: `live-tree-provider.SYSTEM_TOPICS` mismatch with README

- **Severity**: Low
- **Category**: Docs mismatch
- **Files**: `src/treeview/live-tree-provider.ts:27`, README

### Evidence
Code: `['/parameter_events', '/rosout']`. README: `/parameter_events`,
`/clock`.

### Fix
Align the list (add `/clock`, keep `/rosout`) and make it configurable.

---

## 12. Bug: `launch-wizard` "Run now" button is a no-op stub

- **Severity**: Medium
- **Category**: Correctness, Incomplete feature
- **Files**: `src/wizard/launch-wizard.ts:598-601`

### Evidence
After generating a launch file, the "Run now" button only shows an info message
telling the user to use another command.

### Fix
Invoke the existing `ramros.runLaunchFile` command with the generated file, or
remove the button until implemented.

---

## 13. Bug: hardcoded test author values shipped to production

- **Severity**: Medium
- **Category**: Correctness
- **Files**: `src/extension.ts:302-303`

### Evidence
Interactive `createPackage` path sets `authorName = 'ramros'` and
`authorEmail = 'ramros@test.com'` instead of prompting the user.

### Fix
Add `showInputBox` prompts for author name/email (with sensible defaults from
git config if available).

---

## 14. Fragile regex-based file patching (duplicated)

- **Severity**: High
- **Category**: Maintainability, Correctness
- **Files**: `src/wizard/package-creator.ts`, `src/wizard/launch-wizard.ts:443-527`, `src/core/package-discovery.ts` (`extractXmlTag` etc.), `src/core/duplicate-package-detector.ts`

### Evidence
- `package-creator` and `launch-wizard` both do regex/substring surgery on
  `CMakeLists.txt`, `setup.py`, and `package.xml`.
- `setup.py` edits assume exact `zip_safe=True,` anchor → can corrupt user
  files.
- No backup / rollback on partial failure.
- `extractXmlTag` uses `[^<]*` → breaks on nested tags, CDATA, comments.
- Two divergent value-coercion helpers: `parseParameterValue` (launch-wizard),
  `formatParameterValue` (launch-generator), `inferParamType`
  (package-discovery).

### Fix
- Introduce a `BuildFilePatcher` abstraction:
  - `package.xml` via a real XML parser (`fast-xml-parser` or `xmlbuilder2`).
  - `CMakeLists.txt` / `setup.py` via structured edits (anchor + insert/replace
    with idempotency checks).
- Add backup + transactional rollback on partial failure.
- Unify the three value-coercion helpers into one `coerceParameterValue`.

---

## 15. Blocking I/O on the UI thread

- **Severity**: High
- **Category**: Performance, Layering
- **Files**: `src/core/package-discovery.ts`, `src/treeview/live-tree-provider.ts`, `src/treeview/tree-items.ts`, `src/wizard/package-creator.ts`, `src/wizard/launch-generator.ts`

### Evidence
- `execSync` / `fs.*Sync` scattered through the above files.
- `live-tree-provider` runs `ros2 topic list` + N× `ros2 topic info` + N×
  `ros2 node info` synchronously every 1–60 s — stalls the extension host on a
  busy ROS graph.
- `discoverInstalledPackages` spawns N×2 subprocesses (`ros2 pkg prefix` +
  `file`) per package, blocking the host.
- `package-creator` uses `execSync` inside `async` methods (misleading async
  signature).
- `ros-environment` uses `fs.readdirSync` / `existsSync` / `readFileSync`
  inside `async` methods.

### Fix
- Introduce a thin async `Ros2Cli` wrapper (`child_process.exec` /
  `execFile` with promises).
- Migrate `live-tree-provider`, `discoverInstalledPackages`, and tree-item
  `getChildren` to async calls.
- Switch `fs.*Sync` calls to `fs/promises`.

---

## 16. Divergent validation rules

- **Severity**: Medium
- **Category**: Consistency
- **Files**: `src/wizard/package-form-validator.ts`, `src/extension.ts` (inline node-name validator)

### Evidence
- `validatePackageName`: min length 3, allows hyphens, reserved-names list
  (includes `'launch'` but not `'msg'`, `'srv'`).
- `extension.ts` inline node-name validator: `/^[a-z][a-z0-9_]*$/` (no hyphen,
  no length) — a different rule set.

### Fix
Centralize all name validation in `PackageFormValidator` (add `validateNodeName`,
`validateInterfaceName`, `validateFieldName`), and have `extension.ts` call
those. Extend reserved names list.

---

## 17. Naming collision: two `PackageInfo` interfaces

- **Severity**: Medium
- **Category**: Consistency
- **Files**: `src/core/package-discovery.ts`, `src/core/duplicate-package-detector.ts`

### Evidence
`package-discovery.PackageInfo` is rich (nodes, interfaces, launchFiles, …);
`duplicate-package-detector.PackageInfo` is minimal
(`{name, packagePath, workspaceId}`). Consumers must disambiguate.

### Fix
Rename the minimal one to `PackageRef` or `PackageLocation`, or reuse the rich
interface.

---

## 18. German strings in an English codebase

- **Severity**: Low
- **Category**: Consistency, i18n
- **Files**: `src/core/duplicate-package-detector.ts:125,136`

### Evidence
`existiert bereits`, `Dies kann zu Konflikten führen`.

### Fix
Translate to English. Consider an i18n bundle if multi-language support is
intended.

---

## 19. Production code depends on `test-fixtures/`

- **Severity**: Medium
- **Category**: Architecture
- **Files**: `src/wizard/package-creator.ts` (template discovery)

### Evidence
Template discovery tries `extensionPath/test-fixtures/packages`, then
`cwd/test-fixtures/packages`, then `__dirname/../../test-fixtures/packages`.
Production code should not depend on a test fixtures directory.

### Fix
Move templates to `resources/templates/packages/` (or `templates/`) and update
the discovery paths.

---

## 20. Dead code / vestigial parameters

- **Severity**: Low
- **Category**: Dead Code
- **Files**: multiple

### Evidence
- `src/core/workspace-detector.ts:138` — `private async hasPackageXml()` never
  called.
- `src/wizard/package-creator.ts:528` — `renameNodeFiles` private, never called.
- `src/wizard/launch-wizard.ts:423` — `ensureLaunchFileRegistration(_fileName)`
  unused param (`eslint-disable no-unused-vars`).
- `src/wizard/launch-generator.ts` — `validate` shells out to
  `ros2 launch --check` but the result is never used by `launch-wizard`.
- `src/core/package-discovery.ts:97` — dynamic `await import('child_process')`
  despite already importing `execSync` at the top (line 3).

### Fix
Delete the dead methods/params, or wire them in. Use the `validate` result in
`launch-wizard.generateAndSave` to warn the user before writing.

---

## 21. `TerminalManager` API smell

- **Severity**: Low
- **Category**: Maintainability
- **Files**: `src/executor/terminal-manager.ts`

### Evidence
- `buildWorkspace` accepts `BuildOptions | string` (overloaded param type); the
  string branch is silently treated as a package name with no symlink/clean.
- `rm -rf ${workspaceRoot}/build ...` (line 105) — unquoted glob expansion risk
  if path has spaces.
- `return this.terminals.get(workspace.id)!` (line 124) — non-null assertion
  that could be wrong if the map was mutated.

### Fix
Split into `buildWorkspace(workspace, options: BuildOptions)` and
`buildPackage(workspace, packageName, options?)`. Quote all path interpolations.
Replace `!` with a guarded throw.

---

## 22. `eslint-disable` suppressions

- **Severity**: Low
- **Category**: Maintainability
- **Files**: `src/wizard/launch-generator.ts:16,160`, `src/wizard/launch-wizard.ts:17,247,293,423`, `src/test/e2e/index.ts:9`

### Evidence
7 `eslint-disable` comments, mostly `@typescript-eslint/no-explicit-any` and
one `no-unused-vars`. `launch-wizard` declares
`type PackageDiscoveryServiceType = any` despite the real type existing.

### Fix
Replace `any` with the real `PackageDiscoveryService` type. Remove the unused
param. Keep `any` only where genuinely unavoidable and document why.

---

## 23. README under-documents the file inventory

- **Severity**: Low
- **Category**: Docs
- **Files**: README.md §"Architecture"

### Evidence
README lists: `ros-environment`, `workspace-detector`,
`duplicate-package-detector`, `cache-manager`, `terminal-manager`,
`launch-wizard`, `launch-generator`, `tools-tree-provider`, `live-tree-provider`,
`tree-items`, `extension.ts`.

Missing: `package-discovery.ts` (864 LOC, central engine), `node-analyzer.ts`
(186 LOC, orphaned), `package-creator.ts` (926 LOC), `package-form-validator.ts`
(126 LOC), `tree-provider.ts` (175 LOC, the main `RamrosTreeProvider`).

### Fix
Update the architecture tree in README to match the actual file inventory, and
reconcile the "Smart Caching" claim with item 1.

---

## 24. Testability gaps

- **Severity**: Medium
- **Category**: Testability
- **Files**: `src/__tests__/`

### Evidence
Well-tested (integration): `ros-environment` (unit), `package-discovery`,
`duplicate-package-detector`, `workspace-detector`, `cache-manager`,
`terminal-manager`, `package-creator`, `package-form-validator`.

**No direct tests for**: `node-analyzer`, `launch-generator`, `launch-wizard`,
`tree-items`, `tools-tree-provider`, `live-tree-provider`, `tree-provider`,
`extension.ts`.

### Fix
After items 3–5 (extracting wizards, `BagSessionService`, `Ros2CliService`), add
unit tests for the extracted services and the generators. The extracted
`Ros2CliService` is the key seam that makes `live-tree-provider` and
`tree-items` testable without a ROS2 install.

---

## Recommended Execution Order

### Phase A — Quick correctness wins (high ROI, low risk)
1. Item 5  — `launch-generator` duplicate `parameters` key
2. Item 6  — `launch-generator` trailing-comma corruption
3. Item 7  — hardcoded `/opt/ros/humble` → `RosEnvironmentService`
4. Item 8  — duplicate-detector cold-cache false negative
5. Item 10 — `.launch.xml` support in `findLaunchFiles`
6. Item 11 — `SYSTEM_TOPICS` alignment
7. Item 12 — wire or remove "Run now" button
8. Item 13 — prompt for author name/email

### Phase B — Dead code & duplication removal
9. Item 1  — wire or delete `CacheManager` (+ fix LRU)
10. Item 2 — delete or re-wire `node-analyzer`
11. Item 20 — remove dead methods/params

### Phase C — God-module splits & layering
12. Item 3 — split `extension.ts` (extract wizards, `BagSessionService`)
13. Item 4 — split `tree-items.ts`, extract `Ros2CliService`
14. Item 14 — introduce `BuildFilePatcher` abstraction
15. Item 15 — migrate to async `Ros2Cli` + `fs/promises`

### Phase D — Robustness & consistency
16. Item 9  — fix `tree-provider` watcher leak + debouncing
17. Item 16 — centralize validation rules
18. Item 17 — rename conflicting `PackageInfo`
19. Item 18 — translate German strings
20. Item 19 — move templates out of `test-fixtures/`
21. Item 21 — clean up `TerminalManager` API
22. Item 22 — remove `eslint-disable` suppressions

### Phase E — Docs & tests
23. Item 23 — update README architecture section
24. Item 24 — add unit tests for extracted services & generators

---

## Summary Verdict

The codebase is **functionally coherent and reasonably layered** at the
directory level: no circular dependencies, several clean well-tested leaf
modules (`ros-environment`, `package-form-validator`, `cache-manager`,
`terminal-manager`), and good tooling discipline (strict TS, eslint, husky,
jest unit/integration/e2e). However, it carries:

- **Two phantom abstractions** (`CacheManager` unwired, `node-analyzer`
  orphaned) with duplicated logic in `package-discovery`.
- **Two god modules** (`extension.ts` 1400 LOC, `tree-items.ts` 1503 LOC) with
  leaked subprocess calls and global singleton state.
- **Fragile regex-based XML/CMake/Python patching** duplicated across
  `package-creator` and `launch-wizard`.
- A **hardcoded Humble path** breaking multi-distro support.
- A cluster of **latent correctness bugs** in `launch-generator`, the duplicate
  detector's cold-cache path, and `tree-provider`'s watcher disposal.
- A README that **overstates** the caching architecture and **under-documents**
  the file inventory.

Net: solid foundation for an internal/hobby tool, but not production-grade.
Phase A delivers immediate correctness fixes; Phases B–C are the strategic
refactors needed to make it maintainable and testable.
