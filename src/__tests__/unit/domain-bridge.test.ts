import { buildDomainBridgeConfigYaml } from '../../core/domain-bridge';

describe('domain bridge config builder', () => {
  it('writes topic, type and both domains', () => {
    const yaml = buildDomainBridgeConfigYaml({
      topic: '/chatter',
      type: 'std_msgs/msg/String',
      fromDomain: 0,
      toDomain: 2
    });

    expect(yaml).toBe(
      [
        'topics:',
        "  '/chatter':",
        '    type: std_msgs/msg/String',
        '    from_domain: 0',
        '    to_domain: 2',
        ''
      ].join('\n')
    );
  });

  it('always writes from_domain (domain_bridge rejects a missing one)', () => {
    const yaml = buildDomainBridgeConfigYaml({
      topic: '/chatter',
      type: 'std_msgs/msg/String',
      fromDomain: 0,
      toDomain: 1
    });

    expect(yaml).toContain('from_domain: 0');
    expect(yaml).toContain('to_domain: 1');
  });
});
