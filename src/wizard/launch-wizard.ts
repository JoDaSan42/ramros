import * as vscode from 'vscode';
import * as path from 'path';
import { PackageInfo, NodeInfo, InstalledPackageInfo, LaunchFileInfo } from '../core/package-discovery';
import { LaunchGenerator, LaunchNodeConfig, LaunchFileConfig } from './launch-generator';

export interface SelectedNodeForLaunch {
  node: NodeInfo;
  package: PackageInfo | InstalledPackageInfo;
  parameters?: Array<{ name: string; value: boolean | number | string | (boolean | number | string)[] }>;
}

export interface SelectedLaunchFile {
  launchFile: LaunchFileInfo;
  package: PackageInfo | InstalledPackageInfo;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PackageDiscoveryServiceType = any;

export class LaunchWizard {
  private selectedNodes: SelectedNodeForLaunch[] = [];
  private selectedLaunchFiles: SelectedLaunchFile[] = [];
  private targetPackage: PackageInfo | null = null;

  constructor(
    private workspacePath: string,
    private packageDiscovery: PackageDiscoveryServiceType
  ) {}

  async run(): Promise<void> {
    try {
      // Show loading indicator while discovering packages
      await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: 'Discovering ROS2 packages...',
        cancellable: false
      }, async (progress) => {
        progress.report({ message: 'Scanning workspace packages...' });
        const workspacePackages = await this.packageDiscovery.discoverPackages(this.workspacePath);
        
        progress.report({ message: 'Scanning installed system packages...' });
        const installedPackages = await this.packageDiscovery.discoverInstalledPackages();
        
        progress.report({ message: 'Preparing package selector...' });
        
        // Iterative package and node selection
        await this.iterativePackageAndNodeSelection(workspacePackages, installedPackages);
      });

      if (this.selectedNodes.length === 0 && this.selectedLaunchFiles.length === 0) {
        void vscode.window.showInformationMessage('No nodes or launch files selected. Launch file creation cancelled.');
        return;
      }

      // Ask if launch file should be added to a workspace package
      await this.selectTargetPackage();

      // Get file name
      const fileName = await this.getFileName();
      if (!fileName) {
        return;
      }

      // Determine save location based on target package selection
      const savePath = await this.determineSaveLocation(fileName);
      if (!savePath) {
        return;
      }

      // Check and update CMakeLists.txt / setup.py if needed
      if (this.targetPackage) {
        await this.ensureLaunchFileRegistration(this.targetPackage, fileName);
      }

      // Generate launch file
      await this.generateAndSave(fileName, savePath);

    } catch (error) {
      console.error('Launch wizard error:', error);
      void vscode.window.showErrorMessage(`Failed to create launch file: ${error}`);
    }
  }

  private async iterativePackageAndNodeSelection(
    workspacePackages: PackageInfo[],
    installedPackages: InstalledPackageInfo[]
  ): Promise<void> {
    const allPackages: Array<PackageInfo | InstalledPackageInfo> = [
      ...workspacePackages,
      ...installedPackages.filter((ip: InstalledPackageInfo) => 
        !workspacePackages.some((wp: PackageInfo) => wp.name === ip.name)
      )
    ];

    let continueAdding = true;

    while (continueAdding) {
      // Select a package
      const packagePick = await this.selectSinglePackage(allPackages);
      if (!packagePick) {
        break; // User cancelled
      }

      const selectedPackage = packagePick.package;

      // Ask what to add: nodes, launch files, or both
      const whatToAdd = await vscode.window.showQuickPick([
        { label: '$(symbol-method) Nodes', description: 'Add individual nodes from this package', type: 'nodes' },
        { label: '$(file-submodule) Launch Files', description: 'Include existing launch files from this package', type: 'launchFiles' },
        { label: '$(symbol-method) $(file-submodule) Both', description: 'Add both nodes and launch files', type: 'both' }
      ], {
        placeHolder: `What would you like to add from ${selectedPackage.name}?`,
        matchOnDescription: true
      });

      if (!whatToAdd) {
        // Ask if they want to select a different package
        const continueChoice = await vscode.window.showQuickPick([
          { label: 'Select another package', description: 'Choose a different package' },
          { label: 'Finish selection', description: 'Proceed with current selections' }
        ], {
          placeHolder: 'No selection made. What would you like to do?'
        });

        if (continueChoice?.label.startsWith('Select another')) {
          continue; // Continue the loop
        } else {
          break; // Finish
        }
      }

      // Add nodes if requested - one at a time with immediate parameter configuration
      if (whatToAdd.type === 'nodes' || whatToAdd.type === 'both') {
        await this.selectNodesWithParameters(selectedPackage);
      }

      // Add launch files if requested
      if (whatToAdd.type === 'launchFiles' || whatToAdd.type === 'both') {
        await this.selectLaunchFilesFromPackage(selectedPackage);
      }

      // Summary of current selections
      const summary = this.getSelectionSummary();
      
      // Ask if they want to add more packages
      const addMore = await vscode.window.showQuickPick([
        { label: '$(add) Add another package', description: summary, detail: 'Continue adding nodes from other packages' },
        { label: '$(check) Finish selection', description: 'Proceed to configure parameters and generate launch file' }
      ], {
        placeHolder: 'What would you like to do next?',
        matchOnDescription: true
      });

      continueAdding = addMore?.label.includes('Add another') ?? false;
    }
  }

  private getSelectionSummary(): string {
    const nodeCount = this.selectedNodes.length;
    const launchFileCount = this.selectedLaunchFiles.length;
    
    if (nodeCount === 0 && launchFileCount === 0) {
      return 'Nothing selected yet';
    }
    
    const parts: string[] = [];
    if (nodeCount > 0) {
      parts.push(`${nodeCount} node${nodeCount !== 1 ? 's' : ''}`);
    }
    if (launchFileCount > 0) {
      parts.push(`${launchFileCount} launch file${launchFileCount !== 1 ? 's' : ''}`);
    }
    
    return `${parts.join(', ')} selected`;
  }

  private async selectSinglePackage(
    allPackages: Array<PackageInfo | InstalledPackageInfo>
  ): Promise<{ label: string; description: string; detail: string; package: PackageInfo | InstalledPackageInfo } | undefined> {
    const items = allPackages.map(pkg => {
      const isInstalled = (pkg as InstalledPackageInfo).source === 'installed';
      const nodeCount = pkg.nodes?.length || 0;
      const launchFileCount = pkg.launchFiles?.length || 0;
      
      return {
        label: pkg.name,
        description: isInstalled ? '$(package) system' : '$(folder) workspace',
        detail: `${nodeCount} node${nodeCount !== 1 ? 's' : ''}, ${launchFileCount} launch file${launchFileCount !== 1 ? 's' : ''}`,
        package: pkg
      };
    });

    return await vscode.window.showQuickPick(items, {
      placeHolder: 'Select a package',
      matchOnDescription: true,
      matchOnDetail: true
    });
  }

  private async selectNodesWithParameters(pkg: PackageInfo | InstalledPackageInfo): Promise<void> {
    if (!pkg.nodes || pkg.nodes.length === 0) {
      void vscode.window.showInformationMessage(`No nodes available in ${pkg.name}`);
      return;
    }

    // Select single node
    const nodeItems = pkg.nodes.map(node => ({
      label: node.name,
      description: node.language === 'python' ? 'Python' : 'C++',
      detail: (pkg as InstalledPackageInfo).source === 'installed' ? '$(package) system' : '$(folder) workspace',
      node,
      package: pkg
    }));

    const selected = await vscode.window.showQuickPick(nodeItems, {
      placeHolder: `Select a node from ${pkg.name}`,
      matchOnDescription: true
    });

    if (!selected) {
      return; // User cancelled
    }

    // Configure parameters immediately for this node
    const isInstalled = (pkg as InstalledPackageInfo).source === 'installed';
    const nodeParams: Array<{ name: string; value: boolean | number | string | (boolean | number | string)[] }> = [];

    if (!isInstalled && selected.node.parameters && selected.node.parameters.length > 0) {
      const shouldConfigure = await vscode.window.showQuickPick([
        { label: 'Yes, configure parameters', description: selected.node.name },
        { label: 'Skip parameters', description: 'Use defaults' }
      ], {
        placeHolder: `Configure parameters for ${selected.node.name}?`
      });

      if (shouldConfigure && shouldConfigure.label.startsWith('Yes')) {
        for (const param of selected.node.parameters) {
          const inputValue = await vscode.window.showInputBox({
            prompt: `Parameter: ${param.name}`,
            value: param.defaultValue || '',
            placeHolder: param.type ? `Type: ${param.type}` : 'Enter value'
          });

          if (inputValue !== undefined && inputValue !== '') {
            nodeParams.push({
              name: param.name,
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              value: this.parseParameterValue(inputValue, param.type) as any
            });
          }
        }
      }
    }

    // Add node with parameters to selection
    this.selectedNodes.push({
      node: selected.node,
      package: selected.package,
      parameters: nodeParams.length > 0 ? nodeParams : undefined
    });

    void vscode.window.showInformationMessage(`Added ${selected.node.name} from ${pkg.name}${nodeParams.length > 0 ? ' with parameters' : ''}`);
  }

  private async selectLaunchFilesFromPackage(pkg: PackageInfo | InstalledPackageInfo): Promise<void> {
    if (!pkg.launchFiles || pkg.launchFiles.length === 0) {
      void vscode.window.showInformationMessage(`No launch files available in ${pkg.name}`);
      return;
    }

    const items = pkg.launchFiles.map(launchFile => ({
      label: launchFile.name,
      detail: (pkg as InstalledPackageInfo).source === 'installed' ? `$(package) ${pkg.name}` : `$(folder) ${pkg.name}`,
      launchFile,
      package: pkg
    }));

    const selected = await vscode.window.showQuickPick(items, {
      canPickMany: true,
      placeHolder: `Select launch files from ${pkg.name}`
    });

    if (selected && selected.length > 0) {
      this.selectedLaunchFiles.push(...selected.map(item => ({
        launchFile: item.launchFile,
        package: item.package
      })));
      
      void vscode.window.showInformationMessage(`Added ${selected.length} launch file(s) from ${pkg.name}`);
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private parseParameterValue(value: string, type?: string): boolean | number | string | any[] {
    if (type === 'bool' || type === 'boolean') {
      return value.toLowerCase() === 'true';
    }
    if (type === 'int' || type === 'integer') {
      const parsed = parseInt(value, 10);
      return isNaN(parsed) ? value : parsed;
    }
    if (type === 'float' || type === 'double') {
      const parsed = parseFloat(value);
      return isNaN(parsed) ? value : parsed;
    }
    if (type === 'array' || type?.startsWith('[')) {
      try {
        return JSON.parse(value);
      } catch {
        return value.split(',').map(s => s.trim());
      }
    }
    return value;
  }

  private async getFileName(): Promise<string | undefined> {
    const fileName = await vscode.window.showInputBox({
      prompt: 'Enter launch file name (without extension)',
      placeHolder: 'my_launch_file',
      validateInput: (value) => {
        if (!value || value.trim().length === 0) {
          return 'File name cannot be empty';
        }
        if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(value)) {
          return 'Use only letters, numbers, and underscores';
        }
        return null;
      }
    });

    return fileName;
  }

  private async selectTargetPackage(): Promise<void> {
    const workspacePackages = await this.packageDiscovery.discoverPackages(this.workspacePath);
    
    if (workspacePackages.length === 0) {
      void vscode.window.showInformationMessage('No workspace packages found. Launch file will be saved to workspace root.');
      return;
    }

    const choices = [
      { label: '$(check) Yes, add to workspace package', description: 'Save in package launch folder and update build files' },
      { label: '$(file-directory) No, save elsewhere', description: 'Choose a custom location' }
    ];

    const choice = await vscode.window.showQuickPick(choices, {
      placeHolder: 'Should this launch file be added to a package from your workspace?',
      matchOnDescription: true
    });

    if (!choice || choice.label.startsWith('$(file-directory)')) {
      this.targetPackage = null;
      return;
    }

    interface PackageQuickPickItem extends vscode.QuickPickItem {
      package: PackageInfo;
    }

    const packageItems: PackageQuickPickItem[] = workspacePackages.map((pkg: PackageInfo) => ({
      label: pkg.name,
      description: `$(folder) ${path.basename(path.dirname(pkg.path))}`,
      detail: `${pkg.buildType === 'ament_cmake' ? 'CMake' : 'Python'} package`,
      package: pkg
    }));

    const selected = await vscode.window.showQuickPick(packageItems, {
      placeHolder: 'Select target package for this launch file',
      matchOnDescription: true,
      matchOnDetail: true
    });

    if (selected) {
      this.targetPackage = selected.package;
      void vscode.window.showInformationMessage(`Launch file will be added to ${selected.label}`);
    }
  }

  private async determineSaveLocation(fileName: string): Promise<string | undefined> {
    if (this.targetPackage) {
      // Save in target package's launch folder: /src/<package>/launch/
      const launchDir = path.join(this.targetPackage.path, 'launch');
      
      // Ensure launch directory exists
      try {
        await vscode.workspace.fs.stat(vscode.Uri.file(launchDir));
      } catch {
        await vscode.workspace.fs.createDirectory(vscode.Uri.file(launchDir));
      }

      // Create .gitignore to exclude __pycache__ and build artifacts
      const gitignorePath = path.join(launchDir, '.gitignore');
      const gitignoreContent = '# Python cache\n__pycache__/\n*.pyc\n\n# Build artifacts\nbuild/\n';
      try {
        await vscode.workspace.fs.stat(vscode.Uri.file(gitignorePath));
      } catch {
        await vscode.workspace.fs.writeFile(
          vscode.Uri.file(gitignorePath),
          Buffer.from(gitignoreContent)
        );
      }

      return path.join(launchDir, `${fileName}.launch.py`);
    }

    // Ask user for custom location
    const folders = await vscode.window.showOpenDialog({
      canSelectFiles: false,
      canSelectFolders: true,
      canSelectMany: false,
      title: 'Select folder for launch file'
    });

    if (!folders || folders.length === 0) {
      return undefined;
    }

    const saveDir = folders[0].fsPath;
    return path.join(saveDir, `${fileName}.launch.py`);
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  private async ensureLaunchFileRegistration(pkg: PackageInfo, _fileName: string): Promise<void> {
    const isPython = pkg.buildType === 'ament_python';
    const buildFilePath = isPython 
      ? path.join(pkg.path, 'setup.py')
      : path.join(pkg.path, 'CMakeLists.txt');

    try {
      await vscode.workspace.fs.stat(vscode.Uri.file(buildFilePath));
    } catch {
      void vscode.window.showWarningMessage(`Could not find ${isPython ? 'setup.py' : 'CMakeLists.txt'} for package ${pkg.name}`);
      return;
    }

    const document = await vscode.workspace.openTextDocument(buildFilePath);
    const content = document.getText();
    
    let needsUpdate = false;
    let updatedContent = content;

    if (isPython) {
      // Check setup.py for generic launch directory installation
      const genericInstallEntry = `('share/${pkg.name}/launch', glob('launch/*.launch.py'))`;
      const hasGenericInstall = content.includes(genericInstallEntry) || 
                                content.includes(`'share/${pkg.name}/launch'`) && content.includes('glob') && content.includes('launch/*.launch.py');
      
      if (!hasGenericInstall) {
        const dataFilesPattern = /data_files\s*=\s*\[/gs;
        const hasDataFiles = dataFilesPattern.test(content);
        
        if (!hasDataFiles) {
          // Need to add data_files section with glob import
          const setupPyPattern = /setuptools\.setup\([^)]+\)/gs;
          const match = setupPyPattern.exec(content);
          
          if (match) {
            // Check if glob is already imported
            const hasGlobImport = /from\s+glob\s+import\s+glob|import\s+glob/.test(content);
            const globImport = hasGlobImport ? '' : 'from glob import glob\n';
            
            // Add data_files with glob before closing parenthesis
            const insertPos = match.index + match[0].lastIndexOf(')');
            updatedContent = 
              content.substring(0, insertPos) + 
              ',\n    data_files=[\n        ' + genericInstallEntry + ',\n    ]' +
              content.substring(insertPos);
            
            // Add glob import at the top if not present
            if (!hasGlobImport) {
              const firstNewline = content.indexOf('\n');
              updatedContent = content.substring(0, firstNewline + 1) + globImport + content.substring(firstNewline + 1);
            }
            
            needsUpdate = true;
          }
        } else if (!hasGenericInstall) {
          // data_files exists but not with glob - replace all launch-specific entries with glob pattern
          const dataFilesMatch = content.match(/data_files\s*=\s*\[(.*?)\]/gs);
          if (dataFilesMatch) {
            // Check if glob is already imported
            const hasGlobImport = /from\s+glob\s+import\s+glob|import\s+glob/.test(content);
            
            // Remove any existing launch file entries and replace with glob
            updatedContent = content.replace(
              /data_files\s*=\s*\[/,
              'data_files=[\n        ' + genericInstallEntry + ','
            );
            
            // Add glob import at the top if not present
            if (!hasGlobImport) {
              const firstNewline = content.indexOf('\n');
              updatedContent = content.substring(0, firstNewline + 1) + 'from glob import glob\n' + content.substring(firstNewline + 1);
            }
            
            needsUpdate = true;
          }
        }
      }
    } else {
      // Check CMakeLists.txt for install(DIRECTORY launch ...) or install(FILES ...)
      const hasLaunchInstall = /install\s*\(\s*DIRECTORY\s+launch/gi.test(content) ||
                               /install\s*\(\s*FILES.*launch/gi.test(content);

      if (!hasLaunchInstall) {
        // Find the install section or end of file
        const lines = content.split('\n');
        const installIndex = lines.findIndex(line => /^install\s*\(/i.test(line.trim()));
        
        if (installIndex !== -1) {
          // Add after existing install command
          const newLines = [
            '',
            '# Install launch files',
            `install(DIRECTORY launch DESTINATION share/${pkg.name})`,
          ];
          lines.splice(installIndex + 1, 0, ...newLines);
          updatedContent = lines.join('\n');
          needsUpdate = true;
        } else {
          // Add at end of file
          updatedContent = content + `\n\n# Install launch files\ninstall(DIRECTORY launch DESTINATION share/${pkg.name})\n`;
          needsUpdate = true;
        }
      }
    }

    if (needsUpdate) {
      const choice = await vscode.window.showInformationMessage(
        `Update ${isPython ? 'setup.py' : 'CMakeLists.txt'} to include launch files in installation?`,
        { modal: true },
        'Yes, update',
        'No, skip'
      );

      if (choice === 'Yes, update') {
        const edit = new vscode.WorkspaceEdit();
        edit.replace(
          vscode.Uri.file(buildFilePath),
          new vscode.Range(0, 0, document.lineCount, 0),
          updatedContent
        );
        await vscode.workspace.applyEdit(edit);
        await document.save();
        void vscode.window.showInformationMessage(`Updated ${isPython ? 'setup.py' : 'CMakeLists.txt'} to include launch files`);
      }
    }
  }

  private async generateAndSave(fileName: string, savePath: string): Promise<void> {
    const generator = new LaunchGenerator();

    const launchNodes: LaunchNodeConfig[] = this.selectedNodes.map(selected => ({
      packageName: selected.package.name,
      executableName: selected.node.name,
      nodeName: selected.node.name,
      parameters: selected.parameters,
      output: 'screen'
    }));

    const config: LaunchFileConfig = {
      fileName,
      description: `Generated by RAMROS Launch Wizard - ${new Date().toLocaleDateString()}`,
      nodes: launchNodes,
      launchArguments: [
        {
          name: 'use_sim_time',
          defaultValue: 'false',
          description: 'Use simulation time'
        }
      ]
    };

    const content = generator.generate(config);

    // Write file
    const uri = vscode.Uri.file(savePath);
    await vscode.workspace.fs.writeFile(uri, Buffer.from(content, 'utf-8'));

    // Open the file
    const document = await vscode.workspace.openTextDocument(uri);
    await vscode.window.showTextDocument(document, { preview: false });

    let message = `Launch file created: ${fileName}.launch.py`;
    if (this.targetPackage) {
      message += ` in ${this.targetPackage.name}`;
    }

    // Ask if user wants to run it
    const runChoice = await vscode.window.showInformationMessage(
      message,
      { modal: true },
      'Run now',
      'Close'
    );

    if (runChoice === 'Run now') {
      // This would need to be implemented separately or passed as callback
      void vscode.window.showInformationMessage('To run the launch file, use the Run command or ros2 launch from terminal');
    }
  }
}
