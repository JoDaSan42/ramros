import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { RosEnvironmentService } from './core/ros-environment';
import { WorkspaceDetector, WorkspaceInfo, findWorkspaceForPath } from './core/workspace-detector';
import { getWorkspaceBagPaths, scanBagFolder } from './core/bag-discovery';
import { WorkspaceConfigService } from './core/workspace-config-service';
import { DuplicatePackageDetector } from './core/duplicate-package-detector';
import { CacheManager } from './cache/cache-manager';
import { RamrosTreeProvider } from './treeview/tree-provider';
import { ToolsTreeProvider } from './treeview/tools-tree-provider';
import { LiveTreeProvider } from './treeview/live-tree-provider';
import { TerminalManager } from './executor/terminal-manager';
import { BagSessionService } from './executor/bag-session-service';
import { PackageCreator } from './wizard/package-creator';
import { NodeInfo, LaunchFileInfo, PackageDiscoveryService, PackageInfo } from './core/package-discovery';
import { TreeItemBase } from './treeview/base-tree-item';
import { BagPlayItem, BagPlayControlItem, BagLoopItem, BagRecordItem, BagFilesFolderItem, BagFileItem, ExternalBagFolderItem, BagEntriesProvider } from './treeview/bag-items';
import { LaunchWizard } from './wizard/launch-wizard';
import { runCreatePackageWizard, runAddToPackageWizard } from './wizard/package-wizard';
import { RamrosDocProvider, showInReadonlyDoc } from './core/ramros-doc-provider';
import { buildTopicPubCommand } from './core/command-builders';
import { Ros2CliService } from './core/ros2-cli-service';

let cacheManager: CacheManager;
let ramrosDocProvider: RamrosDocProvider;
let terminalManager: TerminalManager;
let treeProvider: RamrosTreeProvider;
let toolsTreeProvider: ToolsTreeProvider;
let liveTreeProvider: LiveTreeProvider;
let packageCreator: PackageCreator;
let bagSession: BagSessionService;
let workspaceConfigService: WorkspaceConfigService | undefined;

const execAsync = promisify(exec);

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

async function resolveWorkspaceForPath(fsPath: string): Promise<WorkspaceInfo | undefined> {
  const workspaces = treeProvider.getWorkspaces();
  return findWorkspaceForPath(workspaces, fsPath) ?? await pickWorkspace();
}

function resolveTopicName(treeItem?: TreeItemBase | TreeItemBase[]): string | undefined {
  const item = Array.isArray(treeItem) ? treeItem[0] : treeItem;
  if (item && 'getTopicName' in item && typeof (item as { getTopicName?: unknown }).getTopicName === 'function') {
    return (item as unknown as { getTopicName: () => string }).getTopicName();
  }
  return undefined;
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

function resolveBagFolderPath(treeItem?: TreeItemBase | TreeItemBase[]): string | undefined {
  const item = Array.isArray(treeItem) ? treeItem[0] : treeItem;
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
  try {
    const { stdout } = await execAsync(command, { encoding: 'utf-8' });
    return stdout.split('\n').filter(line => line.trim().length > 0);
  } catch (error) {
    console.error(`Failed to execute command: ${command}`, error);
    return [];
  }
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
    const { stdout: bagInfoOutput } = await execAsync(`ros2 bag info "${bagPath}"`, { encoding: 'utf-8' });

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

export async function showInterfaceDefinition(qualifiedName: string): Promise<void> {
  try {
    const { stdout } = await execAsync(`ros2 interface show ${qualifiedName}`, { encoding: 'utf-8', timeout: 5000 });
    await showInReadonlyDoc(ramrosDocProvider, `interface/${qualifiedName.replace(/\//g, '-')}`, stdout);
  } catch {
    void vscode.window.showErrorMessage(`Could not show interface ${qualifiedName}. Is the workspace built (colcon build)?`);
  }
}

export async function runHealthCheck(provider: RamrosDocProvider): Promise<void> {
  let stdout = '';
  let stderr = '';
  try {
    ({ stdout, stderr } = await execAsync('ros2 doctor', { encoding: 'utf-8', timeout: 60000 }));
  } catch (error) {
    const err = error as Error & { stdout?: string; stderr?: string };
    stdout = err.stdout ?? '';
    stderr = err.stderr ?? '';
  }
  const combinedOutput = stdout + stderr;
  if (combinedOutput.length === 0) {
    void vscode.window.showWarningMessage('ros2 doctor returned no output');
    return;
  }
  await showInReadonlyDoc(provider, 'ros2-doctor', combinedOutput);
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

export async function activate(context: vscode.ExtensionContext) {
  console.log('RAMROS Extension activated');
  
  const rosEnvironmentService = new RosEnvironmentService();
  
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
  
   const ramrosConfigWatcher = vscode.workspace.createFileSystemWatcher('**/ramros.json');
   ramrosConfigWatcher.onDidChange(() => {
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
    }),
    
    vscode.commands.registerCommand('ramros.createPackage', async (options?: Record<string, unknown>) => {
      if (options && typeof options.packageName === 'string') {
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
      }
      
      if (!nodeToRun) return;
      
      const selectedWorkspace = await resolveWorkspaceForPath(nodeToRun.path);
      if (!selectedWorkspace) return;
      
      const setupBashPath = path.join(selectedWorkspace.installPath?.fsPath || '', 'setup.bash');
      
      let runCommand: string;
      if (fs.existsSync(setupBashPath)) {
        runCommand = `source "${setupBashPath}" && ros2 run ${nodeToRun.packageName} ${nodeToRun.name}`;
      } else {
        runCommand = `ros2 run ${nodeToRun.packageName} ${nodeToRun.name}`;
      }
      
      await terminalManager.executeInNewTerminal(runCommand, selectedWorkspace, `Node: ${nodeToRun.name}`);
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
      await showInterfaceDefinition(qualifiedName);
    }),

    vscode.commands.registerCommand('ramros.createLaunchFile', async (arg?: TreeItemBase) => {
      const workspaces = treeProvider.getWorkspaces();
      if (workspaces.length === 0) {
        void vscode.window.showWarningMessage('No ROS2 workspaces found');
        return;
      }

      const selectedWorkspace = resolveWorkspaceForLaunch(arg, workspaces) ?? await pickWorkspace();
      if (!selectedWorkspace) return;

      const workspacePath = selectedWorkspace.rootPath.fsPath;

      const wizard = new LaunchWizard(workspacePath, packageDiscovery);
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
      
      const setupBashPath = path.join(selectedWorkspace.installPath?.fsPath || '', 'setup.bash');
      
      let runCommand: string;
      if (fs.existsSync(setupBashPath)) {
        runCommand = `source "${setupBashPath}" && ros2 launch ${launchFileToRun.packageName} ${launchFileToRun.name}`;
      } else {
        runCommand = `ros2 launch ${launchFileToRun.packageName} ${launchFileToRun.name}`;
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
      const workspace = await pickWorkspace();
      if (!workspace) return;
      await terminalManager.executeInNewTerminal('rviz2', workspace, 'RVIZ2');
    }),
    
    vscode.commands.registerCommand('ramros.launchTool.rqt_graph', async () => {
      const workspace = await pickWorkspace();
      if (!workspace) return;
      await terminalManager.executeInNewTerminal('rqt_graph', workspace, 'rqt_graph');
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
      
      const topicArgs = selectedTopics.map(t => `"${t.label}"`).join(' ');
      // Topics must be passed to the --topics flag (they are no longer positional),
      // and `script` provides a TTY so ros2 bag record accepts SPACE for pause/resume.
      const recordCommand = `script -q -c 'ros2 bag record -o "${outputPath}" --topics ${topicArgs}' /dev/null`;
      
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
    
    vscode.commands.registerCommand('ramros.live.toggleEnabled', async () => {
      await liveTreeProvider.setEnabled(!liveTreeProvider.isEnabled());
    }),
    
    vscode.commands.registerCommand('ramros.live.pubTopic', async (treeItem?: TreeItemBase | TreeItemBase[]) => {
      const cli = Ros2CliService.getInstance();
      const topicName = resolveTopicName(treeItem) ?? await pickTopic();
      if (!topicName) return;
      
      const messageType = resolveTopicMessageType(treeItem) ?? await cli.getTopicType(topicName) ?? undefined;
      if (!messageType) {
        void vscode.window.showErrorMessage('Could not resolve topic type');
        return;
      }
      
      const modePick = await vscode.window.showQuickPick([
        { label: 'once', description: 'Publish the message once' },
        { label: 'rate', description: 'Publish repeatedly at a rate' }
      ], { placeHolder: 'Select publish mode' });
      if (!modePick) return;
      
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
        if (rateInput === undefined) return;
        rate = parseFloat(rateInput);
      }
      
      const content = await vscode.window.showInputBox({
        prompt: 'Message content (YAML)',
        value: '{}',
        validateInput: value => (value.trim().length > 0 ? undefined : 'Message content is required')
      });
      if (content === undefined || content.trim().length === 0) return;
      
      const workspace = await pickWorkspace();
      if (!workspace) return;
      
      const command = buildTopicPubCommand(topicName, messageType, content, mode, rate);
      await terminalManager.executeInNewTerminal(command, workspace, `Pub: ${topicName}`);
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
    
    vscode.commands.registerCommand('ramros.live.setParameter', async (nodeName: string, paramName: string, currentValue?: string) => {
      const cli = Ros2CliService.getInstance();
      const value = await vscode.window.showInputBox({
        prompt: `Set parameter ${paramName} on ${nodeName}`,
        value: currentValue
      });
      if (value === undefined) return;
      
      const success = await cli.setParameterValue(nodeName, paramName, value);
      if (success) {
        void vscode.window.showInformationMessage(`Parameter ${paramName} set`);
        await liveTreeProvider.refresh();
      } else {
        void vscode.window.showErrorMessage(`Failed to set parameter ${paramName}`);
      }
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
        const playCommand = `script -q -c 'ros2 bag play "${bagPath}" ${loopArg}' /dev/null`;
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
            const playCommand = `script -q -c 'ros2 bag play "${bagPath}" ${loopArg}' /dev/null`;
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

      await terminalManager.executeInNewTerminal(`rqt_bag "${bagPath}"`, workspace, `rqt_bag: ${path.basename(bagPath)}`);
    }),

    vscode.commands.registerCommand('ramros.bag.playBagByPath', async (bagPath: string) => {
      if (!bagPath) return;
      await selectBagForPlayback(bagPath);
    })
  );
  
  await treeProvider.refresh();
}

export function deactivate() {
  console.log('RAMROS Extension deactivated');
  treeProvider?.stopAutoRefresh();
}
