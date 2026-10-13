import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { activate } from '../../extension';
import { LiveTreeProvider } from '../../treeview/live-tree-provider';
import { LiveViewDisabledItem } from '../../treeview/live-items';

interface MockTreeDataProvider {
  isEnabled(): boolean;
  getChildren(): Promise<unknown[]>;
  dispose?(): void;
  stopAutoRefresh?(): void;
}

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

describe('extension activation live view config', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ramros-activate-live-'));
    fs.mkdirSync(path.join(tempDir, 'src'), { recursive: true });
    fs.mkdirSync(path.join(tempDir, 'install'), { recursive: true });
    fs.writeFileSync(path.join(tempDir, 'install', 'setup.bash'), '', 'utf8');
    fs.writeFileSync(
      path.join(tempDir, 'ramros.json'),
      JSON.stringify({ liveView: { enabled: false } }, null, 2) + '\n',
      'utf8'
    );

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
  });

  afterEach(() => {
    const createTreeView = vscode.window.createTreeView as jest.Mock;
    for (const call of createTreeView.mock.calls) {
      const provider = (call[1] as { treeDataProvider?: MockTreeDataProvider }).treeDataProvider;
      provider?.stopAutoRefresh?.();
      provider?.dispose?.();
    }
    createTreeView.mockClear();
    jest.restoreAllMocks();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('applies a persisted liveView.enabled:false once workspace detection completes', async () => {
    await activate(makeExtensionContext());

    const liveViewCall = (vscode.window.createTreeView as jest.Mock).mock.calls.find(
      ([viewId]) => viewId === 'ramrosLive'
    );
    expect(liveViewCall).toBeDefined();

    const liveProvider = (liveViewCall![1] as { treeDataProvider: LiveTreeProvider }).treeDataProvider;
    expect(liveProvider.isEnabled()).toBe(false);

    const children = await liveProvider.getChildren();
    expect(children).toHaveLength(1);
    expect(children[0]).toBeInstanceOf(LiveViewDisabledItem);
  });
});
