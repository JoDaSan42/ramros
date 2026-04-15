import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { RosDistribution } from './ros-environment';
import { PackageDiscoveryService, PackageInfo } from './package-discovery';

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
  packages?: PackageInfo[];
}

export class WorkspaceDetector {
  private packageDiscovery: PackageDiscoveryService;

  constructor(
    private readonly getRosDistributions: () => Promise<RosDistribution[]>,
    packageDiscovery?: PackageDiscoveryService
  ) {
    this.packageDiscovery = packageDiscovery || new PackageDiscoveryService();
  }
  
  async detectWorkspaces(forceRefresh: boolean = true): Promise<WorkspaceInfo[]> {
    if (forceRefresh) {
      this.packageDiscovery.clearCache();
    }
    
    const workspaceFolders = vscode.workspace.workspaceFolders || [];
    const workspaces: WorkspaceInfo[] = [];
    
    for (const folder of workspaceFolders) {
      const workspaceInfo = await this.createWorkspaceInfo(folder.uri);
      await this.validateWorkspace(workspaceInfo);
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
      info.warnings.push('Empty workspace. Create packages using "Create New Package" command.');
      info.isValid = true;
      return;
    }
    
    if (!installExists && !buildExists) {
      info.warnings.push('Workspace has not been built yet. Run "colcon build".');
    }
    
    if (info.rosDistribution === null) {
      info.warnings.push('No ROS2 installation found for this workspace.');
    }
    
    if (srcExists && info.srcPath) {
      try {
        info.packages = await this.packageDiscovery.discoverPackages(info.srcPath.fsPath);
      } catch (error) {
        info.warnings.push(`Package discovery failed: ${(error as Error).message}`);
        info.packages = [];
      }
    }
    
    info.isValid = true;
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
