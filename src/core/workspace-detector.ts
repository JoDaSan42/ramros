import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { RosDistribution } from './ros-environment';

export interface WorkspaceInfo {
  id: string;
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

export class WorkspaceDetector {
  constructor(
    private readonly getRosDistributions: () => Promise<RosDistribution[]>
  ) {}
  
  async detectWorkspaces(): Promise<WorkspaceInfo[]> {
    const workspaceFolders = vscode.workspace.workspaceFolders || [];
    const workspaces: WorkspaceInfo[] = [];
    
    for (const folder of workspaceFolders) {
      const isRosWorkspace = await this.isRosWorkspace(folder.uri);
      if (!isRosWorkspace) continue;
      
      const workspaceInfo = await this.createWorkspaceInfo(folder.uri);
      workspaces.push(workspaceInfo);
    }
    
    return workspaces;
  }
  
  async validateWorkspace(info: WorkspaceInfo): Promise<void> {
    info.errors = [];
    info.warnings = [];
    
    const srcExists = info.srcPath !== null && fs.existsSync(info.srcPath.fsPath);
    const installExists = info.installPath !== null && fs.existsSync(info.installPath.fsPath);
    const buildExists = info.buildPath !== null && fs.existsSync(info.buildPath.fsPath);
    
    if (!srcExists && !installExists) {
      info.errors.push('Weder src/ noch install/ Ordner gefunden. Dies ist kein gültiger ROS2 Workspace.');
      info.isValid = false;
      return;
    }
    
    if (!installExists && !buildExists) {
      info.warnings.push('Workspace wurde noch nicht gebaut. Führen Sie "colcon build" aus.');
    }
    
    if (info.rosDistribution === null) {
      info.warnings.push('Keine ROS2 Installation für diesen Workspace gefunden.');
    }
    
    info.isValid = true;
  }
  
  async isRosWorkspace(uri: vscode.Uri): Promise<boolean> {
    const srcPath = vscode.Uri.joinPath(uri, 'src');
    const installPath = vscode.Uri.joinPath(uri, 'install');
    
    try {
      const srcStat = await vscode.workspace.fs.stat(srcPath);
      if (srcStat.type === vscode.FileType.Directory) {
        return true;
      }
    } catch {
      // src exists not
    }
    
    try {
      const setupBashPath = vscode.Uri.joinPath(installPath, 'setup.bash');
      await vscode.workspace.fs.stat(setupBashPath);
      return true;
    } catch {
      // install/setup.bash exists not
    }
    
    const packageXmlExists = await this.hasPackageXml(uri);
    if (packageXmlExists) {
      return true;
    }
    
    return false;
  }
  
  private async createWorkspaceInfo(uri: vscode.Uri): Promise<WorkspaceInfo> {
    const srcPath = vscode.Uri.joinPath(uri, 'src');
    const installPath = vscode.Uri.joinPath(uri, 'install');
    const buildPath = vscode.Uri.joinPath(uri, 'build');
    
    let srcUri: vscode.Uri | null = null;
    let installUri: vscode.Uri | null = null;
    let buildUri: vscode.Uri | null = null;
    
    try {
      const stat = await vscode.workspace.fs.stat(srcPath);
      if (stat.type === vscode.FileType.Directory) {
        srcUri = srcPath;
      }
    } catch {
      // ignore
    }
    
    try {
      const stat = await vscode.workspace.fs.stat(installPath);
      if (stat.type === vscode.FileType.Directory) {
        installUri = installPath;
      }
    } catch {
      // ignore
    }
    
    try {
      const stat = await vscode.workspace.fs.stat(buildPath);
      if (stat.type === vscode.FileType.Directory) {
        buildUri = buildPath;
      }
    } catch {
      // ignore
    }
    
    const distributions = await this.getRosDistributions();
    const rosDist = distributions.find(d => 
      uri.fsPath.startsWith(d.installPath + '/') || 
      uri.fsPath === d.installPath
    ) || distributions.find(d => d.isActive) || null;
    
    return {
      id: uri.fsPath,
      name: path.basename(uri.fsPath),
      rootPath: uri,
      srcPath: srcUri,
      installPath: installUri,
      buildPath: buildUri,
      rosDistribution: rosDist || null,
      isValid: false,
      errors: [],
      warnings: []
    };
  }
  
  private async hasPackageXml(uri: vscode.Uri): Promise<boolean> {
    try {
      const packageXmlPath = vscode.Uri.joinPath(uri, 'package.xml');
      await vscode.workspace.fs.stat(packageXmlPath);
      return true;
    } catch {
      return false;
    }
  }
}
