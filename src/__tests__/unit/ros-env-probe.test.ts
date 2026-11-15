import { parseRosEnvProbeOutput, defaultRmwForDistro, probeRosEnv } from '../../core/ros-env-probe';

describe('ros env probe', () => {
  it('parses RMW and domain lines', () => {
    const r = parseRosEnvProbeOutput('RMW=rmw_zenoh_cpp\nDOMAIN=2\n');
    expect(r).toEqual({ rmw: 'rmw_zenoh_cpp', domainId: 2 });
  });
  it('falls back to distro default RMW and domain 0 when unset', () => {
    const r = parseRosEnvProbeOutput('RMW=\nDOMAIN=0\n');
    expect(r).toEqual({ rmw: 'rmw_fastrtps_cpp', domainId: 0 });
  });
  it('normalizes case and whitespace', () => {
    expect(parseRosEnvProbeOutput('RMW= RMW_CYCLONEDDS_CPP \nDOMAIN=1\n').rmw).toBe('rmw_cyclonedds_cpp');
  });
  it('uses the last occurrence when a line repeats', () => {
    const r = parseRosEnvProbeOutput('RMW=rmw_fastrtps_cpp\nDOMAIN=1\nRMW=rmw_cyclonedds_cpp\nDOMAIN=2\n');
    expect(r).toEqual({ rmw: 'rmw_cyclonedds_cpp', domainId: 2 });
  });
  it('keeps the default domain when DOMAIN is not an integer', () => {
    const r = parseRosEnvProbeOutput('RMW=rmw_cyclonedds_cpp\nDOMAIN=abc\n');
    expect(r).toEqual({ rmw: 'rmw_cyclonedds_cpp', domainId: 0 });
  });
  it('defaultRmwForDistro returns Fast DDS for all known distros', () => {
    for (const d of ['humble', 'iron', 'jazzy', 'kilted', 'lyrical', 'rolling']) {
      expect(defaultRmwForDistro(d)).toBe('rmw_fastrtps_cpp');
    }
  });

  it('sources distro setup and workspace overlay in the probe command', async () => {
    const commands: string[] = [];
    const probe = async (command: string) => {
      commands.push(command);
      return { output: 'RMW=rmw_cyclonedds_cpp\nDOMAIN=3\n', ok: true };
    };
    const r = await probeRosEnv(probe, { distro: 'jazzy', workspaceInstallPath: '/home/ws' });

    expect(r).toEqual({ rmw: 'rmw_cyclonedds_cpp', domainId: 3 });
    expect(commands).toHaveLength(1);
    expect(commands[0]).toContain('source "/opt/ros/jazzy/setup.bash"');
    expect(commands[0]).toContain('[ -f "/home/ws/install/setup.bash" ] && source');
  });

  it('quotes setup paths so workspaces with spaces in the path survive', async () => {
    const commands: string[] = [];
    const probe = async (command: string) => {
      commands.push(command);
      return { output: 'RMW=rmw_fastrtps_cpp\nDOMAIN=0\n', ok: true };
    };
    await probeRosEnv(probe, { distro: 'jazzy', workspaceInstallPath: '/home/user/my ws' });

    expect(commands[0]).toContain('source "/home/user/my ws/install/setup.bash"');
    expect(commands[0]).not.toContain('source /home/user/my ws/');
  });

  it('returns defaults when the probe fails (ok:false) instead of throwing', async () => {
    const probe = async () => ({ output: '', ok: false });
    const r = await probeRosEnv(probe, { distro: 'kilted' });

    expect(r).toEqual({ rmw: 'rmw_fastrtps_cpp', domainId: 0 });
  });

  it('returns defaults when the probe promise rejects instead of throwing', async () => {
    const probe = () => Promise.reject(new Error('spawn failed'));
    const r = await probeRosEnv(probe, { distro: 'iron' });

    expect(r).toEqual({ rmw: 'rmw_fastrtps_cpp', domainId: 0 });
  });
});
