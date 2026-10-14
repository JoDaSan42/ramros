import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { activate } from '../../extension';
import { LiveParameterItem } from '../../treeview/live-items';
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
});
