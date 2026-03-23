import * as path from 'path';
import * as fs from 'fs';
import { WorkspaceInfo } from './workspace-detector';

export interface PackageInfo {
  name: string;
  packagePath: string;
  workspaceId: string;
}

export interface PackageConflict {
  packageName: string;
  locations: {
    workspaceId: string;
    packagePath: string;
  }[];
  type: 'same-workspace' | 'cross-workspace';
}

export class DuplicatePackageDetector {
  private readonly packageCache = new Map<string, PackageInfo[]>();
  
  async scanWorkspace(workspace: WorkspaceInfo): Promise<PackageInfo[]> {
    const cacheKey = `packages:${workspace.id}`;
    
    if (!workspace.srcPath) {
      return [];
    }
    
    const packages: PackageInfo[] = [];
    const srcPath = workspace.srcPath.fsPath;
    
    if (!fs.existsSync(srcPath)) {
      return packages;
    }
    
    const entries = fs.readdirSync(srcPath, { withFileTypes: true });
    
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      
      const packagePath = path.join(srcPath, entry.name);
      const packageXmlPath = path.join(packagePath, 'package.xml');
      
      if (!fs.existsSync(packageXmlPath)) continue;
      
      const packageName = await this.extractPackageName(packageXmlPath);
      if (!packageName) continue;
      
      packages.push({
        name: packageName,
        packagePath,
        workspaceId: workspace.id
      });
    }
    
    this.packageCache.set(cacheKey, packages);
    return packages;
  }
  
  async detectDuplicates(workspaces: WorkspaceInfo[]): Promise<PackageConflict[]> {
    const conflicts: PackageConflict[] = [];
    const packageMap = new Map<string, { workspaceId: string; packagePath: string }[]>();
    
    for (const workspace of workspaces) {
      const packages = await this.scanWorkspace(workspace);
      
      for (const pkg of packages) {
        if (!packageMap.has(pkg.name)) {
          packageMap.set(pkg.name, []);
        }
        packageMap.get(pkg.name)!.push({
          workspaceId: pkg.workspaceId,
          packagePath: pkg.packagePath
        });
      }
    }
    
    for (const [packageName, locations] of packageMap.entries()) {
      if (locations.length === 1) continue;
      
      const uniqueWorkspaceIds = new Set(locations.map(l => l.workspaceId));
      
      if (uniqueWorkspaceIds.size === 1) {
        conflicts.push({
          packageName,
          locations,
          type: 'same-workspace'
        });
      } else {
        conflicts.push({
          packageName,
          locations,
          type: 'cross-workspace'
        });
      }
    }
    
    return conflicts;
  }
  
  async isPackageNameUnique(name: string, workspaceId: string): Promise<boolean> {
    const cacheKey = `packages:${workspaceId}`;
    const packages = this.packageCache.get(cacheKey);
    
    if (!packages) {
      return true;
    }
    
    return !packages.some(p => p.name === name);
  }
  
  async validateNewPackageName(name: string, workspaceId: string, allWorkspaces: WorkspaceInfo[]): Promise<{
    isValid: boolean;
    error?: string;
    warning?: string;
  }> {
    const workspacePackages = await this.scanWorkspace(
      allWorkspaces.find(w => w.id === workspaceId)!
    );
    
    if (workspacePackages.some(p => p.name === name)) {
      return {
        isValid: false,
        error: `Package "${name}" existiert bereits in diesem Workspace`
      };
    }
    
    for (const workspace of allWorkspaces) {
      if (workspace.id === workspaceId) continue;
      
      const packages = await this.scanWorkspace(workspace);
      if (packages.some(p => p.name === name)) {
        return {
          isValid: true,
          warning: `Package "${name}" existiert in Workspace "${workspace.name}". Dies kann zu Konflikten führen.`
        };
      }
    }
    
    return { isValid: true };
  }
  
  private async extractPackageName(packageXmlPath: string): Promise<string | null> {
    try {
      const content = await fs.promises.readFile(packageXmlPath, 'utf-8');
      const match = content.match(/<name>\s*([^<]+)\s*<\/name>/);
      if (match && match[1]) {
        return match[1].trim();
      }
    } catch {
      // Ignore read errors
    }
    
    return null;
  }
  
  clearCache(): void {
    this.packageCache.clear();
  }
}
