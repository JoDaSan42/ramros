import * as vscode from 'vscode';
import { runNodeOptionsWizard, buildRemapSuggestions } from '../../wizard/run-node-options-wizard';
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

  describe('remap suggestions from static node analysis', () => {
    it('offers analyzed topics/services as remap sources (python)', async () => {
      const node: NodeInfo = {
        ...pythonNode,
        publishers: [{ topicName: '/chatter', messageType: 'std_msgs/msg/String' }],
        subscriptions: [{ topicName: '/commands', messageType: 'std_msgs/msg/Int32' }],
      };

      showQuickPick
        .mockResolvedValueOnce([])                     // no parameters
        // remap action loop: add first
        .mockResolvedValueOnce({ label: 'Add remap', isAdd: true })
        // remap source: pick the subscription from the suggestion list
        .mockResolvedValueOnce({ label: '/commands', description: 'subscription • std_msgs/msg/Int32' })
        .mockResolvedValueOnce({ label: 'Done', isDone: true });

      showInputBox
        .mockResolvedValueOnce('talker_node')          // node name unchanged
        .mockResolvedValueOnce('/new_commands');       // remap target

      const options = await runNodeOptionsWizard(node);

      expect(options).toBeDefined();
      expect(options!.remaps).toEqual([{ from: '/commands', to: '/new_commands' }]);
      // The remap-source quick pick (3rd call) must contain the suggestions
      const sourcePickOptions = showQuickPick.mock.calls[2][0] as Array<{ label: string }>;
      expect(sourcePickOptions.map(item => item.label)).toEqual(
        expect.arrayContaining(['/commands', 'Enter manually…'])
      );
    });

    it('offers analyzed topics/services as remap sources (cpp)', async () => {
      const cppNode: NodeInfo = {
        name: 'talker_node',
        path: '/ws/src/my_pkg/my_pkg/talker.cpp',
        packageName: 'my_pkg',
        language: 'cpp',
        isExecutable: true,
        publishers: [{ topicName: '/chatter', messageType: 'std_msgs/msg/String' }],
        serviceClients: [{ name: '/add_two_ints', serviceType: 'example_interfaces/srv/AddTwoInts' }],
        actionServers: [{ name: '/fibonacci', actionType: 'example_interfaces/action/Fibonacci' }],
      };

      const suggestions = buildRemapSuggestions(cppNode);
      expect(suggestions.map(s => s.label)).toEqual(['/chatter', '/add_two_ints', '/fibonacci']);
      expect(suggestions[0].description).toBe('publisher • std_msgs/msg/String');
      expect(suggestions[1].description).toContain('service client');
      expect(suggestions[2].description).toContain('action server');
    });

    it('falls back to raw input when the node has no analyzed endpoints', async () => {
      showQuickPick
        .mockResolvedValueOnce([])                     // no parameters
        .mockResolvedValueOnce({ label: 'Add remap', isAdd: true })
        .mockResolvedValueOnce({ label: 'Done', isDone: true });

      showInputBox
        .mockResolvedValueOnce('talker_node')
        .mockResolvedValueOnce('/manual_from')         // raw source input
        .mockResolvedValueOnce('/manual_to');

      const options = await runNodeOptionsWizard(pythonNode); // no endpoints

      expect(options!.remaps).toEqual([{ from: '/manual_from', to: '/manual_to' }]);
      // No suggestion quick pick was shown (only param pick + 2 action picks)
      expect(showQuickPick).toHaveBeenCalledTimes(3);
    });
  });
});
