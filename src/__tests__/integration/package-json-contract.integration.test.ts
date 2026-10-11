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

  it('declares version 1.3.0', () => {
    expect(packageJson.version).toBe('1.3.0');
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
});
