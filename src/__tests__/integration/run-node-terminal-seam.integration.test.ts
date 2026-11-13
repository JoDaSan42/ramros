import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { activate } from '../../extension';
import { NodeItem } from '../../treeview/workspace-items';
import { NodeInfo } from '../../core/package-discovery';

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

describe('run node with options terminal seam', () => {
  const pythonNode: NodeInfo = {
    name: 'talker_node',
    path: '/ws/src/my_pkg/my_pkg/talker.py',
    packageName: 'my_pkg',
    language: 'python',
    isExecutable: true,
    parameters: [{ name: 'greeting', type: 'string', defaultValue: 'hi' }],
  };

  let tempDir: string;
  let showQuickPick: jest.Mock;
  let showInputBox: jest.Mock;
  let createTerminal: jest.Mock;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ramros-run-node-'));
    fs.mkdirSync(path.join(tempDir, 'src'), { recursive: true });
    fs.mkdirSync(path.join(tempDir, 'install'), { recursive: true });
    fs.writeFileSync(path.join(tempDir, 'install', 'setup.bash'), '', 'utf8');

    (vscode.workspace as unknown as { workspaceFolders: unknown }).workspaceFolders = [
      { uri: { fsPath: tempDir }, name: path.basename(tempDir), index: 0 }
    ];
    (vscode.workspace as unknown as { fs: unknown }).fs = {
      stat: async (uri: { fsPath?: string }) => {
        const stat = fs.statSync(uri.fsPath ?? '');
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

    showQuickPick = vscode.window.showQuickPick as jest.Mock;
    showInputBox = vscode.window.showInputBox as jest.Mock;
    createTerminal = vscode.window.createTerminal as jest.Mock;
    showQuickPick.mockReset();
    showInputBox.mockReset();
    createTerminal.mockClear();
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
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  function makeNodeItem(): NodeItem {
    return new NodeItem(pythonNode);
  }

  async function getRunHandler(commandId: string): Promise<(treeItem?: unknown) => Promise<void>> {
    await activate(makeExtensionContext());
    const handler = (vscode.commands.registerCommand as jest.Mock).mock.calls.find(
      ([id]) => id === commandId
    )?.[1];
    expect(handler).toBeDefined();
    return handler;
  }

  function lastTerminalCommand(): string {
    const calls = createTerminal.mock.results as Array<{ value: { sendText: jest.Mock } }>;
    const terminal = calls[calls.length - 1]?.value;
    return terminal?.sendText.mock.calls[0]?.[0] ?? '';
  }

  it('tree play button starts directly without a mode prompt', async () => {
    const handler = await getRunHandler('ramros.runNode');

    await handler(makeNodeItem());

    const command = lastTerminalCommand();
    expect(command).toContain('ros2 run my_pkg talker_node');
    expect(command).not.toContain('--ros-args');
    expect(showQuickPick).not.toHaveBeenCalled();
  });

  it('palette flow composes ros-args with __node last', async () => {
    const handler = await getRunHandler('ramros.runNodeWithOptions');

    showQuickPick
      .mockResolvedValueOnce([])                                              // no parameters
      .mockResolvedValueOnce({ label: 'Use environment domain', isEnv: true }) // domain pick
      .mockResolvedValueOnce({ label: 'Done', isDone: true });                // remaps done
    showInputBox
      .mockResolvedValueOnce('renamed_node');                                 // node name

    await handler(makeNodeItem());

    const command = lastTerminalCommand();
    expect(command).toContain(`source "${path.join(tempDir, 'install', 'setup.bash')}"`);
    expect(command).toContain('ros2 run my_pkg talker_node');
    const argsIndex = command.indexOf('--ros-args');
    expect(argsIndex).toBeGreaterThan(-1);
    expect(command.slice(argsIndex)).toBe('--ros-args -r __node:=renamed_node');
  });

  it('quotes parameter values with spaces at the seam', async () => {
    const handler = await getRunHandler('ramros.runNodeWithOptions');

    showQuickPick
      .mockResolvedValueOnce([{ label: 'greeting', parameter: pythonNode.parameters![0] }])
      .mockResolvedValueOnce({ label: 'Use environment domain', isEnv: true }) // domain pick
      .mockResolvedValueOnce({ label: 'Done', isDone: true });
    showInputBox
      .mockResolvedValueOnce('hello world')    // parameter value
      .mockResolvedValueOnce('talker_node');   // node name unchanged

    await handler(makeNodeItem());

    const command = lastTerminalCommand();
    expect(command).toContain("-p greeting:='hello world'");
  });

  it('starts nothing when the wizard is aborted (Esc)', async () => {
    const handler = await getRunHandler('ramros.runNodeWithOptions');

    showQuickPick
      .mockResolvedValueOnce(undefined); // Esc on parameter pick

    await handler(makeNodeItem());

    expect(createTerminal).not.toHaveBeenCalled();
  });

  it('runNodeWithOptions always runs the wizard, even from the tree item', async () => {
    const handler = await getRunHandler('ramros.runNodeWithOptions');

    showQuickPick
      .mockResolvedValueOnce([])                                 // no parameters
      .mockResolvedValueOnce({ label: 'Use environment domain', isEnv: true }) // domain pick
      .mockResolvedValueOnce({ label: 'Done', isDone: true });   // remaps done
    showInputBox.mockResolvedValueOnce('renamed_node');

    await handler(makeNodeItem());

    const command = lastTerminalCommand();
    expect(command).toContain('--ros-args -r __node:=renamed_node');
  });
});
