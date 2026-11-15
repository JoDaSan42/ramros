import { zenohInstallGuide, domainBridgeInstallGuide, servicesActionsGuide, zenohNativeGuide } from '../../core/bridge-install-docs';

describe('bridge install guides', () => {
  it('zenoh guide lists apt repo, snap and github fallbacks', () => {
    const md = zenohInstallGuide('jazzy');
    expect(md).toContain('# Bridge tool not installed');
    expect(md).toContain('jazzy');
    expect(md).toContain('sudo apt install zenoh-bridge-ros2dds');
    expect(md).toContain('sudo snap install zenoh-bridge-ros2dds');
    expect(md).toContain('https://github.com/eclipse-zenoh/zenoh-plugin-ros2dds/releases');
  });
  it('domain_bridge guide names the distro package', () => {
    const md = domainBridgeInstallGuide('humble');
    expect(md).toContain('sudo apt install ros-humble-domain-bridge');
    expect(md).toContain('humble');
  });
  it('fast-dds services/actions guide explains the limitation and both escapes', () => {
    const md = servicesActionsGuide({ distro: 'jazzy', rmw: 'rmw_fastrtps_cpp', entityKind: 'service', entityName: '/add_two_ints' });
    expect(md).toContain('/add_two_ints');
    expect(md).toContain('Fast DDS');
    expect(md).toContain('export RMW_IMPLEMENTATION=rmw_cyclonedds_cpp');
    expect(md).toContain('https://github.com/ros2/domain_bridge/pull/82');
    expect(md).toContain('domain_bridge cannot bridge services or actions');
  });
  it('zenoh-native guide explains that no DDS domain exists to bridge', () => {
    const md = zenohNativeGuide({ entityKind: 'action', entityName: '/fib' });
    expect(md).toContain('rmw_zenoh_cpp');
    expect(md).toContain('/fib');
  });
});
