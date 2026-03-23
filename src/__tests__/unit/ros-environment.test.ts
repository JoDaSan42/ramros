import * as fs from 'fs';
import * as path from 'path';
import { RosEnvironmentService, RosDistribution } from '../../core/ros-environment';

describe('RosEnvironmentService', () => {
  let service: RosEnvironmentService;
  let originalRosDistro: string | undefined;
  
  const mockRosRoot = '/tmp/test-ros';
  const mockDistroPath = path.join(mockRosRoot, 'jazzy');
  const mockSetupBash = path.join(mockDistroPath, 'setup.bash');
  
  beforeAll(() => {
    originalRosDistro = process.env.ROS_DISTRO;
  });
  
  afterAll(() => {
    if (originalRosDistro) {
      process.env.ROS_DISTRO = originalRosDistro;
    } else {
      delete process.env.ROS_DISTRO;
    }
  });
  
  beforeEach(() => {
    service = new RosEnvironmentService();
    (service as any).rosRoot = mockRosRoot;
    delete process.env.ROS_DISTRO;
    
    // Cleanup
    if (fs.existsSync(mockRosRoot)) {
      fs.rmSync(mockRosRoot, { recursive: true, force: true });
    }
  });
  
  describe('detectInstallations', () => {
    it('should return empty array when no ROS installation exists', async () => {
      const result = await service.detectInstallations();
      expect(result).toEqual([]);
    });
    
    it('should detect single ROS installation', async () => {
      fs.mkdirSync(mockDistroPath, { recursive: true });
      fs.writeFileSync(mockSetupBash, '#!/bin/bash\nexport ROS_DISTRO_RELEASE="23.04"');
      
      const result = await service.detectInstallations();
      
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        name: 'jazzy',
        installPath: mockDistroPath,
        setupBash: mockSetupBash,
        isActive: false
      });
    });
    
    it('should detect multiple ROS installations', async () => {
      const distros = ['humble', 'jazzy'];
      
      for (const distro of distros) {
        const distroPath = path.join(mockRosRoot, distro);
        fs.mkdirSync(distroPath, { recursive: true });
        fs.writeFileSync(
          path.join(distroPath, 'setup.bash'),
          `#!/bin/bash\nexport ROS_DISTRO_RELEASE="${distro}"`
        );
      }
      
      const result = await service.detectInstallations();
      
      expect(result).toHaveLength(2);
      expect(result.map(r => r.name)).toEqual(['humble', 'jazzy']);
    });
    
    it('should filter unsupported distributions', async () => {
      const unsupportedPath = path.join(mockRosRoot, 'unsupported-distro');
      fs.mkdirSync(unsupportedPath, { recursive: true });
      fs.writeFileSync(path.join(unsupportedPath, 'setup.bash'), '#!/bin/bash');
      
      const result = await service.detectInstallations();
      expect(result).toHaveLength(0);
    });
    
    it('should mark active distribution correctly', async () => {
      fs.mkdirSync(mockDistroPath, { recursive: true });
      fs.writeFileSync(mockSetupBash, '#!/bin/bash');
      
      process.env.ROS_DISTRO = 'jazzy';
      
      const result = await service.detectInstallations();
      
      expect(result).toHaveLength(1);
      expect(result[0].isActive).toBe(true);
    });
    
    it('should skip directories without setup.bash', async () => {
      fs.mkdirSync(mockDistroPath, { recursive: true });
      // No setup.bash created
      
      const result = await service.detectInstallations();
      expect(result).toHaveLength(0);
    });
  });
  
  describe('getActiveDistribution', () => {
    it('should return null when ROS_DISTRO is not set', async () => {
      const result = await service.getActiveDistribution();
      expect(result).toBeNull();
    });
    
    it('should return active distribution when set', async () => {
      fs.mkdirSync(mockDistroPath, { recursive: true });
      fs.writeFileSync(mockSetupBash, '#!/bin/bash');
      
      process.env.ROS_DISTRO = 'jazzy';
      
      const result = await service.getActiveDistribution();
      
      expect(result).not.toBeNull();
      expect(result?.name).toBe('jazzy');
    });
    
    it('should return null when active distro is not installed', async () => {
      process.env.ROS_DISTRO = 'jazzy';
      
      const result = await service.getActiveDistribution();
      expect(result).toBeNull();
    });
  });
  
  describe('validateInstallation', () => {
    it('should return true for valid installation', async () => {
      fs.mkdirSync(mockDistroPath, { recursive: true });
      fs.writeFileSync(mockSetupBash, '#!/bin/bash');
      
      const distro: RosDistribution = {
        name: 'jazzy',
        version: '1.0',
        installPath: mockDistroPath,
        setupBash: mockSetupBash,
        isActive: false
      };
      
      const result = await service.validateInstallation(distro);
      expect(result).toBe(true);
    });
    
    it('should return false when install path does not exist', async () => {
      const distro: RosDistribution = {
        name: 'jazzy',
        version: '1.0',
        installPath: '/nonexistent/path',
        setupBash: '/nonexistent/setup.bash',
        isActive: false
      };
      
      const result = await service.validateInstallation(distro);
      expect(result).toBe(false);
    });
    
    it('should return false when setup.bash does not exist', async () => {
      fs.mkdirSync(mockDistroPath, { recursive: true });
      // No setup.bash
      
      const distro: RosDistribution = {
        name: 'jazzy',
        version: '1.0',
        installPath: mockDistroPath,
        setupBash: mockSetupBash,
        isActive: false
      };
      
      const result = await service.validateInstallation(distro);
      expect(result).toBe(false);
    });
  });
});
