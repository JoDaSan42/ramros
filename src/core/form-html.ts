/**
 * Builds the single-file HTML for the structured message input webview:
 * inline CSS/JS (no framework, no bundling), CSP with per-render nonce,
 * VSCode theme variables. Pure module: no vscode import.
 */

import { InterfaceField, InterfaceStructure, isPrimitiveType } from './interface-parser';
import { fieldDefaults } from './message-serializer';

export type FormKind = 'topic' | 'service';

export interface FormOptions {
  nonce: string;
  cspSource: string;
  title: string;
  kind: FormKind;
}

/** Fixed arrays up to this many elements render one input per element. */
const FIXED_ARRAY_INPUT_LIMIT = 16;

export function buildFormHtml(structure: InterfaceStructure, options: FormOptions): string {
  const defaults = fieldDefaults(structure.fields);
  const body = renderFields(structure.fields, '', defaults);
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${options.cspSource} 'unsafe-inline'; script-src 'nonce-${options.nonce}';">
<title>${escapeHtml(options.title)}</title>
<style>
  body {
    font-family: var(--vscode-font-family);
    font-size: var(--vscode-font-size);
    color: var(--vscode-foreground);
    background: var(--vscode-editor-background);
    padding: 12px 16px;
  }
  .field-row { margin-bottom: 10px; }
  label { display: block; margin-bottom: 3px; color: var(--vscode-foreground); }
  .type-hint { color: var(--vscode-descriptionForeground); margin-left: 6px; }
  input[type="text"], input[type="number"], textarea {
    width: 100%;
    box-sizing: border-box;
    background: var(--vscode-input-background);
    color: var(--vscode-input-foreground);
    border: 1px solid var(--vscode-input-border, transparent);
    padding: 4px 6px;
  }
  textarea { min-height: 60px; font-family: var(--vscode-editor-font-family); }
  details {
    border: 1px solid var(--vscode-panel-border, transparent);
    border-radius: 3px;
    padding: 6px 10px;
    margin-bottom: 10px;
  }
  summary { cursor: pointer; font-weight: 600; }
  .actions { margin-top: 14px; display: flex; gap: 8px; align-items: center; }
  button {
    background: var(--vscode-button-background);
    color: var(--vscode-button-foreground);
    border: none;
    padding: 6px 14px;
    cursor: pointer;
  }
  button.secondary { background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); }
  #rate-hz { width: 70px; }
  .status { color: var(--vscode-descriptionForeground); margin-left: 8px; }
</style>
</head>
<body>
<h2>${escapeHtml(options.title)}</h2>
<form id="form">
${body}
<div class="actions">
${options.kind === 'topic'
  ? `<button id="publish-once" type="button">Publish</button>
  <button id="publish-rate" type="button" class="secondary">Publish @ Rate</button>
  <input id="rate-hz" type="number" min="0.1" step="any" value="1" title="Rate in Hz">
  <span class="status" id="status"></span>`
  : `<button id="call" type="button">Call</button>
  <span class="status" id="status"></span>`}
</div>
</form>
<script nonce="${options.nonce}">
  const vscode = acquireVsCodeApi();

  // Prevent the browser's native submit (Enter key would clear the form);
  // inline onsubmit is not an option under the nonce-only script CSP.
  document.getElementById('form').addEventListener('submit', event => event.preventDefault());

  function collectValues() {
    const values = {};
    document.querySelectorAll('[data-path]').forEach(element => {
      const path = element.getAttribute('data-path');
      if (element.type === 'checkbox') {
        values[path] = element.checked ? 'true' : 'false';
      } else {
        values[path] = element.value;
      }
    });
    return values;
  }

  function post(type, extra) {
    vscode.postMessage(Object.assign({ type, values: collectValues() }, extra || {}));
  }

  const actions = ${JSON.stringify(options.kind === 'topic' ? ['publish-once', 'publish-rate'] : ['call'])};
  for (const id of actions) {
    document.getElementById(id).addEventListener('click', () => {
      if (id === 'publish-rate') {
        const rate = parseFloat(document.getElementById('rate-hz').value);
        post('publishRate', { rate });
      } else if (id === 'publish-once') {
        post('publishOnce');
      } else {
        post('call');
      }
    });
  }

  window.addEventListener('message', event => {
    const message = event.data;
    if (message.type === 'result') {
      const status = document.getElementById('status');
      status.textContent = message.ok ? message.message : '';
      if (!message.ok) {
        status.textContent = message.message;
        status.style.color = 'var(--vscode-errorForeground)';
      } else {
        status.style.color = 'var(--vscode-descriptionForeground)';
      }
    }
  });
</script>
</body>
</html>`;
}

function renderFields(fields: InterfaceField[], prefix: string, defaults: Record<string, string>): string {
  const rows: string[] = [];
  for (const field of fields) {
    const path = prefix.length === 0 ? field.name : `${prefix}.${field.name}`;
    rows.push(renderField(field, path, defaults));
  }
  return rows.join('\n');
}

function renderField(field: InterfaceField, path: string, defaults: Record<string, string>): string {
  const typeHint = `<span class="type-hint">${escapeHtml(field.type)}${field.isArray ? (field.arrayLength !== undefined ? `[${field.arrayLength}]` : '[]') : ''}</span>`;
  const label = `<label>${escapeHtml(field.name)}${typeHint}</label>`;

  // Unresolved sub-trees and non-primitive arrays: JSON free text.
  if (field.unresolved || (!isPrimitiveType(field.type) && field.isArray)) {
    const attr = field.unresolved ? 'data-raw="true"' : 'data-json="true"';
    return `<div class="field-row">${label}<textarea data-path="${path}" ${attr} placeholder="JSON"></textarea></div>`;
  }

  // Nested message group.
  if (!isPrimitiveType(field.type)) {
    const children = renderFields(field.children ?? [], path, defaults);
    return `<details open><summary>${escapeHtml(field.name)}${typeHint}</summary>${children}</details>`;
  }

  // Fixed arrays within the limit: one input per element.
  if (field.isArray && field.arrayLength !== undefined && field.arrayLength <= FIXED_ARRAY_INPUT_LIMIT) {
    const items: string[] = [];
    for (let i = 0; i < field.arrayLength; i += 1) {
      const indexPath = `${path}[${i}]`;
      items.push(
        `<div class="field-row"><label>${escapeHtml(`${field.name}[${i}]`)}${typeHint}</label>${inputFor(field, indexPath, defaults[indexPath] ?? '')}</div>`
      );
    }
    return `<fieldset><legend>${escapeHtml(field.name)}${typeHint}</legend>${items.join('\n')}</fieldset>`;
  }

  // Free-length arrays (primitives): one comma-separated text input.
  if (field.isArray) {
    return `<div class="field-row">${label}<input type="text" data-path="${path}" data-array="true" value="${escapeAttr(defaults[path] ?? '')}" placeholder="comma-separated, escape commas as \\,"></div>`;
  }

  // Scalar leaf.
  return `<div class="field-row">${label}${inputFor(field, path, defaults[path] ?? '')}</div>`;
}

function inputFor(field: InterfaceField, path: string, value: string): string {
  if (field.type === 'bool') {
    const checked = value === 'true' ? ' checked' : '';
    return `<input type="checkbox" data-path="${path}"${checked}>`;
  }
  const numeric = /^(u?int)(8|16|32|64)$/.test(field.type) || field.type === 'float32' || field.type === 'float64';
  const inputType = numeric ? 'number' : 'text';
  const step = field.type === 'float32' || field.type === 'float64' ? ' step="any"' : '';
  const valueAttr = value.length > 0 ? ` value="${escapeAttr(value)}"` : '';
  return `<input type="${inputType}"${step} data-path="${path}"${valueAttr}>`;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escapeAttr(text: string): string {
  return escapeHtml(text).replace(/"/g, '&quot;');
}
