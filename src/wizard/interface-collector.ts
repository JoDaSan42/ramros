import * as vscode from 'vscode';

export type InterfaceType = 'message' | 'service' | 'action';

export interface InterfaceDefinition {
  type: InterfaceType;
  name: string;
  definition: string;
}

const VALID_FIELD_TYPES = [
  'bool', 'byte', 'char',
  'float32', 'float64',
  'int8', 'uint8', 'int16', 'uint16', 'int32', 'uint32', 'int64', 'uint64',
  'string', 'wstring',
];

export function validateInterfaceName(value: string): string | null {
  if (!value || value.trim().length === 0) {
    return 'Name cannot be empty';
  }
  if (!/^[A-Z][a-zA-Z0-9_]*$/.test(value)) {
    return 'Name must start with uppercase letter and contain only letters, numbers, and underscores';
  }
  return null;
}

export function validateFieldType(value: string): string | null {
  if (!value || value.trim().length === 0) {
    return 'Type cannot be empty';
  }
  if (!VALID_FIELD_TYPES.includes(value.toLowerCase())) {
    return `Unknown type '${value}'. Valid types: ${VALID_FIELD_TYPES.join(', ')}`;
  }
  return null;
}

export function validateFieldName(value: string): string | null {
  if (!value || value.trim().length === 0) {
    return 'Field name cannot be empty';
  }
  if (!/^[a-z][a-zA-Z0-9_]*$/.test(value)) {
    return 'Field name must start with lowercase letter and contain only letters, numbers, and underscores';
  }
  return null;
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
