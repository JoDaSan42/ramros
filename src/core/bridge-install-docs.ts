/**
 * User-facing install/limitation guides for the distro-aware bridging feature,
 * shown in a readonly editor tab when a bridge cannot start automatically.
 *
 * Four documents:
 * - `zenohInstallGuide`: the bridge tool is missing — how to install
 *   `zenoh-bridge-ros2dds` (it is NOT a ROS package; it ships via the Eclipse
 *   Zenoh apt repo, snap, or as a GitHub release download).
 * - `domainBridgeInstallGuide`: the `domain_bridge` package is missing —
 *   how to install it from the distro's ROS repository.
 * - `servicesActionsGuide`: the RMW is not CycloneDDS and the entity is a
 *   service/action — zenoh-plugin-ros2dds#492 limits services/actions to
 *   CycloneDDS, and `domain_bridge` silently ignores `services:`/`actions:`
 *   YAML sections (ros2/domain_bridge#10, #11, #54, PR #82 unmerged).
 * - `zenohNativeGuide`: the RMW is `rmw_zenoh_cpp` — there is no second DDS
 *   domain to bridge, so bridging does not apply.
 *
 * Pure module: no vscode import. Task 7 renders these in a readonly tab.
 */
const ZENOH_RELEASES_URL = 'https://github.com/eclipse-zenoh/zenoh-plugin-ros2dds/releases';
const ZENOH_DOCS_URL = 'https://zenoh.io/docs/getting-started/installation/';
const DOMAIN_BRIDGE_PR_82_URL = 'https://github.com/ros2/domain_bridge/pull/82';

/**
 * Prepends a leading slash to the entity name when it lacks one, so guides
 * always display canonical ROS names like `/chatter` or `/add_two_ints`.
 */
function canonicalName(entityName: string): string {
  return entityName.startsWith('/') ? entityName : `/${entityName}`;
}

/**
 * Guide shown when `zenoh-bridge-ros2dds` is not found on PATH.
 * Embeds the distro in a note about which ROS 2 setup to source.
 */
export function zenohInstallGuide(distro: string): string {
  return [
    '# Bridge tool not installed',
    '',
    `RAMROS could not find \`zenoh-bridge-ros2dds\` to bridge between ROS 2 domains (distro: \`${distro}\`).`,
    '',
    '**`zenoh-bridge-ros2dds` is not a ROS package.** It is a standalone binary distributed by the Eclipse Zenoh project.',
    'It is not available with `rosdep`, and it does not come with a ROS 2 installation.',
    '',
    '## Option 1 — Eclipse Zenoh apt repository (recommended)',
    '',
    'Add the Eclipse Zenoh public key to the apt keyring:',
    '',
    '```bash',
    'curl -L https://download.eclipse.org/zenoh/debian-repo/zenoh-public-key \\',
    '  | sudo gpg --dearmor --yes --output /etc/apt/keyrings/zenoh-public-key.gpg',
    '```',
    '',
    'Add the Eclipse Zenoh repository to the apt sources list:',
    '',
    '```bash',
    'echo "deb [signed-by=/etc/apt/keyrings/zenoh-public-key.gpg] https://download.eclipse.org/zenoh/debian-repo/ /" \\',
    '  | sudo tee -a /etc/apt/sources.list > /dev/null',
    'sudo apt update',
    '```',
    '',
    'Install the bridge:',
    '',
    '```bash',
    'sudo apt install zenoh-bridge-ros2dds',
    '```',
    '',
    `See the [Zenoh installation docs](${ZENOH_DOCS_URL}) for other Debian/Ubuntu variants.`,
    '',
    '## Option 2 — snap',
    '',
    '```bash',
    'sudo snap install zenoh-bridge-ros2dds',
    '```',
    '',
    '## Option 3 — GitHub release download',
    '',
    `Download a prebuilt standalone binary from [${ZENOH_RELEASES_URL}](${ZENOH_RELEASES_URL})`,
    'and put it on your `PATH` (e.g. `/usr/local/bin/zenoh-bridge-ros2dds`).',
    '',
    '## After installing',
    '',
    'Make sure `zenoh-bridge-ros2dds` is on the `PATH` that VS Code sees, then retry the bridge.',
    `If you use a non-default ROS setup, source \`/opt/ros/${distro}/setup.bash\` in your terminals first.`
  ].join('\n');
}

/**
 * Guide shown when the `domain_bridge` package is missing on a legacy distro.
 * `domain_bridge` IS a ROS package, so installation is a single apt line.
 */
export function domainBridgeInstallGuide(distro: string): string {
  return [
    '# Bridge tool not installed',
    '',
    `RAMROS could not find the \`domain_bridge\` package for ROS 2 \`${distro}\`.`,
    '',
    '## Install it from the ROS 2 repository',
    '',
    '```bash',
    `sudo apt install ros-${distro}-domain-bridge`,
    '```',
    '',
    '## Notes',
    '',
    `- Requires the ROS 2 \`${distro}\` apt repositories to be configured.`,
    '- After installing, open a new terminal (or re-source your workspace) so the package is found, then retry the bridge.',
    `- This package only exists for the distros that shipped it — check \`apt-cache search ros-${distro}-domain-bridge\` if the install fails.`
  ].join('\n');
}

/**
 * Human-readable middleware name for the RMW ids that appear in the
 * services/actions guide. Unknown ids fall back to the raw id so the guide
 * never states a wrong vendor name.
 */
function rmwDisplayName(rmw: string): string {
  switch (rmw) {
    case 'rmw_fastrtps_cpp':
    case 'rmw_fastrtps_dynamic_cpp':
      return 'Fast DDS';
    case 'rmw_cyclonedds_cpp':
      return 'CycloneDDS';
    case 'rmw_connextdds':
      return 'RTI Connext DDS';
    default:
      return rmw;
  }
}

/**
 * Guide shown when the entity is a service or action and the RMW is not
 * CycloneDDS (e.g. Fast DDS). Explains the upstream limitation and the two
 * ways out: switch the RMW, or build domain_bridge PR #82 from source.
 */
export function servicesActionsGuide(input: {
  distro: string;
  rmw: string;
  entityKind: string;
  entityName: string;
}): string {
  const name = canonicalName(input.entityName);
  return [
    '# Bridging services and actions requires CycloneDDS',
    '',
    `The ${input.entityKind} \`${name}\` cannot be bridged while your system uses \`${input.rmw}\`.`,
    '',
    '## Why',
    '',
    '- `zenoh-bridge-ros2dds` can only relay services and actions when both sides run **CycloneDDS**',
    '  (upstream: [zenoh-plugin-ros2dds#492](https://github.com/eclipse-zenoh/zenoh-plugin-ros2dds/issues/492)).',
    `  With **${rmwDisplayName(input.rmw)}** (\`${input.rmw}\`) the bridge cannot create service/action routes.`,
    '- **domain_bridge cannot bridge services or actions**: its YAML parser silently ignores `services:` and',
    '  `actions:` sections (ros2/domain_bridge#10, #11, #54; [PR #82](https://github.com/ros2/domain_bridge/pull/82) adding support was never merged).',
    '',
    '## Escape 1 — switch the RMW to CycloneDDS (recommended)',
    '',
    'Set the RMW implementation for every terminal that runs ROS commands:',
    '',
    '```bash',
    'export RMW_IMPLEMENTATION=rmw_cyclonedds_cpp',
    '```',
    '',
    'To make it permanent, add the line to your `~/.bashrc` (or use a terminal that already exports it).',
    '',
    '**Caveat:** the variable only affects terminals opened *after* it is set — restart all ROS terminals',
    '(and VS Code itself) so every node, `ros2` CLI and RAMROS terminal picks up the new RMW.',
    'Both domains must use the same RMW, and CycloneDDS must be installed for your distro',
    `(\`sudo apt install ros-${input.distro}-rmw-cyclonedds-cpp\`).`,
    '',
    '## Escape 2 — build domain_bridge PR #82 from source (advanced)',
    '',
    `[PR #82](${DOMAIN_BRIDGE_PR_82_URL}) adds services/actions support to \`domain_bridge\`, but it is **unreleased** and`,
    'not merged upstream. If you accept the risk, build the PR branch from source:',
    '',
    '```bash',
    'mkdir -p ~/domain_bridge_ws/src && cd ~/domain_bridge_ws/src',
    'git clone https://github.com/ros2/domain_bridge.git',
    'cd domain_bridge && git fetch origin pull/82/head:pr-82 && git checkout pr-82',
    'cd ~/domain_bridge_ws',
    'rosdep install --from-paths src --ignore-src -y',
    'colcon build',
    'source install/setup.bash',
    '```',
    '',
    'This is an advanced, unsupported path — prefer Escape 1.',
    '',
    '## Still stuck?',
    '',
    'As a last resort, re-implement the relay manually: run a node in each domain that forwards requests',
    `and responses for \`${name}\` across the domains.`
  ].join('\n');
}

/**
 * Guide shown when the RMW is `rmw_zenoh_cpp`: the system already speaks
 * Zenoh natively, so there is no second DDS domain to bridge — RAMROS cannot
 * create a bridge for this setup, and `rmw_zenoh` has no domain bridge today.
 */
export function zenohNativeGuide(input: { entityKind: string; entityName: string }): string {
  const name = canonicalName(input.entityName);
  return [
    '# No DDS domain to bridge',
    '',
    `Your system uses the \`rmw_zenoh_cpp\` middleware, so RAMROS cannot bridge the ${input.entityKind} \`${name}\`.`,
    '',
    '## Why',
    '',
    '- With `rmw_zenoh_cpp` your ROS 2 graph already runs on Zenoh instead of DDS. There is no second DDS',
    '  domain for a bridge to connect to — the usual "bridge two ROS domains" model does not apply.',
    '- `rmw_zenoh` has no domain bridge today: it does not provide a tool that relays entities between',
    '  two domains the way `domain_bridge` or `zenoh-bridge-ros2dds` do for DDS-based RMWs.',
    '',
    '## What to do instead',
    '',
    '- If the peer you want to reach also runs `rmw_zenoh_cpp`, both graphs can talk over Zenoh directly —',
    '  configure Zenoh routing (e.g. [zenohd routers](https://zenoh.io/docs/getting-started/deployment/)) between the machines.',
    '- If you need to reach a DDS-based ROS 2 system, switch back to a DDS RMW such as CycloneDDS:',
    '',
    '```bash',
    'export RMW_IMPLEMENTATION=rmw_cyclonedds_cpp',
    '```',
    '',
    'Restart your terminals (and VS Code) so the change takes effect everywhere, then retry the bridge.'
  ].join('\n');
}
