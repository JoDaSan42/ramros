import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { activate } from '../../extension';
import { LiveNodeItem, LiveTopicItem, LiveParameterItem } from '../../treeview/live-items';
import { Ros2CliService } from '../../core/ros2-cli-service';

function makeExtensionContext(): vscode.ExtensionContext {
  return {
    subscriptions: [],
    globalState: {
      get: () => undefined,
      update: async () => undefined,
      keys: () => []
    },
    extensionPath: path.resolve(__dirname, '../../../')
  } as unknown as vscode.ExtensionContext;
}

describe('extension command registration', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ramros-activate-commands-'));
    fs.mkdirSync(path.join(tempDir, 'src'), { recursive: true });
    fs.mkdirSync(path.join(tempDir, 'install'), { recursive: true });
    fs.writeFileSync(path.join(tempDir, 'install', 'setup.bash'), '', 'utf8');

    (vscode.workspace as unknown as { workspaceFolders: unknown }).workspaceFolders = [
      {
        uri: { fsPath: tempDir },
        name: path.basename(tempDir),
        index: 0
      }
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
    (vscode.window.createTreeView as jest.Mock).mockClear();
    (vscode.commands.registerCommand as jest.Mock).mockClear();
    (vscode.commands.executeCommand as jest.Mock).mockClear();
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
    (vscode.commands.registerCommand as jest.Mock).mockClear();
    jest.restoreAllMocks();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('registers every command id exactly once', async () => {
    await activate(makeExtensionContext());

    const ids = (vscode.commands.registerCommand as jest.Mock).mock.calls.map(
      ([id]) => id as string
    );
    const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);

    expect(duplicates).toEqual([]);
  });

  it('registers the parameter update command', async () => {
    await activate(makeExtensionContext());

    const ids = (vscode.commands.registerCommand as jest.Mock).mock.calls.map(
      ([id]) => id as string
    );
    expect(ids).toContain('ramros.live.setParameter');
    expect(ids).toContain('ramros.live.updateParameters');
  });

  it('registers the tool with-options commands', async () => {
    await activate(makeExtensionContext());

    const ids = (vscode.commands.registerCommand as jest.Mock).mock.calls.map(
      ([id]) => id as string
    );
    expect(ids).toContain('ramros.launchTool.rviz2WithOptions');
    expect(ids).toContain('ramros.launchTool.rqtGraphWithOptions');
  });

  it('resolves a LiveParameterItem argument of setParameter from the context menu', async () => {
    await activate(makeExtensionContext());

    const cli = Ros2CliService.getInstance();
    jest.spyOn(cli, 'getParameterValueWithType').mockResolvedValue({ value: 'False', type: 'bool' });
    jest.spyOn(cli, 'setParameterValue').mockResolvedValue(true);
    (vscode.window.showInputBox as jest.Mock).mockResolvedValue('True');

    const handler = (vscode.commands.registerCommand as jest.Mock).mock.calls.find(
      ([id]) => id === 'ramros.live.setParameter'
    )?.[1];
    expect(handler).toBeDefined();

    const item = new LiveParameterItem('/talker', 'use_sim_time', 'False');
    await handler(item);

    expect(cli.getParameterValueWithType).toHaveBeenCalledWith('/talker', 'use_sim_time');
    expect(cli.setParameterValue).toHaveBeenCalledWith('/talker', 'use_sim_time', 'True');
    expect(vscode.window.showInputBox).toHaveBeenCalledWith(
      expect.objectContaining({ value: 'False' })
    );
  });

  it('stopNode sends SIGINT to the node terminal and disposes it after confirmation', async () => {
    await activate(makeExtensionContext());

    const handler = (vscode.commands.registerCommand as jest.Mock).mock.calls.find(
      ([id]) => id === 'ramros.live.stopNode'
    )?.[1];
    expect(handler).toBeDefined();

    const item = new LiveNodeItem('/talker');
    // Modal: first button confirms.
    (vscode.window.showWarningMessage as jest.Mock).mockResolvedValue('Stop Node');

    // RAMROS started this node in a terminal named "Node: /talker".
    const nodeTerminal = {
      name: 'Node: /talker',
      sendText: jest.fn(),
      dispose: jest.fn()
    } as unknown as vscode.Terminal;
    (vscode.window as unknown as { terminals: vscode.Terminal[] }).terminals = [nodeTerminal];

    await handler(item);

    expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
      expect.stringContaining('/talker'),
      { modal: true },
      'Stop Node',
      'Cancel'
    );
    expect(nodeTerminal.sendText).toHaveBeenCalledWith('\x03');
    expect(nodeTerminal.dispose).toHaveBeenCalled();
  });

  it('stopNode does nothing when the confirmation is cancelled', async () => {
    await activate(makeExtensionContext());

    const handler = (vscode.commands.registerCommand as jest.Mock).mock.calls.find(
      ([id]) => id === 'ramros.live.stopNode'
    )?.[1];
    expect(handler).toBeDefined();

    const item = new LiveNodeItem('/talker');
    (vscode.window.showWarningMessage as jest.Mock).mockResolvedValue(undefined);

    const nodeTerminal = {
      name: 'Node: /talker',
      sendText: jest.fn(),
      dispose: jest.fn()
    } as unknown as vscode.Terminal;
    (vscode.window as unknown as { terminals: vscode.Terminal[] }).terminals = [nodeTerminal];

    await handler(item);

    expect(nodeTerminal.sendText).not.toHaveBeenCalled();
    expect(nodeTerminal.dispose).not.toHaveBeenCalled();
  });

  it('stopNode reports nodes without a matching RAMROS terminal', async () => {    await activate(makeExtensionContext());

    const handler = (vscode.commands.registerCommand as jest.Mock).mock.calls.find(
      ([id]) => id === 'ramros.live.stopNode'
    )?.[1];
    expect(handler).toBeDefined();

    const item = new LiveNodeItem('/talker');
    (vscode.window.showWarningMessage as jest.Mock).mockResolvedValue('Stop Node');

    // Node runs in a terminal RAMROS does not know (started elsewhere).
    (vscode.window as unknown as { terminals: vscode.Terminal[] }).terminals = [];

    await handler(item);

    expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
      expect.stringContaining('not started by RAMROS'),
      'OK'
    );
  });

  it('bridgeTopic starts domain_bridge with a generated config after picks', async () => {
    await activate(makeExtensionContext());

    const cli = Ros2CliService.getInstance();
    jest.spyOn(cli, 'getTopicType').mockResolvedValue('std_msgs/msg/String');
    jest.spyOn(Ros2CliService.prototype, 'executeRaw').mockResolvedValue({
      output: '/opt/ros/lyrical',
      ok: true
    });
    (vscode.window.showQuickPick as jest.Mock)
      .mockResolvedValueOnce({ label: 'Current environment (no override)', fromDomain: undefined })
      .mockResolvedValueOnce({ label: '2', toDomain: 2 });

    const handler = (vscode.commands.registerCommand as jest.Mock).mock.calls.find(
      ([id]) => id === 'ramros.live.bridgeTopic'
    )?.[1];
    expect(handler).toBeDefined();

    const item = new LiveTopicItem('/chatter');
    await handler(item);

    const terminalMock = vscode.window.createTerminal as jest.Mock;
    const terminalOptions = terminalMock.mock.calls[terminalMock.mock.calls.length - 1][0];
    expect(terminalOptions.name).toBe('Bridge: /chatter');
    const sent = terminalOptions.name && (terminalMock.mock.results[terminalMock.mock.results.length - 1].value.sendText as jest.Mock).mock.calls[0][0] as string;
    expect(sent).toContain('ros2 run domain_bridge domain_bridge');
    expect(sent).toMatch(/bridge-.*\.yaml/);
  });

  it('bridgeTopic warns when domain_bridge is not installed', async () => {
    await activate(makeExtensionContext());

    (vscode.window.createTerminal as jest.Mock).mockClear();
    jest.spyOn(Ros2CliService.prototype, 'executeRaw').mockResolvedValue({
      output: '',
      ok: false,
      stderr: 'Package not found'
    });

    const handler = (vscode.commands.registerCommand as jest.Mock).mock.calls.find(
      ([id]) => id === 'ramros.live.bridgeTopic'
    )?.[1];
    expect(handler).toBeDefined();

    const item = new LiveTopicItem('/chatter');
    await handler(item);

    expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
      expect.stringContaining('domain_bridge'),
      'Install instructions'
    );
    expect(vscode.window.createTerminal).not.toHaveBeenCalled();
  });
});
