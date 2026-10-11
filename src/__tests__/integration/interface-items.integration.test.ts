import { exec } from 'child_process';
import * as vscode from 'vscode';
import { RamrosDocProvider } from '../../core/ramros-doc-provider';
import { showInterfaceDefinition, runHealthCheck, __setDocProviderForTests } from '../../extension';
import { InterfaceFileItem } from '../../treeview/workspace-items';
import { CategoryInterfaceFileItem } from '../../treeview/category-items';
import { InterfaceInfo } from '../../core/package-discovery';

jest.mock('child_process', () => {
  const execMock = jest.fn((...args: unknown[]) => {
    const cb = args[args.length - 1] as (error: Error | null, stdout: string, stderr: string) => void;
    cb(new Error('ros2 CLI not available in tests'), '', '');
  });
  Object.defineProperty(execMock, Symbol.for('nodejs.util.promisify.custom'), {
    value: (command: string, options: unknown) =>
      new Promise((resolve, reject) => {
        execMock(command, options, (error: Error | null, stdout: string, stderr: string) => {
          if (error) {
            (error as Error & { stdout?: string; stderr?: string }).stdout = stdout;
            (error as Error & { stdout?: string; stderr?: string }).stderr = stderr;
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

describe('Interface tree item qualified names', () => {
  const makeIface = (overrides: Partial<InterfaceInfo>): InterfaceInfo => ({
    type: 'message',
    name: 'Test',
    path: '/x/msg/Test.msg',
    fields: [],
    packageName: 'my_pkg',
    ...overrides,
  });

  describe('InterfaceFileItem.getQualifiedName', () => {
    it('returns a service qualified name with the srv extension', () => {
      const item = new InterfaceFileItem(
        makeIface({ type: 'service', name: 'Reset', path: '/x/srv/Reset.srv' })
      );
      expect(item.getQualifiedName()).toBe('my_pkg/srv/Reset');
    });

    it('returns a message qualified name with the msg extension', () => {
      const item = new InterfaceFileItem(
        makeIface({ type: 'message', name: 'Pose', path: '/x/msg/Pose.msg' })
      );
      expect(item.getQualifiedName()).toBe('my_pkg/msg/Pose');
    });

    it('returns an action qualified name with the action extension', () => {
      const item = new InterfaceFileItem(
        makeIface({ type: 'action', name: 'Navigate', path: '/x/action/Navigate.action' })
      );
      expect(item.getQualifiedName()).toBe('my_pkg/action/Navigate');
    });
  });

  describe('CategoryInterfaceFileItem.getQualifiedName', () => {
    it('returns a service qualified name with the srv extension', () => {
      const item = new CategoryInterfaceFileItem(
        makeIface({ type: 'service', name: 'Reset', path: '/x/srv/Reset.srv' }),
        'my_pkg'
      );
      expect(item.getQualifiedName()).toBe('my_pkg/srv/Reset');
    });

    it('returns a message qualified name with the msg extension', () => {
      const item = new CategoryInterfaceFileItem(
        makeIface({ type: 'message', name: 'Pose', path: '/x/msg/Pose.msg' }),
        'my_pkg'
      );
      expect(item.getQualifiedName()).toBe('my_pkg/msg/Pose');
    });

    it('returns an action qualified name with the action extension', () => {
      const item = new CategoryInterfaceFileItem(
        makeIface({ type: 'action', name: 'Navigate', path: '/x/action/Navigate.action' }),
        'my_pkg'
      );
      expect(item.getQualifiedName()).toBe('my_pkg/action/Navigate');
    });
  });
});

describe('showInterfaceDefinition', () => {
  let provider: RamrosDocProvider;

  beforeEach(() => {
    provider = new RamrosDocProvider();
    __setDocProviderForTests(provider);
    (vscode.window.showErrorMessage as jest.Mock).mockReset();
    (vscode.window.showTextDocument as jest.Mock).mockReset().mockResolvedValue({});
  });

  afterEach(() => {
    provider.dispose();
    (vscode.window.showErrorMessage as jest.Mock).mockReset();
    (vscode.window.showTextDocument as jest.Mock).mockReset().mockResolvedValue({});
    jest.restoreAllMocks();
  });

  it('shows the resolved definition in a read-only document', async () => {
    (exec as unknown as jest.Mock).mockImplementationOnce((...args: unknown[]) => {
      const cb = args[args.length - 1] as (error: Error | null, stdout: string, stderr: string) => void;
      cb(null, 'definition text', '');
    });

    await showInterfaceDefinition('my_pkg/srv/Reset');

    const key = 'interface/my_pkg-srv-Reset';
    expect(provider.provideTextDocumentContent(RamrosDocProvider.docUri(key))).toBe('definition text');
    expect(vscode.window.showTextDocument).toHaveBeenCalledWith(
      RamrosDocProvider.docUri(key),
      { preview: true, preserveFocus: false }
    );
    expect(vscode.window.showErrorMessage).not.toHaveBeenCalled();
    expect(exec).toHaveBeenCalledWith(
      'ros2 interface show my_pkg/srv/Reset',
      { encoding: 'utf-8', timeout: 5000 },
      expect.any(Function)
    );
  });

  it('shows a colcon build hint when ros2 interface show fails', async () => {
    (exec as unknown as jest.Mock).mockImplementationOnce((...args: unknown[]) => {
      const cb = args[args.length - 1] as (error: Error | null, stdout: string, stderr: string) => void;
      cb(new Error('interface not found'), '', '');
    });

    await showInterfaceDefinition('my_pkg/srv/Reset');

    expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
      expect.stringContaining('colcon build')
    );
    expect(vscode.window.showErrorMessage).toHaveBeenCalledTimes(1);
    expect(vscode.window.showTextDocument).not.toHaveBeenCalled();
  });
});

describe('runHealthCheck', () => {
  let provider: RamrosDocProvider;

  beforeEach(() => {
    provider = new RamrosDocProvider();
    __setDocProviderForTests(provider);
    (vscode.window.showErrorMessage as jest.Mock).mockReset();
    (vscode.window.showWarningMessage as jest.Mock).mockReset();
    (vscode.window.showTextDocument as jest.Mock).mockReset().mockResolvedValue({});
  });

  afterEach(() => {
    provider.dispose();
    (vscode.window.showErrorMessage as jest.Mock).mockReset();
    (vscode.window.showWarningMessage as jest.Mock).mockReset();
    (vscode.window.showTextDocument as jest.Mock).mockReset().mockResolvedValue({});
    jest.restoreAllMocks();
  });

  it('shows ros2 doctor stdout in a read-only document', async () => {
    (exec as unknown as jest.Mock).mockImplementationOnce((...args: unknown[]) => {
      const cb = args[args.length - 1] as (error: Error | null, stdout: string, stderr: string) => void;
      cb(null, 'out', '');
    });

    await runHealthCheck(provider);

    expect(provider.provideTextDocumentContent(RamrosDocProvider.docUri('ros2-doctor'))).toBe('out');
    expect(vscode.window.showTextDocument).toHaveBeenCalledWith(
      RamrosDocProvider.docUri('ros2-doctor'),
      { preview: true, preserveFocus: false }
    );
    expect(vscode.window.showWarningMessage).not.toHaveBeenCalled();
    expect(exec).toHaveBeenCalledWith(
      'ros2 doctor',
      { encoding: 'utf-8', timeout: 60000 },
      expect.any(Function)
    );
  });

  it('shows stderr findings when ros2 doctor exits non-zero', async () => {
    (exec as unknown as jest.Mock).mockImplementationOnce((...args: unknown[]) => {
      const cb = args[args.length - 1] as (error: Error | null, stdout: string, stderr: string) => void;
      cb(new Error('ros2 doctor failed'), '', 'warnings');
    });

    await runHealthCheck(provider);

    expect(provider.provideTextDocumentContent(RamrosDocProvider.docUri('ros2-doctor'))).toBe('warnings');
    expect(vscode.window.showTextDocument).toHaveBeenCalledWith(
      RamrosDocProvider.docUri('ros2-doctor'),
      { preview: true, preserveFocus: false }
    );
    expect(vscode.window.showWarningMessage).not.toHaveBeenCalled();
  });

  it('warns when ros2 doctor returns no output', async () => {
    (exec as unknown as jest.Mock).mockImplementationOnce((...args: unknown[]) => {
      const cb = args[args.length - 1] as (error: Error | null, stdout: string, stderr: string) => void;
      cb(new Error('ros2 doctor failed'), '', '');
    });

    await runHealthCheck(provider);

    expect(vscode.window.showWarningMessage).toHaveBeenCalledWith('ros2 doctor returned no output');
    expect(vscode.window.showTextDocument).not.toHaveBeenCalled();
  });
});
