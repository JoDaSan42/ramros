import { buildZenohBridgeConfigs, pickFreePort } from '../../core/zenoh-bridge';

describe('zenoh bridge config builder', () => {
  it('builds peer configs: A listens on the peer port with the from domain, B connects with the to domain', () => {
    const { configA, configB } = buildZenohBridgeConfigs({
      entityKind: 'topic', entityName: '/chatter', fromDomain: 1, toDomain: 2, peerPort: 17447
    });
    expect(configA).toContain('domain: 1');
    expect(configA).toContain('listen');
    expect(configA).toContain('tcp/127.0.0.1:17447');
    expect(configB).toContain('domain: 2');
    expect(configB).toContain('connect');
    expect(configB).toContain('tcp/127.0.0.1:17447');
  });
  it('allow-lists the exact entity as an anchored regex on both sides', () => {
    const { configA, configB } = buildZenohBridgeConfigs({
      entityKind: 'topic', entityName: '/chatter', fromDomain: 0, toDomain: 1, peerPort: 17447
    });
    for (const cfg of [configA, configB]) {
      // ros2dds allow/deny entries are regexes matched against the FULL ROS
      // name including the leading slash — a bare `./chatter` entry would
      // mean "any char followed by /chatter" and never match `/chatter`.
      expect(cfg).toContain('publishers: ["^/chatter$"]');
      expect(cfg).toContain('subscribers: ["^/chatter$"]');
      expect(cfg).not.toContain('./');
    }
  });
  it('maps service entities to service_servers/service_clients and actions to action_servers/action_clients on BOTH configs', () => {
    const s = buildZenohBridgeConfigs({ entityKind: 'service', entityName: '/add', fromDomain: 0, toDomain: 1, peerPort: 17447 });
    for (const cfg of [s.configA, s.configB]) {
      expect(cfg).toContain('service_servers: ["^/add$"]');
      expect(cfg).toContain('service_clients: ["^/add$"]');
      expect(cfg).not.toContain('./');
    }
    const a = buildZenohBridgeConfigs({ entityKind: 'action', entityName: '/fib', fromDomain: 0, toDomain: 1, peerPort: 17447 });
    for (const cfg of [a.configA, a.configB]) {
      expect(cfg).toContain('action_servers: ["^/fib$"]');
      expect(cfg).toContain('action_clients: ["^/fib$"]');
      expect(cfg).not.toContain('./');
    }
  });
  it('pickFreePort returns a positive port', async () => {
    await expect(pickFreePort()).resolves.toBeGreaterThan(0);
  });
});
