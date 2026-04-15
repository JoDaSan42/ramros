import * as fs from 'fs';
import {
  ParameterInfo,
  TopicEndpointInfo,
  ServiceInfo,
  ActionInfo,
} from './package-discovery';

export interface NodeAnalysisResult {
  parameters?: ParameterInfo[];
  publishers?: TopicEndpointInfo[];
  subscriptions?: TopicEndpointInfo[];
  serviceServers?: ServiceInfo[];
  serviceClients?: ServiceInfo[];
  actionServers?: ActionInfo[];
  actionClients?: ActionInfo[];
}

const CPP_PUBLISHER_PATTERN = /create_publisher\s*<\s*([^>]+)>\s*\(\s*["']([^"']+)["']/g;
const CPP_SUBSCRIPTION_PATTERN = /create_subscription\s*<\s*([^>]+)>\s*\(\s*["']([^"']+)["']/g;
const CPP_PARAMETER_PATTERN = /declare_parameter\s*\(\s*["']([^"']+)["']\s*(?:,\s*([^)]+))?/g;
const CPP_SERVICE_SERVER_PATTERN = /create_service\s*<\s*([^>]+)>\s*\(\s*["']([^"']+)["']/g;
const CPP_ACTION_SERVER_PATTERN = /create_action_server\s*<\s*([^>]+)>\s*\(\s*["']([^"']+)["']/g;

const PYTHON_PUBLISHER_PATTERN = /create_publisher\s*\(\s*([^,]+),\s*["']([^"']+)["']/g;
const PYTHON_SUBSCRIPTION_PATTERN = /create_subscription\s*\(\s*([^,]+),\s*["']([^"']+)["']/g;
const PYTHON_PARAMETER_PATTERN = /declare_parameter\s*\(['"]([^'"]+)['"]\s*(?:,\s*([^)]+))?/g;
const PYTHON_SERVICE_SERVER_PATTERN = /create_service\s*\(\s*([^,]+),\s*['"]([^'"]+)['"]/g;
const PYTHON_ACTION_SERVER_PATTERN = /create_action_server\s*\(\s*([^,]+),\s*['"]([^'"]+)['"]/g;

export async function analyzeCppNode(filePath: string): Promise<NodeAnalysisResult> {
  if (!fs.existsSync(filePath)) {
    return {};
  }

  const content = fs.readFileSync(filePath, 'utf-8');
  const result: NodeAnalysisResult = {};

  const publishers: TopicEndpointInfo[] = [];
  let match: RegExpExecArray | null;

  const publisherRegex = new RegExp(CPP_PUBLISHER_PATTERN.source, 'g');
  while ((match = publisherRegex.exec(content)) !== null) {
    publishers.push({
      messageType: match[1].trim(),
      topicName: match[2],
    });
  }
  if (publishers.length > 0) {
    result.publishers = publishers;
  }

  const subscriptions: TopicEndpointInfo[] = [];
  const subscriptionRegex = new RegExp(CPP_SUBSCRIPTION_PATTERN.source, 'g');
  while ((match = subscriptionRegex.exec(content)) !== null) {
    subscriptions.push({
      messageType: match[1].trim(),
      topicName: match[2],
    });
  }
  if (subscriptions.length > 0) {
    result.subscriptions = subscriptions;
  }

  const parameters: ParameterInfo[] = [];
  const paramRegex = new RegExp(CPP_PARAMETER_PATTERN.source, 'g');
  while ((match = paramRegex.exec(content)) !== null) {
    parameters.push({
      name: match[1],
      defaultValue: match[2]?.trim().replace(/^["']|["']$/g, ''),
    });
  }
  if (parameters.length > 0) {
    result.parameters = parameters;
  }

  const serviceServers: ServiceInfo[] = [];
  const serviceRegex = new RegExp(CPP_SERVICE_SERVER_PATTERN.source, 'g');
  while ((match = serviceRegex.exec(content)) !== null) {
    serviceServers.push({
      name: match[2],
      serviceType: match[1].trim(),
    });
  }
  if (serviceServers.length > 0) {
    result.serviceServers = serviceServers;
  }

  const actionServers: ActionInfo[] = [];
  const actionRegex = new RegExp(CPP_ACTION_SERVER_PATTERN.source, 'g');
  while ((match = actionRegex.exec(content)) !== null) {
    actionServers.push({
      name: match[2],
      actionType: match[1].trim(),
    });
  }
  if (actionServers.length > 0) {
    result.actionServers = actionServers;
  }

  return result;
}

export async function analyzePythonNode(filePath: string): Promise<NodeAnalysisResult> {
  if (!fs.existsSync(filePath)) {
    return {};
  }

  const content = fs.readFileSync(filePath, 'utf-8');
  const result: NodeAnalysisResult = {};

  const publishers: TopicEndpointInfo[] = [];
  let match: RegExpExecArray | null;

  const publisherRegex = new RegExp(PYTHON_PUBLISHER_PATTERN.source, 'g');
  while ((match = publisherRegex.exec(content)) !== null) {
    const msgType = match[1].trim().replace(/\s*\([^)]*\)\s*$/, '');
    publishers.push({
      messageType: msgType,
      topicName: match[2],
    });
  }
  if (publishers.length > 0) {
    result.publishers = publishers;
  }

  const subscriptions: TopicEndpointInfo[] = [];
  const subscriptionRegex = new RegExp(PYTHON_SUBSCRIPTION_PATTERN.source, 'g');
  while ((match = subscriptionRegex.exec(content)) !== null) {
    const msgType = match[1].trim().replace(/\s*\([^)]*\)\s*$/, '');
    subscriptions.push({
      messageType: msgType,
      topicName: match[2],
    });
  }
  if (subscriptions.length > 0) {
    result.subscriptions = subscriptions;
  }

  const parameters: ParameterInfo[] = [];
  const paramRegex = new RegExp(PYTHON_PARAMETER_PATTERN.source, 'g');
  while ((match = paramRegex.exec(content)) !== null) {
    let defaultValue: string | undefined;
    if (match[2]) {
      defaultValue = match[2].trim();
      if (defaultValue.startsWith("'") || defaultValue.startsWith('"')) {
        defaultValue = defaultValue.slice(1, -1);
      }
    }
    parameters.push({
      name: match[1],
      defaultValue,
    });
  }
  if (parameters.length > 0) {
    result.parameters = parameters;
  }

  const serviceServers: ServiceInfo[] = [];
  const serviceRegex = new RegExp(PYTHON_SERVICE_SERVER_PATTERN.source, 'g');
  while ((match = serviceRegex.exec(content)) !== null) {
    const msgType = match[1].trim().replace(/\s*\([^)]*\)\s*$/, '');
    serviceServers.push({
      name: match[2],
      serviceType: msgType,
    });
  }
  if (serviceServers.length > 0) {
    result.serviceServers = serviceServers;
  }

  const actionServers: ActionInfo[] = [];
  const actionRegex = new RegExp(PYTHON_ACTION_SERVER_PATTERN.source, 'g');
  while ((match = actionRegex.exec(content)) !== null) {
    const msgType = match[1].trim().replace(/\s*\([^)]*\)\s*$/, '');
    actionServers.push({
      name: match[2],
      actionType: msgType,
    });
  }
  if (actionServers.length > 0) {
    result.actionServers = actionServers;
  }

  return result;
}
