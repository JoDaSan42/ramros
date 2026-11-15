/**
 * ROS environment probe: detects the active RMW implementation and
 * ROS_DOMAIN_ID by sourcing a distro setup script (and optionally a workspace
 * overlay) in a shell and reading the resulting environment.
 *
 * The probe itself is injected as a callback, keeping this module pure and
 * free of any vscode dependency. The caller (Task 7) wires the callback to
 * `Ros2CliService.executeRaw`, which runs the command via /bin/bash.
 */

export interface RosEnvProbeResult {
  rmw: string;
  domainId: number;
}

/**
 * Fallback RMW per distro. Every current ROS 2 distro (including Kilted)
 * ships Fast DDS as the default RMW — change here if upstream ever flips.
 */
export function defaultRmwForDistro(distro: string): string {
  void distro;
  return 'rmw_fastrtps_cpp';
}

/**
 * Builds the single-line probe command: source the distro setup.bash (if it
 * exists), source the workspace overlay (if configured and present), then
 * print RMW_IMPLEMENTATION and ROS_DOMAIN_ID from the resulting environment.
 *
 * `workspaceInstallPath` is the workspace root, not the install dir: the
 * `/install/setup.bash` suffix is appended here.
 */
function buildProbeCommand(options: { distro: string; workspaceInstallPath?: string }): string {
  const distroSetup = `/opt/ros/${options.distro}/setup.bash`;
  let command = `[ -f ${distroSetup} ] && source ${distroSetup};`;
  if (options.workspaceInstallPath) {
    const overlaySetup = `${options.workspaceInstallPath}/install/setup.bash`;
    command += ` [ -f ${overlaySetup} ] && source ${overlaySetup};`;
  }
  command += ' echo "RMW=${RMW_IMPLEMENTATION:-}"; echo "DOMAIN=${ROS_DOMAIN_ID:-0}"';
  return command;
}

/**
 * Parses the probe output for `RMW=`/`DOMAIN=` lines (last occurrence wins),
 * lowercasing/trimming the RMW value and integer-parsing the domain. An
 * empty RMW falls back to `defaultRmwForDistro`.
 */
export function parseRosEnvProbeOutput(output: string): RosEnvProbeResult {
  let rmw = '';
  let domainId = 0;
  for (const line of output.split(/\r?\n/)) {
    const rmwMatch = /^RMW=(.*)$/.exec(line);
    if (rmwMatch) {
      rmw = rmwMatch[1];
      continue;
    }
    const domainMatch = /^DOMAIN=(.*)$/.exec(line);
    if (domainMatch) {
      const parsed = Number.parseInt(domainMatch[1].trim(), 10);
      if (!Number.isNaN(parsed)) {
        domainId = parsed;
      }
    }
  }
  const normalizedRmw = rmw.trim().toLowerCase();
  return {
    // distro is unknown at parse time; the default is currently
    // distro-independent, so passing '' is safe
    rmw: normalizedRmw.length > 0 ? normalizedRmw : defaultRmwForDistro(''),
    domainId
  };
}

/**
 * Sources the distro setup.bash (and optional workspace overlay), then reads
 * RMW_IMPLEMENTATION and ROS_DOMAIN_ID from the resulting environment.
 * `workspaceInstallPath` is the workspace root, not the install dir: the
 * `/install/setup.bash` suffix is appended. A failed or rejected probe yields
 * the distro defaults instead of throwing.
 */
export async function probeRosEnv(
  probe: (command: string) => Promise<{ output: string; ok: boolean }>,
  options: { distro: string; workspaceInstallPath?: string }
): Promise<RosEnvProbeResult> {
  const result = await probe(buildProbeCommand(options)).catch(() => undefined);
  if (!result || !result.ok) {
    return { rmw: defaultRmwForDistro(options.distro), domainId: 0 };
  }
  return parseRosEnvProbeOutput(result.output);
}
