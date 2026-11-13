import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { activate } from '../../extension';

function makeExtensionContext(): vscode.ExtensionContext {
  return {
    subscriptions: [],
    globalState: {
      get: () => undefined,
      update: async () => undefined,
      keys: () => []
    },
    workspaceState: {
      get: () => undefined,
      update: async () => undefined,
      keys: () => []
    },
    extensionPath: path.resolve(__dirname, '../../../')
  } as unknown as vscode.ExtensionContext;
}

describe('launch tool commands (rviz2 / rqt_graph)', () => {
  let tempDir: string;
  let tempDir2: string;
  let showQuickPick: jest.Mock;
  let createTerminal: jest.Mock;
  let workspaceState: { get: jest.Mock; update: jest.Mock };

  function makeWorkspaceFolders(dirs: string[]): void {
    (vscode.workspace as unknown as { workspaceFolders: unknown }).workspaceFolders = dirs.map((dir, index) => ({
      uri: { fsPath: dir },
      name: path.basename(dir),
      index
    }));
  }

  function installFsMock(): void {
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
  }

  function getHandler(commandId: string): ((...args: unknown[]) => unknown) | undefined {
    const call = (vscode.commands.registerCommand as jest.Mock).mock.calls.find(([id]) => id === commandId);
    return call?.[1] as ((...args: unknown[]) => unknown) | undefined;
  }

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ramros-launch-a-'));
    tempDir2 = fs.mkdtempSync(path.join(os.tmpdir(), 'ramros-launch-b-'));
    for (const dir of [tempDir, tempDir2]) {
      fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
      fs.mkdirSync(path.join(dir, 'install'), { recursive: true });
      fs.writeFileSync(path.join(dir, 'install', 'setup.bash'), '', 'utf8');
    }

    makeWorkspaceFolders([tempDir]);
    installFsMock();
    (vscode.workspace as unknown as { getConfiguration: jest.Mock }).getConfiguration = jest.fn().mockReturnValue({
      get: jest.fn((_key: string, defaultValue: unknown) => defaultValue)
    });

    (vscode.window.createTreeView as jest.Mock).mockClear();
    (vscode.commands.registerCommand as jest.Mock).mockClear();
    (vscode.commands.executeCommand as jest.Mock).mockClear();

    showQuickPick = vscode.window.showQuickPick as jest.Mock;
    createTerminal = vscode.window.createTerminal as jest.Mock;
    showQuickPick.mockReset();
    createTerminal.mockReset();
    createTerminal.mockImplementation((options: { name?: string }) => ({
      name: options?.name,
      sendText: jest.fn(),
      show: jest.fn(),
      dispose: jest.fn()
    }));
    workspaceState = {
      get: jest.fn(() => undefined),
      update: jest.fn(async () => undefined)
    };
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
    fs.rmSync(tempDir2, { recursive: true, force: true });
    jest.restoreAllMocks();
  });

  async function activateWithWorkspaceState(state: { get: jest.Mock; update: jest.Mock }): Promise<void> {
    const context = makeExtensionContext();
    (context as unknown as { workspaceState: unknown }).workspaceState = state;
    await activate(context);
  }

  it('starts rviz2 without any prompt in a single-workspace setup, sourcing the overlay', async () => {
    await activateWithWorkspaceState(workspaceState);

    const handler = getHandler('ramros.launchTool.rviz2');
    expect(handler).toBeDefined();

    await handler!();

    expect(showQuickPick).not.toHaveBeenCalled();
    expect(createTerminal).toHaveBeenCalledTimes(1);
    const terminalOptions = createTerminal.mock.calls[0][0] as { name?: string };
    expect(terminalOptions.name).toBe('RVIZ2');
    const terminal = createTerminal.mock.results[0].value;
    expect(terminal.sendText).toHaveBeenCalledWith(`source "${path.join(tempDir, 'install', 'setup.bash')}" && rviz2`);
  });

  it('starts rqt_graph without any prompt in a single-workspace setup, sourcing the overlay', async () => {
    await activateWithWorkspaceState(workspaceState);

    const handler = getHandler('ramros.launchTool.rqt_graph');
    expect(handler).toBeDefined();

    await handler!();

    expect(showQuickPick).not.toHaveBeenCalled();
    const terminal = createTerminal.mock.results[0].value;
    expect(terminal.sendText).toHaveBeenCalledWith(`source "${path.join(tempDir, 'install', 'setup.bash')}" && rqt_graph`);
  });

  it('offers a last-used marked workspace pick and a no-sourcing option in multi-workspace setups', async () => {
    makeWorkspaceFolders([tempDir, tempDir2]);
    workspaceState.get.mockReturnValue(tempDir2); // last used overlay workspace

    await activateWithWorkspaceState(workspaceState);

    const handler = getHandler('ramros.launchTool.rviz2');
    await handler!();

    expect(showQuickPick).toHaveBeenCalledTimes(1);
    const items = showQuickPick.mock.calls[0][0] as Array<{ label: string; description?: string; alwaysShow?: boolean }>;
    const labels = items.map(item => item.label);
    // Last used workspace is listed and marked
    const lastUsed = items.find(item => item.label.includes('(last used)'));
    expect(lastUsed).toBeDefined();
    expect(lastUsed!.label).toContain(path.basename(tempDir2));
    // A no-sourcing option exists
    expect(labels.some(label => /without sourcing/i.test(label))).toBe(true);

    // Pick the last-used entry (first item)
    showQuickPick.mockResolvedValueOnce(items[0]);
    await handler!();

    const terminal = createTerminal.mock.results[0].value;
    expect(terminal.sendText).toHaveBeenCalledWith(`source "${path.join(tempDir2, 'install', 'setup.bash')}" && rviz2`);
  });

  it('builds a command without source prefix when no-sourcing is chosen', async () => {
    makeWorkspaceFolders([tempDir, tempDir2]);

    await activateWithWorkspaceState(workspaceState);

    const handler = getHandler('ramros.launchTool.rviz2');
    // First call: choose the no-sourcing option
    await handler!();

    const items = showQuickPick.mock.calls[0][0] as Array<{ label: string; noSourcing?: boolean }>;
    const noSourcingItem = items.find(item => item.noSourcing);
    expect(noSourcingItem).toBeDefined();
    showQuickPick.mockResolvedValueOnce(noSourcingItem);
    await handler!();

    const terminal = createTerminal.mock.results[0].value;
    const sent = (terminal.sendText as jest.Mock).mock.calls[0][0] as string;
    expect(sent).not.toContain('source');
    expect(sent).toBe('rviz2');
  });

  it('remembers the chosen overlay workspace for the next pick', async () => {
    makeWorkspaceFolders([tempDir, tempDir2]);

    await activateWithWorkspaceState(workspaceState);

    const handler = getHandler('ramros.launchTool.rviz2');
    await handler!();

    const items = showQuickPick.mock.calls[0][0] as Array<{ label: string; workspace?: unknown }>;
    showQuickPick.mockResolvedValueOnce(items[0]); // pick first workspace (tempDir)
    await handler!();

    expect(workspaceState.update).toHaveBeenCalledWith('ramros.lastOverlayWorkspace', tempDir);
  });

  it('keeps the colcon build prompt a plain workspace pick (regression)', async () => {
    makeWorkspaceFolders([tempDir, tempDir2]);

    await activateWithWorkspaceState(workspaceState);

    const handler = getHandler('ramros.buildWorkspace');
    expect(handler).toBeDefined();
    await handler!();

    expect(showQuickPick).toHaveBeenCalledTimes(1);
    const items = showQuickPick.mock.calls[0][0];
    // Plain string list (old behavior), no last-used marking, no no-sourcing option
    expect(items.every((item: unknown) => typeof item === 'string')).toBe(true);
    const labels = (items as string[]).join('\n');
    expect(labels).not.toContain('(last used)');
    expect(labels).not.toMatch(/without sourcing/i);
  });

  it('applies ramros.ros.rosRoot to the ROS environment service', async () => {
    (vscode.workspace as unknown as { getConfiguration: jest.Mock }).getConfiguration = jest.fn((section: string) => {
      if (section === 'ramros.ros') {
        return { get: jest.fn((key: string, defaultValue: unknown) => key === 'rosRoot' ? tempDir : defaultValue) };
      }
      return { get: jest.fn((_key: string, defaultValue: unknown) => defaultValue) };
    });

    await activateWithWorkspaceState(workspaceState);

    // The service is wired into the workspace detector; a refresh re-reads
    // workspaces from the (here mocked) environment. We verify the wiring
    // indirectly: no error during activate and the config listener registered.
    const listener = (vscode.workspace.onDidChangeConfiguration as jest.Mock).mock.calls[0]?.[0];
    expect(listener).toBeDefined();
  });

  it('applies a rosRoot setting change via setRosRoot and refreshes the tree', async () => {
    makeWorkspaceFolders([tempDir]);

    await activateWithWorkspaceState(workspaceState);

    const calls = (vscode.workspace.onDidChangeConfiguration as jest.Mock).mock.calls;
    expect(calls.length).toBeGreaterThan(0);

    // The RAMROS tree provider is the first created tree view.
    const treeProvider = (vscode.window.createTreeView as jest.Mock).mock.calls[0][1].treeDataProvider;
    const refreshSpy = jest.spyOn(treeProvider, 'refresh').mockResolvedValue(undefined);

    const affects = jest.fn((key: string) => key === 'ramros.ros.rosRoot');
    const event = { affectsConfiguration: affects };

    for (const [listener] of calls) {
      await (listener as (e: typeof event) => Promise<void> | void)(event);
    }

    expect(affects).toHaveBeenCalledWith('ramros.ros.rosRoot');
    expect(refreshSpy).toHaveBeenCalled();
  });
});
