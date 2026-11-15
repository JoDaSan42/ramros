/**
 * Builds the JSON5 configuration for a pair of peering `zenoh-bridge-ros2dds`
 * instances that relay one ROS 2 entity (topic, service or action) between
 * two ROS domains:
 *
 *   domain A ⇄ zenoh-bridge-ros2dds (A) ⇄ zenoh ⇄ zenoh-bridge-ros2dds (B) ⇄ domain B
 *
 * Bridge A listens on the peer port and runs in the source domain; bridge B
 * connects to that endpoint and runs in the target domain. Each side
 * allow-lists exactly the bridged entity (zenoh-plugin-ros2dds name syntax:
 * leading `/` stripped and prefixed with `./`), so nothing else leaks across.
 *
 * The output is JSON5 (unquoted keys are valid) and is written to a temp file
 * by the caller, then passed to `zenoh-bridge-ros2dds -c <path>`.
 *
 * Pure module: no vscode import.
 */
import * as net from 'node:net';

export type ZenohEntityKind = 'topic' | 'service' | 'action';

/** Allow-list keys in the ros2dds plugin config, per entity kind. */
const ALLOW_KEYS: Record<ZenohEntityKind, [string, string]> = {
  topic: ['publishers', 'subscribers'],
  service: ['service_servers', 'service_clients'],
  action: ['action_servers', 'action_clients']
};

/**
 * Converts a ROS name with leading slash (e.g. `/chatter`) to the
 * zenoh-plugin-ros2dds config name syntax (e.g. `./chatter`).
 */
function toZenohName(entityName: string): string {
  return `./${entityName.replace(/^\//, '')}`;
}

/**
 * Builds the two JSON5 bridge configs. `configA` listens on `peerPort` in
 * `fromDomain`; `configB` connects to the same endpoint in `toDomain`.
 */
export function buildZenohBridgeConfigs(input: {
  entityKind: ZenohEntityKind;
  entityName: string; // ROS name with leading slash, e.g. '/chatter'
  fromDomain: number;
  toDomain: number;
  peerPort: number;
}): { configA: string; configB: string } {
  const name = toZenohName(input.entityName);
  const [keyA, keyB] = ALLOW_KEYS[input.entityKind];
  const endpoint = `tcp/127.0.0.1:${input.peerPort}`;
  const build = (domain: number, mode: 'listen' | 'connect'): string => {
    const lines = [
      '{',
      '  mode: "peer",',
      `  ${mode}: { endpoints: ["${endpoint}"] },`,
      '  plugins: {',
      '    ros2dds: {',
      `      domain: ${domain},`,
      '      allow: {',
      `        ${keyA}: ["${name}"],`,
      `        ${keyB}: ["${name}"]`,
      '      }',
      '    }',
      '  }',
      '}'
    ];
    return lines.join('\n') + '\n';
  };
  return {
    configA: build(input.fromDomain, 'listen'),
    configB: build(input.toDomain, 'connect')
  };
}

/**
 * Asks the OS for a free TCP port by binding an ephemeral server to port 0
 * and reading the assigned port. The socket is closed before returning, so
 * the port is only very likely (not guaranteed) still free — the standard
 * approach for suggesting a port.
 */
export async function pickFreePort(): Promise<number> {
  return new Promise<number>((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address !== null ? address.port : 0;
      server.close(() => (port > 0 ? resolve(port) : reject(new Error('no free port'))));
    });
  });
}
