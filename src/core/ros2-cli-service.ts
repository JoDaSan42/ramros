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
}

export interface TopicEndpointDetail {
  nodeName: string;
  nodeNamespace: string;
}

export interface ParsedNodeInfoOutput {
  publishedTopics: string[];
  subscribedTopics: string[];
  serviceServers: ServiceServerInfo[];
}

export function parseNodeInfoOutput(stdout: string): ParsedNodeInfoOutput {
  const publishedTopics: string[] = [];
  const subscribedTopics: string[] = [];
  const serviceServers: ServiceServerInfo[] = [];

  const lines = stdout.split('\n');

  let section: 'none' | 'subscribers' | 'publishers' | 'service-servers' = 'none';

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
    } else if (trimmedLine === 'Service Clients:' || trimmedLine === 'Action Servers:' || trimmedLine === 'Action Clients:') {
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
      }
    }
  }

  return { publishedTopics, subscribedTopics, serviceServers };
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

  static getInstance(): Ros2CliService {
    if (!Ros2CliService.instance) {
      Ros2CliService.instance = new Ros2CliService();
    }
    return Ros2CliService.instance;
  }

  private async executeCommand(command: string): Promise<string[]> {
    try {
      const { stdout } = await execAsync(command, { encoding: 'utf-8', timeout: 5000 });
      return stdout.split('\n').filter(line => line.trim().length > 0);
    } catch (error) {
      console.error(`Failed to execute command: ${command}`, error);
      return [];
    }
  }

  async getActiveNodes(): Promise<string[]> {
    return this.executeCommand('ros2 node list');
  }

  async getActiveTopics(): Promise<string[]> {
    return this.executeCommand('ros2 topic list');
  }

  async getTopicInfo(topicName: string): Promise<TopicInfo | null> {
    try {
      const { stdout } = await execAsync(`ros2 topic info ${topicName} --verbose`, { encoding: 'utf-8', timeout: 5000 });
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
      const { stdout } = await execAsync(`ros2 topic info ${topicName} --verbose`, { encoding: 'utf-8', timeout: 5000 });
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
    try {
      const { stdout } = await execAsync(`ros2 node info ${nodeName}`, { encoding: 'utf-8', timeout: 5000 });
      const parsed = parseNodeInfoOutput(stdout);

      return {
        name: nodeName,
        publishedTopics: parsed.publishedTopics,
        subscribedTopics: parsed.subscribedTopics,
        serviceServers: parsed.serviceServers,
      };
    } catch (error) {
      console.error(`Failed to get info for node ${nodeName}`, error);
      return null;
    }
  }

  async getTopicType(topicName: string): Promise<string | null> {
    try {
      const { stdout } = await execAsync(`ros2 topic type ${topicName}`, { encoding: 'utf-8', timeout: 5000 });
      const firstLine = stdout.split('\n').find(line => line.trim().length > 0);
      return firstLine ? firstLine.trim() : null;
    } catch (error) {
      console.error(`Failed to get type for topic ${topicName}`, error);
      return null;
    }
  }

  async getServiceType(serviceName: string): Promise<string | null> {
    try {
      const { stdout } = await execAsync(`ros2 service type ${serviceName}`, { encoding: 'utf-8', timeout: 5000 });
      const firstLine = stdout.split('\n').find(line => line.trim().length > 0);
      return firstLine ? firstLine.trim() : null;
    } catch (error) {
      console.error(`Failed to get type for service ${serviceName}`, error);
      return null;
    }
  }

  async getParameterNames(nodeName: string): Promise<string[]> {
    try {
      const { stdout } = await execAsync(`ros2 param list ${nodeName}`, { encoding: 'utf-8', timeout: 5000 });
      return parseParameterList(stdout, nodeName);
    } catch (error) {
      console.error(`Failed to get parameters for node ${nodeName}`, error);
      return [];
    }
  }

  async getParameterValue(nodeName: string, paramName: string): Promise<string | null> {
    try {
      const { stdout } = await execAsync(`ros2 param get ${shellDoubleQuote(nodeName)} ${shellDoubleQuote(paramName)}`, { encoding: 'utf-8', timeout: 5000 });
      return parseParameterValue(stdout);
    } catch (error) {
      console.error(`Failed to get parameter ${paramName} for node ${nodeName}`, error);
      return null;
    }
  }

  async getParameterValueWithType(nodeName: string, paramName: string): Promise<{ value: string | null; type: string | null }> {
    try {
      const { stdout } = await execAsync(`ros2 param get ${shellDoubleQuote(nodeName)} ${shellDoubleQuote(paramName)}`, { encoding: 'utf-8', timeout: 5000 });
      return { value: parseParameterValue(stdout), type: parseParameterType(stdout) };
    } catch (error) {
      console.error(`Failed to get parameter ${paramName} for node ${nodeName}`, error);
      return { value: null, type: null };
    }
  }

  async setParameterValue(nodeName: string, paramName: string, value: string): Promise<boolean> {
    try {
      await execAsync(`ros2 param set ${shellDoubleQuote(nodeName)} ${shellDoubleQuote(paramName)} ${shellDoubleQuote(value)}`, { encoding: 'utf-8', timeout: 10000 });
      return true;
    } catch (error) {
      console.error(`Failed to set parameter ${paramName} for node ${nodeName}`, error);
      return false;
    }
  }

  async callService(serviceName: string, serviceType: string, json: string): Promise<string | null> {
    try {
      const { stdout } = await execAsync(buildServiceCallCommand(serviceName, serviceType, json), { encoding: 'utf-8', timeout: 30000 });
      return stdout;
    } catch (error) {
      console.error(`Failed to call service ${serviceName}`, error);
      return null;
    }
  }
}
