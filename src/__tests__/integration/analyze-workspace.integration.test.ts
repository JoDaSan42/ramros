import * as vscode from 'vscode';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { activate, __resetInterfaceLoaderForTests } from '../../extension';
import { RamrosDocProvider } from '../../core/ramros-doc-provider';

jest.mock('child_process', () => {
  const execMock = jest.fn((...args: unknown[]) => {
    const command = String(args[0]);
    const cb = args[args.length - 1] as (error: Error | null, stdout: string, stderr: string) => void;
    if (command.includes('ros2 pkg list')) {
      cb(null, 'rclpy\nrclcpp\nstd_msgs\ngeometry_msgs\n', '');
      return;
    }
    cb(new Error('ros2 CLI not available in tests'), '', '');
  });
  Object.defineProperty(execMock, Symbol.for('nodejs.util.promisify.custom'), {
    value: (command: string, options: unknown) =>
      new Promise((resolve, reject) => {
        execMock(command, options, (error: Error | null, stdout: string, stderr: string) => {
          if (error) {
            reject(error);
          } else {
            resolve({ stdout, stderr });
          }
        });
      }),
    configurable: true
  });
  return { exec: execMock };
});

function makeExtensionContext(): vscode.ExtensionContext {
  return {
    workspaceState: { get: jest.fn(), update: jest.fn() },
    globalState: { get: jest.fn(), update: jest.fn() },
    subscriptions: [],
    extensionUri: { fsPath: '/ext' } as vscode.Uri,
    extensionPath: '/ext'
  } as unknown as vscode.ExtensionContext;
}

function makePackageInfo(pkgRoot: string, dependencies: Array<{ name: string; type: 'build' | 'exec' | 'test' }> = []): unknown {
  return {
    name: 'demo_pkg',
    path: pkgRoot,
    version: '0.0.1',
    description: 'demo',
    maintainers: [],
    license: 'Apache-2.0',
    buildType: 'ament_python',
    packageType: 'python',
    dependencies,
    nodes: [],
    interfaces: [],
    launchFiles: []
  };
}

function makeWorkspaceInfo(
  rootPath: string,
  installPath: string,
  packages: unknown[] = [],
  id?: string
): unknown {
  return {
    id: id ?? rootPath,
    name: path.basename(rootPath),
    rootPath: { fsPath: rootPath } as vscode.Uri,
    installPath: { fsPath: installPath } as vscode.Uri,
    srcPath: { fsPath: path.join(rootPath, 'src') } as vscode.Uri,
    packages
  };
}

/**
 * Writes a minimal ament_python package. `withMissingDep` makes the code
 * import geometry_msgs without declaring it (missing-dependency warning);
 * `withNodeFile` drops a python file that imports rclpy without an
 * entry point (unregistered-node error).
 */
function makePackageRoot(root: string, options: { withMissingDep?: boolean; withNodeFile?: boolean } = {}): string {
  const pkgRoot = path.join(root, 'src', 'demo_pkg');
  fs.mkdirSync(path.join(pkgRoot, 'demo_pkg'), { recursive: true });

  fs.writeFileSync(
    path.join(pkgRoot, 'package.xml'),
    [
      '<?xml version="1.0"?>',
      '<package format="3">',
      '  <name>demo_pkg</name>',
      '  <version>0.0.1</version>',
      '  <description>demo</description>',
      '  <maintainer email="a@b.c">a</maintainer>',
      '  <license>Apache-2.0</license>',
      '  <build_type>ament_python</build_type>',
      '</package>',
      ''
    ].join('\n'),
    'utf8'
  );
  fs.writeFileSync(
    path.join(pkgRoot, 'setup.py'),
    "from setuptools import setup\nsetup(name='demo_pkg', version='0.0.1', entry_points={'console_scripts': ['demo = demo_pkg.demo:main']})\n",
    'utf8'
  );

  const demoLines = ['def main():', '    pass', ''];
  if (options.withMissingDep) {
    // Code uses geometry_msgs; package.xml does not declare it.
    demoLines.unshift('from geometry_msgs.msg import Pose');
  }
  fs.writeFileSync(path.join(pkgRoot, 'demo_pkg', 'demo.py'), demoLines.join('\n'), 'utf8');

  if (options.withNodeFile) {
    fs.writeFileSync(path.join(pkgRoot, 'demo_pkg', 'copied_node.py'), 'import rclpy\nrclpy.init()\n', 'utf8');
  }
  return pkgRoot;
}

async function activateWithWorkspace(tempDir: string): Promise<void> {
  (vscode.workspace as unknown as { workspaceFolders: unknown }).workspaceFolders = [
    { uri: { fsPath: tempDir }, name: path.basename(tempDir), index: 0 }
  ];
  (vscode.workspace as unknown as { fs: unknown }).fs = {
    stat: async (uri: { fsPath?: string; path?: string }) => {
      const filePath = uri.fsPath ?? uri.path ?? '';
      const stat = fs.statSync(filePath);
      return {
        type: stat.isDirectory() ? vscode.FileType.Directory : vscode.FileType.File,
        ctime: stat.ctimeMs,
        mtime: stat.mtimeMs,
        size: stat.size
      };
    }
  };
  activate(makeExtensionContext());
  // Workspace detection inside activate is async; let it settle.
  await new Promise(resolve => setTimeout(resolve, 100));
}

function getCommandHandler(commandId: string): (treeItem?: unknown) => Promise<void> {
  const call = (vscode.commands.registerCommand as jest.Mock).mock.calls.find(([id]) => id === commandId);
  expect(call).toBeDefined();
  return call![1] as (treeItem?: unknown) => Promise<void>;
}

function setTreeProviderStub(...workspaces: unknown[]): Promise<void> {
  return import('../../extension').then(({ __setTreeProviderForTests }) => {
    __setTreeProviderForTests({ getWorkspaces: () => workspaces } as never);
  });
}

describe('analyze workspace completeness command', () => {
  let tempDir: string;
  let setSpy: jest.SpyInstance;
  /** Last content passed to RamrosDocProvider.set (the report body). */
  let lastReport = '';

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ramros-analyze-'));
    fs.mkdirSync(path.join(tempDir, 'install'), { recursive: true });
    fs.writeFileSync(path.join(tempDir, 'install', 'setup.bash'), '', 'utf8');

    (vscode.window.showQuickPick as jest.Mock).mockReset();
    (vscode.window.showErrorMessage as jest.Mock).mockReset();
    (vscode.window.showTextDocument as jest.Mock).mockReset().mockResolvedValue({});
    (vscode.commands.registerCommand as jest.Mock).mockClear();
    lastReport = '';
    // The command shows the report on the provider instance created inside
    // activate(); spy on the prototype so any instance is captured.
    setSpy = jest.spyOn(RamrosDocProvider.prototype, 'set').mockImplementation(function (this: RamrosDocProvider, uri: vscode.Uri, content: string) {
      lastReport = content;
      (this as unknown as { contents: Map<string, string> }).contents.set(uri.path, content);
      (this as unknown as { onDidChangeEmitter: { fire: (uri: vscode.Uri) => void } }).onDidChangeEmitter.fire(uri);
    });
    __resetInterfaceLoaderForTests();
  });

  afterEach(() => {
    setSpy.mockRestore();
    jest.restoreAllMocks();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('registers the analyzeWorkspace command', async () => {
    await activateWithWorkspace(tempDir);

    const ids = (vscode.commands.registerCommand as jest.Mock).mock.calls.map(([id]) => id);
    expect(ids).toContain('ramros.analyzeWorkspace');
  });

  it('produces a grouped report with findings for an incomplete workspace', async () => {
    const pkgRoot = makePackageRoot(tempDir, { withMissingDep: true, withNodeFile: true });
    await activateWithWorkspace(tempDir);
    // Missing dep: code imports geometry_msgs, package.xml declares only rclpy.
    await setTreeProviderStub(
      makeWorkspaceInfo(tempDir, path.join(tempDir, 'install'), [
        makePackageInfo(pkgRoot, [{ name: 'rclpy', type: 'exec' }])
      ])
    );

    const handler = getCommandHandler('ramros.analyzeWorkspace');
    await handler({ id: tempDir, rootPath: { fsPath: tempDir } });

    expect(vscode.window.showTextDocument).toHaveBeenCalled();
    expect(lastReport).toContain('## demo_pkg');
    expect(lastReport).toContain('[warning]');
    expect(lastReport).toContain('missing-dependency');
    expect(lastReport).toContain('geometry_msgs');
    expect(lastReport).toContain('unregistered-node');
    expect(lastReport).toContain('copied_node.py');
  });

  it('reports no issues for a clean workspace', async () => {
    const pkgRoot = makePackageRoot(tempDir, {});
    await activateWithWorkspace(tempDir);
    await setTreeProviderStub(
      makeWorkspaceInfo(tempDir, path.join(tempDir, 'install'), [
        makePackageInfo(pkgRoot, [])
      ])
    );

    const handler = getCommandHandler('ramros.analyzeWorkspace');
    await handler({ id: tempDir, rootPath: { fsPath: tempDir } });

    expect(lastReport).toContain('No completeness issues found.');
  });

  it('falls back to the workspace pick when invoked without a tree item', async () => {
    const pkgRoot = makePackageRoot(tempDir, {});
    await activateWithWorkspace(tempDir);
    // Two workspaces force the QuickPick path in pickWorkspace.
    const otherDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ramros-analyze-other-'));
    fs.mkdirSync(path.join(otherDir, 'install'), { recursive: true });
    await setTreeProviderStub(
      makeWorkspaceInfo(tempDir, path.join(tempDir, 'install'), [makePackageInfo(pkgRoot, [])]),
      makeWorkspaceInfo(otherDir, path.join(otherDir, 'install'), [], otherDir)
    );
    (vscode.window.showQuickPick as jest.Mock).mockResolvedValue(path.basename(tempDir));

    const handler = getCommandHandler('ramros.analyzeWorkspace');
    await handler(undefined);

    expect(vscode.window.showQuickPick).toHaveBeenCalled();
    expect(vscode.window.showTextDocument).toHaveBeenCalled();
    fs.rmSync(otherDir, { recursive: true, force: true });
  });

  it('is declared in package.json and bound to the workspace context menu', async () => {
    const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, '../../../package.json'), 'utf8'));

    const command = packageJson.contributes.commands.find(
      (entry: { command: string }) => entry.command === 'ramros.analyzeWorkspace'
    );
    expect(command).toBeDefined();

    const menus: Array<{ command: string; when?: string }> = packageJson.contributes.menus['view/item/context'];
    const binding = menus.find(
      (entry: { command: string }) => entry.command === 'ramros.analyzeWorkspace'
    );
    expect(binding?.when).toContain('workspaceRoot');
  });
});
