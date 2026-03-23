import * as fs from 'fs';
import * as path from 'path';

export interface RosDistribution {
  name: string;
  version: string;
  installPath: string;
  setupBash: string;
  isActive: boolean;
}

const SUPPORTED_DISTROS = ['humble', 'jazzy', 'rolling', 'iron', 'galactic', 'foxy'];

export class RosEnvironmentService {
  private readonly rosRoot = '/opt/ros';
  
  async detectInstallations(): Promise<RosDistribution[]> {
    const distributions: RosDistribution[] = [];
    const activeDistro = this.getActiveDistributionName();
    
    if (!fs.existsSync(this.rosRoot)) {
      return distributions;
    }
    
    const entries = fs.readdirSync(this.rosRoot, { withFileTypes: true });
    
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      
      const distroName = entry.name.toLowerCase();
      if (!SUPPORTED_DISTROS.includes(distroName)) continue;
      
      const installPath = path.join(this.rosRoot, entry.name);
      const setupBash = path.join(installPath, 'setup.bash');
      
      if (!fs.existsSync(setupBash)) continue;
      
      const version = await this.readDistroVersion(installPath);
      
      distributions.push({
        name: distroName,
        version: version || 'unknown',
        installPath,
        setupBash,
        isActive: distroName === activeDistro?.toLowerCase()
      });
    }
    
    return distributions.sort((a, b) => a.name.localeCompare(b.name));
  }
  
  async getActiveDistribution(): Promise<RosDistribution | null> {
    const activeName = this.getActiveDistributionName();
    if (!activeName) return null;
    
    const distributions = await this.detectInstallations();
    return distributions.find(d => d.name === activeName.toLowerCase()) || null;
  }
  
  async validateInstallation(dist: RosDistribution): Promise<boolean> {
    if (!fs.existsSync(dist.installPath)) return false;
    if (!fs.existsSync(dist.setupBash)) return false;
    
    const stats = fs.statSync(dist.setupBash);
    if (!stats.isFile()) return false;
    
    return true;
  }
  
  private getActiveDistributionName(): string | null {
    return process.env.ROS_DISTRO || null;
  }
  
  private async readDistroVersion(installPath: string): Promise<string | null> {
    const setupBashPath = path.join(installPath, 'setup.bash');
    
    try {
      const content = fs.readFileSync(setupBashPath, 'utf-8');
      const match = content.match(/ROS_DISTRO_RELEASE=(?:'|")([^'"]+)(?:'|")/);
      if (match && match[1]) {
        return match[1];
      }
    } catch {
      // Ignore read errors
    }
    
    const rosVersionPath = path.join(installPath, 'ros_version');
    if (fs.existsSync(rosVersionPath)) {
      try {
        const version = fs.readFileSync(rosVersionPath, 'utf-8').trim();
        if (version) return version;
      } catch {
        // Ignore
      }
    }
    
    return null;
  }
}
