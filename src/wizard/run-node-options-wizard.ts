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
  const remaps: RunRemap[] = [];
  for (;;) {
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
      break;
    }
    const from = await vscode.window.showInputBox({
      prompt: 'Remap source (from)',
      placeHolder: '/original/topic_or_name',
      validateInput: validateRemapName,
    });
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

  return { parameters, remaps, nodeName: renamed };
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
