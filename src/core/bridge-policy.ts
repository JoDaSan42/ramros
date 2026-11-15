/**
 * Bridge policy: maps (distro × rmw × entity kind) to a bridging strategy.
 *
 * Rules, first match wins:
 * 1. `rmw_zenoh_cpp` is Zenoh itself — no bridging needed, point users at the
 *    Zenoh configuration guide.
 * 2. Services and actions under any RMW other than CycloneDDS are unreliable
 *    to bridge (Fast DDS and other RMWs) — point users at the install guide.
 * 3. Topics on pre-Jazzy distros (foxy, galactic, humble, iron) route to the
 *    `domain_bridge` package.
 * 4. Everything else — topics on Jazzy and newer — uses Zenoh bridging.
 *
 * Unknown distros are treated as Jazzy+ (zenoh) for topics, so future ROS
 * releases get the modern strategy by default instead of the legacy
 * domain_bridge path.
 *
 * Pure module: no vscode import.
 */
export type BridgeEntityKind = 'topic' | 'service' | 'action';

export type BridgeStrategy =
  | { kind: 'zenoh' }
  | { kind: 'domainBridge' }
  | { kind: 'guide'; reason: 'rmw-zenoh-native' | 'fast-dds-services-actions' };

/** Distros that predate the Zenoh bridge and use `domain_bridge` for topics. */
const LEGACY_TOPIC_DISTROS = new Set(['foxy', 'galactic', 'humble', 'iron']);

export function resolveBridgeStrategy(input: {
  distro: string;
  rmw: string;
  entityKind: BridgeEntityKind;
}): BridgeStrategy {
  if (input.rmw === 'rmw_zenoh_cpp') {
    return { kind: 'guide', reason: 'rmw-zenoh-native' };
  }
  if (input.entityKind !== 'topic' && input.rmw !== 'rmw_cyclonedds_cpp') {
    return { kind: 'guide', reason: 'fast-dds-services-actions' };
  }
  if (input.entityKind === 'topic' && LEGACY_TOPIC_DISTROS.has(input.distro)) {
    return { kind: 'domainBridge' };
  }
  return { kind: 'zenoh' };
}
