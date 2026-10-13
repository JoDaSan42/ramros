import * as vscode from 'vscode';
import { promptForParameterValue } from '../../../wizard/launch-wizard';

describe('promptForParameterValue', () => {
  beforeEach(() => {
    (vscode.window.showInputBox as jest.Mock).mockReset();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns the value when it is valid immediately', async () => {
    (vscode.window.showInputBox as jest.Mock).mockResolvedValueOnce('42');

    const result = await promptForParameterValue(
      'count',
      { name: 'count', type: 'int', defaultValue: '0' },
      []
    );

    expect(result).toBe('42');
    expect(vscode.window.showInputBox).toHaveBeenCalledTimes(1);
  });

  it('re-prompts when the entered value is invalid, then accepts a valid one', async () => {
    (vscode.window.showInputBox as jest.Mock)
      .mockResolvedValueOnce('abc')
      .mockResolvedValueOnce('42');

    const result = await promptForParameterValue(
      'count',
      { name: 'count', type: 'int', defaultValue: '0' },
      []
    );

    expect(result).toBe('42');
    expect(vscode.window.showInputBox).toHaveBeenCalledTimes(2);
    expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
      expect.stringContaining('must be an integer')
    );
  });

  it('returns undefined when the user escapes after an invalid entry', async () => {
    (vscode.window.showInputBox as jest.Mock)
      .mockResolvedValueOnce('abc')
      .mockResolvedValueOnce(undefined);

    const result = await promptForParameterValue(
      'count',
      { name: 'count', type: 'int', defaultValue: '0' },
      []
    );

    expect(result).toBeUndefined();
  });

  it('keeps the previously entered invalid value as the starting value for the retry', async () => {
    (vscode.window.showInputBox as jest.Mock)
      .mockResolvedValueOnce('abc')
      .mockResolvedValueOnce('42');

    await promptForParameterValue(
      'count',
      { name: 'count', type: 'int', defaultValue: '0' },
      []
    );

    const secondCall = (vscode.window.showInputBox as jest.Mock).mock.calls[1][0];
    expect(secondCall.value).toBe('abc');
    expect(secondCall.prompt).toContain('must be an integer');
  });

  it('treats an empty entry as skip and returns undefined without validation loop', async () => {
    (vscode.window.showInputBox as jest.Mock).mockResolvedValueOnce('');

    const result = await promptForParameterValue(
      'count',
      { name: 'count', type: 'int', defaultValue: '0' },
      []
    );

    expect(result).toBeUndefined();
    expect(vscode.window.showInputBox).toHaveBeenCalledTimes(1);
  });

  it('records the collected value in the collected array', async () => {
    (vscode.window.showInputBox as jest.Mock).mockResolvedValueOnce('42');
    const collected: Array<{ name: string; value: string }> = [];

    await promptForParameterValue('count', { name: 'count', type: 'int' }, collected);

    expect(collected).toEqual([{ name: 'count', value: '42' }]);
  });

  it('returns undefined without collecting when validation keeps failing and user escapes', async () => {
    (vscode.window.showInputBox as jest.Mock)
      .mockResolvedValue('abc');
    (vscode.window.showInputBox as jest.Mock)
      .mockResolvedValueOnce('abc')
      .mockResolvedValueOnce(undefined);

    const collected: Array<{ name: string; value: string }> = [];
    const result = await promptForParameterValue('count', { name: 'count', type: 'int' }, collected);

    expect(result).toBeUndefined();
    expect(collected).toEqual([]);
  });
});
