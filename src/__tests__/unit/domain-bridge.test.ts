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

  it('omits from_domain when the source is the current environment', () => {
    const yaml = buildDomainBridgeConfigYaml({
      topic: '/chatter',
      type: 'std_msgs/msg/String',
      fromDomain: undefined,
      toDomain: 1
    });

    expect(yaml).not.toContain('from_domain');
    expect(yaml).toContain('to_domain: 1');
  });
});
