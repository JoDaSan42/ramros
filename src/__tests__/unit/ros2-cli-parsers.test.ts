import { exec } from 'child_process';
import {
  parseNodeInfoOutput,
  parseParameterList,
  parseParameterValue,
  Ros2CliService,
} from '../../core/ros2-cli-service';

jest.mock('child_process', () => {
  const execMock = jest.fn((...args: unknown[]) => {
    const cb = args[args.length - 1] as (error: Error | null, stdout: string, stderr: string) => void;
    cb(null, '', '');
  });
  Object.defineProperty(execMock, Symbol.for('nodejs.util.promisify.custom'), {
    value: (command: string, options: unknown) =>
      new Promise((resolve) => {
        execMock(command, options, (_error: Error | null, stdout: string, stderr: string) => {
          resolve({ stdout, stderr });
        });
      }),
    configurable: true
  });
  return { exec: execMock };
});

const NODE_INFO_STDOUT = [
  '/add_two_ints',
  '  Subscribers:',
  '    /clock: rosgraph_msgs/msg/Clock',
  '  Publishers:',
  '    /add_two_ints: example_interfaces/srv/AddTwoInts',
  '  Service Servers:',
  '    /add_two_ints: example_interfaces/srv/AddTwoInts',
  '    /reset: ',
  '  Service Clients:',
  '    /status: example_interfaces/srv/Trigger',
  '  Action Servers:',
  '    /fibonacci: action_tutorials_interfaces/action/Fibonacci',
  '  Action Clients:',
  '    /other_action: action_tutorials_interfaces/action/Fibonacci',
  '',
].join('\n');

describe('parseNodeInfoOutput', () => {
  it('parses subscribed and published topics', () => {
    const result = parseNodeInfoOutput(NODE_INFO_STDOUT);

    expect(result.subscribedTopics).toEqual(['/clock']);
    expect(result.publishedTopics).toEqual(['/add_two_ints']);
  });

  it('parses service servers with names and types', () => {
    const result = parseNodeInfoOutput(NODE_INFO_STDOUT);

    expect(result.serviceServers).toHaveLength(2);
    expect(result.serviceServers[0]).toEqual({
      name: '/add_two_ints',
      type: 'example_interfaces/srv/AddTwoInts',
    });
  });

  it('parses a service server line without a type as type undefined', () => {
    const result = parseNodeInfoOutput(NODE_INFO_STDOUT);

    expect(result.serviceServers[1]).toEqual({ name: '/reset', type: undefined });
  });

  it('skips Service Clients and Action sections', () => {
    const result = parseNodeInfoOutput(NODE_INFO_STDOUT);

    const names = result.serviceServers.map(s => s.name);
    expect(names).not.toContain('/status');
    expect(names).not.toContain('/fibonacci');
    expect(names).not.toContain('/other_action');
  });

  it('returns empty results for output without sections', () => {
    const result = parseNodeInfoOutput('/talker\n');

    expect(result.publishedTopics).toEqual([]);
    expect(result.subscribedTopics).toEqual([]);
    expect(result.serviceServers).toEqual([]);
  });
});

describe('parseParameterList', () => {
  it('skips the leading node-name header line', () => {
    const stdout = '/talker\n  use_sim_time\n  rate\n';

    expect(parseParameterList(stdout, '/talker')).toEqual(['use_sim_time', 'rate']);
  });

  it('parses output without a header line', () => {
    const stdout = '  use_sim_time\n  rate\n';

    expect(parseParameterList(stdout, '/talker')).toEqual(['use_sim_time', 'rate']);
  });

  it('skips section-header lines ending with a colon', () => {
    const stdout = '/talker\n  Parameters:\n  use_sim_time\n';

    expect(parseParameterList(stdout, '/talker')).toEqual(['use_sim_time']);
  });

  it('returns an empty array for empty output', () => {
    expect(parseParameterList('', '/talker')).toEqual([]);
  });
});

describe('parseParameterValue', () => {
  it('extracts the value from a matching line', () => {
    expect(parseParameterValue('Double value is: 1.500000')).toBe('1.500000');
  });

  it('extracts the value from the last matching line', () => {
    const stdout = 'Integer value is: 10\nDouble value is: 1.500000';

    expect(parseParameterValue(stdout)).toBe('1.500000');
  });

  it('returns null when no line matches', () => {
    expect(parseParameterValue('Parameter not set')).toBeNull();
  });
});

describe('setParameterValue command quoting', () => {
  it('shell-quotes node, param and free-text value in the exec command', async () => {
    const cli = Ros2CliService.getInstance();

    const result = await cli.setParameterValue('/my node', 'my param', 'hello world');

    expect(result).toBe(true);
    expect(exec).toHaveBeenCalledWith(
      'ros2 param set "/my node" "my param" "hello world"',
      { encoding: 'utf-8', timeout: 10000 },
      expect.any(Function)
    );
  });

  it('escapes shell metacharacters in the value', async () => {
    const cli = Ros2CliService.getInstance();

    await cli.setParameterValue('/talker', 'greeting', '$(reboot) `touch /tmp/pwned`');

    expect(exec).toHaveBeenCalledWith(
      'ros2 param set "/talker" "greeting" "\\$(reboot) \\`touch /tmp/pwned\\`"',
      { encoding: 'utf-8', timeout: 10000 },
      expect.any(Function)
    );
  });
});
