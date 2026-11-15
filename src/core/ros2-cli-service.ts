import { exec } from 'child_process';
import { promisify } from 'util';
import { buildServiceCallCommand, shellDoubleQuote } from './command-builders';

const execAsync = promisify(exec);

export interface TopicInfo {
  name: string;
  messageType: string;
  publishers: string[];
  subscribers: string[];
}

export interface ServiceServerInfo {
  name: string;
  type?: string;
}

export interface NodeInfo {
  name: string;
  publishedTopics: string[];
  subscribedTopics: string[];
  serviceServers?: ServiceServerInfo[];
  actionServers?: ServiceServerInfo[];
}

export interface TopicEndpointDetail {
  nodeName: string;
  nodeNamespace: string;
}

export interface ParsedNodeInfoOutput {
  publishedTopics: string[];
  subscribedTopics: string[];
  serviceServers: ServiceServerInfo[];
  actionServers: ServiceServerInfo[];
}

export function parseNodeInfoOutput(stdout: string): ParsedNodeInfoOutput {
  const publishedTopics: string[] = [];
  const subscribedTopics: string[] = [];
  const serviceServers: ServiceServerInfo[] = [];
  const actionServers: ServiceServerInfo[] = [];

  const lines = stdout.split('\n');

  let section: 'none' | 'subscribers' | 'publishers' | 'service-servers' | 'action-servers' = 'none';

  for (const line of lines) {
    const trimmedLine = line.trim();

    if (trimmedLine === 'Subscribers:') {
      section = 'subscribers';
      continue;
    } else if (trimmedLine === 'Publishers:') {
      section = 'publishers';
      continue;
    } else if (trimmedLine === 'Service Servers:') {
      section = 'service-servers';
      continue;
    } else if (trimmedLine === 'Action Servers:') {
      section = 'action-servers';
      continue;
    } else if (trimmedLine === 'Service Clients:' || trimmedLine === 'Action Clients:') {
      section = 'none';
      continue;
    } else if (section !== 'none' && trimmedLine.startsWith('/')) {
      const name = trimmedLine.split(':')[0].trim();
      if (!name) {
        continue;
      }
      if (section === 'publishers') {
        publishedTopics.push(name);
      } else if (section === 'subscribers') {
        subscribedTopics.push(name);
      } else if (section === 'service-servers') {
        const typeMatch = trimmedLine.match(/^[^:]*:\s*(.+)$/);
        const type = typeMatch ? typeMatch[1].trim() : undefined;
        serviceServers.push({ name, type: type || undefined });
      } else if (section === 'action-servers') {
        const typeMatch = trimmedLine.match(/^[^:]*:\s*(.+)$/);
        const type = typeMatch ? typeMatch[1].trim() : undefined;
        actionServers.push({ name, type: type || undefined });
      }
    }
  }

  return { publishedTopics, subscribedTopics, serviceServers, actionServers };
}

export function parseParameterList(stdout: string, nodeName: string): string[] {
  const parameters: string[] = [];
  const lines = stdout.split('\n');
  let seenContent = false;

  for (const line of lines) {
    const trimmedLine = line.trim();
    if (!trimmedLine) {
      continue;
    }
    if (!seenContent) {
      seenContent = true;
      if (trimmedLine === nodeName) {
        continue;
      }
    }
    if (trimmedLine.endsWith(':')) {
      continue;
    }
    parameters.push(trimmedLine);
  }

  return parameters;
}

export function parseParameterValue(stdout: string): string | null {
  const lines = stdout.split('\n');
  let value: string | null = null;

  for (const line of lines) {
    const match = line.match(/value is:\s*(.+)$/);
    if (match && match[1]) {
      value = match[1].trim();
    }
  }

  return value;
}

export function parseParameterType(stdout: string): string | null {
  const match = stdout.match(/^(Integer|Double|String|Boolean|Byte array|Byte) value is:/m);
  if (!match) return null;
  const type = match[1];
  switch (type) {
    case 'Integer': return 'integer';
    case 'Double': return 'double';
    case 'String': return 'string';
    case 'Boolean': return 'bool';
    case 'Byte array': return 'bytearray';
    case 'Byte': return 'byte';
    default: return null;
  }
}

export function validateParameterValue(value: string, paramType: string | null): string | undefined {
  if (!paramType) return undefined;
  const trimmed = value.trim();
  switch (paramType) {
    case 'integer':
      if (!/^-?\d+$/.test(trimmed)) return 'Value must be an integer';
      return undefined;
    case 'double':
      if (!/^-?\d+(\.\d+)?$/.test(trimmed)) return 'Value must be a number';
      return undefined;
    case 'bool':
      if (trimmed.toLowerCase() !== 'true' && trimmed.toLowerCase() !== 'false') return 'Value must be true or false';
      return undefined;
    case 'string':
      if (trimmed.length === 0) return 'Value must not be empty';
      return undefined;
    case 'byte':
    case 'bytearray':
      if (!/^\[\s*-?\d+(\s*,\s*-?\d+)*\s*\]$/.test(trimmed)) return 'Value must be a byte array like [1, 2, 3]';
      return undefined;
    default:
      return undefined;
  }
}

export class Ros2CliService {
  private static instance: Ros2CliService;
  private domainId?: number;

  static getInstance(): Ros2CliService {
    if (!Ros2CliService.instance) {
      Ros2CliService.instance = new Ros2CliService();
    }
    return Ros2CliService.instance;
  }

  /**
   * Sets the ROS_DOMAIN_ID injected into every ros2 exec. `undefined` leaves
   * the environment untouched (no ROS_DOMAIN_ID key).
   */
  setDomainId(domainId: number | undefined): void {
    // Reject non-integer values from settings before they reach any
    // environment or shell command line.
    this.domainId = Number.isInteger(domainId) ? domainId : undefined;
  }

  getDomainId(): number | undefined {
    return this.domainId;
  }

  /**
   * Environment for exec calls: current environment plus ROS_DOMAIN_ID when
   * a domain is set. An explicit domain override wins over the global
   * default and travels with the options, so concurrent calls with different
   * domains cannot mislabel each other.
   */
  private buildEnv(overrides?: Record<string, string>): NodeJS.ProcessEnv {
    const env: NodeJS.ProcessEnv = { ...process.env };
    if (this.domainId !== undefined) {
      env.ROS_DOMAIN_ID = String(this.domainId);
    }
    if (overrides) {
      Object.assign(env, overrides);
    }
    return env;
  }

  /** Options shared by all exec calls: env injection + bash shell. */
  private execOptions(timeout?: number, domainOverride?: number): { encoding: 'utf-8'; timeout?: number; env: NodeJS.ProcessEnv; shell: string } {
    return {
      encoding: 'utf-8',
      timeout,
      env: this.buildEnv(domainOverride !== undefined ? { ROS_DOMAIN_ID: String(domainOverride) } : undefined),
      // Hidden execs source ROS setup.bash scripts, which use bash features
      // (they fail with "Bad substitution" under dash, the /bin/sh on Ubuntu).
      shell: '/bin/bash'
    };
  }

  private async executeCommand(command: string): Promise<string[]> {
    try {
      const { stdout } = await execAsync(command, this.execOptions(5000));
      return stdout.split('\n').filter(line => line.trim().length > 0);
    } catch (error) {
      console.error(`Failed to execute command: ${command}`, error);
      return [];
    }
  }

  /** executeCommand with an explicit domain; see execOptions. */
  private async executeCommandForDomain(command: string, domainId: number): Promise<string[]> {
    try {
      const { stdout } = await execAsync(command, this.execOptions(5000, domainId));
      return stdout.split('\n').filter(line => line.trim().length > 0);
    } catch (error) {
      console.error(`Failed to execute command: ${command}`, error);
      return [];
    }
  }

  /**
   * Runs a raw ros2 command and returns its non-empty stdout lines. Central
   * entry point for commands that live outside this service's own methods
   * (e.g. topic picks in extension.ts) so they inherit the env injection.
   */
  async executeLines(command: string): Promise<string[]> {
    return this.executeCommand(command);
  }

  /**
   * Runs a raw command (stdout or combined stdout+stderr) and returns the
   * output plus a success flag. For ros2 commands that live outside this
   * service's dedicated methods (bag info, interface show, doctor) so they
   * inherit the env injection. Errors are NOT swallowed: the caller decides
   * how to present them.
   */
  async executeRaw(command: string, options?: { timeout?: number }): Promise<{ output: string; ok: boolean; stderr?: string }> {
    try {
      const { stdout, stderr } = await execAsync(command, this.execOptions(options?.timeout));
      return { output: stdout, ok: true, stderr };
    } catch (error) {
      const err = error as Error & { stdout?: string; stderr?: string };
      return { output: err.stdout ?? '', ok: false, stderr: err.stderr ?? '' };
    }
  }

  async getActiveNodes(): Promise<string[]> {
    return this.executeCommand('ros2 node list');
  }

  async getActiveTopics(): Promise<string[]> {
    return this.executeCommand('ros2 topic list');
  }

  /**
   * Lists active nodes in a specific domain, regardless of the global
   * default set via setDomainId. The domain travels with the exec options,
   * so concurrent calls with different domains stay isolated.
   */
  async getActiveNodesForDomain(domainId: number): Promise<string[]> {
    return this.executeCommandForDomain('ros2 node list', domainId);
  }

  /**
   * Lists active topics in a specific domain. See getActiveNodesForDomain.
   */
  async getActiveTopicsForDomain(domainId: number): Promise<string[]> {
    return this.executeCommandForDomain('ros2 topic list', domainId);
  }

  async getTopicInfo(topicName: string): Promise<TopicInfo | null> {
    return this.fetchTopicInfo(topicName);
  }

  /**
   * Topic details (type, publishers, subscribers) in a specific domain,
   * regardless of the global default set via setDomainId.
   */
  async getTopicInfoForDomain(topicName: string, domainId: number): Promise<TopicInfo | null> {
    return this.fetchTopicInfo(topicName, domainId);
  }

  private async fetchTopicInfo(topicName: string, domainId?: number): Promise<TopicInfo | null> {
    try {
      const { stdout } = await execAsync(`ros2 topic info ${topicName} --verbose`, this.execOptions(5000, domainId));
      const lines = stdout.split('\n');

      let messageType = '';
      const publishers: string[] = [];
      const subscribers: string[] = [];

      let section: 'none' | 'publishers' | 'subscribers' = 'none';

      for (const line of lines) {
        const trimmedLine = line.trim();

        if (trimmedLine.startsWith('Type:')) {
          const match = trimmedLine.match(/Type:\s+(.+)/);
          if (match && match[1]) {
            messageType = match[1].trim();
          }
        } else if (trimmedLine.startsWith('Publisher count:')) {
          section = 'publishers';
          continue;
        } else if (trimmedLine.startsWith('Subscription count:')) {
          section = 'subscribers';
          continue;
        } else if (trimmedLine.startsWith('Node name:') && section === 'publishers') {
          const nodeName = trimmedLine.replace('Node name:', '').trim();
          if (nodeName) {
            publishers.push(nodeName);
          }
        } else if (trimmedLine.startsWith('Node name:') && section === 'subscribers') {
          const nodeName = trimmedLine.replace('Node name:', '').trim();
          if (nodeName) {
            subscribers.push(nodeName);
          }
        } else if (trimmedLine.startsWith('Endpoint type:')) {
          continue;
        } else if (trimmedLine === '') {
          continue;
        }
      }

      return {
        name: topicName,
        messageType,
        publishers,
        subscribers,
      };
    } catch (error) {
      console.error(`Failed to get info for topic ${topicName}`, error);
      return null;
    }
  }

  async getTopicPublishers(topicName: string): Promise<TopicEndpointDetail[]> {
    return this.parseTopicEndpoints(topicName, 'publishers');
  }

  async getTopicSubscribers(topicName: string): Promise<TopicEndpointDetail[]> {
    return this.parseTopicEndpoints(topicName, 'subscribers');
  }

  private async parseTopicEndpoints(topicName: string, targetSection: 'publishers' | 'subscribers'): Promise<TopicEndpointDetail[]> {
    const endpoints: TopicEndpointDetail[] = [];
    try {
      const { stdout } = await execAsync(`ros2 topic info ${topicName} --verbose`, this.execOptions(5000));
      const lines = stdout.split('\n');
      let section: 'none' | 'publishers' | 'subscribers' = 'none';

      for (const line of lines) {
        const trimmedLine = line.trim();

        if (trimmedLine.startsWith('Publisher count:')) {
          section = 'publishers';
          continue;
        } else if (trimmedLine.startsWith('Subscription count:')) {
          section = 'subscribers';
          continue;
        } else if (section === targetSection && trimmedLine.startsWith('Node name:')) {
          const nodeName = trimmedLine.replace('Node name:', '').trim();
          if (nodeName) {
            endpoints.push({ nodeName, nodeNamespace: '' });
          }
        }
      }
    } catch (error) {
      console.error(`Failed to get ${targetSection} for ${topicName}`, error);
    }
    return endpoints;
  }

  async getNodeInfo(nodeName: string): Promise<NodeInfo | null> {
    return this.fetchNodeInfo(nodeName);
  }

  /**
   * Node details (topics, services, actions) in a specific domain,
   * regardless of the global default set via setDomainId.
   */
  async getNodeInfoForDomain(nodeName: string, domainId: number): Promise<NodeInfo | null> {
    return this.fetchNodeInfo(nodeName, domainId);
  }

  private async fetchNodeInfo(nodeName: string, domainId?: number): Promise<NodeInfo | null> {
    try {
      const { stdout } = await execAsync(`ros2 node info ${nodeName}`, this.execOptions(5000, domainId));
      const parsed = parseNodeInfoOutput(stdout);

      return {
        name: nodeName,
        publishedTopics: parsed.publishedTopics,
        subscribedTopics: parsed.subscribedTopics,
        serviceServers: parsed.serviceServers,
        actionServers: parsed.actionServers,
      };
    } catch (error) {
      console.error(`Failed to get info for node ${nodeName}`, error);
      return null;
    }
  }

  async getTopicType(topicName: string): Promise<string | null> {
    try {
      const { stdout } = await execAsync(`ros2 topic type ${topicName}`, this.execOptions(5000));
      const firstLine = stdout.split('\n').find(line => line.trim().length > 0);
      return firstLine ? firstLine.trim() : null;
    } catch (error) {
      console.error(`Failed to get type for topic ${topicName}`, error);
      return null;
    }
  }

  async getServiceType(serviceName: string): Promise<string | null> {
    try {
      const { stdout } = await execAsync(`ros2 service type ${serviceName}`, this.execOptions(5000));
      const firstLine = stdout.split('\n').find(line => line.trim().length > 0);
      return firstLine ? firstLine.trim() : null;
    } catch (error) {
      console.error(`Failed to get type for service ${serviceName}`, error);
      return null;
    }
  }

  async getParameterNames(nodeName: string): Promise<string[]> {
    try {
      const { stdout } = await execAsync(`ros2 param list ${nodeName}`, this.execOptions(5000));
      return parseParameterList(stdout, nodeName);
    } catch (error) {
      console.error(`Failed to get parameters for node ${nodeName}`, error);
      return [];
    }
  }

  async getParameterValue(nodeName: string, paramName: string): Promise<string | null> {
    try {
      const { stdout } = await execAsync(`ros2 param get ${shellDoubleQuote(nodeName)} ${shellDoubleQuote(paramName)}`, this.execOptions(5000));
      return parseParameterValue(stdout);
    } catch (error) {
      console.error(`Failed to get parameter ${paramName} for node ${nodeName}`, error);
      return null;
    }
  }

  async getParameterValueWithType(nodeName: string, paramName: string): Promise<{ value: string | null; type: string | null }> {
    try {
      const { stdout } = await execAsync(`ros2 param get ${shellDoubleQuote(nodeName)} ${shellDoubleQuote(paramName)}`, this.execOptions(5000));
      return { value: parseParameterValue(stdout), type: parseParameterType(stdout) };
    } catch (error) {
      console.error(`Failed to get parameter ${paramName} for node ${nodeName}`, error);
      return { value: null, type: null };
    }
  }

  async setParameterValue(nodeName: string, paramName: string, value: string): Promise<boolean> {
    try {
      await execAsync(`ros2 param set ${shellDoubleQuote(nodeName)} ${shellDoubleQuote(paramName)} ${shellDoubleQuote(value)}`, this.execOptions(10000));
      return true;
    } catch (error) {
      console.error(`Failed to set parameter ${paramName} for node ${nodeName}`, error);
      return false;
    }
  }

  async callService(serviceName: string, serviceType: string, json: string): Promise<string | null> {
    try {
      const { stdout } = await execAsync(buildServiceCallCommand(serviceName, serviceType, json), this.execOptions(30000));
      return stdout;
    } catch (error) {
      console.error(`Failed to call service ${serviceName}`, error);
      return null;
    }
  }
}
