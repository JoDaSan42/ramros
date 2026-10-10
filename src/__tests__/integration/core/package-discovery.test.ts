import * as path from 'path';
import * as vscode from 'vscode';
import { PackageDiscoveryService, PackageInfo, InstalledPackageInfo, NodeInfo } from '../../../core/package-discovery';

describe('PackageDiscoveryService', () => {
  const testFixturesPath = path.join(__dirname, '../../../../test-fixtures');
  
  let service: PackageDiscoveryService;
  
  beforeEach(() => {
    service = new PackageDiscoveryService();
  });
  
  describe('discoverPackages', () => {
    it('should discover packages in a valid workspace', async () => {
      const workspacePath = path.join(testFixturesPath, 'workspace-valid');
      const srcPath = path.join(workspacePath, 'src');
      
      const packages = await service.discoverPackages(srcPath);
      
      expect(packages).toBeDefined();
      expect(packages.length).toBeGreaterThan(0);
      
      const myPackage = packages.find((p: PackageInfo) => p.name === 'my_package');
      expect(myPackage).toBeDefined();
      expect(myPackage?.path).toContain('my_package');
      expect(myPackage?.nodes).toBeDefined();
      expect(myPackage?.nodes.length).toBeGreaterThan(0);
    });
    
    it('should discover interface packages correctly', async () => {
      const interfacePackagePath = path.join(testFixturesPath, 'interface-package-example');
      const parentDir = path.dirname(interfacePackagePath);
      
      const packages = await service.discoverPackages(parentDir);
      
      const pkg = packages.find((p: PackageInfo) => p.name === 'interface_package_example');
      expect(pkg).toBeDefined();
      
      if (pkg) {
        expect(pkg.packageType).toBe('interface');
        expect(pkg.interfaces.length).toBeGreaterThan(0);
        
        const msgFiles = pkg.interfaces.filter((i: { type: string }) => i.type === 'message');
        const srvFiles = pkg.interfaces.filter((i: { type: string }) => i.type === 'service');
        const actionFiles = pkg.interfaces.filter((i: { type: string }) => i.type === 'action');
        
        expect(msgFiles.length).toBe(2);
        expect(srvFiles.length).toBe(2);
        expect(actionFiles.length).toBe(1);
      }
    });
    
    it('should discover mixed packages correctly', async () => {
      const mixedPackagePath = path.join(testFixturesPath, 'mixed-package-example');
      const parentDir = path.dirname(mixedPackagePath);
      
      const packages = await service.discoverPackages(parentDir);
      
      const pkg = packages.find((p: PackageInfo) => p.name === 'mixed_package_example');
      expect(pkg).toBeDefined();
      
      if (pkg) {
        expect(pkg.packageType).toBe('mixed');
        expect(pkg.nodes.length).toBeGreaterThanOrEqual(1);
        
        const cppNode = pkg.nodes.find((n: { language: string }) => n.language === 'cpp');
        
        expect(cppNode).toBeDefined();
      }
    });
    
    it('should discover empty packages correctly', async () => {
      const emptyPackagePath = path.join(testFixturesPath, 'empty-package-example');
      const parentDir = path.dirname(emptyPackagePath);
      
      const packages = await service.discoverPackages(parentDir);
      
      const pkg = packages.find((p: PackageInfo) => p.name === 'empty_package_example');
      expect(pkg).toBeDefined();
      
      if (pkg) {
        expect(pkg.packageType).toBe('empty');
        expect(pkg.nodes.length).toBe(0);
        expect(pkg.interfaces.length).toBe(0);
      }
    });
    
    it('should include packageName in node info', async () => {
      const workspacePath = path.join(testFixturesPath, 'workspace-valid');
      const srcPath = path.join(workspacePath, 'src');
      
      const packages = await service.discoverPackages(srcPath);
      const myPackage = packages.find((p: PackageInfo) => p.name === 'my_package');
      
      expect(myPackage).toBeDefined();
      expect(myPackage?.nodes.length).toBeGreaterThan(0);
      
      const node = myPackage?.nodes[0];
      expect(node?.packageName).toBe('my_package');
    });

    it('should detect services and actions in C++ and Python nodes', async () => {
      const packages = await service.discoverPackages(testFixturesPath);
      const pkg = packages.find((p: PackageInfo) => p.name === 'mixed_package_example');
      expect(pkg).toBeDefined();

      const cppNode = pkg?.nodes.find((n: NodeInfo) => n.language === 'cpp');
      expect(cppNode?.serviceServers).toBeDefined();
      expect(cppNode?.serviceServers?.map(s => s.name)).toContain('/my_service');
      expect(cppNode?.serviceClients?.map(s => s.name)).toContain('/other_service');
      expect(cppNode?.actionServers?.map(a => a.name)).toContain('/my_action');
      expect(cppNode?.actionClients?.map(a => a.name)).toContain('/cli_action');

      const pyNode = pkg?.nodes.find((n: NodeInfo) => n.language === 'python');
      expect(pyNode?.serviceServers?.map(s => s.name)).toContain('/py_service');
      expect(pyNode?.serviceClients?.map(s => s.name)).toContain('/py_other_service');
      expect(pyNode?.actionServers?.map(a => a.name)).toContain('/py_action');
      expect(pyNode?.actionClients?.map(a => a.name)).toContain('/py_cli_action');
    });

    it('should not detect services from commented-out code', async () => {
      const packages = await service.discoverPackages(testFixturesPath);
      const cppNode = packages.find((p: PackageInfo) => p.name === 'mixed_package_example')
        ?.nodes.find((n: NodeInfo) => n.language === 'cpp');
      expect(cppNode?.serviceServers?.map(s => s.name)).not.toContain('/commented_service');
    });
  });
  
  describe('parsePackageXml', () => {
    it('should parse package.xml correctly', async () => {
      const packageXmlPath = path.join(testFixturesPath, 'workspace-valid', 'src', 'my_package', 'package.xml');
      
      const info = await service.parsePackageXml(packageXmlPath);
      
      expect(info).toBeDefined();
      if (info) {
        expect(info.name).toBe('my_package');
        expect(info.version).toBe('0.1.0');
        expect(info.description).toBeDefined();
        expect(info.license).toBe('MIT');
        expect(info.maintainers).toBeDefined();
      }
    });
    
    it('should handle missing package.xml gracefully', async () => {
      const result = await service.parsePackageXml('/nonexistent/package.xml');
      
      expect(result).toBeUndefined();
    });
  });

  describe('discoverInstalledPackages caching', () => {
    const makePackage = (name: string): InstalledPackageInfo => ({
      name,
      path: `/opt/ros/test/share/${name}`,
      installPath: '/opt/ros/test',
      source: 'installed',
      version: '',
      description: '',
      maintainers: [],
      license: '',
      buildType: 'ament_cmake',
      packageType: 'empty',
      dependencies: [],
      nodes: [],
      interfaces: [],
      launchFiles: [],
    });

    const makeMemento = (): vscode.Memento => {
      const store = new Map<string, unknown>();
      return {
        get: (key: string) => store.get(key),
        update: async (key: string, value: unknown) => {
          store.set(key, value);
        },
        keys: () => [...store.keys()],
      } as unknown as vscode.Memento;
    };

    it('scans only once and reuses the in-memory result', async () => {
      const scanner = jest.fn().mockResolvedValue([makePackage('a')]);
      const svc = new PackageDiscoveryService(undefined, undefined, scanner);

      await svc.discoverInstalledPackages();
      await svc.discoverInstalledPackages();

      expect(scanner).toHaveBeenCalledTimes(1);
    });

    it('persists the scan and reuses it from the memento in a new service', async () => {
      const memento = makeMemento();
      const firstScanner = jest.fn().mockResolvedValue([makePackage('a'), makePackage('b')]);
      const first = new PackageDiscoveryService(undefined, memento, firstScanner);
      await first.discoverInstalledPackages();
      expect(firstScanner).toHaveBeenCalledTimes(1);

      // A fresh service (e.g. after a VS Code restart) should not rescan.
      const secondScanner = jest.fn().mockResolvedValue([makePackage('c')]);
      const second = new PackageDiscoveryService(undefined, memento, secondScanner);
      const packages = await second.discoverInstalledPackages();

      expect(secondScanner).not.toHaveBeenCalled();
      expect(packages.map(p => p.name)).toEqual(['a', 'b']);
    });

    it('force refresh triggers a rescan and updates the memento', async () => {
      const scanner = jest.fn()
        .mockResolvedValueOnce([makePackage('a')])
        .mockResolvedValueOnce([makePackage('a'), makePackage('b')]);
      const svc = new PackageDiscoveryService(undefined, makeMemento(), scanner);

      await svc.discoverInstalledPackages();
      const refreshed = await svc.refreshInstalledPackages();

      expect(scanner).toHaveBeenCalledTimes(2);
      expect(refreshed.map(p => p.name)).toEqual(['a', 'b']);
    });

    it('ignores a persisted snapshot for a different ROS distro', async () => {
      const memento = makeMemento();
      const original = process.env.ROS_DISTRO;
      process.env.ROS_DISTRO = 'humble';

      const first = new PackageDiscoveryService(undefined, memento, jest.fn().mockResolvedValue([makePackage('a')]));
      await first.discoverInstalledPackages();

      process.env.ROS_DISTRO = 'jazzy';
      const scanner = jest.fn().mockResolvedValue([makePackage('b')]);
      const second = new PackageDiscoveryService(undefined, memento, scanner);
      const packages = await second.discoverInstalledPackages();

      expect(scanner).toHaveBeenCalledTimes(1);
      expect(packages.map(p => p.name)).toEqual(['b']);

      process.env.ROS_DISTRO = original;
    });

    it('clearCache keeps the installed-package snapshot', async () => {
      const scanner = jest.fn().mockResolvedValue([makePackage('a')]);
      const svc = new PackageDiscoveryService(undefined, makeMemento(), scanner);

      await svc.discoverInstalledPackages();
      svc.clearCache();
      await svc.discoverInstalledPackages();

      expect(scanner).toHaveBeenCalledTimes(1);
    });

    it('getInstalledPackagesScannedAt returns null before any scan', () => {
      const svc = new PackageDiscoveryService(undefined, makeMemento());
      expect(svc.getInstalledPackagesScannedAt()).toBeNull();
    });

    it('does not cache an empty scan so it can retry after ROS is sourced', async () => {
      const memento = makeMemento();
      const scanner = jest.fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([makePackage('a')]);
      const svc = new PackageDiscoveryService(undefined, memento, scanner);

      const first = await svc.discoverInstalledPackages();
      expect(first).toEqual([]);

      const second = await svc.discoverInstalledPackages();
      expect(scanner).toHaveBeenCalledTimes(2);
      expect(second.map(p => p.name)).toEqual(['a']);
    });
  });
});
