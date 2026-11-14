import * as fs from 'fs';
import * as path from 'path';

interface CommandContribution {
  command: string;
  [key: string]: unknown;
}

interface MenuEntry {
  command: string;
  when?: string;
  group?: string;
  [key: string]: unknown;
}

interface PackageJson {
  version: string;
  contributes?: {
    commands?: CommandContribution[];
    menus?: Record<string, MenuEntry[]>;
  };
}

const loadPackageJson = (): PackageJson => {
  const packageJsonPath = path.resolve(__dirname, '../../../package.json');
  return JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8')) as PackageJson;
};

const viewItemOf = (entry: MenuEntry): string | undefined => {
  const match = /viewItem == (\w+)/.exec(entry.when ?? '');
  return match?.[1];
};

const isInline = (entry: MenuEntry): boolean => (entry.group ?? '').startsWith('inline');

const findInlineEntry = (
  entries: MenuEntry[],
  command: string,
  viewItem: string
): MenuEntry | undefined =>
  entries.find(
    entry => entry.command === command && viewItemOf(entry) === viewItem && isInline(entry)
  );

describe('package.json contract', () => {
  let packageJson: PackageJson;
  let registeredCommands: Set<string>;
  let contextEntries: MenuEntry[];

  beforeAll(() => {
    packageJson = loadPackageJson();
    registeredCommands = new Set(
      (packageJson.contributes?.commands ?? []).map(command => command.command)
    );
    contextEntries = packageJson.contributes?.menus?.['view/item/context'] ?? [];
  });

  it('declares version 1.4.0', () => {
    expect(packageJson.version).toBe('1.4.0');
  });

  it('registers every command referenced in menus', () => {
    const menus = packageJson.contributes?.menus ?? {};
    const referencedCommands = new Set<string>();
    for (const entries of Object.values(menus)) {
      for (const entry of entries) {
        referencedCommands.add(entry.command);
      }
    }
    const unregistered = [...referencedCommands].filter(command => !registeredCommands.has(command));
    expect(unregistered).toEqual([]);
  });

  it('registers the command ids used by tree items', () => {
    const treeItemCommands = [
      'ramros.bag.playBagByPath',
      'ramros.live.setParameter',
      'ramros.live.toggleEnabled'
    ];
    for (const command of treeItemCommands) {
      expect(registeredCommands.has(command)).toBe(true);
    }
  });

  it('shows addBagFolder inline on bagFilesFolder', () => {
    expect(findInlineEntry(contextEntries, 'ramros.bag.addBagFolder', 'bagFilesFolder')).toBeDefined();
  });

  it('shows showDefinition inline on interfaceFile', () => {
    expect(findInlineEntry(contextEntries, 'ramros.interface.showDefinition', 'interfaceFile')).toBeDefined();
  });

  it('shows addNodeToPackage inline on category folders', () => {
    expect(findInlineEntry(contextEntries, 'ramros.addNodeToPackage', 'categoryNodesFolder')).toBeDefined();
    expect(findInlineEntry(contextEntries, 'ramros.addNodeToPackage', 'categoryInterfacesFolder')).toBeDefined();
  });

  it('shows pubTopic inline on liveTopic', () => {
    expect(findInlineEntry(contextEntries, 'ramros.live.pubTopic', 'liveTopic')).toBeDefined();
  });

  it('offers Stop Node on liveNode items', () => {
    expect(registeredCommands.has('ramros.live.stopNode')).toBe(true);
    expect(findInlineEntry(contextEntries, 'ramros.live.stopNode', 'liveNode')).toBeDefined();
    expect(contextEntries.find(
      entry => entry.command === 'ramros.live.stopNode' && viewItemOf(entry) === 'liveNode' && !isInline(entry)
    )).toBeDefined();
  });

  it('declares the parameter update command', () => {
    expect(registeredCommands.has('ramros.live.updateParameters')).toBe(true);
  });

  it('offers updateParameters in the context menu and inline on nodeParameters', () => {
    expect(findInlineEntry(contextEntries, 'ramros.live.updateParameters', 'nodeParameters')).toBeDefined();

    const contextEntry = contextEntries.find(
      entry =>
        entry.command === 'ramros.live.updateParameters' &&
        viewItemOf(entry) === 'nodeParameters' &&
        !isInline(entry)
    );
    expect(contextEntry).toBeDefined();
  });

  it('scopes each tool options button to its own tool item', () => {
    // Distinct context values: the rviz2 gear must appear only on the rviz2
    // item and the rqt_graph gear only on the rqt_graph item.
    expect(findInlineEntry(contextEntries, 'ramros.launchTool.rviz2WithOptions', 'toolRviz2')).toBeDefined();
    expect(findInlineEntry(contextEntries, 'ramros.launchTool.rqtGraphWithOptions', 'toolRqtGraph')).toBeDefined();

    // No cross-placements: neither gear shows on the other tool's item,
    // and neither shows on a generic 'tool' context.
    expect(findInlineEntry(contextEntries, 'ramros.launchTool.rviz2WithOptions', 'toolRqtGraph')).toBeUndefined();
    expect(findInlineEntry(contextEntries, 'ramros.launchTool.rqtGraphWithOptions', 'toolRviz2')).toBeUndefined();
    expect(findInlineEntry(contextEntries, 'ramros.launchTool.rviz2WithOptions', 'tool')).toBeUndefined();
    expect(findInlineEntry(contextEntries, 'ramros.launchTool.rqtGraphWithOptions', 'tool')).toBeUndefined();

    // The when clauses use the tool-specific context values.
    const rviz2When = contextEntries.find(e => e.command === 'ramros.launchTool.rviz2WithOptions' && isInline(e))?.when;
    const rqtWhen = contextEntries.find(e => e.command === 'ramros.launchTool.rqtGraphWithOptions' && isInline(e))?.when;
    expect(rviz2When).toContain('toolRviz2');
    expect(rqtWhen).toContain('toolRqtGraph');
  });

  it('uses the gear codicon for the node options command', () => {
    const command = (packageJson.contributes?.commands ?? []).find(c => c.command === 'ramros.runNodeWithOptions');
    expect(command?.icon).toBe('$(settings-gear)');
  });
});
