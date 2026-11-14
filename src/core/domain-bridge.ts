/**
 * Builds the YAML configuration for the `domain_bridge` package
 * (github.com/ros2/domain_bridge). One bridged topic per config; the config
 * file is written next to the bridge terminal's lifecycle (temp file) and
 * passed to `ros2 run domain_bridge domain_bridge <path>`.
 *
 * Pure module: no vscode import.
 */
export interface DomainBridgeConfig {
  topic: string;
  type: string;
  /** Source domain; undefined = bridge from the current environment. */
  fromDomain?: number;
  toDomain: number;
}

export function buildDomainBridgeConfigYaml(config: DomainBridgeConfig): string {
  const lines: string[] = ['topics:', `  '${config.topic}':`, `    type: ${config.type}`];
  if (config.fromDomain !== undefined) {
    lines.push(`    from_domain: ${config.fromDomain}`);
  }
  lines.push(`    to_domain: ${config.toDomain}`);
  return lines.join('\n') + '\n';
}
