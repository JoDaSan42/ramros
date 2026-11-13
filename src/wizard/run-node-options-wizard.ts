import * as vscode from 'vscode';
import { NodeInfo, ParameterInfo } from '../core/package-discovery';
import { ParameterCoercer } from '../core/parameter-coercer';
import { PackageFormValidator } from './package-form-validator';
import { RunParameter, RunRemap } from '../core/run-args-builder';

export interface RunNodeOptions {
  parameters: RunParameter[];
  remaps: RunRemap[];
  nodeName?: string;
}

const CUSTOM_PARAMETER_TYPES = ['string', 'int', 'float', 'bool', 'string[]', 'int[]', 'float[]', 'bool[]'];

interface ParameterPickItem {
  label: string;
  description?: string;
  /** Existing declared parameter, when this row is one. */
  parameter?: ParameterInfo;
  /** Marks the "add custom parameter" action row. */
  isCustom?: boolean;
  /** Marks the "skip parameters" action row. */
  isSkip?: boolean;
}

interface RemapPickItem {
  label: string;
  isAdd?: boolean;
  isDone?: boolean;
}

/**
 * Wizard collecting run options for a node: parameter values (declared +
 * custom), an optional node rename and topic remaps. Resolves `undefined`
 * when the user aborts at any prompt — nothing starts in that case.
 */
export async function runNodeOptionsWizard(node: NodeInfo): Promise<RunNodeOptions | undefined> {
  const validator = new PackageFormValidator();

  // --- Parameters ---
  const parameterPicks: ParameterPickItem[] = (node.parameters ?? []).map(param => ({
    label: param.name,
    description: `${param.type ?? 'unspecified'}${param.defaultValue !== undefined ? ` = ${param.defaultValue}` : ''}`,
    parameter: param,
  }));
  parameterPicks.push({ label: 'Add custom parameter…', isCustom: true });
  parameterPicks.push({ label: 'Skip parameters', isSkip: true });

  const chosen = await vscode.window.showQuickPick(parameterPicks, {
    placeHolder: 'Select parameters to set (Esc aborts the wizard)',
    canPickMany: true,
  });
  if (chosen === undefined) {
    return undefined;
  }

  const parameters: RunParameter[] = [];

  // Declared parameters: prompt a value each, prefilled with the default.
  for (const item of chosen) {
    if (!item.parameter) {
      continue;
    }
    const type = item.parameter.type;
    const value = await vscode.window.showInputBox({
      prompt: `Value for ${item.parameter.name}${type ? ` (${type})` : ''}`,
      value: item.parameter.defaultValue ?? '',
      validateInput: value => ParameterCoercer.validate(value, type),
    });
    if (value === undefined) {
      return undefined;
    }
    parameters.push({ name: item.parameter.name, value: value.trim(), type });
  }

  // Custom parameter (single one per wizard run keeps the flow simple).
  if (chosen.some(item => item.isCustom)) {
    const name = await vscode.window.showInputBox({
      prompt: 'Custom parameter name',
      placeHolder: 'my_parameter',
      validateInput: value => {
        const trimmed = (value ?? '').trim();
        if (trimmed.length === 0) {
          return 'Parameter name cannot be empty';
        }
        if (/\s/.test(trimmed)) {
          return 'Parameter name cannot contain whitespace';
        }
        return undefined;
      },
    });
    if (name === undefined) {
      return undefined;
    }
    const type = await vscode.window.showQuickPick(CUSTOM_PARAMETER_TYPES, {
      placeHolder: 'Parameter type',
    });
    if (type === undefined) {
      return undefined;
    }
    const value = await vscode.window.showInputBox({
      prompt: `Value for ${name.trim()} (${type})`,
      validateInput: v => ParameterCoercer.validate(v, type),
    });
    if (value === undefined) {
      return undefined;
    }
    parameters.push({ name: name.trim(), value: value.trim(), type });
  }

  // --- Node name (unchanged prefill = keep name, no __node remap) ---
  const nodeName = await vscode.window.showInputBox({
    prompt: 'Node name (confirm to keep, edit to rename the running node)',
    value: node.name,
    validateInput: value => {
      if (value === node.name) {
        return undefined; // unchanged prefill is always valid
      }
      return validator.validateNodeNameInput(value);
    },
  });
  if (nodeName === undefined) {
    return undefined;
  }
  const renamed = nodeName !== node.name ? nodeName : undefined;

  // --- Remaps ---
  // Offer the node's statically analyzed endpoints as remap sources so the
  // user does not have to remember exact original names. Works for Python
  // and C++ nodes alike (both run static source analysis).
  const remaps = await collectRemaps(node);
  if (remaps === undefined) {
    return undefined;
  }

  return { parameters, remaps, nodeName: renamed };
}

/**
 * Builds remap source suggestions from statically analyzed node endpoints:
 * published/subscribed topics first, then service and action names. Each
 * suggestion is labeled with its kind and message/service type.
 */
export function buildRemapSuggestions(node: NodeInfo): Array<{ label: string; description?: string; name: string }> {
  const suggestions: Array<{ label: string; description?: string; name: string }> = [];

  for (const pub of node.publishers ?? []) {
    suggestions.push({ label: pub.topicName, description: `publisher • ${pub.messageType}`, name: pub.topicName });
  }
  for (const sub of node.subscriptions ?? []) {
    suggestions.push({ label: sub.topicName, description: `subscription • ${sub.messageType}`, name: sub.topicName });
  }
  for (const srv of node.serviceServers ?? []) {
    suggestions.push({ label: srv.name, description: `service server • ${srv.serviceType}`, name: srv.name });
  }
  for (const client of node.serviceClients ?? []) {
    suggestions.push({ label: client.name, description: `service client • ${client.serviceType}`, name: client.name });
  }
  for (const action of node.actionServers ?? []) {
    suggestions.push({ label: action.name, description: `action server • ${action.actionType}`, name: action.name });
  }
  for (const action of node.actionClients ?? []) {
    suggestions.push({ label: action.name, description: `action client • ${action.actionType}`, name: action.name });
  }

  return suggestions;
}

async function collectRemaps(node: NodeInfo): Promise<Array<{ from: string; to: string }> | undefined> {
  const remaps: RunRemap[] = [];
  const suggestions = buildRemapSuggestions(node);

  for (;;) {
    // With known endpoints: pick the source from a list, plus a free-entry row.
    // Without: plain add/done loop as before.
    const action = await vscode.window.showQuickPick<RemapPickItem>(
      [
        { label: 'Add remap', isAdd: true },
        { label: 'Done', isDone: true },
      ],
      { placeHolder: remaps.length > 0 ? 'Add another topic remap?' : 'Add topic remaps? (-r from:=to)' }
    );
    if (action === undefined) {
      return undefined;
    }
    if (action.isDone) {
      return remaps;
    }
    const from = await promptRemapSource(suggestions);
    if (from === undefined) {
      return undefined;
    }
    const to = await vscode.window.showInputBox({
      prompt: 'Remap target (to)',
      placeHolder: '/new/topic_or_name',
      validateInput: validateRemapName,
    });
    if (to === undefined) {
      return undefined;
    }
    remaps.push({ from: from.trim(), to: to.trim() });
  }
}

/**
 * Remap source prompt: quick pick from the node's analyzed endpoints when
 * available (with a free-entry row), raw input box otherwise.
 */
async function promptRemapSource(
  suggestions: Array<{ label: string; description?: string; name: string }>
): Promise<string | undefined> {
  if (suggestions.length === 0) {
    return vscode.window.showInputBox({
      prompt: 'Remap source (from)',
      placeHolder: '/original/topic_or_name',
      validateInput: validateRemapName,
    });
  }

  interface SourcePickItem {
    label: string;
    description?: string;
    isFreeEntry?: boolean;
  }

  const picked = await vscode.window.showQuickPick<SourcePickItem>(
    [
      ...suggestions.map(s => ({ label: s.label, description: s.description })),
      { label: 'Enter manually…', isFreeEntry: true },
    ],
    { placeHolder: 'Remap source — pick an endpoint of this node or enter manually' }
  );
  if (picked === undefined) {
    return undefined;
  }
  if (!picked.isFreeEntry) {
    return picked.label;
  }
  return vscode.window.showInputBox({
    prompt: 'Remap source (from)',
    placeHolder: '/original/topic_or_name',
    validateInput: validateRemapName,
  });
}

function validateRemapName(value: string): string | undefined {
  const trimmed = (value ?? '').trim();
  if (trimmed.length === 0) {
    return 'Value cannot be empty';
  }
  if (/\s/.test(trimmed)) {
    return 'Value cannot contain whitespace';
  }
  return undefined;
}
