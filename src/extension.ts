import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { RosEnvironmentService } from './core/ros-environment';
import { WorkspaceDetector, WorkspaceInfo, findWorkspaceForPath } from './core/workspace-detector';
import { getWorkspaceBagPaths, scanBagFolder } from './core/bag-discovery';
import { WorkspaceConfigService } from './core/workspace-config-service';
import { DuplicatePackageDetector } from './core/duplicate-package-detector';
import { CacheManager } from './cache/cache-manager';
import { RamrosTreeProvider } from './treeview/tree-provider';
import { ToolsTreeProvider } from './treeview/tools-tree-provider';
import { LiveTreeProvider } from './treeview/live-tree-provider';
import { LiveParameterItem, LiveNodeItem, LiveTopicItem, NodeParametersItem } from './treeview/live-items';
import { resolveBridgeStrategy, BridgeEntityKind } from './core/bridge-policy';
import { probeRosEnv } from './core/ros-env-probe';
import { buildZenohBridgeConfigs, pickFreePort } from './core/zenoh-bridge';
import {
  zenohInstallGuide,
  domainBridgeInstallGuide,
  servicesActionsGuide,
  zenohNativeGuide
} from './core/bridge-install-docs';
import { TerminalManager } from './executor/terminal-manager';
import { BagSessionService } from './executor/bag-session-service';
import { PackageCreator } from './wizard/package-creator';
import { runNodeOptionsWizard, pickDomain } from './wizard/run-node-options-wizard';
import { RunArgsBuilder } from './core/run-args-builder';
import { NodeInfo, LaunchFileInfo, PackageDiscoveryService, PackageInfo, InterfaceInfo } from './core/package-discovery';
import { TreeItemBase } from './treeview/base-tree-item';
import { BagPlayItem, BagPlayControlItem, BagLoopItem, BagRecordItem, BagFilesFolderItem, BagFileItem, ExternalBagFolderItem, BagEntriesProvider } from './treeview/bag-items';
import { LaunchWizard } from './wizard/launch-wizard';
import { runCreatePackageWizard, runAddToPackageWizard } from './wizard/package-wizard';
import { PackageFormValidator } from './wizard/package-form-validator';
import { RamrosDocProvider, showInReadonlyDoc } from './core/ramros-doc-provider';
import { buildTopicPubCommand, shellSingleQuote, shellDoubleQuote } from './core/command-builders';
import { Ros2CliService, validateParameterValue } from './core/ros2-cli-service';
import { createInterfaceLoader } from './core/interface-loader';
import { InterfaceField, InterfaceStructure } from './core/interface-parser';
import { valuesToYaml, valuesToJson, fieldDefaults } from './core/message-serializer';
import { showMessageInputPanel, MessageInputCommand } from './webview/message-input-panel';
import { analyzeWorkspace, renderAnalysisReport, AnalyzerPackageInput } from './core/workspace-analyzer';
import { buildDomainBridgeConfigYaml } from './core/domain-bridge';

let cacheManager: CacheManager;
let ramrosDocProvider: RamrosDocProvider;
let terminalManager: TerminalManager;
let treeProvider: RamrosTreeProvider;
let toolsTreeProvider: ToolsTreeProvider;
let liveTreeProvider: LiveTreeProvider;
let packageCreator: PackageCreator;
let bagSession: BagSessionService;
let workspaceConfigService: WorkspaceConfigService | undefined;

async function pickWorkspace(): Promise<WorkspaceInfo | undefined> {
  const workspaces = treeProvider.getWorkspaces();
  
  if (workspaces.length === 0) {
    void vscode.window.showWarningMessage('No ROS2 workspaces found');
    return undefined;
  }
  
  if (workspaces.length === 1) {
    return workspaces[0];
  }
  
  const workspaceNames = workspaces.map(w => w.name);
  const selected = await vscode.window.showQuickPick(workspaceNames, {
    placeHolder: 'Select a workspace'
  });
  
  if (!selected) return undefined;
  
  return workspaces.find(w => w.name === selected);
}

interface OverlayWorkspacePickItem extends vscode.QuickPickItem {
  workspace?: WorkspaceInfo;
  noSourcing?: boolean;
}

/**
 * Workspace selection for overlay-sourcing GUI tools (rviz2, rqt_graph).
 * Single workspace: no prompt at all. Multiple: quick pick with the last
 * used overlay workspace marked "(last used)" at the top, plus a
 * "Start without sourcing" escape hatch.
 */
async function pickWorkspaceForOverlayTool(
  context: vscode.ExtensionContext
): Promise<{ workspace?: WorkspaceInfo; source: boolean } | undefined> {
  const workspaces = treeProvider.getWorkspaces();

  if (workspaces.length === 0) {
    void vscode.window.showWarningMessage('No ROS2 workspaces found');
    return undefined;
  }

  if (workspaces.length === 1) {
    return { workspace: workspaces[0], source: true };
  }

  const lastUsedPath = context.workspaceState.get<string>('ramros.lastOverlayWorkspace');
  const items: OverlayWorkspacePickItem[] = [];

  if (lastUsedPath) {
    const lastUsed = workspaces.find(w => w.rootPath.fsPath === lastUsedPath);
    if (lastUsed) {
      items.push({
        label: `${lastUsed.name} (last used)`,
        description: lastUsed.rootPath.fsPath,
        alwaysShow: true,
        workspace: lastUsed
      });
    }
  }

  for (const workspace of workspaces) {
    if (lastUsedPath && workspace.rootPath.fsPath === lastUsedPath) {
      continue;
    }
    items.push({
      label: workspace.name,
      description: workspace.rootPath.fsPath,
      workspace
    });
  }

  items.push({ label: 'Start without sourcing', noSourcing: true });

  const picked = await vscode.window.showQuickPick(items, {
    placeHolder: 'Select an overlay workspace (sourcing brings your messages/types into the tool)'
  });

  if (!picked) {
    return undefined;
  }

  if (picked.noSourcing) {
    // Raw tool start: the workspace is irrelevant (nothing is sourced), the
    // first one only provides the terminal context.
    return { workspace: workspaces[0], source: false };
  }

  const workspace = (picked as OverlayWorkspacePickItem).workspace;
  if (workspace) {
    await context.workspaceState.update('ramros.lastOverlayWorkspace', workspace.rootPath.fsPath);
  }
  return { workspace, source: true };
}

async function resolveWorkspaceForPath(fsPath: string): Promise<WorkspaceInfo | undefined> {
  const workspaces = treeProvider.getWorkspaces();
  return findWorkspaceForPath(workspaces, fsPath) ?? await pickWorkspace();
}

/**
 * Runs the node options wizard and starts the node with the collected
 * options in a sourced terminal. Aborted wizard -> nothing starts.
 */
async function startNodeWithOptions(nodeToRun: NodeInfo): Promise<void> {
  const options = await runNodeOptionsWizard(nodeToRun);
  if (!options) {
    return; // aborted: start nothing
  }

  const selectedWorkspace = await resolveWorkspaceForPath(nodeToRun.path);
  if (!selectedWorkspace) {
    return;
  }

  const setupBashPath = path.join(selectedWorkspace.rootPath.fsPath, 'install', 'setup.bash');
  const args = RunArgsBuilder.build(options);

  let runCommand: string;
  if (fs.existsSync(setupBashPath)) {
    runCommand = `source "${setupBashPath}" && ros2 run ${shellDoubleQuote(nodeToRun.packageName)} ${shellDoubleQuote(nodeToRun.name)}`;
  } else {
    runCommand = `ros2 run ${shellDoubleQuote(nodeToRun.packageName)} ${shellDoubleQuote(nodeToRun.name)}`;
  }
  if (args) {
    runCommand += ` ${args}`;
  }

  const terminalTitle = options.nodeName
    ? `Node: ${options.nodeName} (${nodeToRun.name})`
    : `Node: ${nodeToRun.name}`;
  await terminalManager.executeInNewTerminal(runCommand, selectedWorkspace, terminalTitle, {
    domainId: options.domainId,
  });
}

function resolveTopicName(treeItem?: TreeItemBase | TreeItemBase[]): string | undefined {
  const item = Array.isArray(treeItem) ? treeItem[0] : treeItem;
  if (item && 'getTopicName' in item && typeof (item as { getTopicName?: unknown }).getTopicName === 'function') {
    return (item as unknown as { getTopicName: () => string }).getTopicName();
  }
  return undefined;
}

function resolveNodeName(treeItem?: TreeItemBase | TreeItemBase[]): string | undefined {
  const item = Array.isArray(treeItem) ? treeItem[0] : treeItem;
  if (item && 'getNodeName' in item && typeof (item as { getNodeName?: unknown }).getNodeName === 'function') {
    return (item as unknown as { getNodeName: () => string }).getNodeName();
  }
  return undefined;
}

/** Time for SIGINT to reach a node before its terminal is torn down. */
const SIGINT_SETTLE_MS = 200;

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Whether a RAMROS node terminal title refers to the given ROS node name.
 * Titles are "Node: <name>" or "Node: <alias> (<name>)"; the alias is
 * user-provided, so only the ROS name in parentheses (or the whole title
 * after the prefix) is matched.
 */
function terminalTitleMatchesNode(title: string, nodeName: string): boolean {
  if (!title.startsWith('Node: ')) {
    return false;
  }
  const rest = title.slice('Node: '.length);
  if (rest === nodeName) {
    return true;
  }
  const match = /^(.*) \((.*)\)$/.exec(rest);
  return match?.[2] === nodeName;
}

function resolveTopicMessageType(treeItem?: TreeItemBase | TreeItemBase[]): string | undefined {
  const item = Array.isArray(treeItem) ? treeItem[0] : treeItem;
  if (item && 'getMessageType' in item && typeof (item as { getMessageType?: unknown }).getMessageType === 'function') {
    return (item as unknown as { getMessageType: () => string }).getMessageType();
  }
  return undefined;
}

function resolveServiceItem(treeItem?: TreeItemBase | TreeItemBase[]): { name: string; type?: string } | undefined {
  const item = Array.isArray(treeItem) ? treeItem[0] : treeItem;
  if (
    item &&
    'getServiceName' in item && typeof (item as { getServiceName?: unknown }).getServiceName === 'function' &&
    'getServiceType' in item && typeof (item as { getServiceType?: unknown }).getServiceType === 'function'
  ) {
    return {
      name: (item as unknown as { getServiceName: () => string }).getServiceName(),
      type: (item as unknown as { getServiceType: () => string | undefined }).getServiceType(),
    };
  }
  return undefined;
}

function resolveActionItem(treeItem?: TreeItemBase | TreeItemBase[]): { name: string; type?: string } | undefined {
  const item = Array.isArray(treeItem) ? treeItem[0] : treeItem;
  if (
    item &&
    'getActionName' in item && typeof (item as { getActionName?: unknown }).getActionName === 'function' &&
    'getActionType' in item && typeof (item as { getActionType?: unknown }).getActionType === 'function'
  ) {
    return {
      name: (item as unknown as { getActionName: () => string }).getActionName(),
      type: (item as unknown as { getActionType: () => string | undefined }).getActionType(),
    };
  }
  return undefined;
}

function resolveParametersItem(treeItem?: TreeItemBase | TreeItemBase[]): NodeParametersItem | undefined {
  const item = Array.isArray(treeItem) ? treeItem[0] : treeItem;
  if (item instanceof NodeParametersItem) {
    return item;
  }
  return undefined;
}

function resolveBagFolderPath(treeItem?: TreeItemBase | TreeItemBase[]): string | undefined {  const item = Array.isArray(treeItem) ? treeItem[0] : treeItem;
  if (item && 'getFolderPath' in item && typeof (item as { getFolderPath?: unknown }).getFolderPath === 'function') {
    return (item as unknown as { getFolderPath: () => string }).getFolderPath();
  }
  return undefined;
}

function resolveBagPath(treeItem?: TreeItemBase | TreeItemBase[]): string | undefined {
  const item = Array.isArray(treeItem) ? treeItem[0] : treeItem;
  if (item && 'getBagPath' in item && typeof (item as { getBagPath?: unknown }).getBagPath === 'function') {
    return (item as unknown as { getBagPath: () => string }).getBagPath();
  }
  return undefined;
}

function resolveInterfaceQualifiedName(treeItem?: TreeItemBase | TreeItemBase[]): string | undefined {
  const item = Array.isArray(treeItem) ? treeItem[0] : treeItem;
  if (item && 'getQualifiedName' in item && typeof (item as { getQualifiedName?: unknown }).getQualifiedName === 'function') {
    return (item as unknown as { getQualifiedName: () => string }).getQualifiedName();
  }
  return undefined;
}

function resolveInterfacePath(treeItem?: TreeItemBase | TreeItemBase[]): string | undefined {
  const item = Array.isArray(treeItem) ? treeItem[0] : treeItem;
  if (item && 'getInterfaceInfo' in item && typeof (item as { getInterfaceInfo?: unknown }).getInterfaceInfo === 'function') {
    return (item as unknown as { getInterfaceInfo: () => InterfaceInfo }).getInterfaceInfo().path;
  }
  return undefined;
}

async function pickTopic(): Promise<string | undefined> {
  const topics = await executeCommandAndGetOutput('ros2 topic list');
  if (topics.length === 0) {
    void vscode.window.showWarningMessage('No ROS2 topics available');
    return undefined;
  }
  return vscode.window.showQuickPick(topics, {
    placeHolder: 'Select a topic'
  });
}

async function executeCommandAndGetOutput(command: string): Promise<string[]> {
  return Ros2CliService.getInstance().executeLines(command);
}

async function discoverTopics(): Promise<string[]> {
  const topics = await executeCommandAndGetOutput('ros2 topic list');
  return topics;
}

export async function findWorkspaceBags(): Promise<string[]> {
  return getWorkspaceBagPaths(treeProvider.getWorkspaces());
}

function getWorkspaceConfigService(): WorkspaceConfigService {
  if (!workspaceConfigService) {
    workspaceConfigService = new WorkspaceConfigService(
      () => treeProvider.getWorkspaces()[0]?.rootPath.fsPath
    );
  }
  return workspaceConfigService;
}

async function composeBagEntries(): Promise<TreeItemBase[]> {
  const workspaceBags = await getWorkspaceBagPaths(treeProvider.getWorkspaces());
  const entries: TreeItemBase[] = workspaceBags.map(bag => new BagFileItem(bag));
  for (const folder of await getWorkspaceConfigService().getBagFolders()) {
    entries.push(new ExternalBagFolderItem(folder, scanBagFolder(folder)));
  }
  return entries;
}

const getBagEntries: BagEntriesProvider = async (): Promise<TreeItemBase[]> => {
  try {
    return await composeBagEntries();
  } catch (error) {
    console.error('RAMROS: failed to compose bag entries', error);
    return [];
  }
};

export async function getBagEntriesForTests(): Promise<TreeItemBase[]> {
  return composeBagEntries();
}

export async function selectBagForPlayback(bagPath: string): Promise<void> {
  bagSession.setSelectedBagPath(bagPath);
  BagPlayItem.setSelectedBag(bagPath);

  // Get bag info
  try {
    const bagInfo = await Ros2CliService.getInstance().executeRaw(`ros2 bag info ${shellDoubleQuote(bagPath)}`);
    const bagInfoOutput = bagInfo.output;
    if (!bagInfo.ok && bagInfoOutput.length === 0) {
      throw new Error(bagInfo.stderr ?? 'ros2 bag info failed');
    }

    // Filter out "closing." lines from the output
    const filteredOutput = bagInfoOutput.split('\n').filter(line => !line.includes('closing.')).join('\n');

    // Update BagInfoItem with bag path and info
    await toolsTreeProvider.setBagInfo(filteredOutput, bagPath);
  } catch (error) {
    void vscode.window.showErrorMessage(`Failed to get bag info: ${error}`);
  }

  // Refresh tree to show play controls and bag info
  await toolsTreeProvider.refresh();

  void vscode.window.showInformationMessage(`Bag file selected: ${path.basename(bagPath)}`);
}

export function __setTreeProviderForTests(provider: RamrosTreeProvider): void {
  treeProvider = provider;
}

export function __setDocProviderForTests(provider: RamrosDocProvider): void {
  ramrosDocProvider = provider;
}

export async function showInterfaceDefinition(qualifiedName: string, interfacePath?: string): Promise<void> {
  try {
    const command = await buildInterfaceShowCommand(qualifiedName, interfacePath);
    const result = await Ros2CliService.getInstance().executeRaw(command, { timeout: 5000 });
    if (!result.ok && result.output.length === 0) {
      throw new Error(result.stderr ?? 'ros2 interface show failed');
    }
    await showInReadonlyDoc(ramrosDocProvider, `interface/${qualifiedName.replace(/\//g, '-')}`, result.output);
  } catch {
    void vscode.window.showErrorMessage(`Could not show interface ${qualifiedName}. Is the workspace built (colcon build)?`);
  }
}

async function buildInterfaceShowCommand(qualifiedName: string, interfacePath?: string): Promise<string> {
  const quoted = shellSingleQuote(qualifiedName);
  if (!interfacePath) {
    return `ros2 interface show ${quoted}`;
  }
  const workspaces = treeProvider?.getWorkspaces() ?? [];
  const workspace = findWorkspaceForPath(workspaces, interfacePath);
  const setupBashPath = workspace?.installPath ? path.join(workspace.installPath.fsPath, 'setup.bash') : undefined;
  if (!setupBashPath || !fs.existsSync(setupBashPath)) {
    return `ros2 interface show ${quoted}`;
  }
  // Hidden execs run under bash (see Ros2CliService.execOptions), so both
  // dot sourcing and `source` work; bash is required by ROS setup scripts.
  return `. "${setupBashPath}" && ros2 interface show ${quoted}`;
}

/**
 * Fetches an interface definition for the structured input loader, sourcing
 * the given workspace overlay when its setup.bash exists (un-sourced
 * fallback otherwise).
 */
async function fetchInterfaceDefinition(
  qualifiedType: string,
  workspace: WorkspaceInfo,
  cli: Ros2CliService
): Promise<string> {
  const setupBashPath = workspace.installPath ? path.join(workspace.installPath.fsPath, 'setup.bash') : undefined;
  // Hidden execs run under bash (see Ros2CliService.execOptions), so both
  // dot sourcing and `source` work; bash is required by ROS setup scripts.
  const command = setupBashPath && fs.existsSync(setupBashPath)
    ? `. "${setupBashPath}" && ros2 interface show ${shellSingleQuote(qualifiedType)}`
    : `ros2 interface show ${shellSingleQuote(qualifiedType)}`;
  const result = await cli.executeRaw(command, { timeout: 5000 });
  if (!result.ok && result.output.length === 0) {
    throw new Error(result.stderr ?? `ros2 interface show ${qualifiedType} failed`);
  }
  return result.output;
}

/** Per-panel random nonce for the webview content security policy. */
function createNonce(): string {
  return Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
}

/**
 * Session-scoped interface loader: caches `ros2 interface show` results for
 * the whole session (spec: "Die Struktur wird pro Session gecacht"). The
 * fetch closure is provided at call time so the workspace overlay follows
 * the workspace the flow resolved.
 */
let sessionInterfaceLoader: ReturnType<typeof createInterfaceLoader> | undefined;
function getInterfaceLoader(cli: Ros2CliService): ReturnType<typeof createInterfaceLoader> {
  if (!sessionInterfaceLoader) {
    sessionInterfaceLoader = createInterfaceLoader(qualifiedType =>
      fetchInterfaceDefinition(qualifiedType, lastResolvedWorkspace!, cli)
    );
  }
  return sessionInterfaceLoader;
}

/** Workspace of the most recent structured-input flow (loader fetch closure). */
let lastResolvedWorkspace: WorkspaceInfo | undefined;

/** Test seam: forgets the session-scoped loader cache between tests. */
export function __resetInterfaceLoaderForTests(): void {
  sessionInterfaceLoader = undefined;
  lastResolvedWorkspace = undefined;
}

export async function runHealthCheck(provider: RamrosDocProvider): Promise<void> {
  const result = await Ros2CliService.getInstance().executeRaw('ros2 doctor', { timeout: 60000 });
  const stdout = result.output;
  const stderr = result.stderr ?? '';
  const combinedOutput = stdout + stderr;
  if (combinedOutput.length === 0) {
    void vscode.window.showWarningMessage('ros2 doctor returned no output');
    return;
  }
  await showInReadonlyDoc(provider, 'ros2-doctor', combinedOutput);
}

/**
 * Collects the file inputs for the workspace completeness analyzer: python
 * files under the package module folder, C++ sources/headers under src/ and
 * include/, interface files (msg/srv/action), setup.py and CMakeLists.txt.
 * The analyzer itself stays pure — it only receives file contents.
 */
export function collectAnalyzerPackageInput(
  pkg: PackageInfo,
  readFileSync: (filePath: string) => string
): AnalyzerPackageInput {
  const pkgRoot = pkg.path;
  const pythonFiles: Array<{ relativePath: string; content: string }> = [];
  const cppFiles: Array<{ relativePath: string; content: string }> = [];
  const interfaceFiles: string[] = [];
  let setupPyContent: string | undefined;
  let cmakeContent: string | undefined;

  const moduleRoot = path.join(pkgRoot, pkg.name);

  const walk = (dir: string): void => {
    if (!fs.existsSync(dir)) {
      return;
    }
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      const relativePath = path.relative(pkgRoot, fullPath).split(path.sep).join('/');
      if (entry.isDirectory()) {
        // Skip build artifacts, logs and hidden directories.
        if (entry.name.startsWith('.') || entry.name === 'install' || entry.name === 'build' || entry.name === 'log') {
          continue;
        }
        walk(fullPath);
        continue;
      }
      if (relativePath === 'setup.py') {
        try {
          setupPyContent = readFileSync(fullPath);
        } catch {
          setupPyContent = undefined;
        }
        continue;
      }
      if (relativePath === 'CMakeLists.txt') {
        try {
          cmakeContent = readFileSync(fullPath);
        } catch {
          cmakeContent = undefined;
        }
        continue;
      }
      const ext = path.extname(entry.name);
      if (ext === '.py' && fullPath.startsWith(moduleRoot + path.sep)) {
        try {
          pythonFiles.push({ relativePath, content: readFileSync(fullPath) });
        } catch {
          // Unreadable file: skip silently.
        }
      } else if (['.cpp', '.hpp', '.h', '.cc', '.hh'].includes(ext)
        && (relativePath.startsWith('src/') || relativePath.startsWith('include/'))) {
        try {
          cppFiles.push({ relativePath, content: readFileSync(fullPath) });
        } catch {
          // Unreadable file: skip silently.
        }
      } else {
        const segments = relativePath.split('/');
        if (segments.length === 2 && ['msg', 'srv', 'action'].includes(segments[0])) {
          // Placeholder files (.gitkeep) and empty files are not interfaces —
          // listing them produces bogus "unregistered interface" findings.
          if (['.msg', '.srv', '.action'].includes(ext) && fs.statSync(fullPath).size > 0) {
            interfaceFiles.push(relativePath);
          }
        }
      }
    }
  };

  walk(pkgRoot);
  return {
    name: pkg.name,
    buildType: pkg.buildType,
    path: pkgRoot,
    declaredDependencies: [...new Set(pkg.dependencies.map(dep => dep.name))],
    declaredDependencyKinds: pkg.dependencies.reduce<Record<string, Array<'build' | 'exec' | 'test'>>>((acc, dep) => {
      (acc[dep.name] ??= []).push(dep.type);
      return acc;
    }, {}),
    pythonFiles,
    cppFiles,
    setupPyContent,
    cmakeContent,
    interfaceFiles
  };
}

/**
 * Fetches the set of known ROS package names (`ros2 pkg list`). A failed
 * call (no sourced environment, no ROS installation) yields an empty set —
 * mappings then fall to "unknown" instead of false-positive warnings.
 */
export async function fetchKnownRosPackages(cli: Ros2CliService): Promise<Set<string>> {
  const result = await cli.executeRaw('ros2 pkg list', { timeout: 30000 });
  if (!result.ok) {
    return new Set();
  }
  return new Set(
    result.output
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0)
  );
}

/**
 * Runs the completeness analysis for one workspace and shows the markdown
 * report as a read-only document (ros2 doctor / interface definition
 * pattern).
 */
export async function analyzeWorkspaceCompleteness(
  workspace: WorkspaceInfo,
  provider: RamrosDocProvider,
  cli: Ros2CliService
): Promise<void> {
  const packages = workspace.packages ?? [];
  const knownRosPackages = await fetchKnownRosPackages(cli);
  const inputs = packages.map(pkg => collectAnalyzerPackageInput(pkg, filePath => fs.readFileSync(filePath, 'utf8')));
  const report = analyzeWorkspace(inputs, knownRosPackages);
  const markdown = renderAnalysisReport(report);
  await showInReadonlyDoc(provider, `workspace-analysis/${workspace.name}`, markdown);
}

export function resolveWorkspaceForLaunch(
  arg: TreeItemBase | undefined,
  workspaces: WorkspaceInfo[]
): WorkspaceInfo | undefined {
  if (arg && 'getPackageInfo' in arg && typeof (arg as unknown as Record<string, unknown>).getPackageInfo === 'function') {
    const pkg = (arg as unknown as { getPackageInfo: () => PackageInfo }).getPackageInfo();
    return findWorkspaceForPath(workspaces, pkg.path) ?? undefined;
  }
  if (arg && 'getWorkspace' in arg && typeof (arg as unknown as Record<string, unknown>).getWorkspace === 'function') {
    const ws = (arg as unknown as { getWorkspace: () => WorkspaceInfo }).getWorkspace();
    return workspaces.find(w => w.id === ws.id) ?? undefined;
  }
  return undefined;
}

/**
 * Shared flow behind 'Bridge Topic/Service/Action to Domain…'.
 *
 * Chooses the bridging strategy from the active distro, the probed RMW and
 * the entity kind: rmw_zenoh_cpp gets the native-RMW guide; services/actions
 * under a non-CycloneDDS RMW get the limitation guide; topics on pre-Jazzy
 * distros bridge via the `domain_bridge` package; everything else uses two
 * peering `zenoh-bridge-ros2dds` instances. Missing tools render the matching
 * install guide in a readonly tab instead of starting a dead terminal.
 */
async function runBridgeFlow(
  entityKind: BridgeEntityKind,
  entityName: string | undefined,
  messageType: string | undefined
): Promise<void> {
  if (!entityName) return;
  const cli = Ros2CliService.getInstance();

  const distro = new RosEnvironmentService(
    vscode.workspace.getConfiguration('ramros.ros').get<string>('rosRoot', '/opt/ros')
  ).getActiveDistributionName() ?? '';

  const workspace = await pickWorkspace();
  if (!workspace) return;

  // Probe the effective RMW + ROS_DOMAIN_ID (distro setup.bash plus the
  // workspace overlay). A failed probe falls back to distro defaults inside
  // probeRosEnv instead of aborting the flow.
  const probe = await probeRosEnv(
    async command => {
      const r = await cli.executeRaw(command, { timeout: 10000 });
      return { output: r.output, ok: r.ok };
    },
    { distro, workspaceInstallPath: workspace.rootPath.fsPath }
  );

  const strategy = resolveBridgeStrategy({ distro, rmw: probe.rmw, entityKind });
  if (strategy.kind === 'guide') {
    if (strategy.reason === 'rmw-zenoh-native') {
      await showInReadonlyDoc(ramrosDocProvider, `bridge/${strategy.reason}`, zenohNativeGuide({ entityKind, entityName }));
    } else {
      await showInReadonlyDoc(
        ramrosDocProvider,
        `bridge/${strategy.reason}`,
        servicesActionsGuide({ distro, rmw: probe.rmw, entityKind, entityName })
      );
    }
    return;
  }

  // domain_bridge is a separate package, not part of the ROS desktop
  // install — fail early with guidance instead of a dead terminal.
  if (strategy.kind === 'domainBridge') {
    const availability = await cli.executeRaw('ros2 pkg prefix domain_bridge', { timeout: 10000 });
    if (!availability.ok || availability.output.trim().length === 0) {
      await showInReadonlyDoc(ramrosDocProvider, 'bridge/install-domain-bridge', domainBridgeInstallGuide(distro));
      return;
    }
  } else {
    // zenoh-bridge-ros2dds is a standalone binary, not a ROS package.
    const zenohBinary = await cli.executeRaw('command -v zenoh-bridge-ros2dds', { timeout: 10000 });
    if (!zenohBinary.ok || zenohBinary.output.trim().length === 0) {
      await showInReadonlyDoc(ramrosDocProvider, 'bridge/install-zenoh', zenohInstallGuide(distro));
      return;
    }
  }

  // The zenoh strategy discovers the type itself; domainBridge resolves it
  // in its start branch below.
  const fromPick = await vscode.window.showQuickPick([
    { label: `Current environment (domain ${probe.domainId})`, fromDomain: probe.domainId },
    ...liveTreeProvider.getDomainGroups().map(id => ({ label: `Domain ${id}`, fromDomain: id }))
  ], { placeHolder: 'Bridge from which domain?' });
  if (!fromPick) return;

  const configuredDomains = vscode.workspace.getConfiguration('ramros.liveView').get<number[]>('domainIds', []);
  const toOptions = [
    ...configuredDomains.map(id => ({ label: `Domain ${id}`, toDomain: id })),
    { label: 'Enter domain id…', toDomain: -1 }
  ];
  const toPick = await vscode.window.showQuickPick(toOptions, { placeHolder: 'Bridge to which domain?' });
  if (!toPick) return;

  let toDomain = toPick.toDomain;
  if (toDomain === -1) {
    const raw = await vscode.window.showInputBox({
      prompt: 'Target ROS_DOMAIN_ID (integer)',
      validateInput: value => (/^\d+$/.test(value) ? undefined : 'Domain id must be a non-negative integer')
    });
    if (raw === undefined) return;
    toDomain = parseInt(raw, 10);
  }

  if (strategy.kind === 'domainBridge') {
    // domain_bridge needs the topic type for its YAML; zenoh's ros2dds
    // plugin discovers the type itself.
    let resolvedType = messageType;
    if (!resolvedType) {
      resolvedType = await cli.getTopicType(entityName) ?? undefined;
      if (!resolvedType) {
        void vscode.window.showWarningMessage(`Could not resolve the type of ${entityName}. Is a node publishing on it?`);
        return;
      }
    }
    // Write the bridge config to a temp file and start domain_bridge in a
    // dedicated terminal so the user can stop it with Ctrl+C.
    const configYaml = buildDomainBridgeConfigYaml({
      topic: entityName,
      type: resolvedType,
      fromDomain: fromPick.fromDomain,
      toDomain
    });
    const configFile = path.join(os.tmpdir(), `ramros-bridge-${Date.now()}.yaml`);
    let handedOff = false;
    try {
      fs.writeFileSync(configFile, configYaml, 'utf8');
      await terminalManager.executeInNewTerminal(
        `ros2 run domain_bridge domain_bridge ${shellSingleQuote(configFile)}`,
        workspace,
        `Bridge: ${entityName}`
      );
      // sendText only queues keystrokes — the terminal's shell has not run
      // the command yet, so the file must stay on disk until domain_bridge
      // reads it. Clean up only when the hand-off itself failed.
      handedOff = true;
    } finally {
      if (!handedOff) {
        fs.rmSync(configFile, { force: true });
      }
    }
    void vscode.window.showInformationMessage(
      `Bridging ${entityName} to domain ${toDomain}. Stop the bridge with Ctrl+C in its terminal.`
    );
  } else {
    // Two peering zenoh-bridge-ros2dds instances: A listens on a free port
    // in the source domain, B connects to it from the target domain. Both
    // configs allow-list exactly the bridged entity.
    const peerPort = await pickFreePort();
    const { configA, configB } = buildZenohBridgeConfigs({
      entityKind,
      entityName,
      fromDomain: fromPick.fromDomain,
      toDomain,
      peerPort
    });
    const timestamp = Date.now();
    const configFiles = [
      { file: path.join(os.tmpdir(), `ramros-bridge-a-${timestamp}.json5`), content: configA },
      { file: path.join(os.tmpdir(), `ramros-bridge-b-${timestamp}.json5`), content: configB }
    ];
    let handedOff = false;
    try {
      for (const { file, content } of configFiles) {
        fs.writeFileSync(file, content, 'utf8');
      }
      // VS Code terminals run interactive bash with job control: each `&`
      // job gets its own process group, so Ctrl+C only reaches the shell in
      // `wait` — `kill 0` would signal the shell's own group and leave the
      // bridges running. `kill $(jobs -p)` targets the background jobs
      // directly and stops both bridge instances.
      const command = [
        "trap 'kill $(jobs -p)' INT TERM EXIT;",
        `zenoh-bridge-ros2dds -c ${shellSingleQuote(configFiles[0].file)} &`,
        `zenoh-bridge-ros2dds -c ${shellSingleQuote(configFiles[1].file)} &`,
        'wait'
      ].join(' ');
      await terminalManager.executeInNewTerminal(command, workspace, `Bridge: ${entityName}`);
      // sendText only queues keystrokes — the terminal's shell has not run
      // the command yet, so the files must stay on disk until each bridge
      // reads its config. Clean up only when the hand-off itself failed.
      handedOff = true;
    } finally {
      if (!handedOff) {
        for (const { file } of configFiles) {
          fs.rmSync(file, { force: true });
        }
      }
    }
    void vscode.window.showInformationMessage(
      `Bridging ${entityName} bidirectionally between domains ${fromPick.fromDomain} and ${toDomain}. Stop the bridge with Ctrl+C in its terminal.`
    );
  }
}

export async function publishToTopic(
  topicName: string,
  knownMessageType: string | undefined,
  terminalManager: TerminalManager,
  resolveWorkspace: () => Promise<WorkspaceInfo | undefined>,
  cli: Ros2CliService
): Promise<string | undefined> {
  let messageType = knownMessageType ?? await cli.getTopicType(topicName) ?? undefined;
  if (!messageType) {
    const manualEntry = await vscode.window.showErrorMessage(
      `Could not resolve the type of ${topicName}. Is a node publishing on it?`,
      'Enter topic type manually'
    );
    if (!manualEntry) return undefined;
    messageType = await vscode.window.showInputBox({
      prompt: `Message type for ${topicName} (e.g. std_msgs/msg/String)`,
      validateInput: value => (value && value.trim().length > 0 ? undefined : 'Message type is required')
    });
    if (!messageType) return undefined;
  }

  // Workspace resolution happens before the structure loading so the
  // interface show fetch can source the workspace overlay.
  const workspace = await resolveWorkspace();
  if (!workspace) return undefined;

  // The loader (and its cache) is session-scoped; the workspace feeds the
  // fetch closure at call time.
  lastResolvedWorkspace = workspace;
  const loader = getInterfaceLoader(cli);

  let structure;
  try {
    structure = await loader.loadStructure(messageType);
  } catch {
    structure = undefined; // Top-level failure: fall back to the raw flow.
  }

  if (structure) {
    return publishStructured(topicName, messageType, workspace, structure, terminalManager, cli);
  }
  // --- Raw fallback flow (unchanged) ---
  const modePick = await vscode.window.showQuickPick([
    { label: 'once', description: 'Publish the message once' },
    { label: 'rate', description: 'Publish repeatedly at a rate' }
  ], { placeHolder: 'Select publish mode' });
  if (!modePick) return undefined;

  const mode = modePick.label as 'once' | 'rate';
  let rate: number | undefined;
  if (mode === 'rate') {
    const rateInput = await vscode.window.showInputBox({
      prompt: 'Publish rate (Hz)',
      value: '1',
      validateInput: value => {
        if (!/^\d+(\.\d+)?$/.test(value)) {
          return 'Rate must be a positive number';
        }
        if (!(parseFloat(value) > 0)) {
          return 'Rate must be greater than 0';
        }
        return undefined;
      }
    });
    if (rateInput === undefined) return undefined;
    rate = parseFloat(rateInput);
  }

  const content = await vscode.window.showInputBox({
    prompt: 'Message content (YAML)',
    value: '{}',
    validateInput: value => (value.trim().length > 0 ? undefined : 'Message content is required')
  });
  if (content === undefined || content.trim().length === 0) return undefined;

  const command = buildTopicPubCommand(topicName, messageType, content, mode, rate);
  await terminalManager.executeInNewTerminal(command, workspace, `Pub: ${topicName}`);
  return messageType;
}

/**
 * Publish flow with the structured webview form. Publish-once runs as a
 * hidden exec (10s subscriber timeout); rate publishing opens a terminal.
 */
async function publishStructured(
  topicName: string,
  messageType: string,
  workspace: WorkspaceInfo,
  structure: InterfaceStructure,
  terminalManager: TerminalManager,
  cli: Ros2CliService
): Promise<string | undefined> {
  const setupBashPath = workspace.installPath ? path.join(workspace.installPath.fsPath, 'setup.bash') : undefined;
  const hasSetup = setupBashPath !== undefined && fs.existsSync(setupBashPath);
  // POSIX dot sourcing: hidden execs run under /bin/sh (dash on Ubuntu),
  // where the bashism `source` fails.
  const sourcePrefix = hasSetup ? `. "${setupBashPath}" && ` : '';
  const { buildFormHtml } = await import('./core/form-html');
  const formKind = 'topic' as const;

  const html = buildFormHtml(structure, {
    nonce: createNonce(),
    cspSource: '',
    title: `Publish ${topicName} (${messageType})`,
    kind: formKind
  });
  showMessageInputPanel({
    key: `topic:${topicName}`,
    title: `Pub: ${topicName}`,
    kind: formKind,
    html,
    onMessage: (message: MessageInputCommand) => handleStructuredPublish(
      topicName, messageType, workspace, sourcePrefix, structure.fields, terminalManager, cli, message
    )
  });
  return messageType;
}

async function handleStructuredPublish(
  topicName: string,
  messageType: string,
  workspace: WorkspaceInfo,
  sourcePrefix: string,
  fields: InterfaceField[],
  terminalManager: TerminalManager,
  cli: Ros2CliService,
  message: MessageInputCommand
): Promise<{ type: string; ok: boolean; message: string }> {
  if (message.type === 'publishRate') {
    const yaml = valuesToYaml(fields, { ...fieldDefaults(fields), ...message.values });
    // The rate comes from the webview; only finite positive numbers may
    // reach the command line.
    const rate = typeof message.rate === 'number' && Number.isFinite(message.rate) && message.rate > 0
      ? message.rate
      : 1;
    const command = `${sourcePrefix}${buildTopicPubCommand(topicName, messageType, yaml, 'rate', rate)}`;
    await terminalManager.executeInNewTerminal(command, workspace, `Pub: ${topicName}`);
    return { type: 'result', ok: true, message: `Publishing at ${rate} Hz in a terminal` };
  }

  // publishOnce (default): hidden exec with a 10s subscriber timeout.
  const yaml = valuesToYaml(fields, { ...fieldDefaults(fields), ...message.values });
  const command = `${sourcePrefix}${buildTopicPubCommand(topicName, messageType, yaml, 'once')}`;
  try {
    const result = await cli.executeRaw(command, { timeout: 10000 });
    if (!result.ok) {
      throw new Error(result.stderr || 'ros2 topic pub failed');
    }
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`Publish failed: ${reason}`);
  }
  return { type: 'result', ok: true, message: 'Message published' };
}

async function pickTargetPackage(workspaces: WorkspaceInfo[]): Promise<PackageInfo | undefined> {
  const packages = workspaces.flatMap(w => w.packages || []);
  if (packages.length === 0) {
    void vscode.window.showWarningMessage('No packages found');
    return undefined;
  }
  const packageNames = packages.map(p => p.name);
  const selected = await vscode.window.showQuickPick(packageNames, {
    placeHolder: 'Select a package'
  });
  if (!selected) return undefined;
  return packages.find(p => p.name === selected);
}

function resolvePresetPackageForLaunch(arg: TreeItemBase | undefined): PackageInfo | undefined {
  if (arg && 'getPackageInfo' in arg && typeof (arg as unknown as Record<string, unknown>).getPackageInfo === 'function') {
    return (arg as unknown as { getPackageInfo: () => PackageInfo }).getPackageInfo();
  }
  return undefined;
}

export async function activate(context: vscode.ExtensionContext) {
  console.log('RAMROS Extension activated');
  
  const rosEnvironmentService = new RosEnvironmentService(
    vscode.workspace.getConfiguration('ramros.ros').get<string>('rosRoot', '/opt/ros')
  );
  
  cacheManager = new CacheManager({
    onFileChange: (message) => {
      console.log(`[Cache] ${message}`);
    }
  });
  
  const packageDiscovery = new PackageDiscoveryService(cacheManager, context.globalState);
  const workspaceDetector = new WorkspaceDetector(
    () => rosEnvironmentService.detectInstallations(),
    packageDiscovery,
    cacheManager
  );
  
  const duplicateDetector = new DuplicatePackageDetector(cacheManager);
  
   terminalManager = new TerminalManager();
   bagSession = BagSessionService.getInstance();
   ramrosDocProvider = new RamrosDocProvider();

   const configuredDomainId = vscode.workspace.getConfiguration('ramros.ros').get<number | undefined>('domainId', undefined);
   Ros2CliService.getInstance().setDomainId(configuredDomainId);
   terminalManager.setDomainId(configuredDomainId);
   treeProvider = new RamrosTreeProvider(workspaceDetector, duplicateDetector, packageDiscovery);
   workspaceConfigService = getWorkspaceConfigService();
   toolsTreeProvider = new ToolsTreeProvider(getBagEntries);
   liveTreeProvider = new LiveTreeProvider(workspaceConfigService);
  
   packageCreator = new PackageCreator(context.extensionPath, rosEnvironmentService);
  
  const treeView = vscode.window.createTreeView('ramrosExplorer', {
    treeDataProvider: treeProvider,
    showCollapseAll: true
  });
  
  const toolsTreeView = vscode.window.createTreeView('ramrosTools', {
    treeDataProvider: toolsTreeProvider,
    showCollapseAll: false
  });
  
  const liveTreeView = vscode.window.createTreeView('ramrosLive', {
    treeDataProvider: liveTreeProvider,
    showCollapseAll: false
  });
  // Track collapses so ticks stop fetching info for collapsed items
  // (anti-flicker model: expanded set maintained by expand via getChildren
  // re-reads and explicit collapse events).
  liveTreeView.onDidCollapseElement(event => {
    const element = event.element;
    if (element instanceof LiveNodeItem || element instanceof LiveTopicItem) {
      liveTreeProvider.markCollapsed(element);
    }
  });

  // Domain visibility: a configured ROS_DOMAIN_ID must be visible (anti
  // silent-confusion), carried by the tools view title description.
  const applyDomainVisibility = (domainId: number | undefined) => {
    toolsTreeView.description = domainId !== undefined ? `ROS_DOMAIN_ID=${domainId}` : undefined;
    liveTreeProvider.setDomainGroups(
      vscode.workspace.getConfiguration('ramros.liveView').get<number[]>('domainIds', [])
    );
  };
  applyDomainVisibility(configuredDomainId);
  
   const ramrosConfigWatcher = vscode.workspace.createFileSystemWatcher('**/ramros.json');   ramrosConfigWatcher.onDidChange(() => {
     void toolsTreeProvider.refresh();
     void liveTreeProvider.reloadFromWorkspaceConfig();
   });
   ramrosConfigWatcher.onDidCreate(() => {
     void toolsTreeProvider.refresh();
     void liveTreeProvider.reloadFromWorkspaceConfig();
   });
   ramrosConfigWatcher.onDidDelete(() => {
     void toolsTreeProvider.refresh();
     void liveTreeProvider.reloadFromWorkspaceConfig();
   });

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(e => {
      if (e.affectsConfiguration('ramros.ros.rosRoot')) {
        const newRoot = vscode.workspace.getConfiguration('ramros.ros').get<string>('rosRoot', '/opt/ros');
        rosEnvironmentService.setRosRoot(newRoot);
        void treeProvider.refresh();
      }
      if (e.affectsConfiguration('ramros.ros.domainId')) {
        const newDomain = vscode.workspace.getConfiguration('ramros.ros').get<number | undefined>('domainId', undefined);
        Ros2CliService.getInstance().setDomainId(newDomain);
        terminalManager.setDomainId(newDomain);
        applyDomainVisibility(newDomain);
        void toolsTreeProvider.refresh();
      }
      if (e.affectsConfiguration('ramros.liveView.domainIds')) {
        applyDomainVisibility(
          vscode.workspace.getConfiguration('ramros.ros').get<number | undefined>('domainId', undefined)
        );
      }
    })
  );
  
  context.subscriptions.push(
    vscode.workspace.registerTextDocumentContentProvider(RamrosDocProvider.scheme, ramrosDocProvider),
    vscode.commands.registerCommand('ramros.openReadonlyDoc', (key: string, content: string) => showInReadonlyDoc(ramrosDocProvider, key, content))
  );

  context.subscriptions.push(
    treeView,
    toolsTreeView,
    liveTreeView,
    cacheManager,
    terminalManager,
    bagSession,
    liveTreeProvider,
    ramrosConfigWatcher,
    vscode.workspace.onDidChangeWorkspaceFolders(() => {
      void treeProvider.onWorkspaceFoldersChanged();
    }),
    vscode.window.onDidCloseTerminal(terminal => {
      if (bagSession.handleTerminalClosed(terminal)) {
        void toolsTreeProvider.refresh();
      }
    }),

    vscode.commands.registerCommand('ramros.refreshWorkspaces', async () => {
      await treeProvider.refresh();
      void vscode.window.showInformationMessage('Workspaces refreshed');
    }),
    
    vscode.commands.registerCommand('ramros.refreshInstalledPackages', async () => {
      await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: 'Scanning installed ROS2 packages...',
        cancellable: false
      }, async () => {
        const packages = await packageDiscovery.refreshInstalledPackages();
        void vscode.window.showInformationMessage(
          `Installed ROS2 packages refreshed (${packages.length} packages)`
        );
      });
    }),
    
    vscode.commands.registerCommand('ramros.toggleTreeSortMode', async () => {
      treeProvider.toggleSortMode();
      const mode = treeProvider.getSortMode();
      const message = mode === 'byPackage' 
        ? '📦 Tree view: Grouped by package' 
        : '📂 Tree view: Grouped by category';
      void vscode.window.showInformationMessage(message);
    }),
    
    vscode.commands.registerCommand('ramros.sourceWorkspace', async (item?: WorkspaceInfo) => {
      const workspaces = treeProvider.getWorkspaces();
      
      if (workspaces.length === 0) {
        void vscode.window.showWarningMessage('No ROS2 workspaces found');
        return;
      }
      
      let selectedWorkspace: typeof workspaces[0];
      
      if (item) {
        const found = workspaces.find(w => w.id === item.id);
        if (!found) {
          void vscode.window.showErrorMessage('Selected workspace not found');
          return;
        }
        selectedWorkspace = found;
      } else if (workspaces.length === 1) {
        selectedWorkspace = workspaces[0];
      } else {
        const workspaceNames = workspaces.map(w => w.name);
        const selected = await vscode.window.showQuickPick(workspaceNames, {
          placeHolder: 'Select a workspace to source'
        });
        
        if (!selected) return;
        
        selectedWorkspace = workspaces.find(w => w.name === selected)!;
      }
      
      await terminalManager.sourceWorkspace(selectedWorkspace);
    }),
    
    vscode.commands.registerCommand('ramros.buildWorkspace', async (item?: WorkspaceInfo) => {
      const workspaces = treeProvider.getWorkspaces();
      
      if (workspaces.length === 0) {
        void vscode.window.showWarningMessage('No ROS2 workspaces found');
        return;
      }
      
      let selectedWorkspace: typeof workspaces[0];
      
      if (item) {
        const found = workspaces.find(w => w.id === item.id);
        if (!found) {
          void vscode.window.showErrorMessage('Selected workspace not found');
          return;
        }
        selectedWorkspace = found;
      } else if (workspaces.length === 1) {
        selectedWorkspace = workspaces[0];
      } else {
        const workspaceNames = workspaces.map(w => w.name);
        const selected = await vscode.window.showQuickPick(workspaceNames, {
          placeHolder: 'Select a workspace to build'
        });
        
        if (!selected) return;
        
        selectedWorkspace = workspaces.find(w => w.name === selected)!;
      }
      
      const buildType = await vscode.window.showQuickPick(
        [
          { label: 'standard', description: 'Standard colcon build' },
          { label: 'symlink', description: 'Build with --symlink-install' },
          { label: 'clean-standard', description: 'Clean build (standard)' },
          { label: 'clean-symlink', description: 'Clean build with symlink' }
        ],
        { placeHolder: 'Select build type' }
      );
      
      if (!buildType) return;
      
      const useSymlinkInstall = buildType.label === 'symlink' || buildType.label === 'clean-symlink';
      const cleanFirst = buildType.label === 'clean-standard' || buildType.label === 'clean-symlink';
      
      await terminalManager.buildWorkspace(selectedWorkspace, {
        useSymlinkInstall,
        cleanFirst
      });

      // colcon build runs async in the terminal; the install/setup.bash file
      // watcher refreshes the tree as soon as the build creates it. The
      // delayed refresh below is a fallback for setups where the watcher
      // misses the event (e.g. remote/ssh workspaces).
      setTimeout(() => {
        void treeProvider.refresh();
      }, 5000);
    }),

    vscode.commands.registerCommand('ramros.analyzeWorkspace', async (item?: WorkspaceInfo) => {
      const workspaces = treeProvider.getWorkspaces();

      if (workspaces.length === 0) {
        void vscode.window.showWarningMessage('No ROS2 workspaces found');
        return;
      }

      let selectedWorkspace: WorkspaceInfo | undefined;

      if (item) {
        // Tree item invocation: the item may be the workspace tree node or a
        // plain stub carrying the workspace root path.
        const itemId = typeof item.id === 'string' ? item.id : undefined;
        selectedWorkspace = workspaces.find(w => w.id === item.id)
          ?? findWorkspaceForPath(workspaces, typeof itemId === 'string' ? itemId : item.rootPath?.fsPath ?? '');
      } else {
        selectedWorkspace = await pickWorkspace();
      }

      if (!selectedWorkspace) {
        return;
      }

      try {
        await analyzeWorkspaceCompleteness(selectedWorkspace, ramrosDocProvider, Ros2CliService.getInstance());
      } catch (error) {
        void vscode.window.showErrorMessage(`Workspace analysis failed: ${(error as Error).message}`);
      }
    }),
    
    vscode.commands.registerCommand('ramros.createPackage', async (options?: Record<string, unknown>) => {
      if (options && typeof options.packageName === 'string') {
        // Programmatic invocation: run the same validation as the wizard so
        // traversal paths or shell metacharacters cannot reach the file
        // system or the `ros2 pkg create` command line.
        const validation = new PackageFormValidator().validatePackageName(options.packageName, []);
        if (!validation.isValid) {
          void vscode.window.showErrorMessage(
            `Invalid package name '${options.packageName}': ${validation.errors.join(' ')}`
          );
          return;
        }
        console.log('[DEBUG] createPackage command received options:', JSON.stringify(options, null, 2));
        const config = {
          packageName: options.packageName,
          description: typeof options.description === 'string' ? options.description : '',
          authorName: typeof options.authorName === 'string' ? options.authorName : '',
          authorEmail: typeof options.authorEmail === 'string' ? options.authorEmail : '',
          license: typeof options.license === 'string' ? options.license : 'Apache-2.0',
          buildType: options.buildType as 'ament_cmake' | 'ament_python' | 'cmake',
          template: options.template as 'empty' | 'minimal-cpp' | 'minimal-python' | 'standard' | 'interface',
          nodeName: typeof options.nodeName === 'string' ? options.nodeName : undefined,
          dependencies: Array.isArray(options.dependencies) ? options.dependencies : [],
          interfaces: Array.isArray(options.interfaces) ? options.interfaces : undefined,
          includeTemplateNode: typeof options.includeTemplateNode === 'boolean' ? options.includeTemplateNode : undefined,
        };
        console.log('[DEBUG] Config created:', JSON.stringify(config, null, 2));
        
        const workspaces = treeProvider.getWorkspaces();
        if (workspaces.length === 0) {
          throw new Error('No ROS2 workspace found. Please create or import a workspace first.');
        }
        
        const targetWorkspace = workspaces[0];
        await packageCreator.createPackage(targetWorkspace.rootPath.fsPath, config);
        await treeProvider.refresh();
        void vscode.window.showInformationMessage(`Package '${config.packageName}' created successfully!`);
        return;
      }
      
      await runCreatePackageWizard({
        packageCreator,
        getWorkspaces: () => treeProvider.getWorkspaces(),
        refresh: () => treeProvider.refresh(),
        validatePackageName: (name) => {
          const workspaces = treeProvider.getWorkspaces();
          const targetWorkspace = workspaces[0];
          if (!targetWorkspace) {
            return Promise.resolve({ isValid: true });
          }
          return duplicateDetector.validateNewPackageName(name, targetWorkspace.id, workspaces);
        },
      });
    }),
    
    vscode.commands.registerCommand('ramros.buildPackage', async (treeItem?: TreeItemBase) => {
      const workspaces = treeProvider.getWorkspaces();
      if (workspaces.length === 0) {
        void vscode.window.showWarningMessage('No ROS2 workspaces found');
        return;
      }
      
      let packageNameToBuild: string | undefined;
      let packagePath: string | undefined;
      
      if (treeItem && 'getPackageInfo' in treeItem && typeof treeItem.getPackageInfo === 'function') {
        const packageInfo = treeItem.getPackageInfo();
        packageNameToBuild = packageInfo.name;
        packagePath = packageInfo.path;
      }
      
      const selectedWorkspace = packagePath
        ? await resolveWorkspaceForPath(packagePath)
        : await pickWorkspace();
      if (!selectedWorkspace) return;
      
      const buildType = await vscode.window.showQuickPick(
        [
          { label: 'standard', description: 'Standard colcon build' },
          { label: 'symlink', description: 'Build with --symlink-install' },
          { label: 'clean-standard', description: 'Clean build (standard)' },
          { label: 'clean-symlink', description: 'Clean build with symlink' }
        ],
        { placeHolder: 'Select build type' }
      );
      
      if (!buildType) return;
      
      const useSymlinkInstall = buildType.label === 'symlink' || buildType.label === 'clean-symlink';
      const cleanFirst = buildType.label === 'clean-standard' || buildType.label === 'clean-symlink';
      
      await terminalManager.buildWorkspace(selectedWorkspace, {
        packageName: packageNameToBuild,
        useSymlinkInstall,
        cleanFirst
      });
    }),
    
    vscode.commands.registerCommand('ramros.runNode', async (treeItem?: TreeItemBase) => {
      const workspaces = treeProvider.getWorkspaces();
      if (workspaces.length === 0) {
        void vscode.window.showWarningMessage('No ROS2 workspaces found');
        return;
      }

      let nodeToRun: NodeInfo | undefined;

      if (treeItem && 'getNodeInfo' in treeItem && typeof treeItem.getNodeInfo === 'function') {
        nodeToRun = treeItem.getNodeInfo();
      } else {
        const allNodes = workspaces
          .flatMap(w => w.packages || [])
          .flatMap(p => p.nodes);

        if (allNodes.length === 0) {
          void vscode.window.showWarningMessage('No nodes found in workspace');
          return;
        }

        const nodeNames = allNodes.map(n => `${n.name} (${n.path})`);
        const selected = await vscode.window.showQuickPick(nodeNames, {
          placeHolder: 'Select a node to run'
        });

        if (!selected) return;

        nodeToRun = allNodes.find(n => `${n.name} (${n.path})` === selected);

        if (!nodeToRun) return;

        // Palette invocation: offer the options wizard; the tree play button
        // above stays a zero-extra-keystroke direct start.
        const startMode = await vscode.window.showQuickPick(['Start', 'Start with options…'], {
          placeHolder: `Run ${nodeToRun.name}`
        });
        if (!startMode) return;
        if (startMode === 'Start with options…') {
          await startNodeWithOptions(nodeToRun);
          return;
        }
      }

      if (!nodeToRun) return;

      const selectedWorkspace = await resolveWorkspaceForPath(nodeToRun.path);
      if (!selectedWorkspace) return;

      const setupBashPath = path.join(selectedWorkspace.rootPath.fsPath, 'install', 'setup.bash');

      let runCommand: string;
      if (fs.existsSync(setupBashPath)) {
        runCommand = `source "${setupBashPath}" && ros2 run ${shellDoubleQuote(nodeToRun.packageName)} ${shellDoubleQuote(nodeToRun.name)}`;
      } else {
        runCommand = `ros2 run ${shellDoubleQuote(nodeToRun.packageName)} ${shellDoubleQuote(nodeToRun.name)}`;
      }

      await terminalManager.executeInNewTerminal(runCommand, selectedWorkspace, `Node: ${nodeToRun.name}`);
    }),

    vscode.commands.registerCommand('ramros.runNodeWithOptions', async (treeItem?: TreeItemBase) => {
      const workspaces = treeProvider.getWorkspaces();
      if (workspaces.length === 0) {
        void vscode.window.showWarningMessage('No ROS2 workspaces found');
        return;
      }

      let nodeToRun: NodeInfo | undefined;

      if (treeItem && 'getNodeInfo' in treeItem && typeof treeItem.getNodeInfo === 'function') {
        nodeToRun = treeItem.getNodeInfo();
      } else {
        const allNodes = workspaces
          .flatMap(w => w.packages || [])
          .flatMap(p => p.nodes);
        if (allNodes.length === 0) {
          void vscode.window.showWarningMessage('No nodes found in workspace');
          return;
        }
        const nodeNames = allNodes.map(n => `${n.name} (${n.path})`);
        const selected = await vscode.window.showQuickPick(nodeNames, {
          placeHolder: 'Select a node to run with options'
        });
        if (!selected) return;
        nodeToRun = allNodes.find(n => `${n.name} (${n.path})` === selected);
      }

      if (!nodeToRun) return;
      await startNodeWithOptions(nodeToRun);
    }),
    
    vscode.commands.registerCommand('ramros.debugNode', async (treeItem?: TreeItemBase) => {
      const workspaces = treeProvider.getWorkspaces();
      if (workspaces.length === 0) {
        void vscode.window.showWarningMessage('No ROS2 workspaces found');
        return;
      }
      
      let nodeToDebug: NodeInfo | undefined;
      
      if (treeItem && 'getNodeInfo' in treeItem && typeof treeItem.getNodeInfo === 'function') {
        nodeToDebug = treeItem.getNodeInfo();
      } else {
        const allNodes = workspaces
          .flatMap(w => w.packages || [])
          .flatMap(p => p.nodes);
        
        if (allNodes.length === 0) {
          void vscode.window.showWarningMessage('No nodes found in workspace');
          return;
        }
        
        const nodeNames = allNodes.map(n => `${n.name} (${n.path})`);
        const selected = await vscode.window.showQuickPick(nodeNames, {
          placeHolder: 'Select a node to debug'
        });
        
        if (!selected) return;
        
        nodeToDebug = allNodes.find(n => `${n.name} (${n.path})` === selected);
      }
      
      if (!nodeToDebug) return;
      
      const selectedWorkspace = await resolveWorkspaceForPath(nodeToDebug.path);
      if (!selectedWorkspace) return;
      
      const debugConfig = {
        type: nodeToDebug.language === 'cpp' ? 'cppdbg' : 'python',
        request: 'launch',
        name: `Debug ${nodeToDebug.name}`,
        program: nodeToDebug.language === 'cpp' 
          ? path.join(selectedWorkspace.installPath?.fsPath || '', nodeToDebug.packageName, 'lib', nodeToDebug.packageName, nodeToDebug.name)
          : nodeToDebug.path,
        cwd: selectedWorkspace.rootPath.fsPath,
        env: {
          ...process.env,
          AMENT_PREFIX_PATH: selectedWorkspace.installPath?.fsPath || ''
        }
      };
      
      await vscode.debug.startDebugging(vscode.workspace.workspaceFolders?.[0], debugConfig);
    }),
    
    vscode.commands.registerCommand('ramros.openPackageTerminal', async (treeItem?: TreeItemBase) => {
      const workspaces = treeProvider.getWorkspaces();
      if (workspaces.length === 0) {
        void vscode.window.showWarningMessage('No ROS2 workspaces found');
        return;
      }
      
      let packagePath: string | undefined;
      
      if (treeItem && 'getPackageInfo' in treeItem && typeof treeItem.getPackageInfo === 'function') {
        const packageInfo = treeItem.getPackageInfo();
        packagePath = packageInfo.path;
      }
      
      if (!packagePath) {
        const packages = workspaces.flatMap(w => w.packages || []);
        if (packages.length === 0) {
          void vscode.window.showWarningMessage('No packages found');
          return;
        }
        
        const packageNames = packages.map(p => p.name);
        const selected = await vscode.window.showQuickPick(packageNames, {
          placeHolder: 'Select a package'
        });
        
        if (!selected) return;
        
        const pkg = packages.find(p => p.name === selected);
        if (!pkg) return;
        
        packagePath = pkg.path;
      }
      
      const selectedWorkspace = await resolveWorkspaceForPath(packagePath);
      if (!selectedWorkspace) return;
      
      await terminalManager.openPackageTerminal(selectedWorkspace, packagePath);
    }),
    
    vscode.commands.registerCommand('ramros.interface.showDefinition', async (treeItem?: TreeItemBase | TreeItemBase[]) => {
      const qualifiedName = resolveInterfaceQualifiedName(treeItem);
      if (!qualifiedName) {
        void vscode.window.showWarningMessage('No interface selected');
        return;
      }
      await showInterfaceDefinition(qualifiedName, resolveInterfacePath(treeItem));
    }),

    vscode.commands.registerCommand('ramros.createLaunchFile', async (arg?: TreeItemBase) => {
      const workspaces = treeProvider.getWorkspaces();
      if (workspaces.length === 0) {
        void vscode.window.showWarningMessage('No ROS2 workspaces found');
        return;
      }

      let presetPackage = resolvePresetPackageForLaunch(arg);
      if (!presetPackage && !resolveWorkspaceForLaunch(arg, workspaces)) {
        presetPackage = await pickTargetPackage(workspaces);
        if (!presetPackage) return;
      }

      const selectedWorkspace = presetPackage
        ? findWorkspaceForPath(workspaces, presetPackage.path) ?? await pickWorkspace()
        : resolveWorkspaceForLaunch(arg, workspaces) ?? await pickWorkspace();
      if (!selectedWorkspace) return;

      const workspacePath = selectedWorkspace.rootPath.fsPath;

      const wizard = new LaunchWizard(workspacePath, packageDiscovery, presetPackage);
      await wizard.run();
    }),
    
    vscode.commands.registerCommand('ramros.runLaunchFile', async (arg?: TreeItemBase) => {
      const workspaces = treeProvider.getWorkspaces();
      if (workspaces.length === 0) {
        void vscode.window.showWarningMessage('No ROS2 workspaces found');
        return;
      }
      
      let launchFileToRun: LaunchFileInfo | undefined;
      
      if (arg && 'getLaunchFileInfo' in arg) {
        launchFileToRun = (arg as unknown as { getLaunchFileInfo: () => LaunchFileInfo }).getLaunchFileInfo();
      } else {
        const allLaunchFiles = workspaces
          .flatMap(w => w.packages || [])
          .flatMap(p => p.launchFiles);
        
        if (allLaunchFiles.length === 0) {
          void vscode.window.showWarningMessage('No launch files found in workspace');
          return;
        }
        
        const fileNames = allLaunchFiles.map(f => f.name);
        const selected = await vscode.window.showQuickPick(fileNames, {
          placeHolder: 'Select a launch file to run'
        });
        
        if (!selected) return;
        
        launchFileToRun = allLaunchFiles.find(f => f.name === selected);
      }
      
      if (!launchFileToRun) return;
      
      const selectedWorkspace = await resolveWorkspaceForPath(launchFileToRun.path);
      if (!selectedWorkspace) return;

      const setupBashPath = path.join(selectedWorkspace.rootPath.fsPath, 'install', 'setup.bash');
      
      let runCommand: string;
      if (fs.existsSync(setupBashPath)) {
        runCommand = `source "${setupBashPath}" && ros2 launch ${shellDoubleQuote(launchFileToRun.packageName)} ${shellDoubleQuote(launchFileToRun.name)}`;
      } else {
        runCommand = `ros2 launch ${shellDoubleQuote(launchFileToRun.packageName)} ${shellDoubleQuote(launchFileToRun.name)}`;
      }
      
      await terminalManager.executeInNewTerminal(runCommand, selectedWorkspace, `Launch: ${launchFileToRun.name}`);
    }),
    
    vscode.commands.registerCommand('ramros.addNodeToPackage', async (arg?: TreeItemBase | Record<string, unknown>) => {
      const workspaces = treeProvider.getWorkspaces();
      if (workspaces.length === 0) {
        void vscode.window.showWarningMessage('No ROS2 workspaces found');
        return;
      }

      // Programmatic path: handle options object for e2e tests / automation
      if (arg && typeof arg === 'object' && !('getPackageInfo' in arg) && 'packageName' in arg) {
        const opts = arg as {
          packageName: string;
          nodeType: 'node' | 'interface';
          language?: 'cpp' | 'python';
          nodeName?: string;
          template?: boolean;
          dependencies?: string[];
          interfaceType?: 'message' | 'service' | 'action';
          interfaceName?: string;
          definition?: string;
        };

        const pkg = workspaces.flatMap(w => w.packages || []).find(p => p.name === opts.packageName);
        if (!pkg) {
          void vscode.window.showErrorMessage(`Package '${opts.packageName}' not found`);
          return;
        }

        // Programmatic invocation: same validators as the wizard, so names
        // with path separators or shell metacharacters are rejected before
        // they reach file writes or command lines.
        const validator = new PackageFormValidator();
        if (opts.nodeType === 'interface') {
          const nameError = validator.validateInterfaceName(opts.interfaceName ?? '');
          if (nameError) {
            void vscode.window.showErrorMessage(`Invalid interface name: ${nameError}`);
            return;
          }
        } else {
          const nameError = validator.validateNodeNameInput(opts.nodeName ?? '');
          if (nameError) {
            void vscode.window.showErrorMessage(`Invalid node name: ${nameError}`);
            return;
          }
        }

        try {
          if (opts.nodeType === 'interface') {
            await packageCreator.addInterfaceToPackage(pkg.path, pkg.name, {
              type: opts.interfaceType as 'message' | 'service' | 'action',
              name: opts.interfaceName!,
              definition: opts.definition!,
            });
          } else {
            await packageCreator.addNodeToPackage(pkg.path, pkg.name, {
              nodeType: opts.language as 'cpp' | 'python',
              nodeName: opts.nodeName!,
              includeTemplateNode: opts.template ?? true,
              dependencies: opts.dependencies ?? [],
            });
          }
          await treeProvider.refresh();
          void vscode.window.showInformationMessage(`Added to package '${pkg.name}'`);
        } catch (error: unknown) {
          const message = error instanceof Error ? error.message : 'Unknown error';
          void vscode.window.showErrorMessage(`Failed to add: ${message}`);
        }
        return;
      }

      const treeItem = arg as TreeItemBase | undefined;

      let selectedPackage: PackageInfo | undefined;
      
      if (treeItem && 'getPackageInfo' in treeItem && typeof treeItem.getPackageInfo === 'function') {
        selectedPackage = treeItem.getPackageInfo();
      }
      
      if (!selectedPackage) {
        const packages = workspaces.flatMap(w => w.packages || []);
        if (packages.length === 0) {
          void vscode.window.showWarningMessage('No packages found');
          return;
        }
        
        const packageNames = packages.map(p => p.name);
        const selected = await vscode.window.showQuickPick(packageNames, {
          placeHolder: 'Select a package'
        });
        
        if (!selected) return;
        
        selectedPackage = packages.find(p => p.name === selected);
      }
      
      if (!selectedPackage) return;
      
      await runAddToPackageWizard(selectedPackage, {
        packageCreator,
        refresh: () => treeProvider.refresh(),
      });
    }),
    
    vscode.commands.registerCommand('ramros.launchTool.rviz2', async () => {
      const picked = await pickWorkspaceForOverlayTool(context);
      if (!picked?.workspace) return;
      await terminalManager.executeInNewTerminal('rviz2', picked.workspace, 'RVIZ2', { source: picked.source });
    }),

    vscode.commands.registerCommand('ramros.launchTool.rviz2WithOptions', async () => {
      const picked = await pickWorkspaceForOverlayTool(context);
      if (!picked?.workspace) return;
      const domain = await pickDomain();
      if (domain === undefined) {
        return; // aborted: start nothing
      }
      await terminalManager.executeInNewTerminal('rviz2', picked.workspace, 'RVIZ2', {
        source: picked.source,
        domainId: domain.useDomain,
      });
    }),

    vscode.commands.registerCommand('ramros.launchTool.rqt_graph', async () => {
      const picked = await pickWorkspaceForOverlayTool(context);
      if (!picked?.workspace) return;
      // ros2 run is the canonical, distro-independent entry point (the bare
      // rqt_graph binary is not on PATH in newer distros like lyrical).
      await terminalManager.executeInNewTerminal('ros2 run rqt_graph rqt_graph', picked.workspace, 'rqt_graph', { source: picked.source });
    }),

    vscode.commands.registerCommand('ramros.launchTool.rqtGraphWithOptions', async () => {
      const picked = await pickWorkspaceForOverlayTool(context);
      if (!picked?.workspace) return;
      const domain = await pickDomain();
      if (domain === undefined) {
        return; // aborted: start nothing
      }
      await terminalManager.executeInNewTerminal('ros2 run rqt_graph rqt_graph', picked.workspace, 'rqt_graph', {
        source: picked.source,
        domainId: domain.useDomain,
      });
    }),
    
    vscode.commands.registerCommand('ramros.bag.startRecording', async () => {
      if (bagSession.isRecording) {
        void vscode.window.showWarningMessage('Recording is already in progress');
        return;
      }
      
      const workspace = await pickWorkspace();
      if (!workspace) return;
      
      const filename = await vscode.window.showInputBox({
        prompt: 'Enter bag filename (without extension)',
        placeHolder: 'my_recording'
      });
      
      if (!filename) return;

      // The filename lands in a shell command line; reject anything that
      // could break out of quoting instead of trusting the input box.
      if (!/^[A-Za-z0-9._-]+$/.test(filename)) {
        void vscode.window.showWarningMessage(
          'Invalid bag filename. Use only letters, digits, dots, underscores and dashes.'
        );
        return;
      }

      const folders = await vscode.window.showOpenDialog({
        canSelectFiles: false,
        canSelectFolders: true,
        canSelectMany: false,
        title: 'Select folder to store bag file'
      });
      
      if (!folders || folders.length === 0) return;
      
      const outputDir = folders[0].fsPath;
      const outputPath = path.join(outputDir, filename);
      
      const topics = await discoverTopics();
      
      if (topics.length === 0) {
        void vscode.window.showWarningMessage('No topics available to record');
        return;
      }
      
      const topicItems = topics.map(topic => ({
        label: topic,
        picked: true,
        description: topic
      }));
      
      const selectedTopics = await vscode.window.showQuickPick(topicItems, {
        canPickMany: true,
        placeHolder: 'Select topics to record (use Ctrl+A / Cmd+A to select all, or click individual items)',
        title: `Rosbag Recording: ${filename}`
      });
      
      if (!selectedTopics || selectedTopics.length === 0) return;
      
      const topicArgs = selectedTopics.map(t => shellDoubleQuote(t.label)).join(' ');
      // Topics must be passed to the --topics flag (they are no longer positional),
      // and `script` provides a TTY so ros2 bag record accepts SPACE for pause/resume.
      // The whole inner command is single-quoted for `script -c`; shellSingleQuote
      // escapes embedded quotes so paths cannot break out.
      const innerCommand = `ros2 bag record -o ${shellDoubleQuote(outputPath)} --topics ${topicArgs}`;
      const recordCommand = `script -q -c ${shellSingleQuote(innerCommand)} /dev/null`;
      
      const recordingTerminal = await terminalManager.executeInNewTerminal(recordCommand, workspace, `Bag Record: ${filename}`);
      
      // Update state
      bagSession.setRecordingTerminal(recordingTerminal);
      BagRecordItem.setRecordingState(true);
      BagRecordItem.setPausedState(false);
      
      // Update tree view
      await toolsTreeProvider.refresh();
    }),
    
    vscode.commands.registerCommand('ramros.bag.pauseResumeRecording', async () => {
      const recordingTerminal = bagSession.recordingTerminal;
      if (!recordingTerminal) {
        void vscode.window.showWarningMessage('No active recording');
        return;
      }
      
      // Show the terminal first to ensure it can receive input
      await terminalManager.focusAndWait(recordingTerminal);
      
      // Send space key to toggle pause/resume in ros2 bag record
      // Send as raw keystroke (shouldExecute=false means don't add newline)
      recordingTerminal.sendText(' ', false);
      const isPaused = bagSession.toggleRecordingPause();
      BagRecordItem.setPausedState(isPaused);
      
      await toolsTreeProvider.refresh();
      
      const status = isPaused ? 'paused' : 'resumed';
      void vscode.window.showInformationMessage(`Recording ${status}`);
    }),
    
    vscode.commands.registerCommand('ramros.bag.stopRecording', async () => {
      if (bagSession.isRecording) {
        await bagSession.stopRecordingAsync();

        // Reset instances to clear the controls from the tree
        BagFilesFolderItem.resetInstances();

        // Update tree view
        await toolsTreeProvider.refresh();

        void vscode.window.showInformationMessage('Recording stopped');
      } else {
        void vscode.window.showWarningMessage('No active recording');
      }
    }),
    
    vscode.commands.registerCommand('ramros.live.refresh', async () => {
      await liveTreeProvider.refresh();
      void vscode.window.showInformationMessage('ROS2 Live view refreshed');
    }),
    
    vscode.commands.registerCommand('ramros.live.settings', async () => {
      liveTreeProvider.openSettings();
    }),

    vscode.commands.registerCommand('ramros.live.stopNode', async (treeItem?: TreeItemBase | TreeItemBase[]) => {
      const nodeName = resolveNodeName(treeItem);
      if (!nodeName) {
        void vscode.window.showWarningMessage('No node selected');
        return;
      }

      const choice = await vscode.window.showWarningMessage(
        `Stop node ${nodeName}?`,
        { modal: true },
        'Stop Node',
        'Cancel'
      );
      if (choice !== 'Stop Node') {
        return;
      }

      // RAMROS starts nodes in terminals named "Node: <ros name>" (or
      // "Node: <alias> (<ros name>)"). Only those terminals are stoppable:
      // send SIGINT (Ctrl+C) so the node shuts down gracefully, then close
      // the terminal.
      const terminals = vscode.window.terminals;
      const candidates = terminals.filter(t => t.name.startsWith('Node: '));
      const byRosName = candidates.filter(t => terminalTitleMatchesNode(t.name, nodeName));
      if (byRosName.length === 0) {
        void vscode.window.showWarningMessage(
          `Node ${nodeName} was not started by RAMROS (no matching terminal found). Stop it where it is running.`,
          'OK'
        );
        return;
      }

      for (const terminal of byRosName) {
        terminal.sendText('\x03');
      }
      await delay(SIGINT_SETTLE_MS);
      for (const terminal of byRosName) {
        terminal.dispose();
      }
      void vscode.window.showInformationMessage(`Stop signal sent to node ${nodeName}`);
    }),
    
    vscode.commands.registerCommand('ramros.tools.healthCheck', async () => {
      await runHealthCheck(ramrosDocProvider);
    }),
    
    vscode.commands.registerCommand('ramros.live.echoTopic', async (treeItem?: TreeItemBase | TreeItemBase[]) => {
      const topicName = resolveTopicName(treeItem) ?? await pickTopic();
      if (!topicName) return;
      
      const workspace = await pickWorkspace();
      if (!workspace) return;
      
      await terminalManager.executeInNewTerminal(`ros2 topic echo "${topicName}"`, workspace, `Echo: ${topicName}`);
    }),
    
    vscode.commands.registerCommand('ramros.live.hzTopic', async (treeItem?: TreeItemBase | TreeItemBase[]) => {
      const topicName = resolveTopicName(treeItem) ?? await pickTopic();
      if (!topicName) return;
      
      const workspace = await pickWorkspace();
      if (!workspace) return;
      
      await terminalManager.executeInNewTerminal(`ros2 topic hz "${topicName}"`, workspace, `Hz: ${topicName}`);
    }),

    vscode.commands.registerCommand('ramros.live.bridgeTopic', async (treeItem?: TreeItemBase | TreeItemBase[]) => {
      const topicName = resolveTopicName(treeItem) ?? await pickTopic();
      if (!topicName) return;

      // The type is resolved lazily inside the flow — only the domainBridge
      // strategy needs it, so the zenoh path pays no extra CLI round trip.
      await runBridgeFlow('topic', topicName, resolveTopicMessageType(treeItem));
    }),

    vscode.commands.registerCommand('ramros.live.bridgeService', async (treeItem?: TreeItemBase | TreeItemBase[]) => {
      const serviceItem = resolveServiceItem(treeItem);
      if (!serviceItem) {
        void vscode.window.showWarningMessage('No service selected');
        return;
      }

      await runBridgeFlow('service', serviceItem.name, serviceItem.type);
    }),

    vscode.commands.registerCommand('ramros.live.bridgeAction', async (treeItem?: TreeItemBase | TreeItemBase[]) => {
      const actionItem = resolveActionItem(treeItem);
      if (!actionItem) {
        void vscode.window.showWarningMessage('No action selected');
        return;
      }

      await runBridgeFlow('action', actionItem.name, actionItem.type);
    }),

    vscode.commands.registerCommand('ramros.live.toggleEnabled', async () => {
      await liveTreeProvider.setEnabled(!liveTreeProvider.isEnabled());
    }),

    vscode.commands.registerCommand('ramros.live.pubTopic', async (treeItem?: TreeItemBase | TreeItemBase[]) => {
      const cli = Ros2CliService.getInstance();
      const topicName = resolveTopicName(treeItem) ?? await pickTopic();
      if (!topicName) return;

      await publishToTopic(
        topicName,
        resolveTopicMessageType(treeItem),
        terminalManager,
        pickWorkspace,
        cli
      );
    }),
    
    vscode.commands.registerCommand('ramros.live.callService', async (treeItem?: TreeItemBase | TreeItemBase[]) => {
      const cli = Ros2CliService.getInstance();
      const serviceItem = resolveServiceItem(treeItem);
      if (!serviceItem) {
        void vscode.window.showWarningMessage('No service selected');
        return;
      }
      
      const serviceName = serviceItem.name;
      const serviceType = serviceItem.type ?? await cli.getServiceType(serviceName) ?? undefined;
      if (!serviceType) {
        void vscode.window.showErrorMessage('Could not resolve service type');
        return;
      }
      
      // Workspace resolution before structure loading (overlay sourcing).
      const workspace = await pickWorkspace();
      
      if (workspace) {
        lastResolvedWorkspace = workspace;
        const loader = getInterfaceLoader(cli);
        try {
          const structure = await loader.loadStructure(serviceType);
          const { buildFormHtml } = await import('./core/form-html');
          const html = buildFormHtml(structure, {
            nonce: createNonce(),
            cspSource: '',
            title: `Call ${serviceName} (${serviceType})`,
            kind: 'service'
          });
          showMessageInputPanel({
            key: `service:${serviceName}`,
            title: `Call: ${serviceName}`,
            kind: 'service',
            html,
            onMessage: async (message: MessageInputCommand) => {
              const json = valuesToJson(structure.fields, { ...fieldDefaults(structure.fields), ...message.values });
              const response = await cli.callService(serviceName, serviceType, json);
              if (response === null) {
                throw new Error(`Service call to ${serviceName} failed`);
              }
              await showInReadonlyDoc(ramrosDocProvider, `service-call/${serviceName}`, response);
              void vscode.window.showInformationMessage(`Service call to ${serviceName} completed`);
              return { type: 'result', ok: true, message: 'Service called' };
            }
          });
          return;
        } catch {
          // Structure loading failed: raw JSON input flow below.
        }
      }
      
      const json = await vscode.window.showInputBox({
        prompt: `Request JSON for ${serviceName}`,
        value: '{}',
        validateInput: value => {
          try {
            JSON.parse(value);
            return undefined;
          } catch {
            return 'Request must be valid JSON';
          }
        }
      });
      if (json === undefined) return;
      
      const response = await cli.callService(serviceName, serviceType, json);
      if (response === null) {
        void vscode.window.showErrorMessage('Service call failed');
        return;
      }
      
      await showInReadonlyDoc(ramrosDocProvider, `service-call/${serviceName}`, response);
      void vscode.window.showInformationMessage(`Service call to ${serviceName} completed`);
    }),
    
    vscode.commands.registerCommand('ramros.live.setParameter', async (itemOrNode: TreeItemBase | string, paramName?: string, currentValue?: string) => {
      let nodeName: string;
      let name: string;
      let current: string | undefined;

      if (typeof itemOrNode === 'string') {
        nodeName = itemOrNode;
        name = paramName ?? '';
        current = currentValue;
      } else if (itemOrNode instanceof LiveParameterItem) {
        nodeName = itemOrNode.getNodeName();
        name = itemOrNode.getParamName();
        current = itemOrNode.getValue() ?? '';
      } else {
        void vscode.window.showWarningMessage('No parameter selected');
        return;
      }

      const cli = Ros2CliService.getInstance();
      const { value: freshValue, type } = await cli.getParameterValueWithType(nodeName, name);
      const value = await vscode.window.showInputBox({
        prompt: type
          ? `Set parameter ${name} on ${nodeName} (${type})`
          : `Set parameter ${name} on ${nodeName}`,
        value: freshValue ?? current ?? '',
        validateInput: value => validateParameterValue(value, type)
      });
      if (value === undefined) return;

      const success = await cli.setParameterValue(nodeName, name, value);
      if (success) {
        NodeParametersItem.invalidateCache(nodeName);
        void vscode.window.showInformationMessage(`Parameter ${name} set`);
        await liveTreeProvider.refresh();
      } else {
        void vscode.window.showErrorMessage(`Failed to set parameter ${name}`);
      }
    }),

    vscode.commands.registerCommand('ramros.live.updateParameters', async (item?: TreeItemBase | TreeItemBase[]) => {
      const parametersItem = resolveParametersItem(item);
      if (!parametersItem) {
        void vscode.window.showWarningMessage('No parameters entry selected');
        return;
      }

      NodeParametersItem.invalidateCache(parametersItem.getNodeName());
      await liveTreeProvider.refresh();
    }),

    vscode.commands.registerCommand('ramros.bag.selectFile', async () => {
      let bagPath: string | undefined;

      interface BagSourcePickItem extends vscode.QuickPickItem {
        action?: 'browse' | 'workspace';
      }

      const sourcePick = await vscode.window.showQuickPick<BagSourcePickItem>([
        { label: '$(file-directory) Browse files…', action: 'browse' },
        { label: '$(archive) Choose from workspace', action: 'workspace' },
      ], { placeHolder: 'Select a bag file' });

      if (sourcePick?.action === 'workspace') {
        const workspaceBags = await findWorkspaceBags();
        if (workspaceBags.length === 0) {
          void vscode.window.showWarningMessage('No bag files found in workspace');
          return;
        }
        const picked = await vscode.window.showQuickPick(
          workspaceBags.map(bag => ({ label: path.basename(bag), description: bag })),
          { placeHolder: 'Select a bag file from the workspace' }
        );
        if (!picked) return;
        bagPath = picked.description;
      } else {
        const selectedUris = await vscode.window.showOpenDialog({
          openLabel: 'Select Bag File',
          filters: {
            'ROS2 Bag Files': ['db3', 'mcap']
          },
          canSelectMany: false
        });

        if (!selectedUris || selectedUris.length === 0) return;
        bagPath = selectedUris[0].fsPath;
      }

      if (!bagPath) return;

      await selectBagForPlayback(bagPath);
    }),
    
    vscode.commands.registerCommand('ramros.bag.playPause', async () => {
      const bagPath = bagSession.selectedBagPath ?? BagPlayItem.getSelectedBag();
      
      if (!bagPath) {
        void vscode.window.showWarningMessage('No bag file selected');
        return;
      }
      
      const workspace = await pickWorkspace();
      if (!workspace) return;
      
      const playbackTerminal = bagSession.playbackTerminal;
      if (playbackTerminal) {
        // Show the terminal first to ensure it can receive input
        await terminalManager.focusAndWait(playbackTerminal);
        
        // Toggle pause - send space key to ros2 bag play
        playbackTerminal.sendText(' ', false);
        const isPaused = bagSession.togglePlaybackPause();
        BagPlayControlItem.setPlayingState(true, isPaused);
        await toolsTreeProvider.refresh();
      } else {
        // Start playback with script wrapper for keyboard control support
        const loopArg = bagSession.isPlaybackLooping ? '--loop' : '';
        const playCommand = `script -q -c ${shellSingleQuote(`ros2 bag play ${shellDoubleQuote(bagPath)} ${loopArg}`)} /dev/null`;
        const newTerminal = await terminalManager.executeInNewTerminal(playCommand, workspace, `Bag Play: ${path.basename(bagPath)}`);
        bagSession.setPlaybackTerminal(newTerminal);
        BagPlayControlItem.setPlayingState(true, false);
        await toolsTreeProvider.refresh();
      }
    }),
    
    vscode.commands.registerCommand('ramros.bag.toggleLoop', async () => {
      const isLooping = bagSession.togglePlaybackLoop();
      BagLoopItem.setLoopingState(isLooping);

      void vscode.window.showInformationMessage(`Loop playback ${isLooping ? 'enabled' : 'disabled'}`);

      // If currently playing, restart with the new loop setting
      if (bagSession.isPlaying) {
        await bagSession.stopPlaybackAsync();
        BagPlayControlItem.setPlayingState(false, false);

        const bagPath = bagSession.selectedBagPath ?? BagPlayItem.getSelectedBag();
        if (bagPath) {
          const workspace = await pickWorkspace();
          if (workspace) {
            await terminalManager.waitForRestart();
            const loopArg = isLooping ? '--loop' : '';
            const playCommand = `script -q -c ${shellSingleQuote(`ros2 bag play ${shellDoubleQuote(bagPath)} ${loopArg}`)} /dev/null`;
            const newTerminal = await terminalManager.executeInNewTerminal(playCommand, workspace, `Bag Play: ${path.basename(bagPath)}`);
            bagSession.setPlaybackTerminal(newTerminal);
            BagPlayControlItem.setPlayingState(true, false);
          }
        }
      }

      await toolsTreeProvider.refresh();
    }),

    vscode.commands.registerCommand('ramros.bag.stop', async () => {
      if (bagSession.isPlaying) {
        await bagSession.stopPlaybackAsync();
        BagPlayControlItem.setPlayingState(false, false);

        // Reset instances to clear the controls from the tree
        BagFilesFolderItem.resetInstances();

        await toolsTreeProvider.refresh();
        void vscode.window.showInformationMessage('Bag playback stopped');
      } else {
        void vscode.window.showWarningMessage('No active bag playback');
      }
    }),

    vscode.commands.registerCommand('ramros.bag.addBagFolder', async () => {
      if (!treeProvider.getWorkspaces()[0]) {
        void vscode.window.showWarningMessage('No ROS2 workspace found');
        return;
      }

      const selectedUris = await vscode.window.showOpenDialog({
        canSelectFolders: true,
        canSelectMany: false,
        openLabel: 'Add Bag Folder'
      });

      if (!selectedUris || selectedUris.length === 0) return;

      await getWorkspaceConfigService().addBagFolder(selectedUris[0].fsPath);
      await toolsTreeProvider.refresh();
      void vscode.window.showInformationMessage('Bag folder added');
    }),

    vscode.commands.registerCommand('ramros.bag.removeBagFolder', async (item?: TreeItemBase) => {
      const folder = resolveBagFolderPath(item);
      if (!folder) return;

      await getWorkspaceConfigService().removeBagFolder(folder);
      await toolsTreeProvider.refresh();
    }),

    vscode.commands.registerCommand('ramros.bag.openInRqtBag', async (item?: TreeItemBase) => {
      const bagPath = resolveBagPath(item);
      if (!bagPath) {
        void vscode.window.showWarningMessage('No bag file selected');
        return;
      }

      const workspace = await resolveWorkspaceForPath(bagPath);
      if (!workspace) return;

      await terminalManager.executeInNewTerminal(`rqt_bag ${shellDoubleQuote(bagPath)}`, workspace, `rqt_bag: ${path.basename(bagPath)}`);
    }),

    vscode.commands.registerCommand('ramros.bag.playBagByPath', async (bagPath: string) => {
      if (!bagPath) return;
      await selectBagForPlayback(bagPath);
    })
  );
  
  await treeProvider.refresh();
  await liveTreeProvider.reloadFromWorkspaceConfig();
}

export function deactivate() {
  console.log('RAMROS Extension deactivated');
  treeProvider?.stopAutoRefresh();
}
