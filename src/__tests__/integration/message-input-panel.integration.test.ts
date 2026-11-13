import * as vscode from 'vscode';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { activate, publishToTopic, __setDocProviderForTests, __setTreeProviderForTests } from '../../extension';
import { __resetMessageInputPanelForTests } from '../../webview/message-input-panel';
import { RamrosDocProvider } from '../../core/ramros-doc-provider';
import { Ros2CliService } from '../../core/ros2-cli-service';
import { WorkspaceInfo } from '../../core/workspace-detector';

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
    workspaceState: {
      get: jest.fn(),
      update: jest.fn()
    },
    globalState: {
      get: jest.fn(),
      update: jest.fn()
    },
    subscriptions: [],
    extensionUri: { fsPath: '/ext' } as vscode.Uri,
    extensionPath: '/ext'
  } as unknown as vscode.ExtensionContext;
}

function makeWorkspaceInfo(): WorkspaceInfo {
  return {
    id: 'ws',
    name: 'ws',
    rootPath: { fsPath: '/ws/root' } as vscode.Uri,
    installPath: { fsPath: '/ws/root/install' } as vscode.Uri,
    packages: []
  } as unknown as WorkspaceInfo;
}

/** Inline-expanded Pose output as `ros2 interface show` returns on lyrical. */
const POSE_OUTPUT = 'Point position\n\tfloat64 x\n\tfloat64 y\n\tfloat64 z\nQuaternion orientation\n\tfloat64 x 0\n\tfloat64 y 0\n\tfloat64 z 0\n\tfloat64 w 1';

function lastPanel(): vscode.WebviewPanel & { webview: { postMessage: jest.Mock; onDidReceiveMessage: jest.Mock } } {
  const mock = vscode.window.createWebviewPanel as jest.Mock & { lastPanel?: unknown };
  const panel = mock.lastPanel as
    | (vscode.WebviewPanel & { webview: { postMessage: jest.Mock; onDidReceiveMessage: jest.Mock } })
    | undefined;
  expect(panel).toBeDefined();
  return panel!;
}

describe('structured message input panel', () => {
  let cli: Ros2CliService;
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ramros-message-input-'));
    fs.mkdirSync(path.join(tempDir, 'install'), { recursive: true });
    fs.writeFileSync(path.join(tempDir, 'install', 'setup.bash'), '', 'utf8');

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

    (vscode.window.showQuickPick as jest.Mock).mockReset();
    (vscode.window.showInputBox as jest.Mock).mockReset();
    (vscode.window.showErrorMessage as jest.Mock).mockReset();
    (vscode.window.createWebviewPanel as jest.Mock).mockClear();
    __setDocProviderForTests(new RamrosDocProvider());
    cli = Ros2CliService.getInstance();
  });

  afterEach(() => {
    const createTreeView = vscode.window.createTreeView as jest.Mock;
    for (const call of createTreeView.mock.calls) {
      const provider = (
        call[1] as { treeDataProvider?: { dispose?: () => void; stopAutoRefresh?: () => void } }
      ).treeDataProvider;
      provider?.stopAutoRefresh?.();
      provider?.dispose?.();
    }
    createTreeView.mockClear();
    __resetMessageInputPanelForTests();
    jest.restoreAllMocks();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('opens the structured form for publishToTopic when the structure resolves', async () => {
    activate(makeExtensionContext());
    jest.spyOn(cli, 'getTopicType').mockResolvedValue('geometry_msgs/msg/Pose');
    jest.spyOn(cli, 'executeRaw').mockResolvedValue({ output: POSE_OUTPUT, ok: true });

    (vscode.window.showQuickPick as jest.Mock).mockResolvedValue({ label: 'once', description: 'Publish the message once' });

    const result = await publishToTopic(
      '/chatter',
      'geometry_msgs/msg/Pose',
      { executeInNewTerminal: jest.fn() } as never,
      () => Promise.resolve(makeWorkspaceInfo()),
      cli
    );

    expect(result).toBe('geometry_msgs/msg/Pose');
    expect(vscode.window.createWebviewPanel).toHaveBeenCalledTimes(1);
    const html = lastPanel().webview.html;
    expect(html).toContain('data-path="position.x"');
    // The raw content input is replaced by the webview form.
    expect(vscode.window.showInputBox).not.toHaveBeenCalled();
  });

  it('falls back to the raw flow when the top-level structure fetch fails', async () => {
    activate(makeExtensionContext());
    jest.spyOn(cli, 'getTopicType').mockResolvedValue('std_msgs/msg/String');
    jest.spyOn(cli, 'executeRaw').mockResolvedValue({ output: '', ok: false, stderr: 'not built' });

    // Raw flow: mode pick, then YAML content input.
    (vscode.window.showQuickPick as jest.Mock).mockResolvedValue({ label: 'once', description: 'Publish the message once' });
    (vscode.window.showInputBox as jest.Mock).mockResolvedValue('{data: hi}');

    await publishToTopic(
      '/chatter',
      'std_msgs/msg/String',
      { executeInNewTerminal: jest.fn() } as never,
      () => Promise.resolve(makeWorkspaceInfo()),
      cli
    );

    expect(vscode.window.createWebviewPanel).not.toHaveBeenCalled();
    expect(vscode.window.showInputBox).toHaveBeenCalled();
  });

  it('resolves the workspace before the first structure fetch', async () => {
    activate(makeExtensionContext());
    const callOrder: string[] = [];
    jest.spyOn(cli, 'getTopicType').mockResolvedValue('geometry_msgs/msg/Pose');
    jest.spyOn(cli, 'executeRaw').mockImplementation(async () => {
      callOrder.push('executeRaw');
      return { output: POSE_OUTPUT, ok: true };
    });

    (vscode.window.showQuickPick as jest.Mock).mockResolvedValue({ label: 'once', description: 'Publish the message once' });

    await publishToTopic(
      '/chatter',
      'geometry_msgs/msg/Pose',
      { executeInNewTerminal: jest.fn() } as never,
      () => {
        callOrder.push('resolveWorkspace');
        return Promise.resolve(makeWorkspaceInfo());
      },
      cli
    );

    expect(callOrder.indexOf('resolveWorkspace')).toBeLessThan(callOrder.indexOf('executeRaw'));
  });

  it('publishes once via a hidden exec with 10s timeout and reports the result', async () => {
    activate(makeExtensionContext());
    jest.spyOn(cli, 'getTopicType').mockResolvedValue('geometry_msgs/msg/Pose');
    const executeRaw = jest.spyOn(cli, 'executeRaw')
      .mockResolvedValueOnce({ output: POSE_OUTPUT, ok: true })
      .mockResolvedValueOnce({ output: '', ok: true });

    (vscode.window.showQuickPick as jest.Mock).mockResolvedValue({ label: 'once', description: 'Publish the message once' });

    await publishToTopic(
      '/chatter',
      'geometry_msgs/msg/Pose',
      { executeInNewTerminal: jest.fn() } as never,
      () => Promise.resolve(makeWorkspaceInfo()),
      cli
    );

    const receiveHandler = lastPanel().webview.onDidReceiveMessage.mock.calls[0][0] as (message: unknown) => Promise<void>;
    await receiveHandler({ type: 'publishOnce', values: { 'position.x': '1', 'position.y': '2' } });

    expect(executeRaw).toHaveBeenLastCalledWith(
      expect.stringContaining('ros2 topic pub'),
      { timeout: 10000 }
    );
    const command = executeRaw.mock.lastCall![0] as string;
    expect(command).toContain('--once');
    expect(command).toContain('position:');
    expect(lastPanel().webview.postMessage).toHaveBeenCalledWith(expect.objectContaining({ type: 'result', ok: true }));
  });

  it('keeps the panel open and shows an error when the once-publish fails', async () => {
    activate(makeExtensionContext());
    jest.spyOn(cli, 'getTopicType').mockResolvedValue('geometry_msgs/msg/Pose');
    jest.spyOn(cli, 'executeRaw')
      .mockResolvedValueOnce({ output: POSE_OUTPUT, ok: true })
      .mockRejectedValueOnce(new Error('timeout waiting for subscriber'));

    (vscode.window.showQuickPick as jest.Mock).mockResolvedValue({ label: 'once', description: 'Publish the message once' });

    await publishToTopic(
      '/chatter',
      'geometry_msgs/msg/Pose',
      { executeInNewTerminal: jest.fn() } as never,
      () => Promise.resolve(makeWorkspaceInfo()),
      cli
    );

    const panel = lastPanel();
    const receiveHandler = panel.webview.onDidReceiveMessage.mock.calls[0][0] as (message: unknown) => Promise<void>;
    await receiveHandler({ type: 'publishOnce', values: { 'position.x': '1' } });

    expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(expect.stringContaining('Publish failed'));
    expect(panel.dispose).not.toHaveBeenCalled();
    expect(panel.webview.postMessage).toHaveBeenCalledWith(expect.objectContaining({ type: 'result', ok: false }));
  });

  it('opens a rate terminal from the panel values', async () => {
    activate(makeExtensionContext());
    jest.spyOn(cli, 'getTopicType').mockResolvedValue('geometry_msgs/msg/Pose');
    jest.spyOn(cli, 'executeRaw').mockResolvedValue({ output: POSE_OUTPUT, ok: true });
    const executeInNewTerminal = jest.fn().mockResolvedValue(undefined);

    (vscode.window.showQuickPick as jest.Mock).mockResolvedValue({ label: 'once', description: 'Publish the message once' });

    await publishToTopic(
      '/chatter',
      'geometry_msgs/msg/Pose',
      { executeInNewTerminal } as never,
      () => Promise.resolve(makeWorkspaceInfo()),
      cli
    );

    const receiveHandler = lastPanel().webview.onDidReceiveMessage.mock.calls[0][0] as (message: unknown) => Promise<void>;
    await receiveHandler({ type: 'publishRate', values: { 'position.x': '1.5' }, rate: 2 });

    expect(executeInNewTerminal).toHaveBeenCalledWith(
      expect.stringContaining('--rate 2'),
      expect.anything(),
      expect.stringContaining('/chatter')
    );
    const command = executeInNewTerminal.mock.lastCall![0] as string;
    expect(command).toContain('position:');
  });

  describe('service call flow', () => {
    let activateResult: unknown;

    interface ServiceTreeItem {
      name: string;
      type?: string;
      contextValue?: string;
    }

    function registerServiceCall(): (treeItem?: unknown) => Promise<void> {
      activate(makeExtensionContext());
      const call = (vscode.commands.registerCommand as jest.Mock).mock.calls.find(
        ([id]) => id === 'ramros.live.callService'
      );
      return call![1] as (treeItem?: unknown) => Promise<void>;
    }

    /** Workspace detection inside activate is async; let it settle. */
    async function waitForWorkspaceDetection(): Promise<void> {
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    function makeServiceItem(name: string, type: string): unknown {
      return {
        getServiceName: () => name,
        getServiceType: () => type
      };
    }

    it('opens the structured form and calls the service with JSON from the values', async () => {
      jest.spyOn(cli, 'getServiceType').mockResolvedValue('example_interfaces/srv/AddTwoInts');
      jest.spyOn(cli, 'executeRaw').mockResolvedValue({ output: 'int64 a\nint64 b', ok: true });
      const callService = jest.spyOn(cli, 'callService').mockResolvedValue('sum=3');
      const showTextDocument = jest.spyOn(vscode.window, 'showTextDocument').mockResolvedValue({} as never);

      const handler = registerServiceCall();
      await waitForWorkspaceDetection();
      await handler(makeServiceItem('/add', 'example_interfaces/srv/AddTwoInts'));

      expect(vscode.window.createWebviewPanel).toHaveBeenCalledTimes(1);
      expect(vscode.window.showInputBox).not.toHaveBeenCalled();

      const receiveHandler = lastPanel().webview.onDidReceiveMessage.mock.calls[0][0] as (message: unknown) => Promise<void>;
      await receiveHandler({ type: 'call', values: { a: '1', b: '2' } });

      expect(callService).toHaveBeenCalledWith('/add', 'example_interfaces/srv/AddTwoInts', '{"a":1,"b":2}');
      expect(showTextDocument).toHaveBeenCalled();
    });

    it('falls back to the JSON input when the structure fetch fails', async () => {
      jest.spyOn(cli, 'getServiceType').mockResolvedValue('example_interfaces/srv/AddTwoInts');
      jest.spyOn(cli, 'executeRaw').mockResolvedValue({ output: '', ok: false, stderr: 'no interface' });
      const callService = jest.spyOn(cli, 'callService').mockResolvedValue('sum=3');

      const handler = registerServiceCall();
      await waitForWorkspaceDetection();
      (vscode.window.showInputBox as jest.Mock).mockResolvedValue('{"a":1,"b":2}');

      await handler(makeServiceItem('/add', 'example_interfaces/srv/AddTwoInts'));

      expect(vscode.window.createWebviewPanel).not.toHaveBeenCalled();
      expect(callService).toHaveBeenCalledWith('/add', 'example_interfaces/srv/AddTwoInts', '{"a":1,"b":2}');
    });

    it('shows an error and keeps the panel when the service call fails', async () => {
      jest.spyOn(cli, 'getServiceType').mockResolvedValue('example_interfaces/srv/AddTwoInts');
      jest.spyOn(cli, 'executeRaw').mockResolvedValue({ output: 'int64 a\nint64 b', ok: true });
      jest.spyOn(cli, 'callService').mockResolvedValue(null);

      const handler = registerServiceCall();
      await waitForWorkspaceDetection();
      await handler(makeServiceItem('/add', 'example_interfaces/srv/AddTwoInts'));

      const panel = lastPanel();
      const receiveHandler = panel.webview.onDidReceiveMessage.mock.calls[0][0] as (message: unknown) => Promise<void>;
      await receiveHandler({ type: 'call', values: { a: '1', b: '2' } });

      expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(expect.stringContaining('Service call'));
      expect(panel.dispose).not.toHaveBeenCalled();
    });
  });

  it('reveals the existing panel for the same target and replaces it for a new one', async () => {
    activate(makeExtensionContext());
    await new Promise(resolve => setTimeout(resolve, 100));
    jest.spyOn(cli, 'getTopicType').mockResolvedValue('geometry_msgs/msg/Pose');
    jest.spyOn(cli, 'executeRaw').mockResolvedValue({ output: POSE_OUTPUT, ok: true });
    (vscode.window.showQuickPick as jest.Mock).mockResolvedValue({ label: 'once', description: 'Publish the message once' });

    const options = {
      executeInNewTerminal: jest.fn()
    } as never;
    const resolve = () => Promise.resolve(makeWorkspaceInfo());

    await publishToTopic('/chatter', 'geometry_msgs/msg/Pose', options, resolve, cli);
    await publishToTopic('/chatter', 'geometry_msgs/msg/Pose', options, resolve, cli);

    expect(vscode.window.createWebviewPanel).toHaveBeenCalledTimes(1);
    const panel = lastPanel();
    expect(panel.reveal).toHaveBeenCalledTimes(2);

    await publishToTopic('/other', 'geometry_msgs/msg/Pose', options, resolve, cli);
    // A different target replaces the panel content (dispose + recreate).
    expect(vscode.window.createWebviewPanel).toHaveBeenCalledTimes(2);
    const replacement = lastPanel();
    expect(replacement.webview.html).toContain('data-path="position.x"');
    // Title follows the new target.
    expect(replacement.title).toContain('/other');
  });
});
