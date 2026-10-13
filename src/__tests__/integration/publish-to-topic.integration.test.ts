import { exec } from 'child_process';
import * as vscode from 'vscode';
import { publishToTopic, __setDocProviderForTests, __setTreeProviderForTests } from '../../extension';
import { RamrosDocProvider } from '../../core/ramros-doc-provider';
import { WorkspaceInfo } from '../../core/workspace-detector';
import { Ros2CliService } from '../../core/ros2-cli-service';

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

function makeWorkspaceInfo(overrides: Partial<WorkspaceInfo>): WorkspaceInfo {
  return {
    id: 'ws',
    name: 'ws',
    rootPath: { fsPath: '/ws/root' } as vscode.Uri,
    installPath: { fsPath: '/ws/root/install' } as vscode.Uri,
    packages: [],
    ...overrides,
  } as WorkspaceInfo;
}

describe('publishToTopic', () => {
  let terminalManagerMock: { executeInNewTerminal: jest.Mock };

  beforeEach(() => {
    terminalManagerMock = { executeInNewTerminal: jest.fn().mockResolvedValue(undefined) };
    (vscode.window.showQuickPick as jest.Mock).mockReset();
    (vscode.window.showInputBox as jest.Mock).mockReset();
    (vscode.window.showErrorMessage as jest.Mock).mockReset();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  function setInputBoxResponses(responses: (string | undefined)[]): void {
    let index = 0;
    (vscode.window.showInputBox as jest.Mock).mockImplementation(() => {
      const response = responses[index];
      index += 1;
      return Promise.resolve(response);
    });
  }

  it('aborts when no message type can be resolved and user cancels manual type entry', async () => {
    (vscode.window.showErrorMessage as jest.Mock).mockResolvedValue('Enter topic type manually');
    setInputBoxResponses([undefined]);

    const result = await publishToTopic(
      '/chatter',
      undefined,
      terminalManagerMock as never,
      () => Promise.resolve(makeWorkspaceInfo({})),
      Ros2CliService.getInstance()
    );

    expect(result).toBeUndefined();
    expect(terminalManagerMock.executeInNewTerminal).not.toHaveBeenCalled();
  });

  it('prompts for a manual topic type when discovery fails, then publishes', async () => {
    (vscode.window.showErrorMessage as jest.Mock).mockResolvedValue('Enter topic type manually');
    setInputBoxResponses(['std_msgs/msg/String', '{}']);
    (vscode.window.showQuickPick as jest.Mock).mockResolvedValue({ label: 'once', description: 'Publish the message once' });

    const result = await publishToTopic(
      '/chatter',
      undefined,
      terminalManagerMock as never,
      () => Promise.resolve(makeWorkspaceInfo({})),
      Ros2CliService.getInstance()
    );

    expect(result).toBe('std_msgs/msg/String');
    expect(terminalManagerMock.executeInNewTerminal).toHaveBeenCalledWith(
      expect.stringContaining('ros2 topic pub'),
      expect.anything(),
      'Pub: /chatter'
    );
  });

  it('publishes directly when the type is known from the tree item', async () => {
    (vscode.window.showQuickPick as jest.Mock).mockResolvedValue({ label: 'once', description: 'Publish the message once' });
    setInputBoxResponses(['{}']);

    const result = await publishToTopic(
      '/chatter',
      'std_msgs/msg/String',
      terminalManagerMock as never,
      () => Promise.resolve(makeWorkspaceInfo({})),
      Ros2CliService.getInstance()
    );

    expect(result).toBe('std_msgs/msg/String');
    expect(vscode.window.showErrorMessage).not.toHaveBeenCalled();
    expect(terminalManagerMock.executeInNewTerminal).toHaveBeenCalled();
  });
});
