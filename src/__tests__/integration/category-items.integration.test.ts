import * as fs from 'fs';
import * as path from 'path';
import {
  CategoryNodesFolderItem,
  CategoryNodeItem,
  CategoryInterfacesFolderItem,
  CategoryInterfaceGroupItem,
  CategoryInterfaceFileItem,
  CategoryLaunchFilesFolderItem,
  CategoryLaunchFileItem
} from '../../treeview/category-items';
import { PackageInfo, NodeInfo, InterfaceInfo, LaunchFileInfo } from '../../core/package-discovery';

const makeNode = (overrides: Partial<NodeInfo> = {}): NodeInfo => ({
  name: 'my_node',
  path: '/ws/src/pkg/src/my_node.cpp',
  packageName: 'pkg',
  language: 'cpp',
  isExecutable: true,
  ...overrides
});

const makeInterface = (overrides: Partial<InterfaceInfo> = {}): InterfaceInfo => ({
  type: 'message',
  name: 'MyMsg',
  path: '/ws/src/pkg/msg/MyMsg.msg',
  fields: [],
  packageName: 'pkg',
  ...overrides
});

const makeLaunchFile = (overrides: Partial<LaunchFileInfo> = {}): LaunchFileInfo => ({
  name: 'my_launch.py',
  path: '/ws/src/pkg/launch/my_launch.py',
  packageName: 'pkg',
  ...overrides
});

const makePackage = (overrides: Partial<PackageInfo> = {}): PackageInfo => ({
  name: 'pkg',
  path: '/ws/src/pkg',
  version: '1.0.0',
  description: 'test package',
  maintainers: [],
  license: 'MIT',
  buildType: 'ament_cmake',
  packageType: 'cpp',
  dependencies: [],
  nodes: [makeNode()],
  interfaces: [makeInterface()],
  launchFiles: [makeLaunchFile()],
  ...overrides
});

describe('CategoryNodesFolderItem', () => {
  it('has the categoryNodesFolder context value', () => {
    const item = new CategoryNodesFolderItem([makePackage()]);
    expect(item.contextValue).toBe('categoryNodesFolder');
  });

  it('renders nodes as CategoryNodeItem children', async () => {
    const item = new CategoryNodesFolderItem([makePackage()]);
    const children = await item.getChildren();
    expect(children).toHaveLength(1);
    expect(children[0]).toBeInstanceOf(CategoryNodeItem);
    expect(children[0].contextValue).toBe('node');
    expect(children[0].label).toBe('my_node');
  });
});

describe('CategoryInterfacesFolderItem', () => {
  it('has the categoryInterfacesFolder context value', () => {
    const item = new CategoryInterfacesFolderItem([makePackage()]);
    expect(item.contextValue).toBe('categoryInterfacesFolder');
  });

  it('renders interface groups with interface file children', async () => {
    const item = new CategoryInterfacesFolderItem([makePackage()]);
    const children = await item.getChildren();
    expect(children).toHaveLength(1);
    expect(children[0]).toBeInstanceOf(CategoryInterfaceGroupItem);
    expect(children[0].contextValue).toBe('interfaceGroup');
    expect(children[0].label).toBe('Messages (pkg)');

    const groupChildren = await children[0].getChildren();
    expect(groupChildren).toHaveLength(1);
    expect(groupChildren[0]).toBeInstanceOf(CategoryInterfaceFileItem);
    expect(groupChildren[0].contextValue).toBe('interfaceFile');
    expect(groupChildren[0].label).toBe('MyMsg');
  });
});

describe('CategoryLaunchFilesFolderItem', () => {
  it('has the categoryLaunchFilesFolder context value', () => {
    const item = new CategoryLaunchFilesFolderItem([makePackage()]);
    expect(item.contextValue).toBe('categoryLaunchFilesFolder');
  });

  it('renders launch files as CategoryLaunchFileItem children', async () => {
    const item = new CategoryLaunchFilesFolderItem([makePackage()]);
    const children = await item.getChildren();
    expect(children).toHaveLength(1);
    expect(children[0]).toBeInstanceOf(CategoryLaunchFileItem);
    expect(children[0].contextValue).toBe('launchFile');
    expect(children[0].label).toBe('my_launch.py');
  });
});

interface MenuItemEntry {
  command: string;
  when?: string;
  group?: string;
}

const loadContextMenuEntries = (): MenuItemEntry[] => {
  const packageJsonPath = path.resolve(__dirname, '../../../package.json');
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8')) as {
    contributes?: { menus?: { 'view/item/context'?: MenuItemEntry[] } };
  };
  return packageJson.contributes?.menus?.['view/item/context'] ?? [];
};

const findEntry = (command: string, viewItem: string, group?: string): MenuItemEntry | undefined =>
  loadContextMenuEntries().find(
    entry =>
      entry.command === command &&
      entry.when === `view == ramrosExplorer && viewItem == ${viewItem}` &&
      entry.group === group
  );

describe('Category folder menu contributions', () => {
  it('adds addNodeToPackage inline and context entries on categoryNodesFolder', () => {
    expect(findEntry('ramros.addNodeToPackage', 'categoryNodesFolder', 'inline@1')).toBeDefined();
    expect(findEntry('ramros.addNodeToPackage', 'categoryNodesFolder')).toBeDefined();
  });

  it('adds addNodeToPackage inline and context entries on categoryInterfacesFolder', () => {
    expect(findEntry('ramros.addNodeToPackage', 'categoryInterfacesFolder', 'inline@1')).toBeDefined();
    expect(findEntry('ramros.addNodeToPackage', 'categoryInterfacesFolder')).toBeDefined();
  });

  it('keeps createLaunchFile inline and context entries on categoryLaunchFilesFolder', () => {
    expect(findEntry('ramros.createLaunchFile', 'categoryLaunchFilesFolder', 'inline@1')).toBeDefined();
    expect(findEntry('ramros.createLaunchFile', 'categoryLaunchFilesFolder')).toBeDefined();
  });
});
