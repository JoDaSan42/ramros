import * as path from 'path';
import { PackageDiscoveryService, PackageInfo } from '../../../core/package-discovery';

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
});
