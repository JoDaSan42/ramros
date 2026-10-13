import { exec } from 'child_process';
import {
  parseNodeInfoOutput,
  parseParameterList,
  parseParameterValue,
  parseParameterType,
  validateParameterValue,
  Ros2CliService,
} from '../../core/ros2-cli-service';

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
            (error as Error & { stdout?: string; stderr?: string }).stdout = stdout;
            (error as Error & { stdout?: string; stderr?: string }).stderr = stderr;
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

describe('Ros2CliService exec-backed methods', () => {
  let cli: Ros2CliService;

  beforeEach(() => {
    cli = Ros2CliService.getInstance();
    (exec as unknown as jest.Mock).mockClear();
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  function mockStdout(stdout: string): void {
    (exec as unknown as jest.Mock).mockImplementationOnce((...args: unknown[]) => {
      const cb = args[args.length - 1] as (error: Error | null, stdout: string, stderr: string) => void;
      cb(null, stdout, '');
    });
  }

  it('returns the same singleton instance', () => {
    expect(Ros2CliService.getInstance()).toBe(Ros2CliService.getInstance());
  });

  it('getActiveNodes returns non-empty lines from ros2 node list', async () => {
    mockStdout('/talker\n/listener\n\n');
    await expect(cli.getActiveNodes()).resolves.toEqual(['/talker', '/listener']);
  });

  it('getActiveNodes returns an empty list when the command fails', async () => {
    await expect(cli.getActiveNodes()).resolves.toEqual([]);
  });

  it('getActiveTopics returns non-empty lines from ros2 topic list', async () => {
    mockStdout('/chatter\n/rosout\n');
    await expect(cli.getActiveTopics()).resolves.toEqual(['/chatter', '/rosout']);
  });

  it('getTopicInfo parses type, publishers and subscribers', async () => {
    const stdout = [
      'Type: std_msgs/msg/String',
      'Publisher count: 1',
      'Node name: /talker',
      'Endpoint type: PUBLISHER',
      'Subscription count: 1',
      'Node name: /listener',
      'Endpoint type: SUBSCRIPTION',
    ].join('\n');
    mockStdout(stdout);

    const info = await cli.getTopicInfo('/chatter');

    expect(info).toEqual({
      name: '/chatter',
      messageType: 'std_msgs/msg/String',
      publishers: ['/talker'],
      subscribers: ['/listener'],
    });
  });

  it('getTopicInfo returns null when the command fails', async () => {
    await expect(cli.getTopicInfo('/chatter')).resolves.toBeNull();
  });

  it('getTopicPublishers returns publisher node names', async () => {
    const stdout = [
      'Publisher count: 1',
      'Node name: /talker',
      'Subscription count: 0',
    ].join('\n');
    mockStdout(stdout);

    await expect(cli.getTopicPublishers('/chatter')).resolves.toEqual([
      { nodeName: '/talker', nodeNamespace: '' },
    ]);
  });

  it('getTopicSubscribers returns subscriber node names', async () => {
    const stdout = [
      'Publisher count: 0',
      'Subscription count: 1',
      'Node name: /listener',
    ].join('\n');
    mockStdout(stdout);

    await expect(cli.getTopicSubscribers('/chatter')).resolves.toEqual([
      { nodeName: '/listener', nodeNamespace: '' },
    ]);
  });

  it('parseTopicEndpoints returns an empty list when the command fails', async () => {
    await expect(cli.getTopicPublishers('/chatter')).resolves.toEqual([]);
  });

  it('getNodeInfo maps parsed output into a NodeInfo', async () => {
    mockStdout([
      '/talker',
      '  Publishers:',
      '    /chatter: std_msgs/msg/String',
      '  Subscribers:',
      '    /clock: rosgraph_msgs/msg/Clock',
      '  Service Servers:',
      '    /reset: std_srvs/srv/Trigger',
    ].join('\n'));

    const info = await cli.getNodeInfo('/talker');

    expect(info?.name).toBe('/talker');
    expect(info?.publishedTopics).toEqual(['/chatter']);
    expect(info?.subscribedTopics).toEqual(['/clock']);
    expect(info?.serviceServers).toEqual([{ name: '/reset', type: 'std_srvs/srv/Trigger' }]);
  });

  it('getNodeInfo returns null when the command fails', async () => {
    await expect(cli.getNodeInfo('/talker')).resolves.toBeNull();
  });

  it('getTopicType returns the first non-empty line', async () => {
    mockStdout('\nstd_msgs/msg/String\n');
    await expect(cli.getTopicType('/chatter')).resolves.toBe('std_msgs/msg/String');
  });

  it('getTopicType returns null when the command fails', async () => {
    await expect(cli.getTopicType('/chatter')).resolves.toBeNull();
  });

  it('getServiceType returns the first non-empty line', async () => {
    mockStdout('std_srvs/srv/Trigger\n');
    await expect(cli.getServiceType('/reset')).resolves.toBe('std_srvs/srv/Trigger');
  });

  it('getServiceType returns null when the command fails', async () => {
    await expect(cli.getServiceType('/reset')).resolves.toBeNull();
  });

  it('getParameterNames parses the parameter list output', async () => {
    mockStdout('/talker\n  use_sim_time\n  rate\n');
    await expect(cli.getParameterNames('/talker')).resolves.toEqual(['use_sim_time', 'rate']);
  });

  it('getParameterNames returns an empty list when the command fails', async () => {
    await expect(cli.getParameterNames('/talker')).resolves.toEqual([]);
  });

  it('getParameterValue parses the value output', async () => {
    mockStdout('Double value is: 1.500000');
    await expect(cli.getParameterValue('/talker', 'rate')).resolves.toBe('1.500000');
  });

  it('getParameterValue returns null when the command fails', async () => {
    await expect(cli.getParameterValue('/talker', 'rate')).resolves.toBeNull();
  });

  it('getParameterValueWithType parses value and type', async () => {
    mockStdout('Integer value is: 10');
    await expect(cli.getParameterValueWithType('/talker', 'count')).resolves.toEqual({
      value: '10',
      type: 'integer',
    });
  });

  it('getParameterValueWithType returns nulls when the command fails', async () => {
    await expect(cli.getParameterValueWithType('/talker', 'count')).resolves.toEqual({
      value: null,
      type: null,
    });
  });

  it('setParameterValue returns true on success', async () => {
    mockStdout('');
    await expect(cli.setParameterValue('/talker', 'rate', '2.0')).resolves.toBe(true);
  });

  it('setParameterValue returns false when the command fails', async () => {
    await expect(cli.setParameterValue('/talker', 'rate', '2.0')).resolves.toBe(false);
  });

  it('callService returns stdout on success', async () => {
    mockStdout('response: 42');
    await expect(cli.callService('/add_two_ints', 'example_interfaces/srv/AddTwoInts', '{"a": 1, "b": 2}')).resolves.toBe('response: 42');
  });

  it('callService returns null when the command fails', async () => {
    await expect(cli.callService('/add_two_ints', 'example_interfaces/srv/AddTwoInts', '{"a": 1, "b": 2}')).resolves.toBeNull();
  });
});
