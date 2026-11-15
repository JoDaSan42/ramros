import { parseArrayInput, valuesToYaml } from '../../core/message-serializer';
import { parseInterfaceDefinition } from '../../core/interface-parser';
import { buildFormHtml } from '../../core/form-html';
import { InterfaceField } from '../../core/interface-parser';

describe('structured message input edge cases', () => {
  it('round-trips a string array value containing a comma and a quote', () => {
    const fields: InterfaceField[] = [{ name: 'labels', type: 'string', isArray: true }];

    // User input with an escaped comma and a quote.
    const parsed = parseArrayInput("a\\,b, it's", 'string');
    expect(parsed).toEqual(['a,b', "it's"]);

    const yaml = valuesToYaml(fields, { labels: "a\\,b, it's" });
    expect(yaml).toBe("labels: ['a,b', 'it''s']");
  });

  it('handles the empty message: empty YAML body and a form with only actions', () => {
    const structure = parseInterfaceDefinition('std_msgs/msg/Empty', '');

    expect(structure.fields).toEqual([]);
    expect(valuesToYaml(structure.fields, {})).toBe('{}');

    const html = buildFormHtml(structure, {
      nonce: 'n1',
      cspSource: 'vscode-webview://x',
      title: 'Publish /none',
      kind: 'topic'
    });
    expect(html).toContain('id="publish-once"');
    expect(html).not.toContain('data-path=');
  });

  it('parses output with only constants and comments into zero fields without crashing', () => {
    const structure = parseInterfaceDefinition(
      'pkg/msg/Demo',
      '# only metadata here\nuint8 FOO = 1\nuint8 BAR=2\n\n# end'
    );

    expect(structure.fields).toEqual([]);
    expect(valuesToYaml(structure.fields, {})).toBe('{}');
  });
});
