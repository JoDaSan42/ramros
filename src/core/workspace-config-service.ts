import * as fs from 'fs';
import * as path from 'path';

export interface LiveViewConfig {
  enabled?: boolean;
  refreshRate?: number;
}

export interface RamrosWorkspaceConfig {
  bagFolders?: string[];
  liveView?: LiveViewConfig;
}

const CONFIG_FILE_NAME = 'ramros.json';

/**
 * Reads and writes the per-workspace `ramros.json` configuration file
 * located at the workspace root.
 */
export class WorkspaceConfigService {
  constructor(
    private readonly getWorkspaceRoot: () => string | undefined
  ) {}

  get configFilePath(): string | undefined {
    const root = this.getWorkspaceRoot();
    if (!root) {
      return undefined;
    }
    return path.join(root, CONFIG_FILE_NAME);
  }

  async readConfig(): Promise<RamrosWorkspaceConfig> {
    const configPath = this.configFilePath;
    if (!configPath) {
      return {};
    }
    let raw: string;
    try {
      raw = await fs.promises.readFile(configPath, 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return {};
      }
      console.warn(
        `RAMROS: failed to read ${configPath}: ${String(error)}`
      );
      return {};
    }
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as RamrosWorkspaceConfig;
      }
      console.warn(`RAMROS: ignoring non-object ${CONFIG_FILE_NAME} content`);
      return {};
    } catch (error) {
      console.warn(
        `RAMROS: failed to parse ${configPath}: ${String(error)}`
      );
      return {};
    }
  }

  async writeConfig(config: RamrosWorkspaceConfig): Promise<void> {
    const configPath = this.configFilePath;
    if (!configPath) {
      return;
    }
    const content = JSON.stringify(config, null, 2) + '\n';
    await fs.promises.writeFile(configPath, content, 'utf8');
  }

  async getBagFolders(): Promise<string[]> {
    const config = await this.readConfig();
    return config.bagFolders ?? [];
  }

  async addBagFolder(folder: string): Promise<void> {
    const config = await this.readConfig();
    const bagFolders = config.bagFolders ?? [];
    if (bagFolders.includes(folder)) {
      return;
    }
    await this.writeConfig({ ...config, bagFolders: [...bagFolders, folder] });
  }

  async removeBagFolder(folder: string): Promise<void> {
    const config = await this.readConfig();
    const bagFolders = config.bagFolders ?? [];
    if (!bagFolders.includes(folder)) {
      return;
    }
    await this.writeConfig({
      ...config,
      bagFolders: bagFolders.filter(f => f !== folder)
    });
  }

  async getLiveViewConfig(): Promise<LiveViewConfig> {
    const config = await this.readConfig();
    return config.liveView ?? {};
  }

  async setLiveViewConfig(partial: LiveViewConfig): Promise<void> {
    const config = await this.readConfig();
    const liveView = config.liveView ?? {};
    await this.writeConfig({
      ...config,
      liveView: { ...liveView, ...partial }
    });
  }
}
