import { resolveBridgeStrategy } from '../../core/bridge-policy';

describe('bridge policy', () => {
  it('routes topics to domain_bridge on humble/iron regardless of RMW', () => {
    expect(resolveBridgeStrategy({ distro: 'humble', rmw: 'rmw_fastrtps_cpp', entityKind: 'topic' })).toEqual({ kind: 'domainBridge' });
    expect(resolveBridgeStrategy({ distro: 'iron', rmw: 'rmw_cyclonedds_cpp', entityKind: 'topic' })).toEqual({ kind: 'domainBridge' });
  });
  it('routes topics to zenoh on jazzy and newer, including unknown distros', () => {
    expect(resolveBridgeStrategy({ distro: 'jazzy', rmw: 'rmw_fastrtps_cpp', entityKind: 'topic' })).toEqual({ kind: 'zenoh' });
    expect(resolveBridgeStrategy({ distro: 'lyrical', rmw: 'rmw_cyclonedds_cpp', entityKind: 'topic' })).toEqual({ kind: 'zenoh' });
    expect(resolveBridgeStrategy({ distro: 'kilted', rmw: 'rmw_fastrtps_cpp', entityKind: 'topic' })).toEqual({ kind: 'zenoh' });
    expect(resolveBridgeStrategy({ distro: 'somewhere-new', rmw: 'rmw_fastrtps_cpp', entityKind: 'topic' })).toEqual({ kind: 'zenoh' });
  });
  it('routes services/actions to zenoh only under cyclonedds', () => {
    expect(resolveBridgeStrategy({ distro: 'jazzy', rmw: 'rmw_cyclonedds_cpp', entityKind: 'service' })).toEqual({ kind: 'zenoh' });
    expect(resolveBridgeStrategy({ distro: 'humble', rmw: 'rmw_cyclonedds_cpp', entityKind: 'action' })).toEqual({ kind: 'zenoh' });
  });
  it('routes fast-dds services/actions to the guide (any distro)', () => {
    const expected = { kind: 'guide', reason: 'fast-dds-services-actions' };
    expect(resolveBridgeStrategy({ distro: 'jazzy', rmw: 'rmw_fastrtps_cpp', entityKind: 'service' })).toEqual(expected);
    expect(resolveBridgeStrategy({ distro: 'humble', rmw: 'rmw_fastrtps_cpp', entityKind: 'action' })).toEqual(expected);
  });
  it('routes unknown-RMW services/actions to the guide', () => {
    expect(resolveBridgeStrategy({ distro: 'jazzy', rmw: 'rmw_connextdds', entityKind: 'service' })).toEqual({ kind: 'guide', reason: 'fast-dds-services-actions' });
  });
  it('routes zenoh-native RMW to the guide for every entity kind', () => {
    const expected = { kind: 'guide', reason: 'rmw-zenoh-native' };
    for (const entityKind of ['topic', 'service', 'action'] as const) {
      expect(resolveBridgeStrategy({ distro: 'jazzy', rmw: 'rmw_zenoh_cpp', entityKind })).toEqual(expected);
    }
  });
});
