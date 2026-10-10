import * as vscode from 'vscode';
import { LaunchWizard } from '../../../wizard/launch-wizard';
import { PackageDiscoveryService } from '../../../core/package-discovery';

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

describe('LaunchWizard resolveDefaultSaveDir', () => {
  let wizard: LaunchWizard;

  beforeEach(() => {
    wizard = new LaunchWizard('/tmp/ws', discovery);
  });

  it('returns null for package_launch_folder when no target package is set', () => {
    mockLaunchConfig({ defaultLocation: 'package_launch_folder' });
    expect(wizard.resolveDefaultSaveDir()).toBeNull();
  });

  it('resolves workspace_root to the workspace root', () => {
    mockLaunchConfig({ defaultLocation: 'workspace_root' });
    expect(wizard.resolveDefaultSaveDir()).toBe('/tmp/ws');
  });

  it('substitutes {workspace} and {package} in custom paths', () => {
    mockLaunchConfig({
      defaultLocation: 'custom',
      customPath: '{workspace}/launches/{package}',
    });
    expect(wizard.resolveDefaultSaveDir()).toBe('/tmp/ws/launches/{package}');
  });

  it('returns null for custom with an empty customPath', () => {
    mockLaunchConfig({ defaultLocation: 'custom', customPath: '' });
    expect(wizard.resolveDefaultSaveDir()).toBeNull();
  });

  it('defaults to package_launch_folder when the setting is absent', () => {
    mockLaunchConfig({});
    expect(wizard.resolveDefaultSaveDir()).toBeNull();
  });
});
