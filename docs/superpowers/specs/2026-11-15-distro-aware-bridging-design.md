# Design: Distro-aware topic/service/action bridging

Date: 2026-11-15
Status: approved (builder check incorporated)
Branch: release-1.4.0

## Intent and why

The Live View command "Bridge topic" currently always uses `domain_bridge`,
regardless of distribution, and only supports topics. Two gaps:

1. On **Jazzy and newer** the strategic bridging path is **Zenoh**; the user
   wants RAMROS to use it there. `domain_bridge` remains the tool for older
   distributions (Humble, Iron) — for **topics**.
2. **Services and actions** must be bridgeable too — and their feasibility
   depends on the **DDS implementation** in use: `zenoh-bridge-ros2dds`
   supports services/actions **only with CycloneDDS** (upstream issue
   zenoh-plugin-ros2dds#492). **`domain_bridge` cannot bridge services or
   actions from a YAML config at all** (its parser only understands
   `topics:`; service bridging exists only as a compile-time C++ template
   API, actions have no API at all — upstream issues #10/#11/#54, PR #82
   unmerged as of 2026-11). Service/action bridging with installable tools
   is therefore **only** possible via `zenoh-bridge-ros2dds` with
   CycloneDDS.

Whenever the selected tool is missing or the request cannot be served
(zenoh-native RMW, Fast-DDS service/action limitation), RAMROS must show a
**distro- and case-specific install/guide document** instead of failing
silently or opening a dead terminal.

## Goals

- One user-facing command set ("Bridge …" on topics, services, actions) that
  picks the right mechanism per (distro × entity type × detected RMW).
- Zenoh bridging on Jazzy, Lyrical, Rolling (and Kilted) via two
  `zenoh-bridge-ros2dds` instances in one terminal (domain X ⇄ zenoh ⇄
  domain Y), restricted to the single selected entity, **bidirectional**.
- `domain_bridge` for Humble and Iron **topics** (unchanged behavior).
- Honest guides for every non-bridgeable combination: Fast-DDS
  services/actions (any distro) and zenoh-native RMW setups. Guides present
  the two escapes: switch RMW to CycloneDDS (exact export lines) or build
  the unreleased domain_bridge PR #82 (advanced).
- Actions are reachable from the **Live Tree** (new per-node "Actions"
  folder, like the existing Services folder).
- Readonly-doc guide (`ramros-doc`) for every failure/install case, written
  for the concrete distro and case.

## Non-goals

- No automatic package installation (no `sudo` from the extension).
- No multi-entity bridging (one entity per bridge invocation, as today).
- No Windows support (project-wide non-goal).
- No zenoh↔zenoh bridging (zenoh-native RMW setups get the guide, not a
  bridge).
- No source-built custom domain_bridge executables from RAMROS.

## Anti-goals (failure modes to avoid)

- A bridge terminal that starts and silently bridges nothing.
- Bridging *all* traffic when the user picked one topic (zenoh bridges
  everything by default — must be restricted via allow lists).
- Service/action bridging attempts that "look" started but cannot work
  (this is what a `services:`/`actions:` YAML section would produce —
  domain_bridge silently ignores it).

## Constraints

- Project rules: TDD where practical; unit tests never import `vscode`;
  conventional commits; gates `lint`, `typecheck`, `test:unit`,
  `test:integration` green.
- The command must remain a single flow: pick entity → pick from/to domain →
  start (or guide).
- Message type resolution stays required for the `domain_bridge` path and is
  optional for the zenoh path (the bridge introspects types itself).

## Facts the design relies on (researched 2026-11-15, builder-check verified)

| Tool | Topics | Services | Actions | RMW requirement |
|---|---|---|---|---|
| `domain_bridge` (YAML config, any released version) | ✅ | ❌ (silently ignored in YAML) | ❌ (no API) | any (rcl-level, two contexts) |
| `zenoh-bridge-ros2dds` + CycloneDDS | ✅ | ✅ | ✅ | CycloneDDS on the bridged endpoints |
| `zenoh-bridge-ros2dds` + Fast DDS | ✅ | ❌ (DDS-RPC incompatibilities) | ❌ | — |

- Default RMW by distro (when `RMW_IMPLEMENTATION` is unset): **Fast DDS on
  Humble, Iron, Jazzy, Kilted, Lyrical, and Rolling** (Kilted corrected
  during builder check: its default is Fast DDS too; Zenoh is Tier 1 there
  but not default). If Fast DDS is not installed, the alphabetically first
  installed RMW identifier applies (usually CycloneDDS).
- `zenoh-bridge-ros2dds` is **not** a ROS package: standalone binary from the
  Eclipse Zenoh apt repo, snap (`sudo snap install zenoh-bridge-ros2dds`),
  or GitHub release download.
- `domain_bridge` install: `sudo apt install ros-<distro>-domain-bridge`.
- `domain_bridge`'s YAML parser **requires** `from_domain` (per-entity or
  top-level default). Omitting it produces a config error — the current
  `buildDomainBridgeConfigYaml` (no `from_domain` when "Current environment"
  is picked) is affected; this fix is in scope.
- One `zenoh-bridge-ros2dds` instance bridges exactly one DDS domain to the
  zenoh network. Domain X → domain Y therefore needs two instances peering
  with each other over zenoh (instance A `listen` on a free local TCP port,
  instance B `connect` to it).

## Approaches considered

Entity scope: A1 topics-only (status quo, rejected — user asked for full
coverage) · A2 topics+services (rejected — incomplete) · **A3 all three
entity types (chosen)**.

Action entry point: **F1 per-node "Actions" folder in the Live Tree
(chosen; mirrors the existing "Services" folder)** · F2 menu on package-tree
action items (rejected — actions belong to the live view) · F3 command
palette free-input (rejected — not discoverable).

Zenoh topology: **B1 two bridge instances in one terminal, peering over
zenoh (chosen)** · B2 external `zenohd` router (rejected — extra
infrastructure for a simple domain hop).

RMW handling on Jazzy+: **C1 per-entity decision (chosen)**, explicitly
**including Lyrical (user decision)**. C2 ask the user every time
(rejected — annoying), C3 always domain_bridge on Jazzy (rejected —
ignores the zenoh requirement and, as it turns out, would silently not
bridge services/actions at all).

RMW detection: **D1 probe `RMW_IMPLEMENTATION` inside the real sourcing
chain (distro `setup.bash` + workspace overlay, then `printenv
RMW_IMPLEMENTATION`) via the existing exec seam; when unset fall back to
the distro-default table and state the assumption in the guide (chosen)** ·
D2 `ros2 doctor --report` parsing (rejected — slow, brittle). Plain
`process.env` is not enough: the VS Code host does not source setup.bash,
which is exactly where users set `RMW_IMPLEMENTATION`.

Failure UX: **E1 readonly-doc guide via existing `RamrosDocProvider`
(chosen)** — per case: zenoh install (apt repo primary, snap and GitHub as
alternatives), `domain_bridge` install, Fast-DDS services/actions
explanation (RMW-switch + PR-#82 escapes), zenoh-native explanation.

## Decided behavior (the how, as decided)

### Policy matrix (function of distro, entity type, detected RMW)

| Setup | Topics | Services | Actions |
|---|---|---|---|
| Humble/Iron + Fast DDS (default) | domain_bridge | guide (not possible) | guide (not possible) |
| Humble/Iron + CycloneDDS | domain_bridge | zenoh | zenoh |
| Jazzy/Lyrical/Rolling/Kilted + CycloneDDS | zenoh | zenoh | zenoh |
| Jazzy/Lyrical/Rolling/Kilted + Fast DDS | zenoh | guide (not possible) | guide (not possible) |
| Jazzy+ + rmw_zenoh_cpp | guide (not possible) | guide (not possible) | guide (not possible) |

Unknown RMW → treat as `domain_bridge`-capable for topics (rcl-level tool is
RMW-agnostic) and apply the Fast-DDS service/action row (guide), stating the
assumption in the guide.

### Flow

1. Resolve entity (name; type required for domain_bridge, optional for
   zenoh) from the tree item or QuickPick as today.
2. Detect distro + RMW (D1, sourcing-chain probe); compute strategy via
   policy. If strategy = guide → open the readonly doc for the concrete
   case; done.
3. Tool preflight:
   - domain_bridge path: `ros2 pkg prefix domain_bridge` (as today);
     missing → domain_bridge install guide.
   - zenoh path: `zenoh-bridge-ros2dds` binary on PATH; missing → zenoh
     install guide.
4. Pick from/to domain (existing QuickPicks, incl. manual entry). For the
   domain_bridge path, resolve "Current environment" to the **effective
   `ROS_DOMAIN_ID`** (exec-seam probe) and write it explicitly — the parser
   rejects a missing `from_domain`.
5. Start:
   - domain_bridge: temp YAML, one terminal (as today).
   - zenoh: write two JSON5 temp configs (allow-list with the single
     entity on both sides; A `ros2dds.domain: <from>`, `listen
     tcp/127.0.0.1:<free port>`; B `ros2dds.domain: <to>`, `connect` to A),
     start both in one terminal with `trap 'kill 0'` so Ctrl+C stops both;
     terminal title `Bridge: <entity>`. Completion message states that the
     bridge is **bidirectional** (zenoh semantics) while domain_bridge
     remains one-way.

### New/changed modules

- `src/core/zenoh-bridge.ts` (new, pure): builds the two JSON5 configs;
  picks a free local TCP port for the zenoh peer link.
- `src/core/bridge-policy.ts` (new, pure): (distro, rmw, entityType) →
  `zenoh | domainBridge | guide`; guide variants encode the concrete case.
- `src/core/bridge-install-docs.ts` (new, pure): markdown guides per case
  (zenoh install, domain_bridge install, fast-dds services/actions with
  RMW-switch + PR-#82 escapes, zenoh-native).
- `src/core/domain-bridge.ts`: `fromDomain` becomes required (fixes the
  existing "Current environment" config bug).
- `src/core/rmw-detector.ts` (new): sourcing-chain probe of
  `RMW_IMPLEMENTATION` with distro-default fallback.
- `src/extension.ts`: rewire `ramros.live.bridgeTopic` through the policy;
  add `ramros.live.bridgeService` and `ramros.live.bridgeAction` commands
  (or one parameterized command — builder's call, keep menu bindings in
  sync).
- `src/treeview/live-items.ts`: per-node `NodeActionsItem` folder +
  `LiveActionItem` (contextValue `liveAction`), mirroring the Services
  folder; data via `ros2 action list -t` through `Ros2CliService`.
- `package.json`: menu bindings for `liveService` and `liveAction` items.

### Left to the builder

- Exact CLI invocation shapes (`ros2 action list -t` output parsing), free
  port selection implementation, terminal command composition details
  (`trap`), JSON5 temp-file handling, allow-list regex shapes, test
  scaffolding, and the final wording of the guide documents.

## Success check

- On Humble/Iron nothing changes for topics; the "Current environment"
  from-domain option now produces a valid config (explicit from_domain).
- On Jazzy (CycloneDDS) a topic/service/action bridge starts two zenoh
  bridge processes and only the selected entity crosses domains,
  bidirectionally.
- On Jazzy (Fast DDS) picking a service/action opens the guide explaining
  the limitation and the RMW-switch/PR-#82 escapes — no fake bridge.
- On any missing tool the user sees a guide that matches their distro and
  case, inside VS Code.
- All gates green; new unit tests cover the four pure modules and the
  policy matrix.
