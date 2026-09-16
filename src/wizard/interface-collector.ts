import * as vscode from 'vscode';
import { PackageFormValidator } from './package-form-validator';

export type InterfaceType = 'message' | 'service' | 'action';

export interface InterfaceDefinition {
  type: InterfaceType;
  name: string;
  definition: string;
}

const validator = new PackageFormValidator();

export function validateInterfaceName(value: string): string | null {
  return validator.validateInterfaceName(value);
}

export function validateFieldType(value: string): string | null {
  return validator.validateFieldType(value);
}

export function validateFieldName(value: string): string | null {
  return validator.validateFieldName(value);
}

export function buildDefinition(fields: string[]): string {
  return fields.join('\n');
}

export async function collectFields(sectionName: string): Promise<string[]> {
  const fields: string[] = [];

  void vscode.window.showInformationMessage(`Adding fields for ${sectionName}`);

  const addAnotherField = async (): Promise<boolean> => {
    const fieldType = await vscode.window.showInputBox({
      prompt: `Enter field type for ${sectionName}`,
      placeHolder: 'string, int32, float64, etc.',
      validateInput: validateFieldType,
    });

    if (!fieldType) {
      return false;
    }

    const fieldName = await vscode.window.showInputBox({
      prompt: `Enter field name for ${sectionName}`,
      placeHolder: 'my_field',
      validateInput: validateFieldName,
    });

    if (!fieldName) {
      return false;
    }

    fields.push(`${fieldType} ${fieldName}`);
    void vscode.window.showInformationMessage(`Added field: ${fieldType} ${fieldName}`);

    const addMoreChoice = await vscode.window.showQuickPick([
      { label: 'yes', description: 'Add another field' },
      { label: 'no', description: sectionName === 'request' || sectionName === 'goal'
        ? `Continue to ${sectionName === 'request' ? 'response' : 'feedback'} fields`
        : sectionName === 'response' || sectionName === 'feedback'
        ? sectionName === 'response' ? 'Finish service' : 'Continue to result fields'
        : 'Finish interface' },
    ], {
      placeHolder: `Add another field to ${sectionName}?`,
    });

    return addMoreChoice?.label === 'yes';
  };

  let shouldAddMore = true;
  while (shouldAddMore) {
    shouldAddMore = await addAnotherField();
  }

  return fields;
}

export async function collectInterfaceDefinition(): Promise<InterfaceDefinition | null> {
  const interfaceTypePick = await vscode.window.showQuickPick([
    { label: 'message', description: 'Message (.msg)', detail: 'Data structures for publishing/subscribing' },
    { label: 'service', description: 'Service (.srv)', detail: 'Request/response communication' },
    { label: 'action', description: 'Action (.action)', detail: 'Goal-based long-running tasks' },
  ], {
    placeHolder: 'Select interface type',
  });

  if (!interfaceTypePick) {
    return null;
  }

  const interfaceType = interfaceTypePick.label as InterfaceType;

  const name = await vscode.window.showInputBox({
    prompt: `Enter ${interfaceType} name`,
    placeHolder: `My${interfaceType.charAt(0).toUpperCase() + interfaceType.slice(1)}`,
    validateInput: validateInterfaceName,
  });

  if (!name) {
    return null;
  }

  let definition = '';

  if (interfaceType === 'message') {
    const msgFields = await collectFields('message');
    if (msgFields.length === 0) {
      void vscode.window.showWarningMessage('No fields defined for message');
      return null;
    }
    definition = buildDefinition(msgFields);
  } else if (interfaceType === 'service') {
    const reqFields = await collectFields('request');
    if (reqFields.length === 0) {
      void vscode.window.showWarningMessage('No fields defined for request');
      return null;
    }
    const respFields = await collectFields('response');
    if (respFields.length === 0) {
      void vscode.window.showWarningMessage('No fields defined for response');
      return null;
    }
    definition = `${buildDefinition(reqFields)}\n---\n${buildDefinition(respFields)}`;
  } else {
    const goalFields = await collectFields('goal');
    if (goalFields.length === 0) {
      void vscode.window.showWarningMessage('No fields defined for goal');
      return null;
    }
    const feedbackFields = await collectFields('feedback');
    if (feedbackFields.length === 0) {
      void vscode.window.showWarningMessage('No fields defined for feedback');
      return null;
    }
    const resultFields = await collectFields('result');
    if (resultFields.length === 0) {
      void vscode.window.showWarningMessage('No fields defined for result');
      return null;
    }
    definition = `${buildDefinition(goalFields)}\n---\n${buildDefinition(feedbackFields)}\n---\n${buildDefinition(resultFields)}`;
  }

  return { type: interfaceType, name, definition };
}
