import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { RosEnvironmentService } from './core/ros-environment';
import { WorkspaceDetector, WorkspaceInfo } from './core/workspace-detector';
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
import { BagPlayItem, BagPlayControlItem, BagLoopItem, BagRecordItem, BagFilesFolderItem } from './treeview/bag-items';
import { LaunchWizard } from './wizard/launch-wizard';
import { runCreatePackageWizard, runAddToPackageWizard } from './wizard/package-wizard';

let cacheManager: CacheManager;
let terminalManager: TerminalManager;
let treeProvider: RamrosTreeProvider;
let toolsTreeProvider: ToolsTreeProvider;
let liveTreeProvider: LiveTreeProvider;
let packageCreator: PackageCreator;
let bagSession: BagSessionService;

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

export async function activate(context: vscode.ExtensionContext) {
  console.log('RAMROS Extension activated');
  
  const rosEnvironmentService = new RosEnvironmentService();
  
  cacheManager = new CacheManager({
    onFileChange: (message) => {
      console.log(`[Cache] ${message}`);
    }
  });
  
  const packageDiscovery = new PackageDiscoveryService(cacheManager);
  const workspaceDetector = new WorkspaceDetector(
    () => rosEnvironmentService.detectInstallations(),
    packageDiscovery,
    cacheManager
  );
  
  const duplicateDetector = new DuplicatePackageDetector(cacheManager);
  
   terminalManager = new TerminalManager();
   bagSession = BagSessionService.getInstance();
   
   treeProvider = new RamrosTreeProvider(workspaceDetector, duplicateDetector, packageDiscovery);
  toolsTreeProvider = new ToolsTreeProvider();
  liveTreeProvider = new LiveTreeProvider();
  
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
  
  context.subscriptions.push(
    treeView,
    toolsTreeView,
    liveTreeView,
    cacheManager,
    terminalManager,
    bagSession,
    liveTreeProvider,
    vscode.workspace.onDidChangeWorkspaceFolders(() => {
      void treeProvider.onWorkspaceFoldersChanged();
    }),
    
    vscode.commands.registerCommand('ramros.refreshWorkspaces', async () => {
      await treeProvider.refresh();
      void vscode.window.showInformationMessage('Workspaces refreshed');
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
      });
    }),
    
    vscode.commands.registerCommand('ramros.buildPackage', async (treeItem?: TreeItemBase) => {
      const workspaces = treeProvider.getWorkspaces();
      if (workspaces.length === 0) {
        void vscode.window.showWarningMessage('No ROS2 workspaces found');
        return;
      }
      
      const selectedWorkspace = workspaces[0];
      let packageNameToBuild: string | undefined;
      
      if (treeItem && 'getPackageInfo' in treeItem && typeof treeItem.getPackageInfo === 'function') {
        const packageInfo = treeItem.getPackageInfo();
        packageNameToBuild = packageInfo.name;
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
      
      const selectedWorkspace = workspaces[0];
      
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
      
      const selectedWorkspace = workspaces[0];
      
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
      
      const selectedWorkspace = workspaces[0];
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
      
      await terminalManager.openPackageTerminal(selectedWorkspace, packagePath);
    }),
    
    vscode.commands.registerCommand('ramros.createLaunchFile', async () => {
      const workspaces = treeProvider.getWorkspaces();
      if (workspaces.length === 0) {
        void vscode.window.showWarningMessage('No ROS2 workspaces found');
        return;
      }
      
      const selectedWorkspace = workspaces[0];
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
      
      const selectedWorkspace = workspaces[0];
      
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
      
      if (!selectedTopics) return;
      
      const topicArgs = selectedTopics.map(t => t.label).join(' ');
      // Use script command to enable proper terminal interaction for keyboard controls
      const recordCommand = `script -q -c 'ros2 bag record -o "${outputPath}" ${topicArgs}' /dev/null`;
      
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
      const recordingTerminal = bagSession.recordingTerminal;
      if (recordingTerminal) {
        recordingTerminal.sendText('\x03'); // Ctrl+C
        
        // Clear terminal reference and state
        recordingTerminal.dispose();
        bagSession.setRecordingTerminal(null);
        BagRecordItem.setRecordingState(false);
        BagRecordItem.setPausedState(false);
        
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
    
    vscode.commands.registerCommand('ramros.bag.selectFile', async () => {
      const selectedUris = await vscode.window.showOpenDialog({
        openLabel: 'Select Bag File',
        filters: {
          'ROS2 Bag Files': ['db3', 'mcap']
        },
        canSelectMany: false
      });
      
      if (!selectedUris || selectedUris.length === 0) return;
      
      const bagPath = selectedUris[0].fsPath;
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
      
      // If currently playing, restart with new loop setting
      const playbackTerminal = bagSession.playbackTerminal;
      if (playbackTerminal) {
        // Stop current playback
        playbackTerminal.sendText('\x03'); // Ctrl+C
        playbackTerminal.dispose();
        bagSession.setPlaybackTerminal(null);
        BagPlayControlItem.setPlayingState(false, false);
        
        const bagPath = bagSession.selectedBagPath ?? BagPlayItem.getSelectedBag();
        if (bagPath && isLooping) {
          const workspace = await pickWorkspace();
          if (workspace) {
            await terminalManager.waitForRestart();
            const loopArg = '--loop';
            const playCommand = `script -q -c 'ros2 bag play "${bagPath}" ${loopArg}' /dev/null`;
            const newTerminal = await terminalManager.executeInNewTerminal(playCommand, workspace, `Bag Play: ${path.basename(bagPath)}`);
            bagSession.setPlaybackTerminal(newTerminal);
            BagPlayControlItem.setPlayingState(true, false);

            await toolsTreeProvider.refresh();
          }
        }
      }
      
      await toolsTreeProvider.refresh();
    }),
    
    vscode.commands.registerCommand('ramros.bag.stop', async () => {
      const playbackTerminal = bagSession.playbackTerminal;
      if (playbackTerminal) {
        playbackTerminal.sendText('\x03'); // Ctrl+C
        playbackTerminal.dispose();
        bagSession.setPlaybackTerminal(null);
        BagPlayControlItem.setPlayingState(false, false);
        
        // Reset instances to clear the controls from the tree
        BagFilesFolderItem.resetInstances();
        
        await toolsTreeProvider.refresh();
        void vscode.window.showInformationMessage('Bag playback stopped');
      } else {
        void vscode.window.showWarningMessage('No active bag playback');
      }
    }),
    
    vscode.commands.registerCommand('ramros.bag.stopRecording', async () => {
      const recordingTerminal = bagSession.recordingTerminal;
      if (recordingTerminal) {
        recordingTerminal.sendText('\x03'); // Ctrl+C
        recordingTerminal.dispose();
        bagSession.setRecordingTerminal(null);
        BagRecordItem.setRecordingState(false);
        BagRecordItem.setPausedState(false);
        
        // Reset instances to clear the controls from the tree
        BagFilesFolderItem.resetInstances();
        
        await toolsTreeProvider.refresh();
        void vscode.window.showInformationMessage('Bag recording stopped');
      } else {
        void vscode.window.showWarningMessage('No active bag recording');
      }
    })
  );
  
  await treeProvider.refresh();
}

export function deactivate() {
  console.log('RAMROS Extension deactivated');
  treeProvider?.stopAutoRefresh();
}
