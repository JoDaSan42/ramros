import { execSync } from 'child_process';

export interface TopicInfo {
  name: string;
  messageType: string;
  publishers: string[];
  subscribers: string[];
}

export interface NodeInfo {
  name: string;
  publishedTopics: string[];
  subscribedTopics: string[];
}

export interface TopicEndpointDetail {
  nodeName: string;
  nodeNamespace: string;
}

export class Ros2CliService {
  private static instance: Ros2CliService;

  static getInstance(): Ros2CliService {
    if (!Ros2CliService.instance) {
      Ros2CliService.instance = new Ros2CliService();
    }
    return Ros2CliService.instance;
  }

  private executeCommand(command: string): string[] {
    try {
      const output = execSync(command, { encoding: 'utf-8', timeout: 5000 });
      return output.split('\n').filter(line => line.trim().length > 0);
    } catch (error) {
      console.error(`Failed to execute command: ${command}`, error);
      return [];
    }
  }

  getActiveNodes(): string[] {
    return this.executeCommand('ros2 node list');
  }

  getActiveTopics(): string[] {
    return this.executeCommand('ros2 topic list');
  }

  getTopicInfo(topicName: string): TopicInfo | null {
    try {
      const output = execSync(`ros2 topic info ${topicName} --verbose`, { encoding: 'utf-8', timeout: 5000 });
      const lines = output.split('\n');

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

  getTopicPublishers(topicName: string): TopicEndpointDetail[] {
    return this.parseTopicEndpoints(topicName, 'publishers');
  }

  getTopicSubscribers(topicName: string): TopicEndpointDetail[] {
    return this.parseTopicEndpoints(topicName, 'subscribers');
  }

  private parseTopicEndpoints(topicName: string, targetSection: 'publishers' | 'subscribers'): TopicEndpointDetail[] {
    const endpoints: TopicEndpointDetail[] = [];
    try {
      const output = execSync(`ros2 topic info ${topicName} --verbose`, { encoding: 'utf-8', timeout: 5000 });
      const lines = output.split('\n');
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

  getNodeInfo(nodeName: string): NodeInfo | null {
    try {
      const publishedTopics: string[] = [];
      const subscribedTopics: string[] = [];

      const output = execSync(`ros2 node info ${nodeName}`, { encoding: 'utf-8', timeout: 5000 });
      const lines = output.split('\n');

      let section: 'none' | 'subscribers' | 'publishers' = 'none';

      for (const line of lines) {
        const trimmedLine = line.trim();

        if (trimmedLine === 'Subscribers:') {
          section = 'subscribers';
          continue;
        } else if (trimmedLine === 'Publishers:') {
          section = 'publishers';
          continue;
        } else if (trimmedLine === 'Service Servers:' || trimmedLine === 'Service Clients:' || trimmedLine === 'Action Servers:' || trimmedLine === 'Action Clients:') {
          section = 'none';
          continue;
        } else if (section !== 'none' && trimmedLine.startsWith('/')) {
          const topicName = trimmedLine.split(':')[0].trim();
          if (topicName) {
            if (section === 'publishers') {
              publishedTopics.push(topicName);
            } else if (section === 'subscribers') {
              subscribedTopics.push(topicName);
            }
          }
        }
      }

      return {
        name: nodeName,
        publishedTopics,
        subscribedTopics,
      };
    } catch (error) {
      console.error(`Failed to get info for node ${nodeName}`, error);
      return null;
    }
  }
}
