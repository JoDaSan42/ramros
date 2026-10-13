import * as vscode from 'vscode';
import { LaunchWizard } from '../../../wizard/launch-wizard';
import { PackageDiscoveryService, PackageInfo } from '../../../core/package-discovery';

const discovery = {
  discoverPackages: async () => [],
  discoverInstalledPackages: async () => [],
  getInstalledPackagesScannedAt: () => null,
} as unknown as PackageDiscoveryService;

function mockLaunchConfig(values: Record<string, unknown>): void {
  (vscode.workspace.getConfiguration as jest.Mock).mockImplementation(
    (section: string) => ({
      get: (key: string, defaultValue: unknown) => {
        if (section === 'ramros.launchGenerator') {
          return values[key] !== undefined ? values[key] : defaultValue;
        }
        return defaultValue;
      },
    })
  );
}

function makePackage(overrides: Partial<PackageInfo>): PackageInfo {
  return {
    name: 'my_pkg',
    path: '/ws/src/my_pkg',
    buildType: 'ament_python',
    nodes: [],
    interfaces: [],
    launchFiles: [],
    ...overrides,
  } as PackageInfo;
}

describe('LaunchWizard presetTargetPackage', () => {
  it('uses the preset target package without asking', async () => {
    mockLaunchConfig({ defaultLocation: 'package_launch_folder' });
    const target = makePackage({ name: 'preset_pkg', path: '/ws/src/preset_pkg' });

    const wizard = new LaunchWizard('/tmp/ws', discovery, target);
    expect(wizard.getTargetPackage()).toBe(target);
  });

  it('leaves target package unset when no preset is given', () => {
    mockLaunchConfig({ defaultLocation: 'package_launch_folder' });
    const wizard = new LaunchWizard('/tmp/ws', discovery);
    expect(wizard.getTargetPackage()).toBeNull();
  });

  it('resolves the preset package launch folder as default save dir', () => {
    mockLaunchConfig({ defaultLocation: 'package_launch_folder' });
    const target = makePackage({ name: 'preset_pkg', path: '/ws/src/preset_pkg' });

    const wizard = new LaunchWizard('/tmp/ws', discovery, target);
    expect(wizard.resolveDefaultSaveDir()).toBe('/ws/src/preset_pkg/launch');
  });
});
