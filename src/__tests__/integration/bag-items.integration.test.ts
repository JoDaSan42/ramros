import {
  BagFileItem,
  ExternalBagFolderItem
} from '../../treeview/bag-items';

describe('BagFileItem Integration Tests', () => {
  it('labels the item with the basename of the bag path', () => {
    const item = new BagFileItem('/some/folder/my_bag.db3');
    expect(item.label).toBe('my_bag.db3');
  });

  it('returns the bag path from getBagPath()', () => {
    const item = new BagFileItem('/some/folder/my_bag.db3');
    expect(item.getBagPath()).toBe('/some/folder/my_bag.db3');
  });

  it('uses the bag playback command', () => {
    const item = new BagFileItem('/x/a.db3');
    expect(item.command?.command).toBe('ramros.bag.playBagByPath');
  });

  it('passes the bag path as the command argument', () => {
    const item = new BagFileItem('/x/a.db3');
    expect(item.command?.arguments).toEqual(['/x/a.db3']);
  });

  it('has the bagFile context value', () => {
    const item = new BagFileItem('/x/a.db3');
    expect(item.contextValue).toBe('bagFile');
  });

  it('uses the bag path as tooltip', () => {
    const item = new BagFileItem('/x/a.db3');
    expect(item.tooltip).toBe('/x/a.db3');
  });

  it('is not collapsible', () => {
    const item = new BagFileItem('/x/a.db3');
    expect(item.collapsibleState).toBe(0);
  });

  it('has no children', async () => {
    const item = new BagFileItem('/x/a.db3');
    await expect(item.getChildren()).resolves.toEqual([]);
  });
});

describe('ExternalBagFolderItem Integration Tests', () => {
  it('returns the folder path from getFolderPath()', () => {
    const item = new ExternalBagFolderItem('/media/bags', ['/media/bags/a.db3']);
    expect(item.getFolderPath()).toBe('/media/bags');
  });

  it('labels the item with the folder path', () => {
    const item = new ExternalBagFolderItem('/media/bags', []);
    expect(item.label).toBe('/media/bags');
  });

  it('has the externalBagFolder context value', () => {
    const item = new ExternalBagFolderItem('/media/bags', []);
    expect(item.contextValue).toBe('externalBagFolder');
  });

  it('renders the given bags as BagFileItem children', async () => {
    const item = new ExternalBagFolderItem('/media/bags', [
      '/media/bags/a.db3',
      '/media/bags/b.mcap'
    ]);
    const children = await item.getChildren();
    expect(children).toHaveLength(2);
    for (const child of children) {
      expect(child).toBeInstanceOf(BagFileItem);
      expect(child.contextValue).toBe('bagFile');
    }
    expect((children[0] as BagFileItem).getBagPath()).toBe('/media/bags/a.db3');
    expect((children[1] as BagFileItem).getBagPath()).toBe('/media/bags/b.mcap');
  });

  it('is collapsed initially', () => {
    const item = new ExternalBagFolderItem('/media/bags', []);
    expect(item.collapsibleState).toBe(2);
  });

  it('renders no children for an empty bag list', async () => {
    const item = new ExternalBagFolderItem('/media/bags', []);
    await expect(item.getChildren()).resolves.toEqual([]);
  });
});
