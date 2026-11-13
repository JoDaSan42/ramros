import * as vscode from 'vscode';
import { runNodeOptionsWizard } from '../../wizard/run-node-options-wizard';
import { NodeInfo } from '../../core/package-discovery';

describe('run node options wizard', () => {
  const pythonNode: NodeInfo = {
    name: 'talker_node',
    path: '/ws/src/my_pkg/my_pkg/talker.py',
    packageName: 'my_pkg',
    language: 'python',
    isExecutable: true,
    parameters: [
      { name: 'speed', type: 'float', defaultValue: '1.0' },
      { name: 'count', type: 'int', defaultValue: '3' },
    ],
  };

  let showQuickPick: jest.Mock;
  let showInputBox: jest.Mock;

  beforeEach(() => {
    showQuickPick = vscode.window.showQuickPick as jest.Mock;
    showInputBox = vscode.window.showInputBox as jest.Mock;
    showQuickPick.mockReset();
    showInputBox.mockReset();
  });

  it('collects parameter values for selected parameters with defaults as prefill', async () => {
    // Wizard order: parameter multi-pick, then node-name input, then remap pick.
    showQuickPick
      .mockResolvedValueOnce([
        { label: 'speed', parameter: pythonNode.parameters![0] },
        { label: 'count', parameter: pythonNode.parameters![1] },
      ])                                  // 1: parameter multi-select
      .mockResolvedValueOnce({ label: 'Done', isDone: true }); // 2: remap pick

    showInputBox
      .mockResolvedValueOnce('1.0')       // speed value
      .mockResolvedValueOnce('7')         // count value
      .mockResolvedValueOnce('talker_node'); // node name (unchanged)

    const options = await runNodeOptionsWizard(pythonNode);

    expect(options).toBeDefined();
    expect(options!.parameters).toEqual([
      { name: 'speed', value: '1.0', type: 'float' },
      { name: 'count', value: '7', type: 'int' },
    ]);
    expect(options!.remaps).toEqual([]);
    expect(options!.nodeName).toBeUndefined();
  });

  it('aborts everything on Esc in a parameter value input', async () => {
    showQuickPick.mockResolvedValueOnce([{ label: 'speed', parameter: pythonNode.parameters![0] }]);
    showInputBox.mockResolvedValueOnce(undefined); // Esc on value input

    const options = await runNodeOptionsWizard(pythonNode);

    expect(options).toBeUndefined();
  });

  it('collects a custom parameter with explicit type', async () => {
    showQuickPick
      .mockResolvedValueOnce([{ label: 'Add custom parameter…', isCustom: true }]) // multi-select
      .mockResolvedValueOnce('float')     // type pick
      .mockResolvedValueOnce({ label: 'Done', isDone: true }); // remap pick

    showInputBox
      .mockResolvedValueOnce('threshold') // custom name
      .mockResolvedValueOnce('0.5')       // value
      .mockResolvedValueOnce('talker_node'); // node name unchanged

    const options = await runNodeOptionsWizard(pythonNode);

    expect(options).toBeDefined();
    expect(options!.parameters).toEqual([{ name: 'threshold', value: '0.5', type: 'float' }]);
  });

  it('marks a changed node name as nodeName', async () => {
    showQuickPick
      .mockResolvedValueOnce([])             // no parameters picked
      .mockResolvedValueOnce({ label: 'Done', isDone: true }); // remaps done

    showInputBox
      .mockResolvedValueOnce('renamed_node'); // node name (changed)

    const options = await runNodeOptionsWizard(pythonNode);

    expect(options).toBeDefined();
    expect(options!.nodeName).toBe('renamed_node');
  });

  it('keeps an unchanged node name silent (no nodeName)', async () => {
    showQuickPick
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce({ label: 'Done', isDone: true });

    showInputBox.mockResolvedValueOnce('talker_node');

    const options = await runNodeOptionsWizard(pythonNode);

    expect(options).toBeDefined();
    expect(options!.nodeName).toBeUndefined();
  });

  it('collects remaps from the remap loop', async () => {
    showQuickPick
      .mockResolvedValueOnce([])                       // no parameters
      .mockResolvedValueOnce({ label: 'Add remap', isAdd: true })
      .mockResolvedValueOnce({ label: 'Done', isDone: true });

    showInputBox
      .mockResolvedValueOnce('talker_node')            // node name unchanged
      .mockResolvedValueOnce('/in')                    // remap from
      .mockResolvedValueOnce('/out');                  // remap to

    const options = await runNodeOptionsWizard(pythonNode);

    expect(options).toBeDefined();
    expect(options!.remaps).toEqual([{ from: '/in', to: '/out' }]);
  });

  it('aborts on Esc at the remap prompt', async () => {
    showQuickPick
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(undefined);               // Esc on remap pick

    showInputBox.mockResolvedValueOnce('talker_node');

    const options = await runNodeOptionsWizard(pythonNode);

    expect(options).toBeUndefined();
  });
});
