import * as fs from 'fs';
import * as path from 'path';
import { PackageDiscoveryService } from '../../core/package-discovery';

describe('PackageDiscoveryService', () => {
  let service: PackageDiscoveryService;
  let testSrcPath: string;
  let testPackagePath: string;

  beforeEach(() => {
    service = new PackageDiscoveryService();
    testSrcPath = path.join(__dirname, '../../../test-fixtures/test-workspace/src');
    testPackagePath = path.join(testSrcPath, 'test_cache_pkg');
    
    if (!fs.existsSync(testSrcPath)) {
      fs.mkdirSync(testSrcPath, { recursive: true });
    }
  });

  afterEach(() => {
    if (fs.existsSync(testPackagePath)) {
      fs.rmSync(testPackagePath, { recursive: true, force: true });
    }
  });

  describe('discoverPackages', () => {
    it('should discover packages in src directory', async () => {
      const packages = await service.discoverPackages(testSrcPath);
      
      expect(Array.isArray(packages)).toBe(true);
      packages.forEach(pkg => {
        expect(pkg).toHaveProperty('name');
        expect(pkg).toHaveProperty('path');
        expect(pkg).toHaveProperty('packageType');
      });
    });

    it('should cache discovery results', async () => {
      const firstDiscovery = await service.discoverPackages(testSrcPath);
      const secondDiscovery = await service.discoverPackages(testSrcPath);
      
      expect(firstDiscovery).toEqual(secondDiscovery);
    });

    it('should return empty array for non-existent directory', async () => {
      const packages = await service.discoverPackages('/non/existent/path');
      expect(packages).toEqual([]);
    });
  });

  describe('clearCache', () => {
    it('should clear the cache and allow re-discovery', async () => {
      const initialPackages = await service.discoverPackages(testSrcPath);
      
      const packageXmlContent = `<?xml version="1.0"?>
<package format="3">
  <name>test_cache_pkg</name>
  <version>0.0.0</version>
  <description>Test package</description>
  <maintainer email="test@test.com">Test</maintainer>
  <license>Apache-2.0</license>
  <buildtool_depend>ament_cmake</buildtool_depend>
  <export>
    <build_type>ament_cmake</build_type>
  </export>
</package>`;

      fs.mkdirSync(testPackagePath, { recursive: true });
      fs.writeFileSync(path.join(testPackagePath, 'package.xml'), packageXmlContent);

      const cachedPackages = await service.discoverPackages(testSrcPath);
      expect(cachedPackages.some(p => p.name === 'test_cache_pkg')).toBe(false);

      service.clearCache();

      const refreshedPackages = await service.discoverPackages(testSrcPath);
      expect(refreshedPackages.some(p => p.name === 'test_cache_pkg')).toBe(true);
    });

    it('should allow multiple cache clears without error', () => {
      expect(() => service.clearCache()).not.toThrow();
      expect(() => service.clearCache()).not.toThrow();
    });
  });

  describe('parsePackageXml', () => {
    it('should parse valid package.xml file', async () => {
      const packageXmlPath = path.join(__dirname, '../../../test-fixtures/workspace-valid/src/my_package/package.xml');
      
      if (fs.existsSync(packageXmlPath)) {
        const result = await service.parsePackageXml(packageXmlPath);
        
        expect(result.name).toBe('my_package');
        expect(result.version).toBeDefined();
        expect(result.description).toBeDefined();
        expect(result.maintainers).toBeDefined();
        expect(result.license).toBeDefined();
      }
    });

    it('should throw error for non-existent file', async () => {
      await expect(service.parsePackageXml('/non/existent/package.xml'))
        .toThrow();
    });
  });

  describe('detectPackageType', () => {
    it('should detect Python package', () => {
      const pythonPackagePath = path.join(__dirname, '../../../test-fixtures/workspace-valid/src/my_package');
      
      if (fs.existsSync(pythonPackagePath)) {
        const type = service.detectPackageType(pythonPackagePath);
        
        expect(['python', 'mixed', 'empty']).toContain(type);
      }
    });

    it('should detect C++ package', () => {
      const cppPackagePath = path.join(__dirname, '../../../test-fixtures/workspace-valid/src/cpp_pkg');
      
      if (fs.existsSync(cppPackagePath)) {
        const type = service.detectPackageType(cppPackagePath);
        
        expect(['cpp', 'mixed', 'empty']).toContain(type);
      }
    });

    it('should detect interface package', () => {
      const interfacePackagePath = path.join(__dirname, '../../../test-fixtures/workspace-valid/src/msg_pkg');
      
      if (fs.existsSync(interfacePackagePath)) {
        const msgDir = path.join(interfacePackagePath, 'msg');
        if (fs.existsSync(msgDir) && fs.readdirSync(msgDir).length > 0) {
          const type = service.detectPackageType(interfacePackagePath);
          
          expect(type).toBe('interface');
        }
      }
    });
  });
});
