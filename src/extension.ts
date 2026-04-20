import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { RosEnvironmentService } from './core/ros-environment';
import { WorkspaceDetector, WorkspaceInfo } from './core/workspace-detector';
import { DuplicatePackageDetector } from './core/duplicate-package-detector';
import { CacheManager } from './cache/cache-manager';
import { RamrosTreeProvider } from './treeview/tree-provider';
import { TerminalManager } from './executor/terminal-manager';
import { PackageCreator } from './wizard/package-creator';
import { PackageFormValidator } from './wizard/package-form-validator';
import { NodeInfo, LaunchFileInfo, PackageDiscoveryService, PackageInfo } from './core/package-discovery';
import { TreeItemBase } from './treeview/tree-items';

let cacheManager: CacheManager;
let terminalManager: TerminalManager;
let treeProvider: RamrosTreeProvider;
let packageCreator: PackageCreator;

export async function activate(context: vscode.ExtensionContext) {
  console.log('RAMROS Extension activated');
  
  const rosEnvironmentService = new RosEnvironmentService();
  
  cacheManager = new CacheManager((message) => {
    console.log(`[Cache] ${message}`);
  });
  
  const packageDiscovery = new PackageDiscoveryService();
  const workspaceDetector = new WorkspaceDetector(
    () => rosEnvironmentService.detectInstallations(),
    packageDiscovery
  );
  
  const duplicateDetector = new DuplicatePackageDetector();
  
  terminalManager = new TerminalManager();
  
  treeProvider = new RamrosTreeProvider(workspaceDetector, duplicateDetector, packageDiscovery);
  
  packageCreator = new PackageCreator(context.extensionPath);
  
  const treeView = vscode.window.createTreeView('ramrosExplorer', {
    treeDataProvider: treeProvider,
    showCollapseAll: true
  });
  
  context.subscriptions.push(
    treeView,
    cacheManager,
    terminalManager,
    
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
      
      const validator = new PackageFormValidator();
      const workspaceRoot = await vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      
      if (!workspaceRoot) {
        void vscode.window.showErrorMessage('Please open a folder in VSCode first');
        return;
      }
      
      const packageName = await vscode.window.showInputBox({
        prompt: 'Enter package name',
        placeHolder: 'my_package',
        validateInput: (value) => {
          const existingPackages = treeProvider.getWorkspaces().flatMap(w => w.name);
          const result = validator.validatePackageName(value || '', existingPackages);
          return result.isValid ? null : result.errors.join(', ');
        }
      });
      
      if (!packageName) return;
      
      const packageTypePick = await vscode.window.showQuickPick(
        [
          { label: 'python', description: 'Python package with minimal node', detail: 'Creates ament_python package' },
          { label: 'cpp', description: 'C++ package with minimal node', detail: 'Creates ament_cmake package' },
          { label: 'cpp-python', description: 'Package with both C++ and Python nodes', detail: 'Creates ament_cmake package' },
          { label: 'interface', description: 'Interface package for messages, services, or actions', detail: 'Creates interface package' }
        ],
        { placeHolder: 'Select package type' }
      );
      
      if (!packageTypePick) return;
      const packageType = packageTypePick.label;
      
      let template: 'empty' | 'minimal-cpp' | 'minimal-python' | 'standard' | 'interface';
      switch (packageType) {
        case 'python':
          template = 'minimal-python';
          break;
        case 'cpp':
          template = 'minimal-cpp';
          break;
        case 'cpp-python':
          template = 'standard';
          break;
        case 'interface':
          template = 'interface';
          break;
        default:
          template = 'minimal-python';
      }
      
      const description = await vscode.window.showInputBox({
        prompt: 'Enter package description',
        value: template === 'interface' ? 'Interface package for ROS2 messages, services, and actions' : 'A ROS2 package'
      }) || '';
      
      const authorName = 'ramros';
      const authorEmail = 'ramros@test.com';
      
      const license = await vscode.window.showQuickPick(
        ['Apache-2.0', 'MIT', 'BSD-2-Clause', 'BSD-3-Clause', 'GPL-3.0'],
        { placeHolder: 'Select license' }
      ) || 'Apache-2.0';
      
      let buildType: 'ament_cmake' | 'ament_python' | 'cmake' = 'ament_cmake';
      if (packageType === 'python') {
        buildType = 'ament_python';
      } else if (packageType === 'cpp' || packageType === 'cpp-python') {
        buildType = 'ament_cmake';
      } else if (packageType === 'interface') {
        buildType = 'ament_cmake';
      }
      
      let nodeName: string | undefined;
      let includeTemplateNode: boolean | undefined;
      
      if (packageType !== 'interface') {
        nodeName = await vscode.window.showInputBox({
          prompt: 'Enter node name',
          value: packageName
        });
        
        if (packageType === 'python' || packageType === 'cpp' || packageType === 'cpp-python') {
          const includeNodeChoice = await vscode.window.showQuickPick(
            [
              { label: 'yes', description: 'Create package with template node implementation' },
              { label: 'no', description: 'Create empty package without node' }
            ],
            { placeHolder: 'Include template node implementation?' }
          );
          includeTemplateNode = includeNodeChoice?.label === 'yes';
        }
      }
      
      let defaultDeps: string[] = [];
      if (packageType === 'cpp' || packageType === 'cpp-python' || packageType === 'standard') {
        defaultDeps = ['rclcpp', 'std_msgs'];
      } else if (packageType === 'python') {
        defaultDeps = ['rclpy', 'std_msgs'];
      }
      
      const depsInput = await vscode.window.showInputBox({
        prompt: 'Enter additional dependencies (comma-separated)',
        placeHolder: template === 'interface' ? 'std_msgs, geometry_msgs' : defaultDeps.join(', '),
        value: defaultDeps.join(', ')
      });
      
      const dependencies = depsInput && depsInput.trim().length > 0
        ? depsInput.split(',').map((d: string) => d.trim()).filter((d: string) => d.length > 0)
        : defaultDeps;
      
      try {
        const workspaces = treeProvider.getWorkspaces();
        if (workspaces.length === 0) {
          throw new Error('No workspace found. Please open a folder in VSCode first.');
        }
        
        const targetWorkspace = workspaces[0];
        const srcPath = path.join(targetWorkspace.rootPath.fsPath, 'src');
        
        if (!fs.existsSync(srcPath)) {
          fs.mkdirSync(srcPath, { recursive: true });
        }
        
        let interfaces: { type: 'message' | 'service' | 'action'; name: string; definition: string }[] | undefined;
        
        if (template === 'interface') {
          interfaces = [];
          
          const validateInterfaceName = (value: string): string | null => {
            if (!value || value.trim().length === 0) {
              return 'Name cannot be empty';
            }
            if (!/^[A-Z][a-zA-Z0-9_]*$/.test(value)) {
              return 'Name must start with uppercase letter and contain only letters, numbers, and underscores';
            }
            return null;
          };
          
          const validateFieldType = (value: string): string | null => {
            const validTypes = [
              'bool', 'byte', 'char',
              'float32', 'float64',
              'int8', 'uint8', 'int16', 'uint16', 'int32', 'uint32', 'int64', 'uint64',
              'string', 'wstring'
            ];
            if (!value || value.trim().length === 0) {
              return 'Type cannot be empty';
            }
            if (!validTypes.includes(value.toLowerCase())) {
              return `Unknown type '${value}'. Valid types: ${validTypes.join(', ')}`;
            }
            return null;
          };
          
          const validateFieldName = (value: string): string | null => {
            if (!value || value.trim().length === 0) {
              return 'Field name cannot be empty';
            }
            if (!/^[a-z][a-zA-Z0-9_]*$/.test(value)) {
              return 'Field name must start with lowercase letter and contain only letters, numbers, and underscores';
            }
            return null;
          };
          
          const collectFields = async (sectionName: string): Promise<string[]> => {
            const fields: string[] = [];
            
            void vscode.window.showInformationMessage(`Adding fields for ${sectionName}`);
            
            const addAnotherField = async (): Promise<boolean> => {
              const fieldType = await vscode.window.showInputBox({
                prompt: `Enter field type for ${sectionName}`,
                placeHolder: 'string, int32, float64, etc.',
                validateInput: validateFieldType
              });
              
              if (!fieldType) {
                return false;
              }
              
              const fieldName = await vscode.window.showInputBox({
                prompt: `Enter field name for ${sectionName}`,
                placeHolder: 'my_field',
                validateInput: validateFieldName
              });
              
              if (!fieldName) {
                return false;
              }
              
              fields.push(`${fieldType} ${fieldName}`);
              void vscode.window.showInformationMessage(`Added field: ${fieldType} ${fieldName}`);
              
              const addMoreChoice = await vscode.window.showQuickPick([
                { label: 'yes', description: 'Add another field' },
                { label: 'no', description: sectionName === 'request' || sectionName === 'goal' 
                  ? `Continue to ${sectionName === 'request' ? 'response' : 'feedback'} fields`
                  : sectionName === 'response' || sectionName === 'feedback'
                  ? sectionName === 'response' ? 'Finish service' : 'Continue to result fields'
                  : 'Finish interface' }
              ], {
                placeHolder: `Add another field to ${sectionName}?`
              });
              
              return addMoreChoice?.label === 'yes';
            };
            
            let shouldAddMore = true;
            while (shouldAddMore) {
              shouldAddMore = await addAnotherField();
            }
            
            return fields;
          };
          
          const buildDefinition = (fields: string[]): string => {
            return fields.join('\n');
          };
          
          const addInterface = async (): Promise<boolean> => {
            const interfaceTypePick = await vscode.window.showQuickPick([
              { label: 'message', description: 'Message (.msg)', detail: 'Data structures for publishing/subscribing' },
              { label: 'service', description: 'Service (.srv)', detail: 'Request/response communication' },
              { label: 'action', description: 'Action (.action)', detail: 'Goal-based long-running tasks' }
            ], {
              placeHolder: 'Select interface type'
            });
            
            if (!interfaceTypePick) {
              return false;
            }
            
            const interfaceType = interfaceTypePick.label as 'message' | 'service' | 'action';
            const extension = interfaceType === 'message' ? '.msg' : interfaceType === 'service' ? '.srv' : '.action';
            
            const name = await vscode.window.showInputBox({
              prompt: `Enter ${interfaceType} name`,
              placeHolder: `My${interfaceType.charAt(0).toUpperCase() + interfaceType.slice(1)}`,
              validateInput: validateInterfaceName
            });
            
            if (!name) {
              return true;
            }
            
            let definition = '';
            
            if (interfaceType === 'message') {
              const msgFields = await collectFields('message');
              if (msgFields.length === 0) {
                void vscode.window.showWarningMessage('No fields defined for message');
                return true;
              }
              definition = buildDefinition(msgFields);
            } else if (interfaceType === 'service') {
              const reqFields = await collectFields('request');
              if (reqFields.length === 0) {
                void vscode.window.showWarningMessage('No fields defined for request');
                return true;
              }
              const respFields = await collectFields('response');
              if (respFields.length === 0) {
                void vscode.window.showWarningMessage('No fields defined for response');
                return true;
              }
              definition = `${buildDefinition(reqFields)}\n---\n${buildDefinition(respFields)}`;
            } else if (interfaceType === 'action') {
              const goalFields = await collectFields('goal');
              if (goalFields.length === 0) {
                void vscode.window.showWarningMessage('No fields defined for goal');
                return true;
              }
              const feedbackFields = await collectFields('feedback');
              if (feedbackFields.length === 0) {
                void vscode.window.showWarningMessage('No fields defined for feedback');
                return true;
              }
              const resultFields = await collectFields('result');
              if (resultFields.length === 0) {
                void vscode.window.showWarningMessage('No fields defined for result');
                return true;
              }
              definition = `${buildDefinition(goalFields)}\n---\n${buildDefinition(feedbackFields)}\n---\n${buildDefinition(resultFields)}`;
            }
            
            interfaces!.push({ type: interfaceType, name, definition });
            void vscode.window.showInformationMessage(`Created ${interfaceType} '${name}${extension}'`);
            
            const continueChoice = await vscode.window.showQuickPick([
              { label: 'add_another', description: 'Add another interface' },
              { label: 'finish', description: 'Finish and create package' }
            ], {
              placeHolder: 'What would you like to do next?'
            });
            
            return continueChoice?.label === 'add_another';
          };
          
          let shouldContinue = true;
          while (shouldContinue) {
            try {
              shouldContinue = await addInterface();
            } catch (error: unknown) {
              const message = error instanceof Error ? error.message : String(error);
              void vscode.window.showErrorMessage(`Error adding interface: ${message}`);
              break;
            }
          }
          
          if (interfaces.length === 0) {
            void vscode.window.showWarningMessage('No interfaces defined. Creating empty interface package.');
          }
        }
        
        await packageCreator.createPackage(targetWorkspace.rootPath.fsPath, {
          packageName,
          description,
          authorName,
          authorEmail,
          license,
          buildType,
          template: template as 'empty' | 'minimal-cpp' | 'minimal-python' | 'standard' | 'interface',
          nodeName,
          dependencies,
          interfaces,
          includeTemplateNode,
        });
        await treeProvider.refresh();
        void vscode.window.showInformationMessage(`Package '${packageName}' created successfully!`);
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        void vscode.window.showErrorMessage(`Failed to create package: ${message}`);
      }
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
      
      const terminal = vscode.window.createTerminal({
        name: `Package: ${path.basename(packagePath)}`
      });
      
      terminal.show();
      
      const setupBashPath = path.join(selectedWorkspace.installPath?.fsPath || '', 'setup.bash');
      if (fs.existsSync(setupBashPath)) {
        terminal.sendText(`source "${setupBashPath}" && cd "${packagePath}"`);
      } else {
        terminal.sendText(`cd "${packagePath}"`);
      }
    }),
    
    vscode.commands.registerCommand('ramros.runLaunchFile', async (treeItem?: TreeItemBase) => {
      const workspaces = treeProvider.getWorkspaces();
      if (workspaces.length === 0) {
        void vscode.window.showWarningMessage('No ROS2 workspaces found');
        return;
      }
      
      const selectedWorkspace = workspaces[0];
      
      let launchFileToRun: LaunchFileInfo | undefined;
      
      if (treeItem && 'getLaunchFileInfo' in treeItem && typeof treeItem.getLaunchFileInfo === 'function') {
        launchFileToRun = treeItem.getLaunchFileInfo();
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
        runCommand = `source "${setupBashPath}" && ros2 launch ${launchFileToRun.path}`;
      } else {
        runCommand = `ros2 launch ${launchFileToRun.path}`;
      }
      
      await terminalManager.executeInNewTerminal(runCommand, selectedWorkspace, `Launch: ${launchFileToRun.name}`);
    }),
    
    vscode.commands.registerCommand('ramros.addNodeToPackage', async (treeItem?: TreeItemBase) => {
      const workspaces = treeProvider.getWorkspaces();
      if (workspaces.length === 0) {
        void vscode.window.showWarningMessage('No ROS2 workspaces found');
        return;
      }
      
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
      
      const addType = await vscode.window.showQuickPick([
        { label: 'node', description: 'Add a new node (C++ or Python)' },
        { label: 'interface', description: 'Add a new interface (msg/srv/action)' }
      ], {
        placeHolder: 'What would you like to add?'
      });
      
      if (!addType) return;
      
      if (addType.label === 'interface') {
        const validateInterfaceName = (value: string): string | null => {
          if (!value || value.trim().length === 0) {
            return 'Name cannot be empty';
          }
          if (!/^[A-Z][a-zA-Z0-9_]*$/.test(value)) {
            return 'Name must start with uppercase letter and contain only letters, numbers, and underscores';
          }
          return null;
        };
        
        const validateFieldType = (value: string): string | null => {
          const validTypes = [
            'bool', 'byte', 'char',
            'float32', 'float64',
            'int8', 'uint8', 'int16', 'uint16', 'int32', 'uint32', 'int64', 'uint64',
            'string', 'wstring'
          ];
          if (!value || value.trim().length === 0) {
            return 'Type cannot be empty';
          }
          if (!validTypes.includes(value.toLowerCase())) {
            return `Unknown type '${value}'. Valid types: ${validTypes.join(', ')}`;
          }
          return null;
        };
        
        const validateFieldName = (value: string): string | null => {
          if (!value || value.trim().length === 0) {
            return 'Field name cannot be empty';
          }
          if (!/^[a-z][a-zA-Z0-9_]*$/.test(value)) {
            return 'Field name must start with lowercase letter and contain only letters, numbers, and underscores';
          }
          return null;
        };
        
        const collectFields = async (sectionName: string): Promise<string[]> => {
          const fields: string[] = [];
          
          void vscode.window.showInformationMessage(`Adding fields for ${sectionName}`);
          
          const addAnotherField = async (): Promise<boolean> => {
            const fieldType = await vscode.window.showInputBox({
              prompt: `Enter field type for ${sectionName}`,
              placeHolder: 'string, int32, float64, etc.',
              validateInput: validateFieldType
            });
            
            if (!fieldType) {
              return false;
            }
            
            const fieldName = await vscode.window.showInputBox({
              prompt: `Enter field name for ${sectionName}`,
              placeHolder: 'my_field',
              validateInput: validateFieldName
            });
            
            if (!fieldName) {
              return false;
            }
            
            fields.push(`${fieldType} ${fieldName}`);
            void vscode.window.showInformationMessage(`Added field: ${fieldType} ${fieldName}`);
            
            const addMoreChoice = await vscode.window.showQuickPick([
              { label: 'yes', description: 'Add another field' },
              { label: 'no', description: sectionName === 'request' || sectionName === 'goal' 
                ? `Continue to ${sectionName === 'request' ? 'response' : 'feedback'} fields`
                : sectionName === 'response' || sectionName === 'feedback'
                ? sectionName === 'response' ? 'Finish service' : 'Continue to result fields'
                : 'Finish interface' }
            ], {
              placeHolder: `Add another field to ${sectionName}?`
            });
            
            return addMoreChoice?.label === 'yes';
          };
          
          let shouldAddMore = true;
          while (shouldAddMore) {
            shouldAddMore = await addAnotherField();
          }
          
          return fields;
        };
        
        const buildDefinition = (fields: string[]): string => {
          return fields.join('\n');
        };
        
        const interfaceTypePick = await vscode.window.showQuickPick([
          { label: 'message', description: 'Message (.msg)', detail: 'Data structures for publishing/subscribing' },
          { label: 'service', description: 'Service (.srv)', detail: 'Request/response communication' },
          { label: 'action', description: 'Action (.action)', detail: 'Goal-based long-running tasks' }
        ], {
          placeHolder: 'Select interface type'
        });
        
        if (!interfaceTypePick) return;
        
        const interfaceType = interfaceTypePick.label as 'message' | 'service' | 'action';
        
        const name = await vscode.window.showInputBox({
          prompt: `Enter ${interfaceType} name`,
          placeHolder: `My${interfaceType.charAt(0).toUpperCase() + interfaceType.slice(1)}`,
          validateInput: validateInterfaceName
        });
        
        if (!name) return;
        
        let definition = '';
        
        if (interfaceType === 'message') {
          const msgFields = await collectFields('message');
          if (msgFields.length === 0) {
            void vscode.window.showWarningMessage('No fields defined for message');
            return;
          }
          definition = buildDefinition(msgFields);
        } else if (interfaceType === 'service') {
          const reqFields = await collectFields('request');
          if (reqFields.length === 0) {
            void vscode.window.showWarningMessage('No fields defined for request');
            return;
          }
          const respFields = await collectFields('response');
          if (respFields.length === 0) {
            void vscode.window.showWarningMessage('No fields defined for response');
            return;
          }
          definition = `${buildDefinition(reqFields)}\n---\n${buildDefinition(respFields)}`;
        } else if (interfaceType === 'action') {
          const goalFields = await collectFields('goal');
          if (goalFields.length === 0) {
            void vscode.window.showWarningMessage('No fields defined for goal');
            return;
          }
          const feedbackFields = await collectFields('feedback');
          if (feedbackFields.length === 0) {
            void vscode.window.showWarningMessage('No fields defined for feedback');
            return;
          }
          const resultFields = await collectFields('result');
          if (resultFields.length === 0) {
            void vscode.window.showWarningMessage('No fields defined for result');
            return;
          }
          definition = `${buildDefinition(goalFields)}\n---\n${buildDefinition(feedbackFields)}\n---\n${buildDefinition(resultFields)}`;
        }
        
        try {
          await packageCreator.addInterfaceToPackage(
            selectedPackage.path,
            selectedPackage.name,
            { type: interfaceType, name, definition }
          );
          await treeProvider.refresh();
          void vscode.window.showInformationMessage(`Interface '${name}' added to package '${selectedPackage.name}'`);
          void vscode.window.showInformationMessage('Build workspace to compile');
        } catch (error: unknown) {
          const message = error instanceof Error ? error.message : 'Unknown error';
          void vscode.window.showErrorMessage(`Failed to add interface: ${message}`);
        }
        
        return;
      }
      
      const isCppPackage = selectedPackage.packageType === 'cpp' || selectedPackage.packageType === 'mixed';
      const isPythonPackage = selectedPackage.packageType === 'python' || selectedPackage.packageType === 'mixed';
      
      let languageChoices: { label: string; description: string }[] = [];
      if (isCppPackage && isPythonPackage) {
        languageChoices = [
          { label: 'cpp', description: 'C++ node' },
          { label: 'python', description: 'Python node' }
        ];
      } else if (isCppPackage) {
        languageChoices = [{ label: 'cpp', description: 'C++ node' }];
      } else if (isPythonPackage) {
        languageChoices = [{ label: 'python', description: 'Python node' }];
      }
      
      if (languageChoices.length === 0) {
        void vscode.window.showErrorMessage('Package type not recognized');
        return;
      }
      
      const languagePick = languageChoices.length === 1 
        ? languageChoices[0]
        : await vscode.window.showQuickPick(languageChoices, {
            placeHolder: 'Select node language'
          });
      
      if (!languagePick) return;
      
      const nodeName = await vscode.window.showInputBox({
        prompt: 'Enter node name',
        placeHolder: 'my_node',
        validateInput: (value) => {
          if (!value || value.trim().length === 0) {
            return 'Node name cannot be empty';
          }
          if (!/^[a-z][a-z0-9_]*$/.test(value)) {
            return 'Node name must start with lowercase letter and contain only lowercase letters, numbers, and underscores';
          }
          return null;
        }
      });
      
      if (!nodeName) return;
      
      const includeTemplate = await vscode.window.showQuickPick([
        { label: 'yes', description: 'Create node with template implementation' },
        { label: 'no', description: 'Create empty node file' }
      ], {
        placeHolder: 'Include template node implementation?'
      });
      
      const useTemplate = includeTemplate?.label === 'yes';
      
      let defaultDeps: string[] = [];
      if (languagePick.label === 'cpp') {
        defaultDeps = ['rclcpp', 'std_msgs'];
      } else {
        defaultDeps = ['rclpy', 'std_msgs'];
      }
      
      const depsInput = await vscode.window.showInputBox({
        prompt: 'Enter additional dependencies (comma-separated)',
        placeHolder: defaultDeps.join(', '),
        value: defaultDeps.join(', ')
      });
      
      const dependencies = depsInput && depsInput.trim().length > 0
        ? depsInput.split(',').map((d: string) => d.trim()).filter((d: string) => d.length > 0)
        : defaultDeps;
      
      try {
        await packageCreator.addNodeToPackage(selectedPackage.path, selectedPackage.name, {
          nodeType: languagePick.label as 'cpp' | 'python',
          nodeName,
          includeTemplateNode: useTemplate,
          dependencies
        });
        await treeProvider.refresh();
        void vscode.window.showInformationMessage(`Node '${nodeName}' added to package '${selectedPackage.name}'`);
        void vscode.window.showInformationMessage('Build workspace to compile');
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        void vscode.window.showErrorMessage(`Failed to add node: ${message}`);
      }
    })
  );
  
  await treeProvider.refresh();
}

export function deactivate() {
  console.log('RAMROS Extension deactivated');
  treeProvider?.stopAutoRefresh();
}
