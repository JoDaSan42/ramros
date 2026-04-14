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
  
  const workspaceDetector = new WorkspaceDetector(
    () => rosEnvironmentService.detectInstallations()
  );
  
  const duplicateDetector = new DuplicatePackageDetector();
  
  terminalManager = new TerminalManager();
  
  treeProvider = new RamrosTreeProvider(workspaceDetector, duplicateDetector);
  
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
    
    vscode.commands.registerCommand('ramros.sourceWorkspace', async (item?: WorkspaceInfo) => {
      let workspaces = treeProvider.getWorkspaces();
      
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
      let workspaces = treeProvider.getWorkspaces();
      
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
      
      await terminalManager.buildWorkspace(selectedWorkspace);
    }),
    
    vscode.commands.registerCommand('ramros.createPackage', async (options?: Record<string, unknown>) => {
      if (options && typeof options.packageName === 'string') {
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
        };
        
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
      
      const authorName = await vscode.window.showInputBox({
        prompt: 'Enter author name',
        value: process.env.USER || ''
      }) || '';
      
      const authorEmail = await vscode.window.showInputBox({
        prompt: 'Enter author email',
        value: process.env.EMAIL || '',
        validateInput: (value) => {
          if (!value || value.trim().length === 0) {
            return 'Email is required';
          }
          if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
            return 'Please enter a valid email address';
          }
          return null;
        }
      });
      
      if (!authorEmail) return;
      
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
      if (packageType !== 'interface') {
        nodeName = await vscode.window.showInputBox({
          prompt: 'Enter node name',
          value: packageName
        });
      }
      
      const depsInput = await vscode.window.showInputBox({
        prompt: 'Enter dependencies (comma-separated)',
        placeHolder: template === 'interface' ? 'std_msgs, geometry_msgs' : 'rclcpp, std_msgs'
      });
      
      const dependencies = depsInput
        ? depsInput.split(',').map((d: string) => d.trim()).filter((d: string) => d.length > 0)
        : [];
      
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
        });
        await treeProvider.refresh();
        void vscode.window.showInformationMessage(`Package '${packageName}' created successfully!`);
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        void vscode.window.showErrorMessage(`Failed to create package: ${message}`);
      }
    })
  );
  
  await treeProvider.refresh();
}

export function deactivate() {
  console.log('RAMROS Extension deactivated');
}
