import { buildFormHtml, FormKind } from '../../core/form-html';
import { InterfaceField, InterfaceStructure } from '../../core/interface-parser';

function makeStructure(fields: InterfaceField[], typeName = 'pkg/msg/Demo'): InterfaceStructure {
  return { typeName, fields };
}

const STRING_FIELD: InterfaceField[] = [{ name: 'data', type: 'string', isArray: false }];

describe('form html builder', () => {
  const baseOptions = { nonce: 'n1', cspSource: 'vscode-webview://x', title: 'Publish /chatter', kind: 'topic' as FormKind };

  it('embeds a CSP meta tag with the nonce and the webview source', () => {
    const html = buildFormHtml(makeStructure(STRING_FIELD), baseOptions);

    expect(html).toContain('nonce-n1');
    expect(html).toContain('style-src vscode-webview://x');
    expect(html).toContain('<script nonce="n1">');
  });

  it('renders primitive leaves as inputs with dotted data paths', () => {
    const fields: InterfaceField[] = [
      {
        name: 'pose',
        type: 'Pose',
        isArray: false,
        children: [
          { name: 'x', type: 'float64', isArray: false },
          { name: 'flag', type: 'bool', isArray: false }
        ]
      }
    ];
    const html = buildFormHtml(makeStructure(fields), baseOptions);

    expect(html).toContain('data-path="pose.x"');
    expect(html).toContain('type="checkbox" data-path="pose.flag"');
    expect(html).toContain('<details');
  });

  it('expands fixed arrays into per-element inputs and free arrays into one text input', () => {
    const fields: InterfaceField[] = [
      { name: 'points', type: 'float64', isArray: true, arrayLength: 3 },
      { name: 'values', type: 'float64', isArray: true }
    ];
    const html = buildFormHtml(makeStructure(fields), baseOptions);

    expect(html).toContain('data-path="points[0]"');
    expect(html).toContain('data-path="points[2]"');
    expect(html).toContain('data-path="values"');
    expect(html).toContain('data-array="true"');
  });

  it('renders non-primitive arrays and unresolved fields as JSON textareas', () => {
    const fields: InterfaceField[] = [
      { name: 'poses', type: 'Pose', isArray: true },
      { name: 'header', type: 'std_msgs/Header', isArray: false, unresolved: true }
    ];
    const html = buildFormHtml(makeStructure(fields), baseOptions);

    expect(html).toContain('<textarea data-path="poses" data-json="true"');
    expect(html).toContain('<textarea data-path="header" data-raw="true"');
  });

  it('renders publish buttons and a rate input for topics', () => {
    const html = buildFormHtml(makeStructure(STRING_FIELD), baseOptions);

    expect(html).toContain('id="publish-once"');
    expect(html).toContain('id="publish-rate"');
    expect(html).toContain('id="rate-hz"');
    expect(html).not.toContain('id="call"');
  });

  it('renders a call button for services', () => {
    const html = buildFormHtml(makeStructure(STRING_FIELD), { ...baseOptions, kind: 'service', title: 'Call /add' });

    expect(html).toContain('id="call"');
    expect(html).not.toContain('id="publish-once"');
  });

  it('collects data-path values and posts them with the action type', () => {
    const html = buildFormHtml(makeStructure(STRING_FIELD), baseOptions);

    expect(html).toContain('document.querySelectorAll(\'[data-path]\')');
    expect(html).toContain("'publishOnce'");
    expect(html).toContain("'publishRate'");
    expect(html).toContain('vscode.postMessage');
  });

  it('does not use inline event handler attributes (blocked by nonce-only CSP)', () => {
    const html = buildFormHtml(makeStructure(STRING_FIELD), baseOptions);

    // Inline `onsubmit="return false;"` would be blocked by the nonce-only
    // script CSP (Enter key would clear the form instead).
    expect(html).not.toContain('onsubmit=');
    const script = html.split('<script')[1] ?? '';
    expect(script).toContain("addEventListener('submit'");
  });

  it('prefills inputs with the neutral defaults', () => {    const fields: InterfaceField[] = [
      { name: 'count', type: 'int32', isArray: false },
      { name: 'flag', type: 'bool', isArray: false },
      { name: 'label', type: 'string', isArray: false }
    ];
    const html = buildFormHtml(makeStructure(fields), baseOptions);

    expect(html).toContain('value="0"');
    // Bools default to unchecked checkboxes (collect() reports 'false').
    expect(html).toContain('type="checkbox" data-path="flag">');
    expect(html).not.toContain('data-path="flag" checked');
    // String inputs stay empty (no value attribute or empty value).
    expect(html).not.toContain('data-path="label" value');
  });
});
