import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  WorkspaceConfigService
} from '../../core/workspace-config-service';

describe('WorkspaceConfigService', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ramros-config-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  function createService(): WorkspaceConfigService {
    return new WorkspaceConfigService(() => tempDir);
  }

  function configPath(): string {
    return path.join(tempDir, 'ramros.json');
  }

  describe('configFilePath', () => {
    it('returns <root>/ramros.json', () => {
      expect(createService().configFilePath).toBe(configPath());
    });

    it('returns undefined when no workspace root', () => {
      const service = new WorkspaceConfigService(() => undefined);
      expect(service.configFilePath).toBeUndefined();
    });
  });

  describe('readConfig', () => {
    it('returns {} when file is missing', async () => {
      await expect(createService().readConfig()).resolves.toEqual({});
    });

    it('returns parsed config when file exists', async () => {
      fs.writeFileSync(configPath(), JSON.stringify({ bagFolders: ['/tmp/bags'] }));
      await expect(createService().readConfig()).resolves.toEqual({
        bagFolders: ['/tmp/bags']
      });
    });

    it('returns {} for corrupt JSON and warns', async () => {
      fs.writeFileSync(configPath(), '{not json');
      const warn = jest.spyOn(console, 'warn').mockImplementation();
      try {
        await expect(createService().readConfig()).resolves.toEqual({});
        expect(warn).toHaveBeenCalled();
      } finally {
        warn.mockRestore();
      }
    });

    it('returns {} when getWorkspaceRoot returns undefined', async () => {
      const service = new WorkspaceConfigService(() => undefined);
      await expect(service.readConfig()).resolves.toEqual({});
    });
  });

  describe('writeConfig / readConfig round-trip', () => {
    it('round-trips bagFolders', async () => {
      const service = createService();
      await service.writeConfig({ bagFolders: ['/a', '/b'] });
      await expect(service.readConfig()).resolves.toEqual({
        bagFolders: ['/a', '/b']
      });
    });

    it('writes pretty-printed JSON with trailing newline', async () => {
      const service = createService();
      await service.writeConfig({ bagFolders: ['/a'] });
      const raw = fs.readFileSync(configPath(), 'utf8');
      expect(raw).toBe(JSON.stringify({ bagFolders: ['/a'] }, null, 2) + '\n');
    });
  });

  describe('bag folders', () => {
    it('getBagFolders returns [] when absent', async () => {
      await expect(createService().getBagFolders()).resolves.toEqual([]);
    });

    it('addBagFolder adds a folder', async () => {
      const service = createService();
      await service.addBagFolder('/bags');
      await expect(service.getBagFolders()).resolves.toEqual(['/bags']);
    });

    it('addBagFolder dedupes', async () => {
      const service = createService();
      await service.addBagFolder('/bags');
      await service.addBagFolder('/other');
      await service.addBagFolder('/bags');
      await expect(service.getBagFolders()).resolves.toEqual(['/bags', '/other']);
    });

    it('removeBagFolder removes a folder', async () => {
      const service = createService();
      await service.addBagFolder('/bags');
      await service.addBagFolder('/other');
      await service.removeBagFolder('/bags');
      await expect(service.getBagFolders()).resolves.toEqual(['/other']);
    });

    it('removeBagFolder is a no-op when absent', async () => {
      const service = createService();
      await service.addBagFolder('/bags');
      await service.removeBagFolder('/missing');
      await expect(service.getBagFolders()).resolves.toEqual(['/bags']);
    });

    it('addBagFolder does not throw and writes nothing without a root', async () => {
      const service = new WorkspaceConfigService(() => undefined);
      await expect(service.addBagFolder('/bags')).resolves.toBeUndefined();
      expect(service.configFilePath).toBeUndefined();
    });

    it('removeBagFolder does not throw without a root', async () => {
      const service = new WorkspaceConfigService(() => undefined);
      await expect(service.removeBagFolder('/bags')).resolves.toBeUndefined();
    });

    it('getBagFolders returns [] without a root', async () => {
      const service = new WorkspaceConfigService(() => undefined);
      await expect(service.getBagFolders()).resolves.toEqual([]);
    });
  });

  describe('live view config', () => {
    it('getLiveViewConfig returns {} when absent', async () => {
      await expect(createService().getLiveViewConfig()).resolves.toEqual({});
    });

    it('returns persisted liveView config', async () => {
      const service = createService();
      await service.writeConfig({ liveView: { enabled: true, refreshRate: 5 } });
      await expect(service.getLiveViewConfig()).resolves.toEqual({
        enabled: true,
        refreshRate: 5
      });
    });

    it('setLiveViewConfig merges into existing liveView', async () => {
      const service = createService();
      await service.setLiveViewConfig({ enabled: true, refreshRate: 10 });
      await service.setLiveViewConfig({ refreshRate: 2 });
      await expect(service.getLiveViewConfig()).resolves.toEqual({
        enabled: true,
        refreshRate: 2
      });
    });

    it('setLiveViewConfig({enabled: false}) preserves existing bagFolders', async () => {
      const service = createService();
      await service.addBagFolder('/bags');
      await service.setLiveViewConfig({ enabled: false });
      await expect(service.readConfig()).resolves.toEqual({
        bagFolders: ['/bags'],
        liveView: { enabled: false }
      });
    });

    it('setLiveViewConfig does not throw without a root', async () => {
      const service = new WorkspaceConfigService(() => undefined);
      await expect(
        service.setLiveViewConfig({ enabled: true })
      ).resolves.toBeUndefined();
    });

    it('getLiveViewConfig returns {} without a root', async () => {
      const service = new WorkspaceConfigService(() => undefined);
      await expect(service.getLiveViewConfig()).resolves.toEqual({});
    });
  });
});
