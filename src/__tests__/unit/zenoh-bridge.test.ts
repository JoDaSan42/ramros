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
  it('allow-lists exactly the entity on both sides, zenoh ros2dds name syntax ./name', () => {
    const { configA, configB } = buildZenohBridgeConfigs({
      entityKind: 'topic', entityName: '/chatter', fromDomain: 0, toDomain: 1, peerPort: 17447
    });
    for (const cfg of [configA, configB]) {
      expect(cfg).toContain('publishers: ["./chatter"]');
      expect(cfg).toContain('subscribers: ["./chatter"]');
      expect(cfg).not.toContain('.*');
    }
  });
  it('maps service entities to service_servers/service_clients and actions to action_servers/action_clients', () => {
    const s = buildZenohBridgeConfigs({ entityKind: 'service', entityName: '/add', fromDomain: 0, toDomain: 1, peerPort: 17447 });
    expect(s.configA).toContain('service_servers: ["./add"]');
    expect(s.configA).toContain('service_clients: ["./add"]');
    const a = buildZenohBridgeConfigs({ entityKind: 'action', entityName: '/fib', fromDomain: 0, toDomain: 1, peerPort: 17447 });
    expect(a.configA).toContain('action_servers: ["./fib"]');
    expect(a.configA).toContain('action_clients: ["./fib"]');
  });
  it('pickFreePort returns a positive port', async () => {
    await expect(pickFreePort()).resolves.toBeGreaterThan(0);
  });
});
