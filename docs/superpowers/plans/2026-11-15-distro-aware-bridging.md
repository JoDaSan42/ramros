# Distro-aware Bridging Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bridge topics, services, and actions across ROS domains using Zenoh on Jazzy+, `domain_bridge` on older distros (topics only), and case-specific install guides wherever a bridge cannot work.

**Architecture:** One command flow (`ramros.live.bridgeTopic|bridgeService|bridgeAction`) resolves distro + RMW via a sourcing-chain probe, picks a strategy from a pure policy module, runs a tool preflight, and either starts the bridge (domain_bridge YAML / two zenoh-bridge-ros2dds JSON5 configs in one terminal) or opens a readonly markdown guide via the existing `RamrosDocProvider`.

**Tech Stack:** TypeScript (strict), VS Code extension API, jest unit tests (no `vscode` import), integration tests with mocked vscode.

**Spec:** `docs/superpowers/specs/2026-11-15-distro-aware-bridging-design.md`

## Global Constraints

- Unit tests never import `vscode`; integration tests use the existing vscode mock pattern.
- User-facing strings and comments in English.
- Gates after each task: `npm run lint`, `npm run typecheck`, `npm run test:unit`, `npm run test:integration`.
- Conventional commits.
- Windows is a non-goal; terminal/exec code may assume bash (`/bin/bash`).
- One entity per bridge invocation; no `sudo` from the extension.

## Review Focus

- Zenoh allow-list name syntax is `./<name>` (no leading slash, `./` prefix); a wrong regex silently bridges everything or nothing. → Task 3 asserts exact `./chatter` entries in both configs.
- `domain_bridge` requires `from_domain`; "Current environment" must resolve to the effective `ROS_DOMAIN_ID` (default `0`) before building the YAML. → Task 2 parses `DOMAIN=` with `0` fallback; Task 5 pins the always-written `from_domain`.
- Unknown or future distro names (e.g. `kilted`, anything newer) must route topics to zenoh, not crash or fall back wrongly. → Task 1 tests an unknown distro.
- RMW probe when `setup.bash` is missing or probe fails must fall back to the distro-default RMW table, not throw. → Task 2 tests a failing probe.
- Action items with missing type render an empty description (like `LiveServiceItem`), never `undefined`. → Task 6 asserts `description === ''`.

---

### Task 1: Bridge policy (pure)

**Files:**
- Create: `src/core/bridge-policy.ts`
- Test: `src/__tests__/unit/bridge-policy.test.ts`

**Interfaces:**
- Produces (used by Tasks 6/7):
  ```ts
  export type BridgeEntityKind = 'topic' | 'service' | 'action';
  export type BridgeStrategy =
    | { kind: 'zenoh' }
    | { kind: 'domainBridge' }
    | { kind: 'guide'; reason: 'rmw-zenoh-native' | 'fast-dds-services-actions' };
  export function resolveBridgeStrategy(input: { distro: string; rmw: string; entityKind: BridgeEntityKind }): BridgeStrategy;
  ```

- [ ] **Step 1: Write the failing test** — one `it` per matrix row:

```ts
import { resolveBridgeStrategy } from '../../core/bridge-policy';

describe('bridge policy', () => {
  it('routes topics to domain_bridge on humble/iron regardless of RMW', () => {
    expect(resolveBridgeStrategy({ distro: 'humble', rmw: 'rmw_fastrtps_cpp', entityKind: 'topic' })).toEqual({ kind: 'domainBridge' });
    expect(resolveBridgeStrategy({ distro: 'iron', rmw: 'rmw_cyclonedds_cpp', entityKind: 'topic' })).toEqual({ kind: 'domainBridge' });
  });
  it('routes topics to zenoh on jazzy and newer, including unknown distros', () => {
    expect(resolveBridgeStrategy({ distro: 'jazzy', rmw: 'rmw_fastrtps_cpp', entityKind: 'topic' })).toEqual({ kind: 'zenoh' });
    expect(resolveBridgeStrategy({ distro: 'lyrical', rmw: 'rmw_cyclonedds_cpp', entityKind: 'topic' })).toEqual({ kind: 'zenoh' });
    expect(resolveBridgeStrategy({ distro: 'kilted', rmw: 'rmw_fastrtps_cpp', entityKind: 'topic' })).toEqual({ kind: 'zenoh' });
    expect(resolveBridgeStrategy({ distro: 'somewhere-new', rmw: 'rmw_fastrtps_cpp', entityKind: 'topic' })).toEqual({ kind: 'zenoh' });
  });
  it('routes services/actions to zenoh only under cyclonedds', () => {
    expect(resolveBridgeStrategy({ distro: 'jazzy', rmw: 'rmw_cyclonedds_cpp', entityKind: 'service' })).toEqual({ kind: 'zenoh' });
    expect(resolveBridgeStrategy({ distro: 'humble', rmw: 'rmw_cyclonedds_cpp', entityKind: 'action' })).toEqual({ kind: 'zenoh' });
  });
  it('routes fast-dds services/actions to the guide (any distro)', () => {
    const expected = { kind: 'guide', reason: 'fast-dds-services-actions' };
    expect(resolveBridgeStrategy({ distro: 'jazzy', rmw: 'rmw_fastrtps_cpp', entityKind: 'service' })).toEqual(expected);
    expect(resolveBridgeStrategy({ distro: 'humble', rmw: 'rmw_fastrtps_cpp', entityKind: 'action' })).toEqual(expected);
  });
  it('routes unknown-RMW services/actions to the guide', () => {
    expect(resolveBridgeStrategy({ distro: 'jazzy', rmw: 'rmw_connextdds', entityKind: 'service' })).toEqual({ kind: 'guide', reason: 'fast-dds-services-actions' });
  });
  it('routes zenoh-native RMW to the guide for every entity kind', () => {
    const expected = { kind: 'guide', reason: 'rmw-zenoh-native' };
    for (const entityKind of ['topic', 'service', 'action'] as const) {
      expect(resolveBridgeStrategy({ distro: 'jazzy', rmw: 'rmw_zenoh_cpp', entityKind })).toEqual(expected);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails** — `npx jest src/__tests__/unit/bridge-policy.test.ts` → FAIL (module not found)
- [ ] **Step 3: Implement** `resolveBridgeStrategy` in `src/core/bridge-policy.ts`. Rules, first match wins: (1) `rmw === 'rmw_zenoh_cpp'` → guide `rmw-zenoh-native`; (2) `entityKind !== 'topic'` and `rmw !== 'rmw_cyclonedds_cpp'` → guide `fast-dds-services-actions`; (3) `entityKind === 'topic'` and distro in `['humble', 'iron', 'foxy', 'galactic']` → `domainBridge`; (4) otherwise → `zenoh`. Doc comment states that unknown distros are treated as Jazzy+ (zenoh) for topics.
- [ ] **Step 4: Run test to verify it passes** — `npx jest src/__tests__/unit/bridge-policy.test.ts` → PASS
- [ ] **Step 5: Gates + commit**

```bash
npm run lint && npm run typecheck && npm run test:unit
git add src/core/bridge-policy.ts src/__tests__/unit/bridge-policy.test.ts
git commit -m "feat: add distro-aware bridge policy module"
```

---

### Task 2: RMW/domain environment probe

**Files:**
- Create: `src/core/ros-env-probe.ts`
- Test: `src/__tests__/unit/ros-env-probe.test.ts`

**Interfaces:**
- Consumes: nothing (probe injected — keeps the module pure and vscode-free).
- Produces (used by Task 7):
  ```ts
  export interface RosEnvProbeResult { rmw: string; domainId: number; }
  /** Sources the distro setup.bash (and optional workspace overlay), then
   *  prints RMW_IMPLEMENTATION and ROS_DOMAIN_ID from the resulting env. */
  export async function probeRosEnv(
    probe: (command: string) => Promise<{ output: string; ok: boolean }>,
    options: { distro: string; workspaceInstallPath?: string }
  ): Promise<RosEnvProbeResult>;
  export function parseRosEnvProbeOutput(output: string): RosEnvProbeResult;
  export function defaultRmwForDistro(distro: string): string; // always 'rmw_fastrtps_cpp' today
  ```

- [ ] **Step 1: Write the failing test**

```ts
import { parseRosEnvProbeOutput, defaultRmwForDistro } from '../../core/ros-env-probe';

describe('ros env probe', () => {
  it('parses RMW and domain lines', () => {
    const r = parseRosEnvProbeOutput('RMW=rmw_zenoh_cpp\nDOMAIN=2\n');
    expect(r).toEqual({ rmw: 'rmw_zenoh_cpp', domainId: 2 });
  });
  it('falls back to distro default RMW and domain 0 when unset', () => {
    const r = parseRosEnvProbeOutput('RMW=\nDOMAIN=0\n');
    expect(r).toEqual({ rmw: 'rmw_fastrtps_cpp', domainId: 0 });
  });
  it('normalizes case and whitespace', () => {
    expect(parseRosEnvProbeOutput('RMW= RMW_CYCLONEDDS_CPP \nDOMAIN=1\n').rmw).toBe('rmw_cyclonedds_cpp');
  });
  it('defaultRmwForDistro returns Fast DDS for all known distros', () => {
    for (const d of ['humble', 'iron', 'jazzy', 'kilted', 'lyrical', 'rolling']) {
      expect(defaultRmwForDistro(d)).toBe('rmw_fastrtps_cpp');
    }
  });
});
```

Additionally one async test for `probeRosEnv` with a fake probe asserting (a) the generated command contains `source /opt/ros/jazzy/setup.bash` and `[ -f /home/ws/install/setup.bash ] && source`, (b) a rejected probe (ok:false) still yields defaults (`rmw: 'rmw_fastrtps_cpp'`, `domainId: 0`) instead of throwing.

- [ ] **Step 2: Run test to verify it fails** — `npx jest src/__tests__/unit/ros-env-probe.test.ts` → FAIL
- [ ] **Step 3: Implement** in `src/core/ros-env-probe.ts`. Probe command shape (single line, `/bin/bash` via the CLI service's exec — the probe callback is `Ros2CliService.executeRaw` in Task 7):
  ```bash
  [ -f /opt/ros/<distro>/setup.bash ] && source /opt/ros/<distro>/setup.bash; [ -f <installPath>/setup.bash ] && source <installPath>/setup.bash; echo "RMW=${RMW_IMPLEMENTATION:-}"; echo "DOMAIN=${ROS_DOMAIN_ID:-0}"
  ```
  Parse `RMW=`/`DOMAIN=` lines (last occurrence wins), lowercase-trim rmw, integer-parse domain, apply `defaultRmwForDistro` when empty or probe failed. `defaultRmwForDistro` returns `'rmw_fastrtps_cpp'` for every input (doc comment: Kilted's default is also Fast DDS; change here if upstream ever flips).
- [ ] **Step 4: Run test to verify it passes** — PASS
- [ ] **Step 5: Gates + commit**

```bash
npm run lint && npm run typecheck && npm run test:unit
git add src/core/ros-env-probe.ts src/__tests__/unit/ros-env-probe.test.ts
git commit -m "feat: add ROS environment probe for RMW and domain detection"
```

---

### Task 3: Zenoh bridge config builder

**Files:**
- Create: `src/core/zenoh-bridge.ts`
- Test: `src/__tests__/unit/zenoh-bridge.test.ts`

**Interfaces:**
- Produces (used by Task 7):
  ```ts
  export type ZenohEntityKind = 'topic' | 'service' | 'action';
  export function buildZenohBridgeConfigs(input: {
    entityKind: ZenohEntityKind;
    entityName: string;      // ROS name with leading slash, e.g. '/chatter'
    fromDomain: number;
    toDomain: number;
    peerPort: number;
  }): { configA: string; configB: string };
  export async function pickFreePort(): Promise<number>;
  ```

- [ ] **Step 1: Write the failing test** — assertions use string matching (JSON5 has no parser dependency):

```ts
import { buildZenohBridgeConfigs } from '../../core/zenoh-bridge';

describe('zenoh bridge config builder', () => {
  it('builds peer configs: A listens on the peer port with the from domain, B connects with the to domain', () => {
    const { configA, configB } = buildZenohBridgeConfigs({
      entityKind: 'topic', entityName: '/chatter', fromDomain: 1, toDomain: 2, peerPort: 17447
    });
    expect(configA).toContain('domain: 1');
    expect(configA).toContain('listen');
    expect(configA).toContain('tcp/127.0.0.1:17447');
    expect(configB).toContain('domain: 2');
    expect(configB).toContain('connect');
    expect(configB).toContain('tcp/127.0.0.1:17447');
  });
  it('allow-lists exactly the entity on both sides, zenoh ros2dds name syntax ./name', () => {
    const { configA, configB } = buildZenohBridgeConfigs({
      entityKind: 'topic', entityName: '/chatter', fromDomain: 0, toDomain: 1, peerPort: 17447
    });
    for (const cfg of [configA, configB]) {
      expect(cfg).toContain('publishers: ["./chatter"]');
      expect(cfg).toContain('subscribers: ["./chatter"]');
      expect(cfg).not.toContain('.*');
    }
  });
  it('maps service entities to service_servers/service_clients and actions to action_servers/action_clients', () => {
    const s = buildZenohBridgeConfigs({ entityKind: 'service', entityName: '/add', fromDomain: 0, toDomain: 1, peerPort: 17447 });
    expect(s.configA).toContain('service_servers: ["./add"]');
    expect(s.configA).toContain('service_clients: ["./add"]');
    const a = buildZenohBridgeConfigs({ entityKind: 'action', entityName: '/fib', fromDomain: 0, toDomain: 1, peerPort: 17447 });
    expect(a.configA).toContain('action_servers: ["./fib"]');
    expect(a.configA).toContain('action_clients: ["./fib"]');
  });
  it('pickFreePort returns a positive port', async () => {
    await expect(pickFreePort()).resolves.toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails** — FAIL
- [ ] **Step 3: Implement** in `src/core/zenoh-bridge.ts`. JSON5 shape (config A; B swaps `listen`→`connect` and the domain):
  ```json5
  {
    mode: "peer",
    listen: { endpoints: ["tcp/127.0.0.1:<peerPort>"] },
    plugins: {
      ros2dds: {
        domain: <fromDomain>,
        allow: {
          publishers: ["./<name>"], subscribers: ["./<name>"]
        }
      }
    }
  }
  ```
  Allow-list keys per kind: topic → `publishers`+`subscribers`, service → `service_servers`+`service_clients`, action → `action_servers`+`action_clients`. Name conversion: strip the leading `/`, prefix `./` (per zenoh-plugin-ros2dds config syntax; see Canonical turtlebot4 example `deny: { publishers: ["./_internal/."] }`). `pickFreePort` uses `node:net` `createServer().listen(0)` and resolves the assigned port; no `vscode` import.
- [ ] **Step 4: Run test to verify it passes** — PASS
- [ ] **Step 5: Gates + commit**

```bash
npm run lint && npm run typecheck && npm run test:unit
git add src/core/zenoh-bridge.ts src/__tests__/unit/zenoh-bridge.test.ts
git commit -m "feat: add zenoh-bridge-ros2dds config builder"
```

---

### Task 4: Install/guide documents

**Files:**
- Create: `src/core/bridge-install-docs.ts`
- Test: `src/__tests__/unit/bridge-install-docs.test.ts`

**Interfaces:**
- Produces (used by Task 7):
  ```ts
  export function zenohInstallGuide(distro: string): string;
  export function domainBridgeInstallGuide(distro: string): string;
  export function servicesActionsGuide(input: { distro: string; rmw: string; entityKind: string; entityName: string }): string;
  export function zenohNativeGuide(input: { entityKind: string; entityName: string }): string;
  ```

- [ ] **Step 1: Write the failing test** — each guide: starts with `# `, mentions the entity/distro interpolated, and contains its pinned commands:

```ts
import { zenohInstallGuide, domainBridgeInstallGuide, servicesActionsGuide, zenohNativeGuide } from '../../core/bridge-install-docs';

describe('bridge install guides', () => {
  it('zenoh guide lists apt repo, snap and github fallbacks', () => {
    const md = zenohInstallGuide('jazzy');
    expect(md).toContain('# Bridge tool not installed');
    expect(md).toContain('jazzy');
    expect(md).toContain('sudo apt install zenoh-bridge-ros2dds');
    expect(md).toContain('sudo snap install zenoh-bridge-ros2dds');
    expect(md).toContain('https://github.com/eclipse-zenoh/zenoh-plugin-ros2dds/releases');
  });
  it('domain_bridge guide names the distro package', () => {
    const md = domainBridgeInstallGuide('humble');
    expect(md).toContain('sudo apt install ros-humble-domain-bridge');
    expect(md).toContain('humble');
  });
  it('fast-dds services/actions guide explains the limitation and both escapes', () => {
    const md = servicesActionsGuide({ distro: 'jazzy', rmw: 'rmw_fastrtps_cpp', entityKind: 'service', entityName: '/add_two_ints' });
    expect(md).toContain('/add_two_ints');
    expect(md).toContain('Fast DDS');
    expect(md).toContain('export RMW_IMPLEMENTATION=rmw_cyclonedds_cpp');
    expect(md).toContain('https://github.com/ros2/domain_bridge/pull/82');
    expect(md).toContain('domain_bridge cannot bridge services or actions');
  });
  it('zenoh-native guide explains that no DDS domain exists to bridge', () => {
    const md = zenohNativeGuide({ entityKind: 'action', entityName: '/fib' });
    expect(md).toContain('rmw_zenoh_cpp');
    expect(md).toContain('/fib');
  });
});
```

- [ ] **Step 2: Run test to verify it fails** — FAIL
- [ ] **Step 3: Implement** the four markdown builders. Content requirements: zenoh guide — Eclipse Zenoh apt repo setup (keyring + `deb` line from zenoh.io/docs/getting-started/installation), `sudo apt install zenoh-bridge-ros2dds`, snap + GitHub-release alternatives, note that it is not a ROS package; domain_bridge guide — `sudo apt install ros-<distro>-domain-bridge`; services/actions guide — states the limitation (upstream zenoh-plugin-ros2dds#492: services/actions only with CycloneDDS; domain_bridge YAML ignores `services:`/`actions:`), escape 1 = switch RMW to CycloneDDS with exact export lines (`export RMW_IMPLEMENTATION=rmw_cyclonedds_cpp`) and restart-terminals caveat, escape 2 = build domain_bridge PR #82 from source (advanced, unreleased); zenoh-native guide — no DDS domain exists to bridge, rmw_zenoh has no domain bridge today. All English, markdown.
- [ ] **Step 4: Run test to verify it passes** — PASS
- [ ] **Step 5: Gates + commit**

```bash
npm run lint && npm run typecheck && npm run test:unit
git add src/core/bridge-install-docs.ts src/__tests__/unit/bridge-install-docs.test.ts
git commit -m "feat: add bridge install and limitation guide documents"
```

---

### Task 5: domain_bridge config requires from_domain

**Files:**
- Modify: `src/core/domain-bridge.ts:9-23`
- Test: `src/__tests__/unit/domain-bridge.test.ts`

**Interfaces:**
- Produces: `DomainBridgeConfig.fromDomain` becomes **required** (`fromDomain: number`). Callers: Task 7 always passes the resolved effective domain.

- [ ] **Step 1: Update the failing test** — replace the second test (`'omits from_domain…'`) with:

```ts
it('always writes from_domain (domain_bridge rejects a missing one)', () => {
  const yaml = buildDomainBridgeConfigYaml({
    topic: '/chatter',
    type: 'std_msgs/msg/String',
    fromDomain: 0,
    toDomain: 1
  });
  expect(yaml).toContain('from_domain: 0');
  expect(yaml).toContain('to_domain: 1');
});
```

- [ ] **Step 2: Run test to verify it fails** — `npx jest src/__tests__/unit/domain-bridge.test.ts` → FAIL (implementation omits `from_domain: 0` today? no — it writes it for `0` but the type still allows `undefined`; make the fail real by deleting the `fromDomain?` optionality: expect typecheck to catch callers) — run `npx jest src/__tests__/unit/domain-bridge.test.ts && npm run typecheck`, expected: test passes already, **typecheck fails** because `src/extension.ts` still passes `fromDomain: undefined`-typed values.
- [ ] **Step 3: Implement** — in `src/core/domain-bridge.ts` change `fromDomain?: number` to `fromDomain: number` and drop the `if (config.fromDomain !== undefined)` guard (always push `from_domain`).
- [ ] **Step 4: Verify** — `npx jest src/__tests__/unit/domain-bridge.test.ts` → PASS (typecheck still red; fixed in Task 7 — do not run full gates here; note this in the commit body).
- [ ] **Step 5: Commit**

```bash
git add src/core/domain-bridge.ts src/__tests__/unit/domain-bridge.test.ts
git commit -m "feat: require from_domain in domain_bridge config builder

domain_bridge's YAML parser rejects a missing from_domain; the
'current environment' resolution now happens in the command flow
(follow-up commit)."
```

---

### Task 6: Actions in the Live Tree (parse + items)

**Files:**
- Modify: `src/core/ros2-cli-service.ts:31-79` (`parseNodeInfoOutput`, `ParsedNodeInfoOutput`), and the `NodeInfo` interface (add `actionServers?: ServiceServerInfo[]`)
- Modify: `src/treeview/live-items.ts` (`LiveNodeItem.getChildren` area, after `NodeServicesItem`/`LiveServiceItem` classes)
- Test: `src/__tests__/unit/ros2-cli-parsers.test.ts` (add cases), `src/__tests__/integration/live-items.integration.test.ts` (add case)

**Interfaces:**
- Produces: `ParsedNodeInfoOutput.actionServers: ServiceServerInfo[]` (same shape as `serviceServers`); tree classes:
  ```ts
  export class NodeActionsItem extends TreeItemBase { /* label 'Actions (N)', contextValue 'nodeActions', icon 'action-script' */ }
  export class LiveActionItem extends TreeItemBase { /* contextValue 'liveAction', description = server.type ?? '' */ }
  ```

- [ ] **Step 1: Write the failing parser test** (in `ros2-cli-parsers.test.ts`, next to the existing `parseNodeInfoOutput` cases):

```ts
it('parses Action Servers sections with types', () => {
  const out = [
    '/talker',
    'Subscribers:',
    '    /chatter: std_msgs/msg/String',
    'Action Servers:',
    '    /fibonacci: example_interfaces/action/Fibonacci',
    'Action Clients:',
    ''
  ].join('\n');
  const r = parseNodeInfoOutput(out);
  expect(r.actionServers).toEqual([{ name: '/fibonacci', type: 'example_interfaces/action/Fibonacci' }]);
});
```

- [ ] **Step 2: Run test to verify it fails** — FAIL (`actionServers` undefined)
- [ ] **Step 3: Implement parser change** — in `parseNodeInfoOutput`, treat `Action Servers:` like `Service Servers:` (new section state `action-servers`, same `name: type` parsing), keep `Action Clients:` resetting to `none` (as today), initialize `actionServers: []` in the return value.
- [ ] **Step 4: Run test to verify it passes** — PASS
- [ ] **Step 5: Write the failing item test** (in `live-items.integration.test.ts`, following the existing `LiveServiceItem`/`NodeServicesItem` patterns there):

```ts
it('NodeActionsItem renders children as liveAction items with type description', () => {
  const folder = new NodeActionsItem([{ name: '/fibonacci', type: 'example_interfaces/action/Fibonacci' }, { name: '/notype' }]);
  expect(folder.contextValue).toBe('nodeActions');
  const kids = folder.getChildren() as LiveActionItem[];
  expect(kids).toHaveLength(2);
  expect(kids[0].contextValue).toBe('liveAction');
  expect(kids[0].description).toBe('example_interfaces/action/Fibonacci');
  expect(kids[1].description).toBe('');
});
```

- [ ] **Step 6: Run to verify FAIL, then implement** `NodeActionsItem`/`LiveActionItem` in `src/treeview/live-items.ts` mirroring `NodeServicesItem`/`LiveServiceItem` (icon `vscode.ThemeIcon('action-script')`, getter `getActionName(): string`), and in `LiveNodeItem.getChildren` push `new NodeActionsItem(...)` after the Services folder when the parsed node info has `actionServers.length > 0` (thread the parsed action servers through wherever `serviceServers` currently flows — same seam).
- [ ] **Step 7: Run tests + gates** — `npx jest src/__tests__/unit/ros2-cli-parsers.test.ts src/__tests__/integration/live-items.integration.test.ts && npm run lint && npm run typecheck && npm run test:unit && npm run test:integration` → PASS
- [ ] **Step 8: Commit**

```bash
git add src/core/ros2-cli-service.ts src/treeview/live-items.ts src/__tests__/unit/ros2-cli-parsers.test.ts src/__tests__/integration/live-items.integration.test.ts
git commit -m "feat: show per-node actions in the live tree"
```

---

### Task 7: Command wiring (policy, preflight, start, guides)

**Files:**
- Modify: `src/extension.ts` (command `ramros.live.bridgeTopic` ~line 1766; add `bridgeService`, `bridgeAction`; add shared flow)
- Modify: `package.json` (commands + menus)
- Test: `src/__tests__/integration/extension-commands.integration.test.ts` (extend)

**Interfaces:**
- Consumes: `resolveBridgeStrategy` (Task 1), `probeRosEnv` (Task 2), `buildZenohBridgeConfigs`/`pickFreePort` (Task 3), guide builders (Task 4), `buildDomainBridgeConfigYaml` with required `fromDomain` (Task 5), `LiveActionItem` contextValue `liveAction` (Task 6).
- Produces: private helper `runBridgeFlow(entityKind: BridgeEntityKind, entityName: string | undefined, messageType: string | undefined)` in `extension.ts`; registered commands `ramros.live.bridgeService`, `ramros.live.bridgeAction`.

- [ ] **Step 1: Write the failing registration test** (in `extension-commands.integration.test.ts`, following its existing command-listing pattern): assert the extension registers `ramros.live.bridgeTopic`, `ramros.live.bridgeService`, and `ramros.live.bridgeAction`.
- [ ] **Step 2: Run to verify FAIL** — `npx jest src/__tests__/integration/extension-commands.integration.test.ts` → FAIL
- [ ] **Step 3: Implement in `extension.ts`:**
  1. Extract the body of the existing `bridgeTopic` handler into `runBridgeFlow(entityKind, entityName, messageType)`:
     - resolve distro via `RosEnvironmentService` (`getActiveDistributionName()`) and workspace install path via `pickWorkspace()`;
     - probe: `probeRosEnv` takes a callback returning `{ output: string; ok: boolean }`; pass an adapter around `cli.executeRaw` (`async c => { const r = await cli.executeRaw(c, { timeout: 10000 }); return { output: r.output, ok: r.ok }; }`) plus `{ distro, workspaceInstallPath }` from the workspace picked via `pickWorkspace()` (reuse it for the terminal later; do not pick twice);
     - `const strategy = resolveBridgeStrategy({ distro, rmw: probe.rmw, entityKind })`; if `strategy.kind === 'guide'` → `await showInReadonlyDoc(ramrosDocProvider, \`bridge/${strategy.reason}\`, guideBuilder(...))` with the matching builder from Task 4 and `return`;
     - domain_bridge preflight (unchanged `ros2 pkg prefix domain_bridge` check) → on failure `showInReadonlyDoc(ramrosDocProvider, 'bridge/install-domain-bridge', domainBridgeInstallGuide(distro))` + `return`;
     - zenoh preflight: `cli.executeRaw('command -v zenoh-bridge-ros2dds', { timeout: 10000 })` → on failure `showInReadonlyDoc(ramrosDocProvider, 'bridge/install-zenoh', zenohInstallGuide(distro))` + `return`;
     - domain QuickPicks exactly as today; for domain_bridge, when the user picks "Current environment", use `probe.domainId` instead of `undefined`;
     - start:
       - domain_bridge: unchanged `executeInNewTerminal('ros2 run domain_bridge domain_bridge …', workspace, 'Bridge: <name>')` with the temp YAML;
       - zenoh: `const peerPort = await pickFreePort(); const { configA, configB } = buildZenohBridgeConfigs({ entityKind, entityName, fromDomain, toDomain, peerPort });` write two temp files `ramros-bridge-a-<ts>.json5` / `-b-<ts>.json5` via `fs.writeFileSync`, then one terminal:
         ```bash
         trap 'kill 0' EXIT; zenoh-bridge-ros2dds -c <quotedA> & zenoh-bridge-ros2dds -c <quotedB> & wait
         ```
         with paths wrapped in `shellSingleQuote`, title `Bridge: <entityName>`; info message states the bridge is **bidirectional** and stopped with Ctrl+C.
     - `messageType` resolution: required only when strategy is `domainBridge` (as today, with the existing "Could not resolve the type" warning); skipped entirely for zenoh.
  2. Register the three commands; handlers resolve name/type from tree items exactly as today (`resolveTopicName`, `LiveServiceItem.getServiceName()`, `LiveActionItem.getActionName()`, type getters) then call `runBridgeFlow`.
- [ ] **Step 4: package.json** — add commands `ramros.live.bridgeService` ("Bridge Service to Domain…", icon `$(arrow-both)`) and `ramros.live.bridgeAction` ("Bridge Action to Domain…", icon `$(arrow-both)`) next to `bridgeTopic` (line ~198); add context-menu bindings for `viewItem == liveService` and `viewItem == liveAction` (context group only, no inline) following the existing `callService` binding shape at lines 590-598. If `src/__tests__/integration/package-json-contract.integration.test.ts` enumerates commands/menus, update it in the same commit.
- [ ] **Step 5: Verify** — `npx jest src/__tests__/integration/extension-commands.integration.test.ts src/__tests__/integration/package-json-contract.integration.test.ts` → PASS; then full gates: `npm run lint && npm run typecheck && npm run test:unit && npm run test:integration` → PASS
- [ ] **Step 6: Commit**

```bash
git add src/extension.ts package.json src/__tests__/integration/extension-commands.integration.test.ts
git commit -m "feat: distro-aware bridging for topics, services and actions

- zenoh (two peering zenoh-bridge-ros2dds instances) on jazzy+,
  domain_bridge on humble/iron; services/actions only under
  cyclonedds via zenoh, honest guides otherwise
- fixes missing from_domain when 'current environment' is picked"
```

---

### Task 8: Final whole-branch review

- [ ] **Step 1:** Run all gates one last time (`npm run lint && npm run typecheck && npm run test:unit && npm run test:integration`) and confirm a clean working tree.
- [ ] **Step 2:** Dispatch a fresh reviewer subagent over the whole branch diff (design: `docs/superpowers/specs/2026-11-15-distro-aware-bridging-design.md`), with attention to: allow-list regex shapes, `trap`/quoting in the composed terminal command, temp-file cleanup on early returns (domain picks cancelled → both JSON5 files removed), and the Review Focus list.
- [ ] **Step 3:** Fix findings, commit (`fix: …`), re-run gates.
