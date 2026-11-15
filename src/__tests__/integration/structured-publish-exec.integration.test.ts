import * as vscode from 'vscode';
import { publishToTopic, __setDocProviderForTests, __resetInterfaceLoaderForTests } from '../../extension';
import { __resetMessageInputPanelForTests } from '../../webview/message-input-panel';
import { RamrosDocProvider } from '../../core/ramros-doc-provider';
import { WorkspaceInfo } from '../../core/workspace-detector';
import { Ros2CliService } from '../../core/ros2-cli-service';

jest.mock('child_process', () => {
  const execMock = jest.fn((...args: unknown[]) => {
    const cb = args[args.length - 1] as (error: Error | null, stdout: string, stderr: string) => void;
    cb(new Error('no ros2'), '', '');
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

const POSE_OUTPUT = 'Point position\n\tfloat64 x\n\tfloat64 y';

describe('structured publish exec semantics', () => {
  let cli: Ros2CliService;

  let setupDir: string;
  let executeRawMock: jest.SpyInstance;

  beforeEach(() => {
    (vscode.window.showQuickPick as jest.Mock).mockReset();
    (vscode.window.showErrorMessage as jest.Mock).mockReset();
    (vscode.window.createWebviewPanel as jest.Mock).mockClear();
    __setDocProviderForTests(new RamrosDocProvider());
    __resetMessageInputPanelForTests();
    __resetInterfaceLoaderForTests();
    cli = Ros2CliService.getInstance();
    executeRawMock = jest.spyOn(cli, 'executeRaw');
    const os = require('os') as typeof import('os');
    const path = require('path') as typeof import('path');
    const fs = require('fs') as typeof import('fs');
    setupDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ramros-pubexec-'));
    fs.mkdirSync(path.join(setupDir, 'install'), { recursive: true });
    fs.writeFileSync(path.join(setupDir, 'install', 'setup.bash'), '', 'utf8');
  });

  afterEach(() => {
    jest.restoreAllMocks();
    const fs = require('fs') as typeof import('fs');
    fs.rmSync(setupDir, { recursive: true, force: true });
  });

  function makeWorkspace(): WorkspaceInfo {
    return {
      id: setupDir,
      name: 'ws',
      rootPath: { fsPath: setupDir } as vscode.Uri,
      installPath: { fsPath: `${setupDir}/install` } as vscode.Uri,
      packages: []
    } as unknown as WorkspaceInfo;
  }

  interface PanelMock {
    webview: { onDidReceiveMessage: jest.Mock; postMessage: jest.Mock };
  }

  async function openPanel(): Promise<PanelMock['webview']> {
    jest.spyOn(cli, 'getTopicType').mockResolvedValue('geometry_msgs/msg/Pose');
    executeRawMock.mockResolvedValueOnce({ output: POSE_OUTPUT, ok: true });
    (vscode.window.showQuickPick as jest.Mock).mockResolvedValue({ label: 'once', description: '' });

    await publishToTopic(
      '/chatter',
      'geometry_msgs/msg/Pose',
      { executeInNewTerminal: jest.fn() } as never,
      () => Promise.resolve(makeWorkspace()),
      cli
    );

    const mock = vscode.window.createWebviewPanel as jest.Mock & { lastPanel?: PanelMock };
    return mock.lastPanel!.webview;
  }

  it('reports failure when the once-exec returns ok:false (timeout, no subscriber)', async () => {
    const webview = await openPanel();

    // Real executeRaw behavior: ok:false, never throws.
    executeRawMock.mockResolvedValue({ output: '', ok: false, stderr: 'timeout waiting' });
    await (webview.onDidReceiveMessage.mock.calls[0][0] as (m: unknown) => Promise<void>)({
      type: 'publishOnce',
      values: { 'position.x': '1' }
    });

    expect(executeRawMock).toHaveBeenCalledWith(expect.stringContaining('ros2 topic pub'), { timeout: 10000 });
    expect(webview.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'result', ok: false, message: expect.stringContaining('timeout waiting') })
    );
  });

  it('sources the overlay with the POSIX dot command in exec paths (dash-compatible)', async () => {
    const webview = await openPanel();

    executeRawMock.mockResolvedValue({ output: '', ok: true });
    await (webview.onDidReceiveMessage.mock.calls[0][0] as (m: unknown) => Promise<void>)({
      type: 'publishOnce',
      values: { 'position.x': '1' }
    });

    const command = executeRawMock.mock.lastCall![0] as string;
    expect(command).toContain(`. "${setupDir}/install/setup.bash"`);
    expect(command).not.toContain('source "');
  });

  it('loads a repeated structure of the same type from the session cache', async () => {
    (vscode.window.showQuickPick as jest.Mock).mockResolvedValue({ label: 'once', description: '' });
    executeRawMock.mockResolvedValue({ output: POSE_OUTPUT, ok: true });

    const options = { executeInNewTerminal: jest.fn() } as never;
    const resolve = () => Promise.resolve(makeWorkspace());

    await publishToTopic('/chatter', 'geometry_msgs/msg/Pose', options, resolve, cli);
    await publishToTopic('/chatter', 'geometry_msgs/msg/Pose', options, resolve, cli);

    // Spec: structures load once per session — the second publish must not
    // re-run `ros2 interface show` for the same type.
    const interfaceShowCalls = executeRawMock.mock.calls.filter(([command]) =>
      String(command).includes('ros2 interface show')
    );
    expect(interfaceShowCalls).toHaveLength(1);
  });

  it('sends the interface show fetch with the POSIX dot command', async () => {
    jest.spyOn(cli, 'getTopicType').mockResolvedValue('geometry_msgs/msg/Pose');
    executeRawMock.mockResolvedValue({ output: POSE_OUTPUT, ok: true });
    (vscode.window.showQuickPick as jest.Mock).mockResolvedValue({ label: 'once', description: '' });

    await publishToTopic(
      '/chatter',
      'geometry_msgs/msg/Pose',
      { executeInNewTerminal: jest.fn() } as never,
      () => Promise.resolve(makeWorkspace()),
      cli
    );

    const command = executeRawMock.mock.calls[0][0] as string;
    expect(command).toContain(`. "${setupDir}/install/setup.bash" && ros2 interface show`);
    expect(command).not.toContain('source "');
  });
});
